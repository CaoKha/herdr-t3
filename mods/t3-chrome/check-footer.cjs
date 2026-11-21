const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { elements, find, fire, strings, bundle, plain } = require("./check-kit.js");

const el = elements(), calls = [], spaces = [], panes = [], saved = {}, app = {};
const theme = { chrome: "#111111", dim: "#777777", foreground: "#ffffff", accent: "#abcdef" };
let now = 10000, notifies = 0, boundKeys = [];
const cx = { notify() { notifies++; }, stop_propagation() {}, focus_handle: () => ({ is_focused: () => false }) };
const scope = vm.createContext({
  View: class {}, div: el, h_flex: el, svg: src => el("svg", src), theme: () => theme,
  props: () => ({ footer: true }), settings: () => ({ zoom: 2 }), updates: () => ({ app }),
  spaces: () => spaces, panes: () => panes, shared: key => saved[key], keys: () => boundKeys, window: () => ({ platform: "macos" }),
  run: (name, args) => calls.push([name, args === undefined ? null : plain(args)]), Date: { now: () => now },
});
vm.runInContext(bundle(file => fs.readFileSync(__dirname + "/" + file, "utf8")), scope);
const tips = new Map();
vm.runInContext("const drawButton = button; tip = globalThis.recordTip;", Object.assign(scope, {
  recordTip: (_v, _t, id, label, button, options) => { tips.set(id, [label, plain(options ?? {})]); return button; },
}));
const view = new scope.Mod(), render = () => view.render(cx), cleanUp = () => find(render(), "clean-up");
view.init({}, cx);
spaces.push({ id: "one", machine: null, tabs: [{ id: "tab-one" }] });
panes.push({ tab: "tab-one" });

// Clean up opens at once: its dialog names what closes, and t3-tabs says when there's nothing to clean up.
const icon = cleanUp();
assert.ok(icon, "Clean up is in the footer");
assert.equal(icon.style.w, 32);
assert.equal(icon.style.h, 32);
assert.equal(icon.items[0].source, "mods/t3-chrome/icons/trash-2.svg");
assert.deepEqual(strings(icon), []);
assert.deepEqual(tips.get("clean-up"), ["Clean up", { action: "t3-tabs.cleanup" }]);
const buttons = find(render(), "footer-buttons");
assert.equal(buttons.style.gap, 4);
assert.deepEqual(buttons.items.map(button => button.key), ["settings", "t3-settings", "clean-up"]);

saved["t3.notice"] = { gen: 1, at: now, action: "Settled", count: 3, shown: true, live: true };
assert.ok(find(render(), "undo-notice-undo"));
assert.ok(cleanUp(), "still there beside Undo");
delete saved["t3.notice"];

fire(cleanUp(), "on_click", {}, cx);
assert.deepEqual(calls.map(([name]) => name), ["t3-tabs.cleanup"]);

// The footer's Undo notice fits its summary whole or omits it; it never truncates to "…".
const zoom = 2;
boundKeys = [{ action: "t3-tabs.undo", keys: "cmd-shift-z" }];
// Available slot width is measured even before any notice arrives.
fire(find(render(), "footer-notice-slot"), "on_size_change", { width: 160 * zoom }, cx);
saved["t3.notice"] = { gen: 2, at: now, action: "Unpinned", count: 12, shown: true, live: true };
let tree = render();
let note = find(tree, "undo-notice-2");
assert.deepEqual(strings(note), ["Unpinned 12,", "⇧⌘Z to undo"], "unmeasured summary defaults to shown");
assert.equal("truncate" in find(note, "undo-notice-summary").style, false, "summary never truncates");

// Sufficient room: 70 + 4 + 65 = 139 <= 160.5.
fire(find(tree, "undo-summary-measure-Unpinned 12,"), "on_size_change", { width: 70 * zoom }, cx);
fire(find(tree, "undo-notice-undo"), "on_size_change", { width: 65 * zoom }, cx);
tree = render();
note = find(tree, "undo-notice-2");
assert.deepEqual(strings(note), ["Unpinned 12,", "⇧⌘Z to undo"], "summary renders whole when room is sufficient");
assert.equal("truncate" in find(note, "undo-notice-summary").style, false);

// Identical measurements do not trigger redraw loops.
notifies = 0;
fire(find(tree, "footer-notice-slot"), "on_size_change", { width: 160 * zoom }, cx);
fire(find(tree, "undo-summary-measure-Unpinned 12,"), "on_size_change", { width: 70 * zoom }, cx);
fire(find(tree, "undo-notice-undo"), "on_size_change", { width: 65 * zoom }, cx);
assert.equal(notifies, 0, "unchanged widths do not notify");

// Narrow room: 70 + 4 + 65 = 139 > 120.5 -> summary hidden whole, Undo stays with full accessibility label.
fire(find(tree, "footer-notice-slot"), "on_size_change", { width: 120 * zoom }, cx);
tree = render();
note = find(tree, "undo-notice-2");
assert.equal(find(note, "undo-notice-summary"), null, "summary is omitted whole when narrow");
assert.deepEqual(strings(note), ["⇧⌘Z to undo"]);
assert.equal(find(note, "undo-notice-undo").style.accessibility_label, "Undo: Unpinned 12 agents");

// Shorter summary at the same narrow width: 42 + 4 + 65 = 111 <= 120.5 -> reappears whole.
saved["t3.notice"] = { gen: 3, at: now, action: "Settled", count: 1, shown: true, live: true };
tree = render();
fire(find(tree, "undo-summary-measure-Settled,"), "on_size_change", { width: 42 * zoom }, cx);
tree = render();
note = find(tree, "undo-notice-3");
assert.deepEqual(strings(note), ["Settled,", "⇧⌘Z to undo"], "shorter summary fits and shows");
assert.equal("truncate" in find(note, "undo-notice-summary").style, false);

// Back to longer summary (already measured at 70) -> hidden immediately; widening room brings it back.
saved["t3.notice"] = { gen: 4, at: now, action: "Unpinned", count: 12, shown: true, live: true };
tree = render();
note = find(tree, "undo-notice-4");
assert.deepEqual(strings(note), ["⇧⌘Z to undo"], "known wide summary hides immediately in narrow slot");
fire(find(tree, "footer-notice-slot"), "on_size_change", { width: 160 * zoom }, cx);
tree = render();
note = find(tree, "undo-notice-4");
assert.deepEqual(strings(note), ["Unpinned 12,", "⇧⌘Z to undo"], "summary reappears when slot widens");
delete saved["t3.notice"];

console.log("ok: Clean up footer button, tooltip, and Undo notice fit");
