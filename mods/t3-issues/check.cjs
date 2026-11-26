// The Issues page outside Herdr: what Linear's and GitHub's answers mean (model.js), and the page in a fake `herdr` whose exec
// answers git, gh, curl and the key lookup's programs by their arguments, and whose fetch answers Linear.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const kit = require("./check-kit.js");
const { find, strings } = kit;
// A vm's values against this realm's, compared as JSON: their prototypes differ.
const json = (x) => x === undefined ? x : JSON.parse(JSON.stringify(x));
const same = (a, b, message) => assert.deepEqual(json(a), json(b), message);
const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");
const homes = [];
const tempHome = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "t3-issues-check-")); homes.push(d); return d; };
process.on("exit", () => { for (const d of homes) fs.rmSync(d, { recursive: true, force: true }); });

const m = (() => {
  const c = vm.createContext({});
  vm.runInContext(`${kit.strip(read("model.js"))}\nglobalThis.m = { identifiersIn, branchCandidates, branchIssueNumber, searchFilter, identifierFilter, fromLinear, fromGitHub,
    commentThreads, workflowOrder, sectionSummary, keyProblem, initials, linearState };`, c);
  return c.m;
})();

const KEY = "lin_api_SECRET123";
const STATES = [{ id: "s-todo", name: "Todo", type: "unstarted", color: "#aaaaaa", position: 1 }, { id: "s-doing", name: "In Progress", type: "started", color: "#f0bf00", position: 2 },
  { id: "s-done", name: "Done", type: "completed", color: "#5e6ad2", position: 3 }, { id: "s-back", name: "Backlog", type: "backlog", color: "#bbbbbb", position: 0 }];
const PIC = "https://uploads.linear.app/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/f.png?signature=S";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 2, 0, 0, 0, 1, 0, 8, 6, 0, 0, 0]);
const lin = (n, extra = {}) => ({ id: `id-${n}`, identifier: `ENG-${n}`, title: `Issue ${n}`, url: `https://linear.app/x/issue/ENG-${n}`, priority: 2,
  updatedAt: "2026-01-01T00:00:00Z", state: STATES[1], assignee: { name: "Ann Lee" }, team: { id: "team", key: "ENG" }, ...extra });
const linComment = (id, body, parent = null) => ({ id, body, url: `https://linear.app/c/${id}`, createdAt: "2026-01-01T00:10:00Z", user: { displayName: "bo" }, parent: parent ? { id: parent } : null });
const linFull = (n, comments) => lin(n, { description: `Steps\n\n![shot](${PIC})`, labels: { nodes: [{ name: "bug", color: "#ff0000" }] }, project: { name: "Launch" }, cycle: { number: 3, name: null },
  attachments: { nodes: [{ title: "Fix it", url: "https://github.com/org/app/pull/7", metadata: { status: "open" } }, { title: "Other", url: "https://github.com/else/lib/pull/3", metadata: {} }, { title: "Doc", url: "https://notion.so/x", metadata: {} }] },
  comments, team: { id: "team", key: "ENG", states: { nodes: STATES } } });
const ghIssue = (n, extra = {}) => ({ number: n, title: `GH ${n}`, url: `https://github.com/org/app/issues/${n}`, state: "OPEN", stateReason: null, updatedAt: "2026-01-01T00:00:00Z",
  assignees: { nodes: [{ login: "ann" }] }, ...extra });

function model() {
  same(m.identifiersIn("feat/eng-12-and-ENG-12-ops-3"), ["ENG-12", "OPS-3"]);
  same(m.branchCandidates("feat/eng-12-x", "branch.feat/eng-12-x.herdr-issue ENG-9,ops-2\nbranch.other.herdr-issue ENG-1\nremote.origin.url x"), ["ENG-9", "OPS-2", "ENG-12"],
    "a branch's binding first, then the names in it; another branch's binding isn't this one's");
  same(m.branchCandidates("a-1-b-2-c-3-d-4-e-5", ""), ["A-1", "B-2", "C-3", "D-4"], "a few at most");
  same([m.branchIssueNumber("123-fix"), m.branchIssueNumber("feat/45-x"), m.branchIssueNumber("feat/v2"), m.branchIssueNumber("release-1.2"), m.branchIssueNumber(null)], [123, 45, null, null, null]);
  same(m.searchFilter("#12").or.slice(2), [{ number: { eq: 12 } }]);
  same(m.searchFilter("eng-7").or.at(-1), { and: [{ team: { key: { eqIgnoreCase: "eng" } } }, { number: { eq: 7 } }] });
  same(m.searchFilter("login bug").or, [{ title: { containsIgnoreCase: "login bug" } }, { description: { containsIgnoreCase: "login bug" } }]);
  const full = m.fromLinear(linFull(5, { nodes: [linComment("c1", "a"), linComment("c2", "b", "c1"), linComment("c3", "c")] }));
  same([full.ref, full.state.icon, full.state.color, full.assignee, full.cycle, full.prs.map((p) => `${p.repo}#${p.number}`)], ["ENG-5", "circle-dot", "#f0bf00", "Ann Lee", "Cycle 3", ["org/app#7", "else/lib#3"]],
    "a PR attachment, wherever it lives; a link that isn't a PR isn't one");
  same(m.commentThreads(full).map((t) => t.map((c) => c.id)), [["c1", "c2"], ["c3"]], "replies under their comment");
  assert.equal(m.commentThreads(full), m.commentThreads(full), "threaded once per issue object");
  const orphan = m.fromLinear(linFull(6, { nodes: [linComment("r1", "a", "gone"), linComment("r2", "b", "r1"), linComment("r3", "c", "r1")] }));
  same(m.commentThreads(orphan).map((t) => t.map((c) => c.id)), [["r1", "r2", "r3"]], "a reply to a comment not read is a thread of its own");
  same(m.workflowOrder(full.states).map((s) => s.name), ["Backlog", "Todo", "In Progress", "Done"]);
  const gh = m.fromGitHub(ghIssue(9, { state: "CLOSED", stateReason: "NOT_PLANNED", closedByPullRequestsReferences: { nodes: [{ number: 4, title: "t", url: "u", state: "MERGED", repository: { nameWithOwner: "org/app" } }] } }), "org/app");
  same([gh.ref, gh.state.name, gh.state.icon, gh.prs[0].status], ["#9", "Not planned", "circle-x", "merged"]);
  same([m.sectionSummary("prs", full), m.sectionSummary("comments", full)], ["2 linked", "3 comments"]);
  same([m.initials("Ann Lee"), m.initials("bo"), m.initials("")], ["AL", "B", ""]);
  assert.match(m.keyProblem("missing").detail, /Keychain/);
}

const CONFIG = "remote.origin.url git@github.com:me/app.git\nremote.upstream.url https://github.com/org/app.git\nbranch.feat/eng-12-x.herdr-issue ENG-9\n";

// The page in a fake `herdr`: `w.key` where the lookup finds it ("keychain", "env", "shell" or none), Linear by `w.linear`.
function makePage({ spaces, branch = "feat/eng-12-x", key = "keychain", open = true, platform = "macos", store = new Map() } = {}) {
  const w = { spaces, ran: [], fetches: [], commands: [], held: [], open, branch, key, hold: null, web: { [PIC]: { type: "image/png", bytes: PNG } }, writeFails: false,
    named: [lin(9)], mine: [lin(9), lin(4)], search: [lin(31)], details: { "id-9": () => linFull(9, { pageInfo: { hasNextPage: false }, nodes: [linComment("c1", "Hi"), linComment("c2", "Re", "c1")] }) },
    gh: { issues: { 12: ghIssue(12, { body: "GH body", bodyHTML: "<p>GH body</p>", comments: { pageInfo: { hasNextPage: false }, nodes: [] } }) }, mine: [ghIssue(12), ghIssue(3)] } };
  const sh = { "t3.panels": { s1: { tabs: [{ id: "issues", born: 1 }], active: "issues", open: true } } };
  const answer = (cmd, args, o) => {
    const line = args.join(" ");
    if (cmd === "security") return w.key === "keychain" ? { code: 0, stdout: `${KEY}\n` } : { code: 44, stdout: "", stderr: "not found" };
    if (cmd === "printenv") return args[0] === "SHELL" ? { code: 0, stdout: "/bin/zsh\n" } : w.key === "env" ? { code: 0, stdout: `${KEY}\n` } : { code: 1, stdout: "" };
    if (cmd === "/bin/zsh") return { code: 0, stdout: `Welcome!\n${w.key === "shell" ? KEY : ""}` };
    if (cmd === "git" && line.includes("--show-toplevel")) return { code: 0, stdout: `/r\n${w.branch}\n` };
    if (cmd === "git" && line.includes("--get-regexp")) return { code: 0, stdout: CONFIG };
    if (cmd === "gh") {
      const query = args.find((a) => a.startsWith("query=")) ?? "", field = (k) => args.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1);
      if (query.includes("search(type: ISSUE")) return { code: 0, stdout: JSON.stringify({ data: { search: { issueCount: w.gh.mine.length, nodes: w.gh.mine } } }) };
      const issue = w.gh.issues[Number(field("number"))];
      if (!issue) return { code: 1, stdout: "", stderr: "gh: Could not resolve to an Issue with the number of 99.\n" };
      return { code: 0, stdout: JSON.stringify({ data: { repository: { issue } } }) };
    }
    if (cmd === "curl") {
      const got = w.web[args.at(-1)];
      if (!got) return { code: 22, stdout: "" };
      fs.writeFileSync(args[args.indexOf("-o") + 1], got.bytes);
      return { code: 0, stdout: got.type };
    }
    if (cmd === "mv") { fs.renameSync(args.at(-2), args.at(-1)); return { code: 0, stdout: "" }; }
    if (cmd === "rm") { fs.rmSync(args.at(-1), { recursive: true, force: true }); return { code: 0, stdout: "" }; }
    return { code: 0, stdout: "" };
  };
  const exec = async (cmd, args, o = {}) => {
    w.ran.push({ cmd, args, cwd: o.cwd ?? null, on: o.on ?? null });
    const r = answer(cmd, args, o);
    return w.hold?.(cmd, args) ? new Promise((go) => w.held.push(() => go(r))) : r;
  };
  // Linear: by what the query asks.
  const linear = ({ query, variables }) => {
    if (query.startsWith("mutation")) return w.writeFails ? { errors: [{ message: "Something broke" }] } : { data: { issueUpdate: { success: true }, commentCreate: { success: true } } };
    if (query.includes("orderBy: updatedAt")) return { data: { issues: { pageInfo: { hasNextPage: false }, nodes: variables.filter.or ? w.search : w.mine } } };
    if (query.includes("issues(filter")) return { data: { issues: { nodes: w.named } } };
    if (query.includes("after: $after")) return { data: { issue: { comments: w.commentPage(variables.after) } } };
    return { data: { issue: w.details[variables.id]() } };
  };
  const fetch = async (url, o) => {
    const call = { url, headers: o.headers, body: JSON.parse(o.body) };
    w.fetches.push(call);
    const r = linear(call.body), res = { status: 200, ok: true, url, json: async () => r, text: async () => JSON.stringify(r) };
    return w.hold?.("fetch", [call.body.query]) ? new Promise((go) => w.held.push(() => go(res))) : res;
  };
  const timers = [], everies = [], failed = [], io = [], queue = [];
  let wake = null;
  const task = () => ({ cancel() {} });
  const cx = { notify() {}, stop_propagation() {}, focus_handle: () => ({ focus() {}, is_focused: () => false }), write_to_clipboard(text) { w.clipboard = text; },
    spawn(f) { Promise.resolve().then(() => f(cx)).catch((e) => failed.push(e)); return task(); },
    timer: { every(ms, f) { everies.push(f); return task(); }, after(ms, f) { timers.push(f); return task(); } } };
  const disk = (p) => { io.push(p.catch(() => {})); return p; };
  const settle = async () => {
    for (let i = 0; i < 30; i++) { await new Promise((r) => setImmediate(r)); if (io.length) { await Promise.all(io.splice(0)); i = 0; } }
    if (failed.length) throw failed[0];
  };
  const tick = async () => { for (const f of everies) f(cx); await settle(); };
  const draw = async () => {
    w.drawing = true;
    let root;
    try { root = view.render(cx); } finally { w.drawing = false; }
    for (const f of timers.splice(0)) f(cx);
    await settle();
    return { root };
  };
  const body = { id: "panel-body", active: "issues", children: ["files", "panel-empty", "pulls", "issues"].map((id) => ({ id })) };
  const layout = () => ({ id: "root", children: [{ id: "work" }, { id: "panel", hidden: !w.open, children: [body] }] });
  const element = kit.elements({ args: "all" }), appDir = tempHome();
  const ctx = vm.createContext({ View: class {}, div: element, svg: element, image: (src) => element("image", src), h_flex: element, v_flex: element,
    Input: { new: element }, TextView: { markdown: (id, text) => element("markdown", text) }, Popup: { new: (id, trigger) => element().id(id).child(trigger) },
    Popover: { new: (id) => element("popover").id(id) },
    InputState: { new: () => { let v = ""; const s = { events: {}, on(n, f) { s.events[n] = f; }, value: () => v, set_value(x) { v = x; }, focus() {}, type(x) { v = x; s.events.change?.({}, cx); } }; w.searchBox = s; return s; } },
    TextareaState: { new: (o) => {
      let v = "";
      const b = { placeholder: o.placeholder, events: {}, on(n, f) { b.events[n] = f; }, value: () => v, focus() {}, set_auto_grow() {},
        set_value(x) { assert.ok(!w.drawing, "a box's text is set outside the draw"); v = x; }, type(x) { v = x; b.events.change?.({}, cx); } };
      (w.boxes ??= []).push(b);
      return b;
    } },
    Textarea: { new: (state) => element("textarea", state) },
    checking: () => false, spaces: () => w.spaces, panes: () => [], focused: () => null, exec, fetch, theme: () => ({ foreground: "#ffffff", dim: "#888888", accent: "#0000ff", input: "#222222", ansi1: "#ff0000" }),
    window: () => ({ active: true, platform }), nextCommand: () => queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => { wake = r; }), keys: () => [], settings: () => ({ zoom: 1, font_family: "Mono" }), layout,
    run: (name, args) => { w.commands.push([name, args]); if (name === "layout.select") body.active = args.child; }, shared: (k) => sh[k], setShared: (k, v) => { sh[k] = v; },
    props: () => null, closeOverlay() {},
    localStorage: { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) }, Uint8Array, appHome: () => appDir,
    fs: { mkdir: (p, o) => disk(fs.promises.mkdir(p, o).then(() => {})), unlink: (p) => disk(fs.promises.unlink(p)), readFile: (p) => disk(fs.promises.readFile(p).then((b) => new Uint8Array(b))) },
    Date, Promise, Math, JSON, Map, Set, Object, Array, String, Number, Boolean, RegExp, Error });
  // panel-states.js names button.js's button drawButton, an alias the bundle's stripped imports lose.
  vm.runInContext(kit.bundle(read, "main.js", (file, src, needs) => file === "button.js" ? `${needs()}\n${kit.strip(src)}\nconst drawButton = button;` : null), ctx);
  const view = new ctx.Mod();
  view.init({}, cx);
  const send = (c) => { if (wake) { const x = wake; wake = null; x(c); } else queue.push(c); };
  return { view, cx, w, sh, store, appDir, body, settle, tick, draw, send, st: (id = "s1") => view.states.get(id) };
}

const space = (id, folder, active = false, machine = null) => ({ id, folder, machine, active, tabs: [{ id: `${id}-tab`, active: true }] });
// Nowhere but the Authorization header: no program's arguments, no drawn text, no request body.
const keyKept = (p, root) => {
  assert.ok(!p.w.ran.some((r) => [r.cmd, ...r.args].join(" ").includes(KEY)), "the key is in no program's arguments");
  assert.ok(!strings(root).some((s) => String(s).includes(KEY)), "nor drawn");
  assert.ok(p.w.fetches.every((f) => f.headers.Authorization === KEY && !JSON.stringify(f.body).includes(KEY)), "only ever the Authorization header, the key itself");
};

async function keys() {
  for (const [where, platform, programs] of [["keychain", "macos", ["security"]], ["env", "macos", ["security", "printenv"]], ["shell", "macos", ["security", "printenv", "printenv", "/bin/zsh"]],
    ["env", "linux", ["printenv"]]]) {
    const p = makePage({ spaces: [space("s1", "/r", true)], key: where, platform });
    await p.tick(); await p.settle();
    const looked = p.w.ran.filter((r) => ["security", "printenv", "/bin/zsh"].includes(r.cmd));
    same(looked.map((r) => r.cmd), programs, `the key from the ${where} on ${platform}, nothing looked at past it`);
    if (where === "shell") same(looked.at(-1).args, ["-lic", 'printf "\\n%s" "$LINEAR_API_KEY"'], "a login shell's export, its last line");
    assert.equal(p.view.key, KEY);
    const root = (await p.draw()).root;
    keyKept(p, root);
  }
  // None: how to add one, Try again, and GitHub's issues meanwhile.
  const p = makePage({ spaces: [space("s1", "/r", true)], key: null, branch: "12-fix" });
  await p.tick();
  let root = (await p.draw()).root;
  assert.ok(strings(root).includes("No Linear API key") && strings(root).some((s) => s.includes("security add-generic-password")));
  assert.equal(p.w.fetches.length, 0, "Linear isn't asked without a key");
  find(root, "t3-issues-use-github").handlers.on_click({}, p.cx); await p.settle();
  root = (await p.draw()).root;
  assert.ok(find(root, "t3-issues-detail") && strings(root).includes("GH 12"), "GitHub: the branch's issue, 12-fix, at once");
  assert.ok(strings(find(root, "t3-issues-github")).includes("Try Linear again"));
  assert.equal(p.st().provider.id, "github", "the read's provider is GitHub's");
  const search = p.w.ran.find((r) => r.cmd === "gh" && r.args.some((a) => a.includes("search(type: ISSUE")));
  same(search.args.filter((a) => a.startsWith("q=")), ["q=repo:org/app is:issue is:open assignee:@me sort:updated-desc"], "Mine: open, assigned to the viewer, in upstream's repository");
  // A key now: Try Linear again.
  p.w.key = "keychain";
  const asked = p.w.fetches.length;
  find(root, "t3-issues-github-linear").handlers.on_click({}, p.cx); await p.settle();
  same([p.view.source(), p.st().provider.id], ["linear", "linear"]);
  assert.ok(p.w.fetches.length > asked, "and its lists come from Linear");
}

async function linearPage() {
  const p = makePage({ spaces: [space("s1", "/r", true)], open: false });
  await p.tick();
  same([p.w.ran.filter((r) => r.cmd !== "rm").length, p.w.fetches.length], [0, 0], "nothing is read while the page is hidden");
  p.w.open = true;
  await p.tick(); await p.settle();
  const named = p.w.fetches.find((f) => !f.body.query.includes("orderBy") && f.body.query.includes("issues(filter"));
  same(named.body.variables.filter.or.map((x) => [x.and[0].team.key.eqIgnoreCase, x.and[1].number.eq]), [["ENG", 9], ["ENG", 12]], "the branch's binding, then the name in it");
  assert.equal(p.w.fetches[0].headers["public-file-urls-expire-in"], "600", "upload addresses come back signed");
  let root = (await p.draw()).root;
  assert.ok(find(root, "t3-issues-detail") && !find(root, "t3-issues-back"), "the branch's only issue, at once");
  same(strings(find(root, "t3-issues-facts")).filter((s) => s !== "·"), ["In Progress", "Ann Lee", "High", "Launch", "Cycle 3"]);
  same(strings(find(root, "t3-issues-thread-c1")).filter((s) => ["Hi", "Re"].includes(s)), [], "bodies are markdown elements");
  assert.ok(find(root, "t3-issues-thread-c1-c2") && find(root, "t3-issues-thread-c1-reply") && find(root, "t3-issues-comment-editor"));

  // Linked PRs: this repository's in Pull requests, another's in the browser.
  find(root, "t3-issues-pr-0").handlers.on_click({}, p.cx); await p.settle();
  same(p.w.commands.filter(([n]) => n.startsWith("t3-pulls.") || n === "layout.select").map(([n, a]) => n === "layout.select" ? a.child : n), ["pulls", "t3-pulls.open:7"]);
  p.body.active = "issues";
  find(root, "t3-issues-pr-1").handlers.on_click({}, p.cx); await p.settle();
  same(p.w.ran.at(-1).args, ["https://github.com/else/lib/pull/3"]);

  // A picture: from its own signed address; the key goes nowhere near curl.
  await p.draw();
  root = (await p.draw()).root;
  const curl = p.w.ran.find((r) => r.cmd === "curl");
  same([curl.args.at(-1), curl.args.at(curl.args.indexOf("-o") + 1)], [PIC, `${p.appDir}/cache/t3-issues/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.part`]);
  assert.ok(kit.walk(root).some((x) => x.kind === "image" && x.source === "cache/t3-issues/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png"));
  keyKept(p, root);

  // State: at once, back when Linear refuses; read again when it takes it.
  const issue = () => p.st().details.get("id-9").issue;
  p.w.writeFails = true;
  p.view.write(p.st(), issue(), { kind: "state", target: STATES[2] }, p.cx);
  assert.equal(issue().state.name, "Done", "the state shows at once");
  await p.settle();
  same([issue().state.name, p.st().actionError], ["In Progress", "Linear: Something broke"], "refused: put back, saying why");
  p.w.writeFails = false;
  const reads = () => p.w.fetches.filter((f) => f.body.query.includes("issue(id: $id)")).length, before = reads();
  p.view.write(p.st(), issue(), { kind: "state", target: STATES[2] }, p.cx); await p.settle();
  const update = p.w.fetches.filter((f) => f.body.query.includes("issueUpdate")).at(-1);
  same(update.body.variables, { id: "id-9", stateId: "s-done" });
  assert.equal(reads(), before + 1, "taken: the issue is read again");

  // The header's state menu and ⋯, drawn in the page under their triggers.
  root = (await p.draw()).root;
  assert.ok(find(root, "t3-issues-refresh") && find(root, "t3-issues-state") && find(root, "t3-issues-more"), "one header row: Refresh, the state, ⋯");
  assert.equal(find(root, "t3-issues-actions"), null, "no row of its own above the title");
  same(strings(find(root, "t3-issues-title")), ["Issue 9", "ENG-9"], "the identifier right after the title");
  const press = (id) => { const n = find(root, id); n.handlers["on_mouse_down:left"]({ bounds: { x: 0, y: 0, width: 24, height: 24 } }, p.cx); n.handlers.on_click({}, p.cx); };
  press("t3-issues-state");
  root = (await p.draw()).root;
  same(["t3-issues-state-item-0", "t3-issues-state-item-1", "t3-issues-state-item-2", "t3-issues-state-item-3"].map((id) => strings(find(root, id)).find((s) => STATES.some((x) => x.name === s))),
    ["Backlog", "Todo", "In Progress", "Done"], "the team's states, in the order work moves");
  const updates = () => p.w.fetches.filter((f) => f.body.query.includes("issueUpdate"));
  const sentBefore = updates().length;
  find(root, "t3-issues-state-item-2").handlers.on_click({}, p.cx); await p.settle();
  same([p.view.menu, updates().length], [null, sentBefore], "picking the state it's in closes the menu, nothing sent");
  root = (await p.draw()).root;
  press("t3-issues-state");
  root = (await p.draw()).root;
  find(root, "t3-issues-state-item-1").handlers.on_click({}, p.cx); await p.settle();
  same([p.view.menu, updates().at(-1).body.variables.stateId], [null, "s-todo"], "picking another closes the menu and sets it");
  root = (await p.draw()).root;
  press("t3-issues-more");
  root = (await p.draw()).root;
  find(root, "t3-issues-more-item-1").handlers.on_click({}, p.cx);
  same(p.w.clipboard, "https://linear.app/x/issue/ENG-9", "⋯ Copy link");
  root = (await p.draw()).root;
  press("t3-issues-more");
  root = (await p.draw()).root;
  const key = (k) => find(root, "t3-issues").handlers.on_key_down({ key: k }, p.cx);
  const ran = p.w.ran.length;
  key("enter"); await p.settle();
  same([p.view.menu?.id, p.w.ran.length], ["t3-issues-more", ran], "opened by the pointer nothing's lit, so Enter picks nothing");
  key("down"); key("enter"); await p.settle();
  same([p.view.menu, p.w.ran.at(-1).args], [null, ["https://linear.app/x/issue/ENG-9"]], "↓ lights the first row, Enter opens it in Linear");

  // Comment and reply: the typed text only in the request's JSON, never touched; a failure keeps the draft.
  const tricky = `She said "hi" $(rm -rf ~) \`id\`\n@notes 42 true`;
  root = (await p.draw()).root;
  const box = p.w.boxes.find((b) => b.placeholder === "Leave a comment");
  box.type(tricky);
  root = (await p.draw()).root;
  find(root, "t3-issues-comment-editor-send").handlers.on_click({}, p.cx); await p.settle();
  same(p.w.fetches.filter((f) => f.body.query.includes("commentCreate")).at(-1).body.variables, { input: { issueId: "id-9", body: tricky } });
  assert.equal(box.value(), "", "sent: the draft goes");
  find(root, "t3-issues-thread-c1-reply").handlers.on_click({}, p.cx);
  root = (await p.draw()).root;
  const reply = p.w.boxes.find((b) => b.placeholder === "Reply");
  reply.type("Thanks");
  p.w.writeFails = true;
  root = (await p.draw()).root;
  find(root, "t3-issues-thread-c1-editor-send").handlers.on_click({}, p.cx); await p.settle();
  same(p.w.fetches.filter((f) => f.body.query.includes("commentCreate")).at(-1).body.variables, { input: { issueId: "id-9", body: "Thanks", parentId: "c1" } });
  same([reply.value(), p.view.drafts.get("id-9:c1")], ["Thanks", "Thanks"]);
  assert.match(p.st().actionError, /may have gone through/);
  assert.equal(p.w.fetches.filter((f) => f.body.query.includes("commentCreate") && f.body.variables.input.body === "Thanks").length, 1, "never sent again by itself");
  p.w.writeFails = false;
  keyKept(p, (await p.draw()).root);

  // Mine, then a search: the last keystroke's only, once typing pauses; the query in flight isn't asked again.
  p.view.setTab(p.st(), "mine", p.cx);
  root = (await p.draw()).root;
  assert.ok(find(root, "t3-issues-row-id-4") && find(root, "t3-issues-search-field"));
  const searches = () => p.w.fetches.filter((f) => f.body.query.includes("orderBy") && f.body.variables.filter.or).map((f) => f.body.variables.filter.or.at(-1));
  for (const q of ["e", "eng", "eng-31"]) p.w.searchBox.type(q);
  await p.draw();
  same(searches(), [{ and: [{ team: { key: { eqIgnoreCase: "eng" } } }, { number: { eq: 31 } }] }]);
  root = (await p.draw()).root;
  assert.ok(find(root, "t3-issues-row-id-31") && !find(root, "t3-issues-row-id-4"), "its results in place of the person's own");
  p.w.hold = (cmd, args) => cmd === "fetch" && args[0].includes("orderBy");
  p.w.searchBox.type("login"); await p.draw();
  p.w.searchBox.type("login "); await p.draw();
  assert.equal(searches().length, 2);
  p.w.hold = null; p.w.held.shift()(); await p.settle();
  assert.equal(p.st().found.q, "login");
}

async function staleAndPaging() {
  // An older read's late answer doesn't land over a newer one.
  const p = makePage({ spaces: [space("s1", "/r", true)] });
  p.w.hold = (cmd, args) => cmd === "fetch" && args[0].includes("orderBy");
  await p.tick(); await p.settle();
  assert.equal(p.w.held.length, 1);
  p.w.hold = null;
  p.w.mine = [lin(40)];
  p.view.read(p.st(), p.cx); await p.settle();
  same(p.st().mine.items.map((i) => i.ref), ["ENG-40"]);
  p.w.held.shift()(); await p.settle();
  same(p.st().mine.items.map((i) => i.ref), ["ENG-40"]);

  // A long conversation, page by page, ten at most.
  const q = makePage({ spaces: [space("s1", "/r", true)] });
  let pages = 0;
  q.w.details["id-9"] = () => linFull(9, { pageInfo: { hasNextPage: true, endCursor: "p1" }, nodes: [linComment("c0", "first")] });
  q.w.commentPage = (after) => { pages++; const n = Number(after.slice(1)); return { pageInfo: { hasNextPage: true, endCursor: `p${n + 1}` }, nodes: [linComment(`c${n}`, `n${n}`)] }; };
  await q.tick(); await q.settle();
  const issue = q.st().details.get("id-9").issue;
  same([pages, issue.comments.length, issue.truncated], [10, 11, true]);
  const root = (await q.draw()).root;
  assert.ok(strings(root).some((s) => s.includes("the rest is in the browser")));
}

// Every empty list says why in one line, and which provider answered; none is blank.
async function emptyStates() {
  const said = async (p, id) => { await p.tick(); await p.settle(); const root = (await p.draw()).root; return strings(find(root, id)).join(" "); };
  let p = makePage({ spaces: [space("s1", "/r", true)], branch: "pr-panel" });
  p.w.named = [];
  assert.equal(await said(p, "t3-issues-empty-branch"), "No Linear issue in this branch's name (pr-panel). Name it like ABC-123-… or pick one in Mine.");
  let root = (await p.draw()).root;
  assert.match(find(root, "t3-issues-refresh").style.accessibility_label[0], /Linear/, "Refresh says which provider it reads");
  same(strings(find(root, "t3-issues-tab-branch")), ["Branch", "0"]);
  p = makePage({ spaces: [space("s1", "/r", true)] });
  p.w.named = [];
  assert.equal(await said(p, "t3-issues-empty-branch"), "No Linear issue ENG-9, ENG-12.", "the names asked for, none in Linear");
  p = makePage({ spaces: [space("s1", "/r", true)], branch: "HEAD" });
  assert.equal(await said(p, "t3-issues-empty-branch"), "HEAD is detached: no branch to read an issue from.");
  p = makePage({ spaces: [space("s1", "/r", true)] });
  p.w.mine = [];
  await p.tick();
  p.view.setTab(p.st(), "mine", p.cx);
  assert.equal(await said(p, "t3-issues-empty-mine"), "No open issues assigned to you in Linear.");
  p.w.search = [];
  p.w.searchBox.type("zzz");
  await p.draw();
  assert.equal(await said(p, "t3-issues-empty-mine"), 'No issues match "zzz" in Linear.');
  for (const [branch, text] of [["pr-panel", "No issue number in this branch's name (pr-panel)."], ["99-fix", "No issue #99 in org/app."]]) {
    p = makePage({ spaces: [space("s1", "/r", true)], key: null, branch });
    p.view.useGitHub = true;
    assert.equal(await said(p, "t3-issues-empty-branch"), text);
    root = (await p.draw()).root;
    assert.match(find(root, "t3-issues-refresh").style.accessibility_label[0], /GitHub issues in org\/app/);
  }
  p.w.gh.mine = [];
  p.view.setTab(p.st(), "mine", p.cx); p.view.read(p.st(), p.cx);
  assert.equal(await said(p, "t3-issues-empty-mine"), "No open issues assigned to you in org/app.");
}

(async () => {
  model();
  await emptyStates();
  await keys();
  await linearPage();
  await staleAndPaging();
  console.log("t3-issues checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
