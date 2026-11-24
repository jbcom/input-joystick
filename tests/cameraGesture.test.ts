import { expect, test } from "vitest";
import {
  type CameraPoint,
  DEFAULT_WHEEL_STEP,
  normalizeWheelDelta,
  twoFingerGesture,
  wheelZoomScale,
  wrapAngle,
} from "../src/cameraGesture";

const pair = (a: CameraPoint, b: CameraPoint) => [a, b] as const;

test("a two-finger pan is the displacement of the midpoint, with no pinch or twist", () => {
  const gesture = twoFingerGesture(
    pair({ x: 0, y: 0 }, { x: 100, y: 0 }),
    pair({ x: 30, y: 10 }, { x: 130, y: 10 })
  );
  expect(gesture.pan).toEqual({ x: 30, y: 10 });
  expect(gesture.scale).toBe(1);
  expect(gesture.twist).toBe(0);
  expect(gesture.center).toEqual({ x: 80, y: 10 });
});

test("spreading the fingers is a scale above one and bringing them together is below one", () => {
  const spread = twoFingerGesture(
    pair({ x: 40, y: 50 }, { x: 60, y: 50 }),
    pair({ x: 30, y: 50 }, { x: 70, y: 50 })
  );
  expect(spread.scale).toBe(2);
  expect(spread.pan).toEqual({ x: 0, y: 0 });
  const pinch = twoFingerGesture(
    pair({ x: 0, y: 0 }, { x: 0, y: 80 }),
    pair({ x: 0, y: 20 }, { x: 0, y: 60 })
  );
  expect(pinch.scale).toBe(0.5);
});

test("the pinch scale is the reciprocal of the board camera's span ratio", () => {
  const before = pair({ x: 12, y: 7 }, { x: 90, y: 41 });
  const after = pair({ x: 20, y: 11 }, { x: 70, y: 66 });
  const spanBefore = Math.hypot(90 - 12, 41 - 7);
  const spanAfter = Math.hypot(70 - 20, 66 - 11);
  const { scale } = twoFingerGesture(before, after);
  expect(scale).toBeCloseTo(spanAfter / spanBefore, 12);
  expect(1 / scale).toBeCloseTo(spanBefore / spanAfter, 12);
});

test("twist is the change of the finger angle, clockwise on screen being positive", () => {
  const clockwise = twoFingerGesture(
    pair({ x: -10, y: 0 }, { x: 10, y: 0 }),
    pair({ x: 0, y: -10 }, { x: 0, y: 10 })
  );
  expect(clockwise.twist).toBeCloseTo(Math.PI / 2, 12);
  expect(clockwise.scale).toBeCloseTo(1, 12);
  const counter = twoFingerGesture(
    pair({ x: -10, y: 0 }, { x: 10, y: 0 }),
    pair({ x: 0, y: 10 }, { x: 0, y: -10 })
  );
  expect(counter.twist).toBeCloseTo(-Math.PI / 2, 12);
});

test("twist takes the short way across the half-turn seam", () => {
  const nearSeam = twoFingerGesture(
    pair({ x: 0, y: 0 }, { x: -10, y: 1 }),
    pair({ x: 0, y: 0 }, { x: -10, y: -1 })
  );
  expect(Math.abs(nearSeam.twist)).toBeLessThan(0.25);
  expect(nearSeam.twist).toBeGreaterThan(0);
  expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
  expect(Math.abs(wrapAngle(-3 * Math.PI))).toBeCloseTo(Math.PI, 12);
  expect(wrapAngle(0.5)).toBeCloseTo(0.5, 12);
  expect(wrapAngle(2 * Math.PI + 0.5)).toBeCloseTo(0.5, 12);
});

test("pinch, twist and pan combine in one step about the new midpoint", () => {
  const gesture = twoFingerGesture(
    pair({ x: 0, y: 0 }, { x: 20, y: 0 }),
    pair({ x: 100, y: 100 }, { x: 100, y: 140 })
  );
  expect(gesture.scale).toBe(2);
  expect(gesture.twist).toBeCloseTo(Math.PI / 2, 12);
  expect(gesture.pan).toEqual({ x: 90, y: 120 });
  expect(gesture.center).toEqual({ x: 100, y: 120 });
});

test("a zero span has no direction, so it neither scales nor twists", () => {
  const collapsedBefore = twoFingerGesture(
    pair({ x: 5, y: 5 }, { x: 5, y: 5 }),
    pair({ x: 0, y: 0 }, { x: 10, y: 0 })
  );
  expect(collapsedBefore.scale).toBe(1);
  expect(collapsedBefore.twist).toBe(0);
  expect(collapsedBefore.pan).toEqual({ x: 0, y: -5 });
  const collapsedAfter = twoFingerGesture(
    pair({ x: 0, y: 0 }, { x: 10, y: 0 }),
    pair({ x: 7, y: 7 }, { x: 7, y: 7 })
  );
  expect(collapsedAfter.scale).toBe(1);
  expect(collapsedAfter.twist).toBe(0);
});

test("wheel deltas are normalised to pixels across pixel, line and page modes", () => {
  expect(normalizeWheelDelta(120, 0, 800)).toBe(120);
  expect(normalizeWheelDelta(3, 1, 800)).toBe(48);
  expect(normalizeWheelDelta(-1, 2, 800)).toBe(-800);
  expect(normalizeWheelDelta(2, 2, 600)).toBe(1200);
});

test("an unknown delta mode is read as pixels", () => {
  expect(normalizeWheelDelta(9, 7, 800)).toBe(9);
});

test("a wheel step reproduces the board camera's 1.0015 per pixel curve in the zoom-in sense", () => {
  expect(DEFAULT_WHEEL_STEP).toBe(1.0015);
  for (const pixels of [-240, -16, -1, 1, 16, 100, 240]) {
    expect(1 / wheelZoomScale(pixels, DEFAULT_WHEEL_STEP)).toBeCloseTo(1.0015 ** pixels, 12);
  }
  expect(wheelZoomScale(0, DEFAULT_WHEEL_STEP)).toBe(1);
  expect(wheelZoomScale(-100, DEFAULT_WHEEL_STEP)).toBeGreaterThan(1);
  expect(wheelZoomScale(100, DEFAULT_WHEEL_STEP)).toBeLessThan(1);
});

test("opposite wheel travel cancels exactly in log space and a larger step zooms faster", () => {
  expect(wheelZoomScale(50, 1.01) * wheelZoomScale(-50, 1.01)).toBeCloseTo(1, 12);
  expect(wheelZoomScale(-10, 1.01)).toBeGreaterThan(wheelZoomScale(-10, 1.001));
});
