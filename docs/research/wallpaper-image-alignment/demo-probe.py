#!/usr/bin/env python3
"""Instrument only an owned demo main.js. All actions use its production import/mode methods."""
import json
from pathlib import Path
import sys

main, source, output = map(Path, sys.argv[1:])
s = main.read_text()
commands = r'''
        if (command.startsWith("verify:")) {
          const [_, action, label, style] = command.split(":");
          const perf = globalThis.wpModes = { chunks: {}, heartbeats: [] }, started = Date.now();
          let last = started;
          const heartbeat = cx.timer.every(16, () => { const now = Date.now(); perf.heartbeats.push(now - last); last = now; });
          try {
            if (action === "import") await this.startPreview(SOURCE, "146943457_p0", cx);
            if (action === "ans") await this.startPreview(OUTPUT + '/studio.ans', 'Studio', cx, true);
            if (action === "style") { this.probeReady = null; await this.setStyle(style, cx); }
            if (action === "rapid") await Promise.all(['braille', 'blocks', 'dots', 'quadrants'].map(s => this.setStyle(s, cx)));
            if (action === "apply") {
              const d = this.draft;
              this.setPlacement(d, { mode:'contain', zoom:1.7, x:.65, y:.25 }, cx);
              this.appliedDraft = { style:d.style, placement:{...d.placement}, aspect:d.scene.aspect,
                imageMarked:d.text.startsWith('\x1b]777;asciicn-wallpaper;image-v3\x07') };
              await this.applyPreview(cx);
            }
            if (action === "state") {
              this.probeReady ??= {...this.draft};
              Object.assign(this.draft, this.probeReady, ({
                ready: {}, loading: {busy:true,scene:null,image:null,pixels:null}, converting: {busy:true},
                error: {error:'A long conversion error '.repeat(40)}, saveError: {saveError:'A retryable save error '.repeat(40)},
                applying: {applying:true}
              })[style]);
            }
            cx.notify();
            const d = this.draft;
            const report = { label, action, elapsed_ms: Date.now() - started, perf,
              style: d?.style, busy: d?.busy, error: d?.error, image: d?.image, palette: d?.palette,
              scene: d?.scene, placement: d?.placement, generation: d?.generation,
              pixels: d?.pixels && { width: d.pixels.width, height: d.pixels.height }, plan: d?.plan,
              selected:shared(KEY), savedPlacement:shared(PLACEMENTS)?.[shared(KEY)],
              activeScene:this.imported.find(s => s.id === shared(KEY)), appliedDraft:this.appliedDraft };
            await writeTextFile(OUTPUT + '/' + label + '.json', JSON.stringify(report), null);
            if (d?.text) await writeTextFile(OUTPUT + '/' + label + '.ans', d.text, null);
          } finally { heartbeat.cancel(); globalThis.wpModes = null; }
        }
'''.replace('SOURCE', json.dumps(str(source))).replace('OUTPUT', json.dumps(str(output)))
s = s.replace('if (command === "focus")', commands + '\n        if (command === "focus")')
s = s.replace('finish(sampleImage(d.pixels, d.style, d.plan),', 'finish(probeIter("sample", sampleImage(d.pixels, d.style, d.plan)),')
s = s.replace('finish(imageAns(sampled, d.style),', 'finish(probeIter("glyphs", imageAns(sampled, d.style)),')
s = s.replace('finish(decodeBmp(chunks),', 'finish(probeIter("decode", decodeBmp(chunks)),')
s = s.replace('const it = convert(text, aspect)', 'const it = probeIter("tiles", convert(text, aspect))')
# Keep only the demo BMP for a same-sampled-source oracle; production still removes it.
s = s.replace("await exec('rm', ['-f', bmp]);", '')
s += r'''
function* probeIter(name, it) {
  for (;;) {
    const start = Date.now(), step = it.next();
    if (globalThis.wpModes) (wpModes.chunks[name] ??= []).push(Date.now() - start);
    if (step.done) return step.value;
    yield step.value;
  }
}
'''
main.write_text(s)
