# @arcade-cabinet/input-joystick

Touch-anywhere React joystick primitives for canvas games. The package owns
pointer claiming, host hit-testing, interactive-control exclusion, normalized
deadzone math, and an optional keyboard vector map; each game still owns its
input bindings and visual identity.

## Install

```sh
pnpm add @arcade-cabinet/input-joystick react react-dom
```

The package is served by the `arcade-cabinet` Gitea registry on a private network:

```ini
@arcade-cabinet:registry=https://registry.npmjs.org/
```

Registry reads are anonymous. Publishing remains credentialed.

## Currency contract

The package is tested against the React and React DOM, Playwright, Vitest and Vite versions
pinned in `package.json` `devDependencies`, built on Node 26 and run on Node 24 and later. A
private package is not eligible for a feature-complete game while the framework/runtime it wraps
trails latest. Re-test, pack, publish, and adopt a replacement release instead of widening peer
metadata without current-runtime evidence.

## API

- `FloatingJoystick` claims one touch pointer, emits normalized movement, and
  ignores controls marked interactive or `data-joystick-ignore`.
- `normalizeJoystick` provides the pure deadzone/clamp curve.
- `useKeyboardVectorMap` supplies an opt-in WASD/arrow-key co-map.

## Development

Built on the fleet toolchain, Node 26 (`.node-version`) and pnpm 12 (`packageManager`, through
Corepack); the package itself runs on Node 24 and later.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium   # the FloatingJoystick tests run in real Chromium
pnpm verify   # Biome, tsc, jsdom and Chromium tests, the ESM/CJS build, a packed-tarball consumer smoke
```

## Release

Conventional Commits drive release-please; merging its release pull request tags `v<version>`.
The publish job in `.gitea/workflows/release.yml` reconciles on every `main` run: when the manifest
version is tagged but absent from the registry, it verifies at the tag, packs twice and requires byte
identity, publishes those bytes with the organisation secret `NPM_TOKEN` from a
throwaway npmrc, then reruns the consumer smoke against the published version with
`INPUT_JOYSTICK_CONSUMER_SOURCE=@arcade-cabinet/input-joystick@<version>` and an anonymous npm config.
Never edit the `version` field by hand. Why the repository is shaped this way: `docs/decisions.md`.
