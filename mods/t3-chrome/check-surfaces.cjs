// The space panel's head and its surface menus, on inert elements: what a press, a key or the panel's cmd-t does.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function element() {
  const n = { items: [], handlers: {}, style: {} };
  const e = new Proxy(n, { get: (o, k) => k in o ? o[k] : (...a) => {
    if (k === 'child') n.items.push(a[0]); else if (k === 'children') n.items.push(...a[0]);
    else if (k === 'when') { if (a[0]) a[1](e); } else if (k === 'id') n.id = a[0];
    else if (k === 'on_mouse_down') n.handlers[a[0]] = a[1]; else if (k.startsWith('on_')) n.handlers[k] = a[0]; else n.style[k] = a[0];
    return e;
  } }); return e;
}
const find = (n, id) => !n || typeof n !== 'object' ? undefined : n.id === id ? n : n.items.map(x => find(x, id)).find(Boolean);
const order = (n, ids) => { const seen = []; const walk = x => { if (!x || typeof x !== 'object') return; if (ids.includes(x.id)) seen.push(x.id); x.items.forEach(walk); }; walk(n); return seen; };
const calls = [], tips = [], commands = [];
let props = { part: 'surface-empty' }, s = { pages: ['files', 'review', 'panel-empty'], tabs: [], active: null, open: true }, problem = '', folder = '/space';
const win = () => ({ platform: 'macos' }); win.viewport_size = () => ({ width: 1800, height: 1000 });
const glyph = src => { const el = element(); el.src = src; return el; };
const c = vm.createContext({ View: class {}, div: element, h_flex: element, v_flex: element, svg: glyph, image: glyph,
  props: () => props, panelState: () => s, spaces: () => [{ id: 's', active: true, folder: '/space' }], settings: () => ({ zoom: 2 }), window: win, shared: () => null,
  layout: () => ({ id: 'root', children: [{ id: 'panel', padding: [0, 8], children: [{ id: 'panel-head', size: { px: 40 } }] }] }),
  showPage: id => calls.push(['add', id]), closeSurface: (id, mode) => calls.push(['close', id, mode]), activateSurface: id => calls.push(['select', id]),
  hidePanel() {}, toggleWide() {}, openOverlay: p => calls.push(['overlay', p]), closeOverlay: () => calls.push(['dismiss']), run() {},
  reviewRepo: async () => ({ root: problem ? null : '/repo', problem }), workFolder: () => folder,
  nextCommand: () => new Promise(r => commands.push(r)),
  stopsInit() {}, stopsEnd() {}, setShared() {}, pressed() {}, justClosed: () => false, DISABLED: 0.64,
  tip: (_v, _t, id, label, el) => { tips.push([id, label]); return el; }, stop: (_v, _t, _i, el) => el, focusRoot: (_v, el) => el, within: () => false,
  glow: () => () => {}, litOnHover: () => () => {},
});
const load = f => vm.runInContext(fs.readFileSync(__dirname + '/' + f, 'utf8').replace(/^import [^;]*;\n/gm, '').replace(/^export /gm, ''), c);
['list.js', 'pierre-icons-data.js', 'pierre-icons.js', 'measured-text.js', 'scroll-strip.js', 'status-mark.js', 'store.js', 'titlebar.js'].forEach(load);
vm.runInContext('(() => {\n' + ['button.js', 'trigger.js'].map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n').replace(/^import [^;]*;\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.drawButton = button; globalThis.radiusOf = radiusOf; globalThis.DISABLED = DISABLED; globalThis.trigger = trigger; globalThis.hang = hang;\n})();', c);
load('menu-row.js');
vm.runInContext(fs.readFileSync(__dirname + '/main.js', 'utf8').replace(/^import [^;]*;\n/gm, '').replace('export default class', 'globalThis.Mod = class'), c);
const t = { foreground: '#ffffff', muted: '#888888', dim: '#777777', selected: '#333333', chrome: '#111111', hover: '#222222', popover: '#000000', border: '#444444', raised: '#555555' };
c.theme = () => t;
const cx = { notify() {}, stop_propagation() {}, spawn: f => f(cx), timer: { every() {}, after() {} }, focus_handle: () => ({ focus() {} }) };
const flush = () => new Promise(r => setTimeout(r, 0));
const mod = (p) => { props = p; const v = new c.Mod(); v.init({}, cx); return v; };

(async () => {
  // Open a surface: a row's letter, arrows and Enter pick; modified letters don't; Review greyed while it can't read here.
  problem = 'This tab\'s folder is not in a Git repository.';
  let view = mod({ part: 'surface-empty' }); await flush();
  const key = stroke => view.surfaceView(t).handlers.on_key_down({ key: stroke.split('-').at(-1), keystroke: stroke }, cx);
  key('cmd-f'); key('r'); assert.equal(calls.length, 0, 'modified letters and a greyed Review do nothing');
  assert.equal(find(view.surfaceView(t), 'surface-option-1').style.opacity, 0.64);
  assert.ok(tips.some(([, label]) => label === problem), 'a greyed Review says why');
  key('down'); key('enter'); assert.deepEqual(calls.pop(), ['add', 'files']);
  // Its tab's terminal moves into a repository: Review is offered, read where that terminal works, though the space folder isn't one.
  // Asked as it draws (Herdr draws again when a terminal's folder or focus moves), never on a clock: a 250 ms poll per copy ran
  // while the window sat idle (performance-audit.md).
  problem = ''; folder = '/repo/sub'; view.render(cx); await flush();
  key('r'); assert.deepEqual(calls.pop(), ['add', 'review']);
  s.pages = ['files', 'panel-empty']; assert.equal(find(view.surfaceView(t), 'surface-option-1'), undefined, 'uninstalled Review is absent');
  s.pages = ['files', 'review', 'panel-empty'];
  for (const part of ['surface-empty', 'surface-menu']) {
    props = { part }; const clocks = [];
    new c.Mod().init({}, { ...cx, timer: { every: (ms) => clocks.push(ms), after() {} } });
    assert.deepEqual(clocks, [], `${part} keeps no clock`);
  }
  // The docked empty page doesn't take the keyboard from the terminal; a popup menu does.
  for (const [part, takes] of [['surface-empty', false], ['surface-menu', true]]) {
    props = { part }; let took = false; const v = new c.Mod();
    v.init({}, { ...cx, focus_handle: () => ({ focus() { took = true; } }) });
    assert.equal(took, takes, `${part} ${takes ? 'takes' : 'leaves'} the keyboard`);
  }

  // The head: many tabs overflow. T3's arrows sit together after the tabs, before the panel's buttons; at the start only › works.
  s.tabs = Array.from({ length: 12 }, (_, i) => ({ id: `file:f${i}.js`, path: `f${i}.js` })); s.active = s.tabs[0].id;
  const head = mod({ part: 'panel' });
  const measure = (root) => {
    for (const tab of s.tabs) find(root, `surface-${tab.id}`).handlers.on_size_change({ width: 200 }, cx);
    find(root, 'surface-scroll').handlers.on_size_change({ width: 600 }, cx);
    find(root, 'panel-head').handlers.on_size_change({ width: 900 }, cx);
  };
  let root = head.panelHead(t); measure(root); root = head.panelHead(t);
  assert.deepEqual(order(root, ['surface-scroll', 'surface-back', 'surface-next', 'panel-wide']), ['surface-scroll', 'surface-back', 'surface-next', 'panel-wide']);
  assert.equal(find(root, 'surface-back').style.opacity, 0.64, '‹ disabled at the start');
  assert.notEqual(find(root, 'surface-next').style.opacity, 0.64);
  for (let i = 0; i < 20; i++) find(head.panelHead(t), 'surface-next').handlers.on_click?.({}, cx);
  root = head.panelHead(t);
  assert.equal(find(root, 'surface-next').style.opacity, 0.64, '› disabled at the end');
  assert.notEqual(find(root, 'surface-back').style.opacity, 0.64);
  // The panel's cmd-t (keys.json → t3-chrome.surface-menu) opens + 's menu under +, where its press would.
  s.tabs = s.tabs.slice(0, 2); s.active = s.tabs[0].id; root = head.panelHead(t); root = head.panelHead(t);
  calls.length = 0; commands.shift()('surface-menu'); await flush();
  const menu = calls.find(([k]) => k === 'overlay')[1];
  // 1800 px wide, zoom 2: the head (900 px, 450 logical) ends 8 in from the right; its strip starts 12 in, + after two 100 tabs and their 4px gaps.
  assert.equal(menu.props.part, 'surface-menu');
  assert.deepEqual({ ...menu.at }, { x: 1800 - (8 + 450) * 2 + (12 + 2 * 104) * 2, y: (32 + 6) * 2 });
  assert.equal(menu.height, 2 * 28 + 8, 'as tall as its rows');
  // A press on + : under its box.
  calls.length = 0; const add = find(root, 'surface-add');
  add.handlers.left({ bounds: { x: 500, y: 10, width: 48, height: 48 } }, cx); add.handlers.on_click({}, cx);
  assert.deepEqual({ ...calls.find(([k]) => k === 'overlay')[1].at }, { x: 500, y: 70 });
  // A middle press closes its tab; a right press opens its menu, as tall as its rows: a file's has Copy path, Review's not.
  find(root, 'surface-file:f0.js').handlers.middle({}, cx); assert.deepEqual(calls.at(-1), ['close', 'file:f0.js', undefined]);
  s.tabs.push({ id: 'review' });
  for (const [id, rows] of [['file:f0.js', 5], ['review', 4]]) {
    calls.length = 0; find(head.panelHead(t), `surface-${id}`).handlers.right({}, cx);
    assert.equal(calls.find(([k]) => k === 'overlay')[1].height, rows * 28 + 8, `${id}: ${rows} rows`);
  }
  // Its menu: the rightmost can't close to its right; Close others closes the rest.
  props = { part: 'surface-context', space: 's', target: 'review' }; view = mod(props);
  assert.equal(find(view.surfaceView(t), 'surface-option-2').style.opacity, 0.64);
  find(view.surfaceView(t), 'surface-option-1').handlers.on_click({}, cx); assert.deepEqual(calls.at(-1), ['close', 'review', 'others']);
  // A tab's name: a tooltip only when cut, and then its name, as T3's file tabs don't tell same names apart.
  s.tabs = [{ id: 'file:src/app.js', path: 'src/app.js' }]; s.active = s.tabs[0].id; props = { part: 'panel' };
  const named = (width) => { tips.length = 0; let r = head.panelHead(t); find(r, 'text-name-surface-file:src/app.js').handlers.on_size_change({ width }, cx); find(r, 'text-measure-surface-file:src/app.js').handlers.on_size_change({ width: 72 }, cx); tips.length = 0; head.panelHead(t); return tips.find(([id]) => id === 'surface-file:src/app.js'); };
  assert.equal(named(72), undefined, 'a whole name has no tooltip');
  assert.deepEqual(named(40), ['surface-file:src/app.js', 'app.js'], 'cut, its name');
  console.log('ok: panel head arrows, + and cmd-t menus under +, tab menus fit their rows, Review offered where the tab works');
})().catch(e => { console.error(e); process.exit(1); });
