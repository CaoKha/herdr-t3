# Herdr T3

## Shared modules

A `.js` found in several mods (`tip.js`, `focus.js`, …) has one source in `shared/`: a mod can't import outside its folder, so `scripts/sync.sh` copies it. Edit the source and its checks there, then sync. `scripts/check.sh` fails on a copy that differs.

## Icons

A mod's SVGs live in its own `icons/` and it names only those, or Herdr's shipped ones. A wrong path draws nothing and raises nothing: `scripts/check.sh` catches a literal path, and a path built at runtime has to be seen in the demo window.

## Behaviour

- One action, every entry point: a behaviour reachable from a menu, the breadcrumb, the palette (`keys.json`) or a key changes in all of them. When finishing, say which applied.
- No one-way doors: a way in gets a way out and a way to see the state, as Pin has Unpin and Undo. A missing reverse is a bug.
- One action, one name: a control's label, tooltip, menu row and palette entry name the same action on the same object; an icon-only control keeps that meaning.
- State tells the truth: no spinner once the work has ended, no label that outlives what it names, no animation that repaints while nothing changes.
- Undo, don't ask: a change that can come back (Pin, Settle, Snooze) happens at once and offers Undo; only one that can't, such as closing a running program, asks first.
- Nothing waits on motion: panels and menus open, close and switch at once; motion is only for something arriving or leaving, like the Undo notice.
- Quiet until needed: running work stays out of the way and doesn't pull the eye; it comes back when it finishes, fails or needs the person.
- Proof fits the bug: a logic, state or storage bug gets a failing `check-*.cjs` case first; a purely visual one (spacing, colour, alignment) gets before/after demo-window screenshots and no check.

## Finishing a change

1. Both changelogs and, where they describe it, both READMEs and `docs/user/` say the new behaviour, in both languages. `RECIPE.md` and `RECIPE.zh-CN.md` change only when what a rebuild produces changes; a value or detail goes in `t3-tokens.md` or the surface's spec, or the briefs grow back.
2. Run `scripts/sync.sh`. It also writes outside this repo: the installed `~/.config/herdr-app` and the working trees of `herdr-t3-inbox`, `herdr-t3-actions` and `herdr-pulls-review`, which then need their own commits.
3. `scripts/check.sh` prints `all checks passed`.
4. Anything visible is seen whole in a screenshot of the demo window, at the default sidebar width. A check passing or one word showing doesn't show a layout fits.

## Docs

Two audiences, two sets:

- **Using the layout**: the READMEs, the changelogs and `docs/user/`. They say what the person sees and does, and link only to each other. `docs/user/` gives each feature what it does, how to start and what is unintuitive, not every button, icon or state; a UI tweak needs no entry there.
- **Working on it**: this file, `GLOSSARY.md`, `docs/adr/` and `docs/internals/`. Rules we hold ourselves to, trade-offs and implementation notes go here.

`RECIPE.md` and `RECIPE.zh-CN.md` are matching briefs for rebuilding the layout from an empty folder. Keep the official six-part structure, the visible geometry, behaviour, dependencies and observable acceptance criteria in each brief. Keep each file at most 60,000 UTF-8 bytes so Gallery can collect it. Sizes, constants and edge rules belong in `docs/internals/specs/`, function-level algorithms and host workarounds in `docs/internals/`; link them where the reader needs that detail. Use `t3-tokens.md` and `storage.md` as their subjects' single source instead of repeating their tables and rules.

`docs/internals/t3-tokens.md`: read before adding or changing any visible control: a button, menu, tooltip, hover or focus state.

`docs/internals/specs/<surface>.md`: read before changing a surface's sizes, timings, limits or edge rules, and write them there; one file per surface.

`docs/internals/storage.md`: read before keeping anything past a frame: a terminal label, a shared key, `localStorage`, a layout file write.

`docs/internals/layout-implementation.md`: read before changing render/timers, focus/hover, measurement/scrolling, Review text or wallpaper conversion.

## Agent skills

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the root. Before working in an area, read the ADRs that touch it. Name domain concepts with the glossary's terms; when your output contradicts an ADR, say which one and why it's worth reopening.

## Demo window

`scripts/demo/stage.sh` builds a window apart from your own Herdr: `up`, `scene <name>` (sources `scene-<name>.sh`), `do herdr-app shot x.png`, `down`. `DEMO` picks its folder under `/private/tmp`.

- `up` needs GitHub through `repos.sh`. To work offline, run it from a copy of the repo whose `repos.sh` makes a local project.
- It drives the window with `herdr-app do` and never with the mouse. Report real clicks as unverified.
