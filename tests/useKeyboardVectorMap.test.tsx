import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { type KeyboardVector, useKeyboardVectorMap } from "../src/useKeyboardVectorMap";

afterEach(() => {
  cleanup();
});

function Harness({ onChange }: { onChange: (v: KeyboardVector) => void }) {
  useKeyboardVectorMap({ onChange });
  return null;
}

test("WASD/arrow keydown emits the mapped unit vector, keyup emits neutral", () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
  expect(onChange).toHaveBeenLastCalledWith({ x: 1, y: 0 });

  window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" }));
  expect(onChange).toHaveBeenLastCalledWith({ x: 0, y: 0 });

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
  expect(onChange).toHaveBeenLastCalledWith({ x: 0, y: -1 });
});

test("unmapped keys are ignored", () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "q" }));
  expect(onChange).not.toHaveBeenCalled();
});

test("repeated keydown (OS auto-repeat) is ignored", () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
  expect(onChange).toHaveBeenCalledTimes(1);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "w", repeat: true }));
  expect(onChange).toHaveBeenCalledTimes(1);
});
