// What the panel's read pages share: each space's state and when it's read, the sections they fold, kept per copy, and the
// frame, controls and rows they draw with.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { checking, spaces, window, layout, settings, exec } from "herdr";
import { panelState, layoutNode } from "./panel.js";
import { workFolder } from "./terminal-context.js";
import { treeHead } from "./nav-column.js";
import { button, ghostButton, tint, radiusOf } from "./button.js";
import { stop, focusRoot } from "./focus.js";
import { tip, glow } from "./tip.js";
import { readLocal } from "./store.js";
import { shelfHead } from "./shelf.js";
import { closeInlineMenu, inlineMenuKey } from "./inline-menu.js";
import { pictureBody, fetchPictures } from "./pictures.js";
import { ago } from "./ago.js";

// A shown page reads again this often, with the window in front.
export const READ_EVERY = 60000;
// Which sections the person opened or shut, by section, in this copy's localStorage (docs/internals/storage.md).
export const SECTIONS_KEY = "sections.open";
export const codeFont = () => String(settings()?.font_family ?? "") || "Menlo";

/** How long ago an ISO time was, as the sidebar says it (ago.js). */
export const since = (iso, now) => ago(Date.parse(iso), now);

/** What a failed write says: the provider's words, and for text sent, that it may still have landed. */
export const writeError = (kind, message) => kind === "comment" || kind === "reply"
  ? `${message} It may have gone through: refresh before sending it again.` : message;

// One draft per subject (a PR, an issue) for a new comment, one per thread for a reply.
export const draftKey = (subject, thread = null) => `${subject}${thread ? `:${thread}` : ""}`;

export async function openUrl(url) {
  const platform = window()?.platform;
  const [command, args] = platform === "macos" ? ["open", [url]]
    : platform === "windows" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
  const r = await exec(command, args).catch(() => null);
  if (r?.code !== 0) throw new Error(`Couldn't open ${url}`);
}

/**
 * Sets a page's view up: `page` its panel-body slot, `mod` its folder (`mods/<name>`, its icons). The view gives `blank(sp,
 * folder, tab)`, a space's fresh state (with `token`, `reading`, `readAt`, `folder`, `on`, `tab`), and `read(st, cx)`. One
 * copy serves every space, each kept by its id.
 */
export function initPage(view, cx, { page, mod }) {
  Object.assign(view, { page, mod, states: new Map(), seen: null, hot: null, menu: null, width: null, sections: readLocal(SECTIONS_KEY, {}) });
  view.handle = cx.focus_handle();
  // A hidden copy isn't drawn, so this is what sees the page come back, the space change and the minute pass.
  cx.timer.every(1000, (cx) => tickPage(view, cx));
}

export const pageShown = (view, p = panelState()) => p.open && p.page === view.page;
const modName = (view) => view.mod.slice("mods/".length);

/** The space's state, its reads made stale when its tab's folder or machine moves: what it shows stays until the new read lands. */
export function stateFor(view, sp) {
  const folder = workFolder(sp.id) ?? null, on = sp.machine ?? null;
  let st = view.states.get(sp.id);
  if (!st || st.on !== on) view.states.set(sp.id, st = view.blank(sp, folder, st?.tab));
  else if (st.folder !== folder) { st.folder = folder; st.token++; st.reading = false; st.readAt = 0; }
  return st;
}

/**
 * The one place a page decides to read: only while it shows for the active space, with the window in front; on showing (a space
 * switch too), when the folder moved, then every READ_EVERY. It owns `seen`, the space last read for while shown.
 */
export function tickPage(view, cx) {
  if (checking() || window()?.active === false) return;
  const all = spaces();
  for (const id of view.states.keys()) if (!all.some((s) => s.id === id)) view.states.delete(id);
  const panel = layoutNode(layout(), "panel"), sp = all.find((s) => s.active);
  if (!panel || panel.hidden || !sp || !pageShown(view)) { view.seen = null; return; }
  const st = stateFor(view, sp);
  if (view.seen !== sp.id || !st.readAt) { view.seen = sp.id; view.read(st, cx); }
  else if (!st.reading && Date.now() - st.readAt >= READ_EVERY) view.read(st, cx);
}

export function refreshPage(view, cx) {
  const sp = spaces().find((s) => s.active);
  if (sp) view.read(stateFor(view, sp), cx);
}

/** A read's freshness: it bumps `st[key]` and answers whether it is still the space's latest of that kind. */
export function freshness(view, st, key) {
  const n = ++st[key];
  return () => view.states.get(st.id) === st && st[key] === n;
}

/** Whether section `key` shows: the person's last choice, else `fallback`. */
export const sectionOpen = (view, key, fallback = true) => typeof view.sections[key] === "boolean" ? view.sections[key] : fallback;

export function toggleSection(view, key, open, cx) {
  view.sections = { ...view.sections, [key]: open };
  localStorage.setItem(SECTIONS_KEY, JSON.stringify(view.sections));
  cx.notify();
}

/**
 * The page: its header row (Files' tree head), the bars under it, then its body, a column. A press in it takes the keyboard (so
 * the page's keys are its own) and closes its open menu; its keys move that menu. Its width sizes pictures. After the draw: a
 * first read for a space not seen yet (tickPage decides), and the pictures the draw asked for. `panel`: this draw's panelState().
 */
export function pageFrame(view, t, cx, { panel, head, bars = [], body }) {
  const sp = spaces().find((s) => s.active), shown = pageShown(view, panel);
  if (shown && sp && view.seen !== sp.id) cx.timer.after(0, (cx) => tickPage(view, cx));
  if (view.pictures?.wanted.size) cx.timer.after(0, (cx) => fetchPictures(view, cx, pageShown(view)));
  return focusRoot(view, v_flex().id(modName(view)).size_full().min_h(0).text_color(t.foreground).text_size(13)
    .track_focus(view.handle).on_mouse_down("left", (_e, cx) => { view.handle.focus(); if (closeInlineMenu(view)) cx.notify(); })
    .on_key_down((e, cx) => inlineMenuKey(view, e, cx))
    .on_size_change((size, cx) => {
      const width = size.width / (Number(settings()?.zoom) || 1);
      if (width !== view.width) { view.width = width; cx.notify(); }
    })
    .child(treeHead(`${modName(view)}-head`, head))
    .children(bars)
    .child(v_flex().flex_1().min_h(0).child(body)));
}

/** An icon button on the page's `chrome`, its label in a tooltip; greyed, the tooltip says why (`label` then). */
export function control(view, t, id, icon, label, press, state = {}) {
  const el = ghostButton(view, t, id, { icon: `${view.mod}/icons/${icon}.svg`, label, act: press, surface: "chrome", ...state });
  const trigger = state.disabled ? div().flex_none().child(el).on_hover(glow(view, id)) : stop(view, t, id, el, radiusOf(state.size));
  return tip(view, t, id, label, trigger);
}

/** A button with words; greyed, `reason` in its tooltip. */
export function textButton(view, t, id, text, variant, act, { disabled = false, reason = "" } = {}) {
  const el = button(t, id, { variant, size: "xs", text, disabled, act });
  return disabled ? tip(view, t, id, reason, div().flex_none().child(el).on_hover(glow(view, id))) : stop(view, t, id, el, radiusOf("xs"));
}

export const note = (t, text) => div().px(6).text_size(12).text_color(t.dim).child(text);

/** A section row: 24 high, its box on the column's edge and its words 6 in, lit on hover when it does something; `on` lit as picked. */
export function line(view, t, id, label, act, children, on = false) {
  const el = h_flex().id(id).h(24).px(6).gap(8).items_center().rounded(6).text_size(12).when(on, (r) => r.bg(tint(t, "chrome", true)).font_medium())
    .when(Boolean(act), (r) => r.cursor_pointer().role("button").accessibility_label(label).hover((h) => h.bg(tint(t, "chrome", false))).on_click((_e, cx) => act(cx)))
    .children(children);
  return act ? stop(view, t, id, el, 6) : el;
}

/**
 * A folding section: Inbox's shelf heading at 28 (shelf.js), then its rows while open. `open` is the caller's (sectionOpen,
 * or a default); `summary` ({ text, color }) on the heading's right while shut; a click keeps the choice (toggleSection).
 */
export function section(view, t, key, title, rows, { open, count = null, summary = null }) {
  const id = `${modName(view)}-${key}`;
  return v_flex().id(id).pt(12).gap(2)
    .child(shelfHead(view, t, modName(view), `${id}-head`, title, { count, open, h: 28, px: 6, side: open ? null : summary?.text ?? null, sideColor: summary?.color ?? null,
      toggle: (_e, cx) => toggleSection(view, key, !open, cx) }))
    .when(open, (el) => el.children(rows()));
}

/** A body with its pictures (pictures.js), as wide as the page less the detail's 12 and the body's 6, each side. */
export const rich = (view, t, id, parts, open) => pictureBody(view, t, id, parts, { column: Math.max(48, (view.width ?? 420) - 36), open });

/**
 * One comment: its author, a review's word if one (`word`, `wordColor`), how long ago, a link to it; then its body (`parts`).
 * `open(url, cx)` opens a link.
 */
export function said(view, t, id, c, { now, parts, open, word = null, wordColor = null }) {
  return v_flex().id(id).pt(8).gap(2)
    .child(h_flex().h(24).px(6).gap(6).items_center().text_size(12)
      .child(div().flex_none().font_medium().child(c.author))
      .when(Boolean(word), (el) => el.child(div().flex_none().text_color(wordColor ?? t.dim).child(word)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(since(c.at, now)))
      .when(Boolean(c.url), (el) => el.child(control(view, t, `${id}-link`, "link", "Open comment in the browser", (cx) => open(c.url, cx), { size: "micro" }))))
    .when(parts.length > 0, (el) => el.child(rich(view, t, `${id}-body`, parts, open)));
}

/** A state's `icon`, in the mod's icons, in its `color`: a theme key, else a color of its own. */
export const stateIcon = (view, t, state, size) => svg(`${view.mod}/icons/${state.icon}.svg`).size(size).flex_none().text_color(t[state.color] ?? state.color ?? t.dim);
