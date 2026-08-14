/**
 * Generates build/icon.png (256x256) and build/icon.ico (multi-size) for the
 * DeepSeek Harness Desktop shell.
 *
 * Primary path: rasterizes the OFFICIAL DeepSeek Harness whale logo
 * (build/favicon-official.svg, fetched from the running GUI's /favicon.svg)
 * on a DeepSeek-blue rounded square, using @resvg/resvg-js.
 * Fallback path: the previous zero-dependency pixel-drawn terminal ">" icon.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "build");
const SRC_SVG = join(OUT_DIR, "favicon-official.svg");
const SIZES = [256, 128, 64, 48, 32, 24, 16];

/* ------------------------------------------------------------------ */
/* official whale icon via resvg                                      */
/* ------------------------------------------------------------------ */

/** Build a composite SVG: blue gradient rounded square + white whale. */
function compositeSvg(pathData) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5686FE"/>
      <stop offset="1" stop-color="#4176E6"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="50" height="50" rx="12" fill="url(#bg)"/>
  <g transform="translate(5 5) scale(0.8)">
    <path d="${pathData}" fill="#ffffff"/>
  </g>
</svg>`;
}

/** Extract the first <path d="..."> from an SVG document. */
function extractPathData(svgText) {
  const match = /<path[^>]*\sd="([^"]+)"/.exec(svgText);
  if (!match) throw new Error("no <path d=...> found in favicon SVG");
  return match[1];
}

async function renderOfficialIcons() {
  const { Resvg } = await import("@resvg/resvg-js");
  const svgText = readFileSync(SRC_SVG, "utf8");
  const composite = compositeSvg(extractPathData(svgText));
  const pngs = new Map();
  for (const size of SIZES) {
    const rendered = new Resvg(composite, { fitTo: { mode: "width", value: size } }).render();
    pngs.set(size, rendered.asPng());
  }
  return pngs;
}

/* ------------------------------------------------------------------ */
/* fallback pixel icon (previous design, zero deps)                   */
/* ------------------------------------------------------------------ */
import { deflateSync } from "node:zlib";

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
function chunk(type, data) {
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
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function renderFallback() {
  const SIZE = 256;
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
    const r = Math.round(65 + (86 - 65) * t);
    const g = Math.round(118 + (134 - 118) * t);
    const b = Math.round(230 + (254 - 230) * t);
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
  return new Map([[256, encodePng(SIZE, SIZE, rgb)]]);
}

/* ------------------------------------------------------------------ */
/* ICO writer (multi-image)                                           */
/* ------------------------------------------------------------------ */
function encodeIco(pngs) {
  const entries = [...pngs.entries()].sort((a, b) => b[0] - a[0]);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const parts = [header];
  for (const [size, png] of entries) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    parts.push(entry);
    offset += png.length;
  }
  for (const [, png] of entries) parts.push(png);
  return Buffer.concat(parts);
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */
mkdirSync(OUT_DIR, { recursive: true });

let pngs;
let source = "official whale (resvg)";
try {
  pngs = await renderOfficialIcons();
} catch (error) {
  console.warn(`[make-icon] resvg path failed (${error.message}); falling back to pixel icon`);
  pngs = renderFallback();
  source = "pixel fallback";
}

writeFileSync(join(OUT_DIR, "icon.png"), pngs.get(256));
writeFileSync(join(OUT_DIR, "icon.ico"), encodeIco(pngs));
console.log(`icon written (${source}): build/icon.png (256) + build/icon.ico (${[...pngs.keys()].sort((a, b) => b - a).join("/")})`);
