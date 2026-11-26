// A hover label (tip.js) in a fake kit: what a draw costs, its timing, and a hover that goes with the pointer when its leave never comes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const kit = require("./check-kit.js");
const element = kit.elements(), { find, fire, strings } = kit;

let pointer = { x: 10, y: 110 }, bound = [], keyReads = 0;
const context = vm.createContext({ ui: (n) => n, 
  div: () => element(), v_flex: () => element(),
  Popup: { new: (id, child) => element("popup").id(id).child(child) },
  keys: () => { keyReads++; return bound; },
  window: Object.assign(() => ({ platform: "macos", active: true }), { mouse_position: () => pointer, viewport_size: () => ({ width: 1000, height: 800 }) }),
});
vm.runInContext(kit.strip(fs.readFileSync(path.join(__dirname, "tip.js"), "utf8")) + "\nglobalThis.tip = { tip, hoverKept, keyLabel, undoLabel };", context);
const { tip, hoverKept, keyLabel, undoLabel } = context.tip;

const watches = [], afters = [];
const cx = { notify() {}, timer: {
  every(ms, fn) { const w = { ms, fn, cancel() { w.gone = true; } }; watches.push(w); return w; },
  after(_ms, fn) { const w = { fn, cancel() { w.gone = true; } }; afters.push(w); return w; } } };
const later = () => afters.splice(0).filter((w) => !w.gone).forEach((w) => w.fn(cx));
const t = new Proxy({}, { get: (_t, k) => String(k) });

// A draw of many controls reads no bindings: every control with an action has a label, and a key shows only once its label opens.
{
  bound = [{ keys: "cmd-shift-o", action: "act-7" }];
  const view = {}, draw = () => Array.from({ length: 100 }, (_, i) => tip(view, t, `b${i}`, `Button ${i}`, element().id(`b${i}`), { action: `act-${i}` }));
  keyReads = 0;
  draw();
  assert.equal(keyReads, 0, `${keyReads} reads of every binding to draw 100 closed labels`);
  view.hot = "b7";
  fire(find(draw()[7], "tip-over-b7"), "on_hover", true, cx);
  later();
  keyReads = 0;
  assert.deepEqual(strings(draw()[7]), ["Button 7 (⇧⌘O)"], "open, its label names the key bound now");
  assert.equal(keyReads, 1, `${keyReads} reads for the one open label's draw`);
  fire(find(draw()[7], "tip-over-b7"), "on_hover", false, cx);
  later();
}

// A label waits, fades in once laid out, fades out before it goes, and comes back from the fade.
{
  const view = {}, draw = () => tip(view, t, "scope", "Filter by space", element().id("scope"), { below: true });
  const body = () => kit.walk(draw()).find((n) => n.key?.startsWith("tip-body-scope-"));
  const over = (on) => { view.hot = on ? "scope" : null; fire(find(draw(), "tip-over-scope"), "on_hover", on, cx); };
  over(true);
  assert.equal(body(), undefined, "not before its delay");
  later();
  const first = body();
  assert.equal(first.style.opacity, 0, "drawn clear first: a transition adopts the first value it sees");
  fire(first, "on_size_change", { width: 40, height: 20 }, cx);
  assert.deepEqual([body().style.opacity, body().style.top], [1, 0]);
  over(false);
  assert.deepEqual([body().style.opacity, body().style.top], [0, -4], "still up, fading back toward its control");
  over(true);
  assert.deepEqual([body().key, body().style.opacity], [first.key, 1], "back before it went: the same one fades back");
  later();
  assert.equal(body().style.opacity, 1, "its going was called off");
  over(false); later();
  assert.equal(body(), undefined, "gone: a clear label would still block what it covers");
  over(true); later();
  assert.notEqual(body().key, first.key, "reopened, a new id: a size reports only an id's first layout");
  over(false); later();
}

// A label goes when its leave never comes, and its control stops being lit.
{
  const view = {}, draw = () => tip(view, t, "scope", "Filter by space", element().id("scope"));
  const body = () => kit.walk(draw()).find((n) => n.key?.startsWith("tip-body-scope-"));
  const polling = () => watches.filter((w) => !w.gone).length, before = polling();
  const tick = () => watches.filter((w) => !w.gone).forEach((w) => w.fn(cx));
  view.hot = "scope";
  fire(find(draw(), "tip-over-scope"), "on_hover", true, cx);
  later();
  pointer = { x: 20, y: 10 };
  fire(find(draw(), "tip-over-scope"), "on_mouse_move", { position: pointer, bounds: { x: 0, y: 0, width: 40, height: 20 } });
  tick();
  assert.equal(view.hot, "scope", "the pointer's on it");
  assert.ok(body());
  pointer = { x: 20, y: 300 };
  tick();
  assert.equal(view.hot, null);
  assert.equal(body().style.opacity, 0, "it fades");
  later();
  assert.equal(body(), undefined);
  assert.equal(polling(), before, "nothing left polling");
}

// A hover with no label or card to take it down (a group's chevron, a tab's ×) goes with the pointer even when its leave
// never comes.
{
  const view = {}, box = { x: 0, y: 100, width: 208, height: 32 };
  const row = () => hoverKept(view, "over", "sec-4", element().id("sec-4"));
  watches.length = 0;
  pointer = { x: 10, y: 110 };
  fire(row(), "on_hover", true, cx);
  // Two samples in one place: at rest, not stopped after a step that was heading out of the window.
  for (let i = 0; i < 2; i++) fire(row(), "on_mouse_move", { position: { x: 10, y: 110 }, bounds: box }, cx);
  watches.at(-1).fn(cx);
  assert.equal(view.over, "sec-4", "on it, it stays lit");
  pointer = { x: 10, y: 300 };
  watches.at(-1).fn(cx);
  assert.deepEqual([view.over, watches.at(-1).gone], [null, true], "off it, no leave needed");
  pointer = { x: 10, y: 110 };
  fire(row(), "on_hover", true, cx);
  fire(row(), "on_hover", false, cx);
  assert.equal(view.over, null);
  watches.at(-1).fn(cx);
  assert.equal(watches.at(-1).gone, true, "a real leave ends the watch too");
  // Another row taking the hover ends the first one's watch: one watch at most.
  fire(row(), "on_hover", true, cx);
  fire(hoverKept(view, "over", "sec-5", element().id("sec-5")), "on_hover", true, cx);
  assert.deepEqual([view.over, watches.filter((w) => !w.gone).length], ["sec-5", 1]);
}

// Keys as this platform names them, and the Undo notice's button with the first bound of its actions.
{
  assert.deepEqual([keyLabel("cmd-shift-o"), keyLabel("ctrl-alt-left"), keyLabel("cmd--"), keyLabel("G"), keyLabel("ctrl-x ctrl-s"), keyLabel(" ")],
    ["⇧⌘O", "⌃⌥Left", "⌘-", "⇧G", "⌃X ⌃S", ""]);
  bound = [{ keys: "cmd-z", action: "t3-tabs.undo" }];
  assert.deepEqual([undoLabel("t3-inbox.undo", "t3-tabs.undo"), undoLabel("t3-inbox.undo")], ["⌘Z to undo", "Undo"]);
}

console.log("ok: a label reads its key only when it opens, fades in and out, and goes with the pointer; so does a kept hover.");
