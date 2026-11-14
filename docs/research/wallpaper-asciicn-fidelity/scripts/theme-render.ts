// Render a frame through the mod's own converter (extras/mods/asciicn-wallpaper/ascii-art.js)
// with the theme's colours, as one SVG, plus tile statistics.
//
//   bun theme-render.ts <frame.ans> <aspect> <outBase> <theme.json> [--art <path to ascii-art.js>] [--tint vga]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , ansPath, aspectArg, outBase, themePath, ...rest] = process.argv;
const arg = (name, fallback) => {
  const at = rest.indexOf(`--${name}`);
  return at < 0 ? fallback : rest[at + 1];
};
const artPath = resolve(arg("art", process.env.ASCII_ART ?? "extras/mods/asciicn-wallpaper/ascii-art.js"));
const { convert } = await import(artPath);

const theme = JSON.parse(readFileSync(themePath, "utf8"));
const colour = (tint) => (tint === "foreground" ? theme.foreground : theme.ansi[Number(tint.slice(4))]);
const text = readFileSync(ansPath, "utf8");
const aspect = aspectArg === "auto" ? undefined : Number(aspectArg);

const tiles = [];
let frame;
const it = convert(text, aspect);
for (;;) {
  const step = it.next();
  if (step.done) { frame = step.value; break; }
  if (step.value) tiles.push(step.value);
}

const W = frame.width, H = frame.height;
const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
  `<rect x="0" y="0" width="${W}" height="${H}" fill="${theme.background}"/>`];
for (const tile of tiles) {
  const c = colour(tile.tint);
  const body = tile.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replaceAll("#000", c);
  parts.push(`<g opacity="${tile.opacity}" fill="none" stroke="${c}" stroke-linecap="round">${body}</g>`);
}
parts.push("</svg>");
writeFileSync(`${outBase}.svg`, parts.join(""));

const largest = tiles.reduce((a, t) => Math.max(a, t.svg.length), 0);
writeFileSync(`${outBase}.json`, JSON.stringify({
  ansBytes: text.length, aspect: frame.aspect, columns: Math.round(W / frame.aspect), frameHeight: H,
  layers: new Set(tiles.map((t) => `${t.tint}-${t.opacity}`)).size, largestTileBytes: largest,
  rows: Math.round(H), svgBytes: parts.join("").length, tiles: tiles.length, width: W,
}));
console.log(`${outBase}: aspect ${frame.aspect}, ${W}x${H}, ${tiles.length} tiles, ${parts.join("").length} svg bytes, largest tile ${largest}`);
