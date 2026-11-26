// Code views (code.js): the language a file name or a fence's info string colours as, the style an editor is made from, a diff's
// block and a box's wheel.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const kit = require("./check-kit.js");
const element = kit.elements();
// A TextView keeps its source and every range it paints.
const textView = (key, source) => {
  const node = { kind: "textview", key, source, items: [], handlers: {}, style: {}, ranges: [] };
  const el = new Proxy(node, { get: (target, k) => k in target ? target[k]
    : (...a) => { if (k === "highlight_range") target.ranges.push(a); else target.style[k] = a[0]; return el; } });
  return el;
};
const load = (scale = 1) => {
  const c = vm.createContext({ div: () => element(), TextView: { markdown: textView }, Editor: { new: () => element("editor") }, settings: () => ({ font_family: "Mono" }), alpha: (c, a) => `${c}${a}`,
    ui: (n) => scale === 1 ? n : Math.round(n * scale) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "code.js"), "utf8").replace(/^import [^;]*;\r?\n/gm, "").replace(/^export /gm, "")
    + "\nglobalThis.code = { languageOf, fenceLanguage, fenceDiff, diffRows, diffRowsOf, codeStyle, codeSyntax, canScroll, initCode, diffView, codeView, drewCode };", c);
  return c.code;
};
const code = load();

for (const [name, lang] of [["a.tsx", "js"], ["a.jsonc", "json"], ["a.yml", "yaml"], ["a.rs", "rust"], ["Makefile", "makefile"], ["GNUmakefile", "makefile"],
  ["a.hpp", "cpp"], ["a.toml", undefined], ["a.md", undefined], ["Dockerfile", undefined], ["a.constructor", undefined]])
  assert.equal(code.languageOf(name), lang, name);

for (const [info, lang] of [["ts", "js"], ["tsx", "js"], ["jsx", "js"], ["TypeScript", "js"], ["py", "python"], ["python", "python"], ["rs", "rust"],
  ["go", "go"], ["sh", "sh"], ["bash", "bash"], ["zsh", "zsh"], ["shell", "sh"], ["json", "json"], ["yaml", "yaml"], ["yml", "yaml"], ["sql", "sql"],
  ["c++", "cpp"], ["md", "markdown"], ["rust,ignore", "rust"], ["ts title=\"a.ts\"", "js"], ["{.py}", "python"],
  ["toml", undefined], ["diff", undefined], ["text", undefined], ["", undefined], [undefined, undefined], ["constructor", undefined]])
  assert.equal(code.fenceLanguage(info), lang, `fence ${info}`);

const t = { ansi1: "#1", ansi2: "#2", ansi3: "#3", ansi4: "#4", ansi5: "#5", ansi6: "#6", dim: "#d" };
assert.equal(code.codeStyle(t, "Mono"), JSON.stringify(["#5", "#2", "#d", "#4", "#3", "#1", "#6", "Mono", 12]), "every syntax colour, the font and the size");
assert.equal(JSON.parse(load(16 / 13).codeStyle(t, "Mono")).at(-1), 15, "the size follows the text size: an editor is made again");
assert.notEqual(code.codeStyle({ ...t, ansi5: "#9" }, "Mono"), code.codeStyle(t, "Mono"));
for (const [info, diff] of [["diff", true], ["patch", true], ["Diff", true], ["{.diff}", true], ["diff title=\"x\"", true], ["diff-so-fancy", false],
  ["js", false], ["", false], [undefined, false]])
  assert.equal(code.fenceDiff(info), diff, `diff fence ${info}`);

const kinds = (text) => Array.from(code.diffRows(text), (r) => [r.kind, r.text]);
assert.deepEqual(kinds("diff --git a/x b/x\r\nindex 1..2 100644\r\n--- a/x\r\n+++ b/x\r\n@@ -1,3 +1,3 @@ f()\r\n a\r\n--- old\r\n+++ new\r\n\r\n\\ No newline at end of file\r\n"),
  [["head", "diff --git a/x b/x"], ["head", "index 1..2 100644"], ["head", "--- a/x"], ["head", "+++ b/x"], ["hunk", "@@ -1,3 +1,3 @@ f()"],
    ["", " a"], ["del", "--- old"], ["add", "+++ new"], ["", ""], ["head", "\\ No newline at end of file"]],
  "headers, a hunk by its counts (a removed `--`, an added `++`, an empty context line), CRLF off, the last newline no row");
assert.deepEqual(kinds("@@ -1 +1 @@\n-a\n+b\n--- a/y\n+++ b/y\n@@ -5,2 +5,2 @@\n\tx"),
  [["hunk", "@@ -1 +1 @@"], ["del", "-a"], ["add", "+b"], ["head", "--- a/y"], ["head", "+++ b/y"], ["hunk", "@@ -5,2 +5,2 @@"], ["", "    x"]],
  "a hunk ends with its counts: the next file's header; a tab as 4 spaces");
assert.deepEqual(kinds("-old\n+new\n same\n@@ step @@\n+more\n\nplain"),
  [["del", "-old"], ["add", "+new"], ["", " same"], ["hunk", "@@ step @@"], ["add", "+more"], ["", ""], ["", "plain"]], "a written diff without counts: by its first character");
const part = { text: "+a" }, rows = code.diffRowsOf(part, part.text);
assert.equal(code.diffRowsOf(part, "-changed"), rows, "made once per owner");
assert.notEqual(code.diffRowsOf({ text: "+a" }, "+a"), rows, "another owner, made again");

// A box's wheel: taken while it can still move that way, the page's at its ends and when nothing overflows.
const at = (y, view = 100, content = 300) => ({ offset: () => ({ y }), viewport_size: () => ({ height: view }), content_size: () => ({ height: content }) });
assert.ok(code.canScroll(at(50), 10) && code.canScroll(at(50), -10), "mid-way, both ways");
assert.ok(!code.canScroll(at(0), 10) && code.canScroll(at(0), -10), "at the top: up is the page's");
assert.ok(code.canScroll(at(199.5), 10) && !code.canScroll(at(199.5), -10), "at the bottom: down is the page's");
assert.ok(!code.canScroll(at(0, 100, 100), 10) && !code.canScroll(at(0, 100, 100), -10), "nothing to scroll: the page's");
assert.ok(!code.canScroll(at(50), 0), "a sideways wheel stays the page's");

// A diff is one selectable code block: each washed row's range is its own text in the source, a longer fence past any backticks.
const view = {};
code.initCode(view);
const drows = code.diffRows("@@ -1,2 +1,2 @@\n-old ```x```\n+new\n same\n+");
const draw = (v, d) => kit.find(code.diffView(v, { ansi1: "R", ansi2: "G", foreground: "F", background: "B" }, "d", d), "d-text");
let block = draw(view, drows);
assert.equal(block.style.selectable, true);
assert.ok(block.source.startsWith("````diff\n") && block.source.endsWith("\n````"), "the fence outruns the text's backticks");
assert.deepEqual(block.ranges.map(([a, b, color]) => [block.source.slice(a, b), color]),
  [["@@ -1,2 +1,2 @@", "F0d"], ["-old ```x```", "R1c"], ["+new", "G1c"], ["+", "G1c"]], "context unwashed, the rest by kind");
const box = code.diffView(view, { background: "B", foreground: "F", ansi1: "R", ansi2: "G" }, "d", drows);
assert.equal(box.style.max_h, 15 * 20 + 16, "at most CODE_ROWS rows, then scrolled inside");
assert.ok(!box.handlers.on_scroll_wheel, "no handle until syncCode makes it");
assert.ok(box.handlers["on_mouse_down:left"], "a press stays in the block");
assert.equal(code.drewCode(view), true, "a box without its handle: syncCode runs");
view.codeViews.scrolls.set("d", at(50));
const stopped = [];
const wheel = (dy) => kit.fire(code.diffView(view, { background: "B" }, "d", drows), "on_scroll_wheel", { delta: { y: dy } }, { stop_propagation: () => stopped.push(dy) });
wheel(10); wheel(-10);
view.codeViews.scrolls.set("d", at(0)); wheel(5);
assert.deepEqual(stopped, [10, -10], "the block keeps the wheel only while it moves");
const big = load(16 / 13), bigView = {};
big.initCode(bigView);
assert.equal(big.diffView(bigView, { background: "B", foreground: "F", ansi1: "R", ansi2: "G" }, "d", drows).style.max_h, 15 * 25 + 16, "rows grow with the text");

// An editor is as tall as its rows, so the box scrolls it; the box is CODE_ROWS of them at most.
const cv = {};
code.initCode(cv);
const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
const plain = code.codeView(cv, {}, "c", lines, undefined, 400);
assert.equal(plain.style.h, 15 * 20 + 16);
cv.codeViews.made.set("c", { text: lines, language: undefined, style: code.codeStyle({}, "Mono"), state: {} });
const ed = kit.walk(code.codeView(cv, {}, "c", lines, undefined, 400)).find((n) => n.kind === "editor");
assert.equal(ed?.style.h, 30 * 20, "the editor at its full rows");
console.log("ok: code: languages by file name and fence, an editor's style and size, diff rows and block, a block's wheel");
