// Diff lines picked by their numbers and pasted, as fenced excerpts, into the tab's agent terminal (docs/internals/specs/review.md).
import { panes, spaces, notify } from "herdr";
import { terminalFor } from "./terminal-context.js";
import { paste } from "./menus.js";

/** A row's key in its file: a removed line has only its old number, an added one only its new, context both. */
export const lineKey = (row) => `${row.kind}${row.old ?? ""}:${row.new ?? ""}`;

/** The file's rows in the order drawn: the whole file's once open, else its hunks'. */
export const fileRows = (file, whole) => whole?.rows ?? file?.hunks?.flatMap(h => h.rows) ?? [];

/** A press on a line's number picks that line; with shift, it moves the pick's far end there, in the same file only. */
export function pickLine(pick, path, rows, row, shift) {
  if (shift && pick && pick.path !== path) return pick;
  const key = lineKey(row), anchor = shift && pick ? pick.anchor : key;
  return { path, anchor, head: key, keys: new Set(pickedRows({ anchor, head: key }, rows).map(lineKey)) };
}

/** The picked rows in the file's order; none once an end has left the file's rows (a refresh changed it). */
export function pickedRows(pick, rows) {
  const keys = rows.map(lineKey), a = keys.indexOf(pick.anchor), b = keys.indexOf(pick.head);
  return a < 0 || b < 0 ? [] : rows.slice(Math.min(a, b), Math.max(a, b) + 1);
}

const fenceOf = (path) => {
  const name = path.slice(path.lastIndexOf("/") + 1), dot = name.lastIndexOf(".");
  return /^(gnu)?makefile$/i.test(name) ? "makefile" : dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/**
 * What a pick pastes: per side, a `path:start-end (old|new)` line over the lines' text in a fence named by the extension.
 * Removed lines and their context are the old file's, added and context the new file's: a pick with both is two blocks, old
 * then new, each a run of the real file. A gap (two hunks) starts another block. Null when the text holds control characters.
 */
export function linesText(file, rows, note = "") {
  const sides = rows.some(r => r.kind === "-") ? (rows.some(r => r.kind === "+") ? ["old", "new"] : ["old"]) : ["new"];
  const blocks = [];
  for (const side of sides) {
    const path = side === "old" ? file.previousPath ?? file.path : file.path;
    let run = /** @type {{ from: number, to: number, text: string[] } | null} */ (null);
    const close = () => {
      if (!run) return;
      const body = run.text.join("\n");
      let ticks = 3;
      for (const m of body.matchAll(/`+/g)) ticks = Math.max(ticks, m[0].length + 1);
      const fence = "`".repeat(ticks);
      blocks.push(`${path}:${run.from === run.to ? run.from : `${run.from}-${run.to}`} (${side})\n${fence}${fenceOf(path)}\n${body}\n${fence}`);
    };
    for (const row of rows) {
      if (row.kind === (side === "old" ? "+" : "-")) continue;
      const n = side === "old" ? row.old : row.new, text = row.tokens.map(([t]) => t).join("").replace(/\r$/, "");
      if (run && n === run.to + 1) { run.to = n; run.text.push(text); continue; }
      close();
      run = { from: n, to: n, text: [text] };
    }
    close();
  }
  const text = [...blocks, note.trim()].filter(Boolean).join("\n");
  return /[\x00-\x08\x0b-\x1f\x7f]/.test(text) ? null : text;
}

/** The terminal a pick goes to: the tab's last active one when it runs an agent, else the tab's first that does, or why none. */
export function agentFor(space) {
  const all = panes(), tab = spaces().find(s => s.id === space)?.tabs.find(t => t.active)?.id, was = terminalFor(space, tab, all);
  const agent = (was && all.find(p => p.terminal === was.terminal && p.program?.agent)) ?? all.find(p => p.tab === tab && p.terminal && p.program?.agent);
  return agent ? { terminal: agent.terminal } : { reason: was || all.some(p => p.tab === tab && p.terminal) ? "No agent running in this tab" : "No terminal in this tab" };
}

/** Pastes the pick and its note into the agent, never pressing Enter: a multi-line paste reaches only an agent, which reads it
 *  as one paste. The pick and the note go once it has pasted. */
export function sendLines(view, cx) {
  const pick = view.linePick, file = pick && view.review?.files.find(f => f.path === pick.path), target = agentFor(view.space);
  if (!file || !target.terminal) return;
  const rows = pickedRows(pick, fileRows(file, view.full.get(file.path)));
  if (!rows.length) {
    view.linePick = null; cx.notify();
    notify({ title: "These lines changed", body: "Pick them again.", level: "warning" });
    return;
  }
  const text = linesText(file, rows, view.lineNote.value());
  if (text === null) {
    notify({ title: "Couldn't send these lines", body: "They contain control characters. Copy them instead.", level: "warning" });
    return;
  }
  if (!paste(` ${text}`, target.terminal, cx, "Sending would replace it. Copy the lines yourself instead.")) return;
  view.linePick = null; view.lineNote.set_value(""); cx.notify();
}
