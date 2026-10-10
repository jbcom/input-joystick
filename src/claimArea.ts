/**
 * Which pointer-downs a joystick may claim. The joystick has already checked
 * that the press is inside its host, and passes the host's rectangle so a
 * predicate can be written in the host's own coordinates.
 */

/** The part of a `DOMRect` a claim area may read. */
export type ClaimRect = Pick<
  DOMRectReadOnly,
  "left" | "top" | "right" | "bottom" | "width" | "height"
>;

/** Return `true` to let the joystick claim this press; `false` leaves it for look, drag or taps. */
export type ClaimArea = (event: PointerEvent, rect: ClaimRect) => boolean;

/**
 * A claim area for one side of the host: the `fraction` of its width counted
 * from the `side` edge. `claimWidthFraction("left", 0.4)` claims the left 40%
 * and leaves the rest of the screen free.
 *
 * The edge nearest the middle is exclusive on the left and inclusive on the
 * right, so `claimWidthFraction("left", 0.5)` and `claimWidthFraction("right", 0.5)`
 * never both claim the same column.
 *
 * @throws RangeError when `fraction` is not a number above 0 and at most 1.
 */
export function claimWidthFraction(side: "left" | "right", fraction: number): ClaimArea {
  if (!(fraction > 0 && fraction <= 1)) {
    throw new RangeError(`claimWidthFraction: fraction must be in (0, 1], got ${fraction}`);
  }
  if (side === "left") {
    return (event, rect) => event.clientX < rect.left + rect.width * fraction;
  }
  return (event, rect) => event.clientX >= rect.right - rect.width * fraction;
}
