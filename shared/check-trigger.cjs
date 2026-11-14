// A button that opens a popup (trigger.js) in a fake kit, with the real tip.js, focus.js and button.js: a second click closes
// what the first opened, and its label stays down while what it opened is up.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function element(kind = "div") {
  const node = { kind, items: [], handlers: {}, style: {} };
  const proxy = new Proxy(node, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => {
      if (key === "when") { if (args[0]) args[1](proxy); }
      else if (key === "child") node.items.push(args[0]);
      else if (key === "content") node.items.push(args[0]);
      else if (key === "id") node.key = args[0];
      else if (key === "on_mouse_down") node.handlers[`${key}:${args[0]}`] = args[1];
      else if (key.startsWith("on_")) node.handlers[key] = args[0];
      else node.style[key] = args[0];
      return proxy;
    };
  } });
  return proxy;
}
const find = (n, key) => n?.key === key ? n : (n?.items ?? []).map((c) => find(c, key)).find(Boolean);
const findTip = (n) => n?.key?.startsWith?.("tip-body-") ? n : (n?.items ?? []).map(findTip).find(Boolean);

const state = {};
let now = 1000;
const src = ["store.js", "focus.js", "tip.js", "button.js", "trigger.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n")
  .replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ")
  + "\nglobalThis.tr = { trigger };";
const context = vm.createContext({
  div: () => element(), h_flex: () => element(), v_flex: () => element(), svg: () => element("svg"),
  Popup: { new: (id, child) => { const p = element("popup"); p.key = id; p.items.push(child); return p; } },
  shared: (k) => state[k], setShared: (k, v) => { state[k] = v; }, keys: () => [], window: { mouse_position: () => null, viewport_size: () => null },
  Date: { now: () => now },
});
vm.runInContext(src, context);
const { trigger } = context.tr;

const cx = { notify() {}, stop_propagation() {}, timer: { after: (_ms, fn) => { fn(cx); return { cancel() {} }; }, every: () => ({ cancel() {} }) } };
const t = new Proxy({}, { get: (_t, k) => String(k) });
const view = { fs: { modal: false, handles: new Map(), free: [] } };
const CLOSED = "test.closed";
let opened = 0, popupUp = false;
const draw = () => trigger(view, t, "menu-btn", { icon: "x.svg", label: "Menu", hint: "More below", open: popupUp, closed: CLOSED,
  onOpen: () => { opened++; popupUp = true; } });
const press = () => { const b = find(draw(), "menu-btn"); b.handlers["on_mouse_down:left"]({ bounds: { x: 0, y: 0, width: 28, height: 28 } }, cx); return b; };
// The native popup closes on any press outside it, the button's too, and stamps its key as it goes.
const outsidePress = () => { if (popupUp) { popupUp = false; state[CLOSED] = now; } };

// Closed: a click opens it.
press().handlers.on_click(null, cx);
assert.equal(opened, 1, "a click opens the popup");
assert.ok(find(draw(), "menu-btn").style.bg, "open: the button stays on");

// Open: the press that brings the second click closes it, and the click mustn't open it again.
now += 400;
const b = press();
outsidePress();
b.handlers.on_click(null, cx);
assert.equal(opened, 1, "a second click closes it, not closes and reopens it");
assert.equal(popupUp, false);

// Hovered while closed, the label shows, with its second line.
const hover = () => { const el = draw(); find(el, "tip-over-menu-btn").handlers.on_hover(true, cx); find(el, "menu-btn").handlers.on_hover(true, cx); };
hover();
assert.ok(findTip(draw()), "closed and hovered: its label shows");
// Open and hovered: no label over what it opened.
popupUp = true;
hover();
assert.equal(findTip(draw()), undefined, "open: no label");

// Unset, `open` is whether this button's popup is up: on from its opening until its close stamps the key.
popupUp = false; view.hot = null;
const kept = () => find(trigger(view, t, "kept", { icon: "x.svg", label: "Sort", closed: CLOSED, onOpen: () => {} }), "kept");
now += 400;
kept().handlers["on_mouse_down:left"]({ bounds: null }, cx);
now += 10;
kept().handlers.on_click(null, cx);
assert.ok(kept().style.bg, "opened: on");
now += 400; state[CLOSED] = now;
assert.equal(kept().style.bg, undefined, "closed: off");
console.log("trigger ok");
