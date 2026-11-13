#!/bin/sh
# Run inside the owned guest after demo-probe.py; never target a person's app home.
set -eu
A=/private/tmp/wallpaper/app
OUT=/Users/lume/word-acceptance/output/wallpaper-image-alignment
prefix=${1:-final}
app() { HERDR_APP_HOME="$A" /Users/lume/.local/bin/herdr-app "$@"; }
capture() {
  action=$1 label=$2 value=$3
  [ ! -e "$OUT/$label.json" ] || { echo "$label already exists; use a fresh prefix" >&2; exit 1; }
  app do "asciicn-wallpaper.verify:$action:$label:$value"
  for n in $(seq 1 240); do [ ! -f "$OUT/$label.json" ] || break; sleep .25; done
  [ -f "$OUT/$label.json" ]
  sleep .7
  app shot "$OUT/$label.png"
}
for theme in ${2:-dark light}; do
  python3 - "$A/settings.json" "$theme" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1]); data = json.loads(p.read_text()); data['appearance'] = sys.argv[2]
p.write_text(json.dumps(data))
PY
  app do app.theme "{\"name\":\"maple-$theme\"}"
  sleep 1
  for style in braille blocks dots quadrants; do
    capture style "$prefix-$theme-$style" "$style"
  done
  for state in ready loading converting error saveError applying; do
    capture state "$prefix-$theme-$state" "$state"
  done
  capture state "$prefix-$theme-restored" ready
done
capture rapid "$prefix-rapid" ''
capture apply "$prefix-applied" ''
capture ans "$prefix-studio" ''
app status
