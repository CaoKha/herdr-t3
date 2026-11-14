// Files' menus (docs/adr/0018): native popups of this mod, as the layout's other menus. A tree row's (right-click, Shift+F10),
// a breadcrumb's folder (›) and Open in's apps (⌄, drawn by open-in.js as Details' is). A row with › opens its submenu beside it
// in a popup of its own (submenu.js), folders as deep as they go; they close together. Each acts only while the space and
// tab it was opened on still show (`source`).
import { svg } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, openOverlay, closeOverlay, theme, settings, shared, setShared, spaces, exec, run, notify, window } from "herdr";
import { focusRoot, stopsInit, stopsEnd } from "./focus.js";
import { menuJump, scrollList } from "./list.js";
import { menuRow, MENU_ROW } from "./menu-row.js";
import { subPlace, hoverRow, subOpened, subLeft } from "./submenu.js";
import { targetsMenu, openTarget, targetIcon } from "./open-in.js";
import { pierreFileIcon } from "./pierre-icons.js";
import { KEY } from "./store.js";
import { LIST, join, parseListing } from "./model.js";

const ICONS = "mods/t3-files"; // whose icons/ it draws
// As t3-menu's: 220 wide, 4 in, rows of 28; a folder's at most 12 rows before it scrolls.
export const MENU_W = 220, FOLDER_H = 8 + 12 * MENU_ROW;
// Stamped as a top menu closes, for the control that opened it (trigger.js); a submenu's, for the menu it hangs off.
export const MENU_CLOSED = "t3-files.menuClosed", SUB_CLOSED = "t3-files.submenuClosed";

// Only this run: each open menu's id, with the menus it hangs off. Mods share one JS context, as Details' layers.
const openMenus = () => /** @type {Map<string, string[]>} */ (/** @type {any} */ (globalThis).t3FilesMenus ??= new Map());
const scale = () => Number(settings()?.zoom) || 1;

/** Opens a Files menu: `kind` (row, editors, folder, open-in), openOverlay's `place` ({ at?, height }), `extra` its props. */
export function openMenu(kind, place, extra) {
  const id = openOverlay({ mod: "t3-files", kind: "popup", width: MENU_W, ...place, props: { ...extra, files: kind } });
  openMenus().set(id, extra.parents ?? []);
  return id;
}

/** The space and tab a menu was opened on are still the ones shown. */
const sourceOkay = (s) => { const sp = spaces().find(x => x.active); return sp?.id === s.space && sp.tabs.some(t => t.active && t.id === s.tab); };

/** A tree row's items: a remote one can't be opened or revealed here; `agent` is the tab's last active terminal. */
/** @param {{ remote?: boolean, platform?: string, agent?: any, editors?: string[] }} o */
export function rowItems({ remote = false, platform, agent = null, editors = [] }) {
  const mac = platform === "macos" && !remote;
  return [
    mac && { id: "open", label: "Open", icon: "external-link" },
    mac && { id: "reveal", label: "Reveal in Finder", icon: "folder-open" },
    mac && editors.length > 0 && { id: "open-with", label: "Open with", icon: "external-link", sub: "editors" },
    { id: "copy-path", label: "Copy path", icon: "copy" },
    { id: "mention", label: "Insert into agent terminal", icon: "at-sign", disabled: !agent, hint: agent ? "" : "No active terminal in this tab" },
  ].filter(Boolean);
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

/** Opens `rel` in app `name`, here only, once more checking the menu's space still shows; the app that opened is the next default. */
export function launch(source, rel, name) {
  if (source.on || window()?.platform !== "macos") return;
  openTarget(name, join(source.root, rel), () => sourceOkay(source)).then(actual => { if (actual) setShared(KEY.openTarget, actual); })
    .catch(e => notify({ title: "Couldn't open this file", body: String(e), level: "error" }));
}

export function initMenu(view, cx) {
  const p = props();
  view.keys = cx.focus_handle(); view.keys.focus();
  stopsInit(view, cx, "modal");
  // As T3's, nothing is lit until a key or the pointer gets there; keys that opened a submenu light its first row.
  view.at = p.lit ?? -1;
  // The submenu's pointer state (submenu.js), the one open { id, row }, and each row's bounds as the pointer last found it.
  view.s = {}; view.sub = null; view.rowsAt = [];
  // Where it opened: the pointer, for placing a submenu keys open before the pointer has found its row.
  view.origin = /** @type {any} */ (globalThis).window?.mouse_position?.();
  if (p.files === "folder") readFolder(view, cx);
  cx.timer.every(250, () => { if (!sourceOkay(p.source)) closeOverlay(p.overlay); });
}

// A breadcrumb menu's folder, read as it opens.
function readFolder(view, cx) {
  const p = props();
  view.entries = null;
  cx.spawn(async (cx) => {
    const r = await exec("sh", ["-c", LIST, "files", join(p.source.root, p.dir)], { on: p.source.on }).catch(() => null);
    view.entries = r?.code === 0 ? parseListing(r.stdout) : "failed";
    cx.notify();
  });
}

/** Closes every Files menu open, for cmd-w (keys.json's mod:t3-files runs t3-files.close): whether there was one. */
export function closeMenus() {
  const tops = [...openMenus()].filter(([, parents]) => !parents.length).map(([id]) => id);
  for (const id of tops) closeOverlay(id);
  return tops.length > 0;
}

/** Its submenu goes with it; the control that opened it, or the menu it hangs off, learns it's gone. */
export function closeMenu(view) {
  const p = props();
  stopsEnd(view);
  openMenus().delete(p.overlay);
  if (view.sub) closeOverlay(view.sub.id);
  setShared(p.parents?.length ? SUB_CLOSED : MENU_CLOSED, Date.now());
}

// What a menu lists: { id, label, icon?|glyph?, sub?, disabled?, hint?, checked?, keepOpen?, run?(cx) }.
function items(view) {
  const p = props(), t = theme(), s = p.source;
  if (p.files === "editors") return p.editors.map(name => ({ id: `editor:${name}`, label: name, glyph: targetIcon(ICONS, name, t), run: () => launch(s, p.path, name) }));
  if (p.files === "row") return rowItems({ remote: Boolean(s.on), platform: window()?.platform, agent: p.agent, editors: p.editors }).map(it => ({ ...it, run: (cx) => {
    if (it.id === "open") launch(s, p.path, shared(KEY.openTarget) ?? "Finder");
    else if (it.id === "reveal") exec("open", ["-R", "--", join(s.root, p.path)]).then(r => { if (r.code !== 0) throw new Error(r.stderr); }).catch(e => notify({ title: "Couldn't reveal in Finder", body: String(e), level: "error" }));
    else if (it.id === "copy-path") cx.write_to_clipboard(p.path);
    else if (it.id === "mention" && p.agent) mention(p.path, p.agent.terminal, cx);
  } }));
  // A breadcrumb's folder, as T3's: a folder opens its own beside it, read as it opens; a file opens in Files.
  if (view.entries === "failed") return [{ id: "retry", label: "Retry loading folder", icon: "refresh-cw", keepOpen: true, run: (cx) => readFolder(view, cx) }];
  if (!view.entries) return [{ id: "loading", label: "Loading folder…", disabled: true }];
  if (!view.entries.length) return [{ id: "empty", label: "This folder is empty.", disabled: true }];
  return view.entries.map(e => {
    const path = join(p.dir, e.name);
    return e.dir ? { id: path, label: e.name, glyph: svg(`${ICONS}/icons/tree/folder.svg`).size(16).flex_none().text_color(t.dim), sub: "folder" }
      : { id: path, label: e.name, glyph: pierreFileIcon(t, ICONS, path), checked: path === p.file, run: () => run(`t3-files.pick:${path}`) };
  });
}

// Row `i`'s submenu beside it. `lit`: keys opened it, so its first row is lit, as Base UI's.
function openSub(view, i, lit) {
  closeSub(view);
  const p = props(), list = items(view), it = list[i], z = scale();
  // shortcut: with no row seen yet (keys only), the row is placed from the pointer where the menu opened, as Herdr opens it
  // there; a menu Herdr pushed back into the window puts its submenu off by as much. Upgrade if Herdr reports where an element is.
  const o = view.origin ?? { x: 0, y: 0 };
  const b = view.rowsAt[i] ?? { x: o.x + 4 * z, y: o.y + (4 + i * MENU_ROW) * z, width: (MENU_W - 8) * z, height: MENU_ROW * z };
  const height = it.sub === "editors" ? 8 + p.editors.length * MENU_ROW : FOLDER_H;
  // Herdr keeps a popup in the window, but doesn't flip it: subPlace does, in the menu's own px.
  const at = subPlace({ x: b.x / z, y: b.y / z, width: b.width / z, height: b.height / z }, MENU_W, 0, /** @type {any} */ (globalThis).window.viewport_size().width / z);
  const id = openMenu(it.sub, { height, at: { x: at.x * z, y: at.y * z } }, { source: p.source, path: p.path, editors: p.editors, dir: it.sub === "folder" ? it.id : null, file: p.file,
    parents: [...(p.parents ?? []), p.overlay], ...(lit ? { lit: 0 } : {}) });
  view.sub = { id, row: i };
  subOpened(view.s, it.id, { x: at.x * z, y: at.y * z, width: MENU_W * z, height: height * z }, at.side);
}

function closeSub(view) {
  if (!view.sub) return;
  closeOverlay(view.sub.id);
  view.sub = null;
  subOpened(view.s, null);
  view.keys.focus();
}

function choose(view, i, cx, lit = false) {
  const p = props(), it = items(view)[i];
  if (!it || it.disabled) return;
  if (it.sub) return openSub(view, i, lit);
  // The whole chain closes, the menus it hangs off too.
  if (!it.keepOpen) { closeOverlay(p.overlay); for (const id of [...(p.parents ?? [])].reverse()) closeOverlay(id); }
  it.run?.(cx);
}

export function menuView(view) {
  const p = props(), t = theme();
  if (p.files === "open-in") return targetsMenu(view, ICONS, p.targets ?? [], p.reason, (name) => { if (sourceOkay(p.source)) setShared(KEY.openTarget, name); closeOverlay(p.overlay); });
  // Its submenu closed itself (← or Esc in it, a click beside it): the keyboard comes back here.
  shared(SUB_CLOSED);
  if (view.sub && !openMenus().has(view.sub.id)) { view.sub = null; subOpened(view.s, null); view.keys.focus(); }
  const list = items(view);
  return focusRoot(view, v_flex().id("files-menu").size_full().p(4).bg(t.popover).text_size(14).track_focus(view.keys)
    // Off the menu, nothing pending opens; a submenu open stays.
    .on_hover((on) => { if (!on) subLeft(view.s); })
    .on_key_down((e, cx) => {
      if (e.key === "enter" || e.key === "space") { if (view.at >= 0) choose(view, view.at, cx, true); }
      // A submenu's ← goes back to its menu, as its Esc does.
      else if (e.key === "escape" || (e.key === "left" && p.parents?.length)) closeOverlay(p.overlay);
      else if (e.key === "right") { if (list[view.at]?.sub) openSub(view, view.at, true); }
      else {
        const to = menuJump(view, e, list.map(it => it.label), view.at);
        if (to < 0) return;
        view.at = to;
        // Moving off the row whose submenu is open closes it, as Base UI's.
        if (view.sub && view.sub.row !== to) closeSub(view);
      }
      cx.stop_propagation(); cx.notify();
    })
    .child(scrollList(view, "files-menu-list", { count: list.length, row: MENU_ROW, at: view.at, height: Math.min(list.length * MENU_ROW, FOLDER_H - 8),
      wheeled: (keep) => { if (keep >= 0) view.at = keep; },
      draw: (i) => { const it = list[i]; return menuRow(view, t, `files-menu-${it.id}`, { at: [view, "at", i], label: it.label, open: i === view.sub?.row,
        icon: it.glyph ?? (it.icon ? `${ICONS}/icons/${it.icon}.svg` : null), sub: Boolean(it.sub), disabled: it.disabled, hint: it.hint || "Not available",
        trail: it.checked ? svg(`${ICONS}/icons/check.svg`).size(14).flex_none().text_color(t.foreground) : null, pick: (cx) => choose(view, i, cx),
        also: (el) => el.on_mouse_move((e, cx) => {
          view.rowsAt[i] = e.bounds;
          hoverRow(view.s, it.sub ? it.id : null, e, cx, (key, _row, cx) => { if (key) openSub(view, i, false); else closeSub(view); cx.notify(); });
        }) }); } })));
}
