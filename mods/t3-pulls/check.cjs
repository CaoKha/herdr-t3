// The Pull requests page outside Herdr: what git and GitHub's answers mean (model.js), and the page in a fake `herdr` whose exec
// answers git, gh and jin.review by their arguments.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const kit = require("./check-kit.js");
const { find, strings } = kit;
// A vm's values against this realm's, compared as JSON: their prototypes differ.
const json = (x) => x === undefined ? x : JSON.parse(JSON.stringify(x));
const same = (a, b, message) => assert.deepEqual(json(a), json(b), message);

const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");
const m = (() => {
  const c = vm.createContext({});
  vm.runInContext(`${kit.strip(read("model.js"))}\nglobalThis.m = { repositoryFromRemote, parseDiscovery, ownBranchPRs, ghProblem, prState, checkKind, rollupKind, checksOf,
    reviewersOf, prStats, mergeState, stackOf, matches, timeAgo, reviewProblem, fetchArgs, prRefs, comparePage, CONFIG_KEYS };`, c);
  return c.m;
})();

const card = (number, head, base, extra = {}) => ({ number, title: `PR ${number}`, url: `https://github.com/org/app/pull/${number}`, state: "OPEN", isDraft: false,
  updatedAt: "2026-01-01T00:00:00Z", headRefName: head, baseRefName: base, author: { login: "ann" }, commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] }, ...extra });
const rollup = (contexts, extra = {}) => ({ commits: { nodes: [{ commit: { statusCheckRollup: { state: "PENDING", contexts: { nodes: contexts } } } }] }, ...extra });

function discovery() {
  const config = ["remote.origin.url git@github.com:Me/app.git", "remote.upstream.url https://github.com/org/app.git", "remote.work.url git@github-work:corp/app",
    "remote.gl.url git@gitlab.com:me/app.git", "branch.feat.x.remote work", "branch.main.remote origin", "branch.local.remote ."].join("\n");
  same(json(m.parseDiscovery("/r\nfeat.x\n", config)), { root: "/r", branch: "feat.x", remote: "upstream", repo: "org/app", heads: ["me/app", "org/app", "corp/app"] },
    "upstream names the repository first; every GitHub remote is a place the branch may be pushed");
  const noUpstream = config.split("\n").filter((l) => !l.startsWith("remote.upstream")).join("\n");
  assert.equal(m.parseDiscovery("/r\nfeat.x\n", noUpstream).remote, "work", "then the branch's tracking remote");
  assert.equal(m.parseDiscovery("/r\nlocal\n", noUpstream).remote, "origin", "a branch tracking the clone itself (.) falls to origin");
  same([m.parseDiscovery("/r\nHEAD\n", config).branch, m.parseDiscovery("/r\nHEAD\n", config).repo], [null, "org/app"], "a detached HEAD has no branch, still a repository");
  assert.throws(() => m.parseDiscovery("", config), /not in a Git repository/);
  assert.throws(() => m.parseDiscovery("/r\nmain\n", "remote.gl.url git@gitlab.com:me/app.git"), /no GitHub remote/);
  assert.throws(() => m.parseDiscovery("/r\nmain\n", "remote.origin.url git@gitlab.com:me/app.git"), /origin remote isn't a GitHub repository/);
  for (const [url, repo] of [["https://github.com/a/b", "a/b"], ["https://x@github.com/a/b.git/", "a/b"], ["ssh://git@ssh.github.com:443/a/b.git", "a/b"],
    ["git@github.com:a/b.git", "a/b"], ["git@github.com:a/b/c.git", null], ["https://github.example.com/a/b", null], ["/srv/b.git", null]]) assert.equal(m.repositoryFromRemote(url), repo, url);
  const prs = [{ number: 1, headRepository: { nameWithOwner: "Me/App" } }, { number: 2, headRepository: { nameWithOwner: "stranger/app" } }, { number: 3, headRepository: null }];
  same(m.ownBranchPRs(prs, ["me/app", "org/app"]).map((p) => p.number), [1], "a fork's same-named branch isn't this branch");
}

function summaries() {
  const open = (extra) => ({ state: "OPEN", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", ...extra });
  const merge = (extra) => m.prStats(open(extra)).find((s) => s.key === "merge");
  same(json(merge({})), { key: "merge", label: "Merge", value: "Ready", tone: "good" });
  assert.equal(merge({ isDraft: true, mergeable: "CONFLICTING" }).value, "Draft", "a draft says so before anything else");
  assert.equal(merge({ mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" }).value, "Conflicts");
  assert.equal(merge({ mergeStateStatus: "BEHIND" }).value, "Behind");
  assert.equal(merge({ mergeStateStatus: "BLOCKED" }).value, "Blocked");
  assert.equal(merge({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }).value, "Checking", "GitHub still working it out isn't Ready");
  assert.equal(merge({ mergeStateStatus: "UNSTABLE" }).value, "Ready", "failing checks that don't block are the Checks stat's to say");
  same(m.prStats({ state: "MERGED" }).map((s) => s.key), ["checks", "reviews"], "no merge state once merged or closed");

  const contexts = [{ __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "u1" },
    { __typename: "CheckRun", name: "build", status: "IN_PROGRESS", conclusion: null, detailsUrl: "u2" },
    { __typename: "StatusContext", context: "ci/legacy", state: "FAILURE", targetUrl: "u3" },
    { __typename: "CheckRun", name: "docs", status: "COMPLETED", conclusion: "SKIPPED", detailsUrl: null }];
  same(m.checksOf(rollup(contexts)).map((c) => [c.name, c.kind, c.url]),
    [["ci/legacy", "failure", "u3"], ["build", "pending", "u2"], ["lint", "success", "u1"], ["docs", "skipped", null]], "failures first, a status context's words too");
  const checks = m.prStats(open(rollup(contexts))).find((s) => s.key === "checks");
  same([checks.value, checks.tone], ["1/3", "danger"], "passed of the counted ones; a skipped check isn't counted");
  assert.equal(m.prStats(open(rollup(contexts.slice(0, 2)))).find((s) => s.key === "checks").tone, "waiting");
  same([m.prStats(open({})).find((s) => s.key === "checks").value, m.rollupKind({})], ["–", null], "no checks: nothing to say");
  assert.equal(m.rollupKind(card(1, "a", "b", { commits: { nodes: [{ commit: { statusCheckRollup: { state: "EXPECTED" } } }] } })), "pending");

  const pr = open({ reviewDecision: "REVIEW_REQUIRED", latestOpinionatedReviews: { nodes: [{ state: "APPROVED", author: { login: "bo" } }, { state: "CHANGES_REQUESTED", author: { login: "cy" } }] },
    reviewRequests: { nodes: [{ requestedReviewer: { login: "cy" } }, { requestedReviewer: { combinedSlug: "org/core" } }] } });
  same(json(m.reviewersOf(pr)), [{ login: "bo", state: "APPROVED" }, { login: "cy", state: "REQUESTED" }, { login: "org/core", state: "REQUESTED" }],
    "asked again, a reviewer owes a review whatever they said before");
  const reviews = m.prStats(pr).find((s) => s.key === "reviews");
  same([reviews.value, reviews.tone], ["1/3", "waiting"]);
  assert.equal(m.prStats({ ...pr, reviewDecision: "CHANGES_REQUESTED" }).find((s) => s.key === "reviews").tone, "danger", "changes requested reads red");

  same(["open", "draft", "merged", "closed"], [open({}), open({ isDraft: true }), { state: "MERGED", isDraft: true }, { state: "CLOSED" }].map((p) => m.prState(p).key));
  assert.ok(m.matches(card(42, "fix-login", "main", { title: "Sign in fails" }), "#42"));
  assert.ok(!m.matches(card(142, "x", "main", { title: "Other" }), "42"), "a number matches that PR, not every number containing it");
  assert.ok(m.matches(card(1, "fix-login", "main", { title: "Sign in fails" }), "SIGN login"), "every word, in the title or branch");
  assert.ok(!m.matches(card(1, "fix-login", "main", { title: "Sign in fails" }), "sign logout"));
  assert.equal(m.timeAgo("2026-01-01T00:00:00Z", Date.parse("2026-01-01T03:30:00Z")), "3h ago");
}

function stacks() {
  const a = card(1, "a", "main"), b = card(2, "b", "a"), c = card(3, "c", "b"), side = card(4, "d", "a"), lone = card(5, "e", "main");
  const open = [a, b, c, side, lone];
  same(json(m.stackOf(b, open)).layers.map((p) => p.number), [3, 2, 1], "top first: what's on it, itself, then down to the trunk");
  assert.equal(m.stackOf(b, open).trunk, "main");
  same(m.stackOf(a, open).layers.map((p) => p.number), [3, 2, 4, 1], "everything stacked on it, each branch");
  assert.equal(m.stackOf(lone, open), null, "a PR on its own has no stack");
  const loop = [card(6, "x", "y"), card(7, "y", "x")];
  same(m.stackOf(loop[0], loop).layers.map((p) => p.number), [6, 7], "a cycle of bases ends");
}

function handoff() {
  assert.equal(m.reviewProblem({ installed: false, machine: null, root: "/r" }), "Review isn't installed: add the Review extra.");
  assert.equal(m.reviewProblem({ installed: true, machine: "vps", root: "/r" }), "Review is unavailable on remote spaces.");
  assert.equal(m.reviewProblem({ installed: true, machine: "vps", root: "/r" }, "pulls.review"), "pulls.review is unavailable on remote spaces.");
  assert.equal(m.reviewProblem({ installed: true, machine: null, root: "/r" }), "");
  same(json(m.prRefs({ number: 7, baseRefName: "release/1.2" })), { head: "refs/pull/7/head", base: "refs/heads/release/1.2" });
  same(json(m.fetchArgs("upstream", "refs/pull/7/head")), ["fetch", "--no-tags", "--quiet", "upstream", "refs/pull/7/head"]);
  assert.equal(m.comparePage("b1", "h1"), "/compare/b1...h1", "three dots: what GitHub shows of a PR");
  assert.equal(m.ghProblem("GitHub CLI (gh) is not installed.").command, "gh auth login");
  assert.match(m.ghProblem("GitHub CLI is not logged in.").title, /logged in/);
  assert.equal(m.ghProblem("GitHub: something else"), null);
}

const CONFIG = "remote.origin.url git@github.com:me/app.git\nremote.upstream.url https://github.com/org/app.git\nbranch.feat.remote origin\n";

// The page in a fake `herdr`: one or more spaces, the panel showing `page`, its slots. `w.gh(args)` answers gh as gh would;
// `w.hold(cmd, args)` keeps an answer back in `w.held` until released.
function makePage({ spaces, panes = [], slots = ["files", "panel-empty", "pulls", "review"], page = "pulls", open = true } = {}) {
  const w = { spaces, panes, ran: [], commands: [], held: [], open, page, now: Date.parse("2026-01-01T01:00:00Z"), hold: null, fetched: null,
    lists: { branch: [card(7, "feat", "main", { headRepository: { nameWithOwner: "me/app" } }), card(9, "feat", "main", { headRepository: { nameWithOwner: "stranger/app" } })],
      open: [card(7, "feat", "main"), card(8, "feat-2", "feat"), card(5, "other", "main")], total: 3 },
    detail: (n) => ({ ...card(n, n === 8 ? "feat-2" : "feat", n === 8 ? "feat" : "main"), body: "Fixes **this**.", headRefOid: `h${n}`, baseRefOid: "b0", mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN", reviewDecision: null, latestOpinionatedReviews: { nodes: [] }, ...rollup([]) }) };
  const sh = { "t3.panels": { s1: { tabs: [{ id: "pulls", born: 1 }], active: "pulls", open: true }, s2: { tabs: [{ id: "pulls", born: 2 }], active: "pulls", open: true } } };
  const answer = (cmd, args, o) => {
    const line = args.join(" ");
    if (cmd === "git" && line.includes("--show-toplevel")) return { code: 0, stdout: `${o.cwd === "/q" ? "/q" : "/r"}\nfeat\n` };
    if (cmd === "git" && line.includes("--get-regexp")) return { code: 0, stdout: CONFIG };
    if (cmd === "git" && args.includes("fetch")) { w.fetched = args.at(-1); return w.fetchFails ? { code: 1, stderr: "fatal: couldn't find remote ref\n" } : { code: 0, stdout: "" }; }
    if (cmd === "git" && line.includes("FETCH_HEAD")) return { code: 0, stdout: `${w.fetched.startsWith("refs/pull/") ? "headsha" : "basesha"}\n` };
    if (cmd === "jin.review") return { code: 0, stdout: "" };
    if (cmd === "gh") {
      if (w.gh) return w.gh(args);
      const query = args.find((a) => a.startsWith("query=")) ?? "", number = Number(args.find((a) => a.startsWith("number="))?.slice(7));
      if (query.includes("open: pullRequests")) return { code: 0, stdout: JSON.stringify({ data: { repository: { ...(query.includes("branch:") ? { branch: { nodes: w.lists.branch } } : {}), open: { totalCount: w.lists.total, nodes: w.lists.open } } } }) };
      if (query.includes("reviewRequests")) return { code: 0, stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewRequests: { nodes: [{ requestedReviewer: { login: "bo" } }] } } } } }) };
      return { code: 0, stdout: JSON.stringify({ data: { repository: { pullRequest: w.detail(number) } } }) };
    }
    return { code: 0, stdout: "" };
  };
  const exec = async (cmd, args, o = {}) => {
    w.ran.push({ cmd, args, cwd: o.cwd ?? null, on: o.on ?? null });
    if (w.missing === cmd) throw new Error(`cannot run ${cmd}: No such file or directory`);
    const r = answer(cmd, args, o);
    return w.hold?.(cmd, args) ? new Promise((go) => w.held.push(() => go(r))) : r;
  };
  const timers = [], everies = [], failed = [];
  const task = () => ({ cancel() {} });
  const cx = { notify() {}, stop_propagation() {}, focus_handle: () => ({ focus() {}, is_focused: () => false }),
    spawn(f) { Promise.resolve().then(() => f(cx)).catch((e) => failed.push(e)); return task(); },
    timer: { every(ms, f) { everies.push(f); return task(); }, after(ms, f) { timers.push(f); return task(); } } };
  const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); if (failed.length) throw failed[0]; };
  const tick = async () => { for (const f of everies) f(cx); await settle(); };
  // In a box: a fake element answers every property, `then` too, so awaited bare it would never settle.
  const draw = async () => { const root = view.render(cx); for (const f of timers.splice(0)) f(cx); await settle(); return { root }; };
  const layout = () => ({ id: "root", children: [{ id: "work" }, { id: "panel", hidden: !w.open, children: [{ id: "panel-body", active: w.page, children: slots.map((id) => ({ id })) }] }] });
  const element = kit.elements({ args: "all" });
  class Clock extends Date { static now() { return w.now; } }
  const ctx = vm.createContext({ View: class {}, div: element, svg: element, image: (src) => element("image", src), h_flex: element, v_flex: element,
    Input: { new: element }, TextView: { markdown: (id, text) => element("markdown", text) }, Popup: { new: (id, trigger) => element().id(id).child(trigger) },
    InputState: { new: () => { let v = ""; return { on() {}, value: () => v, set_value(x) { v = x; }, focus() {} }; } },
    checking: () => false, spaces: () => w.spaces, panes: () => w.panes, focused: () => null, exec, theme: () => ({ foreground: "#ffffff", dim: "#888888", accent: "#0000ff", input: "#222222", ansi1: "#ff0000" }),
    window: () => ({ active: true, platform: "macos" }), nextCommand: () => new Promise(() => {}), keys: () => [], settings: () => ({ zoom: 1 }), layout,
    run: (name, args) => w.commands.push([name, args]), shared: (k) => sh[k], setShared: (k, v) => { sh[k] = v; },
    localStorage: { getItem: () => null, setItem() {} }, Date: Clock, Promise, Math, JSON, Map, Set, Object, Array, String, Number, Boolean, RegExp, Error });
  // panel-states.js names button.js's button drawButton, an alias the bundle's stripped imports lose.
  vm.runInContext(kit.bundle(read, "main.js", (file, src, needs) => file === "button.js" ? `${needs()}\n${kit.strip(src)}\nconst drawButton = button;` : null), ctx);
  const view = new ctx.Mod();
  view.init({}, cx);
  const activate = (id) => { w.spaces = w.spaces.map((s) => ({ ...s, active: s.id === id })); };
  return { view, cx, w, sh, settle, tick, draw, activate, st: (id = "s1") => view.states.get(id) };
}

const space = (id, folder, active = false, machine = null) => ({ id, folder, machine, active, tabs: [{ id: `${id}-tab`, active: true }] });
const listReads = (w) => w.ran.filter((r) => r.cmd === "gh" && r.args.some((a) => a.includes("open: pullRequests"))).length;

async function reads() {
  const p = makePage({ spaces: [space("s1", "/r", true)], panes: [{ tab: "s1-tab", terminal: "t1", cwd: "/r/src" }], open: false });
  await p.tick();
  assert.equal(p.w.ran.length, 0, "nothing is read while the page is hidden");
  p.w.open = true;
  let root = (await p.draw()).root;
  same(p.w.ran.filter((r) => r.cmd === "git").map((r) => [r.args.slice(3).join(" "), r.cwd, r.on]),
    [["rev-parse --show-toplevel --abbrev-ref HEAD", "/r/src", null], [`config --get-regexp ${m.CONFIG_KEYS}`, "/r/src", null]], "read in the tab's working folder");
  assert.ok(p.w.ran.find((r) => r.cmd === "gh").args.includes("owner=org"), "upstream's repository");
  root = (await p.draw()).root;
  same([p.st().branch.map((x) => x.number), p.st().openTotal], [[7], 3], "the fork's same-named branch is left out");
  assert.ok(find(root, "t3-pulls-detail"), "a branch's only PR shows its detail at once");
  assert.equal(find(root, "t3-pulls-back"), null, "with no list behind it to go back to");
  same(strings(find(root, "t3-pulls-stack")).filter((s) => /^#/.test(s)), ["#8", "#7"], "the stack: #8 is based on #7's head");
  assert.ok(strings(find(root, "t3-pulls-reviewers")).includes("bo"));
  await p.tick();
  assert.equal(listReads(p.w), 1, "not again within the minute");
  p.w.now += 60000;
  await p.tick();
  assert.equal(listReads(p.w), 2, "every minute while shown");
  p.w.open = false; await p.tick(); p.w.open = true; await p.tick();
  assert.equal(listReads(p.w), 3, "showing again reads at once");

  // Repo: a list; a row opens its detail, Back returns.
  p.view.setTab(p.st(), "repo", p.cx);
  root = (await p.draw()).root;
  assert.ok(find(root, "t3-pulls-search-field") && find(root, "t3-pulls-row-5"));
  find(root, "t3-pulls-row-5").handlers.on_click({}, p.cx); await p.settle();
  root = (await p.draw()).root;
  assert.ok(find(root, "t3-pulls-detail-5") && !find(root, "t3-pulls-search-field"));
  find(root, "t3-pulls-back").handlers.on_click({}, p.cx);
  root = (await p.draw()).root;
  assert.ok(find(root, "t3-pulls-row-5"), "back at the list");

  // A space on another machine: its own read, there; Review can't take it.
  p.w.spaces.push(space("s2", "/q", false, "vps"));
  p.activate("s2");
  root = (await p.draw()).root;
  same(p.w.ran.filter((r) => r.cmd === "git").slice(-2).map((r) => [r.cwd, r.on]), [["/q", "vps"], ["/q", "vps"]], "switching spaces reads the new one on its machine");
  root = (await p.draw()).root;
  const review = find(root, "t3-pulls-review");
  same([review.style.opacity?.[0], review.handlers.on_click], [0.64, undefined]);
  assert.equal(p.view.reviewReason(p.st("s2"), p.w.spaces[1]), "Review is unavailable on remote spaces.");
  assert.equal(p.w.ran.filter((r) => r.args.includes("fetch")).length, 0);
}

async function staleReads() {
  const p = makePage({ spaces: [space("s1", "/r", true)] });
  p.w.hold = (cmd, args) => cmd === "gh" && args.some((a) => a.includes("open: pullRequests"));
  await p.tick();
  assert.equal(p.w.held.length, 1);
  p.w.hold = null;
  p.w.lists = { ...p.w.lists, open: [card(11, "new", "main")], total: 1 };
  p.view.refresh(p.cx); await p.settle();
  same(p.st().open.map((x) => x.number), [11]);
  p.w.held.shift()(); await p.settle();
  same(p.st().open.map((x) => x.number), [11], "an older read's late answer doesn't land over a newer one");

  // A detail picked, then another: the first's late answer is dropped.
  p.w.hold = (cmd, args) => cmd === "gh" && args.includes("number=5");
  p.view.pick(p.st(), 5, p.cx); await p.settle();
  p.w.hold = null;
  p.view.pick(p.st(), 8, p.cx); await p.settle();
  for (const go of p.w.held.splice(0)) go();
  await p.settle();
  same([...p.st().details.keys()], [7, 8], "#5's late detail doesn't land");

  // The tab's folder moves: what was asked for the folder before is dropped, even before the next read starts.
  p.w.lists = { ...p.w.lists, open: [card(12, "old", "main")], total: 1 };
  p.w.hold = (cmd, args) => cmd === "gh" && args.some((a) => a.includes("open: pullRequests"));
  p.view.refresh(p.cx); await p.settle();
  p.w.hold = null;
  p.w.panes = [{ tab: "s1-tab", terminal: "t1", cwd: "/r/elsewhere" }];
  await p.draw();
  p.w.held.shift()(); await p.settle();
  same(p.st().open.map((x) => x.number), [11], "a read for the folder before doesn't land");
  await p.tick();
  assert.ok(p.w.ran.some((r) => r.cwd === "/r/elsewhere"), "the new folder is read");
}

async function reviewHandoff() {
  const p = makePage({ spaces: [space("s1", "/r", true)] });
  await p.tick(); await p.draw();
  let root = (await p.draw()).root;
  find(root, "t3-pulls-review").handlers.on_click({}, p.cx); await p.settle();
  const git = p.w.ran.filter((r) => r.cmd === "git" && (r.args.includes("fetch") || r.args.includes("FETCH_HEAD^{commit}"))).map((r) => [r.args.slice(3).join(" "), r.cwd, r.on]);
  same(git, [["fetch --no-tags --quiet upstream refs/pull/7/head", "/r", null], ["rev-parse --verify --quiet FETCH_HEAD^{commit}", "/r", null],
    ["fetch --no-tags --quiet upstream refs/heads/main", "/r", null], ["rev-parse --verify --quiet FETCH_HEAD^{commit}", "/r", null]],
  "the PR's head and its base from the remote that has it, in the repository's root");
  same([p.sh.review.space, p.sh.review.root, p.sh.review.page], ["s1", "/r", "/compare/basesha...headsha"], "Review asked for what GitHub shows");
  assert.ok(p.w.commands.some(([name, args]) => name === "layout.select" && args.child === "review"), "and shown");
  assert.equal(p.st().busy, null);

  // A failed fetch says why and asks Review nothing.
  delete p.sh.review;
  p.w.fetchFails = true;
  root = (await p.draw()).root;
  find(root, "t3-pulls-review").handlers.on_click({}, p.cx); await p.settle();
  root = (await p.draw()).root;
  assert.equal(p.sh.review, undefined);
  assert.ok(strings(find(root, "t3-pulls-action-error")).some((s) => s.includes("couldn't find remote ref")));

  // pulls.review: the fork's daemon, from the clone.
  find(root, "t3-pulls-pulls-review").handlers.on_click({}, p.cx); await p.settle();
  const jin = p.w.ran.find((r) => r.cmd === "jin.review");
  same([jin.args, jin.cwd], [["-d", "org/app#7"], "/r"]);

  // No Review page in this layout: both greyed with the reason.
  const q = makePage({ spaces: [space("s1", "/r", true)], slots: ["files", "panel-empty", "pulls"] });
  await q.tick(); await q.draw();
  root = (await q.draw()).root;
  assert.equal(q.view.reviewReason(q.st(), q.w.spaces[0]), "Review isn't installed: add the Review extra.");
  same([find(root, "t3-pulls-review").handlers.on_click, find(root, "t3-pulls-pulls-review").handlers.on_click], [undefined, undefined]);
}

async function ghFailures() {
  const p = makePage({ spaces: [space("s1", "/r", true)] });
  p.w.missing = "gh";
  await p.tick();
  let root = (await p.draw()).root;
  assert.ok(strings(root).includes("GitHub CLI isn't installed") && strings(root).includes("gh auth login"), "what's wrong and what to run");
  p.w.missing = null;
  p.w.gh = () => ({ code: 4, stdout: "", stderr: "To get started with GitHub CLI, please run:  gh auth login\n" });
  find(root, "t3-pulls-retry").handlers.on_click({}, p.cx); await p.settle();
  root = (await p.draw()).root;
  assert.ok(strings(root).includes("GitHub CLI isn't logged in"));
  p.w.gh = () => ({ code: 1, stdout: "", stderr: "HTTP 502: Bad Gateway\n" });
  p.view.refresh(p.cx); await p.settle();
  root = (await p.draw()).root;
  assert.ok(strings(find(root, "t3-pulls-error")).includes("GitHub: HTTP 502: Bad Gateway"), "any other failure is a bar with Retry");
  p.w.gh = null;
  find(root, "t3-pulls-error-retry").handlers.on_click({}, p.cx); await p.settle();
  root = (await p.draw()).root;
  assert.ok(find(root, "t3-pulls-detail") && !find(root, "t3-pulls-error"));
}

(async () => {
  discovery();
  summaries();
  stacks();
  handoff();
  await reads();
  await staleReads();
  await reviewHandoff();
  await ghFailures();
  console.log("t3-pulls checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
