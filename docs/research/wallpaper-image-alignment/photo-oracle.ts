// Actual photo replay against upstream mapTones; source/native frames stay outside the repo.
// bun photo-oracle.ts <vendored-upstream> <owned-draft.bmp> <owned-native-ans-folder>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeBmp, imageAns, imagePlan, sampleImage } from '../../../extras/mods/asciicn-wallpaper/ascii-art.js';

const [site, bmp, frames] = process.argv.slice(2);
const { mapTones } = await import(pathToFileURL(resolve(site, 'frame.ts')).href);
const { autoLevels } = await import(pathToFileURL(resolve(site, 'auto-levels.ts')).href);
const finish = it => { for (;;) { const r = it.next(); if (r.done) return r.value; } };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pixels = finish(decodeBmp(readFileSync(bmp).toString('base64'))), plan = imagePlan(2756, 1654);
assert.deepEqual([pixels.width, pixels.height], [plan.width, plan.height]);
const cellsOf = text => {
  const cells = []; let rgb = null;
  for (const m of text.replace(/^\x1b\]777;asciicn-wallpaper;image-v3\x07/, '').matchAll(/\x1b\[([0-9;]*)m|([^\x1b\n])/gu)) {
    if (m[1] !== undefined) { const code = m[1].split(';').map(Number); rgb = code[0] === 38 ? code.slice(2) : null; }
    else cells.push([m[2], m[2] === ' ' ? null : rgb]);
  }
  return cells;
};
for (const style of ['dots', 'braille', 'blocks', 'quadrants']) {
  const sampled = finish(sampleImage(pixels, style, plan));
  const own = cellsOf(finish(imageAns(sampled, style)));
  const frame = mapTones(autoLevels({ width: sampled.width, height: sampled.height, colors: sampled.rgba, tones: sampled.tones }),
    plan.columns, plan.rows, { charset: style, colorMode: 'truecolor', dither: 'none' });
  const expected = frame.glyphs.map((g, i) => [g, g === ' ' ? null : Array.from(frame.colors.slice(i * 4, i * 4 + 3))]);
  assert.equal(hash(own), hash(expected), `${style}: every glyph/RGB matches upstream`);
  for (const theme of ['dark', 'light']) {
    const native = cellsOf(readFileSync(resolve(frames, `final-${theme}-${style}.ans`), 'utf8'));
    assert.equal(hash(native), hash(expected), `${style}/${theme}: real native output matches upstream`);
  }
  assert.ok(expected.slice(80 * plan.columns).some(([g]) => g !== ' '), 'the bottom of the real picture is not truncated');
  console.log(JSON.stringify({ style, columns: plan.columns, rows: plan.rows, cells: expected.length, glyphAndRgbSha256: hash(expected), nativeThemes: ['dark', 'light'], mismatches: 0 }));
}
