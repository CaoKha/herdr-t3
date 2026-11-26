# Buttons share one helper

Revises how rule 2 in [t3-tokens.md](../internals/t3-tokens.md) "Rules", "don't create a shared constants file", applies to buttons.

Buttons used to be drawn by each mod itself: text buttons in four places, icon buttons in about twenty; sizes were aligned with T3, colours and states weren't. The result was several ways of drawing the same state: hover had four backgrounds (`hover`, foreground 4%, 6%, 7%), disabled had 0.3, 0.5 and a changed background, `hover` was invisible on popups (on some themes it equals `popover`), and the wallpaper mod's primary button was filled with `accent` and nearly unreadable when disabled. For sizes, three places agreeing is enough; colours and states have too many combinations to hold by copying.

Buttons are now drawn by `button()` in `shared/button.js`, following T3 `ui/button.tsx`'s variant × size: `primary`, `outline`, `danger`, `ghost` (T3's ghost-muted), `plain` (T3's ghost), on the surfaces `chrome`, `card`, `row`, `tab`; the colour and state table is in t3-tokens.md "Buttons". `scripts/sync.sh` distributes the copies, like the other shared modules.

## Considered Options

- **Just write one state → token table and copy it everywhere**: cheapest, but the current state is exactly what drifted out of "each writing its own following a convention".
- **A full shadcn-style component library (buttons, inputs, select, toggle together)**: inputs and selects already use the host's `Input` and `Select`, and menus and lists are already in `shared/`; there's no comparable evidence of drift, so not for now.

## Consequences

- The helper handles only looks and `role`; clicks (or passing `act`), `hot` hover tracking, `stop()` and `tip()` are still added by the caller: keyboard stops and tooltips each have their own state (`focus.js`, `tip.js`), and not every view that draws a button needs them. Buttons that open a popup have `trigger()`, which wires these up.
- Rows, tabs, segmented switches, calendar cells, select triggers, button groups, input steppers, inline links and the hover controls on Inbox rows are not buttons and keep their own drawing (listed below the table). Buttons in sidebar rows use the `row` surface: like T3's row controls they only brighten, with no background.
