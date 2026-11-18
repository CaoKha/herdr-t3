// node extras/mods/t3-theme-export/check.cjs: main.js runs on a fake herdr, without a window.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "main.js"), "utf8")
  .replace(/^import .*$/gm, "")
  .replace("export default class ThemeExport", "return class ThemeExport");
const drain = () => new Promise(resolve => setImmediate(resolve));
const filePath = "/home/.cache/herdr-app-theme.json";

function start(file = null, checking = false) {
  const host = { file, name: "A", background: "#aaaaaa", reads: [], writes: [] };
  const Mod = new Function("checking", "View", "div", "theme", "settings", "home", "readTextFile", "writeTextFile", source)(
    () => checking,
    class {},
    () => "root",
    () => ({ background: host.background }),
    () => ({ theme: host.name }),
    () => "/home",
    async path => { host.reads.push(path); return host.file; },
    async (path, text, expected) => {
      await new Promise(finish => host.writes.push({ path, text, expected, finish }));
      if (expected !== host.file) throw new Error("stale snapshot");
      host.file = text;
    },
  );
  const view = new Mod();
  view.init();
  return { host, view };
}
const exported = (host) => JSON.parse(host.file);

(async () => {
  let { host, view } = start();
  assert.equal(view.render(), "root");
  await drain();
  assert.deepEqual(host.reads, [filePath]);
  assert.equal(host.writes[0]?.path, filePath);
  assert.equal(host.writes[0]?.expected, null);
  // While A is writing, both refreshes arrive. There is no second write until A finishes, and B is never exported.
  Object.assign(host, { name: "B", background: "#bbbbbb" });
  view.render();
  Object.assign(host, { name: "C", background: "#112233" });
  view.render();
  await drain();
  assert.equal(host.writes.length, 1);
  assert.equal(host.file, null);
  host.writes[0].finish();
  await drain();
  assert.deepEqual(exported(host), { name: "A", colors: { background: "#aaaaaa" } });
  assert.equal(host.writes.length, 2);
  assert.equal(host.writes[1].expected, host.file);
  host.writes[1].finish();
  await drain();
  assert.deepEqual(exported(host), { name: "C", colors: { background: "#112233" } });
  view.render();
  await drain();
  assert.equal(host.writes.length, 2, "refreshing the same colors does not write them again");

  // A competing writer makes the expected text stale. Don't spin on the conflict; the next refresh tries again.
  ({ host, view } = start("old"));
  view.render();
  await drain();
  assert.equal(host.writes[0]?.expected, "old");
  host.file = "someone else's write";
  host.writes[0].finish();
  await drain();
  assert.equal(host.file, "someone else's write");
  assert.equal(host.writes.length, 1, "a conflict waits for another render");
  view.render();
  await drain();
  assert.equal(host.writes.length, 2);
  assert.equal(host.writes[1].expected, "someone else's write");
  host.writes[1].finish();
  await drain();
  assert.deepEqual(exported(host), { name: "A", colors: { background: "#aaaaaa" } });

  // A new copy skips the write if the file already has its colors.
  const same = host.file;
  ({ host, view } = start(same));
  view.render();
  await drain();
  assert.deepEqual(host.reads, [filePath]);
  assert.equal(host.writes.length, 0);
  assert.equal(host.file, same);

  ({ host, view } = start("untouched", true));
  assert.equal(view.render(), "root");
  await drain();
  assert.deepEqual(host.reads, []);
  assert.deepEqual(host.writes, []);
  assert.equal(host.file, "untouched");

  console.log("ok t3-theme-export");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
