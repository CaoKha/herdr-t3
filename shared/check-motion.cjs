// A list's motion (motion.js) in a fake kit: rows that come and go ease, and too many at once just show.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const kit = require("./check-kit.js");
const element = kit.elements();

const context = vm.createContext({ div: () => element(), svg: () => element("svg"), FADE: {} });
vm.runInContext(kit.strip(fs.readFileSync(path.join(__dirname, "motion.js"), "utf8")) + "\nglobalThis.motion = { planMotion, leavingRows };", context);
const { planMotion, leavingRows } = context.motion;
const afters = [];
const cx = { notify() {}, timer: { after: (_ms, fn) => { afters.push(fn); return { cancel() {} }; } } };
const later = () => afters.splice(0).forEach((fn) => fn(cx));
const rows = (...keys) => keys.map((key) => ({ key, h: 30, ghost: () => element().id(`ghost-${key}`) }));

// A row moved slides from where it was, a new one fades in riding the row above it, a gone one leaves inert where it was.
{
  const view = {};
  planMotion(view, rows("a", "b", "c"), cx);
  assert.deepEqual(kit.plain(view.motion.fly), {}, "the first frame records the rows without playing");
  planMotion(view, rows("n", "c", "a"), cx);
  assert.deepEqual(kit.plain(view.motion.fly), { n: { top: -30, fade: true }, c: { top: 30 }, a: { top: -60 } });
  assert.deepEqual(kit.plain(leavingRows(view).map((n) => [n.items[0].key, n.style.top, n.style.opacity])), [["ghost-b", 30, 1]]);
  later();
  assert.deepEqual([kit.plain(view.motion.fly), view.motion.exits.length], [{}, 0], "let go after a frame, the leaving rows gone once faded");
}

// Past 40 rows coming and going at once, they just show: that many transitions at a time is a redraw, not a motion.
{
  const view = {}, many = (n) => rows("a", ...Array.from({ length: n }, (_, i) => `n${i}`));
  planMotion(view, rows("a"), cx);
  planMotion(view, many(40), cx);
  assert.equal(Object.keys(view.motion.fly).length, 40, "40 still ease");
  const big = {};
  planMotion(big, rows("a"), cx);
  planMotion(big, many(41), cx);
  assert.deepEqual([Object.keys(big.motion.fly).length, big.motion.exits.length], [0, 0]);
  later();
}

console.log("ok: a list's rows slide, fade in and leave; more than 40 at once just show.");
