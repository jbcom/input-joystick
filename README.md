# input-joystick

[![CI](https://github.com/jbcom/input-joystick/actions/workflows/ci.yml/badge.svg)](https://github.com/jbcom/input-joystick/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/input-joystick.svg)](https://www.npmjs.com/package/input-joystick)
[![License: MIT](https://img.shields.io/badge/License-MIT-0b2239.svg)](./LICENSE)

A touch-anywhere floating virtual joystick for React canvas games. Press anywhere on the game
viewport and the joystick appears under your thumb; drag to steer; lift to stop. It never takes
over taps meant for buttons, links or form controls, and it claims exactly one pointer so a second
finger can fire, jump or open a menu.

The package owns the parts that are easy to get subtly wrong: pointer claiming, host hit-testing,
interactive-control exclusion, and the deadzone/clamp curve. Your game still owns what the vector
means and how the joystick looks.

- `FloatingJoystick`: the React component. Renders nothing until a touch begins, then a ring and
  knob at the touch origin.
- `normalizeJoystick`: the pure deadzone, clamp and normalize function, usable without React or a
  DOM.
- `useKeyboardVectorMap`: an opt-in WASD and arrow-key co-map that emits the same `{ x, y }` shape,
  for desktop testing and keyboard parity.
- `claimArea` and `claimWidthFraction`: say which presses the stick claims (the left 40% of the
  screen, say), so the rest is free for look, drag or taps.
- `pointerOwnership`, `createPointerOwnership` and `usePointerOwnership`: a small pointer registry
  that arbitrates which subsystem owns a finger, so a drag that starts on a station is not also a
  stick or a look. The joystick claims through it.

## Install

```sh
pnpm add input-joystick react react-dom
# or: npm install input-joystick react react-dom
```

React 18 or later is a peer dependency. The package ships ESM and CommonJS builds with types, has
no runtime dependencies and is marked `sideEffects: false`.

## Quick start

```tsx
import { FloatingJoystick, useKeyboardVectorMap, type JoystickVector } from "input-joystick";
import { useRef } from "react";

export function Controls() {
  const move = useRef({ x: 0, y: 0 });

  const onJoystick = (vector: JoystickVector) => {
    move.current = { x: vector.x, y: vector.y };
  };

  // Optional: keyboard parity on desktop.
  useKeyboardVectorMap({ onChange: ({ x, y }) => (move.current = { x, y }) });

  return <FloatingJoystick onChange={onJoystick} accent="#38bdf8" />;
}
```

Read `move.current` from your game loop. `onChange` fires on every pointer move while a touch is
held and once with a zero vector when it ends, so the loop never needs to track pointer lifetimes.

Mount `FloatingJoystick` inside the element that should accept the touch. By default its host is
the closest ancestor matching `[data-testid="game-viewport"]`, falling back to its parent element;
pass `hostSelector` to scope it to your own viewport.

### Share the screen with look and stations

Claim only part of the host for the stick, and let other subsystems take the pointers they use:

```tsx
import {
  FloatingJoystick,
  claimWidthFraction,
  usePointerOwnership,
  type JoystickVector,
} from "input-joystick";

function Controls({ onMove }: { onMove: (v: JoystickVector) => void }) {
  const pointers = usePointerOwnership("look");

  return (
    <>
      <FloatingJoystick claimArea={claimWidthFraction("left", 0.4)} onChange={onMove} />
      <div
        onPointerDown={(e) => pointers.claim(e.pointerId) && startLookDrag(e)}
        onPointerUp={(e) => pointers.release(e.pointerId)}
      />
    </>
  );
}
```

A pointer the stick holds is refused to `pointers.claim`, and a pointer a station has claimed is never
taken by the stick. Claims are released when the pointer ends, is cancelled or the window loses
focus.

## API overview

| Export | Kind | What it does |
| --- | --- | --- |
| `FloatingJoystick` | component | Claims one pointer inside its host, emits normalized vectors, draws the ring and knob. |
| `FloatingJoystickProps` | type | `onChange`, `disabled`, `label`, `radius`, `deadZone`, `accent`, `allowMouse`, `hostSelector`, `claimArea`, `ownership`, `owner`. |
| `claimWidthFraction(side, fraction)` | function | A `ClaimArea` for the `fraction` of the host's width from the `"left"` or `"right"` edge. |
| `ClaimArea`, `ClaimRect` | types | `(event, rect) => boolean` over the `pointerdown` and the host's rectangle. |
| `pointerOwnership` | value | The shared `PointerOwnership` registry the joystick uses by default. |
| `createPointerOwnership()` | function | Makes an isolated `PointerOwnership`: `claim`, `release`, `releaseAll`, `ownerOf`, `clear`, `onRelease`, `attach`. |
| `usePointerOwnership(owner, options?)` | hook | The registry bound to one owner, attached while mounted and released on unmount. |
| `PointerOwnership`, `PointerOwnershipTarget`, `PointerReleaseListener`, `OwnedPointers`, `UsePointerOwnershipOptions` | types | The registry, its attach target and listener, the hook's result and options. |
| `normalizeJoystick(raw, radius, deadZone)` | function | Pure deadzone, clamp and normalize math returning a `JoystickVector`. |
| `JoystickVector`, `RawOffset` | types | `{ x, y, magnitude, angle }` and `{ x, y }`. |
| `useKeyboardVectorMap(options)` | hook | Maps keys to unit vectors and calls `onChange({ x, y })`. |
| `KeyboardVector`, `KeyboardVectorMapOptions` | types | The hook's vector and options. |

Full signatures, defaults and behavior are in [docs/API.md](./docs/API.md); the reasoning behind
the design is in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Behavior worth knowing

- Touch and pen only by default. Pass `allowMouse` to accept a mouse for desktop testing.
- Taps on `button`, `a`, `input`, `textarea`, `select`, `summary`, `[role="button"]` or anything
  marked `data-joystick-ignore` never start the joystick.
- `disabled` releases any held pointer, reports a zero vector and ignores new touches.
- The stick never takes a pointer another owner already holds in the registry, and refuses its own
  pointer to everyone else until it ends.
- A `claimArea` that rejects a press leaves it alone: nothing is claimed or prevented.
- The accent color is an explicit prop. The component never reads a host CSS custom property.

## Compatibility

| | Supported |
| --- | --- |
| React and React DOM | 18 or later (tested on 19.2) |
| Node.js (building and SSR import) | 22, 24 and 26 (maintained lines; engines `>=22`) |
| Browsers | Any with Pointer Events: current Chrome, Safari and Firefox on desktop and mobile |
| Module formats | ESM and CommonJS, each with matching type declarations |

The `FloatingJoystick` tests run in real Chromium because pointer capture and multi-touch
`pointerId` claiming cannot be driven faithfully by jsdom.

## Development

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify   # Biome, markdownlint, tsc, jsdom and Chromium tests at 100% coverage, build, publint, attw, packed-consumer smoke
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md).

## Links

- Documentation: <https://jbcom.github.io/input-joystick/>
- npm: <https://www.npmjs.com/package/input-joystick>
- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- Security policy: [SECURITY.md](./SECURITY.md)

## License

[MIT](./LICENSE)
