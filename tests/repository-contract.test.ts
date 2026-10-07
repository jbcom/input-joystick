// @vitest-environment node
// The package's own repository is its only home: these assertions keep the manifest, the toolchain
// and the publish path pointing at it, so a copy-paste from a host repo cannot drift back in.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("package.json")) as {
  name: string;
  version: string;
  license: string;
  repository: { type: string; url: string; directory?: string };
  bugs: { url: string };
  packageManager: string;
  engines: Record<string, string>;
  publishConfig: Record<string, unknown>;
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe("repository contract", () => {
  it("is the unscoped open-source package on github.com/jbcom and builds on the current toolchain", () => {
    expect(manifest.name).toBe("input-joystick");
    expect(manifest.license).toBe("MIT");
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/jbcom/input-joystick.git",
    });
    expect(manifest.bugs.url).toBe("https://github.com/jbcom/input-joystick/issues");
    expect(manifest.publishConfig).toEqual({ access: "public", provenance: true });
    expect(read(".nvmrc").trim()).toBe("26");
    expect(manifest.packageManager).toMatch(/^pnpm@12\.\d+\.\d+$/);
    expect(manifest.engines).toEqual({ node: ">=24" });
    expect(manifest.devDependencies["@types/node"]).toMatch(/^\^?24\./);
  });

  it("resolves everything from the public npm registry", () => {
    expect(read(".npmrc").trim().split("\n")).toEqual([
      "registry=https://registry.npmjs.org/",
      "provenance=true",
    ]);
  });

  it("carries no workspace wiring or host-repo paths", () => {
    const sources = [
      "package.json",
      "tsconfig.json",
      "vitest.config.ts",
      "vitest.browser.config.ts",
      "scripts/build-cjs.mjs",
      "scripts/clean.mjs",
      "scripts/consumer-smoke.mjs",
    ];
    for (const file of sources) {
      const text = read(file);
      expect(text, file).not.toMatch(/workspace:|\.\.\/\.\./);
    }
  });

  it("verifies lint, docs, types, coverage, the build, package metadata and the packed consumer", () => {
    expect(manifest.scripts.verify).toBe(
      "pnpm run lint && pnpm run lint:docs && pnpm run typecheck && pnpm run coverage && pnpm run build && pnpm run package:check && pnpm run smoke:consumer"
    );
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain("run: pnpm verify");
    // The FloatingJoystick tests need real Chromium; verify cannot pass on a runner without it.
    expect(ci).toMatch(/playwright install --with-deps chromium\s+- run: pnpm verify/);
  });

  it("publishes from cd.yml by OIDC trusted publishing, with no stored registry token", () => {
    expect(existsSync(path.join(root, ".gitea"))).toBe(false);
    const cd = read(".github/workflows/cd.yml");
    expect(cd).toContain("id-token: write");
    expect(cd).toContain("registry-url: https://registry.npmjs.org");
    expect(cd).toMatch(/playwright install --with-deps chromium[\s\S]+?pnpm verify/);
    expect(cd).toContain("npm publish --access public --provenance");
    expect(cd).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/);
  });

  it("keeps release-please on the single root package at the manifest version", () => {
    const config = JSON.parse(read("release-please-config.json")) as {
      packages: Record<
        string,
        {
          "package-name": string;
          "include-component-in-tag": boolean;
          "bump-minor-pre-major": boolean;
        }
      >;
    };
    expect(config.packages["."]).toMatchObject({
      "package-name": "input-joystick",
      "include-component-in-tag": false,
      "bump-minor-pre-major": true,
    });
    expect(JSON.parse(read(".release-please-manifest.json"))).toEqual({
      ".": manifest.version,
    });
  });
});
