"""Three panels side by side with a title and captions, for the report."""
import sys

from PIL import Image, ImageDraw, ImageFont

out, title = sys.argv[1], sys.argv[2]
items = [(sys.argv[i], sys.argv[i + 1]) for i in range(3, len(sys.argv), 2)]
PW, PH, GAP, PAD, TOP, CAP = 620, 372, 10, 20, 56, 30
W = PAD * 2 + PW * len(items) + GAP * (len(items) - 1)
H = TOP + PH + CAP
img = Image.new("RGB", (W, H), "#101012")
draw = ImageDraw.Draw(img)
big = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", 24)
small = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", 17)
draw.text((PAD, 14), title, font=big, fill="#e8e8ea")
for i, (path, caption) in enumerate(items):
    x = PAD + i * (PW + GAP)
    panel = Image.open(path).convert("RGB").resize((PW, PH), Image.LANCZOS)
    img.paste(panel, (x, TOP))
    draw.text((x, TOP + PH + 8), caption, font=small, fill="#b9b9c0")
img.save(out)
print(f"{out}: {W}x{H}")
