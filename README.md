# DeepSeek Harness Desktop

把 DeepSeek Harness 变成**桌面端应用**:双击启动,独立窗口承载 DSH Web GUI
(不再需要手开浏览器),托盘常驻,并附赠一个**保留 DSH 原生风格、只添加一点
Codex 终端风味**的主题点缀插件。

```
dsh-codex-desktop/
├── main/main.js                  Electron 主进程:单实例、dsh web 子进程管理、窗口、托盘
├── preload.js                    preload 桩(隔离配置)
├── scripts/make-icon.mjs         生成图标:官方 DSH 鲸鱼 logo(取自 GUI /favicon.svg,
│                                  蓝渐变圆角底,7 尺寸 ICO + 256 PNG;resvg 缺失时回退像素图标)
├── 启动-桌面版.cmd / launch-desktop.cmd   开发模式双击启动(自动装依赖并运行)
├── scripts/验证并安装.cmd / verify-install.cmd   一键验证+安装插件
└── plugin/dsh-codex-flavor/      DSH client 插件:Codex 风味点缀(见其 README)
```

## 快速开始(开发模式)

双击 `启动-桌面版.cmd`(或英文名 `launch-desktop.cmd`),或手动:

```sh
npm install      # 首次;Electron 下载约 100MB
npm start
```

> 双击无反应/闪退时:脚本为纯 ASCII 批处理(与中文系统代码页兼容);仍不行的
> 话,打开 cmd 窗口把脚本文件拖进去回车,即可看到具体报错。

应用启动后:

1. 探测 `http://127.0.0.1:3080` —— 已有 `dsh web` 在跑就直接复用;
2. 否则自动以 `dsh web --port 3080` 拉起服务(从 PATH 或 npm 全局安装解析 dsh);
3. 独立窗口加载 GUI;关闭窗口最小化到托盘,托盘菜单可显示/浏览器打开/重启服务/退出。

> 当前这台机器上 `dsh web` 正运行在 3080 端口,桌面应用会直接连上它,
> 不会重复启动服务。Electron 窗口使用独立的持久化分区
> (`persist:dsh-desktop`),会话数据与浏览器互不影响。

## 打包成可双击安装的桌面应用

```sh
npm run dist          # NSIS 安装包(dist/*.exe),安装时创建桌面快捷方式
npm run dist:portable # 或免安装便携版
```

## 环境变量(全部可选)

| 变量 | 默认 | 作用 |
|---|---|---|
| `DSH_DESKTOP_PORT` / `DSH_PORT` | `3080` | dsh web 监听端口 |
| `DSH_WEB_URL` | `http://127.0.0.1:<port>` | 直接指定 GUI 地址(跳过探测) |
| `DSH_BIN` | 自动解析 | 显式指定 dsh 可执行文件路径 |
| `DSH_DESKTOP_TRAY` | `1` | 设为 `0`:关闭窗口直接退出,不驻留托盘 |
| `DSH_HOME` | `~/.dsh` | dsh web 子进程的工作目录 |

## Codex 风味插件

`plugin/dsh-codex-flavor/` 是一个 DSH client 插件(遵循 DSH 插件契约:
`dsh.bundle` + `dsh.client` + 双面导出)。它**不改 DSH 的设计系统**,只在
活动主题之上叠加一层 token 覆盖 + 一条字体 CSS:

- 代码块呈现为近黑终端面板(深色模式)+ 细边框;浅色模式保持浅灰;
- 代码表面统一为编程等宽字体栈(Cascadia Code / JetBrains Mono / ui-monospace);
- 成功/状态强调色向 Codex 终端绿微调(`#3fb950` 系),品牌蓝等其余全部保持 DSH 原样。

安装到 web profile(需要 pnpm,可用 `corepack pnpm`):

```sh
cd D:\deepseek工作区\dsh-codex-desktop\plugin\dsh-codex-flavor
dsh plugin --profile web add .
```

然后**重启 dsh web**(插件集合变化需重启,见 DSH 插件开发 skill §7.2)。

## 验证

- 插件:`dsh --profile web --dump-config` 应出现 `dsh-codex-flavor` 层;
- 浏览器开发者工具 → Network 应看到 `/plugins/dsh-codex-flavor/client.js`;
- 外观切换深浅色,代码块应呈现终端面板质感,其余界面保持 DSH 原风格。
