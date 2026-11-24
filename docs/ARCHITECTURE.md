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
| `src/pressObserver.ts` | The pointer bookkeeping shared by the observers that never claim a pointer: eligibility, maximum excursion (coalesced samples, locked-mouse movement) and every way a held press is discarded. Internal, not exported. |
| `src/tapInput.ts` | The tap observer: a clean release of a press from `pressObserver`, optionally within `maxDuration`. |
| `src/pressHoldInput.ts` | The press-and-hold observer: a timer over a `pressObserver` press, with a target fixed at the press. |
| `src/cameraPanZoomInput.ts` | Plain DOM controller for camera pan, pinch, twist and wheel zoom: up to two owned contacts, optional mouse drag and wheel, cancellation on every loss of the gesture. No React, renderer or camera model. |
| `src/cameraGesture.ts` | Pure two-finger pan, pinch and twist, wheel-delta normalisation and wheel zoom scale. No DOM, no React, no renderer. |
| `src/interactiveTarget.ts` | The interactive-target check (controls, links, editable content, `data-joystick-ignore`) shared by look, tap and camera input. Internal, not exported. `FloatingJoystick` keeps its own narrower list. |
| `src/index.ts` | The public surface; nothing else is importable. |

The math lives in its own module so the curve is unit-testable without simulating pointer events,
and so a game with its own renderer can use it directly. The registry lives apart from the component
for the same reason, and because the arbitration is not the joystick's alone: a station, a look-drag
or a button widget is another owner in the same registry.

## Invariants

1. **One pointer.** While a pointer is claimed, every other `pointerdown` is ignored. A second finger
   is the game's to use. This is the stick's invariant; the camera controller claims up to two (see
   [Camera gesture lifecycle](#camera-gesture-lifecycle)).
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

## Tap intent lifecycle

`createTapInput` is a DOM observer, separate from pointer ownership. It keeps press coordinates and
an irreversible cancellation flag per eligible pointer. Every delivered and coalesced move sample
is checked against the original press, so an out-and-back drag cannot masquerade as a tap. Only
contacts accepted by host/control/claim-area checks enter this set: the movement finger outside
that region does not suppress an action finger, regardless of `isPrimary`. Overlapping eligible
contacts invalidate every member until each ends.

The observer neither captures nor releases pointers. Window capture-phase move, up, cancel and
lost-capture listeners operate before look's bubble-phase end handler. A valid up is removed from
the set before its callback or any look-induced capture release, so reentrant resets and duplicate
ends cannot produce a second action. Cancellation and lifecycle reset do not call `onTap`.
The application owns overlay/focus policy and resets the observer at those transitions, then
disposes it on unmount. No game-specific targets, reach, storage, renderer or world actions live in
this module.

Locked mouse candidates also retain a relative displacement accumulator. The host document's
`mousemove` stream is the sole relative-motion source while that host owns pointer lock; absolute
pointer positions are fixed in that state. Exceeding the same excursion threshold irreversibly
cancels the candidate even if later deltas return to the origin. Touch and pen candidates never
consume mouse deltas. Lock-change events reset the set before another coordinate regime can
complete a held gesture. Neither integration path changes ownership or camera angles.

## Press-and-hold lifecycle

`createPressHoldInput` is the second observer over `src/pressObserver.ts`, the tracker that
`createTapInput` also uses, so the two share one definition of an eligible press, of excursion and
of every way a press is discarded. The tracker neither claims, captures nor prevents anything. The
hold adds one timer per followed press: it starts when the press is registered and is cleared
whenever the press leaves the held set, whether by release, cancel, lost capture, blur, lock change,
`reset()` or `dispose()`, and also when a second press replaces one with the same pointer id. When it
fires it re-checks the press's cancellation flag, so a press cancelled by movement or an overlapping
press after the timer started can never hold, and it reports once: the press stays tracked until it
ends, but the timer is spent.

The target is chosen by the caller's `target` function at the press, inside the tracker's `begin`
step. A press with no target is not followed at all, so it is independent in the same way a press
outside a `claimArea` is, and cancels nothing. Because the hold does not claim, it cannot arbitrate
with a stick or look on the same finger and does not try to: the owner of the pointer is whoever
claimed it, and a still thumb can be a stick and a hold together. A tap that must not follow a hold
uses `maxDuration`, measured by the tracker from the press to the release on the
`performance.now()` clock, so the decision is the same whatever order the two observers were
created in.

## Camera gesture lifecycle

`createCameraPanZoomInput` is a DOM controller over `src/cameraGesture.ts`. It emits steps (pan,
scale, twist, a local anchor) and has no camera model: the game owns the pose, its bounds and its
easing. It follows the ownership protocol of the stick, look and tap input, with one deliberate
difference: the "one pointer" invariant above is the stick's, and the camera claims up to two,
because one finger pans and two pinch. A third finger is never claimed.

A press is claimed after the same checks as look (touch or opt-in mouse, primary button, not
already held, not an interactive target, inside the host, `claimArea`) and the registry claim is
last, so a refused press holds nothing. A second finger faces the same checks. The stick and the
camera therefore split a screen by `claimArea` alone (the left 40% for the stick, the right 60% for
the camera) and by ownership where a finger lands in the wrong zone: a refused second finger
changes nothing and the first keeps panning. Mouse is opt-in and exclusive, so absolute mouse
motion never mixes with a touch pair.

Held contacts live in a map in claim order, each with its last client position. A step is measured
from that position to the new one, so no step depends on a clock or on listener order. With one
contact a step is a drag. With two, the step is `twoFingerGesture` over the old and new pair, and the
fingers keep their identity so a twist is a rotation. When a finger leaves a pair the survivor
continues as a drag from its stored position, so there is no jump. A step that changes nothing is
not reported.

A contact is deleted from the map before its claim is released. The registry's release listener
re-enters the controller, finds the contact gone and returns, so an end is never reported twice
whether it began as a `pointerup`, a `release(id, owner)`, `clear()` or the registry's blur handling.
The window `pointerup` and `pointercancel` listeners run in the capture phase, before the registry's
bubble-phase `attach` handler frees the claim, so a lift is reported as a `"release"` and not
mistaken for a `"cancel"`. `onEnd` is called once, when the last contact goes.

Cancellation is any loss of the gesture the fingers did not intend: `pointercancel`, lost pointer
capture, an ownership release, blur, a window resize or orientation change, the host changing size
and the host leaving the document. The host's size is compared with the last recorded size in the
`ResizeObserver` callback, because that observer reports once as it starts and a no-op notification
must not cancel a gesture that just began. Where the window has no `ResizeObserver`, the window
events still cover rotation and resize. Blur and the layout events cancel only this controller's
contacts; unlike `registry.attach`, they never clear another owner's.

The wheel is not a pointer and does not use the registry. It zooms about the cursor through
`normalizeWheelDelta` and `wheelZoomScale`, ignores `claimArea` (typed on `PointerEvent`), skips
interactive targets, and calls `preventDefault` only when it reports a step. The wheel and a mouse
drag are separate opt-ins (`allowWheel`, `allowMouseDrag`) like every other mouse path in the
package, because both take over default browser behavior.

The camera's own coverage is gated in the jsdom suite, which stubs the observer, capture and
ownership paths so every branch is reachable on any runner. The Chromium suite drives real
`PointerEvent` and `WheelEvent` objects through a `FloatingJoystick` on the left zone and a camera
on the right sharing one registry, and a camera with look.
