// A big fake Herdr: spaces × tabs, one top agent pane per tab, each with a tree of sub-agents (some behind shells), padded
// to `terminals` in total. `hub`: one agent (the focused one) with that many descendants of its own.
import fs from "node:fs";

const program = (agent, name = agent ? "Pi" : "zsh") => ({ key: agent ? "pi" : "shell", name, icon: null, tint: false, tile: null, color: null, shell: !agent, agent });
const STATUS = ["working", "idle", "done", "blocked", "idle", "working"];

export function makeWorld({ spaces = 20, tabs = 10, terminals = 5000, hub = 0, layoutFile = "/tmp/perf-audit/layout.json" } = {}) {
  const now = Date.now();
  const T = [], P = [], A = [], S = [];
  let n = 0;
  const term = (parent, agent, i) => {
    const address = `t${n++}`;
    const status = agent ? STATUS[i % STATUS.length] : null;
    const k = { address, parent, state: "live", status, program: program(agent), labels: {}, name: agent ? `agent-${address}` : null, template: null, turn: 3, created_ms: now - 600000, status_ms: now - 60000 * (i % 7) };
    T.push(k);
    return k;
  };
  // A tree under `top` of `count` live terminals: three levels, every fifth a shell an agent ran.
  const grow = (top, count) => {
    const frontier = [top.address];
    let made = 0, i = 0;
    while (made < count) {
      const parent = frontier[Math.floor(i / 3) % frontier.length];
      const shell = i % 5 === 4;
      const k = term(parent, !shell, i++);
      made++;
      if (frontier.length < 400) frontier.push(k.address);
    }
  };
  const tops = [];
  for (let s = 0; s < spaces; s++) {
    const tabList = [];
    for (let b = 0; b < tabs; b++) {
      const id = `s${s}b${b}`, top = term(null, true, s + b);
      tops.push(top);
      const pane = { pane: `p${s}_${b}`, terminal: top.address, tab: id, title: "pi", cwd: `/repo/space${s}`, branch: "main", status: top.status, app: "pi", program: top.program, focused: s === 0 && b === 0, zoomed: false, movable: true };
      P.push(pane);
      A.push({ address: top.address, pane: pane.pane, space: `s${s}`, space_name: `space ${s}`, tab: id, tab_index: b + 1, tab_name: `tab ${b}`, status: top.status, app: "pi", program: top.program, title: "pi", seq: n, pinned: false, focused: pane.focused });
      tabList.push({ id, index: b + 1, name: `tab ${b}`, named: true, active: b === 0, status: top.status, panes: 1, zoomed: false, settled: false, settled_at: null, changed_at: null, working_since: null });
    }
    S.push({ id: `s${s}`, index: s + 1, name: `space ${s}`, named: true, folder: `/repo/space${s}`, machine: null, branch: "main", active: s === 0, status: "working", tabs: tabList });
  }
  if (hub) grow(tops[0], hub);
  const rest = terminals - T.length;
  if (rest > 0) { const each = Math.floor(rest / tops.length); for (const t of tops) grow(t, each); }
  while (T.length < terminals) term(tops.at(-1).address, true, T.length);
  const theme = new Proxy({}, { get: (_t, k) => (k === "name" ? "dark" : "#888888") });
  const layout = JSON.parse(fs.readFileSync(layoutFile, "utf8"));
  // The installed layout docks Review in the panel's stack (scripts/update.sh).
  const find = (node, id) => node?.id === id ? node : (node?.children ?? []).reduce((hit, c) => hit ?? find(c, id), null);
  const body = find(layout, "panel-body");
  if (body && !body.children.some((c) => c.id === "review")) body.children.push({ id: "review", type: "block", content: { mod: "review" } });
  return {
    terminals: T, panes: P, agents: A, spaces: S, layout, theme, props: {}, settings: { zoom: 1, font_family: "JetBrains Mono" },
    shared: {}, writes: [], runs: [], window: { platform: "macos", titlebar: "none", buttons: false, maximized: false, fullscreen: false, active: true },
    focused: { space: "s0", tab: "s0b0", pane: "p0_0", terminal: tops[0].address, shown: null, agent: null, cwd: "/repo/space0" },
    top: tops[0].address,
  };
}
