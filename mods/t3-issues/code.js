// Code in Herdr's native read-only Editor, coloured from the theme: the Editor's language for a file name or a fence's info string,
// and, for the panel's read pages, code views made just after the draw that shows them and released once a draw doesn't. A diff
// has no Editor grammar: it's drawn as a Markdown code block instead (diffView).
import { div } from "gpui-kit";
import { Editor, EditorState, ScrollHandle, TextView } from "gpui-base";
import { checking, settings, theme } from "herdr";
import { alpha } from "./color.js";
import { ui } from "./layout-settings.js";
import { keepPress } from "./button.js";

export const codeFont = () => String(settings()?.font_family ?? "") || "Menlo";

// The Editor's languages that color something (docs/internals/specs/files.md, Editor languages); the rest stay plain.
const LANGUAGES = {
  js: "js", mjs: "js", cjs: "js", jsx: "js", ts: "js", mts: "js", cts: "js", tsx: "js", json: "json", jsonc: "json", yaml: "yaml", yml: "yaml",
  rs: "rust", go: "go", py: "python", sh: "sh", bash: "bash", zsh: "zsh", css: "css", c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp",
  hpp: "cpp", java: "java", kt: "kotlin", kts: "kotlin", rb: "ruby", php: "php", sql: "sql", lua: "lua", graphql: "graphql", gql: "graphql",
};
// A fence's names beyond the extensions: each language's own name, and the usual aliases.
const FENCE_NAMES = {
  ...Object.fromEntries(Object.values(LANGUAGES).map((l) => [l, l])), javascript: "js", typescript: "js", node: "js", python3: "python",
  golang: "go", shell: "sh", "c++": "cpp", make: "makefile", makefile: "makefile", md: "markdown", markdown: "markdown",
};
const ownKey = (map, key) => (Object.hasOwn(map, key) ? map[key] : undefined);

export const languageOf = (name) => /^(gnu)?makefile$/i.test(name) ? "makefile"
  : ownKey(LANGUAGES, name.includes(".") ? name.split(".").pop().toLowerCase() : "");
const fenceWord = (info) => /^\{?\.?([^\s,{}]*)/.exec(String(info ?? "").trim())[1].toLowerCase();
/** A fenced block's language from its info string's first word (`ts`, `rust,ignore`, `{.py}`); unknown, plain. */
export const fenceLanguage = (info) => ownKey(FENCE_NAMES, fenceWord(info)) ?? ownKey(LANGUAGES, fenceWord(info));
/** Whether a fenced block is a diff (`diff`, `patch`): drawn by diffView. */
export const fenceDiff = (info) => ["diff", "patch"].includes(fenceWord(info));

export const codeSyntax = (t) => ({ keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 });
/** What an editor's colours, font and size were made from: one that differs is made again. */
export const codeStyle = (t, font) => JSON.stringify([...Object.values(codeSyntax(t)), font, ui(CODE_TEXT)]);
/** A read-only editor of `value`; `gutter` false drops line numbers and folding. Not in a draw: it's a host call. */
export const codeEditor = (t, font, { language, value, wrap, gutter = true }) => EditorState.new({ language, value, readonly: true, soft_wrap: wrap,
  font_family: font, font_size: ui(CODE_TEXT), syntax: codeSyntax(t), ...(gutter ? {} : { line_numbers: false, folding: false }) });

// A page's code view: CODE_TEXT lines inside padding 8, a row each (CODE_LINE: 12 at GPUI's default 1.618 line height, rounded up),
// a wrapped line's rows guessed at CODE_CHAR a character; at most CODE_ROWS rows, the rest scrolled inside. The host gives
// neither measure. All as written for 13px text (ui).
const CODE_TEXT = 12, CODE_ROWS = 15, CODE_LINE = 20, CODE_PAD = 8, CODE_CHAR = 7.2;
const sameCode = (a, b) => Boolean(a && b) && a.text === b.text && a.language === b.language && a.style === b.style;
/** The rows `lines` (strings) take wrapped at `column`, at the code's guessed character width. */
const codeRows = (lines, column) => {
  const per = Math.max(1, Math.floor((column - 2 * CODE_PAD) / (CODE_CHAR * ui(CODE_TEXT) / CODE_TEXT)));
  return lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / per)), 0);
};
/**
 * A code view's box, scrolled inside once its content passes CODE_ROWS rows. It takes the wheel only while it can move that way,
 * so at its ends, or with nothing to scroll, the page scrolls. Its position is a handle made after the draw (syncCode). A press
 * stays here, as in Files' content: the page's own handler would take the keyboard from the selection; what's inside hears it first.
 */
const codeBox = (view, t, id) => {
  const handle = view.codeViews.scrolls.get(id);
  view.codeViews.boxes.add(id);
  return div().id(id).flex_none().rounded(6).bg(t.background).overflow_y_scrollbar().on_mouse_down("left", keepPress)
    .when(Boolean(handle), (el) => el.track_scroll(handle).on_scroll_wheel((e, cx) => { if (canScroll(handle, e.delta.y)) cx.stop_propagation(); }));
};
/** Whether a scroll area at `pos` (a ScrollHandle) moves for a wheel of `dy` (positive towards its top). */
export const canScroll = (pos, dy) => {
  const y = pos.offset().y;
  return dy > 0 ? y > 0.5 : dy < 0 && y + pos.viewport_size().height < pos.content_size().height - 1;
};

/** A read page's code views: `made` ({ text, language, style, state }) and those this draw asked for, by id; each box's scroll handle. Call from init. */
export function initCode(view) {
  view.codeViews = { made: new Map(), drawn: new Map(), last: new Map(), scrolls: new Map(), boxes: new Set(), lastBoxes: new Set() };
}

/**
 * `text` as read-only code `id`, `column` wide, in `language` (undefined: plain), wrapped, without line numbers. Its editor is
 * made after the draw (syncCode); until then the text plain, the same size. The editor is as tall as its rows, so the box
 * scrolls it, not the editor itself.
 */
export function codeView(view, t, id, text, language, column) {
  const c = view.codeViews, font = settings()?.font_family, want = { text, language, style: codeStyle(t, font) }, got = c.made.get(id);
  c.drawn.set(id, want);
  const rows = codeRows(text.split("\n"), column), line = ui(CODE_LINE);
  const box = codeBox(view, t, id).h(Math.min(rows, CODE_ROWS) * line + 2 * CODE_PAD);
  return sameCode(got, want) ? box.child(div().p(CODE_PAD).child(Editor.new(got.state).w_full().h(rows * line)))
    : box.p(CODE_PAD).text_size(ui(CODE_TEXT)).font_family(codeFont()).text_color(t.muted).child(text);
}

// A file's header lines in a unified diff, outside its hunks.
const DIFF_HEAD = /^(\+\+\+|---|diff |index |(new|deleted) file mode |(old|new) mode |similarity index |rename (from|to) |Binary files )/;

/**
 * A unified diff's lines as `{ text, kind }`: "add" (+), "del" (-), "hunk" (@@ … @@), "head" (a file's header lines, `\ No
 * newline`) or "" (context); tabs as 4 spaces. Inside a hunk whose @@ counts its lines the first character decides, so a removed
 * "-- comment" stays removed; outside one `+++` and `---` are headers.
 */
export function diffRows(text) {
  let old = 0, now = 0;
  return String(text ?? "").replace(/\r?\n$/, "").split(/\r?\n/).map((raw) => {
    const line = raw.replace(/\t/g, "    "), counts = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
    if (counts) { old = Number(counts[1] ?? 1); now = Number(counts[2] ?? 1); }
    if (counts || /^@@.*@@/.test(line)) return { text: line, kind: "hunk" };
    if (line.startsWith("\\")) return { text: line, kind: "head" };
    const kind = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "";
    if (old <= 0 && now <= 0) return { text: line, kind: DIFF_HEAD.test(line) ? "head" : kind };
    if (kind !== "add") old--;
    if (kind !== "del") now--;
    return { text: line, kind };
  });
}

const diffs = new WeakMap();
/** `owner`'s diff `text` in rows (diffRows), made once per owner object (a body's code part, a thread's comment), as its parts are. */
export function diffRowsOf(owner, text) {
  if (!diffs.has(owner)) diffs.set(owner, diffRows(text));
  return diffs.get(owner);
}

/**
 * `rows` (diffRows) in a code view's box, selectable as one Markdown code block in the code font, past CODE_ROWS scrolled inside: an
 * added line on a wash of green, a removed one of red, a hunk's @@ on a faint wash (Review's hunk row). TextView paints a range
 * behind its text, and colours no text of its own.
 */
export function diffView(view, t, id, rows) {
  const wash = { add: alpha(t.ansi2, "1c"), del: alpha(t.ansi1, "1c"), hunk: alpha(t.foreground, "0d") };
  const text = rows.map((r) => r.text).join("\n"), ticks = Math.max(3, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length + 1));
  const fence = "`".repeat(ticks), open = `${fence}diff\n`;
  let at = open.length, block = TextView.markdown(`${id}-text`, `${open}${text}\n${fence}`).selectable(true).scrollable(false)
    .text_size(ui(CODE_TEXT)).font_family(codeFont()).text_color(t.foreground);
  for (const r of rows) {
    if (wash[r.kind] && r.text) block = block.highlight_range(at, at + r.text.length, wash[r.kind]);
    at += r.text.length + 1;
  }
  return codeBox(view, t, id).max_h(CODE_ROWS * ui(CODE_LINE) + 2 * CODE_PAD).child(block);
}

/** After a page's draw: whether what it drew differs from what's made, which syncCode then settles. */
export function drewCode(view) {
  const c = view.codeViews;
  c.last = c.drawn; c.drawn = new Map();
  c.lastBoxes = c.boxes; c.boxes = new Set();
  return c.last.size !== c.made.size || [...c.last].some(([id, want]) => !sameCode(c.made.get(id), want))
    || c.lastBoxes.size !== c.scrolls.size || [...c.lastBoxes].some((id) => !c.scrolls.has(id));
}

/** Makes the last draw's code views and box handles, and releases those it didn't draw; with the page not `shown`, none is kept. */
export function syncCode(view, cx, shown) {
  const c = view.codeViews, live = shown && !checking(), want = live ? c.last : new Map(), boxes = live ? c.lastBoxes : new Set();
  const t = theme(), font = settings()?.font_family;
  for (const [id, got] of c.made) if (!sameCode(got, want.get(id))) { got.state.release(); c.made.delete(id); }
  for (const [id, handle] of c.scrolls) if (!boxes.has(id)) { handle.release(); c.scrolls.delete(id); }
  let made = 0;
  for (const [id, w] of want) {
    if (c.made.has(id)) continue;
    c.made.set(id, { ...w, state: codeEditor(t, font, { language: w.language, value: w.text, wrap: true, gutter: false }) });
    made++;
  }
  for (const id of boxes) if (!c.scrolls.has(id)) { c.scrolls.set(id, ScrollHandle.new()); made++; }
  if (made) cx.notify();
}

/** Every code view and box handle released: hidden, or the copy closing. */
export function dropCode(view) {
  for (const got of view.codeViews.made.values()) got.state.release();
  for (const handle of view.codeViews.scrolls.values()) handle.release();
  view.codeViews.made.clear();
  view.codeViews.scrolls.clear();
}
