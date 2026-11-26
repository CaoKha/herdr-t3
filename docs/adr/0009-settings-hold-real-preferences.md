# Settings hold only real preferences

The layout has its own settings page (opened by `t3-tabs.settings`, drawn by `t3-chrome`). The settings page holds only options where each of two approaches saves more attention for one kind of person and neither is better for everyone. No setting is added to keep an old behaviour, tweak looks or serve a one-off taste. This doesn't conflict with [0008](0008-change-behaviour-without-toggles.md): 0008 covers behaviour changes, with no toggle kept for the old behaviour; this one covers preferences that differ from person to person to begin with.

The two options taken in: after putting away the viewed agent, go back to Home or jump to the next card (people who pick their next step as needed want Home, people who clear the queue in a row want the next card); what Home holds: the default page, a terminal, or a mod that offers itself (the default page has just three buttons; some use Home as a standing shell, some want their own board). Once an agent starts in the terminal, that space is no longer Home, so choosing the terminal doesn't let Home get occupied (see [0005](0005-home-is-a-hidden-space.md)).

## Considered Options

- **Our own `<appHome>/herdr-t3/config.json`, like Flockbook**: editable by hand, but needs file reading and writing, concurrency retries, a bad-file warning and periodic rereads. Stored in `shared("t3.settings")`, all of that comes for free: persistent, every instance redraws at once on change, and `scripts/update.sh` doesn't touch it.
- **Written into the layout JSON (props, `focus.color` and so on)**: lost when an update overwrites the layout file; writing a personal layout with `layout.set` also clears the click state Herdr keeps (sidebar width, theme choice, current stack). So the focus border stays out of the settings page and is still edited by hand, until Herdr offers a command that writes only pane focus.
- **Always-shown pane title bars, a frame around a single pane, a bottom status bar, terminal padding, Snooze presets**: looks or one-off tastes, not opened one by one, per [0001](0001-trade-off-order.md).

## Consequences

- Settings are read fresh every time (`shared/layout-settings.js`, with defaults), with no cache and no migration.
- The looks copy Herdr's own Settings rather than T3: it sits next to Herdr's settings and should look like the same kind of thing.
- New options are first checked against this ADR; the left navigation stays even with a single section, so adding sections needs no change of structure.
- Sidebar shows (Inbox/Lists) on the Sidebar page is not a new preference and doesn't go into `t3.settings`: it reads and selects the layout's own `sidebar-lists` stack directly, the same state as `cmd-shift-l`; the settings page is just one more entry point to it.
