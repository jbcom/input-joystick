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

test("disabled attaches no listeners", () => {
  const onChange = vi.fn();
  function Disabled() {
    useKeyboardVectorMap({ onChange, disabled: true });
    return null;
  }
  render(<Disabled />);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
  expect(onChange).not.toHaveBeenCalled();
});

test("keys typed into text fields are ignored", () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);

  for (const tag of ["input", "textarea"] as const) {
    const field = document.createElement(tag);
    document.body.append(field);
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keyup", { key: "w", bubbles: true }));
    field.remove();
  }
  expect(onChange).not.toHaveBeenCalled();
});

test("keyup of an unmapped key does not report a neutral vector", () => {
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);

  window.dispatchEvent(new KeyboardEvent("keyup", { key: "q" }));
  expect(onChange).not.toHaveBeenCalled();
});

test("a caller-supplied key map replaces the defaults", () => {
  const onChange = vi.fn();
  function Custom() {
    useKeyboardVectorMap({ onChange, keys: { j: { x: -1, y: 0 } } });
    return null;
  }
  render(<Custom />);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
  expect(onChange).toHaveBeenLastCalledWith({ x: -1, y: 0 });
  onChange.mockClear();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
  expect(onChange).not.toHaveBeenCalled();
});

test("a mapped keydown is default-prevented and unmounting removes the listeners", () => {
  const onChange = vi.fn();
  const view = render(<Harness onChange={onChange} />);

  const event = new KeyboardEvent("keydown", { key: "s", cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);

  view.unmount();
  onChange.mockClear();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "s" }));
  expect(onChange).not.toHaveBeenCalled();
});
