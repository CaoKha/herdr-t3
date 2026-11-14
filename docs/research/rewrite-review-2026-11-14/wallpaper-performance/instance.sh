#!/bin/sh
# An isolated Herdr (own app home, HOME and core, HERDR_APP_BENCH on) showing one wallpaper version full-window, with the
# probe mod in a 0px block above it. Modelled on scripts/demo/stage.sh, without projects or agents.
#   instance.sh up <label> <wallpaper mod folder>   build /private/tmp/wp-perf/inst-<label>, seed saved-image.ans, open it
#   instance.sh cmd <label> '<json>'                 hand the probe a command and wait until it is done
#   instance.sh do <label> <herdr-app args…>         herdr-app inside it
#   instance.sh restart <label>                      close and reopen the window, app home kept
#   instance.sh down <label>                         close it, stop its core, delete its folder
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../.." && pwd)
M=/private/tmp/wp-perf/materials
label=$2 D=/private/tmp/wp-perf/inst-$2
H=$D/home A=$D/app

demo() {
  env -i HOME="$H" USER=perf LOGNAME=perf SHELL=/bin/zsh TERM=xterm-256color LANG=en_US.UTF-8 PATH="$PATH" HC_SESSION="wp-perf-$label" \
    XDG_CONFIG_HOME="$D/xdg/config" XDG_STATE_HOME="$D/xdg/state" XDG_DATA_HOME="$D/xdg/data" XDG_RUNTIME_DIR="$D/xdg/run" XDG_CACHE_HOME="$D/xdg/cache" \
    HERDR_APP_HOME="$A" HERDR_APP_BENCH="$D/bench.jsonl" HERDR_TELEMETRY=0 DO_NOT_TRACK=1 "$@"
}
ours() { [ -f "$D/app.pid" ] && ps eww -o command= -p "$(cat "$D/app.pid")" 2>/dev/null | grep -q "HERDR_APP_HOME=$A "; }

launch() {
  W=/Applications/OmniWM.app/Contents/MacOS/omniwmctl
  back=$(pgrep -qx OmniWM && "$W" query focused-window --format json | jq -r '.result.payload.window.id // empty' || true)
  perl -MTime::HiRes=time -e "printf q(%d), time*1000" > "$D/launched"
  ( cd "$H"; demo python3 -I -c 'import os, sys; os.setsid(); os.execv(sys.argv[1], sys.argv[1:])' /Applications/Herdr.app/Contents/MacOS/Herdr > "$D/app.log" 2>&1 < /dev/null & )
  for _ in 1 2 3 4 5 6 7 8 9 10; do demo herdr-app status >/dev/null 2>&1 && break; sleep 1; done
  for p in $(pgrep -f 'MacOS/Herdr$'); do ps eww -o command= -p "$p" | grep -q "HERDR_APP_HOME=$A " && echo "$p" > "$D/app.pid"; done
  sleep 1
  [ -z "$back" ] || "$W" window focus "$back" >/dev/null 2>&1 || true
}

case $1 in
up)
  [ -e "$D" ] && { echo "$D exists: down first" >&2; exit 1; }
  src=$3
  mkdir -p "$H" "$A/mods/asciicn-wallpaper" "$A/mods/wp-probe" "$A/layouts" "$A/themes" "$A/asciicn-wallpaper" "$D/xdg/config" "$D/xdg/state" "$D/xdg/data" "$D/xdg/run" "$D/xdg/cache"
  rsync -a --exclude gpui-kit.d.ts --exclude jsconfig.json --exclude 'check*.cjs' --exclude harness.cjs "$src/" "$A/mods/asciicn-wallpaper/"
  cp "$here"/probe/main.js "$here"/probe/common.js "$A/mods/wp-probe/"
  cp "$here/probe/adapter-$label.js" "$A/mods/wp-probe/adapter.js"
  for f in ascii-art.js library.js scenes.js; do [ -f "$src/$f" ] && cp "$src/$f" "$A/mods/wp-probe/"; done
  echo '{ "place": "none" }' > "$A/mods/wp-probe/mod.json"
  cp "$repo"/extras/themes/*.json "$A/themes/" 2>/dev/null || true
  cat > "$A/layouts/perf.json" <<'EOF'
{ "id": "root", "type": "column", "titlebar": "none", "background": "background", "children": [
  { "id": "top", "type": "block", "size": { "px": 0 }, "content": { "mod": "wp-probe" } },
  { "id": "wp", "type": "block", "content": { "mod": "asciicn-wallpaper" } } ] }
EOF
  cat > "$A/settings.json" <<'EOF'
{ "appearance": "dark", "theme": { "light": "catppuccin-latte", "dark": "catppuccin-mocha" }, "zoom": 1, "sounds": { "enabled": false } }
EOF
  cp "$M/saved-image.ans" "$A/asciicn-wallpaper/saved-image.ans"
  jq -n '{"frame.welcomed": "finished", layout: "perf", "asciicn-wallpaper.scene": "file:saved-image"}' > "$A/shared.json"
  jq -n --arg l "$label" --arg m "$M" '{label: $l, materials: [
    {name: "photo-12mp-portrait", kind: "image", file: ($m + "/photo-12mp-portrait.jpg")},
    {name: "photo-48mp-portrait", kind: "image", file: ($m + "/photo-48mp-portrait.heic")},
    {name: "photo-33mp-camera", kind: "image", file: ($m + "/photo-33mp-camera.jpg")},
    {name: "big-png", kind: "image", file: ($m + "/big.png")},
    {name: "studio-ans", kind: "ans", file: ($m + "/studio.ans")}]}' > "$A/perf-config.json"
  jq -n --arg v "$(defaults read /Applications/Herdr.app/Contents/Info CFBundleShortVersionString)" '{last_run: $v, presented: [$v]}' > "$A/update-notes.json"
  echo '{ "state": "windowed", "bounds": [40, 60, 1440, 900] }' > "$A/window.json"
  demo hc server status --json >/dev/null 2>&1 || true
  launch
  echo "up: $D"
  ;;
cmd)
  seq=$(( $(jq -r '.seq // 0' "$A/perf-cmd.json" 2>/dev/null || echo 0) + 1 ))
  echo "$3" | jq --argjson s "$seq" '. + {seq: $s}' > "$A/perf-cmd.json"
  perl -MTime::HiRes=time -e 'printf qq(%d\n), time*1000'
  n=0
  until [ "$(jq -r '.seq // 0' "$A/perf-ack.json" 2>/dev/null || echo 0)" = "$seq" ]; do
    sleep 1; n=$((n + 1)); [ $n -lt "${WAIT:-1200}" ] || { echo "no ack after ${n}s" >&2; exit 1; }
  done
  cat "$A/perf-ack.json"; echo
  ;;
do) shift 2; demo herdr-app "$@" ;;
restart)
  ! ours || kill "$(cat "$D/app.pid")"; sleep 2; launch ;;
down)
  [ -d "$D" ] || exit 0
  ! ours || kill "$(cat "$D/app.pid")" 2>/dev/null || true
  demo hc server stop >/dev/null 2>&1 || true
  sleep 1; rm -rf "$D"; echo "down: $D"
  ;;
esac
