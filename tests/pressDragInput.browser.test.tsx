import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import {
  type CameraGestureChange,
  claimWidthFraction,
  createCameraPanZoomInput,
  createLookInput,
  createPointerOwnership,
  createPressDragInput,
  createPressHoldInput,
  createTapInput,
  FloatingJoystick,
  type JoystickVector,
  type PressDragEnd,
  type PressDragPoint,
} from "../src/index";
import { mouseScript } from "./mouseScript";

// Real Chromium: a left-zone stick, a right-zone camera and look sharing one registry with a
// press-drag recognizer whose target is a box standing in the left zone, the tap and hold observers
// told to yield to it. That is the pairing the recognizer exists for.
const disposals: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  cleanup();
});

// The target: a 80 by 60 box at (40, 100) inside the 400 by 300 host.
const TARGET = { left: 40, top: 100, right: 120, bottom: 160 };

function mount() {
  const ownership = createPointerOwnership();
  const vectors: JoystickVector[] = [];
  const view = render(
    <div
      data-testid="game-viewport"
      style={{ width: 400, height: 300, touchAction: "none", position: "relative" }}
    >
      <FloatingJoystick
        ownership={ownership}
        claimArea={claimWidthFraction("left", 0.5)}
        allowMouse
        onChange={(vector) => vectors.push(vector)}
      />
    </div>
  );
  const host = view.getByTestId("game-viewport");
  const rect = () => host.getBoundingClientRect();
  const hitTarget = (event: PointerEvent) => {
    const { left, top } = rect();
    const x = event.clientX - left;
    const y = event.clientY - top;
    return x >= TARGET.left && x <= TARGET.right && y >= TARGET.top && y <= TARGET.bottom;
  };
  const presses: PressDragPoint[] = [];
  const drags: PressDragPoint[] = [];
  const ends: PressDragEnd[] = [];
  const endStacks: string[] = [];
  const looks: unknown[] = [];
  const cameras: CameraGestureChange[] = [];
  const taps: PointerEvent[] = [];
  const holds: unknown[] = [];
  const drag = createPressDragInput({
    element: host,
    hitTarget,
    ownership,
    owner: "run",
    allowMouse: true,
    onPress: (point) => presses.push(point),
    onDrag: (point) => drags.push(point),
    onEnd: (end) => {
      ends.push(end);
      // Where an unexpected end came from, for a failing assertion to print.
      endStacks.push(new Error(end.reason).stack ?? "");
    },
  });
  const look = createLookInput({
    element: host,
    ownership,
    allowMouseDrag: true,
    claimArea: claimWidthFraction("right", 0.5),
    onChange: (angles) => looks.push(angles),
  });
  const camera = createCameraPanZoomInput({
    element: host,
    ownership,
    allowMouseDrag: true,
    claimArea: claimWidthFraction("right", 0.5),
    onChange: (change) => cameras.push(change),
  });
  const tap = createTapInput({
    element: host,
    ownership,
    ignoreOwners: ["run"],
    onTap: (event) => taps.push(event),
  });
  const hold = createPressHoldInput({
    element: host,
    ownership,
    ignoreOwners: ["run"],
    holdMs: 120,
    onHold: (event) => holds.push(event),
  });
  disposals.push(drag.dispose, look.dispose, camera.dispose, tap.dispose, hold.dispose);
  return {
    ownership,
    vectors,
    host,
    rect,
    presses,
    drags,
    ends,
    endStacks,
    looks,
    cameras,
    taps,
    holds,
    view,
  };
}

const touch = (type: string, id: number, x: number, y: number): PointerEvent =>
  new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    pointerType: "touch",
    isPrimary: false,
    clientX: x,
    clientY: y,
  });

test("a touch press on the target is not a stick, a look drag, a tap or a hold; one beside it is the stick's", async () => {
  const { host, rect, ownership, vectors, presses, drags, ends, endStacks, taps, holds, view } =
    mount();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const { left, top } = rect();
  host.dispatchEvent(touch("pointerdown", 1, left + 80, top + 130));
  expect(ownership.ownerOf(1)).toBe("run");
  expect(presses).toHaveLength(1);
  // Real pointer events target an element under the finger, so the window's capture phase runs
  // before its bubble phase; dispatching on the window itself would run them in registration order.
  host.dispatchEvent(touch("pointermove", 1, left + 100, top + 130));
  host.dispatchEvent(touch("pointermove", 1, left + 140, top + 150));
  expect(drags.map((point) => [point.dx, point.dy])).toEqual([
    [20, 0],
    [60, 20],
  ]);
  // The stick was offered the same press and never took it: nothing drawn, no vector.
  expect(view.queryByTestId("floating-joystick")).toBeNull();
  expect(vectors.every((vector) => vector.magnitude === 0)).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(holds).toHaveLength(0);
  expect(ends).toEqual([]);
  host.dispatchEvent(touch("pointerup", 1, left + 140, top + 150));
  expect(
    ends.map((end) => end.reason),
    endStacks.join("\n---\n")
  ).toEqual(["drag"]);
  expect(ownership.ownerOf(1)).toBeUndefined();
  expect(taps).toHaveLength(0);

  // Released in place on the target it is the recognizer's tap and still no clean tap.
  host.dispatchEvent(touch("pointerdown", 2, left + 60, top + 120));
  host.dispatchEvent(touch("pointerup", 2, left + 60, top + 120));
  expect(ends.map((end) => end.reason)).toEqual(["drag", "tap"]);
  expect(taps).toHaveLength(0);

  // Beside the target, in the same zone, the stick takes it as it always did.
  host.dispatchEvent(touch("pointerdown", 3, left + 150, top + 50));
  expect(ownership.ownerOf(3)).toMatch(/^joystick/);
  host.dispatchEvent(touch("pointermove", 3, left + 190, top + 50));
  await waitFor(() => expect(view.getByTestId("floating-joystick")).toBeTruthy());
  host.dispatchEvent(touch("pointerup", 3, left + 190, top + 50));
  expect(vectors.some((vector) => vector.magnitude > 0)).toBe(true);
  expect(presses).toHaveLength(2);

  // And a stationary press there is a clean tap.
  host.dispatchEvent(touch("pointerdown", 4, left + 150, top + 250));
  host.dispatchEvent(touch("pointerup", 4, left + 150, top + 250));
  expect(taps).toHaveLength(1);
});

// Trusted mouse input: a drag that starts on the target and leaves the host is still the
// recognizer's, to the end, with no look or camera step; the same drag from beside it is look's.
test("a native mouse drag from the target keeps the pointer outside the host, and the others stay out of it", async () => {
  const { ownership, presses, drags, ends, looks, cameras, taps, holds } = mount();
  await mouseScript("game-viewport", [
    { type: "down-at", x: 80, y: 130 },
    { type: "move", x: 120, y: 160 },
    { type: "move", x: 500, y: 200 },
    { type: "wait", ms: 250 },
    { type: "up" },
  ]);
  expect(presses).toHaveLength(1);
  expect(drags.length).toBeGreaterThan(0);
  expect(drags.at(-1)?.dx).toBeGreaterThan(300);
  expect(ends.map((end) => end.reason)).toEqual(["drag"]);
  expect(looks).toHaveLength(0);
  expect(cameras).toHaveLength(0);
  expect(taps).toHaveLength(0);
  expect(holds).toHaveLength(0);
  expect(ownership.ownerOf(1)).toBeUndefined();

  // From the right zone, away from the target, look and the camera take the same gesture.
  await mouseScript("game-viewport", [
    { type: "down-at", x: 300, y: 100 },
    { type: "move", x: 340, y: 130 },
    { type: "up" },
  ]);
  expect(presses).toHaveLength(1);
  expect(looks.length).toBeGreaterThan(0);
});

test("a native mouse click on the target is the recognizer's tap, and a click beside it a clean tap", async () => {
  const { ends, taps } = mount();
  await mouseScript("game-viewport", [
    { type: "down-at", x: 80, y: 130 },
    { type: "up" },
    { type: "down-at", x: 300, y: 250 },
    { type: "up" },
  ]);
  expect(ends.map((end) => end.reason)).toEqual(["tap"]);
  expect(taps).toHaveLength(1);
  expect(taps[0].isTrusted).toBe(true);
});
