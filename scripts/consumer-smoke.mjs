#!/usr/bin/env node
// Built-tarball consumer smoke: pack the package, install the tarball into a clean scratch consumer
// next to the React the package was tested against, then load the entry point through both ESM
// import and CommonJS require and exercise one call per export. Proves the exports map, the .cjs
// bundle and the files list. With INPUT_JOYSTICK_CONSUMER_SOURCE=input-joystick@<version> it
// installs that published version from npmjs instead (the cold-install check after a release).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "input-joystick";
const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const scratch = mkdtempSync(path.join(tmpdir(), "input-joystick-smoke-"));
const registrySource = process.env.INPUT_JOYSTICK_CONSUMER_SOURCE;

try {
  if (
    registrySource &&
    !/^input-joystick@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(registrySource)
  ) {
    throw new Error(`INPUT_JOYSTICK_CONSUMER_SOURCE must be an exact ${NAME}@<version> spec`);
  }
  const expectedVersion = registrySource ? registrySource.slice(NAME.length + 1) : manifest.version;
  let source = registrySource;
  if (!source) {
    execFileSync("npm", ["pack", "--pack-destination", scratch], {
      cwd: packageRoot,
      stdio: "inherit",
      // npm pack runs "prepare"; installing git hooks is irrelevant to a packaging check.
      env: { ...process.env, SKIP_INSTALL_SIMPLE_GIT_HOOKS: "1" },
    });
    const tarball = readdirSync(scratch).find((file) => file.endsWith(".tgz"));
    if (!tarball) throw new Error("npm pack produced no tarball");
    source = path.join(scratch, tarball);
  }

  const consumer = path.join(scratch, "consumer");
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify({ name: "input-joystick-smoke-consumer", private: true, type: "module" })
  );
  // Anonymous and public-registry only: a user config with npmjs and nothing else, an empty global
  // config, and no inherited npm_config_* or credential-looking variables (pnpm run exports
  // npm_config_* into scripts), so no token or scoped registry on the machine can serve or
  // authenticate this install.
  const userConfig = path.join(scratch, "anonymous.npmrc");
  const globalConfig = path.join(scratch, "empty-global.npmrc");
  writeFileSync(userConfig, "registry=https://registry.npmjs.org/\n");
  writeFileSync(globalConfig, "");
  const anonymousEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^npm_config_/i.test(key) && !/auth|token|secret|password|credential/i.test(key)
    )
  );
  execFileSync(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
      "--userconfig",
      userConfig,
      "--globalconfig",
      globalConfig,
      source,
      `react@${manifest.devDependencies.react}`,
      `react-dom@${manifest.devDependencies["react-dom"]}`,
    ],
    { cwd: consumer, stdio: "inherit", env: anonymousEnv }
  );

  // The component renders to markup on the server (effects do not run), which proves it loads
  // against the consumer's own React; the pure math and the exports are checked directly.
  const assertion = `
    if (pkg.version !== ${JSON.stringify(expectedVersion)}) throw new Error('version ' + pkg.version)
    for (const name of [
      'FloatingJoystick',
      'normalizeJoystick',
      'useKeyboardVectorMap',
      'usePointerOwnership',
      'claimWidthFraction',
      'createPointerOwnership',
    ]) {
      if (typeof api[name] !== 'function') throw new Error('missing export ' + name)
    }
    if (typeof api.pointerOwnership?.claim !== 'function') throw new Error('missing pointerOwnership')
    const registry = api.createPointerOwnership()
    if (!registry.claim(1, 'a') || registry.claim(1, 'b') || registry.ownerOf(1) !== 'a') {
      throw new Error('pointer ownership arbitration')
    }
    const claims = api.claimWidthFraction('left', 0.5)
    const rect = { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }
    if (!claims({ clientX: 49 }, rect) || claims({ clientX: 50 }, rect)) {
      throw new Error('claimWidthFraction')
    }
    const vector = api.normalizeJoystick({ x: 100, y: 0 }, 50, 0.1)
    if (vector.magnitude !== 1 || vector.x !== 1 || vector.y !== 0) {
      throw new Error('normalizeJoystick: ' + JSON.stringify(vector))
    }
    const still = api.normalizeJoystick({ x: 2, y: 2 }, 50, 0.1)
    if (still.magnitude !== 0) throw new Error('deadzone: ' + JSON.stringify(still))
    const markup = renderToString(createElement(api.FloatingJoystick, { onChange() {} }))
    if (!markup.includes('data-floating-joystick="true"')) throw new Error('markup: ' + markup)
  `;
  const esm = `
    import { createElement } from 'react'
    import { renderToString } from 'react-dom/server'
    import * as api from ${JSON.stringify(NAME)}
    import pkg from ${JSON.stringify(`${NAME}/package.json`)} with { type: 'json' }
    ${assertion}
    console.log('esm ok')
  `;
  const cjs = `
    const { createElement } = require('react')
    const { renderToString } = require('react-dom/server')
    const api = require(${JSON.stringify(NAME)})
    const pkg = require(${JSON.stringify(`${NAME}/package.json`)})
    ${assertion}
    console.log('cjs ok')
  `;
  writeFileSync(path.join(consumer, "esm.mjs"), esm);
  writeFileSync(path.join(consumer, "cjs.cjs"), cjs);
  execFileSync(process.execPath, ["esm.mjs"], { cwd: consumer, stdio: "inherit" });
  execFileSync(process.execPath, ["cjs.cjs"], { cwd: consumer, stdio: "inherit" });
  console.info(
    `${NAME}: consumer smoke passed (ESM + CJS) from ${registrySource ?? "the packed tarball"}`
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
