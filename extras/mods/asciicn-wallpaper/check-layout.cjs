// Render the real controls in each state; reserve slots instead of testing artwork or conversion internals.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function element() {
  const n = { items: [], style: {}, handlers: {} };
  const p = new Proxy(n, { get: (o, k) => k in o ? o[k] : (...a) => {
    if (k === 'child') n.items.push(a[0]);
    else if (k === 'children') n.items.push(...a[0]);
    else if (k === 'when') { if (a[0]) a[1](p); }
    else if (k === 'id') n.key = a[0];
    else if (k.startsWith('on_')) n.handlers[k] = a[0];
    else { n.style[k] = a; if (k === 'relative' || k === 'absolute') n.style.position = k; }
    return p;
  } });
  return p;
}
const find = (n, id) => !n || typeof n !== 'object' ? null : n.key === id ? n : n.items.map(x => find(x, id)).find(Boolean);
const scene = (id, name) => ({ id, name, width: 2, height: 1, focus: .5, tiles: [] });
const built = [scene('first', 'First'), scene('last', 'A much longer built-in name')];
let selected = 'first', platform = 'macos', dark = true;
const env = { View: class {}, div: element, svg: element, h_flex: element, v_flex: element, KEY: { focus: 'test.focus' }, appHome: () => '/app',
  SliderState: { new: () => ({ on() {}, value: () => 1, set_value() {}, release() {} }) },
  Slider: { new: element }, SliderTrack: { new: element }, SliderIndicator: { new: element }, SliderThumb: { new: element },
  SCENES: built, settings: () => ({ dark }), theme: () => ({ foreground: dark ? '#ffffff' : '#000000' }),
  window: () => ({ platform }), shared: k => k === 'asciicn-wallpaper.scene' ? selected : undefined, setShared: (k, v) => { if (k === 'asciicn-wallpaper.scene') selected = v; },
  focusRoot: (_v, el) => el, stop: (_v, _t, _id, el) => el };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default class', 'globalThis.Mod = class').replace(/^export /gm, '');
const source = read('button.js') + '\nconst drawButton = button;\n'
  + 'Object.assign(globalThis, (() => { const KEY = {focus: "test.focus"};\n' + read('focus.js')
  + '\nreturn { stop, focusRoot, stopsInit, stopsEnd, enter }; })());\n' + read('main.js');
const toolbar = ['wallpaper-back', 'wallpaper-next', 'wallpaper-add', 'wallpaper-remove'];
const draft = { name: 'Image', placement: { mode: 'cover', zoom: 1, x: .5, y: .5 }, scene: scene('preview:1', 'Image') };
const cases = [
  ['first', {}], ['last', {}, 'last'], ['imported short', { imported: [scene('file:x', 'x')] }, 'file:x'],
  ['imported long', { imported: [scene('file:x', 'A very long Unicode 壁纸 name '.repeat(6))] }, 'file:x'],
  ['one picture', {}, 'first', true], ['importing', { importing: 'A long importing filename '.repeat(6) }],
  ['delete confirmation', { deleting: { token: 'x' } }], ['guide', { guide: true }],
  ['guide opening', { guide: true, opening: true }], ['Studio expanded', { guide: true, studioGuide: true }],
  ['preview loading', { draft: { ...draft, scene: null, busy: true } }],
  ['preview ready', { draft }], ['preview converting', { draft: { ...draft, busy: true } }],
  ['preview applying', { draft: { ...draft, applying: true } }],
  ['preview error', { draft: { ...draft, error: 'A multiline error message '.repeat(40) } }],
  ['preview Fit', { draft: { ...draft, placement: { mode: 'contain', zoom: 3, x: .1, y: .9 } } }],
  ['preview save error', { draft: { ...draft, saveError: 'A retryable save error '.repeat(40) } }],
];
const baselines = {}, previewBaselines = {}, guideBaselines = {};
for (const width of [1000, 259]) for (dark of [true, false]) for (platform of ['macos', 'linux', 'windows']) for (const [name, state, choice = 'first', single] of cases) {
  built.splice(1, built.length, ...single ? [] : [scene('last', 'A much longer built-in name')]);
  const context = vm.createContext({ ...env });
  vm.runInContext(source, context);
  const mod = new context.Mod();
  let focused;
  const cx = { focus_handle: () => { const h = { focus: () => { focused = h; }, is_focused: () => focused === h }; return h; }, spawn() {}, notify() {} };
  mod.init({}, cx);
  Object.assign(mod, { height: 800, width, over: true });
  Object.assign(mod, { imported: [], importing: null, draft: null, guide: false, studioGuide: false, opening: false, deleting: null }, state);
  selected = choice;
  mod.fs.modal = !!state.draft;
  mod.fs.keyboard = true;
  if (state.draft) mod.composeFocus.focus();
  const tree = mod.render(), bar = find(tree, 'wallpaper-switcher');
  assert.ok(bar, `${name}: switcher remains present`);
  assert.deepEqual(bar.items.filter(n => typeof n.key === 'string').map(n => n.key), toolbar, `${name}: toolbar order`);
  assert.deepEqual(bar.style.right, [12]);
  assert.deepEqual(bar.style.bottom, [12]);
  assert.deepEqual(bar.style.gap, [4]);
  for (const id of toolbar) assert.ok(find(bar, id), `${name}: ${id} keeps its slot`);
  const label = bar.items[1];
  assert.deepEqual(label.style.w, [width === 1000 ? 160 : 115], `${name}: name/progress uses a fixed slot for this viewport`);
  const footprint = toolbar.map(id => find(bar, id).style.w);
  baselines[width] ??= footprint;
  assert.deepEqual(footprint, baselines[width], `${name}: toolbar button widths`);
  const remove = find(bar, 'wallpaper-remove');
  assert.equal(!!remove.handlers.on_click, choice.startsWith('file:') && !state.draft, `${name}: deletion availability`);
  assert.equal(!!find(bar, 'wallpaper-back').handlers.on_click, !state.draft && !single, `${name}: navigation availability`);
  const preview = find(tree, 'wallpaper-preview');
  if (preview) {
    assert.equal(find(tree, 'wallpaper-compose').style.position, 'absolute', `${name}: the real focus ring cannot collapse the full-Home canvas`);
    const d = state.draft, disabled = !d.scene || d.busy || !!d.error || d.applying;
    for (const id of ['wallpaper-cover', 'wallpaper-contain', 'wallpaper-reset', 'wallpaper-preview-cancel', 'wallpaper-preview-apply']) {
      const button = find(preview, id);
      assert.ok(button, `${name}: ${id} keeps its slot`);
      assert.deepEqual(button.style.flex_1, [], `${name}: equal-width action slots`);
      assert.deepEqual(button.style.min_w, [0]);
    }
    assert.equal(!!find(preview, 'wallpaper-cover').handlers.on_click, !disabled);
    assert.equal(!!find(preview, 'wallpaper-contain').handlers.on_click, !disabled);
    const reset = d.placement.zoom === 1 && d.placement.x === .5 && d.placement.y === .5;
    assert.equal(!!find(preview, 'wallpaper-reset').handlers.on_click, !disabled && !reset);
    assert.equal(!!find(preview, 'wallpaper-preview-cancel').handlers.on_click, !d.applying);
    assert.equal(!!find(preview, 'wallpaper-preview-apply').handlers.on_click, !disabled, `${name}: save errors remain retryable`);
    assert.deepEqual(find(preview, 'wallpaper-zoom').style.opacity, [disabled ? .64 : 1]);
    const footprint = [preview.style.bottom, preview.style.h, preview.style.w, preview.items.map(n => n.style.h)];
    assert.deepEqual(find(preview, 'wallpaper-preview-status').style.h, [60]);
    previewBaselines[width] ??= footprint;
    assert.deepEqual(footprint, previewBaselines[width], `${name}: preview controls keep their slots`);
  }
  const guide = find(tree, 'wallpaper-guide');
  if (guide) {
    const ids = ['wallpaper-guide-close', 'wallpaper-choose', 'wallpaper-import', 'wallpaper-studio-guide', 'wallpaper-studio', 'wallpaper-folder'];
    for (const id of ids) assert.ok(find(guide, id), `${name}/${platform}: ${id} keeps its slot`);
    assert.equal(!!find(guide, 'wallpaper-choose').handlers.on_click, !state.opening && platform !== 'windows');
    assert.equal(!!find(guide, 'wallpaper-import').handlers.on_click, !state.opening && platform !== 'windows');
    assert.equal(!!find(guide, 'wallpaper-studio').handlers.on_click, !!state.studioGuide);
    const footprint = guide.items.map(n => n.style?.h);
    guideBaselines[width] ??= footprint;
    assert.deepEqual(footprint, guideBaselines[width], `${name}/${platform}: guide rows keep their heights`);
  }
}
console.log('ok: wallpaper controls and focused canvas keep their slots in 204 state/theme/platform/viewport combinations.');
