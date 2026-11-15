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
