# @arcade-cabinet/input-joystick

Touch-anywhere React joystick primitives for canvas games. The package owns
pointer claiming, host hit-testing, interactive-control exclusion, normalized
deadzone math, and an optional keyboard vector map; each game still owns its
input bindings and visual identity.

## Install

```sh
pnpm add @arcade-cabinet/input-joystick@0.1.1 react@19.2.8 react-dom@19.2.8
```

The package is served by the LAN Gitea registry:

```ini
@arcade-cabinet:registry=https://registry.npmjs.org/
```

Registry reads are anonymous. Publishing remains credentialed.

## Currency contract

Version 0.1.1 is tested against React and React DOM 19.2.8, Playwright 1.61.1,
Vitest 4.1.10, Vite 8.1.5, and Node 24. A private package is not eligible for a
feature-complete game while the framework/runtime it wraps trails latest.
Re-test, pack, publish, and adopt a replacement release instead of widening
peer metadata without current-runtime evidence.

## API

- `FloatingJoystick` claims one touch pointer, emits normalized movement, and
  ignores controls marked interactive or `data-joystick-ignore`.
- `normalizeJoystick` provides the pure deadzone/clamp curve.
- `useKeyboardVectorMap` supplies an opt-in WASD/arrow-key co-map.

Run `pnpm verify` from this package to typecheck, execute jsdom and real-Chromium
tests, build ESM/CJS artifacts, then install and import the packed tarball from a
fresh React 19.2.8 consumer.
