---
title: API reference
description: Signatures, defaults and behavior for every input-joystick export.
---

Every export is available from the package root, as ESM or CommonJS:

```ts
import {
  FloatingJoystick,
  DEFAULT_WHEEL_STEP,
  claimWidthFraction,
  createCameraPanZoomInput,
  normalizeWheelDelta,
  twoFingerGesture,
  wheelZoomScale,
  type CameraGestureChange,
  type CameraGestureEnd,
  type CameraGestureSource,
  type CameraPanZoomInput,
  type CameraPanZoomInputOptions,
  type CameraPoint,
  type TwoFingerGesture,
  createPointerOwnership,
  createLookInput,
  createTapInput,
  type TapInput,
  type TapInputOptions,
  createPressDragInput,
  type PressDragEnd,
  type PressDragEndReason,
  type PressDragInput,
  type PressDragInputOptions,
  type PressDragPoint,
  createPressHoldInput,
  type PressHold,
  type PressHoldInput,
  type PressHoldInputOptions,
  type LookAngles,
  type LookState,
  type LookInput,
  type LookInputOptions,
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
| `revealDistance` | `number` | `0` | Draw the ring and knob only once the press has moved farther than this many CSS pixels from where it began; at or below zero (or NaN) it is drawn at once. See below. |
| `ownership` | `PointerOwnership` | the shared `pointerOwnership` | The registry the stick claims its pointer in. See [`PointerOwnership`](#pointerownership). |
| `owner` | `string` | `"joystick:"` + a per-instance id | The name the stick claims under in `ownership`. Each default stick has its own, so two never both take one pointer. |

`accent` is concatenated with two-digit hex alpha suffixes, so pass a six-digit hex color such as
`"#38bdf8"`.

`revealDistance` defers only the drawing. The stick still claims the pointer and calls `onChange`
from the first `pointerdown`, so the vector behaves exactly as without it; a game that wants a tap
to move nothing keeps the dead zone, in pixels (`deadZone * radius`), at least as wide as its tap
slop. Set it to the tap's slop (the `maxDistance` of `createTapInput`, 8 by default) and a press
that stays a tap never flashes a ring. Once the press passes the distance the ring is drawn at the
press origin and stays drawn, knob following the finger, until the gesture ends, even if the finger
comes back inside the distance. The next press starts undrawn again. The wrapper's `aria-hidden`
follows what is drawn. The prop is read through a ref like `onChange` and `claimArea`, so changing
it never releases a held pointer.

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

## `createLookInput`

```ts
interface LookAngles { yaw: number; pitch: number }
interface LookState extends LookAngles { locked: boolean }
interface LookInputOptions {
  element: HTMLElement;
  onChange: (angles: LookAngles) => void;
  onReset?: () => void;
  onLockChange?: (locked: boolean) => void;
  onLockError?: () => void;
  ownership?: PointerOwnership;
  owner?: string;
  claimArea?: ClaimArea;
  allowMouseDrag?: boolean;
  invertY?: boolean;
  sensitivity?: number;
  pitchLimit?: number;
  initial?: LookAngles;
}
interface LookInput {
  requestPointerLock(): Promise<boolean>;
  getState(): LookState;
  lookBy(delta: LookAngles): void;
  setInvertY(inverted: boolean): void;
  setSensitivity(radiansPerPixel: number): void;
  reset(): void;
  dispose(): void;
}
function createLookInput(options: LookInputOptions): LookInput;
```

The controller listens immediately but requests pointer lock **only** when the caller invokes
`requestPointerLock()` directly from a user gesture. Render a real enable/resume control and call
it there. The returned promise settles `true` on acquisition and `false` on denial, unavailable
support, cancellation or another element acquiring the lock. Concurrent requests share one promise.
An already-owned lock returns `true`; a disposed controller returns `false`.

`onChange` receives fresh absolute angles in radians. Horizontal mouse movement or touch dragging
subtracts from yaw; vertical movement subtracts from pitch. Yaw never wraps or clamps. Pitch clamps
to `[-pitchLimit, pitchLimit]`; its default cap is `PI/2`. `sensitivity` defaults to `0.002` radians
per CSS pixel and must be finite and positive. `initial` defaults to zero angles, must be finite,
and its pitch is clamped immediately. Non-finite movement is ignored. Heading survives every reset.
There is no animation loop or persisted state.

Unlocked mouse movement does nothing unless `allowMouseDrag: true` opts in to primary-button
mouse drag. This fallback needs no permission and remains available after pointer-lock denial. It
never requests lock automatically: pressing, dragging, cancelling and retrying are independent of
`requestPointerLock()`. The browser captures that mouse pointer on the host, so releasing outside
the host still ends the gesture. A failed capture releases the claim immediately. Capture loss,
buttons no longer being held, pointer cancellation, ownership release and lifecycle clearing all
end that drag. Lock acquisition drops its captured drag before relative deltas begin, preventing
absolute and relative movement from being counted twice.

Touch look and optional mouse drag claim one pointer after the host rectangle,
interactive-control exclusions (including editable content), and optional `claimArea` pass. Pen
never begins a drag; mouse defaults to disabled. Touch and mouse share one active gesture slot. Use disjoint joystick/look claim areas with
the same registry. `ownership` defaults to `pointerOwnership`; `owner` defaults to a unique generated
name. If supplying names, use different names for different subsystems. A second pointer cannot
steal or end the current gesture. Pointer end, cancellation or an externally released claim stops
only the corresponding look drag; movement and action pointers retain their owners. The host should
set `touch-action: none` so native scrolling does not cancel a gameplay drag. `claimArea` receives
both pointer types: a consumer can allow the full viewport for mouse while partitioning touch by
checking `event.pointerType` in that predicate.

`onReset` lets the game clear held movement/actions after Escape, window blur, lock loss, denial,
`reset()` or disposal. Lock acquisition retains keyboard movement. `onLockChange` reports only this
controller's lock-state transitions. `onLockError` reports a failed pending request, without exposing
browser-specific error text. Escape and blur release this element's lock. `reset()` cancels a touch
and any pending acquisition but retains an already-active lock. Dispose releases this element's
active lock and listeners; it never exits another element's lock. A cancelled pending acquisition
keeps only result listeners until the browser replies, exits a late grant, and resolves `false`.
An older request's promise rejection cannot reject a later attempt.

`getState()` returns a fresh `{ yaw, pitch, locked }` object. Connect `onChange` to your camera state
and `onReset` to your held-action store; the package never imports a renderer or decides gameplay.
Call `dispose()` when the host leaves its scene. Multiple controllers use their own document/window
and do not react to another controller's lock errors or clear another owner's pointers.

The keyboard co-map clears its last held vector on Escape, blur, loss/transfer of an existing
pointer lock, disabling or unmount. Acquisition does not clear it. Changing only `onChange` preserves
held input and routes subsequent changes to the latest callback.

### Live look preferences and semantic commands

`invertY` defaults to `false`. Setting it to `true` reverses only the vertical physical deltas from
locked mouse movement, captured mouse dragging and touch dragging. It never changes yaw, keyboard
movement vectors, the current heading or the pitch bounds. `setInvertY(boolean)` changes that policy
for subsequent physical movement without cancelling a held gesture, releasing any pointer owner,
requesting pointer lock or calling `onReset`/`onChange`.

`setSensitivity(number)` similarly applies a new positive finite radians-per-CSS-pixel value to
subsequent physical movement, without resetting input or heading. An invalid value throws
`RangeError` and preserves the previous value. The application owns preference persistence; the
controller stores these values only in memory.

`lookBy({ yaw, pitch })` adds semantic camera-angle offsets in radians and applies the same pitch
bounds and unbounded yaw as pointer movement. It bypasses physical inversion and pixel sensitivity:
a named keyboard or HTML control for looking up must keep its declared direction when physical
vertical input is inverted. Consumers convert their own turn/radian units at the boundary and route
those semantic commands here instead of reimplementing angle accumulation or recreating a
controller. It calls `onChange` with fresh absolute angles and preserves held pointer ownership and
lock state. Non-finite deltas and commands after disposal are ignored. This method does not map keys
or decide when a game allows a command.

## `createTapInput`

```ts
interface TapInputOptions {
  element: HTMLElement;
  claimArea?: ClaimArea;
  ownership?: PointerOwnership;
  ignoreOwners?: readonly string[];
  maxDistance?: number;
  maxDuration?: number;
  onTap: (event: PointerEvent) => void;
}
interface TapInput {
  reset(): void;
  dispose(): void;
}
function createTapInput(options: TapInputOptions): TapInput;
```

Observes mouse primary-button, touch and pen taps, delivering the original `pointerup` exactly
once. It does not claim ownership, capture pointers, prevent browser defaults, synthesize clicks,
request pointer lock or submit game actions. `maxDistance` defaults to 8 CSS pixels, must be finite
and nonnegative, and measures maximum excursion from the press, including coalesced move samples
and the release position. Moving away and back is a drag, even if the final distance is zero.

`maxDuration` is the longest press, in milliseconds, that still counts as a tap. A longer press
reports nothing, so a tap and a [`createPressHoldInput`](#createpressholdinput) on the same
contact never both act: give the tap a `maxDuration` no longer than the hold's `holdMs`. It must be
positive (`RangeError` otherwise) and defaults to unbounded, which keeps the earlier behavior.

`ignoreOwners` names owners in `ownership` (default: the shared `pointerOwnership`) whose pointers
are never taps. A press already claimed under one of those names is not followed and cancels no
other tap. The tap observer otherwise reports a tap whoever holds the pointer, the stick and look
included, so a clean tap in the stick's zone still works; list only the owners of gestures that
consume the press themselves, such as a [`createPressDragInput`](#createpressdraginput) claim. The
claim must already exist when the `pointerdown` reaches the host, so the claimer must claim in the
window capture phase, as a press-drag does.

Presses and releases must be inside a connected, nonzero-size host and pass `claimArea` when
provided. Interactive controls, editable content and `[data-joystick-ignore]` are excluded. Use
`claimArea` to exclude movement controls; a finger held outside the eligible region does not cancel
an action-region tap. Nonprimary touch contacts are accepted, allowing a second finger to tap
while the first holds the movement joystick. Two overlapping eligible region contacts cancel each
other, including the last remaining contact; no tap is emitted until a fresh single press.

Cancellation, capture loss and window blur discard the affected candidate or all held candidates.
A missing-button mouse move cancels its candidate. Call `reset()` when opening an overlay,
changing focus/input mode or replacing a scene, so a held press cannot act after the transition.
Call `dispose()` on unmount; it removes all listeners and is safe to repeat. There is no click or
double-click listener: repeated release events cannot repeat a tap. Separate completed taps each
produce their own callback.

While this host owns pointer lock, mouse client coordinates remain fixed. The observer instead
accumulates `mousemove` relative deltas from each mouse press and retains maximum excursion. A
locked out-and-back look drag therefore cannot fire a tap at the new aim. Relative deltas are
consumed once from `mousemove`, rather than double-counting matching `pointermove` events. Any
`pointerlockchange` discards held candidates, so acquisition or loss cannot complete an old press.

The observer shares a gesture with `createLookInput`: movement beyond the threshold becomes look
without a tap, while a stationary release can become an action. Capture-phase window listeners
observe release before look's bubble-phase cleanup releases mouse capture. Registration order does
not change that result. A camera or world binding belongs to the caller; under pointer lock the
caller may use its current center ray instead of the event's absolute coordinates.

## `createPressDragInput`

```ts
interface PressDragPoint {
  pointerId: number;
  pointerType: string;
  originX: number;
  originY: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  stepX: number;
  stepY: number;
}
type PressDragEndReason = "tap" | "drag" | "cancel";
interface PressDragEnd extends PressDragPoint {
  reason: PressDragEndReason;
}
interface PressDragInputOptions {
  element: HTMLElement;
  hitTarget: ClaimArea;
  ownership?: PointerOwnership;
  owner?: string;
  maxDistance?: number;
  allowMouse?: boolean;
  allowControls?: boolean;
  cancelOnSecondPointer?: boolean;
  onPress?: (point: PressDragPoint) => void;
  onDragStart?: (point: PressDragPoint) => void;
  onDrag?: (point: PressDragPoint) => void;
  onEnd?: (end: PressDragEnd) => void;
}
interface PressDragInput {
  reset(): void;
  dispose(): void;
}
function createPressDragInput(options: PressDragInputOptions): PressDragInput;
```

A press that begins on a target you supply and then either releases in place or drags. The target
is `hitTarget`, called with the `pointerdown` and the host's rectangle, the same shape as a
[`ClaimArea`](#claimwidthfraction), so a game can hit-test a world object, a drawn handle or a
screen region its own way. The recognizer reports the press and the drag; what they mean (a preview
cell, a run of pieces) is yours.

It shares pointer ownership with the stick, look and camera. It claims the `pointerdown` in the
**window capture phase**, ahead of the stick (window bubble), look and the camera (host bubble) and
ahead of the tap and hold observers (host capture), so by the time any of them sees the press it
already belongs to `owner` in `ownership`: the stick and look find their claim refused, and a tap or
hold given `ignoreOwners: [owner]` does not follow it. Give the recognizer an `owner` of your own to
name in `ignoreOwners`; the default is a unique generated name.

The press is claimed only if all of these hold, in this order, and the ownership claim is last, so
a press the recognizer would not take holds nothing and is neither prevented nor reported:

1. The pointer is touch or pen, or a mouse with `allowMouse`, and the primary button.
2. No press is already held. While one is, another pointer ends it with `"cancel"` (the default,
   `cancelOnSecondPointer`) or is left to the stick, look and camera (`false`). The other pointer is
   never claimed by this recognizer either way.
3. The target is not a control, link, summary, editable content or `[data-joystick-ignore]`
   subtree. These are checked before `hitTarget`, so a world hit under a HUD button never wins.
   With `allowControls` a `button`, `a`, `summary` or `[role="button"]` is allowed, for a target
   that is itself such a control (a badge); inputs, selects, textareas, editable content and
   `data-joystick-ignore` stay excluded, and the control's own click is not suppressed.
4. The press is inside a connected, nonzero-size host rectangle, and `hitTarget` returns `true`.
5. `ownership` grants the claim. A mouse is also captured on the host; a refused capture releases
   the claim and starts nothing.

The claimed press is prevented, so set `touch-action: none` on the host.

| Callback | When |
| --- | --- |
| `onPress` | The press was claimed, at its origin. |
| `onDragStart` | The press first moved more than `maxDistance` (default 8 CSS pixels; finite and nonnegative, `RangeError` otherwise) from its origin. |
| `onDrag` | Every move after that, including the one that started the drag. Fired right after `onDragStart` for that move. |
| `onEnd` | Once, after the claim is released, with `reason`: `"tap"` for a release that never passed `maxDistance`, `"drag"` for a release after it did (moving back onto the origin does not undo a drag), `"cancel"` for everything else. |

Every callback receives where the press began (`originX`, `originY`), where it is (`x`, `y`), the
offset between them (`dx`, `dy`) and how far it moved since the previous callback of this press
(`stepX`, `stepY`; from the origin for the first), so a game can pace a run by travel, say one cell
per 24 CSS pixels, without keeping its own last position. The release position counts as a move
before the end is reported.

A press ends with `"cancel"` on `pointercancel`, lost pointer capture, window `blur`, a
`pointerlockchange`, its claim being released from the registry by anyone, a mouse move with no
button held, a lift by another button, the host leaving the document, `reset()` and `dispose()`.
`reset()` ends a held press and is safe when idle; `dispose()` does the same, then removes every
listener and is safe to repeat.

Under pointer lock a mouse press keeps its fixed client coordinates, so the recognizer follows the
relative `mousemove` movement instead: `x` and `y` are the origin plus the accumulated movement.
`hitTarget` still receives the locked `pointerdown`, so a game can answer it from its centre
reticle. Look still turns with the same mouse movement under lock, because pointer-lock look is not
a claimed drag; that is intended, since the player aims the run by turning.

```ts
const drag = createPressDragInput({
  element: viewport,
  owner: "placement-run",
  hitTarget: (event) => previewContains(event.clientX, event.clientY),
  onDrag({ dx, dy }) {
    extendRunTo(dx, dy);
  },
  onEnd({ reason }) {
    if (reason === "drag") commitRun();
    else if (reason === "tap") confirmPreview();
  },
});
const tap = createTapInput({ element: viewport, ignoreOwners: ["placement-run"], onTap });
```

## `createPressHoldInput`

```ts
interface PressHold<T = undefined> {
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  target: T;
}
interface PressHoldInputOptions<T = undefined> {
  element: HTMLElement;
  claimArea?: ClaimArea;
  ownership?: PointerOwnership;
  ignoreOwners?: readonly string[];
  target?: (event: PointerEvent, rect: ClaimRect) => T | null | undefined;
  holdMs?: number;
  maxDistance?: number;
  onHold: (hold: PressHold<T>) => void;
}
interface PressHoldInput {
  reset(): void;
  dispose(): void;
}
function createPressHoldInput<T = undefined>(options: PressHoldInputOptions<T>): PressHoldInput;
```

Observes a press that stays put and calls `onHold` once, `holdMs` after the press, with the press
position (client coordinates) and the `target` decided when it began. Like
[`createTapInput`](#createtapinput) it does not claim ownership, capture pointers or prevent
browser defaults, so the same finger can be a stick or a look drag while it holds.

`holdMs` defaults to 500 and must be finite and positive; `maxDistance` defaults to 8 CSS pixels
and must be finite and nonnegative (`RangeError` otherwise). A press is held only while all of the
following stay true, and the hold is then discarded for good:

- It began on a connected, nonzero-size host, as a primary-button mouse, touch or pen press that
  passed `claimArea` and is not on an interactive control, editable content or
  `[data-joystick-ignore]`.
- It never moved more than `maxDistance` from where it began, counting coalesced samples
  and, under pointer lock, relative mouse movement.
- No other eligible press began while it was held. Two overlapping presses cancel each other, as
  they do for taps; a press that fails the checks above, or has no `target`, is independent.
- It was not cancelled, did not lose capture, the window did not blur, the pointer lock did not
  change, and `reset()` or `dispose()` was not called.

`target` is called once, at the press, with the `pointerdown` and the host's rectangle. Return what
a hold on that press should act on (an entity, a cell, an id), or `null` or `undefined` to leave the
press alone: it is then not held and does not cancel another hold. The result is fixed for the
press, so a target that moves out from under a still finger is still the target. Omit `target` to
hold anywhere; `hold.target` is then `undefined`.

`ignoreOwners` and `ownership` work as for [`createTapInput`](#createtapinput): a press already
claimed under a listed owner is not followed.

A release after a hold is still a clean release for `createTapInput`; set its `maxDuration` below
`holdMs` so a hold ends without a tap.

```ts
const hold = createPressHoldInput({
  element: viewport,
  target: (event) => entityUnder(event.clientX, event.clientY),
  onHold({ target, x, y }) {
    openMenuFor(target, x, y);
  },
});
const tap = createTapInput({ element: viewport, maxDuration: 500, onTap });
```

## Camera gesture maths

```ts
interface CameraPoint { x: number; y: number }
interface TwoFingerGesture {
  pan: CameraPoint;
  scale: number;
  twist: number;
  center: CameraPoint;
}
const DEFAULT_WHEEL_STEP: 1.0015;

function twoFingerGesture(
  before: readonly [CameraPoint, CameraPoint],
  after: readonly [CameraPoint, CameraPoint]
): TwoFingerGesture;
function normalizeWheelDelta(delta: number, deltaMode: number, pageSize: number): number;
function wheelZoomScale(pixels: number, step: number): number;
```

The pure arithmetic behind camera pan, pinch, twist and wheel zoom, free of the DOM, React and any
renderer. It is also what `createCameraPanZoomInput` uses, so a game that drives its own pointer
handling can reuse the exact numbers. One set of conventions covers every function and every
`CameraGestureChange` the controller emits:

- Points and pans are CSS pixels with y pointing down. A **pan** is how far the contact, or the
  fingers' midpoint, moved since the last step. The content under the finger follows it, so a
  camera that grabs the ground subtracts it, or inverts it to move the viewpoint instead.
- A **scale** is a ratio: 1 is unchanged and above 1 is zoom in (fingers spreading, the wheel
  scrolled up). A camera that stores a distance, or "units across", divides by it. This is the
  reciprocal of the span ratio some hand-rolled cameras pass to their zoom function.
- A **twist** is radians in `[-PI, PI]`, positive clockwise on screen: the way an angle grows when y
  points down. A camera whose yaw turns the opposite way subtracts it.

`twoFingerGesture(before, after)` measures one step of two fingers that keep their identity
(`before[0]` and `after[0]` are the same finger). `pan` is the displacement of the midpoint, `scale`
is the new span over the old, `twist` is the change of the angle between the fingers wrapped the
short way, and `center` is the new midpoint, the point to zoom or turn about. A finger pair with no
span before or after has no direction, so `scale` is 1 and `twist` is 0 for that step instead of
`NaN` or a spurious half-turn.

`normalizeWheelDelta(delta, deltaMode, pageSize)` returns a wheel delta in pixels whatever the
device reports: `deltaMode` 0 is pixels already, 1 is lines (16 pixels each, which is what Firefox
mice report) and 2 is pages (`pageSize` pixels each). Any other mode is read as pixels.

`wheelZoomScale(pixels, step)` is `step ** -pixels`: scrolling up (negative pixels) zooms in.
`DEFAULT_WHEEL_STEP` is `1.0015`, one pixel of travel scaling the view by that factor, so a line of
16 pixels is about 2.4% and a notch of 100 pixels about 16%. The step is a multiplicative base
rather than a natural-log rate so that numbers tuned in a camera that used `1.0015 ** pixels`
carry over exactly.

## `createCameraPanZoomInput`

```ts
type CameraGestureSource = "drag" | "pinch" | "wheel";
type CameraGestureEnd = "release" | "cancel";
interface CameraGestureChange {
  source: CameraGestureSource;
  pan: CameraPoint;
  scale: number;
  twist: number;
  anchor: CameraPoint;
}
interface CameraPanZoomInputOptions {
  element: HTMLElement;
  onChange: (change: CameraGestureChange) => void;
  onEnd?: (reason: CameraGestureEnd) => void;
  ownership?: PointerOwnership;
  owner?: string;
  claimArea?: ClaimArea;
  allowMouseDrag?: boolean;
  allowWheel?: boolean;
  wheelStep?: number;
  panFromControls?: boolean;
  maxDistance?: number;
}
interface CameraPanZoomInput {
  reset(): void;
  dispose(): void;
}
function createCameraPanZoomInput(options: CameraPanZoomInputOptions): CameraPanZoomInput;
```

A renderer-neutral camera input for mobile-first games: drag to pan, pinch to zoom, optional twist,
and on desktop a mouse drag and the wheel. It emits steps and nothing else. It has no camera model,
animation loop, storage or renderer dependency; what a pan, scale and twist mean for your camera is
yours (see the conventions under [Camera gesture maths](#camera-gesture-maths)).

Each `CameraGestureChange` is one step, not a running total:

| `source` | Cause | `pan` | `scale` | `twist` |
| --- | --- | --- | --- | --- |
| `"drag"` | One claimed pointer moved (a finger, or a mouse with `allowMouseDrag`) | The pointer's displacement | 1 | 0 |
| `"pinch"` | One of two claimed fingers moved | The midpoint's displacement | The span ratio | The angle change, radians |
| `"wheel"` | A wheel turn (with `allowWheel`) | Zero | `wheelStep ** -pixels` | 0 |

`anchor` is the focal point after the step, in the element's own CSS pixels with the origin at its
top-left: the pointer, the fingers' midpoint or the wheel cursor. `anchor - pan` is where it was
before the step, which is what a camera needs to drag the ground under a finger, and `anchor` is
where to zoom about. A step that changes nothing (a move to the same position, a wheel with no
vertical travel) is not reported. Twist is always reported for a pinch; a camera that does not
rotate ignores it.

### Camera pointer rules

- A `pointerdown` is claimed only if the pointer is a touch (or a mouse, with `allowMouseDrag`), is
  the primary button, is not already held, the event target is not interactive, the press is inside
  the host rectangle, `claimArea` (when given) accepts it, and the pointer is not owned by anyone
  else in `ownership`. The checks run in that order and the ownership claim is last, so a press the
  camera would not take never holds a claim and is neither prevented nor reported. Pen never pans,
  as with look.
- Interactive targets are the same as for look and tap input: controls, links, summaries, editable
  content and `[data-joystick-ignore]`, unless `panFromControls` frees controls and links (below).
- `panFromControls` lets a pan start on a `button`, `a`, `summary` or `[role="button"]`, for a canvas
  of controls such as graph nodes drawn as buttons. Such a press is claimed at once, so the stick
  and look cannot take it, but it is **not yet a pan**: no step is reported, it is not prevented, and
  a mouse is not captured (capturing at the press would redirect the control's own click away from
  it). Released after moving no more than `maxDistance` (default 8 CSS pixels, finite and
  nonnegative; `RangeError` otherwise) it is an ordinary click and `onEnd` is not called. The first
  move past `maxDistance` makes it a pan: the mouse is captured, and the step reports the whole
  displacement from where the press began, so the ground stays under the finger. When that pan is
  released, the **next click that lands inside that control** is swallowed (`preventDefault` and
  `stopImmediatePropagation` in the window capture phase), once. The suppression ends on the first
  such click, on the next `pointerdown`, after 400 ms, or on `dispose()`, so a later real click is
  never eaten. A cancelled pan swallows nothing, since the browser sends no click. A second finger
  never waits: it turns a waiting press on a control into the first finger of a pinch, and a second
  finger that lands on a control is a pinch finger straight away; their clicks are swallowed too.
  Inputs, selects, textareas, editable content and `data-joystick-ignore` subtrees never start a
  pan. The wheel then zooms over these controls as well. Set `touch-action: none` on the host (it
  applies to its children) so native scrolling does not cancel a touch pan that begins on a control.
- The camera claims **up to two** pointers: one pans, two pinch. A third finger is never claimed.
  A second finger must pass `claimArea` and ownership like the first. When it does not (it landed in
  the stick's zone, or a station holds it) the first finger carries on panning, unaffected.
- A mouse drag is exclusive: a mouse press is refused while a touch is held and a touch is refused
  while a mouse is held. The mouse pointer is captured on the element after claiming, so releasing
  outside the host still ends the drag. A failed capture releases the claim and starts nothing.
- When one of two fingers lifts or is cancelled, the other continues as a one-finger pan from where
  it is, with no jump.
- Claimed presses and their moves are prevented, so set `touch-action: none` on the host to stop
  native scrolling and zoom from cancelling the gesture.
- `owner` defaults to a unique generated name, so two cameras never take one pointer; supply
  different names for different subsystems if you name them. `ownership` defaults to the shared
  `pointerOwnership`.

```tsx
// Left 40% steers with the stick; the rest pans and pinches the camera.
const ownership = createPointerOwnership();
<FloatingJoystick ownership={ownership} claimArea={claimWidthFraction("left", 0.4)} onChange={onMove} />;

const camera = createCameraPanZoomInput({
  element: viewport,
  ownership,
  claimArea: claimWidthFraction("right", 0.6),
  allowMouseDrag: true,
  allowWheel: true,
  onChange({ pan, scale, twist, anchor }) {
    // Keep the ground point under `anchor - pan` under `anchor`, then zoom and turn about it.
  },
  onEnd(reason) {
    if (reason === "release") startInertia();
  },
});
```

### Wheel

With `allowWheel: true` the wheel zooms about the cursor, using a non-passive listener on the host.
The delta is normalised to pixels from pixel, line and page modes first
(`normalizeWheelDelta`, with the host's height as a page), then scaled by `wheelStep`, which
defaults to `DEFAULT_WHEEL_STEP` and must be finite and above 1 (`RangeError` otherwise). Browsers
report a trackpad pinch as a ctrl-wheel, so it zooms through the same path. The wheel is not a
pointer, so `claimArea` and ownership do not apply to it; wheel events on interactive targets are
left alone. `preventDefault` is called only when a step is actually reported, so a horizontal-only
scroll, a zero delta or an overflowing delta still scrolls the page. It never turns the wheel
into a pan.

### Ending and cancelling

`onEnd(reason)` is called once when the last held contact ends. `"release"` means a finger or mouse
button lifted, the time a camera may coast. `"cancel"` means the gesture was taken away, and a
camera should stop: `pointercancel`, lost pointer capture, the claim being released from the
registry by anyone (`release`, `releaseAll`, `clear`, or the registry's own blur handling), window
`blur`, a window `resize` or `orientationchange`, the host's size changing (a `ResizeObserver`
where the window has one; a notification with no size change does not cancel), the host leaving the
document (seen at its next move or lift, which then reports `"cancel"` even for a lift), `reset()`
and `dispose()`. Window `blur` means the window losing focus, not an element inside it losing focus. A cancel of one finger of two drops only that finger; the
other keeps its claim and the gesture continues. Cancel always releases this camera's claims, and
never another owner's.

`reset()` cancels every held gesture and calls `onEnd("cancel")` if one was held; it is safe when
idle. `dispose()` does the same, then removes every listener, unsubscribes from the registry and
disconnects the observer. It is safe to repeat. Call it when the host leaves its scene.
