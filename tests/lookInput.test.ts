import { afterEach, expect, test, vi } from "vitest";
import { claimWidthFraction } from "../src/claimArea";
import { createLookInput } from "../src/lookInput";
import { createPointerOwnership } from "../src/pointerOwnership";

const disposals: Array<() => void> = [];
let locked: Element | null = null;
function setup(options: Partial<Parameters<typeof createLookInput>[0]> = {}) {
  const element = document.createElement("div");
  document.body.append(element);
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 }) as DOMRect;
  const request = vi.fn(() => Promise.resolve());
  element.requestPointerLock = request;
  const onChange = vi.fn();
  const onReset = vi.fn();
  const onLockChange = vi.fn();
  const onLockError = vi.fn();
  Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => locked });
  document.exitPointerLock = vi.fn(() => {
    locked = null;
    document.dispatchEvent(new Event("pointerlockchange"));
  });
  const input = createLookInput({
    element,
    owner: "look",
    onChange,
    onReset,
    onLockChange,
    onLockError,
    ...options,
  });
  disposals.push(() => {
    input.dispose();
    element.remove();
  });
  return { element, request, input, onChange, onReset, onLockChange, onLockError };
}
function lock(element: Element | null) {
  locked = element;
  document.dispatchEvent(new Event("pointerlockchange"));
}
function pointer(
  target: EventTarget,
  type: string,
  pointerId: number,
  x = 150,
  y = 50,
  pointerType = "touch"
) {
  target.dispatchEvent(
    Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      pointerId,
      clientX: x,
      clientY: y,
      pointerType,
      button: 0,
    })
  );
}
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  locked = null;
  vi.restoreAllMocks();
});

test("only an explicit request asks for lock; locked mouse deltas allow unlimited yaw and clamp pitch", async () => {
  const { element, request, input, onChange, onLockChange } = setup({
    sensitivity: 1,
    pitchLimit: 1,
  });
  pointer(element, "pointerdown", 1, 150, 50, "mouse");
  document.dispatchEvent(Object.assign(new Event("mousemove"), { movementX: 20, movementY: 20 }));
  expect(request).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  const pending = input.requestPointerLock();
  expect(input.requestPointerLock()).toBe(pending);
  expect(request).toHaveBeenCalledTimes(1);
  lock(element);
  expect(await pending).toBe(true);
  document.dispatchEvent(Object.assign(new Event("mousemove"), { movementX: 40, movementY: 20 }));
  expect(input.getState()).toEqual({ yaw: -40, pitch: -1, locked: true });
  document.dispatchEvent(
    Object.assign(new Event("mousemove"), { movementX: -100, movementY: -20 })
  );
  expect(input.getState()).toEqual({ yaw: 60, pitch: 1, locked: true });
  expect(onLockChange).toHaveBeenLastCalledWith(true);
  expect(await input.requestPointerLock()).toBe(true);
});

test("denial, thrown requests and unavailable pointer lock fail closed and allow retry", async () => {
  const { input, request, onReset, onLockError } = setup();
  const pending = input.requestPointerLock();
  document.dispatchEvent(new Event("pointerlockerror"));
  expect(await pending).toBe(false);
  expect(onReset).toHaveBeenCalledTimes(1);
  request.mockRejectedValueOnce(new Error("denied"));
  expect(await input.requestPointerLock()).toBe(false);
  request.mockImplementationOnce(() => {
    throw new Error("denied");
  });
  expect(await input.requestPointerLock()).toBe(false);
  expect(onLockError).toHaveBeenCalledTimes(3);
  const { element, input: unsupported } = setup();
  Object.defineProperty(element, "requestPointerLock", { value: undefined });
  expect(await unsupported.requestPointerLock()).toBe(false);
});

test("Escape and lock loss clear held input without resetting heading or claiming another instance's lock", async () => {
  const a = setup({ initial: { yaw: 8, pitch: 0.2 } });
  const b = setup();
  const pending = a.input.requestPointerLock();
  lock(a.element);
  await pending;
  expect(b.onReset).not.toHaveBeenCalled();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(a.input.getState()).toEqual({ yaw: 8, pitch: 0.2, locked: false });
  expect(a.onReset).toHaveBeenCalled();
  expect(b.onReset).not.toHaveBeenCalled();
  const second = a.input.requestPointerLock();
  lock(a.element);
  await second;
  lock(b.element);
  expect(a.onLockChange).toHaveBeenLastCalledWith(false);
  expect(b.input.getState().locked).toBe(true);
  a.input.dispose();
  expect(document.pointerLockElement).toBe(b.element);
});

test("independent touch owners cancel only their own gestures and released claims stop look", () => {
  const ownership = createPointerOwnership();
  const { element, input, onChange } = setup({
    ownership,
    claimArea: claimWidthFraction("right", 0.5),
  });
  ownership.claim(1, "move");
  pointer(element, "pointerdown", 1);
  pointer(element, "pointerdown", 2, 30);
  pointer(element, "pointerdown", 2);
  pointer(element, "pointerdown", 3);
  pointer(window, "pointermove", 3, 180);
  expect(onChange).not.toHaveBeenCalled();
  pointer(window, "pointermove", 2, 160, 60);
  expect(input.getState().yaw).toBeCloseTo(-0.02);
  pointer(window, "pointercancel", 1);
  expect(ownership.ownerOf(2)).toBe("look");
  pointer(window, "pointermove", 2, 170, 60);
  expect(input.getState().yaw).toBeCloseTo(-0.04);
  pointer(window, "pointercancel", 2);
  pointer(window, "pointermove", 2, 180);
  expect(input.getState().yaw).toBeCloseTo(-0.04);
  pointer(element, "pointerdown", 4);
  ownership.release(4, "look");
  pointer(window, "pointermove", 4, 190);
  expect(input.getState().yaw).toBeCloseTo(-0.04);
});

test("host boundaries, controls, pen and buttons are respected; blur/reset/dispose release only look", () => {
  const ownership = createPointerOwnership();
  const { element, input, onChange } = setup({ ownership });
  const button = document.createElement("button");
  element.append(button);
  pointer(button, "pointerdown", 1);
  pointer(element, "pointerdown", 1, -1);
  pointer(element, "pointerdown", 1, 201);
  pointer(element, "pointerdown", 1, 150, -1);
  pointer(element, "pointerdown", 1, 150, 101);
  pointer(element, "pointerdown", 1, 150, 50, "pen");
  expect(ownership.ownerOf(1)).toBeUndefined();
  pointer(element, "pointerdown", 2);
  ownership.claim(3, "move");
  input.reset();
  expect(ownership.ownerOf(2)).toBeUndefined();
  expect(ownership.ownerOf(3)).toBe("move");
  pointer(element, "pointerdown", 4);
  pointer(window, "pointerup", 99);
  pointer(window, "pointerup", 4);
  pointer(element, "pointerdown", 5);
  window.dispatchEvent(new Event("blur"));
  expect(ownership.ownerOf(5)).toBeUndefined();
  pointer(element, "pointerdown", 6);
  input.dispose();
  input.dispose();
  pointer(element, "pointerdown", 7);
  pointer(window, "pointermove", 6, 190);
  expect(onChange).not.toHaveBeenCalled();
});

test("pending acquisition cancelled by reset/dispose releases late lock and never reports success", async () => {
  const a = setup();
  const pending = a.input.requestPointerLock();
  a.input.reset();
  lock(a.element);
  expect(await pending).toBe(false);
  expect(locked).toBeNull();
  const b = setup();
  const second = b.input.requestPointerLock();
  b.input.dispose();
  lock(b.element);
  expect(await second).toBe(false);
  expect(locked).toBeNull();
  expect(await b.input.requestPointerLock()).toBe(false);
});

test("another instance's lock and errors do not disturb an idle controller", async () => {
  const a = setup();
  const b = setup();
  document.dispatchEvent(new Event("pointerlockerror"));
  const pending = a.input.requestPointerLock();
  lock(b.element);
  expect(await pending).toBe(false);
  expect(b.onLockError).not.toHaveBeenCalled();
  expect(b.onReset).not.toHaveBeenCalled();
});

test("configuration rejects invalid numeric data and documents without a window", () => {
  const element = document.createElement("div");
  const base = { element, onChange() {} };
  for (const sensitivity of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => createLookInput({ ...base, sensitivity })).toThrow(RangeError);
  }
  for (const pitchLimit of [0, 2, Number.NaN]) {
    expect(() => createLookInput({ ...base, pitchLimit })).toThrow(RangeError);
  }
  for (const initial of [
    { yaw: Number.NaN, pitch: 0 },
    { yaw: 0, pitch: Number.NaN },
  ]) {
    expect(() => createLookInput({ ...base, initial })).toThrow(RangeError);
  }
  const detached = document.implementation.createHTMLDocument().createElement("div");
  expect(() => createLookInput({ ...base, element: detached })).toThrow("window");
});

test("invalid movement is ignored and Escape cancels touch without another lock", () => {
  const { input, element, onChange } = setup();
  pointer(element, "pointerdown", 1);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  pointer(window, "pointermove", 1, 190);
  expect(onChange).not.toHaveBeenCalled();
  lock(element);
  for (const [movementX, movementY] of [
    [Number.NaN, 0],
    [0, Number.NaN],
  ]) {
    document.dispatchEvent(Object.assign(new Event("mousemove"), { movementX, movementY }));
  }
  expect(onChange).not.toHaveBeenCalled();
  window.dispatchEvent(new Event("blur"));
  expect(input.getState().locked).toBe(false);
});

test("cancelled requests that reject after disposal settle without notifying errors", async () => {
  const { input, request, onLockError } = setup();
  let reject!: (reason: Error) => void;
  request.mockImplementation(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      })
  );
  const pending = input.requestPointerLock();
  input.dispose();
  reject(new Error("denied"));
  expect(await pending).toBe(false);
  expect(onLockError).not.toHaveBeenCalled();
});

test("a stale rejection cannot reject a later acquisition", async () => {
  const { input, request, element } = setup();
  let reject!: (reason: Error) => void;
  request.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      })
  );
  const first = input.requestPointerLock();
  document.dispatchEvent(new Event("pointerlockerror"));
  expect(await first).toBe(false);
  const second = input.requestPointerLock();
  reject(new Error("old request"));
  await Promise.resolve();
  lock(element);
  expect(await second).toBe(true);
});

test("generated owner names isolate look controllers sharing one registry", () => {
  const ownership = createPointerOwnership();
  const a = setup({ ownership, owner: undefined });
  const b = setup({ ownership, owner: undefined });
  pointer(a.element, "pointerdown", 1);
  pointer(b.element, "pointerdown", 1);
  pointer(window, "pointermove", 1, 180);
  expect(a.onChange).toHaveBeenCalledTimes(1);
  expect(b.onChange).not.toHaveBeenCalled();
});
