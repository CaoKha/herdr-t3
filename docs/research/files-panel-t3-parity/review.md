What this change does: Files follows the original T3 file tree, breadcrumbs and filtered search. It keeps this layout's tokens, read-only content and safe terminal insertion.

Review scope: the Files changes from `a9e2f769`, their shared tree/menu/navigation/panel callers, generated copies, tests, icon assets and both languages of docs. The expected load is one desktop user with thousands of expanded paths and at most three full space/file caches.

The review found and fixed three concrete leftovers before delivery:
- A pending compact-folder read could reopen a child after Collapse all. The blocked-read test first failed with one expanded path, then passed with zero after checking the shared expansion ticket after await.
- Search still had the old flat-picker submit/up/down handlers. Submitting could clear a hierarchical query and open an invisible cursor target. Those handlers were removed; the input now only handles Escape, while the tree owns navigation.
- Reopening a cached Markdown Preview in global Code mode drew a blank body because that cache had no Editor. The full-window Code replay caught it; a two-file mode-switch regression first failed, then passed after creating the missing native Editor on cache reuse.

Looks good. Ship. Checked local/remote command boundaries, stale async reads, directory surfaces, shared Review callers, clipboard safety, virtual row work, submenu keys, resize keys, native render/type checks and full-window screenshots. The separate source-renderer candidate failed large-file paint and is not shipped.

Not checked: real Herdr mouse/hover/drag/clipboard delivery, a real remote machine, or launching external editors. The user accepted the host Editor's gutter limitation.

Final user override: removed breadcrumb and tree-row tooltips, including truncated rows. The Open in split arrow keeps its accessibility label only. A failing behavior check preceded the removal; action-icon tooltips and disabled reasons stay unchanged.
