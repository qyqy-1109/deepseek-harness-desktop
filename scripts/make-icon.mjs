/**
 * make-icon.mjs — build-time icon generation.
 *
 * Emits:
 *   assets/icon-blue.png   256px — classic DeepSeek blue whale (runtime default)
 *   assets/icon-black.png  256px — black whale variant
 *   build/icon.png         256px — blue (dev window/tray fallback)
 *   build/icon.ico         multi-size blue (installer/exe icon)
 *
 * Uses the official DSH whale from build/favicon-official.svg via
 * @resvg/resvg-js; falls back to a zero-dependency pixel icon when the
 * rasterizer is missing.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { encodeIco, ICON_SIZES, renderSvgPng, whaleSvg, readFaviconPathData } from "../main/icon-maker.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "assets");
const BUILD = join(ROOT, "build");
const FAVICON = join(BUILD, "favicon-official.svg");

const BLUE = { top: "#5686FE", bottom: "#4176E6" };
const BLACK = { top: "#26262a", bottom: "#0a0a0c" };

/* ------------------------------------------------------------------ */
/* zero-dependency pixel fallback (256x256)                           */
/* ------------------------------------------------------------------ */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgb) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 3;
      raw[o++] = rgb[p];
      raw[o++] = rgb[p + 1];
      raw[o++] = rgb[p + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
function pixelFallbackIcons() {
  const SIZE = 256;
  const render = (r0, g0, b0, r1, g1, b1) => {
    const rgb = new Uint8Array(SIZE * SIZE * 3);
    const setPx = (x, y, r, g, b) => {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
      const p = (y * SIZE + x) * 3;
      rgb[p] = r;
      rgb[p + 1] = g;
      rgb[p + 2] = b;
    };
    const fillRoundRect = (x0, y0, x1, y1, radius, r, g, b) => {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
          const dy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
          if (dx * dx + dy * dy <= radius * radius) setPx(x, y, r, g, b);
        }
      }
    };
    const drawLine = (x0, y0, x1, y1, width, r, g, b) => {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(x0 + (x1 - x0) * t);
        const y = Math.round(y0 + (y1 - y0) * t);
        fillRoundRect(x - width / 2, y - width / 2, x + width / 2, y + width / 2, width / 2, r, g, b);
      }
    };
    const R = 56;
    for (let y = 0; y < SIZE; y++) {
      const t = y / SIZE;
      const r = Math.round(r0 + (r1 - r0) * t);
      const g = Math.round(g0 + (g1 - g0) * t);
      const b = Math.round(b0 + (b1 - b0) * t);
      for (let x = 0; x < SIZE; x++) {
        const dx = Math.max(R - x, 0, x - (SIZE - 1 - R));
        const dy = Math.max(R - y, 0, y - (SIZE - 1 - R));
        if (dx * dx + dy * dy <= R * R) setPx(x, y, r, g, b);
      }
    }
    const W = 26;
    drawLine(92, 92, 140, 128, W, 255, 255, 255);
    drawLine(140, 128, 92, 164, W, 255, 255, 255);
    fillRoundRect(150, 154, 178, 174, 10, 255, 255, 255);
    return encodePng(SIZE, SIZE, rgb);
  };
  return {
    blue: render(65, 118, 230, 86, 134, 254),
    black: render(10, 10, 12, 38, 38, 42),
  };
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */
mkdirSync(ASSETS, { recursive: true });
mkdirSync(BUILD, { recursive: true });

let blue256;
let black256;
let source = "pixel fallback";
try {
  const pathData = readFaviconPathData(FAVICON);
  blue256 = await renderSvgPng(whaleSvg(pathData, BLUE.top, BLUE.bottom), 256);
  black256 = await renderSvgPng(whaleSvg(pathData, BLACK.top, BLACK.bottom), 256);
  if (blue256 && black256) source = "official whale (resvg)";
} catch (error) {
  console.warn(`[make-icon] resvg path failed (${error.message}); using pixel fallback`);
}
if (!blue256 || !black256) {
  const fallback = pixelFallbackIcons();
  blue256 ??= fallback.blue;
  black256 ??= fallback.black;
}

// runtime builtin icons (assets/)
writeFileSync(join(ASSETS, "icon-blue.png"), blue256);
writeFileSync(join(ASSETS, "icon-black.png"), black256);

// installer icon (build/, blue, multi-size)
const bluePngs = new Map();
for (const size of ICON_SIZES) {
  let png = null;
  try {
    png = await renderSvgPng(whaleSvg(readFaviconPathData(FAVICON), BLUE.top, BLUE.bottom), size);
  } catch {
    /* fall through */
  }
  bluePngs.set(size, png ?? blue256);
}
writeFileSync(join(BUILD, "icon.png"), blue256);
writeFileSync(join(BUILD, "icon.ico"), encodeIco(bluePngs));

console.log(`[make-icon] done (${source}): assets/icon-blue.png, assets/icon-black.png, build/icon.png, build/icon.ico`);
