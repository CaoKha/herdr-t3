#!/bin/sh
# update.sh against a throwaway home: what the person chose stays, what's stale goes, and a bad file stops it before anything changes.
set -eu
src=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
worker=
trap '
  if [ -n "$worker" ]; then
    release
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
reject_preflight() {
  fixture=$1
  expected=$2
  before=$(mktemp -d "$tmp/before.XXXXXX")
  cp -R "$fixture/." "$before"
  if out=$(HERDR_APP_HOME="$fixture" "${4:-$src/scripts/update.sh}" 2>&1); then
    echo "FAIL check-update: $3 didn't stop the update"
    fail=1
  elif ! printf '%s\n' "$out" | grep -F "$expected" >/dev/null; then
    echo "FAIL check-update: $3 wasn't reported: $out"
    fail=1
  fi
  if ! diff -qr "$before" "$fixture" >/dev/null; then
    echo "FAIL check-update: the install changed despite $3"
    fail=1
  fi
}

mkdir -p "$app/mods/t3-tabs" "$app/mods/mine" "$app/mods/pulls-review" "$app/layouts" "$app/themes"
touch "$app/mods/t3-tabs/stale.js" "$app/mods/t3-tabs/check-old.cjs" "$app/mods/t3-tabs/jsconfig.json" "$app/mods/mine/main.js" "$app/themes/t3-code-dark.json"
echo '{"open":"herdr"}' > "$app/mods/pulls-review/config.json"
echo '{"global":{"a":"b"},"layout:herdr-t3":{"cmd-p":"old","cmd-x":"mine"}}' > "$app/keys.json"
chmod 640 "$app/keys.json"
review='{"id":"my-review","type":"block","size":{"px":0},"window_drag":true,"content":{"mod":"pulls-review","props":{"block":"my-review","toggle":false}}}'
jq --argjson review "$review" '.theme = "win98" | (.. | objects | .focus? | objects | .color) = "accent"
  | (.. | objects | select(.id? == "tabs-row") | .children) |= (. + [$review])' "$src/layouts/herdr-t3.json" > "$layout"
chmod 644 "$layout"
mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

# Stops first: the mods stay as they were.
# A mod the layout names that's neither here nor in the app: Herdr would start on its own layout instead.
reject_preflight "$app" workspace-status 'missing workspace-status'
empty_mod="$tmp/empty-mod"
mkdir -p "$empty_mod/mods/workspace-status"
reject_preflight "$empty_mod" workspace-status 'empty workspace-status'
mkdir "$app/mods/workspace-status"
touch "$app/mods/workspace-status/main.js"

for bad in broken empty multi wrong-root bad-section; do
  bad_home="$tmp/keys-$bad"
  mkdir "$bad_home"
  cp -R "$app/." "$bad_home"
  case "$bad" in
    (broken) printf '%s\n' '{' ;;
    (empty) : ;;
    (multi) printf '%s\n' '{}' '{}' ;;
    (wrong-root) printf '%s\n' '[]' ;;
    (bad-section) printf '%s\n' '{"layout:herdr-t3":"mine"}' ;;
  esac > "$bad_home/keys.json"
  reject_preflight "$bad_home" keys.json "$bad keys.json"
done

# The layout and keys can't be staged next to their files: stopped before any mod is copied, nothing left behind.
mkdir "$tmp/no-stage-bin" "$tmp/no-stage"
cp -R "$app/." "$tmp/no-stage"
real_mktemp=$(command -v mktemp)
cat > "$tmp/no-stage-bin/mktemp" <<EOF
#!/bin/sh
case "\$*" in (*.herdr-t3-keys.*) echo "mktemp: cannot stage \$*" >&2; exit 1 ;; esac
exec "$real_mktemp" "\$@"
EOF
cat > "$tmp/no-stage-bin/update" <<EOF
#!/bin/sh
PATH="$tmp/no-stage-bin:\$PATH" exec "$src/scripts/update.sh"
EOF
chmod +x "$tmp/no-stage-bin/mktemp" "$tmp/no-stage-bin/update"
reject_preflight "$tmp/no-stage" 'cannot stage' 'an unstageable keys.json' "$tmp/no-stage-bin/update"

out=$(update)
if [ "$(mode "$layout")" != 644 ] || [ "$(mode "$app/keys.json")" != 640 ]; then
  echo 'FAIL check-update: update changed layout or keys permissions'
  fail=1
fi
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

# The Review extra's review is a space panel page after the layout's own (Files, Pull requests); no id twice.
pages='[.. | objects | select(.id? == "panel-body") | .children[].id] | join(",")'
unique='[.. | objects | .id? | strings] | length == (unique | length)'
is "$pages" "$layout" files,panel-empty,pulls,review
is "$unique" "$layout" true

# rsync --delete would remove the installed entry, so the copied source must have one too.
bad_src="$tmp/bad-source"
bad_src_home="$tmp/bad-source-home"
mkdir -p "$bad_src/scripts" "$bad_src_home"
cp "$src/scripts/update.sh" "$bad_src/scripts/"
cp -R "$src/layouts" "$src/mods" "$src/extras" "$bad_src/"
cp "$src/keys.json" "$bad_src/"
cp -R "$app/." "$bad_src_home"
rm "$bad_src/mods/t3-tabs/main.js"
reject_preflight "$bad_src_home" t3-tabs 'missing t3-tabs entry in the copied source' "$bad_src/scripts/update.sh"

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
is "$pages" "$layout" files,panel-empty,pulls,review
is "$unique" "$layout" true

# Branch Issue, installed on its own, is the Issues page after Review; the update never copies or removes it.
mkdir "$app/mods/branch-issue"
touch "$app/mods/branch-issue/main.js"
update >/dev/null
is "$pages" "$layout" files,panel-empty,pulls,review,issues
is "$unique" "$layout" true
rm -rf "$app/mods/branch-issue"

# Uninstall the extras while the layout still names them, including the Review bar in the tab row.
rm -rf "$app/mods/pulls-review" "$app/mods/review" "$app/mods/t3-theme-export"
update >/dev/null
is '[.. | objects | .mod? | strings | select(. == "branch-issue")]' "$layout" '[]'
is '[.. | objects | .mod? | strings | select(. == "pulls-review" or . == "review" or . == "t3-theme-export")]' "$layout" '[]'
is "$pages" "$layout" files,panel-empty,pulls
is '(.. | objects | select(.id? == "panel-body") | .active)' "$layout" panel-empty
ok test ! -e "$app/mods/pulls-review"
ok test ! -e "$app/mods/review"
ok test ! -e "$app/mods/t3-theme-export"

# Herdr checks nested mod references too. This one is only in the carried-over block.
mkdir "$app/mods/pulls-review"
touch "$app/mods/pulls-review/main.js"
touch "$app/mods/t3-tabs/stale.js"
jq --argjson review "$review" '
  (.. | objects | select(.id? == "tabs-row") | .children) += [$review | .content.props.popover.mod = "absent-popover"]
' "$layout" > "$tmp/layout.json"
mv "$tmp/layout.json" "$layout"
reject_preflight "$app" absent-popover 'missing nested popover'

# Pause the first update at its first copy while testing a competing one and an independent home.
held="$tmp/overlap-home"
other="$tmp/other-home"
mkdir -p "$held/mods/workspace-status" "$other/mods/workspace-status" "$tmp/bin"
touch "$held/mods/workspace-status/main.js" "$other/mods/workspace-status/main.js"
mkdir "$held/layouts"
cp "$src/layouts/herdr-t3.json" "$held/layouts/"
echo '{}' > "$held/keys.json"
echo '{}' > "$other/keys.json"
CHECK_UPDATE_REAL_RSYNC=$(command -v rsync)
CHECK_UPDATE_REAL_MV=$(command -v mv)
CHECK_UPDATE_GATE=$tmp
export CHECK_UPDATE_REAL_RSYNC CHECK_UPDATE_REAL_MV CHECK_UPDATE_GATE
cat > "$tmp/bin/rsync" <<'EOF'
#!/bin/sh
set -eu
gate=$CHECK_UPDATE_GATE
if [ "${CHECK_UPDATE_ROLE:-}" = hold ] && [ ! -e "$gate/held" ]; then
  touch "$gate/held"
  echo ready > "$gate/ready"
  read -r _ < "$gate/release"
fi
if [ "${CHECK_UPDATE_ROLE:-}" = compete ]; then touch "$gate/competed"; fi
exec "$CHECK_UPDATE_REAL_RSYNC" "$@"
EOF
cat > "$tmp/bin/mv" <<'EOF'
#!/bin/sh
set -eu
"$CHECK_UPDATE_REAL_MV" "$@"
case "${CHECK_UPDATE_ROLE:-}:$2" in
  (late:*/layouts/herdr-t3.json) cp "$CHECK_UPDATE_GATE/saved-keys.json" "$HERDR_APP_HOME/keys.json" ;;
esac
EOF
chmod +x "$tmp/bin/rsync" "$tmp/bin/mv"
# The held update and this check wake each other through two FIFOs, never by looking again after a while. Both stay open
# both ways here: neither side waits for the other to open one, and a line written is kept until it is read.
hold_update() {
  rm -f "$tmp/ready" "$tmp/release" "$tmp/held"
  mkfifo "$tmp/ready" "$tmp/release"
  exec 7<>"$tmp/ready" 8<>"$tmp/release"
  (
    code=0
    PATH="$tmp/bin:$PATH" CHECK_UPDATE_ROLE=hold HERDR_APP_HOME="$held" "$src/scripts/update.sh" > "$tmp/held.out" 2>&1 || code=$?
    echo ended > "$tmp/ready"
    exit "$code"
  ) &
  worker=$!
  read -r reached <&7
  if [ "$reached" != ready ]; then
    cat "$tmp/held.out"
    echo "FAIL check-update: update never reached its first copy"
    exit 1
  fi
}
release() { echo go >&8 || :; } 2>/dev/null
expect_conflict() {
  release
  if wait "$worker"; then
    echo "FAIL check-update: update succeeded despite a concurrent save to $1"
    fail=1
  else
    if ! grep -F "$1" "$tmp/held.out" >/dev/null || ! grep -F 'already updated' "$tmp/held.out" >/dev/null ||
      ! grep -F "$3" "$tmp/held.out" >/dev/null; then
      echo "FAIL check-update: conflict with $1 did not name the file and report partial updates"
      cat "$tmp/held.out"
      fail=1
    fi
  fi
  worker=
  if ! cmp -s "$2" "$held/$1"; then
    echo "FAIL check-update: update overwrote a concurrent save to $1"
    fail=1
  fi
}
hold_update
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
is '.["layout:herdr-t3"]["cmd-p"]' "$other/keys.json" mod.open:t3-picker

# A save stops it, even with t3-chrome's own write (below) riding along.
jq '.theme = "win98" | (.. | objects | .focus? | objects | .color) = "accent" | .traffic_lights[1] = 14' "$held/layouts/herdr-t3.json" > "$tmp/saved-layout.json"
cp "$tmp/saved-layout.json" "$held/layouts/herdr-t3.json"
expect_conflict layouts/herdr-t3.json "$tmp/saved-layout.json" 'Layout and keys were not replaced.'
ok test -f "$held/mods/t3-home/main.js"
is 'length' "$held/keys.json" 0

hold_update
echo '{"global":{"new":"binding"}}' > "$tmp/saved-keys.json"
cp "$tmp/saved-keys.json" "$held/keys.json"
expect_conflict keys.json "$tmp/saved-keys.json" 'Layout and keys were not replaced.'
ok cmp -s "$tmp/saved-layout.json" "$held/layouts/herdr-t3.json"

# A save after the layout rename still wins, and the error names the already-published layout.
echo '{"global":{"new":"late binding"}}' > "$tmp/saved-keys.json"
PATH="$tmp/bin:$PATH" CHECK_UPDATE_ROLE=late HERDR_APP_HOME="$held" "$src/scripts/update.sh" > "$tmp/held.out" 2>&1 &
worker=$!
expect_conflict keys.json "$tmp/saved-keys.json" 'The layout JSON was also updated. Keys were not replaced.'

# The next run takes fresh snapshots and retains both saves while updating normally.
HERDR_APP_HOME="$held" "$src/scripts/update.sh" >/dev/null
is .theme "$held/layouts/herdr-t3.json" win98
is '[.. | objects | .focus? | objects | .color][0]' "$held/layouts/herdr-t3.json" accent
is .global.new "$held/keys.json" 'late binding'
is '.["layout:herdr-t3"]["cmd-p"]' "$held/keys.json" mod.open:t3-picker

# t3-chrome fits the window buttons and the sidebar's minimum to the brand row itself, as soon as its new copy loads:
# its write, reformatted here, isn't the person's save. The update goes on and the repo's values go in, which it fits again.
hold_update
jq '.traffic_lights[1] = 14 | (.. | objects | select(.id? == "sidebar")) .min = 239' "$held/layouts/herdr-t3.json" > "$tmp/aligned.json"
cp "$tmp/aligned.json" "$held/layouts/herdr-t3.json"
release
if ! wait "$worker"; then
  echo "FAIL check-update: t3-chrome's own layout write stopped the update"
  cat "$tmp/held.out"
  fail=1
fi
worker=
is '.traffic_lights' "$held/layouts/herdr-t3.json" "$(jq -c .traffic_lights "$src/layouts/herdr-t3.json")"
is '[.. | objects | select(.id? == "sidebar") | .min][0]' "$held/layouts/herdr-t3.json" 208
is .theme "$held/layouts/herdr-t3.json" win98
exit "$fail"
