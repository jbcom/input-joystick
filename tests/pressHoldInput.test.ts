import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { claimWidthFraction } from "../src/claimArea";
import { createLookInput } from "../src/lookInput";
import { createPointerOwnership } from "../src/pointerOwnership";
import {
  createPressHoldInput,
  type PressHold,
  type PressHoldInputOptions,
} from "../src/pressHoldInput";
import { createTapInput } from "../src/tapInput";

const disposals: Array<() => void> = [];
const rect = { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 };
function setup<T = undefined>(options: Partial<PressHoldInputOptions<T>> = {}) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => rect as DOMRect;
  document.body.append(element);
  const onHold = vi.fn<(hold: PressHold<T>) => void>();
  const input = createPressHoldInput<T>({ element, onHold, ...options });
  disposals.push(() => {
    input.dispose();
    element.remove();
  });
  return { input, element, onHold };
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
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("a press that stays put fires one hold at its position after the hold time", () => {
  const { element, onHold } = setup();
  const down = pointer(element, "pointerdown", 7, { clientX: 120, clientY: 40 });
  vi.advanceTimersByTime(499);
  expect(onHold).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onHold).toHaveBeenCalledTimes(1);
  expect(onHold).toHaveBeenCalledWith({
    pointerId: 7,
    pointerType: "touch",
    x: 120,
    y: 40,
    target: undefined,
  });
  vi.advanceTimersByTime(5000);
  pointer(window, "pointerup", 7, { clientX: 120, clientY: 40 });
  expect(onHold).toHaveBeenCalledTimes(1);
  expect(down.defaultPrevented).toBe(false);
});

test("a custom hold time applies, and movement within the threshold keeps the hold", () => {
  const { element, onHold } = setup({ holdMs: 120, maxDistance: 10 });
  pointer(element, "pointerdown");
  pointer(window, "pointermove", 1, { clientX: 160 });
  pointer(window, "pointermove", 1, { clientX: 150, clientY: 50 });
  vi.advanceTimersByTime(119);
  expect(onHold).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onHold).toHaveBeenCalledTimes(1);
});

test("releasing before the hold time fires nothing, even after the time would have passed", () => {
  const { element, onHold } = setup();
  pointer(element, "pointerdown");
  vi.advanceTimersByTime(300);
  pointer(window, "pointerup");
  vi.advanceTimersByTime(1000);
  expect(onHold).not.toHaveBeenCalled();
});

test("movement past the threshold cancels for good, including out-and-back and coalesced samples", () => {
  const { element, onHold } = setup();
  pointer(element, "pointerdown");
  pointer(window, "pointermove", 1, { clientX: 159 });
  pointer(window, "pointermove", 1);
  vi.advanceTimersByTime(600);
  pointer(window, "pointerup");
  pointer(element, "pointerdown");
  pointer(window, "pointermove", 1, {
    getCoalescedEvents: () => [{ clientX: 170, clientY: 50 }] as PointerEvent[],
  });
  vi.advanceTimersByTime(600);
  pointer(window, "pointerup");
  pointer(element, "pointerdown");
  pointer(window, "pointermove", 1, { clientX: Number.NaN });
  vi.advanceTimersByTime(600);
  pointer(window, "pointerup");
  pointer(element, "pointerdown", 1, { pointerType: "mouse" });
  pointer(window, "pointermove", 1, { pointerType: "mouse", buttons: 0 });
  vi.advanceTimersByTime(600);
  pointer(window, "pointerup", 1, { pointerType: "mouse" });
  expect(onHold).not.toHaveBeenCalled();
  pointer(element, "pointerdown", 1, { pointerType: "mouse" });
  pointer(window, "pointermove", 1, { pointerType: "mouse", clientX: 158 });
  pointer(window, "pointermove", 99, { clientX: 0 });
  vi.advanceTimersByTime(500);
  expect(onHold).toHaveBeenCalledTimes(1);
  expect(onHold.mock.calls[0][0].pointerType).toBe("mouse");
});

test("pointer cancel, capture loss, blur, reset and disposal discard a held press and its timer", () => {
  const { element, input, onHold } = setup();
  for (const type of ["pointercancel", "lostpointercapture"]) {
    pointer(element, "pointerdown");
    pointer(window, type, 99);
    pointer(window, type);
    vi.advanceTimersByTime(600);
  }
  pointer(element, "pointerdown");
  window.dispatchEvent(new Event("blur"));
  vi.advanceTimersByTime(600);
  pointer(element, "pointerdown");
  input.reset();
  vi.advanceTimersByTime(600);
  pointer(element, "pointerdown");
  input.dispose();
  input.dispose();
  vi.advanceTimersByTime(600);
  pointer(element, "pointerdown");
  vi.advanceTimersByTime(600);
  expect(onHold).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test("a focused control blurred by the very press being held does not discard the hold", () => {
  const { element, onHold } = setup();
  const control = document.createElement("button");
  element.append(control);
  pointer(element, "pointerdown", 1, { pointerType: "mouse" });
  control.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
  vi.advanceTimersByTime(500);
  expect(onHold).toHaveBeenCalledTimes(1);
});

test("two overlapping eligible presses cancel each other; a press outside the region is independent", () => {
  const { element, onHold } = setup({ claimArea: claimWidthFraction("right", 0.5) });
  pointer(element, "pointerdown", 1, { clientX: 20, isPrimary: true });
  pointer(element, "pointerdown", 2);
  vi.advanceTimersByTime(600);
  expect(onHold).toHaveBeenCalledTimes(1);
  expect(onHold.mock.calls[0][0].pointerId).toBe(2);
  pointer(window, "pointerup", 1, { clientX: 20 });
  pointer(window, "pointerup", 2);
  onHold.mockClear();
  pointer(element, "pointerdown", 3);
  pointer(element, "pointerdown", 4);
  vi.advanceTimersByTime(600);
  pointer(window, "pointerup", 3);
  pointer(window, "pointerup", 4);
  pointer(element, "pointerdown", 5);
  pointer(element, "pointerdown", 5);
  vi.advanceTimersByTime(600);
  pointer(window, "pointerup", 5);
  expect(onHold).not.toHaveBeenCalled();
  pointer(element, "pointerdown", 6);
  vi.advanceTimersByTime(600);
  expect(onHold).toHaveBeenCalledTimes(1);
});

test("target is decided once at press, travels with the hold, and null leaves the press alone", () => {
  let found: { id: string } | null | undefined = { id: "first" };
  const target = vi.fn(() => found);
  const { element, onHold } = setup({ target });
  pointer(element, "pointerdown", 1);
  found = { id: "moved-away" };
  vi.advanceTimersByTime(500);
  expect(onHold.mock.calls[0][0].target).toEqual({ id: "first" });
  expect(target).toHaveBeenCalledTimes(1);
  expect(target.mock.calls[0]).toEqual([expect.objectContaining({ type: "pointerdown" }), rect]);
  // A press with no target neither holds nor cancels the hold already running.
  found = undefined;
  pointer(window, "pointerup", 1);
  found = { id: "second" };
  pointer(element, "pointerdown", 2);
  found = null;
  pointer(element, "pointerdown", 3);
  vi.advanceTimersByTime(500);
  expect(onHold).toHaveBeenCalledTimes(2);
  expect(onHold.mock.calls[1][0]).toMatchObject({ pointerId: 2, target: { id: "second" } });
  pointer(window, "pointerup", 3);
  pointer(window, "pointerup", 2);
  found = undefined;
  pointer(element, "pointerdown", 4);
  vi.advanceTimersByTime(500);
  expect(onHold).toHaveBeenCalledTimes(2);
});

test("controls, unknown devices, other buttons, outside, detached and zero-sized hosts never hold", () => {
  const { element, onHold } = setup();
  for (const name of ["button", "input", "a", "textarea", "select", "summary"]) {
    const control = document.createElement(name);
    element.append(control);
    pointer(control, "pointerdown");
  }
  const marked = document.createElement("div");
  marked.setAttribute("data-joystick-ignore", "true");
  element.append(marked);
  pointer(marked, "pointerdown");
  pointer(element, "pointerdown", 1, { pointerType: "unknown" });
  pointer(element, "pointerdown", 1, { pointerType: "mouse", button: 2 });
  pointer(element, "pointerdown", 1, { clientX: 201 });
  element.getBoundingClientRect = () => ({ ...rect, height: 0 }) as DOMRect;
  pointer(element, "pointerdown");
  element.getBoundingClientRect = () => rect as DOMRect;
  element.remove();
  pointer(element, "pointerdown");
  vi.advanceTimersByTime(1000);
  expect(onHold).not.toHaveBeenCalled();
});

test("locked mouse movement counts toward the threshold while client coordinates stay fixed", () => {
  const { element, onHold } = setup();
  let locked: Element | null = null;
  Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => locked });
  const mouse = (movementX: number) =>
    document.dispatchEvent(
      Object.assign(new Event("mousemove"), { movementX, movementY: 0, buttons: 1 })
    );
  pointer(element, "pointerdown", 1, { pointerType: "mouse" });
  locked = element;
  document.dispatchEvent(new Event("pointerlockchange"));
  vi.advanceTimersByTime(600);
  pointer(window, "pointerup", 1, { pointerType: "mouse" });
  expect(onHold).not.toHaveBeenCalled();
  pointer(element, "pointerdown", 1, { pointerType: "mouse" });
  mouse(5);
  mouse(5);
  vi.advanceTimersByTime(600);
  expect(onHold).not.toHaveBeenCalled();
  pointer(window, "pointerup", 1, { pointerType: "mouse" });
  pointer(element, "pointerdown", 1, { pointerType: "mouse" });
  mouse(4);
  vi.advanceTimersByTime(500);
  expect(onHold).toHaveBeenCalledTimes(1);
  locked = null;
});

test("a hold takes no pointer: ownership, look and a following tap are untouched", () => {
  const ownership = createPointerOwnership();
  const { element, onHold } = setup();
  const look = createLookInput({ element, ownership, onChange() {} });
  const onTap = vi.fn();
  const tap = createTapInput({ element, onTap });
  disposals.push(look.dispose, tap.dispose);
  const down = pointer(element, "pointerdown", 4);
  expect(ownership.ownerOf(4)).toMatch(/^look-/);
  vi.advanceTimersByTime(500);
  expect(onHold).toHaveBeenCalledTimes(1);
  expect(ownership.ownerOf(4)).toMatch(/^look-/);
  expect(down.defaultPrevented).toBe(true); // look's own, not the hold's
  pointer(window, "pointerup", 4);
  expect(onTap).toHaveBeenCalledTimes(1);
});

test("a pointer claimed under an ignored owner is never held, and cancels no other hold", () => {
  const ownership = createPointerOwnership();
  const { element, onHold } = setup({ ownership, ignoreOwners: ["run"] });
  ownership.claim(1, "run");
  ownership.claim(2, "stick");
  pointer(element, "pointerdown", 1);
  vi.advanceTimersByTime(600);
  expect(onHold).not.toHaveBeenCalled();
  pointer(element, "pointerdown", 2);
  pointer(element, "pointerdown", 1);
  pointer(element, "pointerdown", 3, { clientX: 100 });
  pointer(window, "pointerup", 3);
  vi.advanceTimersByTime(600);
  expect(onHold).not.toHaveBeenCalled();
  pointer(window, "pointerup", 2);
  pointer(element, "pointerdown", 2);
  vi.advanceTimersByTime(600);
  expect(onHold.mock.calls.map(([hold]) => hold.pointerId)).toEqual([2]);
});

test("a tap with a maximum duration is not reported after a hold has fired", () => {
  const { element, onHold } = setup();
  const onTap = vi.fn();
  const tap = createTapInput({ element, onTap, maxDuration: 400 });
  disposals.push(tap.dispose);
  pointer(element, "pointerdown");
  vi.advanceTimersByTime(500);
  pointer(window, "pointerup");
  expect(onHold).toHaveBeenCalledTimes(1);
  expect(onTap).not.toHaveBeenCalled();
  pointer(element, "pointerdown");
  vi.advanceTimersByTime(399);
  pointer(window, "pointerup");
  expect(onHold).toHaveBeenCalledTimes(1);
  expect(onTap).toHaveBeenCalledTimes(1);
});

test("invalid options fail before attachment", () => {
  const { element, onHold } = setup();
  for (const holdMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => createPressHoldInput({ element, onHold, holdMs })).toThrow(RangeError);
  }
  for (const maxDistance of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => createPressHoldInput({ element, onHold, maxDistance })).toThrow(RangeError);
  }
  const detached = document.implementation.createHTMLDocument().createElement("div");
  expect(() => createPressHoldInput({ element: detached, onHold })).toThrow("window");
});
