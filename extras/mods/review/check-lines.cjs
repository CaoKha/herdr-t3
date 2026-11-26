// Picking diff lines by their numbers and what Send to agent pastes (lines.js).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = ["terminal-context.js", "lines.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n")
  .replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ")
  + "\nglobalThis.lines = { lineKey, pickLine, pickedRows, linesText, agentFor };";
let shown = [], focus = null;
const context = vm.createContext({ panes: () => shown, focused: () => focus, notify() {}, paste() {},
  spaces: () => [{ id: "s", active: true, tabs: [{ id: "tab", active: true }] }] });
vm.runInContext(src, context);
const { pickLine, pickedRows, linesText, agentFor } = context.lines;
const plain = (v) => JSON.parse(JSON.stringify(v));

const row = (kind, old, next, text) => ({ kind, old, new: next, tokens: [[text.slice(0, 2)], [text.slice(2)]] });
// old 10 ctx, 11 removed, 12 removed; new 10 ctx, 11 added; then old 13 / new 12 ctx; a second hunk from old 40 / new 39.
const rows = [row(" ", 10, 10, "  a();"), row("-", 11, undefined, "  b();"), row("-", 12, undefined, "  c();\r"), row("+", undefined, 11, "  d();"),
  row(" ", 13, 12, "  e();"), row(" ", 40, 39, "  z();")];
const keys = (pick) => plain([...pick.keys]);

// Click picks one line; shift-click extends either way from the anchor; shift in another file is refused.
let pick = pickLine(null, "a.ts", rows, rows[3], false);
assert.deepEqual(keys(pick), ["+:11"]);
pick = pickLine(pick, "a.ts", rows, rows[0], true);
assert.deepEqual(keys(pick), [" 10:10", "-11:", "-12:", "+:11"], "shift-click upwards");
pick = pickLine(pick, "a.ts", rows, rows[4], true);
assert.deepEqual(keys(pick), ["+:11", " 13:12"], "shift-click downwards, from the same anchor");
assert.equal(pickLine(pick, "b.ts", rows, rows[0], true), pick, "shift-click in another file keeps the pick");
assert.deepEqual(keys(pickLine(pick, "b.ts", rows, rows[0], false)), [" 10:10"], "a plain click in another file starts there");
assert.deepEqual(keys(pickLine(null, "a.ts", rows, rows[2], true)), ["-12:"], "shift with nothing picked picks the line");
// A refresh that drops an end leaves nothing to send.
assert.equal(pickedRows(pick, rows.slice(0, 3)).length, 0);

const file = { path: "src/a.ts" };
const text = (from, to, note) => linesText(file, rows.slice(from, to + 1), note);
// Added and context lines: the new file's numbers, no diff prefixes, the extension's fence.
assert.equal(text(3, 4), "src/a.ts:11-12 (new)\n```ts\n  d();\n  e();\n```");
assert.equal(text(0, 0), "src/a.ts:10 (new)\n```ts\n  a();\n```", "one line: one number");
// Removed lines: the old file's (a renamed file's old path); CR of a CRLF line dropped.
assert.equal(linesText({ path: "src/a.ts", previousPath: "src/old.ts" }, rows.slice(1, 3)), "src/old.ts:11-12 (old)\n```ts\n  b();\n  c();\n```");
// Both: old then new, each a run of its file; the note last.
assert.equal(text(0, 4, " why? "), [
  "src/a.ts:10-13 (old)\n```ts\n  a();\n  b();\n  c();\n  e();\n```",
  "src/a.ts:10-12 (new)\n```ts\n  a();\n  d();\n  e();\n```",
  "why?"].join("\n"));
// Past a hunk's end, a new block; a fence longer than the text's backticks; no extension, no language.
assert.equal(text(4, 5), "src/a.ts:12 (new)\n```ts\n  e();\n```\nsrc/a.ts:39 (new)\n```ts\n  z();\n```");
assert.equal(linesText({ path: "Makefile" }, [row("+", undefined, 1, "x ```y")]), "Makefile:1 (new)\n````makefile\nx ```y\n````");
assert.equal(linesText({ path: "bin/run" }, [row("+", undefined, 1, "go")]), "bin/run:1 (new)\n```\ngo\n```");
// An escape in the text could end a bracketed paste early: refused. Tabs stay.
assert.equal(linesText(file, [row("+", undefined, 1, "a\x1b[201~")]), null);
assert.ok(linesText(file, [row("+", undefined, 1, "\tx")]).includes("\tx"));
// Nothing ends in a newline: the paste never submits.
assert.ok(!text(0, 4, "n").endsWith("\n"));

// The agent: the tab's last active terminal when it runs one, else the tab's first agent; otherwise why not.
const pane = (terminal, agent, tab = "tab") => ({ tab, terminal, cwd: "/r", program: { agent } });
assert.deepEqual(plain(agentFor("s")), { reason: "No terminal in this tab" });
shown = [pane("sh", false)]; focus = { space: "s", tab: "tab", terminal: "sh" };
assert.deepEqual(plain(agentFor("s")), { reason: "No agent running in this tab" }, "a shell would run pasted lines");
shown = [pane("sh", false), pane("cc", true), pane("other", true, "tab2")];
assert.deepEqual(plain(agentFor("s")), { terminal: "cc" }, "the tab's agent, past its last active shell");
focus = { space: "s", tab: "tab", terminal: "cc" }; agentFor("s");
shown = [pane("cc2", true), pane("cc", true)];
assert.deepEqual(plain(agentFor("s")), { terminal: "cc" }, "the last active agent first");
console.log("ok: line picks, the pasted excerpt and the agent it goes to");
