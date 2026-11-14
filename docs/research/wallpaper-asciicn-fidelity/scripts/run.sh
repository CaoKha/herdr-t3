#!/bin/sh
# Rebuild the panels in ../evidence from the current wallpaper's original picture.
# Needs bun, python3 with Pillow and numpy, ImageMagick and rsvg-convert.
#   sh run.sh [picture] [theme json]      (default: this Mac's current wallpaper)
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
PICTURE=${1:-$HOME/Pictures/146943457_p0.png}
THEME=${2:-$HOME/.config/herdr-app/themes/maple-dark.json}
ART=${ART:-$(cd "$HERE/../../../.." && pwd)/extras/mods/asciicn-wallpaper/ascii-art.js}
WORK=${WORK:-/tmp/wallpaper-fidelity-run}
mkdir -p "$WORK/out"
cd "$WORK"
cp "$HERE"/*.py "$HERE"/*.ts "$HERE/proposed-ascii-art.js" .
[ -d site ] || sh "$HERE/vendor-asciicn.sh" ${CLONE:-/tmp/asciicn-src/asciicn} site
cp "$HERE/auto-levels.ts" site/auto-levels.ts
python3 -c "import json,sys; t=json.load(open('$THEME')); json.dump({'name': t.get('name','theme'), 'foreground': t['foreground'], 'background': t['background'], 'ansi': t['ansi']}, open('theme.json','w'))"

# asciicn side: a 1440x864 stage, cell 9 tall by 4.5 wide (Studio image defaults)
for m in "dots 1 1" "ramp 1 1" "quad 2 2" "braille 2 4"; do
  set -- $m
  python3 sample.py "$PICTURE" 320 96 $2 $3 1.666667 "out/$1.bin"
done
bun site-frame.ts out/dots.bin out/site-dots --charset dots --columns 320 --rows 96
bun site-frame.ts out/ramp.bin out/site-standard --charset standard --columns 320 --rows 96
bun site-frame.ts out/ramp.bin out/site-dense --charset dense --columns 320 --rows 96
bun site-frame.ts out/ramp.bin out/site-blocks --charset blocks --columns 320 --rows 96
bun site-frame.ts out/quad.bin out/site-quadrants --charset quadrants --columns 320 --rows 96
bun site-frame.ts out/braille.bin out/site-braille --charset braille --columns 320 --rows 96
bun site-frame.ts out/ramp.bin out/site-standard-bayer4 --charset standard --columns 320 --rows 96 --dither bayer4
bun site-frame.ts out/dots.bin out/site-dots-ansi16 --charset dots --columns 320 --rows 96 --colorMode ansi16
bun dump-shapes.ts out out/shapes.json

# our side: the saved frame as it is now, then each asciicn frame through our converter
bun theme-render.ts "$HOME/.config/herdr-app/asciicn-wallpaper/146943457_p0.ans" 1 out/ours-now theme.json --art "$ART"
bun theme-render.ts out/site-dots.ans 0.5 out/align-dots theme.json --art "$ART"
bun theme-render.ts out/site-dots.ans 0.5 out/align-dots-proposed theme.json --art ./proposed-ascii-art.js
for m in standard dense blocks quadrants braille standard-bayer4; do
  bun theme-render.ts "out/site-$m.ans" 0.5 "out/align-$m" theme.json --art "$ART"
done

for f in out/*.svg; do rsvg-convert -w 1440 -h 864 "$f" -o "${f%.svg}.png"; done
for m in dots standard dense blocks quadrants braille standard-bayer4 dots-ansi16; do
  python3 render-site.py "out/site-$m.json" 9 "out/site-$m-big.png" 3 "#1e1e1f" out/shapes.json
  magick "out/site-$m-big.png" -filter Lanczos -resize 1440x864! "out/panel-site-$m.png"
done

python3 assemble.py out/cmp-dots.png "1 · Halftone dots — 320x96 cells of 4.5x9 px" out/panel-site-dots.png "asciicn (truecolor)" out/ours-now.png "ours now (320x192, square cells)" out/align-dots.png "aligned: site geometry + theme tint"
python3 assemble.py out/cmp-standard.png "2 · Classic ramp (Studio image default)" out/panel-site-standard.png "asciicn (truecolor)" out/ours-now.png "ours now" out/align-standard.png "aligned: site algorithm + theme tint"
python3 assemble.py out/cmp-braille.png "3 · Braille 2x4" out/panel-site-braille.png "asciicn (truecolor)" out/ours-now.png "ours now" out/align-braille.png "aligned: site algorithm + theme tint"
python3 assemble.py out/cmp-blocks.png "4 · ANSI blocks (shades)" out/panel-site-blocks.png "asciicn (truecolor)" out/ours-now.png "ours now" out/align-blocks.png "aligned: site algorithm + theme tint"
python3 assemble.py out/cmp-quadrants.png "5 · Quadrants 2x2" out/panel-site-quadrants.png "asciicn (truecolor)" out/ours-now.png "ours now" out/align-quadrants.png "aligned: site algorithm + theme tint"
python3 assemble.py out/cmp-dense.png "6 · Dense 70 ramp" out/panel-site-dense.png "asciicn (truecolor)" out/ours-now.png "ours now" out/align-dense.png "aligned: site algorithm + theme tint"
python3 assemble.py out/cmp-standard-bayer4.png "7 · Classic ramp with Bayer 4 dithering" out/panel-site-standard-bayer4.png "asciicn (truecolor)" out/ours-now.png "ours now" out/align-standard-bayer4.png "aligned: site algorithm + theme tint"
python3 assemble.py out/cmp-colour.png "8 · Theme colour mapping (maple-dark), dots" out/panel-site-dots.png "asciicn, own colours" out/ours-now.png "ours now: 4 steps by luma" out/align-dots.png "aligned geometry, 4 steps" out/align-dots-proposed.png "aligned geometry, 8 steps by value"
magick out/panel-site-dots.png -crop 480x320+430+120 +repage out/crop-site-dots.png
magick out/ours-now.png -crop 480x320+430+120 +repage out/crop-ours-now.png
magick out/align-dots.png -crop 480x320+430+120 +repage out/crop-align-dots.png
python3 assemble.py out/cmp-detail.png "9 · Halftone dots, 1:1 detail" out/crop-site-dots.png "asciicn: 4.5x9 cells" out/crop-ours-now.png "ours now: 4.5x4.5 cells" out/crop-align-dots.png "aligned: site dots, theme tint"
echo "panels in $WORK/out"

# The files in ../evidence, palette-reduced to keep the repository small.
EVIDENCE="$HERE/../evidence"
mkdir -p "$EVIDENCE"
shrink() { magick "$1" -colors 200 -define png:compression-level=9 "$2"; }
magick "$PICTURE" -filter Lanczos -resize 960x576! "out/source.png"
shrink out/source.png "$EVIDENCE/00-source.png"
shrink out/cmp-dots.png "$EVIDENCE/01-dots.png"
shrink out/cmp-standard.png "$EVIDENCE/02-classic-ramp.png"
shrink out/cmp-braille.png "$EVIDENCE/03-braille.png"
shrink out/cmp-blocks.png "$EVIDENCE/04-blocks-shades.png"
shrink out/cmp-quadrants.png "$EVIDENCE/05-quadrants.png"
shrink out/cmp-dense.png "$EVIDENCE/06-dense-ramp.png"
shrink out/cmp-standard-bayer4.png "$EVIDENCE/07-classic-bayer4.png"
shrink out/cmp-colour.png "$EVIDENCE/08-theme-colour-steps.png"
shrink out/cmp-detail.png "$EVIDENCE/09-dots-detail.png"
echo "evidence in $EVIDENCE"
