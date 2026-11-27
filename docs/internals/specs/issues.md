# Issues

The space panel's Issues page (`t3-issues`, the `issues` slot of `panel-body`, always in the layout): where its issues come from, its header, list and detail, what it reads and writes and when. It is Pull requests' page in another provider's words: header, rows, folding sections, pictures, the write flow and the reading rules are [pulls](pulls.md)'s unless said here. Tabs and their lifecycle are in [space-panel](space-panel.md); shared sizes in [t3-tokens](../t3-tokens.md).

## Provider and key

- Linear when a key is found, else nothing until the person picks GitHub's issues ("Show GitHub issues"). While a key is found, the header's source menu (`Linear ▾` / `GitHub ▾`) switches between the two. The choice is kept for the next run (`issues.source`); Try Linear again, or Linear in the menu, takes it back.
- The key is looked for once, at the first read, in this order, each read from what a program prints and never passed to one: the macOS Keychain (`security find-generic-password -s linear-api-key -w`, macOS only), `LINEAR_API_KEY` in Herdr's own environment (`printenv`, as the JS runtime has no `process.env`), then a login shell's (`$SHELL -lic 'printf "\n%s" "$LINEAR_API_KEY"'`, `$SHELL` from `printenv`, its last line: startup files may print first). 5s each.
- It lives only in the view's memory: never drawn, logged, written, or in a program's arguments. Linear gets it as `Authorization: <key>`, no scheme, as Branch Issue's helper sent it.
- No key, or Linear answers 401/403 or an authentication error (then the key is dropped): the page says so, shows the Keychain command to store one (`security add-generic-password -a "$USER" -s linear-api-key -w`, which asks for it) and the shell-profile alternative, with Try again (looks again) and Show GitHub issues. On GitHub without a key, a `muted` bar says no key was found, with Try Linear again.

## Discovery

- In the tab's working folder on the space's machine: `git rev-parse --show-toplevel --abbrev-ref HEAD` and one `git config --get-regexp` of the remotes, tracking remotes and `branch.<name>.herdr-issue` bindings. The GitHub repository is found as Pull requests finds it (`github.js`); on Linear a folder without one still works.
- Linear's Branch: the branch's `herdr-issue` binding (comma-separated identifiers, as Branch Issue wrote it), then every `TEAM-123` in the branch name, case aside, 4 at most, asked in one filtered query; those Linear doesn't have are dropped. GitHub's Branch: the number at the start of the name or after a `/` (`123-…`, `feat/123-…`, as `gh issue develop` names them), read in full; a number that's a PR is no issue.
- One issue on Branch: its detail at once, no Back.

## Lists

- Header, Pull requests' one row: Branch and Mine with their counts (Mine `50+` past the first page), or Back in their place for an issue picked from a list; Mine's search field; while a Linear key is found, the source menu (the provider's name and a chevron, Linear and GitHub with a check on the current one); Refresh; and for the issue shown, on Linear its state (below), then `⋯` (Open in Linear / Open on GitHub, Copy link).
- Mine on Linear: assigned to the viewer, state type unstarted or started, 50 most recently updated. On GitHub: `repo:<repo> is:issue is:open assignee:@me sort:updated-desc`, 50.
- Search is sent to the provider 300ms after the last keystroke, never for an earlier one (any issue, not only the viewer's): Linear by title or description words, a bare number in any team, or an identifier; GitHub by its search words in the repository. Its results replace Mine's while the field has them; Escape empties it and Mine comes back. A query equal to the one in flight, or to the one shown, isn't sent again; each search takes a token, so a late answer to an older one doesn't land.
- An empty list is Pull requests' one centred `dim` line, naming the provider that answered: Branch `No Linear issue in this branch's name (<branch>). Name it like ABC-123-… or pick one in Mine.`, `No Linear issue <ids>.` (named but not in Linear), `No issue number in this branch's name (<branch>).` or `No issue #<n> in <repo>.` on GitHub, `HEAD is detached: no branch to read an issue from.`; Mine `No open issues assigned to you in Linear.` / `in <repo>.`, a search `No issues match "<q>" in Linear.` / `in <repo>.`
- Which provider answered, quietly: those lines, Refresh's tooltip (`Refresh Linear issues`, `Refresh GitHub issues in <repo>`), ⋯'s `Open in Linear` / `Open on GitHub`, the identifiers' form (`ENG-12`, `#12`), and on GitHub the `muted` no-key bar.
- Rows as Pull requests': the state icon in Linear's own state color (backlog and triage `circle-dashed`, unstarted `circle`, started `circle-dot`, completed `circle-check`, canceled `circle-x`; GitHub open `circle-dot` `ansi2`, closed `circle-check` `ansi5`, not planned `circle-x` `dim`), the title, a priority mark (urgent `circle-alert` `ansi1`, high/medium/low `signal-*` `muted`), the assignee's initials in an 18px `foreground` 7% circle; then, 12 `dim`, identifier, assignee, age.

## Detail

- The state, in the header on Linear: an `xs` ghost (`trigger.js`) with its icon, name (at most 120, truncated) and a 14px chevron, opening an `inline-menu.js` menu of the team's workflow states (triage, backlog, unstarted, started, completed, canceled, then Linear's position), the current one checked; greyed while a write is under way.
- Title line as Pull requests': the identifier right after the title. Then a 12 `dim` line of state, assignee (or Unassigned), priority, project (GitHub: milestone) and cycle, `·` apart; then labels as 20-high chips (radius 4, `foreground` 4%, a 6px dot of the label's color, 11px `muted`).
- Sections, folding as Pull requests' (heading, chevron, summary, kept in this copy's `sections.open`, all open untouched): Linked PRs (`n linked`), Description, Comments (`n comments`).
- Linked PRs: Linear's attachments that are GitHub PRs (any repository; other links aren't), GitHub's `closedByPullRequestsReferences`. A PR of the tab's own repository opens in Pull requests: `showPage("pulls")` then the `t3-pulls.open:<n>` command, which picks it there as a row would; any other opens in the browser.
- Comments: threads, each top-level comment with its replies 16 in, in Linear's order. On Linear, Reply under each thread and a new-comment box at the end, Pull requests' boxes and drafts (by issue id, and issue id and thread). GitHub's comments are read only here.
- Pictures as Pull requests' (`pictures.js`, `cache/t3-issues/`). A GitHub issue's are paired with `bodyHTML`. Linear's `uploads.linear.app` addresses need the key; fetch has no binary body in this runtime (`text()` and `json()` only) and the key must stay out of curl's arguments, so every Linear request carries `public-file-urls-expire-in: 600` and Linear answers with signed upload addresses that curl downloads as it does GitHub's.
- Fenced code in a description or comment, GitHub's or Linear's, as Pull requests' Code (`shared/code.js`): a coloured read-only code view each, made only while the page shows it and released once not drawn, hidden or closed; a `diff` or `patch` fence as Pull requests' diff rows, no editor.
- Comments past 100 are read 100 a page, 10 pages at most, then a `dim` note says the rest is in the browser.

## Writes (Linear only)

- State: `issueUpdate(id, { stateId })`, shown at once on the detail and every list row of that issue, put back if Linear refuses. Comment: `commentCreate({ issueId, body })`; reply: with `parentId`, the thread's first comment. Typed text only in the request's JSON variables.
- Pull requests' rules: one write at a time per space, every write control disabled meanwhile, never retried, a failure in the red bar (text sent: it may have gone through, refresh first) with the draft kept, a successful one reads the detail again, and a detail read that ends during a write is dropped.

## Reading

- As Pull requests': only while the page shows for the active space, on showing, on a space switch, on Refresh and every 60s with the window in front; a token per read, `token` (key, discovery, lists), `detailToken`, `searchToken`. Linear through `fetch` to `api.linear.app/graphql`; gh, git and curl as Pull requests'. Remote spaces: git there, Linear, gh and curl here.
