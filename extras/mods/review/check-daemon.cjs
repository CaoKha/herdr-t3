// daemon.js: this machine's daemon over fetch; another machine's through exec there, started in a systemd user unit and
// called with curl, the session in a headers file and never in argv. A fake machine answers by command.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const kit = require("./check-kit.js");

const source = kit.strip(fs.readFileSync(path.join(__dirname, "daemon.js"), "utf8")) + "\nglobalThis.review = review;";
const HEADERS = "/home/agent/.pulls.review/herdr-headers", SESSION = "secret-session";
const RUN = ["--user", "--collect", "--unit=jin-review", "-p", "Type=oneshot", "-p", "RemainAfterExit=yes", "--working-directory=/srv", "jin.review", "-d", "--no-open", "--worktree"];

// `m`: the machine. `pid`: the pid file's port, or none; `alive`: a daemon answers there; `answers`: the next statuses for
// calls past /api/status. Each load is a fresh module: its daemons are found again.
function load(m) {
  const ran = [];
  const reply = (stdout, code = 0, stderr = "") => ({ code, stdout, stderr });
  const exec = async (cmd, args, options = {}) => {
    ran.push({ cmd, args: [...args], ...options });
    if (cmd === "sh" && args[1].includes("daemon.pid")) return m.pid ? reply(`${m.pid}\n${HEADERS}\n`) : reply("", 1);
    if (cmd === "sh" && args[1].includes("command -v")) return reply("", !m.jin ? 127 : m.systemd ? 0 : 3);
    if (cmd === "systemctl") return reply("");
    if (cmd === "systemd-run" || cmd === "jin.review") { m.pid = 7900; m.alive = cmd === "systemd-run" || m.survives; return reply(""); }
    if (cmd === "curl") {
      if (!m.alive || m.drop && m.drop--) return reply("", 7, "curl: (7) Failed to connect to 127.0.0.1 port 7855");
      const url = args.at(-1), status = url.endsWith("/api/status") ? 200 : m.answers.shift() ?? 200;
      return reply(`${status === 200 ? JSON.stringify({ url }) : "boom"}\n${status}`);
    }
    throw new Error(`unexpected ${cmd}`);
  };
  const fetched = [];
  const context = vm.createContext({
    exec, home: () => "/Users/me", JSON, Error, Number, Map, String,
    readTextFile: async (file) => (fetched.push(["read", file]), m.local ? JSON.stringify({ port: 7700, session: SESSION }) : null),
    fetch: async (url, init) => (fetched.push([url, init]), { ok: true, status: 200, text: async () => "", json: async () => ({ url }) }),
  });
  vm.runInContext(source, context);
  return { ...context, ran, fetched, shown: () => ran.map(r => [r.cmd, ...r.args.slice(0, 1)].join(" ")) };
}
const remote = (m = {}) => ({ pid: 7855, alive: true, jin: true, systemd: true, survives: false, answers: [], ...m });
const repo = { root: "/srv", on: "nuc" };

test("another machine's calls: curl there, the session in its headers file", async () => {
  const d = load(remote());
  assert.deepEqual(await d.request(repo, "GET", "/api/agents"), { url: "http://127.0.0.1:7855/api/agents" });
  assert.deepEqual(await d.review(repo, "/api/review", { page: "/worktree" }), { url: "http://127.0.0.1:7855/api/review" });
  const curls = d.ran.filter(r => r.cmd === "curl");
  assert.deepEqual(curls.map(r => r.args), [
    ["-sS", "-X", "GET", "-H", `@${HEADERS}`, "-w", "\n%{http_code}", "http://127.0.0.1:7855/api/status"],
    ["-sS", "-X", "GET", "-H", `@${HEADERS}`, "-w", "\n%{http_code}", "http://127.0.0.1:7855/api/agents"],
    ["-sS", "-X", "POST", "-H", `@${HEADERS}`, "--data-raw", '{"path":"/srv","page":"/worktree"}', "-w", "\n%{http_code}", "http://127.0.0.1:7855/api/review"],
  ]);
  assert.ok(d.ran.every(r => r.on === "nuc"), "everything on that machine");
  assert.ok(!JSON.stringify(d.ran).includes(SESSION) && d.fetched.length === 0, "no session in argv, nothing fetched here");
  assert.deepEqual(d.shown().filter(c => c.startsWith("sh")).length, 1, "the pid file read once");
});

test("none answering: the stale unit stopped, a new one started in the repository", async () => {
  const m = remote({ alive: false }), d = load(m);
  await d.request(repo, "GET", "/api/agents");
  assert.deepEqual(d.shown(), ["sh -c", "curl -sS", "sh -c", "systemctl --user", "systemd-run --user", "sh -c", "curl -sS"]);
  assert.deepEqual(d.ran.find(r => r.cmd === "systemctl").args, ["--user", "stop", "jin-review"]);
  const run = d.ran.find(r => r.cmd === "systemd-run");
  assert.deepEqual([run.args, run.cwd, run.on], [RUN, "/srv", "nuc"]);
  assert.match(d.ran.find(r => r.cmd === "curl").args.at(-1), /:7855\//, "the old port first");
  assert.match(d.ran.filter(r => r.cmd === "curl").at(-1).args.at(-1), /:7900\/api\/agents$/, "then the new daemon's");
});

test("no pid file at all starts one too, once for calls made together", async () => {
  const d = load(remote({ pid: null, alive: false }));
  await Promise.all([d.request(repo, "GET", "/api/agents"), d.review(repo, "/api/review/status", { page: "/worktree" })]);
  assert.deepEqual(d.shown().filter(c => c.startsWith("system")), ["systemctl --user", "systemd-run --user"]);
});

test("not installed there, or nothing to keep it running", async () => {
  await assert.rejects(load(remote({ alive: false, jin: false })).request(repo, "GET", "/api/agents"),
    { message: "jin.review isn't installed on nuc: bun add --global jin.review. See mods/README.md in github.com/JinJieBeWater/pulls.review." });
  const gone = load(remote({ alive: false, systemd: false }));
  await assert.rejects(gone.request(repo, "GET", "/api/agents"), { message: "Review can't keep jin.review running on nuc (no systemd user session)." });
  assert.ok(gone.shown().includes("jin.review -d") && !gone.shown().some(c => c.startsWith("system")), "plain jin.review, no unit");
  const kept = load(remote({ alive: false, systemd: false, survives: true }));
  assert.deepEqual(await kept.request(repo, "GET", "/api/agents"), { url: "http://127.0.0.1:7900/api/agents" }, "a daemon that outlives it is used");
});

test("a 401 or a failed curl finds the daemon again once; another failure says the daemon's words", async () => {
  const m = remote({ answers: [401] }), d = load(m);
  assert.deepEqual(await d.request(repo, "GET", "/api/agents"), { url: "http://127.0.0.1:7855/api/agents" });
  assert.equal(d.shown().filter(c => c === "sh -c").length, 2, "the pid file read again for the new session");
  const before = d.ran.length;
  // Restarted on another port: the call fails, the pid file names the new one.
  m.drop = 1; m.pid = 7900;
  assert.deepEqual(await d.request(repo, "GET", "/api/agents"), { url: "http://127.0.0.1:7900/api/agents" });
  assert.deepEqual(d.shown().slice(before), ["curl -sS", "sh -c", "curl -sS", "curl -sS"], "the call, the pid file, its status, the call again");
  m.answers = [500];
  await assert.rejects(d.request(repo, "GET", "/api/agents"), { message: "boom" });
});

test("this machine's: fetch with the session, jin.review started here", async () => {
  const d = load({ local: true });
  await d.request({ root: "/repo", on: null }, "PUT", "/api/settings", { a: 1 });
  const [url, init] = d.fetched.at(-1);
  assert.equal(url, "http://127.0.0.1:7700/api/settings");
  assert.deepEqual(JSON.parse(JSON.stringify(init)), { method: "PUT", headers: { Cookie: `pulls_session=${SESSION}`, Origin: "http://127.0.0.1:7700", "Content-Type": "application/json" }, body: '{"a":1}' });
  assert.equal(d.ran.length, 0, "no exec");
  const none = load({ local: false });
  await assert.rejects(none.request({ root: "/repo" }, "GET", "/api/agents"), { message: "The jin.review daemon didn't start" });
  assert.deepEqual(none.ran.map(r => [r.cmd, r.args, r.cwd, r.on])[0], ["jin.review", ["-d", "--no-open", "--worktree"], "/repo", undefined]);
});
