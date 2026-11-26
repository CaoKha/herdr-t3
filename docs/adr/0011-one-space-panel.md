# Review and Files live in the single space panel

The point that the open state is kept once and not per space is superseded by [0012](0012-each-space-keeps-its-panel.md).

[0007](0007-review-belongs-to-the-space.md) made Review belong to the space, but in practice it was a pane in some tab, so rules had to patch it up: jump there when it's already open in another tab, cards for both tabs and splits, closing or Settle going back to where you were before opening it, while switching to another tab of the same space hid it. Now Review and the new Files both go into the single space panel on the right of the window: full height, symmetric with the sidebar, fixed across tabs, with content following the current space. The two are the panel's two pages, one shown at a time; there is one panel, so one open state and one width, not kept per space.

The panel keeps the structure and ids of Herdr's built-in layout: a `panel-body` stack in the `panel` column, switched with `layout.select`, `layout.show` and `layout.hide`. The 40px panel header at the top is drawn by `t3-chrome` and lists the pages actually in the stack. Review is an extra that adds its own block to `panel-body` on install; without it there is only Files.

In the panel, content is on the left and navigation on the right: navigation against the window's outer edge, content against the tab area, symmetric with the left sidebar. Files has the file tree on the right and the file content on the left; Review's group sidebar and file list also move to the right of the diff, the opposite direction to the pulls.review web version.

An Inbox card stands for just one agent or one pane. Review is no longer a pane, so it has no card; its state (AI analysis running, analysed but not yet looked at) shows on the tab bar's Review bar and on the Review tab in the panel header.

## Considered Options

- **Review stays in tabs, plus a Files bar on the right**: two sets of placement rules, with all of Review's patch-up rules kept.
- **The panel below the tab bar (where Herdr's built-in layout puts it)**: looks like it belongs to the current tab, the opposite of "fixed across tabs".
- **Each space keeps its own panel open state** (how Herdr's built-in layout does it): the panel has only one position, so it would open and close as you switch spaces, and you'd have to guess whether it will be there.
- **Review keeps an Inbox card**: a card's unit is an agent or pane; putting space state in would break the one-to-one match between cards and places focus can go.

## Consequences

- One mod instance serves all spaces: Review and Files each keep their state per space id (Review's page, Files' expanded folders and selected file).
- Review's location now comes from the space's folder, no longer from the focused pane's cwd.
- Review's `Open in` (pane or tab) setting is removed.
- The panel defaults to the width of the tab area and can be dragged; when narrow, Review switches to page tabs and a unified diff by its existing rules. (Superseded by [0013](0013-space-panel-pages-share-one-frame.md): the two pages share one frame, and Review no longer changes shape with width.)
- The separately published herdr-pulls-review becomes a panel too: in Herdr's built-in layout, add the `review` block to its `panel-body`.
