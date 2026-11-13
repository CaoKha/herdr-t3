// The import lifecycle on an inert Home: drafts never become saved wallpapers until Apply; deletion needs confirmation.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function element() {
  const n = { items: [], handlers: {}, props: {} };
  const p = new Proxy(n, { get: (o, k) => k in o ? o[k] : (...a) => {
    if (k === "child") n.items.push(a[0]);
    else if (k === "children") n.items.push(...a[0]);
    else if (k === "when") { if (a[0]) a[1](p); }
    else if (k === "id") n.key = a[0];
    else if (k.startsWith("on_")) n.handlers[k] = a.at(-1);
    else n.props[k] = a[0];
    return p;
  } });
  return p;
}
const find = (n, id) => !n || typeof n !== "object" ? null : n.key === id ? n : n.items.map(x => find(x, id)).find(Boolean);
// The real button.js (sync.sh's copy), as main.js imports it.
const source = fs.readFileSync(path.join(__dirname, "button.js"), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")
  + "\nconst drawButton = button;\n" + fs.readFileSync(path.join(__dirname, "main.js"), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export default class", "globalThis.Mod = class");
const files = new Map(), calls = [], overlays = [], messages = [], state = {};
let pick = "/photos/Coast.png", failDelete = false, holdWrite = null;
let beforePublish = null, afterPublish = null, failPart = false;
const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
const env = {
  View: class {}, div: element, svg: element, image: p => { const e = element(); e.imagePath = p; return e; }, h_flex: element, v_flex: element,
  SliderState: { new: () => ({ current: 1, handlers: {}, value() { return this.current; }, on(k, f) { this.handlers[k] = f; }, set_value(n) { this.current = n; }, release() {} }) },
  Slider: { new: element }, SliderTrack: { new: element }, SliderIndicator: { new: element }, SliderThumb: { new: element },
  SCENES: [{ id: "lighthouse", name: "Lighthouse", width: 2, height: 1, focus: 0.5, tiles: [] }],
  VERSION: 1, appHome: () => "/app", settings: () => ({}), theme: () => ({}), window: () => ({ platform: "macos" }),
  stopsInit: view => { view.fs = {}; }, stopsEnd() {}, enter() {}, focusRoot: (_view, el) => el, stop: (_view, _t, _id, el) => el,
  shared: k => state[k], setShared: (k, v) => { state[k] = v; }, notify: p => messages.push(p),
  openOverlay: spec => overlays.push(spec), nextCommand: () => new Promise(() => {}),
  watchFolder: () => new Promise(() => {}),
  readTextFile: async f => files.get(f) ?? null,
  writeTextFile: async (f, body, expected) => {
    if (Buffer.byteLength(body) > 1024 * 1024) throw new Error("Text file exceeds 1 MiB");
    if (failPart && f.endsWith(".part")) throw new Error("disk full");
    if (holdWrite && f.endsWith(".svg")) { const wait = holdWrite; holdWrite = null; await wait; }
    assert.equal(files.get(f) ?? null, expected, `atomic write: ${f}`);
    files.set(f, body);
  },
  exec: async (cmd, args = []) => {
    calls.push([cmd, args]);
    if (cmd === "osascript" || cmd === "zenity") return pick ? ok(pick) : { code: 1, stdout: "", stderr: "cancelled" };
    if (cmd === "sips") return args[0] === "-g" ? ok("pixelWidth: 4\npixelHeight: 4") : ok();
    if (cmd === "cat") return ok(files.get(args[0]) ?? "●\n");
    if (cmd === "link") {
      beforePublish?.(args[1]);
      if (files.has(args[1])) return { code: 1, stdout: "", stderr: "File exists" };
      assert.ok(files.has(args[0]), "publish only a completed staged file");
      files.set(args[1], files.get(args[0]));
      await afterPublish?.(args[1]);
      return ok();
    }
    if (cmd === "rm") { for (const f of files.keys()) if (args.slice(1).some(d => f === d || f.startsWith(`${d}/`))) files.delete(f); return ok(); }
    if (cmd === "sh") {
      const s = args[1];
      if (s.startsWith("cat ")) {
        const paths = [...s.matchAll(/'([^']*)'/g)].map(m => m[1]), out = paths.pop();
        assert.ok(paths.every(p => files.has(p)), "all chunks exist before concatenating");
        files.set(out, paths.map(p => files.get(p)).join(""));
        return ok();
      }
      if (s.startsWith("for f")) return ok([...files.keys()].filter(f => /^\/app\/asciicn-wallpaper\/[^/]+\.ans$/.test(f)).map(f => `1 2\0${f.split("/").at(-1).slice(0, -4)}\0`).join(""));
      if (s.startsWith("cksum <")) return ok("1 2\n");
      if (s.startsWith("rm ")) {
        for (const op of s.split(" && ")) {
          if (op.includes("'./.tiles/Coast'")) for (const f of files.keys()) if (f.includes("/.tiles/Coast/")) files.delete(f);
          if (op.includes("'./Coast.ans'")) {
            if (failDelete) return { code: 1, stdout: "", stderr: "permission denied" };
            files.delete("/app/asciicn-wallpaper/Coast.ans");
          }
        }
      }
      return ok("bmp");
    }
    return ok();
  },
  imageGrid: () => ({ width: 4, height: 4 }),
  decodeBmp: function* () { return { width: 4, height: 4, rgba: [] }; },
  imageAns: function* (_pixels, style) { yield null; return ({ braille: "⡇", blocks: "▌", dots: "●" })[style] + "\n"; },
  convert: function* (text) {
    if (!text.trim()) return { width: 2, height: 1 };
    yield { file: "tile.svg", svg: text.slice(0, 100), tint: "foreground", opacity: 1, x0: 0, x1: 2, y0: 0, y1: 1 };
    return { width: 2, height: 1 };
  },
};
const cx = { notify() {}, focus_handle: () => ({ focus() {}, is_focused: () => false }), stop_propagation() {}, spawn: fn => fn(cx), timer: { after: (_ms, fn) => fn(cx) } };
const context = vm.createContext(env);
vm.runInContext(source, context);
const mod = new context.Mod();
mod.init({}, { ...cx, spawn() {} });
mod.height = 800; mod.width = 1000;
const saved = () => [...files.keys()].filter(f => f.endsWith(".ans"));

(async () => {
  await mod.choose(cx);
  assert.ok(mod.draft?.scene, "choosing a photo previews it before saving");
  assert.equal(mod.draft.text, "●\n", "new pictures always preview as Dots, not a selectable image style");
  assert.deepEqual(saved(), []);
  assert.equal(state["asciicn-wallpaper.scene"], undefined, "preview does not change the shared choice");
  assert.ok(find(mod.render(cx), "wallpaper-preview"));
  const previewImage = find(mod.render(cx), "wallpaper-preview-image");
  assert.ok(previewImage?.imagePath, "framing uses one native cached image, not size-keyed SVG masks");
  assert.equal(mod.fs.modal, true, "pointer imports make the canvas and all editor controls focusable");
  assert.equal(find(mod.render(cx), "wallpaper-style-braille"), undefined);
  const zoom = find(mod.render(cx), "wallpaper-zoom");
  zoom.handlers.on_key_down({ key: "right", modifiers: {} }, cx);
  zoom.handlers.on_key_down({ key: "right", modifiers: {} }, cx);
  assert.ok(Math.abs(mod.draft.placement.zoom - 1.2) < 1e-8, "queued zoom keys accumulate before the next render");
  find(mod.render(cx), "wallpaper-reset").handlers.on_click({}, cx);
  find(mod.render(cx), "wallpaper-contain").handlers.on_click({}, cx);
  let picture = find(mod.render(cx), `wallpaper-${mod.draft.scene.id}`);
  assert.equal(picture.props.w, 1000, "Fit preserves a 2:1 scene in a 1000x800 pane");
  assert.equal(picture.props.h, 500);
  assert.equal(picture.props.bottom, 150);
  mod.scale.handlers.change(2, cx);
  find(mod.render(cx), "wallpaper-reset").handlers.on_click({}, cx);
  assert.equal(mod.draft.placement.mode, "contain", "Reset must not change the fit mode");
  assert.equal(mod.draft.placement.zoom, 1);
  const canvas = find(mod.render(cx), "wallpaper-compose");
  const beforeMove = calls.length;
  const filesBeforeMove = [...files.entries()];
  canvas.handlers.on_mouse_down({ position: { x: 300, y: 300 } }, cx);
  canvas.handlers.on_mouse_move({ position: { x: 300, y: 450 } }, cx);
  assert.equal(mod.draft.placement.y, 1, "drag to the lower edge of the available blank space");
  canvas.handlers.on_mouse_up({}, cx);
  canvas.handlers.on_key_down({ key: "up", modifiers: {} }, cx);
  assert.ok(mod.draft.placement.y < 1);
  assert.equal(mod.fs.keyboard, true, "arrow movement reveals the canvas focus ring");
  assert.equal(calls.length, beforeMove, "framing never reconverts or writes files");
  assert.deepEqual([...files.entries()], filesBeforeMove, "moving reuses the prepared preview without file I/O");
  mod.scale.handlers.change(99, cx);
  assert.equal(mod.draft.placement.zoom, 4, "zoom cannot exceed 4x");
  mod.setPlacement(mod.draft, { x: -4, y: 42 }, cx);
  assert.equal(mod.draft.placement.x, 0);
  assert.equal(mod.draft.placement.y, 1);
  await mod.cancelPreview(cx);
  assert.equal(mod.draft, null);
  assert.equal(mod.fs.modal, false);
  assert.deepEqual([...files.keys()], [], "cancel removes preview tiles");

  await mod.choose(cx);
  await mod.applyPreview(cx);
  assert.equal(mod.draft, null);
  assert.deepEqual(saved(), ["/app/asciicn-wallpaper/Coast.ans"]);
  assert.equal(files.get(saved()[0]), "●\n");
  assert.equal(state["asciicn-wallpaper.scene"], "file:Coast");
  assert.equal(state["asciicn-wallpaper.placements"]["file:Coast"].zoom, 1);
  assert.equal(find(mod.render(cx), "wallpaper-compose"), undefined, "saved pictures are not editable");
  const kept = state["asciicn-wallpaper.placements"]["file:Coast"];
  state["asciicn-wallpaper.placements"]["file:Coast"] = { mode: "contain", zoom: 1, x: .2, y: .8 };
  mod.width = 600;
  picture = find(mod.render(cx), "wallpaper-file:Coast");
  assert.equal(picture.props.w, 600);
  assert.equal(picture.props.h, 300, "saved Fit recomputes proportional geometry at a new width");
  assert.ok(Math.abs(picture.props.bottom - 100) < 1e-8);
  mod.width = 1000;
  state["asciicn-wallpaper.placements"]["file:Coast"] = { mode: "invalid", zoom: Infinity, x: -2, y: 3 };
  picture = find(mod.render(cx), "wallpaper-file:Coast");
  assert.equal(picture.props.w, 1600, "invalid persistent parameters use bounded safe defaults");
  assert.equal(picture.props.left, "0%");
  assert.equal(picture.props.bottom, 0);
  state["asciicn-wallpaper.placements"]["file:Coast"] = kept;
  assert.equal([...files.keys()].some(f => f.includes("/.preview/")), false);

  pick = null;
  await mod.choose(cx);
  assert.equal(mod.draft, null, "file dialog cancel stays silent");
  assert.equal(messages.length, 0);
  pick = "/photos/Studio.ans";
  await mod.choose(cx, true);
  assert.ok(mod.draft, ".ans imports frame their existing drawing before Apply");
  await mod.applyPreview(cx);
  assert.equal(saved().length, 2);

  // A detailed Dots image exceeds the host's per-write limit even at the usual image grid.
  pick = "/photos/Detailed.png";
  await mod.choose(cx);
  const large = "\x1b[38;2;123;234;210m⦁🌅\n".repeat(70000);
  assert.ok(Buffer.byteLength(large) > 1024 * 1024);
  mod.draft.text = large;
  await mod.applyPreview(cx);
  assert.ok(!mod.draft, "Apply saves a detailed image larger than the native per-write limit");
  assert.ok(files.get("/app/asciicn-wallpaper/Detailed.ans") === large, "large UTF-8 drawing is preserved byte for byte");
  assert.equal(state["asciicn-wallpaper.scene"], "file:Detailed");
  assert.equal([...files.keys()].some(f => f.includes("/.preview/")), false);
  files.set("/photos/Studio detailed.ans", large);
  pick = "/photos/Studio detailed.ans";
  await mod.choose(cx, true);
  await mod.applyPreview(cx);
  assert.ok(files.get("/app/asciicn-wallpaper/Studio detailed.ans") === large, "Studio imports share the large-file save path");
  assert.equal(state["asciicn-wallpaper.scene"], "file:Studio detailed");
  files.delete("/photos/Studio detailed.ans");

  pick = "/photos/Unwritten.png";
  await mod.choose(cx);
  failPart = true;
  await mod.applyPreview(cx);
  failPart = false;
  assert.ok(mod.draft, "a chunk write failure retains the preview to retry");
  assert.equal(files.has("/app/asciicn-wallpaper/Unwritten.ans"), false);
  assert.equal([...files.keys()].some(f => f.includes("/.preview/save-")), false, "failed save removes its own staging files");
  assert.equal(state["asciicn-wallpaper.scene"], "file:Studio detailed");
  await mod.cancelPreview(cx);

  // Another Home may receive the .ans event before the applying copy does.
  const other = new context.Mod();
  other.init({}, { ...cx, spawn() {} });
  pick = "/photos/Shared.png";
  await mod.choose(cx);
  let finishOther, otherJob;
  holdWrite = new Promise(r => { finishOther = r; });
  afterPublish = async destination => {
    if (destination.endsWith("/Shared.ans")) {
      otherJob = other.refresh(cx);
      for (let n = 0; n < 20; n++) await Promise.resolve();
    }
  };
  const applying = mod.applyPreview(cx);
  for (let n = 0; n < 80; n++) await Promise.resolve();
  try { assert.ok(mod.draft, "Apply keeps the preview until another Home finishes the drawing"); }
  finally { finishOther(); }
  await applying; await otherJob;
  afterPublish = null;
  assert.equal(state["asciicn-wallpaper.scene"], "file:Shared");
  assert.ok(mod.imported.some(s => s.id === "file:Shared"), "the applying Home loads the other copy's cache");

  pick = "/photos/Coast.png";
  await mod.choose(cx);
  let collision;
  beforePublish = destination => { collision = destination; files.set(collision, "another Home's picture"); };
  await mod.applyPreview(cx);
  beforePublish = null;
  assert.ok(mod.draft, "an atomic save conflict keeps the preview available to retry");
  assert.equal(files.get(collision), "another Home's picture", "a concurrent save is never overwritten");
  assert.match(mod.draft.saveError, /File exists/, "an Apply error stays inline without disabling retry");
  assert.equal(state["asciicn-wallpaper.scene"], "file:Shared");
  await mod.cancelPreview(cx);
  files.delete(collision);

  let finishRead;
  holdWrite = new Promise(r => { finishRead = r; });
  const oldRead = mod.startPreview("/photos/Old.png", "Old", cx);
  for (let n = 0; n < 20; n++) await Promise.resolve();
  await mod.startPreview("/photos/New.png", "New", cx);
  finishRead(); await oldRead;
  assert.equal(mod.draft.name, "New", "a slow old image cannot overwrite the latest selection");
  assert.equal(mod.draft.busy, false);
  await mod.cancelPreview(cx);

  pick = "/photos/Coast.png";
  let release;
  holdWrite = new Promise(r => { release = r; });
  const stale = mod.startPreview(pick, "Cancelled", cx);
  for (let n = 0; n < 20; n++) await Promise.resolve();
  await mod.cancelPreview(cx);
  release(); await stale;
  assert.equal(mod.draft, null, "late drawing cannot reopen a cancelled preview");
  assert.equal([...files.keys()].some(f => f.includes("/.preview/")), false, "late drawing leaves no draft files");

  let finishReady;
  mod.ready = new Promise(r => { finishReady = r; });
  const first = mod.startPreview(pick, "First", cx), latest = mod.startPreview(pick, "Latest", cx);
  finishReady(); await Promise.all([first, latest]);
  assert.equal(mod.draft.name, "Latest", "request identity also protects the setup-before-draft window");
  await mod.cancelPreview(cx);

  state["asciicn-wallpaper.scene"] = "file:Coast";
  const scene = mod.imported.find(s => s.id === "file:Coast");
  const before = calls.length;
  find(mod.render(cx), "wallpaper-remove").handlers.on_click({}, cx);
  assert.equal(calls.length, before, "delete click does no filesystem work");
  assert.equal(overlays.at(-1).props.yes, "Delete");
  assert.match(overlays.at(-1).props.title, /Coast/);
  assert.ok(files.has("/app/asciicn-wallpaper/Coast.ans"), "dismissing the dialog leaves the file");
  failDelete = true;
  const cached = files.get("/app/asciicn-wallpaper/.tiles/Coast/tile.svg");
  await mod.remove(scene, cx);
  assert.equal(state["asciicn-wallpaper.scene"], "file:Coast", "failed deletion retains selection");
  assert.ok(mod.imported.includes(scene));
  assert.equal(files.get("/app/asciicn-wallpaper/.tiles/Coast/tile.svg"), cached, "source deletion failure leaves its drawing intact");
  failDelete = false;
  await mod.remove(scene, cx);
  assert.equal(files.has("/app/asciicn-wallpaper/Coast.ans"), false);
  assert.notEqual(state["asciicn-wallpaper.scene"], "file:Coast");
  console.log("ok: wallpaper preview, apply, cancel, stale jobs, .ans import and confirmed deletion.");
})().catch(e => { console.error(e); process.exitCode = 1; });
