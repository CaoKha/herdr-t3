// Project bookmarks (t3.projects): live spaces are remembered without keeping a terminal alive, and New lists dormant ones.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { strip } = require("./check-kit.js");

function loadProjects() {
  const file = path.join(__dirname, "projects.js");
  const src = strip(fs.readFileSync(file, "utf8"))
    + "\nglobalThis.api = { rememberProjects, dormantProjects, PROJECT_CAP };";
  const c = vm.createContext({
    placeOf: (s, ps) => {
      const tabs = new Set((s.tabs ?? []).map((t) => t.id));
      return ps?.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
    },
  });
  vm.runInContext(src, c);
  return c.api;
}

const { rememberProjects, dormantProjects } = loadProjects();

// Active non-Home space leads; Home and an unnamed local home-folder shell space are ignored; unchanged state returns null.
{
  const spaces = [
    { id: "h", name: "Home\u200b", named: true, machine: null, folder: "/Users/me", active: false, tabs: [{ id: "th" }] },
    { id: "scratch", name: "~", named: false, machine: null, folder: "/Users/me", active: false, tabs: [{ id: "ts" }] },
    { id: "s1", name: "alpha", named: false, machine: null, folder: "/work/alpha", active: false, tabs: [{ id: "t1" }] },
    { id: "s2", name: "Beta Web", named: true, machine: "box", folder: "/srv/beta", active: true, tabs: [{ id: "t2" }] },
  ];
  const ps = [{ pane: "p1", tab: "t1", cwd: "/work/alpha/src" }];
  const saved = rememberProjects(spaces, ps, "h", "/Users/me", []);
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), [
    { machine: "box", folder: "/srv/beta", name: "Beta Web", named: true },
    { machine: null, folder: "/work/alpha", name: "alpha" },
  ], "uses the space's root folder rather than a transient subdirectory cwd, active first");
  assert.equal(rememberProjects(spaces, ps, "h", "/Users/me", saved), null, "no write when the bookmark list is unchanged");
}

// Renaming an open space updates its bookmark, closed projects stay behind newly active ones, and the list caps at 50.
{
  const prior = Array.from({ length: 50 }, (_, i) => ({
    machine: null, folder: `/work/p${i}`, name: `p${i}`,
  }));
  const spaces = [
    { id: "s0", name: "Renamed P3", named: true, machine: null, folder: "/work/p3", active: true, tabs: [] },
    { id: "sNew", name: "fresh", named: false, machine: null, folder: "/work/fresh", active: false, tabs: [] },
  ];
  const next = rememberProjects(spaces, [], "h", "/Users/me", prior);
  assert.equal(next.length, 50);
  assert.deepEqual(JSON.parse(JSON.stringify(next.slice(0, 3))), [
    { machine: null, folder: "/work/p3", name: "Renamed P3", named: true },
    { machine: null, folder: "/work/fresh", name: "fresh" },
    { machine: null, folder: "/work/p0", name: "p0" },
  ]);
  assert.equal(next.some((p) => p.folder === "/work/p49"), false, "oldest closed entry drops past 50");
}

// Dormant projects exclude spaces open by either creation folder or live terminal place, and mark offline remote machines off.
{
  const saved = [
    { machine: null, folder: "/work/alpha", name: "alpha" },
    { machine: null, folder: "/work/moved", name: "moved" },
    { machine: null, folder: "/work/sleeping", name: "sleeping" },
    { machine: "vps", folder: "/srv/ready", name: "ready-app", named: true },
    { machine: "down", folder: "/srv/down", name: "down-app" },
  ];
  const spaces = [
    { id: "s1", name: "alpha", machine: null, folder: "/work/alpha", tabs: [{ id: "t1" }] },
    { id: "s2", name: "shell", machine: null, folder: "/Users/me", tabs: [{ id: "t2" }] },
  ];
  const ps = [{ pane: "p2", tab: "t2", cwd: "/work/moved" }];
  const machines = [{ name: "vps", layout: "ready" }, { name: "down", layout: "unavailable" }];
  const dormant = dormantProjects(spaces, ps, "h", saved, machines);
  assert.deepEqual(JSON.parse(JSON.stringify(dormant)), [
    { machine: null, folder: "/work/sleeping", name: "sleeping", off: false },
    { machine: "vps", folder: "/srv/ready", name: "ready-app", named: true, off: false },
    { machine: "down", folder: "/srv/down", name: "down-app", off: true },
  ]);
}

console.log("ok: project bookmarks record active spaces without churn and filter dormant entries cleanly.");
