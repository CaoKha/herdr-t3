// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "t3-pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.
// Its sub-agents: a count in the header that opens their list, this mod again as a popup with { kids: terminal }.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { panes, terminals, agents, spaces, props, run, theme, home, openOverlay, closeOverlay, settings, shared, setShared, layout } from "herdr";
import { modStatus, namer, programOf } from "./name.js";
import { isAgent, kidStatus, notNews, ownStatus, subAgents, treeStatus } from "./tree.js";
import { programIcon } from "./program.js";
import { tip, tipMark, glow, POINTER_WATCH, pointerAt, pointerGone, pointerMoved } from "./tip.js";
import { stopsInit, stopsEnd, stop, focusRoot, within, pressed, justClosed } from "./focus.js";
import { menuJump, scrollList } from "./list.js";
import { sidebarParts } from "./sidebar.js";
import { KEY } from "./store.js";
import { openMenu } from "./menu.js";
import { button as drawButton, radiusOf } from "./button.js";

// The list as the layout's other menus (the sort menu, the right-click menu): 4 around 28px rows.
const KIDS_WIDTH = 280, KIDS_SHOWN = 10, KIDS_ROW = 28, KIDS_CLOSED = "t3-pane.kidsClosed";
const WORD = { working: "Working", blocked: "Needs you", idle: "Idle", done: "Done", error: "Failed" };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Everything an agent started, a step in for each level, as the agents list nests them, each with its own status:
// as T3's rows, one waiting on a stuck one under it is still at work, and that one says it's stuck.
function kidRows(addr) {
  const all = terminals(), listed = new Map(agents().map((a) => [a.address, a.status]));
  const children = new Map();
  for (const k of all) {
    if (k.state !== "live") continue;
    if (!children.has(k.parent)) children.set(k.parent, []);
    children.get(k.parent).push(k);
  }
  const walk = (at, depth, seen) => {
    if (seen.has(at)) return [];
    seen.add(at);
    // A shell between them isn't listed (tree.js): what it started stands where it would have.
    return (children.get(at) ?? []).filter((k) => !seen.has(k.address)).flatMap((k) => isAgent(k)
      ? [{ k, depth, st: k.status === "error" ? "error" : kidStatus(k, listed) }, ...walk(k.address, depth + 1, seen)]
      : walk(k.address, depth, seen));
  };
  return walk(addr, 0, new Set());
}
const kidName = (k) => k.name || k.template || k.program?.name || k.address;

// How long it's been working, as the Inbox's Working pill: 9s, 4m, 1h 5m.
function took(ms, now) {
  const s = Math.max(0, Math.floor((now - ms) / 1000)), m = Math.floor(s / 60);
  return s < 60 ? `${s}s` : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Time left on a snooze, as the Inbox's row says it: 10m, 3h, 2d.
function left(ms, now) {
  const m = Math.max(1, Math.ceil((ms - now) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.ceil(m / 60)}h` : `${Math.ceil(m / 1440)}d`;
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}


export default class Pane extends View {
  init(_props, cx) {
    if (props()?.kids) {
      // Take the keyboard; a row lights only after a key or the pointer arrives.
      this.at = -1;
      this.keys = cx.focus_handle();
      this.keys.focus();
      // Only this run: folds and the tree snapshot belong to this popup, not a saved preference.
      this.folded = new Set();
      this.refreshKids();
      // A working one's time runs on, as the Inbox's pill. With all of them ended, the list goes.
      this.clock = cx.timer.every(1000, (cx) => {
        this.refreshKids();
        if (this.rows.length === 0) closeOverlay(props().overlay);
        else cx.notify();
      });
      return;
    }
    this.hovered = false;
    stopsInit(this, cx);
    // A snooze's time left counts down, and its end brings the done back.
    this.napWatch = cx.timer.every(30000, (cx) => { if (this.napping) cx.notify(); });
  }

  async close() {
    if (props()?.kids) {
      this.clock?.cancel();
      setShared(KIDS_CLOSED, Date.now());
    }
    else { stopsEnd(this); this.napWatch?.cancel(); }
  }

  refreshKids() {
    const selected = this.rows?.[this.at]?.k.address;
    this.allRows = kidRows(props().kids);
    const live = new Set(this.allRows.map(({ k }) => k.address));
    for (const key of this.folded) if (!live.has(key)) this.folded.delete(key);
    this.allRows.forEach((r, i) => {
      r.children = this.allRows[i + 1]?.depth > r.depth;
    });
    this.visibleKids(selected);
  }

  visibleKids(selected = this.rows?.[this.at]?.k.address) {
    let hidden = Infinity;
    this.rows = this.allRows.filter((r) => {
      if (r.depth > hidden) return false;
      hidden = this.folded.has(r.k.address) ? r.depth : Infinity;
      return true;
    });
    this.labels = this.rows.map(({ k }) => kidName(k));
    this.at = this.rows.findIndex(({ k }) => k.address === selected);
  }

  foldKid(row, folded) {
    if (!row?.children) return;
    if (folded) this.folded.add(row.k.address); else this.folded.delete(row.k.address);
    this.visibleKids(row.k.address);
  }

  // Rendering and moving selection use the timer's tree snapshot, never terminal enumeration.
  kidsMenu(t) {
    const rows = this.rows, done = () => closeOverlay(props().overlay), now = Date.now();
    const peek = (k) => { done(); run("terminal.peek", { terminal: k.address }); };
    // T3's text-2xs with tabular figures: the time in monospace children, one per part, as the Inbox's pill.
    const mono = settings()?.font_family ?? "JetBrains Mono";
    // No status_ms means unchanged since creation, for working and idle alike.
    const since = (k) => k.status_ms || k.created_ms || 0;
    // As tall as it is: the popup opens with no height, so it grows and shrinks as sub-agents come and go.
    return v_flex().id("pane-kids").w_full().min_h(0).p(4).bg(t.popover).text_size(14)
      .track_focus(this.keys).on_key_down((e, cx) => {
        if (e.key === "enter") { if (rows[this.at]) peek(rows[this.at].k); }
        else if (e.key === "escape") done();
        else if (e.key === "left" || e.key === "right") this.foldKid(rows[this.at], e.key === "left");
        else {
          const to = menuJump(this, e, this.labels, this.at);
          if (to < 0) return;
          this.at = to;
        }
        cx.stop_propagation();
        cx.notify();
      })
      .child(scrollList(this, "pane-kids-list", { count: rows.length, row: KIDS_ROW, height: Math.min(rows.length, KIDS_SHOWN) * KIDS_ROW, at: this.at,
        wheeled: (keep) => { if (keep >= 0) this.at = keep; },
        draw: (i) => {
          const r = rows[i], { k, depth, st } = r;
          // The menus' row: 8 in, 8 between, radius 4, lit with the selection; a level steps in by the icon's 16.
          return h_flex().id(`kid-${k.address}`).relative().h(KIDS_ROW).pl(8 + depth * 16).pr(8).gap(8).rounded(4).items_center().flex_none()
            .text_color(t.foreground).when(i === this.at, (el) => el.bg(t.selected))
            .role("button").cursor_pointer().accessibility_label(WORD[st] ? `${kidName(k)}, ${WORD[st]}` : kidName(k))
            .on_hover((on, cx) => {
              if (on && this.at !== i) { this.at = i; cx.notify(); }
            })
            .on_mouse_down("right", (_e, cx) => { done(); openMenu(this, "agent", { address: k.address }, cx); })
            .on_click(() => peek(k))
            // Grow the icon group to the right only: icon16 + gap4 + fold12, the program stays at its original x.
            .child(div().w(32).h(16).mx(-2).flex_none().relative().flex().items_center()
              .child(programIcon(k.program, 16, t.muted) ?? svg("mods/workspace-chrome/terminal.svg").size(16).flex_none().text_color(t.muted))
              .when(r.children, (el) => el.child(div().id(`kid-fold-${k.address}`).absolute().left(20).top(2).size(12).role("button")
                .accessibility_label(this.folded.has(k.address) ? "Expand sub-agents" : "Collapse sub-agents")
                .on_click((_e, cx) => { cx.stop_propagation(); this.foldKid(r, !this.folded.has(k.address)); cx.notify(); })
                .child(svg(`mods/t3-pane/icons/${this.folded.has(k.address) ? "chevron-right" : "chevron-down"}.svg`).size(12).text_color(t.dim)))))
            .child(div().flex_1().min_w(0).truncate().child(kidName(k)))
            // T3's shortcut column, one fixed status group. Its width fits Needs you at 12px without squeezing the icon.
            .child(h_flex().id(`kid-status-${k.address}`).w(96).flex_none().gap(4).items_center().justify_end().text_size(12).font_medium().text_color(t.dim)
              .role("status").accessibility_label(WORD[st] ?? "Unknown")
              .when(st === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
              .when(st === "blocked" || st === "error", (el) => el.text_color(st === "error" ? t.ansi1 : t.blocked).child(div().size(12).flex_none().rounded(4).when(st === "blocked", (badge) => badge.bg(t.blocked + "26")).text_size(10).font_bold().flex().items_center().justify_center().child("!")).child(WORD[st]))
              .when(st === "done", (el) => el.child(div().size(6).flex_none().rounded_full().bg(t.done)))
              .when((st === "working" || st === "idle") && since(k) > 0, (el) => el.children(took(since(k), now).split(" ").map((part) => div().font_family(mono).child(part)))));
        } }));
  }

  // How many sub-agents, all the way down, or how many need the person, as T3's details meta button; a click opens their list under it.
  kidsButton(t, pane, terminal) {
    const rows = kidRows(terminal);
    const id = `ph-kids-${pane}`, n = rows.length, stuck = rows.filter((r) => r.st === "blocked" || r.st === "error").length;
    const total = plural(n, "sub-agent", "sub-agents"), text = String(n);
    const label = stuck ? `${total}, ${stuck} need${stuck === 1 ? "s" : ""} you` : total;
    return tip(this, t, id, label, stop(this, t, id, drawButton(t, id, {
      text, label, surface: "card", color: stuck ? t.blocked : undefined, hot: this.hot === id })
      .on_hover(glow(this, id))
      .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); pressed(this); this.kidsFrom = e.bounds; })
      .on_click((_e, cx) => {
        cx.stop_propagation();
        const b = this.kidsFrom, z = Number(settings()?.zoom) || 1;
        this.kidsFrom = null;
        if (justClosed(this, KIDS_CLOSED)) return;
        this.hot = null; // The list covers it, before the pointer can report leaving it.
        // Hung from the button, right edges together, as the agents list's sort menu; no press (the keyboard), the app's default.
        openOverlay({ mod: "t3-pane", kind: "popup", width: KIDS_WIDTH,
          ...(b ? { at: { x: b.x + b.width - KIDS_WIDTH * z, y: b.y + b.height + 4 * z } } : {}), props: { kids: terminal } });
        cx.notify();
      })
      .child(svg("mods/t3-pane/icons/chevron-down.svg").size(14).flex_none()), radiusOf("xs")));
  }

  // What shows on hover also watches where the pointer is: its leave can be dropped (tip.js).
  headHover(on, cx) {
    this.hovered = on;
    this.box = null;
    this.hoverWatch?.cancel();
    if (on) {
      const from = pointerAt();
      this.hoverWatch = cx.timer.every(POINTER_WATCH, (cx) => {
        if (!pointerGone(this.box, from)) return;
        this.hoverWatch.cancel();
        this.hovered = false;
        cx.notify();
      });
    }
    cx.notify();
  }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, label, action, key) {
    return tip(this, t, id, label, stop(this, t, id, drawButton(t, id, { icon, label, surface: "card", hot: this.hot === id })
      .on_hover(glow(this, id))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        action();
        cx.notify();
      }), radiusOf("xs")), { action: key });
  }

  render() {
    const t = theme();
    if (props()?.kids) return this.kidsMenu(t);
    const p = this.me();
    // Home has no header, mod or shell (docs/adr/0005): nothing to split, zoom or close, and the brand bar's lit mark tells where this is.
    if (!p || spaces().find((s) => s.id === shared(KEY.home))?.tabs.some((c) => c.id === p.tab)) return div();
    const named = namer()(p);
    const pic = programIcon(programOf(p), 14, t.muted);
    // A name that is only the program's says what its icon already does.
    // With the Inbox the bar's breadcrumb names the agent in view: an agent's pane shown alone (its tab's only one, or zoomed)
    // doesn't say it again. Split, the names tell the panes apart.
    const alone = p.zoomed || panes().filter((q) => q.tab === p.tab).length === 1;
    const inbox = sidebarParts(layout()).stack?.active === "inbox";
    const crumbed = alone && inbox && agents().some((a) => a.address === p.terminal);
    const name = crumbed || (!p.mod && pic && named === p.program?.name) ? "" : named;
    // Split, the panes beside the focused one recede, as T3's split terminals do, with no ring: their icon, name and folder a
    // step down, back up while hovered. Its status mark (what needs the person) and its buttons stay as they are.
    const quiet = !alone && !p.focused && !this.hovered;
    // Its agent with the sub-agents it started (tree.js).
    const all = terminals();
    const kids = subAgents(agents(), all)(p.terminal);
    const st = p.mod ? modStatus(p) : treeStatus(ownStatus(p.status, p.terminal, all), kids);
    // Put away, it's no news (no done dot, in either mode). With the Inbox chosen the header says so, as its Inbox row does
    // (docs/adr/0002): a snooze with its clock and time left, else Settle's check. At work or needing the person, that shows first.
    const k = p.terminal && all.find((x) => x.address === p.terminal);
    const away = !p.mod && st !== "working" && st !== "blocked" && notNews(k, p.status, kids);
    const now = Date.now(), nap = away && Number(k.labels?.snoozed) > now ? Number(k.labels.snoozed) : 0;
    this.napping = inbox && nap > 0;
    const pane = p.pane;
    // A mark takes the last button's 24px, so it, the × and the tab bar's + share one column: this header's pr(2), the frame's 2 and the block's 8 are the bar's 12.
    const slot = (mark) => div().min_w(24).flex_none().flex().items_center().justify_center().child(mark);
    // The buttons show with the keyboard on the header or one of them, as they do hovered: the header's the stop that gets there.
    const head = `pane-head-${pane}`, tools = ["r", "d", "z", "x"].map((k) => `ph-${k}-${pane}`);
    // The rounded frame paints the background; rectangular child fills would cover its corners.
    return focusRoot(this, stop(this, t, head, h_flex()
      .id(head)
      .size_full()
      // 4 + the frame's 2 is a tab's 6: with its 16px slot and 2 to the name, the icon and first word stand under the first tab's.
      .pl(4)
      .pr(2)
      .gap(6)
      .items_center()
      .text_size(14)
      .on_hover((on, cx) => this.headHover(on, cx))
      .on_mouse_move((e) => { pointerMoved(e.position); this.box = e.bounds; })
      .on_click(() => run("pane.focus", { pane }))
      // The terminal's own right-click menu (the layout's terminal_menu), whose Copy address gives the address.
      .on_mouse_down("right", (_e, cx) => openMenu(this, "pane", { pane, terminal: p.terminal }, cx))
      .child(div().id(`ph-icon-${pane}`).size(16).mr(-4).flex_none().flex().items_center().justify_center().when(quiet, (el) => el.opacity(0.5)).when(Boolean(pic), (el) => el.child(pic)))
      .when(Boolean(name), (el) => el.child(div().id(`ph-name-${pane}`).min_w(0).truncate().font_medium().text_color(p.focused ? t.foreground : t.muted).when(quiet, (e) => e.opacity(0.5)).child(name)))
      .child(div().relative().flex_1().min_w(0).h_full().ml(6).flex().items_center()
        .child(div().id(`ph-folder-${pane}`).flex_1().min_w(0).truncate().pr(12).text_color(t.dim).when(quiet, (el) => el.opacity(0.5)).child(folder(p.cwd)))
        // Over the folder's end, so hovering moves nothing else, as in the agents list and the inbox.
        .when(this.hovered || within(this, [head, ...tools]), el => el.child(h_flex().absolute().top(0).bottom(0).right(0).pl(12).flex_none().gap(4).items_center().bg(t.background)
          .child(this.button(t, `ph-r-${pane}`, "mods/t3-pane/icons/square-split-horizontal.svg", "Split right", () => run("pane.split", { direction: "right", pane }), "pane.split:right"))
          .child(this.button(t, `ph-d-${pane}`, "mods/t3-pane/icons/square-split-vertical.svg", "Split down", () => run("pane.split", { direction: "down", pane }), "pane.split:down"))
          .child(this.button(t, `ph-z-${pane}`, `mods/t3-pane/icons/${p.zoomed ? "minimize-2" : "maximize-2"}.svg`, p.zoomed ? "Unzoom pane" : "Zoom pane", () => run("pane.zoom", { pane }), "pane.zoom"))
          .child(this.button(t, `ph-x-${pane}`, "mods/t3-pane/icons/x.svg", "Close pane", () => { this.hot = null; run(`t3-tabs.close-pane:${pane}`); }, "pane.close")))))
      .when(Boolean(p.terminal && kids.length), (el) => el.child(this.kidsButton(t, pane, p.terminal)))
      .when(st === "working" && !kids.length, el => el.child(slot(tipMark(this, t, `ph-mark-${pane}`, "Working", svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))))
      // The same marks as the agents list and tabs.
      .when(st === "blocked" && !kids.length, el => el.child(slot(tipMark(this, t, `ph-mark-${pane}`, "Needs you", div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(11).font_bold().text_color(t.blocked).flex().items_center().justify_center().accessibility_label("Needs you").child("!")))))
      .when(inbox && away, el => el.child(slot(nap
        ? tipMark(this, t, `ph-mark-${pane}`, "Snoozed", h_flex().gap(4).items_center().text_size(12).text_color(t.accent)
          .child(svg("mods/t3-pane/icons/alarm-clock.svg").size(12).flex_none().text_color(t.accent)).child(left(nap, now)))
        : tipMark(this, t, `ph-mark-${pane}`, "Settled", svg("mods/t3-pane/icons/check.svg").size(14).flex_none().text_color(t.dim)))))
      .when(st === "done" && !away, el => el.child(slot(tipMark(this, t, `ph-mark-${pane}`, "Done", div().size(6).flex_none().rounded_full().bg(t.done))))), 8));
  }
}
