/**
 * check-update.mjs — compare the @deepseek-ai/dsh versions across all three
 * layers (npm latest / global install / installer-bundled vendor) and print
 * the verdict with the exact commands to sync them.
 * Run via scripts/check-update.cmd or directly: node scripts/check-update.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ROOT = process.cwd();
const PKG_REL = join("node_modules", "@deepseek-ai", "dsh", "package.json");

function readVersion(path) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).version : "未安装";
  } catch {
    return "读取失败";
  }
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", windowsHide: true, shell: true }).trim().split(/\r?\n/).pop() ?? "";
  } catch {
    return "";
  }
}

// ── collect versions ──────────────────────────────────────────────────────
const latest = run("npm.cmd", ["view", "@deepseek-ai/dsh", "version"]) || "查询失败";
const prefix = run("npm.cmd", ["prefix", "-g"]);
const layers = [
  { name: "npm 最新发布版", version: latest, isRemote: true },
  { name: "全局安装 (npm global)", version: readVersion(prefix ? join(prefix, PKG_REL) : "") },
  { name: "安装包内置 (vendor/)", version: readVersion(join(ROOT, "vendor", PKG_REL)) },
];

// ── print ────────────────────────────────────────────────────────────────
console.log("========================================");
console.log("  DeepSeek Harness (dsh) 版本检测");
console.log("========================================");
for (const layer of layers) {
  const marker = layer.isRemote ? "  " : (layer.version === latest ? "✔" : "✘");
  console.log(` ${marker} ${layer.name.padEnd(22)} ${layer.version}`);
}
console.log("========================================");

// ── verdict ───────────────────────────────────────────────────────────────
const globalV = layers[1].version;
const vendorV = layers[2].version;
const outdated = [];
if (latest !== "查询失败" && globalV !== latest && globalV !== "未安装" && globalV !== "读取失败") outdated.push("全局安装落后");
if (vendorV !== latest && vendorV !== "未安装" && vendorV !== "读取失败") outdated.push("安装包内置落后");

if (outdated.length === 0) {
  if (latest === "查询失败") {
    console.log("结论:无法连接 npm 查询最新版本(请检查网络)。");
  } else {
    console.log("结论:全部为最新版本,无需更新。");
  }
} else {
  console.log(`结论:${outdated.join("、")}。`);
  if (globalV !== latest) {
    console.log("");
    console.log("  ① 更新本机(重启 dsh web 生效):");
    console.log("     npm i -g @deepseek-ai/dsh@latest");
  }
  if (vendorV !== latest) {
    console.log("");
    console.log("  ② 同步到桌面安装包(让朋友也拿到新版):");
    console.log("     cd /d " + ROOT);
    console.log("     rmdir /s /q vendor      (关键:不删则 prepare-vendor 会跳过)");
    console.log("     npm run dist            (重新打包,约 10 分钟)");
    console.log("     然后发布新 Release + 上传安装包");
  }
}
console.log("");
console.log(`检测时间:${new Date().toLocaleString()}`);
