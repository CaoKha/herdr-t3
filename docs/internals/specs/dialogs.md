# New, Go to, Actions and dialogs

Geometry and rules of the command popups (`t3-new-menu`, `t3-picker`), Actions (`t3-actions`), confirmations and Layout Settings. The [RECIPE](../../../RECIPE.md) says what they do; dialog and palette tokens are in [t3-tokens](../t3-tokens.md)「组件」 and「做不到」.

## New and Go to

- Top-centred popups, offset 96 (t3-tokens「做不到」), 576 wide, content-sized up to 420, radius 16, 1px border, `shadow_2xl`. Content shows from the first frame.
- Rows 48: 20px title line and 16px second line, radius 4, 6 vertical padding.
- A ruled footer with 20px keycaps (radius 4, 12px medium).
- Go to has a borderless 36px search, 6 above and below. New's list caps at 285, Go to's at 313; both scroll with the keyboard highlight.

### Go to

- `cmd-p`. One row per pane: agents, shells, programs and mods; never terminals without panes, never Home.
- Order: recent panes newest first, then the current space, the current machine, the remaining space and tab order; the current pane last. Up to 30 live panes are remembered from every navigation route (`t3-tabs.recent`). It opens on the previous pane, so `cmd-p`, Enter toggles back and forth.
- Row: space mark and shared pane name; beneath, program icon and name, remote machine, space and live sub-agent `+n`; state at the right.
- Searches space and machine, explicitly named tab, pane name, program name and key, and folder. Pane-name matches rank before metadata-only matches.
- Enter or click runs `pane.focus`, across spaces. `ctrl-d` closes through the same confirmation as other closes ([tab-bar](tab-bar.md#close-confirmation)).
- A highlight belongs to a pane, not its row number. Reordering doesn't change the target. If the pane is no longer in the results, clear the highlight and don't go or close. An edited query doesn't accept the old results: the first matching pane is selected when the new results appear.
- Footer: ↑/↓ Navigate, Enter Go, Ctrl-D Close pane, Esc Close; New tab opens New.

### New

- Live spaces first (current first, machines kept together), followed by remembered dormant projects (`t3.projects`) whose `(machine, folder)` is not already open; the second line is the folder, with server or machine for remote spaces. Dormant projects on a remote machine that isn't ready stay dimmed (`0.64`) and cannot be picked.
- Choosing a live space opens a new tab at its current place (`newTab`); choosing a dormant project runs `space.new` with its `folder`, `machine` and explicit `name` when `named`. No process status or close controls appear here ([ADR 0020](../../adr/0020-clean-up-and-project-bookmarks.md)).
- Platform `1…9` pick numbered rows, labelled `⌘1` on macOS and `Super+1` elsewhere.
- New space in the footer and the Inbox and Spaces headers make the same choice: create immediately with only this computer, otherwise ask which machine. Candidates are this computer, the reported machines, and machines that still have a space. The active space's machine comes first; remote machines that aren't ready (including those no longer reported) are listed but cannot be picked.
- The footer opens the Machines step in place, with `← Spaces` to go back; a sidebar header opens at that step. Pressing the same header button closes its step; pressing the other switches steps. `cmd-n` creates on the active space's machine directly; New space shows that shortcut only when it creates directly. A sidebar installed without the New menu uses Herdr's native New space command.
- New tab uses the space's current place (first terminal's folder, else original folder), not always its creation folder.

## Clean up

- `t3-tabs.cleanup`: `cmd-shift-r` (`ctrl-alt-r`) or the sidebar footer's trash can. `t3-tabs` probes what's outside the tab you're on and opens Clean up, a `t3-actions` dialog (`actions: "clean-up"`, 512 wide, as the confirmation), with what it found: the idle rows and the cards, each `{ pane, name, space, spaceId, machine, program }`, a card with its `process` ([ADR 0020](../../adr/0020-clean-up-and-project-bookmarks.md)).
- Idle (closes): core-confirmed settled top-level agents with no busy sub-agent, and non-agent shells at their prompt (`hc get`: the foreground is the shell itself). Left behind (cards): non-agent terminals whose foreground is anything else, or that don't answer, in a space where no agent is at work: not the space you're in, and no top-level agent there unsettled (working, needing you, unread or snoozed all count as at work). A program in a working space is in use and isn't listed.
- Drawn in Inbox's language (t3-tokens P5, P7, P9): the title is the act, `Clean up`, with no subtitle; the shelves carry the counts; the reason is last. Title 24 in, 12 above the body; body 16 in, shelves 8 apart, at most 420 high, scrolling.
- Shelf header, as Inbox's: 32px, 8 in, radius 6, a dim 12px label, its count in `muted`, and at the right a dim 12px note. `Idle <n>` has a 12px chevron and folds, folded by default; its note is `closes <spaces>` when every pane of a space is an idle row. `Left behind <n>` doesn't fold; its note is `no agent at work`. Counts, `closes` and `Close <n>` are worked out each frame from the rows whose panes are still live, so they follow a Stop here or a close anywhere.
- Idle rows, opened, as Settled's slim rows: 32px, 8 in, radius 6, 1 apart; the 16px space mark at 40% until lit, the name (`muted`, `foreground` lit) and the space name, dim 12px, at the right. Hover lights it with the `card` surface's 7%; a click closes Clean up and runs `t3-tabs.go-pane:<pane>`.
- Left behind cards, as Inbox's: 8 in, radius 6, 5 apart, a 4% `foreground` fill at rest (7% hovered), no outline. Line 1 (20, dim 12px): space mark, space name, remote server icon and machine, and at the right the foreground process (monospace), left out when the name already says it. Line 2 (20, 4 below): the name (`muted`, `foreground` lit) and the program or terminal icon at 60%. Hovered or holding the keyboard, a `micro` ghost text button `Stop` (label `Stop <name>`) takes the process's slot: a word, not an `×`, because the layout's other `×`s ask first while a program runs and this one doesn't. A click closes Clean up and runs `t3-tabs.go-pane:<pane>`; `Stop`, or `ctrl-d` on the card holding the keyboard or under the pointer (as Go to's and the space menu's), runs `t3-tabs.stop-pane:<pane>` at once (no second question: the pane, or its tab when it's alone there), and Clean up stays. A row or card goes when its pane does.
- Under the body, 12 below it and 24 in (level with the title), one dim 12px line naming both scopes: `Skips the tab you're on, and programs in the space you're in.` Beside the buttons it wrapped and competed with them.
- Footer, 20 above, 24 in, only the buttons at the right, as T3's alert: `Cancel` and the danger `Close <n>` (running `t3-tabs.cleanup-now:<serial>`; Enter does too, unless a control has the keyboard); with nothing idle, only `Done`. Confirming rechecks each idle terminal and closes tabs that are wholly idle with `confirmed: true`, so spaces they empty close.
- Nothing idle or left behind: no dialog, an `info` toast `Nothing to clean up` / `No idle or left-behind terminals outside this tab.`

## Actions

- Global, not per project. The primary is the last run, else the first. `▶` repeats it; choosing from the menu runs and makes it primary; a row's gear edits; Add action creates. The menu is one, from the bar's `⌄` or Details' row, as T3's `ProjectScriptsControl`: no rule over Add action, a row's gear only while the row is lit or the gear has the keyboard.
- The standalone bar menu is 220 wide, aligned 1px past the chevron's right edge and 5px below its bounds; 28px rows with 36px for padding and Add action, capped at 420px. With no press bounds it uses the host's placement. The demo passes explicit window-pixel chevron bounds to `t3-actions.bar-menu:<bounds>`; it opens that same standalone popup, not a child of Details or a click on the default layout's Details button.
- Editor fields: required non-blank Name and Command; optional Folder, icon and place (Tab / Split right / Split down). Save is disabled until valid; Delete asks.
- Each run opens a new named tab or split: `terminal.open { argv: ["sh", "-c", command], name, place, folder? }`; the shell stays after the command exits.
- Without a Folder: the focused terminal's cwd, else a same-tab terminal's cwd, else the space folder; `~` expands.
- The list and last choice persist across restarts (`t3-actions.actions`, shape in [storage](../storage.md)).
- Shell aliases and functions need an explicit shell, such as `zsh -ic '…'`; plain Windows needs `sh` installed.

## Actions editor and confirmations

- 512 wide, radius 16, content-sized, padding 24, 20px semibold titles, 32px fields and buttons of radius 8; the shell is drawn by the mod (t3-tokens「做不到」).
- Confirmation titles wrap. Cancel comes before the named action (Close, Delete, Confirm). The action is red text (`ansi1`) on `raised`, not a red slab; the footer is bare, with no rule (t3-tokens「有意不同」).

## Layout Settings

- Opens from the footer's sliders or `cmd-shift-,`; invoking again replaces it. Esc closes an open select first, then the dialog.
- Deliberately Herdr's Settings, not T3: 880×620, a 190px left navigation with the `Herdr T3` title and a Home section, the right page inset 28/22, 14px row titles over 12.5px `dim` hints, dividers, 220×32 selects.
- Selects use 28px menu rows, no initial highlight, a check on the current item, arrows, Home, End and typeahead, Enter or Space to choose, Esc or outside to close.
- Home shows lists installed mods with `"home": true` in `mod.json`, read from the app home's `mods/` when opening; unreadable or invalid manifests are skipped. Sorted by title, else folder name; the selected mod stays listed even if it no longer offers itself.
- Choosing Home content refits Home at once and on arrival. Settings are live across instances and survive updates (`t3.settings`, defaults in [storage](../storage.md)).
