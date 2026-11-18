// The demo's stagehand, in a 0px block: opens what only a click opens, the way that click does.
// `herdr-app do demo-stage.actions-menu:<bounds>` asks Actions to open its standalone menu at synthetic chevron bounds (window px);
// `demo-stage.actions-last:<id>` makes that the action the bar's button runs, as running it does.
// `demo-stage.setting:<key>=<value>` picks that in the layout's settings, as its dialog (t3-chrome/settings.js) does.
// `demo-stage.menu:{"at":{"x":…,"y":…},"tab":…,"target":…}` opens a right-click menu there, as openMenu (shared/menu.js) does at the pointer.
// `demo-stage.submenu:{"row":…,"rules":…,"tab":…,"target":…}` opens a submenu beside row `row` (`rules` rules above it) of the menu
// `menu` opened last, as t3-menu's does when the pointer rests on that row (its openSub and submenu.js's subPlace).
// `demo-stage.shared:<key>=<json>` sets a shared value, as a mod's write does: a Review page's request (`review`), its prefs.
import { View, div } from "gpui-kit";
import { nextCommand, openOverlay, run, setShared, settings, shared } from "herdr";
import { KEY } from "./store.js";

export default class Stage extends View {
  init(_props, cx) {
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand(), cut = command.indexOf(":");
        const [name, arg] = cut < 0 ? [command, ""] : [command.slice(0, cut), command.slice(cut + 1)];
        if (name === "overlay") openOverlay(JSON.parse(arg));
        if (name === "actions-menu") run(`t3-actions.bar-menu:${arg}`);
        if (name === "menu") { const { at, ...p } = JSON.parse(arg); this.menu = { at, id: openOverlay({ mod: "t3-menu", kind: "popup", width: 220, height: 260, at, props: p }) }; }
        if (name === "submenu" && this.menu) {
          const { row, rules = 0, ...p } = JSON.parse(arg), z = Number(settings().zoom) || 1, { at } = this.menu;
          const x = at.x / z + 4, y = at.y / z + 4 + row * 28 + rules * 9, vw = globalThis.window.viewport_size().width / z;
          const right = vw - (x + 212) >= 220 || vw - (x + 212) >= x;
          openOverlay({ mod: "t3-menu", kind: "popup", width: 220, height: 260, at: { x: (right ? x + 212 : x - 220) * z, y: (y - 5) * z }, props: { ...p, parents: [this.menu.id] } });
        }
        if (name === "shared") { const at = arg.indexOf("="); setShared(arg.slice(0, at), JSON.parse(arg.slice(at + 1))); }
        if (name === "actions-last") {
          const actions = shared(KEY.actions);
          if (actions?.list.some(a => a.id === arg)) setShared(KEY.actions, { ...actions, last: arg });
        }
        if (name === "setting") {
          const [key, value] = arg.split("=");
          setShared("t3.settings", { ...shared("t3.settings"), [key]: value });
          if (key === "homeMod") run("t3-tabs.home-mod");
        }
      }
    });
  }

  render() {
    return div();
  }
}
