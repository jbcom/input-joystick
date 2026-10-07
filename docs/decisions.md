# Decisions

## 2026-10-07: moved out of otterly-chaotic into its own repository

**Decision.** `@arcade-cabinet/input-joystick` left `otterly-chaotic/packages/input-joystick`
for `arcade-cabinet/input-joystick`, with its history (`git filter-repo --subdirectory-filter`).
otterly-chaotic now installs it from the registry like any other consumer.

**Why.** The owner: "You shouldn't need other games as dependencies for shared packages."
Inside the game it could only be released through the game's lockfile and workspace, and a
second game could not take the joystick without taking a dependency on otterly-chaotic.

## The repository shape is the fleet package shape

Same as `arcade-cabinet/mobile` and `persistence-save`: `ci.yml` runs `pnpm verify` on every
push and pull request; `release.yml` runs release-please and a publish job that reconciles the
manifest version against tags and the registry, packs twice for byte identity and proves the
published version anonymously. Tags are plain `v<version>`.

Biome uses the style the source was written in (double quotes, semicolons, ES5 trailing commas),
so the move did not reformat it.

## Toolchain: Node 26 and pnpm 12 to build, Node 24 as the floor to run

Built where the fleet is moving. `engines` is `>=24` with no ceiling (it was `>=24 <25`
in the game) and `@types/node` stays on 24: a library must not reach for an API its oldest
supported consumer lacks.

## Chromium is part of `pnpm verify`

`FloatingJoystick` is tested in real Chromium (pointer capture and multi-touch `pointerId`
claiming that jsdom cannot drive). CI and the release job's verify-at-tag step therefore
install it with `playwright install chromium --with-deps` before `pnpm verify`; a runner
without it fails the gate instead of skipping the pointer tests.

## The consumer smoke replaces `verify-package-boundaries`

`scripts/consumer-smoke.mjs` supersedes the in-game boundary script. It reads the version it
asserts from the package (or from `INPUT_JOYSTICK_CONSUMER_SOURCE` for a published version)
instead of hard-coding `0.1.1`, installs the same React the package is tested against, installs
anonymously, and exercises `normalizeJoystick` as well as checking the exports exist.

## No `prepublishOnly`

Publishing is the release workflow's reconcile job, which verifies at the tag and publishes
the already-packed tarball (lifecycle scripts do not run for a tarball). `prepack` still builds,
so a bare `npm pack` can never ship a stale or missing `dist`.

## Versioning continues from the registry

0.1.0 and 0.1.1 were published from the game repository. The manifest starts at 0.1.1 with
`bootstrap-sha` on the last imported commit, so release-please computes the next version from
this repository's own commits.
