// How our tintOf buckets this frame's colours, against asciicn's ansi16 rule.
//   bun colour-stats.ts <frame.json>
import { readFileSync } from "node:fs";
const art = process.env.ASCII_ART ?? "extras/mods/asciicn-wallpaper/ascii-art.js";
const { tintOf } = await import(new URL(`file://${art.startsWith("/") ? "" : process.cwd() + "/"}${art}`).pathname);
const VGA = [[0,0,0],[170,0,0],[0,170,0],[170,85,0],[0,0,170],[170,0,170],[0,170,170],[170,170,170],[85,85,85],[255,85,85],[85,255,85],[255,255,85],[85,85,255],[255,85,255],[85,255,255],[255,255,255]];
const nearest = (rgb) => {
  let best = 0, bestD = Infinity;
  VGA.forEach((c, i) => { const d = (c[0]-rgb[0])**2 + (c[1]-rgb[1])**2 + (c[2]-rgb[2])**2; if (d < bestD) { bestD = d; best = i; } });
  return best;
};
const frame = JSON.parse(readFileSync(process.argv[2], "utf8"));
const fam = (i) => [1, 3, 2, 6, 4, 5][i] ?? null; // VGA hue index -> our 6-hue family
const ours = new Map(), vga = new Map(), steps = new Map();
let sameHue = 0, different = 0, greyOurs = 0, greyVga = 0;
for (let i = 0; i < frame.columns * frame.rows; i++) {
  const glyph = frame.glyphs[Math.floor(i / frame.columns)][i % frame.columns];
  if (glyph === " ") continue;
  const rgb = [frame.rgb[i*3], frame.rgb[i*3+1], frame.rgb[i*3+2]];
  const t = tintOf({ rgb });
  ours.set(t.tint, (ours.get(t.tint) ?? 0) + 1);
  steps.set(t.step, (steps.get(t.step) ?? 0) + 1);
  const v = nearest(rgb);
  vga.set(v, (vga.get(v) ?? 0) + 1);
  const ourHue = t.tint === "foreground" ? null : fam(Number(t.tint.replace("ansi", "")) % 8);
  const vgaHue = fam(v % 8);
  if (ourHue === null) greyOurs++;
  if (v === 0 || v === 7 || v === 8 || v === 15) greyVga++;
  if (ourHue !== null && ourHue === vgaHue) sameHue++; else if (ourHue !== null) different++;
}
const total = [...ours.values()].reduce((a, b) => a + b, 0);
console.log("cells with ink", total);
console.log("our tints", Object.fromEntries([...ours].sort((a,b)=>b[1]-a[1])));
console.log("our opacity steps", Object.fromEntries([...steps].sort((a,b)=>a[0]-b[0])));
console.log("nearest-VGA classes", Object.fromEntries([...vga].sort((a,b)=>b[1]-a[1])));
console.log({ sameHue, different, greyOurs, greyVga });
