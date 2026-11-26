# In Home, the right side is one continuous surface

Home used to sit in the framed `home-main` like any other tab: a `chrome`-coloured tab row on top (folded to 8 while the sidebar shows), with gaps and rounded corners all around. With a wallpaper as Home, the picture was framed in the middle with an empty strip on top, looking like two pieces put together. So when Home holds just one page or mod, everything right of the sidebar up to the top edge of the window is Home, and the wallpaper reaches the top.

How:

- **A separate layout branch.** `work`'s content becomes the stack `work-view`, with two branches: `work-away` (today's tab row, `work-body`, `work-bottom-inset`, used away from Home) and `work-home` (`home-row` plus `home-surface`). `home-surface` is the current tab, on a `background` colour, with no border, rounded corners or gaps; `t3-tabs` picks the branch. The reason is two limits of the layout: nodes can't overlap, so the picture can't be drawn under the tab row; and `padding` and `radius` can't change at runtime, because `layout.set` rewrites the layout file (ADR 0009, `docs/internals/storage.md`). The only way left is switching to another set of nodes written in advance.
- **The top row is fixed at 40 and draws its own slice of the picture.** `home-row` is `t3-tabs`' part `home`, `window_drag`, 40 high whether the sidebar shows or hides: in Home there's always somewhere to drag the window, Home doesn't jump when toggling the sidebar, and the `t3-home` button group stays centred on the whole window. Without a wallpaper it's `background` coloured; with one it draws the same picture at the same size, same `right`, `top` moved down by 40, then clipped to its own bounds, so the two pieces make one picture. With the sidebar hidden, the toggle and the Undo notice float on the picture, the notice in a rounded block on `chrome`.
- **The wallpaper tells the top row what it drew through `t3.homeShown`.** The top row only copies it, otherwise uses the `background` colour; the rules are in [storage](../internals/storage.md).
- **A terminal or split Home stays framed.** When Home is set to Terminal, or split into several panes, it still goes through `work-away` plus the framed `home-main`, as before: a terminal flush against the divider and the window edge looks bad, and split panes need gaps between them.

Costs:

- This key exists once for the whole machine, only the wallpaper instance the top row reads can write it, and a split Home doesn't draw the top row's slice.
- The two pieces of the picture are drawn by two mods, so where GPUI rounds differently the seam can be off by 1px; the composition can differ by about 8px from the framed one.
- Dragging or zooming the composition writes once per frame, and `setShared` makes every mod redraw.
- Herdr closes mods in branches not showing. In full-surface Home, the rest of the tab bar, Actions and the pane bar in `work-away` aren't loaded, so their commands don't work in Home; on leaving Home they init again, and measured widths are measured from scratch ([tab-bar](../internals/specs/tab-bar.md)).
- The branch switch and the top row's slice of the picture are both one frame late: both are written during rendering, and the layout and other mods catch up only on the next frame; the demo's background window only produces frames when capturing, so two captures in a row are needed.
- On Windows and Linux `home-row` draws its own window buttons; the demo runs only on macOS, so this is unverified.

## Considered Options

- **Make the tab row transparent and draw the picture under it**: rejected. Layout nodes can't overlap, and there are no Home pixels under the tab row.
- **Use `layout.set` in Home to remove `home-main`'s frame and gaps**: rejected. `layout.set` rewrites the layout file, wiping out the user's changes (ADR 0009).
- **Shrink the top row to 0 high in Home**: rejected. Then there's nowhere to drag the window in Home; with the sidebar hidden the toggle has nowhere to go, and Home jumps when toggling the sidebar.
- **The top row reads the wallpaper's settings and cache itself and computes the picture's position**: rejected. Framing, zoom, mode and image loading all live in the wallpaper; a copy would slowly drift from it. Only the wallpaper says what it drew, and the top row copies it.
- **Name the key `asciicn-wallpaper.shown`** (as written during design): rejected. `KEY` in `store.js` only holds `t3` and `t3-*` names; this is a layout key one mod writes for another to read.
- **A terminal or split Home fills the surface too**: rejected. Without padding, a terminal would sit flush against the sidebar divider; several panes need gaps, and gaps exist only in the framed branch.
