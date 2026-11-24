import type { ClaimArea, ClaimRect } from "./claimArea.js";
import type { PointerOwnership } from "./pointerOwnership.js";
import { observePresses } from "./pressObserver.js";

/** A press that stayed put for the hold time. */
export interface PressHold<T = undefined> {
  pointerId: number;
  pointerType: string;
  /** Client position of the press, where the hold began. */
  x: number;
  y: number;
  /** What `target` returned when the press began. `undefined` when no `target` was supplied. */
  target: T;
}

export interface PressHoldInputOptions<T = undefined> {
  element: HTMLElement;
  /** Additional press gate, as for `createTapInput`: partition movement controls from the hold region here. */
  claimArea?: ClaimArea;
  /** The registry `ignoreOwners` is read from. Default: the shared `pointerOwnership`. */
  ownership?: PointerOwnership;
  /**
   * Owners whose pointers are never holds: a press already claimed under one of these names (a
   * `createPressDragInput` press, say) is not followed. Other owners, the stick and look, do not
   * matter. Default none.
   */
  ignoreOwners?: readonly string[];
  /**
   * Decides, once, when the press begins, what a hold on it would act on. Return the target to
   * follow the press, or `null` or `undefined` to leave it alone: it is then neither held nor does
   * it cancel another hold. The result is fixed for the press, so a target that moves out from
   * under a still finger is still the target. Omit it to hold anywhere.
   */
  target?: (event: PointerEvent, rect: ClaimRect) => T | null | undefined;
  /** How long the press must stay put, in milliseconds. Positive and finite; default 500. */
  holdMs?: number;
  /** Maximum excursion from the press, in CSS pixels. Finite, nonnegative; default 8. */
  maxDistance?: number;
  /** Called once per press, when the hold time passes. */
  onHold: (hold: PressHold<T>) => void;
}
export interface PressHoldInput {
  /** Discard held presses and their timers when overlays, focus modes or scenes change. */
  reset(): void;
  /** Remove listeners and discard held presses. Idempotent. */
  dispose(): void;
}

interface HoldState<T> {
  target: T;
  timer: number | undefined;
}

/**
 * Observe a press that stays put, without claiming pointers, capturing or preventing defaults. It
 * shares the eligibility and movement rules of `createTapInput` (interactive controls are excluded,
 * movement past `maxDistance` cancels, two overlapping eligible presses cancel each other, a lock
 * change, blur or pointer cancel discards) and adds a timer: `onHold` fires once, `holdMs` after the
 * press, if none of that happened. The hold does not take the pointer, so the press may be a stick
 * or a look drag at the same time. Releasing afterwards is still a clean release for
 * `createTapInput` unless its `maxDuration` is set shorter than `holdMs`.
 */
export function createPressHoldInput<T = undefined>({
  element,
  claimArea,
  ownership,
  ignoreOwners,
  target,
  holdMs = 500,
  maxDistance = 8,
  onHold,
}: PressHoldInputOptions<T>): PressHoldInput {
  if (!(Number.isFinite(holdMs) && holdMs > 0)) {
    throw new RangeError("holdMs must be finite and positive");
  }
  const win = element.ownerDocument.defaultView;
  if (!win) throw new Error("element must belong to a window");
  return observePresses<HoldState<T>>({
    element,
    claimArea,
    ownership,
    ignoreOwners,
    maxDistance,
    begin: (event, rect) => {
      if (!target) return { target: undefined as T, timer: undefined };
      const found = target(event, rect);
      return found == null ? undefined : { target: found, timer: undefined };
    },
    onStart: (press) => {
      // Already overlapped by another eligible press: it can never become a hold.
      if (press.cancelled) return;
      press.data.timer = win.setTimeout(() => {
        press.data.timer = undefined;
        if (press.cancelled) return;
        onHold({
          pointerId: press.pointerId,
          pointerType: press.pointerType,
          x: press.x,
          y: press.y,
          target: press.data.target,
        });
      }, holdMs);
    },
    onSettle: (press) => {
      win.clearTimeout(press.data.timer);
      press.data.timer = undefined;
    },
  });
}
