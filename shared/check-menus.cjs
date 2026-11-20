// Files and Review's menu offers what a path can do; Insert preserves the clipboard (menus.js).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = ["store.js", "menus.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n")
  .replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ") + "\nglobalThis.menu = { rowItems, mention, initMenu, closeMenu, choose };";
const calls = [], notices = [], jobs = []; let clipboard = "original";
const watches = [], closed = [];
let menuProps = { files: "row", overlay: "o1", source: { space: "s1", tab: "b1", root: "/r1" } };
let shown = [{ id: "s1", active: true, tabs: [{ id: "b1", active: true }] }];
const context = vm.createContext({ checking: () => false, run: (c, a) => calls.push([c, a]), notify: n => notices.push(n), MENU_ROW: 28,
  props: () => menuProps, spaces: () => shown, closeOverlay: id => closed.push(id), closeChain: () => closed.push("chain"),
  theme: () => ({ dim: "#888", foreground: "#fff" }), window: () => ({ platform: "macos" }), join: (a, b) => a ? `${a}/${b}` : b,
  svg: () => ({ size: () => ({ flex_none: () => ({ text_color: () => ({}) }) }) }), pierreFileIcon: () => ({}),
  setShared() {}, stopsInit() {}, stopsEnd() {}, menuClosed() {}, propsLit: () => -1 });
vm.runInContext(src, context);
const ids = (o) => [...context.menu.rowItems(o).map((it) => it.id)];
const agent = { terminal: "t1" };

assert.deepEqual(ids({ platform: "macos", agent, editors: ["Zed"] }), ["open", "reveal", "open-with", "copy-path", "mention"]);
assert.deepEqual(ids({ platform: "macos" }), ["open", "reveal", "copy-path", "mention"], "no editors: no Open with");
assert.deepEqual(ids({ platform: "macos", remote: true, editors: ["Zed"] }), ["copy-path", "mention"], "another machine's: nothing opens here");
assert.deepEqual(ids({ platform: "linux" }), ["copy-path", "mention"]);
assert.equal(context.menu.rowItems({}).at(-1).disabled, true, "no terminal in the tab: Insert is off");

// A menu acts only while the space and tab it opened on show: it closes itself when they don't, and its watch ends with it.
{
  const view = {}, timers = { every: (ms, fn) => { const w = { ms, fn, cancel() { w.gone = true; } }; watches.push(w); return w; } };
  context.menu.initMenu(view, { focus_handle: () => ({ focus() {} }), timer: timers });
  assert.equal(watches.length, 1);
  watches[0].fn(); assert.deepEqual(closed, [], "its source still shows");
  shown = [{ id: "s2", active: true, tabs: [] }];
  watches[0].fn(); assert.deepEqual(closed, ["o1"], "another space shows: it closes");
  context.menu.closeMenu(view);
  assert.equal(watches[0].gone, true, "closed, it stops watching");
}

// A root check (Files) closes the menu and refuses actions once the root moves, without affecting callers that omit it (Review).
{
  shown = [{ id: "s1", active: true, tabs: [{ id: "b1", active: true }] }];
  menuProps = { files: "folder", overlay: "o2", dir: "", file: null, source: { space: "s1", tab: "b1", root: "/r1" } };
  let liveRoot = "/r1";
  closed.length = 0; watches.length = 0;
  const view = {}, timers = { every: (ms, fn) => { const w = { ms, fn, cancel() { w.gone = true; } }; watches.push(w); return w; } };
  context.menu.initMenu(view, { focus_handle: () => ({ focus() {} }), timer: timers, spawn() {} }, (s) => s.root === liveRoot);
  view.entries = [{ name: "a.js", dir: false }];
  watches[0].fn();
  assert.deepEqual(closed, [], "same root: stays open");
  liveRoot = "/r2";
  const beforeCalls = calls.length;
  context.menu.choose(view, 0, {});
  assert.equal(calls.length, beforeCalls, "root changed: refuses to send stale relative path");
  assert.deepEqual(closed, ["chain"], "root changed: closes the menu chain on pick");
  closed.length = 0;
  watches[0].fn();
  assert.deepEqual(closed, ["o2"], "root changed: watch closes the overlay");
  context.menu.closeMenu(view);
}

const cx = { read_from_clipboard: () => clipboard, write_to_clipboard: v => { clipboard = v; }, sleep: async () => {}, spawn: f => jobs.push(f) };
(async () => {
  clipboard = "original"; context.menu.mention("a.js", "t1", cx); assert.equal(clipboard, " a.js");
  assert.deepEqual(calls.map(c => c[0]), ["pane.focus", "terminal.paste"]);
  assert.equal(calls[0][1].terminal, "t1");
  await jobs.shift()(cx); assert.equal(clipboard, "original", "paste restores the text it borrowed");
  context.menu.mention("b.js", "t1", cx); clipboard = "new user copy"; await jobs.shift()(cx);
  assert.equal(clipboard, "new user copy", "a later user copy wins");
  clipboard = undefined; const before = calls.length; context.menu.mention("c.js", "t1", cx);
  assert.equal(calls.length, before); assert.equal(clipboard, undefined); assert.equal(notices.length, 1);
  clipboard = "kept"; context.menu.mention("a\nwhoami", "t1", cx);
  assert.equal(calls.length, before); assert.equal(clipboard, "kept", "a newline filename cannot execute through an unbracketed paste");
  console.log("ok: Files menu items, relative paths and clipboard-safe terminal insertion");
})().catch(e => { console.error(e); process.exitCode = 1; });
