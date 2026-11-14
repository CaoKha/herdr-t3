// The installed copy (c0db6c99, VERSION 4): main.js's startPreview/renderDraft/drawTiles/previewImage/applyPreview steps,
// copied line for line around the version's own ascii-art.js. Saved wallpapers draw as svg() tiles: no JS at start.
import { exec, theme, writeTextFile } from "herdr";
import { convert, decodeBmp, imagePlan, sampleImage, imageAns } from "./ascii-art.js";
import { ORIENTATION, must, quote, sh, tick } from "./common.js";

export const STYLES = ["dots", "braille", "blocks", "quadrants"];

async function finish(it, cx) {
  let until = Date.now() + 6;
  for (;;) {
    const step = it.next();
    if (step.done) return step.value;
    if (Date.now() >= until) { await tick(cx); until = Date.now() + 6; }
  }
}

async function drawTiles(text, out, cx, preview = false, aspect) {
  await must(exec("mkdir", ["-p", out]));
  const sheet = async (paper) => {
    const it = convert(text, aspect, paper), tiles = [], layers = [];
    for (;;) {
      const step = it.next();
      if (step.done) return { ...step.value, tiles, layers };
      if (!step.value) { await tick(cx); continue; }
      const { svg: body, ...tile } = step.value;
      if (paper) tile.file = `paper-${tile.file}`;
      await writeTextFile(`${out}/${tile.file}`, body, null);
      tiles.push(tile);
      if (preview) layers.push({ body, tint: tile.tint, opacity: tile.opacity });
    }
  };
  const dark = await sheet(false), paper = dark?.paper ? await sheet(true) : null;
  return { ...dark, paper: paper?.tiles, layers: { dark: dark.layers, paper: paper?.layers ?? null } };
}

async function previewImage(scene, layers, out, cx) {
  const t = theme(), drawn = layers.dark, { width, height } = scene, parts = [];
  const scale = 4096 / Math.max(width, height);
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width * scale)}" height="${Math.ceil(height * scale)}" viewBox="0 0 ${width} ${height}">`
    + drawn.map(l => l.body.replaceAll('#000', t[l.tint] ?? t.foreground ?? '#000')
      .replace(/<svg\b[^>]*>/, `<g fill="none" stroke="${t[l.tint] ?? t.foreground ?? '#000'}" stroke-linecap="round" opacity="${l.opacity}">`)
      .replace(/<\/svg>/, '</g>')).join('') + '</svg>';
  for (const [n, part] of (body.match(/[\s\S]{1,65536}/gu) ?? []).entries()) {
    const file = `${out}.${n}.part`;
    await writeTextFile(file, part, null);
    parts.push(file);
    await tick(cx);
  }
  await must(sh(`cat ${parts.map(quote).join(' ')} > ${quote(out)}`));
  await exec('rm', ['-f', ...parts]);
  return body.length;
}

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
    for (let skip = 0; skip * 786432 < bytes; skip++) out.push((await must(sh(`dd if=${quote(bmp)} bs=786432 skip=${skip} count=1 2>/dev/null | base64 | tr -d '\\n'`))).stdout);
    return out;
  });
  await exec("rm", ["-f", bmp, `${work}/upright.bmp`]);
  const pixels = await stage("read", "decode", () => finish(decodeBmp(chunks), cx));
  let keep = null;
  for (const style of styles) {
    const sampled = await stage(style, "sample", () => finish(sampleImage(pixels, style, plan), cx));
    const text = await stage(style, "to-chars", () => finish(imageAns(sampled, style), cx));
    const out = `${work}/frame-${style}`;
    const drawn = await stage(style, "tiles", () => drawTiles(text, out, cx, true, 0.5));
    await stage(style, "compose", () => previewImage(drawn, drawn.layers, `${out}/image-1.svg`, cx));
    keep ??= text;
  }
  return keep;
}

export async function ansFlow(stage, cx, from, work, name) {
  const text = (await stage("ans", "read", () => must(exec("cat", [from])))).stdout;
  const drawn = await stage("ans", "tiles", () => drawTiles(text, `${work}/frame-ans`, cx, true));
  await stage("ans", "compose", () => previewImage(drawn, drawn.layers, `${work}/frame-ans/image-1.svg`, cx));
  return text;
}

// Apply: saveFile, the folder scan and convertOwned's drawTiles (dark and paper sets) and scene.json.
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
    await writeTextFile(`${tiles}/scene.json`, JSON.stringify({ sum: "x", focus: 0.5, width: scene.width, height: scene.height, tiles: scene.tiles, paper: scene.paper }), null);
  });
  const n = await sh(`ls ${quote(`${libDir}/.tiles/${name}`)} | wc -l`);
  return { tiles: Number(n.stdout.trim()) };
}
