import { expect, test } from "vitest";
import { type ClaimRect, claimWidthFraction } from "../src/claimArea";

const RECT: ClaimRect = { left: 100, top: 20, right: 300, bottom: 220, width: 200, height: 200 };
const at = (clientX: number) => ({ clientX }) as PointerEvent;

test("the left fraction claims from the left edge up to, not including, its boundary", () => {
  const claims = claimWidthFraction("left", 0.4);
  expect(claims(at(100), RECT)).toBe(true);
  expect(claims(at(179), RECT)).toBe(true);
  expect(claims(at(180), RECT)).toBe(false);
  expect(claims(at(300), RECT)).toBe(false);
});

test("the right fraction claims from its boundary, inclusive, to the right edge", () => {
  const claims = claimWidthFraction("right", 0.4);
  expect(claims(at(300), RECT)).toBe(true);
  expect(claims(at(220), RECT)).toBe(true);
  expect(claims(at(219), RECT)).toBe(false);
  expect(claims(at(100), RECT)).toBe(false);
});

test("the fraction is of the host's width, measured from the host, not from the page", () => {
  const claims = claimWidthFraction("left", 0.5);
  expect(claims(at(150), RECT)).toBe(true);
  expect(claims(at(200), RECT)).toBe(false);
  // The same press against a host that starts at 0 is well inside the right half.
  expect(claims(at(150), { ...RECT, left: 0, right: 200 })).toBe(false);
});

test("a half from each side never claims the same column", () => {
  const left = claimWidthFraction("left", 0.5);
  const right = claimWidthFraction("right", 0.5);
  for (let x = 100; x <= 300; x += 1) {
    expect(left(at(x), RECT) && right(at(x), RECT)).toBe(false);
    expect(left(at(x), RECT) || right(at(x), RECT)).toBe(true);
  }
});

test("a fraction of 1 claims the whole host from either side", () => {
  for (const side of ["left", "right"] as const) {
    const claims = claimWidthFraction(side, 1);
    expect(claims(at(100), RECT)).toBe(true);
    expect(claims(at(299), RECT)).toBe(true);
  }
});

test.each([0, -0.1, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
  "a fraction of %s is a RangeError",
  (fraction) => {
    expect(() => claimWidthFraction("left", fraction)).toThrow(RangeError);
    expect(() => claimWidthFraction("right", fraction)).toThrow(RangeError);
  }
);
