// Renames tsc's CJS output from .js -> .cjs (recursively) and rewrites the
// relative require(...) specifiers to match, so the package can ship both
// dist/esm (ESM, .js) and dist/cjs (CJS, .cjs) side by side without a
// bundler. Minimal, dependency-free — matches "tsc is fine, no bundler
// unless needed" from the extraction brief. Source files use explicit `.js`
// relative-import specifiers (required for the ESM build under
// moduleResolution:"bundler"); tsc's CommonJS emit keeps those specifiers
// verbatim, so the CJS pass needs this rewrite to resolve at runtime.
import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const cjsDir = path.resolve(import.meta.dirname, "../dist/cjs");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }
    if (entry.name.endsWith(".js")) {
      const contents = await readFile(full, "utf8");
      const rewritten = contents.replace(
        /(require\(["'])(\.[^"']+)\.js(["']\))/g,
        "$1$2.cjs$3"
      );
      await writeFile(full, rewritten);
      await rename(full, full.replace(/\.js$/, ".cjs"));
    } else if (entry.name.endsWith(".js.map")) {
      await rename(full, full.replace(/\.js\.map$/, ".cjs.map"));
    }
  }
}

await walk(cjsDir);
