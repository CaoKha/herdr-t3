// scroll-strip.js: where a clipped row of tabs sits, and whether its arrows can move it.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const element = require('./check-kit.js').elements();
const c = vm.createContext({ settings: () => ({ zoom: 2 }), Math, Number, div: () => element(), h_flex: () => element() });
vm.runInContext(['color.js', 'scroll-strip.js'].map(f => fs.readFileSync(`${__dirname}/${f}`, 'utf8')).join('\n').replace(/^import [^;]*;\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.api = { stripAt, stripEnds, stripWheel, stripPage, stripFades };', c);
const { stripAt, stripEnds, stripWheel, stripPage, stripFades } = c.api, widths = [100, 100, 100, 100, 24], o = { widths, gap: 4, room: 200 };
const ends = (s) => JSON.stringify(stripEnds(s));
// All of it fits: nowhere to go, no arrow enabled.
let s = {}; stripAt(s, { ...o, room: 500 }); assert.equal(ends(s), '{"back":false,"next":false}');
// The active tab comes into view with the least move, once; at the start only `next` works, at the end only `back`.
s = {}; assert.equal(stripAt(s, { ...o, focus: 0, focusKey: 'a' }), 0); assert.equal(ends(s), '{"back":false,"next":true}');
assert.equal(stripAt(s, { ...o, focus: 2, focusKey: 'c' }), 108, 'its right edge at the room\'s');
stripPage(s, 1, 200); stripPage(s, 1, 200); assert.equal(s.at, s.over); assert.equal(ends(s), '{"back":true,"next":false}');
stripPage(s, -1, 200); stripPage(s, -1, 200); stripPage(s, -1, 200); assert.equal(s.at, 0, 'arrows stop at the ends');
// A swipe away isn't pulled back while the active tab and the room stay; an unmeasured row isn't moved yet.
stripWheel(s, { delta: { x: -100, y: 0 } }); assert.equal(stripAt(s, { ...o, focus: 2, focusKey: 'c' }), 50, 'wheel in logical px');
s = {}; assert.equal(stripAt(s, { ...o, focus: 3, focusKey: 'd', ready: false }), 0);
// Held from its end: short of room its end shows, and stays shown as the room changes.
s = {}; assert.equal(stripAt(s, { ...o, fromEnd: true }), s.over); assert.equal(stripAt(s, { ...o, room: 150, fromEnd: true }), s.over);
// A cut end fades into the bar's own color in four steps, whichever way the theme writes it: one with its own alpha, or three
// digits, plus two more would be a color the host refuses (10 or 5 digits), and the end would be cut hard.
for (const [bg, steps] of [['#112233', ['#112233ff', '#112233bf', '#11223380', '#11223340']], ['#11223380', ['#11223380', '#11223360', '#11223340', '#11223320']],
  ['#123', ['#112233ff', '#112233bf', '#11223380', '#11223340']]]) {
  const [start, end] = stripFades(bg, { at: 10, over: 20 });
  assert.deepEqual(start.items.map(n => n.style.bg), steps, `${bg}: solid at the cut, clear toward the row`);
  assert.deepEqual(end.items.map(n => n.style.bg), [...steps].reverse());
}
console.log('ok: a clipped row reveals its active tab, pages and wheels within its ends, holds from its end, and fades its cut ends in any theme color');
