// The sub-agent menu (t3-pane as a popup, props { kids }) on an agent with `hub` sub-agents among `terminals`: one render and
// one tick of its 1 s clock, before and after.  node --experimental-vm-modules --no-warnings bench-kids.mjs <tree>… [terminals] [hub]
import { loadMod, makeCx, time } from "./harness.mjs";
import { makeWorld } from "./world.mjs";
const args = process.argv.slice(2), trees = args.filter((a) => a.startsWith("/")), [N = "5000", HUB = "2000"] = args.filter((a) => !a.startsWith("/"));
for (const tree of trees) {
  const w = makeWorld({ terminals: Number(N), hub: Number(HUB) });
  w.props = { kids: w.top, overlay: "ov1" };
  const { Mod } = await loadMod(`${tree}/mods/t3-pane`, w);
  const cx = makeCx(), v = new Mod();
  v.init(w.props, cx);
  const clock = cx.timers.find((x) => x.kind === "every");
  console.log(tree, `render ${JSON.stringify(time(() => v.render(cx), 10, 2))}`, `clock tick ${JSON.stringify(time(() => clock.fn(cx), 10, 2))}`);
}
