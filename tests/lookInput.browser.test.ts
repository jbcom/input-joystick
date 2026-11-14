import { afterEach, expect, test, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { createLookInput } from "../src/lookInput";
import { createPointerOwnership } from "../src/pointerOwnership";

declare module "vitest/browser" {
  interface BrowserCommands {
    lookMouse(phase: "start" | "move" | "end" | "hover"): Promise<void>;
  }
}

const disposals: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  document.body.replaceChildren();
});

test("intentional lock acquisition and Escape work, or headless macOS reports its native denial", async () => {
  const element = document.createElement("div");
  element.style.cssText = "width: 300px; height: 200px";
  const button = document.createElement("button");
  button.textContent = "Enable look";
  element.append(button);
  document.body.append(element);
  const nativeRequest = element.requestPointerLock.bind(element);
  let lockFailure = "";
  element.requestPointerLock = () =>
    nativeRequest().catch((error: unknown) => {
      lockFailure = String(error);
      throw error;
    });
  const reset = vi.fn();
  const input = createLookInput({ element, onChange() {}, onReset: reset });
  disposals.push(input.dispose);
  let requested: Promise<boolean> | undefined;
  button.onclick = () => {
    requested = input.requestPointerLock();
  };
  expect(document.pointerLockElement).toBeNull();
  await page.getByRole("button", { name: "Enable look" }).click();
  const acquired = await requested;
  // Playwright #20956: headless macOS has no focused native RenderWidgetHostViewMac.
  // This branch proves native denial/clearing; Linux Xvfb CI must prove real acquisition below.
  const headlessMac =
    /Mac OS X/.test(navigator.userAgent) && /HeadlessChrome/.test(navigator.userAgent);
  if (headlessMac) {
    expect(acquired).toBe(false);
    expect(lockFailure).toContain("WrongDocumentError");
    expect(input.getState().locked).toBe(false);
    expect(reset).toHaveBeenCalled();
    return;
  }
  expect(acquired, `pointer lock: ${lockFailure}; focused=${document.hasFocus()}`).toBe(true);
  expect(input.getState().locked).toBe(true);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await expect.poll(() => input.getState().locked).toBe(false);
  expect(reset).toHaveBeenCalled();
});

test("real PointerEvents keep movement and look independent during touch cancellation", () => {
  const element = document.createElement("div");
  element.style.cssText = "width: 300px; height: 200px; touch-action: none";
  document.body.append(element);
  const ownership = createPointerOwnership();
  ownership.claim(1, "move");
  const onChange = vi.fn();
  const input = createLookInput({ element, ownership, onChange });
  disposals.push(input.dispose);
  const rect = element.getBoundingClientRect();
  const event = (type: string, pointerId: number, offset = 10) =>
    new PointerEvent(type, {
      pointerId,
      pointerType: "touch",
      bubbles: true,
      clientX: rect.left + offset,
      clientY: rect.top + 10,
    });
  element.dispatchEvent(event("pointerdown", 2));
  window.dispatchEvent(event("pointermove", 2, 30));
  expect(onChange).toHaveBeenCalledTimes(1);
  window.dispatchEvent(event("pointercancel", 2));
  expect(ownership.ownerOf(1)).toBe("move");
  window.dispatchEvent(event("pointermove", 2, 50));
  expect(onChange).toHaveBeenCalledTimes(1);
});

test("mouse fallback captures a deliberate drag, leaves controls alone and releases outside the host", async () => {
  const element = document.createElement("div");
  element.dataset.testid = "look-surface";
  element.style.cssText = "width: 300px; height: 200px; touch-action: none";
  const control = document.createElement("button");
  control.textContent = "Open controls";
  element.append(control);
  document.body.append(element);
  const onChange = vi.fn();
  const ownership = createPointerOwnership();
  const input = createLookInput({ element, ownership, onChange, allowMouseDrag: true });
  disposals.push(input.dispose);
  let mouseId = 0;
  element.addEventListener("pointerdown", (event) => {
    mouseId = event.pointerId;
  });
  await page.getByRole("button", { name: "Open controls" }).click();
  expect(ownership.ownerOf(mouseId)).toBeUndefined();
  expect(onChange).not.toHaveBeenCalled();
  await commands.lookMouse("start");
  expect(element.hasPointerCapture(mouseId)).toBe(true);
  expect(ownership.ownerOf(mouseId)).toBeDefined();
  await commands.lookMouse("move");
  expect(input.getState().yaw).toBeLessThan(0);
  expect(input.getState().locked).toBe(false);
  await commands.lookMouse("end");
  expect(ownership.ownerOf(mouseId)).toBeUndefined();
  expect(element.hasPointerCapture(mouseId)).toBe(false);
  const heading = input.getState().yaw;
  await commands.lookMouse("hover");
  expect(input.getState().yaw).toBe(heading);
});
