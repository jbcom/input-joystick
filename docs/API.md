---
title: API reference
description: Signatures, defaults and behavior for every input-joystick export.
---

Every export is available from the package root, as ESM or CommonJS:

```ts
import {
  FloatingJoystick,
  normalizeJoystick,
  useKeyboardVectorMap,
  type FloatingJoystickProps,
  type JoystickVector,
  type KeyboardVector,
  type KeyboardVectorMapOptions,
  type RawOffset,
} from "input-joystick";
```

## `FloatingJoystick`

```ts
function FloatingJoystick(props: FloatingJoystickProps): JSX.Element;
```

A touch-anywhere joystick. It renders a full-size, pointer-transparent wrapper
(`data-floating-joystick="true"`) and, only while a pointer is held, a ring and knob
(`data-testid="floating-joystick"`) positioned at the touch origin.

### `FloatingJoystickProps`

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `onChange` | `(vector: JoystickVector) => void` | required | Called on every pointer move while held, and once with a zero vector when the pointer ends, is cancelled, or the component unmounts or is disabled. |
| `disabled` | `boolean` | `false` | Releases any held pointer, reports a zero vector, and ignores new touches. |
| `label` | `string` | `"Movement joystick"` | The `title` of the visible ring. |
| `radius` | `number` | `58` | Travel radius in CSS pixels. The ring is `2 * radius` wide. |
| `deadZone` | `number` | `0.12` | Fraction of `radius` (0 to 1) inside which the magnitude is zero. |
| `accent` | `string` | `"#38bdf8"` | A hex color for the ring glow and knob. Never read from a CSS custom property. |
| `allowMouse` | `boolean` | `false` | Also accept `pointerType: "mouse"`. Touch and pen are always accepted. |
| `hostSelector` | `string` | `'[data-testid="game-viewport"]'` | Selector for the closest ancestor used as the hit-test host. Falls back to the parent element. |

`accent` is concatenated with two-digit hex alpha suffixes, so pass a six-digit hex color such as
`"#38bdf8"`.

### Pointer rules

- A `pointerdown` starts the joystick only if no pointer is already claimed, the pointer is not a
  mouse (unless `allowMouse`), the event target is inside the host and its rectangle, and the target
  is not interactive.
- Interactive targets are `button`, `a`, `input`, `textarea`, `select`, `summary`,
  `[role="button"]`, and anything with a `data-joystick-ignore` attribute.
- The claimed pointer's `pointermove` calls `onChange`; its `pointerup` or `pointercancel` ends the
  gesture. Other pointers never affect it.
- Listeners are attached to `window` and removed on cleanup. Changing `allowMouse`, `deadZone`,
  `disabled`, `hostSelector` or `radius` re-attaches them and releases any held pointer.

## `normalizeJoystick`

```ts
function normalizeJoystick(raw: RawOffset, radius: number, deadZone: number): JoystickVector;
```

Pure deadzone, clamp and normalize math. `raw` is the pointer offset in pixels from the joystick
origin.

- Offsets inside `deadZone * radius` report `magnitude: 0` and a zero `x` and `y`.
- Between the deadzone and the radius, `magnitude` rises linearly from 0 to 1.
- Beyond `radius` the vector clamps to unit length.
- `angle` is `Math.atan2(y, x)` of the offset direction in radians, in screen coordinates, so a
  positive `y` points down.
- A `radius` of zero or less yields a zero magnitude.

## `JoystickVector` and `RawOffset`

```ts
interface JoystickVector {
  x: number; // -1..1
  y: number; // -1..1
  magnitude: number; // 0..1
  angle: number; // radians
}

interface RawOffset {
  x: number;
  y: number;
}
```

## `useKeyboardVectorMap`

```ts
function useKeyboardVectorMap(options: KeyboardVectorMapOptions): void;

interface KeyboardVectorMapOptions {
  onChange: (vector: KeyboardVector) => void;
  keys?: Record<string, KeyboardVector>;
  disabled?: boolean;
}

interface KeyboardVector {
  x: number;
  y: number;
}
```

An opt-in keyboard co-map. `keys` maps `KeyboardEvent.key` values to vectors and defaults to
`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight` and lowercase `w`, `a`, `s`, `d`.

- A mapped `keydown` calls `onChange(vector)` and calls `preventDefault()`. Auto-repeat events are
  ignored.
- A mapped `keyup` calls `onChange({ x: 0, y: 0 })`.
- Events from `input` and `textarea` elements are ignored.
- `disabled: true` removes the listeners without unmounting the hook.

The hook reports the most recent key's vector, not a sum of held keys, so it is a parity aid for
desktop testing rather than a full keyboard movement system. Pass a stable `keys` object (module
scope or memoized) to avoid re-attaching listeners on every render.
