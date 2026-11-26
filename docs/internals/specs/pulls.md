# Pull requests

The space panel's Pull requests page (`t3-pulls`, the `pulls` slot of `panel-body`, always in the layout): its header, list and detail, what it reads and when, and the Review handoff. Tabs and their lifecycle are in [space-panel](space-panel.md); shared sizes in [t3-tokens](../t3-tokens.md). Files is the page it mirrors ([files](files.md)).

## Header

- `nav-column.js` `treeHead`, as Files' tree head: 32 high, 8 below, 12 horizontal, children 8 apart, so its centre is the pane header's.
- Branch and Repo: T3's segmented ToggleGroup as Custom snooze's: an `input` track, padding 2, gap 2, radius 8; segments 24 high, padding 10, radius 6, 12px medium, the shown one on `selected` in `foreground`, the other `dim`, brightening on hover. Each says its count in `dim` once read: Branch the branch's PRs, Repo the repository's open total (`totalCount`, also past the 100 loaded).
- Repo's list only: Files' search field (compact input, 28 high, 9 padding, radius 6, transparent until focused; Escape clears and leaves). It filters what's loaded: every word in the title or head branch, or a number (`12`, `#12`) that is the PR's own.
- Refresh at the end: `xs` ghost (24), `refresh-cw`.

## List

- Rows on the column's edge (12), padding 8 × 6, radius 6, the `chrome` hover fill (4%), 2 apart, the hand pointer; a tab stop each.
- Line one: the state icon (16, `git-pull-request` `ansi2`, `git-pull-request-draft` `dim`, `git-merge` `ansi5`, `git-pull-request-closed` `ansi1`), the title (13, truncated), the checks' rollup mark at the end (14: `circle-check` `ansi2`, `circle-x` `ansi1`, `circle-dashed` `ansi3`, `circle-minus` `dim`; none without checks). Line two, 12 `dim`: `#n`, `head → base` (truncated), the time since its last update.
- Branch: PRs whose head is the tab's branch, any state, at most 30, newest first, and only those whose head repository is one this clone's remotes name: a fork's same-named branch (every fork's `main`) is not this branch. Exactly one: its detail at once, with no Back. A detached HEAD says so.
- Repo: the 100 most recently updated open PRs (one GraphQL read for both tabs); past that a note says how many there are.

## Detail

- One scroll area, 12 in, 16 below. First an action row, 28 high: Back (`sm` ghost, `arrow-left`) only when picked from a list; then, at the end, **Review** (`xs` primary) and, 8 after, a group 4 apart of Open in pulls.review (`sm` ghost, pulls.review's own mark as an image, 14) and Open on GitHub (`sm`, `external-link`, 14).
- Title row 8 below: state icon (16), the title (14 medium, wrapping), `#n` (`dim`). Then 4 below, 12 `dim`: author · `head → base` · state and age.
- Stats 8 below, 12px, 12 apart: Checks passed/counted (skipped ones aside), Reviews approved/asked (latest approval or change request per person, a pending request over it), and for an open PR only Merge: Draft, Conflicts, Behind, Blocked, Checking (GitHub hasn't worked mergeability out yet), else Ready. Tones: danger `ansi1`, waiting `ansi3`, good `ansi2`, none `dim`; changes requested is danger.
- Sections 12 apart, each a 28 high 12px medium `dim` label over 24 high rows (padding 6, radius 6, 12px). Stack (open PRs only, and only when stacked): top first, this PR lit as `chrome` on and medium, the trunk last in `dim`; a click opens that layer. Checks: failures, then pending, passed and skipped, by name; a click opens its details URL. Reviewers: login and state. Description: `TextView.markdown`, 13px, selectable; empty says so.
- The stack is built from the Repo read, open same-repository PRs only (forks can't be a layer): a layer past the 100 most recently updated is missing.
- A row's data shows at once; the detail's own read fills the rest. A failed detail read is a bar with Retry over what was shown.

## Reading

- Only while the panel shows this page (`panelState()`: open, page `pulls`) for the active space: on showing, on a space switch, on Refresh, and every 60s with the window in front. A 1s timer notices showing, the folder moving and the minute passing; a hidden copy isn't drawn.
- Each space keeps its own state by id. Discovery runs in the tab's working folder (`terminal-context.js` `workFolder`) on the space's machine: `git rev-parse --show-toplevel --abbrev-ref HEAD` and one `git config --get-regexp` for every remote URL and branch tracking remote. The repository is `upstream`'s, else the branch's tracking remote's (not `.`), else `origin`'s; GitHub only, an ssh alias such as `github-work` included.
- gh runs on this machine with its login, remote spaces included, 26s at most; git 20s. gh missing or logged out is the whole page, with `gh auth login` and Try again; any other failure a bar with Retry over what was last read.
- Every read takes a token (`token` for discovery and lists, `detailToken` for a detail); an answer lands only if its token is still the space's latest and the state is still the space's. The folder moving bumps `token` at once, so a read for the old folder is dropped even before the next starts; what shows stays until the new read lands. Another repository or branch clears what was picked.

## Review handoff

- Disabled, with the reason in its tooltip: no `review` slot (the extra isn't installed), a space on another machine, no repository. Open in pulls.review has the same rules.
- Review: `git fetch --no-tags --quiet <remote> refs/pull/<n>/head`, then `refs/heads/<base>`, one after the other in the repository's root, each read back from `FETCH_HEAD`; no branch or ref is written. Then `openReview` with `/compare/<base sha>...<head sha>`, the three-dot range GitHub shows. While it fetches the button says Fetching… and is disabled; a failed fetch is a bar with Dismiss, and Review isn't asked.
- The remote is the one the repository came from (`upstream` in a fork's clone), where `refs/pull/*` lives.
- Open in pulls.review runs `jin.review -d owner/repo#n` in the repository's root: the fork's daemon registers the folder it starts in and opens the PR in the browser; without `-d` it would be a foreground server that never returns.
