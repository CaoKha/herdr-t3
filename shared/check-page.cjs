// What the panel's read pages share outside a page: how long ago (ago.js), a paged connection read to its end or its cap
// (paging.js), and page.js's words for a failed write, its draft keys and the sections it folds, kept in this run's memory.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const store = new Map();
const ctx = vm.createContext({ localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) }, JSON, Promise, Date, Math });
const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8").replace(/^import [^;]*;\r?\n/gm, "").replace(/^export /gm, "");
vm.runInContext(`${read("ago.js")}\n${read("paging.js")}\n${read("page.js")}\n${read("store.js")}
globalThis.p = { ago, pageRest, writeError, draftKey, sectionOpen, toggleSection, SECTIONS_KEY, readLocal };`, ctx);
const { p } = ctx;
const json = (x) => JSON.parse(JSON.stringify(x));

(async () => {
  const now = Date.parse("2026-01-03T00:00:00Z"), at = (minutes) => now - minutes * 60000;
  assert.deepEqual([p.ago(at(0.5), now), p.ago(at(5), now), p.ago(at(210), now), p.ago(at(3000), now), p.ago(NaN, now)], ["just now", "5m", "3h", "2d", "just now"],
    "as the sidebar times: no \"ago\", nothing past days");

  // A connection of 7 in pages of 2: read to its end, or cut at the cap with `truncated`.
  const all = [1, 2, 3, 4, 5, 6, 7], conn = (from) => ({ nodes: all.slice(from, from + 2), pageInfo: { hasNextPage: from + 2 < all.length, endCursor: String(from + 2) } });
  const asked = [], next = async (cursor) => { asked.push(cursor); return conn(Number(cursor)); };
  assert.deepEqual(json(await p.pageRest(conn(0), next)), { nodes: all, truncated: false });
  assert.deepEqual(asked, ["2", "4", "6"], "each next page from the last one's cursor");
  assert.deepEqual(json(await p.pageRest(conn(0), next, 1)), { nodes: [1, 2, 3, 4], truncated: true }, "one more page at most: the rest is left");
  assert.deepEqual(json(await p.pageRest({ nodes: [1, null] }, next)), { nodes: [1], truncated: false }, "one page, and no null nodes");

  assert.match(p.writeError("reply", "GitHub: HTTP 502"), /may have gone through: refresh before sending it again/);
  assert.equal(p.writeError("resolve", "GitHub: HTTP 502"), "GitHub: HTTP 502", "a resolve that failed just failed: it is put back");
  assert.deepEqual([p.draftKey("org/app#7"), p.draftKey("org/app#7", "T1")], ["org/app#7", "org/app#7:T1"], "one draft per subject, one per thread");

  // Sections: the person's last choice, else the caller's fallback; kept for the next run, read once at the start.
  const view = { sections: {} }, cx = { notify() {} };
  assert.deepEqual([p.sectionOpen(view, "checks"), p.sectionOpen(view, "checks", false)], [true, false]);
  p.toggleSection(view, "checks", true, cx);
  assert.equal(p.sectionOpen(view, "checks", false), true, "the person's choice wins over the default");
  assert.deepEqual(json(p.readLocal(p.SECTIONS_KEY, {})), { checks: true }, "and is kept");
  console.log("ok: page: ago, paging, a failed write's words, drafts and sections");
})().catch((e) => { console.error(e); process.exit(1); });
