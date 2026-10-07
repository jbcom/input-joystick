---
title: input-joystick
description: A touch-anywhere floating virtual joystick for React canvas games.
---

input-joystick is a touch-anywhere floating virtual joystick for React canvas games. Press anywhere
on the game viewport and a ring and knob appear under your thumb; drag to steer; lift to stop.

It is deliberately small. It owns the parts of a virtual joystick that are easy to get subtly
wrong, and leaves everything that is a game's own decision to the game.

## What it owns

| Problem | input-joystick behavior |
| --- | --- |
| A second finger steals the stick | Exactly one pointer is claimed; others are ignored until it ends. |
| Taps meant for buttons start the stick | Interactive elements and `data-joystick-ignore` are excluded. |
| Thumb wobble drifts the character | A deadzone reports zero magnitude, then scales linearly to the radius. |
| The stick reacts outside the game view | Touches are hit-tested against a host element you choose. |
| Desktop testing needs a second input path | `useKeyboardVectorMap` emits the same `{ x, y }` shape. |

## What it leaves to you

What the vector means (movement, aim, camera), how often you read it, and the final look beyond the
`accent` color and `radius`. The package does not own game state and never reads host CSS.

Start with [Getting started](./getting-started/), then use the [API reference](./API/) for
signatures and the [architecture notes](./ARCHITECTURE/) for the reasoning behind the behavior.
