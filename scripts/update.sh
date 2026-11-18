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
trap 'rmdir "$lock"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# Check the inputs and the final layout before changing installed files.
for f in "$layout" "$keys"; do
  [ ! -e "$f" ] || jq empty "$f" || { echo "not valid JSON, nothing changed: $f" >&2; exit 1; }
done

# Keep the theme, valid stack selections, focus ring color and blocks for installed extras.
# The Review bar keeps its props and goes right before tabs-end. Its companion page goes in panel-body.
old='{}'
if [ -f "$layout" ]; then old=$(cat "$layout"); fi
review_extra=false
theme_export=false
if [ -d "$app/mods/pulls-review" ]; then review_extra=true; fi
if [ -d "$app/mods/t3-theme-export" ]; then theme_export=true; fi
next_layout=$(jq -e --argjson old "$old" --argjson review_extra "$review_extra" --argjson theme_export "$theme_export" '
    [$old | .. | objects | .focus? | objects | .color][0] as $c
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
    )' "$src/layouts/herdr-t3.json")

# Herdr App can fall back to its own layout if a mod named in this one is missing.
used_mods=$(printf '%s\n' "$next_layout" | jq -r '
  [(.terminal_menu, .toast), (.. | objects | .mod?)] | map(strings | select(startswith("frame-") | not)) | unique[]')
missing=$(printf '%s\n' "$used_mods" | while IFS= read -r m; do
  [ ! -d "$app/mods/$m" ] || continue
  case "$m" in
    (t3-*) [ ! -d "$src/mods/$m" ] || continue ;;
    (review) [ "$review_extra" = false ] || [ ! -d "$src/extras/mods/review" ] || continue ;;
  esac
  printf '%s\n' "$m"
done)
if [ -n "$missing" ]; then
  printf '%s\n' "the layout names mods that aren't here, nothing changed:" "$missing" >&2
  exit 1
fi

mkdir -p "$app/mods" "$app/layouts"
# One mod at a time: other t3-* folders in the app (yours, a test's) are left alone.
for d in "$src"/mods/t3-*/; do copy_mod "$d" "$app/mods/$(basename "$d")/"; done
# The Review extra (pulls-review and review): config.json is the person's own, so it is never shipped or deleted.
if [ "$review_extra" = true ]; then
  for m in pulls-review review; do copy_mod --exclude config.json "$src/extras/mods/$m/" "$app/mods/$m/"; done
fi
[ "$theme_export" = false ] || copy_mod "$src/extras/mods/t3-theme-export/" "$app/mods/t3-theme-export/"
[ ! -d "$app/mods/asciicn-wallpaper" ] || copy_mod "$src/extras/mods/asciicn-wallpaper/" "$app/mods/asciicn-wallpaper/"
for t in "$src"/extras/themes/*.json; do [ ! -f "$app/themes/$(basename "$t")" ] || cp "$t" "$app/themes/"; done

printf '%s\n' "$next_layout" > "$layout.tmp"
mv "$layout.tmp" "$layout"
cp "$src/layouts/herdr-t3.svg" "$app/layouts/"

# The repo's keys win, section by section (the layout's, and its popups' `mod:` ones), since an old command in one would report
# as unknown; say which were replaced so a remap can go back. Keys of your own stay.
[ -f "$keys" ] || echo '{}' > "$keys"
jq -r --slurpfile new "$src/keys.json" '. as $old | $new[0] | to_entries[] | .key as $s | .value as $n | ($old[$s] // {}) | to_entries[]
  | .key as $k | .value as $v
  | if $n | has($k) | not then "kept, not in the repo: \($k) = \($v) in \($s)"
    elif $n[$k] != $v then "replaced: \($k) = \($v), now \($n[$k]) in \($s)"
    else empty end' "$keys"
jq --slurpfile new "$src/keys.json" 'reduce ($new[0] | to_entries[]) as $e (.; .[$e.key] = ((.[$e.key] // {}) + $e.value))' "$keys" > "$keys.tmp"
mv "$keys.tmp" "$keys"
