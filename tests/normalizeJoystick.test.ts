/**
 * Deadzone + sensitivity contract for the pure `normalizeJoystick` function.
 *
 * Pins the input -> output curve so:
 *   - small thumb wobble (under deadzone) -> zero movement, no drift
 *   - intermediate push -> proportional speed
 *   - max push -> unit vector (capped)
 *
 * deadZone is a 0-1 fraction of radius, matching FloatingJoystickProps.
 */

import { describe, expect, it } from "vitest";
import { normalizeJoystick } from "../src/normalizeJoystick";

const RADIUS = 58;
const DEAD_ZONE = 0.12; // fraction of radius, matches FloatingJoystick's default

describe("normalizeJoystick: deadzone", () => {
  it("a touch at exactly (0, 0) -> zero output", () => {
    const out = normalizeJoystick({ x: 0, y: 0 }, RADIUS, DEAD_ZONE);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.magnitude).toBe(0);
  });

  it("a touch INSIDE the deadzone -> zero output (no drift)", () => {
    const innerVec = { x: RADIUS * DEAD_ZONE * 0.5, y: 0 };
    const out = normalizeJoystick(innerVec, RADIUS, DEAD_ZONE);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.magnitude).toBe(0);
  });

  it("a touch JUST outside the deadzone produces a small non-zero output", () => {
    const justPast = { x: RADIUS * DEAD_ZONE + 1, y: 0 };
    const out = normalizeJoystick(justPast, RADIUS, DEAD_ZONE);
    expect(out.x).toBeGreaterThan(0);
    expect(out.x).toBeLessThan(0.5);
    expect(out.y).toBe(0);
  });
});

describe("normalizeJoystick: proportional + cap", () => {
  it("intermediate push -> proportional output (linear between deadzone and radius)", () => {
    const out = normalizeJoystick({ x: RADIUS * 0.56, y: 0 }, RADIUS, DEAD_ZONE);
    expect(out.x).toBeCloseTo(0.5, 1);
    expect(out.y).toBe(0);
  });

  it("full push at radius -> unit-ish output", () => {
    const out = normalizeJoystick({ x: RADIUS, y: 0 }, RADIUS, DEAD_ZONE);
    expect(out.x).toBeCloseTo(1, 5);
    expect(out.y).toBe(0);
  });

  it("over-extended push past radius -> clamped to unit vector", () => {
    const out = normalizeJoystick({ x: RADIUS * 3, y: 0 }, RADIUS, DEAD_ZONE);
    expect(out.x).toBeCloseTo(1, 5);
    expect(out.y).toBe(0);
    const len = Math.hypot(out.x, out.y);
    expect(len).toBeLessThanOrEqual(1.0001);
  });

  it("diagonal max push -> unit vector along the diagonal", () => {
    const out = normalizeJoystick({ x: RADIUS * 3, y: RADIUS * 3 }, RADIUS, DEAD_ZONE);
    const len = Math.hypot(out.x, out.y);
    expect(len).toBeCloseTo(1, 5);
  });

  it("angle reflects the direction of the raw offset", () => {
    const out = normalizeJoystick({ x: 0, y: RADIUS }, RADIUS, DEAD_ZONE);
    expect(out.angle).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe("normalizeJoystick with a degenerate radius", () => {
  it("reports zero magnitude for a zero or negative radius", () => {
    for (const radius of [0, -10]) {
      const out = normalizeJoystick({ x: 30, y: 0 }, radius, DEAD_ZONE);
      expect(out.magnitude).toBe(0);
      expect(out.x).toBe(0);
      expect(out.y).toBe(0);
    }
  });
});
