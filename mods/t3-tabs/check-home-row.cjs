// The Home row (t3-tabs part "home", `home-row` in the layout's `work-home` branch, docs/adr/0021): Home's `background`, and
// when Home is the wallpaper, the part of its shown picture over the row, so Home reads as one picture up to the window's top.
// With the sidebar hidden: its toggle alone, and an Undo notice on a `chrome` pill; window buttons of the layout's own.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const kit = require("./check-kit.js");
const element = kit.elements(), { find, strip, walk } = kit;
const t = { chrome: "#111111", background: "#222222", dim: "#555555", muted: "#777777", foreground: "#ffffff", hover: "#333333", selected: "#444444", raised: "#333333" };
const home = { id: "h", active: true, tabs: [{ id: "hc", active: true }] };
let hidden = false, buttons = false, homeMod = "asciicn-wallpaper", split = false, panelOpen = false;
const state = {};
const shown = { path: "/cache/pic.png", w: 1600, h: 900, right: -20, top: -60, opacity: 1, home: "h" };
const env = {
  ui: (n) => n,
  View: class {}, div: element, svg: src => Object.assign(element(), { src }), image: src => Object.assign(element(), { kind: "image", src }), h_flex: element,
  Popup: { new: (_id, trigger) => element().child(trigger) },
  theme: () => t, props: () => ({ part: "home" }), settings: () => ({ zoom: 1 }), window: () => ({ platform: "linux", buttons, maximized: false }),
  spaces: () => [home], terminals: () => [], layout: () => ({}), agents: () => [], projectMark: () => element(),
  panes: () => [{ pane: "hp", tab: "hc", mod: homeMod }, ...(split ? [{ pane: "hq", tab: "hc", terminal: "t9" }] : [])],
  shared: k => state[k] ?? null,
  sidebarParts: () => ({ rail: { hidden }, stack: { active: "lists" } }), toggleLeft: () => 8, panelState: () => ({ pages: [], tabs: [], open: panelOpen }),
  tip: (_view, _t, _id, _label, el) => el, stop: (_view, _t, _id, el) => el, focusRoot: (_view, el) => el,
  glow: (view, id) => on => { view.hot = on ? id : null; }, within: () => false, keptHover: () => ({ hover() {}, move() {} }),
  tipCard: (_t, id) => element().id(id), FADE: {},
  run() {}, focusAgent() {}, focusPane() {},
  navigation: () => ({ atHome: true, frame: () => ({ tabs: [], context: null }) }),
  subAgents: () => () => [], namer: () => x => x.title, programIcon: () => null, programOf: x => x.program ?? null,
  ownStatus: s => s, treeStatus: s => s, notNews: () => false, stillSettled: () => false, modStatus: () => "done",
  POINTER_WATCH: 100, pointerAt: () => null, pointerGone: () => false, pointerMoved() {}, pressed() {}, justClosed: () => false,
  openMenu() {}, openOverlay() {}, undoLabel: () => "Undo",
};
function load(dir) {
  const scope = vm.createContext({ ...env });
  const read = f => strip(fs.readFileSync(path.join(__dirname, "../../shared", f), "utf8"));
  for (const f of ["color.js", "measured-text.js", "details.js", "scroll-strip.js", "status-mark.js", "store.js", "notice.js", "list.js"]) vm.runInContext(read(f), scope);
  vm.runInContext("globalThis.namedLabel = named;", scope);
  vm.runInContext("(() => {\n" + strip(["color.js", "button.js", "trigger.js", "tab.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n"))
    + "\nglobalThis.tab = tab; globalThis.drawButton = button; globalThis.radiusOf = radiusOf; globalThis.ghostTint = tint; globalThis.GROUP_GAP = GROUP_GAP; globalThis.opener = opener; globalThis.popupOpen = popupOpen; globalThis.hang = hang; globalThis.keepPress = keepPress;\n})()", scope);
  vm.runInContext(fs.readFileSync(path.join(dir, "main.js"), "utf8").replace(/^import .*;\r?\n/gm, "").replace("export default class", "globalThis.Mod = class"), scope);
  return { row: Object.assign(new scope.Mod(), { nameW: {}, tabStrip: {}, pressed: null, over: null }), KEY: vm.runInContext("KEY", scope) };
}
const { row, KEY } = load(__dirname);
assert.equal(KEY.homeShown, "t3.homeShown", "the wallpaper's shown picture, under a layout key");
state[KEY.home] = "h";
const picture = (root) => find(root, "home-picture");

// Home's colour, whatever is or isn't over it: the row and Home are one surface.
let root = row.render();
assert.equal(root.key, "home-row");
assert.equal(root.style.bg, t.background, "Home's background, not the tab bar's chrome");
assert.equal(picture(root), null, "nothing shown yet, no picture");

// The wallpaper's picture, as Home has it: the same right, its top 40 lower as the row sits 40 above Home; cut to the row.
state[KEY.homeShown] = shown;
root = row.render();
const pic = picture(root);
assert.ok(pic, "Home is the wallpaper and says what it shows: the row shows its part of it");
assert.deepEqual(["absolute" in pic.style, pic.style.right, pic.style.top, pic.style.w, pic.style.h, pic.style.opacity], [true, -20, -20, 1600, 900, 1]);
assert.equal(walk(pic).find(n => n.kind === "image")?.src, "/cache/pic.png");
assert.ok("overflow_hidden" in root.style, "cut to the row");
assert.ok("relative" in root.style, "placed against the row");
state[KEY.homeShown] = { ...shown, opacity: 0.7 };
assert.equal(picture(row.render()).style.opacity, 0.7, "dimmed with Home's while a mode draws");

// Never a picture that isn't Home's now: another Home's, or once Home is another mod or split.
state[KEY.homeShown] = { ...shown, home: "old" };
assert.equal(picture(row.render()), null, "another Home's picture");
state[KEY.homeShown] = shown;
homeMod = "t3-home";
assert.equal(picture(row.render()), null, "Home is t3-home: no wallpaper's picture");
homeMod = "asciicn-wallpaper"; split = true;
assert.equal(picture(row.render()), null, "Home split: not the wallpaper alone");
split = false;

// Sidebar shown: nothing of its own over the picture (the brand bar has the toggle and the brand, and the Undo notice).
state[KEY.notice] = { at: Date.now(), gen: 1, action: "Settled", count: 1, live: true, shown: true };
root = row.render();
for (const id of ["sidebar-toggle", "home", "home-notice"]) assert.equal(find(root, id), null, `sidebar shown: no ${id}`);

// Sidebar hidden: the toggle, then the Undo notice on a chrome pill, as a toast has a ground; no brand, as the tab row's.
hidden = true;
root = row.render();
const items = root.items.filter(Boolean).map(n => n.key).filter(k => typeof k === "string" && k !== "home-picture");
assert.deepEqual(items.slice(0, 2), ["sidebar-toggle", "home-notice"]);
assert.equal(find(root, "home"), null, "no brand");
assert.equal(find(root, "sidebar-toggle").style.bg, undefined, "the toggle floats on the picture");
const pill = find(root, "home-notice");
assert.deepEqual([pill.style.bg, pill.style.rounded], [t.chrome, 8], "the notice on a chrome pill");
assert.ok(find(pill, "undo-notice-1"), "the Undo notice in it");
delete state[KEY.notice];
assert.equal(find(row.render(), "home-notice"), null, "no notice, no pill");
assert.equal(picture(row.render()) !== null, true, "the picture still under them");

// Window buttons of the layout's own (Windows, Linux) at the row's end; none on a Mac's own.
assert.equal(find(row.render(), "close-window"), null);
buttons = true;
assert.ok(find(row.render(), "minimize") && find(row.render(), "maximize") && find(row.render(), "close-window"), "the window's buttons");
// The space panel open at Home: its head has them, at the window's corner, as away (`window-end`): drawn once, not twice.
panelOpen = true;
assert.equal(find(row.render(), "close-window"), null, "panel open: the panel head's window buttons, not the row's");
panelOpen = false;

console.log("ok: home row: Home's background and its picture's part, only Home's own; the toggle alone and the Undo pill hidden; window buttons unless the panel head has them.");
