// The pictures in a Markdown body, as plain functions: where they are in the text, what each is kept under, what a download
// may be, and how big it is. TextView.markdown draws no images; github.js pairs GitHub's with their signed addresses.

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

/**
 * `md` cut into `{ text }` and `{ image: { alt, url, width?, height? } }` parts, in order: Markdown `![alt](url)` and HTML
 * `<img …>`. Code isn't looked into, fenced or inline, so `![` written as code stays text. Blank text parts go.
 */
export function splitBody(md) {
  const text = String(md ?? "");
  // The same text with every code span and fenced block blanked out, so a match's index is the original's.
  let masked = "", fence = null;
  for (const line of text.split(/(?<=\n)/)) {
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      masked += " ".repeat(line.length);
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !line.slice(line.indexOf(open[1]) + open[1].length).trim()) fence = null;
      continue;
    }
    if (open) { fence = open[1]; masked += " ".repeat(line.length); continue; }
    masked += line.replace(/(`+)(?:(?!\1)[\s\S])*?\1/g, (s) => " ".repeat(s.length));
  }
  const parts = [];
  let at = 0;
  for (const m of masked.matchAll(/!\[([^\]\n]*)\]\(\s*<?([^\s)>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)|<img\b[^>]*>/gi)) {
    const raw = text.slice(m.index, m.index + m[0].length);
    let image;
    if (raw.startsWith("!")) image = { alt: m[1], url: m[2] };
    else {
      const a = imgAttributes(raw);
      if (!a.src) continue;
      image = { alt: a.alt ?? "", url: a.src, width: size(a.width), height: size(a.height) };
    }
    if (m.index > at) parts.push({ text: text.slice(at, m.index) });
    parts.push({ image });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts.filter((p) => p.image || p.text.trim());
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
  if (!own.has(owner)) own.set(owner, splitBody(body).map((p) => p.image ? { image: { ...p.image, key: assetKey(p.image.url), src: p.image.url } } : p));
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
