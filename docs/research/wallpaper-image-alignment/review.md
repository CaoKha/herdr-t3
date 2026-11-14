# Wallpaper focused review

What this change does: New images can use Dots, Braille, Blocks or Quadrants, with half-width cells and eight theme brightness steps. A cached image makes framing cheaper; saved wallpaper still uses vector tiles.

Reviewed baseline `d3b300affbc53422b60e0e4200343c75c3f0296c`, commits `3e3f4f21` and `46f020a3`, and the assigned working-tree wallpaper changes. Review is read-only apart from this report. Assumed load: one desktop user, including rapid mode changes and transient file-write errors.

## Resolution recheck

Both findings below are **resolved** in the reviewed working tree. This follow-up covers only the two fixes and their regression checks; it does not expand the original review scope.

- Finding 1: `previewImage` replaces the original tile colours **before** inserting the theme-coloured group. The original black-theme case now produces exactly `stroke="#000000"`, with no duplicated prefix.
- Finding 2: `renderDraft` uses one `base` for its scene and output path. Its finalizer retains that output while `d.scene.base === base`, even if another generation has superseded its job. Abandoned, unpublished output still gets removed, and a cancelled draft still clears its own root.
- Independently replayed the report's original two in-memory scenarios against the fixed code, changing only the assertions to require the desired result. Both passed. The cleanup replay still starts the next mode while the previous job's old-folder removal waits, then injects a failure in that next mode: the published scene's folder remains intact (`publishedFolderDeleted: false`).
- Read the added regression checks and their logs (not kept in the repo): the black-theme check failed on `#000000000`; the published-frame check failed on deletion of the displayed frame; the lifecycle check reported the complete lifecycle passing; the layout check reported 312 passing combinations. Did not rerun these gates.
- Fixed `main.js` SHA256: `fa0b9b4a4345832e70c38d392d2bf4ba21f178f2297aeaa0d70d0bc2783850e4`.

## Original findings — both resolved

1. **A black theme colour becomes an invalid SVG colour** (`extras/mods/asciicn-wallpaper/main.js:147-148`).
   - **What this is:** `previewImage` adds the theme stroke to each group, then replaces the original black fills.
   - **Problem:** With the valid theme colour `#000000`, `replaceAll('#000', '#000000')` also rewrites the stroke just inserted. The output is `stroke="#000000000"`, not black. Dots and Braille use this stroke, so their cached preview can lose marks. The layout check itself uses `foreground: '#000000'` for its light theme, but never builds a preview image.
   - **Fix:** Replace the old tile's colour before inserting the new group header, or replace only complete original colour attributes. Add a black-theme preview assertion.
   - **If we skip it:** The cached preview can differ from the saved vector wallpaper in an ordinary black palette slot.

2. **A superseded job can delete the scene it already published** (`extras/mods/asciicn-wallpaper/main.js:387-393`).
   - **What this is:** A completed generation publishes its scene, waits for deletion of the previous scene, then cleans its own output if another job has superseded it.
   - **Problem:** Start generation A with an existing preview. Hold A's old-folder deletion after line 388 publishes A. Start generation B, then release A's deletion. A's `finally` sees `!current()` and deletes A's output, although `d.scene` and `d.image` still point there while B builds. If B fails, those pointers remain permanently broken. This was reproduced with controlled asynchronous scheduling and a retryable write failure, without touching disk.
   - **Fix:** Cleanup must preserve an output folder that is still the published scene. Track successful publication or compare the folder with the active scene before deleting it; a later successful generation can remove it. Add this publication/cleanup interleaving to the lifecycle check.
   - **If we skip it:** Fast switches can leave the preview backed by deleted files, especially when the newest mode fails.

## Historical reproducer for both findings

Run against the original reviewed implementation from the repository root. Its assertions expect the broken results, so they intentionally fail on the fixed implementation. This only reads source; all filesystem calls inside the mod are replaced by in-memory stubs.

```sh
node <<'NODE'
const fs = require('node:fs'), vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('extras/mods/asciicn-wallpaper/main.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export default class', 'globalThis.Mod = class');
function runtime(extra) {
  const c = vm.createContext({ View: class {}, SCENES: [], appHome: () => '/owned', ...extra });
  vm.runInContext(source, c);
  return new c.Mod();
}
const cx = { notify() {}, timer: { after: (_, fn) => fn(cx) } };
(async () => {
  const parts = new Map(); let body;
  const m = runtime({
    theme: () => ({ foreground: '#000000' }),
    writeTextFile: async (p, b) => parts.set(p, b),
    exec: async (cmd) => {
      if (cmd === 'sh') body = [...parts.values()].join('');
      return { code: 0, stderr: '' };
    }
  });
  m.dir = '/owned';
  const d = m.draft = { dir: '/owned/d', scene: { base: 'd', width: 1, height: 1 },
    layers: [{ tint: 'foreground', opacity: 1,
      body: '<svg fill="none" stroke="#000"><path stroke-width=".1" d="M.5 .5h0"/></svg>' }] };
  await m.previewImage(d, cx);
  assert.ok(body.includes('stroke="#000000000"'));
  console.log('1 reproduced: invalid stroke="#000000000"');

  let releaseOld, enteredOld;
  const hold = new Promise(r => releaseOld = r);
  const entered = new Promise(r => enteredOld = r), removed = [];
  const h = runtime({
    sampleImage: function* () { return {}; },
    imageAns: function* () { return '●'; },
    exec: async (cmd, args) => {
      if (cmd === 'rm') {
        if (args.at(-1) === '/owned/old') { enteredOld(); await hold; }
        removed.push(args.at(-1));
      }
      return { code: 0, stderr: '' };
    }
  });
  const p = h.draft = { id: 'draft', dir: '/owned/asciicn-wallpaper/.preview/draft',
    style: 'dots', pixels: {}, plan: {}, scene: { base: 'old' }, layers: [] };
  let draws = 0, failSecond;
  const secondDraw = new Promise((resolve, reject) => {
    failSecond = () => reject(new Error('retryable image write failure'));
  });
  h.drawTiles = async () => ++draws === 1
    ? { width: 1, height: 1, tiles: [], layers: [] } : secondDraw;
  h.previewImage = async (_d, _cx, scene) => ({ image: `${scene.base}/image.svg`, palette: '' });
  const first = h.renderDraft(p, cx);
  await entered;
  const second = h.setStyle('braille', cx);
  releaseOld(); await first;
  assert.ok(removed.includes('/owned/' + p.scene.base));
  failSecond(); await second;
  assert.ok(removed.includes('/owned/' + p.scene.base));
  assert.equal(p.error, 'retryable image write failure');
  console.log('2 reproduced:', JSON.stringify({ scene: p.scene.base,
    image: p.image, error: p.error, publishedFolderDeleted: true }));
})().catch(e => { console.error(e); process.exitCode = 1; });
NODE
```

## Checked and not checked

- Traced source decode → shared RGBA → mode sampler → ANSI → SVG tiles → preview image → Apply, generation cancellation, theme repaint, retry and cleanup callers. Read the changed checks, upstream-oracle fixture generator, legacy hashes and wallpaper storage/layout contracts.
- Reused the supplied existing gate evidence; the repository log ends in `all checks passed`. Did not rerun those gates.
- A narrow maximum-grid, solid-white input probe measured individual `convert().next()` blocks: Dots 12.17ms, Braille 18.60ms, Blocks 10.35ms, Quadrants 11.13ms. A 2,963,376-byte Braille preview body took 4.96–9.55ms before its first asynchronous boundary on this machine. This does not reproduce a sustained freeze; the 6ms `finish` budget is not a hard limit on every other conversion step.
- Fixed slots and compact labels were inspected in code and the 312-case structural check. Actual text fit at reduced window sizes was not verified visually. No window, clipboard, user image or installed configuration was accessed.
- No implementation changes, commits, background tasks or temporary files were created. This report is the only added file.
- Reviewed `main.js` SHA256: `d696842d116bbaa1f36b9253964fc6096b48ece0d121c9a75b82675652a1315e`; `ascii-art.js`: `bd1883c7777e36d739524a3c73299d65a6076424a531a9964c0f5bb37ac71790`.

Verdict: Ship. Both reported defects are resolved within the follow-up scope.

Not checked: native SVG rendering of the invalid colour, real GUI replay of the cleanup race, reduced-window screenshots, Linux/Windows and high-DPI displays.
