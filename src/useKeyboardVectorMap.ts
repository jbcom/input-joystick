import { useEffect } from "react";

export interface KeyboardVector {
  x: number;
  y: number;
}

/** Default WASD + arrow-key mapping, matching welcoming-wilds-island-adventure's
 * VirtualJoystick keyboard fallback. */
const DEFAULT_KEYS: Record<string, KeyboardVector> = {
  ArrowUp: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  d: { x: 1, y: 0 },
};

export interface KeyboardVectorMapOptions {
  onChange: (vector: KeyboardVector) => void;
  /** Key -> unit vector mapping. Defaults to WASD + arrow keys. */
  keys?: Record<string, KeyboardVector>;
  /** Disable the listener without unmounting the hook. Defaults to false. */
  disabled?: boolean;
}

/**
 * Opt-in keyboard co-map for FloatingJoystick, so consumers that want
 * keyboard+joystick parity (desktop testing, accessibility, hybrid input)
 * can compose it without the base FloatingJoystick component growing scope.
 *
 * Backfilled from welcoming-wilds-island-adventure's VirtualJoystick.tsx
 * WASD/arrow keydown/keyup handler (lines 95-126), generalized to accept a
 * caller-supplied key map instead of a hardcoded WASD+arrows table, and to
 * emit a plain {x,y} vector (not the full JoystickVector — callers can pass
 * it straight into the same onMove callback FloatingJoystick's onChange
 * feeds, since both agree on the {x,y} shape).
 */
export function useKeyboardVectorMap({
  onChange,
  keys = DEFAULT_KEYS,
  disabled = false,
}: KeyboardVectorMapOptions): void {
  useEffect(() => {
    if (disabled) return undefined;

    const isTextInput = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) return;
      if (event.repeat) return;
      const vector = keys[event.key];
      if (!vector) return;
      event.preventDefault();
      onChange(vector);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) return;
      if (!(event.key in keys)) return;
      onChange({ x: 0, y: 0 });
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [disabled, keys, onChange]);
}
