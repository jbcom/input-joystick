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

## Claim only part of the screen

By default the stick takes a press anywhere in the host. Pass a `claimArea` to take only some of it
and leave the rest for look, drag or taps:

```tsx
import { FloatingJoystick, claimWidthFraction } from "input-joystick";

<FloatingJoystick claimArea={claimWidthFraction("left", 0.4)} onChange={onChange} />;
```

`claimWidthFraction("left", 0.4)` claims the left 40% of the host's width. For any other shape, pass
a function of the `pointerdown` and the host's rectangle that returns whether the stick claims it.

## Share pointers with other controls

When a station, a button widget or a look-drag also uses pointers, give them one registry so a
finger is only ever one of them. The stick uses the shared `pointerOwnership` registry by default:

```tsx
import { usePointerOwnership } from "input-joystick";

function LookSurface() {
  const pointers = usePointerOwnership("look");

  return (
    <div
      onPointerDown={(event) => {
        if (pointers.claim(event.pointerId)) startLook(event); // false: the stick or a station has it
      }}
      onPointerUp={(event) => pointers.release(event.pointerId)}
    />
  );
}
```

Outside React, use `pointerOwnership.claim(pointerId, owner)`, `release` and `ownerOf` directly, and
`pointerOwnership.attach()` so claims are released when a pointer ends or the window loses focus.

## Pan and zoom a camera beside the stick

`createCameraPanZoomInput` is the other half of a mobile 3D game's controls: drag to pan, pinch to
zoom and twist, and on desktop a mouse drag and the wheel. Give it the stick's registry and the other
side of the screen, and the two never take one finger:

```tsx
import {
  FloatingJoystick,
  claimWidthFraction,
  createCameraPanZoomInput,
  createPointerOwnership,
} from "input-joystick";

const ownership = createPointerOwnership();

<FloatingJoystick
  ownership={ownership}
  claimArea={claimWidthFraction("left", 0.4)}
  onChange={onMove}
/>;

const camera = createCameraPanZoomInput({
  element: viewport,
  ownership,
  claimArea: claimWidthFraction("right", 0.6),
  allowMouseDrag: true,
  allowWheel: true,
  onChange({ pan, scale, twist, anchor }) {
    // Move, zoom and turn your camera; the package has no camera model.
  },
});
// camera.dispose() when the viewport leaves the scene.
```

`pan` is in pixels, `scale` is above 1 to zoom in, `twist` is in radians clockwise on screen and
`anchor` is the focal point in the element's own pixels. Set `touch-action: none` on the viewport.
See the [API reference](./API/#createcamerapanzoominput) for the cancellation rules.

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
