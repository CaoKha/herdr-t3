// bun raster.mjs <W> <H> <label> <kind> <src> : rasterize every tile at 2× its drawn size (GPUI's SMOOTH_SVG_SCALE_FACTOR),
// as a cold first paint would; reports ms, mask megabytes, and summed tile area over the picture's area (overdraw).
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
const [, , W, H, label, kind, src] = process.argv;
let scene, tiles;
if (kind === "builtin") {
  const { SCENES } = await import(`${src}/scenes.js`); scene = SCENES.find((s) => s.id === label);
  tiles = scene.tiles.map((t) => ({ ...t, svg: readFileSync(`${src}/scenes/${scene.id}/${t.file}`, "utf8") }));
} else {
  const { convert } = await import("./art.js");
  const it = convert(readFileSync(src, "utf8")); tiles = [];
  for (;;) { const s = it.next(); if (s.done) { scene = s.value; break; } if (s.value) tiles.push(s.value); }
}
if (process.env.MERGE) tiles = (await import("./merge.mjs")).merge(tiles);
const unit = Math.max(H / scene.height, W / scene.width);
let ms = 0, bytes = 0, area = 0;
for (const t of tiles) {
  const w = Math.ceil((t.x1 - t.x0) * unit * 2), h = Math.ceil((t.y1 - t.y0) * unit * 2);
  area += (t.x1 - t.x0) * (t.y1 - t.y0);
  const t0 = performance.now();
  const r = new Resvg(t.svg, { fitTo: { mode: "width", value: w }, font: { loadSystemFonts: false } }).render();
  ms += performance.now() - t0; bytes += w * h; void r.width;
}
console.log(JSON.stringify({ label, home: `${W}x${H}`, tiles: tiles.length, overdraw: +(area / (scene.width * scene.height)).toFixed(1), rasterMs: Math.round(ms), maskMB: +(bytes / 2 ** 20).toFixed(1) }));
