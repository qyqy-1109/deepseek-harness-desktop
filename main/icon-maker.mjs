/**
 * icon-maker.mjs — shared icon helpers (pure ESM, no Electron imports):
 * multi-size ICO encoding and the official-whale composite SVG builder.
 * Used by scripts/make-icon.mjs (build time) and main/main.js (runtime).
 */
import { readFileSync } from "node:fs";

/** Standard Windows icon sizes, largest first. */
export const ICON_SIZES = [256, 128, 64, 48, 32, 24, 16];

/** CRC32 table for PNG chunk checksums. */
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

/**
 * Encode a multi-image .ico from PNG buffers.
 * @param pngs - Map<size, Buffer> (or iterable of [size, buffer]).
 * @returns the ICO file buffer.
 */
export function encodeIco(pngs) {
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

/**
 * Build the composite SVG for the official DSH whale on a gradient rounded
 * square.
 * @param pathData - the whale <path d="..."> from favicon-official.svg.
 * @param top - gradient top color (e.g. "#5686FE").
 * @param bottom - gradient bottom color (e.g. "#4176E6").
 * @param glyph - glyph fill color (default white).
 * @returns the SVG document string.
 */
export function whaleSvg(pathData, top, bottom, glyph = "#ffffff") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="50" height="50" rx="12" fill="url(#bg)"/>
  <g transform="translate(5 5) scale(0.8)">
    <path d="${pathData}" fill="${glyph}"/>
  </g>
</svg>`;
}

/** Extract the first <path d="..."> from an SVG document. */
export function extractPathData(svgText) {
  const match = /<path[^>]*\sd="([^"]+)"/.exec(svgText);
  if (!match) throw new Error("no <path d=...> found in favicon SVG");
  return match[1];
}

/**
 * Render an SVG string to PNG at the given width using @resvg/resvg-js.
 * Returns null when the rasterizer is unavailable (e.g. in the packaged app,
 * where it is a devDependency only).
 */
export async function renderSvgPng(svg, size) {
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  } catch {
    return null;
  }
}

/** Read the official favicon path data from a local copy of favicon.svg. */
export function readFaviconPathData(svgPath) {
  return extractPathData(readFileSync(svgPath, "utf8"));
}
