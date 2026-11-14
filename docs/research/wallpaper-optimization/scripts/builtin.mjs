// bun builtin.mjs <mod dir> <theme.json> <out dir> : each built-in scene's shipped tiles composited on the theme background.
import { readFileSync, writeFileSync } from "node:fs";
const [, , mod, themePath, out] = process.argv;
const { SCENES } = await import(`${mod}/scenes.js`);
const theme = JSON.parse(readFileSync(themePath, "utf8")), name = themePath.split("/").pop().replace(".json", "");
const colour = (tint) => (tint === "foreground" ? theme.foreground : theme.ansi[Number(tint.slice(4))]);
for (const s of SCENES) {
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.width} ${s.height}" width="${s.width * 5}" height="${s.height * 5}"><rect width="${s.width}" height="${s.height}" fill="${theme.background}"/>`];
  const tints = {};
  for (const t of s.tiles) {
    tints[t.tint] = (tints[t.tint] ?? 0) + 1;
    const body = readFileSync(`${mod}/scenes/${s.id}/${t.file}`, "utf8"), c = colour(t.tint);
    const inner = body.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replaceAll("#000", c);
    const vb = body.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
    parts.push(`<svg x="${t.x0}" y="${t.y0}" width="${t.x1 - t.x0}" height="${t.y1 - t.y0}" viewBox="${vb.join(" ")}" overflow="visible"><g opacity="${t.opacity}" fill="none" stroke="${c}" stroke-linecap="round">${inner}</g></svg>`);
  }
  writeFileSync(`${out}/b-${s.id}-${name}.svg`, parts.join("") + "</svg>");
  console.log(s.id, name, s.tiles.length, JSON.stringify(tints));
}
