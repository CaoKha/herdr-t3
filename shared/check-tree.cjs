const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "tree.js"), "utf8").replace(/^export /gm, "");
const { agentKids, descendants, kidStatus, kidTree, subAgents } = vm.runInNewContext(source + "\n({ agentKids, descendants, kidStatus, kidTree, subAgents });");

// A sub-agent's done is a dot only until it's read, as a top-level agent's (GLOSSARY: unread done).
assert.equal(kidStatus({ address: "reply", status: "done" }, new Map([["reply", "done"]])), "done", "unread, as agents() says");
assert.equal(kidStatus({ address: "reply", status: "done" }, new Map([["reply", "idle"]])), "idle", "read in its pane");
assert.equal(kidStatus({ address: "reply", status: "done", turn: 3, labels: {} }, new Map()), "done", "no pane, its turn not seen yet");
assert.equal(kidStatus({ address: "reply", status: "done", turn: 3, labels: { "herdr.seen": "3" } }, new Map()), "idle", "no pane, seen when peeked");
assert.equal(kidStatus({ address: "reply", status: "error" }, new Map([["reply", "idle"]])), "error", "a failed one says so");
assert.deepEqual(subAgents([], [{ address: "top", state: "live" }, { address: "f", parent: "top", state: "live", status: "error" }])("top"), ["blocked"],
  "put together, a failure needs the person");

// An agent ran two commands in shells of its own (`hc run --bg`); one of them started an agent.
const agent = (address, parent, status = "working") => ({ address, parent, state: "live", status, program: { agent: true } });
const shell = (address, parent) => ({ address, parent, state: "live", status: null, program: { shell: true, agent: false } });
const all = [agent("top", null), agent("a", "top"), shell("job", "top"), agent("b", "job", "idle"), shell("job2", "a"),
  { ...agent("gone", "top"), state: "exited" },
  // Before its first report an agent has no status, but the program table knows it.
  { ...agent("new", "top"), status: null }];
const names = (ks) => ks.map((k) => k.address);

assert.deepEqual(names(agentKids(all, "top")), ["a", "b", "new"], "a shell isn't one; what it started stands where it would have");
assert.deepEqual(names(agentKids(all, "a")), [], "nor is a shell with nothing under it");
assert.deepEqual(names(descendants(all, "top")), ["a", "b", "new"], "all the way down");
const deep = [agent("top", null), agent("a", "top"), agent("a1", "a"), agent("b", "top")];
assert.deepEqual(kidTree(deep, "top").map((r) => [r.k.address, r.depth, r.lines.join("")]), [["a", 0, "├"], ["a1", 1, "│└"], ["b", 0, "└"]],
  "tree order, each a level in from its parent");

// A loop in the parents ends.
const loop = [agent("x", "y"), shell("y", "x")];
assert.deepEqual(names(descendants(loop, "x")), []);

console.log("ok: sub-agents: a shell an agent ran is skipped, what it started counts; ended ones and loops don't.");
