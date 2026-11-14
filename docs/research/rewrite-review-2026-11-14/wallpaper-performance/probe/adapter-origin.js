// origin/main (9a9fd18c, VERSION 2, the import restored by 22622fdd): main.js's startPreview/previewStyle/drawTiles/
// applyPreview steps around the version's own ascii-art.js. No EXIF step; previews and saved pictures are svg() tiles.
import { exec, writeTextFile } from "herdr";
import { convert, decodeBmp, imageGrid, imageAns } from "./ascii-art.js";
import { must, quote, sh, tick } from "./common.js";

export const STYLES = ["braille", "blocks", "dots"];

// That version's finish: a tick only where the generator yields.
async function finish(it, cx) {
  for (let step = it.next(); ; step = it.next()) {
    if (step.done) return step.value;
    await tick(cx);
  }
}

async function drawTiles(text, out, cx) {
  await must(exec("mkdir", ["-p", out]));
  const it = convert(text), tiles = [];
  let step;
  while (!(step = it.next()).done) {
    if (!step.value) { await tick(cx); continue; }
    const { svg: body, ...tile } = step.value;
    await writeTextFile(`${out}/${tile.file}`, body, null);
    tiles.push(tile);
  }
  return { ...step.value, tiles };
}

export async function imageFlow(stage, cx, from, work, name, styles) {
  const size = await stage("read", "size", () => must(exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", from])));
  const [w, h] = ["Width", "Height"].map((d) => Number(size.stdout.match(new RegExp(`pixel${d}: (\\d+)`))?.[1]));
  const grid = imageGrid(w, h), bmp = `${work}/image.bmp`;
  await stage("read", "crop+resize", () => must(exec("sips", ["-s", "format", "bmp", "-z", String(grid.height), String(grid.width), from, "--out", bmp])));
  const b64 = await stage("read", "base64", async () => (await must(sh(`base64 < ${quote(bmp)} | tr -d '\\n'; rm -f ${quote(bmp)}`))).stdout);
  const pixels = await stage("read", "decode", () => finish(decodeBmp(b64), cx));
  let keep = null;
  for (const style of styles) {
    const text = await stage(style, "to-chars", () => finish(imageAns(pixels, style), cx));
    await stage(style, "tiles", () => drawTiles(text, `${work}/frame-${style}`, cx));
    keep ??= text;
  }
  return keep;
}

export async function ansFlow(stage, cx, from, work, name) {
  const text = (await stage("ans", "read", () => must(exec("cat", [from])))).stdout;
  await stage("ans", "tiles", () => drawTiles(text, `${work}/frame-ans`, cx));
  return text;
}

export async function savedFlow(stage, cx, libDir, name, text) {
  await must(exec("mkdir", ["-p", `${libDir}/.tiles`, `${libDir}/.preview`]));
  await stage("apply", "publish", async () => {
    const out = `${libDir}/.preview/save-${Date.now()}`;
    await must(exec("mkdir", ["-p", out]));
    const paths = [];
    for (const [i, part] of (text.match(/[\s\S]{1,65536}/gu) ?? [""]).entries()) { await writeTextFile(`${out}/${i}.part`, part, null); paths.push(`${out}/${i}.part`); }
    await must(sh(`cat ${paths.map(quote).join(" ")} > ${quote(`${out}/drawing`)}`));
    await must(exec("link", [`${out}/drawing`, `${libDir}/${name}.ans`]));
    await exec("rm", ["-rf", out]);
    await sh('for f in .ans .*.ans *.ans; do [ -f "$f" ] || continue; sum=$(cksum < "$f") || exit; printf "%s\\0%s\\0" "$sum" "${f%.ans}"; done', libDir);
    const read = (await must(exec("cat", [`${libDir}/${name}.ans`]))).stdout, tiles = `${libDir}/.tiles/${name}`;
    const scene = await drawTiles(read, tiles, cx);
    await writeTextFile(`${tiles}/scene.json`, JSON.stringify({ sum: "x", focus: 0.5, width: scene.width, height: scene.height, tiles: scene.tiles }), null);
  });
  const n = await sh(`ls ${quote(`${libDir}/.tiles/${name}`)} | wc -l`);
  return { tiles: Number(n.stdout.trim()) };
}
