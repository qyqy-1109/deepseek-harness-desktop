/**
 * dsh-background — browser half (client plugin bundle, hand-built to the DSH
 * loader format; architecture modeled on the proven dsh-skin plugin).
 *
 * Adds a "背景 / Background" row to Settings → General:
 *   跟随外观 (follow) — no wallpaper (built-in appearance)
 *   上传图片 (image)  — pick a local image; stored as a compressed data URL
 *                       and rendered as a fixed backdrop behind translucent
 *                       main canvas + sidebar (opacity/blur adjustable)
 *
 * Persistence is localStorage (third-party settings namespaces are not
 * exposed over the wire). The client bundle requires only module-table
 * entities (react, react/jsx-runtime, @deepseek-ai/dsh-client-runtime/client).
 *
 * NOTE on re-entrancy: the wallpaper's token override publishes theme/change,
 * which this plugin also listens to (to re-shade after a scheme/skin switch).
 * A re-entrancy guard (inShade) keeps that from recursing into itself.
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
    const IMAGE_KEY = "dsh-background:image"; // data URL (presence = image mode)
    const OPACITY_KEY = "dsh-background:opacity"; // 0..1
    const BLUR_KEY = "dsh-background:blur"; // px 0..60
    const OVERRIDE_SOURCE = "dsh-background:wallpaper";
    const DEFAULT_OPACITY = 0.8;
    const DEFAULT_BLUR = 0;

    /* ── locales ──────────────────────────────────────────────────────── */
    const zh = {
      "title": "背景",
      "follow": "跟随外观",
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
    let inShade = false; // re-entrancy guard against theme/change loops

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
      if (inShade) return; // we are already inside a theme/change cascade
      inShade = true;
      try {
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
      } finally {
        inShade = false;
      }
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
          image: null,
          opacity: DEFAULT_OPACITY,
          blur: DEFAULT_BLUR,
          revision: -1,
        }),
        actions: {
          sync: (d, image, opacity, blur, revision) => {
            if (revision <= d.revision) return;
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

    function ModeSwatch({ mode }) {
      if (mode === "follow") {
        return jsxRuntime.jsxs("div", {
          style: styles.defaultSwatch,
          children: [jsxRuntime.jsx("div", { style: { flex: 1, background: "#f4f4f5" } }), jsxRuntime.jsx("div", { style: { flex: 1, background: "#1c1c20" } })],
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

    function BackgroundRow({ t, useStore, setWallpaper, clearWallpaper, setOpacity, setBlur }) {
      const state = useStore((s) => s);
      const inputRef = React.useRef(null);
      const onFile = (event) => {
        const file = event.target.files?.[0];
        if (file === void 0) return;
        readImageAsDataUrl(file, (dataUrl) => {
          if (dataUrl !== null) setWallpaper(dataUrl);
          event.target.value = "";
        });
      };
      const mode = state.image !== null ? "image" : "follow";
      const cards = ["follow", "image"];
      return jsxRuntime.jsxs("div", {
        style: styles.group,
        children: [
          jsxRuntime.jsx("div", { style: styles.title, children: t("title") }),
          jsxRuntime.jsxs("div", {
            style: styles.grid,
            children: cards.map((card) =>
              jsxRuntime.jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    if (card === "image") inputRef.current?.click();
                    else clearWallpaper();
                  },
                  "aria-pressed": mode === card,
                  style: { ...styles.card, ...(mode === card ? styles.cardSelected : {}) },
                  children: [
                    jsxRuntime.jsx(ModeSwatch, { mode: card }),
                    jsxRuntime.jsx("span", { style: { ...styles.cardLabel, ...(mode === card ? styles.cardLabelSelected : {}) }, children: t(card) }),
                  ],
                },
                card,
              ),
            ),
          }),
          state.image !== null
            ? jsxRuntime.jsxs("div", {
                style: styles.actionRow,
                children: [
                  jsxRuntime.jsx("img", { src: state.image, alt: "", style: styles.preview }),
                  jsxRuntime.jsx("button", { type: "button", style: { ...styles.button, ...styles.buttonDanger }, onClick: () => clearWallpaper(), children: t("remove") }),
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
      let revision = 0;
      const store = createStore();
      let bound;
      const syncStore = () => {
        revision += 1;
        bound?.sync(readImage(), readOpacity(), readBlur(), revision);
      };

      // restore the saved wallpaper
      applyWallpaper(ctx);
      syncStore();
      ctx.effect(
        () => () => {
          teardownWallpaper();
        },
        "dsh-background: wallpaper cleanup",
      );

      // keep the row in sync and re-shade after a scheme/skin switch
      ctx.on("theme/change", () => {
        if (readImage() !== null) applyWallpaper(ctx);
        syncStore();
      });
      ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), "dsh-background: settings row dictionaries");

      const injected = (actions) => {
        bound = actions;
        syncStore();
        return {
          setWallpaper: (url) => {
            writeStorage(IMAGE_KEY, url);
            applyWallpaper(ctx);
            syncStore();
          },
          clearWallpaper: () => {
            writeStorage(IMAGE_KEY, null);
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
    return module.exports;
  },
});
