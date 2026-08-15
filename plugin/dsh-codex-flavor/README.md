# dsh-codex-flavor

给 DeepSeek Harness Web GUI 加"一点 Codex 风味"的 DSH client 插件:
**保留 DSH 设计系统原样**,只在活动主题之上叠加少量终端质感。

## 它改了什么

| 面 | 改动 | 方式 |
|---|---|---|
| 代码块 | 深色模式下呈近黑终端面板(`#0f1115`)+ 细边框,浅色模式浅灰;代码块横幅/行内代码/代码段底色同步微调 | `ctx.theme.overrideTokens()` 官方主题覆盖机制 |
| 字体 | 代码表面统一为编程等宽栈(Cascadia Code / JetBrains Mono / ui-monospace) | 注入一条仅作用于 `pre,code,kbd,samp` 的 CSS |
| 强调色 | 成功/状态绿向 Codex 终端绿微调(`#3fb950` 系) | 同上 token 覆盖 |
| 其余一切 | **品牌蓝、表面、边框、布局、圆角均保持 DSH 原样** | — |

实现要点(遵循 DSH 插件契约):

- 包声明 `dsh.bundle.patch` + `dsh.client.platform: "web"` + `exports["./client"]`;
- host 半面(`lib/index.js`)为无操作行;client 半面(`lib/client.js`)
  是自包含 bundle,零运行时 require(不依赖模块表,无纯度门风险),
  通过 `window.__ModuleLoader__.load({ id, factory })` 加载;
- `inject: ["theme"]` 保证在主题服务就绪后激活;
- 每次贡献(override 层 + `<style>`)都返回 disposer,随 client fiber 释放。

## 配置

patch 行默认配置:

```yaml
config:
  enabled: true        # 总开关
  codexCodeBlocks: true # 终端面板质感代码块
  codexFont: true       # 代码等宽字体栈
  codexAccent: true     # 成功绿微调
```

## 安装

前置:pnpm 可用(`corepack enable` 或加入 PATH)。

```sh
cd D:\deepseek-harness-桌面端\dsh-codex-desktop\plugin\dsh-codex-flavor
dsh plugin --profile web add .
```

成功后 `dsh --profile web --dump-config` 应出现 `dsh-codex-flavor` 层,
`dsh.profile.bundles` 末尾追加该包。**重启 dsh web** 后生效(插件集合变化
需要重启,见 DSH 插件开发 skill §7.2)。

## 验证

- Network 面板出现 `/plugins/dsh-codex-flavor/client.js?rev=...`;
- 深色模式下代码块呈近黑终端面板,其余界面无变化;
- 设置 → 外观 切换深浅色,override 层双模式均生效;
- 卸载:`dsh plugin --profile web remove dsh-codex-flavor` 后重启。
