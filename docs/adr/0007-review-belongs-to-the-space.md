# Review belongs to the space, one per space

> Review's placement (a pane in a tab, the card, jumping and going back to where you were) is superseded by [0011](0011-one-space-panel.md); the part about the Review bar still holds.

Agents and spaces are many-to-one: in the snapshot at decision time, none of the 9 spaces with agents spanned repositories, 4 had several agents, and up to 7 shared one worktree, so a diff can't be attributed to one agent. So each space gets one Review and one card, and both tabs and splits have cards; the entry point jumps to it when it's already open in another tab instead of opening a new one; closing or Settle goes back to where you were before opening it.

The Review bar is the current space's state and entry point, staying on the right of the tab bar in the same group as Actions; switching between commits is the job of the Review pane's own top bar. Counts are always shown, each segment is clickable, and they keep updating while agents work; no colour, because colour means agent state in this layout, and narrow windows use icons instead; the logo stays at the far right. Automatic analysis is triggered only by clicking a count to open it.

## Considered Options

- **Review as one step of an agent**: see the many-to-one above. This is also why the Review card is kept: it's the only space-level object in the Inbox.
- **A single `[Review ▾]` button**: users glance at the counts; tucked into a menu they can't be seen.

## Consequences

Remote spaces have no Review bar: jin.review's daemon listens only on this machine.
