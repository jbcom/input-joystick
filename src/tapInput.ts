import type { ClaimArea } from "./claimArea.js";
import { isInteractiveTarget } from "./interactiveTarget.js";

export interface TapInputOptions {
  element: HTMLElement;
  /** Additional press/release gate; partition movement controls from the action region here. */
  claimArea?: ClaimArea;
  /** Maximum excursion from the press, in CSS pixels. Finite, nonnegative; default 8. */
  maxDistance?: number;
  /** Receives the original pointerup exactly once, never a synthetic click or world command. */
  onTap: (event: PointerEvent) => void;
}
export interface TapInput {
  /** Discard held candidates when overlays, focus modes or scenes change. */
  reset(): void;
  /** Remove listeners and discard held candidates. Idempotent. */
  dispose(): void;
}

/** Observe tap intent without claiming pointers, capturing, preventing defaults or changing look. */
export function createTapInput({
  element,
  claimArea,
  maxDistance = 8,
  onTap,
}: TapInputOptions): TapInput {
  if (!Number.isFinite(maxDistance) || maxDistance < 0) {
    throw new RangeError("maxDistance must be finite and nonnegative");
  }
  const doc = element.ownerDocument;
  const win = doc.defaultView;
  if (!win) throw new Error("element must belong to a window");
  const held = new Map<
    number,
    {
      x: number;
      y: number;
      pointerType: string;
      relativeX: number;
      relativeY: number;
      cancelled: boolean;
    }
  >();
  const reset = () => held.clear();
  const accepts = (event: PointerEvent) => {
    if (!element.isConnected) return false;
    if (isInteractiveTarget(event.target)) return false;
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom &&
      (!claimArea || claimArea(event, rect))
    );
  };
  const onDown = (event: PointerEvent) => {
    if (
      !["mouse", "touch", "pen"].includes(event.pointerType) ||
      event.button !== 0 ||
      !accepts(event)
    )
      return;
    // Only eligible region contacts participate: a held movement finger is independent.
    const cancelled = held.size > 0;
    for (const candidate of held.values()) candidate.cancelled = true;
    held.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
      relativeX: 0,
      relativeY: 0,
      cancelled,
    });
  };
  const track = (event: PointerEvent) => {
    const candidate = held.get(event.pointerId);
    if (!candidate) return;
    const samples = [...(event.getCoalescedEvents?.() ?? []), event];
    for (const sample of samples) {
      const distance = Math.hypot(sample.clientX - candidate.x, sample.clientY - candidate.y);
      if (!Number.isFinite(distance) || distance > maxDistance) candidate.cancelled = true;
    }
    if (event.pointerType === "mouse" && event.buttons === 0) candidate.cancelled = true;
  };
  const trackLockedMouse = (event: MouseEvent) => {
    if (doc.pointerLockElement !== element) return;
    for (const candidate of held.values()) {
      if (candidate.pointerType !== "mouse") continue;
      // Locked client coordinates are fixed. Consume mousemove deltas once, not again on pointermove.
      candidate.relativeX += event.movementX;
      candidate.relativeY += event.movementY;
      const distance = Math.hypot(candidate.relativeX, candidate.relativeY);
      if (!Number.isFinite(distance) || distance > maxDistance || event.buttons === 0) {
        candidate.cancelled = true;
      }
    }
  };
  const onUp = (event: PointerEvent) => {
    const candidate = held.get(event.pointerId);
    if (!candidate) return;
    // pointerup normally has buttons=0: only movement checks missing mouse buttons.
    const distance = Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y);
    held.delete(event.pointerId);
    if (
      !candidate.cancelled &&
      event.button === 0 &&
      Number.isFinite(distance) &&
      distance <= maxDistance &&
      accepts(event)
    )
      onTap(event);
  };
  const onCancel = (event: PointerEvent) => {
    held.delete(event.pointerId);
  };
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
