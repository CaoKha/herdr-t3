# Herdr T3 extras

English · [中文](extras.zh-CN.md)

Not part of the layout and not copied by an install; add them by hand if you want them.

## pulls.review

`extras/mods/pulls-review` and `extras/mods/review` add Review to the space panel, using [my pulls.review fork](https://github.com/JinJieBeWater/pulls.review/tree/multi-repo) (`jin.review`). Install both mods; `scripts/update.sh` adds the review render slot. In Herdr T3, + → Review or `cmd-shift-g` opens its unique closable tab; no extra Review bar is needed. An older toggle-only bar collapses to nothing. Switching retains the range, group, file and reading position; closing and re-adding resets to the default range. Pick Changes, Uncommitted, To push/To pull, Commits or Branches in its own toolbar, independently of Files. Its tree has reviewed boxes but no context menu. In Herdr's own layout the Review bar's counts still open the chosen diff. See [the guide](guide.md) for reading controls and resource limits.

Review follows your theme, including translucent checkbox colors in themes such as Graphite. The stuck file header keeps an opaque background so scrolling code cannot overlap its filename.

## Theme export for Pi

`extras/mods/t3-theme-export` is the Herdr half of [pi-herdr-theme](https://github.com/JinJieBeWater/pi-stuff/tree/main/packages/pi-herdr-theme), a Pi extension in [my Pi setup](https://github.com/JinJieBeWater/pi-stuff) that makes Pi's colors follow Herdr's. The mod has no UI: whenever the colors Herdr draws with change (a pick in Settings, a layout's theme, the system's light or dark mode, a built-in preset), it writes `{ "name", "colors" }` to `~/.cache/herdr-app-theme.json`; the extension watches that file and regenerates Pi's theme. Install both: copy the folder into `~/.config/herdr-app/mods/`, then ask your Herdr agent to add `{ "id": "theme-export", "type": "block", "size": { "px": 0 }, "content": { "mod": "t3-theme-export" } }` at the end of this layout's `work` column, once. Leave it shown: a hidden block never starts. It only runs in a layout that has it: switch to another and Pi keeps its colors, so add the block there too if you want Pi to follow. `scripts/update.sh` keeps that block when it updates this layout.

## asciicn wallpaper

A Home that is a still picture in [asciicn](https://asciicn.dev)'s style, in your theme's colours, so it changes with the theme, light or dark. It comes with four of asciicn's pictures (Lighthouse, Mountain dusk, Nebula, Ember), and takes your own images or `.ans` files.

Move the pointer to Home's bottom-right corner and a switcher shows there: `‹ ›` step through the pictures. `+` opens a card with **Choose image…** as the main action and **Import Studio file (.ans)…** for a picture already made in Studio.

Buttons keep their positions: long names and progress are clipped to the same name slot, and `×` stays visible but disabled on built-in pictures. Navigation wraps at either end; with only one picture it is disabled. During image preview the switcher stays in place with browsing actions disabled, below the preview card. Studio instructions, error messages, Applying… and deletion confirmation do not shift other buttons. The same layout is used in light and dark themes; where picking files is unavailable, those buttons stay greyed out and **Open folder** remains available.

**Choose image…** picks an image (PNG, JPG, HEIC and the like) and previews it across Home in **Dots** (halftone). **Import Studio file (.ans)…** previews its existing characters instead. Both let you frame the picture before saving: **Fill** covers Home and may crop; **Fit** shows the whole picture at 1× and may leave blank space. Drag the picture or use arrow keys (10px, Shift: 50px); Tab moves between the canvas, fit controls, zoom and actions. Zoom is 1–4× the selected fit; zooming Fit may crop. A focused zoom control also takes arrow keys in 0.1 steps. **Reset** recentres and returns to 1× without changing Fill/Fit. Unavailable actions stay greyed out in their slots, including Reset when already centred at 1×.

**Apply** saves one `.ans` wallpaper and its framing, then selects it; **Cancel** returns to your previous wallpaper without saving. The preview and saved picture use the same framing. New Homes, restarts, themes and window/sidebar resizing keep the relative fit, zoom and alignment; they do not freeze a screenshot of the old window. Dragging, zooming and arrow keys reuse a cached preview without reconverting or reading/writing files. At extreme zoom the preview may look softer than the saved vector drawing. Only the generated drawing is stored; your source image stays untouched. Saved wallpapers have no drag controls or post-save image editor.

If Apply cannot finish saving, it keeps the preview open and shows the error inside the card. Fix the reported problem and press **Apply** again: an unchanged draft reuses its own saved file if its contents still match, rather than saving a duplicate. A failed Apply does not change your selected wallpaper or its framing. An already-published `.ans` stays in your folder even if you then cancel.

For finer control (contrast, dithering, other characters), expand **Create in asciicn Studio…** and follow its three steps: 1. **Open asciicn Studio ↗**; 2. make your picture and save with the **.ans** button under it (it goes to Downloads); 3. return here and choose **Import Studio file (.ans)…**, frame it and Apply. Its Braille, blocks or other characters are kept, not converted to Dots. To delete an added wallpaper, press `×`, check its name in the confirmation, then confirm; cancelling leaves it alone. Confirming removes its saved framing and stops its conversion or pending Apply, even if reconversion temporarily removed its list entry; late jobs cannot bring it back.

What you add is kept in `~/.config/herdr-app/asciicn-wallpaper/` as `.ans` files: the auxiliary **Open folder** shows it. A file you copy there appears without an import preview and uses the old default framing; changing a file redraws it without discarding saved framing. Braille, blocks, quadrants and halftone dots keep their shapes; other ASCII characters become marks as big as they are dark, keeping shading rather than letter shapes. Colours become the nearest of your theme's. Built-ins and pictures without saved framing fill Home's height, showing more or less of their sides as Home changes width; narrower pictures fill its width and crop top/bottom evenly. A sideways phone photo uses a camera rotation tag: rotate it in Preview first.

Unicode names, names beginning with `-` and ordinary hidden files such as `.hidden.ans` are supported. External files named exactly `.ans`, `..ans` or `...ans` are rejected; rename them to a meaningful name first. Dense shade characters (`░`, `▒`, `▓`) can be imported too, without oversized generated tiles.

Install: copy `extras/mods/asciicn-wallpaper` into `~/.config/herdr-app/mods/`, then pick asciicn wallpaper under **Home shows** in this layout's settings. `scripts/update.sh` updates it, and leaves what you added alone. Image selection is available on macOS, and on Linux with `zenity` and ImageMagick installed; without ImageMagick, use **Import Studio file (.ans)…**. Where no file picker is available (including Windows), use **Open folder** to copy in `.ans` files. The built-in pictures are asciicn's, MIT (`LICENSE-asciicn`).

## Theme and settings

The layout sets no theme: yours stays. `extras/themes/` holds two light and dark pairs if you want them:

- `catppuccin-mocha` and `catppuccin-latte`: [Catppuccin](https://catppuccin.com)'s official palette, terminal colors as its spec gives them and the panels in Catppuccin's own surfaces (mantle behind, base for cards, surface0 for selection and borders), with blue as the accent.
- `t3-code-dark` and `t3-code-light`: the colors T3 Code's web app draws by default, a true black canvas with accent `#346bf1` and a `#fcfcfc` canvas with accent `#1b4ed8`, with the VS Code terminal palette T3 Code uses. Terminal text takes the chat's 90% foreground, so an agent's replies read like T3 Code's.

Copy the files you want into `~/.config/herdr-app/themes/` and pick one in Settings, or set a pair in `settings.json` so it follows the system's light and dark mode, for example `"theme": { "light": "catppuccin-latte", "dark": "catppuccin-mocha" }`. The preview's other settings:

```json
{
  "font": "Geist Mono",
  "ui_font": "Geist",
  "font_size": 12,
  "zoom": 1.1,
  "minimum_contrast": 3
}
```
