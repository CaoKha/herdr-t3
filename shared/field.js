// Files' search field: T3's compact input (28 high, padding 9, radius 6, 12px), transparent until focused; focused, the
// `background` with a 1px `accent` border and a 3px `accent` 24% ring inside, nothing moving.
import { div } from "gpui-kit";
import { stop } from "./focus.js";
import { alpha } from "./color.js";

/**
 * The frame round `child` (the Input, or what stands in for it). `focus()` puts the keyboard in it, from a press or the stop's
 * Enter; `escape(cx)`, when given, is the field's Escape.
 * @param {any} view @param {any} t @param {string} id
 * @param {{ focused: boolean, child: any, focus: () => void, escape?: (cx: any) => void }} o
 */
export function compactField(view, t, id, { focused, child, focus, escape }) {
  return stop(view, t, id, div().id(id).relative().flex_1().min_w(0).h(28).px(9).rounded(6).border_1().border_color(focused ? t.accent : "#00000000")
    .when(focused, (el) => el.bg(t.background))
    .on_mouse_down("left", (_e, cx) => { focus(); cx.stop_propagation(); })
    .when(Boolean(escape), (el) => el.on_key_down((e, cx) => {
      if (e.key !== "escape") return;
      escape(cx);
      cx.stop_propagation(); cx.notify();
    }))
    .child(child)
    .when(focused, (el) => el.child(div().id(`${id}-ring`).absolute().inset_0().rounded(6).border(3).border_color(alpha(t.accent, "3d")))), 6, { enter: focus });
}
