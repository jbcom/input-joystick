import { afterEach, expect, test, vi } from "vitest";
import { createPointerOwnership, pointerOwnership } from "../src/pointerOwnership";

function pointerEvent(type: string, pointerId: number): Event {
  return Object.assign(new Event(type), { pointerId });
}

afterEach(() => {
  pointerOwnership.clear();
});

test("a free pointer is claimed, and the claim names its owner", () => {
  const registry = createPointerOwnership();
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(registry.claim(1, "station")).toBe(true);
  expect(registry.ownerOf(1)).toBe("station");
});

test("a claim is refused while another owner holds the pointer, and changes nothing", () => {
  const registry = createPointerOwnership();
  registry.claim(1, "station");
  expect(registry.claim(1, "joystick")).toBe(false);
  expect(registry.ownerOf(1)).toBe("station");
});

test("claiming again as the same owner is accepted", () => {
  const registry = createPointerOwnership();
  registry.claim(1, "station");
  expect(registry.claim(1, "station")).toBe(true);
  expect(registry.ownerOf(1)).toBe("station");
});

test("two pointers can be held by two owners at once", () => {
  const registry = createPointerOwnership();
  expect(registry.claim(1, "joystick")).toBe(true);
  expect(registry.claim(2, "station")).toBe(true);
  expect(registry.ownerOf(1)).toBe("joystick");
  expect(registry.ownerOf(2)).toBe("station");
});

test("release frees the pointer, and releasing a free pointer is a no-op", () => {
  const registry = createPointerOwnership();
  registry.claim(1, "station");
  expect(registry.release(1)).toBe(true);
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(registry.release(1)).toBe(false);
  expect(registry.claim(1, "joystick")).toBe(true);
});

test("release as an owner never drops another owner's pointer", () => {
  const registry = createPointerOwnership();
  registry.claim(1, "station");
  expect(registry.release(1, "joystick")).toBe(false);
  expect(registry.ownerOf(1)).toBe("station");
  expect(registry.release(1, "station")).toBe(true);
  expect(registry.ownerOf(1)).toBeUndefined();
});

test("releaseAll frees every pointer of one owner and reports the count", () => {
  const registry = createPointerOwnership();
  registry.claim(1, "station");
  registry.claim(2, "joystick");
  registry.claim(3, "station");
  expect(registry.releaseAll("station")).toBe(2);
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(registry.ownerOf(3)).toBeUndefined();
  expect(registry.ownerOf(2)).toBe("joystick");
  expect(registry.releaseAll("station")).toBe(0);
});

test("clear frees every pointer of every owner", () => {
  const registry = createPointerOwnership();
  registry.claim(1, "station");
  registry.claim(2, "joystick");
  registry.clear();
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(registry.ownerOf(2)).toBeUndefined();
});

test("onRelease hears every release with the pointer and its former owner", () => {
  const registry = createPointerOwnership();
  const heard: Array<[number, string]> = [];
  registry.onRelease((pointerId, owner) => heard.push([pointerId, owner]));
  registry.claim(1, "station");
  registry.claim(2, "joystick");
  registry.claim(3, "station");
  registry.claim(4, "joystick");

  registry.release(1, "station");
  registry.releaseAll("station");
  registry.clear();

  expect(heard).toEqual([
    [1, "station"],
    [3, "station"],
    [2, "joystick"],
    [4, "joystick"],
  ]);
});

test("onRelease stays silent for a release that released nothing", () => {
  const registry = createPointerOwnership();
  const listener = vi.fn();
  registry.onRelease(listener);
  registry.claim(1, "station");
  registry.release(1, "joystick");
  registry.release(9);
  registry.releaseAll("joystick");
  registry.clear();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith(1, "station");
});

test("an unsubscribed onRelease listener is not called again", () => {
  const registry = createPointerOwnership();
  const listener = vi.fn();
  const unsubscribe = registry.onRelease(listener);
  unsubscribe();
  registry.claim(1, "station");
  registry.release(1);
  expect(listener).not.toHaveBeenCalled();
});

test("a listener sees the pointer already free, and may claim it again", () => {
  const registry = createPointerOwnership();
  const seen: Array<string | undefined> = [];
  registry.onRelease((pointerId) => {
    seen.push(registry.ownerOf(pointerId));
    registry.claim(pointerId, "next");
  });
  registry.claim(1, "station");
  registry.release(1);
  expect(seen).toEqual([undefined]);
  expect(registry.ownerOf(1)).toBe("next");
});

test("a listener removed mid-release is skipped, and one added mid-release waits for the next", () => {
  const registry = createPointerOwnership();
  const removed = vi.fn();
  const added = vi.fn();
  let unsubscribeRemoved = () => {};
  registry.onRelease(() => {
    unsubscribeRemoved();
    registry.onRelease(added);
  });
  unsubscribeRemoved = registry.onRelease(removed);

  registry.claim(1, "station");
  registry.release(1);
  expect(removed).not.toHaveBeenCalled();
  expect(added).not.toHaveBeenCalled();

  registry.claim(2, "station");
  registry.release(2);
  expect(added).toHaveBeenCalledTimes(1);
});

test("a listener that unsubscribes itself mid-release does not skip the others", () => {
  const registry = createPointerOwnership();
  const later = vi.fn();
  const unsubscribe = registry.onRelease(() => unsubscribe());
  registry.onRelease(later);
  registry.claim(1, "station");
  registry.release(1);
  expect(later).toHaveBeenCalledTimes(1);
});

test("attached, pointerup and pointercancel release the pointer that ended", () => {
  const registry = createPointerOwnership();
  const target = new EventTarget();
  registry.attach(target);
  registry.claim(1, "station");
  registry.claim(2, "joystick");
  registry.claim(3, "station");

  target.dispatchEvent(pointerEvent("pointerup", 1));
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(registry.ownerOf(2)).toBe("joystick");

  target.dispatchEvent(pointerEvent("pointercancel", 2));
  expect(registry.ownerOf(2)).toBeUndefined();
  expect(registry.ownerOf(3)).toBe("station");
});

test("attached, blur releases every claim", () => {
  const registry = createPointerOwnership();
  const target = new EventTarget();
  registry.attach(target);
  registry.claim(1, "station");
  registry.claim(2, "joystick");

  target.dispatchEvent(new Event("blur"));
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(registry.ownerOf(2)).toBeUndefined();
});

test("without attach, nothing is released by events", () => {
  const registry = createPointerOwnership();
  const target = new EventTarget();
  registry.claim(1, "station");
  target.dispatchEvent(pointerEvent("pointerup", 1));
  expect(registry.ownerOf(1)).toBe("station");
});

test("attach defaults to window", () => {
  const registry = createPointerOwnership();
  const detach = registry.attach();
  registry.claim(1, "station");
  window.dispatchEvent(pointerEvent("pointerup", 1));
  expect(registry.ownerOf(1)).toBeUndefined();
  detach();
});

test("detach stops the release, and a second detach changes nothing", () => {
  const registry = createPointerOwnership();
  const target = new EventTarget();
  const detach = registry.attach(target);
  registry.claim(1, "station");
  detach();
  detach();
  target.dispatchEvent(pointerEvent("pointerup", 1));
  expect(registry.ownerOf(1)).toBe("station");
});

test("attach is reference-counted: the listeners stay until the last detach", () => {
  const registry = createPointerOwnership();
  const target = new EventTarget();
  const first = registry.attach(target);
  const second = registry.attach(target);
  const heard = vi.fn();
  registry.onRelease(heard);
  registry.claim(1, "station");

  first();
  first();
  target.dispatchEvent(pointerEvent("pointerup", 1));
  expect(heard).toHaveBeenCalledTimes(1);

  registry.claim(2, "station");
  second();
  target.dispatchEvent(pointerEvent("pointerup", 2));
  expect(registry.ownerOf(2)).toBe("station");

  // Attaching again after the last detach listens afresh, once.
  registry.attach(target);
  target.dispatchEvent(pointerEvent("pointerup", 2));
  expect(heard).toHaveBeenCalledTimes(2);
});

test("attaching twice to one target releases a pointer once, not twice", () => {
  const registry = createPointerOwnership();
  const target = new EventTarget();
  registry.attach(target);
  registry.attach(target);
  const heard = vi.fn();
  registry.onRelease(heard);
  registry.claim(1, "station");
  target.dispatchEvent(pointerEvent("pointerup", 1));
  expect(heard).toHaveBeenCalledTimes(1);
});

test("registries are isolated from each other and from the shared one", () => {
  const registry = createPointerOwnership();
  registry.claim(1, "station");
  expect(pointerOwnership.ownerOf(1)).toBeUndefined();
  expect(createPointerOwnership().ownerOf(1)).toBeUndefined();
});

test("the shared registry is one instance every importer sees", () => {
  expect(pointerOwnership.claim(5, "station")).toBe(true);
  expect(pointerOwnership.claim(5, "joystick")).toBe(false);
});
