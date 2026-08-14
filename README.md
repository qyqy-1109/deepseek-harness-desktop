# DeepSeek Harness Desktop 🖥️

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 变成**双击即用的 Windows 桌面应用**:

- **独立窗口**承载 DSH Web GUI,不再需要手开浏览器、不再需要记命令;
- **自动启动服务**:双击图标后自动拉起 `dsh web`(已有服务则直接复用),关窗口最小化到**托盘**;
- **完全自包含**:安装包内置完整的 dsh CLI 和 Node 运行时(Electron 43 / Node 24),**最终用户不需要安装任何东西**;
- **官方鲸鱼图标** + 附赠一个**保留 DSH 原生风格、只加一点 Codex 终端质感**的主题点缀插件。

---

## 📦 一、给最终用户:安装教程(发给朋友照着做)

> 你的朋友只需要下面这一节,不需要 Node.js、不需要命令行、不需要懂技术。

### 第 1 步:拿到安装包

从发布者处获取 `DeepSeek Harness Desktop Setup 0.1.0.exe`(约 154MB),或从 [GitHub Releases](../../releases) 下载。

### 第 2 步:安装

1. 双击安装包;
2. 若出现蓝色 **SmartScreen 提示"Windows 已保护你的电脑"** —— 因为软件未购买代码签名证书,这是正常现象:
   - 点击 **"更多信息"** → **"仍要运行"**;
3. 等待进度条完成(**首次安装 2~10 分钟都正常**,见下方"常见问题");
4. 安装完成后桌面自动出现 **"DeepSeek Harness"** 快捷方式,应用会自动打开。

### 第 3 步:首次启动(约 10~20 秒)

1. 双击桌面快捷方式;
2. 首次启动时应用会自动初始化配置目录(`C:\Users\你的用户名\.dsh`),**窗口会晚一点出现,请耐心等待**;
3. 窗口打开后,点击左侧 **设置(⚙️)** → **模型**,填入你的 **DeepSeek API Key**(没有就到 [platform.deepseek.com](https://platform.deepseek.com) 申请);
4. 回到会话页,开始使用!

### 第 4 步:日常使用

| 操作 | 方法 |
|---|---|
| 启动 | 双击桌面快捷方式 |
| 关闭窗口 | 点右上角 × —— 应用**最小化到托盘**(右下角小图标),后台继续运行 |
| 完全退出 | 托盘图标右键 → **退出** |
| 重新打开 | 双击托盘图标或桌面快捷方式 |
| 从浏览器打开 | 托盘右键 → "在浏览器中打开" |

> 首次启动只需一次初始化;之后每次双击都是秒开。

### 常见问题(FAQ)

**Q: 安装很慢?**
正常。安装包 154MB、解压后约 400MB,且文件数量多,杀毒软件会逐个扫描。等 2~10 分钟即可;超过 15 分钟可将安装包目录加入 Windows Defender 排除项后重试。

**Q: 打开后报 "Failed to load plugins"?**
请重新下载**最新版本**安装包(旧版本存在运行时兼容问题,已在 0.1.0+ 修复)。若仍有问题,把窗口中的完整错误文本发给开发者。

**Q: 双击没反应 / 弹出错误框?**
- 检查是否已安装过旧版本:设置 → 应用 → 卸载 "DeepSeek Harness Desktop" 后重新安装;
- 若提示"未找到 dsh 命令",说明安装包不完整,请重新下载;
- 截图错误内容反馈给开发者。

**Q: 需要梯子吗?**
不需要。只有配置 API Key 后调用 DeepSeek 模型需要能访问 DeepSeek API(国内可直接访问)。

---

## 🛠️ 二、给开发者:从源码构建

### 环境要求

| 工具 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 22.19(推荐 24 LTS) | 构建与开发 |
| npm | ≥ 10 | 随 Node 安装 |
| pnpm | 11(可选) | 仅安装 Codex 插件到 web profile 时需要;`corepack enable` 可启用 |
| Git | 任意 | 克隆仓库 |

### 1. 克隆与安装依赖

```bash
git clone https://github.com/qyqy-1109/deepseek-harness-desktop.git
cd deepseek-harness-desktop
npm install
```

> 若 npm 提示 electron 的 install 脚本被拦截(npm 11 的 allow-scripts 安全机制):
>
> ```bash
> npm approve-scripts electron
> npm install
> ```

### 2. 开发模式运行

```bash
npm start
```

或双击 `启动-桌面版.cmd`(英文名 `launch-desktop.cmd`)。

应用启动逻辑:
1. 探测 `http://127.0.0.1:3080` —— 已有 `dsh web` 在跑则直接复用;
2. 否则自动解析并拉起 `dsh web`(优先使用项目内 `vendor/` 内置副本,其次 PATH 上的 `dsh`,再其次 npm 全局安装);
3. 窗口加载 GUI,托盘常驻。

### 3. 打包自包含安装包

```bash
npm run dist        # 生成 dist\DeepSeek Harness Desktop Setup <版本>.exe
npm run dist:portable   # 或便携版(免安装)
```

打包流程(`scripts/prepare-vendor.mjs` 自动执行):
1. 若本机存在 npm 全局安装的 `@deepseek-ai/dsh`,直接复制其完整依赖树到 `vendor/`(快速、版本精确);
2. 否则自动 `npm install @deepseek-ai/dsh --prefix vendor` 下载;
3. electron-builder 将 `vendor/` 作为 extraResources 打进安装包(`resources/dsh`)。

> **国内网络提示**:electron-builder 需要从 GitHub 下载 Electron 与 NSIS 组件,国内可能失败。已内置 Electron 镜像配置;若 NSIS 组件下载失败,在 cmd 中先执行:
>
> ```bat
> set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
> npm run dist
> ```
>
> (该环境变量仅对当前 cmd 窗口有效。)

### 4. 生成应用图标

```bash
node scripts/make-icon.mjs
```

生成 `build/icon.png` + `build/icon.ico`(7 种尺寸):官方 DSH 鲸鱼 logo(取自 GUI 的 `/favicon.svg`)+ DeepSeek 蓝渐变圆角底;若 `@resvg/resvg-js` 不可用则回退到内置像素图标。

### 5. 项目结构

```
dsh-codex-desktop/
├── main/
│   ├── main.js               Electron 主进程:单实例、窗口、托盘、生命周期
│   └── dsh-server.mjs        纯 Node 模块:dsh 命令解析 / 拉起 / 健康探测 / 清理
├── preload.js                preload 桩(隔离配置)
├── plugin/dsh-codex-flavor/  DSH client 插件:Codex 风味点缀(见其 README)
├── scripts/
│   ├── make-icon.mjs         图标生成(官方鲸鱼)
│   ├── prepare-vendor.mjs    把 dsh 依赖树装进 vendor/(打包前置)
│   ├── 验证并安装.cmd          一键验证+安装插件到 web profile
│   └── verify-install.cmd    同上(英文名)
├── 启动-桌面版.cmd            开发模式双击启动
├── launch-desktop.cmd        同上(英文名)
└── build/                    生成的图标 + 官方 favicon 源文件
```

### 6. 环境变量(全部可选)

| 变量 | 默认 | 作用 |
|---|---|---|
| `DSH_DESKTOP_PORT` / `DSH_PORT` | `3080` | dsh web 监听端口 |
| `DSH_WEB_URL` | `http://127.0.0.1:<port>` | 直接指定 GUI 地址(跳过探测) |
| `DSH_BIN` | 自动解析 | 显式指定 dsh 可执行文件路径 |
| `DSH_DESKTOP_TRAY` | `1` | 设为 `0`:关闭窗口直接退出,不驻留托盘 |
| `DSH_HOME` | `~/.dsh` | dsh web 的工作目录 |

---

## 🎨 三、Codex 风味插件

`plugin/dsh-codex-flavor/` 是一个 DSH client 插件:在**保留 DSH 设计系统原样**的前提下,叠加少量终端质感:

- 深色模式下代码块呈近黑终端面板(`#0f1115`)+ 细边框;
- 代码表面统一为编程等宽字体栈(Cascadia Code / JetBrains Mono / ui-monospace);
- 成功/状态强调色微调为 Codex 终端绿(`#3fb950` 系);
- **品牌蓝、布局、圆角等其余全部保持 DSH 原样**;四档配置可关。

### 安装到 web profile

```bash
cd plugin/dsh-codex-flavor
corepack enable          # 启用 pnpm(若已安装可跳过)
dsh plugin --profile web add .
dsh --profile web --dump-config | findstr codex   # 确认出现 dsh-codex-flavor 层
```

然后**重启 dsh web**(插件集合变化必须重启),刷新页面生效。

### 配置

patch 行默认配置:

```yaml
config:
  enabled: true          # 总开关
  codexCodeBlocks: true  # 终端面板质感代码块
  codexFont: true        # 代码等宽字体栈
  codexAccent: true      # 成功绿微调
```

### 卸载

```bash
dsh plugin --profile web remove dsh-codex-flavor
```

---

## 🧪 四、验证清单

- 插件:`dsh --profile web --dump-config` 出现 `dsh-codex-flavor` 层;
- 浏览器开发者工具 → Network 可见 `/plugins/dsh-codex-flavor/client.js?rev=...` 返回 200;
- 深浅色切换后,深色模式代码块呈现终端面板质感,其余界面保持 DSH 原风格;
- 桌面应用:无 `dsh web` 运行时双击图标,应用自动拉起服务并打开窗口;退出应用后服务一并停止(仅限应用自己拉起的实例)。

## 📄 许可

MIT。图标使用 DeepSeek Harness 官方品牌资源(来源:GUI `/favicon.svg`,见 `build/favicon-official.svg`)。
