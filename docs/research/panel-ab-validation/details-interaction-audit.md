# Details interaction audit

Latest user decision: **no Git operation section**. Details contains Workspace and a Quick Review entry. No branch switching, PR status, Commit/Push/Pull/Publish or write confirmations remain. The uncommitted Git modules, tests, icons and implementation reports were deleted, not kept as a spare implementation.

| Control | Required behaviour |
| --- | --- |
| Computer/path | T3 locked row; no hover or selector. Folder shows the path; right-click the row copies it. |
| Open in | Full installed T3 editor list. Choosing only remembers the shared preference; the main button opens it. Uninstalled target falls back to Finder; remote launch is disabled. |
| Actions | Existing global Actions, not project scripts. Empty means Add action; otherwise primary plus menu. Edit stays behind Details and only shows on hover/keyboard selection. |
| Quick Review | Reuse Review's scope, Commits and base menus, keys and styling from shared sources. Anchor the child menu to the Quick Review row; no second scope trigger. Keep base controls inside that menu. A pick opens/activates the unique Review tab with that range. No duplicated scope implementation. |
| Scope reads | Asynchronous, bounded cache; source changes and close invalidate late results. A dead native overlay cannot leave a reusable pending read. No Git commands run while Details renders. |
| Visibility | Four supported items and Reset. Hidden sections leave no gap; all hidden leaves Choose what to show. |
| Split arrows | Accessible labels only; no redundant tooltip. |

Geometry and colour remain in `docs/internals/t3-tokens.md`. Source ownership and cache lifetime remain in `docs/internals/storage.md`. The native zero-height regression and its fix are documented separately in [details-open-regression.md](details-open-regression.md).

Native screenshots, performance comparison and replay evidence for this revision belong in the final validation report. Real mouse clicks are not inferred from command/handler replays.
