# Putting away the viewed agent goes back to Home, not to the next card

This is a deliberate departure from T3 Code. Jumping to the next card automatically decides for you what to look at next; staying in place is wrong too, since Settle means "I don't want to look at this any more". So putting away the agent you're viewing (Settle, Snooze, drag, swipe) goes back to Home by default: working through cards in a row costs one more `cmd-]` press, in exchange for a fixed landing place. Putting away a background agent doesn't jump.

## Consequences

- Applies only while the sidebar has the Inbox selected (see [0002](0002-inbox-rules-stay-in-inbox.md)). Lists has no Settle; closing the viewed agent's tab goes back to the tab last seen in this space.

- The separately published `herdr-t3-inbox` doesn't pass the `home` prop and keeps jumping to the next card.
- People who clear cards in a row can pick Next card in settings (see [0009](0009-settings-hold-real-preferences.md)): jump to the next card, or back to Home when there is none. The `home` prop still only means "there is a Home to go to"; which behaviour is a preference in `t3.settings`. Closing a tab is unaffected by this setting and still goes back to Home: closing destroys, it doesn't mean done looking.
