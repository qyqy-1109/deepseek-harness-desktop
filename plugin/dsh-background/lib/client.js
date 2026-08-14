/**
 * dsh-background — browser half (client plugin bundle, hand-built to the DSH
 * loader format; architecture modeled on the proven dsh-skin plugin).
 *
 * Adds a "背景 / Background" row to Settings → General:
 *   跟随外观 (follow) — built-in appearance (system preference)
 *   白色 (white)      — registered light-scheme theme, white surfaces
 *   黑色 (black)      — registered dark-scheme theme, near-black surfaces
 *   上传图片 (image)  — pick a local image; stored as a compressed data URL
 *                       and rendered as a fixed backdrop behind translucent
 *                       main canvas + sidebar (opacity/blur adjustable)
 *
 * Persistence is localStorage (third-party settings namespaces are not
 * exposed over the wire). The client bundle requires only module-table
 * entities (react, react/jsx-runtime, @deepseek-ai/dsh-client-runtime/client).
 */
window.__ModuleLoader__.load({
  id: "dsh-background",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const jsxRuntime = require("react/jsx-runtime");
    const React = require("react");
    const { defineStore } = require("@deepseek-ai/dsh-client-runtime/client");

    /* ── constants ────────────────────────────────────────────────────── */
    const SETTINGS_NS = "settings.background";
    const MODE_KEY = "dsh-background:mode"; // follow | white | black | image
    const IMAGE_KEY = "dsh-background:image"; // data URL
    const OPACITY_KEY = "dsh-background:opacity"; // 0..1
    const BLUR_KEY = "dsh-background:blur"; // px 0..60
    const OVERRIDE_SOURCE = "dsh-background:wallpaper";
    const DEFAULT_OPACITY = 0.8;
    const DEFAULT_BLUR = 0;
    const MODES = ["follow", "white", "black", "image"];

    /* ── the two registered background themes ─────────────────────────── */
    const THEMES = [
      {
        id: "dsh-bg-white",
        colorScheme: "light",
        tokens: {
          "--dsw-alias-bg-base": "#ffffff",
          "--dsw-alias-bg-layer-1": "#ffffff",
          "--dsw-alias-bg-layer-2": "#f6f6f8",
          "--dsw-alias-bg-layer-3": "#f0f0f3",
          "--dsw-alias-bg-overlay": "#ffffff",
          "--dsw-alias-border-l1": "rgba(0, 0, 0, 0.05)",
          "--dsw-alias-border-l2": "rgba(0, 0, 0, 0.1)",
          "--dsw-alias-label-primary": "#1a1a1f",
          "--dsw-alias-label-secondary": "#5f5f6a",
          "--dsw-alias-label-tertiary": "#8a8a94",
          "--dsw-alias-brand-primary": "#4176E6",
          "--dsw-alias-brand-text": "#ffffff",
          "--dsw-alias-button-primary-hover": "#5686FE",
          "--dsw-alias-button-primary-dimmed": "#f0f0f3",
          "--dsw-alias-state-business-primary": "#4176E6",
          "--dsw-alias-state-business-tertiary": "#eef2fd",
          "--dsw-alias-interactive-bg-hover": "rgba(0, 0, 0, 0.05)",
          "--dsw-alias-interactive-bg-active": "rgba(0, 0, 0, 0.09)",
          "--dsw-alias-markdown-code-block": "#f4f4f6",
          "--dsw-alias-markdown-inline-code": "#eceef2",
          "--dsw-specific-sidebar-fill": "#fbfbfc",
          "--dsw-specific-sidebar-nav-item-active": "#f0f0f3",
          "--dsw-specific-sidebar-nav-item-hover": "#f5f5f7",
          "--dsw-alias-scrollbar-bg-l1": "#e4e4e8",
          "--dsw-alias-scrollbar-bg-l2": "#dcdce2",
          "--dsw-alias-scrollbar-hover-l1": "#d0d0d8",
          "--dsw-alias-scrollbar-hover-l2": "#d0d0d8",
        },
      },
      {
        id: "dsh-bg-black",
        colorScheme: "dark",
        tokens: {
          "--dsw-alias-bg-base": "#0a0a0c",
          "--dsw-alias-bg-layer-1": "#101013",
          "--dsw-alias-bg-layer-2": "#16161a",
          "--dsw-alias-bg-layer-3": "#1c1c21",
          "--dsw-alias-bg-overlay": "#1e1e24",
          "--dsw-alias-border-l1": "rgba(255, 255, 255, 0.06)",
          "--dsw-alias-border-l2": "rgba(255, 255, 255, 0.12)",
          "--dsw-alias-label-primary": "#ececf0",
          "--dsw-alias-label-secondary": "#9d9da8",
          "--dsw-alias-label-tertiary": "#7b7b86",
          "--dsw-alias-brand-primary": "#5686FE",
          "--dsw-alias-brand-text": "#ffffff",
          "--dsw-alias-button-primary-hover": "#6d9dfa",
          "--dsw-alias-button-primary-dimmed": "#16161a",
          "--dsw-alias-state-business-primary": "#5686FE",
          "--dsw-alias-state-business-tertiary": "#16161a",
          "--dsw-alias-interactive-bg-hover": "rgba(255, 255, 255, 0.08)",
          "--dsw-alias-interactive-bg-active": "rgba(255, 255, 255, 0.14)",
          "--dsw-alias-markdown-code-block": "#0d0d10",
          "--dsw-alias-markdown-inline-code": "#16161a",
          "--dsw-specific-sidebar-fill": "#0d0d10",
          "--dsw-specific-sidebar-nav-item-active": "#16161a",
          "--dsw-specific-sidebar-nav-item-hover": "#121216",
          "--dsw-alias-scrollbar-bg-l1": "#28282e",
          "--dsw-alias-scrollbar-bg-l2": "#32323a",
          "--dsw-alias-scrollbar-hover-l1": "#3d3d46",
          "--dsw-alias-scrollbar-hover-l2": "#3d3d46",
        },
      },
    ];

    /* ── locales ──────────────────────────────────────────────────────── */
    const zh = {
      "title": "背景",
      "follow": "跟随外观",
      "white": "白色",
      "black": "黑色",
      "image": "上传图片",
      "choose": "选择图片",
      "remove": "移除图片",
      "opacity": "透明度",
      "blur": "模糊",
      "hint": "图片显示在主内容区与侧边栏的半透明底上，消息等内层表面保持不透明以保证可读性",
    };
    const en = {
      "title": "Background",
      "follow": "Follow theme",
      "white": "White",
      "black": "Black",
      "image": "Upload image",
      "choose": "Choose image",
      "remove": "Remove",
      "opacity": "Opacity",
      "blur": "Blur",
      "hint": "The image shows through the translucent main canvas and sidebar; inner surfaces stay opaque for readability",
    };

    /* ── persistence ──────────────────────────────────────────────────── */
    function readStorage(key) {
      try {
        const value = window.localStorage.getItem(key);
        return typeof value === "string" ? value : null;
      } catch {
        return null;
      }
    }
    function writeStorage(key, value) {
      try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      } catch {
        // storage unavailable / quota — the preference stays process-local
      }
    }
    function readMode() {
      const mode = readStorage(MODE_KEY);
      return MODES.includes(mode) ? mode : "follow";
    }
    function readImage() {
      const value = readStorage(IMAGE_KEY);
      return value !== null && value.length > 0 ? value : null;
    }
    function readOpacity() {
      const raw = readStorage(OPACITY_KEY);
      if (raw === null) return DEFAULT_OPACITY;
      const value = Number(raw);
      return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_OPACITY;
    }
    function readBlur() {
      const raw = readStorage(BLUR_KEY);
      if (raw === null) return DEFAULT_BLUR;
      const value = Number(raw);
      return Number.isFinite(value) ? Math.min(60, Math.max(0, value)) : DEFAULT_BLUR;
    }

    /* ── wallpaper layer + token shading ──────────────────────────────── */
    let wallpaperEl = null;
    let wallpaperOverrideDispose = null;

    function toRgba(color, alpha) {
      const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
      if (hex !== null) {
        let digits = hex[1];
        if (digits.length === 3) digits = digits.split("").map((char) => char + char).join("");
        const n = parseInt(digits, 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
      }
      const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(color.trim());
      if (rgb !== null) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
      return color.trim();
    }

    /** Base color for one scheme from the active theme (or the built-in). */
    function resolveBase(scheme, active) {
      if (active.colorScheme === scheme && typeof active.tokens["--dsw-alias-bg-base"] === "string") {
        return active.tokens["--dsw-alias-bg-base"];
      }
      return scheme === "light" ? "rgb(255, 255, 255)" : "rgb(21, 21, 23)";
    }

    /** Make the main canvas + sidebar translucent so the backdrop shows. */
    function shadeTokens(ctx) {
      const snapshot = ctx.theme.getTheme();
      const alpha = readOpacity();
      const sidebarAlpha = Math.min(1, alpha + 0.1);
      wallpaperOverrideDispose?.();
      wallpaperOverrideDispose = ctx.theme.overrideTokens(OVERRIDE_SOURCE, {
        "--dsw-alias-bg-base": {
          light: toRgba(resolveBase("light", snapshot.active), alpha),
          dark: toRgba(resolveBase("dark", snapshot.active), alpha),
        },
        "--dsw-specific-sidebar-fill": {
          light: toRgba(resolveBase("light", snapshot.active), sidebarAlpha),
          dark: toRgba(resolveBase("dark", snapshot.active), sidebarAlpha),
        },
      });
    }

    /** Apply (or clear) the wallpaper layer and its token shading. */
    function applyWallpaper(ctx) {
      const url = readImage();
      if (url === null) {
        wallpaperEl?.remove();
        wallpaperEl = null;
        wallpaperOverrideDispose?.();
        wallpaperOverrideDispose = null;
        return;
      }
      if (wallpaperEl === null || !document.body.contains(wallpaperEl)) {
        wallpaperEl = document.createElement("div");
        wallpaperEl.style.cssText =
          "position:fixed;inset:0;z-index:-1;pointer-events:none;background-size:cover;background-position:center;background-repeat:no-repeat;";
        document.body.prepend(wallpaperEl);
      }
      const blur = readBlur();
      wallpaperEl.style.backgroundImage = `url("${url}")`;
      wallpaperEl.style.filter = blur > 0 ? `blur(${blur}px)` : "none";
      shadeTokens(ctx);
    }

    function teardownWallpaper() {
      wallpaperEl?.remove();
      wallpaperEl = null;
      wallpaperOverrideDispose?.();
      wallpaperOverrideDispose = null;
    }

    /* ── image compression (keep inside the localStorage quota) ───────── */
    function compressImage(image, maxSide, quality) {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", quality);
    }
    function readImageAsDataUrl(file, onDone) {
      const reader = new FileReader();
      reader.onerror = () => onDone(null);
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => onDone(null);
        image.onload = () => {
          try {
            let dataUrl = compressImage(image, 1600, 0.75);
            if (dataUrl.length > 2000000) dataUrl = compressImage(image, 1000, 0.6);
            if (dataUrl.length > 2000000) dataUrl = compressImage(image, 800, 0.5);
            onDone(dataUrl);
          } catch {
            onDone(null);
          }
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    }

    /* ── store ────────────────────────────────────────────────────────── */
    function createStore() {
      return defineStore({
        init: () => ({
          mode: "follow",
          image: null,
          opacity: DEFAULT_OPACITY,
          blur: DEFAULT_BLUR,
          revision: -1,
        }),
        actions: {
          sync: (d, mode, image, opacity, blur, revision) => {
            if (revision <= d.revision) return;
            d.mode = mode;
            d.image = image;
            d.opacity = opacity;
            d.blur = blur;
            d.revision = revision;
          },
        },
      });
    }

    /* ── settings row ─────────────────────────────────────────────────── */
    const styles = {
      group: { borderBottom: "1px solid var(--dsw-alias-border-l2)", display: "flex", flexDirection: "column", gap: "10px", padding: "16px 0" },
      title: { color: "var(--dsw-alias-label-primary)", fontSize: "14px", fontWeight: 400, lineHeight: "22px" },
      hint: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "18px" },
      grid: { display: "flex", flexWrap: "wrap", gap: "10px" },
      card: { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", width: "96px", padding: "3px", borderRadius: "10px", border: "2px solid transparent", background: "transparent", cursor: "pointer", font: "inherit", boxSizing: "border-box" },
      cardSelected: { borderColor: "var(--dsw-alias-brand-primary)", background: "var(--dsw-alias-interactive-bg-hover)" },
      cardLabel: { color: "var(--dsw-alias-label-secondary)", fontSize: "12px", lineHeight: "16px", whiteSpace: "nowrap" },
      cardLabelSelected: { color: "var(--dsw-alias-label-primary)" },
      swatch: { width: "100%", height: "52px", borderRadius: "8px", boxSizing: "border-box", padding: "8px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "6px" },
      swatchLine: { height: "7px", borderRadius: "4px" },
      defaultSwatch: { width: "100%", height: "52px", borderRadius: "8px", boxSizing: "border-box", display: "flex", overflow: "hidden", border: "1px solid var(--dsw-alias-border-l2)" },
      preview: { width: "72px", height: "44px", objectFit: "cover", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-l2)" },
      actionRow: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" },
      button: { height: "32px", padding: "0 14px", borderRadius: "8px", border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-button-elevated-fill)", color: "var(--dsw-alias-label-primary)", cursor: "pointer", fontSize: "13px", font: "inherit", boxSizing: "border-box" },
      buttonDanger: { color: "var(--dsw-alias-state-error-primary)" },
      sliderRow: { display: "flex", alignItems: "center", gap: "10px", minWidth: "240px" },
      sliderLabel: { color: "var(--dsw-alias-label-secondary)", fontSize: "13px", whiteSpace: "nowrap", width: "52px" },
      slider: { flex: 1, accentColor: "var(--dsw-alias-brand-primary)" },
      sliderValue: { color: "var(--dsw-alias-label-secondary)", fontSize: "12px", whiteSpace: "nowrap", width: "44px", textAlign: "right" },
    };

    /** Mini palette preview for a mode card. */
    function ModeSwatch({ mode }) {
      if (mode === "follow") {
        return jsxRuntime.jsxs("div", {
          style: styles.defaultSwatch,
          children: [jsxRuntime.jsx("div", { style: { flex: 1, background: "#f4f4f5" } }), jsxRuntime.jsx("div", { style: { flex: 1, background: "#1c1c20" } })],
        });
      }
      if (mode === "white") {
        return jsxRuntime.jsxs("div", {
          style: { ...styles.swatch, background: "#ffffff", border: "1px solid rgba(0,0,0,0.12)" },
          children: [jsxRuntime.jsx("div", { style: { ...styles.swatchLine, width: "70%", background: "#1a1a1f", opacity: 0.85 } }), jsxRuntime.jsx("div", { style: { ...styles.swatchLine, width: "45%", background: "#4176E6" } })],
        });
      }
      if (mode === "black") {
        return jsxRuntime.jsxs("div", {
          style: { ...styles.swatch, background: "#0a0a0c", border: "1px solid rgba(255,255,255,0.14)" },
          children: [jsxRuntime.jsx("div", { style: { ...styles.swatchLine, width: "70%", background: "#ececf0", opacity: 0.85 } }), jsxRuntime.jsx("div", { style: { ...styles.swatchLine, width: "45%", background: "#5686FE" } })],
        });
      }
      // image: photo-like gradient
      return jsxRuntime.jsx("div", {
        style: { ...styles.swatch, background: "linear-gradient(135deg,#5686FE 0%,#4176E6 40%,#3fbf7f 70%,#f2c14e 100%)", border: "1px solid rgba(255,255,255,0.2)" },
        children: [jsxRuntime.jsx("div", { style: { ...styles.swatchLine, width: "55%", background: "rgba(255,255,255,0.85)" } })],
      });
    }

    function Slider({ label, value, min, max, step, format, onChange }) {
      return jsxRuntime.jsxs("div", {
        style: styles.sliderRow,
        children: [
          jsxRuntime.jsx("span", { style: styles.sliderLabel, children: label }),
          jsxRuntime.jsx("input", { type: "range", min, max, step, value, style: styles.slider, onChange: (event) => onChange(Number(event.target.value)) }),
          jsxRuntime.jsx("span", { style: styles.sliderValue, children: format(value) }),
        ],
      });
    }

    function BackgroundRow({ t, useStore, setMode, setWallpaper, setOpacity, setBlur }) {
      const state = useStore((s) => s);
      const selected = state.mode;
      const inputRef = React.useRef(null);
      const onFile = (event) => {
        const file = event.target.files?.[0];
        if (file === void 0) return;
        readImageAsDataUrl(file, (dataUrl) => {
          if (dataUrl !== null) setWallpaper(dataUrl);
          event.target.value = "";
        });
      };
      return jsxRuntime.jsxs("div", {
        style: styles.group,
        children: [
          jsxRuntime.jsx("div", { style: styles.title, children: t("title") }),
          jsxRuntime.jsxs("div", {
            style: styles.grid,
            children: MODES.map((mode) =>
              jsxRuntime.jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    if (mode === "image") inputRef.current?.click();
                    else setMode(mode);
                  },
                  "aria-pressed": selected === mode,
                  style: { ...styles.card, ...(selected === mode ? styles.cardSelected : {}) },
                },
                mode,
                [jsxRuntime.jsx(ModeSwatch, { mode }), jsxRuntime.jsx("span", { style: { ...styles.cardLabel, ...(selected === mode ? styles.cardLabelSelected : {}) }, children: t(mode) })],
              ),
            ),
          }),
          state.mode === "image" && state.image !== null
            ? jsxRuntime.jsxs("div", {
                style: styles.actionRow,
                children: [
                  jsxRuntime.jsx("img", { src: state.image, alt: "", style: styles.preview }),
                  jsxRuntime.jsx("button", { type: "button", style: { ...styles.button, ...styles.buttonDanger }, onClick: () => setWallpaper(null), children: t("remove") }),
                  jsxRuntime.jsx(Slider, { label: t("opacity"), value: Math.round(state.opacity * 100), min: 0, max: 100, step: 1, format: (v) => `${v}%`, onChange: setOpacity }),
                  jsxRuntime.jsx(Slider, { label: t("blur"), value: state.blur, min: 0, max: 60, step: 1, format: (v) => `${v}px`, onChange: setBlur }),
                ],
              })
            : null,
          jsxRuntime.jsx("input", { ref: inputRef, type: "file", accept: "image/*", style: { display: "none" }, onChange: onFile }),
          jsxRuntime.jsx("div", { style: styles.hint, children: t("hint") }),
        ],
      });
    }

    /* ── plugin body ──────────────────────────────────────────────────── */
    const inject = ["slots", "locale", "theme"];

    function apply(ctx) {
      // 1. register the two background themes
      const themeDisposers = THEMES.map((theme) => ctx.theme.register(theme));
      ctx.effect(
        () => () => {
          for (const dispose of themeDisposers) dispose();
        },
        "dsh-background: theme registration",
      );

      // 2. wallpaper bookkeeping (restored below with the mode)
      let revision = 0;
      const store = createStore();
      let bound;
      const syncStore = () => {
        revision += 1;
        bound?.sync(readMode(), readImage(), readOpacity(), readBlur(), revision);
      };

      // 3. restore the saved mode
      const savedMode = readMode();
      if (savedMode === "white" || savedMode === "black") {
        const id = `dsh-bg-${savedMode}`;
        if (ctx.theme.getTheme().preference !== id) ctx.theme.setTheme(id);
      } else if (savedMode === "follow") {
        if (THEMES.some((theme) => theme.id === ctx.theme.getTheme().preference)) {
          ctx.theme.setTheme("system");
        }
      }
      applyWallpaper(ctx);
      syncStore();
      ctx.effect(
        () => () => {
          teardownWallpaper();
        },
        "dsh-background: wallpaper cleanup",
      );

      // 4. keep the row in sync with theme changes and re-shade the wash
      const syncTheme = (snapshot) => {
        const isWallpaper = readImage() !== null && readMode() === "image";
        if (isWallpaper) applyWallpaper(ctx);
        syncStore();
      };
      ctx.on("theme/change", syncTheme);
      ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), "dsh-background: settings row dictionaries");

      // 5. the settings row
      const injected = (actions) => {
        bound = actions;
        syncStore();
        return {
          setMode: (mode) => {
            writeStorage(MODE_KEY, mode);
            if (mode === "white" || mode === "black") {
              ctx.theme.setTheme(`dsh-bg-${mode}`);
            } else if (mode === "follow") {
              ctx.theme.setTheme("system");
            }
            // color modes clear the wallpaper; image mode keeps the theme
            if (mode !== "image") {
              writeStorage(IMAGE_KEY, null);
              applyWallpaper(ctx);
            }
            syncStore();
          },
          setWallpaper: (url) => {
            writeStorage(MODE_KEY, "image");
            writeStorage(IMAGE_KEY, url);
            applyWallpaper(ctx);
            syncStore();
          },
          setOpacity: (percent) => {
            const value = Math.min(1, Math.max(0, percent / 100));
            writeStorage(OPACITY_KEY, String(value));
            applyWallpaper(ctx);
            syncStore();
          },
          setBlur: (px) => {
            const value = Math.min(60, Math.max(0, px));
            writeStorage(BLUR_KEY, String(value));
            applyWallpaper(ctx);
            syncStore();
          },
        };
      };
      ctx.slots.inject("settings.general.item", () =>
        ctx.slots.register(
          {
            name: "settings.general.item",
            id: "background",
            order: 20,
            store,
            locale: SETTINGS_NS,
            inject: injected,
          },
          BackgroundRow,
        ),
      );
    }

    exports.inject = inject;
    exports.apply = apply;
    exports.THEMES = THEMES;
    return module.exports;
  },
});
