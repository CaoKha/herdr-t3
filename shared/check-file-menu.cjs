// The file menu's items, one list for both pages: what a row is decides what it offers.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = fs.readFileSync(path.join(__dirname, "file-menu.js"), "utf8")
  .replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ") + "\nglobalThis.menu = { fileMenuItems, mention, runCommon };";
const calls = [], notices = [], jobs = []; let clipboard = "original";
const context = vm.createContext({ run: (c, a) => calls.push([c, a]), notify: n => notices.push(n) });
vm.runInContext(src, context);
const ids = (o) => [...context.menu.fileMenuItems(o).map((it) => it.id)];
const agent = { terminal: "t1" };

assert.deepEqual(ids({ page: "files", platform: "macos", agent, editors: ["Zed"] }), ["open", "reveal", "open-with", "copy-path", "mention"]);
assert.deepEqual(ids({ page: "files", platform: "macos", dir: true }), ["open", "reveal", "copy-path", "mention"]);
assert.deepEqual(ids({ page: "files", platform: "macos", remote: true }), ["copy-path", "mention"]);
assert.deepEqual(ids({ page: "files", platform: "linux" }), ["copy-path", "mention"]);
assert.deepEqual(ids({ page: "review", platform: "macos" }), []);
assert.equal(context.menu.fileMenuItems({ page: "files" }).at(-1).disabled, true);
for (const page of ["files", "review"]) assert.ok(!ids({ page, platform: "macos" }).some(id => id === "open-review" || id === "open-files"), "neither page offers a cross-page action");

const cx = { read_from_clipboard: () => clipboard, write_to_clipboard: v => { clipboard = v; }, sleep: async () => {}, spawn: f => jobs.push(f) };
(async () => {
  context.menu.runCommon("copy-path", { abs: "/repo/a.js", rel: "a.js" }, cx); assert.equal(clipboard, "a.js");
  clipboard = "original"; context.menu.runCommon("mention", { rel: "a.js", agent }, cx); assert.equal(clipboard, " a.js");
  assert.deepEqual(calls.map(c => c[0]), ["pane.focus", "terminal.paste"]);
  assert.equal(calls[0][1].terminal, "t1");
  await jobs.shift()(cx); assert.equal(clipboard, "original", "paste restores the text it borrowed");
  context.menu.mention("b.js", "t1", cx); clipboard = "new user copy"; await jobs.shift()(cx);
  assert.equal(clipboard, "new user copy", "a later user copy wins");
  clipboard = undefined; const before = calls.length; context.menu.mention("c.js", "t1", cx);
  assert.equal(calls.length, before); assert.equal(clipboard, undefined); assert.equal(notices.length, 1);
  clipboard = "kept"; context.menu.mention("a\nwhoami", "t1", cx);
  assert.equal(calls.length, before); assert.equal(clipboard, "kept", "a newline filename cannot execute through an unbracketed paste");
  console.log("ok: Files menu boundaries, relative paths and clipboard-safe terminal insertion");
})().catch(e => { console.error(e); process.exitCode = 1; });

// The menu drawn in a fake kit: a row is lit only while the pointer's on it, whatever order Herdr reports the leave and the
// next enter in; a submenu's row stays lit while it's open, and submenus open beside submenus as deep as they go;
// a long list draws only what's in view and follows the keys.
function element() {
  const node = { items: [], handlers: {}, style: {} };
  const proxy = new Proxy(node, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => {
      if (key === "when") { if (args[0]) args[1](proxy); }
      else if (key === "children") node.items.push(...args[0]);
      else if (key === "child") node.items.push(args[0]);
      else if (key.startsWith("on_")) node.handlers[key] = node.handlers[key] ?? args[args.length - 1];
      else if (key === "id") node.key = args[0];
      else node.style[key] = args[0];
      return proxy;
    };
  } });
  return proxy;
}
const strip = f => fs.readFileSync(path.join(__dirname, f), "utf8").replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ");
const kit = vm.createContext({ div: element, h_flex: element, v_flex: element, svg: element, settings: () => ({ zoom: 1 }), Date, run() {}, notify() {}, exec: async () => ({ code: 0 }) });
vm.runInContext(strip("list.js") + strip("submenu.js") + strip("file-menu.js") + "\nglobalThis.view = fileMenuView;", kit);
const find = (n, key) => n?.key === key ? n : (n?.items ?? []).reduce((hit, c) => hit ?? find(c, key), null);
const t = { selected: "sel", dim: "dim", border: "b", popover: "p", foreground: "f" };
const kcx = { notify() {}, stop_propagation() {}, timer: { after: () => ({ cancel() {} }) } };
const list = ["a", "b", "c"].map(id => ({ id, label: id }));
let fv = { menu: { x: 10, y: 10 } };
const draw = (items = list, size = { width: 800, height: 600 }) => kit.view(fv, t, "mods/t3-files", items, {}, size);
const row = (root, d, id) => find(root, `file-menu-${d}-${id}`);
const lit = (root, d, id) => row(root, d, id)?.style.bg === "sel";
let root = draw();
row(root, 0, "a").handlers.on_hover(true, kcx); root = draw();
assert.ok(lit(root, 0, "a"));
// b entered before a's leave arrives: b stays lit.
row(root, 0, "b").handlers.on_hover(true, kcx); row(root, 0, "a").handlers.on_hover(false, kcx); root = draw();
assert.ok(lit(root, 0, "b") && !lit(root, 0, "a"), "a late leave doesn't unlight the next row");
row(root, 0, "b").handlers.on_hover(false, kcx); root = draw();
assert.ok(!["a", "b", "c"].some(id => lit(root, 0, id)), "off the rows, nothing is lit");

// Folders three deep, as a breadcrumb's menu: each opens beside the one before it, read as it opens.
const opened = [], picked = [];
const folder = (p, depth) => ({ id: p, label: p.split("/").at(-1), open: () => opened.push(p),
  get children() { return depth ? [folder(`${p}/sub`, depth - 1), { id: `${p}/f.md`, label: "f.md", run: () => picked.push(`${p}/f.md`) }] : [{ id: `${p}/leaf.md`, label: "leaf.md", run: () => picked.push(`${p}/leaf.md`) }]; } });
const tree = [folder("docs", 2), { id: "README.md", label: "README.md", run: () => picked.push("README.md") }];
fv = { menu: { x: 10, y: 10 } };
const key = (k, r = root) => r.handlers.on_key_down({ key: k }, kcx);
root = draw(tree);
key("down"); root = draw(tree);
assert.ok(lit(root, 0, "docs"));
key("right"); root = draw(tree);
assert.deepEqual(opened, ["docs"]);
assert.ok(lit(root, 0, "docs") && lit(root, 1, "docs/sub"), "→ opens the folder beside it with its first row lit");
row(root, 1, "docs/sub").handlers.on_click({}, kcx); root = draw(tree);
assert.ok(row(root, 2, "docs/sub/sub"), "a click on a folder opens a third level");
assert.notEqual(find(root, "file-menu-panel-2").style.left, find(root, "file-menu-panel-1").style.left, "each level sits beside the last");
key("left"); root = draw(tree);
assert.ok(!row(root, 2, "docs/sub/sub") && lit(root, 1, "docs/sub"), "← closes only the deepest level, its row lit again");
key("enter"); root = draw(tree); key("down"); root = draw(tree);
assert.ok(lit(root, 2, "docs/sub/f.md"));
key("enter");
assert.deepEqual(picked, ["docs/sub/f.md"]);
assert.equal(fv.menu, null, "a file picks and closes every level");
fv = { menu: { x: 10, y: 10 } }; root = draw(tree);
key("down"); root = draw(tree); key("right"); root = draw(tree); key("escape"); root = draw(tree);
assert.ok(!find(root, "file-menu-panel-1") && fv.menu, "Escape in a submenu closes only it");
key("escape");
assert.equal(fv.menu, null);

// A page with room for two levels side by side: the third goes left, over the first, never over the menu it hangs off.
fv = { menu: { x: 128, y: 10, lv: [{ at: -1, open: "docs", intent: {} }, { at: -1, open: "docs/sub", intent: {} }, { at: -1, open: null, intent: {} }] } };
root = draw(tree, { width: 626, height: 600 });
const lefts = [0, 1, 2].map(d => find(root, `file-menu-panel-${d}`).style.left);
assert.deepEqual(lefts, [128, 348, 128], `levels at ${lefts}`);
// Near the right edge, a submenu with no room on the right opens on the left.
fv = { menu: { x: 402, y: 10, lv: [{ at: -1, open: "docs", intent: {} }, { at: -1, open: null, intent: {} }] } };
root = draw(tree, { width: 626, height: 600 });
assert.equal(find(root, "file-menu-panel-1").style.left, 182);

const many = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, label: `r${i}` })), small = { width: 800, height: 300 };
fv = { menu: { x: 10, y: 10 } };
root = draw(many, small);
assert.ok(row(root, 0, "r0") && !row(root, 0, "r50"), "a long list draws only the rows in view");
fv.menu.lv[0].at = 50; root = draw(many, small);
assert.ok(lit(root, 0, "r50"), "the keys' row is drawn, scrolled into view");
console.log("ok: Files menu highlight follows the pointer and the keys; submenus open beside submenus");
