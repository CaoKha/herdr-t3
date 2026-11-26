# Home is a hidden space

Home is one real space for the whole app, on this machine, shown in none of Spaces, the New menu or the Inbox's scope filter; `ctrl-1…9` and the space-switching keys are handled by `t3-tabs` instead and skip it, leaving the other spaces' numbers unchanged. Being a real place, focus leaves the agent and every jump can leave Home naturally. It is recognized only by the id in `shared("t3-tabs.home")`, not by what it holds. It holds just one thing: a mod (`t3-home` by default, changeable in settings) or a shell; no pane title bar, no split, no close. Home holds no agent: early on Home's panes could be arranged at will, and an agent started in Home's shell ended up occupying Home, after which back to Home, Settle and Snooze all landed on it and Home stopped being a quiet landing place. So as soon as an agent appears in Home's shell, that space turns into an ordinary space in place, and the next back to Home creates a new one. The jump logic lives in `t3-tabs` because the tab bar always shows, while the brand bar hides with the sidebar.

## Considered Options

- **A `stack` overlay page**: takes no space, but focus stays on the covered pane, so every key acting on the current pane and every jump path needs extra handling; missing one could change a terminal you can't see.

## Consequences

- It is visible when switching to another layout or running `herdr-app ls`; seen from another machine it is an ordinary remote space.
- To get a different Home, swap that mod or switch to a terminal (see [0009](0009-settings-hold-real-preferences.md)) instead of arranging things in Home. The settings page lists only mods whose `mod.json` has `"home": true`: most installed mods are sidebars, title bars and popups, and listing them all would make choosing impossible. Herdr's built-in split keys and command palette can't be blocked; panes added that way close normally, while Home's own last pane can't be closed with a shortcut.
- Back to Home always lands on Home's own tab. When an agent appears in Home, Home's identity changes and the agent stays put: the remembered id is cleared and the name set to empty, so Herdr names it after the directory. The first approach moved the agent to a space with the same directory (`terminal.park` first, then rewriting the `herdr.space`/`herdr.tab` tags), but it had to build a new tab for Home first, the card disappeared and reappeared, the screen jumped once, starting pi once flashed three times, and it took more code. Cost: it isn't merged into an existing space with the same directory, so each agent started in Home adds one space.
- Not prevented by blocking: there's no stopping someone typing `pi` in the shell; letting go is simpler than blocking and loses nothing.
- The default page has a frame, three centred buttons and no watermark: without the border Home looks like a piece of the window caved in; a house icon, the Herdr icon and a sheep silhouette all looked bad as watermarks.
