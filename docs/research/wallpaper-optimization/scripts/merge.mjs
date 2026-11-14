// Merge convert()'s tiles of one tint and one grid square into one svg, each step's opacity baked in as <g opacity>.
// GPUI paints an svg as an alpha mask times one colour, so baked opacity draws the same pixels with fewer, smaller masks.
export function merge(tiles) {
  const groups = new Map();
  for (const t of tiles) {
    const grid = t.file.replace(/\.svg$/, "").split("-").pop(), key = `${t.tint}-${grid}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return [...groups].map(([key, ts]) => {
    const x0 = Math.min(...ts.map((t) => t.x0)), y0 = Math.min(...ts.map((t) => t.y0)), x1 = Math.max(...ts.map((t) => t.x1)), y1 = Math.max(...ts.map((t) => t.y1));
    const body = ts.map((t) => `<g stroke-opacity="${t.opacity}" fill-opacity="${t.opacity}">${t.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")}</g>`).join("");
    return { file: `${key}.svg`, tint: ts[0].tint, opacity: 1, x0, y0, x1, y1,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${+(x1 - x0).toFixed(3)} ${y1 - y0}" fill="none" stroke="#000" stroke-linecap="round">${body}</svg>\n` };
  });
}
