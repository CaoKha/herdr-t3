# With the sidebar hidden, the current mode keeps applying

A mod instance Herdr hides stays alive and its timers keep running; it just doesn't draw and doesn't receive `<mod>.<command>`. So the Inbox's computation is pulled out of `render()` and driven by a timer while hidden, keeping the order of an instance that has already started. Everyone who reads the `settled` tag still interprets it by the shared rules in `shared/tree.js`. Commands go through `shared`; key commands (Settle included) are handled independently by the always-shown `t3-tabs`, without depending on the Inbox instance.

## Consequences

The Inbox instance starts only after it is first shown: if the Inbox hasn't been shown yet in this run, its own row order isn't kept while hidden. The Settle shortcut is unaffected; Snooze ending on a failure or on a new round starting in front of you is also handled by `t3-tabs`. Woke after waking is cleared on being looked at only once the Inbox shows.
