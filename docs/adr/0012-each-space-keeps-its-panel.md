# Each space keeps its own panel

Supersedes the point in [0011](0011-one-space-panel.md) that "the panel has one open state, not kept per space". The panel is still the single column on the right of the window, fixed across tabs; but whether it's open, which page it shows and whether it's maximized are kept per space, like T3 keeps the right panel per thread (`isOpen`, `activeSurfaceId`, `maximized` in `rightPanelStore`). The width, as in T3, is one for the whole window. In a space with nothing recorded, the panel is closed.

Shortcuts follow T3 too: `cmd-alt-b` is `rightPanel.toggle`; with the keyboard in the panel, `cmd-w` closes the panel, matching T3's `rightPanel.close` when focus isn't in the terminal (superseded by [0017](0017-space-panel-surfaces.md): `cmd-w` closes the current surface tab, not the panel). T3's `diff.toggle` (`cmd-d`) only works when focus isn't in the terminal, while Herdr's focus is almost always in a terminal, so `cmd-d` stays Herdr's split right and Review uses `cmd-shift-g`. T3 has no key to open Files; this layout later gave Files `cmd-shift-e`, paired with Review's `cmd-shift-g`.

## Considered Options

- **One open state for the whole window (0011)**: a Review or Files opened in one space still covers the next space you switch to, where there may be nothing to look at. 0011 worried the panel would open and close on switching spaces and you'd have to guess; T3's approach shows that a panel restored along with what you're looking at needs no guessing.
- **`cmd-d` for Review**: would move Herdr's split right to another key, changing one of Herdr's basic operations.

## Consequences

- The state lives in the shared state `t3.panels`, keyed by space id. It is synced on draw by the `keys` floating block of the always-shown `t3-tabs`, which still shows while the panel is maximized. The panel header `t3-chrome` reads the state and sends page switch, maximize and close actions.
- Home is a space too: going back to Home shows the panel by Home's own record, closed by default.
- The separately published herdr-pulls-review is used in Herdr's built-in layout, where the built-in `tabs` keeps it per space, so it's unaffected.
