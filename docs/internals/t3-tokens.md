# T3 visual baseline

The layout's radii, padding, sizes and font sizes follow T3 Code. This file is the lookup table for that, and **T3 source wins over this table**: `apps/web/src` in `pingdotgg/t3code`, commit `337c5858` (2026-11-05). A local copy lives at `/private/tmp/t3code-terminal-research`; if it is missing, clone that commit again.

This file holds only the rules and tokens shared by the whole layout. Sizes and details that belong to one surface (panel tabs, the details popup, Files, Review, wallpaper…) are in the matching file under [specs](specs/).

## Rules

1. Every value points to a T3 component. When there is no direct match, use the component with the closest purpose and say why in one code comment.
2. One purpose has one value across the layout. Three identical copies are fine; don't create a shared constants file.
3. What the host can't do (Herdr's popup shell, glass effects, scale animations) goes into "Not possible" below; no emulation layers.
4. Only the visuals are unified. Behaviour, colours (set by the theme) and the "Deliberate differences" below don't change. The exception is the hover and on fill of buttons and tabs: a fixed ratio of `foreground` (see "Buttons"), not the theme's `hover`/`selected`, so light and dark themes have the same contrast. T3's `destructive` maps to `ansi1`, not Herdr's `destructive` (that is `blocked`, amber in some themes); it is a text colour only, never a fill (see "Deliberate differences").

Conversion: T3 `1rem = 16px`, `spacing(1) = 4px`, and Herdr's logical px map one to one. Where there is an `sm:` value, take it: that is the desktop size.

### Text size

Every size here is written for 13px text and drawn through `ui(n)` (`shared/layout-settings.js`): n × size / 13, whole px, n itself at 13. The size is `t3.settings.textSize`, else Herdr's `ui_font_size` (which `settings.json` can't set today, so 13). Wrap with `ui()` every text size and every height that exists to fit text: list, menu, tree, tab and code rows, the popup heights and offsets summed from them, line heights and character-width guesses. Keep fixed what isn't about text: the window's and the layout's bars (40px top bars, the tab row, panel heads on the pane header's centre, traffic lights), gaps, padding, radii, widths, icons and icon-only buttons, and badges drawn in an icon's box. Keep a base constant as written and wrap it at each use, so what's drawn and what's summed agree. The layout's Settings dialog stays at Herdr's own sizes, as Herdr's Settings does.

### Design principles

Check every rewritten block against these nine:

- **P1 One edge per column**: in two adjacent rows of the same column, the first icon or text shares one left edge and the last control shares one right edge. The edge is the content edge of that column, not the window edge. Measure on a screenshot, within 1px.
- **P2 Shared centres**: elements in one bar share a vertical centre (20 in a 40px bar); an icon is centred in its button box; buttons in one group are the same size.
- **P3 4 within a group, 8 between groups**: adjacent buttons in one group are 4 apart, `GROUP_GAP` in `shared/button.js` (T3 `PanelLayoutControls`, `DiffPanel`'s `gap-1`), and each button's hover and on fill is a whole rounded square; between groups, and between a button and text or an input, 8. Only what is really one control touches: split buttons (`split()`, Actions' ▶|⌄ included) and segmented toggles. Window buttons (minimise, maximise, close) touch as the system draws them. The sidebar head follows T3's sidebar head: the button groups of the Inbox top row and of the two Lists title rows touch, and the top row's Search box sits 4 from its button group. The layout has one in-group gap: T3's panel head ‹ › `gap-0.5` and the file header's `gap-2` both become 4. Brand bar: see [sidebar](specs/sidebar.md#brand-bar).
- **P4 One stroke**: UI icons use the Lucide 24 grid with a 1.75px stroke, and icons side by side have similar visual weight. `scripts/check.sh` blocks other strokes (except Pierre icons and the Windows window buttons), checks borrowed Herdr `workspace-chrome` icons too (reading Herdr's own copy), and fails any borrowed path built at runtime. Herdr's own are 2px; to use one, put a 1.75 copy in the mod's own `icons/`. The ones shared modules need (`menu-row.js`'s `›`, `project.js`'s folder, `status-mark.js`'s working circle, `panel-states.js`'s loading arc) live in `shared/icons/ui/`, and `scripts/sync.sh` copies them to the mods that use them.
- **P5 No self-evident or repeated words**: a tip adds only what the control can't say itself (action name, key, truncated full text, why it is disabled); a description doesn't repeat what the label already says.
- **P6 One way to build a button that opens a layer**: like the sidebar's Filter by space, with `shared/trigger.js`. The tip is the layout's own card and may carry a second line of description; while the layer is open the tip hides and the button stays on; clicking again closes it. See "Buttons" below.
- **P7 Quiet at rest, colour only for state**: ghost buttons and the split in detail cards (`row`) have no fill and no divider at rest; a split on a bar (`xs`) is outline like T3's headers, with only its border and middle line at rest and no fill; buttons in one bar share one hover fill and one on fill; `accent` is never a button fill.
- **P8 T3 first, deviations written down**: every value points to a T3 component; cross-surface differences go into "Deliberate differences", and ones that belong to a single surface go into its spec.
- **P9 Top-down hierarchy**: cards and layers put the title or content first, then controls, and descriptions last.

### Alignment

- **R1 End alignment**: the rightmost button of every top bar has its box's right edge on the rightmost control of the row directly below. In the sidebar both rows sit 8 from the sidebar edge; the work column aligns with the end of the pane header (12 from the window edge); the panel column aligns with the page header: the panel has no card, the panel header and the page are one `chrome` surface, and content sits 12 from the column edge (the layout's padding gives it to the panel header, each page row leaves it itself), so the toggle is also 12 from the window edge and doesn't move when the panel opens or closes. The left side is the same: the box of the panel header's first tab and the page header's breadcrumb box are both 12 from the column edge. Every row in a panel page follows this edge: the box of the first and last control (a ghost with no fill at rest counts by its box, like an unselected tab) or unboxed text sits 12 inside its column; a button at the start of a row that has text and no fill at rest also has its box at 12, uses the standard padding of its size, and its hover fill lines up with the left edge of the panel header's first tab box; the first breadcrumb level in Files and the text of Review's scope button sit at the same spot, so the first letter doesn't move when switching pages (values in [Files](specs/files.md#file-header), [Review](specs/review.md#toolbar)) (the navigation column counts from inside its left border). Review: top bar, group tab row, diff file header, hunk rows, file comments, line comment cards, group descriptions, navigation column header and tree rows; Files: file header, tree header, tree rows, Markdown preview. The right-aligned code line number column (Review's diff and Files' host `Editor`) is a gutter and doesn't count.
- **R2 Same size within a column**: two vertically aligned rows use buttons of the same size, and so does one group.
- **R3 Content right edge**: sidebar cards, slim rows and the Lists Spaces/Agents rows (sub-agent rows and tree lines included) have 8 horizontal padding; the right edge of status text and program icons lands on the right edge of button icons, and the left edge lines up with the Search icon and the bottom bar gear.
- **R4 Submenus hang beside their row**: a submenu touches the right edge of the row that opened it, and its first row is level with that row (like T3 `MenuSubPopup`'s alignOffset, the submenu top is 5 above the row top, cancelling its border and padding). If it fits on the right, it goes on the right; if only the left fits, it flips left with its right edge on the row's left edge; if neither fits, it goes on the side with more room, narrowed to that side's width. In every case it doesn't cover the row. Native popups and submenus inside Review pages are both placed by `subPlace` in `shared/submenu.js` (inside a page it keeps 8 from both panel ends); vertically it moves only to stay inside the window or panel.

## Radii

| T3 | px | Use |
| --- | --- | --- |
| `rounded-sm` | 4 | menu and combobox rows, buttons 20px and smaller, tab ×, badges, keycaps |
| `rounded-md` | 6 | tooltips, compact inputs, small 28px buttons |
| `rounded-lg`, `--control-radius` | 8 | menu, popover, combobox and select panels, inputs, default buttons |
| `rounded-2xl` | 16 | dialogs, command palette |

## Components

| Component | T3 file | Values |
| --- | --- | --- |
| Menu panel | `ui/menu.tsx` | padding 4, radius 8, large shadow |
| Menu position | `ui/menu.tsx`'s `sideOffset`, each `align` | 4 below the button; aligned to the button's edge on the window side: a right-hand button aligns right (`align="end"`), a left-hand one aligns left (`start`); the position comes from the button's `e.bounds` at press time, and with no press (assistive tech) the app's default pointer position. Context menus at the pointer, command palette centred at the top |
| Menu row | `ui/menu.tsx` | min height 28, horizontal 8, vertical 4, gap 8, font 14, radius 4; icon 16 muted, inset 2 on each side; submenu arrow 16 muted 80%, inset 2 on the right; trailing hint 12 medium dim; divider 1, horizontal 8, vertical 4. Drawn by `shared/menu-row.js`, see "Menu rows" below |
| Menu search box | `ui/menu.tsx` | outer horizontal 8, top 6, bottom 4; input height 26, then a 1px underline 6 below, icon 16, text starts at 20 |
| Combobox search box | `ui/combobox.tsx` | outer horizontal 12, top 10; the rest as the menu search box |
| Combobox row | `ui/combobox.tsx` | see source, horizontal 8, vertical 4, radius 4 |
| Tooltip | `ui/tooltip.tsx` | horizontal 8, vertical 4, font 12, radius 6, max width 320; usually above the control, below it for controls on a 40px top bar; the card is drawn by `tipCard` in `shared/tip.js`, also used by `named()` in `measured-text.js` |
| Popover | `ui/popover.tsx` | radius 8; default vertical 16, horizontal 16, compact vertical 8, horizontal 12 |
| Input | `ui/input.tsx` | default height 30, horizontal 11, radius 8; sm height 26, horizontal 9; compact height 28, horizontal 9, font 12, radius 6 |
| Select | `ui/select.tsx` | button of the same size; panel padding 4, radius 8; arrow 14 |
| Button | `ui/button.tsx` | default height 32; sm height 28; xs height 24, font 12, icon 14 |
| Icon button | `ui/button.tsx` | 32, 28, 24 (icon 14), 20 (radius 4, icon 12), 16 (icon 12) |
| Keycap | `ui/kbd.tsx` | height 20, min width 20, horizontal 4, font 12 medium, radius 4; `foreground` 7% fill, 75% text; one kind across the layout, `shared/palette.js` `keycap` |
| Badge | `ui/badge.tsx` | see source, radius 4 |
| Dialog | `ui/dialog.tsx`, `dialog-styles.ts` | max width 512, radius 16; header padding 24, gap 8; title 20 semibold; body 24; footer horizontal 24, vertical 16; top border by default, none in the `bare` variant (used by the Actions editor) |
| Confirm dialog | `ui/alert-dialog.tsx` | as dialog |
| Command palette | `ui/command.tsx`, `CommandPalette*.tsx` | max width 576, max height 420, radius 16; search vertical 6; footer vertical 10, top border |
| Tab close | `ui/panel-tab-close-button.tsx` | 16, radius 4, icon 12 |
| Title bar button | `index.css`, `SidebarTrigger` in `ui/sidebar.tsx` | 28, gap 12, icon 16 |
| Sidebar | `Sidebar*.tsx`, `ui/sidebar.tsx` | see source; [specs](specs/) holds measured values, the source still wins |

## Buttons

Every button is drawn with `button()` from `shared/button.js`, matching T3 `ui/button.tsx`; why buttons are an exception to rule 2: see [ADR 0016](../adr/0016-buttons-share-one-helper.md). Colours come only from this table; `accent` is never a button fill (it is the colour of focus rings and emphasised text), and `accent_foreground` only goes with non-button elements on an `accent` fill (`check.sh` checks).

| variant | T3 | Rest | Hover | on (pressed, layer open) |
| --- | --- | --- | --- | --- |
| `primary` | `default` | `solid` fill and border, `solid_foreground` text | opacity 0.9 | — |
| `outline` | `outline` | `raised` fill, `input` border, `foreground` text | opacity 0.9 | — |
| `danger` | `destructive-outline` | as outline, text `ansi1` | opacity 0.9 | — |
| `ghost` | `ghost-muted` | no fill, no border, `dim` text; `foreground` when `hot` | fill below | fill below, text `foreground` |
| `plain` | `ghost` | no fill, no border, `foreground` text (text actions in toolbars, like Review's Analyze, Retry) | fill below | fill below |

- Ghost and plain fills follow the surface they sit on (`surface`), as a fixed ratio of `foreground`, the same ratio in light and dark themes: on `chrome` hover 4%, on 7% (T3 dark's `accent` and the pressed Toggle's `input/64`; not the theme's `hover`/`selected`, which are a solid block in themes like maple-dark); terminal tab bar and panel header tabs match, current tab 7%, hover 4%; on `card` (`background` cards, `popover`, dialogs) hover 7%, on 12%; `row` (sidebar rows and controls inside cards, T3 row controls) has no fill and only brightens; `tab` (the tab ×) hovers `raised`, like T3 tab close's `bg-muted`.
- Disabled: opacity 0.64 overall (T3 `disabled:opacity-64`), fill and text colour unchanged, no hover, no click; a disabled toggle doesn't count as pressed and draws no on fill.
- Focus: `stop()`'s 2px `accent` inner ring, radius from `radiusOf(size)`.
- Pointer (whole layout): ghost buttons, `trigger()` and segmented toggles show the arrow on hover, which is what `button()` without `act` and `ghostButton()` do; solid buttons (primary, outline, danger), menu rows, split halves and list rows show the hand, via `button()` with `act` or the caller adding `cursor_pointer()`; draggable surfaces (wallpaper framing) use `cursor_grab()`.
- A button that opens a layer or menu always uses `trigger()` from `shared/trigger.js` (P6): it draws the button, the tip card and the focus stop; while the layer is open the button is on and the tip hides; when this press has just closed the layer, the click doesn't reopen it. Whether it is open, and whether it has just closed, is judged from the timestamp key the layer's `close()` writes (key names in [storage.md](storage.md)). Triggers that aren't buttons (the arrow half of a split, detail rows, titles, the breadcrumb ›) use `opener()` from the same file for the same press and click, and draw their on state themselves.
- svg doesn't take hover styles; a ghost's text colour change relies on the caller passing `hot` (`view.hot === id`). Ghost icon buttons on cards always use `ghostButton()` from the same file (`card` surface by default, `chrome` on 40px top bars): it wires hover, stops the press from propagating and handles the click; the caller only adds `stop()` and `tip()`.
- Elements that aren't buttons but light up the ghost way (tabs, detail rows, Review group tabs, the breadcrumb ›) take their fill from `tint(t, surface, on)`, exported from the same file.
- A ratio of a theme colour (hover fill, faint fill, focus ring, badge fill) always goes through `alpha(color, "12")` in `shared/color.js`: a theme colour can be `#rgb`, `#rrggbb` or `#rrggbbaa` with its own alpha, which is multiplied by the ratio; appending two digits directly yields a 5- or 10-digit colour the host rejects. `scripts/check.sh` blocks direct appending.
- Sizes: `default` 32, `sm` 28, `compact` 28 (font 12, radius 6), `xs` 24, `micro` 20 (font 11, radius 4), `tiny` 16 (radius 4); icon-only buttons are square, icons 16/16/14/14/12/12. `sm` buttons in sub-headers (the Files file header, the Review top bar) pass `iconSize: 14`, like T3's file and diff toolbars' `size-3.5`; the panel header and other 40 bars stay at 16.

Split controls (T3 OpenInPicker, ProjectScriptsControl, ThreadDetailsControl's primary + secondary) always use `split()` from the same file; mods don't draw their own border. T3 draws them two ways depending on where they sit, picked with `size`:

- `xs`: on a bar (T3 headers, an xs button group with `variant="outline"`). Height 24, one ring of `input` border and one full-height `input` middle line, present at rest, no fill (T3's `input/32` fill reads as a button block on chrome; the layout doesn't draw it: the fill would look like a selected tab); the half under the pointer gets the `surface` hover fill on its own, and while the menu is open the arrow half gets the on fill. The main half is 25 wide (left border included) when icon-only; with text pass `wide`, left 5, right 7, gap 4 (T3 xs's `px-[7px]` plus the svg's `-mx-0.5`); the arrow half is 24 wide (right border included), arrow 16. When the whole control is disabled the border drops to 0.64 too. Used for Open in on the Files file header and the Actions bar's ▶|⌄ (see [Files](specs/files.md#open-in)).
- `row`: in detail cards (T3 `isPanel`, `variant="ghost"`). One ghost group, the fill and middle line belong to the whole group, see [details](specs/details.md#splits).

Not drawn with `button()`: list rows, menu rows (`shared/menu-row.js`, below), tabs, segmented toggles (ToggleGroup), calendar cells, select triggers, an input's own stepper (`NumberInput`'s − +), inline links (Undo, underline on hover), text actions in the command palette footer (brighten only), hover controls on Inbox cards and rows (T3 row controls, no fill), the Update pill, the brand bar's Home.

## Menu rows

Every popup menu row uses `menuRow()` from `shared/menu-row.js`, like T3 `ui/menu.tsx`'s MenuItem:

- On open: menus and submenus opened by keyboard (Enter/Space on a button, →, a shortcut) light the first row; ones opened by pointer light nothing until the first arrow key or the pointer rests on a row. `shared/list.js` provides this: an in-page menu takes `openLit(keys)` on open; for a native popup the opener puts `litProp(keys)` in the props (`popup-menu.js`'s `openPopup`/`openBeside` take a `keys` argument and do it for you), and the popup takes `propsLit()` on start. A button's `opener`/`trigger` `onOpen(b)` with no press coordinates (`b` empty) means it was opened by key, so pass `!b`; commands and shortcuts pass `true`; context menus pass `false`. Pickers with a search box (Go to, New, the Review bar menus, the base picker) follow their own first-item rules and are not covered here.
- The `selected` fill shows only while the pointer rests on the row or the keyboard selects it; it goes out when the pointer leaves, and a late host leave doesn't put out the next row the pointer has already entered (`litOnHover` in `shared/list.js`). While a submenu is open (`open`) the parent row stays lit.
- Disabled: opacity 0.64 for the whole row (`DISABLED`), no lighting, no click; `hint` explains why with `tip()`, not the host's `.tooltip()`.
- Trailing hints use `menuHint`, dividers `menuRule`. Keys use `menuKeys` from `list.js`, scrolling `scrollList`, submenus `popup-menu.js`/`submenu.js`, each menu wiring them itself. When `label` isn't text (an element), the caller sets `accessibility_label` itself; roles that aren't button (settings Select options `list_box_option`, base's `radio_button`) are overridden by the caller.
- Inline close is the only exception, and only in the breadcrumb space menu: on a closable row lit by the pointer, `trail` becomes a `micro` ghost `×` (`ghostButton`, `x.svg`); a row lit by the keyboard keeps its original mark; pressing it goes through `t3-tabs.close-pane`'s confirmation, the menu stays open and the list updates, so several can be closed in a row. T3's menus have no such control, and other menus don't copy it.
- The sub-agent list also uses `menuRow`: each level indents 16, using `lead` for a `16 × level − 8` spacer (plus the row's gap of 8), and the status in `trail`. Review's base and Commits lists, Review settings' language/agent/model submenus and the settings Select options also use `menuRow`: the row goes out when the pointer leaves, like every other menu.

## Program icons

Program icons use Herdr's official assets directly, each component keeps T3's icon slot size, and `programIcon` in `shared/program.js` draws them all. The assets' canvas, inner padding, aspect ratio and colours are Herdr's to maintain, and the layout follows official asset updates. Custom icons from mods are also drawn on their own canvas.

## Deliberate differences

Kept on purpose; don't change them back to T3 (see [ADR 0002](../adr/0002-inbox-rules-stay-in-inbox.md) and [ADR 0004](../adr/0004-putting-away-lands-on-home.md)):

- A Lists terminal tab with a very short name is at least 96px, with a 16 slot at the end for the status mark, kept even with no status, so the width doesn't change with status; on hover the × covers the left icon as in T3, and the status mark isn't covered. The tool tabs on the right of Inbox show no status (ADR 0002), keep no end slot, and shrink to their content with no minimum width. Both tab bars' tabs are drawn by `shared/tab.js`.
- A confirm dialog's action button follows the Actions editor's Delete: `raised` fill, `ansi1` text, naming the action; bare footer. T3's solid red button is a pink block in light themes and doesn't fit the rest of the layout.
- Putting away the agent being viewed goes back to Home, not to the next card.
- `cmd-]` also walks folded groups under Lists.
- Structures T3 doesn't have, like the tab bar height and the work column frame, and Review's diff content area.
- Sidebar cards and slim rows have 8 horizontal padding; T3 has 10 (R3).
- Ghost buttons and segmented toggles don't change the pointer on hover, while T3's `Button` is always `cursor-pointer`: the rule is the pointer item under "Buttons".
- The content area of Files and Review (the part left of the navigation column) is always `background`, and the navigation column and page header are the panel's `chrome`: in T3 only code and diffs use `--code-background`, and the Markdown preview and images sit on `bg-background`; the layout puts Files' Markdown and images on `background` too, so the boundary between content area and tree doesn't change with the file type.
- Panel page edges are always 12 (R1): tree rows don't take Pierre's 16, the Markdown preview doesn't take T3's `px-6`, the Review file header doesn't take T3's left 8.
- The file tree has no fold arrows: the open and closed folder icons already show expansion, and a chevron would say the same thing twice; T3's Pierre tree uses chevrons. The Files and Review trees use the same row.
- Spaces rows are 1 apart, T3's folders 8: with many spaces it takes too much height.
- A sub-agent's Failed uses a `!` badge with a 15% `ansi1` fill, the same shape as Needs you with only the colour changed: both share one mark (`shared/status-mark.js`), and a 12px fill doesn't become a pink block.
- The loading mark is T3 `ui/spinner.tsx`'s `LoaderCircleIcon`, drawn still: T3 only spins it while visible, the host has no such switch, and a spinning svg makes the whole window redraw every frame. The working `CircleDashedIcon` is already still in T3.

## Not possible

- Glass effects (background blur) and popup scale animations.
- Letter spacing (`tracking-widest`): the kit has no letter-spacing API.
- The command palette's backdrop: New and Go to are popups, and as dialogs they couldn't stay pinned to the top. The top `offset` 96 approximates T3's `10vh`; the host only takes fixed values.
- Herdr's own `space.close` confirm dialog and worktree dialog: values are hard-coded, and mods can't reach them.
- Centred number input content: `NumberInput` doesn't accept it.
- The vertical scrollbar's size is set by the host.

Shell radii are possible: with `frame: "none"` the mod draws its own, already used for the 16-radius New, Go to, Actions editor, confirm dialogs and Custom snooze. The host shell of menu-type layers is already close to 8 and needs no custom drawing.

Confirm dialogs live in `t3-actions` under `actions: "confirm"`, because the host `confirm` can't change its radius; Inbox shipped on its own has no `t3-actions` and falls back to the host `confirm`.
