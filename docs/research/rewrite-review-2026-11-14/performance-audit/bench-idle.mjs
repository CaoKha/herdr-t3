// A second of an idle window: every copy the layout keeps (and the docked panel's), each `every` clock it starts, what one tick
// costs and how many host reads and execs it makes, scaled to a second. Popups and hover watches only run while used.
//   node --experimental-vm-modules --no-warnings bench-idle.mjs <tree> [terminals]
import { loadMod, makeCx, resetStats, stats, time } from "./harness.mjs";
import { makeWorld } from "./world.mjs";

const [tree, N = "1000"] = process.argv.slice(2);
const w = makeWorld({ terminals: Number(N), layoutFile: tree.includes("origin") ? "/tmp/perf-audit/layout-origin.json" : "/tmp/perf-audit/layout.json" });
const copies = [["t3-tabs", { part: "keys" }], ["t3-tabs", null], ["t3-tabs", { part: "window", block: "window-end" }], ["t3-chrome", null], ["t3-chrome", { footer: true }],
  ["t3-chrome", { part: "panel" }], ["t3-chrome", { part: "surface-empty" }], ["t3-spaces", { newMenu: "t3-new-menu" }], ["t3-agents", null], ["t3-inbox", {}],
  ["t3-actions", { block: "actions", details: true }], ["t3-pane", { pane: "p0_0", terminal: w.top }], ["t3-files", null]];
let perSecond = 0, readsPerSecond = 0, execsPerSecond = 0;
for (const [mod, props] of copies) {
  w.props = props;
  const { Mod } = await loadMod(`${tree}/mods/${mod}`, w);
  const cx = makeCx(), v = new Mod();
  v.init(props ?? {}, cx);
  for (let i = 0; i < 20; i++) await null;
  v.render(cx);
  // Settled first: a copy's first ticks ask what it hasn't yet (project icons, repositories) and then keep the answers.
  for (let n = 0; n < 3; n++) { for (const clock of cx.timers.filter((x) => x.kind === "every" && !x.gone)) clock.fn(cx); for (let i = 0; i < 50; i++) await null; }
  for (const clock of cx.timers.filter((x) => x.kind === "every" && !x.gone)) {
    resetStats();
    clock.fn(cx);
    for (let i = 0; i < 20; i++) await null;
    const reads = [...stats.calls].filter(([k]) => ["terminals", "agents", "panes", "spaces", "layout", "focused"].includes(k)).reduce((a, [, n]) => a + n, 0), execs = stats.execs.length;
    const t = time(() => clock.fn(cx), 10, 2), hz = 1000 / clock.ms;
    perSecond += t.median * hz; readsPerSecond += reads * hz; execsPerSecond += execs * hz;
    console.log(`${mod.padEnd(10)} ${JSON.stringify(props ?? {}).slice(0, 34).padEnd(34)} every ${String(clock.ms).padStart(5)}ms  tick ${String(t.median).padStart(6)}ms  host reads ${reads}  execs ${execs}`);
  }
}
console.log(`idle, per second: ${perSecond.toFixed(2)}ms JS (Node), ${readsPerSecond.toFixed(1)} host list reads, ${execsPerSecond.toFixed(2)} execs`);
