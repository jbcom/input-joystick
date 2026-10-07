// CommonJS build: one esbuild bundle for the runtime, plus a .d.cts mirror of every ESM
// declaration for the types.
//
// The "require" condition must not point at a .d.ts inside a "type": "module" package: TypeScript
// reads that file as ESM while the runtime file is CommonJS, which arethetypeswrong reports as
// "Masquerading as ESM" and which gives a CommonJS consumer the wrong module shape. So every
// dist/esm/*.d.ts is copied to dist/cjs/*.d.cts with its relative specifiers pointing at the
// sibling .cjs names, which TypeScript resolves to the sibling .d.cts files.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const packageRoot = new URL("../", import.meta.url);
const esmDir = new URL("dist/esm/", packageRoot);
const cjsDir = new URL("dist/cjs/", packageRoot);

await build({
  absWorkingDir: packageRoot.pathname,
  bundle: true,
  entryPoints: ["src/index.ts"],
  external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  format: "cjs",
  outfile: "dist/cjs/index.cjs",
  platform: "node",
  sourcemap: true,
  target: "node24",
});

await mkdir(cjsDir, { recursive: true });
for (const entry of await readdir(esmDir)) {
  if (!entry.endsWith(".d.ts")) continue;
  const declaration = await readFile(new URL(entry, esmDir), "utf8");
  const cjsDeclaration = declaration.replace(
    /(from\s*|import\s*\()(["'])(\.[^"']+)\.js\2/g,
    "$1$2$3.cjs$2"
  );
  await writeFile(new URL(entry.replace(/\.d\.ts$/, ".d.cts"), cjsDir), cjsDeclaration);
}
