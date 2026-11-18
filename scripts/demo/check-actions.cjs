const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const [src, app] = process.argv.slice(2);
const { elements, find } = require(join(src, "mods/t3-actions/check-kit.js"));
const element = elements(), overlays = [];
const state = JSON.parse(readFileSync(join(app, "shared.json"), "utf8"));
const env = {
  View: class {}, div: element, v_flex: element, svg: element,
  shared: key => state[key], setShared: (key, value) => { state[key] = value; },
  openOverlay: overlay => overlays.push(overlay), settings: () => ({ zoom: 1 }),
  theme: () => ({}), focusRoot: (_view, root) => root, menuKeys: () => () => {}, onStop: () => null,
  menuRow: (_view, _t, id, { label }) => element().id(id).child(label),
  scrollList: (_view, id, { count, draw }) => {
    const list = element().id(id);
    for (let at = 0; at < count; at++) list.child(draw(at));
    return list;
  },
};
const script = file => readFileSync(file, "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export (?:default )?/gm, "");
const context = vm.createContext(env);
vm.runInContext(script(join(src, "shared/store.js")), context);
const [productKey, actionsMenu] = vm.runInContext(`${script(join(src, "mods/t3-actions/actions.js"))}\n[KEY.actions, actionsMenu]`, context);

async function check() {
  const row = find(actionsMenu({ at: -1 }), "action-retro");
  assert.equal(row?.items[0], "Retro", "the product Actions menu renders Retro from the demo seed");

  const commands = ["actions-last:retro", "actions-menu:1620"];
  context.nextCommand = () => commands.length ? Promise.resolve(commands.shift()) : new Promise(() => {});
  const Stage = vm.runInContext(`(${script(join(app, "mods/demo-stage/main.js"))}\n)`, context);
  new Stage().init({}, { spawn: fn => fn() });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state[productKey]?.last, "retro", "the stagehand sets the product's selected Action");
  assert.equal(overlays[0]?.props.actions, "menu", "the stagehand opens the product Actions menu");
  assert.ok(overlays[0].height >= (state[productKey].list.length + 1) * 28, "the menu fits the seeded Actions and Add action");
  console.log("demo seed renders Retro in the product Actions menu, and the stagehand selects Retro");
}

check().catch(error => { console.error(error); process.exitCode = 1; });
