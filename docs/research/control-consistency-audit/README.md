# Control consistency audit: triage

Three read-only audits of the controls added from `a9e2f769^` (2026-11-14): [files.md](files.md), [details.md](details.md), [sub-agents-and-shared.md](sub-agents-and-shared.md). Fixed in the commit that adds this file. The rest are listed below with the reason they weren't fixed.

## Fixed

- t3-chrome: `+` uses `pressed`/`justClosed` (files H2, shared H1). The docked `surface-empty` page doesn't take the keyboard (shared H2). The surface menu uses `menuJump` and `DISABLED`, its rows look like t3-menu's, Review doesn't flash "Checking repository…", and its rows have `cursor_pointer` (files M7; shared M3–M7). Panel head buttons use the default `chrome` surface (files M6). The page arrows are `xs` (shared L13). `panel-wide` shows `on` while wide (files M8, shared L14). The surface close button has a tip (shared L12). `surfaceAddPress` is cleared after use (files L13).
- Files: Try again on a read error (M1). A menu opened by keyboard sits under its button (M2). A toolbar menu returns focus to its stop or to the page, never the tree (M3). The search field is a stop (M4). Crumbs have `role("button")` (M5). Menu icons are `muted` with the `mx(-2)` inset on glyphs too, and the submenu chevron is 16/80%/`mr(-2)` (L1, L2). The dead "No file open" branch is removed (L10).
- Details: Open in uses `scrollList` capped at 420, with labelled rows (M3). Quick Review's range uses `measuredTooltip` (M4). A `row` split lights its hovered half on top of the group (M5). Host `.tooltip()` is replaced by `tip`/`tipMark` (M6). Choose what to show is anchored under its row (H2). The remaining rows have `cursor_pointer` (L7).
- t3-pane: the fold arrow has a tip (shared M8, partly). The sub-agent button is `on` while its list is open (shared M9).

## Not fixed

- files H1 (Files chevron/⌄ reopen): the menu's backdrop is drawn in the same view over the trigger, so the press never reaches the button. This differs from a native popup.
- details H1 (Quick Review canvas 736×500): `popover()`'s `on_mouse_down_out` already closes the menu on a press in the transparent area. Shrinking the canvas means moving Commits into its own popup, a larger change.
- shared M8, the rest: a 20px hit area and the folded count would change the fold-slot geometry the user approved (icon16 + 16 reserve).
- shared M10: the row label already carries the status on purpose (t3-pane check). A labelled button's children aren't read separately.
- files L3 (context row lit), L9 (empty folder blank, T3 draws nothing either).
- files L5, L6, L7, L8 and shared L11, L15: polish with no visible breakage. Pick up with the next Files/Review pass.
- Decided by the user and done in a follow-up commit: files L11 inactive surface tabs use `muted` (t3-tokens updated); details L9 check marks take the row's text colour (`pickMark` drops `accent`, which also changes the Review page); details L10 keeps the one-item Copy full path menu (docs updated); details L8 Review writes its scope label into `review.shown` and Details shows it.
