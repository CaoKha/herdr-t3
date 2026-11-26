// A menu drawn in the page under its trigger: trigger.js's kind for a menu drawn in the view (t3-tokens P6), the panel and rows
// of a popup menu (t3-tokens "Menu rows"), 220 wide, right edges together, 4 below. One is open at a time per view (`view.menu`);
// a pick, Escape, the trigger again or a press elsewhere in the page closes it (the page calls closeInlineMenu from its
// root's press and inlineMenuKey from its root's keys).
import { v_flex, Popup } from "gpui-base";
import { trigger } from "./trigger.js";
import { menuRow } from "./menu-row.js";
import { menuKeys } from "./list.js";

/**
 * The trigger and, while it's open, its menu. `items`: `{ label, icon?, trail?, disabled?, hint?, pick(cx) }`. Opened by keys,
 * its first row is lit; by the pointer, none until a key or the pointer lights one. `wide`: the trigger has words (`extra`).
 * @param {any} view @param {any} t @param {string} id
 * @param {{ label: string, icon?: string, wide?: boolean, disabled?: boolean, items: any[] }} o
 * @param {(el: any) => any} [extra] what follows the trigger's icon
 */
export function inlineMenu(view, t, id, { label, icon, wide, disabled, items }, extra) {
  const open = view.menu?.id === id;
  if (open) view.menu.items = items;
  const button = trigger(view, t, id, { label, icon, wide, size: "xs", open, disabled, onOpen: (b) => { view.menu = open ? null : { id, at: b ? -1 : 0, items }; } }, extra);
  return Popup.new(`${id}-popup`, button).anchor("top_right").when(open, (el) => el.content(v_flex().id(`${id}-menu`).w(220).mt(4).p(4).rounded(8)
    .bg(t.popover).border_1().border_color(t.border).shadow_lg().text_size(14)
    // A press here isn't a press elsewhere in the page.
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .children(items.map((it, i) => menuRow(view, t, `${id}-item-${i}`, { at: [view.menu, "at", i], label: it.label, icon: it.icon, trail: it.trail,
      disabled: it.disabled, hint: it.hint, pick: (cx) => { view.menu = null; it.pick(cx); cx.notify(); } })))));
}

/** Closes the open menu; whether one was. */
export function closeInlineMenu(view) {
  if (!view.menu) return false;
  view.menu = null;
  return true;
}

/** The open menu's keys, for the page root's on_key_down, as every menu's (list.js menuKeys): ↑/↓, Home, End, type-ahead past greyed rows, Enter or Space picks, Escape closes. */
export function inlineMenuKey(view, e, cx) {
  const menu = view.menu;
  if (!menu) return;
  const items = menu.items ?? [];
  menuKeys(menu, items.map((it) => typeof it.label === "string" ? it.label : ""), (at, cx) => {
    const it = items[at];
    if (!it || it.disabled) return;
    view.menu = null;
    it.pick(cx);
  }, { close: () => { view.menu = null; }, disabled: (i) => Boolean(items[i]?.disabled) })(e, cx);
}
