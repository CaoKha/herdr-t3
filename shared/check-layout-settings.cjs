// The layout's settings (layout-settings.js): the text size every T3 size scales by, and how a size scales.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const load = (stored, herdr) => {
  const c = vm.createContext({ KEY: { settings: "t3.settings" }, shared: (key) => (key === "t3.settings" ? stored : undefined), settings: () => herdr });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "layout-settings.js"), "utf8").replace(/^import [^;]*;\r?\n/gm, "").replace(/^export /gm, "")
    + "\nglobalThis.s = { ui, textSize, t3Settings };", c);
  return c.s;
};

const plain = load(undefined, {});
assert.equal(plain.textSize(), 13, "neither set: T3's 13");
for (const n of [12, 12.5, 13, 13.5, 28, 7.2]) assert.equal(plain.ui(n), n, `at 13, ${n} as written`);
assert.equal(plain.t3Settings().textSize, null);

const herdr = load(undefined, { ui_font_size: 14 });
assert.equal(herdr.textSize(), 14, "Herdr's interface size when T3 sets none");
assert.deepEqual([13, 12, 11, 12.5, 28, 36].map(herdr.ui), [14, 13, 12, 13, 30, 39], "scaled by 14/13, whole px");

const own = load({ textSize: 16 }, { ui_font_size: 14 });
assert.equal(own.textSize(), 16, "Settings' Text size over Herdr's");
assert.deepEqual([13, 12, 20, 28].map(own.ui), [16, 15, 25, 34]);
assert.equal(load({ textSize: null }, { ui_font_size: 15 }).textSize(), 15, "Default (null) follows Herdr's");

console.log("ok: layout settings: the text size and how a size scales");
