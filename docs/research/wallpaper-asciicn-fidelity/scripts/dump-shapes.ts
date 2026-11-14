// Every glyph the sample frames use, with asciicn's geometric shape when it has
// one: lib/ascii/glyphs.ts. `null` means the site draws it with a font.
//   bun dump-shapes.ts <dir of site-*.json frames> <out json>
import { glyphShape } from "./site/glyphs.ts";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const [frames, out] = process.argv.slice(2);
const chars = new Set<string>();
for (const file of readdirSync(frames).filter((f) => /^site-.*\.json$/.test(f))) {
  const frame = JSON.parse(readFileSync(`${frames}/${file}`, "utf8"));
  for (const line of frame.glyphs) for (const glyph of line) chars.add(glyph);
}
const shapes = {};
for (const glyph of chars) shapes[glyph] = glyphShape(glyph) ?? null;
writeFileSync(out, JSON.stringify(shapes));
console.log(`${chars.size} glyphs, ${Object.values(shapes).filter(Boolean).length} geometric`);
