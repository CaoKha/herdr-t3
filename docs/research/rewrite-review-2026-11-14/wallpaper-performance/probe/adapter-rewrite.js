// rewrite/wallpaper (4586dc3d): readImage's steps one by one, then the mod's own sampleImage, imageAns, makePicture and
// Library.publish. Copied beside this file by instance.sh: ascii-art.js, library.js (the version's own).
import { exec, theme } from "herdr";
import { decodeBmp, imagePlan, sampleImage, imageAns } from "./ascii-art.js";
import { Library, finish, makePicture } from "./library.js";
import { ORIENTATION, must, quote, sh } from "./common.js";
import { SCENES } from "./scenes.js";

export const STYLES = ["dots", "braille", "blocks", "quadrants"];
const CHUNK = 786432;

export async function imageFlow(stage, cx, from, work, name, styles) {
  let src = from;
  const o = await stage("read", "orient", () => exec("osascript", ["-l", "JavaScript", "-e", ORIENTATION, from]));
  if (/^[2-8]$/.test(o.stdout.trim())) {
    await stage("read", "upright", () => must(exec("sips", ["-s", "format", "bmp", from, "--out", `${work}/upright.bmp`])));
    src = `${work}/upright.bmp`;
  }
  const size = await stage("read", "size", () => must(exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", src])));
  const [w, h] = ["Width", "Height"].map((d) => Number(size.stdout.match(new RegExp(`pixel${d}: (\\d+)`))?.[1]));
  const plan = imagePlan(w, h), c = plan.crop, bmp = `${work}/image.bmp`;
  await stage("read", "crop+resize", () => must(exec("sips", ["-s", "format", "bmp", "-c", String(c.height), String(c.width), "--cropOffset", String(c.y), String(c.x),
    "-z", String(plan.height), String(plan.width), src, "--out", bmp])));
  const chunks = await stage("read", "base64", async () => {
    const bytes = Number((await sh(`wc -c < ${quote(bmp)}`)).stdout.trim()), out = [];
    for (let skip = 0; skip * CHUNK < bytes; skip++) out.push((await must(sh(`dd if=${quote(bmp)} bs=${CHUNK} skip=${skip} count=1 2>/dev/null | base64 | tr -d '\\n'`))).stdout);
    return out;
  });
  await exec("rm", ["-f", bmp, `${work}/upright.bmp`]);
  const pixels = await stage("read", "decode", () => finish(decodeBmp(chunks), cx));
  let keep = null;
  for (const style of styles) {
    const sampled = await stage(style, "sample", () => finish(sampleImage(pixels, style, plan), cx));
    const text = await stage(style, "to-chars", () => finish(imageAns(sampled, style), cx));
    await stage(style, "compose", () => makePicture({ id: `preview:${style}`, name, dir: `${work}/frame-${style}`, text, focus: 0.5 }, theme(), false, cx));
    keep ??= text;
    (imageFlow.texts ??= {})[style] = text;
  }
  return keep;
}

export async function ansFlow(stage, cx, from, work, name) {
  const text = (await stage("ans", "read", () => must(exec("cat", [from])))).stdout;
  await stage("ans", "compose", () => makePicture({ id: "preview:ans", name, dir: `${work}/frame-ans`, text, focus: 0.5 }, theme(), false, cx));
  return text;
}

// Apply, then what a saved picture costs: a cold start (the picture map is empty after a restart, so the same work as a
// new folder), a palette change and the light side.
export async function savedFlow(stage, cx, libDir, name, text) {
  const lib = new Library(libDir);
  await lib.ready;
  // ready is made once per module (every Library shares it): this library's own folders.
  await must(exec("mkdir", ["-p", `${libDir}/.tiles`, `${libDir}/.preview`]));
  await stage("apply", "publish", () => lib.publish({ name, text, placement: { mode: "cover", zoom: 1, x: 0.5, y: 0.5 } }, cx, () => true));
  const saved = lib.imported.find((s) => s.name.startsWith(name));
  if (!saved) throw new Error("publish left nothing");
  const cold = { ...saved, dir: `${saved.dir}-cold` };
  await stage("saved", "cold-start", () => makePicture(cold, theme(), false, cx));
  await stage("saved", "warm-start", () => makePicture(cold, theme(), false, cx));
  const t = theme(), other = { ...t, ansi1: t.ansi2, ansi2: t.ansi1 };
  await stage("saved", "theme-palette", () => makePicture(cold, other, false, cx));
  await stage("saved", "theme-light", () => makePicture(cold, other, true, cx));
  const svg = await sh(`ls -l ${quote(cold.dir)} | awk '/\\.svg$/ {print $5}' | head -1`);
  return { scene: saved.id, svgBytes: Number(svg.stdout.trim()) };
}

// What the first switch to a built-in costs in JS: its tiles read and put together as one picture (then image() rasterises
// it off the UI thread, which a hidden window never asks for).
export async function builtinFlow(stage, cx, home) {
  for (const s of SCENES) await stage("builtin", s.id, () => makePicture({ ...s, dir: `${home}/perf-builtin/${s.id}` }, theme(), false, cx));
}

// The candidate: sips scales the crop straight to the braille sample grid (2×4 per cell, the finest any mode needs), so JS
// decodes ~0.1-0.3MP instead of a 4×-supersampled 1.8-4.2MP draft; coarser modes are exact block averages of it. Returns
// each mode's glyph agreement with the current pipeline's text (`base`, by style).
const cells = (text) => text.replace(/\x1b\][^\x07]*\x07/g, "").replace(/\x1b\[[0-9;]*m/g, "");
export async function gridFlow(stage, cx, from, work, base) {
  let src = from;
  const o = await exec("osascript", ["-l", "JavaScript", "-e", ORIENTATION, from]);
  if (/^[2-8]$/.test(o.stdout.trim())) { await must(exec("sips", ["-s", "format", "bmp", from, "--out", `${work}/upright.bmp`])); src = `${work}/upright.bmp`; }
  const size = await must(exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", src]));
  const [w, h] = ["Width", "Height"].map((d) => Number(size.stdout.match(new RegExp(`pixel${d}: (\\d+)`))?.[1]));
  const plan = imagePlan(w, h), c = plan.crop, bmp = `${work}/grid.bmp`, gw = plan.columns * 2, gh = plan.rows * 4;
  await stage("grid", "crop+resize", () => must(exec("sips", ["-s", "format", "bmp", "-c", String(c.height), String(c.width), "--cropOffset", String(c.y), String(c.x),
    "-z", String(gh), String(gw), src, "--out", bmp])));
  const b64 = await stage("grid", "base64", async () => (await must(sh(`base64 < ${quote(bmp)} | tr -d '\\n'`))).stdout);
  const pixels = await stage("grid", "decode", () => finish(decodeBmp(b64), cx));
  const small = { ...plan, crop: { x: 0, y: 0, width: gw, height: gh } }, agree = {};
  for (const style of STYLES) {
    const sampled = await stage(`grid-${style}`, "sample", () => finish(sampleImage(pixels, style, small), cx));
    const text = await stage(`grid-${style}`, "to-chars", () => finish(imageAns(sampled, style), cx));
    const a = [...cells(text)], b = [...cells(base[style])];
    let same = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) same++;
    agree[style] = { glyphs: +(same / Math.max(a.length, b.length)).toFixed(4), exact: text === base[style] };
  }
  await exec("rm", ["-f", bmp, `${work}/upright.bmp`]);
  return agree;
}
