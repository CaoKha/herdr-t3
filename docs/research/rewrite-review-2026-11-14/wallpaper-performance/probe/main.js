// A 0px block beside the wallpaper under test. It logs how late a 16ms timer fires (main-thread stalls, whoever causes
// them) and runs commands the orchestrator (instance.sh) writes to <appHome>/perf-cmd.json:
//   { seq, do: "pipeline" }        every material through the version's import, preview, Apply and saved-picture steps
//   { seq, do: "switch", id }      select a wallpaper, as the switcher does
//   { seq, do: "grid" }            the current image steps beside the sips-to-grid candidate, and how alike their glyphs are
//   { seq, do: "builtins" }        each built-in picture made for the theme now, as the first switch to it does
//   { seq, do: "cold" }            after a restart: each saved picture as a starting Home shows it (adapters with coldFlow)
// Results: perf-<label>.jsonl (stages), perf-lag-<label>.json (stall timeline), perf-ack.json (last command done).
import { View, div } from "gpui-kit";
import { appHome, exec, readTextFile, setShared } from "herdr";
import { monitor, must, put, recorder } from "./common.js";
import * as V from "./adapter.js";

const wait = (cx, ms) => new Promise((go) => cx.timer.after(ms, () => go(undefined)));

export default class Probe extends View {
  init(_props, cx) {
    const home = appHome(), m = monitor(cx), started = Date.now();
    cx.spawn(async (cx) => {
      const cfg = JSON.parse((await readTextFile(`${home}/perf-config.json`)) ?? "{}");
      const label = cfg.label ?? "x";
      let seq = 0, loops = 0;
      for (;;) {
        await wait(cx, 200);
        if (++loops % 5 === 0) await put(`${home}/perf-lag-${label}.json`, JSON.stringify({ started, log: m.log })).catch(() => null);
        let cmd = null;
        try { cmd = JSON.parse((await readTextFile(`${home}/perf-cmd.json`)) ?? "null"); } catch { cmd = null; }
        if (!cmd || cmd.seq <= seq) continue;
        seq = cmd.seq;
        const at = Date.now();
        let error = null;
        try {
          if (cmd.do === "pipeline") await this.pipeline(cx, m, home, cfg);
          if (cmd.do === "switch") setShared("asciicn-wallpaper.scene", cmd.id);
          if (cmd.do === "grid") await this.grid(cx, m, home, cfg);
          if (cmd.do === "cold" && V.coldFlow) await V.coldFlow(recorder(cx, m, `${home}/perf-${cfg.label}.cold.jsonl`, { version: cfg.label }), cx, home);
          if (cmd.do === "builtins" && V.builtinFlow) await V.builtinFlow(recorder(cx, m, `${home}/perf-${cfg.label}.builtins.jsonl`, { version: cfg.label }), cx, home);
        } catch (e) { error = String(e?.message ?? e); }
        await put(`${home}/perf-lag-${label}.json`, JSON.stringify({ started, log: m.log }));
        await put(`${home}/perf-ack.json`, JSON.stringify({ seq, at, done: Date.now(), error }));
      }
    });
  }

  async pipeline(cx, m, home, cfg) {
    const out = `${home}/perf-${cfg.label}.jsonl`, rows = [];
    for (const [i, mat] of cfg.materials.entries()) {
      const work = `${home}/perf-work/${i}`, lib = `${home}/perf-lib/${i}`;
      await must(exec("mkdir", ["-p", work, lib]));
      const stage = recorder(cx, m, `${out}.${i}`, { version: cfg.label, material: mat.name });
      try {
        const text = mat.kind === "image"
          ? await V.imageFlow(stage, cx, mat.file, work, mat.name, cfg.styles ?? V.STYLES)
          : await V.ansFlow(stage, cx, mat.file, work, mat.name);
        rows.push({ material: mat.name, chars: text.length, ...(await V.savedFlow(stage, cx, lib, mat.name, text)) });
      } catch (e) {
        rows.push({ material: mat.name, error: String(e?.message ?? e) });
      }
      await put(`${out}.summary.json`, JSON.stringify(rows));
      await exec("rm", ["-rf", work]);
    }
  }

  // Current pipeline then the sips-to-grid candidate, per image material: times in perf-<label>.grid.jsonl, agreement in
  // perf-<label>.grid.json.
  async grid(cx, m, home, cfg) {
    const out = {};
    for (const [i, mat] of cfg.materials.entries()) {
      if (mat.kind !== "image") continue;
      const work = `${home}/perf-work/g${i}`;
      await must(exec("mkdir", ["-p", work]));
      const stage = recorder(cx, m, `${home}/perf-${cfg.label}.grid.${i}.jsonl`, { version: cfg.label, material: mat.name });
      V.imageFlow.texts = {};
      await V.imageFlow(stage, cx, mat.file, work, mat.name, V.STYLES);
      out[mat.name] = await V.gridFlow(stage, cx, mat.file, work, V.imageFlow.texts);
      await put(`${home}/perf-${cfg.label}.grid.json`, JSON.stringify(out, null, 1));
      await exec("rm", ["-rf", work]);
    }
  }

  render() { return div().size_full(); }
}
