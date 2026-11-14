// Quick Review's range menu as it opens (t3-actions/review-details.js initRangeMenu → panel.js reviewRepo → review-scope.js
// readScope): every git it runs, in its order, against a real repository, timed. exec is child_process here; Herdr adds its
// own few ms per call.  node --experimental-vm-modules --no-warnings bench-scope.mjs <tree> <repo> [rounds]
import vm from "node:vm";
import fs from "node:fs";
import { execFile } from "node:child_process";

const [tree, repo, ROUNDS = "5"] = process.argv.slice(2);
const log = [];
const exec = (cmd, args, opts = {}) => new Promise((done) => {
  const t = performance.now();
  execFile(cmd, args, { cwd: opts.cwd, maxBuffer: 1 << 28 }, (err, stdout, stderr) => {
    log.push({ cmd: [cmd, ...args.filter((a) => !a.startsWith("--no-optional") && a !== "-c" && a !== "core.fsmonitor=false")].join(" ").slice(0, 90), ms: Math.round(performance.now() - t) });
    done({ code: err ? (err.code ?? 1) : 0, stdout, stderr });
  });
});
const context = vm.createContext({ console });
const src = fs.readFileSync(`${tree}/shared/review-git.js`, "utf8");
const mod = new vm.SourceTextModule(src, { context });
await mod.link(() => new vm.SyntheticModule(["exec"], function () { this.setExport("exec", exec); }, { context }));
await mod.evaluate();
const { readReview, readPicks, readRefs, git } = mod.namespace;

async function open() {
  log.length = 0;
  const t0 = performance.now();
  // reviewRepo: where the tab works, as a repository.
  const top = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "rev-parse", "--show-toplevel"], { cwd: repo });
  const root = top.stdout.trim();
  const firstRows = performance.now();
  // readScope: counts, then (a base chosen) its count, then commits and refs together.
  const r = await readReview(root);
  const counts = performance.now();
  const [picks, refs] = await Promise.all([readPicks(r), readRefs(root)]);
  const done = performance.now();
  return { total: Math.round(done - t0), repo: Math.round(firstRows - t0), counts: Math.round(counts - firstRows), picksRefs: Math.round(done - counts), commits: picks.commits.length, branches: picks.branches.length, refs: refs.length, execs: log.length, each: log.map((e) => `${e.ms}ms ${e.cmd}`) };
}

const runs = [];
for (let i = 0; i < Number(ROUNDS); i++) runs.push(await open());
const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
console.log(JSON.stringify({ repo, rounds: runs.length, total: med("total"), repoMs: med("repo"), countsMs: med("counts"), picksRefsMs: med("picksRefs"), execs: runs[0].execs, sample: runs.at(-1).each }, null, 1));
