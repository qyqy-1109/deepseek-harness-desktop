/**
 * dsh-codex-flavor — client bundle (hand-built to the DSH loader format).
 *
 * This file is served verbatim at /plugins/dsh-codex-flavor/client.js and
 * evaluated by the browser module loader; it must be self-contained and only
 * rely on the loader/`window`/`document` globals — it requires nothing, so it
 * cannot violate the client module table.
 *
 * What it does:
 *  1. stacks a theme-override layer over the ACTIVE DSH theme via
 *     ctx.theme.overrideTokens(...) — the DSH design system stays the base;
 *     only the configured touches change;
 *  2. injects a tiny CSS sheet for a coding-oriented monospace stack.
 *
 * Every contribution (override layer + <style>) is disposed with the fiber.
 */
window.__ModuleLoader__.load({
  id: "dsh-codex-flavor",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // ── Codex terminal palette touches (light/dark pairs) ──────────────────
    // Codex CLI code panes sit on a near-black ground; DSH's own tokens keep
    // everything else (brand, surfaces, borders) exactly as designed.
    const CODE_BLOCK = { light: "#f7f8fa", dark: "#0f1115" };
    const CODE_BANNER = { light: "#eef0f3", dark: "#13161a" };
    const CODE_INLINE = { light: "#eef0f3", dark: "#16181c" };
    const CODE_SEGMENT = { light: "#f0f1f3", dark: "#131518" };
    // Codex / GitHub-dark terminal greens for success accents.
    const SUCCESS_PRIMARY = { light: "#2ea043", dark: "#3fb950" };
    const SUCCESS_SECONDARY = { light: "#4ade80", dark: "#56d364" };

    function buildTokenOverrides(settings) {
      const tokens = {};
      if (settings.codexCodeBlocks !== false) {
        tokens["--dsw-alias-markdown-code-block"] = CODE_BLOCK;
        tokens["--dsw-alias-markdown-code-block-banner"] = CODE_BANNER;
        tokens["--dsw-alias-markdown-inline-code"] = CODE_INLINE;
        tokens["--dsw-alias-markdown-code-segment-unselected"] = CODE_SEGMENT;
      }
      if (settings.codexAccent !== false) {
        tokens["--dsw-alias-state-success-primary"] = SUCCESS_PRIMARY;
        tokens["--dsw-alias-state-success-secondary"] = SUCCESS_SECONDARY;
      }
      return tokens;
    }

    // Font-only sheet: no layout, no !important beyond the font stack, scoped
    // to code surfaces so the DSH layout stays untouched.
    const CLIENT_CSS =
      "pre,code,kbd,samp{font-family:\"Cascadia Code\",\"JetBrains Mono\",ui-monospace,\"SF Mono\",\"SFMono-Regular\",Consolas,\"Liberation Mono\",monospace !important}" +
      "pre{font-feature-settings:\"liga\" 0,\"calt\" 0}";

    exports.inject = ["theme"];

    exports.apply = function apply(ctx, config) {
      const settings = {
        enabled: true,
        codexCodeBlocks: true,
        codexFont: true,
        codexAccent: true,
        ...(config || {}),
      };
      if (settings.enabled === false) return undefined;
      const disposers = [];

      const tokens = buildTokenOverrides(settings);
      if (Object.keys(tokens).length > 0) {
        try {
          disposers.push(ctx.theme.overrideTokens("dsh-codex-flavor", tokens));
        } catch (error) {
          // Never let a theme boundary failure take the composition down.
          console.warn("[dsh-codex-flavor] theme override failed:", error);
        }
      }

      if (settings.codexFont !== false && typeof document !== "undefined") {
        const tag = document.createElement("style");
        tag.dataset.plugin = "dsh-codex-flavor";
        tag.dataset.pluginCss = "dsh-codex-flavor/client.css";
        tag.textContent = CLIENT_CSS;
        document.head.appendChild(tag);
        disposers.push(() => tag.remove());
      }

      return () => {
        for (const dispose of disposers) dispose();
      };
    };

    return module.exports;
  },
});
