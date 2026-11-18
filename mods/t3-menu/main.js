// Context menus, one per thing (docs/internals/specs/menus.md). Opened as a popup with
// props { tab: "pane" | "tab" | "space" | "space-switch" | "agent" | "snooze" | "checkout" | "machine", target }: which thing, not what it offers.
// The agent's Snooze opens its times beside it, as T3's MenuSub (docs/internals/specs/menus.md#submenus): a second popup with
// props { tab: "snooze", target, parents, lit }, `parents` the menus it hangs off, `lit` the row lit when keys opened it.
// ↑/↓, Home, End and typeahead move, Enter runs, Esc closes. An item is [label, command, args, hint, group];
// a command "worktree" opens the worktree dialog instead.
// t3-menu: Herdr's menu (mod.clone), with a tab's and a pane's Close going through the tab bar (t3-tabs), which asks first
// while a program runs and leaves first, so Herdr's pick of a neighbour never shows. Beyond the shipped one: T3's measures and
// groups, the list's moves (shared/list.js, the one way every popup's list moves), Copy address and path, close()'s stamp,
// the breadcrumb space switcher, and the agent's, a checkout's and a machine's menus with the Snooze times.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { checking, run, props, openOverlay, closeOverlay, theme, keys, terminals, agents, spaces, panes, focused, exec, setShared, layout, settings } from "herdr";
import { menuKeys, scrollList, propsLit } from "./list.js";
import { menuRow, menuRule, menuHint, MENU_ROW } from "./menu-row.js";
import { hoverRow, subLeft } from "./submenu.js";
import { openBeside, closeSub, subGone, closeChain, menuClosed } from "./popup-menu.js";
import { placeOf } from "./project.js";
import { presets } from "./snooze-presets.js";
import { kidStatus, kidTree, notNews, ownStatus, stillSettled, subAgents, treeStatus } from "./tree.js";
import { namer, programOf } from "./name.js";
import { programIcon } from "./program.js";
import { statusMark } from "./status-mark.js";
import { alpha } from "./color.js";
import { focusAgent, focusPane } from "./zoom.js";
import { pinList } from "./pins.js";
import { sidebarParts } from "./sidebar.js";
import { closedKey } from "./store.js";
import { keyLabel } from "./tip.js";

// What a submenu's close() stamps, for the menu it hangs off (popup-menu.js subGone).
const SUB_CLOSED = closedKey("t3-menu", "submenu");
const SPACE_CLOSED = closedKey("t3-menu", "space");

// A menu's measures, as T3's: 220 wide, padding 4, rows 28, a rule 9 (4 above and below it).
// The space switcher matches the sub-agent list's 280 width and 10-row scroll cap so names, durations and marks fit cleanly.
const WIDTH = 220, PAD = 4, ROW = 28, RULE = 9, SPACE_SHOWN = 10;
// Where row `i` starts below the menu's top, its rules included.
const rowTop = (list, i) => PAD + i * ROW + list.slice(1, i + 1).filter((it, j) => it[4] !== list[j][4]).length * RULE;

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

// A space's checkout: "main" (a repo's own), "linked" (a worktree), or null.
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return null;
  return common.stdout.trim() === `${top.stdout.trim()}/.git` ? "main" : "linked";
}

// The nearest live agent above `address`, through what isn't one (a shell between them), as the tab bar reads it.
function above(address, all, every) {
  const byAddress = new Map(all.map((k) => [k.address, k])), seen = new Set();
  let k = byAddress.get(byAddress.get(address)?.parent);
  while (k?.state === "live" && !seen.has(k.address)) {
    const a = every.find((x) => x.address === k.address);
    if (a) return a;
    seen.add(k.address);
    k = byAddress.get(k.parent);
  }
  return null;
}

// An agent's menu, wherever it's right-clicked (an Inbox card, an Agents row, the tab bar's title): what it can do now, as
// T3's thread actions. Settle and Snooze are the Inbox's (docs/adr/0002): with Lists chosen they aren't offered.
function agentItems(address) {
  const all = terminals(), every = agents(), k = all.find((t) => t.address === address), a = every.find((x) => x.address === address);
  if (!k) return [];
  const inbox = sidebarParts(layout()).stack?.active !== "lists";
  const kids = subAgents(every, all)(address), own = ownStatus(a?.status, address, all);
  const busy = [own, ...kids].some((s) => s === "working" || s === "blocked");
  const parent = k.parent && all.find((t) => t.address === k.parent);
  const head = a && above(address, all, every);
  // Rename names the tab: only for its lone agent, whose name the tab's would be, and not when Pi names it (name.js).
  const heads = a ? every.filter((x) => x.tab === a.tab && above(x.address, all, every)?.tab !== a.tab) : [];
  const rename = heads.length === 1 && heads[0] === a && !k.labels?.["pi.session"];
  const pinned = pinList().includes(address), napping = Number(k.labels?.snoozed) > Date.now();
  // The settle key acts on the agent in view, so its key shows only there.
  const inView = every.find((x) => x.focused)?.address === address;
  return grouped(
    [
      ...(a && !head ? [[pinned ? "Unpin" : "Pin", `t3-tabs.${pinned ? "unpin" : "pin"}:${address}`, {}]] : []),
      ...(inbox && a && !busy ? [[stillSettled(k, own, kids) ? "Un-settle" : "Settle", `t3-tabs.settle:${address}`, {}, inView ? shortcut("t3-tabs.settle") : ""]] : []),
      ...(inbox && a ? napping ? [["Wake", `t3-tabs.wake:${address}`, {}]] : treeStatus(own, kids) !== "blocked" ? [["Snooze", "snooze", { address }]] : [] : []),
    ],
    [
      ...(rename ? [["Rename", "tab.rename", { id: a.tab }]] : []),
      ["Copy address", "copy", { text: address }],
      ...(parent ? [[`Send back to ${parent.name || parent.address}`, "terminal.park", { terminal: address }]] : []),
    ],
    a ? [["Close", "pane.close", { pane: a.pane }]] : [],
  );
}

// Groups in T3's order (where to, state, names and copies, worktrees, ending), a rule between two that show. An item is
// [label, command, args, hint, group]; a hint of "" shows none.
const grouped = (...groups) => groups.flatMap((g, n) => g.map((it) => [it[0], it[1], it[2], it[3], n]));

function items(p, git) {
  p = p ?? {};
  const tg = p.target ?? {};
  switch (p.tab) {
    case "pane": {
      // A kept sub-agent can go back under its parent, still running.
      const all = terminals();
      const term = all.find((t) => t.address === tg.terminal);
      const parent = term?.parent && all.find((t) => t.address === term.parent);
      // Once they go to the program, Shift+right-click still opens this menu.
      const toProgram = term?.labels?.["herdr.right-click"] === "program";
      // A terminal shown outside a tab (a layout terminal block, a window) has
      // no pane to split, zoom or close: its pane is the block's id.
      const inTab = panes().some((pane) => pane.pane === tg.pane);
      return grouped(
        inTab
          ? [
              ["Split right", "pane.split", { direction: "right", pane: tg.pane }],
              ["Split down", "pane.split", { direction: "down", pane: tg.pane }],
              ["Zoom", "pane.zoom", { pane: tg.pane }],
            ]
          : [],
        [
          ...(term ? [["Copy address", "copy", { text: term.address }]] : []),
          ...(term
            ? [
                toProgram
                  ? ["Use Herdr right-click menu", "terminal.right_click", { terminal: term.address, to: "menu" }]
                  : ["Send right-clicks to pane", "terminal.right_click", { terminal: term.address, to: "program" }],
              ]
            : []),
          ...(parent ? [[`Send back to ${parent.name || parent.address}`, "terminal.park", { terminal: term.address }]] : []),
        ],
        inTab ? [["Close pane", "pane.close", { pane: tg.pane }]] : [],
      );
    }
    case "tab": {
      // Where its space is now, as the space's mark and folder say; with no space named, tab.new takes the active one.
      const sp = spaces().find((s) => (tg.space ? s.id === tg.space : s.active));
      return grouped(
        [["New tab", "tab.new", { space: tg.space, folder: sp && placeOf(sp, panes()) }]],
        [["Rename", "tab.rename", { id: tg.id }]],
        [["Close", "tab.close", { id: tg.id }]],
      );
    }
    case "agent":
      return agentItems(tg.address);
    // Its Snooze: the card's times, when each wakes on the right, then Custom (the Inbox's dialog).
    case "snooze":
      return grouped(presets(Date.now()).map((p) => [p.label, `t3-tabs.snooze:${tg.address}:${p.at}`, {}, p.when]), [["Custom…", "custom-snooze", { address: tg.address }]]);
    case "space": {
      const s = spaces().find((s) => s.id === tg.id);
      const folder = s && place(s);
      return grouped(
        [["New tab", "tab.new", { space: tg.id, folder }]],
        [["Rename", "space.rename", { id: tg.id }], ...(folder ? [["Copy path", "copy", { text: folder }]] : [])],
        git ? [["New worktree", "worktree", { space: tg.id, action: "new" }], ["Open worktree", "worktree", { space: tg.id, action: "open" }]] : [],
        [...(git === "linked" ? [["Remove worktree", "worktree", { space: tg.id, action: "remove" }]] : []), ["Close", "space.close", { id: tg.id }]],
      );
    }
    // A repo's checkout with no space open: the dim row in Spaces, as T3's project folder (New thread, Copy path).
    case "checkout":
      return grouped([["Open", "space.new", { folder: tg.folder, machine: tg.machine ?? "" }]], [["Copy path", "copy", { text: tg.folder }]]);
    // A machine's heading in Spaces: its + and, when its core was rebuilt, its Connect.
    case "machine":
      return grouped([
        ...(tg.connected ? [["New space here", "space.new", { machine: tg.machine ?? "" }]] : []),
        ...(tg.connect ? [["Connect", `t3-spaces.reconnect:${tg.machine}`, {}]] : []),
      ]);
    default:
      return [];
  }
}

// Every icon is this mod's own, Lucide's at the layout's 1.75 (t3-tokens P4; check-menu.cjs reads each). Null: a Snooze
// time, drawn as the card's menu draws them, with none.
function menuIcon(command, label, args) {
  if (command.startsWith("t3-tabs.snooze:") || command === "custom-snooze") return null;
  const name = command === "copy" ? "copy" : command.startsWith("t3-tabs.settle") ? (label === "Settle" ? "check" : "undo") : command.startsWith("t3-tabs.pin:") ? "pin"
    : command.startsWith("t3-tabs.unpin:") ? "pin-off" : command === "snooze" ? "alarm-clock" : command.startsWith("t3-tabs.wake:") ? "alarm-clock-off"
    : command.endsWith(".close") ? "x" : command.endsWith(".rename") ? "square-pen" : command === "space.new" && args?.folder ? "folder"
    : command.endsWith(".new") ? "plus" : command === "worktree" ? (args?.action === "remove" ? "x" : "git-branch") : command.startsWith("t3-spaces.reconnect:") ? "server"
    : command === "pane.split" ? (args?.direction === "down" ? "panel-bottom" : "panel-right") : command === "pane.zoom" ? "square" : "terminal";
  return `mods/t3-menu/icons/${name}.svg`;
}

// The key bound to a command, for the hint on the right, written as tooltips and New write keys (tip.js keyLabel): ⇧⌘D.
function shortcut(name, args) {
  // `pane.split:right` binds pane.split with { direction: "right" }.
  const value = args && Object.values(args)[0];
  // A layout's own keys too: Settle's is the herdr-t3 layout's.
  const k = keys().find((b) => (b.section === "global" || b.section?.startsWith("layout:")) && (b.action === name || b.action === `${name}:${value}`));
  return k ? keyLabel(k.keys) : "";
}

// How long an agent has been working, as t3-pane's sub-agent menu: 9s, 4m, 1h 5m.
function took(ms, now) {
  const s = Math.max(0, Math.floor((now - ms) / 1000)), m = Math.floor(s / 60);
  return s < 60 ? `${s}s` : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Agents (top-level in tab order, each with nested sub-agents via kidTree) then non-agent terminal panes in `spaceId`.
function spaceSwitchEntries(spaceId) {
  const space = spaces().find((s) => s.id === spaceId);
  if (!space) return [];
  const tabs = space.tabs ?? [];
  const all = terminals(), every = agents(), ps = panes(), f = focused(), name = namer();
  const byAddress = new Map(all.map((k) => [k.address, k]));
  const listed = new Map(every.map((a) => [a.address, a.status]));
  const under = subAgents(every, all);
  const spaceAgents = tabs.flatMap((c) => every.filter((a) => a.tab === c.id));
  const spaceAgentMap = new Map(spaceAgents.map((a) => [a.address, a]));
  const inbox = sidebarParts(layout()).stack?.active !== "lists";
  const now = Date.now(), entries = [], seen = new Set();

  const agentHere = (a, address) => Boolean(f?.pane ? a.pane === f.pane : f?.terminal ? address === f.terminal : a.focused);
  const addSub = (k, depth) => {
    if (seen.has(k.address)) return;
    seen.add(k.address);
    const paneAgent = spaceAgentMap.get(k.address);
    const label = paneAgent ? name(paneAgent) : (k.name || k.template || k.program?.name || k.address);
    const st = kidStatus(k, listed);
    const newsDone = st === "done" && (!paneAgent || !notNews(k, paneAgent.status, under(k.address)));
    const here = paneAgent ? agentHere(paneAgent, k.address) : (f?.terminal === k.address || f?.agent === k.address);
    entries.push({
      kind: "agent", id: `space-item-${k.address}`, address: k.address, pane: paneAgent?.pane ?? null,
      depth, label, program: paneAgent?.program ?? k.program, status: st, newsDone, snoozed: false,
      since: k.status_ms || k.created_ms || 0, here,
    });
  };

  for (const a of spaceAgents) {
    if (above(a.address, all, spaceAgents) || seen.has(a.address)) continue;
    seen.add(a.address);
    const k = byAddress.get(a.address), kids = under(a.address), own = ownStatus(a.status, a.address, all);
    const st = treeStatus(own, kids);
    const newsDone = st === "done" && !notNews(k, a.status, kids);
    const snoozed = inbox && st !== "working" && st !== "blocked" && Number(k?.labels?.snoozed) > now;
    entries.push({
      kind: "agent", id: `space-item-${a.address}`, address: a.address, pane: a.pane,
      depth: 0, label: name(a), program: a.program, status: st, newsDone, snoozed,
      since: k?.status_ms || k?.created_ms || 0, here: agentHere(a, a.address),
    });
    for (const sub of kidTree(all, a.address)) addSub(sub.k, sub.depth + 1);
  }

  const agentPanes = new Set(every.map((a) => a.pane).filter(Boolean));
  let firstTerm = entries.length > 0;
  for (const c of tabs) {
    const mine = ps.filter((p) => p.tab === c.id);
    for (const p of mine) {
      if (!p.terminal || agentPanes.has(p.pane)) continue;
      entries.push({
        kind: "terminal", id: `space-term-${p.pane}`, pane: p.pane, address: p.terminal,
        depth: 0, label: mine.length === 1 && c.named ? c.name : name(p), program: programOf(p),
        here: Boolean(f?.pane ? p.pane === f.pane : f?.terminal === p.terminal), firstInGroup: firstTerm,
      });
      firstTerm = false;
    }
  }
  return entries;
}

export default class Menu extends View {
  init(_props, cx) {
    // As T3's, nothing is lit until a key or the pointer gets there.
    const p = props();
    this.at = propsLit();
    this.git = null;
    // The submenu's pointer state (submenu.js), the one open { id, row }, and each row's bounds as the pointer last found it.
    this.s = {};
    this.sub = null;
    this.rowsAt = [];
    // Where it opened: the pointer, for placing a submenu keys open before the pointer has found its row.
    this.origin = globalThis.window?.mouse_position?.();
    this.keys = cx.focus_handle();
    this.keys.focus();
    if (p?.tab === "space-switch" && !checking()) this.clock = cx.timer.every(1000, (cx) => cx.notify());
    const space = p?.tab === "space" && spaces().find((s) => s.id === p.target?.id);
    const folder = space && place(space);
    if (!checking() && folder)
      cx.spawn(async (cx) => {
        this.git = await checkout(folder, space.machine).catch(() => null);
        cx.notify();
      });
  }

  // For the control that opened it: a press on it that closed this mustn't reopen it (justClosed in focus.js); for the menu
  // a submenu hangs off, that its submenu went. Its own submenu goes with it.
  async close() {
    this.clock?.cancel();
    const p = props() ?? {};
    menuClosed(p.overlay);
    const stamp = p.parents?.length ? SUB_CLOSED : p.tab === "space-switch" ? SPACE_CLOSED : closedKey("t3-menu");
    setShared(stamp, Date.now());
  }

  // Row `i`'s Snooze times beside it. `lit`: keys opened it, so its first row is lit, as Base UI's.
  openSub(i, lit) {
    const list = items(props(), this.git), it = list[i];
    const times = items({ tab: "snooze", target: it[2] }, null), h = rowTop(times, times.length) + PAD + 2;
    openBeside(this, i, it[1], { top: rowTop(list, i), width: WIDTH - 2 * PAD },
      { mod: "t3-menu", width: WIDTH, height: h, props: { tab: "snooze", target: it[2] } }, null, lit);
  }

  choose(i, cx, lit = false) {
    const it = /** @type {any} */ (items(props(), this.git)[i]);
    if (!it) return;
    // Its times, beside it: this stays open.
    if (it[1] === "snooze") return this.openSub(i, lit);
    // The whole chain closes, submenu and the menus it hangs off.
    closeChain();
    if (it[1] === "worktree") openOverlay({ mod: "worktree", kind: "dialog", ...(it[2].action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: it[2] });
    // The item keeps Herdr's command, for its icon, its divider and its key; only where it goes changes.
    else if (it[1] === "tab.close") run(`t3-tabs.close-tab:${it[2].id}`);
    else if (it[1] === "pane.close") run(`t3-tabs.close-pane:${it[2].pane}`);
    else if (it[1] === "copy") cx.write_to_clipboard(it[2].text);
    else if (it[1] === "custom-snooze") openOverlay({ mod: "t3-inbox", kind: "dialog", frame: "none", width: 384, props: { customSnooze: it[2].address, answer: "t3-tabs.snooze" } });
    else run(it[1], it[2]);
  }

  spaceSwitchView(t, p) {
    const spaceId = p.target?.id, entries = spaceSwitchEntries(spaceId), now = Date.now();
    const mono = settings()?.font_family ?? "JetBrains Mono";
    const labels = ["New tab", ...entries.map((e) => e.label)];
    const pick = (i) => {
      closeChain();
      if (i === 0) {
        const active = spaces().find((s) => s.active);
        if (active?.id === spaceId) run("t3-tabs.new");
        else { const sp = spaces().find((s) => s.id === spaceId); if (sp) run("tab.new", { space: sp.id, folder: place(sp) }); }
        return;
      }
      const entry = entries[i - 1];
      if (!entry) return;
      if (entry.kind === "agent") {
        if (entry.pane) focusAgent(entry.address);
        else run("terminal.peek", { terminal: entry.address });
      } else {
        focusPane(entry.pane);
      }
    };
    const rightClick = (entry) => (_e, cx) => {
      cx.stop_propagation();
      closeOverlay(p.overlay);
      const spec = entry.kind === "agent"
        ? { tab: "agent", target: { address: entry.address } }
        : { tab: "pane", target: { pane: entry.pane, terminal: entry.address } };
      openOverlay({ mod: "t3-menu", kind: "popup", width: WIDTH, height: 260, props: spec });
    };
    const trailOf = (entry) => {
      let mark = null;
      if (entry.kind === "agent") {
        if (entry.status === "working") {
          const time = entry.since > 0 ? h_flex().flex_none().gap(4).items_center().children(took(entry.since, now).split(" ").map((part) => menuHint(t, part).font_family(mono))) : null;
          mark = time ? h_flex().flex_none().gap(4).items_center().child(statusMark(t, "working")).child(time) : statusMark(t, "working");
        } else if (entry.status === "blocked" || entry.status === "error") {
          mark = statusMark(t, entry.status);
        } else if (entry.newsDone) {
          mark = statusMark(t, "done");
        } else if (entry.snoozed) {
          mark = svg("mods/t3-menu/icons/alarm-clock.svg").size(12).flex_none().text_color(t.accent);
        }
      }
      return mark && h_flex().flex_none().pl(10).items_center().child(mark);
    };
    const drawEntry = (j) => {
      const entry = entries[j], rowIndex = j + 1, lit = this.at === rowIndex;
      const color = entry.here || lit ? t.foreground : t.muted;
      const divider = entry.firstInGroup && !lit && this.at !== rowIndex - 1 && !entry.here && !entries[j - 1]?.here;
      return menuRow(this, t, entry.id, {
        at: [this, "at", rowIndex],
        label: entry.here ? div().min_w(0).truncate().font_medium().child(entry.label) : entry.label,
        color,
        lead: entry.depth > 0 ? div().w(entry.depth * 16 - 8).flex_none() : undefined,
        icon: programIcon(entry.program, 16, color) ?? svg("mods/t3-menu/icons/terminal.svg").size(16).flex_none().text_color(color),
        trail: trailOf(entry),
        pick: () => pick(rowIndex),
        also: (row) => row.when(entry.here, (el) => el.accessibility_label(entry.label))
          .when(entry.here && !lit, (el) => el.bg(alpha(t.foreground, "12")))
          .on_mouse_down("right", rightClick(entry))
          .when(divider, (el) => el.relative().child(div().absolute().top(0).left(8).right(8).h(1).bg(t.border))),
      });
    };
    return v_flex()
      .id("menu")
      .track_focus(this.keys)
      .w_full()
      .min_h(0)
      .p(4)
      .bg(t.popover)
      .text_size(14)
      .on_key_down(menuKeys(this, labels, (at) => pick(at)))
      .child(menuRow(this, t, "space-new-tab", {
        at: [this, "at", 0], label: "New tab", icon: "mods/t3-menu/icons/plus.svg",
        trail: menuHint(t, shortcut("t3-tabs.new")), pick: () => pick(0),
      }))
      .when(entries.length > 0, (el) => el.child(menuRule(t)).child(scrollList(this, "space-menu-list", {
        count: entries.length, row: MENU_ROW, at: this.at - 1,
        height: Math.min(entries.length, SPACE_SHOWN) * MENU_ROW,
        wheeled: (keep) => { if (keep >= 0) this.at = keep + 1; },
        draw: drawEntry,
      })));
  }

  render() {
    const t = theme(), p = props() ?? {};
    if (p.tab === "space-switch") return this.spaceSwitchView(t, p);
    const list = items(p, this.git);
    // Its submenu closed itself (← or Esc in it, a click beside it): the keyboard comes back here.
    subGone(this, SUB_CLOSED);
    return v_flex()
      .id("menu")
      .track_focus(this.keys)
      .w_full()
      .min_h(0)
      .p(4)
      .bg(t.popover)
      .text_size(14)
      // Off the menu, nothing pending opens; a submenu open stays.
      .on_hover((on) => { if (!on) subLeft(this.s); })
      // A submenu's ← goes back to its menu, as its Esc does.
      .on_key_down(menuKeys(this, list.map((it) => it[0]), (at, cx, lit) => this.choose(at, cx, lit), { back: Boolean(p.parents?.length), sub: (at) => list[at][1] === "snooze" }))
      .children(
        list.map((it, i) =>
          v_flex()
            .when(i > 0 && list[i - 1][4] !== it[4], el => el.child(menuRule(t)))
            .child(menuRow(this, t, `mi-${i}`, {
              at: [this, "at", i], label: it[0], open: i === this.sub?.row, icon: menuIcon(it[1], it[0], it[2]) || null, sub: it[1] === "snooze" && "mods/t3-menu/icons",
              // Only what deletes something is red, in words, as T3's destructive item: a Close asks first while a program runs.
              color: it[1] === "worktree" && it[2].action === "remove" ? t.ansi1 : null,
              trail: it[1] === "snooze" ? null : menuHint(t, it[3] ?? shortcut(it[1], it[2])),
              pick: (cx) => this.choose(i, cx),
              also: (el) => el.on_mouse_move((e, cx) => {
                this.rowsAt[i] = e.bounds;
                hoverRow(this.s, it[1] === "snooze" ? it[1] : null, e, cx, (key, _row, cx) => { if (key) this.openSub(i, false); else closeSub(this); cx.notify(); });
              }),
            })),
        ),
      );
  }
}
