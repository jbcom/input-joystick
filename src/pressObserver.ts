import type { ClaimArea, ClaimRect } from "./claimArea.js";
import { isInteractiveTarget } from "./interactiveTarget.js";
import { type PointerOwnership, pointerOwnership } from "./pointerOwnership.js";

/**
 * One press the observer is following: where it began, whether it has gone past the movement
 * threshold, and whatever `begin` attached to it. Internal: `createTapInput` and
 * `createPressHoldInput` are the public faces of this tracker.
 */
export interface ObservedPress<D> {
  readonly pointerId: number;
  readonly pointerType: string;
  /** Client position of the press. */
  readonly x: number;
  readonly y: number;
  /** `performance.now()` when the press began. */
  readonly startedAt: number;
  /** Irreversible: set by movement past the threshold, a second eligible press or a lost button. */
  cancelled: boolean;
  /** Relative mouse movement accumulated while the host owns pointer lock. */
  relativeX: number;
  relativeY: number;
  readonly data: D;
}

export interface PressObserverOptions<D> {
  element: HTMLElement;
  claimArea?: ClaimArea;
  /** The registry consulted by `ignoreOwners`. Default: the shared `pointerOwnership`. */
  ownership?: PointerOwnership;
  /**
   * Owners whose pointers are left alone: a press already claimed under one of these names in
   * `ownership` is not followed and cancels nothing. Owners not listed (the stick, look) do not
   * matter, so a press the stick holds is still observed.
   */
  ignoreOwners?: readonly string[];
  /** Maximum excursion from the press in CSS pixels. Finite and nonnegative. */
  maxDistance: number;
  /**
   * Called for a press that passed every check. Return the data to keep with it, or `undefined`
   * to leave the press alone: it is then not followed and cancels nothing.
   */
  begin: (event: PointerEvent, rect: ClaimRect) => D | undefined;
  /** A followed press began; it is already in the held set. */
  onStart?: (press: ObservedPress<D>) => void;
  /**
   * A followed press left the held set. `up` is passed only when it ended with a `pointerup`; every
   * other way a press ends (cancel, lost capture, blur, reset, dispose) passes `undefined`.
   */
  onSettle: (press: ObservedPress<D>, up: PressUp | undefined) => void;
}

/** How a followed press ended with a `pointerup`. */
export interface PressUp {
  readonly event: PointerEvent;
  /** Never cancelled, ended by the primary button, within the threshold and inside the host. */
  readonly clean: boolean;
  /** Milliseconds from the press to the release, on the `performance.now()` clock. */
  readonly heldMs: number;
}

export interface PressObserver {
  reset(): void;
  dispose(): void;
}

/**
 * The pointer bookkeeping shared by the observers that never claim a pointer: eligibility checks,
 * maximum-excursion tracking (coalesced samples and locked-mouse movement included) and every way a
 * followed press can be discarded. What a clean press means is up to the caller.
 */
export function observePresses<D>({
  element,
  claimArea,
  ownership = pointerOwnership,
  ignoreOwners,
  maxDistance,
  begin,
  onStart,
  onSettle,
}: PressObserverOptions<D>): PressObserver {
  if (!Number.isFinite(maxDistance) || maxDistance < 0) {
    throw new RangeError("maxDistance must be finite and nonnegative");
  }
  const doc = element.ownerDocument;
  const win = doc.defaultView;
  if (!win) throw new Error("element must belong to a window");
  const held = new Map<number, ObservedPress<D>>();
  const reset = () => {
    const discarded = [...held.values()];
    held.clear();
    for (const press of discarded) onSettle(press, undefined);
  };
  const discard = (pointerId: number) => {
    const press = held.get(pointerId);
    if (!press) return;
    held.delete(pointerId);
    onSettle(press, undefined);
  };
  const rectIfInside = (event: PointerEvent) => {
    if (!element.isConnected) return undefined;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 &&
      rect.height > 0 &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
      ? rect
      : undefined;
  };
  const accepts = (event: PointerEvent) => {
    if (isInteractiveTarget(event.target)) return undefined;
    const rect = rectIfInside(event);
    return rect && (!claimArea || claimArea(event, rect)) ? rect : undefined;
  };
  const onDown = (event: PointerEvent) => {
    if (!["mouse", "touch", "pen"].includes(event.pointerType) || event.button !== 0) return;
    // A window-capture claimer (createPressDragInput) has already run: its pointer is not ours.
    const claimedBy = ownership.ownerOf(event.pointerId);
    if (claimedBy !== undefined && ignoreOwners?.includes(claimedBy)) return;
    const rect = accepts(event);
    if (!rect) return;
    const data = begin(event, rect);
    if (data === undefined) return;
    // Only eligible region contacts participate: a held movement finger is independent.
    const cancelled = held.size > 0;
    for (const candidate of held.values()) candidate.cancelled = true;
    const press: ObservedPress<D> = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      startedAt: win.performance.now(),
      cancelled,
      relativeX: 0,
      relativeY: 0,
      data,
    };
    const replaced = held.get(event.pointerId);
    held.set(event.pointerId, press);
    if (replaced) onSettle(replaced, undefined);
    onStart?.(press);
  };
  const track = (event: PointerEvent) => {
    const press = held.get(event.pointerId);
    if (!press) return;
    const samples = [...(event.getCoalescedEvents?.() ?? []), event];
    for (const sample of samples) {
      const distance = Math.hypot(sample.clientX - press.x, sample.clientY - press.y);
      if (!Number.isFinite(distance) || distance > maxDistance) press.cancelled = true;
    }
    if (event.pointerType === "mouse" && event.buttons === 0) press.cancelled = true;
  };
  const trackLockedMouse = (event: MouseEvent) => {
    if (doc.pointerLockElement !== element) return;
    for (const press of held.values()) {
      if (press.pointerType !== "mouse") continue;
      // Locked client coordinates are fixed. Consume mousemove deltas once, not again on pointermove.
      press.relativeX += event.movementX;
      press.relativeY += event.movementY;
      const distance = Math.hypot(press.relativeX, press.relativeY);
      if (!Number.isFinite(distance) || distance > maxDistance || event.buttons === 0) {
        press.cancelled = true;
      }
    }
  };
  const onUp = (event: PointerEvent) => {
    const press = held.get(event.pointerId);
    if (!press) return;
    // pointerup normally has buttons=0: only movement checks missing mouse buttons.
    const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    held.delete(event.pointerId);
    const clean =
      !press.cancelled &&
      event.button === 0 &&
      Number.isFinite(distance) &&
      distance <= maxDistance &&
      accepts(event) !== undefined;
    onSettle(press, { event, clean, heldMs: win.performance.now() - press.startedAt });
  };
  const onCancel = (event: PointerEvent) => discard(event.pointerId);
  // Capture precedes look's bubble-phase pointerup/capture release, avoiding false cancellation.
  element.addEventListener("pointerdown", onDown, true);
  win.addEventListener("pointermove", track, true);
  win.addEventListener("pointerup", onUp, true);
  win.addEventListener("pointercancel", onCancel, true);
  win.addEventListener("lostpointercapture", onCancel, true);
  win.addEventListener("blur", reset, true);
  doc.addEventListener("mousemove", trackLockedMouse, true);
  doc.addEventListener("pointerlockchange", reset);
  let disposed = false;
  return {
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      element.removeEventListener("pointerdown", onDown, true);
      win.removeEventListener("pointermove", track, true);
      win.removeEventListener("pointerup", onUp, true);
      win.removeEventListener("pointercancel", onCancel, true);
      win.removeEventListener("lostpointercapture", onCancel, true);
      win.removeEventListener("blur", reset, true);
      doc.removeEventListener("mousemove", trackLockedMouse, true);
      doc.removeEventListener("pointerlockchange", reset);
    },
  };
}
