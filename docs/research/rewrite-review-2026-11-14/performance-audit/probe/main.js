// A 0px block that runs bench-core.js's cases in Herdr's own QuickJS once the window is up, each in a task of its own, and
// writes what it timed to <appHome>/perf-core.json (host.sh waits for it). A case that doesn't answer in 60 s was interrupted
// (the host's error ends its task). Nothing it times touches the host.
import { View, div } from "gpui-kit";
import { appHome, exec, writeTextFile, terminals, panes, agents, hc } from "herdr";
import { cases } from "./bench-core.js";

export default class Probe extends View {
  init(_props, cx) {
    cx.spawn(async (cx) => {
      await cx.sleep(1500);
      // tree.js indexes each terminals() list by identity: a list changed in place would read a stale index.
      await hc(["run", "--bg", "--", "sleep", "30"]).catch(() => null);
      await cx.sleep(1500);
      const a = terminals(), b = terminals();
      const results = [{ name: "host lists", sameList: a === b, samePanes: panes() === panes(), sameAgents: agents() === agents(), terminals: a.length, frozen: Object.isFrozen(a) }];
      for (const c of cases()) {
        let got = null;
        cx.spawn(async () => { try { got = await c.run(); } catch (e) { got = { error: String(e?.message ?? e) }; } });
        for (let waited = 0; !got && waited < 60000; waited += 100) await cx.sleep(100);
        results.push({ name: c.name, ...(got ?? { error: "no answer in 60 s (interrupted)" }) });
      }
      const at = `${appHome()}/perf-core.json`, tmp = `${at}.tmp-${Date.now()}`;
      await writeTextFile(tmp, JSON.stringify(results, null, 1), null);
      await exec("mv", ["-f", tmp, at]);
    });
  }
  render() { return div().size_full(); }
}
