// The pictures in a Markdown body (images.js): where they are and its fenced code, what each is kept under, what a download may
// be, how big it is and how big it's drawn.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const c = vm.createContext({ Uint8Array, WeakMap });
vm.runInContext(fs.readFileSync(path.join(__dirname, "images.js"), "utf8").replace(/^export /gm, "")
  + "\nglobalThis.img = { splitBody, ownParts, mapImages, imagesOf, assetKey, imageExt, curlArgs, imageSize, drawnSize, IMAGE_MAX };", c);
const { img } = c;
const json = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b, message) => assert.deepEqual(json(a), json(b), message);
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w, h) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0]);
const ascii = (s) => [...s].map((ch) => ch.charCodeAt(0));

const parts = img.splitBody("Intro ![a](https://x/1.png \"t\") then <img width=\"300\" height=\"80\" alt='B &amp; C' src=\"https://x/2.png\" /> end\n"
  + "```md\n![not](https://x/3.png)\n```\nkept `![inline](https://x/4.png)` too\n~~~\n<img src=\"https://x/5.png\">\n~~~\n");
const kinds = (ps) => ps.map((p) => p.image ? ["image", p.image.alt, p.image.url, p.image.width ?? null, p.image.height ?? null]
  : p.code ? ["code", p.code.info, p.code.text] : ["text", p.text]);
same(kinds(parts), [["text", "Intro "], ["image", "a", "https://x/1.png", null, null], ["text", " then "], ["image", "B & C", "https://x/2.png", 300, 80],
  ["text", " end\n"], ["code", "md", "![not](https://x/3.png)"], ["text", "kept `![inline](https://x/4.png)` too\n"], ["code", "", '<img src="https://x/5.png">']],
"Markdown and HTML pictures among the text, fenced code apart; no picture inside code, fenced or inline");
same(img.splitBody("   \n"), [], "nothing to draw");

// Fenced code: in a list (its indent off), a longer fence holding a shorter, one fence kind holding the other, unclosed, CRLF.
same(kinds(img.splitBody("1. Install:\n   ```sh\n   npm i\n     --save\n   ```\n2. Run\n")),
  [["text", "1. Install:\n"], ["code", "sh", "npm i\n  --save"], ["text", "2. Run\n"]], "a fence inside a list");
same(kinds(img.splitBody("````md\n```ts\nx\n```\n````\n~~~rust,ignore\nlet s = \"```\";\n```\n~~~\n")),
  [["code", "md", "```ts\nx\n```"], ["code", "rust,ignore", "let s = \"```\";\n```"]], "closed only by its own kind, at least as long");
same(kinds(img.splitBody("```js const x``` is inline, and so is `` ``` ``\n![a](u)\n")),
  [["text", "```js const x``` is inline, and so is `` ``` ``\n"], ["image", "a", "u", null, null]], "backticks in the text open no fence");
same(kinds(img.splitBody("Run\r\n```ts\r\nlet a\r\n```\r\nthen\n```py\nprint(1)\n")), [["text", "Run\r\n"], ["code", "ts", "let a"], ["text", "then\n"], ["code", "py", "print(1)"]],
  "CRLF lines, and an unclosed fence runs to the end");
same(img.splitBody("```\n  \n```\n"), [], "a blank block draws nothing");

// GFM tables: one with a picture is a grid of cells, each its own parts; one without stays in the text.
const cell = (ps) => kinds(ps);
const grid = (p) => p.table && { header: p.table.header.map(cell), align: p.table.align, rows: p.table.rows.map((r) => r.map(cell)) };
const shots = "## Screenshots\n\n| With code, en | With code, es | With code, pt |\n| --- | --- | --- |\n"
  + "| ![en](https://x/1.png) | ![es](https://x/2.png) | ![pt](https://x/3.png) |\n\n| Without | Mobile |\n|:--|--:|\n| ![a](https://x/4.png) | <img width=\"200\" alt=\"b\" src=\"https://x/5.png\"> |\n\nAfter\n";
const twice = img.splitBody(shots);
same(twice.map((p) => (p.table ? "table" : kinds([p])[0][0])), ["text", "table", "table", "text"], "two tables, the text between and around them apart");
same(grid(twice[1]), { header: [[["text", "With code, en"]], [["text", "With code, es"]], [["text", "With code, pt"]]], align: [null, null, null],
  rows: [[[["image", "en", "https://x/1.png", null, null]], [["image", "es", "https://x/2.png", null, null]], [["image", "pt", "https://x/3.png", null, null]]]] }, "#3780's table");
same(grid(twice[2]), { header: [[["text", "Without"]], [["text", "Mobile"]]], align: ["left", "right"],
  rows: [[[["image", "a", "https://x/4.png", null, null]], [["image", "b", "https://x/5.png", 200, null]]]] }, "an alignment row, an HTML picture in a cell");
same(kinds(twice).filter((k) => k[0] === "image"), [], "a table's pictures are only in its cells");
same(img.imagesOf(twice).map((i) => i.alt), ["en", "es", "pt", "a", "b"], "pictures in document order, row by row, for pairing with bodyHTML");
same(img.imagesOf(img.mapImages(twice, (i) => ({ ...i, alt: i.alt.toUpperCase() }))).map((i) => i.alt), ["EN", "ES", "PT", "A", "B"], "each picture made once, in its cell");

const pipes = grid(img.splitBody("a \\| b | `x | y` | c\n-|:-:|-\n![p](u) text | `q|r` \\| s | ![t](v) | extra\nshort\n")[0]);
same(pipes, { header: [[["text", "a \\| b"]], [["text", "`x | y`"]], [["text", "c"]]], align: [null, "center", null],
  rows: [[[["image", "p", "u", null, null], ["text", " text"]], [["text", "`q|r` \\| s"]], [["image", "t", "v", null, null]]], [[["text", "short"]], [], []]] },
"no outer pipes; an escaped pipe and one in code don't split; extra cells go, missing ones are empty");
same(kinds(img.splitBody("| a | b |\n| - | - |\n| `![x](y)` | 1 |\n")), [["text", "| a | b |\n| - | - |\n| `![x](y)` | 1 |\n"]], "a table without a picture stays text");
same(kinds(img.splitBody("| a | b |\n| - |\n| ![x](y) | 1 |\n")).map((k) => k[0]), ["text", "image", "text"], "a delimiter row of another width isn't a table");
same(kinds(img.splitBody("```\n| a | b |\n| - | - |\n| ![x](y) | 1 |\n```\n")).map((k) => k[0]), ["code"], "a table in fenced code stays code");

const id1 = "c523b8b3-e7f2-4520-bb42-8a68ab28c022";
const signed = (id, jwt = "A") => `https://private-user-images.githubusercontent.com/1/9-${id}.png?jwt=${jwt}&x=1`;
same(img.assetKey(signed(id1, "B")), img.assetKey(`https://github.com/user-attachments/assets/${id1.toUpperCase()}`), "kept by asset id, whatever the signature");
assert.equal(img.assetKey("https://example.com/a.png"), img.assetKey("https://example.com/a.png"));
assert.notEqual(img.assetKey("https://example.com/a.png"), img.assetKey("https://example.com/b.png"));
const owner = {}, own = img.ownParts(owner, "![a](https://x/1.png)");
same(own.filter((p) => p.image).map((p) => [p.image.src, p.image.key]), [["https://x/1.png", img.assetKey("https://x/1.png")]], "a provider's own address is the one to download");
assert.equal(img.ownParts(owner, "changed"), own, "one parse per object");
same(["image/png", "image/jpeg; charset=binary", "IMAGE/GIF", "image/webp", "image/svg+xml", "text/html; charset=utf-8", "image/bmp", "", undefined].map(img.imageExt),
  ["png", "jpg", "gif", "webp", "svg", null, null, null, null], "only the kinds the pages draw");
same(img.curlArgs("https://s/x?jwt=A&x=1", "/h/cache/t3-pulls/k.part"),
  ["-fsSL", "--proto", "=https", "--max-time", "30", "--max-filesize", String(img.IMAGE_MAX), "-o", "/h/cache/t3-pulls/k.part", "-w", "%{content_type}", "https://s/x?jwt=A&x=1"]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0x90, 0, 0, 0, 0]);
const webp = Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8X"), 10, 0, 0, 0, 0, 0, 0, 0, 0x7f, 0x02, 0x00, 0xc7, 0x00, 0x00]);
same([img.imageSize(png(1600, 900), "png"), img.imageSize(Uint8Array.from([...ascii("GIF89a"), 10, 0, 20, 0]), "gif"), img.imageSize(jpeg, "jpg"), img.imageSize(webp, "webp"),
  img.imageSize(Uint8Array.from(ascii('<?xml?><svg xmlns="x" viewBox="0 0 120 60">')), "svg"), img.imageSize(Uint8Array.from([1, 2]), "png")],
[{ w: 1600, h: 900 }, { w: 10, h: 20 }, { w: 400, h: 300 }, { w: 640, h: 200 }, { w: 120, h: 60 }, null]);
same([img.drawnSize({ w: 1600, h: 900 }, 384), img.drawnSize({ w: 200, h: 100 }, 384), img.drawnSize({ w: 1600, h: 900 }, 384, 300), img.drawnSize(null, 384)],
  [{ w: 384, h: 216 }, { w: 200, h: 100 }, { w: 300, h: 169 }, null], "the column's width at most, its own width and its tag's too; its shape kept");
console.log("ok: images: a body's pictures, what each is kept under, kinds and sizes");
