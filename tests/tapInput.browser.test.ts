import { afterEach, expect, test, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { createLookInput } from "../src/lookInput";
import { createPointerOwnership } from "../src/pointerOwnership";
import { createTapInput } from "../src/tapInput";

const disposals: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  document.body.replaceChildren();
});

test("native mouse tap survives look capture release; a native drag never taps", async () => {
  const element = document.createElement("div");
  element.dataset.testid = "look-surface";
  element.style.cssText = "width: 300px; height: 200px; touch-action: none";
  document.body.append(element);
  const onTap = vi.fn();
  const onChange = vi.fn();
  const ownership = createPointerOwnership();
  const look = createLookInput({ element, ownership, allowMouseDrag: true, onChange });
  const tap = createTapInput({ element, onTap });
  disposals.push(tap.dispose, look.dispose);
  await page.getByTestId("look-surface").click();
  expect(onTap).toHaveBeenCalledTimes(1);
  expect(onTap.mock.calls[0][0].type).toBe("pointerup");
  expect(onTap.mock.calls[0][0].isTrusted).toBe(true);
  await commands.lookMouse("start");
  await commands.lookMouse("move");
  await commands.lookMouse("hover");
  await commands.lookMouse("end");
  expect(onChange).toHaveBeenCalled();
  expect(onTap).toHaveBeenCalledTimes(1);
  await page.getByTestId("look-surface").click();
  expect(onTap).toHaveBeenCalledTimes(2);
});

declare module "vitest/browser" {
  interface BrowserCommands {
    lockedTapMouse(drag: boolean): Promise<void>;
  }
}

test("native locked LMB out-and-back rotates look without firing a tap; stationary locked click still taps", async () => {
  const element = document.createElement("div");
  element.dataset.testid = "locked-tap-surface";
  element.style.cssText = "width: 300px; height: 200px; touch-action: none";
  const button = document.createElement("button");
  button.textContent = "Enable tap look";
  element.append(button);
  document.body.append(element);
  const onTap = vi.fn();
  const onChange = vi.fn();
  const look = createLookInput({ element, onChange });
  const tap = createTapInput({ element, onTap });
  disposals.push(tap.dispose, look.dispose);
  let pending: Promise<boolean> | undefined;
  button.onclick = () => {
    pending = look.requestPointerLock();
  };
  await page.getByRole("button", { name: "Enable tap look" }).click();
  const acquired = await pending;
  const headlessMac =
    /Mac OS X/.test(navigator.userAgent) && /HeadlessChrome/.test(navigator.userAgent);
  if (headlessMac) {
    expect(acquired).toBe(false); // native denial is diagnostic only; Linux/Xvfb must acquire below
    return;
  }
  expect(acquired).toBe(true);
  expect(document.pointerLockElement).toBe(element);
  expect(onTap).not.toHaveBeenCalled();
  await commands.lockedTapMouse(false);
  expect(onTap).toHaveBeenCalledTimes(1);
  expect(onTap.mock.calls[0][0].isTrusted).toBe(true);
  onChange.mockClear();
  const moves: MouseEvent[] = [];
  const recordMove = (event: MouseEvent) => moves.push(event);
  document.addEventListener("mousemove", recordMove);
  disposals.push(() => document.removeEventListener("mousemove", recordMove));
  await commands.lockedTapMouse(true);
  expect(onChange).toHaveBeenCalled();
  expect(moves.some((event) => event.isTrusted && Math.abs(event.movementX) > 8)).toBe(true);
  expect(new Set(moves.map((event) => `${event.clientX},${event.clientY}`)).size).toBe(1);
  expect(onTap).toHaveBeenCalledTimes(1);
  await commands.lockedTapMouse(false);
  expect(onTap).toHaveBeenCalledTimes(2);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await expect.poll(() => look.getState().locked).toBe(false);
});
