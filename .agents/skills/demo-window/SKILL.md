---
name: demo-window
description: Build, drive and screenshot Herdr T3's demo window, a Herdr App kept apart from the person's own. Use to see a change in the running layout, take before/after screenshots, check that a layout fits at the default sidebar width, or play a README picture's scene.
---

# Demo window

`scripts/demo/stage.sh` runs a Herdr App with its own core, app home, HOME and projects under `$DEMO`. Run everything in it through `stage.sh do …`: the same `herdr-app` or `hc` command without it reaches the person's own Herdr.

## Start

1. Pick a folder of your own and pass it on every call: `DEMO=/private/tmp/herdr-t3-demo-<task> scripts/demo/stage.sh …`. The default `/private/tmp/herdr-t3-demo` may be another agent's.
2. `stage.sh up` installs the repo's mods, layout, `keys.json` and themes straight from the working tree and opens the window. It refuses a folder that exists: reuse it if you brought it up earlier in this task, otherwise pick another name.
3. `up` clones its demo projects from GitHub through `scripts/demo/repos.sh`. Offline, copy the repo under `/private/tmp`, make that copy's `repos.sh` create a local project, and run `up` from the copy.
4. The window closed: `stage.sh app`. With OmniWM running, `app` makes the window full width and fails when it can't; widen it before a shot.

## See a change

- Mods reload when their files change. After editing one, copy it in: `rsync -a --exclude gpui-kit.d.ts --exclude jsconfig.json mods/<mod>/ "$DEMO/app/mods/<mod>/"`, and `extras/mods/<mod>/` the same way.
- A `shared/` edit reaches the mod folders only through `scripts/sync.sh`, which also updates the person's installed app; then copy the mods in as above.
- A change to `layouts/herdr-t3.json`, `keys.json` or the themes: `down`, then `up`. `up` adds the demo's own blocks to the layout, so don't copy it by hand.
- `stage.sh do herdr-app status` reports file and mod errors. A broken save keeps the old version running, so check before you look.

## Drive it

- `stage.sh do herdr-app commands` lists every command; run one with `stage.sh do herdr-app do <command> '<json>'`. `stage.sh do herdr-app ls` shows spaces, tabs and terminals; `stage.sh do hc …` works on terminals.
- Drive it only with commands, never the mouse. Report hover, drag and real clicks as unverified.
- `stage.sh scene <layout|inbox|actions|review>` closes every space, plays that README picture and writes `$DEMO/<name>.png`. `inbox` uses stand-in agents only. `layout`, `actions` and `review` run real pi turns: copy the OpenCode Go key in first with `stage.sh key`, and expect minutes per scene.

## Shoot

- `stage.sh do herdr-app shot <file>.png` saves the window's current frame. Prove a layout with the whole window at the default sidebar width; crop a detail (`magick in.png -crop WxH+X+Y out.png`) only beside the whole shot.
- A visible bug's "before" is shot before the first edit. An "after" shot from before the last edit is stale.
- Rerunning a shot writes over its file. Don't keep numbered or `-final` copies.

## Stop

Leave the window up while the person is still looking. `stage.sh down` closes it, stops its core and Review daemon, and deletes `$DEMO`. It refuses a folder `up` didn't make; `down` only the demo you brought up.
