# The Inbox's attention rules apply only in the Inbox

The Inbox is organized by attention and Lists by space; they are two equal ways of working. They share facts: names, pins, the meaning of the `settled` / `snoozed` tags (`shared/tree.js`), close confirmation, focus and zoom fixes, and Unpin's Undo. The Inbox's attention policies apply only while the sidebar has the Inbox selected; while the sidebar is hidden, they follow the selected mode:

- **Settle**: the button, dragging, `cmd-shift-s` and the breadcrumb title's menu (its Snooze is likewise Inbox-only). In Lists, the key does nothing.
- **Back to Home**: putting away or closing the viewed agent goes back to Home ([0004](0004-putting-away-lands-on-home.md)). In Lists, closing it works like closing any other tab: back to the tab last seen in this space.
- **Snooze hides working**: in Lists, tabs and Go to, a settled or snoozed agent only loses its done dot; working is still marked. Pane titles no longer show their own state or put-away mark (the state is already shown in the sidebar and tab bar).
- **Space filter**: only in the Inbox does an agent brought into view widen the filter. In Lists, switching agents doesn't change it.
- **Tab bar**: when the Inbox shows, the viewed agent is the lead: its breadcrumb on the left, and on the right only the other tabs of its family and tabs with no agent, without state marks ([0010](0010-inbox-tab-bar-follows-the-agent.md)); when Lists shows, all tabs show with marks. Next/previous tab and `cmd-1…9` follow the order of these tabs. Expanding a zoomed tab into its panes is shared and exists in both modes.

Snooze ends in two cases: a failure in the tree, or a new round starting in front of you. This is upkeep of shared facts, done by the always-shown `t3-tabs`, and applies in both modes. Clearing Woke once the agent is looked at after waking is still an Inbox-only rule.

## Considered Options

- **Same rules in both modes** (the previous version of this ADR): rejected. Lists can't see Settled and Snoozed, so there Settle, back to Home and showing working as idle all became side effects with no visible cause. Switching agents in Lists also silently cleared the Inbox's filter.
- **A Settled group in Lists too**: rejected, or Lists would become a second Inbox. Settled or snoozed rows stay in place, with no added button.

## Consequences

- How `cmd-]` / `cmd-[` treat folded groups depends on the organization. The Inbox walks only drawn rows; a folded Working is put away on purpose. Lists also walks folded groups, or else the Idle group, folded by default, would be a dead end once entered. Sub-agents don't count; those without a pane can only be opened in a popup.
- Clicking the pin in Lists still ends Snooze, because pinning writes the same tag and Lists can't see the Snooze state.
