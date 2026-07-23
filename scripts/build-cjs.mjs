import { build } from "esbuild";

const packageRoot = new URL("../", import.meta.url);

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
