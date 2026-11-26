// The pictures in a Markdown body (images.js): where they are, what each is kept under, what a download may be, how big it
// is and how big it's drawn.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const c = vm.createContext({ Uint8Array, WeakMap });
vm.runInContext(fs.readFileSync(path.join(__dirname, "images.js"), "utf8").replace(/^export /gm, "")
  + "\nglobalThis.img = { splitBody, ownParts, assetKey, imageExt, curlArgs, imageSize, drawnSize, IMAGE_MAX };", c);
const { img } = c;
const json = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b, message) => assert.deepEqual(json(a), json(b), message);
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w, h) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0]);
const ascii = (s) => [...s].map((ch) => ch.charCodeAt(0));

const parts = img.splitBody("Intro ![a](https://x/1.png \"t\") then <img width=\"300\" height=\"80\" alt='B &amp; C' src=\"https://x/2.png\" /> end\n"
  + "```md\n![not](https://x/3.png)\n```\nkept `![inline](https://x/4.png)` too\n~~~\n<img src=\"https://x/5.png\">\n~~~\n");
same(parts.map((p) => p.image ? ["image", p.image.alt, p.image.url, p.image.width ?? null, p.image.height ?? null] : ["text", p.text.trim().slice(0, 12)]),
  [["text", "Intro"], ["image", "a", "https://x/1.png", null, null], ["text", "then"], ["image", "B & C", "https://x/2.png", 300, 80], ["text", "end\n```md\n!["]],
  "Markdown and HTML pictures among the text; none inside code, fenced or inline");
assert.ok(parts.at(-1).text.includes("`![inline](https://x/4.png)`") && parts.at(-1).text.includes('<img src="https://x/5.png">'));
same(img.splitBody("   \n"), [], "nothing to draw");

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
