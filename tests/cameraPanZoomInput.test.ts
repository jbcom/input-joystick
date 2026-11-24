import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_WHEEL_STEP } from "../src/cameraGesture";
import {
  type CameraGestureChange,
  type CameraGestureEnd,
  createCameraPanZoomInput,
} from "../src/cameraPanZoomInput";
import { claimWidthFraction } from "../src/claimArea";
import { createPointerOwnership } from "../src/pointerOwnership";

// The host sits away from the page origin so element-local anchors are not client coordinates.
const rect = { left: 10, top: 20, right: 310, bottom: 220, width: 300, height: 200 };
const win = document.defaultView as Window & typeof globalThis;

const disposals: Array<() => void> = [];
let observers: Array<{ callback: () => void; disconnect: ReturnType<typeof vi.fn> }> = [];
const nativeObserver = Object.getOwnPropertyDescriptor(win, "ResizeObserver");

function installResizeObserver(present: boolean) {
  Object.defineProperty(win, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: present
      ? class {
          disconnect = vi.fn();
          constructor(callback: () => void) {
            observers.push({ callback, disconnect: this.disconnect });
          }
          observe() {}
        }
      : undefined,
  });
}

function setup(
  options: Partial<Parameters<typeof createCameraPanZoomInput>[0]> & { observer?: boolean } = {}
) {
  const { observer = true, ...rest } = options;
  installResizeObserver(observer);
  const element = document.createElement("div");
  document.body.append(element);
  element.getBoundingClientRect = () => ({ ...rect }) as DOMRect;
  const captured = new Set<number>();
  element.setPointerCapture = vi.fn((id: number) => {
    captured.add(id);
  });
  element.hasPointerCapture = vi.fn((id: number) => captured.has(id));
  element.releasePointerCapture = vi.fn((id: number) => {
    captured.delete(id);
  });
  const changes: CameraGestureChange[] = [];
  const onChange = vi.fn((change: CameraGestureChange) => {
    changes.push(change);
  });
  const ends: CameraGestureEnd[] = [];
  const onEnd = vi.fn((reason: CameraGestureEnd) => {
    ends.push(reason);
  });
  const input = createCameraPanZoomInput({
    element,
    owner: "camera",
    onChange,
    onEnd,
    ...rest,
  });
  disposals.push(() => {
    input.dispose();
    element.remove();
  });
  return { element, input, onChange, onEnd, changes, ends, captured };
}

function pointer(
  target: EventTarget,
  type: string,
  pointerId: number,
  x = 100,
  y = 100,
  pointerType = "touch",
  extra: Record<string, unknown> = {}
) {
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerId,
    clientX: x,
    clientY: y,
    pointerType,
    button: 0,
    buttons: type === "pointermove" ? 1 : 0,
    ...extra,
  });
  target.dispatchEvent(event);
  return event;
}

function wheel(
  target: EventTarget,
  deltaY: number,
  deltaMode = 0,
  x = 110,
  y = 120,
  extra: Record<string, unknown> = {}
) {
  const event = Object.assign(new Event("wheel", { bubbles: true, cancelable: true }), {
    deltaY,
    deltaMode,
    clientX: x,
    clientY: y,
    ...extra,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  observers = [];
  if (nativeObserver) Object.defineProperty(win, "ResizeObserver", nativeObserver);
  else Reflect.deleteProperty(win, "ResizeObserver");
  vi.restoreAllMocks();
});

test("one finger pans by its displacement, reported at its element-local position", () => {
  const { element, changes, ends, onEnd } = setup();
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(win, "pointermove", 1, 112, 95);
  pointer(win, "pointermove", 1, 112, 105);
  expect(changes).toEqual([
    { source: "drag", pan: { x: 12, y: -5 }, scale: 1, twist: 0, anchor: { x: 102, y: 75 } },
    { source: "drag", pan: { x: 0, y: 10 }, scale: 1, twist: 0, anchor: { x: 102, y: 85 } },
  ]);
  expect(onEnd).not.toHaveBeenCalled();
  pointer(win, "pointerup", 1, 112, 105);
  expect(ends).toEqual(["release"]);
  pointer(win, "pointermove", 1, 140, 105);
  expect(changes).toHaveLength(2);
});

test("onEnd is optional", () => {
  const { element, onChange } = setup({ onEnd: undefined });
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(win, "pointermove", 1, 110, 100);
  pointer(win, "pointerup", 1);
  expect(onChange).toHaveBeenCalledTimes(1);
});

test("a pan can be rebuilt as the pointer's previous position from anchor minus pan", () => {
  const { element, changes } = setup();
  pointer(element, "pointerdown", 1, 60, 70);
  pointer(win, "pointermove", 1, 75, 90);
  const [change] = changes;
  expect({ x: change.anchor.x - change.pan.x, y: change.anchor.y - change.pan.y }).toEqual({
    x: 60 - rect.left,
    y: 70 - rect.top,
  });
});

test("a move that changes nothing reports nothing, and non-finite positions are ignored", () => {
  const { element, onChange } = setup();
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(win, "pointermove", 1, 100, 100);
  pointer(win, "pointermove", 1, Number.NaN, 100);
  pointer(win, "pointermove", 1, 100, Number.POSITIVE_INFINITY);
  expect(onChange).not.toHaveBeenCalled();
  pointer(win, "pointermove", 1, 101, 100);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0].pan).toEqual({ x: 1, y: 0 });
});

test("a claimed press and its moves are prevented so the page does not scroll or zoom", () => {
  const { element } = setup();
  expect(pointer(element, "pointerdown", 1).defaultPrevented).toBe(true);
  expect(pointer(win, "pointermove", 1, 120, 100).defaultPrevented).toBe(true);
  expect(pointer(element, "pointerdown", 2, 5, 5).defaultPrevented).toBe(false);
});

test("two fingers emit midpoint pan, pinch scale and twist about the new midpoint", () => {
  const { element, changes } = setup();
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "pointerdown", 2, 140, 100);
  expect(changes).toEqual([]);
  // Finger 2 swings round to straight below finger 1 and the pair spreads from 40 to 80 pixels.
  pointer(win, "pointermove", 2, 100, 180);
  expect(changes).toHaveLength(1);
  const [pinch] = changes;
  expect(pinch.source).toBe("pinch");
  expect(pinch.scale).toBe(2);
  expect(pinch.twist).toBeCloseTo(Math.PI / 2, 12);
  expect(pinch.pan).toEqual({ x: -20, y: 40 });
  expect(pinch.anchor).toEqual({ x: 100 - rect.left, y: 140 - rect.top });
  pointer(win, "pointermove", 1, 100, 100);
  expect(changes).toHaveLength(1);
});

test("a pure two-finger drag pans without scaling or twisting", () => {
  const { element, changes } = setup();
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "pointerdown", 2, 140, 100);
  pointer(win, "pointermove", 1, 110, 110);
  pointer(win, "pointermove", 2, 150, 110);
  const total = changes.reduce(
    (sum, change) => ({ x: sum.x + change.pan.x, y: sum.y + change.pan.y }),
    { x: 0, y: 0 }
  );
  expect(total).toEqual({ x: 10, y: 10 });
  // Each finger moves in turn, so each step wobbles, but the pair ends as it began.
  expect(changes.reduce((product, change) => product * change.scale, 1)).toBeCloseTo(1, 12);
  expect(changes.reduce((sum, change) => sum + change.twist, 0)).toBeCloseTo(0, 12);
});

test("a third finger is never claimed and never disturbs the pair", () => {
  const ownership = createPointerOwnership();
  const { element, changes } = setup({ ownership });
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "pointerdown", 2, 140, 100);
  pointer(element, "pointerdown", 3, 120, 120);
  expect(ownership.ownerOf(3)).toBeUndefined();
  pointer(win, "pointermove", 3, 200, 200);
  expect(changes).toEqual([]);
  pointer(win, "pointerup", 3);
  expect(ownership.ownerOf(1)).toBe("camera");
  expect(ownership.ownerOf(2)).toBe("camera");
});

test("lifting one finger of a pair carries on as a pan from where the other finger already is", () => {
  const { element, changes, ends, onEnd } = setup();
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "pointerdown", 2, 140, 100);
  pointer(win, "pointermove", 2, 150, 100);
  pointer(win, "pointerup", 1, 100, 100);
  expect(onEnd).not.toHaveBeenCalled();
  const before = changes.length;
  pointer(win, "pointermove", 2, 160, 108);
  expect(changes).toHaveLength(before + 1);
  expect(changes.at(-1)).toMatchObject({ source: "drag", pan: { x: 10, y: 8 }, scale: 1 });
  pointer(win, "pointerup", 2);
  expect(ends).toEqual(["release"]);
});

test("a finger can rejoin a drag as a new pair after the first pair ended", () => {
  const { element, changes } = setup();
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "pointerdown", 2, 140, 100);
  pointer(win, "pointerup", 2);
  pointer(element, "pointerdown", 3, 160, 100);
  pointer(win, "pointermove", 3, 180, 100);
  expect(changes.at(-1)?.source).toBe("pinch");
  expect(changes.at(-1)?.scale).toBeCloseTo(80 / 60, 12);
});

test("presses on controls, outside the host, by pen, or with another button are left alone", () => {
  const ownership = createPointerOwnership();
  const { element } = setup({ ownership });
  const button = document.createElement("button");
  element.append(button);
  const owned = (id: number) => ownership.ownerOf(id);
  pointer(button, "pointerdown", 1);
  pointer(element, "pointerdown", 2, rect.left - 1, 100);
  pointer(element, "pointerdown", 3, rect.right + 1, 100);
  pointer(element, "pointerdown", 4, 100, rect.top - 1);
  pointer(element, "pointerdown", 5, 100, rect.bottom + 1);
  pointer(element, "pointerdown", 6, 100, 100, "pen");
  pointer(element, "pointerdown", 7, 100, 100, "mouse");
  pointer(element, "pointerdown", 8, 100, 100, "touch", { button: 2 });
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) expect(owned(id), `pointer ${id}`).toBeUndefined();
});

test("a claim area leaves the other zone to the joystick, and a refused second finger leaves the first dragging", () => {
  const ownership = createPointerOwnership();
  const { element, changes } = setup({ ownership, claimArea: claimWidthFraction("right", 0.5) });
  // The stick holds pointer 1 in the left zone, as FloatingJoystick would.
  ownership.claim(1, "joystick");
  pointer(element, "pointerdown", 1, 60, 100);
  pointer(win, "pointermove", 1, 80, 100);
  expect(changes).toEqual([]);
  pointer(element, "pointerdown", 2, 250, 100);
  pointer(win, "pointermove", 2, 270, 100);
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({ source: "drag", pan: { x: 20, y: 0 } });
  // A second finger in the stick's zone is not the camera's, so the right finger keeps panning.
  pointer(element, "pointerdown", 3, 40, 100);
  expect(ownership.ownerOf(3)).toBeUndefined();
  pointer(win, "pointermove", 2, 290, 100);
  expect(changes).toHaveLength(2);
  expect(changes[1].source).toBe("drag");
  expect(ownership.ownerOf(1)).toBe("joystick");
});

test("a pointer another owner holds is never taken, and a refused finger leaves the first one panning", () => {
  const ownership = createPointerOwnership();
  const { element, changes } = setup({ ownership });
  pointer(element, "pointerdown", 1, 100, 100);
  ownership.claim(2, "station");
  pointer(element, "pointerdown", 2, 140, 100);
  pointer(win, "pointermove", 2, 200, 100);
  expect(changes).toEqual([]);
  pointer(win, "pointermove", 1, 105, 100);
  expect(changes).toHaveLength(1);
  expect(changes[0].source).toBe("drag");
  expect(ownership.ownerOf(2)).toBe("station");
});

test("a repeated press of a held pointer neither restarts nor duplicates its claim", () => {
  const { element, changes } = setup();
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "pointerdown", 1, 180, 100);
  pointer(win, "pointermove", 1, 110, 100);
  expect(changes).toHaveLength(1);
  expect(changes[0].pan).toEqual({ x: 10, y: 0 });
});

test("generated owner names keep two cameras sharing a registry from taking one pointer twice", () => {
  const ownership = createPointerOwnership();
  const a = setup({ ownership, owner: undefined });
  const b = setup({ ownership, owner: undefined });
  pointer(a.element, "pointerdown", 1, 100, 100);
  pointer(b.element, "pointerdown", 1, 100, 100);
  pointer(win, "pointermove", 1, 130, 100);
  expect(a.onChange).toHaveBeenCalledTimes(1);
  expect(b.onChange).not.toHaveBeenCalled();
});

test("pointercancel drops only that finger and reports a cancel when none are left", () => {
  const ownership = createPointerOwnership();
  const { element, changes, ends } = setup({ ownership });
  ownership.claim(9, "joystick");
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "pointerdown", 2, 140, 100);
  pointer(win, "pointercancel", 1);
  expect(ownership.ownerOf(1)).toBeUndefined();
  expect(ownership.ownerOf(2)).toBe("camera");
  expect(ownership.ownerOf(9)).toBe("joystick");
  expect(ends).toEqual([]);
  pointer(win, "pointermove", 1, 300, 100);
  expect(changes).toEqual([]);
  pointer(win, "pointercancel", 2);
  expect(ends).toEqual(["cancel"]);
  pointer(win, "pointercancel", 99);
  expect(ends).toEqual(["cancel"]);
});

test("lost pointer capture ends that contact as a cancel", () => {
  const ownership = createPointerOwnership();
  const { element, ends } = setup({ ownership });
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "lostpointercapture", 1);
  expect(ownership.ownerOf(1)).toBeUndefined();
  expect(ends).toEqual(["cancel"]);
});

test("window blur cancels every contact exactly once, even with the registry attached", () => {
  const ownership = createPointerOwnership();
  const detach = ownership.attach(win);
  const { element, ends, changes } = setup({ ownership });
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "pointerdown", 2, 140, 100);
  win.dispatchEvent(new Event("blur"));
  expect(ends).toEqual(["cancel"]);
  expect(ownership.ownerOf(1)).toBeUndefined();
  expect(ownership.ownerOf(2)).toBeUndefined();
  pointer(win, "pointermove", 1, 150, 100);
  expect(changes).toEqual([]);
  detach();
});

test("the attached registry's pointerup releases after the camera has seen a release, not a cancel", () => {
  const ownership = createPointerOwnership();
  const detach = ownership.attach(win);
  const { element, ends } = setup({ ownership });
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "pointerup", 1);
  expect(ends).toEqual(["release"]);
  expect(ownership.ownerOf(1)).toBeUndefined();
  detach();
});

test("a registry release of one contact mid-pinch drops exactly that contact", () => {
  const ownership = createPointerOwnership();
  const { element, changes, ends } = setup({ ownership });
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "pointerdown", 2, 140, 100);
  expect(ownership.release(1, "camera")).toBe(true);
  expect(ends).toEqual([]);
  pointer(win, "pointermove", 1, 160, 100);
  expect(changes).toEqual([]);
  pointer(win, "pointermove", 2, 150, 100);
  expect(changes).toHaveLength(1);
  expect(changes[0].source).toBe("drag");
  expect(ownership.release(2, "camera")).toBe(true);
  expect(ends).toEqual(["cancel"]);
});

test("another owner's release and clearing the registry mid-pinch end the gesture once", () => {
  const ownership = createPointerOwnership();
  const { element, ends } = setup({ ownership });
  ownership.claim(7, "station");
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "pointerdown", 2, 140, 100);
  ownership.release(7, "station");
  expect(ends).toEqual([]);
  ownership.clear();
  expect(ends).toEqual(["cancel"]);
});

test("a window resize or orientation change cancels a held gesture", () => {
  const { element, ends, changes } = setup();
  pointer(element, "pointerdown", 1, 100, 100);
  win.dispatchEvent(new Event("resize"));
  expect(ends).toEqual(["cancel"]);
  pointer(win, "pointermove", 1, 150, 100);
  expect(changes).toEqual([]);
  pointer(element, "pointerdown", 2, 100, 100);
  win.dispatchEvent(new Event("orientationchange"));
  expect(ends).toEqual(["cancel", "cancel"]);
});

test("the host changing size cancels a held gesture, but a notification with no change does not", () => {
  let size = { width: 300, height: 200 };
  const { element, ends } = setup();
  element.getBoundingClientRect = () => ({ ...rect, ...size }) as DOMRect;
  expect(observers).toHaveLength(1);
  pointer(element, "pointerdown", 1, 100, 100);
  observers[0].callback();
  expect(ends).toEqual([]);
  size = { width: 320, height: 200 };
  observers[0].callback();
  expect(ends).toEqual(["cancel"]);
  pointer(element, "pointerdown", 2, 100, 100);
  observers[0].callback();
  expect(ends).toEqual(["cancel"]);
  size = { width: 320, height: 180 };
  observers[0].callback();
  expect(ends).toEqual(["cancel", "cancel"]);
});

test("without ResizeObserver the window listeners still cover layout changes", () => {
  const { element, ends } = setup({ observer: false });
  expect(observers).toHaveLength(0);
  pointer(element, "pointerdown", 1, 100, 100);
  win.dispatchEvent(new Event("resize"));
  expect(ends).toEqual(["cancel"]);
});

test("a host removed from the document cancels at its next move", () => {
  const { element, ends, changes } = setup();
  pointer(element, "pointerdown", 1, 100, 100);
  element.remove();
  pointer(win, "pointermove", 1, 150, 100);
  expect(ends).toEqual(["cancel"]);
  expect(changes).toEqual([]);
});

test("reset cancels held gestures, keeps other owners and does nothing when idle", () => {
  const ownership = createPointerOwnership();
  const { element, input, ends } = setup({ ownership });
  input.reset();
  expect(ends).toEqual([]);
  ownership.claim(5, "joystick");
  pointer(element, "pointerdown", 1, 100, 100);
  pointer(element, "pointerdown", 2, 140, 100);
  input.reset();
  expect(ends).toEqual(["cancel"]);
  expect(ownership.ownerOf(1)).toBeUndefined();
  expect(ownership.ownerOf(2)).toBeUndefined();
  expect(ownership.ownerOf(5)).toBe("joystick");
});

test("dispose cancels, removes every listener, disconnects the observer and is safe to repeat", () => {
  const { element, input, ends, onChange } = setup({ allowMouseDrag: true, allowWheel: true });
  pointer(element, "pointerdown", 1, 100, 100);
  input.dispose();
  input.dispose();
  expect(ends).toEqual(["cancel"]);
  expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
  pointer(element, "pointerdown", 2, 100, 100);
  pointer(win, "pointermove", 1, 150, 100);
  wheel(element, -100);
  win.dispatchEvent(new Event("resize"));
  expect(onChange).not.toHaveBeenCalled();
  expect(ends).toEqual(["cancel"]);
});

test("a mouse drag is opt-in, captures the pointer and releases it on the way out", () => {
  const ownership = createPointerOwnership();
  const off = setup({ ownership });
  pointer(off.element, "pointerdown", 1, 100, 100, "mouse");
  expect(ownership.ownerOf(1)).toBeUndefined();
  const { element, changes, ends, captured } = setup({ ownership, allowMouseDrag: true });
  pointer(element, "pointerdown", 2, 100, 100, "mouse");
  expect(ownership.ownerOf(2)).toBe("camera");
  expect(captured.has(2)).toBe(true);
  pointer(win, "pointermove", 2, 130, 90, "mouse");
  expect(changes).toEqual([
    { source: "drag", pan: { x: 30, y: -10 }, scale: 1, twist: 0, anchor: { x: 120, y: 70 } },
  ]);
  pointer(win, "pointerup", 2, 130, 90, "mouse");
  expect(captured.size).toBe(0);
  expect(ends).toEqual(["release"]);
});

test("a mouse move with no button held ends the drag, and lost capture or cancel clear the capture", () => {
  const { element, ends, captured, changes } = setup({ allowMouseDrag: true });
  pointer(element, "pointerdown", 1, 100, 100, "mouse");
  pointer(win, "pointermove", 1, 130, 100, "mouse", { buttons: 0 });
  expect(changes).toEqual([]);
  expect(ends).toEqual(["release"]);
  expect(captured.size).toBe(0);
  pointer(element, "pointerdown", 2, 100, 100, "mouse");
  pointer(element, "lostpointercapture", 2, 100, 100, "mouse");
  expect(ends).toEqual(["release", "cancel"]);
  pointer(element, "pointerdown", 3, 100, 100, "mouse");
  pointer(win, "pointercancel", 3, 100, 100, "mouse");
  expect(ends).toEqual(["release", "cancel", "cancel"]);
  expect(captured.size).toBe(0);
});

test("a mouse drag is exclusive: touch and mouse never share one gesture", () => {
  const ownership = createPointerOwnership();
  const { element, changes } = setup({ ownership, allowMouseDrag: true });
  pointer(element, "pointerdown", 1, 100, 100, "mouse");
  pointer(element, "pointerdown", 2, 140, 100, "touch");
  expect(ownership.ownerOf(2)).toBeUndefined();
  pointer(win, "pointerup", 1, 100, 100, "mouse");
  pointer(element, "pointerdown", 3, 100, 100, "touch");
  pointer(element, "pointerdown", 4, 100, 100, "mouse");
  expect(ownership.ownerOf(4)).toBeUndefined();
  pointer(win, "pointermove", 3, 110, 100);
  expect(changes).toHaveLength(1);
  expect(changes[0].source).toBe("drag");
});

test("a mouse capture that throws releases the claim and starts nothing", () => {
  const ownership = createPointerOwnership();
  const { element, changes, onEnd } = setup({ ownership, allowMouseDrag: true });
  element.setPointerCapture = vi.fn(() => {
    throw new DOMException("Pointer ended", "NotFoundError");
  });
  pointer(element, "pointerdown", 1, 100, 100, "mouse");
  expect(ownership.ownerOf(1)).toBeUndefined();
  pointer(win, "pointermove", 1, 130, 100, "mouse");
  expect(changes).toEqual([]);
  expect(onEnd).not.toHaveBeenCalled();
});

test("a host without pointer capture methods still drags", () => {
  const { element, changes } = setup({ allowMouseDrag: true });
  Object.assign(element, {
    setPointerCapture: undefined,
    hasPointerCapture: undefined,
    releasePointerCapture: undefined,
  });
  pointer(element, "pointerdown", 1, 100, 100, "mouse");
  pointer(win, "pointermove", 1, 120, 100, "mouse");
  pointer(win, "pointerup", 1, 120, 100, "mouse");
  expect(changes).toHaveLength(1);
});

test("wheel input is opt-in and does not touch the page's scrolling until asked", () => {
  const { element, onChange } = setup();
  const event = wheel(element, -100);
  expect(event.defaultPrevented).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
});

test("the wheel zooms about the pointer: up zooms in, down zooms out, in the board camera's curve", () => {
  const { element, changes } = setup({ allowWheel: true });
  const up = wheel(element, -100, 0, 110, 120);
  wheel(element, 100, 0, 110, 120);
  expect(up.defaultPrevented).toBe(true);
  expect(changes[0]).toMatchObject({
    source: "wheel",
    pan: { x: 0, y: 0 },
    twist: 0,
    anchor: { x: 100, y: 100 },
  });
  expect(changes[0].scale).toBeGreaterThan(1);
  expect(1 / changes[0].scale).toBeCloseTo(DEFAULT_WHEEL_STEP ** -100, 12);
  expect(changes[1].scale).toBeLessThan(1);
  expect(changes[0].scale * changes[1].scale).toBeCloseTo(1, 12);
});

test("wheel deltas are normalised across line and page modes, using the host's height for a page", () => {
  const { element, changes } = setup({ allowWheel: true });
  wheel(element, 3, 1);
  wheel(element, -1, 2);
  expect(changes[0].scale).toBeCloseTo(DEFAULT_WHEEL_STEP ** -48, 12);
  expect(changes[1].scale).toBeCloseTo(DEFAULT_WHEEL_STEP ** rect.height, 12);
});

test("a custom wheel step changes the zoom rate", () => {
  const { element, changes } = setup({ allowWheel: true, wheelStep: 1.01 });
  wheel(element, -10);
  expect(changes[0].scale).toBeCloseTo(1.01 ** 10, 12);
});

test("wheel events that carry nothing, overflow, or land on a control are left to the page", () => {
  const { element, onChange } = setup({ allowWheel: true });
  const button = document.createElement("button");
  element.append(button);
  expect(wheel(element, 0).defaultPrevented).toBe(false);
  expect(wheel(element, Number.NaN).defaultPrevented).toBe(false);
  expect(wheel(element, 1e9).defaultPrevented).toBe(false);
  expect(wheel(button, -100).defaultPrevented).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
});

test("a wheel turn during a drag zooms without disturbing the drag", () => {
  const { element, changes } = setup({ allowWheel: true, allowMouseDrag: true });
  pointer(element, "pointerdown", 1, 100, 100, "mouse");
  wheel(element, -100);
  pointer(win, "pointermove", 1, 120, 100, "mouse");
  expect(changes.map((change) => change.source)).toEqual(["wheel", "drag"]);
});

test("configuration rejects an unusable wheel step and a host without a window", () => {
  const element = document.createElement("div");
  for (const wheelStep of [1, 0.5, 0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => createCameraPanZoomInput({ element, onChange() {}, wheelStep })).toThrow(
      RangeError
    );
  }
  const detached = document.implementation.createHTMLDocument().createElement("div");
  expect(() => createCameraPanZoomInput({ element: detached, onChange() {} })).toThrow("window");
});
