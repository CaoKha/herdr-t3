// A Markdown body drawn with its pictures, for the panel pages that read GitHub or Linear: each picture downloaded once into
// the app home's cache, where image() can read, only while the page shows; the files go when the copy stops and a crash's
// are cleared at the next start (docs/internals/storage.md). Which address each picture downloads from is the caller's
// (images.js ownParts, github.js githubParts).
import { div, image } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { checking, exec, appHome } from "herdr";
import * as fs from "fs/promises";
import { stop } from "./focus.js";
import { imageExt, curlArgs, imageSize, drawnSize } from "./images.js";
import { codeView, fenceLanguage, fenceDiff, diffView, diffRowsOf } from "./code.js";
import { ui } from "./layout-settings.js";

const PICTURES_AT_ONCE = 3;

/**
 * The view's pictures, under `cache` (`cache/<mod>`): by asset key `{ status: "loading" | "done" | "failed", src, path?,
 * natural? }`, and those a draw asked for, fetched after it (fetchPictures). Only this run's. Call from init.
 */
export function initPictures(view, cx, cache) {
  view.pictures = { cache, images: new Map(), wanted: new Map(), fetching: 0 };
  if (!checking()) cx.spawn(async () => {
    await exec("rm", ["-rf", `${appHome()}/${cache}`]).catch(() => null);
    await fs.mkdir(`${appHome()}/${cache}`, { recursive: true }).catch(() => null);
  });
}

/** The copy's own picture files, gone; for its close(). */
export async function dropPictures(view) {
  const files = [...view.pictures.images.values()].filter((i) => i.path).map((i) => i.path);
  view.pictures.images.clear();
  await Promise.all(files.map((f) => fs.unlink(`${appHome()}/${f}`).catch(() => null)));
}

/**
 * After a draw: what it asked for, a few at a time, only while `shown` (the page in the open panel); else nothing is kept
 * asked. A picture is fetched when it's new, or failed and now has another address (a later read's new signature).
 */
export function fetchPictures(view, cx, shown) {
  const p = view.pictures;
  if (checking() || !shown) { p.wanted.clear(); return; }
  for (const [key, src] of p.wanted) {
    if (p.fetching >= PICTURES_AT_ONCE) break;
    p.wanted.delete(key);
    const was = p.images.get(key);
    if (was && (was.status !== "failed" || was.src === src)) continue;
    p.images.set(key, { status: "loading", src });
    p.fetching++;
    cx.spawn(async (cx) => {
      p.images.set(key, await download(p.cache, key, src));
      p.fetching--;
      cx.notify();
    });
  }
}

// curl writes `<key>.part`; only a picture's content type renames it to `<key>.<ext>`, anything else is deleted.
async function download(cache, key, src) {
  const part = `${appHome()}/${cache}/${key}.part`, failed = { status: "failed", src };
  try {
    const r = await exec("curl", curlArgs(src, part), { timeout: 40000 });
    const ext = r.code === 0 ? imageExt(r.stdout) : null;
    if (!ext) { await fs.unlink(part).catch(() => null); return failed; }
    const name = `${cache}/${key}.${ext}`;
    const moved = await exec("mv", ["-f", part, `${appHome()}/${name}`]);
    if (moved.code !== 0) { await fs.unlink(part).catch(() => null); return failed; }
    const bytes = await fs.readFile(`${appHome()}/${name}`);
    return { status: "done", src, path: name, natural: imageSize(bytes, ext) };
  } catch {
    await fs.unlink(part).catch(() => null);
    return failed;
  }
}

/**
 * A body's `parts` ({ text }, { code: { text, info } }, { image: { alt, url, src, key, width } } or { table }) as TextView.markdown
 * draws them, its code in code views (code.js; a diff in diff rows, made once per part), a table with pictures as a grid, and its pictures between the text: downloaded,
 * as wide as `column` at most, their shape kept; until then the alt text, quiet; failed or without an address (`src` null), the
 * alt and an Open image link. `open(url, cx)` opens the original in the browser.
 */
export function pictureBody(view, t, id, parts, { column, open }) {
  return v_flex().id(id).px(6).pt(4).gap(8).children(parts.map((part, i) => {
    if (part.code) return fenceDiff(part.code.info) ? diffView(view, t, `${id}-${i}`, diffRowsOf(part.code, part.code.text))
      : codeView(view, t, `${id}-${i}`, part.code.text, fenceLanguage(part.code.info), column);
    if (part.table) return pictureTable(view, t, `${id}-table-${i}`, part.table, column, open);
    if (!part.image) return TextView.markdown(`${id}-${i}`, part.text).selectable(true).scrollable(false).text_size(ui(13));
    return picture(view, t, `${id}-image-${i}`, part.image, column, open);
  }));
}

// Downloaded, as wide as `column` at most; until then its alt, and failed its alt and Open image.
function picture(view, t, pid, { alt, url, src, key, width }, column, open) {
  const p = view.pictures, got = p.images.get(key), label = alt || "Image";
  if (got?.status === "done") {
    const shown = drawnSize(got.natural, column, width);
    return stop(view, t, pid, div().id(pid).flex_none().cursor_pointer().role("button").accessibility_label(`Open ${label}`).on_click((_e, cx) => open(url, cx))
      .child(shown ? image(got.path).w(shown.w).h(shown.h) : image(got.path).max_w_full()), 4);
  }
  if (src) p.wanted.set(key, src);
  const failed = !src || got?.status === "failed" && got.src === src;
  return h_flex().id(pid).min_w(0).gap(8).items_center().text_size(ui(12)).text_color(t.dim)
    .child(div().min_w(0).truncate().child(label))
    .when(failed, (el) => el.child(stop(view, t, `${pid}-open`, div().id(`${pid}-open`).flex_none().cursor_pointer().text_color(t.muted).role("button")
      .accessibility_label(`Open ${label}`).hover((s) => s.text_color(t.foreground).underline()).on_click((_e, cx) => open(url, cx)).child("Open image"), 4)));
}

const CELL_PADDING = 6;

/**
 * A table with pictures as a grid `column` wide: its columns equal, 1px `border` lines, each cell 6 in, its text and pictures
 * 4 apart; the header row semibold. A picture shrinks to its cell.
 */
function pictureTable(view, t, tid, { header, rows }, column, open) {
  const cellWidth = Math.floor((column - 1) / header.length), inner = Math.max(1, cellWidth - 1 - 2 * CELL_PADDING);
  const row = (cells, r) => div().id(`${tid}-${r}`).flex().children(cells.map((parts, c) => {
    const cid = `${tid}-${r}-${c}`;
    return v_flex().id(cid).w(cellWidth).flex_none().min_w(0).p(CELL_PADDING).gap(4).border_r_1().border_b_1().border_color(t.border)
      .children(parts.map((part, k) => (part.image ? picture(view, t, `${cid}-image-${k}`, part.image, inner, open)
        : TextView.markdown(`${cid}-${k}`, part.text).selectable(true).scrollable(false).text_size(ui(13)).when(r === "h", (el) => el.font_semibold()))));
  }));
  return v_flex().id(tid).flex_none().border_t_1().border_l_1().border_color(t.border).child(row(header, "h")).children(rows.map(row));
}
