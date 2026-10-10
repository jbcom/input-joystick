---
title: API reference
description: Signatures, defaults and behavior for every input-joystick export.
---

Every export is available from the package root, as ESM or CommonJS:

```ts
import {
  FloatingJoystick,
  claimWidthFraction,
  createPointerOwnership,
  normalizeJoystick,
  pointerOwnership,
  useKeyboardVectorMap,
  usePointerOwnership,
  type ClaimArea,
  type ClaimRect,
  type FloatingJoystickProps,
  type JoystickVector,
  type KeyboardVector,
  type KeyboardVectorMapOptions,
  type OwnedPointers,
  type PointerOwnership,
  type PointerOwnershipTarget,
  type PointerReleaseListener,
  type RawOffset,
  type UsePointerOwnershipOptions,
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
| `claimArea` | `ClaimArea` | the whole host | Which presses inside the host the stick may claim. See [`claimWidthFraction`](#claimwidthfraction). |
| `ownership` | `PointerOwnership` | the shared `pointerOwnership` | The registry the stick claims its pointer in. See [`PointerOwnership`](#pointerownership). |
| `owner` | `string` | `"joystick:"` + a per-instance id | The name the stick claims under in `ownership`. Each default stick has its own, so two never both take one pointer. |

`accent` is concatenated with two-digit hex alpha suffixes, so pass a six-digit hex color such as
`"#38bdf8"`.

### Pointer rules

- A `pointerdown` starts the joystick only if no pointer is already claimed, the pointer is not a
  mouse (unless `allowMouse`), the event target is inside the host and its rectangle, the target is
  not interactive, `claimArea` (when given) accepts it, and the pointer is not owned by anyone else
  in `ownership`. The checks run in that order and the ownership claim is last, so a press the stick
  would not take never holds a claim.
- Interactive targets are `button`, `a`, `input`, `textarea`, `select`, `summary`,
  `[role="button"]`, and anything with a `data-joystick-ignore` attribute.
- The stick claims its pointer in `ownership` as `owner`. While it holds it, every other owner's
  `claim` of that pointer is refused.
- The claimed pointer's `pointermove` calls `onChange`; its `pointerup` or `pointercancel` ends the
  gesture and releases the claim. Other pointers never affect it.
- The gesture also ends, with a zero vector, when the stick's claim is released from the registry by
  anyone: `clear()`, or the window losing focus while the registry is attached.
- Listeners are attached to `window` and removed on cleanup. Changing `allowMouse`, `deadZone`,
  `disabled`, `hostSelector`, `radius`, `ownership` or `owner` re-attaches them and releases any held
  pointer, claim included. `claimArea` is read through a ref like `onChange`, so passing a new
  function on every render does not.

## `claimWidthFraction`

```ts
type ClaimRect = Pick<DOMRectReadOnly, "left" | "top" | "right" | "bottom" | "width" | "height">;
type ClaimArea = (event: PointerEvent, rect: ClaimRect) => boolean;

function claimWidthFraction(side: "left" | "right", fraction: number): ClaimArea;
```

A `ClaimArea` decides which presses the joystick may claim. It is called with the `pointerdown` and
the host's bounding rectangle, only for presses that are already inside the host, not on an
interactive element, and (for mouse) allowed. Return `true` to let the stick claim the press, `false`
to leave it for look, drag or taps. A rejected press is not prevented, claimed or reported.

`claimWidthFraction(side, fraction)` is the ready-made area: the `fraction` of the host's width
counted from the `side` edge.

```tsx
// The left 40% of the screen steers; the rest is free for looking around.
<FloatingJoystick claimArea={claimWidthFraction("left", 0.4)} onChange={onMove} />
```

- `"left"` claims `clientX < rect.left + rect.width * fraction` (the boundary is excluded).
- `"right"` claims `clientX >= rect.right - rect.width * fraction` (the boundary is included), so
  `("left", 0.5)` and `("right", 0.5)` split a host with no column claimed twice and none missed.
- The fraction is measured against the host's rectangle, not the page, so a host that does not start
  at the left edge of the page behaves the same.
- It throws a `RangeError` unless `fraction` is above 0 and at most 1.

Write your own area for anything else, such as a rectangle or a circle:

```ts
const lowerLeft: ClaimArea = (event, rect) =>
  event.clientX < rect.left + rect.width / 2 && event.clientY > rect.top + rect.height / 2;
```

## `PointerOwnership`

```ts
interface PointerOwnership {
  claim(pointerId: number, owner: string): boolean;
  release(pointerId: number, owner?: string): boolean;
  releaseAll(owner: string): number;
  ownerOf(pointerId: number): string | undefined;
  clear(): void;
  onRelease(listener: (pointerId: number, owner: string) => void): () => void;
  attach(target?: PointerOwnershipTarget): () => void;
}

function createPointerOwnership(): PointerOwnership;
const pointerOwnership: PointerOwnership; // the shared instance
```

A framework-free registry of which subsystem owns which pointer, so a finger that goes down on a
station, a widget or the joystick is not also a look-drag, a stick or a tap. It needs no React and no
DOM beyond the optional `attach`.

- `claim(pointerId, owner)` returns `true` when the pointer was free or already `owner`'s (calling
  again is safe) and `false` when another owner holds it. A refused claim changes nothing.
- `release(pointerId, owner?)` frees a pointer and returns whether it freed one. With `owner`, only
  that owner's claim is released, so one subsystem never drops another's pointer; without it, the
  claim is released whoever holds it. Releasing a free pointer returns `false`.
- `releaseAll(owner)` releases every pointer `owner` holds and returns the count.
- `ownerOf(pointerId)` is the holder, or `undefined` when the pointer is free.
- `clear()` releases every claim, for every owner.
- `onRelease(listener)` is called as `listener(pointerId, owner)` after each claim ends, whatever
  the cause. The pointer is already free when the listener runs, so it may claim it again. A listener
  added during a release hears the next one; one removed during a release is not called. It returns
  the unsubscribe function.
- `attach(target = window)` makes the registry release claims on its own: a claimed pointer is
  released when `pointerup` or `pointercancel` reaches `target`, and every claim is released on
  `blur`. It is reference-counted per target (the listeners go when the last attach is detached) and
  returns the detach function; calling that twice is harmless. The listeners run in the bubble phase,
  after the handlers that saw the event, so a handler that claims during `pointerup`, or stops
  `pointerup` from reaching `window`, must release its own claim.

`createPointerOwnership()` makes an isolated registry. `pointerOwnership` is the shared one that
`FloatingJoystick` and `usePointerOwnership` use by default, so a joystick and your own subsystems
arbitrate with no wiring. Creating it has no side effects: nothing listens until something calls
`attach`.

```ts
import { pointerOwnership } from "input-joystick";

// A station takes the finger that touched it, so the stick and the look-drag leave it alone.
canvas.addEventListener("pointerdown", (event) => {
  if (touchedStation(event)) pointerOwnership.claim(event.pointerId, "station");
});

// The look-drag asks before it turns the head.
function onLookMove(event: PointerEvent) {
  const owner = pointerOwnership.ownerOf(event.pointerId);
  if (owner !== undefined && owner !== "look") return;
  // ...
}
```

## `usePointerOwnership`

```ts
function usePointerOwnership(
  owner: string,
  options?: { ownership?: PointerOwnership }
): OwnedPointers;

interface OwnedPointers {
  claim(pointerId: number): boolean;
  release(pointerId: number): boolean;
  owns(pointerId: number): boolean;
  heldByOther(pointerId: number): boolean;
  ownerOf(pointerId: number): string | undefined;
}
```

The registry seen from one owner, for React components. `claim` and `release` act as `owner`
(`release` never drops another owner's pointer); `owns` is whether you hold the pointer;
`heldByOther` is whether someone else does, which is the question a look or drag handler asks before
acting on a pointer; `ownerOf` is the holder.

While the component is mounted the hook attaches the registry (see `attach` above), so claims are
released when a pointer ends, is cancelled or the window loses focus. On unmount, or when `owner` or
`ownership` changes, every pointer `owner` still holds is released. The returned object is stable for
a given `owner` and registry, so it is safe in dependency arrays and handlers.

```tsx
function LookSurface() {
  const pointers = usePointerOwnership("look");

  return (
    <div
      onPointerDown={(event) => {
        if (!pointers.claim(event.pointerId)) return; // a station or the stick has it
        // ...start the look-drag
      }}
      onPointerUp={(event) => pointers.release(event.pointerId)}
    />
  );
}
```

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
