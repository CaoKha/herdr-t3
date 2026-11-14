// Loads ascii-art.js and converts small asciicn-style frames: colours to theme tints, glyphs to shapes, the cell aspect.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const src = fs.readFileSync(path.join(__dirname, "ascii-art.js"), "utf8").replace(/^export (function\*?|const) /gm, "$1 ")
  + "\nglobalThis.art = { convert, picture, fromImage, tintOf, legacyTintOf, imageGrid, decodeBmp, imageAns, imagePlan: typeof imagePlan === 'function' ? imagePlan : null, sampleImage: typeof sampleImage === 'function' ? sampleImage : null };";
const context = vm.createContext({});
vm.runInContext(src, context);
const { convert, picture, fromImage, tintOf, legacyTintOf, imageGrid, decodeBmp, imageAns, imagePlan, sampleImage } = context.art;

// All of a conversion: the tiles and what it returns.
function run(text, aspect, paper) {
  const it = convert(text, aspect, paper), tiles = [];
  for (;;) {
    const step = it.next();
    if (step.done) return { tiles, ...step.value };
    if (step.value) tiles.push(step.value);
  }
}
const count = (svg, s) => svg.split(s).length - 1;
const E = (codes) => `\x1b[${codes}m`;

// New images use eight brightness steps and all sixteen nearest VGA slots, not the old hue buckets.
assert.deepEqual(JSON.parse(JSON.stringify(tintOf({ rgb: [255, 255, 255] }))), { tint: "ansi15", step: 7 });

// Truecolor Braille, as Studio's .ans export writes it: each set bit a dot, the cells text cells half as wide as tall.
{
  const r = run(`${E("38;2;255;0;0")}⠿⣿${E("0")}\n`);
  assert.equal(r.aspect, 0.5, "Braille sits in text cells");
  assert.deepEqual([r.width, r.height], [1, 1]);
  assert.equal(r.tiles.length, 1);
  const [t] = r.tiles;
  assert.deepEqual({ tint: t.tint, opacity: t.opacity }, { tint: "ansi1", opacity: 0.32 }, "dark red: red, a low step");
  assert.equal(count(t.svg, "h0"), 6 + 8, "⠿ has six dots, ⣿ eight");
  assert.match(t.svg, /stroke-width="0\.17"/, "radius 0.17 cell widths, at half a cell height wide");
}
// Halftone dots alone: asciicn's square dot cells; one size a path.
{
  const r = run("·•●\n●•·\n");
  assert.equal(r.aspect, 1);
  assert.deepEqual([r.width, r.height], [3, 2]);
  assert.equal(r.tiles[0].tint, "foreground", "no colour: the theme's foreground, at full");
  assert.equal(r.tiles[0].opacity, 1);
  assert.equal(count(r.tiles[0].svg, "<path"), 3);
}
// ANSI 16 colours are the theme's own; 256 colours by their rgb; a reset goes back to the foreground.
{
  const r = run(`${E("94")}█${E("38;5;196")}█${E("39")}█\n`);
  assert.deepEqual(r.tiles.map(t => t.tint).sort(), ["ansi1", "ansi12", "foreground"].sort());
  assert.ok(r.tiles.every(t => count(t.svg, 'fill="#000"') === 1), "blocks are filled rectangles");
  assert.deepEqual(plainTint([255, 255, 255]), { tint: "foreground", step: 3 });
}
function plainTint(rgb) { return JSON.parse(JSON.stringify(legacyTintOf({ rgb }))); }
// A background colour doesn't change the ink; CRLF lines and other escapes are no cells.
{
  const r = run(`${E("48;2;0;0;255")}${E("38;2;0;200;0")}▀\x1b[2K${E("48;5;4")}▄\r\n▌\r\n`);
  assert.deepEqual([r.width, r.height], [1, 2], "two columns at half a cell each, two rows");
  assert.deepEqual(r.tiles.map(t => t.tint), ["ansi10"], "green throughout, the background ignored");
  assert.equal(count(r.tiles[0].svg, "z"), 3, "▀ ▄ ▌: three rectangles");
}
// A custom ramp's other glyphs are upright bars as big as they're dark; spaces and the empty Braille cell draw nothing.
{
  const bar = (g) => { const s = run(`${g}\n`).tiles[0].svg; return [Number(s.match(/stroke-width="([\d.]+)"/)[1]), Number(s.match(/v([\d.]+)"/)[1])]; };
  const [at, colon] = [bar("@"), bar(":")];
  assert.ok(at[0] > colon[0] && at[1] > colon[1] && colon[0] > 0, "@ wider and taller than :");
  assert.ok(at[1] + at[0] > 0.6, "a dark one stands most of the cell's height: no rows of stripes");
  assert.deepEqual(run("  \u2800 \n").tiles, []);
}
// Dense supported shapes must fit the host's 1 MiB limit for each tile write.
{
  for (const glyph of ["░", "▒", "▓", "⣿", "▟", "╳", "@", "●"]) {
    const r = run(`${glyph.repeat(160)}\n`.repeat(80));
    assert.deepEqual([r.width, r.height], [glyph === "●" ? 160 : 80, 80], "tiling keeps the complete canvas");
    assert.ok(r.tiles.length > 0);
    for (const t of r.tiles) assert.ok(Buffer.byteLength(t.svg) <= 1024 * 1024, `${glyph}: ${Buffer.byteLength(t.svg)}-byte tile exceeds the native write limit`);
  }
}
// Tiles cut at 40 cell heights, the box in cell heights.
{
  const r = run(`${"●".repeat(170)}\n`);
  assert.deepEqual(r.tiles.map(t => [t.x0, t.x1]), [[0, 40], [40, 80], [80, 120], [120, 160], [160, 170]]);
  assert.equal(new Set(r.tiles.map(t => t.file)).size, 5, "a name each");
}
// An image without the Studio. A BMP as sips writes it (24-bit, top-down, rows padded to 4 bytes) or ImageMagick's
// bmp3 (bottom-up), here 32-bit too; pixels given top row first as [r, g, b].
const finish = (it) => { for (;;) { const s = it.next(); if (s.done) return s.value; } };
function bmp(rows, { bits = 24, topDown = true } = {}) {
  const h = rows.length, w = rows[0].length, step = bits / 8, stride = Math.ceil((bits * w) / 32) * 4, out = Buffer.alloc(54 + stride * h);
  out.write("BM"); out.writeUInt32LE(out.length, 2); out.writeUInt32LE(54, 10); out.writeUInt32LE(40, 14);
  out.writeInt32LE(w, 18); out.writeInt32LE(topDown ? -h : h, 22); out.writeUInt16LE(1, 26); out.writeUInt16LE(bits, 28);
  rows.forEach((row, y) => row.forEach(([r, g, b], x) => {
    const at = 54 + (topDown ? y : h - 1 - y) * stride + x * step;
    out[at] = b; out[at + 1] = g; out[at + 2] = r;
  }));
  return out.toString("base64").replace(/(.{76})/g, "$1\n");
}
{
  const px = [[[255, 0, 0], [0, 255, 0], [0, 0, 255]], [[1, 2, 3], [4, 5, 6], [7, 8, 9]]];
  for (const opts of [{}, { topDown: false }, { bits: 32 }, { bits: 32, topDown: false }]) {
    const encoded = bmp(px, opts), img = finish(decodeBmp(encoded));
    assert.deepEqual([img.width, img.height], [3, 2]);
    assert.deepEqual([...img.rgba.slice(0, 4), ...img.rgba.slice(20, 24)], [255, 0, 0, 255, 7, 8, 9, 255], `top row first, ${JSON.stringify(opts)}`);
    for (const size of [1, 7, 16]) {
      const chunks = encoded.match(new RegExp(`[\\s\\S]{1,${size}}`, "g"));
      const streamed = finish(decodeBmp(chunks));
      assert.deepEqual([...streamed.rgba], [...img.rgba], `chunked base64 preserves pixels across ${size}-character boundaries`);
    }
  }
  assert.throws(() => finish(decodeBmp(Buffer.from("GIF89a").toString("base64"))), /not a BMP/);
  const complete = bmp(px, { bits: 32 }), truncated = Buffer.from(complete, "base64").subarray(0, -1).toString("base64");
  assert.throws(() => finish(decodeBmp(truncated)), /incomplete BMP/, "truncated exec output must fail, not paint missing rows black");
  assert.throws(() => finish(decodeBmp([truncated.slice(0, 7), truncated.slice(7)])), /incomplete BMP/);
  for (const [offset, value] of [[18, 0x7fffffff], [18, -1], [18, 0], [22, 0], [10, 53], [10, 0x7fffffff], [14, 124]]) {
    const forged = Buffer.from(complete, "base64");
    forged.writeInt32LE(value, offset);
    assert.throws(() => finish(decodeBmp(forged.toString("base64"))), /incomplete BMP/, `invalid header ${offset}=${value} fails before allocating RGBA`);
  }
  assert.throws(() => finish(decodeBmp(Buffer.from(complete, "base64").subarray(0, 50).toString("base64"))), /incomplete BMP/);
  const pending = decodeBmp([complete, complete]);
  assert.equal(pending.next().done, false, "the decoder yields after cleaning a chunk, before image work");
  pending.return();
  // These one-row BMPs have the same padded byte length, hence identical base64 work. Only pixel work crosses 4096.
  const wide = [];
  for (const width of [4095, 4096]) {
    const encoded = bmp([Array.from({ length: width }, () => [17, 34, 51])]);
    const it = decodeBmp(encoded);
    let yields = 0, s;
    while (!(s = it.next()).done) yields++;
    assert.equal(s.value.rgba.length, width * 4);
    assert.deepEqual([...s.value.rgba.slice(-4)], [17, 34, 51, 255]);
    wide.push({ length: encoded.length, yields });
  }
  assert.equal(wide[0].length, wide[1].length, "padding keeps the base64 decoder work equal");
  assert.equal(wide[1].yields, wide[0].yields + 1, "RGBA conversion yields at 4096 pixels, even inside one wide row");
}
console.log("ok: BMP chunks preserve pixels; incomplete/forged headers fail before RGBA allocation.");
// The image generator emits website image-cell geometry, persisted in a non-drawing OSC header.
const MARK = "\x1b]777;asciicn-wallpaper;image-v3\x07", HEADER = /^\x1b\]777;asciicn-wallpaper;image-v\d[^\x07]*\x07/;
const markOf = (style) => `\x1b]777;asciicn-wallpaper;image-v4;${style}\x07`;
const plain = (text) => text.replace(HEADER, "").replace(/\x1b\[[0-9;]*m/g, "");
const pixelsOf = (rows) => finish(decodeBmp(bmp(rows)));
{
  const pixels = pixelsOf([[0, 32, 96, 160, 224, 255].map(v => [v, v, v])]);
  const text = finish(imageAns(pixels, "dots"));
  assert.ok(text.startsWith(markOf("dots")), "new image metadata, with its mode, stays in the saved .ans");
  assert.ok(text.includes(`${E("38;2;0;0;0")} `), "a blank opaque cell keeps its colour, so it can be inked on paper");
  assert.equal(run(text).aspect, 0.5, "new halftone images are half-width cells, including after reload");
  assert.equal(plain(text), " ·∙•⦁●\n", "website six-glyph dots ramp includes a blank level");
}
// Every mode starts from the same draft: the crop resized by the system to Braille's sample grid, the finest any mode takes.
assert.equal(typeof imagePlan, "function", "image import exposes the resize/crop plan");
{
  const plan = imagePlan(2756, 1654);
  assert.deepEqual([plan.columns, plan.rows, plan.width, plan.height], [320, 96, 640, 384], "the draft is the Braille sample grid");
  assert.deepEqual(JSON.parse(JSON.stringify(imageGrid(1000, 500, "dots"))), { columns: 384, rows: 96, width: 384, height: 96 });
  assert.deepEqual(JSON.parse(JSON.stringify(imageGrid(1000, 500, "quadrants"))), { columns: 384, rows: 96, width: 768, height: 192 });
  const source = pixelsOf([0, 1, 2, 3].map(() => [[255, 0, 0], [0, 0, 255]]));
  const smallPlan = { columns: 1, rows: 1, crop: { width: 2, height: 4 } };
  const dots = finish(sampleImage(source, "dots", smallPlan));
  assert.deepEqual([dots.width, dots.height, ...dots.rgba], [1, 1, 128, 0, 128, 255], "average a whole rectangular source region, half to even");
  const braille = finish(sampleImage(source, "braille", smallPlan));
  assert.deepEqual([...braille.rgba], [...source.rgba], "switching to Braille keeps the original pixels");
  assert.deepEqual([...source.rgba.slice(0, 8)], [255, 0, 0, 255, 0, 0, 255, 255], "sampling does not mutate the draft");
  source.rgba[3] = source.rgba[11] = source.rgba[19] = source.rgba[27] = 0;
  const transparent = finish(sampleImage(source, "dots", smallPlan));
  assert.deepEqual([...transparent.rgba], [0, 0, 255, 128], "transparent red contributes no hue to the opaque blue");
  assert.equal(transparent.tones[0], Math.fround(0.0722 * 0.5), "tone is unrounded average luma times coverage");
  const fractional = pixelsOf([0, 1].map(() => [0, 90, 180].map(v => [v, v, v])));
  const sampled = finish(sampleImage(fractional, "dots", { columns: 2, rows: 1, crop: { width: 3, height: 2 } }));
  assert.deepEqual([...sampled.rgba], [30, 30, 30, 255, 150, 150, 150, 255], "fractional canvas boundaries use area coverage, not nearest pixels");
  const largePlan = imagePlan(1024, 1024), large = { width: largePlan.width, height: largePlan.height, rgba: new Uint8ClampedArray(largePlan.width * largePlan.height * 4) };
  const pending = sampleImage(large, "dots", largePlan);
  assert.equal(pending.next().done, false, "expensive sampling yields before completion, so callers can cancel");
  pending.return();
}
console.log("ok: ascii-art converts legacy frames and website image frames.");

// Independent mapTones fixtures hash every glyph and visible cell's RGB, across the full 96-row image.
const oracle = require("./fixtures/image-v3-map-tones.json");
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function cellsOf(text) {
  const cells = [];
  let color = null;
  for (const token of text.replace(HEADER, "").matchAll(/\x1b\[([0-9;]*)m|([^\x1b\n])/gu)) {
    if (token[1] !== undefined) {
      const code = token[1].split(";").map(Number);
      color = code[0] === 38 ? code.slice(2) : null;
    } else cells.push([token[2], token[2] === " " ? null : color]);
  }
  return cells;
}
for (const { style, columns, rows, sha256 } of oracle.cases) {
  const [gx, gy] = { dots: [1, 1], blocks: [1, 1], quadrants: [2, 2], braille: [2, 4] }[style];
  const width = columns * gx, height = rows * gy, rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    rgba[i * 4] = Math.floor(255 * x / (width - 1));
    rgba[i * 4 + 1] = Math.floor(255 * y / (height - 1));
    rgba[i * 4 + 2] = (Math.floor(x * 8 / width) + Math.floor(y * 8 / height)) % 2 ? 220 : 20;
    rgba[i * 4 + 3] = x < width / 8 && y < height / 8 ? 0 : 255;
  }
  const text = finish(imageAns({ width, height, rgba }, style));
  assert.equal(cellsOf(text).length, columns * rows, `${style}: all cells, including blanks`);
  assert.equal(hash(cellsOf(text)), sha256, `${style}: every glyph and RGB matches upstream mapTones`);
}
for (const { rgb, ansi } of oracle.tints) assert.equal(tintOf({ rgb }).tint, `ansi${ansi}`, `${rgb}: nearest VGA in OKLab`);
for (let step = 0; step < 8; step++) {
  const v = 16 + step * 32;
  assert.equal(tintOf({ rgb: [v, 0, 0] }).step, step, "opacity uses value, not red's low luminance");
}
console.log("ok: four full image modes match upstream mapTones cell-for-cell; eight values and VGA16 match.");

// Captured before changing VERSION=2: rebuilding an old .ans keeps exactly the same tiles and geometry.
for (const [text, sha256] of [
  ["\x1b[38;2;255;0;0m⠿⣿\x1b[0m\n", "8a779473382673fce941935103e24f0821ff3daff336c34eec7ecb5e69f5dca4"],
  ["·•●\n●•·\n", "2016cad3b6651f36ed883ddace410e70fe23afc6ac55d2d32248e0678239fcf3"],
  ["\x1b[94m█\x1b[38;5;196m█\x1b[39m█\n", "ba38d61ab1be36b2755363d3f7219d7985b9b55d4ef98e4f07d821d8d21c7204"],
  ["\x1b[38;2;120;130;140m░▒▓█ ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█\n", "b3f7ce6f2e9a2facabdfcac2b6602a1543a9381f6abd6bcdde770251187e1f65"],
  ["\x1b[38;2;255;255;255m● \n  \n", "40f8e7880b866d873b64a9205794e2d24fa31b6adf24a491552359cc5848e863"],
  ["  ⠀ \n", "231d643a8292ee771b7535b636cc403cc75aa872d72c7527c4850228fc983dc4"],
]) assert.equal(hash(run(text)), sha256, "legacy conversion output is byte-for-byte unchanged");
{
  const bytesHash = value => crypto.createHash("sha256").update(value).digest("hex");
  const directory = path.join(__dirname, "scenes");
  const files = fs.readdirSync(directory, { recursive: true }).filter(f => fs.statSync(path.join(directory, f)).isFile()).sort();
  assert.equal(files.length, 263);
  assert.equal(bytesHash(files.map(f => f + "\0" + bytesHash(fs.readFileSync(path.join(directory, f)))).join("\n")),
    "f0825e83534e3aea2cabf0ad951aa4fd5e93dc06076e2da319e437526bab947e", "all builtin scene files are unchanged");
}
// Blank edges remain part of every mode's canvas, not a content bounding box.
for (const style of ["dots", "blocks", "quadrants", "braille"]) {
  const plan = { columns: 8, rows: 4, crop: { width: 16, height: 16 } };
  for (const value of [0, 255]) {
    const source = pixelsOf(Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => [value, value, value])));
    const text = finish(imageAns(finish(sampleImage(source, style, plan)), style)), r = run(text);
    assert.deepEqual([r.width, r.height, r.aspect], [4, 4, 0.5], `${style}: even blank images reload at the correct aspect`);
    assert.equal(cellsOf(text).length, 32);
    if (value === 0) assert.equal(r.tiles.length, 0);
    else assert.ok(r.tiles.every(t => t.tint === "ansi15" && t.opacity === 1));
  }
  const source = pixelsOf(Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => x < 8 && y < 8 ? [255, 255, 255] : [0, 0, 0])));
  const r = run(finish(imageAns(finish(sampleImage(source, style, plan)), style)));
  assert.deepEqual([r.tiles[0].x0, r.tiles[0].y0, r.tiles[0].x1, r.tiles[0].y1], [0, 0, 2, 2], `${style}: same source subject, same normalized position`);
}
for (const dimensions of [[0, 10], [10, 0], [Infinity, 10], [10, NaN], [-1, 10]]) assert.throws(() => imagePlan(...dimensions), /image dimensions/);
for (const style of ["", "other", "Braille", null, 1, {}, []]) assert.throws(() => finish(imageAns(pixelsOf([[[0, 0, 0]]]), style)), /image style/i);
{
  const pixels = pixelsOf(Array.from({ length: 2 }, (_, y) => Array.from({ length: 32 }, (_, x) => {
    const mask = Math.floor(x / 2), v = mask & (1 << (y * 2 + x % 2)) ? 255 : 0;
    return [v, v, v];
  })));
  assert.equal(plain(finish(imageAns(pixels, "quadrants"))), " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█\n", "all sixteen quadrant masks, in position order");
  pixels.tones = new Float32Array(pixels.width * pixels.height).fill(0.5);
  assert.equal(plain(finish(imageAns(pixels, "quadrants"))), "                \n", "packed threshold is strictly greater than 0.5");
  pixels.tones.fill(0.50000006);
  assert.equal(plain(finish(imageAns(pixels, "quadrants"))), "████████████████\n");
}
assert.equal(imageGrid(4000, 100).columns, 480);
assert.equal(imageGrid(100, 4000).columns, 16);
assert.equal(run("●\n", 0.75).width, 0.75, "builtins can still pass their known aspect");
console.log("ok: six legacy conversion hashes and all 263 builtin scene files are unchanged.");

// Light themes draw on paper: a new image's tones turn over (blank cells become full ones) and opacity follows darkness.
{
  const tilesOf = (text, paper) => run(text, undefined, paper).tiles;
  const solid = (rgb, style) => finish(imageAns(pixelsOf([[rgb]]), style));
  for (const style of ["dots", "blocks", "quadrants", "braille"]) {
    const [gx, gy] = { dots: [1, 1], blocks: [1, 1], quadrants: [2, 2], braille: [2, 4] }[style];
    const fill = (rgb) => finish(imageAns(pixelsOf(Array.from({ length: gy }, () => Array.from({ length: gx }, () => rgb))), style));
    assert.equal(tilesOf(fill([0, 0, 0]), false).length, 0, `${style}: black is blank in the dark`);
    const ink = tilesOf(fill([0, 0, 0]), true);
    assert.ok(ink.length && ink.every(t => t.tint === "ansi0" && t.opacity === 1), `${style}: black is full ink on paper`);
    assert.equal(tilesOf(fill([255, 255, 255]), true).length, 0, `${style}: white is blank on paper`);
    assert.equal(run(fill([0, 0, 0])).paper, true, `${style}: a new image says it can be drawn on paper`);
  }
  const one = (style, glyph) => `${markOf(style)}${E("38;2;128;128;128")}${glyph}\n`;
  const svgOf = (text, paper) => tilesOf(text, paper)[0].svg;
  assert.equal(count(svgOf(one("braille", "⠁"), true), "h0"), 7, "a Braille cell's dots complement on paper");
  assert.equal(count(svgOf(one("quadrants", "▘"), true), "z"), 3, "a quadrant cell complements on paper");
  assert.equal(svgOf(one("blocks", "░"), true), svgOf(one("blocks", "▓"), false), "a shade turns over on paper");
  assert.equal(svgOf(one("dots", "·"), true), svgOf(one("dots", "⦁"), false), "a dot size turns over on paper");
  assert.equal(tilesOf(one("dots", "·"), false)[0].opacity, 0.55, "grey 128 in the dark: eight value steps");
  assert.equal(tilesOf(one("dots", "·"), true)[0].opacity, 0.4, "grey 128 on paper: eight darkness steps");
  const clear = finish(imageAns({ width: 1, height: 1, rgba: new Uint8ClampedArray([0, 0, 0, 0]) }, "dots"));
  assert.equal(tilesOf(clear, true).length, 0, "transparent cells stay empty on paper");
  for (const text of ["\x1b[38;2;255;0;0m⠿⣿\x1b[0m\n", "·•●\n●•·\n", `${MARK}${E("38;2;9;9;9")}●\n`]) {
    assert.equal(hash(run(text, undefined, true)), hash(run(text)), "Studio, legacy and v3 frames draw the same on paper");
    assert.equal(run(text).paper, undefined, "and their result is unchanged");
  }
}
console.log("ok: new images turn over on paper; older frames draw unchanged.");

// One picture of every tile, each in its theme colour at its opacity, 4096px on the long edge; a new image says it is one.
{
  const { tiles, width, height } = run(`${E("38;2;255;255;255")}█${E("31")}▒\n`);
  const svg = picture(tiles, (tint) => ({ ansi15: "#fffffe", ansi1: "#cd3131", foreground: "#000000" })[tint], width, height);
  assert.match(svg, /^<svg [^>]*width="4096" height="4096" viewBox="0 0 1 1"/, "two half-width cells: a square");
  assert.equal(count(svg, "<svg"), 1, "the tiles are one picture");
  assert.match(svg, /stroke="#000000"[^>]*stroke-opacity="1"[^>]*fill-opacity="1"><path fill="#000000"/, "white truecolor: the ink colour, full");
  assert.match(svg, /stroke="#cd3131"[^>]*stroke-opacity="0.75"[^>]*fill-opacity="0.75"><path fill="#cd3131"/, "ANSI red at its step");
  assert.ok(!svg.includes("#000\""), "no tile keeps its placeholder ink");
  assert.ok(fromImage(finish(imageAns(pixelsOf([[[9, 9, 9]]]), "dots"))) && !fromImage("⣿\n"), "an image's frame is known by its header");
  console.log("ok: tiles become one theme-coloured picture.");
}
