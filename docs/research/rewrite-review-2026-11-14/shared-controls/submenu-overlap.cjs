// Counterexample: a narrow Files page, a crumb menu away from the left edge; level 1 covers level 0.
const fs = require("fs"), path = require("path"), vm = require("vm");
const dir = process.argv[2];
function element() {
  const node = { items: [], handlers: {}, style: {} };
  const proxy = new Proxy(node, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => { if (key === "when") { if (args[0]) args[1](proxy); } else if (key === "children") node.items.push(...args[0]);
      else if (key === "child") node.items.push(args[0]); else if (key.startsWith("on_")) node.handlers[key] = args[args.length - 1];
      else if (key === "id") node.key = args[0]; else node.style[key] = args[0]; return proxy; };
  } });
  return proxy;
}
const strip = f => fs.readFileSync(path.join(dir, f), "utf8").replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ");
const kit = vm.createContext({ div: element, h_flex: element, v_flex: element, svg: element, settings: () => ({ zoom: 1 }), Date, run() {}, notify() {}, exec: async () => ({ code: 0 }) });
vm.runInContext(strip("list.js") + strip("submenu.js") + strip("file-menu.js") + "\nglobalThis.view = fileMenuView;", kit);
const find = (n, key) => n?.key === key ? n : (n?.items ?? []).reduce((hit, c) => hit ?? find(c, key), null);
const kids = [{ id: "docs/a", label: "a" }];
const items = [{ id: "docs", label: "docs", children: kids }, { id: "x", label: "x" }];
for (const [w, x] of [[464, 150], [464, 12], [626, 128]]) {
  const fv = { menu: { x, y: 10, lv: [{ at: -1, open: "docs", intent: {} }, { at: -1, open: null, intent: {} }] } };
  const root = kit.view(fv, { selected: "s" }, "m", items, {}, { width: w, height: 600 });
  const l0 = find(root, "file-menu-panel-0").style.left, l1 = find(root, "file-menu-panel-1").style.left;
  console.log(`page ${w}, menu at ${x}: level0 ${l0}..${l0 + 220}, level1 ${l1}..${l1 + 220}, overlap ${Math.max(0, 220 - Math.abs(l1 - l0))}px`);
}
