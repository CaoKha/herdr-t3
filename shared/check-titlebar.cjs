// titlebar.js: where Details' button stands, from what the header measured, panel open or closed, zoomed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "titlebar.js"), "utf8").replace(/^export /gm, "") + "\nglobalThis.tb = { noteTitlebar, detailsAnchor };", context);
const { noteTitlebar, detailsAnchor } = context.tb;
const plain = (v) => JSON.parse(JSON.stringify(v));
const viewport = { width: 1600 };

// Before the header's first frame (cmd-shift-b at once): no place, the popup takes its default one.
assert.equal(detailsAnchor(viewport, 1, false), null);
noteTitlebar("end", 40);
assert.equal(detailsAnchor(viewport, 1, true), null, "the panel open but its head not drawn yet");

// Measured: right of it what the tab row has there (the closed panel's toggle and the row's 12).
assert.deepEqual(plain(detailsAnchor(viewport, 1, false)), { x: 1600 - 40 - 28, y: 6, width: 28, height: 28 });
// The panel open: the row's 12 alone, and what the panel takes.
noteTitlebar("end", 12); noteTitlebar("panel", 601);
assert.deepEqual(plain(detailsAnchor(viewport, 1, true)), { x: 1600 - 12 - 601 - 28, y: 6, width: 28, height: 28 });
// Zoomed 1.25: what was measured is in zoomed px already; the button's own size scales.
noteTitlebar("end", 15); noteTitlebar("panel", 750);
assert.deepEqual(plain(detailsAnchor(viewport, 1.25, true)), { x: 1600 - 15 - 750 - 35, y: 7.5, width: 35, height: 35 });
console.log("titlebar ok");
