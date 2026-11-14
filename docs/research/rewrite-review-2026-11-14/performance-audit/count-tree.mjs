// Counts the shared helpers a render calls, by name, without changing what they do: a line at the top of each.
const NAMES = ["agentKids", "kidTree", "descendants", "subAgents", "kidStatus", "ownStatus", "panelState", "surfacesFor", "surfaceBorn", "workFolder", "terminalFor", "rememberTerminal", "reviewRepo", "syncPanel", "treeRow", "treeRows", "rankPaths", "menuRow", "trigger", "tip", "tipMark", "statusMark", "programIcon", "namer"];
export function countHelpers(file, src) {
  let out = src;
  for (const n of NAMES) {
    out = out.replace(new RegExp(`(export (?:async )?function ${n}\\s*\\(.*?\\)\\s*\\{)`), `$1 __count("fn:${n}");`);
    // export const f = (…) => …  /  export const f = async (…) => {
    out = out.replace(new RegExp(`export const ${n} = (async )?\\((.*?)\\) => (?!\\{)`), (m, a, args) => `export const ${n} = ${a ?? ""}(${args}) => (__count("fn:${n}"), 0) || `);
    out = out.replace(new RegExp(`export const ${n} = (async )?\\((.*?)\\) => \\{`), (m, a, args) => `export const ${n} = ${a ?? ""}(${args}) => { __count("fn:${n}");`);
  }
  return out;
}
