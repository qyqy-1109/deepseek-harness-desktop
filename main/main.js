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
 *  - tray menu: show / open-in-browser / restart-server / quit
 *  - on quit, terminate only the child server we spawned (never a pre-existing
 *    instance)
 */
import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from "electron";
import { existsSync } from "node:fs";
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

let mainWindow = null;
let tray = null;
let serverProcess = null;
let weSpawnedServer = false;
let isQuitting = false;

/* ------------------------------------------------------------------ */
/* window & tray                                                      */
/* ------------------------------------------------------------------ */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#111113",
    icon: iconPath(),
    title: "DeepSeek Harness",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: "persist:dsh-desktop",
    },
  });

  mainWindow.loadURL(TARGET_URL);
  mainWindow.once("ready-to-show", () => mainWindow.show());
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

function iconPath() {
  const png = join(ROOT, "build", "icon.png");
  const ico = join(ROOT, "build", "icon.ico");
  if (process.platform === "win32" && existsSync(ico)) return ico;
  return png;
}

function createTray() {
  const png = join(ROOT, "build", "icon.png");
  if (!existsSync(png)) return;
  const image = nativeImage.createFromPath(png);
  tray = new Tray(image.resize({ width: 16, height: 16 }));
  tray.setToolTip("DeepSeek Harness");
  const menu = Menu.buildFromTemplate([
    { label: "显示主窗口", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: "在浏览器中打开", click: () => shell.openExternal(TARGET_URL) },
    { type: "separator" },
    {
      label: "重启 dsh 服务",
      click: () => {
        if (weSpawnedServer) {
          killTree(serverProcess);
          resolveDshCommand(PORT, { bundledDshBin: BUNDLED_DSH_BIN })
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
    { label: "退出", click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
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
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    /** Show a startup failure and quit (helper keeps the dialog in one place). */
    const showStartupError = async (detail) => {
      const { dialog } = await import("electron");
      dialog.showErrorBox("无法启动 DeepSeek Harness 服务", detail);
      isQuitting = true;
      app.quit();
    };
    // 1. reuse an already-running dsh web when possible
    let serverUp = await probeServer(TARGET_URL);
    if (!serverUp) {
      // 2. otherwise start it ourselves — double-click should "just work"
      const command = await resolveDshCommand(PORT, { bundledDshBin: BUNDLED_DSH_BIN });
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
      } catch (error) {
        await showStartupError(
          `启动 dsh web 失败:${error.message}\n\n命令:${command.cmd} ${command.args.join(" ")}`,
        );
        return;
      }
      serverUp = await waitForServer(TARGET_URL);
    }
    if (!serverUp) {
      await showStartupError(
        `在 ${TARGET_URL} 上等待 dsh web 服务超时。\n\n` +
          `请确认已安装 @deepseek-ai/dsh（npm i -g @deepseek-ai/dsh），或设置 DSH_BIN 指向 dsh 可执行文件。`,
      );
      return;
    }
    console.log(`[desktop] server ready at ${TARGET_URL}`);
    createWindow();
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
