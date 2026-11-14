# Herdr T3

A calm, T3 Code-like window for Herdr App that saves your attention as agents multiply. The default Inbox keeps agents that need you as cards, folds busy ones into Working, and waits for you to Settle finished ones; new work brings them back. Lists offers Spaces + Agents instead. Both include your other machines and share names, pins and status marks. Slim tabs, framed panes and an Actions run button surround the work. Files and the optional pulls.review page share a right-hand space panel.

![Herdr T3](preview.png)

## What you see

### Window and surfaces

Use Herdr layout JSON/mod API and T3 Code proportions. Keep the person's theme, layout UI font and window code font. The preview's Geist/Geist Mono, font size 12, zoom 1.1 and minimum contrast 3 are examples, not installed settings.

| Part | Geometry and surface |
| --- | --- |
| Sidebar | 256 logical px, min 208, max 480; outer edge draggable; `chrome` |
| Brand / tabs / panel head | 40px high, window-drag regions |
| Sidebar footer | 44px |
| Spaces / Agents in Lists | Equal share, each at least 90px |
| Work area | `chrome`, including the gaps behind panes; 8px horizontal inset, 8px pane gaps and bottom inset |
| Pane | `background`, radius 8, 2px border also in `background`; framed even alone |
| Pane header | Always present outside Home, 28px, inside the pane |
| Space panel | Rightmost full-height column; initially hidden, initially equal weight to work, min 480px; draggable outside divider, 8px horizontal/bottom inset |
| Dividers | 1px `border` |

No title bar, terminal opacity 0, terminal padding `[8, 0]`. A pane's 2px focus border defaults to `background`, so it is invisible without changing the terminal's size; setting its layout `focus.color` to `accent` makes it visible. In a split, unfocused headers' icon, name and folder fade to 50%, returning on hover; status and controls keep their opacity. The shipped `workspace-status` bar exists but is hidden.

For later size, radius, spacing or color changes, consult [the T3 token reference](docs/internals/t3-tokens.md); it is the maintained source for design rules (grouping, alignment, popup triggers), component tokens, button variants and deliberate differences from T3.

### Sidebar chrome

The brand bar reserves macOS's window buttons, then shows Herdr's own mark (`frame/welcome/herdr.png`, 20px, radius 5, 70% opacity) and `Herdr` (14px medium `muted`, 8px apart). Both brighten on hover and while on Home; their 28px button goes Home and has no tooltip or hover fill. Hide the entire name when it will not fit; keep the mark, not `Her…`. At the right, 8px in, 28px buttons with 16px Lucide icons switch mode and hide the sidebar. The mode icon names the destination: `inbox` or `layout-list`; the two touch.

macOS traffic lights start at `[16, 12]`, centered on the brand bar, 16 screen points before the mark. Without title bar, outside full screen, their unzoomed Y is `12 + 20 × (zoom − 1)`; adjust only installed `herdr-t3`, not renamed copies. Hidden/narrow sidebar: tabs reserve lights. Windows has 28px window buttons at the bar's end.

The footer has touching 32px icon buttons, radius 8, 16px icons, inset 8px and 4px from the top: Herdr Settings and the layout's sliders button. Free space holds the undo notice. When an update has downloaded, a right-aligned 32px `Update` pill (12px `accent` on its 15% wash) runs `app.update`.

### Inbox

Inbox is selected initially. Its 32px top row is inset 8px: a Search button drawn like a search field, then the space filter, New space and New tab (28px buttons, 16px icons). Search opens Go to, not an inline filter. Leave 8px before the cards. The filter is a 288px combobox under its button's left edge: radius 8, inset 4, 26px search over a rule, 32px rows of radius 4.

Pinned and Active cards occupy the top. Working, Snoozed and Settled are bottom-anchored, folded shelves when they have entries; when space runs out they follow the cards in the same scrollable list. Headers are 32px, inset 2px beyond the rows, padded 8, with a dim 12px label, normal-weight count and 12px chevron. A folded shelf still exposes its row in view, excluded from the hidden count. Settled has Show more pagination and Clear when there are terminals it can close; Clear leaves the tab in view alone and asks first.

Cards: radius 6, padding 8, lines 20/20/16 with gaps 4/2, 78px with all three, 5px apart. First line: space mark/name and state/time (Working + duration, Needs you, Done, otherwise age); second: agent title; optional third: branch, middle-truncated. Program icon at 60% and remote-machine mark end branch or title line. Viewed/needs-you/done titles are medium `foreground`, otherwise normal `muted`, brightened on hover. Working cards are 70% until hovered/viewed. Pin follows space avatar.

Settled and Snoozed use slim 36px rows, radius 6, 1px apart: 16px space mark (40% until lit), title and elapsed/remaining time. Hover replaces time with Un-settle or Wake. Snoozed shows an `accent` alarm clock; Woke is `blocked` text and remains beside hover controls. Controls replace the card's status corner by a cross-fade, not a reflow.

Hover details: title, space, remote machine, branch and program; 12px, max 320px, solid/`shadow_xl`, 4px right, tops aligned. First waits 150ms; within 400ms opens instantly. First/last fade/slide 4px over 150ms, instant replacements never overlap. Controls suppress details across their corner; click dismisses, drag hides. Program/pin/machine marks have no separate tooltip.

### Lists

Lists splits Spaces and Agents. Each heading is 32px, aligned with Inbox's top row, using 28px buttons with 16px icons. Spaces begins 4px below its heading; rows are 32px, 1px apart, padded 10 with 10px gaps, a 16px space mark and medium name. Group by machine once there is more than one, with a `New space here` row for an empty machine. Show unusual git facts only (`repo · branch ↑2 ↓1`, omit `main` / `master`). Worktrees nest under their repo with tree lines.

Agents has 36px rows, radius 6, 1px apart, padded 10 with 10px gaps and a 16px program slot. The viewed and attention-needed agents lead visually; others recede until hovered, working at 70%. Before the status, show time in state (`<1m`, `5m`, `3h`, `2d`, 12px); hover replaces it with a pin control over 150ms. No inline machine mark: the same hover details as Inbox supplies it.

Sort by space or priority. Pinned is a shared group in either sort. Priority headers use the shelves' 32px form; space headers use a project-folder form, with 8px above, a 16px mark, medium name and a right-click space menu. Closed groups show the hidden count and urgency mark, while keeping the viewed row outside the fold. Parent folds precede time; folded by default, with a dim hidden count. Blocked/errored sub-agents still show one step in. A sub-agent with its own pane appears once under its parent unless pinned. Hovering a sub-agent also shows details, placed in its parent's space, with branch only if it has its own pane.

Keep the sidebar's two right-edge icon columns aligned: fold chevrons are 12px, centered 22px from the edge; machine `+` is 24px with a 14px icon, centered 50px from the edge.

Connect keeps its machine-specific accessibility label, without a tooltip repeating the same row's machine name.

### Tab bar

Tabs: 24px, radius 6, text 12, active `selected`. Lists shows all space tabs: 12px program/terminal icon, name, trailing 16px state slot; hover replaces state with 16px close/12px `×`. Minimum 96px for short names. Full names until crowded; longest shrink first, active to 240px/others 144px, then scroll. Both modes fade clipped edges over 16px. On active/room changes only, minimally bring active into view; leave wheel scroll alone.

Inbox left: space / relevant parent / viewed agent, 14px medium, gaps12/dim slashes; space `muted`, viewed agent `foreground`. A split sub-agent follows parent after slash; peers use card/pane, not another switcher. Right: compact icon/name tool tabs, no min-width/state slot, hover `×` replaces icon. Order: non-agent panes hidden by zoom, current family's other tabs, no-agent tabs; 16px rules between nonempty groups. Do not repeat current/parent tabs from breadcrumb.

Breadcrumb takes full width up to the row; right-aligned tools yield to zero, end visible with wheel/fades. Below 360px breadcrumb room parent becomes `…`; truncate names only when breadcrumb exceeds row. Clipped names/Lists tabs with state get 12px labels 4px below, word-aligned; whole names none, Inbox labels no state. Close tooltip waits 500ms, key only on active tab.

When Herdr's native zoom is active in a multi-pane tab, replace the tab with a 24px dashed-outline group, radius 6, one icon/name segment per pane; zoomed segment `selected`, max 240px, other segments max 144px. In Lists the group's state remains at its end; it has no group close, tab menu or drag. In Inbox the agent is still the breadcrumb and only non-agent panes form tool segments. Restore splits with the pane's zoom button or `cmd-shift-enter`, not a second bar button.

After tabs, one touching group (t3-tokens P3/R1): Lists' terminal +, Details(square-menu), then the closed panel's panel-right in the corner; window buttons (Windows/Linux) last, 8 on. Work owns Details; panel/window controls move to the open panel head. Small chrome buttons, tooltip below. Native end-aligned popup under it, content-sized, capped (t3-tokens). Locked computer name, folder tooltip, row Copy full path; no hover/chevron/migration. Open in: Finder+installed T3 editors (Cursor/Trae/Kiro, VSCode/Insiders/VSCodium, Zed/Antigravity, JetBrains); always menu; selection saves global target, main opens, missing→Finder, remote disabled with reason. Global Actions: empty Add, else primary+menu; Edit only hover/focus. Splits use shared split() (t3-tokens); chevrons/folder share the end slot; menus row-wide; arrows aria-label only. No card shadow: the native popup clips it square. Add action tooltip is icon-only; action/computer names only when actually clipped. Editing keeps parent; running closes menu. Capture source before focus; explicit cwd wins, source change closes. Tab/Enter/Space buttons, arrows menus. Card right-click four visibility toggles/Reset; all hidden leaves Choose what to show. Panel open closes Details; outside click keeps panel; maximized shortcut restores work. No terminal resize; Home has no Actions.

Quick Review is a split row; its end shows, dim, the range a live Review tab shows. Main shows Review (that range, else its default). Chevron: a range menu under the row (row-wide, offset 4) with Review's ranges, no base or `‹ ›`; Commits opens beside it in its own popup. Only the shown range is checked. Choosing shows Review on that range. Counts read afresh per opening; stale reads can't apply; no Git writes or PR rows. Missing Review or remote disables it with a reason; outside Git, the menu says so.

### Panes and sub-agents

The header orders program icon, meaningful name (14px medium), folder after 12px, sub-agent button, state, then split right/down, zoom/unzoom and close. Header controls are 24px with 14px icons, shown on hover or keyboard focus. Omit a name equal to its program's name. In Inbox a lone or zoomed agent's name is already in the breadcrumb and is omitted here; split panes keep names. Inbox headers mark a settled agent with a 14px `dim` check, or a snoozed one with a 12px `accent` alarm clock and time left; working/blocked take precedence. Lists shows neither put-away mark. First icon/word align under the first tab, last control/state 12px from the window edge.

Sub-agent entry: `3 ⌄`, live descendants only, `blocked` tint if any need you; tooltip/aria gives total/attention counts. The header's state mark stays the agent's own. Control24/text12 medium/p8/chevron14/r8. Popup280, below4/end-aligned, p4/row28/no heading/ten rows then scroll; closes when empty. Depth-first order, indent16 per level, never urgency-sorted. Row: program icon16, name, then the Agents rows' mark: spinner+duration, `!`+`Needs you`, `!`+`Failed` in `ansi1`, unread done dot, idle age (`12m`); blank before first report. Pointer/arrows light a row; click/Enter peeks and closes; right-click closes it and opens the shared `t3-menu` agent menu. Skip command shells.

### Space panel and Files

One right panel follows the space across terminal tabs; each space keeps tabs/active/open/maximized, unused ones closed and empty; width window-wide. No fixed pages: a tab per file, at most one generic Files and one Review. Head ([tokens](docs/internals/t3-tokens.md) 面板标签, P3/R1): T3 tabs and + in one scrolled strip, then maximize/restore and panel-right. Wheel scrolls; T3's ‹ › sit after the strip, greyed at the ends; the active tab (and a last tab's +) scrolls into view. Same names aren't told apart (T3). Hide keeps tabs, leaves maximize; returning restores it.

Empty: centered Open a surface, Files F, installed Review R. Review reads the repository where the tab works: its last terminal's cwd, else the space folder (as T3's diff follows its thread); remote or none greys it with the reason, in + too. In Files/Review, cmd-t opens + under + and cmd-w closes the active tab, never the terminal (keys.json `mod:`). Letters pick, arrows skip greyed rows, Enter runs; modified letters/input focus pass through. + Files adds/picks the full-width tree; a file replaces generic Files or picks its tab. One shared tree; picking a tab clears search and reveals the file.

×/middle close. Active close picks right else left; others keep active; last hides, reopen empty. Tab menu: Copy path (file/folder), Close, Close others, Close to the right, Close all; impossible greyed; bulk in one step. Hide/switch keep; close lets go: each mod drops what a gone tab instance held; Review re-added starts at default range, ignoring asks for the closed one. Per space three recent file tabs keep preview/Editor/position; older reload at top. Deleted/renamed file keeps its tab, path/root, Locate/Retry. Terminal path clicks: not done, no host callback.

Both surfaces: `background` card, content left/tree right; every row's ends sit 12 inside its column (t3-tokens R1). Review keeps its toolbar and shared states; generic Files is its tree; errors stay in place with path/root.

Independent navigation open/width and Wrap/Scroll: start256, min160/max560, content min256, left6px drag handle; Files keyboard ←/→16/Home/End. No breakpoint; reflow after300ms stable width; no cross-page reveal.

Files reads space `folder`/machine. Sizes in t3-tokens. Crumbs scroll/truncate, strip transparent, directory hover brightens text only, no fill. Folder tabs open beside source then replace themselves, retaining trail; `›` opens the folder's menu, a native popup; folders cascade beside it, any depth, right else left (a too-narrow page overlaps); a file opens, closes all; no T3 Back to, by choice. Open in: Details' target, split and menu (end-aligned, unchecked). Preview/Code, Wrap, Tree keep fixed slots, disabled if unavailable; actions use pointer. Read-only Markdown/native Editor/images; content keeps selection focus. Host API cannot match T3 gutter color/height; retain Editor.

Tree [tokens](docs/internals/t3-tokens.md), Review's rows too: no chevron; open/closed folder icon, Pierre file icons, theme hues. Loaded chains stay compact closed. Natural folders-first, dotfiles except `.git`, ignored dim; no Git badges or row/crumb tooltips. One selection; arrows/Home/End/Enter/Space, Shift+F10; virtual rows. Only tree/breadcrumb moves focus the tree.

Search: padded ghost28/focus ring, Esc clears/blurs. Debounce200ms, ≤256 chars, all words case-insensitive; never another query's results (unsearched shows loading). Result/ancestor tree, opening retains query. Max200 (name-matching then shorter paths) plus refine note; Git nonignored or filesystem≤200k, remote≤1000. Separate loading/empty/error.

Visible refresh: immediate return, local5s/remote10s, slow-read backoff. Text updates/images reselect; text≤1MB, remote images≤512KB; unreadable explains why. Expand-all skips ignored, max200/four reads; collapse/toggle/search cancel pending expansion. Thousands of rows stay smooth; no refresh race/sync disk IO.

Tree menu, native popup at the pointer: local Open/Reveal/Open with, relative Copy path, Insert into tab's last terminal (disabled if absent); no remote local-app rows. Arrows/Esc/typeahead. Insert restores text clipboard, never Enter/images/later copies. Review has no tree menu.

### Optional Review

Review is for the [pulls.review fork](https://github.com/JinJieBeWater/pulls.review/tree/multi-repo), CLI `jin.review`, on local repositories only, where the tab works (above). Its 40px toolbar has scope, branch comparison or commit SHA/previous/next, Analyze, fold menu, settings and navigation toggle; sizes in t3-tokens. With no repository or on another machine it says `Review` and disables navigation. A range with no changes says `No changes`.

Scope menu: Changes, Uncommitted, Outgoing, Incoming with counts as `3 commits`/`1 file` (zero disabled unless shown), none lit on opening, separator, then searchable Commits submenu (max 320px list). Branch scopes show `head → base`, `vs base` under 640px; a commit shows short SHA with `‹ ›`. Changes has a separate comparison-target button: 36–192px wide, opening a 288px searchable popover with BRANCH/REMOTE sections, 28px rows, max 256px list. Automatic is omitted during search. List local branches except head, paired with same-name remotes (origin first) and a 22×14 remote switch, then at most 200 newest remote-only branches excluding HEAD; default branch first, then newest. Choosing base opens `base...head` without analyzing; the switch leaves its menu open. Keep the chosen base per space; Changes counts and Commits follow it.

Two or more groups form one horizontal scrollable, nonwrapping tab row beneath the toolbar across diff and tree, on its edge, ruled below. Include rule-based groups as well as AI groups. Each outlined tab (sizes in t3-tokens) has two lines: category icon, medium name and critical mark; then additions/deletions, file count and a progress donut once reviewed. Current group uses the tree's selection, others hover. No meaningless line-count separator for binary-only groups. Clicking a group starts it at the top in diff and tree. An AI group's summary heads the diff (title over muted text, capped); rule-based boilerplate is omitted.

Navigation lists only the current group's folders/files, then subgroups as category/name/critical/count/reviewed rows. Subgroups start open; folders folded. Never compact a subgroup into its sole folder. Clicking a subgroup opens it and scrolls to its header. Files follow the same natural ordering as Files, as do diff, line requests and `j`/`k`. One current file is selected, from a click, `j`/`k`, or the file at the viewport's top; jumps expand ancestors. Rows are Files' tree rows; reviewed boxes precede icons; folder/subgroup boxes are tri-state, removed files keep an empty slot. Reviewed files dim and strike through. Review tree has no context menu; reviewed boxes remain.

Only code and hunk headers use the window's code font. Wrapped rows have 20px line height; Unicode wide characters, combining marks and joined sequences keep their shapes and safe line breaks. Settings' Lines: Wrap/Scroll is independent of Files. A binary file has its `binary` header only, no row request. Sticky file headers remain opaque over scrolling code; translucent theme checkbox colors preserve their original alpha when scaled. Review refreshes while visible every 15s and catches up on return; full data/rows/layout caches cover only the last three shown spaces. Analysis status remains lightweight and per space. This layout has no Review bar or automatic analysis from opening a surface; choose scope and Analyze on the page. Language, Agent and Model are settings submenus; a pick closes only that submenu.

### Popups, dialogs and Home

New and Go to are top-centered popups, offset 96px, width 576, content-sized up to 420px, radius 16, 1px border and `shadow_2xl`; content appears from the first frame. Rows are 48px with 20px title and 16px second line, radius 4, padded 6px vertically. Their ruled footer uses 20px keycaps (radius 4, 12px medium). Go to has a borderless 36px search with 6px above/below; New's list caps at 285px, Go to's at 313px, both scrolling with keyboard highlight.

Ordinary menus use `popover`, radius 8, border, inset 4, 28px rows of radius 4, 14px text and 16px icons. Right-click menus are at the pointer, width 220, max height 260. Control menus hang 4px below, aligned to the button's window-facing edge. Tooltips are 12px, max 320px, radius 6; normally above, below top-bar controls. Primary buttons use `solid` / `solid_foreground`, secondary `raised` / `input`, destructive confirms secondary with `ansi1` text. Disabled buttons retain colors at 64% opacity, have no hover/click; filled hover is 90%. Ghost on chrome uses hover/selected, on cards uses foreground 7%/12%; sidebar row controls only brighten, tab close uses `raised`.

Actions editor and confirmations are 512px wide, radius 16, content-sized, padded 24, 20px semibold titles, 32px fields/buttons of radius 8. Confirmation titles wrap; Cancel precedes the named action (Close/Delete/Confirm), red text on raised rather than a red slab, bare footer with no rule. Custom snooze is 384px wide with the same shell and a ruled footer. Layout Settings intentionally follows Herdr's Settings, not T3: 880×620, 190px left navigation, `Herdr T3` title and Home section, right page inset 28/22, 14px row titles over 12.5px dim hints, dividers, 220×32 selects.

Home: one framed/headerless pane; centered Next agent (disabled if nowhere), Go to, New tab, max 320×32px/radius 8, text 14 left/keycaps right, no names/counts. Add 40px below group for top-bar balance. No tab/`+`/Actions/Review; fold row 40→8px except hidden-sidebar controls/macOS lights/Windows buttons, restore 40px on leaving. First frame already has Home frame/panel state.

## How it behaves

### Shared names, marks and attention

Use one naming rule for cards, Agents, tabs and headers: Pi's `pi.session` while Pi runs; then an explicitly named tab for a top-level agent, unless another top-level agent shares it; then a meaningful terminal title, with only that program's decorations removed (Pi's `π - … - <folder>`, OpenCode's `OC | `); else the program name. Reject path/user@host/program/folder-only titles and agent-decorated leftovers on a terminal no longer running an agent. Sub-agents do not inherit their tab's name. An unnamed tab reads as its agent, else focused pane.

Status aggregates a parent with live descendants: any blocked/error first; then the parent's own unread done; then working if it or a descendant is working; else its own state. A sub-agent's own row keeps error as Failed, the same `!` in `ansi1`, and its done, a dot until read, never becomes the parent's unread result. A live terminal is an agent if it reports status or its program is marked agent; a command shell is not, but agents started through one still count. Working uses the shipped spinner in `working`; blocked a rounded `!` on 15% `blocked` (14px normally, 16px Inbox, 12px Agents/sub-agent rows); done a 6px `done` dot (Inbox green `Done`); idle a ring in Agents, elapsed time in sub-agent menus, nothing elsewhere.

Space marks prefer the project's favicon from the repository root of its current place (first terminal's folder, else original folder): well-known favicon files first, then page/route icon declarations, no `.icns`. Use 16px, radius 25%. Otherwise use the name's first letter/digit, capitalized, bold mono at 8.25/16 of the mark, one of T3's 18 name-hashed colors (Tailwind 400 dark / 600 light) on a 14% wash; no usable character means a folder icon. Recheck found icons after ten minutes, missing ones after one. Program logos keep Herdr/mod artwork intact in the component's icon slot.

### Inbox versus Lists

Mode changes with the brand button, even with the sidebar hidden, leaving it hidden. Share names, pins and the meaning of Settle/Snooze labels. Apply attention policy only with Inbox selected, visible or hidden:

| Rule | Inbox | Lists |
| --- | --- | --- |
| Settle / Snooze controls | Available under their eligibility rules | Absent; Settle key does nothing |
| Snoozed working agent | Hidden in Snoozed and from working count | Still working in its existing row/order |
| Settled/snoozed unread done | Suppressed | Suppressed |
| Close viewed agent's whole tab / last pane | Home | Space's last-viewed tab |
| Agent navigation | Drawn rows; folded shelves only viewed row | All groups, including folded |
| Space filter | Can widen when a hidden agent is brought into view | Left alone |
| Tab bar | Agent breadcrumb + family/tools, no tool status | All space tabs with status |

Failure anywhere in a snoozed tree, or a new turn given in view, ends Snooze in both modes, even before Inbox has first started. Woke is cleared by viewing only with Inbox and an active window. A new busy/blocked state or finished turn after Settle makes the label no longer effective everywhere, without waiting for Inbox to draw.

### Inbox ordering, Settle, pins and Undo

Active sorts blocked first regardless of age, then by when work returned to the person, ties by address. Working sorts by run start, Settled by Settle time, Snoozed soonest wake first. A completed run remains Working for 2s to avoid flicker through quick continuations; blocked leaves immediately, pinned/settled skip grace. Looking at a card never reorders it. Clicking an agent uses `agent.focus` and does not auto-zoom a split tab.

Settle is explicit, never automatic: hover a finished card (pinned too) for `✓ Settle`, or use `cmd-shift-s` on the viewed agent. It removes the pin, writes the terminal label and puts it into Settled; new work automatically brings it back. The key on a settled viewed agent, the Un-settle arrow or dragging it out explicitly returns it to Active's top. Clearing the label otherwise retains its place. Undo restores its old position, labels and original pin position, preserving pins added in the meantime. A refused Settle also restores its pin. Clear closes settled agents' eligible terminals after confirmation, leaving the tab in view.

Pins have one hand-made order shared with Agents. Button/menu pinning inserts at the top, dragging chooses a position. Pinning ends Snooze. Pinned agents stay at the top whatever their state. Unpin returns an agent to its time slot and offers Undo; Undo restores just that pin in its place and writes no terminal label.

Settle, Snooze and Unpin publish `Settled, Undo`, `Snoozed, Undo`, `Unpinned, Undo` (counts for a batch) in footer free space for 5s, fading over 200ms; while sidebar hidden, in the tab bar. Truncate summary before Undo. Repeated same actions combine. Undo restores state, not a fresh return; while still at the Home reached by that action it also returns to the agent, but after going elsewhere it does not navigate. There is no Undo key: `cmd-z` belongs to terminals.

### Inbox dragging, sweeps and motion

Moving 6px lifts an eligible card/slim row; Working cards and a Settle awaiting core echo cannot lift. The selected, shadowed copy moves vertically with the pressed point under the pointer. Its badge previews Pin, Unpin, Settle, Un-settle or Wake. Only while dragging, Pinned/Active labels expand to 24px over 150ms, Settled appears even empty, and target labels/gaps use accent. Gaps match destination card+5px or 36px slim row; empty/folded destinations show a dashed 36px placeholder. Pinned drops before/after a card according to its upper/lower half. Active/Settled use their own ordering, not arbitrary manual positions; Settled's page length stays fixed as entries enter/leave.

Release in the sidebar commits the target, never opens a row. Leaving off top/bottom commits the last target; leaving a side, Esc, disappearance or window deactivation cancels. The list takes keyboard focus only during the drag, then returns it to the pane. Sweep by pressing Settle or Un-settle and crossing rows in that section, then releasing to act on the run; Wake supports the same gesture. Snoozed accepts no drops because a drop cannot choose a time.

Reordering/section changes animate for 150ms ease-out: moved rows slide from prior position, new ones fade from 40px above, departed ones fade in place, headers/Show more/empty marker included. None while dragging or for more than 40 simultaneous changes. A drop starts its slide where released. Lists shares this motion for sorting/folding and cross-fades chevron directions; Inbox shelf arrows switch directly. Pressed rows use `selected`.

### Snooze

Any card not needing the person (including working/pinned, excluding failed turns) offers a clock before Settle. Keep hover controls stable while its menu is open. Presets: In 1 hour, In 3 hours, This evening (18:00, until passed), Tomorrow (09:00), Next week (Monday 09:00, on Sunday called Tomorrow). Sort by time and deduplicate wake minutes. Durations start on click; reject a fixed time that passed since opening. The menu is at least 160px wide; right-align below the clock if it fits to its left with 5px window clearance, otherwise extend right from the clock. Presets are not configurable.

Custom offers Date and time (36px calendar cells, past days disabled, arrows traverse dates/months, Enter/Space select, `HH:MM`) or Duration (nonnegative number with −/+ steppers, Minutes/Hours/Days select). Reject nonexistent/past times and nonpositive duration inline, keeping the dialog open; recheck agent eligibility when applying.

Snooze records a wake timestamp and, if viewed, puts the agent away. The agent wakes where it was; if a run finished under Snooze it returns to Active's top. It carries `Woke` until viewed/clicked in an active window; a background window cannot consume it. An agent still working can say `Working` and Woke together. A permission prompt temporarily exposes it as Needs you without removing the label; answering hides it again. Failure in its tree, a new turn in view, Wake, pin or Settle clears the label. A pinned snooze retains the underlying pin, returning to it on wake. Undo of Settle restores a snooze only if not expired.

Agent-menu Snooze is a submenu with the same presets/Custom, wake time at right. Hover 100ms opens it; →/Enter opens with first item highlighted; ←/Esc closes only it; a pick closes both. Place it beside the parent with first row aligned, flip left if only that fits. While the pointer heads diagonally into it, allow 300ms before switching an intervening row.

### Viewed rows and mod cards

The viewed row stays exposed through a fold or beyond the Settled page. A sub-agent with no row lights its nearest listed ancestor. Bringing a filtered-out agent/mod card into view widens Inbox's space filter to all and saves it, except on the first draw or after the person deliberately chose a filter while already there. Unlike T3, plain sidebar lists cannot be scrolled to that row from code.

A pane mod explicitly opting in through `shared("<mod>.program") = { icon, tint, name, inbox: true }` gets its own card, with title from `<mod>.titles` and state from `<mod>.status`; icon alone does not opt in. First seen, done and blocked go to Active top; working goes Working. It is the space's, not an agent's: its card lights only on its own focus; other mod panes light their nearby agent. Nothing in Home gets a card. Such a mod promises it can be closed safely: Settle and close / the Settle key closes its pane, with no Settled/Undo, returning to the preceding tab or adjacent agent, not Home. A space's last tab asks first. No pin, drag or sweep; space filtering applies.

### Tabs, navigation and close safety

Tab click selects, double-click renames, right-click opens menu. Drag starts at 6px, Esc/leaving cancels, holds focus only while dragging; Inbox only reorders no-agent tabs among themselves. Wheel only scrolls. Zoom segment click focuses/zooms that pane without restructuring splits.

Inbox breadcrumb space reuses a lone prompt-shell tab, most recently viewed first; creates only if none. `cmd-t` always creates. Both start fresh: a no-agent tab shows space alone until another agent is viewed. A program/opted-in mod beside an agent holds that tab's last-viewed agent dimly; a no-agent tool tab entered from strip/keys holds the space's last agent/family. Click held/away title to return. Current title opens its menu below/left-aligned, chevron only on hover/focus; held/away has none. Right-click space/title/parent opens that object's menu, dimmed too.

Agent next/previous follows selected-mode rows, no wrap, including mod cards but not pane-less sub-agents; from Home first/last. Tab next/previous wraps through displayed tabs; numbering follows them too. Space keys follow sidebar order including folded worktrees, skip Home/synthetic headings, keep project numbers.

Viewed agent whole-tab/last-pane close: Inbox Home, Lists space's last-viewed tab. With panes remaining, stay in tab. No-agent tab returns to previous tab; background close never navigates. Without history (restart), accept Herdr's choice. Layout closes leave first, close second, preserving unread neighbor. External closes/exits can flash Herdr's choice; restore misconsumed done/Woke after leaving, retry writes, but a 3s stay counts seen. Brief neighbor/done flicker remains possible.

All layout ×/close keys/context Close/Go to `ctrl-d` check `hc get`: own shell only closes immediately; running program or unknown answer asks. `Close terminal "<name>"?` + `This stops the running process and clears its history.`; plural lists names, tab's lone pane uses tab name. Enter confirms/Esc cancels. Last space pane uses Herdr's Close space. Direct `tab.close/pane.close`, including palette, remain native.

Context menus do not select or switch the thing right-clicked. Omit currently impossible items; separate groups in this order: destination, state, names/copies, worktrees, ending.

| Target | Available actions |
| --- | --- |
| Agent, including breadcrumb parent/sub-agent row | Pin/Unpin for top-level; in Inbox Settle/Un-settle when tree not busy, Snooze/Wake when eligible; Rename for a lone tab-named non-Pi agent; Copy address; Send back to parent; Close its pane |
| Space, including group/breadcrumb/filter row | New tab; Rename; Copy current path; New/Open worktree in repository; Remove worktree in linked worktree (`ansi1`); Close |
| Synthetic unopened checkout | Open, Copy path |
| Connected/rebuilt machine | New space here, Connect |
| Tab | New tab, Rename, Close |
| Terminal/pane header/zoom segment/mod card | Split right/down, Zoom; Copy address for terminal (address such as `t2` in hint column); right-click to program or back; Send back; Close pane |

Terminal addresses stay out of headers/sidebar; Copy address is on the terminal/header menu, not on mod panes.

### Spaces and Agents interactions

Click a space to switch. Drag 6px to reorder within its machine; a checkout moves with its expanded worktrees, a worktree only among siblings. Show lifted `selected` shadow and insertion gap, commit with `space.move`, retaining intent until model echo; Esc/leaving cancels. Fold choices are by repository. With checkout closed, two or more worktrees sit under a dim synthetic checkout at the first worktree's old position; one stays a plain `repo · branch` row. Clicking synthetic checkout opens it once via `space.new`, replacing the row without moving the group; for a bare repository it folds instead. The viewed worktree remains outside a fold and is excluded from its hidden count.

Click a top-level Agents row to `agent.focus`; sub-agent rows peek. A folded sub-agent in view lights its parent. The viewed done agent remains in Done until leaving. Drop fold state for ended agents. Sort menu is right-aligned 4px below its button, 150ms fade, 28px rows; the same button closes it. Pin buttons share Inbox's pins and end Snooze; unpin uses the global Undo notice. Settled/snoozed agents keep their existing order and working spin in Lists, only unread done suppressed; there is no separate Settled group.

### Go to, New and Actions

Go to (`cmd-p` / Inbox Search) has one row per pane: agents, shells, programs and mods, never terminals without panes or Home. Order recent panes newest first, then current space, then current machine, then remaining space/tab order, current pane last. Remember at most 30 live panes from every navigation route. Open on the previous pane, so `cmd-p`, Enter toggles back and forth. Row: space mark, shared pane name; beneath program icon/name, remote machine, space and live sub-agent `+n`, state at right. Search space/machine, explicitly named tab, pane name, program name/key and folder; pane-name matches rank before metadata-only matches. Enter/click `pane.focus` across spaces; `ctrl-d` asks/closes through the same safety route. Footer: ↑/↓ Navigate, Enter Go, Ctrl-D Close pane, Esc Close; New tab opens New.

New lists spaces current first, machines kept together; second line is folder, with server/machine for remote. Platform `1…9` picks numbered rows, labels `⌘1` on macOS / `Super+1` elsewhere. New space in its footer asks which machine when several, disabled until ready, with `← Spaces` back. `cmd-n` directly uses active space's machine and is shown in the footer only when no machine question is needed. Sidebar New space starts at the machine step; one machine creates immediately. New tab uses the space's current place (first terminal folder, else original), not always its creation folder.

Actions is global, not per project. Primary is last run, else first. `▶` repeats it, menu choice runs and makes primary, row gear edits, Add action creates. Editor fields: required nonblank Name and Command, optional Folder, icon and Tab / Split right / Split down; Save disabled until valid, Delete asks. Every run creates a new named tab/split using `terminal.open { argv: ["sh", "-c", command], name, place, folder? }`; the shell remains after exit. No Folder means focused terminal cwd, else same-tab terminal cwd, else space folder; expand `~`. Persist list and last choice across restarts. Shell aliases/functions require an explicit shell invocation such as `zsh -ic '…'`; plain Windows needs `sh` installed.

### Home and Settings

Putting away the viewed agent by Settle/Snooze/button/key/drag/sweep defaults to Home, leaving the next choice to the person. After putting away: Next card instead walks the cards cyclically and falls back to Home when none remain. Closing a whole viewed agent tab still lands Home, unaffected by this preference. Background actions move nothing. `cmd-shift-h` / brand mark goes Home; pressing there changes nothing. Herdr starts where it was left, not forcibly at Home.

Home is one local hidden space shared across projects/machines, created on demand. Identify it by remembered id, or strict local explicit name `Home\u200b`, never merely `Home` or its contents. Hide it from Spaces, New, Inbox filter, Go to and space navigation. It contains one selected mod (`t3-home` by default), or a shell in the home folder. It has no header split/zoom/close controls; normal close keys protect its own last tab/pane. Herdr's own split keys/palette can still add panes and those close normally. If its shell starts an agent, release that space in place as an ordinary folder-named space, without moving the agent; next Home creates a clean one. A busy non-agent shell remains and Home gets a new tab beside it. A shell exit can remove Home; recreate as needed.

Layout Settings opens from footer sliders / `cmd-shift-,`; invoking again replaces it. Esc closes the open select first, then dialog. Exactly two preferences:

| Preference | Choices and effect |
| --- | --- |
| After putting away | Home (default), Next card; applies to Settle/Snooze/drag/sweep, not closing |
| Home shows | Default, Terminal, installed mods with `"home": true` in `mod.json`, sorted by title else folder name; include selected mod even if no longer self-offered |

Read offered mods from app-home `mods/` when opening; skip unreadable/invalid manifests. Selecting Home content refits it immediately and on arrival. Settings are live across instances and survive updates. Selects use 28px menu rows, no initial highlight, check on current item, arrows/Home/End/typeahead, Enter/Space to choose, Esc/outside to close.

### Optional asciicn wallpaper Home

Install `extras/mods/asciicn-wallpaper`, choose it in Home shows. Built-ins Lighthouse/Mountain dusk/Nebula/Ember: [asciicn](https://asciicn.dev), MIT. Every picture is one image of its glyph shapes in theme colours (ANSI16 slots, opacity steps). Light themes draw pictures imported from images on paper (marks where the photo is dark); Studio/hand-made `.ans` and built-ins keep their tones. Geometric glyphs keep shapes; others become bars sized by darkness.

Home never blanks: the last picture stays until the next loads. Waits past 150ms show progress, kept 300ms at least. Sizes, presets, waits: [tokens](docs/internals/t3-tokens.md) 壁纸.

Unframed pictures cover Home from the bottom, subject anchored across; narrower ones fill the width. A smaller height counts after 250ms.

Switcher (bottom-right; shown on hover, keyboard, open menu or dialog, 1.5s after Apply): `‹`, name, `›`, frame, `+`; only `‹ ›` grey out (one picture). The name truncates; *Choosing…*/*Importing…* replace it. The choice is shared.

`+` (hint "Or drop an image or .ans on Home") opens a popup menu above it: Choose image…, Import Studio file (.ans)…, asciicn Studio (second line "Export .ans there, then drop it here"; `https://asciicn.dev/studio?source=image&charset=braille&color=truecolor`), Open wallpaper folder; Windows lists the last two. A file dropped on Home opens likewise (first path; `.ans` as Studio file); no drag-over highlight.

New pictures and frame open the framing card in the switcher's place. Rows: name; modes (images: Dots default, Braille, Blocks `░▒▓█`, Quadrants/"Quads"; arrows switch); Fill/Fit + Reset; Zoom (− slider + percent); footer (status, Cancel, Apply). While reading: name, progress or red reason (Close, Choose another…), footer; drawn, it opens upward, footer fixed. Modes share one draft at Braille's sample grid: a drawn one returns at once, a failed one reverts with its reason, none rereads or saves.

Fill crops; Fit shows all at 1×. Zoom is 100–400% of that: slider logarithmic, − + and `-` `=` step presets about the centre, a notched wheel and ⌘/Ctrl-scroll about the pointer. Trackpads and Shift-wheel pan, lift momentum ignored ([layout implementation](docs/internals/layout-implementation.md)); drag/arrows 10px, Shift 50px; `0`/Reset: 1×, subject in view. Enter applies, Esc cancels; framing does no conversion or I/O. Apply waits for a drawing mode, saves the `.ans` with the preview's picture, then framing and selection; failure keeps the draft with a retryable footer error and reuses only its own file. Existing pictures (built-ins too) frame without modes or conversion and save framing only; added ones offer Delete… left in the footer. Framing is relative (survives restart, theme, resize, cache rebuild); Cancel and late work never change the choice.

`.ans` copied into `<appHome>/asciicn-wallpaper/` appear unpreviewed, covering Home; edits redraw them. Unicode/dash/hidden names work; `.ans/..ans/...ans` are refused. Delete… confirms by name, then removes file, cache and framing, stops its work and selects the previous picture; nothing comes back late. Originals are never changed.

Photos come upright (EXIF); without `sips`/ImageMagick, import Studio `.ans`. Failed/empty imports say why, no auto-retry. Updates keep user files.

### Keyboard and focus

Controls have individual Tab stops, Enter/Space click, 2px inset `accent` keyboard focus ring. Hover-only controls also show when their row/control has keyboard focus. Terminal keeps Tab: outside overlays, start chrome keyboard mode by `pane.go` to a focusable sidebar; start at its first button, then Tab across chrome. Leaving all stops by pane navigation/terminal click/activating a destination ends mode within 500ms. A normal chrome click must not steal terminal focus. Close/crash/restart cannot leave stale keyboard mode held by nobody.

Popup lists wrap arrows, scroll highlight into view except a pointer-held row (wheel follows pointer). Searchless menus initially highlight nothing: immediate Enter does nothing until navigation/hover; leaving a row clears it except sort. Home/End jump in searchless menus; in a search field they stay caret keys. Typeahead lasts 750ms, repeated letters cycle starting matches. Button press again closes rather than reopens its popup. Searchable New/Go to/filter follow their first-match rules. Submenus use →/Enter to open, ←/Esc to close only the child, preserving parent keyboard ownership.

| Key (`keys.json`, layout context) | Command / behavior |
| --- | --- |
| `cmd-shift-b` | `t3-tabs.details`, toggle details; sidebar uses its button |
| `cmd-alt-b` | `t3-tabs.panel`, hide/restore the space panel |
| `cmd-shift-g` | `t3-tabs.review`, toggle Review; keyless `t3-tabs.files` does same for Files |
| `cmd-shift-s` | `t3-tabs.settle`, viewed Inbox agent/mod card only |
| `cmd-p` | `mod.open:t3-picker` |
| `cmd-]` / `cmd-[` | `t3-tabs.next` / `prev`, agents, no wrap |
| `cmd-w`, `ctrl-alt-shift-x` | `t3-tabs.close-tab` |
| `cmd-shift-w`, `ctrl-alt-x` | `t3-tabs.close-pane` |
| `cmd-shift-h` | `t3-tabs.home` |
| `cmd-shift-,` | `t3-tabs.settings` |
| `cmd-t`, `ctrl-alt-c` | `t3-tabs.new` (New at Home) |
| `ctrl-1…9`, `ctrl-alt-shift-1…9` | `t3-tabs.space:<n>`, projects excluding Home |
| `cmd-alt-]` / `[`, `ctrl-alt-shift-]` / `[` | `t3-tabs.space-next` / `space-prev` |
| `cmd-1…9`, `ctrl-alt-1…9` | `t3-tabs.tab:<n>`, displayed tabs |
| `cmd-shift-]` / `[`, `ctrl-tab` / `ctrl-shift-tab`, `ctrl-alt-]` / `[` | `t3-tabs.tab-next` / `tab-prev`, wrap |

Use Herdr's platform key labels (`cmd` as Super off macOS). `cmd-d` remains Herdr's split, not Review. With keyboard in Files/Review, `cmd-w` and `ctrl-alt-shift-x` close active surface, not terminal; panel cmd-t opens +. With a popup/dialog owning keyboard, all four tab/pane close keys close the overlay instead. The floating `tabs-keys` copy handles layout commands even with sidebar hidden or panel maximized.

## Built from

### Layout, modules and install

Create `layouts/herdr-t3.json`, its preview `layouts/herdr-t3.svg`, `mods/t3-*`, and `keys.json`. Keep node ids unique and these structural ids stable; layout code locates them:

```text
root: row, terminal_menu=t3-menu
├─ sidebar: column [256, min208, max480], chrome
│  ├─ brand: t3-chrome [40]
│  ├─ sidebar-lists: stack, active=inbox
│  │  ├─ lists: column → spaces:t3-spaces / agents:t3-agents [equal, min90]
│  │  └─ inbox: t3-inbox
│  └─ sidebar-footer: t3-chrome {footer:true} [44]
├─ work: column, chrome
│  ├─ tabs-row: row [40], nonresizable
│  │  ├─ tabs: t3-tabs [weight1]
│  │  ├─ tabs-end: t3-tabs {part:"end",block:"tabs-end"} [self-sized]
│  │  ├─ actions: t3-actions {block:"actions"} [self-sized]
│  │  ├─ window-end: t3-tabs {part:"window",block:"window-end"} [self-sized]
│  │  └─ tabs-end-inset: row [12]
│  ├─ work-body: row, padding[0,8], gap8
│  │  └─ work-main: stack, active=main
│  │     ├─ main: active tab, pane header=t3-pane [28, always, top]
│  │     └─ home-main: same active-tab pane frame, no header
│  ├─ work-bottom-inset: row [8] → bar-measure:t3-tabs {part:"measure"}
│  └─ status: workspace-status [28, hidden]
└─ panel: column [weight1,min480,hidden], padding[0,8], chrome
   ├─ panel-head: t3-chrome {part:"panel"} [40]
   ├─ panel-body: stack, active=files, background, radius8
   │  ├─ files: t3-files
   │  └─ review: review [optional]
   └─ panel-bottom-inset: row [8]
floating root: tabs-keys:t3-tabs {part:"keys"}, bottom/end, visually empty
```

Sidebar/work/panel columns have `resizable:false` to fix internal boundaries, retaining outside divider resize. `spaces` gets `{newMenu:"t3-new-menu"}`; Inbox gets `{newMenu:"t3-new-menu",picker:"t3-picker",home:"t3-tabs.home",menu:"t3-menu"}`. Main/home-main pane frames share background/border/focus/radius/gap/lone settings above. The floating keys copy owns commands, Home and per-space panel synchronization; other tab copies share navigation rather than each opening dialogs.

Required mods: `t3-chrome`, `t3-spaces`, `t3-agents`, `t3-inbox`, `t3-tabs`, `t3-pane`, `t3-home`, `t3-files`, `t3-new-menu`, `t3-picker`, `t3-actions`, `t3-menu`. Adapt corresponding shipped mods where available; Inbox/Home/Files are new. Keep shipped workspace-status/spinner/program artwork; UI icons are own-folder Lucide 24-grid/1.75px, Files/Review tree icons use T3/Pierre shapes. Mods cannot import outside their folder: edit `shared/` sources, then distribute with `scripts/sync.sh`.

Install all required mods as real files (SVG symlinks do not load), layout/SVG and context-merged keys under `HERDR_APP_HOME` or `~/.config/herdr-app`; select `layout.switch {"name":"herdr-t3"}`. `scripts/update.sh` needs `jq`/`rsync`: validate existing layout/keys, `rsync --delete` owned mods, preserve theme/focus/stack selections and supported extra blocks/Review `config.json`, update already-installed extras/themes only, merge keys with repo precedence and report replacements. Settings/pins/user wallpapers stay outside replaced folders. `scripts/sync.sh` also writes the installed home and sibling standalone repos; it is not check-only.

Optional Review: copy both `extras/mods/pulls-review` and `extras/mods/review`, install/configure `jin.review` per its own guide. Add a distinct `review-bar` block using `pulls-review`, `{block:"review-bar",toggle:true}`, immediately before `tabs-end`; append `review` page to `panel-body`. Update adds that page once the extra exists and preserves bar block/toggle. Do not reuse page id `review` for the bar. Optional Home wallpaper copies its own mod; theme-export is an explicitly shown zero-height `work` block using `extras/mods/t3-theme-export`, writing `~/.cache/herdr-app-theme.json` for Pi. These are opt-in; [extras usage](docs/user/extras.md) describes setup, theme files and ownership.

### APIs, processes and data

Herdr APIs: `spaces/panes/agents/terminals/focused/layout/settings/window/keys`, `run`, `openOverlay/closeOverlay`, `nextCommand`, `shared/setShared`, `exec`, `readTextFile/writeTextFile`, kit views/inputs/Editor and timers. Remote calls use `on` for the space's machine. Installed Herdr's declarations (`herdr-app check`) define availability, not Node/browser assumptions. Render builds views; setup/reads/input/scroll-handle creation stay outside it.

| Component | External programs / writes |
| --- | --- |
| Spaces | Read-only `git status/rev-parse`, `hc machine ls --json`; rebuilt-machine Connect: `hc machine rm`, then `hc machine add` |
| Inbox / tab commands / Agents pin | `hc label <address> settled=<ms>:<turn>`, `snoozed=<wake-ms>` or clear; tab navigation also writes `herdr.seen` when restoring unread |
| Close / navigation | `hc get <terminal> --json`; native space/tab/pane create/select/move/rename/close, `agent.focus`, `pane.focus`, `terminal.peek`, split/zoom/`terminal.park` |
| Layout chrome | `layout.select/show/hide/resize`; installed layout's `traffic_lights` field only, not a whole `layout.set` |
| Space icons | On space's machine: `git rev-parse --show-toplevel`, `sh -c` file tests, `base64`; copies under app `cache/t3-icons/`, shared icon/color metadata |
| Files | `sh` directory reads, `git check-ignore --stdin`, `git ls-files -co --exclude-standard -z`, fallback `find`, remote `awk`; text and `cache/t3-files/` images (remote base64), cleared at close/next start; vendored Pierre/T3 icon shapes |
| File menus | Clipboard save/paste/restore, `pane.focus`, `terminal.paste`; local `open -R` / default-app open where supported |
| Actions | `terminal.open` with `sh -c`, optional folder; global action list/last selection |
| Review extras | `jin.review` and shared read-only Git scope/base/ref helpers; local daemon and Review configuration, no remote Review |
| Wallpaper | `osascript`/`zenity` pickers; `sips`/ImageMagick to BMP; `open`/`xdg-open`/`explorer`; user `.ans`, generated `.tiles/`, `.builtin/`, temporary `.preview/` in its app-home folder |

Git reads use `--no-optional-locks -c core.fsmonitor=false`. Spaces omits untracked scans, reads on place/command/turn/reconnection changes with slow foreground fallback; Files includes untracked paths. Files/Review use no recursive watcher; hiding/switching stops refresh and invalidates in-flight reads, retaining full data for the three most recently shown spaces. Eviction releases full caches; late answers cannot refill them.

Store terminal facts as labels, cross-mod facts/preferences shared, per-copy UI `localStorage`, navigation/drafts in memory. Keep pins, settings, per-space panels, Home id, recent panes, published `{order,view}` rows and global Actions. Settings defaults: `{afterAway:"home",homeMod:"t3-home"}` (Terminal is null). Actions: `{list:[{id,name,command,icon,place,cwd?}],last}`. Each Files/Review copy retains `nav.open/nav.width/lines.wrap`; Markdown uses `t3-files.markdown`. Restart loses last-agent/close memory, not pins/settings/labels.

Before changing lasting values/files/migrations, read [storage](docs/internals/storage.md), the single source for locations/keys/ownership, label/layout writes, page-pref migration and wallpaper lifecycle. Use shared store/labels/pins/layout-settings helpers. Wallpaper saves publish atomically without overwrite, keep sources after cache failure/Cancel, with safe Unicode paths and separate previews. User files stay outside updated mod folders.

Scriptable entry points include `t3-tabs.{panel,review,files,home,settings,new,next,prev,settle,undo}`, `t3-tabs.close-tab:<id>` / `close-pane:<id>`, `t3-tabs.pin:<address>` / `unpin:<address>` / `wake:<address>` / `snooze:<address>:<wake-ms>`, `t3-files.open:<path>` / `search:<words>`, and `review.scope[:commits]`, `review.base`, `review.settings[:language|agent|model]`. Preserve popup-local close key contexts, including `t3-pane` and `t3-chrome`; otherwise a close key can destroy the tab behind an overlay.

## Watch out

- Hidden mods neither draw nor hear commands, and start on first display. Keep always-on commands/Snooze in floating `tabs-keys`; selected-mode order continues hidden, except Inbox's own order before it has ever started. Preserve pending intent through model/remote-label lag and report failed writes.
- Strict Home identity protects ordinary spaces. Release Home's agent space in place, never move/delete its process; restore destination panel state on arrival. Native external closes can flash a neighbor; restart loses close history, native Home splits cannot be blocked, zoom groups cannot drag, plain lists cannot scroll-to-row.
- Preserve confirmations/cancellation: close/Clear stops terminals and clears history, Remove worktree deletes, wallpaper removal deletes source/cache. Actions run arbitrary `sh -c`. Use expected-content writes for traffic lights, not `layout.set` which discards remembered layout clicks.
- Wrong icon paths draw nothing silently: inspect runtime-built icons in the demo. Mod imports stay inside their folder. Opaque surfaces replace unavailable blur/scale/letter-spacing; transparent popups still block input. Recover missing pointer leave/release; popup close must not reopen or close the underlying tab.
- When changing render/timers, focus/hover, measurement/scrolling, Review text or wallpaper conversion, read [layout implementation](docs/internals/layout-implementation.md). It holds host traps, not a second visible specification; tokens owns visual values, storage owns persistence.
- Keep this and [Chinese](RECIPE.zh-CN.md) aligned, each ≤60,000 UTF-8 bytes (Gallery skips oversized recipes). Keep name/description/preview/five sections self-contained; disclose implementation traps, not core behavior.

## Done when

1. `wc -c RECIPE.md RECIPE.zh-CN.md`: each ≤60,000; same feature coverage, local links/preview resolve. `scripts/sync.sh` (account for external writes), then `scripts/check.sh` → `all checks passed`: copies, mod checks/types, icons, overlays, render/update guards.
2. `layout.switch {"name":"herdr-t3"}`; `herdr-app status` has no missing mods/render warnings. Separate demo: `scripts/demo/stage.sh up`, `scene <name>`, `do herdr-app shot <file>`, `down`. Whole-window screenshots at default 256px sidebar and narrow/light/dark/zoom show correct, unclipped layout/lights. Startup needs GitHub; offline use a disposable copy with local `repos.sh`.
3. Inbox Settle/Un-settle/Undo/new work, pins from both modes, drag/sweep/cancel/Clear: original positions/pins restore, new work returns, Clear asks/spares viewed tab, Home/Next card follows preference. Background actions never navigate; Lists Settle does nothing. Hidden sidebar preserves mode order/no-wrap, 5s Undo, and Lists leaves Inbox filter alone.
4. Snooze working/pinned, permission/answer, failure/new viewed turn in Lists before Inbox startup, foreground/background expiry: hidden counts, temporary Needs you, Woke and pin rules hold. Invalid Custom inputs remain open; cancel changes nothing.
5. Current/held/away/fresh breadcrumb, peers/sub-agents, zoom/scroll/reorder agree with card/focus. Close active/background tab, last/split pane: Home/previous-tab/stay, preserved unread neighbor, process confirmation. Four close keys on overlays never close underlying tab.
6. Home mod/Terminal change and starting an agent leave ordinary agent space intact, next Home clean, project numbers stable. New/Go to: previous pane/name match first, remote metadata, shell reuse, keyboard machine/footer access without stealing terminal Tab. Worktree fold/reorder/absent checkout obey grouping and numbering.
7. Actions add/edit/delete/run tab/right/down/folder: required fields, confirmation, last-run choice, shell retention, compact widths.
8. Replay surface creation/replacement/duplicates/Review; all close/bulk/hide/widen/space/Home rules, bounded eviction and close/re-add. Local/remote, menus/clipboard, disabled/missing/long/many files, panel vs terminal keys. Details: empty/actions, locked context, picker vs execution, layered Escape, source invalidation; Git states/writes/visibility and cold/warm timings. Default-sidebar/narrow/light/dark whole-window shots; untried real pointer/keys explicitly unverified.
9. Review scopes/base/remotes/commits/groups/reviewed/j/k/Analyze/Unicode/binary/empty/error: consistent tree/diff order, no unintended analysis, safe wrap, opaque sticky headers, correct translucent checkbox alpha.
10. Wallpaper: one picture per theme, from disk at start; `+` menu, drops; card opens upward, footer fixed; four modes/8 tones, paper, EXIF; any picture framed unconverted; Studio glyphs; Fill/Fit, drag/keys/wheel/trackpad/⌘ zoom about the pointer, slider in step; Apply/Cancel/retry/conflicts/two Homes/stale work/deletion. Framing survives restart/cache/theme/resize; inputs do no I/O; no source edits/duplicates/resurrection; odd names work.

Passing checks do not replace visual/input verification. Report untried real clicks and remove only demo resources created for this check.
