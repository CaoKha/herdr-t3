// Running: live spaces and their panes in one inventory (docs/internals/specs/dialogs.md#running, ADR 0020).
// Space headers group panes without being ambiguous navigation targets; Clean up ends settled agents and idle shells.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { checking, theme, spaces, panes, agents, terminals, focused, hc, run, closeOverlay, props, window, shared, setShared } from "herdr";
import { modStatus, namer, programOf } from "./name.js";
import { focusPane } from "./zoom.js";
import { notNews, ownStatus, stillSettled, subAgents, treeStatus } from "./tree.js";
import { statusMark } from "./status-mark.js";
import { projectMark } from "./project.js";
import { programIcon } from "./program.js";
import { step, scrollList } from "./list.js";
import { stopsInit, stopsEnd, stop, focusRoot } from "./focus.js";
import { ghostButton, radiusOf, DISABLED } from "./button.js";
import { tip } from "./tip.js";
import { openMenu } from "./menu.js";
import { KEY, closedKey } from "./store.js";
import { footAction, paletteFooter } from "./palette.js";

const ROW = 36;
const LIST_MAX = 420 - 2 - 48 - 8 - 8 - 41;
const HOME_NAME = "Home\u200b";
const SHELL = /^-?(zsh|bash|fish|sh|dash|ksh|tcsh|nu)$/;

const isHome = (s, homeId) => s.id === homeId || (s.machine === null && s.named && s.name === HOME_NAME);

export default class Running extends View {
  init(_props, cx) {
    stopsInit(this, cx, "modal");
    this.selection = null;
    this.filter = "";
    this.hot = null;
    this.hotSpace = null;
    this.hotPane = null;
    // Only this run's open popup: probed non-agent terminals and those resting at their own shell prompt.
    this.probed = new Set();
    this.idleShells = new Set();
    this.input = InputState.new({ placeholder: "Search running spaces and terminals…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.selection = null; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.choose(this.selection, this.selection?.pane, cx));
    this.input.focus();
    this.probeIdle(cx);
  }

  close() {
    stopsEnd(this);
    setShared(closedKey("t3-running"), Date.now());
  }

  probeIdle(cx) {
    if (checking()) return;
    const sp = spaces(), ps = panes(), ags = agents(), all = terminals(), homeId = shared(KEY.home);
    const kids = subAgents(ags, all), agentSet = new Set(ags.map((a) => a.address));
    const openTabs = new Set(sp.filter((s) => !isHome(s, homeId)).flatMap((s) => (s.tabs ?? []).map((c) => c.id)));
    const todo = [];
    for (const p of ps) {
      if (!p.terminal || !openTabs.has(p.tab) || this.probed.has(p.terminal)) continue;
      if (agentSet.has(p.terminal) || programOf(p)?.agent || kids(p.terminal).length > 0) continue;
      this.probed.add(p.terminal);
      todo.push(p.terminal);
    }
    if (!todo.length) return;
    cx.spawn(async (cx) => {
      let changed = false;
      await Promise.all(todo.map(async (addr) => {
        try {
          const k = JSON.parse((await hc(["get", addr, "--json"])).stdout);
          if (k.foreground?.pid === k.pid && SHELL.test(k.foreground.name)) {
            this.idleShells.add(addr);
            changed = true;
          }
        } catch {}
      }));
      if (changed) cx.notify();
    });
  }

  snapshot() {
    const q = this.filter.trim().toLowerCase();
    const sp = spaces(), ps = panes(), ags = agents(), all = terminals(), f = focused(), homeId = shared(KEY.home);
    const name = namer(), kids = subAgents(ags, all);
    const byAddress = new Map(all.map((k) => [k.address, k]));
    const agentByAddress = new Map(ags.map((a) => [a.address, a]));
    const activeSpace = sp.find((s) => s.active);
    const tabNow = f?.tab ?? activeSpace?.tabs.find((c) => c.active)?.id;
    const mine = activeSpace?.machine ?? null;
    const rank = (s) => (s.active ? 0 : (s.machine ?? null) === mine ? 1 : 2);
    const orderedSpaces = sp.filter((s) => !isHome(s, homeId))
      .sort((a, b) => rank(a) - rank(b) || (a.machine ?? "").localeCompare(b.machine ?? ""));

    let cleanCount = 0, unprobed = false;
    const rows = [], paneRows = [];
    const now = Date.now();

    for (const s of orderedSpaces) {
      const sWords = [s.name, s.machine ?? "", (s.folder ?? "").split(/[\\/]/).pop() ?? ""].join(" ").toLowerCase();
      const spaceMatches = !q || sWords.includes(q);
      const groupPanes = [];
      for (const c of s.tabs ?? []) {
        for (const p of ps.filter((x) => x.tab === c.id)) {
          const under = p.terminal ? kids(p.terminal) : [];
          const a = p.terminal ? agentByAddress.get(p.terminal) : undefined;
          const k = p.terminal ? byAddress.get(p.terminal) : undefined;
          const topAgent = Boolean(a && !k?.parent);
          const own = p.mod ? modStatus(p) : ownStatus(a?.status ?? p.status, p.terminal, all);
          const settled = Boolean(topAgent && k && stillSettled(k, own, under));
          const snoozed = Boolean(topAgent && Number(k?.labels?.snoozed) > now && own !== "blocked" && !under.some((u) => u.status === "blocked"));
          const nonAgent = Boolean(p.terminal && !a && !programOf(p)?.agent && under.length === 0);
          if (nonAgent && !this.probed.has(p.terminal)) unprobed = true;
          const idleShell = Boolean(nonAgent && this.idleShells.has(p.terminal));
          if (c.id !== tabNow && (settled || idleShell)) cleanCount++;

          const label = name(p), program = programOf(p);
          const pWords = [c.named ? c.name : "", label, program?.name ?? "", p.program?.key ?? "", (p.cwd ?? "").split(/[\\/]/).pop() ?? ""].join(" ").toLowerCase();
          if (spaceMatches || pWords.includes(q)) {
            groupPanes.push({
              kind: "pane", key: `pane:${p.pane}`, p, s, c, label, program, under, topAgent,
              here: Boolean(s.active && c.active && p.focused),
              status: p.mod ? modStatus(p) : treeStatus(own, under),
              settled, snoozed, idleShell, k,
            });
          }
        }
      }
      if (groupPanes.length > 0) {
        rows.push({ kind: "space", key: `space:${s.id}`, s, count: groupPanes.length });
        for (const gp of groupPanes) {
          paneRows.push(gp);
          rows.push(gp);
        }
      }
    }
    return { ps, rows, paneRows, cleanCount, unprobed };
  }

  choose(selection, pane, cx, closing = false) {
    if (!pane || this.selection !== selection) return;
    if (!this.snapshot().paneRows.some((item) => item.p.pane === pane)) {
      if (selection.pane === pane) selection.pane = null;
      cx.notify();
      return;
    }
    closeOverlay(props().overlay);
    if (closing) run(`t3-tabs.close-pane:${pane}`);
    else focusPane(pane);
  }

  drawSpaceRow(item, ps, t) {
    const { s, count } = item, showClose = this.hotSpace === s.id || this.hot === `close-space-${s.id}`;
    const closeId = `close-space-${s.id}`;
    return h_flex().id(item.key).w_full().h(ROW).px(8).gap(8).rounded(4).items_center().flex_none()
      .on_hover((over, cx) => {
        const next = over ? s.id : this.hotSpace === s.id ? null : this.hotSpace;
        if (next !== this.hotSpace) { this.hotSpace = next; cx.notify(); }
      })
      .on_mouse_down("right", (_e, cx) => { closeOverlay(props().overlay); openMenu(this, "space", { id: s.id }, cx); })
      .child(projectMark("mods/t3-running", s, 16, t, ps, true))
      .child(div().min_w(0).truncate().font_medium().text_color(t.foreground).child(s.name))
      .when(Boolean(s.machine), (el) => el.child(h_flex().flex_none().gap(4).items_center().text_size(12).text_color(t.muted)
        .child(svg("mods/t3-running/icons/server.svg").size(12).flex_none().text_color(t.muted))
        .child(s.machine)))
      .child(div().flex_1())
      .child(h_flex().min_w(20).flex_none().justify_end().items_center()
        .when(!showClose, (el) => el.child(div().text_size(12).text_color(t.dim).child(String(count))))
        .when(showClose, (el) => el.child(tip(this, t, closeId, "Close space",
          stop(this, t, closeId, ghostButton(this, t, closeId, {
            size: "micro", surface: "card", icon: "mods/t3-running/icons/x.svg", label: `Close space ${s.name}`,
            act: () => { closeOverlay(props().overlay); run("space.close", { id: s.id }); },
          }), radiusOf("micro"))))));
  }

  drawPaneRow(item, selection, t) {
    const pane = item.p.pane, on = selection.pane === pane, st = item.status;
    const closeId = `close-pane-${pane}`, showClose = this.hotPane === pane || this.hot === closeId;
    const mark = item.settled
      ? svg("mods/t3-running/icons/check.svg").size(14).flex_none().text_color(t.dim)
      : item.snoozed
        ? svg("mods/t3-running/icons/alarm-clock.svg").size(12).flex_none().text_color(t.accent)
        : st === "done" && notNews(item.k, item.p.status, item.under)
          ? null
          : statusMark(t, st, 14);
    return h_flex().id(item.key).w_full().h(ROW).pl(24).pr(8).gap(8).rounded(4).items_center().flex_none().cursor_pointer()
      .role("button").accessibility_label(item.label)
      .when(on, (el) => el.bg(t.selected))
      .on_hover((over, cx) => {
        this.hotPane = over ? pane : this.hotPane === pane ? null : this.hotPane;
        if (over && this.selection === selection && selection.pane !== pane) selection.pane = pane;
        cx.notify();
      })
      .on_click((_e, cx) => this.choose(selection, pane, cx))
      .on_mouse_down("right", (_e, cx) => {
        closeOverlay(props().overlay);
        if (item.topAgent) openMenu(this, "agent", { address: item.p.terminal }, cx);
        else openMenu(this, "pane", { pane, terminal: item.p.terminal }, cx);
      })
      .child(programIcon(item.program, 14, t.muted) ?? svg("mods/t3-running/icons/terminal.svg").size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).when(Boolean(item.here), (d) => d.font_medium()).child(item.label))
      .child(h_flex().min_w(20).flex_none().justify_end().items_center()
        .when(!showClose && Boolean(mark), (el) => el.child(mark))
        .when(!showClose && !mark && item.idleShell, (el) => el.child(div().text_size(12).text_color(t.dim).child("Idle")))
        .when(showClose, (el) => el.child(tip(this, t, closeId, "Close pane",
          stop(this, t, closeId, ghostButton(this, t, closeId, {
            size: "micro", surface: "card", icon: "mods/t3-running/icons/x.svg", label: `Close ${item.label}`,
            act: (cx) => this.choose(selection, pane, cx, true),
          }), radiusOf("micro"))))));
  }

  render(cx) {
    const t = theme(), { ps, rows, paneRows, cleanCount, unprobed } = this.snapshot();
    if (unprobed && !checking() && cx?.timer) cx.timer.after(0, (cx) => this.probeIdle(cx));
    const selection = this.selection ??= { pane: undefined };
    if (selection.pane === undefined) selection.pane = paneRows[0]?.p.pane;
    const paneIdx = paneRows.findIndex((item) => item.p.pane === selection.pane);
    if (paneIdx < 0 && selection.pane !== undefined) selection.pane = null;
    const rowAt = selection.pane ? rows.findIndex((r) => r.kind === "pane" && r.p.pane === selection.pane) : -1;
    // Scroll the group's space header into view when the first pane under it is highlighted at the top.
    const scrollAt = rowAt > 0 && rows[rowAt - 1]?.kind === "space" && paneIdx === 0 ? 0 : rowAt;

    const cleanAction = cleanCount > 0
      ? stop(this, t, "running-cleanup", footAction(t, "running-cleanup", `Clean up ${cleanCount} idle terminal${cleanCount === 1 ? "" : "s"}`)
        .cursor_pointer()
        .on_click(() => { closeOverlay(props().overlay); run("t3-tabs.cleanup"); })
        .child(`Clean up (${cleanCount})`), 8)
      : footAction(t, "running-cleanup", "Clean up idle terminals").opacity(DISABLED).child("Clean up");

    return focusRoot(this, v_flex().id("running").size_full().min_h(0).rounded(16).border(1).border_color(t.border).bg(t.popover).shadow_2xl().text_size(14).line_height("20px")
      .on_key_down((e, cx) => {
        if (e.key === "escape") return closeOverlay(props().overlay);
        if (this.selection !== selection) return;
        const to = step(e, paneIdx, paneRows.length);
        if (to >= 0) selection.pane = paneRows[to].p.pane;
        else if (e.key === "d" && e.modifiers.control) this.choose(selection, selection.pane, cx, true);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().h(36).my(6).flex_none().pl(18).pr(20).gap(7).items_center()
        .child(svg("mods/t3-running/icons/search.svg").size(16).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(14).text_color(t.foreground)))
      .child(div().flex_none().mt(8).mb(8).px(8)
        .when(rows.length > 0, (el) => el.child(scrollList(this, "running-rows", {
          count: rows.length, row: ROW, at: scrollAt, height: Math.min(rows.length * ROW, LIST_MAX),
          draw: (i) => rows[i].kind === "space" ? this.drawSpaceRow(rows[i], ps, t) : this.drawPaneRow(rows[i], selection, t),
          wheeled: (keep) => {
            if (this.selection !== selection || keep < 0) return;
            const hit = rows[keep]?.kind === "pane" ? rows[keep] : rows.slice(keep).find((r) => r.kind === "pane");
            selection.pane = hit?.p.pane ?? null;
          },
        })))
        .when(rows.length === 0, (el) => el.child(div().py(40).text_center().text_color(t.dim).child(this.filter.trim() ? "No matching running spaces or terminals." : "No running spaces."))))
      .child(paletteFooter(t, [["↑ ↓", "Navigate"], ["Enter", "Go"], [window()?.platform === "macos" ? "⌃D" : "Ctrl+D", "Close pane"], ["Esc", "Close"]], cleanAction)));
  }
}
