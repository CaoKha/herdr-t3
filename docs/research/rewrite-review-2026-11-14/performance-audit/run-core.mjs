// bench-core.js in Node, through the harness's fake herdr: the other half of the QuickJS ratio.
//   node --experimental-vm-modules --no-warnings run-core.mjs <probe build dir> [only]
import { loadMod } from "./harness.mjs";
import { makeWorld } from "./world.mjs";
const [dir, only] = process.argv.slice(2);
const { ns } = await loadMod(dir, makeWorld({ terminals: 10 }), "bench-core.js");
for (const r of await ns.runAll(only)) console.log(JSON.stringify(r));
