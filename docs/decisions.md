---
title: Decisions
description: Why the package and its repository are shaped the way they are.
---

## 2026-10-07: an open-source, unscoped package on npmjs

**Decision.** The package publishes as `input-joystick` on npmjs from `github.com/jbcom/input-joystick`
under the MIT license.

**Why.** Nothing in the package is application-specific: it is a React component, a pure function and
a hook. The unscoped name was free on npmjs. Publishing it openly means every consumer installs it
from the public registry with no extra configuration.

## No overlap with `gesture-audio`

**Decision.** `input-joystick` is a standalone package and is not folded into `gesture-audio`.

**Why.** `gesture-audio` solves browser audio autoplay unlock: a one-shot `click`, `keydown` or
`touchstart` listener that starts a Tone.js context, a bus graph, a sprite resolver and a preferences
bridge. It consumes touch events only as an unlock signal and has no pointer tracking, vector output,
hit-testing or deadzone math. The two share no API and no dependency, and folding a React component
into an audio package would put an unrelated peer dependency on every audio consumer.

## Versioning continues from the registry

**Decision.** The first npmjs version is 0.2.1.

**Why.** 0.1.0, 0.1.1 and 0.2.0 were published to the private registry, so 0.2.1 continues the
sequence without reusing a number that exists elsewhere. Release Please owns versions from here on.

## The default host selector stays

**Decision.** `hostSelector` still defaults to `[data-testid="game-viewport"]`.

**Why.** Changing a default is a breaking change, and existing consumers rely on it. The prop and the
parent-element fallback make it fully overridable; the selector is documented rather than hidden.

## Toolchain: Node 26 by default, all maintained Node lines supported

**Decision.** `.nvmrc` is 26 and `packageManager` is pnpm 12; `engines.node` is `>=22` with no
ceiling, and `@types/node` stays on 24. Node.js 22, 24 and 26 are supported and tested in CI.

**Why.** The package is built where the toolchain is moving, but a library must not reach for an API
its oldest supported consumer lacks. Support follows maintained release lines, rather than claiming
every historical patch supports every development tool. Scripts and hooks never require an exact
Node patch version. All shipped entry points share the same Node support range.

## Chromium is part of `pnpm verify`

**Decision.** `FloatingJoystick` is tested in real Chromium, and CI, the coverage job and the publish
job install it before running the gate.

**Why.** Pointer capture and multi-touch `pointerId` claiming cannot be driven faithfully by jsdom. A
runner without Chromium fails the gate instead of skipping the pointer tests.

## CommonJS is one bundle with mirrored declarations

**Decision.** ESM is the plain `tsc` output. CommonJS is a single esbuild bundle, and every ESM
declaration is mirrored to a `.d.cts` with `.cjs` specifiers.

**Why.** A `require` condition pointing at a `.d.ts` inside a `"type": "module"` package is reported
by arethetypeswrong as masquerading as ESM and gives CommonJS consumers the wrong module shape. The
mirror keeps one source of truth for the types and passes `attw`.

## No `prepublishOnly`

## Repository protection script

**Decision.** `scripts/apply-branch-ruleset.mjs` carries the canonical OSS ruleset script, with
defaults for this repository and `CI / gate;title;Repository Policy / gate;Dependency Review / gate`.
It is excluded from Biome so its canonical formatting is preserved. Run it only when explicitly
authorized to change repository protection. It requires merge commits, resolved review threads and
green checks, protects release tags, and adds no Copilot review or Code Quality rule.

## Publishing verification

**Decision.** Publishing is the `publish` job in `cd.yml`, which verifies at the release tag and runs
`npm publish` by OIDC trusted publishing. `prepack` still builds, so a bare `npm pack` can never ship
a stale or missing `dist`.

**Why.** One publish path, with provenance, that no local machine can drift from.
