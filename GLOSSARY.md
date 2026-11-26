# Herdr T3

A layout for the Herdr App that lets you keep many agents open at once and look only at the few that need you.

## From Herdr

**Space**:
A Project opened on one machine, holding some tabs.
_Avoid_: workspace; don't call a Space a project

**Project** (a T3 Code concept):
A record of one folder on one machine. It outlives its Space; New can reopen it on the same machine and folder.
_Avoid_: bookmark

**Agent**:
A terminal program that reports its state (working, blocked, done, idle) to Herdr.
_Avoid_: thread (T3 Code's name), session

**Sub-agent**:
An agent started by another agent, listed under its parent.
_Avoid_: child, worker

**Top-level agent**:
An agent that is not a sub-agent.

**Program**:
A terminal program that doesn't report a state, such as lazygit or vite.
_Avoid_: tool, app

**Machine**:
A computer managed by `hc machine`: this one, or a remote one reached over ssh.
_Avoid_: host, server

## Sidebar

**Inbox**:
The sidebar organized by attention: agents that need you are cards at the top, the rest go into the shelf at the bottom.
_Avoid_: Focus (old name), notifications

**Lists**:
The sidebar organized by Space, made of two lists: Spaces and Agents.
_Avoid_: list mode

**Card**:
An entry at the top of the Inbox that stands for one agent (or for a mod pane that declares `inbox: true`).

**Shelf**:
The foldable groups at the bottom of the Inbox: Working, Snoozed, Settled.
_Avoid_: drawer, folder

**Pinned**:
The group of pinned agents, kept in the order you arranged; the Inbox and the Agents list share one set of pins.

## State

**Viewed agent**:
The agent in the focused pane.
_Avoid_: current agent, selected agent

**Unread done**:
An agent that is done but you haven't looked at yet, shown as a dot.

**Settle**:
You put away a finished agent; it comes back by itself as soon as it has new work.
_Avoid_: archive, dismiss, complete

**Snooze**:
Hide an agent that doesn't need you until a time you pick; when it's due it goes back to where it was, marked Woke.
_Avoid_: remind me later, mute

**Woke**:
The mark on an agent that just woke from Snooze and that you haven't looked at yet.

## Places and entry points

**Home**:
Where you land after putting away the viewed agent: a hidden space that belongs to no Project and holds just one thing (a mod or a shell), never an agent.
_Avoid_: dashboard, start page

**Settings** (layout settings):
The layout's own settings page, separate from Herdr's Settings; it only holds preferences that differ from person to person (see ADR 0009).
_Avoid_: preferences, config, T3 settings

**Go to**:
The jump panel opened by `cmd-p`, one row per pane.
_Avoid_: picker (the mod's name); Search is the Inbox's inline search

**Clean up**:
The clean-up dialog opened by the trash icon in the sidebar footer and by `cmd-shift-r`: settled top-level agents outside the current tab (**Settled**) and empty shells waiting at their prompt (**Idle shells**) sit in two separate folded blocks, closed by group, by row or all at once; each program still running in a space where no agent is at work any more (Left behind) is a card you can jump to or stop on its own; programs in a space where an agent is still working count as in use and stay out.
_Avoid_: Close idle, Clear, Running, Background (old names); recycle bin, Trash (closed terminals can't be restored)

**Action**:
A command in the Actions row of the details, run in a new tab or split.
_Avoid_: task, script

**Review**:
A space's content awaiting review, and the single closable Review tab that shows it; switching away keeps it, closing releases it.
_Avoid_: diff, changes, review pane

**Space panel**:
The single panel on the right of the window, made of file tabs, the generic Files tab and an optional single Review tab. Its content follows the space across terminal tabs; open state, maximize, tab list and current item are kept per space, the width once for the whole window. Hiding keeps it, closing releases it.
_Avoid_: side panel, panel bar

**Navigation column**:
The column to the right of the content in a space panel tab: a column header plus the file tree. Files and Review each keep their own width and open state.
_Avoid_: aside, sidebar, file bar

**Files**:
The shared read-only file tree and preview in the space panel; each file gets a tab, and the generic Files tab shows the full-width tree.
_Avoid_: file browser, file explorer
