// Files tree menu (ADR 0017). Review's diff tree has none. scripts/sync.sh copies this into Files.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, notify, exec } from "herdr";
import { step } from "./list.js";

export const MENU_W = 220, MENU_ROW = 28;

/**
 * Remote rows cannot reveal locally. `agent` is this tab's last active terminal, not a guessed agent in another tab.
 */
/** @param {{ page: string, remote?: boolean, platform?: string, agent?: any }} row */
export function fileMenuItems({ page, remote = false, platform, agent = null }) {
  const mac = platform === "macos";
  if (page === "review") return [];
  return [
    !remote && mac && { id: "reveal", label: "Reveal in Finder", icon: "folder-open" },
    { id: "copy-path", label: "Copy path", icon: "copy" },
    { id: "mention", label: "Insert into agent terminal", icon: "at-sign", disabled: !agent, hint: agent ? "" : "No active terminal in this tab" },
  ].filter(Boolean);
}

/** What the items both pages have do: `abs` the row's path, `rel` its path from the space's folder. False for another item. */
export function runCommon(id, { abs, rel, agent, platform }, cx) {
  if (id === "copy-path") cx.write_to_clipboard(rel);
  else if (id === "mention" && agent) mention(rel, agent.terminal, cx);
  else if (id === "reveal") exec("open", ["-R", abs]).then(r => { if (r.code !== 0) throw new Error(r.stderr); }).catch(e => notify({ title: "Couldn't reveal in Finder", body: String(e), level: "error" }));
  else return false;
  return true;
}

// Into the agent's input as a paste, never sent: the clipboard carries it and gets its text back. Paste reads the clipboard a
// moment later, so it's put back after 150 ms. A clipboard holding no text (an image) isn't touched.
export function mention(path, address, cx) {
  if (/[\x00-\x1f\x7f]/.test(path)) {
    notify({ title: "Couldn't insert this path", body: "It contains control characters. Use Copy path instead.", level: "warning" });
    return;
  }
  const previous = cx.read_from_clipboard();
  if (previous === undefined) {
    notify({ title: "The clipboard holds something that isn't text", body: "Insert would replace it. Copy path, then paste it yourself.", level: "warning" });
    return;
  }
  if (/** @type {any} */ (globalThis).t3PastePending) return;
  /** @type {any} */ (globalThis).t3PastePending = true;
  // shortcut: the host cannot read an input line, so always supply a separating space; refine when it exposes input text.
  const text = ` ${path}`;
  try { cx.write_to_clipboard(text); run("pane.focus", { terminal: address }); run("terminal.paste"); }
  catch (e) { cx.write_to_clipboard(previous); /** @type {any} */ (globalThis).t3PastePending = false; throw e; }
  cx.spawn(async (cx) => {
    try { await cx.sleep(150); }
    finally { if (cx.read_from_clipboard() === text) cx.write_to_clipboard(previous); /** @type {any} */ (globalThis).t3PastePending = false; }
  });
}

/**
 * The menu where it was pressed (`view.menu`: `{ x, y, at }` in the page, kept inside `size`), closed by a press beside it or
 * Escape. `items` carry `run(cx)` and maybe a `hint`; `handle` takes the keyboard while it's open. `mod` names the icons' folder.
 */
/** @param {any} view @param {any} t @param {string} mod @param {any[]} items @param {any} handle @param {{ width: number, height: number }} size */
export function fileMenuView(view, t, mod, items, handle, size) {
  const m = view.menu, h = items.length * MENU_ROW + 8;
  const x = Math.max(4, Math.min(m.x, size.width - MENU_W - 4)), y = Math.max(4, Math.min(m.y, size.height - h - 4));
  const close = (cx) => { view.menu = null; cx.notify(); };
  const choose = (it, cx) => { if (it.disabled) return; close(cx); it.run(cx); };
  return div().id("file-menu-backdrop").absolute().inset_0()
    .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); close(cx); })
    .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); close(cx); })
    .child(v_flex().id("file-menu").absolute().left(x).top(y).w(MENU_W).p(4).rounded(8).border(1).border_color(t.border).bg(t.popover).shadow_lg().text_size(14)
      .track_focus(handle)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_key_down((e, cx) => {
        cx.stop_propagation();
        if (e.key === "escape") return close(cx);
        if (e.key === "enter") { const it = items[m.at]; if (it) choose(it, cx); return; }
        const enabled = items.map((it, i) => !it.disabled ? i : -1).filter(i => i >= 0), to = step(e, enabled.indexOf(m.at), enabled.length);
        if (to >= 0) { m.at = enabled[to]; cx.notify(); }
      })
      .children(items.map((it, i) => h_flex().id(`file-menu-${it.id}`).h(MENU_ROW).px(8).gap(8).rounded(4).items_center()
        .when(it.disabled, el => el.opacity(0.5).tooltip(it.hint ?? "Not available"))
        .when(i === m.at, (el) => el.bg(t.selected))
        .on_hover((on, cx) => { if (it.disabled) return; const to = on ? i : m.at === i ? -1 : m.at; if (to !== m.at) { m.at = to; cx.notify(); } })
        .on_click((_e, cx) => choose(it, cx))
        .child(svg(`${mod}/icons/${it.icon}.svg`).size(16).mx(-2).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().child(it.label))
        .when(Boolean(it.hint && !it.disabled), (el) => el.child(div().flex_none().text_size(12).font_medium().text_color(t.dim).child(it.hint))))));
}
