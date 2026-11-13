const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function element() {
  const node = { key: null, children: [], style: {}, handlers: {} };
  const proxy = new Proxy(node, { get: (target, key) => key in target ? target[key] : (...args) => {
    if (key === "when") { if (args[0]) args[1](proxy); }
    else if (key === "id") node.key = args[0];
    else if (key === "child") node.children.push(args[0]);
    else if (String(key).startsWith("on_")) node.handlers[args.length === 2 ? `${key}:${args[0]}` : key] = args.at(-1);
    else node.style[key] = args.length === 1 ? args[0] : args;
    return proxy;
  } });
  return proxy;
}
const find = (node, id) => node?.key === id ? node : node?.children?.map(child => find(child, id)).find(Boolean);
const load = name => fs.readFileSync(`${__dirname}/${name}.js`, "utf8").replace(/^import [\s\S]*?;\r?\n/gm, "").replace(/^export /gm, "");
const t = { foreground: "#eeeeee", dim: "#aaaaaa", border: "#555555", raised: "#333333", input: "#444444" };
const context = vm.createContext({
  View: class {}, div: element, svg: element, image: element, h_flex: element, v_flex: element,
  shared: () => "Finder", KEY: { openTarget: "t3.openTarget" }, window: () => ({ platform: "macos" }),
  knownTargets: () => null, theme: () => t,
  stop: (_v, _t, _id, el) => el, tip: (_v, _t, _id, _label, el) => el,
});
vm.runInContext(load("button") + "\nconst drawButton = button;\n" + load("main").replace("default class", "globalThis.Mod = class"), context);
const view = new context.Mod();
view.targets = ["Finder"];
let tree = view.openControl({ on: null, file: "file.js" }, t);
const primary = find(tree, "t3-files-open-in"), more = find(tree, "t3-files-open-more");
assert.equal(primary.style.h, 28, "Open in is centered in the same 28px geometry as adjacent controls");
assert.equal(primary.style.w, 28);
assert.equal(primary.style.rounded, 8);
assert.equal(primary.style.border_1, undefined, "Open in shares the toolbar's ghost style, not its former outlined box");
assert.ok(more, "one target still keeps the arrow slot");
assert.equal(more.style.h, 28);
assert.ok(primary.style.cursor_pointer && more.style.cursor_pointer, "clickable halves never inherit the Editor I-beam");
let selected = null;
view.browse = (_st, kind) => { selected = kind; };
more.handlers.on_click({}, { stop_propagation() {}, spawn() {} });
assert.equal(selected, "targets");
tree = view.openControl({ on: "remote", file: "file.js" }, t);
assert.ok(find(tree, "t3-files-open-more"), "remote state keeps both fixed slots");
assert.equal(find(tree, "t3-files-open-more").handlers.on_click, undefined, "remote editor launch is disabled");
assert.equal(find(tree, "t3-files-open-in").handlers.on_click, undefined);
view.menu = { kind: "targets" };
context.knownTargets = () => ["Finder", "VSCodium"];
assert.deepEqual(Array.from(view.menuItems({}, ""), row => row.id), ["Finder", "VSCodium"], "a hot-reloaded Files view uses the completed shared discovery, not its stale startup list");
console.log("ok: Files Open in fixed split slots, house button geometry, pointer and remote disabled state");
