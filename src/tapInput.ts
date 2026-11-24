import type { ClaimArea } from "./claimArea.js";
import type { PointerOwnership } from "./pointerOwnership.js";
import { observePresses } from "./pressObserver.js";

export interface TapInputOptions {
  element: HTMLElement;
  /** Additional press/release gate; partition movement controls from the action region here. */
  claimArea?: ClaimArea;
  /** The registry `ignoreOwners` is read from. Default: the shared `pointerOwnership`. */
  ownership?: PointerOwnership;
  /**
   * Owners whose pointers are never taps: a press already claimed under one of these names (a
   * `createPressDragInput` press, say) is not followed. Other owners, the stick and look, do not
   * matter, so a tap is still reported in their zones. Default none.
   */
  ignoreOwners?: readonly string[];
  /** Maximum excursion from the press, in CSS pixels. Finite, nonnegative; default 8. */
  maxDistance?: number;
  /**
   * Longest press, in milliseconds, that still counts as a tap. A longer one is a hold and reports
   * no tap, so a press-and-hold recognizer and a tap never both act on one contact. Positive;
   * default unbounded.
   */
  maxDuration?: number;
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
  ownership,
  ignoreOwners,
  maxDistance = 8,
  maxDuration = Number.POSITIVE_INFINITY,
  onTap,
}: TapInputOptions): TapInput {
  if (!(maxDuration > 0)) throw new RangeError("maxDuration must be positive");
  return observePresses({
    element,
    claimArea,
    ownership,
    ignoreOwners,
    maxDistance,
    begin: () => true,
    onSettle: (_press, up) => {
      if (up?.clean && up.heldMs <= maxDuration) onTap(up.event);
    },
  });
}
