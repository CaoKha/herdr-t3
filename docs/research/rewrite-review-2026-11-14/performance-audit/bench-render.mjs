// One frame of the whole layout, mod by mod, origin/main against HEAD: render time in Node, elements made, host calls and
// shared helpers called. A frame here is what Herdr runs when its live data changes (every mod shown renders again).
//   node --experimental-vm-modules --no-warnings bench-render.mjs <origin tree> <head tree> [terminals] [hub]
// The trees are `git archive <ref> mods extras/mods shared` unpacked; /tmp/perf-audit/layout*.json the layouts.
import { loadMod, makeCx, resetStats, stats, time } from "./harness.mjs";
import { makeWorld } from "./world.mjs";
import { countHelpers } from "./count-tree.mjs";

const [origin, head, N = "5000", HUB = "0", SIDEBAR = "lists"] = process.argv.slice(2);
// The copies the layout shows, with their props (layouts/herdr-t3.json), plus the focused pane's header.
const COPIES = (w) => [
  ["t3-tabs", { part: "keys" }], ["t3-tabs", null], ["t3-tabs", { part: "end", block: "tabs-end" }], ["t3-tabs", { part: "window", block: "window-end" }],
  ["t3-chrome", null], ["t3-chrome", { footer: true }], ["t3-spaces", { newMenu: "t3-new-menu" }],
  SIDEBAR === "inbox" ? ["t3-inbox", { newMenu: "t3-new-menu", picker: "t3-picker", home: "t3-tabs.home", menu: "t3-menu" }] : ["t3-agents", null],
  ["t3-actions", { block: "actions", details: true }],
  ...w.panes.filter((p) => p.tab === "s0b0").map((p) => ["t3-pane", { pane: p.pane, terminal: p.terminal }]),
];

async function frame(tree, layoutFile) {
  const w = makeWorld({ terminals: Number(N), hub: Number(HUB), layoutFile });
  w.shared["t3.sidebar"] = SIDEBAR;
  const rows = [];
  for (const [mod, props] of COPIES(w)) {
    w.props = props;
    const { Mod } = await loadMod(`${tree}/mods/${mod}`, w, "main.js", countHelpers);
    const cx = makeCx(), v = new Mod();
    v.init?.(props ?? {}, cx);
    for (let i = 0; i < 20; i++) await null;
    resetStats();
    v.render(cx);
    const calls = Object.fromEntries([...stats.calls].filter(([k]) => !["theme", "props", "settings", "__count"].includes(k)));
    const els = stats.elements;
    const t = time(() => { w.props = props; v.render(cx); }, 15, 3);
    rows.push({ mod, props: props ? JSON.stringify(props).slice(0, 40) : "", ms: t.median, p95: t.p95, els, calls });
  }
  return rows;
}

const out = { N: Number(N), hub: Number(HUB), sidebar: SIDEBAR, origin: await frame(origin, "/tmp/perf-audit/layout-origin.json"), head: await frame(head, "/tmp/perf-audit/layout.json") };
const sum = (rows) => Math.round(rows.reduce((a, r) => a + r.ms, 0) * 100) / 100;
console.log(`terminals ${N}, hub ${HUB}, sidebar ${SIDEBAR}: frame origin ${sum(out.origin)}ms, head ${sum(out.head)}ms (Node, JS only)`);
for (let i = 0; i < out.head.length; i++) {
  const o = out.origin[i], h = out.head[i];
  const fn = (r) => Object.entries(r.calls).filter(([k]) => k.startsWith("fn:")).map(([k, v]) => `${k.slice(3)}:${v}`).join(" ");
  console.log(`${h.mod.padEnd(10)} ${h.props.padEnd(40)} ${String(o.ms).padStart(7)} → ${String(h.ms).padStart(7)}ms  els ${o.els}→${h.els}\n    origin ${fn(o)}\n    head   ${fn(h)}`);
}
if (process.env.JSON_OUT) (await import("node:fs")).writeFileSync(process.env.JSON_OUT, JSON.stringify(out, null, 1));
