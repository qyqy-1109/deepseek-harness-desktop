/**
 * dsh-background — browser half (client plugin bundle, hand-built to the DSH
 * loader format; architecture modeled on the proven dsh-skin plugin).
 *
 * Adds a "背景 / Background" row to Settings → General:
 *   - 跟随外观 (follow) — clear the active wallpaper
 *   - 上传图片 (image)  — upload a local image (compressed data URL)
 *   - 已保存图片 gallery — up to 3 saved wallpapers; click a thumbnail to
 *     make it current, × to delete it, empty slots offer the picker
 *   - opacity / blur sliders tune the active wallpaper
 *
 * Persistence is localStorage (third-party settings namespaces are not
 * exposed over the wire). Images are compressed to ~≤0.9MB each so 3 saved
 * wallpapers stay well inside the localStorage quota (~2.7MB of 5MB).
 * The client bundle requires only module-table entities.
 *
 * Re-entrancy: the wallpaper's token override publishes theme/change, which
 * this plugin also listens to; the inShade guard prevents recursion.
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
    const IMAGES_KEY = "dsh-background:images"; // JSON array of data URLs (≤3)
    const CURRENT_KEY = "dsh-background:current"; // active index, -1 = none
    const OPACITY_KEY = "dsh-background:opacity"; // 0..1
    const BLUR_KEY = "dsh-background:blur"; // px 0..60
    const OVERRIDE_SOURCE = "dsh-background:wallpaper";
    const MAX_IMAGES = 3;
    const DEFAULT_OPACITY = 0.8;
    const DEFAULT_BLUR = 0;

    /* ── locales ──────────────────────────────────────────────────────── */
    const zh = {
      "title": "背景",
      "follow": "跟随外观",
      "image": "上传图片",
      "saved": "已保存图片",
      "addSlot": "添加",
      "remove": "移除",
      "opacity": "透明度",
      "blur": "模糊",
      "hint": "上传的图片会保存在这里(最多 3 张)。点击缩略图切换当前背景；主内容区与侧边栏呈半透明露出图片，消息等内层表面保持不透明以保证可读性",
    };
    const en = {
      "title": "Background",
      "follow": "Follow theme",
      "image": "Upload image",
      "saved": "Saved images",
      "addSlot": "Add",
      "remove": "Remove",
      "opacity": "Opacity",
      "blur": "Blur",
      "hint": "Uploaded images are saved here (up to 3). Click a thumbnail to switch the active wallpaper; the main canvas and sidebar turn translucent so the image shows through, while inner surfaces stay opaque for readability",
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
    function readImages() {
      const raw = readStorage(IMAGES_KEY);
      if (raw === null) return [];
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => typeof item === "string" && item.length > 0).slice(0, MAX_IMAGES);
      } catch {
        return [];
      }
    }
    function writeImages(images) {
      writeStorage(IMAGES_KEY, JSON.stringify(images.slice(0, MAX_IMAGES)));
    }
    function readCurrent() {
      const raw = readStorage(CURRENT_KEY);
      const value = Number(raw);
      return Number.isInteger(value) && value >= 0 && value < MAX_IMAGES ? value : -1;
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
    /** The active wallpaper data URL, or null. */
    function activeWallpaper() {
      const images = readImages();
      const current = readCurrent();
      return current >= 0 && current < images.length ? images[current] : null;
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
      if (inShade) return;
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

    /** Apply (or clear) the active wallpaper layer and its token shading. */
    function applyWallpaper(ctx) {
      const url = activeWallpaper();
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

    /* ── image compression (3 × ~0.9MB stays inside the localStorage quota) ─ */
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
            let dataUrl = compressImage(image, 1400, 0.7);
            if (dataUrl.length > 900000) dataUrl = compressImage(image, 1000, 0.6);
            if (dataUrl.length > 900000) dataUrl = compressImage(image, 800, 0.5);
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
          images: [],
          current: -1,
          opacity: DEFAULT_OPACITY,
          blur: DEFAULT_BLUR,
          revision: -1,
        }),
        actions: {
          sync: (d, images, current, opacity, blur, revision) => {
            if (revision <= d.revision) return;
            d.images = images;
            d.current = current;
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
      subTitle: { color: "var(--dsw-alias-label-secondary)", fontSize: "13px", lineHeight: "20px" },
      hint: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "18px" },
      grid: { display: "flex", flexWrap: "wrap", gap: "10px" },
      card: { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", width: "96px", padding: "3px", borderRadius: "10px", border: "2px solid transparent", background: "transparent", cursor: "pointer", font: "inherit", boxSizing: "border-box" },
      cardSelected: { borderColor: "var(--dsw-alias-brand-primary)", background: "var(--dsw-alias-interactive-bg-hover)" },
      cardLabel: { color: "var(--dsw-alias-label-secondary)", fontSize: "12px", lineHeight: "16px", whiteSpace: "nowrap" },
      cardLabelSelected: { color: "var(--dsw-alias-label-primary)" },
      swatch: { width: "100%", height: "52px", borderRadius: "8px", boxSizing: "border-box", padding: "8px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "6px" },
      swatchLine: { height: "7px", borderRadius: "4px" },
      defaultSwatch: { width: "100%", height: "52px", borderRadius: "8px", boxSizing: "border-box", display: "flex", overflow: "hidden", border: "1px solid var(--dsw-alias-border-l2)" },
      gallery: { display: "flex", flexWrap: "wrap", gap: "10px" },
      slot: { position: "relative", width: "96px", height: "60px", borderRadius: "8px", overflow: "hidden", padding: "0", border: "2px solid var(--dsw-alias-border-l2)", background: "transparent", cursor: "pointer", boxSizing: "border-box" },
      slotSelected: { borderColor: "var(--dsw-alias-brand-primary)" },
      slotImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
      slotRemove: { position: "absolute", top: "4px", right: "4px", width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: "12px", lineHeight: "18px", cursor: "pointer", padding: "0" },
      slotAdd: { display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: "22px", borderStyle: "dashed" },
      actionRow: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" },
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

    function BackgroundRow({ t, useStore, setWallpaper, setCurrent, clearWallpaper, removeImage, setOpacity, setBlur }) {
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
      const hasWallpaper = state.current >= 0 && state.current < state.images.length;
      const slots = [];
      for (let i = 0; i < MAX_IMAGES; i++) {
        const image = state.images[i];
        if (image !== void 0) {
          slots.push(
            jsxRuntime.jsxs(
              "button",
              {
                type: "button",
                onClick: () => setCurrent(i),
                title: t("saved") + " " + (i + 1),
                style: { ...styles.slot, ...(state.current === i ? styles.slotSelected : {}) },
                children: [
                  jsxRuntime.jsx("img", { src: image, alt: "", style: styles.slotImg }),
                  jsxRuntime.jsx("button", {
                    type: "button",
                    title: t("remove"),
                    style: styles.slotRemove,
                    onClick: (event) => {
                      event.stopPropagation();
                      removeImage(i);
                    },
                    children: "×",
                  }),
                ],
              },
              `slot-${i}`,
            ),
          );
        } else {
          slots.push(
            jsxRuntime.jsx(
              "button",
              {
                type: "button",
                onClick: () => inputRef.current?.click(),
                title: t("image"),
                style: { ...styles.slot, ...styles.slotAdd },
                children: "+",
              },
              `slot-empty-${i}`,
            ),
          );
        }
      }
      return jsxRuntime.jsxs("div", {
        style: styles.group,
        children: [
          jsxRuntime.jsx("div", { style: styles.title, children: t("title") }),
          jsxRuntime.jsxs("div", {
            style: styles.grid,
            children: ["follow", "image"].map((card) =>
              jsxRuntime.jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    if (card === "image") inputRef.current?.click();
                    else clearWallpaper();
                  },
                  "aria-pressed": card === "image" ? state.images.length > 0 : !hasWallpaper,
                  style: { ...styles.card, ...(card === "image" ? (state.images.length > 0 ? styles.cardSelected : {}) : !hasWallpaper ? styles.cardSelected : {}) },
                  children: [
                    jsxRuntime.jsx(ModeSwatch, { mode: card }),
                    jsxRuntime.jsx("span", { style: { ...styles.cardLabel, ...(card === "image" ? (state.images.length > 0 ? styles.cardLabelSelected : {}) : !hasWallpaper ? styles.cardLabelSelected : {}) }, children: t(card) }),
                  ],
                },
                card,
              ),
            ),
          }),
          jsxRuntime.jsx("div", { style: styles.subTitle, children: `${t("saved")} (${state.images.length}/${MAX_IMAGES})` }),
          jsxRuntime.jsxs("div", { style: styles.gallery, children: slots }),
          hasWallpaper
            ? jsxRuntime.jsxs("div", {
                style: styles.actionRow,
                children: [
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
        bound?.sync(readImages(), readCurrent(), readOpacity(), readBlur(), revision);
      };

      // restore the saved wallpaper
      applyWallpaper(ctx);
      syncStore();
      // migrate a single image saved by an older plugin version (if any)
      const legacy = readStorage("dsh-background:image");
      if (legacy !== null && readImages().length === 0) {
        writeImages([legacy]);
        writeStorage(CURRENT_KEY, "0");
        writeStorage("dsh-background:image", null);
        applyWallpaper(ctx);
        syncStore();
      }
      ctx.effect(
        () => () => {
          teardownWallpaper();
        },
        "dsh-background: wallpaper cleanup",
      );

      // keep the row in sync and re-shade after a scheme/skin switch
      ctx.on("theme/change", () => {
        if (activeWallpaper() !== null) applyWallpaper(ctx);
        syncStore();
      });
      ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), "dsh-background: settings row dictionaries");

      const injected = (actions) => {
        bound = actions;
        syncStore();
        return {
          setWallpaper: (dataUrl) => {
            const images = readImages();
            images.push(dataUrl);
            writeImages(images.slice(-MAX_IMAGES)); // keep the newest 3
            writeStorage(CURRENT_KEY, String(Math.min(MAX_IMAGES - 1, images.length - 1)));
            applyWallpaper(ctx);
            syncStore();
          },
          setCurrent: (index) => {
            writeStorage(CURRENT_KEY, String(index));
            applyWallpaper(ctx);
            syncStore();
          },
          clearWallpaper: () => {
            writeStorage(CURRENT_KEY, "-1");
            applyWallpaper(ctx);
            syncStore();
          },
          removeImage: (index) => {
            const images = readImages();
            if (index < 0 || index >= images.length) return;
            images.splice(index, 1);
            writeImages(images);
            let current = readCurrent();
            if (current === index) current = -1;
            else if (current > index) current -= 1;
            writeStorage(CURRENT_KEY, String(current));
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
