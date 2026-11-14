// Shared by the probe and every version's adapter: a stage clock, a main-thread lag monitor and the app's memory.
// The lag monitor is a 16ms timer: how late it fires is how long the main thread (JS or native paint) was busy.
import { exec, writeTextFile } from "herdr";

export const tick = (cx) => new Promise((go) => cx.timer.after(0, () => go(undefined)));
export const sh = (script, dir) => exec("sh", ["-c", script], dir ? { cwd: dir } : undefined);
export const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
export const ORIENTATION = 'ObjC.import("Foundation");ObjC.import("ImageIO");function run(a){const s=$.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(a[0]),null);'
  + 'if(!s)return "1";const o=ObjC.castRefToObject($.CGImageSourceCopyPropertiesAtIndex(s,0,null)).objectForKey("Orientation");return o.isNil()?"1":String(ObjC.unwrap(o))}';

export function monitor(cx) {
  const m = { next: Date.now() + 16, max: 0, over50: 0, over100: 0, sum: 0, log: [] };
  const beat = (cx) => {
    const now = Date.now(), late = Math.max(0, now - m.next);
    m.max = Math.max(m.max, late); m.sum += late;
    // The timeline the orchestrator lines its actions up against: every beat over 20ms late.
    if (late > 20) m.log.push([now, late]);
    if (late > 50) m.over50++;
    if (late > 100) m.over100++;
    m.next = now + 16;
    cx.timer.after(16, beat);
  };
  cx.timer.after(16, beat);
  return m;
}

// The Herdr process's resident memory in MB: exec's shell is its child.
export async function rss() {
  const r = await sh("ps -o rss= -p $PPID");
  return Math.round(Number(r.stdout.trim()) / 1024);
}

/** `stage(group, name, fn)`: runs fn, appends { ms, lagMax, stalls50/100, rssMB, dRssMB } to `out` (JSON lines). */
export function recorder(cx, m, out, meta) {
  const rows = [];
  return async function stage(group, name, fn) {
    await tick(cx);
    const before = await rss();
    m.max = 0; m.over50 = 0; m.over100 = 0; m.sum = 0;
    const t0 = Date.now();
    let value, error;
    try { value = await fn(); } catch (e) { error = String(e?.message ?? e); }
    const ms = Date.now() - t0, lagMax = m.max, stalls50 = m.over50, stalls100 = m.over100;
    const after = await rss();
    rows.push({ ...meta, group, name, ms, lagMax, stalls50, stalls100, rssMB: after, dRssMB: after - before, ...(error ? { error } : {}) });
    await put(out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    if (error) throw new Error(`${group}/${name}: ${error}`);
    return value;
  };
}

// writeTextFile's null only creates a file: an overwrite goes through a fresh name and mv.
let puts = 0;
export async function put(path, text) {
  const tmp = `${path}.put-${Date.now()}-${puts++}`;
  await writeTextFile(tmp, text, null);
  await must(exec("mv", ["-f", tmp, path]));
}

export async function must(r) {
  const x = await r;
  if (x.code !== 0) throw new Error(x.stderr.trim() || `exit ${x.code}`);
  return x;
}
