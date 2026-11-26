// What the Files and Review pages show with nothing else to (panel-states.js), in a fake kit: the failed bar's one action.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const kit = require("./check-kit.js");
const element = kit.elements(), { find, fire, strings } = kit;

const state = {};
const context = vm.createContext({ ui: (n) => n, 
  div: () => element(), svg: (src) => element("svg", src), h_flex: () => element(), v_flex: () => element(),
  Popup: { new: (id, child) => element("popup").id(id).child(child) },
  shared: (k) => state[k], setShared: (k, v) => { state[k] = v; }, keys: () => [], window: () => ({}),
});
const src = (f) => kit.strip(fs.readFileSync(path.join(__dirname, f), "utf8"));
// panel-states.js imports the button under another name.
vm.runInContext(["store.js", "color.js", "tip.js", "button.js", "focus.js"].map(src).join("\n") + "\nconst drawButton = button;\n" + src("panel-states.js")
  + "\nglobalThis.states = { errorBar, noticeBar, loadingState };", context);
const { errorBar, noticeBar, loadingState } = context.states;
const t = { ansi1: "#ff0000", foreground: "#eeeeee", dim: "#888888", working: "#00ff00", accent: "#0000ff" };
const cx = { notify() {}, stop_propagation() {} };

// Retry is a plain button: its words brighten with the pointer through the view's `hot`, as an svg takes no hover style, and
// its press stays in the bar.
{
  const view = {}, tried = [];
  const bar = () => errorBar(t, "page-error", "Couldn't read it", () => tried.push("retry"), view);
  assert.deepEqual(strings(bar()), ["Couldn't read it", "Retry"]);
  assert.equal(find(bar(), "page-error").style.text_color, "#ff0000", "the failure in ansi1, on a wash of it");
  fire(find(bar(), "page-error-retry"), "on_hover", true, cx);
  assert.equal(view.hot, "page-error-retry");
  fire(find(bar(), "page-error-retry"), "on_click", {}, cx);
  assert.deepEqual(tried, ["retry"]);
  fire(find(bar(), "page-error-retry"), "on_hover", false, cx);
  assert.equal(view.hot, null, "and goes out with it");
}

// A bar drawn without a view (a page that tracks no hover) still acts.
{
  const done = [];
  fire(find(noticeBar(t, "note", "Changed on disk", "#00ff00", "reload", "Reload", () => done.push("reload")), "note-reload"), "on_click", {}, cx);
  assert.deepEqual(done, ["reload"]);
}

// Loading stands still: the caller's own arc, announced as a status. A turning one repaints the window every frame.
{
  const loading = loadingState("mods/t3-x", t, "page-loading", "Loading files…");
  const arc = kit.walk(loading).find((n) => n.kind === "svg");
  assert.deepEqual([arc.source, "spin" in arc.style, loading.style.role, strings(loading)], ["mods/t3-x/icons/loader-circle.svg", false, "status", ["Loading files…"]]);
}

console.log("ok: a failed page's bar lights and retries; loading stands still.");
