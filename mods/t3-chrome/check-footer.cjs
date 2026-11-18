const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { elements, find, fire, strings, bundle, plain } = require("./check-kit.js");

const el = elements(), calls = [], spaces = [], panes = [], saved = {}, app = {};
const theme = { chrome: "#111111", dim: "#777777", foreground: "#ffffff", accent: "#abcdef" };
let now = 10000, notified = 0;
const cx = { notify: () => notified++, stop_propagation() {}, focus_handle: () => ({ is_focused: () => false }) };
const scope = vm.createContext({
  View: class {}, div: el, h_flex: el, svg: src => el("svg", src), theme: () => theme,
  props: () => ({ footer: true }), settings: () => ({ zoom: 2 }), updates: () => ({ app }),
  spaces: () => spaces, panes: () => panes, shared: key => saved[key],
  run: (name, args) => calls.push([name, plain(args)]), Date: { now: () => now },
});
vm.runInContext(bundle(file => fs.readFileSync(__dirname + "/" + file, "utf8")), scope);
const tips = new Map();
vm.runInContext("const drawButton = button; tip = globalThis.recordTip;", Object.assign(scope, {
  recordTip: (_v, _t, id, label, button, options) => { tips.set(id, [label, plain(options ?? {})]); return button; },
}));
const view = new scope.Mod(), render = () => view.render(cx), running = () => find(render(), "running");
view.init({}, cx);
const addSpace = (id, extra) => spaces.push({ id, machine: null, tabs: [{ id: `tab-${id}` }], ...extra });
addSpace("known", { named: true, name: "Home" });
addSpace("named", { named: true, name: "Home\u200b" });
saved["t3-tabs.home"] = "known";
panes.push({ tab: "tab-known" }, { tab: "tab-named" });

const empty = running();
assert.ok(empty, "Running is available even with only Home open");
assert.equal(empty.style.w, 32);
assert.equal(empty.style.h, 32);
assert.equal(empty.items[0].source, "mods/t3-chrome/icons/layers.svg");
assert.deepEqual(strings(empty), []);
assert.equal(tips.get("running")[1].hint, "0 spaces, 0 terminals");

addSpace("one");
panes.push({ tab: "tab-one" });
assert.deepEqual(strings(running()), ["1 space"]);
assert.equal(tips.get("running")[1].hint, "1 space, 1 terminal");
addSpace("two", { machine: "remote", named: true, name: "Home\u200b" });
addSpace("three");
panes.push({ tab: "tab-two" }, { tab: "tab-two" }, { tab: "tab-other" });
assert.deepEqual(strings(running()), ["3 spaces"]);
assert.deepEqual(tips.get("running"), ["Running", { action: "mod.open:t3-running", hint: "3 spaces, 3 terminals", off: false }]);
const buttons = find(render(), "footer-buttons");
assert.equal(buttons.style.gap, 4);
assert.deepEqual(buttons.items.map(button => button.key), ["settings", "t3-settings", "running"]);

saved["t3.notice"] = { gen: 1, at: now, action: "Settled", count: 3, shown: true, live: true };
assert.ok(find(render(), "undo-notice-undo"));
assert.deepEqual(strings(running()), ["3"], "keep the whole count beside Undo");
delete saved["t3.notice"];
app.ready = "1.0";
assert.ok(find(render(), "app-update"));
assert.deepEqual(strings(running()), ["3"], "keep the whole count beside Update");
delete app.ready;
fire(render(), "on_size_change", { width: 438 }, cx);
assert.equal(notified, 1);
assert.deepEqual(strings(running()), ["3"], "measure the footer in logical pixels");
fire(render(), "on_size_change", { width: 438 }, cx);
assert.equal(notified, 1, "an unchanged width needs no redraw");
fire(render(), "on_size_change", { width: 440 }, cx);
assert.deepEqual(strings(running()), ["3 spaces"]);

fire(running(), "on_mouse_down:left", { bounds: {} }, cx);
fire(running(), "on_click", {}, cx);
assert.deepEqual(calls, [["mod.open", { name: "t3-running" }]]);
assert.equal(running().style.bg, "#ffffff12", "Running stays on while its popup is open");
assert.equal(tips.get("running")[1].off, true);
now += 1000;
fire(running(), "on_mouse_down:left", { bounds: {} }, cx);
saved["t3-running.closed"] = now;
fire(running(), "on_click", {}, cx);
assert.equal(calls.length, 1, "the click that closes Running does not reopen it");
assert.equal(running().style.bg, undefined);
console.log("ok: Running footer states, width, tooltip and popup lifecycle");
