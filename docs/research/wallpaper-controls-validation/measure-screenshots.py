"""Measure the saved whole-window captures; needs the installed ImageMagick CLI."""
import collections
import json
import pathlib
import subprocess

folder = pathlib.Path(__file__).resolve().parent


def pixels(file, box):
    x, y, w, h = box
    raw = subprocess.check_output(['magick', str(file), '-crop', f'{w}x{h}+{x}+{y}',
                                   '+repage', '-depth', '8', 'rgb:-'])
    assert len(raw) == w * h * 3, (file, box)
    return [raw[n:n + 3] for n in range(0, len(raw), 3)]


def centre(file, box, ink=False):
    x, y, w, h = box
    colours = pixels(file, box)
    common = collections.Counter(colours).most_common(1)[0][0]
    points = [(n % w, n // w) for n, colour in enumerate(colours)
              if (sum(abs(a - b) for a, b in zip(colour, common)) > 36 if ink else colour == common)]
    assert points, (file, box)
    return [x + (min(a for a, b in points) + max(a for a, b in points)) / 2,
            y + (min(b for a, b in points) + max(b for a, b in points)) / 2]


baselines, rows = {}, []
for file in sorted(folder.glob('after-*.png')):
    toolbar = {button: centre(file, (2620 + x, 1982, 42, 40), ink=True)
               for button, x in zip(['previous', 'next', 'add', 'remove'], [85, 505, 565, 625])}
    boxes = ({'choose': (2670, 1020, 620, 82), 'import': (2670, 1110, 620, 80),
              'studio-guide': (2670, 1198, 620, 80), 'studio-open': (2670, 1383, 620, 80),
              'folder': (2670, 1823, 620, 80)} if 'guide-' in file.name else
             {'cancel': (2680, 1753, 300, 82), 'apply': (2980, 1753, 300, 82),
              'braille': (2680, 1425, 200, 200), 'blocks': (2880, 1425, 200, 200),
              'dots': (3082, 1425, 200, 200)} if 'preview-' in file.name else {})
    cards = {button: centre(file, box) for button, box in boxes.items()}
    if 'guide-' in file.name:
        cards['guide-close'] = centre(file, (3230, 854, 44, 44), ink=True)
    for button, point in (toolbar | cards).items():
        baseline = baselines.setdefault(button, point)
        assert all(abs(a - b) <= .5 for a, b in zip(point, baseline)), (file.name, button, baseline, point)
    row = {'screenshot': file.name, 'icon_centres_px': toolbar}
    if cards:
        row['card_button_centres_px'] = cards
    rows.append(row)

assert len(rows) == 34, 'Expected 17 states in each of two themes'
(folder / 'positions.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
print('ok: all buttons keep their centres within 0.5 physical pixels in 34 whole-window screenshots.')
