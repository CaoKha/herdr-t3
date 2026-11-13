#!/usr/bin/env python3
"""Instrument an owned demo copy, never the installed mod. Usage: probe.py main.js image.png output-dir."""
import json
import re
from pathlib import Path
import sys

main, image, output = map(Path, sys.argv[1:])
s = main.read_text()
for name in ('exec', 'readTextFile', 'writeTextFile'):
    s = s.replace(f'{name}(', f'perf{name}(')
    s += f'\nconst perf{name} = (...args) => {{ if (globalThis.wpPerf) wpPerf.{name}++; return {name}(...args); }};\n'
commands = '''
        if (command === "perf:import") { await this.startPreview(IMAGE, "performance", cx); }
        if (command.startsWith("perf:run:")) {
          const mode = command.slice(9), samples = [], started = Date.now();
          this.perf = globalThis.wpPerf = { exec: 0, readTextFile: 0, writeTextFile: 0, converts: 0, js: [] };
          if (mode !== "zoom") this.setPlacement(this.draft, {zoom: 2}, cx);
          if (mode === "pan") this.drag = { placement: {...this.draft.placement}, at: {x: 0, y: 0} };
          for (let n = 0; n < 100; n++) {
            const at = Date.now();
            if (mode === "zoom") this.setPlacement(this.draft, {zoom: 1 + n * .029}, cx);
            else if (mode === "pan") this.perfMove({position: {x: n * 3, y: 0}}, cx);
            else this.perfKey({key: "right", modifiers: {}}, cx);
            await new Promise(go => cx.timer.after(16, () => go()));
            samples.push(Date.now() - at);
          }
          const report = { mode, started, ended: Date.now(), samples, ...this.perf };
          globalThis.wpPerf = null;
          await writeTextFile(OUTPUT + "/" + mode + ".json", JSON.stringify(report), null);
        }
'''.replace('IMAGE', json.dumps(str(image))).replace('OUTPUT', json.dumps(str(output)))
s = s.replace('if (command === "focus")', commands + '\n        if (command === "focus")')
s = re.sub(r'async drawTiles\([^)]*\) \{', lambda m: m[0] + '\n    if (globalThis.wpPerf) wpPerf.converts++;', s, count=1)
s = re.sub(r'  render\([^)]*\) \{', lambda m: m[0] + '\n    const perfStart = Date.now();', s, count=1)
s = s.replace('.on_mouse_move((e, cx) => {', '.on_mouse_move(this.perfMove = (e, cx) => {', 1)
s = s.replace('.on_key_down((e, cx) => {', '.on_key_down(this.perfKey = (e, cx) => {', 1)
s = s.replace('return focusRoot(this, root.child(picture)', 'const perfTree = focusRoot(this, root.child(picture)')
s = s.replace('.child(this.guideCard(t))));', '.child(this.guideCard(t))));\n    if (globalThis.wpPerf) wpPerf.js.push(Date.now() - perfStart);\n    return perfTree;')
main.write_text(s)
