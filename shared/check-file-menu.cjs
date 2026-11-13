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
