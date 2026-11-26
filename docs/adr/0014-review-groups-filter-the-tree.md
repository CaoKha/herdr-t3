# Review's groups are a full-width row of page tabs

Revises the point in [0013](0013-space-panel-pages-share-one-frame.md) that "Review's groups merge into this column as the tree's top-level nodes", and "with no analysis result there is no group level".

Once groups merged into the tree, all groups' files were spread over one tree while the diff still showed only one group: the reading pattern "pick a group first, then read that group" was gone, and the groups' added/removed counts and viewed progress went away with the ring chart; without AI analysis, the groups the daemon makes by folder were merged into one list, with no groups at all. Users want back the pulls.review way of reading by group.

The navigation column is still one column, with width, column header and file tree unchanged from 0013. Below the toolbar, the group tabs that the old version used when narrow come back (`groupTabs` in `groups.js`), i.e. pulls.review's native DiffGroupNav: one row spanning the whole page, above the diff and the navigation column, one tab per group, with category icon, name, critical mark, added/removed counts, file count and viewed progress ring. Clicking a group makes both the diff and the tree show only that group; the tree keeps only the current group's folder, file and subgroup rows. Not shown when there is only one group. Rule-based groups are listed just like analysis results. Tabs no longer carry a caret for expanding subgroups: subgroups are in the tree.

Listing the groups in the navigation column above the tree (one 40px row per group) was tried first; after seeing it, users wanted the native single row of tabs back.

## Considered Options

- **Back to the old two columns (group sidebar + file list), with group tabs when narrow**: closest to the original, but 0013 already showed two columns don't fit at the default width of 681, and the later toolbar and state components are all built on the one-column structure.
- **Keep groups as the tree's top-level nodes, as an accordion (clicking a group expands only it)**: smallest change, but groups are still mixed with files in one tree, not a separate filter, and have no added/removed counts or progress.

## Consequences

- Group rows leave the file tree; subgroups are still rows in the tree, and clicking one scrolls to its group header.
- Tree paths: the current group's files and folders have no prefix; those in subgroups carry `group:<key>/`.
- `applyReview` no longer merges rule-based groups into a `plain` group.
- With many groups the tab row scrolls horizontally without wrapping; it takes about 60px above the diff and the navigation column.
