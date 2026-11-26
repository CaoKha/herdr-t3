# Files and Review stay independent

The tab model and the close-releases rule are revised by [0017](0017-space-panel-surfaces.md): hiding/switching keeps it, closing Review drops its range and reading position per tab instance, and adding it again starts from the defaults.

Revises the two-way cross-page actions and the shared navigation column width in [0013](0013-space-panel-pages-share-one-frame.md), and the later approach of both pages sharing the line-wrap preference.

Files browses the current working directory; Review reads the changes in a selected range. The same path on the two pages doesn't necessarily mean the same content; locating across pages would also implicitly switch the review range, wait for the other page to load and convert repository paths. The two pages no longer send each other requests.

- Remove Open in Files / Open in Review from both pages' toolbars and context menus, along with the cross-page locate protocol in shared state.
- Clicking a page tab restores only that page's own file, expanded folders and reading position. Review's range, groups and diff position stay inside Review.
- Navigation column width and the long-line wrap preference are independent per page, saved in each mod's `localStorage`.
- Panel open state, page tabs and maximize still belong to each space's panel; the two pages keep reusing the implementation of the frame, tree rows, menus, empty states and theme styles.
- The two pages share the "reflow once the width has been stable for 300ms" algorithm, each holding its own width state. Review keeps the previous wrap column count; Files pins the Editor at the previous width and clips the overflow.
- The file trees share a directories-first, case-insensitive natural sort by name. Review normalizes each group's file order once when loading the review; the diff, line requests and previous/next file navigation keep that order; subgroups still come after the group's own files.
- Each page keeps full data only for the three most recently shown spaces. Older spaces keep lightweight reading settings and release file content, the Editor, diff lines and layout caches, reading them again when shown.
- Files reads only while both its page and its space are visible, and refreshes only with the window in front too; on showing it reads at once, then usually checks every 5s locally and every 10s remotely, slower for large repositories. Review keeps refreshing every 15s while visible and catching up when shown again, and analysis status is still reported lightly. While a page has no content yet, its first read doesn't wait for the window to come to the front: it reads as long as the page is shown, or it would stay loading forever. Both pages poll instead of using recursive directory watching: polling stops naturally when the page is hidden or the space is evicted, with no watcher release to manage per page and per space.

## Considered Options

- **A unified cross-page request protocol**: would reduce duplication, but would still need behaviour defined for the target range, deleted files, different repository roots and delayed requests. The user chose to drop the link between the two pages outright.
- **Merge the two pages' current file and file tree state**: the working directory and the review range hold different content, so an ordinary page switch would change the reading position.

## Consequences

- Viewing content on the other page now means switching pages by hand and picking the file on that page.
- Review can still be installed on its own, and Files still supports remote spaces; the reused implementation adds no runtime dependency between the two pages.
