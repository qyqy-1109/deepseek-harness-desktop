/**
 * dsh-server.mjs — spawn/manage the `dsh web` server, pure Node (no Electron
 * imports), so the exact same code runs in the desktop app and in tests.
 */
import { spawn, execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const SERVER_START_TIMEOUT_MS = 90_000;

/**
 * Resolve the first executable found for `name` on PATH.
 * On Windows, prefer a real .exe/.cmd/.bat shim over an extension-less hit.
 */
export function resolveOnPath(name) {
  return new Promise((resolve) => {
    const probe = process.platform === "win32" ? "where.exe" : "which";
    execFile(probe, [name], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      if (err) return resolve(null);
      const lines = String(stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (lines.length === 0) return resolve(null);
      const preferred = process.platform === "win32"
        ? lines.find((l) => /\.(exe|cmd|bat)$/i.test(l)) ?? lines[0]
        : lines[0];
      resolve(preferred);
    });
  });
}

/**
 * On Windows, an npm-style shim (`<dir>\dsh.cmd`) is just
 * `node <dir>\node_modules\@deepseek-ai\dsh\lib\bin.js %*`. Resolving it to a
 * direct `node.exe` spawn avoids cmd.exe/PATHEXT entirely — no shell quoting,
 * no dependency on ComSpec, and it works identically in the packaged app.
 */
function tryResolveShim(dshPath, port) {
  if (process.platform !== "win32") return null;
  if (!/\.(cmd|bat)$/i.test(dshPath)) return null;
  const dir = dirname(dshPath);
  const bin = join(dir, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  if (!existsSync(bin)) return null;
  const nodeExe = join(dir, "node.exe");
  const node = existsSync(nodeExe) ? nodeExe : "node";
  console.log(`[dsh-server] shim ${dshPath} -> ${node} ${bin}`);
  return { cmd: node, args: [bin, "web", "--port", String(port)], shell: false };
}

/**
 * Resolve the command used to boot `dsh web`.
 * Priority:
 *   1. a BUNDLED dsh (installer-shipped, see prepare-vendor.mjs) — run via
 *      process.execPath with ELECTRON_RUN_AS_NODE=1 (Electron doubles as a
 *      plain Node runtime; under plain node, execPath IS node, so the same
 *      code path works in tests). Fully self-contained: no PATH/install.
 *   2. $DSH_BIN env override
 *   3. `dsh` shim on PATH (resolved to node+bin.js directly)
 *   4. `dsh` executable on PATH
 *   5. real `node` + the npm-global @deepseek-ai/dsh/bin.js
 *   6. npm prefix
 * @param port - the web port to pass to `dsh web --port <port>`.
 * @param opts - { bundledDshBin?: string } path to a bundled dsh bin.js.
 */
export async function resolveDshCommand(port, opts = {}) {
  if (opts.bundledDshBin && existsSync(opts.bundledDshBin)) {
    console.log(`[dsh-server] using bundled dsh: ${opts.bundledDshBin}`);
    return {
      cmd: process.execPath,
      // --expose-internals: dsh's HMR service needs the internal module
      // loader; under ELECTRON_RUN_AS_NODE the native fallback addon is ABI-
      // incompatible, so the flag is the reliable path (works under plain
      // node too).
      args: ["--expose-internals", opts.bundledDshBin, "web", "--port", String(port)],
      shell: false,
      env: { ELECTRON_RUN_AS_NODE: "1" },
    };
  }
  if (process.env.DSH_BIN) {
    console.log(`[dsh-server] using $DSH_BIN: ${process.env.DSH_BIN}`);
    return { cmd: process.env.DSH_BIN, args: [], shell: process.platform === "win32" };
  }
  const dshPath = await resolveOnPath("dsh");
  if (dshPath) {
    const viaShim = tryResolveShim(dshPath, port);
    if (viaShim) return viaShim;
    console.log(`[dsh-server] dsh found on PATH: ${dshPath}`);
    return { cmd: dshPath, args: ["web", "--port", String(port)], shell: process.platform === "win32" };
  }
  const nodePath = process.env.npm_node_execpath ?? (await resolveOnPath("node"));
  if (!nodePath) {
    console.warn("[dsh-server] node not found on PATH");
    return null;
  }
  const globalRoots = [
    process.env.APPDATA ? join(process.env.APPDATA, "npm", "node_modules") : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "npm", "node_modules") : null,
    "C:\\Users\\Windows\\nodejs\\node_modules",
    "C:\\Program Files\\nodejs\\node_modules",
  ].filter(Boolean);
  for (const root of globalRoots) {
    const bin = join(root, "@deepseek-ai", "dsh", "lib", "bin.js");
    if (existsSync(bin)) {
      console.log(`[dsh-server] dsh via node + ${bin}`);
      return { cmd: nodePath, args: [bin, "web", "--port", String(port)], shell: false };
    }
  }
  const prefix = await new Promise((resolve) => {
    execFile("npm.cmd", ["prefix", "-g"], { windowsHide: true }, (err, stdout) => resolve(err ? null : stdout.trim()));
  });
  if (prefix) {
    const bin = join(prefix, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    if (existsSync(bin)) {
      console.log(`[dsh-server] dsh via node + npm prefix ${bin}`);
      return { cmd: nodePath, args: [bin, "web", "--port", String(port)], shell: false };
    }
  }
  console.warn("[dsh-server] no dsh command resolvable");
  return null;
}

/** Probe a URL; resolves true when the server answers. */
export async function probeServer(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Wait until the server answers on the target URL or the timeout elapses. */
export async function waitForServer(url, timeoutMs = SERVER_START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeServer(url)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Spawn `dsh web` as a managed child. Resolves with the child once it has
 * actually spawned; rejects immediately on a spawn-level failure (missing
 * executable, bad path) instead of leaving the caller waiting on a timeout.
 * @param command - { cmd, args, shell, env? } from resolveDshCommand (env is
 *   merged over the inherited environment).
 * @param cwd - working directory for the server.
 * @param opts - { pipeLogs?: boolean } — false forwards the server's stdout/
 * stderr to the parent's stdio instead of capturing them (used by tests under
 * sandboxes that forbid piped child stdio).
 */
export function spawnDshServer(command, cwd, opts = {}) {
  const pipeLogs = opts.pipeLogs !== false;
  return new Promise((resolve, reject) => {
    const child = spawn(command.cmd, command.args, {
      cwd,
      env: { ...process.env, ...(command.env ?? {}) },
      windowsHide: true,
      shell: command.shell === true,
      stdio: pipeLogs ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
    });
    let settled = false;
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      console.error("[dsh-server] failed to spawn server:", error.message);
      reject(error);
    });
    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      resolve(child);
    });
    if (pipeLogs) {
      const log = (stream, line) => console.log(`[dsh ${stream}] ${line}`);
      child.stdout?.on("data", (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => log("out", l)));
      child.stderr?.on("data", (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => log("err", l)));
    }
    child.on("exit", (code, signal) => {
      console.log(`[dsh-server] server exited (code=${code} signal=${signal})`);
    });
  });
}

/** Kill a process tree on Windows (or plain kill elsewhere). */
export function killTree(child) {
  if (!child || child.pid === undefined) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      return;
    } catch {
      /* fall through to plain kill */
    }
  }
  try {
    child.kill("SIGTERM");
  } catch {
    /* already gone */
  }
}

/** Resolve the child-process cwd for the server (auto-creates DSH_HOME). */
export function serverCwd() {
  const target = process.env.DSH_HOME ?? homedir();
  try {
    if (!existsSync(target)) {
      mkdirSync(target, { recursive: true });
      console.log(`[dsh-server] created missing cwd ${target}`);
    }
  } catch (error) {
    console.warn(`[dsh-server] cannot create cwd ${target}: ${error.message}`);
    return homedir();
  }
  return target;
}
