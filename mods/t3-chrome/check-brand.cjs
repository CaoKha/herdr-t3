// brand.js: Herdr's tile and name in the brand bar (docs/internals/specs/sidebar.md), as T3's SidebarBrand: one look always,
// the name given way whole, its label and the one action it runs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const kit = require("./check-kit.js");
const element = kit.elements(), { find, walk, strings } = kit;
const ran = [];
const scope = vm.createContext({
  div: element, h_flex: element, svg: (src) => element("svg", src), image: (src) => element("image", src),
  run: (...a) => ran.push(a),
  stop: (_v, _t, _id, el) => el, glow: () => () => {},
});
vm.runInContext(kit.strip(fs.readFileSync(path.join(__dirname, "brand.js"), "utf8")) + "\nglobalThis.b = { brand };", scope);
const { brand } = scope.b;

const t = { foreground: "#ffffff", muted: "#777777" };
const cx = { notify() {}, stop_propagation() {} };
const view = {};
const mark = (el) => walk(el).find((n) => n.kind === "image");

// As T3's SidebarBrandMark, but the mark is an icon as big as the 16px icons beside it: its PNG is 80% tile; centred.
let el = brand(view, t, { named: true, zoom: 1 });
assert.equal(el.key, "home");
assert.deepEqual([el.style.h, el.style.px, el.style.gap, el.style.text_size], [28, undefined, 4, 14]);
assert.equal(mark(el).source, "frame/welcome/herdr.png", "Herdr's own tile, its colours");
assert.deepEqual([mark(el).style.size, mark(el).style.rounded], [16, 4]);
assert.equal(mark(el).style.top, undefined, "centred, not nudged");
assert.equal(walk(el).find((n) => n.kind === "svg"), undefined, "no one-colour mark");

// One look, as T3's: the tile in its own colours, the name muted; no fill, no hover, nothing lit.
assert.equal(el.style.text_color, t.muted);
assert.equal(el.style.bg, undefined, "no fill");
assert.equal(mark(el).style.opacity, undefined, "never dimmed");
assert.equal(el.handlers.on_hover, undefined, "no hover look");

// The name whole, or not at all: never cut to "Her…".
assert.deepEqual(strings(brand(view, t, { named: true, zoom: 1 })), ["Herdr"]);
el = brand(view, t, { named: false, zoom: 1 });
assert.deepEqual(strings(el), [], "short of room, no name");
assert.equal(find(el, "home-name"), null);
assert.ok(mark(el), "the mark stays");

// The name's width, unzoomed, kept on the view for the next frame's room.
el = brand(view, t, { named: true, zoom: 2 });
find(el, "home-name").handlers.on_size_change({ width: 84 }, cx);
assert.equal(view.brandNameW, 42);

// Its name is Home, and a click goes there; a press doesn't start a window drag.
assert.equal(el.style.accessibility_label, "Home");
assert.equal(el.style.role, "button");
let stopped = false;
el.handlers["on_mouse_down:left"]({}, { stop_propagation() { stopped = true; } });
assert.ok(stopped, "a press stays off the window's drag");
el.handlers.on_click({}, cx);
assert.deepEqual(JSON.parse(JSON.stringify(ran)), [["t3-tabs.home"]]);

console.log("ok: brand: Herdr's tile as big as the icons beside it, and name, one look, the name whole or gone, Home's label and action.");
