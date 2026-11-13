"""Compare whole demo captures to the report's website panels; measure actual button pixels."""
import collections
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

folder = Path(__file__).resolve().parent
website = folder.parent / 'wallpaper-asciicn-fidelity/evidence'
font = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 22)
for style, panel in [('dots', '01-dots'), ('braille', '03-braille'), ('blocks', '04-blocks-shades'), ('quadrants', '05-quadrants')]:
    site = Image.open(website / f'{panel}.png').crop((20, 56, 640, 428)).convert('RGB')
    for theme in ['dark', 'light']:
        actual = Image.open(folder / f'final-{theme}-{style}.png').convert('RGB')
        assert actual.size == (1280, 699), 'whole default-sidebar window, not a cropped card'
        out = Image.new('RGB', (1940, 770), '#101012')
        draw = ImageDraw.Draw(out)
        draw.text((20, 16), f'{style.title()} · website algorithm / true colour', font=font, fill='#eeeeef')
        draw.text((650, 16), f'Herdr · {theme} theme / complete demo window', font=font, fill='#eeeeef')
        out.paste(site, (20, 150))
        out.paste(actual, (650, 56))
        draw.text((20, 540), 'Website evidence: same source photo.', font=font, fill='#b9b9c0')
        draw.text((20, 575), 'Herdr colours intentionally follow theme.', font=font, fill='#b9b9c0')
        draw.text((20, 610), 'Frame cover may crop the outer edges.', font=font, fill='#b9b9c0')
        out.save(folder / f'compare-{theme}-{style}.png')

def centre(file, box, ink):
    x, y, w, h = box
    colors = list(Image.open(file).convert('RGB').crop((x, y, x+w, y+h)).get_flattened_data())
    common = collections.Counter(colors).most_common(1)[0][0]
    contrast = [sum(abs(a-b) for a, b in zip(c, common)) for c in colors]
    threshold = max(contrast) / 4
    points = [(i % w, i // w) for i, c in enumerate(colors)
              if (contrast[i] > threshold if ink else c == common)]
    assert points, (file.name, box)
    return [x + (min(a for a, b in points) + max(a for a, b in points))/2,
            y + (min(b for a, b in points) + max(b for a, b in points))/2]

def ink_shape(file, box):
    x, y, w, h = box
    colors = np.array(Image.open(file).convert('RGB').crop((x, y, x+w, y+h)), dtype=float)
    common = collections.Counter(map(tuple, colors.reshape(-1, 3))).most_common(1)[0][0]
    return np.abs(colors - common).sum(axis=2)[2:-2, 2:-2]

def translation(reference, current):
    h, w = reference.shape
    scores = []
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            a = reference[max(0,-dy):min(h,h-dy), max(0,-dx):min(w,w-dx)]
            b = current[max(0,dy):min(h,h+dy), max(0,dx):min(w,w+dx)]
            score = float((a*b).sum() / np.sqrt((a*a).sum() * (b*b).sum()))
            scores.append((score, dx, dy))
    return max(scores)[1:]

# Pixel registration, unlike a thresholded glyph bounding box, is stable under disabled/selected colour changes.
example = np.zeros((12, 20)); example[3:8, 4:6] = 1; example[8, 9] = .7
shifted = np.zeros_like(example); shifted[:, 1:] = example[:, :-1]
assert translation(example, example) == (0, 0) and translation(example, shifted) == (1, 0)

boxes = [
    ('dots', (980, 299, 62, 18), True), ('braille', (1046, 299, 62, 18), True),
    ('blocks', (1112, 299, 62, 18), True), ('quadrants', (1176, 299, 61, 18), True),
    ('fill', (1010, 402, 65, 18), True), ('fit', (1140, 402, 65, 18), True),
    ('reset', (972, 574, 88, 34), False), ('cancel', (1064, 574, 88, 34), False), ('apply', (1156, 574, 88, 34), False),
    ('previous', (983, 649, 22, 22), True), ('next', (1175, 649, 22, 22), True),
    ('add', (1203, 649, 22, 22), True), ('remove', (1231, 649, 22, 22), True),
]
rows, baseline, shapes = [], {}, {}
files = sorted(folder.glob('final-dark-*.png')) + sorted(folder.glob('final-light-*.png'))
files += [folder / 'final-rapid.png', folder / 'final-studio.png']
for file in files:
    positions = {}
    for name, box, ink in boxes:
        point = centre(file, box, ink)
        ref = baseline.setdefault(name, point)
        if ink:
            shape = ink_shape(file, box)
            shift = translation(shapes.setdefault(name, shape), shape)
            assert shift == (0, 0), (file.name, name, shift)
            point = ref
        else:
            assert point == ref, (file.name, name, ref, point)
        positions[name] = point
    rows.append({'screenshot': file.name, 'centres_px': positions})
(folder / 'button-positions.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
print(f'ok: all 13 button centres have zero drift across {len(rows)} whole-window state/theme captures.')
print('ink labels/icons use normalized pixel registration; self-check detects a one-pixel shift.')
print(json.dumps(baseline))
