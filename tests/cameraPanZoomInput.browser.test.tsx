import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import {
  type CameraGestureChange,
  type CameraGestureEnd,
  claimWidthFraction,
  createCameraPanZoomInput,
  createLookInput,
  createPointerOwnership,
  FloatingJoystick,
  type JoystickVector,
} from "../src/index";
import { mouseScript } from "./mouseScript";

// Real Chromium PointerEvent and WheelEvent objects: a left-zone stick and a right-zone camera in
// one host sharing one registry, which is the pairing the camera input exists for.
const disposals: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  cleanup();
});

function mount() {
  const ownership = createPointerOwnership();
  const vectors: JoystickVector[] = [];
  const changes: CameraGestureChange[] = [];
  const ends: CameraGestureEnd[] = [];
  const view = render(
    <div
      data-testid="game-viewport"
      style={{ width: 400, height: 300, touchAction: "none", position: "relative" }}
    >
      <FloatingJoystick
        ownership={ownership}
        claimArea={claimWidthFraction("left", 0.4)}
        onChange={(vector) => vectors.push(vector)}
      />
    </div>
  );
  const host = view.getByTestId("game-viewport");
  const camera = createCameraPanZoomInput({
    element: host,
    ownership,
    claimArea: claimWidthFraction("right", 0.6),
    allowMouseDrag: true,
    allowWheel: true,
    onChange: (change) => changes.push(change),
    onEnd: (reason) => ends.push(reason),
  });
  disposals.push(camera.dispose);
  const rect = host.getBoundingClientRect();
  return { ownership, vectors, changes, ends, host, rect };
}

const touch = (
  type: string,
  id: number,
  x: number,
  y: number,
  extra: PointerEventInit = {}
): PointerEvent =>
  new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    pointerType: "touch",
    isPrimary: false,
    clientX: x,
    clientY: y,
    ...extra,
  });

test("a left-zone finger steers the stick while a right-zone finger pans the camera", async () => {
  const { host, rect, vectors, changes, ownership } = mount();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  host.dispatchEvent(touch("pointerdown", 1, rect.left + 60, rect.top + 150));
  host.dispatchEvent(touch("pointerdown", 2, rect.left + 300, rect.top + 150));
  expect(ownership.ownerOf(1)).toMatch(/^joystick/);
  expect(ownership.ownerOf(2)).toMatch(/^camera/);
  window.dispatchEvent(touch("pointermove", 1, rect.left + 118, rect.top + 150));
  window.dispatchEvent(touch("pointermove", 2, rect.left + 330, rect.top + 120));
  await waitFor(() => expect(vectors.at(-1)?.x).toBeGreaterThan(0.9));
  expect(changes).toEqual([
    {
      source: "drag",
      pan: { x: 30, y: -30 },
      scale: 1,
      twist: 0,
      anchor: { x: 330, y: 120 },
    },
  ]);
  window.dispatchEvent(touch("pointerup", 2, rect.left + 330, rect.top + 120));
  expect(vectors.at(-1)?.magnitude).toBeGreaterThan(0.9);
  window.dispatchEvent(touch("pointerup", 1, rect.left + 118, rect.top + 150));
  await waitFor(() => expect(vectors.at(-1)).toEqual({ x: 0, y: 0, magnitude: 0, angle: 0 }));
});

test("two right-zone fingers pinch and twist while the stick finger keeps steering", async () => {
  const { host, rect, vectors, changes, ends } = mount();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  host.dispatchEvent(touch("pointerdown", 1, rect.left + 60, rect.top + 150));
  host.dispatchEvent(touch("pointerdown", 2, rect.left + 250, rect.top + 150));
  host.dispatchEvent(touch("pointerdown", 3, rect.left + 290, rect.top + 150));
  window.dispatchEvent(touch("pointermove", 1, rect.left + 118, rect.top + 150));
  window.dispatchEvent(touch("pointermove", 3, rect.left + 250, rect.top + 230));
  await waitFor(() => expect(vectors.at(-1)?.magnitude).toBeGreaterThan(0.9));
  expect(changes).toHaveLength(1);
  expect(changes[0].source).toBe("pinch");
  expect(changes[0].scale).toBe(2);
  expect(changes[0].twist).toBeCloseTo(Math.PI / 2, 10);
  window.dispatchEvent(touch("pointercancel", 2, rect.left + 250, rect.top + 150));
  window.dispatchEvent(touch("pointercancel", 3, rect.left + 250, rect.top + 230));
  expect(ends).toEqual(["cancel"]);
  expect(vectors.at(-1)?.magnitude).toBeGreaterThan(0.9);
});

test("the wheel zooms in real WheelEvent line mode and is prevented only when it acts", () => {
  const { host, rect, changes } = mount();
  const lines = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: -3,
    deltaMode: WheelEvent.DOM_DELTA_LINE,
    clientX: rect.left + 100,
    clientY: rect.top + 50,
  });
  host.dispatchEvent(lines);
  expect(lines.defaultPrevented).toBe(true);
  expect(changes[0].source).toBe("wheel");
  expect(changes[0].scale).toBeCloseTo(1.0015 ** 48, 10);
  expect(changes[0].anchor).toEqual({ x: 100, y: 50 });
  const sideways = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 40 });
  host.dispatchEvent(sideways);
  expect(sideways.defaultPrevented).toBe(false);
  expect(changes).toHaveLength(1);
});

test("a camera and look share one registry without any finger being taken twice", () => {
  const ownership = createPointerOwnership();
  const element = document.createElement("div");
  element.style.cssText = "width: 400px; height: 300px; touch-action: none";
  document.body.append(element);
  const changes: CameraGestureChange[] = [];
  const angles: number[] = [];
  const camera = createCameraPanZoomInput({
    element,
    ownership,
    claimArea: claimWidthFraction("right", 0.3),
    onChange: (change) => changes.push(change),
  });
  const look = createLookInput({
    element,
    ownership,
    claimArea: claimWidthFraction("left", 0.7),
    onChange: (next) => angles.push(next.yaw),
  });
  disposals.push(camera.dispose, look.dispose, () => element.remove());
  const rect = element.getBoundingClientRect();
  element.dispatchEvent(touch("pointerdown", 1, rect.left + 380, rect.top + 100));
  element.dispatchEvent(touch("pointerdown", 2, rect.left + 100, rect.top + 100));
  expect(ownership.ownerOf(1)).toMatch(/^camera/);
  expect(ownership.ownerOf(2)).toMatch(/^look/);
  window.dispatchEvent(touch("pointermove", 1, rect.left + 390, rect.top + 100));
  window.dispatchEvent(touch("pointermove", 2, rect.left + 120, rect.top + 100));
  expect(changes).toHaveLength(1);
  expect(angles).toHaveLength(1);
});

// Trusted mouse input: a dispatched event never produces a click, so whether a drag that starts on a
// button swallows that button's click, and a plain click on it still arrives, can only be seen here.
function controlHost() {
  const element = document.createElement("div");
  element.dataset.testid = "graph-viewport";
  element.style.cssText = "position: relative; width: 400px; height: 300px; touch-action: none";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Open";
  button.style.cssText = "position: absolute; left: 50px; top: 50px; width: 80px; height: 40px";
  element.append(button);
  document.body.append(element);
  const clicks: number[] = [];
  button.addEventListener("click", () => clicks.push(clicks.length));
  const changes: CameraGestureChange[] = [];
  const ends: CameraGestureEnd[] = [];
  const camera = createCameraPanZoomInput({
    element,
    allowMouseDrag: true,
    panFromControls: true,
    onChange: (change) => changes.push(change),
    onEnd: (reason) => ends.push(reason),
  });
  disposals.push(camera.dispose, () => element.remove());
  return { clicks, changes, ends };
}

test("a native click on a button inside a pan-from-controls camera is still a click and pans nothing", async () => {
  const { clicks, changes, ends } = controlHost();
  await mouseScript("graph-viewport", [
    { type: "down-at", x: 90, y: 70 },
    { type: "move", x: 93, y: 72 },
    { type: "up" },
  ]);
  expect(clicks).toHaveLength(1);
  expect(changes).toEqual([]);
  expect(ends).toEqual([]);
});

test("a native drag that starts on a button pans from there and the button's click is swallowed, once", async () => {
  const { clicks, changes, ends } = controlHost();
  await mouseScript("graph-viewport", [
    { type: "down-at", x: 90, y: 70 },
    { type: "move", x: 120, y: 80 },
    { type: "move", x: 300, y: 200 },
    { type: "up" },
  ]);
  expect(clicks).toHaveLength(0);
  expect(changes.length).toBeGreaterThan(0);
  expect(changes[0].pan).toEqual({ x: 30, y: 10 });
  expect(ends).toEqual(["release"]);
  // The suppression was one-shot: the next click on the button is a real one.
  await mouseScript("graph-viewport", [{ type: "down-at", x: 90, y: 70 }, { type: "up" }]);
  expect(clicks).toHaveLength(1);
});

test("a native drag that ends back on its button is still a pan, not a click", async () => {
  const { clicks, changes } = controlHost();
  await mouseScript("graph-viewport", [
    { type: "down-at", x: 90, y: 70 },
    { type: "move", x: 200, y: 150 },
    { type: "move", x: 90, y: 70 },
    { type: "up" },
  ]);
  expect(changes.length).toBeGreaterThan(0);
  expect(clicks).toHaveLength(0);
});
