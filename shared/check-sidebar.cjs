const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "sidebar.js"), "utf8").replace(/^export /gm, "");
const { sidebarParts, toggleLeft } = vm.runInNewContext(source + "\n({ sidebarParts, toggleLeft });");

for (const active of ["inbox", "lists"]) {
  for (const hidden of [false, true]) {
    const stack = { id: "sidebar-lists", active };
    const rail = { id: "sidebar", hidden, children: [{ children: [stack] }] };
    const root = { children: [{ id: "other" }, { children: [rail] }] };
    const found = sidebarParts(root);
    assert.equal(found.rail, rail, "the rail keeps its own visibility and size");
    assert.equal(found.stack, stack, "the selected mode is independent of the rail's visibility");
  }
}

const rail = { id: "sidebar", size: { px: 256 } }, stack = { id: "sidebar-lists", active: "inbox" };
const withoutStack = sidebarParts({ children: [rail] });
assert.equal(withoutStack.rail, rail);
assert.equal(withoutStack.stack, undefined, "a standalone sidebar has no selected mode");
const withoutRail = sidebarParts({ children: [stack] });
assert.equal(withoutRail.rail, undefined, "a stack does not imply a sidebar rail");
assert.equal(withoutRail.stack, stack);
for (const root of [undefined, null, {}]) {
  const found = sidebarParts(root);
  assert.deepEqual([found.rail, found.stack], [undefined, undefined]);
}

// The sidebar's toggle stands in one place, shown or hidden, as T3's: past the macOS window buttons when the layout draws
// them (traffic lights 16 in: the last ends at 68, unzoomed), else 8 in.
const mac = { platform: "macos", titlebar: "none" }, lit = { traffic_lights: [16, 12] };
assert.equal(toggleLeft(mac, lit, 1), 78);
assert.equal(toggleLeft(mac, lit, 2), 37, "the buttons are screen points; the inset is logical");
for (const [w, root] of [[{ ...mac, fullscreen: true }, lit], [{ platform: "macos" }, lit], [mac, {}], [{ platform: "linux", titlebar: "none" }, lit], [undefined, undefined]])
  assert.equal(toggleLeft(w, root, 1), 8, "no window buttons of the layout's: 8 in");

console.log("ok: sidebar parts: Inbox, Lists, visibility, missing stack and missing rail; the toggle's one place.");
