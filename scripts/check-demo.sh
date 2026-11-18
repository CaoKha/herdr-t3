#!/bin/sh
# The demo's storage and teardown checks run without a window, a clone or agent credentials.
set -eu
src=$(cd "$(dirname "$0")/.." && pwd)
target=$(cd "${1:-$src}" && pwd)
stage=$target/scripts/demo/stage.sh
case $(uname -s) in Darwin) temporary=/private/tmp ;; *) temporary=/tmp ;; esac
scratch=$(mktemp -d "$temporary/herdr-t3-demo-check.XXXXXXXX")
trap 'rm -rf "$scratch"' EXIT

check_actions() {
  node "$src/scripts/demo/check-actions.cjs" "$target" "$scratch/actions/app" || return 1

  play() {
    DEMO=$scratch/actions sh -c '
      set -- do true; . "$0"
      clear_stage() { touch "$D/scene-began"; }
      reopen() { :; }
      rm() { :; }
      git() { :; }
      open_tab() { t=fake-agent; }
      first_turn() { :; }
      focus() { :; }
      sleep() { :; }
      demo() {
        case "$3" in
          terminal.open) printf "%s\n" "$4" > "$D/open.json"; printf "{\"terminal\":\"retro\"}\n" ;;
        esac
      }
      code=$H/code
      . "$src/scripts/demo/scene-actions.sh"
    ' "$stage"
  }

  play || return 1
  command=$(jq -r '."t3-actions.actions".list[] | select(.id == "retro") | .command' "$scratch/actions/app/shared.json") || return 1
  jq -e --arg command "$command" '(.name == "Retro") and (.place == "tab") and (.argv == ["sh", "-c", $command])' \
    "$scratch/actions/open.json" >/dev/null || return 1
  rm "$scratch/actions/scene-began" "$scratch/actions/open.json"
  store=$scratch/actions/app/shared.json
  jq '."t3-actions" = ."t3-actions.actions" | del(."t3-actions.actions".list[] | select(.id == "retro"))' "$store" > "$store.new" && mv "$store.new" "$store" || return 1
  if play > "$scratch/scene.log" 2>&1 || [ -e "$scratch/actions/scene-began" ]; then
    echo 'FAIL Actions scene started without Retro in the product menu' >&2
    return 1
  fi
  grep -q 'Retro' "$scratch/scene.log" || return 1
  echo 'demo Actions scene uses the product store and requires Retro before starting'
}

check_review_bar() {
  DEMO=$scratch/actions sh -c 'set -- do true; . "$0"; layout review' "$stage" || return 1
  if ! jq -e '[.. | objects | select(.content?.mod? == "pulls-review")] | length == 1 and
    .[0].content.props.block == "review-bar" and (.[0].content.props.toggle | not)' \
    "$scratch/actions/app/layouts/herdr-t3.json" >/dev/null; then
    echo 'FAIL the demo Review bar must show counts' >&2
    return 1
  fi
  echo 'demo layout and Review scenes enable the ordinary Review count bar'
}

check_daemon() {
  mkdir "$scratch/bin"
  cat > "$scratch/bin/hc" <<'EOF'
#!/bin/sh
printf '{"core":{"id":"same-core"}}\n'
EOF
  cat > "$scratch/bin/jin.review" <<'EOF'
#!/bin/sh
printf '%s %s %s\n' "$HOME" "$(pwd -P)" "$*" >> "$(dirname "$0")/stop.log"
exit 1
EOF
  cat > "$scratch/bin/ps" <<'EOF'
#!/bin/sh
case " $* " in
  *' 4242 '*) echo 'node /other-demo/jin.review/dist/daemon-process.mjs HOME=/other-demo/home ' ;;
  *) exit 1 ;;
esac
EOF
  chmod +x "$scratch/bin/hc" "$scratch/bin/jin.review" "$scratch/bin/ps"

  fail_stop=0
  for pid in 4141 4242; do
    folder=$scratch/review-$pid
    mkdir -p "$folder/home/.pulls.review"
    physical_home=$(cd "$folder/home" && pwd -P)
    touch "$folder/.herdr-t3-demo"
    printf '{"pid":%s,"port":7956,"session":"test-session"}\n' "$pid" > "$folder/home/.pulls.review/daemon.pid"
    DEMO=$folder PATH="$scratch/bin:$PATH" sh -c '
      signals=$1; set -- down
      kill() { printf "%s\n" "$*" >> "$signals"; }
      sleep() { :; }
      . "$0"
    ' "$stage" "$scratch/signals" || return 1
    [ ! -e "$folder" ] || return 1
    if ! grep -Fqx "$folder/home $physical_home --stop" "$scratch/bin/stop.log"; then
      echo 'FAIL down did not call Review shutdown from the isolated demo home' >&2
      fail_stop=1
    fi
  done
  if [ -s "$scratch/signals" ]; then
    echo "FAIL down tried to signal stale or reused Review PIDs: $(tr '\n' ' ' < "$scratch/signals")" >&2
    return 1
  fi
  [ "$fail_stop" = 0 ] || return 1
  echo 'demo down did not signal stale or reused Review PIDs'
}

fail=0
mkdir -p "$scratch/actions/app/mods" "$scratch/actions/app/layouts" "$scratch/actions/app/themes"
DEMO=$scratch/actions sh -c 'set -- do true; . "$0"; install_app' "$stage"
check_actions || fail=1
check_review_bar || fail=1
check_daemon || fail=1
exit "$fail"
