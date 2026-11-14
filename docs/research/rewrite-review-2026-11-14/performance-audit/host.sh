#!/bin/sh
# bench-core.js in an isolated Herdr (own app home, HOME and core), never the person's own window; modelled on
# ../wallpaper-performance/instance.sh. The probe is the only block. Prints perf-core.json, then takes it all down.
#   host.sh <build dir from prepare.sh>
set -eu
B=$1 D=/private/tmp/perf-audit-host
H=$D/home A=$D/app
[ -e "$D" ] && { echo "$D exists" >&2; exit 1; }
demo() {
  env -i HOME="$H" USER=perf LOGNAME=perf SHELL=/bin/zsh TERM=xterm-256color LANG=en_US.UTF-8 PATH="$PATH" HC_SESSION=perf-audit-host \
    XDG_CONFIG_HOME="$D/xdg/config" XDG_STATE_HOME="$D/xdg/state" XDG_DATA_HOME="$D/xdg/data" XDG_RUNTIME_DIR="$D/xdg/run" XDG_CACHE_HOME="$D/xdg/cache" \
    HERDR_APP_HOME="$A" HERDR_TELEMETRY=0 DO_NOT_TRACK=1 "$@"
}
mkdir -p "$H" "$A/mods/perf-probe" "$A/layouts" "$D/xdg/config" "$D/xdg/state" "$D/xdg/data" "$D/xdg/run" "$D/xdg/cache"
cp "$B"/*.js "$A/mods/perf-probe/"
echo '{ "place": "none" }' > "$A/mods/perf-probe/mod.json"
echo '{ "id": "root", "type": "column", "titlebar": "none", "children": [ { "id": "probe", "type": "block", "content": { "mod": "perf-probe" } } ] }' > "$A/layouts/perf.json"
echo '{ "appearance": "dark", "zoom": 1, "sounds": { "enabled": false } }' > "$A/settings.json"
jq -n '{"frame.welcomed": "finished", layout: "perf"}' > "$A/shared.json"
jq -n --arg v "$(defaults read /Applications/Herdr.app/Contents/Info CFBundleShortVersionString)" '{last_run: $v, presented: [$v]}' > "$A/update-notes.json"
echo '{ "state": "windowed", "bounds": [40, 60, 900, 600] }' > "$A/window.json"
W=/Applications/OmniWM.app/Contents/MacOS/omniwmctl
back=$(pgrep -qx OmniWM && "$W" query focused-window --format json | jq -r '.result.payload.window.id // empty' || true)
( cd "$H"; demo python3 -I -c 'import os, sys; os.setsid(); os.execv(sys.argv[1], sys.argv[1:])' /Applications/Herdr.app/Contents/MacOS/Herdr > "$D/app.log" 2>&1 < /dev/null & )
sleep 2; [ -z "$back" ] || "$W" window focus "$back" >/dev/null 2>&1 || true
n=0; until [ -f "$A/perf-core.json" ]; do sleep 2; n=$((n + 1)); [ $n -lt 300 ] || break; done
cat "$A/perf-core.json" 2>/dev/null || { echo "no results"; tail -20 "$D/app.log"; }
grep -i 'interrupt\|error' "$D/app.log" | tail -5 || true
for p in $(pgrep -f 'MacOS/Herdr$'); do ps eww -o command= -p "$p" | grep -q "HERDR_APP_HOME=$A " && kill "$p"; done
demo hc server stop >/dev/null 2>&1 || true
sleep 1; rm -rf "$D"
