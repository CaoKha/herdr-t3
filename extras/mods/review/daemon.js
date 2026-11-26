// The jin.review daemon's review API (plans/fork/04 in the fork), signed in with the session the CLI keeps in ~/.pulls.review.
// A repository on another machine (`on`) has that machine's daemon, on its loopback: curl there carries each call.
import { exec, home, readTextFile } from "herdr";

const INSTALL = "bun add --global jin.review. See mods/README.md in github.com/JinJieBeWater/pulls.review.";
const START = ["-d", "--no-open", "--worktree"];
// herdr-core ends whatever a command started once it returns, the daemon jin.review forks included: a systemd user unit
// outlives it. Oneshot with RemainAfterExit keeps the unit, and so the daemon in its cgroup, after `jin.review -d` exits.
const UNIT = "jin-review";
const RUN = ["--user", "--collect", `--unit=${UNIT}`, "-p", "Type=oneshot", "-p", "RemainAfterExit=yes"];
// 127: no jin.review; 3: no systemd user session to keep it running.
const PROBE = "command -v jin.review >/dev/null || exit 127; systemctl --user show-environment >/dev/null 2>&1 || exit 3";
// The port, and a 0600 file of the session's headers for curl's -H @file, from the pid file: printf is the shell's own, so no
// process's argv carries the session.
const STATE = String.raw`f="$HOME/.pulls.review/daemon.pid" h="$HOME/.pulls.review/herdr-headers"
port=$(sed -n 's/.*"port"[^0-9]*\([0-9][0-9]*\).*/\1/p' "$f" 2>/dev/null)
session=$(sed -n 's/.*"session"[^"]*"\([^"]*\)".*/\1/p' "$f" 2>/dev/null)
[ -n "$port" ] && [ -n "$session" ] || exit 1
umask 077 && printf 'Cookie: pulls_session=%s\nOrigin: http://127.0.0.1:%s\nContent-Type: application/json\n' "$session" "$port" > "$h.$$" && mv -f "$h.$$" "$h" && printf '%s\n%s\n' "$port" "$h"`;
// As long as exec allows: fetch here has no limit either, and review-load.js gives up on a read of its own.
const CALL_TIMEOUT = 600000;

// Each machine's daemon, this one's under "", and the connect under way there: calls at once share it, so a second start
// doesn't stop the unit the first just started.
const states = new Map(), connecting = new Map();

/** This machine's: the pid file's { port, session }. Another's: { port, headers }, the headers file there. */
async function readState(on) {
  if (!on) {
    const text = await readTextFile(`${home()}/.pulls.review/daemon.pid`).catch(() => null);
    try { return text ? JSON.parse(text) : null; } catch { return null; }
  }
  const r = await exec("sh", ["-c", STATE], { on }).catch(() => null);
  const [port, headers] = r?.code === 0 ? r.stdout.trim().split("\n") : [];
  return port && headers ? { port: Number(port), headers } : null;
}

const answers = (on, state) => call(on, state, "GET", "/api/status").then(r => r.ok, () => false);

/** Starts the daemon when none answers: `-d --no-open` registers the worktree and opens nothing. */
function connect({ root, on = null }, fresh) {
  const key = on ?? "";
  if (connecting.has(key)) return connecting.get(key);
  if (states.has(key) && !fresh) return Promise.resolve(states.get(key));
  const found = (async () => {
    let state = await readState(on);
    if (!(state && await answers(on, state))) {
      const kept = await start(root, on);
      state = await readState(on);
      if (!state) throw new Error("The jin.review daemon didn't start");
      if (!kept && !await answers(on, state)) throw new Error(`Review can't keep jin.review running on ${on} (no systemd user session).`);
    }
    states.set(key, state);
    return state;
  })().finally(() => connecting.delete(key));
  connecting.set(key, found);
  return found;
}

/** Runs `jin.review -d`, on `on` in a systemd user unit when there is one; says whether that unit keeps it. */
async function start(root, on) {
  if (!on) {
    const r = await exec("jin.review", START, { cwd: root }).catch(() => null);
    if (!r) throw new Error(`jin.review isn't installed: ${INSTALL}`);
    return ran(r, true);
  }
  const probe = await exec("sh", ["-c", PROBE], { on });
  if (probe.code === 127) throw new Error(`jin.review isn't installed on ${on}: ${INSTALL}`);
  const unit = probe.code === 0;
  // A unit whose daemon died stays active (RemainAfterExit), and systemd-run refuses its name until it stops.
  if (unit) await exec("systemctl", ["--user", "stop", UNIT], { on }).catch(() => null);
  const r = unit ? await exec("systemd-run", [...RUN, `--working-directory=${root}`, "jin.review", ...START], { cwd: root, on })
    : await exec("jin.review", START, { cwd: root, on });
  return ran(r, unit);
}

function ran(r, kept) {
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `jin.review -d exited ${r.code}`);
  return kept;
}

/** One call; another machine's answers as fetch's do (ok, status, text, json), and a curl that reached nothing rejects. */
async function call(on, state, method, path, body) {
  const origin = `http://127.0.0.1:${state.port}`;
  if (!on) {
    return fetch(origin + path, {
      method,
      headers: { Cookie: `pulls_session=${state.session}`, Origin: origin, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const r = await exec("curl", ["-sS", "-X", method, "-H", `@${state.headers}`, ...(body === undefined ? [] : ["--data-raw", JSON.stringify(body)]),
    "-w", "\n%{http_code}", origin + path], { on, timeout: CALL_TIMEOUT });
  if (r.code !== 0) throw new Error(r.stderr.trim() || `curl exited ${r.code}`);
  const cut = r.stdout.lastIndexOf("\n"), text = r.stdout.slice(0, cut), status = Number(r.stdout.slice(cut + 1));
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) };
}

/** Calls the daemon for the worktree at `root` on `on`; one that went away (restarted, a new session) is found again once. */
export async function request(repo, method, path, body) {
  let r;
  try { r = await call(repo.on, await connect(repo), method, path, body); }
  catch { r = await call(repo.on, await connect(repo, true), method, path, body); }
  if (r.status === 401) r = await call(repo.on, await connect(repo, true), method, path, body);
  if (!r.ok) throw new Error((await r.text()).trim() || `jin.review answered ${r.status}`);
  return /** @type {Promise<any>} */ (r.json());
}

/** POSTs to the review API, which names the worktree in the body (the daemon registers one it doesn't know yet). */
export const review = (repo, path, body) => request(repo, "POST", path, { path: repo.root, ...body });
