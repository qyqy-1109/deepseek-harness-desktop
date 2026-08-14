/**
 * prepare-node.mjs — provide a REAL Node runtime under ./vendor-node for the
 * installer (extraResources → resources/node). dsh web must run under actual
 * Node, not Electron-as-node: its native addons (koffi folder dialog, sharp,
 * node-pty, ...) are ABI-bound to the Node NODE_MODULE_VERSION, which
 * Electron's embedded runtime does not match.
 *
 * Strategy: copy the machine's own node.exe when present (exact ABI match
 * with the installed addons); otherwise download a Node 24 win-x64 build
 * from the npmmirror (with nodejs.org fallback).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "vendor-node");
const OUT_EXE = join(OUT_DIR, "node.exe");

if (existsSync(OUT_EXE)) {
  console.log("[prepare-node] node.exe already present, skipping (delete vendor-node/ to refresh)");
  process.exit(0);
}

async function download(url, dest) {
  console.log(`[prepare-node] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

// 1) copy the machine's own node.exe (exact ABI match)
let copied = false;
try {
  const sysNode = String(execFileSync("node.exe", ["-p", "process.execPath"], { windowsHide: true })).trim();
  if (sysNode && existsSync(sysNode)) {
    mkdirSync(OUT_DIR, { recursive: true });
    const cp = spawnSync("copy", ["/Y", sysNode, OUT_EXE], { shell: true, windowsHide: true, stdio: "ignore" });
    if (cp.status === 0 && existsSync(OUT_EXE)) {
      console.log(`[prepare-node] copied system node: ${sysNode}`);
      copied = true;
    }
  }
} catch {
  /* fall through to download */
}

// 2) download a Node 24 win-x64 zip and extract node.exe
if (!copied) {
  const version = process.versions.node; // e.g. 24.19.0
  const zipName = `node-v${version}-win-x64.zip`;
  const zipPath = join(OUT_DIR, zipName);
  mkdirSync(OUT_DIR, { recursive: true });
  const urls = [
    `https://npmmirror.com/mirrors/node/v${version}/${zipName}`,
    `https://nodejs.org/dist/v${version}/${zipName}`,
  ];
  let lastError;
  for (const url of urls) {
    try {
      await download(url, zipPath);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      console.warn(`[prepare-node] ${url} failed: ${error.message}`);
    }
  }
  if (lastError) throw lastError;
  const unzip = spawnSync("tar", ["-xf", zipPath, "-C", OUT_DIR, `${zipName.replace(".zip", "")}/node.exe`], {
    windowsHide: true,
    stdio: "ignore",
  });
  if (unzip.status !== 0) throw new Error("failed to extract node.exe from archive");
  const extracted = join(OUT_DIR, zipName.replace(".zip", ""), "node.exe");
  const mv = spawnSync("move", ["/Y", extracted, OUT_EXE], { shell: true, windowsHide: true, stdio: "ignore" });
  if (mv.status !== 0) throw new Error("failed to move node.exe into vendor-node");
  console.log(`[prepare-node] downloaded node v${version}`);
}

if (!existsSync(OUT_EXE)) {
  console.error("[prepare-node] FAILED: vendor-node/node.exe missing");
  process.exit(1);
}
console.log("[prepare-node] done:", OUT_EXE);
