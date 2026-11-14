// bun whole.mjs <composite.svg> <width> : one full-picture raster, as the preview's image() path makes.
import { Resvg } from "@resvg/resvg-js"; import { readFileSync } from "node:fs";
const [, , f, w] = process.argv, svg = readFileSync(f, "utf8").replace(/<rect[^>]*\/>/, "");
const t0 = performance.now(), r = new Resvg(svg, { fitTo: { mode: "width", value: Number(w) }, font: { loadSystemFonts: false } }).render();
console.log(JSON.stringify({ f: f.split("/").pop(), w: r.width, h: r.height, ms: Math.round(performance.now() - t0), rgbaMB: +(r.width * r.height * 4 / 2 ** 20).toFixed(1) }));
