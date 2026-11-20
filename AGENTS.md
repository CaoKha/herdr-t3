# Herdr T3

A layout for Herdr App: many agents running at once, with only the ones that need the person in view.

Ambitious ideas, simple systems, software that feels obvious. Don't keep complexity because it exists or add machinery because it looks impressive: find the real constraint, then the smallest model that makes the right behaviour unsurprising. Measure twice, cut once, and yagni; honour the request minimally and realistically, and fight scope creep. The rules below are good defaults and the developer's preference overrides them. When one fights the task in front of you, say so plainly and get a sign-off before breaking it.

## Words

- **you**: the coding agent changing this repo.
- **we**: the maintainers you are talking to.
- **the person**: whoever uses the layout in Herdr App.
- **Agent**, **Space**, **machine** and the rest are the domain terms in `GLOSSARY.md`. An Agent there is a program Herdr tracks, which may be you.

## Two ways to hurt yourself

1. **Driving the live Herdr.** `herdr-app do`, `hc` or `pkill` outside `stage.sh do` reach the person's own Herdr App and the Agents in it, this session possibly among them. Read its state if you need to; never drive, restart or kill it, and never kill a process found by matching a name.
2. **Sharing a demo.** `DEMO` defaults to `/private/tmp/herdr-t3-demo`, which another agent may be using, and `down` deletes the folder. Set your own (`DEMO=/private/tmp/herdr-t3-demo-<task>`) and `down` only the demo you brought `up`.

## Shared modules

A `.js` found in several mods (`tip.js`, `focus.js`, …) has one source in `shared/`: a mod can't import outside its folder, so `scripts/sync.sh` copies it. Edit the source and its checks there, then sync. `scripts/check.sh` fails on a copy that differs.

## Icons

A mod's SVGs live in its own `icons/` and it names only those, or Herdr's shipped ones. A wrong path draws nothing and raises nothing: `scripts/check.sh` catches a literal path, and a path built at runtime has to be seen in the demo window.

## Hit every surface

The most common defect is a change that works where you tried it and is missing everywhere else. Before finishing, walk this list and say which entries applied:

- **Entry points.** A behaviour reachable from a menu, the breadcrumb or a key (`keys.json`) changes in all of them. Herdr's palette lists only Herdr's own commands, so a mod's command has no palette entry.
- **Mods.** A `shared/` change reaches every mod `scripts/sync.sh` copies it into, `extras/` included, and the standalone `herdr-t3-inbox`, `herdr-t3-actions` and `herdr-pulls-review`.
- **Machines.** A Space can be on this machine or one reached over ssh (`machine: null` is local).
- **Sidebar states.** Shown or hidden ([ADR 0003](docs/adr/0003-hidden-sidebar-keeps-working.md)), showing Inbox or Lists.
- **Reverse states.** A way in gets a way out and a way to see the state, as Pin has Unpin and Undo. A one-way door is a bug.

## Behaviour

- One action, one name: a control's label, tooltip, menu row and palette entry name the same action on the same object; an icon-only control keeps that meaning.
- State tells the truth: no loading mark once the work has ended, no label that outlives what it names, no animation that runs without end. A working or loading mark is a still icon.
- Undo, don't ask: a change that can come back (Unpin, Settle, Snooze) happens at once and offers Undo; only one that can't, such as closing a running program, asks first.
- Nothing waits on motion: panels and menus open, close and switch at once; motion is only for something arriving or leaving, like the Undo notice.
- Quiet until needed: running work stays out of the way and doesn't pull the eye; it comes back when it finishes, fails or needs the person.

## Checks

- Proof fits the bug: a logic, state or storage bug gets a failing `check-*.cjs` case first; a purely visual one (spacing, colour, alignment) gets before/after demo-window screenshots and no check.
- Check what can break: state and storage, ordering and races, measurement and edge rules, and the logic a fix changed. Leave out what `tsc` already guarantees, trivial logic, copy text, and calls that only mirror a fake.
- Extend before you add: when a check file covers the behaviour, add a case there. Start a new file only when none fits.
- Check at one layer, the lowest that fails without the fix. A `shared/` module is checked in `shared/`, never again through each copy.
- Never wait on time: fake `cx.sleep` as `shared/check-menus.cjs` does, or await the promise itself.

## Finishing a change

1. Both changelogs and, where they describe it, both READMEs and `docs/user/` say the new behaviour, in both languages. `RECIPE.md` and `RECIPE.zh-CN.md` change only when what a rebuild produces changes; a value or detail goes in `t3-tokens.md` or the surface's spec, or the briefs grow back.
2. Run `scripts/sync.sh`. It also writes outside this repo: the installed `~/.config/herdr-app` and the working trees of `herdr-t3-inbox`, `herdr-t3-actions` and `herdr-pulls-review`, which then need their own commits.
3. `scripts/check.sh` prints `all checks passed`.
4. Anything visible is seen whole in a screenshot of the demo window, at the default sidebar width. A check passing or one word showing doesn't show a layout fits.

## Commits

- Commit, push or open a PR only when asked.
- Conventional title in plain language that says the behaviour: `feat(home): a Home of one mod's pane is one surface up to the window's top`. A sibling repo's commit after a sync names what changed there (`chore(shared): sync …`).
- Body: the problem in a sentence or two, then the fix.
- A UI change in a PR shows before/after demo-window screenshots; never commit PR-only images.

## Docs

Two audiences, two sets:

- **Using the layout**: the READMEs, the changelogs and `docs/user/`. They say what the person sees and does, and link only to each other. `docs/user/` gives each feature what it does, how to start and what is unintuitive, not every button, icon or state; a UI tweak needs no entry there.
- **Working on it**: this file, `GLOSSARY.md`, `docs/adr/` and `docs/internals/`. Rules we hold ourselves to, trade-offs and implementation notes go here.

Most changes need no `docs/internals/` change. Before adding a paragraph, ask what a maintainer would get wrong without it; if reading the code answers that, leave it out. No feature lists, field catalogues, control-flow narration or change summaries. When a documented rule or constraint changes, rewrite or remove the affected text instead of appending the new account.

`RECIPE.md` and `RECIPE.zh-CN.md` are matching briefs for rebuilding the layout from an empty folder. Keep the official six-part structure, the visible geometry, behaviour, dependencies and observable acceptance criteria in each brief. Keep each file at most 60,000 UTF-8 bytes so Gallery can collect it. Sizes, constants and edge rules belong in `docs/internals/specs/`, function-level algorithms and host workarounds in `docs/internals/`; link them where the reader needs that detail. Use `t3-tokens.md` and `storage.md` as their subjects' single source instead of repeating their tables and rules.

`docs/internals/t3-tokens.md`: read before adding or changing any visible control: a button, menu, tooltip, hover or focus state.

`docs/internals/specs/<surface>.md`: read before changing a surface's sizes, timings, limits or edge rules, and write them there; one file per surface.

`docs/internals/storage.md`: read before keeping anything past a frame: a terminal label, a shared key, `localStorage`, a layout file write.

`docs/internals/layout-implementation.md`: read before changing render/timers, focus/hover, measurement/scrolling, Review text or wallpaper conversion.

## Plans and scratch

Specs, plans, research notes and agent scratch stay out of git; `docs/ryugi/` and `.ryugi/` are ignored only by this clone's `.git/info/exclude`. The commit is the implementation record, and an ADR records a decision that outlives it.

## Taste

Default to no comment. Write one only for a constraint, a Herdr quirk or an invariant the code can't show: one line where you can, four at most. Don't restate names, narrate steps, record history or explain the fix you just made; the commit carries that.

## Agent skills

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the root. Before working in an area, read the ADRs that touch it. Name domain concepts with the glossary's terms; when your output contradicts an ADR, say which one and why it's worth reopening.

### Demo window

Before seeing, driving or screenshotting the layout, use [demo-window](.agents/skills/demo-window/SKILL.md). `.claude/skills` links to `.agents/skills`.
