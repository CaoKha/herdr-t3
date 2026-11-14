"""Sample an image the way asciicn's sampleToField does (lib/ascii/sample.ts).

Cover-crop to the box aspect, resize with a high-quality kernel to a whole
multiple of the sample grid, average every k x k block into one sample:
colour is the block mean, tone is luma of that mean (alpha 1 everywhere here).
Writes <out>.bin: header json line, then float32 tones, then uint8 rgb.
"""
import json
import sys

import numpy as np
from PIL import Image

src, columns, rows, gx, gy, aspect, out = sys.argv[1:8]
columns, rows, gx, gy, aspect = int(columns), int(rows), int(gx), int(gy), float(aspect)

image = Image.open(src).convert("RGB")
sw, sh = image.size
size = (sw, sh)
# placeSource with fit="cover": centre-crop the long side to the box shape.
if sw / sh > aspect:
    cw = int(round(sh * aspect))
    box = ((sw - cw) // 2, 0, (sw - cw) // 2 + cw, sh)
else:
    ch = int(round(sw / aspect))
    box = (0, (sh - ch) // 2, sw, (sh - ch) // 2 + ch)
image = image.crop(box)
sw, sh = image.size

width, height = columns * gx, rows * gy
k = max(1, min(4, int(min(sw / width, sh / height))))
big = image.resize((width * k, height * k), Image.LANCZOS)
a = np.asarray(big, dtype=np.float32)  # H*k, W*k, 3
a = a.reshape(height, k, width, k, 3)
colors = a.mean(axis=(1, 3))  # mean over the k x k block
tones = (0.2126 * colors[:, :, 0] + 0.7152 * colors[:, :, 1] + 0.0722 * colors[:, :, 2]) / 255.0
header = {"width": width, "height": height, "k": k, "crop": box}
with open(out, "wb") as f:
    f.write((json.dumps(header) + "\n").encode())
    f.write(np.ascontiguousarray(tones, dtype=np.float32).tobytes())
    f.write(np.ascontiguousarray(np.round(colors), dtype=np.uint8).tobytes())
print(f"sampled {width}x{height} k={k} crop={box}")
