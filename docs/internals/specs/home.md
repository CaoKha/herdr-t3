# Home

The Home space and its default content (`t3-home`): geometry, identity and edge rules. The [RECIPE](../../../RECIPE.md) says what Home is for; decisions are ADRs [0004](../../adr/0004-putting-away-lands-on-home.md), [0005](../../adr/0005-home-is-a-hidden-space.md) and [0006](../../adr/0006-home-is-claimed-by-its-name.md). The optional wallpaper is in [wallpaper](wallpaper.md).

## Look

- One framed pane without a header (`home-main`, the same active-tab frame as `main`).
- Default content: centred Next agent (disabled when there is nowhere to go), Go to and New tab. At most 320 wide, 32 high, radius 8; 14px text on the left, keycaps on the right; no names or counts.
- 40 is added below the group so it sits centred against the whole window, top bar included.
- The tab row has no tabs, `+`, Actions, Review or panel toggle (`⌥⌘B` still opens the panel), and folds from 40 to 8, except when it must hold the hidden sidebar's controls, macOS window buttons or Windows window buttons. Leaving restores 40.
- When arriving from another space, Home's first frame already has its frame and its own panel state.

## Identity

- One local hidden space, shared across projects and machines, created on demand.
- Claimed only by its remembered id (`t3-tabs.home`), or by the strict local explicit name `Home\u200b`; never by plain `Home` or by its contents.
- When waiting for a newly created Home, use the same local explicit-name check. A remote namesake can appear first without being claimed.
- With another space showing, create Home and add its configured mod without changing focus. Leave the previous space visible until the mod pane exists, then set Home's frame and panel state before selecting the mod tab. Close the starter tab only if both tabs still belong to the local Home. For Terminal, select the starter tab itself.
- If a different project is showing when Home is ready, leave that project selected and finish preparing Home in the background.
- When no space is showing, Herdr shows the first space even with `focus: false`. Its starter terminal can appear until the mod tab is ready; `space.new` cannot take a mod.
- Hidden from Spaces, New, the Inbox filter, Go to and space navigation.
- Holds one selected mod (`t3-home` by default) or, for Terminal, a shell in the home folder.

## Putting away

- Settle, Snooze, the button, key, drag or sweep on the viewed agent go Home by default, leaving the next choice to the person.
- With After putting away: Next card, they walk the cards cyclically instead and fall back to Home when none remain.
- Closing a viewed agent's whole tab still lands Home, whatever the preference. Background actions move nothing.

## Edge rules

- No header split, zoom or close controls. Normal close keys protect its own last tab and pane. Herdr's own split keys and palette can still add panes, and those close normally.
- If its shell starts an agent, that space is released in place as an ordinary folder-named space, without moving the agent; the next Home creates a clean one.
- A busy non-agent shell stays, and Home gets a new tab beside it.
- A shell exit can remove Home; it is recreated when needed.
- `cmd-shift-h` or the brand bar's mark goes Home; pressing either there changes nothing. With the sidebar hidden there is no mark, as T3's. Herdr starts where it was left, not at Home.
- Next agent and `cmd-]` use the same target rule: read the selected sidebar's rows, even while it is hidden. On arrival at Home, start at the first row even if the sidebar still reports the previous view. Elsewhere, start at the first row if there is no view and stop if the viewed row is missing or last. The button is disabled without a target; execution reads the rows again.
