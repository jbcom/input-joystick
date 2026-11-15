---
title: Architecture
description: Module boundaries, invariants and intentional limits.
---

## Modules

| File | Responsibility |
| --- | --- |
| `src/normalizeJoystick.ts` | Pure deadzone, clamp and normalize math. No DOM, no React. |
| `src/FloatingJoystick.tsx` | The component: pointer claiming, host hit-testing, interactive exclusion, claim area, visuals. Calls `normalizeJoystick` and claims through a `PointerOwnership`. |
| `src/claimArea.ts` | `ClaimArea` and `claimWidthFraction`: which presses a stick may claim. Pure, no DOM, no React. |
| `src/pointerOwnership.ts` | The pointer registry: who owns which pointer id. No React; the DOM only through the optional `attach`. |
| `src/usePointerOwnership.ts` | The React hook over the registry, bound to one owner. |
| `src/useKeyboardVectorMap.ts` | The opt-in keyboard co-map. Independent of the component. |
| `src/lookInput.ts` | Plain DOM controller for intentional pointer lock, mouse deltas and one owned touch-look drag. No React or renderer. |
| `src/index.ts` | The public surface; nothing else is importable. |

The math lives in its own module so the curve is unit-testable without simulating pointer events,
and so a game with its own renderer can use it directly. The registry lives apart from the component
for the same reason, and because the arbitration is not the joystick's alone: a station, a look-drag
or a button widget is another owner in the same registry.

## Invariants

1. **One pointer.** While a pointer is claimed, every other `pointerdown` is ignored. A second finger
   is the game's to use.
2. **Window listeners.** Pointer events are listened for on `window`, not on the wrapper, so a drag
   that leaves the host keeps steering and the wrapper can stay `pointer-events: none` over the
   canvas.
3. **Hit-test before claim.** A `pointerdown` is claimed only after the host, rectangle,
   interactive-target and `claimArea` checks pass, so buttons and links keep their taps and a press
   outside the claim area is left alone for look, drag or taps.
4. **A zero vector always ends a gesture.** Pointer end, cancel, a claim released from the registry,
   `disabled` and unmount all call `onChange` with a zero vector, so a game loop that reads the last
   vector can never be left steering.
5. **`onChange` and `claimArea` are read through refs.** A new callback identity does not re-attach
   listeners or release a held pointer.
6. **No host coupling.** The accent color, host selector and label are explicit props. The component
   never reads a CSS custom property or a global.
7. **One owner per pointer.** The stick takes its pointer from the ownership registry as its last
   check, and never takes one another owner holds. A pointer it holds is refused to everyone else
   until it ends, so a finger is a stick, a station grab or a look-drag, never two of them.
8. **The registry is passive until attached.** Importing the package creates the shared registry but
   attaches no listener. A registry releases claims on its own only between `attach` and the matching
   detach; the component and the hook attach while mounted.

## Pointer ownership

Arbitration is by pointer id. A subsystem that wants a finger calls `claim(pointerId, owner)` in its
`pointerdown` handler; a `false` means someone else has it and the subsystem leaves it alone. The
claim ends when the pointer does, which the attached registry sees as `pointerup` or `pointercancel`
on `window` (or `blur`, which ends every claim), and `onRelease` listeners hear about it so a
subsystem can drop its own state for that pointer.

Ordering matters, and it is the application's. The stick listens on `window`, in the bubble phase.
A station or widget that claims in a handler lower in the tree (a canvas, a React `onPointerDown`)
runs first and wins the pointer, and one that also stops propagation hides the press from the stick
altogether. Two `window` listeners for the same press are ordered by registration, so a subsystem
that shares the screen with the stick should be separated from it by a claim area (the stick takes
the left 40%, the look-drag the rest) rather than by listener order.

The registry's own release listeners are also bubble-phase on `window`, after the handlers that saw
the event, so the pointer's existing claim is released once every handler has seen its `pointerup`.
A handler that claims during `pointerup` cannot rely on that listener (whether it runs before or
after the claim depends on where the handler is registered), and neither can one that stops
`pointerup` before it reaches `window`: both must release their own claim, as `API.md` says for
`attach`.

## Performance

The component re-renders only when the visual state changes, once per pointer move while held, and
renders nothing but an empty wrapper otherwise. `onChange` is the hot path; keep it to writing a ref
or a small store and read the value from your game loop.

## Intentional limits

- Touch, pen and (opt-in) mouse via Pointer Events. There is no Touch Events fallback.
- One stick. A dual-stick layout mounts two hosts or keeps the second stick in application code.
- The registry arbitrates pointer ids only. It does not capture pointers, stop propagation or
  decide what a claim means; each subsystem does that.
- A claim area is a predicate, not a layout. The package draws nothing for it, and does not move or
  resize the host.
- The keyboard map reports the latest key, not a combined vector of every held key.
- Styling beyond `accent`, `radius` and `label` belongs to the application.

## Look lifecycle

`createLookInput` owns only DOM input and numeric radian angles. It never requests pointer lock
while mounting, pressing the host, or recovering from a denial. Only an explicit caller request can
start acquisition, so the application controls its permission and resume UI. Lock events establish
success, supporting both promise-returning and older void-returning browser implementations.

A pending attempt has an identity and cancellation flag. Error events or a rejection settle that
attempt without converting a denial into success. A rejected stale promise cannot cancel a newer
request. Reset and disposal mark a pending attempt cancelled; result listeners stay until the
browser answers, and a late acquisition is immediately exited. All other listeners leave on
disposal. Each controller checks its own element against its own document's lock; unrelated locks
and idle error events do not clear its state.

Touch look uses the existing pointer registry with a unique default owner. It claims only after
host, control and claim-area checks. Cancellation, pointer end and registry release operate on that
pointer alone. Escape, blur and lifecycle reset clear held input through `onReset` while retaining
heading. Mouse look consumes deltas only while this controller owns pointer lock. Touch look and
the joystick consume separate pointers without sharing mutable gesture state.

Angle updates are immediate delta integration in radians, with no frame-time scaling: the browser
already supplies a displacement. Yaw remains unbounded, pitch alone clamps, and renderer coordinate
conventions remain the consumer's choice. Keyboard movement clears on lock loss but stays held on
acquisition, so enabling look while walking cannot silently discard the held movement vector.

The real Chromium suite requires native acquisition and Escape release under Linux/Xvfb. macOS
headless Chromium has no focused native view and rejects pointer lock with `WrongDocumentError`
(Playwright issue [20956](https://github.com/microsoft/playwright/issues/20956)); that environment
instead asserts the exact native denial and reset callback. It is not acquisition proof. Browser
processes always use `--mute-audio`; headless execution is enabled only by explicit render-host
configuration, while Linux CI and release verification use Xvfb with headed Chromium.

Mouse drag is an explicit opt-in (`allowMouseDrag`, false by default), using the same gesture state
and ownership checks as touch. It captures the primary mouse pointer after claiming; capture loss,
external ownership release and a move with no held buttons end the gesture. UI controls and editable
content cannot start look. Acquiring pointer lock releases the captured gesture before relative
mouse deltas become active, so the two paths cannot double count a movement. Mouse drag never
requests pointer lock and works after denial without another permission attempt.

Physical and semantic look share one angle accumulator and pitch clamp. Mouse/touch deltas first
pass through the current sensitivity and optional vertical inversion; `lookBy` supplies angular
offsets directly, so semantic directional controls retain their meaning. Live setters change only
the physical-input policy and do not rebuild listeners, drop ownership, alter heading or issue
callbacks. Preferences and persistence remain the consumer's responsibility.
