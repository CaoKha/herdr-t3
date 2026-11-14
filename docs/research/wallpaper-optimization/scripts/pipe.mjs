// bun pipe.mjs <image> <style> <out.ans> : the mod's own import pipeline (sips crop+resize, decode, sample, map).
import { imagePlan, decodeBmp, sampleImage, imageAns } from "./art.js";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
const [, , img, style, out] = process.argv;
const run = (it) => { for (;;) { const s = it.next(); if (s.done) return s.value; } };
const sz = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", img]).toString();
const [w, h] = ["Width", "Height"].map((d) => Number(sz.match(new RegExp(`pixel${d}: (\\d+)`))[1]));
const plan = imagePlan(w, h), c = plan.crop, bmp = `${out}.bmp`;
const t0 = performance.now();
execFileSync("sips", ["-s", "format", "bmp", "-c", String(c.height), String(c.width), "--cropOffset", String(c.y), String(c.x), "-z", String(plan.height), String(plan.width), img, "--out", bmp], { stdio: "ignore" });
const t1 = performance.now();
const px = run(decodeBmp(readFileSync(bmp).toString("base64"))); rmSync(bmp);
const t2 = performance.now();
const text = run(imageAns(run(sampleImage(px, style, plan)), style));
const t3 = performance.now();
writeFileSync(out, text);
console.log(JSON.stringify({ img, style, rows: plan.rows, columns: plan.columns, sips: Math.round(t1 - t0), decode: Math.round(t2 - t1), map: Math.round(t3 - t2), bytes: text.length }));
