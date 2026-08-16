/**
 * prepare-plugins.mjs — stage the user's DSH plugins (and their npm
 * dependency closure) into ./vendor-plugins, so electron-builder can ship
 * them as extraResources (resources/plugins). On the user's machine, the
 * desktop app seeds them into a fresh web profile on first boot — no pnpm,
 * no network needed on the receiving side.
 *
 * Local-path plugins are installed via `file:` specs (npm copies them, so the
 * bundle is self-contained); npm packages are installed by name. npm's flat
 * layout puts transitive dependencies next to the plugins, and the whole
 * node_modules tree is shipped.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "vendor-plugins");
const MANIFEST = join(VENDOR, "package.json");

/** Plugin specs: npm name or file: path. Names must match the web profile's bundles. */
const PLUGINS = {
  "dshmarket": "^1.4.0",
  "dsh-codex-flavor": "file:D:/deepseek-harness-桌面端/dsh-codex-desktop/plugin/dsh-codex-flavor",
  "dsh-background": "file:D:/deepseek-harness-桌面端/dsh-codex-desktop/plugin/dsh-background",
  "dsh-difyctl": "file:D:/deepseek-工作区/dsh-difyctl",
  "@dsh-external/dsh-super-injector": "file:D:/deepseek-路由套件/dsh-routing-suite/injector",
  "@dsh-external/dsh-mode-boost": "file:D:/deepseek-路由套件/dsh-routing-suite/mode-boost",
};

function staged() {
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
    return (
      manifest._bundledPlugins === JSON.stringify(Object.keys(PLUGINS)) &&
      existsSync(join(VENDOR, "node_modules", Object.keys(PLUGINS)[0], "package.json"))
    );
  } catch {
    return false;
  }
}

if (staged()) {
  console.log("[prepare-plugins] already staged, skipping (delete vendor-plugins/ to refresh)");
  process.exit(0);
}

mkdirSync(VENDOR, { recursive: true });
writeFileSync(
  MANIFEST,
  JSON.stringify(
    {
      name: "dsh-bundled-plugins",
      private: true,
      _bundledPlugins: JSON.stringify(Object.keys(PLUGINS)),
      dependencies: PLUGINS,
    },
    null,
    2,
  ),
  "utf8",
);

console.log("[prepare-plugins] installing plugins into vendor-plugins/ ...");
execFileSync("npm.cmd", ["install", "--prefix", VENDOR, "--install-links", "--no-audit", "--no-fund"], {
  cwd: ROOT,
  stdio: "inherit",
  windowsHide: true,
  shell: true, // .cmd shims must go through a shell on Windows
});

// Materialize any remaining symlinks (file: deps can be symlinked by npm):
// the shipped tree must be real directories so the profile seeding can copy
// it without following links.
const NM = join(VENDOR, "node_modules");
function materialize(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = realpathSync(full);
      rmSync(full, { recursive: true, force: true });
      cpSync(target, full, { recursive: true });
    } else if (entry.isDirectory()) {
      materialize(full);
    }
  }
}
if (existsSync(NM)) materialize(NM);

// verify every plugin landed
let missing = [];
for (const name of Object.keys(PLUGINS)) {
  if (!existsSync(join(VENDOR, "node_modules", name, "package.json"))) missing.push(name);
}
if (missing.length > 0) {
  console.error("[prepare-plugins] FAILED, missing:", missing.join(", "));
  process.exit(1);
}
console.log("[prepare-plugins] done:", Object.keys(PLUGINS).length, "plugins staged");
