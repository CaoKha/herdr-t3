// The pure-JS hot paths, timed the same way in Node (run-core.mjs) and in Herdr's QuickJS (probe/main.js), so one gives the
// other's ratio. Each case: median and max of a few runs, or the error (Herdr's "interrupted").
import * as treeOrigin from "./tree-origin.js";
import * as treeHead from "./tree-head.js";
import * as treeFixed from "./tree-fixed.js";
import { rankPaths, filterPaths, terms } from "./model.js";
import { rankPaths as rankFixed } from "./model-fixed.js";
import { treeRows, sortEntries, pathEntries } from "./file-tree.js";

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());
const STATUS = ["working", "idle", "done", "blocked", "idle", "working"];

// 20 spaces × 10 tabs, a top agent each, the rest of `n` under them three deep, every fifth a shell; `hub` under the first.
export function world(n = 5000, hub = 0) {
  const T = [], tops = [];
  let c = 0;
  const term = (parent, agent, i) => { const k = { address: `t${c++}`, parent, state: "live", status: agent ? STATUS[i % 6] : null, program: { agent, shell: !agent }, labels: {}, turn: 3 }; T.push(k); return k; };
  const grow = (top, count) => { const f = [top.address]; for (let i = 0; i < count; i++) { const k = term(f[Math.floor(i / 3) % f.length], i % 5 !== 4, i); if (f.length < 400) f.push(k.address); } };
  for (let i = 0; i < 200; i++) tops.push(term(null, true, i));
  if (hub) grow(tops[0], hub);
  const each = Math.floor((n - T.length) / tops.length);
  for (const t of tops) grow(t, each);
  return { all: T, agents: tops.map((t) => ({ address: t.address, status: t.status })), hub: tops[0].address };
}

// Repository-like paths: `n` files in nested folders.
export function paths(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(`packages/pkg${i % 50}/src/module${(i >> 4) % 300}/component-${i}.${i % 3 ? "ts" : "tsx"}`);
  return out;
}

function timed(name, fn, runs = 5) {
  const xs = [];
  try {
    for (let i = 0; i < runs; i++) { const t = now(); fn(); xs.push(now() - t); }
  } catch (e) { return { name, error: String(e?.message ?? e) }; }
  xs.sort((a, b) => a - b);
  return { name, median: Math.round(xs[Math.floor(xs.length / 2)] * 100) / 100, max: Math.round(xs.at(-1) * 100) / 100 };
}

/** The cases, each run on its own: Herdr's interrupt ends the task it hits and can't be caught, so the probe runs each in a
 *  task of its own and records one that never answers as interrupted. */
export function cases() {
  const list = [];
  const add = (name, run) => list.push({ name, run });
  const worlds = new Map(), w = (n, hub) => worlds.get(`${n}/${hub}`) ?? worlds.set(`${n}/${hub}`, world(n, hub)).get(`${n}/${hub}`);
  for (const [n, hub] of [[1000, 0], [5000, 0], [5000, 2000]]) {
    for (const [label, T] of [["origin", treeOrigin], ["head", treeHead], ["fixed", treeFixed]]) {
      // What Tabs, Agents and the Inbox each do per render: every agent's sub-agents' words.
      add(`tree ${label} subAgents×200 n=${n} hub=${hub}`, () => { const x = w(n, hub); return timed("", () => { const under = T.subAgents(x.agents, x.all); for (const a of x.agents) under(a.address); }, 3); });
      if (hub && T.kidTree) add(`tree ${label} kidTree hub n=${n} hub=${hub}`, () => { const x = w(n, hub); return timed("", () => T.kidTree(x.all, x.hub), 3); });
    }
  }
  let big;
  const lists = () => big ??= (() => { const all = paths(200000); return { all, lower: all.map((p) => p.toLowerCase()) }; })();
  for (const q of ["s", "component-1", "pkg1 module2"]) {
    const found = () => { const { all, lower } = lists(), words = terms(q); return all.filter((p, i) => words.every((x) => lower[i].includes(x))); };
    add(`rank head "${q}"`, () => { const f = found(); return { ...timed("", () => rankPaths(f, terms(q)).slice(0, 200), 3), found: f.length }; });
    // The fix ranks in chunks with a pause between (as the filter does): the whole time, and the longest stretch without one.
    add(`rank fixed "${q}"`, async () => {
      const f = found();
      let worst = 0, last = now();
      const t0 = last;
      await rankFixed(f, terms(q), 200, async () => { const t = now(); worst = Math.max(worst, t - last); await null; last = now(); });
      worst = Math.max(worst, now() - last);
      return { median: Math.round((now() - t0) * 100) / 100, max: Math.round(worst * 100) / 100, found: f.length, note: "median: whole rank; max: one chunk" };
    });
  }
  add(`filter 200k "s" (chunks of 5000)`, async () => {
    const { lower } = lists();
    let worst = 0, last = now();
    const t0 = last;
    await filterPaths(lower, ["s"], null, async () => { const t = now(); worst = Math.max(worst, t - last); await null; last = now(); });
    return { median: Math.round(now() - t0), max: Math.round(worst * 100) / 100, note: "median: whole scan; max: one chunk" };
  });
  const flat = () => paths(20000).map((p) => ({ name: p.split("/").pop(), dir: false }));
  add("sortEntries 20k", () => { const f = flat(); return timed("", () => sortEntries(f), 3); });
  add("treeRows 20k all open", () => { const kids = pathEntries(paths(20000).map((path) => ({ path }))); return timed("", () => treeRows((p) => kids.get(p) ?? [], () => true), 3); });
  add("pathEntries 20k", () => { const ps = paths(20000).map((path) => ({ path })); return timed("", () => pathEntries(ps), 3); });
  // Review's folder rows (extras/mods/review/files.js fileTree): each drawn folder row filters every file in its group.
  add("review 40 folder rows × filter 20k", () => { const files = paths(20000), dirs = [...new Set(files.map((p) => p.split("/").slice(0, 3).join("/")))].slice(0, 40);
    return timed("", () => { for (const d of dirs) files.filter((p) => p.startsWith(`${d}/`)); }, 5); });
  return list;
}

export async function runAll(only) {
  const out = [];
  for (const c of cases()) if (!only || c.name.startsWith(only)) out.push({ name: c.name, ...(await c.run()) });
  return out;
}
