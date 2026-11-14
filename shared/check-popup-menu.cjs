// popup-menu.js in a fake herdr: which popup hangs off which, what closes with what, and the keyboard coming back.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let p = {}, opened = 0, closed = [], zoom = 1;
const state = {}, reads = [];
const context = vm.createContext({
  props: () => p, settings: () => ({ zoom }), shared: (k) => { reads.push(k); return state[k]; },
  openOverlay: (spec) => { context.spec = spec; return `o${++opened}`; },
  // As Herdr runs a closed popup's close(), which calls menuClosed.
  closeOverlay: (id) => { closed.push(id); context.menuClosed(id); },
  window: { viewport_size: () => ({ width: 1000, height: 800 }) },
});
const strip = (f) => fs.readFileSync(path.join(__dirname, f), "utf8").replace(/^import [^;]*;\r?\n/gm, "").replace(/^export (function|const) /gm, "$1 ");
vm.runInContext("const MENU_ROW = 28;\n" + strip("submenu.js") + strip("popup-menu.js")
  + "\nObject.assign(globalThis, { openPopup, isOpen, hasOpen, menuClosed, closeTops, closeChain, openBeside, closeSub, subGone });", context);
const m = context;
const focusable = () => { const h = { n: 0, focus() { h.n++; } }; return h; };

// A top menu, a submenu off it, one off that: closing the top closes the rest, deepest last as each one's close runs.
const top = m.openPopup({ mod: "a", width: 220 }, null, "menu");
p = { overlay: top };
const view = { s: {}, sub: null, rowsAt: [{ x: 100, y: 200, width: 212, height: 28 }], keys: focusable() };
const sub = m.openBeside(view, 0, "k", { top: 4, width: 212 }, { mod: "a", width: 220, height: 100, props: { x: 1 } });
assert.deepEqual(JSON.parse(JSON.stringify(m.spec)), { kind: "popup", mod: "a", width: 220, height: 100, at: { x: 312, y: 195 }, props: { x: 1, parents: [top] } }, "beside its row, naming what it hangs off");
assert.ok(m.hasOpen(top, null) && m.isOpen(sub));
p = { overlay: sub, parents: [top] };
const deep = m.openPopup({ mod: "a" }, sub, "deeper");
assert.ok(m.hasOpen(sub, "deeper") && !m.hasOpen(top, "deeper"), "a kind counts only off its own parent");
closed = [];
m.closeOverlay(top);
assert.deepEqual(closed, [top, sub, deep]);
assert.ok(![top, sub, deep].some(m.isOpen));

// A pick closes the popup and every one it hangs off, nearest first; outside a popup, nothing.
closed = []; p = { overlay: "c", parents: ["a", "b"] }; m.closeChain();
assert.deepEqual(closed, ["c", "b", "a"]);
closed = []; p = {}; m.closeChain();
assert.deepEqual(closed, [], "no overlay: closeOverlay() would close whatever's on top");

// The submenu closing itself: its menu, drawing again, takes the keyboard back once, and reads the stamp that redraws it.
const t2 = m.openPopup({ mod: "a" });
p = { overlay: t2 };
const v2 = { s: {}, sub: null, rowsAt: [], keys: focusable(), origin: { x: 10, y: 20 } };
const s2 = m.openBeside(v2, 2, "k", { top: 60, width: 212 }, { mod: "a", width: 220, height: 50 });
assert.deepEqual(JSON.parse(JSON.stringify(m.spec.at)), { x: 226, y: 75 }, "no row seen: placed from where the menu opened");
m.subGone(v2, "a.submenuClosed");
assert.equal(v2.keys.n, 0, "still open: nothing changes");
m.closeOverlay(s2);
m.subGone(v2, "a.submenuClosed"); m.subGone(v2, "a.submenuClosed");
assert.deepEqual([v2.sub, v2.keys.n, reads.at(-1)], [null, 1, "a.submenuClosed"]);

// cmd-w closes the mod's top popups, what hangs off them with them, and no other mod's.
const other = m.openPopup({ mod: "b" });
const t3 = m.openPopup({ mod: "a" });
const s3 = m.openPopup({ mod: "a" }, t3);
closed = [];
assert.equal(m.closeTops("a"), true);
assert.deepEqual(closed.sort(), [t2, t3, s3].sort());
assert.ok(m.isOpen(other));
assert.equal(m.closeTops("a"), false, "none left");

// Zoomed: the row in the window's px, the submenu's width in its own.
zoom = 2; p = { overlay: other };
const v3 = { s: {}, sub: null, rowsAt: [{ x: 200, y: 400, width: 424, height: 56 }], keys: focusable() };
m.openBeside(v3, 0, "k", { top: 4, width: 212 }, { mod: "b", width: 220, height: 100 });
assert.deepEqual([JSON.parse(JSON.stringify(m.spec.at)), m.spec.width], [{ x: 624, y: 390 }, 220]);
console.log("ok: popup-menu hangs submenus beside their rows, closes chains and trees, gives the keyboard back, cmd-w closes tops");
