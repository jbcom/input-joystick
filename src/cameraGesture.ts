/**
 * The arithmetic behind camera pan, pinch, twist and wheel input. Plain functions over plain
 * numbers: no DOM, no React and no renderer, so a game with its own camera (or none at all) can use
 * them directly and the maths is testable without a single pointer event.
 *
 * Conventions, shared with `createCameraPanZoomInput`:
 *
 * - Points and pans are in CSS pixels with y pointing down, like pointer coordinates.
 * - A pan is the displacement of the contact (or of the fingers' midpoint) since the last step: the
 *   content under the finger follows it, so a camera that grabs the ground subtracts it.
 * - A scale is a ratio where 1 is unchanged and above 1 is zoom in (fingers spreading, wheel
 *   scrolled up). A camera that thinks in distance or "units across" divides by it.
 * - A twist is an angle in radians in (-PI, PI], positive clockwise on screen (the direction an
 *   angle grows when y points down).
 */

export interface CameraPoint {
  x: number;
  y: number;
}

/** One step of a two-finger gesture, measured from the previous finger positions to the current. */
export interface TwoFingerGesture {
  /** Displacement of the fingers' midpoint, in pixels. */
  pan: CameraPoint;
  /** Ratio of the new finger span to the old; 1 when either span is zero. */
  scale: number;
  /** Change of the angle between the fingers, in radians; 0 when either span is zero. */
  twist: number;
  /** The fingers' current midpoint: the focal point to zoom or turn about. */
  center: CameraPoint;
}

/** The per-pixel zoom step of a wheel: one pixel of travel scales the view by 1.0015. */
export const DEFAULT_WHEEL_STEP = 1.0015;

const LINE_PIXELS = 16;

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const midpoint = (a: CameraPoint, b: CameraPoint): CameraPoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/**
 * Pan, pinch and twist for two fingers that moved from `before` to `after`. The fingers keep their
 * identity: `before[0]` and `after[0]` are the same finger, so twist is a rotation and not a swap.
 */
export function twoFingerGesture(
  before: readonly [CameraPoint, CameraPoint],
  after: readonly [CameraPoint, CameraPoint]
): TwoFingerGesture {
  const [b0, b1] = before;
  const [a0, a1] = after;
  const spanBefore = Math.hypot(b1.x - b0.x, b1.y - b0.y);
  const spanAfter = Math.hypot(a1.x - a0.x, a1.y - a0.y);
  const directed = spanBefore > 0 && spanAfter > 0;
  const from = midpoint(b0, b1);
  const center = midpoint(a0, a1);
  return {
    pan: { x: center.x - from.x, y: center.y - from.y },
    scale: directed ? spanAfter / spanBefore : 1,
    twist: directed
      ? wrapAngle(Math.atan2(a1.y - a0.y, a1.x - a0.x) - Math.atan2(b1.y - b0.y, b1.x - b0.x))
      : 0,
    center,
  };
}

/**
 * A wheel delta in pixels whatever the device reports: `deltaMode` 0 is already pixels, 1 is lines
 * (Firefox mice) and 2 is pages. `pageSize` is the height of a page in pixels, normally the
 * element's.
 */
export function normalizeWheelDelta(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return delta * LINE_PIXELS;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}

/**
 * The scale one wheel movement of `pixels` applies: `step ** -pixels`, so scrolling up (negative
 * pixels) zooms in with a scale above 1. Equal and opposite travel cancels exactly in log space.
 */
export function wheelZoomScale(pixels: number, step: number): number {
  return step ** -pixels;
}
