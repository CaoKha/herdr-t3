// bun render.mjs <frame.ans> <theme.json> <out.svg> [aspect] : tiles through the mod's convert(), composited on the theme background.
import { convert } from "./art.js";
import { readFileSync, writeFileSync } from "node:fs";
const [, , ans, themePath, out, aspectArg] = process.argv;
const theme = JSON.parse(readFileSync(themePath, "utf8"));
const colour = (tint) => (tint === "foreground" ? theme.foreground : theme.ansi[Number(tint.slice(4))]);
const it = convert(readFileSync(ans, "utf8"), aspectArg ? Number(aspectArg) : undefined), tiles = [];
const t0 = performance.now(); let frame;
for (;;) { const s = it.next(); if (s.done) { frame = s.value; break; } if (s.value) tiles.push(s.value); }
const ms = performance.now() - t0;
if (process.env.MERGE) tiles.splice(0, tiles.length, ...(await import("./merge.mjs")).merge(tiles));
const W = frame.width, H = frame.height, parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${Math.round(W * 10)}" height="${H * 10}"><rect width="${W}" height="${H}" fill="${theme.background}"/>`];
let bytes = 0;
for (const t of tiles) {
  const c = colour(t.tint); bytes += t.svg.length;
  parts.push(`<g opacity="${t.opacity}" fill="none" stroke="${c}" stroke-linecap="round">${t.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replaceAll("#000", c)}</g>`);
}
writeFileSync(out, parts.join("") + "</svg>");
const layers = new Set(tiles.map((t) => `${t.tint}-${t.opacity}`));
console.log(JSON.stringify({ ans, tiles: tiles.length, layers: layers.size, svgBytes: bytes, convertMs: Math.round(ms), width: W, height: H }));
