import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { createPointerOwnership, pointerOwnership } from "../src/pointerOwnership";
import { type OwnedPointers, usePointerOwnership } from "../src/usePointerOwnership";

afterEach(() => {
  cleanup();
  pointerOwnership.clear();
});

function Harness({
  owner,
  registry,
  sink,
}: {
  owner: string;
  registry?: ReturnType<typeof createPointerOwnership>;
  sink: OwnedPointers[];
}) {
  const pointers = usePointerOwnership(owner, registry ? { ownership: registry } : undefined);
  sink.push(pointers);
  return null;
}

const last = (sink: OwnedPointers[]) => sink[sink.length - 1] as OwnedPointers;

function pointerEvent(type: string, pointerId: number): Event {
  return Object.assign(new Event(type), { pointerId });
}

test("claim and release act as the owner, in the shared registry by default", () => {
  const sink: OwnedPointers[] = [];
  render(<Harness owner="station" sink={sink} />);
  const pointers = last(sink);

  expect(pointers.claim(1)).toBe(true);
  expect(pointerOwnership.ownerOf(1)).toBe("station");
  expect(pointers.owns(1)).toBe(true);
  expect(pointers.ownerOf(1)).toBe("station");
  expect(pointers.heldByOther(1)).toBe(false);

  expect(pointers.release(1)).toBe(true);
  expect(pointerOwnership.ownerOf(1)).toBeUndefined();
  expect(pointers.owns(1)).toBe(false);
});

test("a pointer another owner holds is refused, reported as held by other, and not released", () => {
  const registry = createPointerOwnership();
  const sink: OwnedPointers[] = [];
  render(<Harness owner="look" registry={registry} sink={sink} />);
  registry.claim(7, "station");
  const pointers = last(sink);

  expect(pointers.claim(7)).toBe(false);
  expect(pointers.heldByOther(7)).toBe(true);
  expect(pointers.owns(7)).toBe(false);
  expect(pointers.release(7)).toBe(false);
  expect(registry.ownerOf(7)).toBe("station");
});

test("a free pointer is not held by another", () => {
  const sink: OwnedPointers[] = [];
  render(<Harness owner="look" sink={sink} />);
  expect(last(sink).heldByOther(42)).toBe(false);
});

test("while mounted, a pointer that ends is released", () => {
  const sink: OwnedPointers[] = [];
  render(<Harness owner="station" sink={sink} />);
  last(sink).claim(3);
  window.dispatchEvent(pointerEvent("pointerup", 3));
  expect(pointerOwnership.ownerOf(3)).toBeUndefined();

  last(sink).claim(4);
  window.dispatchEvent(pointerEvent("pointercancel", 4));
  expect(pointerOwnership.ownerOf(4)).toBeUndefined();
});

test("unmounting releases this owner's pointers and no one else's", () => {
  const sink: OwnedPointers[] = [];
  const view = render(<Harness owner="station" sink={sink} />);
  last(sink).claim(1);
  last(sink).claim(2);
  pointerOwnership.claim(3, "joystick");

  view.unmount();
  expect(pointerOwnership.ownerOf(1)).toBeUndefined();
  expect(pointerOwnership.ownerOf(2)).toBeUndefined();
  expect(pointerOwnership.ownerOf(3)).toBe("joystick");

  // And the window listeners went with it: a later claim is not released by an event.
  pointerOwnership.claim(5, "station");
  window.dispatchEvent(pointerEvent("pointerup", 5));
  expect(pointerOwnership.ownerOf(5)).toBe("station");
});

test("the returned object is stable across re-renders and changes with the owner", () => {
  const sink: OwnedPointers[] = [];
  const view = render(<Harness owner="station" sink={sink} />);
  view.rerender(<Harness owner="station" sink={sink} />);
  expect(sink.length).toBeGreaterThan(1);
  expect(new Set(sink).size).toBe(1);

  view.rerender(<Harness owner="look" sink={sink} />);
  expect(last(sink)).not.toBe(sink[0]);
  expect(last(sink).claim(9)).toBe(true);
  expect(pointerOwnership.ownerOf(9)).toBe("look");
});
