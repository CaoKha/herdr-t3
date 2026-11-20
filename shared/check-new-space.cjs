// New space's machine choice (new-space.js) in a fake herdr: which machines it offers, and what a draw reads for its button.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { strip, plain } = require("./check-kit.js");

let all = [{ id: "s1", active: true, machine: null }], known = [];
const reads = { spaces: 0, machines: 0 }, calls = [];
const context = vm.createContext({
  spaces: () => { reads.spaces++; return [...all]; }, machines: () => { reads.machines++; return known; },
  run: (...a) => calls.push(a), openOverlay: (o) => calls.push(["overlay", o.mod, o.props]),
});
vm.runInContext(["store.js", "new-space.js"].map((f) => strip(fs.readFileSync(path.join(__dirname, f), "utf8"))).join("\n") + "\nglobalThis.ns = { newSpacePlan, newSpaceButton };", context);
const { newSpacePlan, newSpaceButton } = context.ns;

// One machine: nothing to ask, and the button is Herdr's own command with its key.
assert.deepEqual(plain(newSpacePlan()), { candidates: [{ machine: null, layout: "ready" }], ask: false });
let b = newSpaceButton("t3-new-menu");
assert.equal(b.action, "space.new");
assert.equal(b.onOpen(), false, "nothing opened to stay on for");
assert.deepEqual(plain(calls.splice(0)), [["space.new", { machine: "" }]]);
// A standalone sidebar has no menu to ask with.
b = newSpaceButton(undefined);
b.onOpen();
assert.deepEqual(plain(calls.splice(0)), [["space.new"]]);

// Another machine, known or only in use: the active space's first, then this one, then the rest by name.
all = [{ id: "s1", machine: null }, { id: "s2", active: true, machine: "vps" }, { id: "s3", machine: "old" }];
known = [{ name: "vps", layout: "ready" }, { name: "box", layout: "missing" }];
assert.deepEqual(plain(newSpacePlan()), { ask: true, candidates: [{ machine: "vps", layout: "ready" }, { machine: null, layout: "ready" },
  { machine: "box", layout: "missing" }, { machine: "old", layout: "unavailable" }] });
b = newSpaceButton("t3-new-menu");
assert.equal(b.action, undefined, "the key would skip the question");
b.onOpen();
assert.deepEqual(plain(calls.splice(0)), [["overlay", "t3-new-menu", { pick: true }]]);

// The sidebar that draws the button has read spaces() for its rows: handed that list, the button reads none again.
{
  const held = context.spaces();
  reads.spaces = reads.machines = 0;
  assert.equal(newSpaceButton("t3-new-menu", held).action, undefined);
  assert.deepEqual(reads, { spaces: 0, machines: 1 }, "handed the draw's spaces");
  newSpaceButton("t3-new-menu");
  assert.deepEqual(reads, { spaces: 1, machines: 2 }, "handed none, it reads them");
}

console.log("ok: New space asks only with a machine to choose, from the spaces its sidebar already read.");
