# Changelog

## [0.7.0](https://github.com/jbcom/input-joystick/compare/v0.6.0...v0.7.0) (2026-11-15)


### Features

* observe tap intent alongside joystick and look ([b71e01a](https://github.com/jbcom/input-joystick/commit/b71e01a8b7946c38c664040e98417840b98d370d))
* observe tap intent alongside joystick and look ([7cb2377](https://github.com/jbcom/input-joystick/commit/7cb237788662d73990cf5020d57b5cd860232ba6))


### Bug Fixes

* clear tap candidates on descendant focus loss ([e9c0006](https://github.com/jbcom/input-joystick/commit/e9c00068e05035782bf5df42d740d43af2672706))

## [0.6.0](https://github.com/jbcom/input-joystick/compare/v0.5.0...v0.6.0) (2026-11-15)


### Features

* support live look preferences and semantic commands ([54699bc](https://github.com/jbcom/input-joystick/commit/54699bca16cf834bbae0f1ddb65ae0110e31de63))
* support live look preferences and semantic commands ([9747419](https://github.com/jbcom/input-joystick/commit/9747419781281f96d07a68ba2707c8ff4e2c9948))

## [0.5.0](https://github.com/jbcom/input-joystick/compare/v0.4.0...v0.5.0) (2026-11-14)


### Features

* add captured mouse drag look fallback ([d0cbc5a](https://github.com/jbcom/input-joystick/commit/d0cbc5a8f5e70d6b3b9bc87af8364d2097b5acac))
* add captured mouse drag look fallback ([8fe52b3](https://github.com/jbcom/input-joystick/commit/8fe52b305ec67b19043de2dd4c0b3ba7a73f8ae6))

## [0.4.0](https://github.com/jbcom/input-joystick/compare/v0.3.0...v0.4.0) (2026-11-14)


### Features

* add intentional pointer lock and independent touch look ([d8d557e](https://github.com/jbcom/input-joystick/commit/d8d557e116ae1f2495e53304da74b5e09e105c4b))
* add intentional pointer lock and independent touch look ([5ac2067](https://github.com/jbcom/input-joystick/commit/5ac2067c178e3c5ca3585e23bfeb58d697d341f9))


### Bug Fixes

* clear disposed look state before asynchronous lock exit ([52b0449](https://github.com/jbcom/input-joystick/commit/52b044905f604ac25fd91730b7669b0d5c2d4d77))

## [0.3.0](https://github.com/jbcom/input-joystick/compare/v0.2.2...v0.3.0) (2026-10-10)


### Features

* claim areas and pointer ownership for the joystick ([608f638](https://github.com/jbcom/input-joystick/commit/608f638a87f91557619103f560c2b979dc91ee19))
* claim areas and pointer ownership for the joystick ([edff1da](https://github.com/jbcom/input-joystick/commit/edff1dad78a796f0b1c5e188c208a59bf4582aca))


### Bug Fixes

* **joystick:** each default stick claims under its own name ([069200f](https://github.com/jbcom/input-joystick/commit/069200f2923fd728f3c6db8f06d9c1faae744120))

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
