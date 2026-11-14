// A mod's real main.js in Node, against a fake Herdr: every host call counted, every element counted, nothing drawn.
// Run under `node --experimental-vm-modules`. Measures JS only (QuickJS in Herdr is slower; see the report for the ratio).
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import * as nodeBuffer from "node:buffer";
import * as nodeCrypto from "node:crypto";
import * as nodeFsP from "node:fs/promises";

// --- Elements: any chain of builder calls; `when` runs its branch, handlers are kept so a test can fire them.
export const stats = { elements: 0, notify: 0, calls: new Map(), execs: [], virtualRows: 0 };
export function resetStats() { stats.elements = 0; stats.notify = 0; stats.calls = new Map(); stats.execs = []; stats.virtualRows = 0; }

function element(tag = "div") {
  stats.elements++;
  const node = { tag, kids: [], handlers: {} };
  const self = new Proxy(function () {}, {
    get(_t, key) {
      if (key === "__node") return node;
      if (key === "then" || typeof key === "symbol") return key === Symbol.toPrimitive ? () => "" : undefined;
      if (key === "when") return (c, f, g) => { if (c) f(self); else if (g) g(self); return self; };
      if (key === "when_some") return (v, f) => { if (v != null) f(self, v); return self; };
      if (key === "map") return (f) => f(self);
      if (key === "child") return (x) => { node.kids.push(x); return self; };
      if (key === "children") return (xs) => { for (const x of xs ?? []) node.kids.push(x); return self; };
      if (key === "id") return (id) => { node.id = id; return self; };
      if (typeof key === "string" && key.startsWith("on_")) return (...a) => { node.handlers[key + (typeof a[0] === "string" ? ":" + a[0] : "")] = a.at(-1); return self; };
      return () => self;
    },
    apply() { return self; },
  });
  return self;
}
// Things that aren't elements (InputState, handles, Popup builders): anything goes, strings where text is read.
function thing() {
  const self = new Proxy(function () {}, {
    get(_t, key) {
      if (key === "then" || typeof key === "symbol") return key === Symbol.toPrimitive ? () => "" : undefined;
      if (["value", "text", "selected_text"].includes(key)) return () => "";
      if (["is_focused", "contains_focused"].includes(key)) return () => false;
      if (key === "new" || key === "build") return () => thing();
      return () => element(String(key));
    },
    apply() { return element(); },
    construct() { return thing(); },
  });
  return self;
}
// Called it's an element; its statics (Input.new, Scrollbar.vertical) make elements too.
function builder(n) {
  return new Proxy(function () {}, { apply: () => element(n), construct: () => thing(), get: (_t, k) => typeof k === "symbol" || k === "then" ? undefined : () => element(n) });
}
export function findId(el, id) {
  const n = el?.__node;
  if (!n) return null;
  if (n.id === id) return el;
  for (const k of n.kids) { const f = findId(k, id); if (f) return f; }
  return null;
}
export function allIds(el, out = []) {
  const n = el?.__node;
  if (!n) return out;
  if (n.id != null) out.push(n.id);
  for (const k of n.kids) allIds(k, out);
  return out;
}

function gpui(names) {
  const view = class View {};
  const out = {};
  for (const n of names) {
    if (n === "View") out[n] = view;
    else if (["div", "svg", "image", "h_flex", "v_flex", "TextView", "Input", "Editor", "Scrollbar", "Switch", "Select", "NumberInput"].includes(n)) out[n] = builder(n);
    else if (n === "v_virtual_list" || n === "h_virtual_list") out[n] = (id, count, sizes, key, render) => {
      // The host enters once per frame with what's visible: about a screen of rows.
      const shown = Math.min(count, 40), rows = [];
      for (let i = 0; i < shown; i++) { stats.virtualRows++; rows.push(render(i)); }
      return element(n).children(rows);
    };
    else if (n === "list") out[n] = (id, count, key, render) => { const rows = []; for (let i = 0; i < Math.min(count, 40); i++) { stats.virtualRows++; rows.push(render(i)); } return element(n).children(rows); };
    else if (n === "uniform_list") out[n] = (id, count, render) => { stats.virtualRows += Math.min(count, 40); return element(n).children(render({ start: 0, end: Math.min(count, 40) })); };
    else out[n] = thing();
  }
  return out;
}

// --- The host: `world` holds the data; each function is counted.
export function host(world) {
  const counted = (name, fn) => (...a) => { stats.calls.set(name, (stats.calls.get(name) ?? 0) + 1); return fn(...a); };
  const win = Object.assign(() => world.window, { mouse_position: () => ({ x: 0, y: 0 }), viewport_size: () => ({ width: 1680, height: 1042 }) });
  const api = {
    agents: () => world.agents, terminals: () => world.terminals, panes: () => world.panes, spaces: () => world.spaces,
    layout: () => world.layout, focused: () => world.focused, props: () => world.props, theme: () => world.theme,
    settings: () => world.settings, shared: (k) => world.shared[k] ?? null, setShared: (k, v) => { world.shared[k] = v; world.writes.push(k); },
    home: () => "/Users/me", appHome: () => "/Users/me/.config/herdr-app", keys: () => [], machines: () => [{ name: null, layout: "ready" }],
    run: (name, args) => { world.runs.push([name, args]); return null; }, notify: () => null, openOverlay: (o) => { world.runs.push(["openOverlay", o]); return "ov1"; },
    closeOverlay: () => null, setAgentOrder: () => null, nextCommand: () => new Promise(() => {}), updates: () => ({ app: { version: "0.1.15", ready: null, updates: true }, notes: [], core: { version: "1", managed: null, ready: null, updating: false, error: null }, checked: null, checks: false, checking: false }), placement: () => null,
    exec: async (cmd, args, opts) => { stats.execs.push([cmd, ...(args ?? [])].join(" ")); return world.exec?.(cmd, args, opts) ?? { code: 1, stdout: "", stderr: "" }; },
    hc: async () => ({ code: 0, stdout: "", stderr: "" }), readTextFile: async () => "", writeTextFile: async () => true, watchFolder: () => new Promise(() => {}),
    window: win, layouts: () => ["herdr-t3"], commands: () => [], knownAgents: async () => [], pickFolder: async () => null, playSound: () => null,
  };
  const out = {};
  for (const [k, v] of Object.entries(api)) out[k] = k === "window" ? Object.assign(counted(k, v), { mouse_position: v.mouse_position, viewport_size: v.viewport_size }) : counted(k, v);
  return out;
}

const importNames = (src, spec) => [...src.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"${spec}"`, "g"))]
  .flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));

/** Loads `dir/main.js` with its own copies of the shared files; returns its default export. One context per load. */
export async function loadMod(dir, world, entry = "main.js", transform = (_f, src) => src) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
  const all = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  const h = host(world);
  const context = vm.createContext({ console, Date, Math, JSON, Promise, Map, Set, WeakMap, Array, Object, String, Number, Boolean, RegExp, Error, Symbol, Intl, TextEncoder, TextDecoder, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, Float32Array, Float64Array, Int32Array, ArrayBuffer, DataView, atob, btoa, structuredClone, performance });
  context.window = h.window;
  context.__count = (name) => stats.calls.set(name, (stats.calls.get(name) ?? 0) + 1);
  const ls = new Map();
  context.localStorage = { getItem: (k) => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k), clear: () => ls.clear(), key: (i) => [...ls.keys()][i] ?? null, get length() { return ls.size; } };
  const cache = new Map();
  const synth = (names, values) => new vm.SyntheticModule(names, function () { for (const n of names) this.setExport(n, values[n]); }, { context });
  const builtins = { buffer: nodeBuffer, crypto: nodeCrypto, "fs/promises": nodeFsP };
  async function link(spec, ref) {
    if (spec === "herdr") return synth([...new Set(importNames(all, "herdr"))], h);
    if (spec === "gpui-kit" || spec === "gpui-base") { const names = [...new Set(importNames(all, spec))]; return synth(names, gpui(names)); }
    if (builtins[spec]) { const names = Object.keys(builtins[spec]).filter((n) => n !== "default"); return synth([...names, "default"], { ...builtins[spec], default: builtins[spec].default ?? builtins[spec] }); }
    const file = path.resolve(path.dirname(ref.identifier), spec);
    if (cache.has(file)) return cache.get(file);
    const m = new vm.SourceTextModule(transform(file, fs.readFileSync(file, "utf8")), { identifier: file, context });
    cache.set(file, m);
    return m;
  }
  const main = new vm.SourceTextModule(transform(path.join(dir, entry), fs.readFileSync(path.join(dir, entry), "utf8")), { identifier: path.join(dir, entry), context });
  await main.link(link);
  await main.evaluate();
  return { Mod: main.namespace.default, ns: main.namespace, context };
}

export function makeCx() {
  const cx = {
    timers: [], spawned: [],
    notify() { stats.notify++; }, stop_propagation() {}, prevent_default() {}, focus_handle: () => ({ focus() {}, is_focused: () => false, contains_focused: () => false }),
    spawn(fn) { const p = Promise.resolve().then(() => fn(cx)).catch((e) => { cx.errors = [...(cx.errors ?? []), e]; }); cx.spawned.push(p); return { cancel() {} }; },
    sleep: async () => {}, window: () => ({}),
    timer: {
      every(ms, fn) { const w = { ms, fn, kind: "every", cancel() { w.gone = true; } }; cx.timers.push(w); return w; },
      after(ms, fn) { const w = { ms, fn, kind: "after", cancel() { w.gone = true; } }; cx.timers.push(w); return w; },
    },
  };
  return cx;
}

/** Times `fn` `n` times after `warm` runs: { median, p95, max } in ms. */
export function time(fn, n = 20, warm = 3) {
  for (let i = 0; i < warm; i++) fn();
  const xs = [];
  for (let i = 0; i < n; i++) { const t = performance.now(); fn(); xs.push(performance.now() - t); }
  xs.sort((a, b) => a - b);
  const r = (x) => Math.round(x * 100) / 100;
  return { median: r(xs[Math.floor(n / 2)]), p95: r(xs[Math.min(n - 1, Math.floor(n * 0.95))]), max: r(xs[n - 1]) };
}
