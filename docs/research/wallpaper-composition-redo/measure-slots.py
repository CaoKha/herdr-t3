"""Measure the original 1280x699 demo captures, not a code-derived layout snapshot. Requires ImageMagick."""
import collections
import json
import pathlib
import subprocess

folder = pathlib.Path(__file__).resolve().parent


def centre(file, box, ink=False):
    x, y, w, h = box
    raw = subprocess.check_output(['magick', str(file), '-crop', f'{w}x{h}+{x}+{y}', '+repage', '-depth', '8', 'rgb:-'])
    assert len(raw) == w * h * 3, (file.name, box)
    colours = [raw[n:n+3] for n in range(0, len(raw), 3)]
    common = collections.Counter(colours).most_common(1)[0][0]
    contrast = [sum(abs(a-b) for a, b in zip(c, common)) for c in colours]
    threshold = max(contrast) / 4
    points = [(n % w, n // w) for n, c in enumerate(colours) if (contrast[n] > threshold if ink else c == common)]
    assert points, (file.name, box)
    return [x + (min(a for a, b in points) + max(a for a, b in points))/2,
            y + (min(b for a, b in points) + max(b for a, b in points))/2]


rows, baselines = [], {}
for file in sorted(folder.glob('new-slots-*.png')):
    positions = {name: centre(file, box, ink) for name, box, ink in [
        ('fill', (1010, 402, 65, 18), True), ('fit', (1140, 402, 65, 18), True),
        ('reset', (972, 574, 88, 34), False), ('cancel', (1064, 574, 88, 34), False), ('apply', (1156, 574, 88, 34), False),
        ('previous', (983, 649, 22, 22), True), ('next', (1175, 649, 22, 22), True),
        ('add', (1203, 649, 22, 22), True), ('remove', (1231, 649, 22, 22), True),
    ]}
    for name, point in positions.items():
        ref = baselines.setdefault(name, point)
        assert point == ref, (file.name, name, ref, point)
    rows.append({'screenshot': file.name, 'centres_px': positions})

assert len(rows) == 18, 'Expected 9 UI states in two themes'
(folder/'button-positions.json').write_text('[\n' + ',\n'.join(json.dumps(row, ensure_ascii=False) for row in rows) + '\n]\n')
print('ok: all nine button centres are identical in all 18 state/theme captures (zero drift).')
print(json.dumps(baselines))
