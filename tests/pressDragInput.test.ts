import { afterEach, expect, test, vi } from "vitest";
import { createLookInput } from "../src/lookInput";
import { createPointerOwnership } from "../src/pointerOwnership";
import {
  createPressDragInput,
  type PressDragEnd,
  type PressDragInputOptions,
  type PressDragPoint,
} from "../src/pressDragInput";
import { createPressHoldInput } from "../src/pressHoldInput";
import { createTapInput } from "../src/tapInput";

const disposals: Array<() => void> = [];
const rect = { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 };
// The target the recognizer owns: the part of the host right of x = 100, standing in for a preview.
const onTarget = (event: PointerEvent) => event.clientX >= 100;

function setup(options: Partial<PressDragInputOptions> = {}) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => rect as DOMRect;
  document.body.append(element);
  const ownership = createPointerOwnership();
  const calls: string[] = [];
  const onPress = vi.fn((_point: PressDragPoint) => calls.push("press"));
  const onDragStart = vi.fn((_point: PressDragPoint) => calls.push("dragStart"));
  const onDrag = vi.fn((_point: PressDragPoint) => calls.push("drag"));
  const onEnd = vi.fn((end: PressDragEnd) => calls.push(`end:${end.reason}`));
  const input = createPressDragInput({
    element,
    hitTarget: onTarget,
    ownership,
    owner: "run",
    onPress,
    onDragStart,
    onDrag,
    onEnd,
    ...options,
  });
  disposals.push(() => {
    input.dispose();
    element.remove();
  });
  return { input, element, ownership, calls, onPress, onDragStart, onDrag, onEnd };
}
function pointer(
  target: EventTarget,
  type: string,
  pointerId = 1,
  overrides: Partial<PointerEvent> = {}
) {
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerId,
    pointerType: "touch",
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    clientX: 150,
    clientY: 50,
    isPrimary: false,
    ...overrides,
  });
  target.dispatchEvent(event);
  return event;
}
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  vi.restoreAllMocks();
});

test("a press on the target is claimed and prevented, and released in place it is a tap", () => {
  const { element, ownership, onPress, onEnd, calls } = setup();
  const down = pointer(element, "pointerdown", 4, { clientX: 120, clientY: 30 });
  expect(down.defaultPrevented).toBe(true);
  expect(ownership.ownerOf(4)).toBe("run");
  expect(onPress).toHaveBeenCalledWith({
    pointerId: 4,
    pointerType: "touch",
    originX: 120,
    originY: 30,
    x: 120,
    y: 30,
    dx: 0,
    dy: 0,
    stepX: 0,
    stepY: 0,
  });
  pointer(window, "pointermove", 4, { clientX: 124, clientY: 33 });
  pointer(window, "pointerup", 4, { clientX: 124, clientY: 33 });
  expect(calls).toEqual(["press", "end:tap"]);
  expect(onEnd).toHaveBeenCalledWith(
    expect.objectContaining({ reason: "tap", x: 124, y: 33, dx: 4, dy: 3 })
  );
  expect(ownership.ownerOf(4)).toBeUndefined();
});

test("moving past the threshold starts a drag, reports steps from the origin, and release ends it as a drag", () => {
  const { element, onDragStart, onDrag, onEnd, calls } = setup({ maxDistance: 10 });
  pointer(element, "pointerdown", 1, { clientX: 120 });
  pointer(window, "pointermove", 1, { clientX: 130 });
  expect(onDrag).not.toHaveBeenCalled();
  pointer(window, "pointermove", 1, { clientX: 125, clientY: 61 });
  expect(calls).toEqual(["press", "dragStart", "drag"]);
  expect(onDragStart.mock.calls[0]).toEqual([
    expect.objectContaining({ x: 125, y: 61, dx: 5, dy: 11, stepX: 5, stepY: 11 }),
  ]);
  expect(onDrag.mock.calls[0][0]).toMatchObject({ stepX: 5, stepY: 11 });
  pointer(window, "pointermove", 1, { clientX: 140, clientY: 61 });
  expect(onDrag.mock.calls[1][0]).toMatchObject({ x: 140, dx: 20, stepX: 15, stepY: 0 });
  // Back on the origin the press is still a drag, and the release is reported as one.
  pointer(window, "pointerup", 1, { clientX: 120, clientY: 50 });
  expect(onDragStart).toHaveBeenCalledTimes(1);
  expect(onDrag).toHaveBeenCalledTimes(3);
  expect(onEnd).toHaveBeenCalledWith(
    expect.objectContaining({ reason: "drag", x: 120, y: 50, dx: 0, dy: 0 })
  );
});

test("it claims before the joystick, look and the tap and hold observers, in any registration order", () => {
  for (const dragFirst of [true, false]) {
    const element = document.createElement("div");
    element.getBoundingClientRect = () => rect as DOMRect;
    document.body.append(element);
    const ownership = createPointerOwnership();
    const onChange = vi.fn();
    const onTap = vi.fn();
    const onHold = vi.fn();
    const made: Array<() => void> = [];
    const makeDrag = () => {
      const drag = createPressDragInput({
        element,
        hitTarget: onTarget,
        ownership,
        owner: "run",
        onEnd() {},
      });
      made.push(drag.dispose);
    };
    if (dragFirst) makeDrag();
    const look = createLookInput({ element, ownership, onChange });
    const tap = createTapInput({ element, ownership, ignoreOwners: ["run"], onTap });
    vi.useFakeTimers();
    const hold = createPressHoldInput({ element, ownership, ignoreOwners: ["run"], onHold });
    if (!dragFirst) makeDrag();
    made.push(look.dispose, tap.dispose, hold.dispose, () => element.remove());
    // A press on the target: not a look drag, not a tap, not a hold.
    pointer(element, "pointerdown", 1, { clientX: 150 });
    expect(ownership.ownerOf(1)).toBe("run");
    pointer(window, "pointermove", 1, { clientX: 190 });
    vi.advanceTimersByTime(600);
    pointer(window, "pointerup", 1, { clientX: 190 });
    expect(onChange).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
    expect(onHold).not.toHaveBeenCalled();
    pointer(element, "pointerdown", 2, { clientX: 150 });
    pointer(window, "pointerup", 2, { clientX: 150 });
    expect(onTap).not.toHaveBeenCalled();
    // A press off the target is the others', as before.
    pointer(element, "pointerdown", 3, { clientX: 50 });
    expect(ownership.ownerOf(3)).toMatch(/^look-/);
    pointer(window, "pointermove", 3, { clientX: 90 });
    pointer(window, "pointerup", 3, { clientX: 90 });
    expect(onChange).toHaveBeenCalled();
    pointer(element, "pointerdown", 4, { clientX: 50 });
    pointer(window, "pointerup", 4, { clientX: 50 });
    expect(onTap).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    for (const dispose of made) dispose();
  }
});

test("a press the hit test rejects, another owner holds, or the host refuses is left alone", () => {
  const { element, ownership, onPress } = setup();
  const off = pointer(element, "pointerdown", 1, { clientX: 50 });
  expect(off.defaultPrevented).toBe(false);
  expect(ownership.ownerOf(1)).toBeUndefined();
  ownership.claim(2, "stick");
  const held = pointer(element, "pointerdown", 2);
  expect(held.defaultPrevented).toBe(false);
  expect(ownership.ownerOf(2)).toBe("stick");
  pointer(element, "pointerdown", 3, { pointerType: "unknown" });
  pointer(element, "pointerdown", 3, { button: 2 });
  pointer(element, "pointerdown", 3, { clientX: 201 });
  pointer(element, "pointerdown", 3, { clientY: -1 });
  element.getBoundingClientRect = () => ({ ...rect, width: 0 }) as DOMRect;
  pointer(element, "pointerdown", 3);
  element.getBoundingClientRect = () => ({ ...rect, height: 0 }) as DOMRect;
  pointer(element, "pointerdown", 3);
  element.getBoundingClientRect = () => rect as DOMRect;
  element.remove();
  pointer(element, "pointerdown", 3);
  expect(onPress).not.toHaveBeenCalled();
  expect(ownership.ownerOf(3)).toBeUndefined();
});

test("controls are excluded unless allowed, and text entry and opt-outs never are claimed", () => {
  const strict = setup();
  const button = document.createElement("button");
  const input = document.createElement("input");
  const ignored = document.createElement("div");
  ignored.setAttribute("data-joystick-ignore", "true");
  strict.element.append(button, input, ignored);
  for (const control of [button, input, ignored]) pointer(control, "pointerdown");
  expect(strict.onPress).not.toHaveBeenCalled();
  strict.input.dispose();
  const allowing = setup({ allowControls: true });
  const control = document.createElement("button");
  const field = document.createElement("input");
  allowing.element.append(control, field);
  pointer(field, "pointerdown", 1);
  expect(allowing.onPress).not.toHaveBeenCalled();
  pointer(control, "pointerdown", 1);
  expect(allowing.onPress).toHaveBeenCalledTimes(1);
  pointer(window, "pointerup", 1);
});

test("a mouse press needs allowMouse, captures the pointer, and a refused capture releases the claim", () => {
  const refused = setup();
  pointer(refused.element, "pointerdown", 1, { pointerType: "mouse" });
  expect(refused.onPress).not.toHaveBeenCalled();
  const { element, ownership, onPress, onEnd } = setup({ allowMouse: true });
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  element.setPointerCapture = setPointerCapture;
  element.hasPointerCapture = () => true;
  element.releasePointerCapture = releasePointerCapture;
  pointer(element, "pointerdown", 1, { pointerType: "mouse" });
  expect(setPointerCapture).toHaveBeenCalledWith(1);
  pointer(window, "pointermove", 1, { pointerType: "mouse", clientX: 170 });
  pointer(window, "pointerup", 1, { pointerType: "mouse", clientX: 170 });
  expect(releasePointerCapture).toHaveBeenCalledWith(1);
  expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ reason: "drag" }));
  element.setPointerCapture = () => {
    throw new Error("InvalidPointerId");
  };
  const failed = pointer(element, "pointerdown", 2, { pointerType: "mouse" });
  expect(failed.defaultPrevented).toBe(false);
  expect(ownership.ownerOf(2)).toBeUndefined();
  expect(onPress).toHaveBeenCalledTimes(1);
  // No capture support at all is fine.
  element.setPointerCapture = undefined as never;
  element.hasPointerCapture = undefined as never;
  pointer(element, "pointerdown", 3, { pointerType: "mouse" });
  pointer(window, "pointerup", 3, { pointerType: "mouse" });
  expect(onPress).toHaveBeenCalledTimes(2);
});

test("a second pointer cancels by default and is left to the others when cancelling is off", () => {
  const first = setup();
  pointer(first.element, "pointerdown", 1);
  const second = pointer(first.element, "pointerdown", 2);
  expect(first.calls).toEqual(["press", "end:cancel"]);
  expect(second.defaultPrevented).toBe(false);
  expect(first.ownership.ownerOf(1)).toBeUndefined();
  expect(first.ownership.ownerOf(2)).toBeUndefined();
  pointer(window, "pointerup", 2);
  first.input.dispose();
  const steady = setup({ cancelOnSecondPointer: false });
  pointer(steady.element, "pointerdown", 1);
  pointer(steady.element, "pointerdown", 2);
  pointer(steady.element, "pointerdown", 1);
  pointer(window, "pointermove", 2, { clientX: 190 });
  pointer(window, "pointerup", 2);
  pointer(window, "pointercancel", 2);
  expect(steady.calls).toEqual(["press"]);
  expect(steady.ownership.ownerOf(2)).toBeUndefined();
  pointer(window, "pointerup", 1);
  expect(steady.calls).toEqual(["press", "end:tap"]);
});

test("pointer cancel, capture loss, blur, lock change, reset and disposal cancel a held press", () => {
  const { element, input, ownership, onEnd } = setup();
  const cancels: Array<() => void> = [
    () => pointer(window, "pointercancel", 1),
    () => pointer(element, "lostpointercapture", 1),
    () => window.dispatchEvent(new Event("blur")),
    () => document.dispatchEvent(new Event("pointerlockchange")),
    () => input.reset(),
  ];
  for (const cancel of cancels) {
    pointer(element, "pointerdown", 1);
    pointer(window, "pointercancel", 99);
    pointer(element, "lostpointercapture", 99);
    cancel();
    expect(onEnd).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "cancel" }));
    expect(ownership.ownerOf(1)).toBeUndefined();
    cancel();
  }
  expect(onEnd).toHaveBeenCalledTimes(cancels.length);
  pointer(element, "pointerdown", 1);
  input.dispose();
  input.dispose();
  expect(onEnd).toHaveBeenCalledTimes(cancels.length + 1);
  pointer(element, "pointerdown", 1);
  expect(ownership.ownerOf(1)).toBeUndefined();
});

test("a claim released from the registry, a missing mouse button and a lost host end it as a cancel", () => {
  const { element, ownership, onEnd } = setup({ allowMouse: true });
  pointer(element, "pointerdown", 1);
  ownership.release(1, "run");
  expect(onEnd).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "cancel" }));
  pointer(element, "pointerdown", 1);
  ownership.release(1, "someone-else");
  expect(ownership.ownerOf(1)).toBe("run");
  ownership.clear();
  expect(onEnd).toHaveBeenCalledTimes(2);
  pointer(element, "pointerdown", 1, { pointerType: "mouse" });
  pointer(window, "pointermove", 1, { pointerType: "mouse", buttons: 0 });
  expect(onEnd).toHaveBeenCalledTimes(3);
  pointer(element, "pointerdown", 1);
  element.remove();
  pointer(window, "pointermove", 1);
  expect(onEnd).toHaveBeenCalledTimes(4);
  document.body.append(element);
  pointer(element, "pointerdown", 1);
  element.remove();
  pointer(window, "pointerup", 1);
  expect(onEnd).toHaveBeenCalledTimes(5);
  expect(onEnd).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "cancel" }));
});

test("any lift of the held pointer is its release, whichever button the event reports", () => {
  const { element, onEnd } = setup();
  for (const button of [0, 2, -1]) {
    pointer(element, "pointerdown", 1);
    pointer(window, "pointerup", 1, { button });
    expect(onEnd).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "tap" }));
  }
  expect(onEnd).toHaveBeenCalledTimes(3);
});

test("another pointer's move and lift are ignored, and non-finite positions are skipped", () => {
  const { element, onDrag, onEnd } = setup();
  pointer(element, "pointerdown", 1, { clientX: 120 });
  pointer(window, "pointermove", 2, { clientX: 190 });
  pointer(window, "pointerup", 2, { clientX: 190 });
  pointer(window, "pointermove", 1, { clientX: Number.NaN });
  pointer(window, "pointermove", 1, { clientY: Number.POSITIVE_INFINITY });
  expect(onDrag).not.toHaveBeenCalled();
  expect(onEnd).not.toHaveBeenCalled();
  pointer(window, "pointerup", 1, { clientX: 120 });
  expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ reason: "tap" }));
});

test("under pointer lock the relative mouse movement drives the press while client coordinates stay fixed", () => {
  const { element, onDragStart, onDrag, onEnd } = setup({ allowMouse: true });
  let locked: Element | null = null;
  Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => locked });
  const mouse = (movementX: number, movementY = 0, buttons = 1) =>
    document.dispatchEvent(
      Object.assign(new Event("mousemove"), { movementX, movementY, buttons })
    );
  mouse(50); // no press: ignored
  pointer(element, "pointerdown", 1, { pointerType: "mouse", clientX: 150 });
  mouse(50); // not locked: ignored
  locked = element;
  mouse(5);
  pointer(window, "pointermove", 1, { pointerType: "mouse", clientX: 150, movementX: 5 });
  expect(onDragStart).not.toHaveBeenCalled();
  mouse(4, 6);
  expect(onDragStart).toHaveBeenCalledTimes(1);
  expect(onDrag.mock.calls[0][0]).toMatchObject({ x: 159, y: 56, dx: 9, dy: 6, stepX: 9 });
  mouse(-9, -6);
  expect(onDrag.mock.calls[1][0]).toMatchObject({ x: 150, y: 50, stepX: -9, stepY: -6 });
  pointer(window, "pointerup", 1, { pointerType: "mouse", clientX: 150 });
  expect(onEnd).toHaveBeenLastCalledWith(
    expect.objectContaining({ reason: "drag", x: 150, y: 50 })
  );
  pointer(element, "pointerdown", 1, { pointerType: "mouse" });
  mouse(2, 0, 0); // the button is up: cancel
  expect(onEnd).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "cancel" }));
  pointer(element, "pointerdown", 1, { pointerType: "mouse" });
  mouse(2);
  pointer(window, "pointerup", 1, { pointerType: "mouse" });
  expect(onEnd).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "tap" }));
  pointer(element, "pointerdown", 1);
  mouse(100); // a touch press never consumes mouse movement
  pointer(window, "pointerup", 1);
  expect(onEnd).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "tap" }));
  locked = null;
});

test("invalid options fail before attachment, and a callback-free recognizer still works", () => {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => rect as DOMRect;
  document.body.append(element);
  for (const maxDistance of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => createPressDragInput({ element, hitTarget: onTarget, maxDistance })).toThrow(
      RangeError
    );
  }
  const detached = document.implementation.createHTMLDocument().createElement("div");
  expect(() => createPressDragInput({ element: detached, hitTarget: onTarget })).toThrow("window");
  const ownership = createPointerOwnership();
  const bare = createPressDragInput({ element, hitTarget: onTarget, ownership });
  pointer(element, "pointerdown", 1);
  pointer(window, "pointermove", 1, { clientX: 190 });
  pointer(window, "pointerup", 1, { clientX: 190 });
  expect(ownership.ownerOf(1)).toBeUndefined();
  bare.dispose();
  // Two recognizers without names never share a claim.
  const a = createPressDragInput({ element, hitTarget: onTarget, ownership });
  const b = createPressDragInput({ element, hitTarget: onTarget, ownership });
  pointer(element, "pointerdown", 1);
  expect(ownership.ownerOf(1)).toMatch(/^press-drag-/);
  pointer(window, "pointerup", 1);
  a.dispose();
  b.dispose();
  element.remove();
});

test("a mouse press under pointer lock is not captured, which the browser refuses, and follows relative movement", () => {
  const { element, ownership, onPress, onDragStart } = setup({ allowMouse: true });
  let locked: Element | null = element;
  Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => locked });
  element.setPointerCapture = vi.fn(() => {
    throw new DOMException("locked", "InvalidStateError");
  });
  const down = pointer(element, "pointerdown", 1, { pointerType: "mouse" });
  expect(element.setPointerCapture).not.toHaveBeenCalled();
  expect(down.defaultPrevented).toBe(true);
  expect(ownership.ownerOf(1)).toBe("run");
  expect(onPress).toHaveBeenCalledTimes(1);
  document.dispatchEvent(
    Object.assign(new Event("mousemove"), { movementX: 20, movementY: 0, buttons: 1 })
  );
  expect(onDragStart).toHaveBeenCalledTimes(1);
  pointer(window, "pointerup", 1, { pointerType: "mouse" });
  locked = null;
});

test("a mouse press on an allowed control is captured only once it drags, so the control keeps its click", () => {
  const { element, ownership, onDragStart, onEnd } = setup({
    allowMouse: true,
    allowControls: true,
  });
  const capture = vi.fn();
  element.setPointerCapture = capture;
  const badge = document.createElement("button");
  const inside = document.createElement("span");
  badge.append(inside);
  element.append(badge);
  // A tap on the control never captures.
  pointer(inside, "pointerdown", 1, { pointerType: "mouse" });
  pointer(window, "pointermove", 1, { pointerType: "mouse", clientX: 153 });
  expect(capture).not.toHaveBeenCalled();
  pointer(window, "pointerup", 1, { pointerType: "mouse", clientX: 153 });
  expect(onEnd).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "tap" }));
  // A drag from it is captured when it starts, and not before, and only once.
  pointer(inside, "pointerdown", 1, { pointerType: "mouse" });
  pointer(window, "pointermove", 1, { pointerType: "mouse", clientX: 190 });
  pointer(window, "pointermove", 1, { pointerType: "mouse", clientX: 195 });
  expect(capture).toHaveBeenCalledTimes(1);
  expect(capture).toHaveBeenCalledWith(1);
  expect(onDragStart).toHaveBeenCalledTimes(1);
  pointer(window, "pointerup", 1, { pointerType: "mouse", clientX: 195 });
  // Touch on a control never needs capture at all.
  pointer(inside, "pointerdown", 2);
  pointer(window, "pointermove", 2, { clientX: 190 });
  pointer(window, "pointerup", 2, { clientX: 190 });
  expect(capture).toHaveBeenCalledTimes(1);
  // A refused deferred capture ends the press as a cancel with nothing reported as a drag.
  element.setPointerCapture = () => {
    throw new Error("InvalidPointerId");
  };
  pointer(inside, "pointerdown", 3, { pointerType: "mouse" });
  pointer(window, "pointermove", 3, { pointerType: "mouse", clientX: 190 });
  expect(onEnd).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "cancel" }));
  expect(onDragStart).toHaveBeenCalledTimes(2); // the mouse drag and the touch drag, not this one
  expect(ownership.ownerOf(3)).toBeUndefined();
});

test("nothing is reported after the end when a callback resets or disposes mid-drag", () => {
  const calls: string[] = [];
  const holder: { input?: { reset(): void } } = {};
  const { element, onDrag, onEnd } = setup({
    onDragStart: () => {
      calls.push("dragStart");
      holder.input?.reset();
    },
  });
  holder.input = {
    reset: () => {
      calls.push("reset");
      pointer(window, "pointercancel", 1);
    },
  };
  pointer(element, "pointerdown", 1, { clientX: 120 });
  pointer(window, "pointermove", 1, { clientX: 160 });
  expect(calls).toEqual(["dragStart", "reset"]);
  expect(onDrag).not.toHaveBeenCalled();
  expect(onEnd).toHaveBeenCalledTimes(1);
  pointer(window, "pointerup", 1, { clientX: 160 });
  expect(onEnd).toHaveBeenCalledTimes(1);
});

test("a step is measured from the last position a callback saw, so only a callback moves it", () => {
  const onlyEnd = setup({ onPress: undefined, onDragStart: undefined, onDrag: undefined });
  pointer(onlyEnd.element, "pointerdown", 1, { clientX: 100 });
  pointer(window, "pointermove", 1, { clientX: 110 });
  pointer(window, "pointermove", 1, { clientX: 120 });
  pointer(window, "pointerup", 1, { clientX: 120 });
  expect(onlyEnd.onEnd).toHaveBeenCalledWith(
    expect.objectContaining({ reason: "drag", dx: 20, stepX: 20 })
  );
  onlyEnd.input.dispose();
  // With only onDragStart the drag start is the last callback, and the end steps from it.
  const onlyStart = setup({ onPress: undefined, onDrag: undefined });
  pointer(onlyStart.element, "pointerdown", 1, { clientX: 100 });
  pointer(window, "pointermove", 1, { clientX: 110 });
  expect(onlyStart.onDragStart.mock.calls[0][0]).toMatchObject({ stepX: 10 });
  pointer(window, "pointermove", 1, { clientX: 125 });
  pointer(window, "pointerup", 1, { clientX: 125 });
  expect(onlyStart.onEnd).toHaveBeenCalledWith(
    expect.objectContaining({ reason: "drag", dx: 25, stepX: 15 })
  );
  onlyStart.input.dispose();
  // Both drag callbacks see the same step for the move that starts the drag.
  const both = setup();
  pointer(both.element, "pointerdown", 1, { clientX: 100 });
  pointer(window, "pointermove", 1, { clientX: 110 });
  expect(both.onDragStart.mock.calls[0][0]).toMatchObject({ stepX: 10 });
  expect(both.onDrag.mock.calls[0][0]).toMatchObject({ stepX: 10 });
  pointer(window, "pointermove", 1, { clientX: 115 });
  expect(both.onDrag.mock.calls[1][0]).toMatchObject({ stepX: 5 });
  pointer(window, "pointerup", 1, { clientX: 115 });
});

test("a flick out and back inside one move event still starts a drag, from its coalesced samples", () => {
  const { element, onDragStart, onEnd } = setup({ maxDistance: 8 });
  pointer(element, "pointerdown", 1, { clientX: 120, clientY: 50 });
  pointer(window, "pointermove", 1, {
    clientX: 121,
    clientY: 50,
    getCoalescedEvents: () =>
      [
        { clientX: 140, clientY: 50 },
        { clientX: 121, clientY: 50 },
      ] as PointerEvent[],
  });
  expect(onDragStart).toHaveBeenCalledTimes(1);
  expect(onDragStart.mock.calls[0][0]).toMatchObject({ x: 121, dx: 1 });
  pointer(window, "pointerup", 1, { clientX: 121 });
  expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ reason: "drag" }));
  // Samples inside the threshold change nothing.
  pointer(element, "pointerdown", 1, { clientX: 120, clientY: 50 });
  pointer(window, "pointermove", 1, {
    clientX: 122,
    getCoalescedEvents: () => [{ clientX: 126, clientY: 50 }] as PointerEvent[],
  });
  pointer(window, "pointerup", 1, { clientX: 122 });
  expect(onEnd).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "tap" }));
});
