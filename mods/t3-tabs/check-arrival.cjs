// Observe the work frame at the selection, before either Tabs block can render in the destination.
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const kit = require("./check-kit.js"), el = kit.elements();
const read = (file) => fs.readFileSync(`${__dirname}/${file}`, "utf8");
const mod = (file, name) => kit.strip(read(file)).replace("export default class", `globalThis.${name} = class`);
const navigation = kit.bundle(read, "navigation.js");
const panel = `const GROUP_GAP = (() => { ${kit.strip(read("button.js"))}; return GROUP_GAP; })();
${kit.strip(read("surfaces.js"))}\n${kit.strip(read("panel.js"))}`;

function fixture(from, { hidden = false, buttons = false, home = "t3-home" } = {}) {
  const saved = { "t3-tabs.home": "h", "t3.panels": {
    b: { tabs: [{ id: "files", born: 1 }], active: "files", open: true, wide: true },
  }, "t3.settings": { homeMod: home === "terminal" ? null : home === "split" ? "t3-home" : home } };
  let active = from, child = from === "h" ? "home-main" : "main", row = from === "h" && !hidden && !buttons ? 8 : 40;
  // Home's own branch, whole, for one mod's pane; a Terminal or split Home keeps the framed one (docs/adr/0021).
  let view = from === "h" && home === "t3-home" ? "work-home" : "work-away";
  const caption = buttons ? 8 + 3 * 28 : 0;
  let open = from === "b", wide = open, page = open ? "files" : "panel-empty", end = open ? 0 : caption + (from === "h" ? 0 : 32);
  const spaces = () => ["a", "b", "h"].map(id => ({ id, active: id === active, machine: null, name: id === "h" ? "Home\u200b" : id,
    named: true, tabs: [{ id: `t-${id}`, active: true }] }));
  const panes = () => spaces().flatMap(s => s.id !== "h" ? [{ tab: s.tabs[0].id, pane: `p-${s.id}`, terminal: `k-${s.id}` }]
    : home === "terminal" ? [{ tab: "t-h", pane: "p-h", terminal: "k-h" }]
    : home === "split" ? [{ tab: "t-h", pane: "p-h", mod: "t3-home" }, { tab: "t-h", pane: "p-h2", terminal: "k-h2" }]
    : [{ tab: "t-h", pane: "p-h", mod: home }]);
  const commands = [], frames = [];
  let layouts = 0;
  const values = () => [active, child, row, page, open, wide, end, view];
  function paint() {
    for (const [cmd, args] of commands.splice(0)) {
      if (cmd === "layout.select" && args.stack === "work-main") child = args.child;
      if (cmd === "layout.select" && args.stack === "work-view") view = args.child;
      if (cmd === "layout.select" && args.stack === "panel-body") page = args.child;
      if (cmd === "layout.resize" && args.id === "tabs-row") row = args.px;
      if (cmd === "layout.resize" && args.id === "window-end") end = args.px;
      if (args?.id === "panel") open = cmd === "layout.show";
      if (args?.id === "work") wide = cmd === "layout.hide";
      if (cmd === "layout.toggle" && args.id === "sidebar") hidden = !hidden;
      if (cmd === "space.select") active = args.id;
      if (cmd === "tab.select") active = args.id.replace(/^t-/, "");
      if (cmd === "pane.focus") active = args.pane.replace(/^p-/, "");
      if (cmd === "agent.focus") active = args.terminal.replace(/^k-/, "");
    }
    frames.push(values());
  }
  const cx = { spawn() {}, notify() {}, focus_handle() {} };
  const globals = {
    View: class {}, div: el, h_flex: el, v_flex: el, theme: () => ({}), props: () => ({ part: "keys" }), settings: () => ({}),
    shared: key => saved[key], setShared: (key, val) => { saved[key] = val; }, window: () => ({ buttons }),
    spaces, panes, agents: () => [], terminals: () => [], machines: () => [], focused: () => null,
    layout: () => ++layouts && ({ children: [{ id: "sidebar", hidden, children: [{ id: "sidebar-lists", active: "lists" }] },
      { id: "work", hidden: wide, children: [{ id: "work-view", active: view, children: [{ id: "work-away", children: [{ id: "tabs-row", size: { px: row } },
        { id: "window-end", size: { px: end } }, { id: "work-main", active: child }] }, { id: "work-home", children: [{ id: "home-row", size: { px: 40 } }, { id: "home-surface" }] }] }] },
      { id: "panel", hidden: !open, children: [{ id: "panel-body", active: page, children: ["panel-empty", "files", "review"].map(id => ({ id })) }] }] }),
    run: (cmd, args) => commands.push([cmd, args]), rememberTerminal() {}, hc() {}, home() {}, openOverlay() {}, closeOverlay() {}, notify() {},
    stop: (_, __, ___, node, _radius, opts) => { node.enter = opts?.enter; return node; },
  };
  const scope = vm.createContext(globals);
  vm.runInContext(`${navigation}\n${panel}\n${mod("main.js", "Tabs")}\n${mod("../t3-spaces/main.js", "Spaces")}\nglobalThis.jump = { focusPane, focusAgent };`, scope);
  const keys = new scope.Tabs(); keys.init(null, cx); keys.render(); paint();
  return { frames, keys, paint, saved, commands, layouts: () => layouts, hidden: () => hidden, setHome: (h) => { home = h; }, press: cmd => keys.navigation.handle(cmd, cx),
    go: space => scope.jump.focusPane(`p-${space}`), agent: space => scope.jump.focusAgent(`k-${space}`),
    click: (id, keyboard) => {
      const w = spaces().find(s => s.id === id), row = new scope.Spaces().row({ w }, {}, panes(), false);
      if (keyboard) row.enter();
      else {
        kit.fire(row, "on_mouse_down:left", { position: {} }, cx);
        kit.fire(row, "on_mouse_up:left", {}, cx);
      }
    },
  };
}

(async () => {
  const wideFiles = ["b", "main", 40, "files", true, true, 0, "work-away"];
  const closed = ["a", "main", 40, "panel-empty", false, false, 32, "work-away"];
  for (const jump of [f => f.press("space:2"), f => f.press("space-prev"), f => f.go("b"), f => f.agent("b"),
    f => f.click("b", false), f => f.click("b", true)]) {
    const f = fixture("h");
    await jump(f); f.paint();
    assert.deepEqual(f.frames.at(-1), wideFiles, "first frame leaving Home has the destination's row, header and maximized Files");
  }
  for (const home of ["t3-home", "asciicn-wallpaper", "terminal", "split"]) {
    const whole = home !== "terminal" && home !== "split";
    for (const jump of [f => f.press("space:2"), f => f.agent("b")]) {
      const f = fixture("h", { home });
      await jump(f); f.paint();
      assert.deepEqual(f.frames.at(-1), wideFiles, `leaving a ${home} Home: the framed branch, with the destination's row and panel`);
    }
    // Going Home lands on a tab of Home's one pane (navigation.js refitHome), so only staying there splits it.
    for (const [hidden, buttons, homeHeight, end] of home === "split" ? [] : [[false, false, 8, 0], [true, false, 40, 0], [false, true, 40, 92]]) {
      const f = fixture("b", { hidden, buttons, home });
      await f.press("home"); f.paint();
      assert.deepEqual(f.frames.at(-1), ["h", "home-main", homeHeight, "panel-empty", false, false, end, whole ? "work-home" : "work-away"],
        `first frame into a ${home} Home: ${whole ? "its own branch, whole" : "framed"}, no pane header, its own panel`);
    }
  }
  {
    // Split at Home, or back to one pane: the next frame changes branch, and an unchanged one asks for nothing.
    const f = fixture("h");
    f.keys.render(); f.paint();
    assert.equal(f.frames.at(-1)[7], "work-home");
    f.keys.render();
    assert.deepEqual(f.commands.filter(([cmd]) => cmd === "layout.select"), [], "nothing asked of a branch already shown");
    f.paint(); f.setHome("split"); f.keys.render(); f.paint();
    assert.deepEqual(f.frames.at(-1).slice(1), ["home-main", 8, "panel-empty", false, false, 0, "work-away"], "split at Home: framed, the row folded");
    f.setHome("t3-home"); f.keys.render(); f.paint();
    assert.equal(f.frames.at(-1)[7], "work-home", "one pane again: whole");
  }
  for (const [key, want] of [["space:1", closed], ["space:2", wideFiles]]) {
    const f = fixture("a");
    await f.press("home"); await f.press(key);
    f.keys.render(); // The model has not acknowledged either select and layout() still reports A's original geometry.
    f.paint();
    assert.deepEqual(f.frames.at(-1), want, "the latest jump wins before either selection is observed");
    f.keys.render(); f.paint();
    assert.deepEqual(f.frames.at(-1), want, "the observed target keeps its destination frame");
    assert.equal(f.saved["t3.panels"].a, undefined, "the abandoned Home frame is not saved to the source");
  }
  {
    const f = fixture("b");
    await f.press("space:1"); f.paint();
    assert.deepEqual(f.frames.at(-1), closed, "an ordinary space switch does not briefly inherit an open wide panel");
  }
  // ⌘B and both sidebar buttons: Home's row height comes in the same layout change, not a frame after the sidebar (two jumps).
  for (const [from, hidden, row] of [["h", false, 40], ["h", true, 8], ["b", false, 40], ["b", true, 40]]) {
    const f = fixture(from, { hidden });
    f.keys.toggleSidebar(); f.paint();
    assert.equal(f.hidden(), !hidden, "the sidebar toggles");
    assert.equal(f.frames.at(-1)[2], row, `${from === "h" ? "at Home" : "away"}, ${hidden ? "showing" : "hiding"} the sidebar: the row is ${row} in its first frame`);
  }
  {
    // The keys block fits the row on every draw: one read of the layout, which copies the whole tree.
    const f = fixture("a"), before = f.layouts();
    f.keys.fitRow({ buttons: false }, false);
    assert.equal(f.layouts() - before, 1, "fitRow reads the layout once");
  }
  assert.equal(JSON.parse(read("../../keys.json"))["layout:herdr-t3"]["cmd-b"], "t3-tabs.toggle-sidebar", "cmd-b is the same action as the buttons");
  // The layout's two branches: framed work for away and a Terminal or split Home, and Home whole: a 40 row to drag the window
  // by, drawn by t3-tabs, over a surface with no frame (docs/adr/0021).
  {
    const root = JSON.parse(read("../../layouts/herdr-t3.json")), node = (n, id) => n?.id === id ? n : (n?.children ?? []).reduce((hit, c) => hit ?? node(c, id), null);
    const work = node(root, "work"), view = node(root, "work-view");
    assert.deepEqual(work.children.map(c => c.id), ["work-view", "status"], "the work column: its branches, then status");
    assert.deepEqual([view.type, view.active, view.children.map(c => c.id)], ["stack", "work-away", ["work-away", "work-home"]]);
    assert.deepEqual(node(root, "work-away").children.map(c => c.id), ["tabs-row", "work-body", "work-bottom-inset"]);
    const home = node(root, "work-home"), row = node(root, "home-row"), surface = node(root, "home-surface");
    assert.deepEqual(home.children.map(c => c.id), ["home-row", "home-surface"]);
    assert.deepEqual([row.size, row.window_drag, row.content], [{ px: 40 }, true, { mod: "t3-tabs", props: { part: "home" } }]);
    assert.deepEqual(surface.content, { tab: "active", pane: { background: "background", lone: true } }, "no border, radius or gap");
  }
  console.log("ok: known space arrivals have their work frame and panel before the first destination paint");
})().catch(e => { console.error(e); process.exit(1); });
