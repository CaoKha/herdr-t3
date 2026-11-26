// A menu drawn in the page under its trigger (inline-menu.js): the trigger opens and closes it, a pick or Escape closes it, the
// keys move past greyed rows, and a press inside it isn't a press elsewhere in the page.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const kit = require("./check-kit.js");
const { find } = kit;

const element = kit.elements({ args: "all" });
const shared = {};
const ctx = vm.createContext({ div: element, svg: element, h_flex: element, v_flex: element, Popup: { new: (id, trigger) => element().id(id).child(trigger) },
  shared: (k) => shared[k], setShared: (k, v) => { shared[k] = v; }, settings: () => ({ zoom: 1 }), props: () => null, closeOverlay() {}, keys: () => [], window: () => ({}),
  Date, Math, Object, Array, String, Number, Boolean, JSON, Map, Set });
const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
vm.runInContext(kit.bundle(read, "inline-menu.js", (file, src, needs) => file === "inline-menu.js" ? `${needs()}\n${kit.strip(src)}\nglobalThis.menu = { inlineMenu, closeInlineMenu, inlineMenuKey };` : null), ctx);
const { inlineMenu, closeInlineMenu, inlineMenuKey } = ctx.menu;

const t = { foreground: "#ffffff", dim: "#888888", muted: "#aaaaaa", popover: "#111111", border: "#333333", selected: "#222222", accent: "#0000ff" };
const picked = [];
const cx = { notify() {}, stop_propagation() { cx.stopped = true; } };
const view = { menu: null, hot: null, fs: null };
const items = [{ label: "One", pick: () => picked.push("one") }, { label: "Two", disabled: true, hint: "Not here", pick: () => picked.push("two") }, { label: "Three", pick: () => picked.push("three") }];
const draw = () => inlineMenu(view, t, "m", { label: "More", icon: "x.svg", items });
const press = (root, bounds) => { const n = find(root, "m"); n.handlers["on_mouse_down:left"]({ bounds }, cx); n.handlers.on_click({}, cx); };

let root = draw();
assert.equal(find(root, "m-menu"), null, "shut: only the trigger");
press(root, { x: 0, y: 0, width: 24, height: 24 });
assert.equal(view.menu.id, "m");
assert.equal(view.menu.at, -1, "opened by the pointer, nothing lit");
root = draw();
assert.ok(find(root, "m-menu") && find(root, "m-item-2"));
cx.stopped = false;
find(root, "m-menu").handlers["on_mouse_down:left"]({}, cx);
assert.ok(cx.stopped, "a press in the menu isn't a press elsewhere in the page");
press(root);
assert.equal(view.menu, null, "the trigger again closes it");

root = draw();
press(root, null);
assert.equal(view.menu.at, 0, "opened by keys, its first row lit");
root = draw();
inlineMenuKey(view, { key: "down" }, cx);
assert.equal(view.menu.at, 2, "down past the greyed row");
inlineMenuKey(view, { key: "down" }, cx);
assert.equal(view.menu.at, 0, "and round");
inlineMenuKey(view, { key: "enter" }, cx);
assert.deepEqual([view.menu, picked], [null, ["one"]], "Enter picks and closes");
inlineMenuKey(view, { key: "down" }, cx);
assert.equal(view.menu, null, "shut, it takes no keys");

root = draw();
press(root, null);
root = draw();
assert.equal(find(root, "m-item-1").handlers.on_click, undefined, "a greyed row can't be picked");
find(root, "m-item-2").handlers.on_click({}, cx);
assert.deepEqual([view.menu, picked], [null, ["one", "three"]], "a click picks and closes");
root = draw();
press(root, null);
inlineMenuKey(view, { key: "escape" }, cx);
assert.equal(view.menu, null, "Escape closes");
press(draw(), null);
assert.equal(closeInlineMenu(view), true);
assert.equal(closeInlineMenu(view), false, "a press elsewhere closes it, once");
console.log("ok: inline-menu: opened and closed by its trigger, keys, picks, Escape and a press elsewhere");
