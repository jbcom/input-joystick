import { afterEach, expect, test, vi } from "vitest";
import { createLookInput } from "../src/lookInput";
import { createPointerOwnership } from "../src/pointerOwnership";
import { createPressHoldInput } from "../src/pressHoldInput";
import { createTapInput } from "../src/tapInput";
import { mouseScript } from "./mouseScript";

const disposals: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  document.body.replaceChildren();
});

function surface() {
  const element = document.createElement("div");
  element.dataset.testid = "hold-surface";
  element.style.cssText = "width: 300px; height: 200px; touch-action: none";
  document.body.append(element);
  return element;
}

// Real mouse input and real timers: the hold fires from a trusted press, and a trusted release
// after it is no tap when the tap input is told how long a tap may last.
test("a native mouse press held past the hold time fires one hold; a quick press taps instead", async () => {
  const element = surface();
  const onHold = vi.fn();
  const onTap = vi.fn();
  const ownership = createPointerOwnership();
  const look = createLookInput({ element, ownership, allowMouseDrag: true, onChange() {} });
  const hold = createPressHoldInput({ element, holdMs: 150, onHold });
  const tap = createTapInput({ element, maxDuration: 150, onTap });
  disposals.push(hold.dispose, tap.dispose, look.dispose);

  await mouseScript("hold-surface", [
    { type: "down-at", x: 100, y: 80 },
    { type: "wait", ms: 60 },
    { type: "up" },
    { type: "wait", ms: 200 },
  ]);
  expect(onHold).not.toHaveBeenCalled();
  expect(onTap).toHaveBeenCalledTimes(1);

  await mouseScript("hold-surface", [
    { type: "down-at", x: 100, y: 80 },
    { type: "wait", ms: 400 },
  ]);
  await expect.poll(() => onHold.mock.calls.length).toBe(1);
  // The hold took nothing: look still owns the mouse that is held down.
  expect(ownership.ownerOf(1)).toMatch(/^look-/);
  await mouseScript("hold-surface", [{ type: "up" }]);
  expect(onHold).toHaveBeenCalledTimes(1);
  expect(onTap).toHaveBeenCalledTimes(1);

  await mouseScript("hold-surface", [
    { type: "down-at", x: 100, y: 80 },
    { type: "move", x: 140, y: 80 },
    { type: "wait", ms: 300 },
    { type: "up" },
  ]);
  expect(onHold).toHaveBeenCalledTimes(1);
  expect(onTap).toHaveBeenCalledTimes(1);
});

test("a touch contact held in real time holds at its press position, then a second finger cancels a fresh one", async () => {
  const element = surface();
  const onHold = vi.fn();
  const hold = createPressHoldInput({ element, holdMs: 100, onHold });
  disposals.push(hold.dispose);
  const rect = element.getBoundingClientRect();
  const touch = (type: string, id: number, x: number, y: number) =>
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: id,
      pointerType: "touch",
      clientX: rect.left + x,
      clientY: rect.top + y,
    });
  element.dispatchEvent(touch("pointerdown", 1, 60, 70));
  await expect.poll(() => onHold.mock.calls.length).toBe(1);
  expect(onHold.mock.calls[0][0]).toMatchObject({
    pointerId: 1,
    pointerType: "touch",
    x: rect.left + 60,
    y: rect.top + 70,
  });
  window.dispatchEvent(touch("pointerup", 1, 60, 70));
  element.dispatchEvent(touch("pointerdown", 2, 60, 70));
  element.dispatchEvent(touch("pointerdown", 3, 200, 70));
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(onHold).toHaveBeenCalledTimes(1);
  window.dispatchEvent(touch("pointerup", 2, 60, 70));
  window.dispatchEvent(touch("pointerup", 3, 200, 70));
});
