// Loads Running in a fake `herdr`: live spaces and their panes in 36px rows, space headers never navigate, Clean up probes idle shells.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const kit = require("./check-kit.js");
const element = kit.elements(), { find, strings } = kit;

const pi = { name: "Pi", key: "pi", agent: true }, vite = { name: "Vite", key: "vite", agent: false };
const zsh = { name: "zsh", key: "shell", shell: true };

let spaces = [], panes = [], agents = [], terms = [], hcMap = {}, isChecking = false;
const shared = {}, calls = [], overlays = [], closedOverlays = [];
const cx = {
  notify() {},
  stop_propagation() {},
  focus_handle: () => ({ focus() {}, is_focused: () => false }),
  spawn: (fn) => fn(cx),
  timer: { after: (_ms, fn) => fn(cx), every: () => ({ cancel() {} }) },
};

const context = vm.createContext({
  View: class {}, div: element, svg: element, image: element, h_flex: element, v_flex: element,
  Popup: { new: (id, child) => element("Popup", id).child(child) }, Input: { new: element },
  mouse_position: () => ({ x: 0, y: 0 }), keys: () => [],
  InputState: {
    new: () => {
      const on = {};
      let value = "";
      return {
        on: (e, f) => { on[e] = f; },
        value: () => value,
        focus() {},
        type(v) { value = v; on.change?.({}, cx); },
        submit() { on.submit?.({}, cx); },
      };
    },
  },
  checking: () => isChecking,
  settings: () => ({ zoom: 1 }),
  window: () => ({ platform: "macos", active: true }),
  spaces: () => spaces,
  panes: () => panes,
  agents: () => agents,
  terminals: () => [...terms],
  focused: () => {
    const active = spaces.find((s) => s.active);
    const tab = active?.tabs.find((c) => c.active);
    const p = panes.find((x) => x.tab === tab?.id && x.focused);
    return p ? { pane: p.pane, tab: tab.id, space: active.id } : null;
  },
  hc: async (args) => {
    calls.push(["hc", args]);
    const addr = args[1];
    if (!(addr in hcMap)) throw new Error("offline");
    return { code: 0, stdout: JSON.stringify(hcMap[addr]) };
  },
  run: (name, args) => calls.push([name, args ?? null]),
  openOverlay: (spec) => overlays.push(spec),
  closeOverlay: (id) => closedOverlays.push(id),
  props: () => ({ overlay: "o-run" }),
  theme: () => ({
    popover: "#111111", border: "#333333", foreground: "#eeeeee", muted: "#999999",
    dim: "#666666", selected: "#222222", accent: "#3b82f6", done: "#22c55e",
    working: "#eab308", blocked: "#f97316", raised: "#1a1a1a", input: "#2a2a2a",
  }),
  shared: (k) => shared[k],
  setShared: (k, v) => { shared[k] = v; },
  namer: () => (p) => p.label ?? p.program?.name ?? "Terminal",
  programOf: (p) => p.program,
  modStatus: () => null,
  projectMark: element,
});

const files = [
  "color.js", "store.js", "tree.js", "status-mark.js", "list.js",
  "space-arrival.js", "zoom.js", "focus.js", "tip.js", "button.js",
  "program.js", "menu.js", "palette.js", "main.js",
];
const src = files
  .map((f) => fs.readFileSync(path.join(__dirname, f), "utf8"))
  .join("\n")
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/^export (function|const) /gm, "$1 ")
  .replace("export default class", "globalThis.Mod = class");
vm.runInContext(src, context);

function resetFixture() {
  calls.length = 0;
  overlays.length = 0;
  closedOverlays.length = 0;
  for (const k of Object.keys(shared)) delete shared[k];
  shared["t3-tabs.home"] = "h";
  isChecking = false;
  spaces = [
    { id: "h", name: "Home\u200b", named: true, machine: null, active: false, tabs: [{ id: "th", active: true }] },
    { id: "s2", name: "api", machine: "vps", active: false, folder: "/srv/api", tabs: [{ id: "c2", name: "2", named: false, active: true }, { id: "c3", name: "3", named: false, active: false }] },
    { id: "s1", name: "web", machine: null, active: true, folder: "/work/web", tabs: [{ id: "c1", name: "Auth", named: true, active: true }] },
  ];
  panes = [
    { pane: "ph", tab: "th", mod: "t3-home", focused: true },
    { pane: "p1", tab: "c1", terminal: "t1", label: "Auth agent", program: pi, status: "working", focused: true, cwd: "/work/web" },
    { pane: "p2", tab: "c1", terminal: "t2", label: "Vite", program: vite, focused: false, cwd: "/work/web" },
    { pane: "p3", tab: "c2", terminal: "t3", label: "Settled fix", program: pi, status: "done", focused: true, cwd: "/srv/api" },
    { pane: "p4", tab: "c3", terminal: "t4", label: "zsh", program: zsh, focused: true, cwd: "/srv/api" },
  ];
  agents = [
    { address: "t1", pane: "p1", tab: "c1", space: "s1", status: "working" },
    { address: "t3", pane: "p3", tab: "c2", space: "s2", status: "done" },
  ];
  terms = [
    { address: "t1", turn: 1, labels: {} },
    { address: "t2", turn: 0, labels: {} },
    { address: "t3", turn: 2, labels: { settled: "100:2" } },
    { address: "t4", turn: 0, labels: {} },
  ];
  hcMap = {
    t2: { pid: 10, foreground: { pid: 99, name: "node" } },
    t4: { pid: 20, foreground: { pid: 20, name: "-zsh" } },
  };
}

const open = async () => {
  const m = new context.Mod();
  m.init({}, cx);
  await new Promise((r) => setTimeout(r, 5));
  return m;
};
const rowKeys = (m) => find(m.render(), "running-rows")?.items.map((n) => n.key) ?? [];
const press = (tree, key, modifiers = {}) => tree.handlers.on_key_down({ key, modifiers }, cx);
const take = () => JSON.parse(JSON.stringify(calls.splice(0).filter(([k]) => k !== "hc")));

(async () => {
  // 1. Active space first, Home omitted, space headers followed by indented panes; first pane highlighted.
  resetFixture();
  let m = await open();
  assert.deepEqual(rowKeys(m), ["space:s1", "pane:p1", "pane:p2", "space:s2", "pane:p3", "pane:p4"]);
  let tree = m.render();
  assert.equal(find(tree, "pane:p1").style.bg, "#222222", "opens highlighting the first pane row, never a space header");
  assert.equal(find(tree, "close-pane-p1"), null, "keyboard highlight keeps the status mark without pushing in a close button");
  m.hotPane = "p1";
  assert.ok(find(m.render(), "close-pane-p1"), "pointer hover swaps in the pane close button");
  m.hotPane = null;
  assert.equal(find(tree, "space:s1").style.bg, undefined);

  // 2. Clicking a space header navigates nowhere; its close button runs space.close; right-click opens the space menu.
  find(tree, "space:s2").handlers.on_click?.({}, cx);
  assert.deepEqual(take(), [], "clicking a space header never guesses which pane to enter");
  m.hotSpace = "s2";
  tree = m.render();
  find(tree, "close-space-s2").handlers.on_click({}, cx);
  assert.deepEqual([closedOverlays.pop(), take()], ["o-run", [["space.close", { id: "s2" }]]]);

  find(m.render(), "space:s2").handlers["on_mouse_down:right"]({}, cx);
  assert.equal(closedOverlays.pop(), "o-run");
  assert.deepEqual(JSON.parse(JSON.stringify(overlays.pop())), {
    mod: "t3-menu", kind: "popup", width: 220, height: 260, props: { tab: "space", target: { id: "s2" } },
  });

  // 3. Up/Down step across pane rows only (skipping space headers), Enter focuses, Ctrl+D closes pane, right-click opens agent/pane menu.
  resetFixture();
  m = await open();
  tree = m.render();
  press(tree, "down"); // p1 -> p2
  press(m.render(), "down"); // p2 -> skips space:s2 -> p3!
  assert.equal(find(m.render(), "pane:p3").style.bg, "#222222", "Down skips space:s2 header to land on pane:p3");
  m.input.submit();
  assert.deepEqual([closedOverlays.pop(), take()], ["o-run", [["pane.focus", { pane: "p3" }]]]);

  resetFixture();
  m = await open();
  press(m.render(), "up"); // wraps from p1 to p4!
  press(m.render(), "d", { control: true });
  assert.deepEqual([closedOverlays.pop(), take()], ["o-run", [["t3-tabs.close-pane:p4", null]]]);

  // Right-click on a top-level agent pane opens agent menu; on a non-agent pane opens pane menu.
  resetFixture();
  m = await open();
  find(m.render(), "pane:p3").handlers["on_mouse_down:right"]({}, cx);
  assert.deepEqual(JSON.parse(JSON.stringify(overlays.pop().props)), { tab: "agent", target: { address: "t3" } });
  find(m.render(), "pane:p2").handlers["on_mouse_down:right"]({}, cx);
  assert.deepEqual(JSON.parse(JSON.stringify(overlays.pop().props)), { tab: "pane", target: { pane: "p2", terminal: "t2" } });

  // 4. Search keeps matching panes under their space header, and shows all panes of a matching space.
  resetFixture();
  m = await open();
  m.input.type("vite");
  assert.deepEqual(rowKeys(m), ["space:s1", "pane:p2"]);
  m.input.submit();
  assert.deepEqual(take(), [["pane.focus", { pane: "p2" }]]);

  resetFixture();
  m = await open();
  m.input.type("vps");
  assert.deepEqual(rowKeys(m), ["space:s2", "pane:p3", "pane:p4"]);

  // 5. Target-binding safety: vanished pane clears highlight instead of focusing neighbour; stale query ignores old frame.
  resetFixture();
  m = await open();
  press(m.render(), "down"); // highlight p2
  const staleTree = m.render();
  panes.splice(2, 1); // remove p2
  m.input.submit();
  press(staleTree, "d", { control: true });
  find(staleTree, "pane:p2").handlers.on_click({}, cx);
  assert.deepEqual(take(), [], "vanished pane is neither focused nor closed");

  // 6. Clean up counts settled agents (p3) + idle prompt shells (p4) outside the active tab (c1), runs t3-tabs.cleanup, and disables when 0.
  resetFixture();
  m = await open();
  tree = m.render();
  const cleanBtn = find(tree, "running-cleanup");
  assert.equal(cleanBtn.style.opacity, undefined, "enabled when settled p3 and idle shell p4 are eligible");
  assert.ok(strings(cleanBtn).includes("Clean up (2)"), "shows eligible count (settled p3 + idle shell p4)");
  cleanBtn.handlers.on_click({}, cx);
  assert.deepEqual([closedOverlays.pop(), take()], ["o-run", [["t3-tabs.cleanup", null]]]);

  // When only the active tab c1 exists (no background settled or idle shells), Clean up is disabled.
  resetFixture();
  spaces = [spaces[0], spaces[2]];
  panes = [panes[0], panes[1], panes[2]];
  m = await open();
  const disabledClean = find(m.render(), "running-cleanup");
  assert.equal(disabledClean.style.opacity, 0.64);
  disabledClean.handlers.on_click?.({}, cx);
  assert.deepEqual(take(), []);

  // 7. checking() performs zero hc probes, and close() stamps t3-running.closed.
  resetFixture();
  isChecking = true;
  calls.length = 0;
  m = await open();
  m.render();
  assert.deepEqual(calls, [], "checking() must not run hc get");
  const before = Date.now();
  m.close();
  assert.ok(shared["t3-running.closed"] >= before);

  console.log("ok running");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
