// What a terminal is on (name.js) in a fake herdr: the one rule for Inbox cards, the agents list, tabs and pane headers.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { strip } = require("./check-kit.js");

const program = { name: "Pi", key: "pi", agent: true };
const pane = { pane: "p2", terminal: "t2", tab: "b", title: "pi", cwd: "/home/me/project", program, status: "working" };
const shell = { pane: "p3", terminal: "t3", tab: "b", title: "me@mac: ~/project", cwd: "/home/me/project", program: { name: "zsh", key: "shell", shell: true }, status: null };
const review = { pane: "p4", terminal: null, mod: "review-pane", tab: "b", title: "review-pane", cwd: null };
const tab = { id: "b", name: "Release", named: true };
let terms = [{ address: "t2", labels: {} }, { address: "t3", labels: {} }], agentList = [];
const sharedValues = {}, reads = { terminals: 0, spaces: 0, agents: 0 };
const lists = {
  terminals: () => { reads.terminals++; return [...terms]; },
  spaces: () => { reads.spaces++; return [{ id: "s1", name: "project", tabs: [tab] }]; },
  agents: () => { reads.agents++; return agentList; },
};
const context = vm.createContext({ ...lists, shared: (k) => sharedValues[k] ?? null });
vm.runInContext(strip(fs.readFileSync(path.join(__dirname, "name.js"), "utf8")) + "\nglobalThis.name = { namer, programOf, modStatus };", context);
const { namer, programOf, modStatus } = context.name;
const named = (x = pane) => namer()(x);

// A caller that has read the lists for its own draw hands them in: each read copies every terminal, space or agent, and a
// pane header, a tab bar and both sidebars each name what they draw.
{
  const held = { terminals: lists.terminals(), spaces: lists.spaces(), agents: lists.agents() };
  reads.terminals = reads.spaces = reads.agents = 0;
  assert.equal(namer(held)(pane), "Release");
  assert.deepEqual(reads, { terminals: 0, spaces: 0, agents: 0 }, "handed the draw's lists, it reads none again");
  assert.equal(namer({ terminals: held.terminals })(pane), "Release");
  assert.deepEqual(reads, { terminals: 0, spaces: 1, agents: 1 }, "it reads only what it wasn't handed");
  reads.terminals = reads.spaces = reads.agents = 0;
  assert.equal(namer()(pane), "Release");
  assert.deepEqual(reads, { terminals: 1, spaces: 1, agents: 1 }, "handed nothing, it reads each once");
}

// Pi's session, else (agents only) a named tab, else a telling title, else the program.
assert.equal(named(), "Release");
terms[0].labels["pi.session"] = "Fix login";
assert.equal(named(), "Fix login");
delete terms[0].labels["pi.session"];
// Two agents in the named tab would read alike under its name: each goes by its own.
pane.title = "✳ Review PR";
agentList = [{ address: "t2", tab: "b" }, { address: "t5", tab: "b" }];
assert.equal(named(), "Review PR");
// A sub-agent beside its parent leaves the name to it.
terms[0].state = "live"; terms.push({ address: "t5", parent: "t2", state: "live", labels: {} });
assert.equal(named(), "Release");
terms.at(-1).parent = null; terms[0].parent = "t5";
assert.equal(named(), "Review PR", "a sub-agent doesn't take its tab's name");
delete terms[0].parent; terms.pop(); agentList = [];

tab.named = false; pane.title = "π - Review PR - project";
assert.equal(named(), "Review PR");
pane.title = "π - project";
assert.equal(named(), "Pi", "Pi's unnamed title is only its folder, which the space already says");
pane.title = "⠋ project";
assert.equal(named(), "Pi", "nor Codex's: its spinner and project");
pane.title = "OC | Review PR";
assert.equal(named(), "OC | Review PR", "an agent's marks come off only its own titles");
pane.program = { name: "OpenCode", key: "opencode", agent: true };
assert.equal(named(), "Review PR");
pane.program = program;
pane.title = "✳ Review PR";
assert.equal(named(), "Review PR");
pane.title = "pi";
assert.equal(named(), "Pi");
terms[0].labels["pi.session"] = "Fix login"; pane.title = "π - Fix login - project";
pane.program = { name: "Git Changes", key: "lazygit", agent: false };
assert.equal(named(), "Git Changes", "lazygit after Pi in the same shell: Pi's session and title are left behind");
pane.program = program; delete terms[0].labels["pi.session"];

// A shell: its prompt's title and its own address tell nothing.
tab.named = true;
assert.equal(named(shell), "zsh");
shell.title = "t3";
assert.equal(named(shell), "zsh");

// A mod pane: the title, icon and status its mod gives for its tab; another tab's isn't its own.
assert.equal(named(review), "review-pane");
sharedValues["review-pane.titles"] = { a: "review · other", b: "review · fix" };
assert.equal(named(review), "review · fix");
assert.equal(programOf(review), null);
sharedValues["review-pane.program"] = { icon: "mods/review-pane/logo.svg", tint: false };
assert.equal(programOf(review).icon, "mods/review-pane/logo.svg");
assert.equal(programOf(pane), program);
sharedValues["review-pane.status"] = { a: "working" };
assert.equal(modStatus(review), null);
sharedValues["review-pane.status"] = { b: "blocked" };
assert.equal(modStatus(review), "blocked");

console.log("ok: one name for a terminal everywhere, from the lists its caller already read.");
