/**
 * DeepSeek Harness Desktop — Electron main process.
 *
 * Responsibilities:
 *  - single-instance lock (a second double-click focuses the existing window)
 *  - discover an already-running `dsh web` server on the target port and reuse
 *    it; otherwise START IT OURSELVES (double-click should just work, no cmd
 *    window needed) — the server logic lives in ./dsh-server.mjs
 *  - present the DSH Web GUI in a standalone window (persistent partition,
 *    context-isolated, no node integration)
 *  - icon management: two builtin whale icons (classic blue / black) plus a
 *    custom-upload option; the selection is persisted, applied to the window,
 *    tray and desktop/start-menu shortcuts, and uploaded images are
 *    auto-cropped/resized to every standard Windows icon size
 *  - tray menu: show / open-in-browser / restart-server / icon / quit
 *  - on quit, terminate only the child server we spawned (never a pre-existing
 *    instance)
 */
import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from "electron";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  killTree,
  probeServer,
  resolveDshCommand,
  serverCwd,
  spawnDshServer,
  waitForServer,
} from "./dsh-server.mjs";
import { encodeIco, ICON_SIZES } from "./icon-maker.mjs";
import { seedBundledPlugins } from "./plugin-seed.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** Environment/config knobs (all optional). */
const PORT = Number(process.env.DSH_DESKTOP_PORT ?? process.env.DSH_PORT ?? 3080);
const HOST = "127.0.0.1";
const TRAY = process.env.DSH_DESKTOP_TRAY !== "0"; // set 0 to quit on close
const TARGET_URL = process.env.DSH_WEB_URL ?? `http://${HOST}:${PORT}`;

/**
 * Path to the dsh CLI bundled with the installer (extraResources → resources/
 * dsh/ — the @deepseek-ai/dsh package root). In dev, the project-local
 * vendor/ copy is used instead. Falls back to system resolution when neither
 * exists.
 */
const BUNDLED_DSH_BIN = process.resourcesPath
  ? join(process.resourcesPath, "dsh", "lib", "bin.js")
  : join(ROOT, "vendor", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");

/**
 * Path to the REAL Node runtime bundled with the installer (extraResources →
 * resources/node/node.exe). dsh web runs under this instead of
 * Electron-as-node so its native addons (koffi folder dialog, sharp,
 * node-pty, ...) keep their Node ABI. In dev, the project-local vendor-node/
 * copy is used.
 */
const BUNDLED_NODE = process.resourcesPath
  ? join(process.resourcesPath, "node", "node.exe")
  : join(ROOT, "vendor-node", "node.exe");

/**
 * Path to the plugins shipped with the installer (extraResources →
 * resources/plugins, a flat node_modules layout from prepare-plugins.mjs).
 * Seeded into a fresh web profile on first boot (see plugin-seed.mjs).
 */
const BUNDLED_PLUGINS_DIR = process.resourcesPath
  ? join(process.resourcesPath, "plugins")
  : join(ROOT, "vendor-plugins", "node_modules");

/** Builtin runtime icons (shipped via assets/**). */
const BUILTIN_ICONS = {
  blue: join(ROOT, "assets", "icon-blue.png"),
  black: join(ROOT, "assets", "icon-black.png"),
};
const SHORTCUT_NAME = "DeepSeek Harness";

let mainWindow = null;
let tray = null;
let serverProcess = null;
let weSpawnedServer = false;
let isQuitting = false;
/** A second launch arrived while the window was still booting. */
let pendingFocus = false;

/**
 * Inline loading page shown while the dsh web server is being started, so a
 * double-click ALWAYS produces a visible window immediately (no dead clicks).
 */
const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(
  `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html,body{height:100%;margin:0;background:#111113;color:#e6e6ea;
    font-family:"Segoe UI",system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
  .card{text-align:center;user-select:none}
  .whale{font-size:56px;line-height:1;filter:drop-shadow(0 4px 18px rgba(86,134,254,.45))}
  h1{font-size:18px;font-weight:600;margin:14px 0 6px;letter-spacing:.3px}
  p{font-size:13px;color:#9d9da8;margin:0}
  .spin{width:22px;height:22px;margin:22px auto 0;border:3px solid #26262c;border-top-color:#5686FE;
    border-radius:50%;animation:r 1s linear infinite}
  @keyframes r{to{transform:rotate(360deg)}}
</style>
</head>
<body>
  <div class="card">
    <div class="whale">🐋</div>
    <h1>DeepSeek Harness</h1>
    <p>正在启动 dsh web 服务,请稍候…</p>
    <div class="spin"></div>
  </div>
</body>
</html>`,
)}`;

/* ------------------------------------------------------------------ */
/* icon management                                                    */
/* ------------------------------------------------------------------ */

const USER_DATA = () => app.getPath("userData");
const ICON_DIR = () => join(USER_DATA(), "icons");
const ICON_SETTINGS_FILE = () => join(USER_DATA(), "icon-settings.json");
const CURRENT_ICO = () => join(ICON_DIR(), "current.ico");
const CURRENT_PNG = () => join(ICON_DIR(), "current.png");

function loadIconSettings() {
  try {
    const parsed = JSON.parse(readFileSync(ICON_SETTINGS_FILE(), "utf8"));
    if (parsed && typeof parsed.source === "string") return parsed;
  } catch {
    /* first run */
  }
  return { source: "blue" };
}

function saveIconSettings(settings) {
  mkdirSync(USER_DATA(), { recursive: true });
  writeFileSync(ICON_SETTINGS_FILE(), JSON.stringify(settings, null, 2), "utf8");
}

/**
 * Build the multi-size PNG map for one icon source.
 * @param source - "blue" | "black" | "custom".
 * @param customPath - file path when source is "custom".
 * @returns Map<size, Buffer> with every standard icon size.
 */
async function buildIconPngs(source, customPath) {
  const image =
    source === "custom" && customPath
      ? nativeImage.createFromPath(customPath)
      : nativeImage.createFromPath(BUILTIN_ICONS[source] ?? BUILTIN_ICONS.blue);
  if (image.isEmpty()) throw new Error(source === "custom" ? "无法读取所选图片文件" : "内置图标缺失");
  // center-crop to a square, then downscale to every standard size
  const { width: w, height: h } = image.getSize();
  const side = Math.min(w, h);
  const cropped = image.crop({
    x: Math.floor((w - side) / 2),
    y: Math.floor((h - side) / 2),
    width: side,
    height: side,
  });
  const pngs = new Map();
  for (const size of ICON_SIZES) {
    pngs.set(size, cropped.resize({ width: size, height: size, quality: "best" }).toPNG());
  }
  return pngs;
}

/** Materialize the current icon files (current.ico + current.png). */
async function materializeCurrentIcon(settings) {
  const pngs = await buildIconPngs(settings.source, settings.customPath);
  mkdirSync(ICON_DIR(), { recursive: true });
  writeFileSync(CURRENT_ICO(), encodeIco(pngs));
  writeFileSync(CURRENT_PNG(), pngs.get(256));
  return { ico: CURRENT_ICO(), png: CURRENT_PNG() };
}

/** Re-point window + tray at the current icon files. */
function applyIconToApp() {
  if (!existsSync(CURRENT_ICO())) return;
  const ico = nativeImage.createFromPath(CURRENT_ICO());
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIcon(ico);
  if (tray && !tray.isDestroyed()) {
    tray.setImage(nativeImage.createFromPath(CURRENT_PNG()).resize({ width: 16, height: 16 }));
  }
}

/**
 * Rewrite the desktop + start-menu shortcuts' icon to the given .ico file
 * (WScript.Shell via PowerShell; Windows only, best-effort).
 */
function updateShortcutIcons(icoPath) {
  if (process.platform !== "win32") return;
  const script = [
    "$ws = New-Object -ComObject WScript.Shell",
    `$icon = ${JSON.stringify(icoPath)}`,
    `$names = @(${JSON.stringify(`${SHORTCUT_NAME}.lnk`)})`,
    `$dirs = @("$env:USERPROFILE\\Desktop", "$env:PUBLIC\\Desktop", "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs")`,
    "foreach ($d in $dirs) { foreach ($n in $names) { $t = Join-Path $d $n; if (Test-Path $t) { $s = $ws.CreateShortcut($t); $s.IconLocation = $icon; $s.Save() } } }",
  ].join("; ");
  try {
    spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], {
      windowsHide: true,
      stdio: "ignore",
    });
  } catch (error) {
    console.error("[desktop] shortcut icon update failed:", error.message);
  }
}

/** Apply a new icon selection end-to-end: build, persist, apply, shortcuts. */
async function changeIcon(source, customPath) {
  const settings = { source, ...(customPath ? { customPath } : {}) };
  try {
    await materializeCurrentIcon(settings);
    saveIconSettings(settings);
    applyIconToApp();
    updateShortcutIcons(CURRENT_ICO());
    console.log(`[desktop] icon changed to ${source}${customPath ? ` (${customPath})` : ""}`);
  } catch (error) {
    const { dialog } = await import("electron");
    dialog.showErrorBox("图标设置失败", error.message);
  }
  rebuildTrayMenu();
}

/** Open the file picker and apply a custom uploaded icon. */
async function pickCustomIcon() {
  const { dialog } = await import("electron");
  const result = await dialog.showOpenDialog({
    title: "选择图标图片(PNG / JPG / ICO)",
    properties: ["openFile"],
    filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "ico", "bmp"] }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    rebuildTrayMenu(); // radio reverts
    return;
  }
  await changeIcon("custom", result.filePaths[0]);
}

/* ------------------------------------------------------------------ */
/* window & tray                                                      */
/* ------------------------------------------------------------------ */

function windowIconPath() {
  if (process.platform === "win32" && existsSync(CURRENT_ICO())) return CURRENT_ICO();
  if (existsSync(CURRENT_PNG())) return CURRENT_PNG();
  const ico = join(ROOT, "build", "icon.ico");
  if (process.platform === "win32" && existsSync(ico)) return ico;
  return join(ROOT, "build", "icon.png");
}

/**
 * Append one line to the startup log (userData/startup.log) — the packaged
 * app has no visible console, so remote diagnostics depend on this file.
 */
function bootLog(line) {
  try {
    const stamp = new Date().toISOString();
    const file = join(app.getPath("userData"), "startup.log");
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `[${stamp}] ${line}\n`);
  } catch {
    /* logging must never break startup */
  }
}

/**
 * Create the main window. It loads the inline loading page immediately and,
 * when `showImmediately` is set, becomes visible right away — so starting the
 * server (which can take tens of seconds on first boot) never leaves the user
 * with a "dead" click. The caller swaps in the real GUI URL once the server
 * is reachable.
 */
function createWindow(showImmediately = false) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: showImmediately,
    autoHideMenuBar: true,
    backgroundColor: "#111113",
    icon: windowIconPath(),
    title: "DeepSeek Harness",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: "persist:dsh-desktop",
    },
  });

  mainWindow.loadURL(LOADING_HTML);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("close", (event) => {
    if (!isQuitting && TRAY) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/** Switch the window to the real GUI (once the server is reachable). */
function loadGuiIntoWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(TARGET_URL);
  mainWindow.once("ready-to-show", () => {
    if (!mainWindow.isVisible()) mainWindow.show();
  });
  if (pendingFocus) {
    pendingFocus = false;
    mainWindow.show();
    mainWindow.focus();
  }
}

function trayImage() {
  const png = existsSync(CURRENT_PNG()) ? CURRENT_PNG() : join(ROOT, "build", "icon.png");
  return nativeImage.createFromPath(png).resize({ width: 16, height: 16 });
}

function rebuildTrayMenu() {
  if (!tray) return;
  const settings = loadIconSettings();
  const iconMenu = [
    {
      label: "经典蓝色鲸鱼",
      type: "radio",
      checked: settings.source === "blue",
      click: () => changeIcon("blue"),
    },
    {
      label: "黑色鲸鱼",
      type: "radio",
      checked: settings.source === "black",
      click: () => changeIcon("black"),
    },
    { type: "separator" },
    {
      label: "自定义图标(上传图片)…",
      type: "radio",
      checked: settings.source === "custom",
      click: () => pickCustomIcon(),
    },
  ];
  const menu = Menu.buildFromTemplate([
    { label: "显示主窗口", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: "在浏览器中打开", click: () => shell.openExternal(TARGET_URL) },
    { type: "separator" },
    {
      label: "重启 dsh 服务",
      click: () => {
        if (weSpawnedServer) {
          killTree(serverProcess);
          resolveDshCommand(PORT, { bundledDshBin: BUNDLED_DSH_BIN, bundledNode: BUNDLED_NODE })
            .then((cmd) => {
              if (!cmd) throw new Error("no dsh command resolvable");
              return spawnDshServer(cmd, serverCwd());
            })
            .then((child) => {
              serverProcess = child;
              return waitForServer(TARGET_URL);
            })
            .then((ok) => {
              if (ok && mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(TARGET_URL);
              else console.error("[desktop] dsh restart timed out");
            })
            .catch((error) => console.error("[desktop] dsh restart failed:", error.message));
        } else {
          shell.openExternal(TARGET_URL);
        }
      },
    },
    { type: "separator" },
    { label: "应用图标", submenu: iconMenu },
    { type: "separator" },
    { label: "退出", click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip("DeepSeek Harness");
  rebuildTrayMenu();
  tray.on("click", () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else { mainWindow?.show(); mainWindow?.focus(); }
  });
}

/* ------------------------------------------------------------------ */
/* lifecycle                                                          */
/* ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    } else {
      // still booting — remember to focus the window once it exists
      pendingFocus = true;
    }
  });

  app.whenReady().then(async () => {
    /** Show a startup failure and quit (helper keeps the dialog in one place). */
    const showStartupError = async (detail) => {
      const { dialog } = await import("electron");
      bootLog(`startup error: ${detail.split("\n")[0]}`);
      dialog.showErrorBox("无法启动 DeepSeek Harness 服务", detail);
      isQuitting = true;
      app.quit();
    };
    // 0. materialize the persisted icon choice (first run → classic blue)
    try {
      const settings = loadIconSettings();
      if (!existsSync(CURRENT_ICO())) await materializeCurrentIcon(settings);
    } catch (error) {
      console.warn("[desktop] icon materialization failed:", error.message);
    }
    // 0.5. seed the bundled plugins into a fresh web profile (before boot)
    try {
      const dshHome = process.env.DSH_HOME ?? join(app.getPath("home"), ".dsh");
      const seeded = seedBundledPlugins(BUNDLED_PLUGINS_DIR, dshHome);
      if (seeded.length > 0) bootLog(`seeded bundled plugins: ${seeded.join(", ")}`);
      else bootLog("plugin seeding: nothing new (already present or no bundled plugins)");
    } catch (error) {
      bootLog(`plugin seeding failed: ${error.message}`);
      console.warn("[desktop] plugin seeding failed:", error.message);
    }
    // 1. quick probe: reuse an already-running dsh web when possible
    const serverUp = await probeServer(TARGET_URL);
    // 2. create the window NOW (loading page; visible right away when the
    //    server still needs to start, so clicks always get feedback)
    createWindow(!serverUp);
    if (!serverUp) {
      // 3. start it ourselves — double-click should "just work"
      const command = await resolveDshCommand(PORT, { bundledDshBin: BUNDLED_DSH_BIN, bundledNode: BUNDLED_NODE });
      if (!command) {
        await showStartupError(
          `未找到 dsh 命令。\n\n请确认已安装 @deepseek-ai/dsh（npm i -g @deepseek-ai/dsh），` +
            `或将 dsh 加入 PATH，或设置环境变量 DSH_BIN 指向 dsh 可执行文件。`,
        );
        return;
      }
      try {
        serverProcess = await spawnDshServer(command, serverCwd());
        weSpawnedServer = true;
        bootLog(`server spawned: ${command.cmd} ${command.args.join(" ")}`);
      } catch (error) {
        bootLog(`server spawn failed: ${error.message}`);
        await showStartupError(
          `启动 dsh web 失败:${error.message}\n\n命令:${command.cmd} ${command.args.join(" ")}`,
        );
        return;
      }
      const ready = await waitForServer(TARGET_URL);
      if (!ready) {
        await showStartupError(
          `在 ${TARGET_URL} 上等待 dsh web 服务超时。\n\n` +
            `请确认已安装 @deepseek-ai/dsh（npm i -g @deepseek-ai/dsh），或设置 DSH_BIN 指向 dsh 可执行文件。`,
        );
        return;
      }
    }
    console.log(`[desktop] server ready at ${TARGET_URL}`);
    bootLog(`server ready at ${TARGET_URL}`);
    // 4. swap the loading page for the real GUI
    loadGuiIntoWindow();
    createTray();
    Menu.setApplicationMenu(null);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else { mainWindow?.show(); mainWindow?.focus(); }
    });
  });

  app.on("before-quit", () => {
    isQuitting = true;
    if (weSpawnedServer) killTree(serverProcess);
  });

  app.on("window-all-closed", () => {
    // keep running in the tray unless quitting
    if (isQuitting || !TRAY) app.quit();
  });
}
