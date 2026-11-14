"""Draw an asciicn frame the way its canvas renderer does: geometric glyphs
(blocks, shades, quadrants, Braille, dots, lines) from lib/ascii/glyphs.ts as
shapes in a unit cell, everything else as font text in a monospace cell of
height cellH and advance 0.6em, with the cell's truecolor."""
import json
import math
import sys

from PIL import Image, ImageDraw, ImageFont

src, cell_h, out, scale, bg, shapes_path = sys.argv[1:7]
cell_h, scale = float(cell_h), int(scale)
frame = json.load(open(src))
shapes = json.load(open(shapes_path))
font = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", round(cell_h / 1.2 * scale))
cell_w = round(cell_h / 1.2 * 0.6, 3)
W, H = round(frame["columns"] * cell_w * scale), round(frame["rows"] * cell_h * scale)
img = Image.new("RGB", (W, H), bg)
draw = ImageDraw.Draw(img)
rgb = frame["rgb"]


def shape(glyph, x, y, colour):
    """Draw one glyph's primitives in the cell whose top-left is (x, y), pixels."""
    for part in shapes.get(glyph) or []:
        kind = part["kind"]
        if kind == "rect":
            draw.rectangle([x + part["x"] * cell_w * scale, y + part["y"] * cell_h * scale,
                            x + (part["x"] + part["w"]) * cell_w * scale, y + (part["y"] + part["h"]) * cell_h * scale],
                           fill=colour)
        elif kind == "dot":
            r = part["r"] * cell_w * scale
            cx, cy = x + part["cx"] * cell_w * scale, y + part["cy"] * cell_h * scale
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=colour)
        elif kind == "line":
            half = part["weight"] * cell_w * scale / 2
            x1, y1 = x + part["x1"] * cell_w * scale, y + part["y1"] * cell_h * scale
            x2, y2 = x + part["x2"] * cell_w * scale, y + part["y2"] * cell_h * scale
            length = math.hypot(x2 - x1, y2 - y1) or 1
            nx, ny = (y2 - y1) / length * half, -(x2 - x1) / length * half
            draw.polygon([(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)], fill=colour)


for row, line in enumerate(frame["glyphs"]):
    for col, glyph in enumerate(line):
        if glyph == " ":
            continue
        i = (row * frame["columns"] + col) * 3
        colour = (rgb[i], rgb[i + 1], rgb[i + 2])
        x, y = col * cell_w * scale, row * cell_h * scale
        if shapes.get(glyph) is not None:
            shape(glyph, x, y, colour)
        else:
            draw.text((x + cell_w * scale / 2, y + cell_h * scale / 2), glyph,
                      font=font, fill=colour, anchor="mm")
img.save(out)
print(f"{out}: {W}x{H}, cell {cell_w * scale}x{cell_h * scale}, font {round(cell_h / 1.2 * scale)}px")
