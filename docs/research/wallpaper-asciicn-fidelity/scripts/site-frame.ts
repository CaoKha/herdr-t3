// One image frame, drawn by asciicn's own mapTones (lib/ascii/frame.ts) from a
// tone field sampled like lib/ascii/sample.ts. Writes <out>.ans (same SGR as
// lib/ascii/export.ts `toAnsi`) and <out>.json for the Pillow renderer.
//
//   bun site-frame.mjs <pixels.bin> <out> --charset dots --dither none --levels 1 --ansi-mode vga
import { readFileSync, writeFileSync } from "node:fs";
import { mapTones } from "./site/frame.ts";
import { autoLevels } from "./site/auto-levels.ts";
import type { ToneField } from "./site/frame.ts";

const [, , binPath, outBase, ...rest] = process.argv;
const arg = (name, fallback) => {
  const at = rest.indexOf(`--${name}`);
  return at < 0 ? fallback : rest[at + 1];
};
const charset = arg("charset", "dots");
const dither = arg("dither", "none");
const levels = arg("levels", "1") === "1";
const colorMode = arg("colorMode", "truecolor");
const ansi = arg("ansi", "vga");

const raw = readFileSync(binPath);
const headerEnd = raw.indexOf(0x0a);
const header = JSON.parse(raw.subarray(0, headerEnd).toString());
const body = raw.subarray(headerEnd + 1);
const count = header.width * header.height;
const tones = new Float32Array(body.buffer.slice(body.byteOffset, body.byteOffset + count * 4));
const colorBytes = new Uint8ClampedArray(body.buffer.slice(body.byteOffset + count * 4, body.byteOffset + count * 4 + count * 3));
const colors = new Uint8ClampedArray(count * 4);
for (let i = 0; i < count; i++) {
  colors[i * 4] = colorBytes[i * 3];
  colors[i * 4 + 1] = colorBytes[i * 3 + 1];
  colors[i * 4 + 2] = colorBytes[i * 3 + 2];
  colors[i * 4 + 3] = 255;
}
const field: ToneField = { colors, height: header.height, tones, width: header.width };
if (levels) autoLevels(field);

// Cell counts: the Studio's media renderer sizes the grid from the stage box and
// the cell metrics, so they come from the caller here.
const columns = Number(arg("columns", String(header.width)));
const rows = Number(arg("rows", String(header.height)));
const frame = mapTones(field, columns, rows, {
  ansi: ansi as "vga",
  charset: charset as "dots",
  colorMode: colorMode as "truecolor",
  dither: dither as "none",
});

// toAnsi, truecolor, no background: SGR before each run, reset per line and at the end.
const fg = (rgb) => `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
const lines: string[] = [];
for (let row = 0; row < frame.rows; row++) {
  let line = "", current = "";
  for (let column = 0; column < frame.columns; column++) {
    const index = row * frame.columns + column;
    const glyph = frame.glyphs[index] ?? " ";
    const at = index * 4;
    const code = glyph === " " ? current : fg([frame.colors?.[at] ?? 0, frame.colors?.[at + 1] ?? 0, frame.colors?.[at + 2] ?? 0]);
    if (code !== current) { line += code; current = code; }
    line += glyph;
  }
  lines.push(line === "" ? line : `${line}\x1b[0m`);
}
const ans = `${lines.join("\n")}\x1b[0m`;
writeFileSync(`${outBase}.ans`, ans);

const rgb = [];
for (let i = 0; i < frame.columns * frame.rows; i++) {
  rgb.push(frame.colors?.[i * 4] ?? 0, frame.colors?.[i * 4 + 1] ?? 0, frame.colors?.[i * 4 + 2] ?? 0);
}
writeFileSync(`${outBase}.json`, JSON.stringify({
  charset, colorMode, columns: frame.columns, dither, levels, rows: frame.rows,
  glyphs: Array.from({ length: frame.rows }, (_, r) => frame.glyphs.slice(r * frame.columns, (r + 1) * frame.columns).join("")),
  rgb,
  counts: Object.fromEntries([...new Set(frame.glyphs)].map((g) => [g, frame.glyphs.filter((x) => x === g).length])),
}));
console.log(`${outBase}: ${frame.columns}x${frame.rows}, charset ${charset}, dither ${dither}, ${ans.length} bytes`);
