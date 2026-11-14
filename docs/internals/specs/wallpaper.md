# asciicn wallpaper Home

The optional Home mod `extras/mods/asciicn-wallpaper`: its controls, waits, framing and file rules. The [RECIPE](../../../RECIPE.md) says what it does. Files, caches, saving and deletion internals are in [storage](../storage.md)「壁纸草稿」; conversion traps in [layout implementation](../layout-implementation.md)「壁纸转换」. Shared sizes are in [t3-tokens](../t3-tokens.md).

## Pictures

- Built-ins: Lighthouse, Mountain dusk, Nebula, Ember, from [asciicn](https://asciicn.dev), MIT. Static, theme-coloured; no animation.
- Saved and previewed pictures take one path: glyphs composed into one image in theme colours (ANSI16 slots, opacity steps).
- Light themes draw pictures imported from images on paper (marks where the photo is dark). Studio and hand-made `.ans` files and built-ins keep their tones.
- Geometric glyphs keep their shapes; other characters become bars sized by darkness. So only the shape modes are offered (Dots, Braille, Blocks, Quadrants): their glyphs match asciicn's own `mapTones` cell for cell, while letter ramps (Classic, Dense) would need glyph outlines the tiles don't draw.
- Without a saved framing, a picture covers Home from the bottom with its subject anchored across; a narrower one fills the width. A smaller Home height counts only once stable for 250ms.

## Switcher

- 12 from Home's bottom-right corner. `chrome` background, radius 8, padding 4, gap 4. Buttons `xs` 24: `‹`, name, `›`, frame (crop icon), `+`. `‹ ›` and frame are `ghostButton`s (`chrome` surface) with a `tip()` card naming them; `+` is a `trigger()`.
- Name slot 160 wide; when Home is narrower than 304, Home's width minus 144. Truncated, centred, 12px `dim`. *Choosing…* and *Importing…* take the same slot.
- Only `‹ ›` grey out, when there is a single picture; no disabled placeholder slots.
- Shown only while the pointer is inside the bottom-right 368×104, a menu or file dialog is open, for 1.5s after Apply, or in keyboard mode. Opacity transitions over 150ms ease-out.
- The choice is shared; a new Home uses it.

## `+` menu

- This mod's own popup: 260 wide, 6 above `+`, right edges aligned; `popover` background, padding 4, 28px `menu-row.js` rows, icons image / file / external-link / folder.
- `+`'s tooltip second line: "Or drop an image or .ans on Home".
- Rows: Choose image…, Import Studio file (.ans)…, asciicn Studio (44 high, second line "Export .ans there, then drop it here" in 12px `dim`; opens `https://asciicn.dev/studio?source=image&charset=braille&color=truecolor`), Open wallpaper folder. Windows lists only the last two.
- A file dropped on Home does the same: first path only, `.ans` as a Studio file, anything else as an image. No drag-over highlight. The Downloads folder isn't watched.

## Framing card

T3's popover in the switcher's place: right 12, bottom 12, 300 wide (Home's width minus 24 when narrow), padding 16, gap 12, radius 8, `popover` background, `border` edge, shadow lg, 12px `muted` text.

Rows, each a fixed height:

| Row | Height | Content |
| --- | --- | --- |
| Name | 20 | 13px semibold `foreground`, truncated |
| Mode | 28 | images only: Dots (default), Braille, Blocks `░▒▓█`, Quadrants (Quads when Home is narrower than 324); arrows switch |
| Fill/Fit | 28 | segmented, flex · 8 · Reset `xs` 24 (rotate-ccw) |
| Zoom | 24 | − `xs` 24 · 8 · slider flex · 8 · + `xs` 24 · 4 · readout 40 wide, 12px `dim`, right-aligned |
| Footer | 28 | status slot flex (12px `dim`, errors `ansi1` truncated); Cancel `outline`, Apply `primary` at least 72, both `compact`; Delete a `compact` `danger` on the left for added pictures, as the Actions editor's, its box on the card's content edge (R1) |

- Expanded: 208 high, 168 without the mode row. Compact (while reading): name, then one progress line (14px spinner and 12px `dim` text) or a red reason up to 48 high, then the footer; for an unreadable file the footer is Close and Choose another…. The card is bottom-anchored, so the footer stays put between compact and expanded, and the card opens upward.
- Mode and Fill/Fit are T3 ToggleGroups: `raised` background, padding 2, gap 2, radius 8; equal-width `xs` segments of radius 6; mode segments padded 3. The segment being drawn carries a 12px spinner.
- The slider (T3 has none): 4 high track, radius 4, `border` with the chosen part `foreground`, 16px `foreground` knob; logarithmic. Disabled, the whole control is at 0.64.
- Zoom presets 100 / 125 / 150 / 200 / 250 / 300 / 400%.
- Reset and − + are `ghostButton`s (`card` surface).
- Pointer shapes follow [t3-tokens](../t3-tokens.md)「按钮」.

## Framing input

- Fill crops to cover; Fit shows all at 1×. Zoom is 100–400% of that base.
- − + and `-` `=` step through presets about Home's centre. A notched wheel (6 notches double) and ⌘/Ctrl-scroll (200px doubles) zoom about the pointer.
- Trackpad two-finger scroll and Shift-wheel pan; momentum after lift-off is ignored.
- Drag and arrows move 10px, with Shift 50px. `0` or Reset: 1×, subject in view, Fill/Fit kept.
- Enter applies, Esc cancels. Framing does no conversion and no file I/O.
- Framing is relative, so it survives restarts, theme changes, resizes and cache rebuilds.

## Modes

All modes come from one draft at Braille's sampling grid (columns × 2, rows × 4). A mode already drawn returns at once; one that fails reverts to the previous mode with its reason in the footer. Switching never rereads the source or saves.

## Waits

- Nothing shows for waits under 150ms; once shown, an indicator stays at least 300ms (`main.js` `track`).
- The last picture stays up until the next one has loaded, then the next replaces it whole in one frame, without fading in, so Home never blanks. How the mod knows it has loaded: [layout implementation](../layout-implementation.md)「壁纸转换」.
- **Compact card progress**: under the name, a 26 high block: the step name (12px `dim`, 16 high), 6 gap, a 4 high bar (track `border`, radius 4, `overflow_hidden`, progress `foreground`). Images have steps, so progress is determinate: the width follows the steps over 300ms ease-out, the last part linear to full within `FILL` (400ms). `.ans` has no steps: a segment 30% of the track sweeps back and forth with `loop("left")`, every 1600ms. Before the indicator shows, the block is an empty 26 so the card's height doesn't change. Texts: *Reading image…*, *Drawing Dots…*.
- **Mode switch**: the previous mode's picture stays at opacity 0.7 (150ms ease-out); the segment being drawn spins; the footer status reads a 12px spinner and "Drawing Braille…", then "Loading picture…" while it loads.
- **Apply**: only after 150ms does Apply read "Applying…" and the card's controls show disabled.
- **Switching pictures, theme or light/dark, after Apply**: with the switcher shown, a 12px spinner left of the name in its fixed slot, gap 6. With the switcher hidden, a 32 square `chrome` block, radius 8, 12 from the right and bottom (the switcher's end), with a 14px spinner, fading opposite to the switcher over 150ms.

## Apply, Cancel, Delete

- Apply waits for a drawing mode, saves the `.ans` reusing the preview's picture, then writes framing and selection. Failure keeps the draft with a retryable footer error and reuses only its own identical file.
- Pictures already there (built-ins too) frame without modes or conversion; Apply saves only the framing.
- Cancel keeps the previous choice. Late work never changes the choice.
- Delete (added pictures only) confirms by name, then removes the file, its cache and framing, stops its conversion or Apply, and selects the previous picture. Nothing comes back late. Originals are never changed.

## Files

- `.ans` files copied into `<appHome>/asciicn-wallpaper/` appear without preview, covering Home; edits redraw them.
- Unicode, leading-dash and hidden names work; `.ans`, `..ans`, `...ans` are refused.
- Updates keep user files outside the mod folder.

## Programs

- Pickers: `osascript` on macOS, `zenity` on Linux; Windows has no picker (drop a file, or copy `.ans` through Open wallpaper folder).
- Images to BMP: `sips` on macOS, ImageMagick (`convert`) on Linux; without either, import Studio `.ans`. Read back with base64.
- Photos come upright by EXIF orientation.
- `open` / `xdg-open` / `explorer` open Studio and the folder.
- Failed or empty imports say why; no automatic retry.
