import { afterEach, expect, test, vi } from "vitest";
import { claimWidthFraction } from "../src/claimArea";
import { createLookInput } from "../src/lookInput";
import { createPointerOwnership } from "../src/pointerOwnership";
import { createTapInput, type TapInputOptions } from "../src/tapInput";

const disposals: Array<() => void> = [];
const rect = { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 };
function setup(options: Partial<TapInputOptions> = {}) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => rect as DOMRect;
  document.body.append(element);
  const onTap = vi.fn();
  const input = createTapInput({ element, onTap, ...options });
  disposals.push(() => {
    input.dispose();
    element.remove();
  });
  return { input, element, onTap };
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

test("stationary mouse, touch and pen deliver the original up once without claiming or preventing", () => {
  const { element, onTap } = setup();
  for (const pointerType of ["mouse", "touch", "pen"]) {
    const down = pointer(element, "pointerdown", 1, { pointerType });
    const up = pointer(element, "pointerup", 1, { pointerType });
    expect(onTap).toHaveBeenLastCalledWith(up);
    expect(down.defaultPrevented).toBe(false);
    expect(up.defaultPrevented).toBe(false);
    pointer(element, "pointerup", 1, { pointerType });
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
  expect(onTap).toHaveBeenCalledTimes(3);
});

test("maximum excursion includes out-and-back, coalesced samples and final up", () => {
  const { element, onTap } = setup();
  pointer(element, "pointerdown");
  pointer(window, "pointermove", 1, { clientX: 159 });
  pointer(window, "pointermove");
  pointer(window, "pointerup");
  expect(onTap).not.toHaveBeenCalled();
  pointer(element, "pointerdown");
  pointer(window, "pointermove", 1, {
    getCoalescedEvents: () => [{ clientX: 170, clientY: 50 }] as PointerEvent[],
  });
  pointer(window, "pointerup");
  expect(onTap).not.toHaveBeenCalled();
  pointer(element, "pointerdown");
  pointer(window, "pointerup", 1, { clientX: 159 });
  expect(onTap).not.toHaveBeenCalled();
  pointer(element, "pointerdown");
  pointer(window, "pointermove", 1, { clientX: 158, getCoalescedEvents: () => [] });
  pointer(window, "pointerup", 1, { clientX: 158 });
  expect(onTap).toHaveBeenCalledTimes(1);
  pointer(window, "pointermove", 99);
});

test("only overlapping eligible tap-region pointers suppress taps; a movement finger remains independent", () => {
  const { element, onTap } = setup({ claimArea: claimWidthFraction("right", 0.5) });
  pointer(element, "pointerdown", 1, { clientX: 20, isPrimary: true });
  pointer(element, "pointerdown", 2, { isPrimary: false });
  pointer(window, "pointerup", 2);
  expect(onTap).toHaveBeenCalledTimes(1);
  pointer(window, "pointerup", 1, { clientX: 20 });
  pointer(element, "pointerdown", 3);
  pointer(element, "pointerdown", 4);
  pointer(window, "pointerup", 3);
  pointer(window, "pointerup", 4);
  expect(onTap).toHaveBeenCalledTimes(1);
  pointer(element, "pointerdown", 5);
  pointer(element, "pointerdown", 5);
  pointer(window, "pointerup", 5);
  expect(onTap).toHaveBeenCalledTimes(1);
  pointer(element, "pointerdown", 6);
  pointer(window, "pointerup", 6);
  expect(onTap).toHaveBeenCalledTimes(2);
});

test("cancel, capture loss, blur, explicit overlay reset and disposal discard held input", () => {
  const { element, input, onTap } = setup();
  for (const type of ["pointercancel", "lostpointercapture"]) {
    pointer(element, "pointerdown");
    pointer(window, type, 99);
    pointer(element, type);
    pointer(window, "pointerup");
  }
  pointer(element, "pointerdown");
  window.dispatchEvent(new Event("blur"));
  pointer(window, "pointerup");
  pointer(element, "pointerdown");
  input.reset();
  pointer(window, "pointerup");
  pointer(element, "pointerdown");
  input.dispose();
  input.dispose();
  pointer(window, "pointerup");
  pointer(element, "pointerdown");
  pointer(window, "pointerup");
  expect(onTap).not.toHaveBeenCalled();
});

test("UI controls, unknown devices, other mouse buttons and live claim-area rejection cannot tap", () => {
  let allowed = true;
  const { element, onTap } = setup({ claimArea: () => allowed });
  for (const name of ["button", "input", "a", "textarea", "select", "summary"]) {
    const control = document.createElement(name);
    element.append(control);
    pointer(control, "pointerdown");
    pointer(control, "pointerup");
  }
  for (const attribute of ["role", "contenteditable", "data-joystick-ignore"]) {
    const control = document.createElement("div");
    control.setAttribute(attribute, attribute === "role" ? "button" : "true");
    element.append(control);
    pointer(control, "pointerdown");
    pointer(control, "pointerup");
  }
  pointer(element, "pointerdown", 1, { pointerType: "unknown" });
  pointer(window, "pointerup");
  pointer(element, "pointerdown", 1, { pointerType: "mouse", button: 2 });
  pointer(window, "pointerup");
  pointer(element, "pointerdown", 1, { pointerType: "mouse" });
  pointer(window, "pointermove", 1, { pointerType: "mouse", buttons: 0 });
  pointer(window, "pointerup", 1, { pointerType: "mouse" });
  pointer(element, "pointerdown");
  pointer(window, "pointerup", 1, { button: 2 });
  pointer(element, "pointerdown");
  allowed = false;
  pointer(window, "pointerup");
  allowed = true;
  const button = document.createElement("button");
  element.append(button);
  pointer(element, "pointerdown");
  pointer(button, "pointerup");
  expect(onTap).not.toHaveBeenCalled();
});

test("zero-sized, detached and outside hosts and nonfinite motion cannot produce tap", () => {
  const { element, onTap } = setup();
  for (const [clientX, clientY] of [
    [-1, 50],
    [201, 50],
    [150, -1],
    [150, 101],
  ]) {
    pointer(element, "pointerdown", 1, { clientX, clientY });
    pointer(window, "pointerup");
  }
  for (const dimensions of [{ width: 0 }, { height: 0 }]) {
    element.getBoundingClientRect = () => ({ ...rect, ...dimensions }) as DOMRect;
    pointer(element, "pointerdown");
    pointer(window, "pointerup");
  }
  element.getBoundingClientRect = () => rect as DOMRect;
  pointer(element, "pointerdown");
  pointer(window, "pointermove", 1, { clientX: Number.NaN });
  pointer(window, "pointerup");
  pointer(element, "pointerdown");
  pointer(window, "pointerup", 1, { clientX: Number.NaN });
  pointer(element, "pointerdown");
  pointer(window, "pointerup", 1, { clientX: 201 });
  pointer(element, "pointerdown");
  element.remove();
  pointer(window, "pointerup");
  pointer(element, "pointerdown");
  expect(onTap).not.toHaveBeenCalled();
});

test("zero threshold accepts no movement and invalid options fail before attachment", () => {
  const { element, onTap } = setup({ maxDistance: 0 });
  pointer(element, "pointerdown");
  pointer(window, "pointerup");
  expect(onTap).toHaveBeenCalledTimes(1);
  pointer(element, "pointerdown");
  pointer(window, "pointermove", 1, { clientY: 50.01 });
  pointer(window, "pointerup");
  expect(onTap).toHaveBeenCalledTimes(1);
  for (const maxDistance of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => createTapInput({ element, onTap, maxDistance })).toThrow(RangeError);
  }
  const detached = document.implementation.createHTMLDocument().createElement("div");
  expect(() => createTapInput({ element: detached, onTap })).toThrow("window");
});

test("look ownership and synchronous pointerup capture release coexist in either registration order", () => {
  for (const tapFirst of [false, true]) {
    const ownership = createPointerOwnership();
    const { element, input, onTap } = setup();
    let tap = input;
    if (!tapFirst) tap.dispose();
    const look = createLookInput({
      element,
      ownership,
      allowMouseDrag: true,
      claimArea: claimWidthFraction("right", 0.5),
      onChange() {},
    });
    disposals.push(look.dispose);
    if (!tapFirst) {
      tap = createTapInput({ element, onTap });
      disposals.push(tap.dispose);
    }
    element.setPointerCapture = vi.fn();
    element.hasPointerCapture = () => true;
    element.releasePointerCapture = (id) => {
      pointer(element, "lostpointercapture", id);
    };
    pointer(element, "pointerdown", 2, { pointerType: "mouse" });
    expect(ownership.ownerOf(2)).toBeDefined();
    pointer(element, "pointerup", 2, { pointerType: "mouse" });
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(ownership.ownerOf(2)).toBeUndefined();
    pointer(element, "pointerdown", 3);
    pointer(window, "pointermove", 3, { clientX: 170 });
    pointer(element, "pointerup", 3);
    expect(onTap).toHaveBeenCalledTimes(1);
    tap.dispose();
    look.dispose();
  }
});
