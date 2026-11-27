// A read page's comment boxes: one for a new comment, bound to its subject's draft, and one for a reply, opened under a
// thread. Drafts are this run's memory (docs/internals/storage.md): a redraw, a refresh and moving between subjects keep them,
// and only the provider taking the text clears one.
import { div } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { alpha } from "./color.js";
import { textButton } from "./page.js";
import { ui } from "./layout-settings.js";

export function initComposer(view) {
  /** @type {Map<string, string>} */
  view.drafts = new Map();
  view.comment = TextareaState.new({ placeholder: "Leave a comment", rows: 3 });
  view.reply = TextareaState.new({ placeholder: "Reply", rows: 3 });
  // Each box is bound to the draft it shows: the new comment's by `commentKey` (`binding` while it takes one), a reply's by `replyTo`.
  Object.assign(view, { commentKey: null, binding: null, replyTo: null, commentFocused: false, replyFocused: false });
  for (const [box, bound, focused] of /** @type {const} */ ([[view.comment, "commentKey", "commentFocused"], [view.reply, "replyTo", "replyFocused"]])) {
    box.set_auto_grow(3, 12);
    box.on("change", (_e, cx) => { if (view[bound]) view.drafts.set(view[bound], box.value()); cx.notify(); });
    box.on("focus", (_e, cx) => { view[focused] = true; cx.notify(); });
    box.on("blur", (_e, cx) => { view[focused] = false; cx.notify(); });
  }
}

/** The reply box under the thread `key` names, with its draft. */
export function openReply(view, key, cx) {
  view.replyTo = key;
  view.reply.set_value(view.drafts.get(key) ?? "");
  view.reply.focus();
  cx.notify();
}

/** The draft `key` taken by the provider: gone, and a box showing it emptied (a reply's closed). */
export function sent(view, key) {
  view.drafts.delete(key);
  if (view.commentKey === key) view.comment.set_value("");
  if (view.replyTo === key) { view.replyTo = null; view.reply.set_value(""); }
}

/**
 * A multi-line box as the compact field (field.js): an `input` outline, `accent` and its ring while focused; then the buttons
 * at its right, Cancel before the action. `state` null draws the empty box while it takes its draft.
 */
export function editor(view, t, id, state, focused, label, { send, cancel = null }) {
  const box = state ? Textarea.new(state).w_full().px(11).py(7).rounded(8).text_size(ui(13)).text_color(t.foreground).accessibility_label(label)
    : div().w_full().h(ui(76)).px(11).py(7).text_size(ui(13)).text_color(t.dim).child(label);
  return v_flex().id(id).px(6).pt(4).gap(8)
    // A press here stays here: the page's own press (pageFrame) would take the keyboard back from the box.
    .child(div().id(`${id}-frame`).relative().rounded(8).border_1().border_color(focused ? t.accent : t.input).when(focused, (el) => el.bg(t.background))
      .on_mouse_down("left", (_e, cx) => { state?.focus(); cx.stop_propagation(); })
      .child(box)
      .when(focused, (el) => el.child(div().absolute().inset_0().rounded(8).border(3).border_color(alpha(t.accent, "3d")))))
    .child(h_flex().gap(8).justify_end().items_center()
      .when(Boolean(cancel), (el) => el.child(textButton(view, t, `${id}-cancel`, "Cancel", "outline", cancel)))
      .child(textButton(view, t, `${id}-send`, send.text, "primary", send.act, { disabled: send.disabled, reason: send.reason })));
}

export const BUSY = "Another change is being sent.";

/**
 * After the last comment, always: a new comment on the subject draft `key` names. The box takes the draft outside the draw (a
 * box's text can't be set in one), showing an empty frame meanwhile. `send(cx, body)`; `writing` the write under way.
 */
export function commentBox(view, t, id, key, cx, { writing, send }) {
  if (view.commentKey !== key && view.binding !== key) {
    view.binding = key;
    cx.timer.after(0, (cx) => {
      if (view.binding !== key) return;
      view.binding = null; view.commentKey = key;
      view.comment.set_value(view.drafts.get(key) ?? "");
      cx.notify();
    });
  }
  const bound = view.commentKey === key, empty = !bound || !view.comment.value().trim();
  return v_flex().id(`${id}-new-comment`).pt(12).child(editor(view, t, `${id}-comment-editor`, bound ? view.comment : null, bound && view.commentFocused, "Leave a comment", {
    send: { text: writing?.kind === "comment" ? "Sending…" : "Comment", disabled: Boolean(writing) || empty,
      reason: writing ? BUSY : "Write a comment first.", act: (cx) => send(cx, view.comment.value()) } }));
}

/** The reply box under a thread, its draft `key`; `mine`: this thread's reply is the write under way. */
export function replyBox(view, t, id, key, { writing, mine, send }) {
  return editor(view, t, `${id}-editor`, view.reply, view.replyFocused, "Reply", {
    send: { text: mine ? "Sending…" : "Send", disabled: Boolean(writing) || !view.reply.value().trim(), reason: writing ? BUSY : "Write a reply first.",
      act: (cx) => send(cx, view.reply.value()) },
    cancel: (cx) => { view.replyTo = null; cx.notify(); } });
}

/** Reply under thread `key`, opening its box: greyed while a write is under way. */
export const replyButton = (view, t, id, key, writing) => textButton(view, t, `${id}-reply`, "Reply", "plain", (cx) => openReply(view, key, cx), { disabled: Boolean(writing), reason: BUSY });
