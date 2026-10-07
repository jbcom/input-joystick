# Changelog

## [0.2.2](https://github.com/jbcom/input-joystick/compare/v0.2.1...v0.2.2) (2026-10-07)


### Bug Fixes

* support every maintained Node line (22, 24 and 26) ([cf9183a](https://github.com/jbcom/input-joystick/commit/cf9183ae5e5ea710eb54a8a054ff14180efb7752))
* support maintained Node lines and enforce house CI rules ([ccf87c3](https://github.com/jbcom/input-joystick/commit/ccf87c3b454adffda1d1993a377c91867a0d5b34))

## [0.2.1](https://github.com/jbcom/input-joystick/compare/v0.2.0...v0.2.1) (2026-10-07)

First release on npmjs, as `input-joystick`. Earlier versions were published as
`@arcade-cabinet/input-joystick` to a private registry.

### Features

* publish as the open-source, MIT-licensed `input-joystick` from github.com/jbcom/input-joystick
* ship CommonJS type declarations (`.d.cts`) so `require` consumers resolve the right module shape

### Build

* verify with publint, Are The Types Wrong and a packed-tarball ESM and CommonJS consumer smoke
* release with Release Please and publish with npm provenance by OIDC trusted publishing

## 0.2.0 - 2026-10-07

### Features

* build, test and release the package from its own repository ([b7643f0](https://github.com/jbcom/input-joystick/commit/b7643f0fa4e55701da6344fdfd349d5248c87517))

## 0.1.1 - 2026-07-22

- Validate the package on Node 24, React 19.2.8, Vite 8.1.5, Vitest 4.1.10,
  Playwright 1.61.1, and the current React/Vite test adapters.
- Add deterministic clean builds and a packed ESM/CJS consumer smoke test.
- Document the private-registry and current-upstream completion contracts.

## 0.1.0 - 2026-07-21

- Extract the touch-anywhere joystick, pure normalization math, and optional
  keyboard co-map from a game repository.
