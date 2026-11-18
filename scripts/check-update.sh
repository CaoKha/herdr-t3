#!/bin/sh
# update.sh against a throwaway home: what the person chose stays, what's stale goes, and a bad file stops it before anything changes.
set -eu
src=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
worker=
trap '
  if [ -n "$worker" ]; then
    touch "$tmp/release"
    wait "$worker" || :
  fi
  rm -rf "$tmp"
' EXIT
app="$tmp/home"
layout="$app/layouts/herdr-t3.json"
fail=0
ok() { "$@" || { echo "FAIL check-update: $*"; exit 1; }; }
is() {
  actual=$(jq -crS "$1" "$2")
  if [ "$actual" != "$3" ]; then
    echo "FAIL check-update: $1 in $2: expected $3, got $actual"
    fail=1
  fi
}
update() { HERDR_APP_HOME="$app" "$src/scripts/update.sh"; }
reject_missing() {
  before=$(mktemp -d "$tmp/before.XXXXXX")
  cp -R "$app/." "$before"
  if out=$(update 2>&1); then
    echo "FAIL check-update: missing mod $1 didn't stop the update"
    fail=1
  elif ! printf '%s\n' "$out" | grep -F "$1" >/dev/null; then
    echo "FAIL check-update: missing mod $1 wasn't reported: $out"
    fail=1
  fi
  if ! diff -qr "$before" "$app"; then
    echo "FAIL check-update: the install changed despite missing mod $1"
    fail=1
  fi
}

mkdir -p "$app/mods/t3-tabs" "$app/mods/mine" "$app/mods/pulls-review" "$app/layouts" "$app/themes"
touch "$app/mods/t3-tabs/stale.js" "$app/mods/t3-tabs/check-old.cjs" "$app/mods/t3-tabs/jsconfig.json" "$app/mods/mine/main.js" "$app/themes/t3-code-dark.json"
echo '{"open":"herdr"}' > "$app/mods/pulls-review/config.json"
echo '{"global":{"a":"b"},"layout:herdr-t3":{"cmd-p":"old","cmd-x":"mine"}}' > "$app/keys.json"
review='{"id":"my-review","type":"block","size":{"px":0},"window_drag":true,"content":{"mod":"pulls-review","props":{"block":"my-review","toggle":false}}}'
jq --argjson review "$review" '.theme = "win98" | (.. | objects | .focus? | objects | .color) = "accent"
  | (.. | objects | select(.id? == "tabs-row") | .children) |= (. + [$review])' "$src/layouts/herdr-t3.json" > "$layout"

# Stops first: the mods stay as they were.
# A mod the layout names that's neither here nor in the app: Herdr would start on its own layout instead.
reject_missing workspace-status
mkdir "$app/mods/workspace-status"

cp "$app/keys.json" "$app/keys.good"
echo '{' > "$app/keys.json"
if update 2>/dev/null; then echo "FAIL check-update: broken keys.json didn't stop it"; exit 1; fi
ok test -f "$app/mods/t3-tabs/stale.js"
ok test ! -e "$app/mods/t3-home"
mv "$app/keys.good" "$app/keys.json"

out=$(update)
ok test ! -e "$app/mods/t3-tabs/stale.js"
ok test -f "$app/mods/t3-home/main.js"
# The checks stay in the repo, and an older update's copies go; gpui-shell's jsconfig.json stays.
ok test -z "$(find "$app/mods" -name 'check*.cjs')"
ok test -f "$app/mods/t3-tabs/jsconfig.json"
ok test -f "$app/mods/mine/main.js"
ok test -f "$app/mods/review/main.js"
ok test ! -e "$app/mods/t3-theme-export"
ok test ! -e "$app/themes/catppuccin-latte.json"
ok cmp -s "$src/extras/themes/t3-code-dark.json" "$app/themes/t3-code-dark.json"
is .open "$app/mods/pulls-review/config.json" herdr
is .theme "$layout" win98
is '[.. | objects | .focus? | objects | .color][0]' "$layout" accent
review_blocks='[.. | objects | select(.content?.mod? == "pulls-review")]'
# The ordinary Review bar keeps its count-rendering mode and block props.
is "$review_blocks" "$layout" "$(printf '%s\n' "$review" | jq -cS '[.]')"
is '[.. | objects | select(.id? == "tabs-row") | .children[].id] | join(",")' "$layout" tabs,my-review,tabs-end,actions,window-end,tabs-end-inset
is .global.a "$app/keys.json" b
is '.["layout:herdr-t3"]["cmd-p"]' "$app/keys.json" mod.open:t3-picker
is '.["layout:herdr-t3"]["cmd-x"]' "$app/keys.json" mine
is '.["mod:t3-picker"]["cmd-w"]' "$app/keys.json" overlay.close
case "$out" in *"replaced: cmd-p = old"*) ;; *) echo "FAIL check-update: no word of the replaced key"; exit 1 ;; esac
case "$out" in *"kept, not in the repo: cmd-x = mine"*) ;; *) echo "FAIL check-update: no word of the kept key"; exit 1 ;; esac

# The Review extra's review is the space panel's page, after Files; no id twice.
pages='[.. | objects | select(.id? == "panel-body") | .children[].id] | join(",")'
unique='[.. | objects | .id? | strings] | length == (unique | length)'
is "$pages" "$layout" files,panel-empty,review
is "$unique" "$layout" true

# Run with a legacy toggle block instead: it keeps its own props, independently of the count bar.
legacy=$(printf '%s\n' "$review" | jq -c '.content.props.toggle = true')
export_block='{"id":"theme-export","type":"block","size":{"px":0},"content":{"mod":"t3-theme-export"}}'
mkdir "$app/mods/t3-theme-export"
jq --argjson legacy "$legacy" --argjson export "$export_block" '
    (.. | objects | select(.id? == "my-review")) = $legacy
  | (.. | objects | select(.id? == "work") | .children) += [$export]
  | (.. | objects | select(.id? == "panel-body") | .active) = "review"
' "$layout" > "$tmp/layout.json"
mv "$tmp/layout.json" "$layout"
update >/dev/null
is "$review_blocks" "$layout" "$(printf '%s\n' "$legacy" | jq -cS '[.]')"
is '(.. | objects | select(.content?.mod? == "t3-theme-export"))' "$layout" "$(printf '%s\n' "$export_block" | jq -cS .)"
is '(.. | objects | select(.id? == "panel-body") | .active)' "$layout" review
is "$pages" "$layout" files,panel-empty,review
is "$unique" "$layout" true

# Uninstall the extras while the layout still names them, including the Review bar in the tab row.
rm -rf "$app/mods/pulls-review" "$app/mods/review" "$app/mods/t3-theme-export"
update >/dev/null
is '[.. | objects | .mod? | strings | select(. == "pulls-review" or . == "review" or . == "t3-theme-export")]' "$layout" '[]'
is "$pages" "$layout" files,panel-empty
is '(.. | objects | select(.id? == "panel-body") | .active)' "$layout" panel-empty
ok test ! -e "$app/mods/pulls-review"
ok test ! -e "$app/mods/review"
ok test ! -e "$app/mods/t3-theme-export"

# Herdr checks nested mod references too. This one is only in the carried-over block.
mkdir "$app/mods/pulls-review"
touch "$app/mods/t3-tabs/stale.js"
jq --argjson review "$review" '
  (.. | objects | select(.id? == "tabs-row") | .children) += [$review | .content.props.popover.mod = "absent-popover"]
' "$layout" > "$tmp/layout.json"
mv "$tmp/layout.json" "$layout"
reject_missing absent-popover

# Pause the first update at its first copy while testing a competing one and an independent home.
held="$tmp/overlap-home"
other="$tmp/other-home"
mkdir -p "$held/mods/workspace-status" "$other/mods/workspace-status" "$tmp/bin"
CHECK_UPDATE_REAL_RSYNC=$(command -v rsync)
CHECK_UPDATE_GATE=$tmp
export CHECK_UPDATE_REAL_RSYNC CHECK_UPDATE_GATE
cat > "$tmp/bin/rsync" <<'EOF'
#!/bin/sh
set -eu
gate=$CHECK_UPDATE_GATE
if [ "${CHECK_UPDATE_ROLE:-}" = hold ] && [ ! -e "$gate/ready" ]; then
  touch "$gate/ready"
  tries=0
  while [ ! -e "$gate/release" ]; do
    if [ "$tries" -ge 300 ]; then echo 'check-update: timed out waiting for competing update' >&2; exit 1; fi
    tries=$((tries + 1))
    sleep 0.05
  done
fi
if [ "${CHECK_UPDATE_ROLE:-}" = compete ]; then touch "$gate/competed"; fi
exec "$CHECK_UPDATE_REAL_RSYNC" "$@"
EOF
chmod +x "$tmp/bin/rsync"
PATH="$tmp/bin:$PATH" CHECK_UPDATE_ROLE=hold HERDR_APP_HOME="$held" "$src/scripts/update.sh" > "$tmp/held.out" 2>&1 &
worker=$!
attempt=0
while [ ! -e "$tmp/ready" ]; do
  if [ "$attempt" -ge 100 ] || ! kill -0 "$worker" 2>/dev/null; then
    cat "$tmp/held.out"
    echo "FAIL check-update: first update never reached its first copy"
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 0.05
done
if out=$(PATH="$tmp/bin:$PATH" CHECK_UPDATE_ROLE=compete HERDR_APP_HOME="$held/." "$src/scripts/update.sh" 2>&1); then
  echo "FAIL check-update: a concurrent update to the same home succeeded"
  fail=1
elif ! printf '%s\n' "$out" | grep -F 'update already active' >/dev/null; then
  echo "FAIL check-update: concurrent update failed without reporting the lock: $out"
  fail=1
fi
if [ -e "$tmp/competed" ]; then
  echo "FAIL check-update: a concurrent update reached rsync for the same home"
  fail=1
fi
HERDR_APP_HOME="$other" "$src/scripts/update.sh" >/dev/null
ok test -f "$other/layouts/herdr-t3.json"
touch "$tmp/release"
if ! wait "$worker"; then cat "$tmp/held.out"; exit 1; fi
worker=
ok test -f "$held/layouts/herdr-t3.json"
HERDR_APP_HOME="$held" "$src/scripts/update.sh" >/dev/null
exit "$fail"
