# The space panel's two pages share one frame

Two-way cross-page actions and the shared navigation column width are superseded by [0015](0015-panel-pages-stay-independent.md); the shared frame and the visual implementation stay.

Revises the point in [0011](0011-one-space-panel.md) that "when narrow, Review switches to page tabs and a unified diff by its existing rules", and the two-column approach of "Review's group sidebar and file list also move to the right of the diff".

Files and Review are two pages of the same space panel, but their headers, navigation columns, tree rows, menus and empty states were each written separately: Files' header is two column headers, one per column, Review's a single full-page header on chrome; Files has a standing tree column, while Review has no navigation column when narrow and two columns (group sidebar and file list) when wide; selection, row height, radius, font and control styles all differ. The whole page jumps on switching pages.

The two pages now share one frame, with the T3 Code `09a54f01` right panel (the Files and Diff surfaces in `RightPanelTabs`) as the only reference; pulls.review only decides the diff content itself. Where T3's two surfaces disagree (tree open by default, default width, tree header height), take the Files surface's approach.

- **Frame**: the panel header and `panel-body` are one continuous `chrome` surface, separated from the work area by divider lines; the content area (Files' file, Review's diff) is on `background`, while the navigation column and toolbar stay on `chrome`, like T3's right panel. Below the panel header each page has a standing full-width toolbar: "what you're looking at" on the left, page tools on the right, the navigation toggle at the far right; below it, content on the left and the navigation column on the right. Empty states keep the toolbar too.
- **Navigation column**: each page has only one column; the two pages share one width, the same border and column header; no breakpoint that changes shape with width. Review's groups merge into this column as the tree's top-level nodes. (Revised by [0014](0014-review-groups-filter-the-tree.md): groups are a row of page tabs below the toolbar, and the tree lists only the current group.)
- **Tree**: both pages use the same file tree row from `shared/`, specced like T3's Pierre compact tree. Selection means a single current file. Review's viewed checkbox sits at the start of the row, after the chevron and before the file icon.
- **Menus and cross-page**: file rows on both pages share one context menu, its items computed by the same function in `shared/`, sized like `t3-menu`; the panel draws it itself and doesn't open `t3-menu`'s overlay, because Herdr's built-in layout, where the separately published Review lives, has no `t3-menu`. Jumping across pages is a menu item, plus a symmetric icon button in the toolbar.
- **States**: loading, empty and error use one set of components.
- **Fonts**: UI text in the panel follows the layout font; the monospace font is only for diffs and code, taken from settings, with no hardcoded font name.

Current specs are in [space-panel](../internals/specs/space-panel.md), [files](../internals/specs/files.md) and [review](../internals/specs/review.md).

## Considered Options

- **Unify only tokens (colour, radius, font size), keeping each page's own structure**: cheapest, but header height, rules and navigation column still jump on switching pages; the root of the inconsistency is the structure.
- **Review keeps two columns (group sidebar + file list), and Files gets a column too**: two columns can't fit the content at the default width of 681; T3 has no two-column navigation.
- **The pulls.review website as the Review page's reference**: the two pages would then have two references, which is exactly where the current inconsistency comes from.

## Consequences

- Review's row of group cards when narrow, and its group sidebar and aside when wide, are removed; the settings Groups: Tabs / Sidebar (`groupNav`) and Files: Tree / List (`fileList`) are removed.
- Review's selection changes from "the several rows in view" to a single current file, following the file at the top of the viewport while scrolling.
- At the default width the navigation column takes 256, so Review's diff is narrower than now (about 425); the navigation column can be closed or the panel maximized.
- The groups' ring chart is removed; the group summary moves to the top of the diff area, showing only the current group's.
