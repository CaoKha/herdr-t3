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
  vm.runInContext(`${kit.strip(read("model.js"))}\nglobalThis.m = { ownBranchPRs, prState, checkKind, rollupKind, checksOf,
    reviewersOf, verdict, tallies, stackOf, matches, fetchArgs, fetchHeadShas, comparePage, conversationEntries, threadPlace,
    hunkTail, threadShut, checksOpenByDefault, sectionSummary };`, c);
  return c.m;
})();
const os = require("node:os");
// Each page's app home, a real folder for its picture cache; all gone when the check ends.
const homes = [];
const tempHome = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "t3-pulls-check-")); homes.push(d); return d; };
process.on("exit", () => { for (const d of homes) fs.rmSync(d, { recursive: true, force: true }); });

const card = (number, head, base, extra = {}) => ({ number, title: `PR ${number}`, url: `https://github.com/org/app/pull/${number}`, state: "OPEN", isDraft: false,
  updatedAt: "2026-01-01T00:00:00Z", headRefName: head, baseRefName: base, author: { login: "ann" }, commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] }, ...extra });
const rollup = (contexts, extra = {}) => ({ commits: { nodes: [{ commit: { statusCheckRollup: { state: "PENDING", contexts: { nodes: contexts } } } }] }, ...extra });

function forks() {
  const prs = [{ number: 1, headRepository: { nameWithOwner: "Me/App" } }, { number: 2, headRepository: { nameWithOwner: "stranger/app" } }, { number: 3, headRepository: null }];
  same(m.ownBranchPRs(prs, ["me/app", "org/app"]).map((p) => p.number), [1], "a fork's same-named branch isn't this branch");
}

function summaries() {
  const open = (extra) => ({ state: "OPEN", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", baseRefName: "main", ...extra });
  const contexts = [{ __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "u1" },
    { __typename: "CheckRun", name: "build", status: "IN_PROGRESS", conclusion: null, detailsUrl: "u2" },
    { __typename: "StatusContext", context: "ci/legacy", state: "FAILURE", targetUrl: "u3" },
    { __typename: "CheckRun", name: "docs", status: "COMPLETED", conclusion: "SKIPPED", detailsUrl: null }];
  same(m.checksOf(rollup(contexts)).map((c) => [c.name, c.kind, c.url]),
    [["ci/legacy", "failure", "u3"], ["build", "pending", "u2"], ["lint", "success", "u1"], ["docs", "skipped", null]], "failures first, a status context's words too");
  assert.equal(m.rollupKind(card(1, "a", "b", { commits: { nodes: [{ commit: { statusCheckRollup: { state: "EXPECTED" } } }] } })), "pending");

  // The verdict: the worst reason first, as Branch PR's mergeBlockers ranks them.
  const failing = rollup(contexts.slice(2, 3)), running = rollup(contexts.slice(1, 2)), changes = { reviewDecision: "CHANGES_REQUESTED" };
  const v = (extra) => { const r = m.verdict(open(extra)); return [r.text, r.tone, r.section ?? null]; };
  same([v({ isDraft: true, mergeable: "CONFLICTING", ...failing }), v({ mergeable: "CONFLICTING", ...failing, ...changes }), v({ ...rollup([contexts[2], contexts[1]]), ...changes }),
    v({ ...changes, ...running }), v({ ...running, reviewDecision: "REVIEW_REQUIRED" }), v({ reviewDecision: "REVIEW_REQUIRED", mergeStateStatus: "BEHIND" }),
    v({ mergeStateStatus: "BEHIND" }), v({ mergeStateStatus: "BLOCKED" }), v({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }), v({ mergeStateStatus: "UNSTABLE" }), v({})],
  [["Draft", "none", null], ["Conflicts with main", "danger", null], ["Blocked: 1 check failing", "danger", "checks"], ["Blocked: changes requested", "danger", "reviewers"],
    ["Waiting: 1 check running", "waiting", "checks"], ["Blocked: review required", "waiting", "reviewers"], ["Behind main", "waiting", null], ["Blocked", "waiting", null],
    ["Checking…", "none", null], ["Ready to merge", "good", null], ["Ready to merge", "good", null]], "each verdict over every one ranked after it");
  same([m.verdict({ state: "MERGED" }).text, m.verdict({ state: "CLOSED", isDraft: true }).text], ["Merged", "Closed"]);
  assert.equal(m.verdict(open(rollup([...contexts.slice(2, 3), contexts[2]]))).text, "Blocked: 2 checks failing");

  const pr = open({ reviewDecision: "REVIEW_REQUIRED", latestOpinionatedReviews: { nodes: [{ state: "APPROVED", author: { login: "bo" } }, { state: "CHANGES_REQUESTED", author: { login: "cy" } }] },
    reviewRequests: { nodes: [{ requestedReviewer: { login: "cy" } }, { requestedReviewer: { combinedSlug: "org/core" } }] }, ...rollup(contexts) });
  same(json(m.reviewersOf(pr)), [{ login: "bo", state: "APPROVED" }, { login: "cy", state: "REQUESTED" }, { login: "org/core", state: "REQUESTED" }],
    "asked again, a reviewer owes a review whatever they said before");
  same(m.tallies(pr), { checks: "1/3 checks", reviews: "1/3 reviews" }, "passed of the counted checks (skipped aside), approved of those asked");
  same(m.tallies(open({})), { checks: "No checks", reviews: "No reviews" });

  same(["Open", "Draft", "Merged", "Closed"], [open({}), open({ isDraft: true }), { state: "MERGED", isDraft: true }, { state: "CLOSED" }].map((p) => m.prState(p).label));
  assert.ok(m.matches(card(42, "fix-login", "main", { title: "Sign in fails" }), "#42"));
  assert.ok(!m.matches(card(142, "x", "main", { title: "Other" }), "42"), "a number matches that PR, not every number containing it");
  assert.ok(m.matches(card(1, "fix-login", "main", { title: "Sign in fails" }), "SIGN login"), "every word, in the title or branch");
  assert.ok(!m.matches(card(1, "fix-login", "main", { title: "Sign in fails" }), "sign logout"));
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
  same(json(m.fetchArgs("upstream", { number: 7, baseRefName: "release/1.2" })), ["fetch", "--no-tags", "--quiet", "upstream", "refs/pull/7/head", "refs/heads/release/1.2"]);
  same(json(m.fetchHeadShas(`${HEAD_SHA}\t\t'refs/pull/7/head' of github.com:org/app\n${BASE_SHA}\tnot-for-merge\tbranch 'main' of github.com:org/app\n`)), [HEAD_SHA, BASE_SHA],
    "FETCH_HEAD in the order the fetch asked");
  assert.equal(m.comparePage("b1", "h1"), "/compare/b1...h1", "three dots: what GitHub shows of a PR");
}

const HEAD_SHA = "a".repeat(40), BASE_SHA = "b".repeat(40);
const CONFIG = "remote.origin.url git@github.com:me/app.git\nremote.upstream.url https://github.com/org/app.git\nbranch.feat.remote origin\n";

// The page in a fake `herdr`: one or more spaces, the panel showing `page`, its slots. `w.gh(args)` answers gh as gh would;
// `w.hold(cmd, args)` keeps an answer back in `w.held` until released.
function makePage({ spaces, panes = [], slots = ["files", "panel-empty", "pulls", "review"], page = "pulls", open = true, store = new Map(),
  appDir = tempHome() } = {}) {
  const w = { spaces, panes, ran: [], commands: [], held: [], open, page, now: Date.parse("2026-01-01T01:00:00Z"), hold: null, fetched: null,
    lists: { branch: [card(7, "feat", "main", { headRepository: { nameWithOwner: "me/app" } }), card(9, "feat", "main", { headRepository: { nameWithOwner: "stranger/app" } })],
      open: [card(7, "feat", "main"), card(8, "feat-2", "feat"), card(5, "other", "main")], total: 3 },
    detail: (n) => ({ ...card(n, n === 8 ? "feat-2" : "feat", n === 8 ? "feat" : "main"), body: "Fixes **this**.", headRefOid: `h${n}`, baseRefOid: "b0", mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN", reviewDecision: null, latestOpinionatedReviews: { nodes: [] }, ...rollup([]) }),
    // What's been said on every PR, paged `pageSize` at a time and a thread's replies `replyPage` at a time, as GitHub would.
    talk: TALK(), pageSize: 100, replyPage: 100, boxes: [], editors: [], drawing: false };
  const sh = { "t3.panels": { s1: { tabs: [{ id: "pulls", born: 1 }], active: "pulls", open: true }, s2: { tabs: [{ id: "pulls", born: 2 }], active: "pulls", open: true } } };
  const answer = (cmd, args, o) => {
    const line = args.join(" ");
    if (cmd === "git" && line.includes("--show-toplevel")) return { code: 0, stdout: `${o.cwd === "/q" ? "/q" : "/r"}\n${w.head ?? "feat"}\n` };
    if (cmd === "git" && line.includes("--get-regexp")) return { code: 0, stdout: CONFIG };
    if (cmd === "git" && args.includes("fetch")) { w.fetched = args.slice(-2); return w.fetchFails ? { code: 1, stderr: "fatal: couldn't find remote ref\n" } : { code: 0, stdout: "" }; }
    if (cmd === "git" && line.includes("--git-path FETCH_HEAD")) return { code: 0, stdout: ".git/FETCH_HEAD\n" };
    if (cmd === "cat" && args[0] === ".git/FETCH_HEAD") return { code: 0, stdout: w.fetched.map((ref) => `${ref.startsWith("refs/pull/") ? HEAD_SHA : BASE_SHA}\t\t'${ref}' of org/app\n`).join("") };
    if (cmd === "jin.review") return { code: 0, stdout: "" };
    // The web, by address: what `w.web[src]` serves, written where curl's -o says; else curl's HTTP failure.
    if (cmd === "curl") {
      const got = w.web?.[args.at(-1)];
      if (!got) return { code: 22, stdout: "", stderr: "curl: (22) The requested URL returned error: 404\n" };
      fs.writeFileSync(args[args.indexOf("-o") + 1], got.bytes);
      return { code: 0, stdout: got.type };
    }
    if (cmd === "mv") { fs.renameSync(args.at(-2), args.at(-1)); return { code: 0, stdout: "" }; }
    if (cmd === "rm") { fs.rmSync(args.at(-1), { recursive: true, force: true }); return { code: 0, stdout: "" }; }
    if (cmd === "gh") {
      if (w.gh) return w.gh(args);
      const query = args.find((a) => a.startsWith("query=")) ?? "", number = Number(args.find((a) => a.startsWith("number="))?.slice(7));
      const field = (k) => args.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1);
      const ok = (data) => ({ code: 0, stdout: JSON.stringify({ data }) });
      if (args[1]?.startsWith("repos/") || query.startsWith("query=mutation")) {
        return w.writeFails ? { code: 1, stdout: "", stderr: "HTTP 502: Bad Gateway\n" } : { code: 0, stdout: "{}" };
      }
      const page = (all, cursor, size) => {
        const from = Number(cursor ?? 0), next = from + size < all.length;
        return { pageInfo: { hasNextPage: next, endCursor: next ? String(from + size) : null }, nodes: all.slice(from, from + size) };
      };
      if (query.includes("node(id:")) return ok({ node: { comments: page(w.talk.threads.find((t) => t.id === field("id")).comments, field("cursor"), w.replyPage) } });
      if (query.includes("reviewThreads(") || query.includes("after: $comments") || query.includes("after: $reviews")) {
        const pr = {};
        if (query.includes("after: $comments")) pr.comments = page(w.talk.comments, field("comments"), w.pageSize);
        if (query.includes("after: $reviews")) pr.reviews = page(w.talk.reviews, field("reviews"), w.pageSize);
        if (query.includes("after: $threads")) pr.threads = page(w.talk.threads.map((t) => ({ ...t, comments: page(t.comments, 0, w.replyPage) })), field("threads"), w.pageSize);
        return ok({ repository: { pullRequest: pr } });
      }
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
  const timers = [], everies = [], failed = [], queue = [];
  let wake = null;
  const send = (c) => { if (wake) { const x = wake; wake = null; x(c); } else queue.push(c); };
  const task = () => ({ cancel() {} });
  const cx = { notify() {}, stop_propagation() {}, focus_handle: () => ({ focus() {}, is_focused: () => false }), write_to_clipboard(text) { w.clipboard = text; },
    spawn(f) { Promise.resolve().then(() => f(cx)).catch((e) => failed.push(e)); return task(); },
    timer: { every(ms, f) { everies.push(f); return task(); }, after(ms, f) { timers.push(f); return task(); } } };
  // The page's real file work (its picture cache) is awaited itself, not given time: a loaded machine takes longer.
  const io = [];
  const disk = (p) => { io.push(p.catch(() => {})); return p; };
  const settle = async () => {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setImmediate(r));
      if (io.length) { await Promise.all(io.splice(0)); i = 0; }
    }
    if (failed.length) throw failed[0];
  };
  const tick = async () => { for (const f of everies) f(cx); await settle(); };
  // In a box: a fake element answers every property, `then` too, so awaited bare it would never settle.
  const draw = async () => {
    w.drawing = true;
    let root;
    try { root = view.render(cx); } finally { w.drawing = false; }
    for (const f of timers.splice(0)) f(cx);
    await settle();
    return { root };
  };
  const layout = () => ({ id: "root", children: [{ id: "work" }, { id: "panel", hidden: !w.open, children: [{ id: "panel-body", active: w.page, children: slots.map((id) => ({ id })) }] }] });
  const element = kit.elements({ args: "all" });
  class Clock extends Date { static now() { return w.now; } }
  const ctx = vm.createContext({ View: class {}, div: element, svg: element, image: (src) => element("image", src), h_flex: element, v_flex: element,
    Input: { new: element }, TextView: { markdown: (id, text) => element("markdown", text) }, Popup: { new: (id, trigger) => element().id(id).child(trigger) },
    InputState: { new: () => { let v = ""; return { on() {}, value: () => v, set_value(x) { v = x; }, focus() {} }; } },
    // A box the person types in with `type(text)`, as its change event would tell the page.
    TextareaState: { new: (o) => {
      let v = "";
      const box = { placeholder: o.placeholder, events: {}, focused: 0, on(name, f) { box.events[name] = f; }, value: () => v, focus() { box.focused++; }, set_auto_grow() {},
        set_value(x) { assert.ok(!w.drawing, "a box's text is set outside the draw"); v = x; }, type(x) { v = x; box.events.change?.({}, cx); } };
      w.boxes.push(box);
      return box;
    } },
    Textarea: { new: (state) => element("textarea", state) },
    // Each code view's editor, counted: made outside the draw (render-guard.cjs refuses it there), released once.
    EditorState: { new: (o) => {
      const e = { ...o, released: false, release() { assert.ok(!e.released, "an editor is released once"); e.released = true; return true; } };
      w.editors.push(e);
      return e;
    } },
    Editor: { new: (state) => element("editor", state) },
    ScrollHandle: { new: () => ({ release: () => true, offset: () => ({ x: 0, y: 0 }), viewport_size: () => ({ width: 0, height: 0 }), content_size: () => ({ width: 0, height: 0 }) }) },
    checking: () => false, spaces: () => w.spaces, panes: () => w.panes, focused: () => null, exec, theme: () => ({ foreground: "#ffffff", dim: "#888888", accent: "#0000ff", input: "#222222", ansi1: "#ff0000", ansi2: "#00ff00" }),
    window: () => ({ active: true, platform: "macos" }), nextCommand: () => queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => { wake = r; }), keys: () => [], settings: () => ({ zoom: 1, font_family: "Mono" }), layout,
    run: (name, args) => w.commands.push([name, args]), shared: (k) => sh[k], setShared: (k, v) => { sh[k] = v; },
    localStorage: { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) }, Date: Clock, Uint8Array,
    appHome: () => appDir,
    fs: { mkdir: (p, o) => disk(fs.promises.mkdir(p, o).then(() => {})), unlink: (p) => disk(fs.promises.unlink(p)),
      readFile: (p) => disk(fs.promises.readFile(p).then((b) => new Uint8Array(b))) }, Promise, Math, JSON, Map, Set, Object, Array, String, Number, Boolean, RegExp, Error });
  // panel-states.js names button.js's button drawButton, an alias the bundle's stripped imports lose.
  vm.runInContext(kit.bundle(read, "main.js", (file, src, needs) => file === "button.js" ? `${needs()}\n${kit.strip(src)}\nconst drawButton = button;` : null), ctx);
  const view = new ctx.Mod();
  view.init({}, cx);
  const activate = (id) => { w.spaces = w.spaces.map((s) => ({ ...s, active: s.id === id })); };
  return { view, cx, w, sh, store, appDir, settle, tick, draw, activate, send, st: (id = "s1") => view.states.get(id),
    refresh: () => ctx.refreshPage(view, cx), stateFor: (sp) => ctx.stateFor(view, sp) };
}

const said = (id, login, at, body, extra = {}) => ({ id, body, url: `https://github.com/org/app/pull/7#${id}`, createdAt: at, author: { login }, ...extra });
// A comment, an approval, a plain comment review with no words (says nothing), an unresolved thread and a resolved one.
const TALK = () => ({
  comments: [said("c1", "ann", "2026-01-01T00:10:00Z", "Looks close.")],
  reviews: [{ ...said("r1", "bo", "2026-01-01T00:05:00Z", ""), state: "APPROVED", submittedAt: "2026-01-01T00:05:00Z" },
    { ...said("r2", "cy", "2026-01-01T00:20:00Z", ""), state: "COMMENTED", submittedAt: "2026-01-01T00:20:00Z" }],
  threads: [
    { id: "T1", path: "src/a.js", line: 12, originalLine: 12, isResolved: false, isOutdated: false, viewerCanReply: true, viewerCanResolve: true, viewerCanUnresolve: true,
      comments: [said("t1a", "bo", "2026-01-01T00:30:00Z", "Why?", { diffHunk: Array.from({ length: 9 }, (_, i) => `+line ${i + 1}`).join("\n") })] },
    { id: "T2", path: "src/b.js", line: null, originalLine: 3, isResolved: true, isOutdated: true, viewerCanReply: true, viewerCanResolve: true, viewerCanUnresolve: true,
      comments: [said("t2a", "cy", "2026-01-01T00:01:00Z", "Fixed?"), said("t2b", "ann", "2026-01-01T00:02:00Z", "Yes.")] },
  ],
});

const space = (id, folder, active = false, machine = null) => ({ id, folder, machine, active, tabs: [{ id: `${id}-tab`, active: true }] });
const listReads = (w) => w.ran.filter((r) => r.cmd === "gh" && r.args.some((a) => a.includes("open: pullRequests"))).length;

async function reads() {
  const p = makePage({ spaces: [space("s1", "/r", true)], panes: [{ tab: "s1-tab", terminal: "t1", cwd: "/r/src" }], open: false });
  await p.tick();
  assert.equal(p.w.ran.filter((r) => r.cmd !== "rm").length, 0, "nothing is read while the page is hidden (the start only clears the picture cache)");
  p.w.open = true;
  let root = (await p.draw()).root;
  same(p.w.ran.filter((r) => r.cmd === "git").map((r) => [r.args.slice(3).join(" "), r.cwd, r.on]),
    [["rev-parse --show-toplevel --abbrev-ref HEAD", "/r/src", null], [`config --get-regexp ^(remote\\..*\\.url|branch\\..*\\.remote)$`, "/r/src", null]], "read in the tab's working folder");
  assert.ok(p.w.ran.find((r) => r.cmd === "gh").args.includes("owner=org"), "upstream's repository");
  root = (await p.draw()).root;
  same([p.st().branch.map((x) => x.number), p.st().openTotal], [[7], 3], "the fork's same-named branch is left out");
  assert.ok(find(root, "t3-pulls-detail"), "a branch's only PR shows its detail at once");
  assert.equal(find(root, "t3-pulls-back"), null, "with no list behind it to go back to");
  same(strings(find(root, "t3-pulls-title")), ["PR 7", "#7"], "the number right after the title");
  assert.ok(find(root, "t3-pulls-tab-branch"), "the switch stays: no list to go back to");
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

  // `open:<n>` (Issues' linked PRs): that PR's detail, as a row's pick.
  p.send("open:5"); await p.settle();
  root = (await p.draw()).root;
  assert.ok(find(root, "t3-pulls-detail-5"), "t3-pulls.open:5 shows #5");
  p.st().picked = null;

  // A space on another machine: its own read, there; Review takes it, fetched there, and pulls.review, a browser there, can't.
  p.w.spaces.push(space("s2", "/q", false, "vps"));
  p.activate("s2");
  root = (await p.draw()).root;
  same(p.w.ran.filter((r) => r.cmd === "git").slice(-2).map((r) => [r.cwd, r.on]), [["/q", "vps"], ["/q", "vps"]], "switching spaces reads the new one on its machine");
  root = (await p.draw()).root;
  assert.equal(p.view.pullsReason(p.st("s2"), p.w.spaces[1], ["pulls", "review"]), "pulls.review is unavailable on remote spaces: it opens in that machine's browser.");
  find(root, "t3-pulls-review").handlers.on_click({}, p.cx); await p.settle();
  same(p.w.ran.filter((r) => r.args.includes("fetch")).map((r) => r.on), ["vps"], "fetched on its machine");
  same([p.sh.review?.space, p.sh.review?.root], ["s2", "/q"], "and handed to Review for that space");
}

async function staleReads() {
  const p = makePage({ spaces: [space("s1", "/r", true)] });
  p.w.hold = (cmd, args) => cmd === "gh" && args.some((a) => a.includes("open: pullRequests"));
  await p.tick();
  assert.equal(p.w.held.length, 1);
  p.w.hold = null;
  p.w.lists = { ...p.w.lists, open: [card(11, "new", "main")], total: 1 };
  p.refresh(); await p.settle();
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

  // The tab's folder moves: once the tick sees it, what was asked for the folder before is dropped and the new one read.
  p.w.lists = { ...p.w.lists, open: [card(12, "old", "main")], total: 1 };
  p.w.hold = (cmd, args) => cmd === "gh" && args.some((a) => a.includes("open: pullRequests"));
  p.refresh(); await p.settle();
  p.w.panes = [{ tab: "s1-tab", terminal: "t1", cwd: "/r/elsewhere" }];
  await p.tick();
  assert.ok(p.w.ran.some((r) => r.cwd === "/r/elsewhere"), "the new folder is read");
  p.w.held.shift()(); await p.settle();
  same(p.st().open.map((x) => x.number), [11], "a read for the folder before doesn't land");
  p.w.hold = null;

  // A PR already picked reads its detail beside the lists, not after them.
  const q = makePage({ spaces: [space("s1", "/r", true)] });
  await q.tick();
  q.view.pick(q.st(), 5, q.cx); await q.settle();
  const before = detailReads(q.w);
  q.w.hold = (cmd, args) => cmd === "gh" && args.some((a) => a.includes("open: pullRequests"));
  q.refresh(); await q.settle();
  same([q.w.held.length, detailReads(q.w)], [1, before + 1], "#5 is read while the lists are still out");
}

async function reviewHandoff() {
  const p = makePage({ spaces: [space("s1", "/r", true)] });
  await p.tick(); await p.draw();
  let root = (await p.draw()).root;
  find(root, "t3-pulls-review").handlers.on_click({}, p.cx); await p.settle();
  const git = p.w.ran.filter((r) => (r.cmd === "git" && (r.args.includes("fetch") || r.args.includes("FETCH_HEAD"))) || r.cmd === "cat").map((r) => [[r.cmd, ...r.args.slice(r.cmd === "git" ? 3 : 0)].join(" "), r.cwd, r.on]);
  same(git, [["git fetch --no-tags --quiet upstream refs/pull/7/head refs/heads/main", "/r", null], ["git rev-parse --git-path FETCH_HEAD", "/r", null], ["cat .git/FETCH_HEAD", "/r", null]],
  "one fetch of the PR's head and its base from the remote that has it, in the repository's root, read back from FETCH_HEAD");
  same([p.sh.review.space, p.sh.review.root, p.sh.review.page], ["s1", "/r", `/compare/${BASE_SHA}...${HEAD_SHA}`], "Review asked for what GitHub shows");
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

  // ⋯: pulls.review (the fork's daemon, from the clone), GitHub, the link copied.
  const press = (id) => { const n = find(root, id); n.handlers["on_mouse_down:left"]({ bounds: { x: 0, y: 0, width: 24, height: 24 } }, p.cx); n.handlers.on_click({}, p.cx); };
  assert.equal(find(root, "t3-pulls-actions"), null, "no row of its own above the title");
  assert.ok(find(root, "t3-pulls-refresh") && find(root, "t3-pulls-review") && find(root, "t3-pulls-more"), "one header row: Refresh, Review, ⋯");
  press("t3-pulls-more");
  root = (await p.draw()).root;
  same(["t3-pulls-more-item-0", "t3-pulls-more-item-1", "t3-pulls-more-item-2"].map((id) => strings(find(root, id)).find((x) => /^(Open|Copy)/.test(x))),
    ["Open in pulls.review", "Open on GitHub", "Copy link"]);
  find(root, "t3-pulls-more-item-0").handlers.on_click({}, p.cx); await p.settle();
  const jin = p.w.ran.find((r) => r.cmd === "jin.review");
  same([jin.args, jin.cwd, p.view.menu], [["-d", "org/app#7"], "/r", null]);
  root = (await p.draw()).root;
  press("t3-pulls-more");
  root = (await p.draw()).root;
  find(root, "t3-pulls-more-item-2").handlers.on_click({}, p.cx);
  assert.equal(p.w.clipboard, "https://github.com/org/app/pull/7", "Copy link");
  root = (await p.draw()).root;
  press("t3-pulls-more");
  root = (await p.draw()).root;
  find(root, "t3-pulls").handlers["on_mouse_down:left"]({}, p.cx);
  assert.equal(p.view.menu, null, "a press elsewhere in the page closes it");
  root = (await p.draw()).root;
  press("t3-pulls-more");
  root = (await p.draw()).root;
  find(root, "t3-pulls").handlers.on_key_down({ key: "down" }, p.cx); find(root, "t3-pulls").handlers.on_key_down({ key: "down" }, p.cx);
  find(root, "t3-pulls").handlers.on_key_down({ key: "enter" }, p.cx); await p.settle();
  same(p.w.ran.at(-1).args, ["https://github.com/org/app/pull/7"], "keys: ↓ ↓ Enter opens it on GitHub");

  // No Review page in this layout: both greyed with the reason.
  const q = makePage({ spaces: [space("s1", "/r", true)], slots: ["files", "panel-empty", "pulls"] });
  await q.tick(); await q.draw();
  root = (await q.draw()).root;
  assert.equal(q.view.reviewReason(q.st(), ["files", "panel-empty", "pulls"]), "Review isn't installed: add the Review extra.");
  assert.equal(find(root, "t3-pulls-review").handlers.on_click, undefined);
  find(root, "t3-pulls-more").handlers.on_click({}, q.cx);
  root = (await q.draw()).root;
  same([find(root, "t3-pulls-more-item-0").style.opacity?.[0], find(root, "t3-pulls-more-item-0").handlers.on_click], [0.64, undefined], "pulls.review greyed in ⋯");
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
  p.refresh(); await p.settle();
  root = (await p.draw()).root;
  assert.ok(strings(find(root, "t3-pulls-error")).includes("GitHub: HTTP 502: Bad Gateway"), "any other failure is a bar with Retry");
  p.w.gh = null;
  find(root, "t3-pulls-error-retry").handlers.on_click({}, p.cx); await p.settle();
  root = (await p.draw()).root;
  assert.ok(find(root, "t3-pulls-detail") && !find(root, "t3-pulls-error"));
}

function sections() {
  const checks = (...kinds) => rollup(kinds.map((k, i) => ({ __typename: "CheckRun", name: `c${i}`, status: k === "running" ? "IN_PROGRESS" : "COMPLETED", conclusion: k === "running" ? null : k })));
  same([checks("SUCCESS", "SKIPPED"), checks("SUCCESS", "FAILURE"), checks("SUCCESS", "running"), rollup([])].map(m.checksOpenByDefault), [false, true, true, true],
    "Checks starts open only while one is failing or running, or there are none to hide");
  same(m.sectionSummary("checks", checks(...Array(33).fill("SUCCESS"), "SKIPPED")), { text: "33/33 passed", tone: "none" });
  same(m.sectionSummary("checks", checks("SUCCESS", "FAILURE", "TIMED_OUT", "running")), { text: "2 failing", tone: "danger" }, "failing before running");
  same(m.sectionSummary("checks", checks("SUCCESS", "running", "running", "running")), { text: "3 running", tone: "waiting" });
  const pr = { latestOpinionatedReviews: { nodes: [{ state: "APPROVED", author: { login: "bo" } }, { state: "COMMENTED", author: { login: "dee" } }] },
    reviewRequests: { nodes: [{ requestedReviewer: { login: "cy" } }] }, ...TALK() };
  same(m.sectionSummary("reviewers", pr), { text: "1/2 approved", tone: "none" }, "a plain comment isn't a review asked for");
  same(m.sectionSummary("comments", pr), { text: "4, 1 unresolved", tone: "waiting" });

  const entries = m.conversationEntries(TALK());
  same(entries.map((e) => e.id), ["r1", "c1", "T2", "T1"], "comments and reviews by time (a wordless comment review says nothing), then threads");
  same(entries.map((e) => e.kind ?? null), ["Approved", "Comment", null, null]);
  same([m.threadPlace(TALK().threads[0]), m.threadPlace(TALK().threads[1]), m.threadPlace({ path: "x" })], ["src/a.js:12", "src/b.js:3", "x"], "an outdated thread keeps its old line");
  same(m.hunkTail(TALK().threads[0].comments[0].diffHunk.split("\n")), ["+line 4", "+line 5", "+line 6", "+line 7", "+line 8", "+line 9"], "the hunk's last six lines");
  same([m.threadShut({ isResolved: true }), m.threadShut({ isOutdated: true }), m.threadShut({})], [true, true, false]);
}

const ghWrites = (w) => w.ran.filter((r) => r.cmd === "gh" && (r.args[1]?.startsWith("repos/") || r.args.some((a) => a.startsWith("query=mutation"))));
const detailReads = (w) => w.ran.filter((r) => r.cmd === "gh" && r.args.some((a) => a.includes("latestOpinionatedReviews"))).length;
const box = (w, placeholder) => w.boxes.find((b) => b.placeholder === placeholder);
const disabled = (node) => node.style.opacity?.[0] === 0.64 && !node.handlers.on_click;

async function conversation() {
  // Paging: every part on its own cursor until done, a long thread's later replies read too.
  {
    const p = makePage({ spaces: [space("s1", "/r", true)] });
    const talk = TALK();
    talk.comments = Array.from({ length: 5 }, (_, i) => said(`c${i}`, "ann", `2026-01-01T00:1${i}:00Z`, `n${i}`));
    talk.threads[0].comments = Array.from({ length: 5 }, (_, i) => said(`r${i}`, "bo", `2026-01-01T00:3${i}:00Z`, `reply ${i}`));
    Object.assign(p.w, { talk, pageSize: 2, replyPage: 2 });
    await p.tick(); await p.draw();
    const pr = p.st().details.get(7).pr;
    same([pr.comments.map((c) => c.id), pr.reviews.length, pr.threads.length, pr.threads.find((t) => t.id === "T1").comments.length, pr.conversationTruncated],
      [["c0", "c1", "c2", "c3", "c4"], 2, 2, 5, false]);
    const pages = p.w.ran.filter((r) => r.cmd === "gh" && r.args.some((a) => a.startsWith("query=") && a.includes("pullRequest(number: $number) { ") && !a.includes("latestOpinionated") && !a.includes("reviewRequests")))
      .map((r) => r.args.find((a) => a.startsWith("query=")));
    same(pages.map((q) => ["comments(", "reviews(", "reviewThreads("].filter((part) => q.includes(part))),
      [["comments(", "reviews(", "reviewThreads("], ["comments("], ["comments("]], "a part read to its end isn't asked for again");
    assert.ok(p.w.ran.some((r) => r.cmd === "gh" && r.args.includes("cursor=2") && r.args.includes("id=T1")), "the thread's later replies, from its cursor");
  }
  {
    const p = makePage({ spaces: [space("s1", "/r", true)] });
    p.w.talk.comments = Array.from({ length: 12 }, (_, i) => said(`c${i}`, "ann", `2026-01-01T00:${10 + i}:00Z`, `n${i}`));
    p.w.pageSize = 1;
    await p.tick(); await p.draw();
    const root = (await p.draw()).root;
    same([p.st().details.get(7).pr.comments.length, p.st().details.get(7).pr.conversationTruncated], [10, true], "ten pages at most");
    assert.ok(strings(root).some((s) => s.includes("the rest is on GitHub")), "and it says so");
  }

  const p = makePage({ spaces: [space("s1", "/r", true)] });
  await p.tick(); await p.draw();
  let root = (await p.draw()).root;
  same(strings(find(root, "t3-pulls-comments-head")).slice(0, 2), ["Comments", "4"], "its count in its heading");
  assert.ok(find(root, "t3-pulls-said-c1") && find(root, "t3-pulls-said-r1-link"), "a comment, a review, each with its link");
  assert.equal(find(root, "t3-pulls-said-r2"), null, "a wordless comment review says nothing");
  assert.ok(strings(find(root, "t3-pulls-thread-T1")).includes("src/a.js:12"));
  assert.ok(find(root, "t3-pulls-thread-T1-reply") && find(root, "t3-pulls-thread-T1-resolve"), "an unresolved thread: Reply and Resolve");
  assert.equal(find(root, "t3-pulls-thread-T2-t2a"), null, "a resolved thread starts shut");
  assert.ok(strings(find(root, "t3-pulls-thread-T2")).includes("cy, 2 comments"), "with a line saying what's in it");
  find(root, "t3-pulls-thread-T2-head").handlers.on_click({}, p.cx);
  root = (await p.draw()).root;
  assert.ok(find(root, "t3-pulls-thread-T2-t2a") && find(root, "t3-pulls-thread-T2-reopen") && !find(root, "t3-pulls-thread-T2-reply"), "unfolded: its comments and Reopen");
  assert.ok(find(root, "t3-pulls-comment-editor"), "a box for a new comment after the last thread");

  // What the viewer can't do isn't offered.
  p.w.talk.threads[0].viewerCanResolve = false; p.w.talk.threads[0].viewerCanReply = false;
  p.refresh(); await p.settle();
  root = (await p.draw()).root;
  assert.ok(!find(root, "t3-pulls-thread-T1-resolve") && !find(root, "t3-pulls-thread-T1-reply"));
  p.w.talk = TALK();
  p.refresh(); await p.settle();
  root = (await p.draw()).root;

  // Reply: typed text goes as a raw field, whatever it looks like; Send waits for words.
  find(root, "t3-pulls-thread-T1-reply").handlers.on_click({}, p.cx);
  root = (await p.draw()).root;
  const reply = box(p.w, "Reply");
  assert.ok(reply.focused && disabled(find(root, "t3-pulls-thread-T1-editor-send")), "Send waits for words");
  const tricky = `She said "hi" $(rm -rf ~) \`id\`\n@notes.txt`;
  reply.type(tricky);
  root = (await p.draw()).root;
  find(root, "t3-pulls-thread-T1-editor-send").handlers.on_click({}, p.cx); await p.settle();
  const sent = ghWrites(p.w).at(-1).args;
  same([sent.slice(0, 2), sent.slice(3).filter((_, i) => i !== 0)], [["api", "graphql"], ["-f", "id=T1", "-f", `body=${tricky}`]], "the body as one raw -f field");
  assert.ok(sent[2] === "-f" && sent[3].startsWith("query=mutation") && sent[3].includes("addPullRequestReviewThreadReply"));
  assert.ok(!sent.includes("-F"), "never -F, which would read @file, numbers and true");
  root = (await p.draw()).root;
  same([p.view.replyTo, reply.value(), p.view.drafts.size], [null, "", 0], "sent: the box closes and its draft goes");
  assert.equal(detailReads(p.w) >= 2, true, "and the detail is read again");

  // A new comment: REST, the body raw even when it reads as a number or a boolean.
  const comment = box(p.w, "Leave a comment");
  for (const text of ["42", "true", "@me"]) {
    comment.type(text);
    root = (await p.draw()).root;
    find(root, "t3-pulls-comment-editor-send").handlers.on_click({}, p.cx); await p.settle();
    same(ghWrites(p.w).at(-1).args, ["api", "repos/org/app/issues/7/comments", "--method", "POST", "-f", `body=${text}`]);
  }

  // A failure keeps the draft and says it may have gone through.
  p.w.writeFails = true;
  comment.type("Keep me");
  root = (await p.draw()).root;
  find(root, "t3-pulls-comment-editor-send").handlers.on_click({}, p.cx); await p.settle();
  root = (await p.draw()).root;
  same([comment.value(), p.view.drafts.get("org/app#7")], ["Keep me", "Keep me"]);
  assert.ok(strings(find(root, "t3-pulls-action-error")).some((s) => s.includes("refresh before sending it again")));
  assert.equal(ghWrites(p.w).filter((r) => r.args.includes("body=Keep me")).length, 1, "and never tries again by itself");
  p.w.writeFails = false;

  // Drafts survive a refresh and moving to another PR and back.
  p.refresh(); await p.settle();
  root = (await p.draw()).root;
  assert.equal(comment.value(), "Keep me");
  p.view.pick(p.st(), 5, p.cx); await p.settle();
  await p.draw(); await p.draw();
  assert.equal(comment.value(), "", "#5 has a draft of its own");
  p.view.pick(p.st(), 7, p.cx); await p.settle();
  await p.draw();
  root = (await p.draw()).root;
  assert.equal(comment.value(), "Keep me", "#7's comes back");

  // Resolve shows at once; while it's sent nothing else goes, and a read from before it doesn't land; Reopen undoes it.
  p.w.hold = (cmd, args) => cmd === "gh" && args.some((a) => a.includes("latestOpinionatedReviews"));
  p.refresh(); await p.settle();
  const readsBefore = p.w.held.length;
  assert.equal(readsBefore, 1, "a detail read under way");
  p.w.hold = (cmd, args) => cmd === "gh" && args.some((a) => a.includes("resolveReviewThread"));
  find(root, "t3-pulls-thread-T1-resolve").handlers.on_click({}, p.cx);
  const pr = p.st().details.get(7).pr;
  assert.equal(pr.threads.find((t) => t.id === "T1").isResolved, true, "resolved at once");
  root = (await p.draw()).root;
  assert.ok(disabled(find(root, "t3-pulls-comment-editor-send")) && disabled(find(root, "t3-pulls-thread-T1-reopen")), "nothing else is sent meanwhile");
  p.w.held.shift()(); await p.settle();
  assert.equal(p.st().details.get(7).pr, pr, "the read from before the write doesn't land");
  p.w.hold = null;
  p.w.talk.threads[0].isResolved = true;
  p.w.held.shift()(); await p.settle();
  root = (await p.draw()).root;
  assert.notEqual(p.st().details.get(7).pr, pr, "done: read again");
  assert.ok(find(root, "t3-pulls-thread-T1-reopen"), "Reopen where Resolve was, the thread left open");
  p.w.writeFails = true;
  find(root, "t3-pulls-thread-T1-reopen").handlers.on_click({}, p.cx);
  assert.equal(p.st().details.get(7).pr.threads.find((t) => t.id === "T1").isResolved, false, "Reopen shows at once too");
  await p.settle();
  assert.equal(p.st().details.get(7).pr.threads.find((t) => t.id === "T1").isResolved, true, "failed: put back");
  same(ghWrites(p.w).at(-1).args.slice(-2), ["-f", "id=T1"]);
  assert.ok(ghWrites(p.w).at(-1).args.some((a) => a.includes("unresolveReviewThread")));
  p.w.writeFails = false;

  // On another machine too: gh runs here.
  p.w.spaces.push(space("s2", "/q", false, "vps"));
  p.activate("s2");
  await p.draw(); await p.draw();
  root = (await p.draw()).root;
  box(p.w, "Leave a comment").type("From afar");
  root = (await p.draw()).root;
  find(root, "t3-pulls-comment-editor-send").handlers.on_click({}, p.cx); await p.settle();
  const far = ghWrites(p.w).at(-1);
  same([far.args.at(-1), far.on], ["body=From afar", null]);
}

async function sectionsKept() {
  const store = new Map(), run = (name, status, conclusion) => ({ __typename: "CheckRun", name, status, conclusion, detailsUrl: `https://ci/${name}` });
  const p = makePage({ spaces: [space("s1", "/r", true)], store });
  p.w.detail = (n) => ({ ...card(n, "feat", "main"), body: "", headRefOid: "h", baseRefOid: "b", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: null,
    latestOpinionatedReviews: { nodes: [] }, ...rollup([run("lint", "COMPLETED", "SUCCESS"), run("docs", "COMPLETED", "SKIPPED"), run("unit", "COMPLETED", "SUCCESS")]) });
  await p.tick(); await p.draw();
  let root = (await p.draw()).root;
  assert.ok(!find(root, "t3-pulls-checks-passed") && strings(find(root, "t3-pulls-checks-head-summary")).includes("2/2 passed"), "all passed: shut, its summary on the right");
  same(strings(find(root, "t3-pulls-status")), ["Ready to merge", "·", "2/2 checks", "·", "0/1 reviews"], "the verdict in words, then the counts");
  find(root, "t3-pulls-tally-checks").handlers.on_click({}, p.cx);
  root = (await p.draw()).root;
  assert.ok(find(root, "t3-pulls-checks-passed") && !find(root, "t3-pulls-checks-head-summary"), "the counts open their section");
  assert.ok(strings(find(root, "t3-pulls-checks-passed")).includes("2 passed · 1 skipped") && !find(root, "t3-pulls-check-0"), "the passed and skipped are one row, folded");
  find(root, "t3-pulls-checks-passed").handlers.on_click({}, p.cx);
  root = (await p.draw()).root;
  same(["t3-pulls-check-0", "t3-pulls-check-1", "t3-pulls-check-2"].map((id) => strings(find(root, id)).at(-1)), ["lint", "unit", "docs"], "opened in place, without words the icon says");
  find(root, "t3-pulls-comments-head").handlers.on_click({}, p.cx);
  same(JSON.parse(store.get("sections.open")), { checks: true, passed: true, comments: false });
  // Another PR, another run: the person's choices stand; a failing check has its own red row and the verdict says so.
  const q = makePage({ spaces: [space("s1", "/r", true)], store });
  q.w.detail = (n) => ({ ...p.w.detail(n), ...rollup([run("lint", "COMPLETED", "SUCCESS"), run("e2e", "COMPLETED", "FAILURE"), run("build", "IN_PROGRESS", null)]) });
  q.view.setTab(q.st() ?? q.stateFor(q.w.spaces[0]), "repo", q.cx);
  await q.tick(); q.view.pick(q.st(), 5, q.cx); await q.settle();
  root = (await q.draw()).root;
  same(strings(find(root, "t3-pulls-verdict")), ["Blocked: 1 check failing"]);
  same([strings(find(root, "t3-pulls-check-0")).at(-1), strings(find(root, "t3-pulls-check-1")).at(-1)], ["e2e", "build"], "the failing and the running first, each its own row");
  assert.equal(kit.walk(find(root, "t3-pulls-check-0")).find((x) => x.items.includes("e2e")).style.text_color?.[0], "#ff0000", "a failing check reads red");
  assert.ok(strings(find(root, "t3-pulls-check-2")).includes("lint") && strings(find(root, "t3-pulls-checks-passed")).includes("1 passed"), "the passed row stays open, as left");
  assert.ok(!find(root, "t3-pulls-comment-editor") && strings(find(root, "t3-pulls-comments-head-summary")).includes("4, 1 unresolved"), "Comments stays shut, saying what's in it");
}

const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w, h) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0]);
const curl = (src, to) => ["-fsSL", "--proto", "=https", "--max-time", "30", "--max-filesize", String(5 * 1024 * 1024), "-o", to, "-w", "%{content_type}", src];

async function picturesOnPage() {
  const id1 = "c523b8b3-e7f2-4520-bb42-8a68ab28c022", id2 = "6b723918-8152-463e-859c-6a1d71e4de16";
  const signed = (id, jwt) => `https://private-user-images.githubusercontent.com/1/9-${id}.png?jwt=${jwt}`;
  const body = `Intro\n\n![Chart](https://github.com/user-attachments/assets/${id1})\n\nMiddle\n\n<img width="300" alt="Settings" src="https://github.com/user-attachments/assets/${id2}" />\n`;
  let jwt = "A";
  const p = makePage({ spaces: [space("s1", "/r", true)] });
  const cache = path.join(p.appDir, "cache/t3-pulls");
  p.w.detail = (n) => ({ ...card(n, "feat", "main"), body, headRefOid: "h", baseRefOid: "b", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: null,
    latestOpinionatedReviews: { nodes: [] }, ...rollup([]),
    bodyHTML: n === 7 ? `<p>Intro</p><p><a href="#"><img src="${signed(id1, jwt)}" alt="Chart"></a></p><p>Middle</p><img width="300" alt="Settings" src="${signed(id2, jwt)}">` : "<p>Intro</p><p>Middle</p>" });
  p.w.web = { [signed(id1, "A")]: { type: "image/png", bytes: png(1600, 900) }, [signed(id2, "A")]: { type: "text/html; charset=utf-8", bytes: "<html>login</html>" } };
  const curls = () => p.w.ran.filter((r) => r.cmd === "curl");
  await p.tick(); await p.settle();
  assert.ok(p.w.ran.some((r) => r.cmd === "rm" && r.args.join(" ") === `-rf ${cache}`), "what a crash left is cleared at the start");
  p.w.open = false;
  await p.draw();
  assert.equal(curls().length, 0, "nothing is downloaded while the page is hidden");
  p.w.open = true;
  await p.draw();
  same(curls().map((r) => [r.args, r.on]).sort((a, b) => (a[0].at(-1) < b[0].at(-1) ? -1 : 1)),
    [[curl(signed(id2, "A"), `${cache}/${id2}.part`), null], [curl(signed(id1, "A"), `${cache}/${id1}.part`), null]], "each picture once, from its signed address, here");
  same(fs.readdirSync(cache), [`${id1}.png`], "kept by asset id; a page that isn't a picture is dropped");
  let root = (await p.draw()).root;
  const at = (i) => find(root, `t3-pulls-body-s1-7-image-${i}`), picture = (node) => kit.walk(node).find((x) => x.kind === "image");
  same([picture(at(1)).source, picture(at(1)).style.w, picture(at(1)).style.h], [`cache/t3-pulls/${id1}.png`, [384], [216]], "drawn as wide as the column, its shape kept");
  assert.ok(strings(at(3)).includes("Settings") && strings(at(3)).includes("Open image"), "failed: its alt text and a link");
  same(strings(find(root, "t3-pulls-body-s1-7")).filter((s) => s === "Chart"), [], "a picture drawn isn't also its alt text");
  p.view.width = 600;
  root = (await p.draw()).root;
  same([picture(at(1)).style.w, picture(at(1)).style.h], [[564], [317]]);
  at(1).handlers.on_click({}, p.cx); await p.settle();
  same(p.w.ran.at(-1).args, [`https://github.com/user-attachments/assets/${id1}`], "a click opens the original");

  // A later read signs every address anew: what's kept is drawn as it is, and the one that failed is tried once more.
  jwt = "B";
  p.refresh(); await p.settle();
  await p.draw(); await p.draw();
  same(curls().map((r) => r.args.at(-1)).slice(2), [signed(id2, "B")]);

  // GitHub's rendering doesn't line up: nothing is downloaded, a picture not already kept is its alt and a link.
  p.view.pick(p.st(), 5, p.cx); await p.settle();
  root = (await p.draw()).root;
  assert.equal(curls().length, 3);
  assert.ok(strings(find(root, "t3-pulls-body-s1-5-image-3")).includes("Open image"));
  assert.equal(picture(find(root, "t3-pulls-body-s1-5-image-1")).source, `cache/t3-pulls/${id1}.png`, "the same asset kept from #7 is drawn");

  await p.view.close();
  same(fs.readdirSync(cache), [], "the copy's files go when it stops");
}

// #3780's Screenshots: tables of pictures drawn as grids, their columns kept, each picture shrunk to its cell and fetched once.
async function pictureTablesOnPage() {
  const ids = ["en", "es", "pt", "a", "b"].map((s, i) => `c523b8b3-e7f2-4520-bb42-8a68ab28c0${i}${s.length}`);
  const asset = (i) => `https://github.com/user-attachments/assets/${ids[i]}`, signed = (i) => `https://private-user-images.githubusercontent.com/1/9-${ids[i]}.png?jwt=A`;
  const body = "## Screenshots\n\n| With code, en | With code, es | With code, pt |\n| --- | --- | --- |\n"
    + `| ![Invite, en](${asset(0)}) | ![Invite, es](${asset(1)}) | ![Invite, pt](${asset(2)}) |\n\n| Desktop | Mobile |\n| --- | --- |\n| ![a](${asset(3)}) | ![b](${asset(4)}) |\n`;
  const cellHtml = (tag, i) => `<${tag}><a href="#"><img src="${signed(i)}" alt="x"></a></${tag}>`;
  const p = makePage({ spaces: [space("s1", "/r", true)] });
  p.w.detail = (n) => ({ ...card(n, "feat", "main"), body, headRefOid: "h", baseRefOid: "b", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: null,
    latestOpinionatedReviews: { nodes: [] }, ...rollup([]),
    bodyHTML: `<h2>Screenshots</h2><table><thead><tr><th>With code, en</th><th>With code, es</th><th>With code, pt</th></tr></thead><tbody><tr>${[0, 1, 2].map((i) => cellHtml("td", i)).join("")}</tr></tbody></table>`
      + `<table><thead><tr><th>Desktop</th><th>Mobile</th></tr></thead><tbody><tr>${cellHtml("td", 3)}${cellHtml("td", 4)}</tr></tbody></table>` });
  p.w.web = Object.fromEntries(ids.map((_, i) => [signed(i), { type: "image/png", bytes: png(1600, 900) }]));
  await p.tick(); await p.settle();
  for (let i = 0; i < 4; i++) { await p.draw(); await p.settle(); }
  const curls = p.w.ran.filter((r) => r.cmd === "curl").map((r) => r.args.at(-1));
  same(curls.slice().sort(), ids.map((_, i) => signed(i)).sort(), "each picture fetched once, from its own signed address");
  const root = (await p.draw()).root, body1 = find(root, "t3-pulls-body-s1-7");
  const tables = kit.walk(body1).filter((x) => /^t3-pulls-body-s1-7-table-\d+$/.test(x.key ?? ""));
  same(tables.map((x) => x.items.length), [2, 2], "two grids: a header row and one row each");
  const cellsOf = (tid, r) => kit.walk(find(root, `${tid}-${r}`)).filter((x) => new RegExp(`^${tid}-${r}-\\d+$`).test(x.key ?? ""));
  same(tables.map((x) => cellsOf(x.key, "h").length), [3, 2], "the tables' columns kept");
  const texts = (node) => kit.walk(node).filter((x) => x.kind === "markdown");
  same(cellsOf(tables[0].key, "h").map((x) => texts(x).map((m) => [m.source, "font_semibold" in m.style])), [0, 1, 2].map((i) => [[`With code, ${["en", "es", "pt"][i]}`, true]]),
    "the header's text, semibold");
  same(cellsOf(tables[0].key, "h").map((x) => x.style.w), [[127], [127], [127]], "equal columns");
  const drawn = (tid, c) => kit.walk(find(root, `${tid}-0-${c}`)).find((x) => x.kind === "image");
  same([0, 1, 2].map((c) => [drawn(tables[0].key, c).source, drawn(tables[0].key, c).style.w, drawn(tables[0].key, c).style.h]),
    [0, 1, 2].map((i) => [`cache/t3-pulls/${ids[i]}.png`, [114], [64]]), "each in its column, as wide as the cell allows, its shape kept");
  same([drawn(tables[1].key, 1).style.w, drawn(tables[1].key, 1).style.h], [[178], [100]]);
  same(texts(body1).map((m) => m.source), ["## Screenshots\n\n", "With code, en", "With code, es", "With code, pt", "Desktop", "Mobile"], "no pipes left as text");
  find(root, `${tables[1].key}-0-1-image-0`).handlers.on_click({}, p.cx); await p.settle();
  same(p.w.ran.at(-1).args, [asset(4)], "a click opens the original");
  await p.view.close();
}

// Fenced code in code views: an editor each, made after a draw of the shown page that has it, kept while the same text is drawn,
// released once it isn't (a section shut, another PR), the page hidden or the copy closed. A ```diff block and a thread's hunk
// are a selectable code block, never an editor: an added line on a green wash, a removed one on red.
async function codeOnPage() {
  const p = makePage({ spaces: [space("s1", "/r", true)] });
  const long = `// ${"x".repeat(117)}`, many = Array.from({ length: 40 }, (_, i) => `echo ${i}`).join("\n");
  const bodies = { 7: `Intro\n\n\`\`\`ts\nconst a = 1;\n${long}\n\`\`\`\n\nThen\n~~~diff\n-a\n+b\n~~~\n- step\n  \`\`\`sh\n${many.replace(/^/gm, "  ")}\n  \`\`\`\n`, 5: "```py\nx = 1\n```\n" };
  p.w.detail = (n) => ({ ...card(n, "feat", "main"), body: bodies[n] ?? "", headRefOid: "h", baseRefOid: "b", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN",
    reviewDecision: null, latestOpinionatedReviews: { nodes: [] }, ...rollup([]) });
  const live = () => p.w.editors.filter((e) => !e.released).map((e) => [e.language ?? null, e.value]).sort((a, b) => (a[1] < b[1] ? -1 : 1));
  const both = [["js", `const a = 1;\n${long}`], ["sh", many]];
  await p.tick(); await p.settle();
  p.w.open = false;
  await p.draw(); await p.draw();
  assert.equal(p.w.editors.length, 0, "none made while the page is hidden");

  p.w.open = true;
  let root = (await p.draw()).root;
  const editorIn = (id) => kit.walk(find(root, id)).some((x) => x.kind === "editor");
  assert.ok(!editorIn("t3-pulls-body-s1-7-1") && strings(find(root, "t3-pulls-body-s1-7-1")).some((s) => s.startsWith("const a = 1;")), "plain until its editor is made");
  same(live(), both, "one editor a block, its language from the info string; none for the diff or the hunk");
  const e = p.w.editors[0];
  same([e.readonly, e.soft_wrap, e.line_numbers, e.folding, e.font_family, e.font_size], [true, true, false, false, "Mono", 12]);
  root = (await p.draw()).root;
  assert.ok(editorIn("t3-pulls-body-s1-7-1") && !editorIn("t3-pulls-body-s1-7-3") && !editorIn("t3-pulls-thread-T1-hunk"));
  // A diff is one selectable code block, each changed line washed by kind behind its text.
  const block = (id) => kit.walk(find(root, id)).find((x) => x.kind === "markdown");
  const washed = (id) => { const b = block(id), [from, to, color] = b.style.highlight_range; return [b.style.selectable, b.source.slice(from, to), color]; };
  same([washed("t3-pulls-body-s1-7-3"), washed("t3-pulls-thread-T1-hunk")], [[[true], "+b", "#00ff001c"], [[true], "+line 9", "#00ff001c"]], "the last range painted: an added line");
  assert.ok(block("t3-pulls-body-s1-7-3").source.includes("-a\n+b"));
  same(block("t3-pulls-thread-T1-hunk").source.split("\n").slice(1, -1), ["+line 4", "+line 5", "+line 6", "+line 7", "+line 8", "+line 9"], "the hunk's last rows");
  same(["t3-pulls-body-s1-7-1", "t3-pulls-body-s1-7-5"].map((id) => find(root, id).style.h), [[96], [316]],
    "a code view as high as its rows, a long line wrapped at the column, at most 15 rows");
  same(["t3-pulls-body-s1-7-3", "t3-pulls-thread-T1-hunk"].map((id) => [find(root, id).style.h, find(root, id).style.max_h]), [[undefined, [316]], [undefined, [316]]],
    "a diff as high as it draws, at most 15 rows");
  assert.ok(find(root, "t3-pulls-body-s1-7-5").handlers.on_scroll_wheel, "a drawn box has its handle, and with it the wheel");
  p.refresh(); await p.settle();
  await p.draw(); await p.draw();
  same([p.w.editors.length, live().length], [2, 2], "a re-read with the same text keeps its editors");

  p.view.sections = { ...p.view.sections, description: false };
  await p.draw();
  same(live(), [], "a shut section's go");
  p.view.sections = { ...p.view.sections, description: true };
  await p.draw();
  same(live(), both, "open again, made again");

  p.view.pick(p.st(), 5, p.cx); await p.settle();
  await p.draw(); await p.draw();
  same(live(), [["python", "x = 1"]], "another PR: the last one's go");
  p.w.open = false;
  await p.tick();
  same(live(), [], "hidden, none kept");
  p.w.open = true;
  await p.draw();
  assert.equal(live().length, 1);
  await p.view.close();
  same(live(), [], "the copy closing releases them all");
}

// Every empty list says why in one line; none is blank.
async function emptyStates() {
  const said = async (p, id) => { await p.tick(); await p.settle(); const root = (await p.draw()).root; return strings(find(root, id)).join(" "); };
  let p = makePage({ spaces: [space("s1", "/r", true)] });
  p.w.lists = { branch: [], open: [], total: 0 };
  assert.equal(await said(p, "t3-pulls-empty-branch"), "No pull request from feat.");
  p.view.setTab(p.st(), "repo", p.cx);
  assert.equal(await said(p, "t3-pulls-empty-repo"), "No open pull requests in org/app.");
  p = makePage({ spaces: [space("s1", "/r", true)] });
  p.view.setTab(p.stateFor(p.w.spaces[0]), "repo", p.cx);
  await p.tick();
  p.view.search.set_value("zzz");
  assert.equal(await said(p, "t3-pulls-empty-repo"), 'No pull requests match "zzz".');
  p = makePage({ spaces: [space("s1", "/r", true)] });
  p.w.head = "HEAD";
  assert.equal(await said(p, "t3-pulls-empty-branch"), "HEAD is detached: no branch to match.");
}

(async () => {
  await emptyStates();
  sections();
  forks();
  summaries();
  stacks();
  handoff();
  await reads();
  await staleReads();
  await reviewHandoff();
  await ghFailures();
  await conversation();
  await sectionsKept();
  await picturesOnPage();
  await pictureTablesOnPage();
  await codeOnPage();
  console.log("t3-pulls checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
