// A shelf's heading, as Inbox's and Clean up's, and a panel page's folding section: a dim label, its count in `muted`, a 12px
// fold arrow when it folds; at the right, a note (`side`, truncated) and an action (`trail`).
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { stop, within } from "./focus.js";
import { glow } from "./tip.js";
import { foldArrow } from "./motion.js";

/**
 * `mod` holds the arrow's icons. With `toggle`, a click, Enter or Space folds or opens it. `h` and `px` its row: 32 and 8 in a
 * dialog, a page's sections pass their own.
 * @param {any} view @param {any} t @param {string} mod @param {string} id @param {string} label
 * @param {{ count?: number | null, open?: boolean, side?: string | null, sideColor?: string | null, trail?: any, toggle?: (e: any, cx: any) => void, h?: number, px?: number }} [o]
 */
export function shelfHead(view, t, mod, id, label, { count = null, open = false, side = null, sideColor = null, trail = null, toggle = undefined, h = 32, px = 8 } = {}) {
  const lit = view.hot === id || within(view, [id]);
  const head = h_flex().id(id).h(h).px(px).gap(6).items_center().rounded(6).text_size(12)
    .child(div().flex_none().text_color(lit ? t.muted : t.dim).child(label))
    .when(count != null, (el) => el.child(div().flex_none().text_color(t.muted).child(String(count))))
    .when(Boolean(toggle), (el) => el.child(foldArrow(mod, null, open, 12, t.dim)))
    .when(Boolean(side), (el) => el.child(div().id(`${id}-summary`).flex_1().min_w(0).truncate().text_right().text_color(sideColor ?? t.dim).child(side)))
    .when(!side && Boolean(trail), (el) => el.child(div().flex_1()))
    .when(Boolean(trail), (el) => el.child(side ? trail.ml(2) : trail));
  if (!toggle) return head;
  return stop(view, t, id, head.cursor_pointer().on_hover(glow(view, id)).on_click(toggle)
    .role("button").accessibility_label([open ? "Hide" : "Show", count, label.toLowerCase()].filter((w) => w != null).join(" ")), 6);
}
