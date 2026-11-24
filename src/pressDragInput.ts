import type { ClaimArea } from "./claimArea.js";
import { closestControl, isInteractiveTarget } from "./interactiveTarget.js";
import { type PointerOwnership, pointerOwnership } from "./pointerOwnership.js";

/** Where a claimed press began, where it is, and how far it moved since the last report. */
export interface PressDragPoint {
  pointerId: number;
  pointerType: string;
  /** Client position of the press. */
  originX: number;
  originY: number;
  /** Client position now. Under pointer lock the origin plus the relative mouse movement. */
  x: number;
  y: number;
  /** `x - originX` and `y - originY`. */
  dx: number;
  dy: number;
  /** Movement since the previous callback of this press (since the origin for the first). */
  stepX: number;
  stepY: number;
}

/**
 * How a press ended: `"tap"` is a release that never went past `maxDistance`; `"drag"` a release
 * after it did; `"cancel"` everything else.
 */
export type PressDragEndReason = "tap" | "drag" | "cancel";

export interface PressDragEnd extends PressDragPoint {
  reason: PressDragEndReason;
}

export interface PressDragInputOptions {
  element: HTMLElement;
  /**
   * The caller's hit test: return `true` for a press that lands on the target this recognizer
   * owns (a placement preview, a handle). Called with the `pointerdown` and the host's rectangle,
   * after the host and control checks and before ownership. A press it rejects is left alone for
   * the stick, look and taps.
   */
  hitTarget: ClaimArea;
  /** The registry the press is claimed in. Default: the shared `pointerOwnership`. */
  ownership?: PointerOwnership;
  /**
   * The name the press is claimed under. Give it a name of your own so `createTapInput` and
   * `createPressHoldInput` can list it in `ignoreOwners`. Defaults to a unique generated name.
   */
  owner?: string;
  /** Maximum excursion that still counts as a tap, in CSS pixels. Finite, nonnegative; default 8. */
  maxDistance?: number;
  /** Opt in to primary-button mouse presses. Touch and pen are always accepted. Defaults to false. */
  allowMouse?: boolean;
  /**
   * Let a press that starts on a `button`, `a`, `summary` or `[role="button"]` be claimed, for a
   * target that is itself such a control. Text entry, editable content and `data-joystick-ignore`
   * stay excluded. The control's own click is not suppressed. Defaults to false.
   */
  allowControls?: boolean;
  /** End the press with `"cancel"` when another pointer goes down. Defaults to true. */
  cancelOnSecondPointer?: boolean;
  /** The press was claimed. */
  onPress?: (point: PressDragPoint) => void;
  /** The press moved past `maxDistance` for the first time. Followed at once by `onDrag`. */
  onDragStart?: (point: PressDragPoint) => void;
  /** Every move of a press that has passed `maxDistance`, including the one that started it. */
  onDrag?: (point: PressDragPoint) => void;
  /** The press ended, once, after the claim is released. */
  onEnd?: (end: PressDragEnd) => void;
}

export interface PressDragInput {
  /** Cancel a held press and notify `onEnd("cancel")`. Idempotent. */
  reset(): void;
  /** Cancel, remove every listener and release this recognizer's claim. Idempotent. */
  dispose(): void;
}

interface Press {
  pointerId: number;
  pointerType: string;
  originX: number;
  originY: number;
  x: number;
  y: number;
  /** Last reported position, the base of the next step. */
  reportedX: number;
  reportedY: number;
  relativeX: number;
  relativeY: number;
  dragging: boolean;
  /** A mouse press on a control, still to be captured when it first drags. */
  captureDeferred: boolean;
}

let nextOwner = 0;

/**
 * A press that begins on a caller-supplied target and then either releases in place (a tap on the
 * target) or drags. It shares pointer ownership with the stick, look and camera: it claims the
 * `pointerdown` in the window capture phase, before any of them sees it, so the press is neither a
 * stick, a look drag nor (with `ignoreOwners`) a clean tap.
 *
 * It claims one pointer. A press is claimed only after the host, control and `hitTarget` checks and
 * the ownership claim is last, so a rejected press holds nothing and is neither prevented nor
 * reported. `touch-action: none` on the host stops native scrolling from cancelling the drag.
 */
export function createPressDragInput({
  element,
  hitTarget,
  ownership = pointerOwnership,
  owner = `press-drag-${nextOwner++}`,
  maxDistance = 8,
  allowMouse = false,
  allowControls = false,
  cancelOnSecondPointer = true,
  onPress,
  onDragStart,
  onDrag,
  onEnd,
}: PressDragInputOptions): PressDragInput {
  if (!Number.isFinite(maxDistance) || maxDistance < 0) {
    throw new RangeError("maxDistance must be finite and nonnegative");
  }
  const doc = element.ownerDocument;
  const win = doc.defaultView;
  if (!win) throw new Error("element must belong to a window");
  let press: Press | undefined;
  let disposed = false;

  const point = (held: Press): PressDragPoint => ({
    pointerId: held.pointerId,
    pointerType: held.pointerType,
    originX: held.originX,
    originY: held.originY,
    x: held.x,
    y: held.y,
    dx: held.x - held.originX,
    dy: held.y - held.originY,
    stepX: held.x - held.reportedX,
    stepY: held.y - held.reportedY,
  });
  const markReported = (held: Press) => {
    held.reportedX = held.x;
    held.reportedY = held.y;
  };
  // The press leaves `press` before its claim is released: the registry's release listener
  // re-enters here, finds nothing and so cannot report the same end twice.
  const finish = (reason: PressDragEndReason) => {
    const held = press;
    if (!held) return;
    press = undefined;
    if (held.pointerType === "mouse" && element.hasPointerCapture?.(held.pointerId)) {
      element.releasePointerCapture(held.pointerId);
    }
    ownership.release(held.pointerId, owner);
    onEnd?.({ ...point(held), reason });
  };
  const cancel = () => finish("cancel");
  // Capture keeps a mouse drag that leaves the host. Under pointer lock the document already routes
  // the mouse to the host, and capturing there throws, so there is nothing to capture.
  const capture = (pointerId: number) => {
    if (doc.pointerLockElement === element) return true;
    try {
      element.setPointerCapture?.(pointerId);
      return true;
    } catch {
      return false;
    }
  };
  // `exceeded` is set when a coalesced sample of this move already passed `maxDistance`, so a flick
  // out and back inside one event is still a drag.
  const advance = (held: Press, x: number, y: number, exceeded = false) => {
    if (!(Number.isFinite(x) && Number.isFinite(y))) return;
    held.x = x;
    held.y = y;
    let reported = false;
    if (!held.dragging) {
      if (!exceeded && Math.hypot(x - held.originX, y - held.originY) <= maxDistance) return;
      held.dragging = true;
      if (held.captureDeferred) {
        held.captureDeferred = false;
        if (!capture(held.pointerId)) {
          cancel();
          return;
        }
      }
      if (onDragStart) {
        onDragStart(point(held));
        reported = true;
        // The callback may have reset or disposed: nothing is reported after the end.
        if (press !== held) return;
      }
    }
    if (onDrag) {
      onDrag(point(held));
      reported = true;
    }
    // The step is measured from the last position a callback saw, so only a callback moves it.
    if (reported) markReported(held);
  };
  const lockedMouse = (held: Press) =>
    held.pointerType === "mouse" && doc.pointerLockElement === element;

  const onDown = (event: PointerEvent) => {
    if (!["mouse", "touch", "pen"].includes(event.pointerType) || event.button !== 0) return;
    if (press) {
      // One press at a time: another pointer ends it, or is left for the stick, look and camera.
      if (cancelOnSecondPointer && event.pointerId !== press.pointerId) cancel();
      return;
    }
    if (event.pointerType === "mouse" && !allowMouse) return;
    if (isInteractiveTarget(event.target, { allowControls })) return;
    const rect = element.getBoundingClientRect();
    if (
      !element.isConnected ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return;
    }
    if (!hitTarget(event, rect)) return;
    // Last, so a press this recognizer would not take never holds a claim.
    if (!ownership.claim(event.pointerId, owner)) return;
    // A mouse press on a control is captured only once it drags: capturing at the press would
    // redirect the control's own click away from it.
    const captureDeferred = event.pointerType === "mouse" && closestControl(event.target) !== null;
    if (event.pointerType === "mouse" && !captureDeferred && !capture(event.pointerId)) {
      ownership.release(event.pointerId, owner);
      return;
    }
    event.preventDefault();
    press = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      reportedX: event.clientX,
      reportedY: event.clientY,
      relativeX: 0,
      relativeY: 0,
      dragging: false,
      captureDeferred,
    };
    if (onPress) {
      onPress(point(press));
      markReported(press);
    }
  };
  const onMove = (event: PointerEvent) => {
    const held = press;
    if (!held || event.pointerId !== held.pointerId) return;
    if (!element.isConnected) {
      cancel();
      return;
    }
    if (held.pointerType === "mouse" && event.buttons === 0) {
      cancel();
      return;
    }
    event.preventDefault();
    // Locked client coordinates are fixed: the relative movement of `mousemove` drives the press.
    if (lockedMouse(held)) return;
    const exceeded = (event.getCoalescedEvents?.() ?? []).some(
      (sample) =>
        Math.hypot(sample.clientX - held.originX, sample.clientY - held.originY) > maxDistance
    );
    advance(held, event.clientX, event.clientY, exceeded);
  };
  const onLockedMove = (event: MouseEvent) => {
    const held = press;
    if (!held || !lockedMouse(held)) return;
    if (event.buttons === 0) {
      cancel();
      return;
    }
    held.relativeX += event.movementX;
    held.relativeY += event.movementY;
    advance(held, held.originX + held.relativeX, held.originY + held.relativeY);
  };
  // Window capture phase, so a release is seen before the registry's own bubble-phase pointerup
  // handler frees the claim and the end would be misreported as a cancel.
  const onUp = (event: PointerEvent) => {
    const held = press;
    if (!held || event.pointerId !== held.pointerId) return;
    // A lift on a host that has left the document is not a release. Any other lift of this pointer
    // is: a pointerup carries whichever button was released, and the press began as the primary.
    const released = element.isConnected;
    if (released && !lockedMouse(held)) advance(held, event.clientX, event.clientY);
    finish(released ? (held.dragging ? "drag" : "tap") : "cancel");
  };
  const onCancel = (event: PointerEvent) => {
    if (press?.pointerId === event.pointerId) cancel();
  };

  const unsubscribe = ownership.onRelease((pointerId, releasedOwner) => {
    if (press?.pointerId === pointerId && releasedOwner === owner) cancel();
  });
  // Window capture: before the stick (window bubble), look and camera (element bubble) and before
  // the tap and hold observers (element capture), so the claim is in place for every one of them.
  win.addEventListener("pointerdown", onDown, true);
  win.addEventListener("pointermove", onMove, true);
  win.addEventListener("pointerup", onUp, true);
  win.addEventListener("pointercancel", onCancel, true);
  element.addEventListener("lostpointercapture", onCancel);
  win.addEventListener("blur", cancel);
  doc.addEventListener("mousemove", onLockedMove, true);
  doc.addEventListener("pointerlockchange", cancel);
  return {
    reset: cancel,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      unsubscribe();
      win.removeEventListener("pointerdown", onDown, true);
      win.removeEventListener("pointermove", onMove, true);
      win.removeEventListener("pointerup", onUp, true);
      win.removeEventListener("pointercancel", onCancel, true);
      element.removeEventListener("lostpointercapture", onCancel);
      win.removeEventListener("blur", cancel);
      doc.removeEventListener("mousemove", onLockedMove, true);
      doc.removeEventListener("pointerlockchange", cancel);
    },
  };
}
