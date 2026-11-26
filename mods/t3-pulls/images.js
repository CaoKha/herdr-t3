// The pictures in a Markdown body, as plain functions: where they are in the text (and its fenced code, drawn apart), what each
// is kept under, what a download may be, and how big it is. TextView.markdown draws no images; github.js pairs GitHub's with their signed addresses.

// Larger than this isn't downloaded (curl --max-filesize).
export const IMAGE_MAX = 5 * 1024 * 1024;
// The content types drawn, by the file extension they're kept under.
export const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" };

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e) => ENTITIES[e]);

/** An `<img …>` tag's attributes, entities decoded: `{ src, alt, width, height, class }` as far as it has them. */
export function imgAttributes(tag) {
  const a = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) a[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  return a;
}

export const size = (v) => (/^\d+$/.test(String(v ?? "").trim()) ? Number(v) : undefined);

const IMAGE = /!\[([^\]\n]*)\]\(\s*<?([^\s)>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)|<img\b[^>]*>/gi;
const PIPE = /(?<!\\)\|/;

// A table row's cells as [start, end) of `line`, its leading and trailing pipe aside; an escaped pipe doesn't split, nor one
// in code (masked already).
function cellSpans(line) {
  let a = line.length - line.trimStart().length, b = line.trimEnd().length;
  if (line[a] === "|") a++;
  if (b > a && line[b - 1] === "|" && line[b - 2] !== "\\") b--;
  const spans = [];
  for (let i = a, s = a; i <= b; i++) if (i === b || line[i] === "|" && line[i - 1] !== "\\") { spans.push([s, i]); s = i + 1; }
  return spans;
}

// GFM tables of `text` (`masked` its copy with code blanked) holding a picture, as cuts: a header row, a delimiter row of as
// many `---` cells (`:` for alignment), and the rows up to a blank line. A row's missing cells are empty, extra ones go.
function pictureTables(text, masked) {
  const lines = [], found = [];
  let pos = 0;
  for (const l of masked.split(/(?<=\n)/)) { lines.push({ at: pos, end: pos + l.length, m: l.replace(/\r?\n$/, "") }); pos += l.length; }
  for (let i = 1; i < lines.length; i++) {
    const head = lines[i - 1], delim = lines[i];
    if (!PIPE.test(head.m) || !PIPE.test(delim.m)) continue;
    const marks = cellSpans(delim.m).map(([a, b]) => delim.m.slice(a, b).trim()), heads = cellSpans(head.m);
    if (heads.length !== marks.length || !marks.every((d) => /^:?-+:?$/.test(d))) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].m.trim()) j++;
    const at = head.at, end = lines[j - 1].end;
    if (masked.slice(at, end).search(IMAGE) >= 0) {
      const cells = (line, spans) => marks.map((_, c) => (spans[c] ? splitBody(text.slice(line.at + spans[c][0], line.at + spans[c][1]).trim()) : []));
      const align = marks.map((d) => (d.endsWith(":") ? (d.startsWith(":") ? "center" : "right") : d.startsWith(":") ? "left" : null));
      found.push({ at, end, part: { table: { header: cells(head, heads), align, rows: lines.slice(i + 1, j).map((l) => cells(l, cellSpans(l.m))) } } });
    }
    i = j;
  }
  return found;
}

/**
 * `md` cut into `{ text }`, `{ image: { alt, url, width?, height? } }`, `{ code: { text, info } }` and `{ table: { header,
 * align, rows } }` parts, in order: Markdown `![alt](url)`, HTML `<img …>`, fenced code (``` or ~~~, at any indent, so in a
 * list too; that indent off its lines; unclosed, to the end), and a GFM table holding a picture, each cell its own text and
 * image parts (a table without one stays in the text). Code isn't looked into, fenced or inline, so `![` or `|` written as
 * code stays code. Blank parts go.
 */
export function splitBody(md) {
  const text = String(md ?? "");
  // The same text with every code span and fenced block blanked out, so a match's index is the original's.
  const blocks = [];
  let masked = "", block = null, pos = 0;
  for (const line of text.split(/(?<=\n)/)) {
    const bare = line.replace(/\r?\n$/, ""), fence = /^( *)(`{3,}|~{3,})(.*)$/.exec(bare), start = pos;
    pos += line.length;
    if (block) {
      masked += " ".repeat(line.length);
      if (fence && fence[2][0] === block.fence[0] && fence[2].length >= block.fence.length && !fence[3].trim()) { block.end = pos; block = null; }
      else block.lines.push(bare.slice(Math.min(block.indent, /^ */.exec(bare)[0].length)));
      continue;
    }
    // A backtick fence's info has no backtick: ```a``` opening a line is inline code.
    if (fence && !(fence[2][0] === "`" && fence[3].includes("`"))) {
      blocks.push(block = { at: start, end: text.length, fence: fence[2], indent: fence[1].length, info: fence[3].trim(), lines: [] });
      masked += " ".repeat(line.length);
      continue;
    }
    masked += line.replace(/(`+)(?:(?!\1)[\s\S])*?\1/g, (s) => " ".repeat(s.length));
  }
  /** @type {{ at: number, end: number, part: object }[]} */
  const apart = [...blocks.map((b) => ({ at: b.at, end: b.end, part: { code: { text: b.lines.join("\n"), info: b.info } } })), ...pictureTables(text, masked)];
  const cuts = [...apart];
  for (const m of masked.matchAll(IMAGE)) {
    const end = m.index + m[0].length, raw = text.slice(m.index, end);
    if (apart.some((b) => m.index < b.end && end > b.at)) continue;
    if (raw.startsWith("!")) cuts.push({ at: m.index, end, part: { image: { alt: m[1], url: m[2] } } });
    else {
      const a = imgAttributes(raw);
      if (a.src) cuts.push({ at: m.index, end, part: { image: { alt: a.alt ?? "", url: a.src, width: size(a.width), height: size(a.height) } } });
    }
  }
  const parts = [];
  let at = 0;
  for (const c of cuts.sort((a, b) => a.at - b.at)) {
    if (c.at > at) parts.push({ text: text.slice(at, c.at) });
    parts.push(c.part);
    at = c.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts.filter((p) => p.image || p.table || (p.code ?? p).text.trim());
}

/** `parts` with each picture, a table cell's too, made `f(image)`, in document order: a table's header, then its rows, left to right. */
export function mapImages(parts, f) {
  const each = (ps) => ps.map((p) => (p.image ? { image: f(p.image) }
    : p.table ? { table: { ...p.table, header: p.table.header.map(each), rows: p.table.rows.map((r) => r.map(each)) } } : p));
  return each(parts);
}

/** Every picture of `parts`, a table cell's too, in document order. */
export function imagesOf(parts) {
  const all = [];
  mapImages(parts, (i) => (all.push(i), i));
  return all;
}

export const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * What a picture is kept under: an uploaded asset's id (the UUID in its URL, which the signed URL carries too), else a hash
 * of its address. A new read's new signature downloads nothing again.
 */
export function assetKey(url) {
  const id = UUID.exec(String(url ?? ""))?.[0];
  if (id) return id.toLowerCase();
  let h = 2166136261;
  for (const c of String(url ?? "")) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return `u${h.toString(16)}`;
}

const own = new WeakMap();
/** `owner`'s `body` (read once per object) in parts, each picture fetched from its own address, for a provider whose Markdown links download. */
export function ownParts(owner, body) {
  if (!own.has(owner)) own.set(owner, mapImages(splitBody(body), (i) => ({ ...i, key: assetKey(i.url), src: i.url })));
  return own.get(owner);
}

/** The extension a downloaded content type is kept under, or null when it isn't a picture this page draws. */
export const imageExt = (contentType) => IMAGE_TYPES[String(contentType ?? "").split(";")[0].trim().toLowerCase()] ?? null;

/** curl's arguments to download `src` to `to`: no shell, failing on an HTTP error, capped in size and time, printing the content type. */
export const curlArgs = (src, to) => ["-fsSL", "--proto", "=https", "--max-time", "30", "--max-filesize", String(IMAGE_MAX), "-o", to, "-w", "%{content_type}", src];

const be16 = (b, i) => (b[i] << 8) | b[i + 1];
const le16 = (b, i) => b[i] | (b[i + 1] << 8);
const be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le24 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

/** A picture's natural `{ w, h }` in pixels from its first bytes (an SVG from its width, height or viewBox), or null. */
export function imageSize(b, ext) {
  const ok = (w, h) => (w > 0 && h > 0 ? { w, h } : null);
  if (ext === "png" && b.length >= 24) return ok(be32(b, 16), be32(b, 20));
  if (ext === "gif" && b.length >= 10) return ok(le16(b, 6), le16(b, 8));
  if (ext === "jpg") {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return ok(be16(b, i + 7), be16(b, i + 5));
      i += 2 + be16(b, i + 2);
    }
    return null;
  }
  if (ext === "webp" && b.length >= 30) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === "VP8 ") return ok(le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff);
    if (chunk === "VP8L") return ok(1 + (((b[22] & 0x3f) << 8) | b[21]), 1 + (((b[24] & 0xf) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)));
    if (chunk === "VP8X") return ok(1 + le24(b, 24), 1 + le24(b, 27));
    return null;
  }
  if (ext === "svg") {
    const head = String.fromCharCode(...b.slice(0, 2048)), tag = /<svg\b[^>]*>/i.exec(head)?.[0] ?? "", a = imgAttributes(tag);
    const box = (a.viewbox ?? "").trim().split(/[\s,]+/).map(Number);
    return ok(parseFloat(a.width) || box[2], parseFloat(a.height) || box[3]);
  }
  return null;
}

/** How big a picture is drawn: as wide as the column allows, at most its natural width and any width its tag asks, its shape kept. */
export function drawnSize(natural, column, width = undefined) {
  if (!natural) return null;
  const w = Math.max(1, Math.floor(Math.min(natural.w, width ?? Infinity, column)));
  return { w, h: Math.max(1, Math.round((w * natural.h) / natural.w)) };
}
