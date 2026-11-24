import {
  type CameraPoint,
  DEFAULT_WHEEL_STEP,
  normalizeWheelDelta,
  twoFingerGesture,
  wheelZoomScale,
} from "./cameraGesture.js";
import type { ClaimArea } from "./claimArea.js";
import { closestControl, isInteractiveTarget } from "./interactiveTarget.js";
import { type PointerOwnership, pointerOwnership } from "./pointerOwnership.js";

/** Where a camera change came from: one pointer, two fingers, or the wheel. */
export type CameraGestureSource = "drag" | "pinch" | "wheel";

/**
 * One step of camera input. The numeric conventions (pixels, scale above 1 zooms in, twist in
 * radians clockwise on screen) are those of `twoFingerGesture`.
 */
export interface CameraGestureChange {
  source: CameraGestureSource;
  /** How far the pointer, or the fingers' midpoint, moved since the last change, in CSS pixels. Zero for the wheel. */
  pan: CameraPoint;
  /** The zoom ratio of this step; 1 when unchanged and above 1 to zoom in. */
  scale: number;
  /** The rotation of this step in radians, positive clockwise on screen. Zero except for `"pinch"`. */
  twist: number;
  /**
   * The focal point after this step in the element's own CSS pixels (origin at its top-left): the
   * pointer, the fingers' midpoint or the wheel cursor. `anchor - pan` is where it was before.
   */
  anchor: CameraPoint;
}

/** How a gesture ended: the last contact lifted (`"release"`), or it was taken away (`"cancel"`). */
export type CameraGestureEnd = "release" | "cancel";

export interface CameraPanZoomInputOptions {
  element: HTMLElement;
  /** Receives every pan, pinch and wheel step. */
  onChange: (change: CameraGestureChange) => void;
  /**
   * Called once when the last held contact ends. `"release"` is a finger lifting, where a camera
   * may coast; `"cancel"` is `pointercancel`, lost capture, blur, a layout change, an ownership
   * release, `reset()` or disposal, where it should stop.
   */
  onEnd?: (reason: CameraGestureEnd) => void;
  ownership?: PointerOwnership;
  /** Unique per camera sharing a registry. Defaults to a unique generated name. */
  owner?: string;
  /** Applied to each press after host and control checks, before ownership. Wheel input ignores it. */
  claimArea?: ClaimArea;
  /** Opt in to primary-button mouse drag panning. Defaults to false. */
  allowMouseDrag?: boolean;
  /** Opt in to wheel zoom (and trackpad pinch, which browsers report as ctrl-wheel). Defaults to false. */
  allowWheel?: boolean;
  /**
   * Let a pan start on a `button`, `a`, `summary` or `[role="button"]`, for a canvas of controls
   * (graph nodes drawn as buttons, say). Such a press does nothing until it moves more than
   * `maxDistance`: released before that it stays an ordinary click, and no step is reported. Once
   * past it the press is claimed and pans from where it began, and the control's click on release
   * is suppressed. Inputs, selects, textareas, editable content and `data-joystick-ignore` subtrees
   * still never start a pan. The wheel then zooms over these controls too. Defaults to false.
   */
  panFromControls?: boolean;
  /**
   * With `panFromControls`: how far a press on a control may move, in CSS pixels, and still be a
   * click. Finite and nonnegative; default 8, the tap slop of `createTapInput`.
   */
  maxDistance?: number;
  /** Zoom scale per pixel of wheel travel, finite and above 1. Defaults to `DEFAULT_WHEEL_STEP`. */
  wheelStep?: number;
}

export interface CameraPanZoomInput {
  /** Cancel every held gesture and notify `onEnd("cancel")` if one was held. Idempotent. */
  reset(): void;
  /** Cancel, remove every listener and release this controller's pointers. Idempotent. */
  dispose(): void;
}

interface Contact {
  /** The last client position seen; the next step is measured from it. */
  x: number;
  y: number;
  /** Where the press began, for the slop of a press on a control. */
  originX: number;
  originY: number;
  pointerType: string;
  /** The control the press began on, when `panFromControls` let it. */
  control: Element | null;
  /** A press on a control that has not yet moved past the slop: claimed, but not yet a pan. */
  pending: boolean;
}

/** How long after a pan that began on a control its click is still suppressed. */
const CLICK_SUPPRESSION_MS = 400;

let nextOwner = 0;

/**
 * DOM input only: no renderer, React, storage, animation loop or camera model. It turns pointer
 * and wheel events into pan, pinch, twist and zoom steps and leaves what they mean to the caller.
 *
 * It claims up to two pointers (one finger pans, two pinch), where the joystick claims one and
 * look claims one. Everything else follows the same protocol as them: a press is claimed only
 * after host, control and claim-area checks, ownership is the last check, and a refused claim
 * changes nothing, so a right-zone camera and a left-zone joystick sharing one registry never
 * take the same finger.
 */
export function createCameraPanZoomInput({
  element,
  onChange,
  onEnd,
  ownership = pointerOwnership,
  owner = `camera-${nextOwner++}`,
  claimArea,
  allowMouseDrag = false,
  allowWheel = false,
  wheelStep = DEFAULT_WHEEL_STEP,
  panFromControls = false,
  maxDistance = 8,
}: CameraPanZoomInputOptions): CameraPanZoomInput {
  if (!(Number.isFinite(wheelStep) && wheelStep > 1)) {
    throw new RangeError("wheelStep must be finite and above 1");
  }
  if (!Number.isFinite(maxDistance) || maxDistance < 0) {
    throw new RangeError("maxDistance must be finite and nonnegative");
  }
  const doc = element.ownerDocument;
  const win = doc.defaultView;
  if (!win) throw new Error("element must belong to a window");
  /** Held contacts in claim order; never more than two, and a mouse contact is always alone. */
  const contacts = new Map<number, Contact>();
  let disposed = false;
  let size = element.getBoundingClientRect();
  // Whether a gesture has begun since the last `onEnd`: a press still waiting on the slop of a
  // control is not one, so releasing it as a click reports no end.
  let live = false;
  let suppression: (() => void) | undefined;

  const local = (x: number, y: number, rect: DOMRect): CameraPoint => ({
    x: x - rect.left,
    y: y - rect.top,
  });
  const disarmClick = () => {
    suppression?.();
    suppression = undefined;
  };
  // A pan that began on a control must not also click it. The click arrives after the lift, so
  // swallow the next one that lands inside that control, until the next press or a short time.
  const suppressClickOn = (control: Element) => {
    disarmClick();
    const onClick = (event: MouseEvent) => {
      // A keyboard or programmatic click has no click count and is never the lift's own click.
      if (event.detail === 0 || !control.contains(event.target as Node | null)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      disarmClick();
    };
    const timer = win.setTimeout(disarmClick, CLICK_SUPPRESSION_MS);
    win.addEventListener("click", onClick, true);
    win.addEventListener("pointerdown", disarmClick, true);
    suppression = () => {
      win.clearTimeout(timer);
      win.removeEventListener("click", onClick, true);
      win.removeEventListener("pointerdown", disarmClick, true);
    };
  };
  // The contact leaves the map before the claim is released: the registry's release listener
  // re-enters here, finds nothing and so cannot report the same end twice.
  const drop = (id: number, reason: CameraGestureEnd) => {
    const contact = contacts.get(id);
    if (!contact) return;
    contacts.delete(id);
    if (contact.pointerType === "mouse" && element.hasPointerCapture?.(id)) {
      element.releasePointerCapture(id);
    }
    ownership.release(id, owner);
    if (reason === "release" && contact.control && !contact.pending) {
      suppressClickOn(contact.control);
    }
    if (contacts.size === 0 && live) {
      live = false;
      onEnd?.(reason);
    }
  };
  const cancelAll = () => {
    for (const id of [...contacts.keys()]) drop(id, "cancel");
  };
  // A press on a control becomes a pan: capture a mouse now (not at the press, where capturing would
  // redirect the control's own click), and count the gesture as begun. False when capture fails.
  const promote = (id: number, contact: Contact) => {
    if (contact.pointerType === "mouse") {
      try {
        element.setPointerCapture?.(id);
      } catch {
        drop(id, "cancel");
        return false;
      }
    }
    contact.pending = false;
    live = true;
    return true;
  };

  const onDown = (event: PointerEvent) => {
    const acceptsPointer =
      event.pointerType === "touch" || (allowMouseDrag && event.pointerType === "mouse");
    if (!acceptsPointer || event.button !== 0 || contacts.has(event.pointerId)) return;
    const held = contacts.values().next().value;
    // Two fingers at most; a mouse drag and a touch never make one gesture.
    if (
      contacts.size >= 2 ||
      (held && (held.pointerType === "mouse" || event.pointerType === "mouse"))
    ) {
      return;
    }
    if (isInteractiveTarget(event.target, { allowControls: panFromControls })) return;
    const rect = element.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      return;
    if (claimArea && !claimArea(event, rect)) return;
    if (!ownership.claim(event.pointerId, owner)) return;
    // A lone press on a control waits for the slop; a second finger is a pinch, never a click.
    const control = panFromControls ? closestControl(event.target) : null;
    const pending = control !== null && contacts.size === 0;
    if (event.pointerType === "mouse" && !pending) {
      try {
        element.setPointerCapture?.(event.pointerId);
      } catch {
        ownership.release(event.pointerId, owner);
        return;
      }
    }
    contacts.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
      pointerType: event.pointerType,
      control,
      pending,
    });
    if (pending) return;
    live = true;
    // A second finger turns a press still waiting on a control into the pinch's first finger.
    for (const [id, other] of contacts) if (other.pending) promote(id, other);
    event.preventDefault();
  };
  const onMove = (event: PointerEvent) => {
    const contact = contacts.get(event.pointerId);
    if (!contact) return;
    if (!element.isConnected) {
      cancelAll();
      return;
    }
    if (contact.pointerType === "mouse" && event.buttons === 0) {
      drop(event.pointerId, "release");
      return;
    }
    const finite = Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
    if (contact.pending) {
      // Not a pan yet, and not prevented: it may still be a click on the control.
      const travelled = Math.hypot(
        event.clientX - contact.originX,
        event.clientY - contact.originY
      );
      if (!finite || travelled <= maxDistance || !promote(event.pointerId, contact)) return;
    }
    event.preventDefault();
    if (!finite) return;
    const rect = element.getBoundingClientRect();
    if (contacts.size === 2) {
      const [first, second] = [...contacts.values()];
      const before = [
        { x: first.x, y: first.y },
        { x: second.x, y: second.y },
      ] as const;
      contact.x = event.clientX;
      contact.y = event.clientY;
      const { pan, scale, twist, center } = twoFingerGesture(before, [
        { x: first.x, y: first.y },
        { x: second.x, y: second.y },
      ]);
      if (pan.x === 0 && pan.y === 0 && scale === 1 && twist === 0) return;
      onChange({ source: "pinch", pan, scale, twist, anchor: local(center.x, center.y, rect) });
      return;
    }
    const pan = { x: event.clientX - contact.x, y: event.clientY - contact.y };
    contact.x = event.clientX;
    contact.y = event.clientY;
    if (pan.x === 0 && pan.y === 0) return;
    onChange({
      source: "drag",
      pan,
      scale: 1,
      twist: 0,
      anchor: local(contact.x, contact.y, rect),
    });
  };
  // Window capture phase, so a release is seen before the registry's own bubble-phase pointerup
  // handler frees the claim and the end would be misreported as a cancel.
  // A lift on a host that has left the document is a cancel: a camera must not coast on a dead host.
  const onUp = (event: PointerEvent) =>
    drop(event.pointerId, element.isConnected ? "release" : "cancel");
  const onCancel = (event: PointerEvent) => drop(event.pointerId, "cancel");
  const onWheel = (event: WheelEvent) => {
    if (isInteractiveTarget(event.target, { allowControls: panFromControls })) return;
    const rect = element.getBoundingClientRect();
    const pixels = normalizeWheelDelta(event.deltaY, event.deltaMode, rect.height);
    const scale = wheelZoomScale(pixels, wheelStep);
    // A wheel that carries no vertical travel, or overflows to nothing, is the page's to scroll.
    if (pixels === 0 || !Number.isFinite(pixels) || !(scale > 0 && Number.isFinite(scale))) return;
    event.preventDefault();
    onChange({
      source: "wheel",
      pan: { x: 0, y: 0 },
      scale,
      twist: 0,
      anchor: local(event.clientX, event.clientY, rect),
    });
  };
  // A different size means the claim area and every local coordinate moved under the fingers.
  const onLayout = () => {
    const next = element.getBoundingClientRect();
    const changed = next.width !== size.width || next.height !== size.height;
    size = next;
    if (changed) cancelAll();
  };

  const unsubscribe = ownership.onRelease((id, releasedOwner) => {
    if (releasedOwner === owner) drop(id, "cancel");
  });
  const Observer = win.ResizeObserver;
  const observer = typeof Observer === "function" ? new Observer(onLayout) : undefined;
  observer?.observe(element);
  // Release only our contacts; unlike registry.attach, losing focus here never clears other owners.
  element.addEventListener("pointerdown", onDown);
  element.addEventListener("lostpointercapture", onCancel);
  if (allowWheel) element.addEventListener("wheel", onWheel, { passive: false });
  win.addEventListener("pointermove", onMove);
  win.addEventListener("pointerup", onUp, true);
  win.addEventListener("pointercancel", onCancel, true);
  // Bubble phase: a capture listener on window would also hear any focused element losing focus.
  win.addEventListener("blur", cancelAll);
  win.addEventListener("resize", cancelAll);
  win.addEventListener("orientationchange", cancelAll);
  return {
    reset: cancelAll,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAll();
      disarmClick();
      unsubscribe();
      observer?.disconnect();
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("lostpointercapture", onCancel);
      element.removeEventListener("wheel", onWheel);
      win.removeEventListener("pointermove", onMove);
      win.removeEventListener("pointerup", onUp, true);
      win.removeEventListener("pointercancel", onCancel, true);
      win.removeEventListener("blur", cancelAll);
      win.removeEventListener("resize", cancelAll);
      win.removeEventListener("orientationchange", cancelAll);
    },
  };
}
