/**
 * prepare-vendor.mjs — provide @deepseek-ai/dsh (with its full dependency
 * tree) under ./vendor, so electron-builder can bundle it into the installer
 * as extraResources. This makes the desktop app fully self-contained: the
 * recipient needs no Node.js, no npm, no dsh install — just double-click.
 *
 * Strategy: copy the machine's npm-global @deepseek-ai/dsh tree when present
 * (fast, exact version, no download); otherwise fall back to a fresh
 * `npm install @deepseek-ai/dsh --prefix vendor`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "vendor");
const REL = join("node_modules", "@deepseek-ai", "dsh");
const DSH_BIN = join(VENDOR, REL, "lib", "bin.js");

if (existsSync(DSH_BIN)) {
  console.log("[prepare-vendor] dsh already present, skipping (delete vendor/ to refresh)");
  process.exit(0);
}

// 1) copy from the npm-global install when available
const globalPrefix = String(execFileSync("npm.cmd", ["prefix", "-g"], { windowsHide: true })).trim();
const globalCandidates = [
  join(globalPrefix, "node_modules", REL),
  join(process.env.APPDATA ?? "", "npm", "node_modules", REL),
  join(process.env.LOCALAPPDATA ?? "", "npm", "node_modules", REL),
  "C:\\Users\\Windows\\nodejs\\node_modules\\" + REL.split("/").join("\\"),
  "C:\\Program Files\\nodejs\\node_modules\\" + REL.split("/").join("\\"),
];
const source = globalCandidates.find((p) => existsSync(join(p, "lib", "bin.js")));
if (source) {
  console.log(`[prepare-vendor] copying global dsh tree:\n  ${source}\n  -> ${join(VENDOR, REL)}`);
  const { spawnSync } = await import("node:child_process");
  mkdirSync(dirname(join(VENDOR, REL)), { recursive: true });
  const cp = spawnSync("robocopy", [source, join(VENDOR, REL), "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/R:1", "/W:1"], { stdio: "inherit", windowsHide: true });
  // robocopy exit codes: 0-7 are success
  if (cp.status === undefined || cp.status > 7) {
    console.error("[prepare-vendor] robocopy failed with code", cp.status);
    process.exit(1);
  }
} else {
  // 2) fall back to a fresh npm install (needs registry access)
  console.log("[prepare-vendor] global dsh not found; installing into vendor/ (large download)...");
  execFileSync("npm.cmd", ["install", "@deepseek-ai/dsh", "--prefix", VENDOR, "--no-audit", "--no-fund"], {
    cwd: ROOT,
    stdio: "inherit",
    windowsHide: true,
  });
}

if (!existsSync(DSH_BIN)) {
  console.error("[prepare-vendor] FAILED: dsh bin.js not found after vendor preparation");
  process.exit(1);
}
console.log("[prepare-vendor] done:", DSH_BIN);
