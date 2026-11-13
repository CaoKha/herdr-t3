// Files tree menu (ADR 0017). Review's diff tree has none. scripts/sync.sh copies this into Files.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, notify, exec } from "herdr";
import { menuJump } from "./list.js";
import { subPlace, hoverRow, subOpened, subLeft } from "./submenu.js";
import { settings } from "herdr";

export const MENU_W = 220, MENU_ROW = 28;

/**
 * Remote rows cannot reveal locally. `agent` is this tab's last active terminal, not a guessed agent in another tab.
 */
/** @param {{ page: string, remote?: boolean, platform?: string, agent?: any, editors?: string[] }} row */
export function fileMenuItems({ page, remote = false, platform, agent = null, editors = [] }) {
  const mac = platform === "macos";
  if (page === "review") return [];
  return [
    !remote && mac && { id: "open", label: "Open", icon: "external-link" },
    !remote && mac && { id: "reveal", label: "Reveal in Finder", icon: "folder-open" },
    !remote && mac && editors.length > 0 && { id: "open-with", label: "Open with", icon: "external-link", children: editors.map(name => ({ id: `editor:${name}`, label: name, icon: "external-link" })) },
    { id: "copy-path", label: "Copy path", icon: "copy" },
    { id: "mention", label: "Insert into agent terminal", icon: "at-sign", disabled: !agent, hint: agent ? "" : "No active terminal in this tab" },
  ].filter(Boolean);
}

/** What the items both pages have do: `abs` the row's path, `rel` its path from the space's folder. False for another item. */
export function runCommon(id, { abs, rel, agent, platform }, cx) {
  if (id === "copy-path") cx.write_to_clipboard(rel);
  else if (id === "mention" && agent) mention(rel, agent.terminal, cx);
  else if (id === "reveal") exec("open", ["-R", "--", abs]).then(r => { if (r.code !== 0) throw new Error(r.stderr); }).catch(e => notify({ title: "Couldn't reveal in Finder", body: String(e), level: "error" }));
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
  const m = view.menu, h = items.length * MENU_ROW + 8, z = Number(settings()?.zoom) || 1;
  const x = Math.max(4, Math.min(m.x, size.width - MENU_W - 4)), y = Math.max(4, Math.min(m.y, size.height - h - 4));
  m.intent ??= {};
  const parent = items.find(it => it.id === m.sub), children = parent?.children;
  const sub = subPlace({ x, y: y + 4 + items.indexOf(parent) * MENU_ROW, width: MENU_W, height: MENU_ROW }, MENU_W, 4, size.width - 4);
  const sx = Math.max(4, Math.min(sub.x, size.width - MENU_W - 4)), sy = Math.max(4, Math.min(sub.y, size.height - (children?.length ?? 0) * MENU_ROW - 12));
  const close = (cx) => {
    subLeft(m.intent); view.menu = null;
    const trigger = m.kind === "targets" ? "t3-files-open-more" : m.kind === "crumb" ? `browse-${m.root}` : null;
    (view.fs?.handles.get(trigger) ?? view.treeHandle)?.focus(); cx.notify();
  };
  const openSub = (it, cx, keyboard = false) => { m.sub = it?.children ? it.id : null; m.childAt = keyboard ? 0 : -1; if (!it?.children) subOpened(m.intent, null); cx.notify(); };
  const choose = (it, cx) => { if (it.disabled) return; if (it.children) return openSub(it, cx, true); if (!it.keepOpen) close(cx); it.run?.(cx); };
  const rows = (list, child) => list.map((it, i) => h_flex().id(`${child ? "file-submenu" : "file-menu"}-${it.id}`).h(MENU_ROW).px(8).gap(8).rounded(4).items_center()
    .when(it.disabled, el => el.opacity(0.64).tooltip(it.hint ?? "Not available")).when(!it.disabled, el => el.cursor_pointer())
    .when(i === (child ? m.childAt : m.at), el => el.bg(t.selected))
    .on_hover((on, cx) => { if (!on || it.disabled) return; if (child) m.childAt = i; else m.at = i; cx.notify(); })
    .on_mouse_move((e, cx) => {
      if (child) { subLeft(m.intent); return; }
      hoverRow(m.intent, it.children ? it.id : null, e, cx, key => {
        if (view.menu !== m) return;
        openSub(items.find(it => it.id === key), cx);
        if (key) {
          const originX = e.bounds.x - (x + 4) * z, originY = e.bounds.y - (y + 4 + i * MENU_ROW) * z;
          const pos = subPlace({ x, y: y + 4 + i * MENU_ROW, width: MENU_W, height: MENU_ROW }, MENU_W, 4, size.width - 4);
          subOpened(m.intent, key, { x: originX + Math.max(4, Math.min(pos.x, size.width - MENU_W - 4)) * z, y: originY + pos.y * z, width: MENU_W * z, height: (it.children.length * MENU_ROW + 8) * z }, pos.side);
        }
      });
    })
    .on_click((_e, cx) => { cx.stop_propagation(); choose(it, cx); })
    .when(Boolean(it.glyph || it.icon), el => el.child(it.glyph ?? svg(`${mod}/icons/${it.icon}.svg`).size(16).mx(-2).flex_none().text_color(t.dim)))
    .child(div().flex_1().min_w(0).truncate().child(it.label))
    .when(Boolean(it.children), el => el.child(svg(`${mod}/icons/chevron-right.svg`).size(14).text_color(t.dim)))
    .when(Boolean(it.checked), el => el.child(svg(`${mod}/icons/check.svg`).size(14).text_color(t.foreground))));
  const panel = (id, list, px, py, child = false) => v_flex().id(id).absolute().left(px).top(py).w(MENU_W).max_h(size.height - 8).overflow_y_scroll().p(4).rounded(8).border(1).border_color(t.border).bg(t.popover).shadow_lg().text_size(14)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_hover(on => { if (!on) subLeft(m.intent); }).children(rows(list, child));
  return div().id("file-menu-backdrop").absolute().inset_0()
    .track_focus(handle)
    .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); close(cx); })
    .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); close(cx); })
    .on_key_down((e, cx) => {
      cx.stop_propagation();
      if (e.key === "escape" || children && e.key === "left") { if (children) openSub(null, cx); else close(cx); return; }
      const list = children ?? items, at = children ? m.childAt : m.at;
      if (e.key === "right" && !children && list[at]?.children) return openSub(list[at], cx, true);
      if (e.key === "enter" || e.key === "space") { const it = list[at]; if (it) choose(it, cx); return; }
      const enabled = list.filter(it => !it.disabled), to = menuJump(m, e, enabled.map(it => it.label), enabled.indexOf(list[at]));
      if (to >= 0) { const index = list.indexOf(enabled[to]); if (children) m.childAt = index; else m.at = index; cx.notify(); }
    })
    .child(panel("file-menu", items, x, y))
    .when(Boolean(children), el => el.child(panel("file-submenu", children, sx, sy, true)));
}
