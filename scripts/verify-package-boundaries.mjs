import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratchPrefix = join(tmpdir(), "arcade-input-joystick-");
const scratchDir = mkdtempSync(scratchPrefix);
if (!scratchDir.startsWith(scratchPrefix)) {
  throw new Error(`refusing to clean unexpected scratch path: ${scratchDir}`);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const environment = {
  ...process.env,
  npm_config_audit: "false",
  npm_config_fund: "false",
};
for (const key of ["npm_config_auto_install_peers", "npm_config_recursive"]) {
  delete environment[key];
}

const run = (command, args, cwd) => {
  execFileSync(command, args, { cwd, env: environment, stdio: "inherit" });
};

try {
  run(npmCommand, ["pack", packageDir, "--pack-destination", scratchDir], packageDir);
  const tarball = readdirSync(scratchDir).find((entry) => entry.endsWith(".tgz"));
  if (!tarball) throw new Error("npm pack did not produce a tarball");

  const consumerDir = join(scratchDir, "react-19-consumer");
  mkdirSync(consumerDir);
  writeFileSync(
    join(consumerDir, "package.json"),
    `${JSON.stringify({ name: "input-joystick-smoke", private: true, version: "0.0.0" }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  run(
    npmCommand,
    [
      "install",
      join(scratchDir, tarball),
      "react@19.2.8",
      "react-dom@19.2.8",
      "--ignore-scripts",
    ],
    consumerDir,
  );

  const assertion =
    "const j=ENTRY;const p=require('@arcade-cabinet/input-joystick/package.json');if(p.version!=='0.1.1'||typeof j.FloatingJoystick!=='function'||typeof j.normalizeJoystick!=='function'||typeof j.useKeyboardVectorMap!=='function')throw new Error('invalid packed input-joystick surface')";
  run(
    process.execPath,
    ["-e", assertion.replace("ENTRY", "require('@arcade-cabinet/input-joystick')")],
    consumerDir,
  );
  run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      assertion
        .replace("ENTRY", "await import('@arcade-cabinet/input-joystick')")
        .replace(
          "const p=require('@arcade-cabinet/input-joystick/package.json');",
          "const p=(await import('@arcade-cabinet/input-joystick/package.json',{with:{type:'json'}})).default;",
        ),
    ],
    consumerDir,
  );

  console.log("Packed input-joystick ESM/CJS React 19.2.8 consumer passed.");
} finally {
  rmSync(scratchDir, { force: true, recursive: true });
}
