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
- Sections 12 apart, in this order: Stack, Checks, Reviewers, Description, Comments (last, so the new-comment box ends the page). Each heading is Clean up's shelf head at 28 high: its box on the column's edge, padding 6, radius 6, a 12px medium `dim` label (`muted` hovered or focused), Comments' count in `muted`, a 12px chevron (`chevron-down` open, `chevron-right` shut); a click, Enter or Space opens or shuts it. Shut, a summary right-aligned and truncated at its end: Checks `n/n passed` (`dim`), `n failing` (`ansi1`) or `n running` (`ansi3`); Reviewers `a/n approved`; Comments `n` and `, k unresolved` (`ansi3`); Stack `n layers`.
- Open or shut is kept per section, for every PR, in this copy's `localStorage` `sections.open` (only sections the person toggled). Untouched, all start open but Checks, which starts shut when every check passed or was skipped and opens when one is failing or running.
- Rows are 24 high (padding 6, radius 6, 12px). Stack (open PRs only, and only when stacked): top first, this PR lit as `chrome` on and medium, the trunk last in `dim`; a click opens that layer. Checks: failures, then pending, passed and skipped, by name; a click opens its details URL. Reviewers: login and state. Description: `TextView.markdown`, 13px, selectable, 6 in; empty says so.

## Comments

- Comments and review bodies by time (a review not yet submitted, or a plain comment review with no words, isn't shown), then review threads by their first comment. Each comment, 8 above: a 24 high line, 6 in, of the author (medium), a review's word (Approved `ansi2`, Changes requested `ansi1`, else `dim`), the age (`dim`) and a `micro` ghost link (`link`, 12) opening it on GitHub; its Markdown under it as Description's.
- A thread: a heading row (a section row with a 12px chevron, `path:line` in the terminal font, an outdated thread at its old line, and `Outdated` / `Resolved` in `dim`). Resolved or outdated starts shut, its row saying who opened it and how many comments; a click opens or shuts it, for this run. Open: the hunk's last 6 lines (12px terminal font, `muted` on `background`, padding 8, radius 6, 6 in), its comments, then `plain` `xs` text buttons 4 apart: Reply and Resolve when unresolved, Reopen when resolved, each only where GitHub's `viewerCanReply` / `viewerCanResolve` / `viewerCanUnresolve` say so. A thread resolved here stays open, Reopen where Resolve was.
- Reply opens a box under the thread; after the last item there is always one for a new comment. A box is a `Textarea` growing from 3 to 12 rows, padding 11 × 7, radius 8, 13px, an `input` outline, focused `accent` with Files' 3px ring on `background`; under it, right-aligned 8 apart, `outline` Cancel (a reply's only) and the `primary` action (Send, Comment), both `xs`. The action is disabled, its reason in a tooltip, while the text is blank or a write is under way, and reads `Sending…` while its own is.
- Drafts live in this copy's memory for this run, one per PR (new comment) and one per thread (reply), keyed by `owner/repo#n[:thread]`: a redraw, a refresh, moving to another PR or space and back, or Cancel keep them; only GitHub taking the text clears one. The new-comment box takes its PR's draft on the frame after the PR changes (a box's text can't be set in a draw), showing an empty frame meanwhile.
- Reading: one paged read beside the detail's own, each of comments (100), reviews (100) and threads (50, with their first 100 replies) on its own cursor; a part read to its end isn't asked again. At most 10 rounds, then a thread's later replies 100 at a time, at most 10 pages each; past either a `dim` note says the rest is on GitHub. If only the conversation fails, a note says so and the rest of the detail stands.

## Writes

- `gh` on this machine, remote spaces included. Reply: GraphQL `addPullRequestReviewThreadReply`; Resolve / Reopen: `resolveReviewThread` / `unresolveReviewThread`; a new comment: REST `POST repos/<repo>/issues/<n>/comments`. Typed text goes only as one raw `-f body=…` argument (no shell, never `-F`, which would read `@file`, numbers and `true`).
- One write at a time per space; while it's under way every write control is disabled. Resolve and Reopen show at once (each is the other's undo, so neither asks) and go back if GitHub refuses. Sending needs no confirmation: Send is the action.
- Writes never retry. A failure is the red bar with Dismiss: GitHub's words, and for text sent that it may have gone through and to refresh before sending again; the draft stays.
- A detail read that ends while a write is under way is dropped, and a successful write reads the detail again under a newer token, so an answer from before the write never lands over it.
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
