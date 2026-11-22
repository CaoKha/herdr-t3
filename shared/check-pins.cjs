// Loads pins.js in a fake herdr: pinning, unpinning, undo (putBack), and pruning ended agents per heard machine.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const kit = require("./check-kit.js");

const state = {};
let termList = [], sharedWrites = 0, hcCalls = [];
const context = vm.createContext({
  shared: (k) => state[k],
  setShared: (k, v) => { sharedWrites++; state[k] = v; },
  terminals: () => termList,
  checking: () => false,
  hc: async (args) => { hcCalls.push(args); return { code: 0, stderr: "" }; },
  notify: () => {},
});
const src = ["store.js", "labels.js", "pins.js"]
  .map((f) => kit.strip(fs.readFileSync(path.join(__dirname, f), "utf8")))
  .join("\n")
  + "\nglobalThis.pins = { pinList, setPinned, pin, unpin, putBack, prunePins };";
vm.runInContext(src, context);
const { pinList, setPinned, pin, unpin, putBack, prunePins } = context.pins;

// pin prepends, ignores duplicates, and clears snoozed when set.
termList = [{ address: "a", labels: {} }, { address: "s1", labels: { snoozed: "999999" } }];
pin("a");
assert.deepEqual([...pinList()], ["a"]);
pin("b");
assert.deepEqual([...pinList()], ["b", "a"]);
const writesBeforeDup = sharedWrites;
pin("a");
assert.deepEqual([...pinList()], ["b", "a"]);
assert.equal(sharedWrites, writesBeforeDup, "pinning an already-pinned address does not rewrite");
pin("s1");
assert.deepEqual([...pinList()], ["s1", "b", "a"]);
assert.deepEqual(hcCalls.map((a) => [...a]), [["label", "s1", "snoozed="]], "pinning a snoozed terminal clears snoozed");

// unpin removes only matching addresses and skips write when nothing changed.
unpin(["b", "missing"]);
assert.deepEqual([...pinList()], ["s1", "a"]);
const writesBeforeNoop = sharedWrites;
unpin(["missing"]);
assert.equal(sharedWrites, writesBeforeNoop);

// putBack restores took pins to their positions in before while keeping pins added since.
setPinned(["p1", "p2", "p3", "p4"]);
const before = [...pinList()];
unpin(["p2", "p4"]);
pin("p0");
putBack(before, ["p2", "p4"]);
assert.deepEqual([...pinList()], ["p0", "p1", "p2", "p3", "p4"]);
const writesBeforeNoopPut = sharedWrites;
putBack(before, ["p2"]);
assert.equal(sharedWrites, writesBeforeNoopPut, "already-present pins are a no-op");

// prunePins drops non-live pins only on heard machines, preserving pins on unheard machines.
setPinned(["local-live", "local-dead", "local-gone", "vps/live", "vps/dead", "vps/gone", "devbox/unheard"]);
const all = [
  { address: "local-live", state: "live" },
  { address: "local-dead", state: "exited" },
  { address: "vps/live", state: "live" },
  { address: "vps/dead", state: "exited" },
];
const kept = prunePins(all);
assert.deepEqual([...kept], ["local-live", "vps/live", "devbox/unheard"]);
assert.deepEqual([...pinList()], ["local-live", "vps/live", "devbox/unheard"]);

// Unheard local machine is preserved when only a remote machine is heard.
setPinned(["local-1", "vps/live", "vps/gone"]);
const keptRemoteOnly = prunePins([{ address: "vps/live", state: "live" }]);
assert.deepEqual([...keptRemoteOnly], ["local-1", "vps/live"]);

// No-op prune does not rewrite shared pins.
const writesBeforeCleanPrune = sharedWrites;
assert.deepEqual([...prunePins([{ address: "vps/live", state: "live" }])], ["local-1", "vps/live"]);
assert.equal(sharedWrites, writesBeforeCleanPrune);

console.log("ok: pins: pin, unpin, putBack, and prunePins per heard machine.");
