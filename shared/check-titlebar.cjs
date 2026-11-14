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

// Before the header's first frame (cmd-shift-b at once): the layout's sizes, the closed panel's toggle 28, the panel 480.
assert.deepEqual(plain(detailsAnchor(viewport, 1, false)), { x: 1600 - 28 - 12 - 28, y: 6, width: 28, height: 28 });
assert.deepEqual(plain(detailsAnchor(viewport, 2, true)), { x: 1600 - 24 - 960 - 34 - 56, y: 12, width: 56, height: 56 });

// Measured: right of it the window part (the closed panel's toggle) and the layout's 12.
noteTitlebar("end", 28); noteTitlebar("panel", 600);
assert.deepEqual(plain(detailsAnchor(viewport, 1, false)), { x: 1532, y: 6, width: 28, height: 28 });
// The panel open: its width, its 8 each side and the 1 divider too.
assert.deepEqual(plain(detailsAnchor(viewport, 1, true)), { x: 1600 - 28 - 12 - 617 - 28, y: 6, width: 28, height: 28 });
// Zoomed 1.25: what was measured is in zoomed px already; the layout's numbers scale.
noteTitlebar("end", 35); noteTitlebar("panel", 750);
assert.deepEqual(plain(detailsAnchor(viewport, 1.25, true)), { x: 1600 - 35 - 15 - 750 - 21.25 - 35, y: 7.5, width: 35, height: 35 });
console.log("titlebar ok");
