// T3's segmented ToggleGroup, as Custom snooze's: an `input` track, padding 2, gap 2, radius 8; each choice 24 high, padding 10,
// radius 6, 12px medium, the chosen one on `selected` in `foreground`, the others `dim`, brightening on hover.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { stop } from "./focus.js";

/**
 * `options`: `{ id, label, on, pick(cx), count?, name? }`, `name` what assistive tech reads (else the label and count). `fill`:
 * the choices share the track's width, centred. `role`: the choices' ("button", or "tab" for a page's switch).
 * @param {any} view @param {any} t @param {{ id: string, label: string, on: boolean, pick: (cx: any) => void, count?: any, name?: string }[]} options
 * @param {{ fill?: boolean, role?: "button" | "tab" }} [o]
 */
export function segmented(view, t, options, { fill = false, role = "button" } = {}) {
  return h_flex().p(2).gap(2).rounded(8).bg(t.input).when(!fill, (el) => el.flex_none())
    .children(options.map(({ id, label, on, pick, count = null, name }) => stop(view, t, id, h_flex().id(id).h(24).px(10).gap(6).items_center().rounded(6)
      .text_size(12).font_medium().when(fill, (el) => el.flex_1().justify_center()).when(!fill, (el) => el.flex_none())
      .when(on, (el) => el.bg(t.selected)).text_color(on ? t.foreground : t.dim).hover((s) => s.text_color(t.foreground))
      .role(role).accessibility_label(name ?? `${label}${count == null ? "" : `, ${count}`}${on ? ", shown" : ""}`)
      .on_click((_e, cx) => { pick(cx); cx.notify(); })
      .child(label).when(count != null, (el) => el.child(div().text_color(t.dim).child(String(count)))), 6)));
}
