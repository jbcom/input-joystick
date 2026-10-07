# Agent notes

This file is for an autonomous coding agent working in this repository. It covers what isn't
obvious from reading the code alone.

## Toolchain

- Package manager: pnpm, pinned in `package.json#packageManager`. Use `mise install` (reads
  `mise.toml`) for a matching local Node and pnpm toolchain, or `corepack enable` if mise isn't
  available. Node 26 is the default toolchain (`.nvmrc`); Node.js 22, 24 and 26 are supported.
- This is a pnpm workspace with two members: `.` (the published library) and `docs/` (the private
  Sourcey documentation site). Root-level scripts operate on the library; `pnpm docs:*` scripts
  delegate to `docs/` via `pnpm --filter input-joystick-docs`. Sourcey emits `docs/dist/`, including
  the site `llms.txt` and `llms-full.txt`; the root `llms.txt` is separate, concise
  repository-agent orientation.
- `pnpm verify` is the single gate CI runs: Biome, markdownlint on the published docs, strict
  TypeScript over `src/` and `tests/`, the jsdom and real-Chromium suites at 100% coverage, the ESM
  and CommonJS builds, `publint`, Are The Types Wrong, and a packed-tarball consumer smoke. A change
  is not done while any part of it is red. CI's `docs` job separately runs `pnpm docs:build`.
- Real Chromium is required: `pnpm exec playwright install chromium`.

## Core invariants: do not violate these when editing `src/`

Full detail in `docs/ARCHITECTURE.md`.

1. At most one pointer is claimed at a time; a second pointer never steals or ends the gesture.
2. A `pointerdown` is claimed only after the host, rectangle and interactive-target checks pass.
3. Pointer end, cancel, `disabled` and unmount always report a zero vector.
4. `onChange` is read through a ref; a new callback identity must not re-attach listeners.
5. No host coupling: accent, host selector and label are props, never read from a CSS custom
   property or a global.
6. `normalizeJoystick` stays pure and free of DOM and React.
7. `hostSelector` defaults to `[data-testid="game-viewport"]`. Changing a default is a breaking
   change.

## Keeping docs and tests in sync

A change to the public surface in `src/` needs matching updates in all of:

- `tests/*.test.ts(x)`: coverage is 100% per suite, not "reasonable effort". Pointer behavior goes in
  `tests/FloatingJoystick.test.tsx` (real Chromium); pure logic and hooks go in the jsdom suite.
- `docs/API.md` and `docs/ARCHITECTURE.md`: the authored Sourcey pages and the canonical references.
  Do not create a second documentation renderer or a duplicate page tree.
- `README.md`: if the change affects the quick start or the API table.

## Commits and releases

- Conventional Commits only. A required CI check enforces conventional PR titles and Release Please
  parses the preserved merge-commit history to drive `CHANGELOG.md` and the next version. Never
  hand-edit the changelog or bump a version yourself.
- `pre-commit`, `simple-git-hooks`, `lint-staged` and `commitlint` run locally after `pnpm install`
  (via the `prepare` script). They mirror what CI enforces; don't bypass them with `--no-verify`.
- Merge commits only; squash and rebase are disabled so the branch's own commits are the record.

## Files most likely to surprise you

- `scripts/build-cjs.mjs` bundles CommonJS with esbuild and mirrors every ESM `.d.ts` to a `.d.cts`.
  A new source file needs no change there, but the mirror assumes relative `.js` specifiers.
- `pnpm-workspace.yaml`'s `allowBuilds` map controls which packages' install scripts run; a new
  dependency needing a native build step silently no-ops until it's added.
- `tests/repository-contract.test.ts` pins the manifest, toolchain and publish path. Update it
  deliberately when one of those changes on purpose.
