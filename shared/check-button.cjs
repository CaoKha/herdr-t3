// The buttons' colors and states (docs/internals/t3-tokens.md「按钮」): primary on `solid`, never `accent`; a ghost's fill by
// its surface; disabled faded, with no hover and no click.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = fs.readFileSync(path.join(__dirname, "button.js"), "utf8")
  .replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ")
  + "\nglobalThis.b = { button, radiusOf, DISABLED, split, ghostButton };";
// An element that records its calls; `when` runs its branch, `hover` records the style it sets.
const element = (calls = []) => new Proxy({ calls }, { get: (target, key) => key === "calls" ? target.calls : (...args) => {
  if (key === "when") return args[0] ? args[1](element(calls)) : element(calls);
  if (key === "hover") { const h = element([]); args[0](h); calls.push(["hover", h.calls]); return element(calls); }
  calls.push([key, ...args]);
  return element(calls);
} });
// tip.js's glow.
const glow = (view, id) => (on) => { view.hot = on ? id : null; };
const context = vm.createContext({ h_flex: () => element(), div: () => element(), svg: (p) => element([["svg", p]]), glow });
vm.runInContext(src, context);
const { button, split, ghostButton } = context.b;
const t = { solid: "SOLID", solid_foreground: "INK", raised: "RAISED", input: "INPUT", foreground: "#fff", dim: "DIM",
  hover: "HOVER", selected: "SELECTED", border: "BORDER", ansi1: "RED", accent: "ACCENT", accent_foreground: "ACCENT_FG" };
const calls = (o) => button(t, "b", o).calls;
const arg = (c, key) => c.filter(([k]) => k === key).map(([, v]) => v);

const primary = calls({ variant: "primary", size: "default", text: "Apply" });
assert.deepEqual(arg(primary, "bg"), ["SOLID"]);
assert.deepEqual(arg(primary, "text_color"), ["INK"]);
assert.ok(!JSON.stringify(primary).includes("ACCENT"), "no button fills with accent");
assert.deepEqual([arg(primary, "h")[0], arg(primary, "px")[0], arg(primary, "rounded")[0]], [32, 12, 8], "T3's default: 12 in");
assert.deepEqual(arg(primary, "border_1"), [], "primary draws no border over its fill");
assert.deepEqual(arg(calls({ variant: "outline", size: "default", text: "Cancel" }), "px"), [11], "11 in from the 1px border");
assert.deepEqual(primary.find(([k]) => k === "hover")[1], [["opacity", 0.9]]);

const danger = calls({ variant: "danger", text: "Delete" });
assert.deepEqual([arg(danger, "bg")[0], arg(danger, "text_color")[0], arg(danger, "border_color")[0]], ["RAISED", "RED", "INPUT"]);

const off = calls({ variant: "primary", text: "Opening…", disabled: true, act: () => {} });
assert.deepEqual(arg(off, "opacity"), [0.64]);
assert.ok(!off.some(([k]) => k === "hover" || k === "on_click"), "disabled: no hover, no click");
assert.deepEqual(arg(off, "bg"), ["SOLID"], "disabled keeps its fill");

assert.deepEqual(calls({ icon: "x.svg", label: "Close" }).find(([k]) => k === "hover")[1], [["bg", "HOVER"]], "on chrome, the theme's hover");
assert.deepEqual(calls({ icon: "x.svg", label: "Close", surface: "card" }).find(([k]) => k === "hover")[1], [["bg", "#fff12"]], "on a card, 7% of the text");
const open = calls({ icon: "x.svg", label: "Sort", on: true, surface: "card" });
assert.deepEqual(arg(open, "bg"), ["#fff1f"]);
assert.deepEqual(arg(open, "text_color"), ["#fff"], "on is lit");
assert.ok(!open.some(([k]) => k === "hover"));
assert.deepEqual(arg(calls({ icon: "x.svg", label: "Close" }), "text_color"), ["DIM"]);
assert.deepEqual(arg(calls({ icon: "x.svg", label: "Close", hot: true }), "text_color"), ["#fff"]);

const square = calls({ icon: "x.svg", label: "Close", size: "micro" });
assert.deepEqual([arg(square, "h")[0], arg(square, "w")[0], arg(square, "rounded")[0]], [20, 20, 4]);
assert.deepEqual(arg(square, "accessibility_label"), ["Close"]);
assert.deepEqual(arg(square, "px"), [], "an icon alone is a square, no padding");
const marked = calls({ icon: "x.svg", label: "Show sidebar", size: "sm", wide: true });
assert.deepEqual([arg(marked, "w"), arg(marked, "px"), arg(marked, "gap")], [[], [10], [6]], "wide: padded for what the caller adds");
assert.deepEqual(arg(calls({ variant: "plain", text: "Retry", surface: "card" }), "text_color"), ["#fff"], "plain: T3's ghost, words in foreground");
assert.ok(!calls({ icon: "x.svg", label: "Pin", surface: "row", hot: true }).some(([k]) => k === "hover" || k === "bg"), "in a row it only lights");
assert.deepEqual(calls({ icon: "x.svg", label: "Close", surface: "tab", size: "tiny" }).find(([k]) => k === "hover")[1], [["bg", "RAISED"]]);
let clicked = 0;
calls({ text: "Go", act: () => clicked++ }).find(([k]) => k === "on_click")[1](null, null);
assert.equal(clicked, 1);
assert.deepEqual(arg(calls({ icon: "x.svg", label: "Wrap", on: true, disabled: true, surface: "card" }), "bg"), [], "a disabled toggle isn't pressed: no on fill");

// split(): one group, so its fill is the group's, with the seam; its chevron always shows, as T3's.
const flat = (c) => c.flatMap((call) => call[0] === "child" ? flat(call[1].calls) : [call]);
const pair = (o) => { const g = flat(split(t, { id: "g", mainId: "m", moreId: "x", chevron: "c.svg", ...o }, (m) => m, (x) => x).calls); return { bg: new Set(arg(g, "bg")), svg: arg(g, "svg") }; };
assert.equal(pair({}).bg.size, 0, "at rest: no fill, no seam");
assert.deepEqual(pair({}).svg, ["c.svg"], "at rest the chevron still says there's a menu");
assert.ok(pair({ hot: "main" }).bg.has("#fff12") && pair({ hot: "main" }).bg.has("BORDER"), "hovered: 7% under both halves, the seam shown");
assert.ok(pair({ on: true }).bg.has("#fff1f"), "menu open: 12%");
assert.equal(pair({ hot: "main", locked: true }).bg.size, 0, "a locked main half doesn't light the pair");

// ghostButton(): the wired icon button. Hovering lights its icon, a click runs it; disabled, neither.
{
  const view = {}, cx = { stop_propagation() {} };
  let ran = 0;
  const draw = (disabled = false) => ghostButton(view, t, "g", { icon: "x.svg", label: "Tree", act: () => ran++, disabled });
  const handler = (el, key) => el.calls.find(([k]) => k === key)?.at(-1);
  assert.deepEqual(arg(draw().calls, "text_color"), ["DIM"]);
  handler(draw(), "on_hover")(true);
  assert.deepEqual(arg(draw().calls, "text_color"), ["#fff"], "hovered, its icon lights");
  handler(draw(), "on_click")(null, cx);
  assert.equal(ran, 1);
  view.hot = null;
  const off = draw(true).calls;
  assert.ok(!off.some(([k]) => k === "on_click" || k === "on_hover"), "disabled: no click, no hover");
}
console.log("button ok");
