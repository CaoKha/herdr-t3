#!/bin/sh
# Puts this checkout into a Herdr App home: the layout, its mods and keys, and the extras already installed there.
# Real copies, not symlinks: Herdr App doesn't load a mod's own SVGs through a symlink.
set -eu
src=$(cd "$(dirname "$0")/.." && pwd)
app=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
layout="$app/layouts/herdr-t3.json"
keys="$app/keys.json"

# The checks run from the repo: they aren't sent, and -s lets --delete take an older update's copies.
copy_mod() {
  rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json '--filter=-s_check*.cjs' "$@"
}

for tool in jq rsync; do command -v "$tool" >/dev/null || { echo "update needs $tool" >&2; exit 1; }; done
[ -d "$app" ] || { echo "no Herdr App home at $app" >&2; exit 1; }

# Hold the lock from the first installed-file read to the last write.
lock="$app/.herdr-t3-update.lock"
if ! mkdir "$lock" 2>/dev/null; then
  if [ -d "$lock" ]; then
    printf '%s\n' "Herdr T3 update already active or interrupted: $lock" \
      'If interrupted, remove this empty lock directory after all update and rsync processes for this home have exited.' >&2
  else
    printf '%s\n' "cannot create Herdr T3 update lock: $lock" >&2
  fi
  exit 1
fi
staging=
layout_tmp=
keys_tmp=
cleanup() {
  [ -z "$layout_tmp" ] || rm -f "$layout_tmp"
  [ -z "$keys_tmp" ] || rm -f "$keys_tmp"
  [ -z "$staging" ] || rm -rf "$staging"
  rmdir "$lock"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
staging=$(mktemp -d "${TMPDIR:-/tmp}/herdr-t3-update.XXXXXX")
printf '%s\n' '{}' > "$staging/empty.json"

require_object() {
  if ! jq -es 'length == 1 and (.[0] | type == "object")' "$1" >/dev/null; then
    printf '%s\n' "expected exactly one JSON object, nothing changed: $2" >&2
    exit 1
  fi
}

snapshot() {
  if [ -e "$1" ] || [ -L "$1" ]; then
    if [ ! -f "$1" ] || ! cp -p "$1" "$2"; then
      printf '%s\n' "cannot read configuration, nothing changed: $1" >&2
      exit 1
    fi
    require_object "$2" "$1"
  fi
}

# Validate and merge the snapshots before copying anything. A missing file has no saved choices.
snapshot "$layout" "$staging/layout.old"
snapshot "$keys" "$staging/keys.old"
layout_input="$staging/layout.old"
keys_input="$staging/keys.old"
[ -f "$layout_input" ] || layout_input="$staging/empty.json"
[ -f "$keys_input" ] || keys_input="$staging/empty.json"
require_object "$src/keys.json" "$src/keys.json"

# The repo's bindings win in sections it owns. Keep the user's other bindings and report the differences.
if ! jq -e --slurpfile new "$src/keys.json" '
  reduce ($new[0] | to_entries[]) as $e (.; .[$e.key] = ((.[$e.key] // {}) + $e.value))
' "$keys_input" > "$staging/keys.new"; then
  printf '%s\n' "cannot merge bindings, nothing changed: $keys" >&2
  exit 1
fi
key_changes=$(jq -r --slurpfile new "$src/keys.json" '
  . as $old | $new[0] | to_entries[] | .key as $s | .value as $n | ($old[$s] // {}) | to_entries[]
  | .key as $k | .value as $v
  | if $n | has($k) | not then "kept, not in the repo: \($k) = \($v) in \($s)"
    elif $n[$k] != $v then "replaced: \($k) = \($v), now \($n[$k]) in \($s)"
    else empty end
' "$keys_input")

# Stop on a competing save even though the updater lock excludes other updater processes.
# $4 compares the snapshot with the file now: byte for byte unless given.
same_bytes() { cmp -s "$1" "$2"; }
# t3-chrome writes two fields of the installed layout itself, fitted to the brand row: the macOS window buttons' height and the
# sidebar's minimum (docs/internals/storage.md). Its new copy loads while this runs and writes them, which is no save of the
# person's: the replacement takes the repo's values and it fits them again. A save is a difference in anything else.
same_layout() {
  same_bytes "$1" "$2" && return 0
  own='del(.traffic_lights[1]?) | (.. | objects | select(.id? == "sidebar")) |= del(.min)'
  was=$(jq -cS "$own" "$1" 2>/dev/null) && now=$(jq -cS "$own" "$2" 2>/dev/null) && [ "$was" = "$now" ]
}
check_unchanged() {
  if [ -f "$2" ]; then
    if [ -f "$1" ] && "${4:-same_bytes}" "$2" "$1"; then return 0; fi
  elif [ ! -e "$1" ] && [ ! -L "$1" ]; then
    return 0
  fi
  printf '%s\n' "configuration changed during update, kept as is: $1" \
    'Mods and previously installed themes were already updated.' "$3" \
    'Run update.sh again after saving your changes.' >&2
  exit 1
}

prepare_replacement() {
  mode_from="$1"
  [ ! -f "$2" ] || mode_from="$2"
  mode=$(stat -c '%a' "$mode_from" 2>/dev/null || stat -f '%Lp' "$mode_from")
  cat "$1" > "$3"
  chmod "$mode" "$3"
}

# Keep the theme, valid stack selections, focus ring color and blocks for installed extras.
# The Review bar keeps its props and goes right before tabs-end. Its companion page goes in panel-body.
review_extra=false
theme_export=false
if [ -d "$app/mods/pulls-review" ]; then review_extra=true; fi
if [ -d "$app/mods/t3-theme-export" ]; then theme_export=true; fi
require_object "$src/layouts/herdr-t3.json" "$src/layouts/herdr-t3.json"
jq -e --slurpfile old "$layout_input" --argjson review_extra "$review_extra" --argjson theme_export "$theme_export" '
    $old[0] as $old
  | [$old | .. | objects | .focus? | objects | .color][0] as $c
  | ([$old | .. | objects | select((.id | strings) and .active) | {(.id): .active}] | add // {}) as $active
  | ([$old | .. | objects | select(.content?.mod? == "pulls-review")][0]) as $review
  | ([$old | .. | objects | select(.content?.mod? == "t3-theme-export")][0]) as $export
  | (if $old.theme then .theme = $old.theme else . end)
  | (.. | objects | .focus? | objects | .color) |= ($c // .)
  | (if $review_extra and $review then (.. | objects | select(.id? == "tabs-row") | .children) |= ((map(.id) | index("tabs-end")) as $i | .[0:$i] + [$review] + .[$i:]) else . end)
  | (if $theme_export and $export then (.. | objects | select(.id? == "work") | .children) |= (. + [$export]) else . end)
  | (if $review_extra then (.. | objects | select(.id? == "panel-body") | .children) |= (. + [{ id: "review", type: "block", content: { mod: "review" } }]) else . end)
  | (.. | objects | select((.id | strings) and .type == "stack")) |= (
      $active[.id] as $choice | if $choice and any(.children[]?; .id == $choice) then .active = $choice else . end
    )' "$src/layouts/herdr-t3.json" > "$staging/layout.new"

# Herdr App can fall back to its own layout if a mod named in this one is missing.
used_mods=$(jq -r '
  [(.terminal_menu, .toast), (.. | objects | .mod?)] | map(strings | select(startswith("frame-") | not)) | unique[]
' "$staging/layout.new")
missing=$(printf '%s\n' "$used_mods" | while IFS= read -r m; do
  [ -n "$m" ] || continue
  dir="$app/mods/$m"
  # A copied mod's main.js must come from the source, since rsync deletes stale installed files.
  case "$m" in
    (t3-*) [ ! -d "$src/mods/$m" ] || dir="$src/mods/$m" ;;
  esac
  case "$m" in
    (review|pulls-review) [ "$review_extra" = false ] || dir="$src/extras/mods/$m" ;;
    (t3-theme-export) [ "$theme_export" = false ] || dir="$src/extras/mods/$m" ;;
    (asciicn-wallpaper) [ ! -d "$dir" ] || dir="$src/extras/mods/$m" ;;
  esac
  [ -f "$dir/main.js" ] || printf '%s\n' "$dir/main.js"
done)
if [ -n "$missing" ]; then
  printf '%s\n' 'missing mod entry files, nothing changed:' "$missing" >&2
  exit 1
fi

mkdir -p "$app/mods" "$app/layouts"
# Stage on the destination filesystems before copying any mod, so a failure here leaves the install as it was. Check both originals before publishing either replacement.
layout_tmp=$(mktemp "$app/layouts/.herdr-t3-update.XXXXXX")
keys_tmp=$(mktemp "$app/.herdr-t3-keys.XXXXXX")
prepare_replacement "$staging/layout.new" "$staging/layout.old" "$layout_tmp"
prepare_replacement "$staging/keys.new" "$staging/keys.old" "$keys_tmp"
# One mod at a time: other t3-* folders in the app (yours, a test's) are left alone.
for d in "$src"/mods/t3-*/; do copy_mod "$d" "$app/mods/$(basename "$d")/"; done
# The Review extra (pulls-review and review): config.json is the person's own, so it is never shipped or deleted.
if [ "$review_extra" = true ]; then
  for m in pulls-review review; do copy_mod --exclude config.json "$src/extras/mods/$m/" "$app/mods/$m/"; done
fi
[ "$theme_export" = false ] || copy_mod "$src/extras/mods/t3-theme-export/" "$app/mods/t3-theme-export/"
[ ! -d "$app/mods/asciicn-wallpaper" ] || copy_mod "$src/extras/mods/asciicn-wallpaper/" "$app/mods/asciicn-wallpaper/"
for t in "$src"/extras/themes/*.json; do [ ! -f "$app/themes/$(basename "$t")" ] || cp "$t" "$app/themes/"; done

config_pending='Layout and keys were not replaced.'
check_unchanged "$keys" "$staging/keys.old" "$config_pending"
check_unchanged "$layout" "$staging/layout.old" "$config_pending" same_layout
mv "$layout_tmp" "$layout"
layout_tmp=
# A save to keys.json may still land while the layout is being replaced.
check_unchanged "$keys" "$staging/keys.old" 'The layout JSON was also updated. Keys were not replaced.'
mv "$keys_tmp" "$keys"
keys_tmp=
cp "$src/layouts/herdr-t3.svg" "$app/layouts/"
if [ -n "$key_changes" ]; then printf '%s\n' "$key_changes"; fi
