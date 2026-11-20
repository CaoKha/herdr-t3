// With the sidebar hidden the tab row starts with its toggle, where the brand bar has it, then the tabs, as T3's collapsed
// sidebar leaves only its trigger. It says nothing of the agents, in either mode: that's the sidebar's and Herdr's notice's (docs/adr/0010).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const kit = require("./check-kit.js");
const element = kit.elements(), { find, strip, walk } = kit;
const t = { chrome: "#111111", background: "#222222", dim: "#555555", muted: "#777777", foreground: "#ffffff", hover: "#333333", selected: "#444444", raised: "#333333" };
const home = { id: "h", active: true, tabs: [{ id: "hc", active: true }] };
let atHome = true, hidden = true, mode = "inbox";
const rows = { order: ["t1", "pane:p9", "t2"], view: null, cards: 2 };
const pi = (address, tab, status, title) => ({ address, tab, space: "s", status, title, program: { name: "Pi" } });
const list = [pi("t1", "c1", "blocked", "Fix login"), pi("t2", "c2", "idle", "Later"), pi("t5", "c5", "blocked", "Ask")];
// Away from Home with the Inbox: the breadcrumb's (navigation.js context), here with t2 in view.
const ctx = { space: { id: "s", name: "proj", tabs: [] }, tab: "c2", parent: null, heads: ["t2"], head: "t2", sub: null, held: false, away: false, kin: [], programs: [] };
const env = {
  View: class {}, div: element, svg: src => Object.assign(element(), { src }), image: src => Object.assign(element(), { kind: "image", src }), h_flex: element,
  Popup: { new: (_id, trigger) => element().child(trigger) },
  theme: () => t, props: () => ({}), settings: () => ({ zoom: 1 }), window: () => ({ platform: "macos", buttons: false }),
  spaces: () => [home], terminals: () => [], layout: () => ({}),
  agents: () => list, projectMark: () => element(),
  panes: () => [{ pane: "p9", tab: "c9", mod: "review", title: "Review" }],
  shared: k => k === "t3-inbox.rows" ? rows : null,
  sidebarParts: () => ({ rail: { hidden }, stack: { active: mode } }), toggleLeft: () => 8, panelState: () => ({ pages: [], tabs: [], open: false }),
  tip: (_view, _t, _id, _label, el) => el, stop: (_view, _t, _id, el) => el, focusRoot: (_view, el) => el,
  glow: (view, id) => on => { view.hot = on ? id : null; }, within: () => false, keptHover: () => ({ hover() {}, move() {} }),
  tipCard: (_t, id) => element().id(id), FADE: {},
  run() {}, focusAgent() {}, focusPane() {},
  navigation: () => ({ get atHome() { return atHome; }, frame: () => ({ tabs: atHome ? [] : [{ id: "c1", active: true, named: true, name: "Task" }], context: atHome || mode !== "inbox" ? null : ctx }) }),
  subAgents: () => () => [], namer: () => x => x.title, programIcon: () => null, programOf: x => x.program ?? null,
  ownStatus: s => s, treeStatus: s => s, notNews: () => false, stillSettled: () => false, modStatus: () => "done",
  POINTER_WATCH: 100, pointerAt: () => null, pointerGone: () => false, pointerMoved() {}, pressed() {}, justClosed: () => false,
  openMenu() {}, openOverlay() {},
};
function load(dir) {
  const scope = vm.createContext({ ...env });
  const read = f => strip(fs.readFileSync(path.join(__dirname, "../../shared", f), "utf8"));
  for (const f of ["color.js", "measured-text.js", "details.js", "scroll-strip.js", "status-mark.js", "store.js", "list.js"]) vm.runInContext(read(f), scope);
  vm.runInContext("globalThis.namedLabel = named;", scope);
  vm.runInContext("(() => {\n" + strip(["color.js", "button.js", "trigger.js", "tab.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n"))
    + "\nglobalThis.tab = tab; globalThis.drawButton = button; globalThis.radiusOf = radiusOf; globalThis.ghostTint = tint; globalThis.GROUP_GAP = GROUP_GAP; globalThis.opener = opener; globalThis.popupOpen = popupOpen; globalThis.hang = hang;\n})()", scope);
  vm.runInContext(fs.readFileSync(path.join(dir, "main.js"), "utf8").replace(/^import .*;\r?\n/gm, "").replace("export default class", "globalThis.Mod = class"), scope);
  return Object.assign(new scope.Mod(), { nameW: {}, tabStrip: {}, pressed: null, over: null, area: 900 });
}
const bar = load(__dirname);

// The Inbox shown once this run, so nothing waits on it starting (docs/adr/0003); then hidden again.
hidden = false; bar.render(); hidden = true;

// Nothing of the agents in the row: no cards, no "nothing needs you", no blocked group.
const agentsIn = (root) => walk(root).map(n => n.key ?? "").filter(k => /^(tab-queue-|tab-blocked-|home-queue-empty$|blocked$)/.test(k));
for (const [where, home_] of [["at Home", true], ["away from Home", false]]) {
  for (const m of ["inbox", "lists"]) {
    atHome = home_; mode = m;
    const root = bar.render(), items = root.items.filter(Boolean).map(n => n.key);
    assert.deepEqual(items.slice(0, 2), ["sidebar-toggle", "tab-area"], `${where}, ${m}: the toggle, then the row`);
    assert.deepEqual(agentsIn(root), [], `${where}, ${m}: nothing of the agents, though two are blocked`);
    // A group's 8 to what follows: the row's 4 and the toggle's own 4 (t3-tokens P3).
    assert.equal(find(root, "sidebar-toggle").style.mr, 4, "a group's 8 to what follows");
    assert.equal(find(root, "home"), null, "no brand: Home is ⇧⌘H, as T3's collapsed sidebar has none");
  }
}

// Shown, the brand bar has the toggle; the row has none of its own.
hidden = false; atHome = true; mode = "inbox";
assert.equal(find(bar.render(), "sidebar-toggle"), null, "sidebar shown: the brand bar's toggle");

console.log("ok: hidden row: the toggle alone, at Home and away, in Inbox and Lists, nothing of the agents.");
