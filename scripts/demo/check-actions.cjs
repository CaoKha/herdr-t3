const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const [src, app] = process.argv.slice(2);
const { bundle, elements, find, fire, plain, strings } = require(join(src, "mods/t3-actions/check-kit.js"));
const element = elements(), overlays = [];
const state = JSON.parse(readFileSync(join(app, "shared.json"), "utf8"));
const settings = JSON.parse(readFileSync(join(app, "settings.json"), "utf8"));
const env = {
  View: class {}, div: element, h_flex: element, v_flex: element, svg: element,
  shared: key => state[key], setShared: (key, value) => { state[key] = value; },
  openOverlay: overlay => overlays.push(overlay), settings: () => settings,
  theme: () => ({ foreground: "#ffffff" }), spaces: () => [],
};
const cx = { spawn: fn => fn(cx), notify() {}, stop_propagation() {}, focus_handle: () => ({ focus() {}, is_focused: () => false }) };
function start(mod, props, host = {}) {
  const context = vm.createContext({ ...env, props: () => props, nextCommand: () => new Promise(() => {}), ...host });
  vm.runInContext(bundle(file => readFileSync(join(app, "mods", mod, file), "utf8")), context);
  const view = new context.Mod();
  view.init(props, cx);
  return view;
}

async function check() {
  const bounds = { x: 700, y: 6, width: 26.4, height: 26.4 };
  const bar = start("t3-actions", {});
  const chevron = find(bar.render(), "action-more");
  fire(chevron, "on_mouse_down:left", { bounds }, cx);
  fire(chevron, "on_click", {}, cx);
  const fromClick = plain(overlays.pop());

  let deliver;
  start("t3-actions", { details: true }, { nextCommand: () => new Promise(resolve => { deliver = resolve; }) });
  const commands = ["actions-last:retro", `actions-menu:${JSON.stringify(bounds)}`];
  start("demo-stage", {}, {
    nextCommand: () => commands.length ? Promise.resolve(commands.shift()) : new Promise(() => {}),
    run: name => {
      if (name.startsWith("t3-actions.")) deliver(name.slice("t3-actions.".length));
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state["t3-actions.actions"]?.last, "retro", "the stagehand sets the product's selected Action");
  assert.equal(overlays.length, 1, "one popup, not the Details chain");
  assert.deepEqual(plain(overlays[0]), fromClick, "the demo and the bar chevron open the same popup at the same bounds");
  const menu = start("t3-actions", { ...overlays[0].props, overlay: "demo-actions" }).render();
  assert.ok(strings(find(menu, "action-retro")).includes("Retro"), "the product Actions menu renders Retro from the demo seed");
  assert.ok(strings(find(menu, "action-new")).includes("Add action"), "the product Actions menu renders Add action");
  console.log("demo and bar open the same standalone Actions popup; Retro and Add action render");
}

check().catch(error => { console.error(error); process.exitCode = 1; });
