#!/bin/sh
# The probe's build: bench-core.js beside the versions it compares. origin = origin/main, head = the commit before the fixes
# (BEFORE, default bd5df15b), fixed = the working tree.  prepare.sh <out dir>
set -eu
here=$(cd "$(dirname "$0")" && pwd) repo=$(cd "$here/../../../.." && pwd) out=$1 before=${BEFORE:-bd5df15b}
mkdir -p "$out"
cp "$here/probe/main.js" "$here/probe/bench-core.js" "$out/"
cd "$repo"
git show origin/main:shared/tree.js > "$out/tree-origin.js"
git show "$before":shared/tree.js > "$out/tree-head.js"
git show "$before":mods/t3-files/model.js > "$out/model.js"
cp shared/tree.js "$out/tree-fixed.js"
cp mods/t3-files/model.js "$out/model-fixed.js"
for f in file-tree.js list.js pierre-icons.js pierre-icons-data.js; do cp "shared/$f" "$out/"; done
