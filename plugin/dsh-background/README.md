# dsh-background

给 DeepSeek Harness Web GUI 的 **设置 → 通用** 加一个「背景」选项行:

- **跟随外观** — 恢复 DSH 内置外观(跟随系统深浅色);
- **白色** — 注册为 light 方案主题,全白表面;
- **黑色** — 注册为 dark 方案主题,近黑表面;
- **上传图片** — 选择本地图片(浏览器内压缩为 ≤2MB 的 data URL),以固定背景层显示在主内容区与侧边栏的半透明底上;支持**透明度**与**模糊**调节、**移除图片**。

## 实现要点(架构参考自 [dsh-skin](https://github.com/KinGao294/dsh-skin))

- 白/黑背景通过 `ctx.theme.register({ id, colorScheme, tokens })` 注册为两个主题,
  选择即 `ctx.theme.setTheme(id)` —— 复用 DSH 官方主题运行时,深浅色、
  `body[data-ds-dark-theme]`、token 应用全部由 ui-layout 处理;
- 壁纸为 `z-index:-1` 固定层 + `ctx.theme.overrideTokens` 把主画布
  (`--dsw-alias-bg-base`)与侧边栏(`--dsw-specific-sidebar-fill`)变为半透明,
  内层表面(卡片/输入框/消息气泡)保持不透明以保证可读性;
- **持久化用 localStorage**(`dsh-background:*`):DSH 的 Host settings 通道
  只对内置命名空间白名单开放(`dsh-host-apiproxy` 的
  `WEB_SETTINGS_NAMESPACES`),第三方命名空间会返回 `settings-not-exposed`;
- host 半面为无操作行;client bundle 只 require 模块表实体
  (`react` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-runtime/client`);
- 所有贡献(主题注册、override 层、壁纸元素、事件、locale、slot)随 fiber 释放。

## 安装

```sh
cd plugin/dsh-background
dsh plugin --profile web add -w <本目录绝对路径>
```

> `-w` 是必需的:profile 自带 `pnpm-workspace.yaml`,pnpm 会把它当 workspace
> 根,裸 `add` 会报 `ERR_PNPM_ADDING_TO_ROOT`。

然后**重启 dsh web**(插件集合变化必须重启),打开 设置 → 通用 即可看到「背景」行。

## 验证

- `dsh --profile web --dump-config | findstr background` 出现 `dsh-background` 层;
- Network 面板出现 `/plugins/dsh-background/client.js?rev=...` 返回 200;
- 选择白/黑即时换肤;上传图片后主区与侧边栏呈半透明露出图片,内层保持不透明;
- 刷新页面后选择保留(localStorage)。

## 卸载

```sh
dsh plugin --profile web remove dsh-background
```

重启后生效;浏览器侧 localStorage 键(`dsh-background:*`)可手动清除。
