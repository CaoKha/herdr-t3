// An agent's status mark, one shape wherever it's drawn: the pane header (14), its sub-agent menu and the Agents list (12).
// Working spins; blocked and failed share the rounded `!` on 15% of its colour, failed in ansi1 (T3's destructive); done is
// a 6px dot, 12 wide as the others. Anything else has none: each place says idle its own way.
// scripts/sync.sh copies this to the mods that use it.
import { div, svg } from "gpui-kit";

export const STATUS_WORD = { working: "Working", blocked: "Needs you", error: "Failed", done: "Done", idle: "Idle" };

export function statusMark(t, st, size = 12) {
  if (st === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
  if (st === "blocked" || st === "error") {
    const c = st === "error" ? t.ansi1 : t.blocked;
    return div().size(size).flex_none().rounded(4).bg(c + "26").text_size(size < 14 ? 10 : 11).font_bold().text_color(c)
      .flex().items_center().justify_center().child("!");
  }
  return st === "done" ? div().size(6).mx(3).flex_none().rounded_full().bg(t.done) : null;
}
