---
title: Getting started
description: Install input-joystick and wire a floating joystick into a React game.
---

## Install

```sh
pnpm add input-joystick react react-dom
```

React 18 or later is a peer dependency. The package works with any bundler that understands the
`exports` map and ships both ESM and CommonJS.

## Mount the joystick

Mount `FloatingJoystick` inside the element that should accept the touch. It renders nothing until
a touch begins.

```tsx
import { FloatingJoystick, type JoystickVector } from "input-joystick";
import { useRef } from "react";

export function Game() {
  const move = useRef({ x: 0, y: 0 });

  return (
    <div data-testid="game-viewport" style={{ position: "relative", touchAction: "none" }}>
      <canvas />
      <FloatingJoystick
        onChange={(vector: JoystickVector) => {
          move.current = { x: vector.x, y: vector.y };
        }}
      />
    </div>
  );
}
```

Read `move.current` from your game loop each frame. Set `touch-action: none` on the viewport so the
browser does not scroll or zoom while the thumb drags.

## Choose the host

The joystick hit-tests every `pointerdown` against a host element. The host is the closest ancestor
of the component matching `hostSelector` (default `[data-testid="game-viewport"]`), or the
component's parent element when nothing matches. Touches that land outside the host rectangle, or
on an element outside the host, never start the stick.

```tsx
<FloatingJoystick hostSelector="#playfield" onChange={onChange} />
```

## Keep controls tappable

A button, link or form control inside the host keeps its own taps. For anything else that must not
start the stick, such as a custom canvas widget, add `data-joystick-ignore`:

```tsx
<div data-joystick-ignore>Inventory</div>
```

## Add keyboard parity

```tsx
import { useKeyboardVectorMap } from "input-joystick";

useKeyboardVectorMap({ onChange: ({ x, y }) => (move.current = { x, y }) });
```

By default WASD and the arrow keys map to unit vectors. Pass `keys` for your own bindings.

## Use the math on its own

```ts
import { normalizeJoystick } from "input-joystick";

const vector = normalizeJoystick({ x: 40, y: 0 }, 58, 0.12);
// { x: 0.647..., y: 0, magnitude: 0.647..., angle: 0 }
```
