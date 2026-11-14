// Files tree menu (ADR 0017). Review's diff tree has none. scripts/sync.sh copies this into Files.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, notify, exec } from "herdr";
import { menuJump, scrollList } from "./list.js";
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
 * The menu where it was pressed (`view.menu`: `{ x, y }` in the page, kept inside `size`), closed by a press beside it or
 * Escape. `items` carry `run(cx)` and maybe a `hint`; `handle` takes the keyboard while it's open. `mod` names the icons' folder.
 * An item with `children` opens them beside it, as T3's MenuSub, and theirs open beside them, as deep as they go; its
 * `open(cx)` runs as it opens (a folder read). `view.menu.lv` holds each open level: { at: the lit row, open: the row whose
 * submenu is open, intent: submenu.js's pointer state }.
 */
/** @param {any} view @param {any} t @param {string} mod @param {any[]} items @param {any} handle @param {{ width: number, height: number }} size */
export function fileMenuView(view, t, mod, items, handle, size) {
  const m = view.menu, z = Number(settings()?.zoom) || 1, listH = n => Math.min(n * MENU_ROW, size.height - 18);
  const level = () => ({ at: -1, open: null, intent: {} });
  m.lv ??= [level()];
  // Where row i of a level sits now, its list scrolled.
  const rowY = (v, i) => v.y + 5 + i * MENU_ROW - (m.scrollTop?.[`${v.id}-list`] ?? 0);
  // submenu.js's subPlace, as every submenu: beside its menu, right where it fits, else left, never over the menu it hangs
  // off (that one holds the row that opened it and the pointer's way in); a third level may cover the first, as macOS's do.
  const place = (v, i, n) => {
    const p = subPlace({ x: v.x, y: rowY(v, i), width: MENU_W, height: MENU_ROW }, MENU_W, 4, size.width - 4);
    return { x: Math.max(4, Math.min(p.x, size.width - MENU_W - 4)), y: Math.max(4, Math.min(p.y, size.height - listH(n) - 14)), side: p.side };
  };
  const levels = [];
  for (let d = 0, list = items, x = Math.max(4, Math.min(m.x, size.width - MENU_W - 4)), y = Math.max(4, Math.min(m.y, size.height - listH(items.length) - 14)); ; d++) {
    const L = (m.lv[d] ??= level()), v = { d, list, L, x, y, id: d ? `file-menu-${d}-${m.lv[d - 1].open}` : "file-menu-0" };
    levels.push(v);
    const i = list.findIndex(it => it.id === L.open && it.children);
    if (i < 0) { L.open = null; m.lv.length = d + 1; break; }
    const kids = list[i].children, p = place(v, i, kids.length);
    list = kids; x = p.x; y = p.y;
  }
  const close = (cx) => {
    for (const L of m.lv) subLeft(L.intent);
    view.menu = null;
    // Back to what opened it: the toolbar's button while the keys walk, else the page (not the tree, whose ring would light);
    // a row's menu, to the tree.
    const trigger = m.kind === "targets" ? "t3-files-open-more" : m.kind === "crumb" ? `browse-${m.root}` : null;
    (trigger ? view.fs?.handles.get(trigger) ?? handle : view.treeHandle)?.focus(); cx.notify();
  };
  // Level d with nothing open beyond it.
  const closeAfter = (d, cx) => { m.lv.length = d + 1; m.lv[d].open = null; subOpened(m.lv[d].intent, null); cx.notify(); };
  // Row `it` of level d opens its submenu; keys light its first row, as Base UI's.
  const openAt = (d, it, cx, keyboard = false, rect = null, side = "right") => {
    const L = m.lv[d];
    if (L.open !== it.id) { m.lv.length = d + 1; L.open = it.id; m.lv.push(level()); it.open?.(cx); }
    // Still being read, its first row is the one lit once it's there.
    if (keyboard) m.lv[d + 1].at = Math.max(0, it.children.findIndex(c => !c.disabled));
    subOpened(L.intent, it.id, rect, side);
    cx.notify();
  };
  const choose = (d, it, cx, keyboard = false) => {
    if (it.disabled) return;
    if (it.children) return openAt(d, it, cx, keyboard);
    if (!it.keepOpen) close(cx);
    it.run?.(cx);
  };
  const row = (v, it, i) => h_flex().id(`file-menu-${v.d}-${it.id}`).h(MENU_ROW).px(8).gap(8).rounded(4).items_center()
    .when(it.disabled, el => el.opacity(0.64).tooltip(it.hint ?? "Not available")).when(!it.disabled, el => el.cursor_pointer())
    // As T3's MenuSubTrigger, lit while its submenu is open.
    .when(!it.disabled && (i === v.L.at || it.id === v.L.open), el => el.bg(t.selected))
    // As T3's menus: lit only while the pointer's on it; a leave reported after the next row's enter doesn't unlight that one.
    .on_hover((on, cx) => {
      if (it.disabled) return;
      const to = on ? i : v.L.at === i ? -1 : v.L.at;
      if (to !== v.L.at) { v.L.at = to; cx.notify(); }
    })
    .on_mouse_move((e, cx) => hoverRow(v.L.intent, it.children ? it.id : null, e, cx, (key, _row, cx) => {
      if (view.menu !== m || m.lv[v.d] !== v.L) return;
      if (!key) return closeAfter(v.d, cx);
      const p = place(v, i, it.children.length), ox = e.bounds.x - (v.x + 5) * z, oy = e.bounds.y - rowY(v, i) * z;
      openAt(v.d, it, cx, false, { x: ox + p.x * z, y: oy + p.y * z, width: MENU_W * z, height: (listH(it.children.length) + 10) * z }, p.side);
    }))
    .on_click((_e, cx) => { cx.stop_propagation(); choose(v.d, it, cx); })
    // As t3-menu's rows (T3's MenuItem): the icon muted, 2px into the padding and gap; a submenu's chevron 16, 80%, 2px in.
    .when(Boolean(it.glyph || it.icon), el => el.child(div().flex_none().mx(-2).child(it.glyph ?? svg(`${mod}/icons/${it.icon}.svg`).size(16).text_color(t.muted))))
    .child(div().flex_1().min_w(0).truncate().child(it.label))
    .when(Boolean(it.children), el => el.child(svg(`${mod}/icons/chevron-right.svg`).size(16).mr(-2).flex_none().text_color(t.muted).opacity(0.8)))
    .when(Boolean(it.checked), el => el.child(svg(`${mod}/icons/check.svg`).size(14).flex_none().text_color(t.foreground)));
  // list.js's scrollList, so the keys' highlight stays in view (layout-implementation.md: a plain scroller doesn't follow keys).
  const panel = (v) => v_flex().id(`file-menu-panel-${v.d}`).absolute().left(v.x).top(v.y).w(MENU_W).p(4).rounded(8).border(1).border_color(t.border).bg(t.popover).shadow_lg().text_size(14)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    // On a submenu, nothing pending on the rows that opened it switches it; off a level, nothing pending on its rows opens.
    .on_hover(on => { if (on && v.d) subLeft(m.lv[v.d - 1].intent); if (!on) subLeft(v.L.intent); })
    .child(scrollList(m, `${v.id}-list`, { count: v.list.length, row: MENU_ROW, height: listH(v.list.length), at: v.L.at, draw: i => row(v, v.list[i], i),
      wheeled: keep => { if (keep >= 0 && !v.list[keep]?.disabled) v.L.at = keep; } }));
  return div().id("file-menu-backdrop").absolute().inset_0()
    .track_focus(handle)
    .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); close(cx); })
    .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); close(cx); })
    .on_key_down((e, cx) => {
      cx.stop_propagation();
      // The keys work the deepest level with a lit row (a submenu the pointer opened leaves its row's level lit), else the deepest.
      const last = levels.length - 1, v = [...levels].reverse().find(v => v.L.at >= 0) ?? levels[last], it = v.list[v.L.at];
      if (e.key === "escape") return last ? closeAfter(last - 1, cx) : close(cx);
      if (e.key === "left") {
        if (v.d < last) return closeAfter(v.d, cx);
        if (!v.d) return;
        const up = levels[v.d - 1]; up.L.at = up.list.findIndex(x => x.id === up.L.open);
        return closeAfter(v.d - 1, cx);
      }
      if (e.key === "right") { if (it?.children) openAt(v.d, it, cx, true); return; }
      if (e.key === "enter" || e.key === "space") { if (it) choose(v.d, it, cx, true); return; }
      const enabled = v.list.filter(x => !x.disabled), to = menuJump(m, e, enabled.map(x => x.label), enabled.indexOf(it));
      if (to < 0) return;
      v.L.at = v.list.indexOf(enabled[to]);
      // Moving off the row whose submenu is open closes it, as Base UI's.
      if (v.d < last) closeAfter(v.d, cx); else cx.notify();
    })
    .children(levels.map(panel));
}
