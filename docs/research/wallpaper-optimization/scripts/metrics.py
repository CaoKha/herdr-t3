# python3 -I metrics.py <out dir> : per render, how the drawn picture's lightness tracks the source's.
import sys, json, glob, os
import numpy as np
from PIL import Image
out = sys.argv[1]
def L(img):  # OKLab lightness from sRGB
    a = np.asarray(img.convert("RGB"), dtype=np.float64) / 255
    a = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    l = np.cbrt(0.4122214708*a[...,0]+0.5363325363*a[...,1]+0.0514459929*a[...,2])
    m = np.cbrt(0.2119034982*a[...,0]+0.6806995451*a[...,1]+0.1073969566*a[...,2])
    s = np.cbrt(0.0883024619*a[...,0]+0.2817188376*a[...,1]+0.6299787005*a[...,2])
    return 0.2104542553*l+0.793617785*m-0.0040720468*s
src_cache = {}
rows = []
for png in sorted(glob.glob(f"{out}/r-*.png")):
    name = os.path.basename(png)[2:-4]
    base, style_theme = name.split("-", 1)[0], name
    meta = json.load(open(png[:-4] + ".json"))
    img = Image.open(png); W, H = img.size
    gw, gh = 80, max(8, round(80 * H / W))
    r = L(img.resize((gw, gh), Image.BOX))
    stem = os.path.basename(meta["ans"])[:-4]
    pic = stem.rsplit("-", 1)[0]
    style = stem.rsplit("-", 1)[1]
    theme = name[len(stem) + 1:]
    key = (pic, gw, gh)
    if key not in src_cache:
        s = Image.open(os.path.expanduser(f"~/Pictures/{pic}.png")).convert("RGB")
        sw, sh = s.size; aspect = W / H
        w = min(sw, round(sh * aspect)); h = min(sh, round(sw / aspect))
        s = s.crop(((sw - w)//2, (sh - h)//2, (sw - w)//2 + w, (sh - h)//2 + h))
        src_cache[key] = L(s.resize((gw, gh), Image.BOX))
    sL = src_cache[key]
    bg = L(Image.new("RGB", (1, 1), json.load(open(os.path.expanduser(f"~/.config/herdr-app/themes/{theme}.json")))["background"]))[0,0]
    corr = float(np.corrcoef(r.ravel(), sL.ravel())[0, 1])
    hi, lo = sL >= np.quantile(sL, 0.75), sL <= np.quantile(sL, 0.25)
    vis = np.abs(r - bg)
    rows.append(dict(pic=pic, style=style, theme=theme, corr=round(corr, 2), spread=round(float(np.quantile(r, .95) - np.quantile(r, .05)), 3),
                     hiVis=round(float(vis[hi].mean()), 3), loVis=round(float(vis[lo].mean()), 3)))
json.dump(rows, open(f"{out}/metrics.json", "w"), ensure_ascii=False, indent=0)
import collections
agg = collections.defaultdict(list)
for x in rows: agg[(x["theme"], x["style"])].append(x)
print("theme\tstyle\tcorr(mean)\tspread\thiVis\tloVis")
for (t, s), xs in sorted(agg.items()):
    f = lambda k: round(sum(x[k] for x in xs) / len(xs), 3)
    print(f"{t}\t{s}\t{f('corr')}\t{f('spread')}\t{f('hiVis')}\t{f('loVis')}")
