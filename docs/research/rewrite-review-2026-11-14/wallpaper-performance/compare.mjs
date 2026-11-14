// Offline: one image through the current draft pipeline and through sips-to-grid, each drawn as the wallpaper picture in
// catppuccin-mocha, for side-by-side viewing. bun compare.mjs <mod dir> <image> <style> <out prefix>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
const [mod, image, style, out] = process.argv.slice(2);
const A = await import(`${mod}/ascii-art.js`);
const theme = JSON.parse(readFileSync(`${import.meta.dir}/../../../../extras/themes/catppuccin-mocha.json`, "utf8"));
// Herdr hands mods the 16 ANSI colours as ansi0..ansi15 beside foreground.
const colours = { foreground: theme.foreground, ...Object.fromEntries(theme.ansi.map((c, i) => [`ansi${i}`, c])) };
const run = (it) => { for (;;) { const s = it.next(); if (s.done) return s.value; } };
const tmp = mkdtempSync(`${tmpdir()}/wp-cmp-`), sips = (...a) => execFileSync("sips", a, { stdio: "pipe" }).toString();
const up = `${tmp}/up.bmp`; sips("-s", "format", "bmp", image, "--out", up);
const [w, h] = ["Width", "Height"].map((d) => Number(sips("-g", "pixelWidth", "-g", "pixelHeight", up).match(new RegExp(`pixel${d}: (\\d+)`))[1]));
const plan = A.imagePlan(w, h), c = plan.crop;
const read = (gw, gh) => { const f = `${tmp}/${gw}.bmp`; sips("-s", "format", "bmp", "-c", `${c.height}`, `${c.width}`, "--cropOffset", `${c.y}`, `${c.x}`, "-z", `${gh}`, `${gw}`, up, "--out", f);
  return run(A.decodeBmp(readFileSync(f).toString("base64"))); };
const draft = read(plan.width, plan.height), grid = read(plan.columns * 2, plan.rows * 4);
const small = { ...plan, crop: { x: 0, y: 0, width: grid.width, height: grid.height } };
for (const [name, px, p] of [["current", draft, plan], ["grid", grid, small]]) {
  const text = run(A.imageAns(run(A.sampleImage(px, style, p)), style));
  const tiles = []; const it = A.convert(text); let s;
  while (!(s = it.next()).done) if (s.value) tiles.push(s.value);
  writeFileSync(`${out}-${name}.svg`, A.picture(tiles, (t) => colours[t] ?? colours.foreground, s.value.width, s.value.height, 1600));
}
