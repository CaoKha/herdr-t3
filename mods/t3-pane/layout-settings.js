// The layout's own settings (docs/adr/0009): one key in shared.json, written by t3-chrome's dialog and read where each acts,
// every time, so a change holds at once and an update never touches it.
import { props, run, settings, shared } from "herdr";
import { KEY } from "./store.js";

export const SETTINGS = KEY.settings;
// afterAway: where putting away the agent in view lands, "home" or "next" (card). homeMod: the mod Home is, by its folder's name; null, a terminal.
// textSize: the text size in px; null, Herdr's interface size.
const DEFAULTS = { afterAway: "home", homeMod: "t3-home", textSize: null };
export const t3Settings = () => ({ ...DEFAULTS, ...shared(SETTINGS) });

// T3's sizes are written at 13px text. Settings' Text size, else Herdr's ui_font_size, scales them (docs/internals/t3-tokens.md
// "Text size"); setShared redraws every mod, so a change shows at once.
const BASE_TEXT = 13;
export const textSize = () => Number(shared(SETTINGS)?.textSize) || Number(settings()?.ui_font_size) || BASE_TEXT;
/** `n` px, a text size or a height that fits text, at the person's text size: as written at 13, else whole px. */
export function ui(n) {
  const size = textSize();
  return size === BASE_TEXT ? n : Math.round((n * size) / BASE_TEXT);
}
export const zoom = () => Number(settings()?.zoom) || 1;
export const monoFont = () => settings()?.font_family ?? "JetBrains Mono";

// With props.block, sizes that block to `size`: layout.resize, which Herdr keeps with the layout's clicks.
// on_size_change reports zoomed pixels; a layout's are logical.
export function fitBlock(view, size) {
  // The window snaps a zoomed width to whole pixels: up to half a px over its logical width isn't more room needed.
  const id = props()?.block, px = Math.ceil(size.width / zoom() - 0.5);
  if (!id || px === view.fitted) return;
  view.fitted = px;
  run("layout.resize", { id, px });
}
