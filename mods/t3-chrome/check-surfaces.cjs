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
const calls = [], tips = []; let props = { part: 'surface-empty' }, s = { pages: ['files', 'review', 'panel-empty'], tabs: [], active: null };
const glyph = src => { const el = element(); el.src = src; return el; };
const c = vm.createContext({ View: class {}, div: element, h_flex: element, v_flex: element, svg: glyph, image: glyph,
  props: () => props, panelState: () => s, spaces: () => [{ id: 's', active: true }], settings: () => ({ zoom: 1 }), window: () => ({ platform: 'macos' }), shared: () => null,
  showPage: id => calls.push(['add', id]), closeSurface: (id, mode) => calls.push(['close', id, mode]), activateSurface: id => calls.push(['select', id]),
  hidePanel() {}, toggleWide() {}, openOverlay: p => calls.push(['overlay', p]), closeOverlay: () => calls.push(['dismiss']), run() {},
  drawButton: (_t, id) => element().id(id), radiusOf: () => 8, fileIcon: () => 'icons/cat/js.svg',
  tip: (_v, _t, id, label, el) => { tips.push([id, label]); return new Proxy(el, { get(target, key) {
    assert.notEqual(key, 'on_mouse_down', 'a tooltip Popup cannot own native input listeners; attach to its trigger');
    return target[key];
  } }); }, stop: (_v, _t, _i, el) => el, focusRoot: (_v, el) => el, within: () => false, glow: () => () => {},
});
vm.runInContext(['pierre-icons-data.js', 'pierre-icons.js'].map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), c);
vm.runInContext(fs.readFileSync(__dirname + '/../../shared/measured-text.js', 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), c);
vm.runInContext(fs.readFileSync(__dirname + '/main.js', 'utf8').replace(/^import .*;\n/gm, '').replace('export default class', 'globalThis.Mod = class'), c);
const view = new c.Mod(), t = { foreground: '#ffffff', muted: '#888888', selected: '#333333' }, cx = { notify() {}, stop_propagation() {} };
view.surfaceKeys = { focus() {} }; view.surfaceAt = -1; view.reviewReason = 'Remote space';
const key = stroke => view.surfaceView(t).handlers.on_key_down({ key: stroke.split('-').at(-1), keystroke: stroke }, cx);
key('cmd-f'); key('r'); assert.equal(calls.length, 0, 'modified letters and disabled Review do nothing');
key('down'); key('enter'); assert.deepEqual(calls.pop(), ['add', 'files']);
view.reviewReason = ''; key('r'); assert.deepEqual(calls.pop(), ['add', 'review']);
s.pages = ['files', 'panel-empty']; assert.equal(find(view.surfaceView(t), 'surface-option-1'), undefined, 'uninstalled Review is absent');
s.tabs = Array.from({ length: 30 }, (_, i) => ({ id: `file:file-${i}.js`, path: `file-${i}.js` })); s.active = s.tabs[29].id;
view.surfaceRoom = 120; props = { part: 'panel' };
let root = view.panelHead(t);
assert.equal(find(root, 'surface-file:file-29.js').items[0].id, 'surface-close-file:file-29.js', 'close shares the leading icon slot');
assert.equal(find(root, 'surface-strip').items.at(-1).id, 'surface-add', '+ follows the last tab inside the scroll strip');
for (const id of ['surface-add', 'panel-wide', 'panel-close', 'surface-back', 'surface-next']) assert.ok(find(root, id), id);
assert.equal(find(root, 'surface-scroll').style.min_w, 0, 'overflow gives space back to controls');
find(root, 'surface-file:file-29.js').handlers.middle({}, cx); assert.deepEqual(calls.pop(), ['close', 'file:file-29.js', undefined]);
props = { part: 'surface-context', space: 's', target: s.active }; view.surfaceAt = -1;
root = view.surfaceView(t); assert.equal(find(root, 'surface-option-3').style.opacity, 0.5, 'rightmost cannot close to the right');
find(root, 'surface-option-2').handlers.on_click({}, cx); assert.deepEqual(calls.pop(), ['close', s.active, 'others']);
s.tabs = [{ id: 'file:docs', path: 'docs', folder: true }]; s.active = 'file:docs'; props = { part: 'panel' };
assert.equal(find(view.panelHead(t), 'surface-close-file:docs').items[0].src, 'mods/t3-chrome/icons/folder-tree.svg', 'a folder surface uses the Files glyph, never a file extension icon');
s.tabs = [{ id: 'file:app.js', path: 'app.js' }]; s.active = 'file:app.js';
assert.match(find(view.panelHead(t), 'surface-close-file:app.js').items[0].src, /icons\/pierre\/file-tree-builtin-javascript\.svg$/, 'a file tab shares Files Pierre shapes');
s.tabs = [{ id: 'file:src/app.js', path: 'src/app.js' }]; s.active = s.tabs[0].id;
tips.length = 0; root = view.panelHead(t);
assert.equal(tips.some(([id]) => id === 'surface-file:src/app.js'), false, 'an unmeasured path does not make a permanent tooltip');
const measure = (id, width) => { const node = find(root, id); assert.ok(node, id); node.handlers.on_size_change({ width }, cx); };
measure('text-name-surface-file:src/app.js', 36); measure('text-measure-surface-file:src/app.js', 36);
tips.length = 0; root = view.panelHead(t);
assert.equal(tips.some(([id]) => id === 'surface-file:src/app.js'), false, 'a whole basename has no tooltip even when its path differs');
measure('text-name-surface-file:src/app.js', 20);
tips.length = 0; root = view.panelHead(t);
assert.deepEqual(tips.find(([id]) => id === 'surface-file:src/app.js'), ['surface-file:src/app.js', 'src/app.js'], 'only text actually clipped gets its path tooltip');
console.log('ok: surface startup keys, availability, overflow controls, middle close and tab context menu');
