/**
 * prepare-pnpm.mjs — stage a self-contained pnpm for the installer.
 *
 * dshmarket (and `dsh plugin`) need `pnpm` on PATH, but end-user machines
 * have no Node/pnpm installed — the desktop app only ships its own bundled
 * Node. This stages the whole pnpm package (self-contained, deps: {}) as:
 *   vendor-pnpm/pnpm.cmd          shim that runs pnpm with the BUNDLED node
 *   vendor-pnpm/runtime/pnpm/...  the pnpm package (bin/ + dist/ + worker)
 * (shipped at resources/pnpm; the app prepends it to PATH for the server).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "vendor-pnpm");
const RUNTIME = join(VENDOR, "runtime", "pnpm");
const OUT_CMD = join(VENDOR, "pnpm.cmd");

function staged() {
  return existsSync(join(RUNTIME, "bin", "pnpm.mjs")) && existsSync(OUT_CMD);
}

if (staged()) {
  console.log("[prepare-pnpm] already staged, skipping (delete vendor-pnpm/ to refresh)");
  process.exit(0);
}

mkdirSync(VENDOR, { recursive: true });
console.log("[prepare-pnpm] installing pnpm (for the installer)...");
execFileSync("npm.cmd", ["install", "pnpm", "--prefix", VENDOR, "--no-audit", "--no-fund"], {
  cwd: ROOT,
  stdio: "inherit",
  windowsHide: true,
  shell: true,
});

const src = join(VENDOR, "node_modules", "pnpm");
if (!existsSync(join(src, "bin", "pnpm.mjs")) || !existsSync(join(src, "dist", "pnpm.mjs"))) {
  console.error("[prepare-pnpm] FAILED: pnpm package incomplete at", src);
  process.exit(1);
}
cpSync(src, RUNTIME, { recursive: true });

// Pure-ASCII shim, single-line ifs (no labels → safe with any line endings):
// run with the bundled node next door (resources/node), else plain `node`.
writeFileSync(
  OUT_CMD,
  [
    "@echo off",
    "set \"NODE_EXE=%~dp0..\\node\\node.exe\"",
    "set \"PNPM_ENTRY=%~dp0runtime\\pnpm\\bin\\pnpm.mjs\"",
    'if exist "%NODE_EXE%" "%NODE_EXE%" "%PNPM_ENTRY%" %*',
    'if not exist "%NODE_EXE%" node "%PNPM_ENTRY%" %*',
    "exit /b %errorlevel%",
    "",
  ].join("\r\n"),
  "utf8",
);

console.log("[prepare-pnpm] done:", OUT_CMD, "+ runtime/");
