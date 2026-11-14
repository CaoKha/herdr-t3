// rewrite/wallpaper after the 2026-11-14 decisions: source.js's steps one by one (sips straight to the sample grid, turned
// upright as it writes), then the mod's own sampleImage, imageAns, makePicture and Library.publish, which keeps the
// preview's picture. Copied beside this file by instance.sh: ascii-art.js, library.js (the version's own).
import { exec, theme } from "herdr";
import { decodeBmp, imagePlan, sampleImage, imageAns } from "./ascii-art.js";
import { Library, finish, makePicture } from "./library.js";
import { ORIENTATION, must, quote, sh } from "./common.js";
import { SCENES } from "./scenes.js";

export const STYLES = ["dots", "braille", "blocks", "quadrants"];
// The first mode's preview, as the draft Apply publishes.
let draft = null;

export async function imageFlow(stage, cx, from, work, name, styles) {
  const o = await stage("read", "orient", () => exec("osascript", ["-l", "JavaScript", "-e", ORIENTATION, from]));
  const turned = /^[5-8]$/.test(o.stdout.trim());
  const size = await stage("read", "size", () => must(exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", from])));
  let [w, h] = ["Width", "Height"].map((d) => Number(size.stdout.match(new RegExp(`pixel${d}: (\\d+)`))?.[1]));
  if (turned) [w, h] = [h, w];
  const plan = imagePlan(w, h), c = plan.crop, scaled = `${work}/scaled.bmp`, bmp = `${work}/image.bmp`;
  const sw = Math.max(plan.width, Math.round(w * plan.width / c.width)), shh = Math.max(plan.height, Math.round(h * plan.height / c.height));
  await stage("read", "resize", () => must(exec("sips", ["-s", "format", "bmp", "-z", String(turned ? sw : shh), String(turned ? shh : sw), from, "--out", scaled])));
  await stage("read", "crop", () => must(exec("sips", ["-c", String(plan.height), String(plan.width), "--cropOffset",
    String(Math.min(shh - plan.height, Math.round(c.y * plan.height / c.height))), String(Math.min(sw - plan.width, Math.round(c.x * plan.width / c.width))), scaled, "--out", bmp])));
  const b64 = await stage("read", "base64", async () => (await must(sh(`base64 < ${quote(bmp)} | tr -d '\\n'`))).stdout);
  await exec("rm", ["-f", scaled, bmp]);
  const pixels = await stage("read", "decode", () => finish(decodeBmp(b64), cx));
  let keep = null;
  for (const style of styles) {
    const sampled = await stage(style, "sample", () => finish(sampleImage(pixels, style, plan), cx));
    const text = await stage(style, "to-chars", () => finish(imageAns(sampled, style), cx));
    const scene = { id: `preview:${style}`, name, dir: `${work}/frame-${style}`, text, focus: 0.5 };
    const made = await stage(style, "compose", () => makePicture(scene, theme(), false, cx));
    if (!keep) { keep = text; draft = { name, text, scene: { ...scene, width: made.width, height: made.height } }; }
  }
  return keep;
}

export async function ansFlow(stage, cx, from, work, name) {
  const text = (await stage("ans", "read", () => must(exec("cat", [from])))).stdout;
  const scene = { id: "preview:ans", name, dir: `${work}/frame-ans`, text, focus: 0.5 };
  const made = await stage("ans", "compose", () => makePicture(scene, theme(), false, cx));
  draft = { name, text, scene: { ...scene, width: made.width, height: made.height } };
  return text;
}

// Apply with the preview's picture made, then a new palette and the light side (each a conversion, as before).
export async function savedFlow(stage, cx, libDir, name, text) {
  const lib = new Library(libDir);
  await lib.ready;
  await must(exec("mkdir", ["-p", `${libDir}/.tiles`, `${libDir}/.preview`]));
  await stage("apply", "publish", () => lib.publish({ ...draft, text, placement: { mode: "cover", zoom: 1, x: 0.5, y: 0.5 } }, cx, () => true));
  const saved = lib.imported.find((s) => s.name.startsWith(name));
  if (!saved) throw new Error("publish left nothing");
  await stage("saved", "after-apply", () => makePicture(saved, theme(), false, cx));
  const cold = { ...saved, dir: `${saved.dir}-cold` }, t = theme(), other = { ...t, ansi1: t.ansi2, ansi2: t.ansi1 };
  await stage("saved", "theme-palette", () => makePicture(cold, other, false, cx));
  await stage("saved", "theme-light", () => makePicture(cold, other, true, cx));
  const svg = await sh(`ls -l ${quote(saved.dir)} | awk '/\\.svg$/ {print $5}' | head -1`);
  return { scene: saved.id, svgBytes: Number(svg.stdout.trim()) };
}

// After a restart (an empty picture map): each saved picture as a starting Home shows it, its folder scanned first.
export async function coldFlow(stage, cx, home) {
  for (let i = 0; i < 5; i++) {
    const lib = new Library(`${home}/perf-lib/${i}`);
    await lib.ready;
    await stage("start", `scan-${i}`, () => lib.refresh(cx));
    for (const s of lib.imported) await stage("start", `picture:${s.name}`, () => makePicture(s, theme(), false, cx));
  }
}

export async function builtinFlow(stage, cx, home) {
  for (const s of SCENES) await stage("builtin", s.id, () => makePicture({ ...s, dir: `${home}/perf-builtin/${s.id}` }, theme(), false, cx));
}
