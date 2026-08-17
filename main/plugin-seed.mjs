/**
 * plugin-seed.mjs — seed bundled DSH plugins into a (fresh) web profile.
 * Pure Node so the exact same code runs in the desktop app and in tests.
 *
 * Mechanism:
 *  - the installer ships the plugins (with their npm dependency closure) at
 *    resources/plugins — a flat node_modules layout produced by
 *    scripts/prepare-plugins.mjs;
 *  - on first boot the profile manifest may not exist yet; we create it with
 *    the built-in bundles plus every bundled plugin that declares dsh.bundle,
 *    and copy the plugin packages (and their flat deps) into the profile's
 *    node_modules — no pnpm, no network;
 *  - for existing profiles we only append missing bundle names and copy
 *    missing packages, so a normal machine (pnpm-managed profile) is a no-op.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Bundles that ship with every web profile (resolution anchors are built-in). */
export const BUILTIN_BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"];

/** Collect bundled plugin package names (dirs declaring dsh.bundle). */
export function listBundledPlugins(pluginsDir) {
  if (!existsSync(pluginsDir)) return [];
  const names = [];
  const readPkg = (dir) => {
    try {
      return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    } catch {
      return null;
    }
  };
  const isDir = (path) => {
    try {
      return statSync(path).isDirectory(); // follows symlinks
    } catch {
      return false;
    }
  };
  for (const entry of readdirSync(pluginsDir)) {
    if (entry.startsWith(".")) continue;
    const full = join(pluginsDir, entry);
    if (entry.startsWith("@")) {
      if (!isDir(full)) continue;
      for (const sub of readdirSync(full)) {
        if (sub.startsWith(".")) continue;
        const pkg = readPkg(join(full, sub));
        if (pkg?.dsh?.bundle?.patch) names.push(`${entry}/${sub}`);
      }
    } else if (isDir(full)) {
      const pkg = readPkg(full);
      if (pkg?.dsh?.bundle?.patch) names.push(entry);
    }
  }
  return names.sort();
}

/** Recursively copy one package dir into the profile node_modules if absent. */
function copyPackage(srcDir, destDir) {
  if (existsSync(destDir)) return false; // existing (even a symlink) wins
  mkdirSync(dirname(destDir), { recursive: true });
  cpSync(srcDir, destDir, { recursive: true, force: false });
  return true;
}

/**
 * Seed the plugins. Returns the list of plugin names present in the manifest
 * (for logging). Safe to call every launch.
 * @param pluginsDir - the shipped plugins dir (resources/plugins or vendor-plugins/node_modules).
 * @param dshHome - the Harness home; defaults to $DSH_HOME, falling back to
 *   ~/.dsh (DSH's own resolution) — most end-user machines have NO DSH_HOME
 *   environment variable, so the fallback is what makes seeding work there.
 */
export function seedBundledPlugins(pluginsDir, dshHome = process.env.DSH_HOME ?? join(homedir(), ".dsh")) {
  const seeded = [];
  if (!dshHome || !existsSync(pluginsDir)) return seeded;
  const profileDir = join(dshHome, "profiles", "web");
  const manifestPath = join(profileDir, "package.json");
  const pluginNames = listBundledPlugins(pluginsDir);
  if (pluginNames.length === 0) return seeded;

  let manifest = null;
  try {
    manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  } catch {
    manifest = null;
  }
  if (manifest === null) {
    manifest = {
      name: "dsh-profile-web",
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    };
    mkdirSync(profileDir, { recursive: true });
  }
  const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : [];
  const dependencies = manifest.dependencies ?? {};
  let changed = false;
  for (const name of pluginNames) {
    if (!bundles.includes(name)) {
      bundles.push(name);
      changed = true;
    }
    // dshmarket's "已安装" list (and uninstall) reads manifest.dependencies —
    // record the seeded package there too, pointing at the copied directory.
    if (dependencies[name] === void 0) {
      dependencies[name] = `file:./node_modules/${name}`;
      changed = true;
    }
    const srcDir = join(pluginsDir, name);
    const destDir = join(profileDir, "node_modules", name);
    if (copyPackage(srcDir, destDir)) seeded.push(name);
  }
  if (changed) {
    manifest.dependencies = dependencies;
    manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  }
  // copy the rest of the flat dependency tree (non-bundle deps) too
  const isDir = (path) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  };
  for (const entry of readdirSync(pluginsDir)) {
    if (entry.startsWith(".")) continue;
    const full = join(pluginsDir, entry);
    if (!isDir(full)) continue;
    if (entry.startsWith("@")) {
      const scopeDir = full;
      for (const sub of readdirSync(scopeDir)) {
        if (sub.startsWith(".")) continue;
        if (isDir(join(scopeDir, sub))) copyPackage(join(scopeDir, sub), join(profileDir, "node_modules", entry, sub));
      }
    } else {
      copyPackage(full, join(profileDir, "node_modules", entry));
    }
  }
  return seeded;
}

/**
 * Seed bundled agent presets (router-standard / router-spec) into
 * ~/.dsh/.agent-presets/. DSH discovers a preset as a DIRECT child directory
 * of the root that contains agent.cordis.yml — so each staged preset dir is
 * copied next to the root (existing dirs win, never overwritten).
 * @param presetsDir - the shipped presets dir (resources/agent-presets).
 * @param dshHome - the Harness home (same fallback as seedBundledPlugins).
 * @returns the names of presets newly copied.
 */
export function seedAgentPresets(presetsDir, dshHome = process.env.DSH_HOME ?? join(homedir(), ".dsh")) {
  const seeded = [];
  if (!dshHome || !existsSync(presetsDir)) return seeded;
  const root = join(dshHome, ".agent-presets");
  const isDir = (path) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  };
  for (const entry of readdirSync(presetsDir)) {
    if (entry.startsWith(".")) continue;
    const srcDir = join(presetsDir, entry);
    if (!isDir(srcDir)) continue;
    const destDir = join(root, entry);
    if (copyPackage(srcDir, destDir)) seeded.push(entry);
  }
  return seeded;
}
