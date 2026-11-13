// Home as a still picture in asciicn's dots (https://asciicn.dev, MIT, see LICENSE-asciicn): one of its own, one of the
// person's images drawn in Dots/Braille/Blocks/Quadrants, or a frame they made in that Studio, in the theme's colours.
// Every picture is tiles of one theme colour at one opacity (ascii-art.js); the theme tints them, so a new theme repaints
// them at once. The built-ins are under scenes/ (scripts/wallpaper.mjs); imports are the `.ans` files in
// <appHome>/asciicn-wallpaper/ (an image becomes one there), each converted once into its .tiles/<name>/, its
// scene.json written last and keyed by the file's cksum and the converter's VERSION, so a changed or half-converted one,
// or one an older converter made, is converted again.
// The pointer near the bottom-right corner shows the switcher: ‹ › step, × asks before deleting, and + opens the add card.
// Images and Studio exports preview across Home; only Apply publishes their .ans and framing.
// The picture picked is the person's, shared under `asciicn-wallpaper.scene`, so a new Home shows it too.
//
// Without saved framing, the picture scales with the pane's height. Its subject (`focus`) is pinned by a percentage left and
// a fixed margin, which layout works out itself: a width change, as the sidebar folding, only shows more or less of the
// edges, with no frame laid out late and nothing rasterised again. Sizing from the width would do both, so only a picture
// narrower than the pane does (Studio's frames are about 1.2:1, the built-ins 2.4:1): it fills the width and is cut
// evenly at the top and bottom.
// Saved imports use relative cover/contain, zoom and alignment; tiles are never rebuilt for framing or resizing.
// Reaching Home other than by t3-tabs (which lays it out first), the pane shows for a frame or two 60px short (still under
// `main`'s header and the unfolded tab row, see t3-tabs' fitRow) before it takes its height: the picture hangs from the
// bottom, which stays put, and a smaller height counts only once it has lasted 250ms, so that dip neither moves nor rescales it.
// shortcut: imports go through sh, cp, rm, cksum and base64, the dialog through osascript (macOS) or zenity (Linux), an image
// through sips (macOS) or ImageMagick (Linux); on Windows the card offers only the folder, until Herdr gives mods a file picker.
import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, SliderState, Slider, SliderTrack, SliderIndicator, SliderThumb } from "gpui-base";
import { appHome, exec, nextCommand, notify, openOverlay, readTextFile, setShared, settings, shared, theme, watchFolder, window, writeTextFile } from "herdr";
import { SCENES } from "./scenes.js";
import { VERSION, imageAns, convert, decodeBmp, imagePlan, sampleImage } from "./ascii-art.js";
import { enter, focusRoot, stop, stopsEnd, stopsInit } from "./focus.js";
import { button as drawButton, radiusOf } from "./button.js";
import { tip } from "./tip.js";

const MOD = "asciicn-wallpaper", KEY = `${MOD}.scene`, PLACEMENTS = `${MOD}.placements`;
const STYLES = [['dots', 'Dots'], ['braille', 'Braille'], ['blocks', 'Blocks'], ['quadrants', 'Quadrants']];
const BUILT_IN = SCENES.map((s) => ({ ...s, base: `mods/${MOD}/scenes/${s.id}` }));
const zoom = () => Number(settings()?.zoom) || 1;
// Where the pointer shows the switcher: it at its widest, 12 from the corner, and about 60 more each way.
const CORNER = { w: 368, h: 104 };
// Imports being converted, by name: the module is shared by every copy, so two Homes don't convert one file twice.
const converting = new Map();
// Only this run: a confirmed deletion also cancels an Apply waiting in another Home.
const applying = new Set();
let placementsVersion = 0;
// Draft identity and framing live only for this run; each Home owns its preview folder.
// Clear abandoned folders once per app run, before any copy can start drawing a new preview.
let previewsReady;
const bounded = (n, fallback, min, max) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
const placement = (p, focus = 0.5) => ({ mode: p?.mode === "contain" ? "contain" : "cover",
  zoom: bounded(p?.zoom, 1, 1, 4), x: bounded(p?.x, focus, 0, 1), y: bounded(p?.y, 0.5, 0, 1) });
const tick = (cx) => new Promise((go) => cx.timer.after(0, () => go(undefined)));
// Batch cheap yields within 6ms, then let input/paint run. A superseded draft stops at the next chunk.
async function finish(it, cx, current = () => true) {
  let until = Date.now() + 6;
  for (;;) {
    if (!current()) { it.return?.(); return null; }
    const step = it.next();
    if (step.done) return step.value;
    if (Date.now() >= until) { await tick(cx); until = Date.now() + 6; }
  }
}
const sh = (script, dir, timeout) => exec("sh", ["-c", script], { cwd: dir, timeout });
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
const paletteOf = t => [t.background, t.foreground, ...Array.from({ length: 16 }, (_, n) => t[`ansi${n}`])].join("|");
// A light theme draws new images on paper (ascii-art.js): ink where the picture is dark, not where it is bright.
const lightTheme = t => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt((t.background ?? "#000000").slice(i, i + 2), 16) || 0);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 127.5;
};
// EXIF orientation through ImageIO. sips -g reports the stored size and keeps the tag on PNG, but applies it on writing a
// BMP: so a photo stored sideways is first written upright to a BMP, whose size and pixels then agree.
const ORIENTATION = 'ObjC.import("Foundation");ObjC.import("ImageIO");function run(a){const s=$.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(a[0]),null);'
  + 'if(!s)return "1";const o=ObjC.castRefToObject($.CGImageSourceCopyPropertiesAtIndex(s,0,null)).objectForKey("Orientation");return o.isNil()?"1":String(ObjC.unwrap(o))}';
// Studio on an image, in Braille and true colour: the set that converts most faithfully.
const STUDIO = "https://asciicn.dev/studio?source=image&charset=braille&color=truecolor";
const opener = () => ({ macos: "open", windows: "explorer" })[window()?.platform] ?? "xdg-open";

export default class Wallpaper extends View {
  init(_props, cx) {
    stopsInit(this, cx);
    this.height = null;
    this.over = false;
    this.hot = null;
    this.imported = [];
    this.importing = null;
    this.draft = null;
    this.composeFocus = cx.focus_handle();
    this.zoomFocus = cx.focus_handle();
    this.scale = SliderState.new({ min: 1, max: 4, step: 0.01, value: 1 });
    this.scale.on("change", (value, cx) => {
      if (this.draft && this.draft.placement.zoom !== value) this.zoomFocus.focus();
      this.setPlacement(this.draft, { zoom: value }, cx);
    });
    this.dir = `${appHome()}/${MOD}`;
    cx.spawn(async (cx) => {
      this.ready = previewsReady ??= exec("rm", ["-rf", `${this.dir}/.preview`])
        .then(() => exec("mkdir", ["-p", `${this.dir}/.tiles`, `${this.dir}/.preview`]));
      await this.ready;
      await this.refresh(cx);
      // Our own tile writes land here too: only an .ans file, or a batch that means everything, is news.
      for (;;) if ((await watchFolder(this.dir)).some((p) => p === this.dir || p.endsWith(".ans"))) await this.refresh(cx);
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus") enter(this, cx, this.draft ? "wallpaper-compose" : "wallpaper-add");
        if (this.deleting && command === `delete:${this.deleting.token}`) {
          const { scene } = this.deleting;
          this.deleting = null;
          await this.remove(scene, cx);
        }
      }
    });
  }

  close() {
    stopsEnd(this);
    this.closed = true;
    this.previewRequest = null;
    this.drag = null;
    this.scale.release();
    const draft = this.draft;
    this.draft = null;
    if (draft?.conversion) draft.conversion.cancelled = true;
    if (draft) exec("rm", ["-rf", draft.dir]).catch(() => null);
  }

  async drawTiles(text, out, cx, job = null, preview = false, aspect) {
    if (job?.cancelled) return null;
    const made = await exec("mkdir", ["-p", out]);
    if (made.code !== 0) throw new Error(made.stderr.trim());
    // One set of tiles; a new image also gets a paper set, for light themes, beside it under its own prefix.
    const sheet = async (paper) => {
      const it = convert(text, aspect, paper), tiles = [], layers = [];
      for (;;) {
        if (job?.cancelled) return null;
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
    if (!dark || (dark.paper && !paper)) return null;
    if (!dark.tiles.length && !paper?.tiles.length) throw new Error("No visible marks. Try another picture or adjust its contrast in Studio.");
    const { tiles, layers, ...geometry } = dark;
    return { focus: 0.5, ...geometry, tiles, ...(paper ? { paper: paper.tiles } : {}),
      ...(preview ? { layers: { dark: layers, paper: paper?.layers ?? null } } : {}) };
  }

  // SVG masks are cached by drawn size; image() decodes this fixed-size, theme-coloured source only once.
  async previewImage(d, cx, scene = d.scene, layers = d.layers, current = () => true) {
    const active = () => this.draft === d && current();
    const t = theme(), palette = paletteOf(t), serial = d.imageSerial = (d.imageSerial ?? 0) + 1;
    const drawn = lightTheme(t) && layers.paper ? layers.paper : layers.dark;
    const path = `${scene.base}/image-${serial}.svg`, out = `${appHome()}/${path}`, parts = [];
    const { width, height } = scene;
    // shortcut: a 4096px preview can soften at extreme zoom; saved wallpaper still uses the vector tiles.
    const scale = 4096 / Math.max(width, height);
    const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width * scale)}" height="${Math.ceil(height * scale)}" viewBox="0 0 ${width} ${height}">`
      + drawn.map(l => l.body.replaceAll('#000', t[l.tint] ?? t.foreground ?? '#000')
        .replace(/<svg\b[^>]*>/, `<g fill="none" stroke="${t[l.tint] ?? t.foreground ?? '#000'}" stroke-linecap="round" opacity="${l.opacity}">`)
        .replace(/<\/svg>/, '</g>')).join('') + '</svg>';
    try {
      for (const [n, part] of (body.match(/[\s\S]{1,65536}/gu) ?? []).entries()) {
        if (!active()) return;
        const file = `${out}.${n}.part`;
        await writeTextFile(file, part, null);
        parts.push(file);
        await tick(cx);
      }
      if (!active()) return;
      const made = await sh(`cat ${parts.map(quote).join(' ')} > ${quote(out)}`, this.dir);
      if (made.code !== 0) throw new Error(made.stderr.trim());
      if (active()) return { image: path, palette };
    } finally {
      if (parts.length) await exec('rm', ['-f', ...parts]);
      if (this.draft !== d) await exec('rm', ['-rf', d.dir]);
    }
  }

  // The folder's .ans files: each shown once converted, converted when it isn't yet or changed since; tiles of a removed one go.
  async sourceFiles() {
    const listed = await sh('for f in .ans .*.ans *.ans; do [ -f "$f" ] || continue; sum=$(cksum < "$f") || exit; printf "%s\\0%s\\0" "$sum" "${f%.ans}"; done', this.dir);
    if (listed.code !== 0) throw new Error(listed.stderr.trim());
    const fields = listed.stdout.split("\0"), files = [];
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const name = fields[i + 1], sum = fields[i].trim().split(/\s+/).join("-");
      if (!name || name === "." || name === "..") {
        notify({ title: "Couldn't import the wallpaper", body: `${name}.ans: Rename this file before importing it.`, level: "warning" });
        continue;
      }
      files.push({ sum: `${sum}-${VERSION}`, name });
    }
    return files;
  }

  async refresh(cx, retryName = null) {
    const version = placementsVersion, placed = Object.keys(shared(PLACEMENTS) ?? {});
    const files = await this.sourceFiles();
    if (this.closed) return;
    if (version === placementsVersion) for (const id of placed) if (!files.some(f => id === `file:${f.name}`)) this.forgetPlacement(id);
    const cleaned = await sh('cd .tiles || exit; for d in .*/ */; do d=${d%/}; case "$d" in .|..) continue;; esac; [ -e "../$d.ans" ] || rm -rf "./$d" || exit; done', this.dir);
    if (cleaned.code !== 0) throw new Error(cleaned.stderr.trim());
    const shown = [], todo = [];
    for (const f of files) {
      let kept = null;
      try { kept = JSON.parse((await readTextFile(`${this.dir}/.tiles/${f.name}/scene.json`)) ?? "null"); } catch { kept = null; }
      if (kept?.sum !== f.sum || (kept.failed && f.name === retryName)) todo.push(f);
      else if (!kept.failed) shown.push({ ...kept, id: `file:${f.name}`, name: f.name, base: `${MOD}/.tiles/${f.name}` });
    }
    this.imported = shown.sort((a, b) => a.name.localeCompare(b.name));
    cx.notify();
    for (const f of todo) await this.convertFile(f, cx);
  }

  async convertFile(f, cx) {
    const busy = converting.get(f.name);
    if (busy) { await busy.promise; await this.refresh(cx); return; }
    const job = { cancelled: false, promise: null };
    converting.set(f.name, job);
    job.promise = this.convertOwned(f, cx, job);
    let stale;
    try { stale = await job.promise; } finally { if (converting.get(f.name) === job) converting.delete(f.name); }
    if (stale && !job.cancelled) await this.refresh(cx);
  }

  async convertOwned(f, cx, job) {
    this.importing = f.name;
    cx.notify();
    const out = `${this.dir}/.tiles/${f.name}`, mark = (scene) => writeTextFile(`${out}/scene.json`, JSON.stringify({ sum: f.sum, ...scene }), null);
    let stale = false;
    const current = async () => {
      if (job.cancelled) return false;
      const sum = await sh(`cksum < ${quote(`./${f.name}.ans`)}`, this.dir);
      return !job.cancelled && sum.code === 0 && `${sum.stdout.trim().split(/\s+/).join("-")}-${VERSION}` === f.sum;
    };
    try {
      const text = await exec("cat", [`${this.dir}/${f.name}.ans`]);
      if (job.cancelled) return;
      await exec("rm", ["-rf", out]);
      if (text.code !== 0) throw new Error(text.stderr.trim());
      const scene = await this.drawTiles(text.stdout, out, cx, job);
      if (!scene || !(await current())) { stale = true; return true; }
      await mark(scene);
      if (!(await current())) { stale = true; return true; }
      this.imported = [...this.imported.filter((s) => s.name !== f.name), { ...scene, sum: f.sum, id: `file:${f.name}`, name: f.name, base: `${MOD}/.tiles/${f.name}` }]
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      if (job.cancelled) return;
      await mark({ failed: true }).catch(() => null);
      const waiting = [...applying].filter(a => a.name === f.name);
      for (const a of waiting) a.error = `${e?.message ?? e}`;
      if (!waiting.length) notify({ title: "Couldn't import the wallpaper", body: `${f.name}.ans: ${e?.message ?? e}`, level: "warning" });
    } finally {
      if (job.cancelled || stale) await exec("rm", ["-rf", out]);
      this.importing = null;
      cx.notify();
    }
  }

  // No activate (a macOS focus timeout) or default location (an extra Downloads permission prompt).
  async choose(cx, ans = false) {
    if (this.opening) return;
    this.opening = true;
    cx.notify();
    const mac = window()?.platform === "macos";
    const title = ans ? "Import a Studio .ans file" : "Choose an image for your wallpaper";
    const picked = await (mac
      ? exec("osascript", ["-e", `POSIX path of (choose file with prompt "${title}" of type {"${ans ? "ans" : "public.image"}"})`], { timeout: 600000 })
      : exec("zenity", ["--file-selection", `--title=${title}`,
        ans ? "--file-filter=Studio files | *.ans" : "--file-filter=Images | *.png *.jpg *.jpeg *.webp *.gif *.bmp *.tif *.tiff *.heic"], { timeout: 600000 })).catch(() => null);
    this.opening = false;
    cx.notify();
    if (this.closed) return;
    if (!picked) {
      notify({ title: "No file dialog here", body: `Copy .ans files into ${this.dir}: Open folder shows it.`, level: "info" });
      return;
    }
    const from = picked.stdout.replace(/\r?\n$/, "");
    // Cancelled: osascript's -128, zenity's 1, nothing said.
    if (picked.code !== 0 || !from) return;
    const file = from.split("/").pop();
    let base = file.replace(/\.[^.]*$/, "").replace(/[\x00-\x1f\x7f/\\]/g, "-");
    if (!base || base === "." || base === "..") base = "wallpaper";
    this.guide = false;
    return this.startPreview(from, base, cx, ans);
  }

  async availableName(base) {
    const names = new Set((await this.sourceFiles()).map(f => f.name));
    let name = base;
    for (let n = 2; names.has(name); n++) name = `${base} ${n}`;
    return name;
  }

  async saveFile(name, text) {
    await this.ready;
    const out = `${this.dir}/.preview/save-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const made = await exec("mkdir", ["-p", out]);
      if (made.code !== 0) throw new Error(made.stderr.trim());
      const parts = text.match(/[\s\S]{1,65536}/gu) ?? [""], paths = [];
      // The native writer caps each call at 1 MiB; whole Unicode characters keep each part at most 256 KiB.
      for (const [i, part] of parts.entries()) {
        const path = `${out}/${i}.part`;
        await writeTextFile(path, part, null);
        paths.push(path);
      }
      const joined = await sh(`cat ${paths.map(quote).join(" ")} > ${quote(`${out}/drawing`)}`, this.dir);
      if (joined.code !== 0) throw new Error(joined.stderr.trim());
      // Unlike ln, link never treats an existing destination directory as a place to put the file.
      const saved = await exec("link", [`${out}/drawing`, `${this.dir}/${name}.ans`]);
      if (saved.code !== 0) throw new Error(saved.stderr.trim());
    } finally {
      await exec("rm", ["-rf", out]);
    }
  }

  // `saved`, to reframe an applied import: its name and framing. Apply then reuses that file, unchanged.
  async startPreview(from, name, cx, ans = false, saved = null) {
    const cancelled = this.cancelPreview(cx), request = this.previewRequest = {};
    await cancelled;
    await this.ready;
    if (this.closed || this.previewRequest !== request) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const draft = this.draft = { id, name, dir: `${this.dir}/.preview/${id}`, style: 'dots', pixels: null, placement: placement(saved?.placement), savedName: saved?.name, busy: true, scene: null, text: null, error: null, saveError: null, applying: false };
    this.scale.set_value(draft.placement.zoom);
    // This full-Home editor has no terminal underneath; pointer imports need focusable controls too.
    /** @type {any} */ (this).fs.modal = true;
    this.composeFocus.focus();
    cx.notify();
    const bmp = `${draft.dir}/image.bmp`, mac = window()?.platform === "macos";
    try {
      const madeDir = await exec("mkdir", ["-p", draft.dir]);
      if (madeDir.code !== 0) throw new Error(madeDir.stderr.trim());
      let text;
      if (ans) {
        if (!from.toLowerCase().endsWith(".ans")) throw new Error("Choose a .ans file exported from Studio.");
        const read = await exec("cat", [from]);
        if (read.code !== 0) throw new Error(read.stderr.trim());
        text = read.stdout;
      } else {
        if (mac) from = await this.upright(from, draft.dir);
        const size = await (mac ? exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", from]) : exec("convert", [`${from}[0]`, "-auto-orient", "-format", "%w %h", "info:"]));
        const [w, h] = mac ? ["Width", "Height"].map((d) => Number(size.stdout.match(new RegExp(`pixel${d}: (\\d+)`))?.[1])) : size.stdout.trim().split(" ").map(Number);
        if (!(w > 0 && h > 0)) throw new Error("it isn't a picture this computer can read");
        const plan = draft.plan = imagePlan(w, h), c = plan.crop;
        const made = await (mac ? exec("sips", ["-s", "format", "bmp", "-c", String(c.height), String(c.width), "--cropOffset", String(c.y), String(c.x), "-z", String(plan.height), String(plan.width), from, "--out", bmp])
          : exec("convert", [`${from}[0]`, "-auto-orient", "-crop", `${c.width}x${c.height}+${c.x}+${c.y}`, "+repage", "-resize", `${plan.width}x${plan.height}!`, `bmp3:${bmp}`]));
        if (made.code !== 0) throw new Error(made.stderr.trim() || "it couldn't be resized");
        const sizeRead = await sh(`wc -c < ${quote(bmp)}`, this.dir), bytes = Number(sizeRead.stdout.trim());
        if (sizeRead.code !== 0 || !Number.isSafeInteger(bytes) || bytes <= 0) throw new Error(sizeRead.stderr.trim() || "Couldn't read the preview pixels.");
        const chunks = [];
        // exec drops stdout past 8 MiB; 3-byte-aligned chunks encode to 1 MiB and decode without a giant join.
        for (let skip = 0; skip * 786432 < bytes; skip++) {
          if (this.draft !== draft) return;
          const read = await sh(`dd if=${quote(bmp)} bs=786432 skip=${skip} count=1 2>/dev/null | base64 | tr -d '\\n'`, this.dir);
          if (read.code !== 0 || !read.stdout) throw new Error(read.stderr.trim() || "Couldn't read the preview pixels.");
          chunks.push(read.stdout);
        }
        await exec('rm', ['-f', bmp, `${draft.dir}/upright.bmp`]);
        const pixels = await finish(decodeBmp(chunks), cx, () => this.draft === draft);
        if (this.draft !== draft) return;
        draft.pixels = pixels;
        return await this.renderDraft(draft, cx);
      }
      if (this.draft !== draft) return;
      const { layers, ...scene } = await this.drawTiles(text, draft.dir, cx, null, true);
      if (this.draft !== draft) return;
      draft.text = text;
      draft.layers = layers;
      draft.scene = { ...scene, id: `preview:${id}`, name, base: `${MOD}/.preview/${id}` };
      Object.assign(draft, await this.previewImage(draft, cx));
    } catch (e) {
      if (this.draft !== draft) return;
      const missing = !mac && /ENOENT|not found|spawn/i.test(String(e?.message ?? e));
      draft.error = missing ? "Install ImageMagick to import pictures, or import a .ans file from Studio." : `${e?.message ?? e}`;
    } finally {
      if (this.draft !== draft) await exec("rm", ["-rf", draft.dir]);
      else if (!draft.conversion) draft.busy = false;
      if (!this.closed) cx.notify();
    }
  }

  // An upright copy of a photo stored sideways, in the draft's folder; the photo itself when it is upright or unreadable.
  async upright(from, dir) {
    const read = await exec("osascript", ["-l", "JavaScript", "-e", ORIENTATION, from]).catch(() => null);
    if (read?.code !== 0 || !/^[2-8]$/.test(read.stdout.trim())) return from;
    const out = `${dir}/upright.bmp`, made = await exec("sips", ["-s", "format", "bmp", from, "--out", out]);
    if (made.code !== 0) throw new Error(made.stderr.trim() || "it couldn't be turned upright");
    return out;
  }

  async setStyle(style, cx) {
    const d = this.draft;
    if (!d?.pixels || d.applying || !STYLES.some(([id]) => id === style) || (d.style === style && !d.error)) return;
    d.style = style;
    return this.renderDraft(d, cx);
  }

  async renderDraft(d, cx) {
    if (d.conversion) d.conversion.cancelled = true;
    const n = d.generation = (d.generation ?? 0) + 1, base = `${MOD}/.preview/${d.id}/frame-${n}`, out = `${appHome()}/${base}`;
    const job = d.conversion = { cancelled: false }, current = () => this.draft === d && d.conversion === job && !job.cancelled;
    d.busy = true;
    d.error = d.saveError = null;
    this.drag = null;
    cx.notify();
    try {
      await tick(cx);
      const sampled = await finish(sampleImage(d.pixels, d.style, d.plan), cx, current);
      if (!current()) return;
      const text = await finish(imageAns(sampled, d.style), cx, current);
      if (!current()) return;
      const drawn = await this.drawTiles(text, out, cx, job, true, 0.5);
      if (!drawn || !current()) return;
      const { layers, ...geometry } = drawn;
      const scene = { ...geometry, id: `preview:${d.id}:${n}`, name: d.name, base };
      const raster = await this.previewImage(d, cx, scene, layers, current);
      if (!current()) return;
      const old = d.scene;
      Object.assign(d, raster, { text, scene, layers });
      if (old) await exec('rm', ['-rf', `${appHome()}/${old.base}`]);
    } catch (e) {
      if (current()) d.error = `${e?.message ?? e}`;
    } finally {
      if (this.draft !== d) await exec('rm', ['-rf', d.dir]);
      else if (d.scene?.base !== base) await exec('rm', ['-rf', out]);
      if (current()) d.busy = false;
      if (!this.closed) cx.notify();
    }
  }

  async cancelPreview(cx) {
    const draft = this.draft;
    this.draft = null;
    if (draft?.conversion) draft.conversion.cancelled = true;
    this.previewRequest = null;
    this.drag = null;
    /** @type {any} */ (this).fs.modal = false;
    if (draft) await exec("rm", ["-rf", draft.dir]);
    if (!this.closed && !this.draft && /** @type {any} */ (this).fs.keyboard) enter(this, cx, "wallpaper-add");
    if (!this.closed) cx.notify();
  }

  async applyPreview(cx) {
    const draft = this.draft;
    if (!draft?.scene || draft.busy || draft.error || draft.applying) return;
    this.drag = null;
    draft.saveError = null;
    draft.applying = true;
    const job = { name: draft.savedName, cancelled: false, error: null, publishing: null };
    applying.add(job);
    cx.notify();
    try {
      let name = draft.savedName;
      if (name) {
        const saved = await exec("cat", [`${this.dir}/${name}.ans`]);
        if (saved.code !== 0 || saved.stdout !== draft.text) name = null;
      }
      if (!name) {
        name = await this.availableName(draft.name);
        job.name = name;
        if (job.cancelled) throw new Error("The saved drawing was deleted. Try Apply again.");
        job.publishing = this.saveFile(name, draft.text);
        await job.publishing;
        draft.savedName = name;
      }
      await this.refresh(cx, name);
      if (this.draft !== draft || this.closed) return;
      if (job.cancelled) throw new Error("The saved drawing was deleted. Try Apply again.");
      if (!this.imported.some(s => s.name === name)) throw new Error(job.error ?? "The drawing couldn't be prepared. Try Apply again.");
      placementsVersion++;
      setShared(PLACEMENTS, { ...shared(PLACEMENTS), [`file:${name}`]: { ...draft.placement } });
      setShared(KEY, `file:${name}`);
      await this.cancelPreview(cx);
    } catch (e) {
      if (this.draft !== draft || this.closed) return;
      draft.applying = false;
      draft.saveError = `${e?.message ?? e}`;
      this.failed(draft.name, `${e?.message ?? e}`, cx);
    } finally {
      applying.delete(job);
    }
  }

  failed(name, why, cx) {
    notify({ title: "Couldn't import the wallpaper", body: `${name}: ${why}`, level: "warning" });
    cx.notify();
  }

  forgetPlacement(id) {
    const kept = { ...shared(PLACEMENTS) };
    if (!Object.hasOwn(kept, id)) return;
    delete kept[id];
    placementsVersion++;
    setShared(PLACEMENTS, kept);
  }

  askRemove(scene) {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.deleting = { scene, token };
    openOverlay({ mod: "t3-actions", kind: "dialog", frame: "none", width: 512, props: {
      actions: "confirm", title: `Delete ${scene.name}?`,
      detail: "This permanently deletes the imported wallpaper and its cached drawing. Your original image is kept.",
      yes: "Delete", command: { name: `${MOD}.delete:${token}` },
    } });
  }

  // Update the selection only after the confirmed deletion succeeds.
  async remove(scene, cx) {
    const all = [...BUILT_IN, ...this.imported], i = all.findIndex(s => s.id === scene.id);
    // An already-started publication must finish before deletion, never recreate the file after it.
    for (const a of applying) if (a.name === scene.name && a.publishing) await a.publishing.catch(() => null);
    const removed = await sh(`rm -f ${quote(`./${scene.name}.ans`)}`, this.dir);
    if (removed.code !== 0) {
      notify({ title: "Couldn't delete the wallpaper", body: `${scene.name}: ${removed.stderr.trim()}`, level: "warning" });
      return;
    }
    const job = converting.get(scene.name);
    if (job) job.cancelled = true;
    for (const a of applying) if (a.name === scene.name) a.cancelled = true;
    this.forgetPlacement(scene.id);
    if (shared(KEY) === scene.id) setShared(KEY, all[(i - 1 + all.length) % all.length].id);
    this.imported = this.imported.filter((s) => s.id !== scene.id);
    this.hot = null;
    cx.notify();
    const cleaned = await exec("rm", ["-rf", `${this.dir}/.tiles/${scene.name}`]);
    if (cleaned.code !== 0) notify({ title: "Wallpaper deleted", body: `Its cached drawing couldn't be removed: ${cleaned.stderr.trim()}`, level: "warning" });
  }

  render(cx) {
    const t = theme(), all = [...BUILT_IN, ...this.imported];
    const d = this.draft;
    if (d?.image && !d.busy && d.palette !== paletteOf(t) && !d.repainting) {
      const scene = d.scene, current = () => this.draft === d && d.scene === scene && !d.busy;
      d.repainting = true;
      cx.timer.after(0, cx => cx.spawn(async cx => {
        try {
          const old = d.image, raster = await this.previewImage(d, cx, scene, d.layers, current);
          if (current() && raster) {
            Object.assign(d, raster);
            await exec('rm', ['-f', `${appHome()}/${old}`]);
          }
        } catch (e) { if (current()) { d.image = null; d.saveError = `${e?.message ?? e}`; } }
        finally { d.repainting = false; if (!this.closed) cx.notify(); }
      }));
    }
    const i = Math.max(0, all.findIndex((s) => s.id === shared(KEY))), scene = this.draft?.scene ?? all[i];
    const root = div().id("wallpaper").size_full().relative().overflow_hidden()
      .on_size_change((size, cx) => {
        const height = this.seen = Math.round(size.height / zoom()), width = Math.round(size.width / zoom());
        if (width !== this.width) { this.drag = null; this.width = width; cx.notify(); }
        if (!this.height || height > this.height) { this.drag = null; this.height = height; cx.notify(); }
        else if (height < this.height) cx.timer.after(250, (cx) => { if (this.seen < this.height) { this.drag = null; this.height = this.seen; cx.notify(); } });
      });
    if (!this.height) return root;
    const p = placement(this.draft?.scene ? this.draft.placement : shared(PLACEMENTS)?.[scene.id], scene.focus);
    const unit = (p.mode === "contain" ? Math.min : Math.max)(this.height / scene.height, (this.width ?? 0) / scene.width) * p.zoom;
    const w = scene.width * unit, h = scene.height * unit;
    const picture = div().id(`wallpaper-${scene.id}`).absolute().bottom((this.height - h) * (1 - p.y)).left(`${p.x * 100}%`).ml(-p.x * w).w(w).h(h)
      .when(Boolean(d?.image && d.palette === paletteOf(t)), el => el.child(image(d.image).id('wallpaper-preview-image').size_full()))
      .when(!d?.image || d.palette !== paletteOf(t), el => el.children((lightTheme(t) && scene.paper ? scene.paper : scene.tiles).map((l) => svg(`${scene.base}/${l.file}`).absolute().left(l.x0 * unit).top(l.y0 * unit)
        .w((l.x1 - l.x0) * unit).h((l.y1 - l.y0) * unit).text_color(t[l.tint]).opacity(l.opacity))));
    const button = (id, icon, label, act, disabled = false) => stop(this, t, id, drawButton(t, id, { icon: `mods/${MOD}/icons/${icon}.svg`, label, hot: this.hot === id, act, disabled })
      .on_hover((on, cx) => { this.hot = on ? id : this.hot === id ? null : this.hot; cx.notify(); }), radiusOf("xs"));
    const go = (by) => () => setShared(KEY, all[(i + by + all.length) % all.length].id);
    const imported = scene.id.startsWith("file:");
    const switcher = h_flex().id("wallpaper-switcher").absolute().right(12).bottom(12).p(4).gap(4).items_center()
      .rounded(8).bg(t.chrome).text_size(12).text_color(t.dim)
      .opacity(this.over || this.guide || this.draft || /** @type {any} */ (this).fs.keyboard ? 1 : 0).transition("opacity", { duration: 150, easing: "ease-out" })
      .child(button("wallpaper-back", "chevron-left", "Previous wallpaper", go(-1), !!this.draft || all.length < 2))
      .child(div().w(Math.min(160, Math.max(0, (this.width ?? 332) - 172))).flex_none().overflow_x_hidden().text_ellipsis().whitespace_nowrap().text_center()
        .child(this.importing ? `Importing ${this.importing}…` : scene.name))
      .child(button("wallpaper-next", "chevron-right", "Next wallpaper", go(1), !!this.draft || all.length < 2))
      .child(button("wallpaper-add", "plus", "Add a wallpaper", (cx) => { this.guide = !this.guide; cx.notify(); }, !!this.draft))
      .child(button("wallpaper-frame", "crop", imported ? `Adjust framing of ${scene.name}` : "Only imported wallpapers can be reframed",
        (cx) => { this.guide = false; cx.spawn(cx => this.startPreview(`${this.dir}/${scene.name}.ans`, scene.name, cx, true, { name: scene.name, placement: shared(PLACEMENTS)?.[scene.id] })); },
        !imported || !!this.draft))
      .child(button("wallpaper-remove", "x", imported ? `Delete ${scene.name}` : "Only imported wallpapers can be deleted", () => this.askRemove(scene), !imported || !!this.draft));
    const corner = div().id("wallpaper-corner").absolute().right(0).bottom(0).w(CORNER.w).h(CORNER.h)
      .on_hover((on, cx) => { this.over = on; if (!on) this.hot = null; cx.notify(); })
      .child(switcher);
    return focusRoot(this, root.child(picture)
      .child(corner)
      .when(Boolean(this.draft), el => el.child(this.compositionCanvas(t, w, h)).child(this.previewCard(t)))
      .when(this.guide && !this.draft, (el) => el.child(this.guideCard(t))));
  }

  setPlacement(d, change, cx) {
    if (d !== this.draft || !d?.scene || d.busy || d.error || d.applying) return;
    d.placement = placement({ ...d.placement, ...change });
    if (this.scale.value() !== d.placement.zoom) this.scale.set_value(d.placement.zoom);
    this.drag = null;
    cx.notify();
  }

  compositionCanvas(t, w, h) {
    const d = this.draft, active = () => this.draft === d && d.scene && !d.busy && !d.error && !d.applying;
    const move = (p, dx, dy, cx) => {
      if (!active()) return;
      const x = Math.abs(this.width - w) > 0.01 ? p.x + dx / (this.width - w) : p.x;
      const y = Math.abs(this.height - h) > 0.01 ? p.y + dy / (this.height - h) : p.y;
      d.placement = placement({ ...d.placement, x, y });
      cx.notify();
    };
    return stop(this, t, "wallpaper-compose", div().id("wallpaper-compose")
      .when(active(), el => el.cursor_grab()).role("group").accessibility_label("Wallpaper position. Drag or use arrow keys; Shift moves faster.")
      .on_mouse_move((e, cx) => {
        if (this.drag) move(this.drag.placement, (e.position.x - this.drag.at.x) / zoom(), (e.position.y - this.drag.at.y) / zoom(), cx);
      })
      .on_mouse_up("left", () => { this.drag = null; })
      .on_hover(on => { if (!on) this.drag = null; })
      .on_key_down((e, cx) => {
        if (!active() || e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        const delta = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[e.key];
        if (!delta) return;
        /** @type {any} */ (this).fs.keyboard = true;
        this.drag = null;
        const step = e.modifiers.shift ? 50 : 10;
        move(d.placement, delta[0] * step, delta[1] * step, cx);
        cx.stop_propagation();
      }), 8, { handle: this.composeFocus })
      // stop() makes its focus-ring parent relative; the editor must still cover the whole Home.
      .absolute().inset_0()
      .on_mouse_down("left", (e, cx) => {
        if (!active()) return;
        this.composeFocus.focus();
        this.drag = { at: e.position, placement: { ...d.placement } };
        cx.stop_propagation();
      });
  }

  // A card's full-width rows: T3's compact button, 28 with 12px words, to fit its 300 width.
  action(t, id, label, act, disabled = false, primary = false) {
    return stop(this, t, id, drawButton(t, id, { variant: primary ? "primary" : "outline", size: "compact", text: label, act, disabled }), radiusOf("compact"));
  }

  // T3 popover + segmented ToggleGroup; no T3 slider, so its 16px control icon and 4px spacing form the thumb/track.
  previewCard(t) {
    const d = this.draft, p = d.placement, disabled = !d.scene || d.busy || !!d.error || d.applying;
    const reset = p.zoom === 1 && p.x === 0.5 && p.y === 0.5;
    // T3 Toggle xs: 24px/12px words and 3px horizontal padding keep all four names inside a 300px card.
    const styles = h_flex().id('wallpaper-styles').h(28).w_full().p(2).gap(2).rounded(8).bg(t.raised).role('group').accessibility_label('Image processing')
      .on_hover((on, cx) => { this.hot = on ? 'wallpaper-styles' : null; cx.notify(); })
      .children(STYLES.map(([style, text], index) => stop(this, t, `wallpaper-style-${style}`,
        drawButton(t, `wallpaper-style-${style}`, { text: style === 'quadrants' && (this.width ?? 324) < 324 ? 'Quads' : text,
          label: `${text}${d.pixels ? d.style === style ? ', selected' : '' : ': Studio files keep their fixed characters'}`,
          size: 'xs', surface: 'card', on: !!d.pixels && d.style === style, disabled: !d.pixels || d.applying,
          act: cx => cx.spawn(cx => this.setStyle(style, cx)) }).px(3).rounded(6).flex_1().min_w(0).whitespace_nowrap()
          .on_key_down((e, cx) => {
            if (!d.pixels || d.applying || e.modifiers.control || e.modifiers.platform || e.modifiers.alt || !['left', 'right', 'up', 'down'].includes(e.key)) return;
            const next = STYLES[(index + (['right', 'down'].includes(e.key) ? 1 : STYLES.length - 1)) % STYLES.length][0];
            enter(this, cx, `wallpaper-style-${next}`);
            cx.spawn(cx => this.setStyle(next, cx));
            cx.stop_propagation();
          }), 6)));
    return v_flex().id("wallpaper-preview").absolute().right(12).bottom(60).w(Math.min(300, Math.max(0, (this.width ?? 324) - 24))).p(16).gap(12).h(352)
      .rounded(8).bg(t.popover).border_1().border_color(t.border).shadow_lg().text_size(12).text_color(t.muted)
      .child(tip(this, t, 'wallpaper-styles', d.pixels ? 'Dots, Braille, Blocks or Quadrants' : 'Studio files keep their fixed characters', styles, { below: true }).h(28).flex_none().w_full())
      .child(div().h(20).flex_none().text_size(13).font_semibold().text_color(t.foreground).child("Preview wallpaper"))
      .child(div().h(20).flex_none().truncate().child(d.name))
      .child(h_flex().h(28).flex_none().p(2).gap(2).rounded(8).bg(t.raised).children([['cover', 'Fill'], ['contain', 'Fit']].map(([mode, text]) =>
        stop(this, t, `wallpaper-${mode}`, drawButton(t, `wallpaper-${mode}`, { text, size: "xs", surface: "card", on: p.mode === mode, disabled,
          label: `${mode === 'cover' ? 'Fill: crop to fill' : 'Fit: show the whole picture'}${p.mode === mode ? ', selected' : ''}`,
          act: cx => this.setPlacement(d, { mode }, cx) }).rounded(6).flex_1().min_w(0), radiusOf("compact")))))
      .child(h_flex().h(20).flex_none().justify_between().child("Zoom").child(div().w(52).text_right().child(`${p.zoom.toFixed(2)}×`)))
      .child(stop(this, t, "wallpaper-zoom", div().id("wallpaper-zoom").h(24).flex_none().w_full().opacity(disabled ? 0.64 : 1)
        .role("group").accessibility_label("Wallpaper zoom, 1 to 4 times")
        .on_key_down((e, cx) => {
          if (disabled || e.modifiers.control || e.modifiers.platform || e.modifiers.alt || !['left', 'right', 'up', 'down'].includes(e.key)) return;
          this.setPlacement(d, { zoom: d.placement.zoom + (['right', 'up'].includes(e.key) ? 0.1 : -0.1) }, cx);
          cx.stop_propagation();
        })
        .child(Slider.new(this.scale).disabled(disabled).w_full().child(SliderTrack.new(this.scale).disabled(disabled).h(24).w_full().flex().items_center()
          .child(SliderIndicator.new(this.scale).relative().w_full().h(4).rounded(4).bg(t.border).range_style(el => el.rounded(4).bg(t.foreground))
            .child(SliderThumb.new(this.scale).disabled(disabled).absolute().top(-6).size(16).rounded(8).bg(t.foreground).ml(-8))))), 6, { handle: this.zoomFocus }))
      .child(div().id("wallpaper-preview-status").h(60).flex_none().overflow_y_scrollbar().text_color(d.error || d.saveError ? t.ansi1 : t.dim)
        .child(d.error ?? d.saveError ?? (d.busy ? "Drawing preview…" : d.applying ? "Saving wallpaper…" : `${p.mode === 'cover' ? 'Fill crops to fill; Fit shows the whole picture.' : 'Fit shows the whole picture; zoom may crop.'} Drag or use arrow keys; Shift moves faster.`)))
      .child(h_flex().h(28).flex_none().gap(8)
        .child(this.action(t, "wallpaper-reset", "Reset", cx => this.setPlacement(d, { zoom: 1, x: 0.5, y: 0.5 }, cx), disabled || reset).flex_1().min_w(0))
        .child(this.action(t, "wallpaper-preview-cancel", "Cancel", cx => cx.spawn(cx => this.cancelPreview(cx)), d.applying).flex_1().min_w(0))
        .child(this.action(t, "wallpaper-preview-apply", d.applying ? "Applying…" : "Apply", cx => cx.spawn(cx => this.applyPreview(cx)), disabled, true).flex_1().min_w(0)));
  }

  guideCard(t) {
    const platform = window()?.platform;
    const choose = ans => cx => cx.spawn(cx => this.choose(cx, ans));
    return v_flex().id("wallpaper-guide").absolute().right(12).bottom(60).w(Math.min(300, Math.max(0, (this.width ?? 324) - 24))).p(16).gap(12)
      .rounded(8).bg(t.popover).border_1().border_color(t.border).shadow_lg().text_size(12).text_color(t.muted)
      .child(h_flex().h(20).flex_none().items_center().justify_between()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("Add a wallpaper"))
        .child(stop(this, t, "wallpaper-guide-close", drawButton(t, "wallpaper-guide-close", { icon: `mods/${MOD}/icons/x.svg`, label: "Close", size: "micro", surface: "card",
          hot: this.hot === "wallpaper-guide-close", act: (cx) => { this.guide = false; this.studioGuide = false; cx.notify(); } })
          .on_hover((on, cx) => { this.hot = on ? "wallpaper-guide-close" : this.hot === "wallpaper-guide-close" ? null : this.hot; cx.notify(); }), radiusOf("micro"))))
      .child(div().h(36).flex_none().overflow_y_scrollbar().child("Turn your image into character art, in your theme's colours."))
      .child(this.action(t, "wallpaper-choose", this.opening ? "Opening…" : "Choose image…", choose(false), this.opening || platform === "windows", true))
      .child(this.action(t, "wallpaper-import", "Import Studio file (.ans)…", choose(true), this.opening || platform === "windows"))
      .child(this.action(t, "wallpaper-studio-guide", this.studioGuide ? "Hide Studio guide" : "Create in asciicn Studio…", cx => { this.studioGuide = !this.studioGuide; cx.notify(); }))
      .child(v_flex().h(172).flex_none().gap(8)
        .child(div().h(36).flex_none().overflow_y_scrollbar().child(this.studioGuide ? "1. Open Studio, upload an image and adjust its look." : "Expand the Studio guide for instructions."))
        .child(this.action(t, "wallpaper-studio", "Open asciicn Studio ↗", () => exec(opener(), [STUDIO]), !this.studioGuide))
        .child(v_flex().h(92).flex_none().overflow_y_scrollbar().gap(8).when(this.studioGuide, el => el
          .child(div().child("2. Save with the .ans button under the picture."))
          .child(div().child("3. Return here and import that .ans file."))
          .child(div().text_color(t.dim).child("Colours adapt to your theme. Letter shapes become short bars; dots and blocks keep their shapes.")))))
      .child(div().h(1).bg(t.border))
      .child(div().h(36).flex_none().overflow_y_scrollbar().child(platform === "windows" ? "Copy .ans files into the wallpaper folder to import them." : "You can also copy .ans files into the wallpaper folder."))
      .child(this.action(t, "wallpaper-folder", "Open folder", () => exec(opener(), [this.dir])));
  }
}
