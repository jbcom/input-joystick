---
title: Architecture
description: Module boundaries, invariants and intentional limits.
---

## Modules

| File | Responsibility |
| --- | --- |
| `src/normalizeJoystick.ts` | Pure deadzone, clamp and normalize math. No DOM, no React. |
| `src/FloatingJoystick.tsx` | The component: pointer claiming, host hit-testing, interactive exclusion, visuals. Calls `normalizeJoystick`. |
| `src/useKeyboardVectorMap.ts` | The opt-in keyboard co-map. Independent of the component. |
| `src/index.ts` | The public surface; nothing else is importable. |

The math lives in its own module so the curve is unit-testable without simulating pointer events,
and so a game with its own renderer can use it directly.

## Invariants

1. **One pointer.** While a pointer is claimed, every other `pointerdown` is ignored. A second finger
   is the game's to use.
2. **Window listeners.** Pointer events are listened for on `window`, not on the wrapper, so a drag
   that leaves the host keeps steering and the wrapper can stay `pointer-events: none` over the
   canvas.
3. **Hit-test before claim.** A `pointerdown` is claimed only after the host, rectangle and
   interactive-target checks pass, so buttons and links keep their taps.
4. **A zero vector always ends a gesture.** Pointer end, cancel, `disabled` and unmount all call
   `onChange` with a zero vector, so a game loop that reads the last vector can never be left
   steering.
5. **`onChange` is read through a ref.** A new callback identity does not re-attach listeners or
   release a held pointer.
6. **No host coupling.** The accent color, host selector and label are explicit props. The component
   never reads a CSS custom property or a global.

## Performance

The component re-renders only when the visual state changes, once per pointer move while held, and
renders nothing but an empty wrapper otherwise. `onChange` is the hot path; keep it to writing a ref
or a small store and read the value from your game loop.

## Intentional limits

- Touch, pen and (opt-in) mouse via Pointer Events. There is no Touch Events fallback.
- One stick. A dual-stick layout mounts two hosts or keeps the second stick in application code.
- The keyboard map reports the latest key, not a combined vector of every held key.
- Styling beyond `accent`, `radius` and `label` belongs to the application.
