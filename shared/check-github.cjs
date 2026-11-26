// Which GitHub repository a tab's folder belongs to (github.js), gh's arguments and failures in a fake exec, and which signed
// address GitHub's HTML gives each picture of a body.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ran = [];
let answer = () => ({ code: 0, stdout: "" });
const ctx = vm.createContext({ exec: async (cmd, args, o = {}) => { ran.push({ cmd, args, cwd: o.cwd ?? null, on: o.on ?? null }); return answer(cmd, args); }, JSON, Promise, Error, Map, Set, Object, String, Uint8Array });
const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8").replace(/^import [^;]*;\r?\n/gm, "").replace(/^export /gm, "");
vm.runInContext(`${read("images.js")}\n${read("github.js")}\nglobalThis.g = { repositoryFromRemote, parseDiscovery, discoverRepo, ghProblem, gh, gql, htmlImages, pairImages, splitBody };`, ctx);
const { g } = ctx;
const json = (x) => JSON.parse(JSON.stringify(x));

(async () => {
  const config = ["remote.origin.url git@github.com:Me/app.git", "remote.upstream.url https://github.com/org/app.git", "remote.work.url git@github-work:corp/app",
    "remote.gl.url git@gitlab.com:me/app.git", "branch.feat.x.remote work", "branch.main.remote origin", "branch.local.remote ."].join("\n");
  const { config: raw, ...found } = g.parseDiscovery("/r\nfeat.x\n", config);
  assert.deepEqual(json(found), { root: "/r", branch: "feat.x", remote: "upstream", repo: "org/app", heads: ["me/app", "org/app", "corp/app"], repoProblem: null },
    "upstream names the repository first; every GitHub remote is a place the branch may be pushed");
  const noUpstream = config.split("\n").filter((l) => !l.startsWith("remote.upstream")).join("\n");
  assert.equal(g.parseDiscovery("/r\nfeat.x\n", noUpstream).remote, "work", "then the branch's tracking remote");
  assert.equal(g.parseDiscovery("/r\nlocal\n", noUpstream).remote, "origin", "a branch tracking the clone itself (.) falls to origin");
  assert.deepEqual([g.parseDiscovery("/r\nHEAD\n", config).branch, g.parseDiscovery("/r\nHEAD\n", config).repo], [null, "org/app"], "a detached HEAD has no branch, still a repository");
  assert.equal(raw, config, "the raw config, for a page's own keys");
  assert.equal(g.parseDiscovery("", config).root, null);
  assert.match(g.parseDiscovery("/r\nmain\n", "remote.gl.url git@gitlab.com:me/app.git").repoProblem, /no GitHub remote/);
  assert.match(g.parseDiscovery("/r\nmain\n", "remote.origin.url git@gitlab.com:me/app.git").repoProblem, /origin remote isn't a GitHub repository/);
  for (const [url, repo] of [["https://github.com/a/b", "a/b"], ["https://x@github.com/a/b.git/", "a/b"], ["ssh://git@ssh.github.com:443/a/b.git", "a/b"],
    ["git@github.com:a/b.git", "a/b"], ["git@github.com:a/b/c.git", null], ["https://github.example.com/a/b", null], ["/srv/b.git", null]]) assert.equal(g.repositoryFromRemote(url), repo, url);

  // Discovery reads in the folder, on its machine; a folder outside Git is a problem to show, not a throw.
  answer = (cmd, args) => args.includes("--show-toplevel") ? { code: 0, stdout: "/r\nfeat.x\n" } : { code: 0, stdout: config };
  assert.equal((await g.discoverRepo("/r/src", "vps", { keys: ["branch\\..*\\.x"] })).info.repo, "org/app");
  assert.deepEqual(json(ran.map((r) => [r.args.slice(3).join(" "), r.cwd, r.on])), [["rev-parse --show-toplevel --abbrev-ref HEAD", "/r/src", "vps"],
    ["config --get-regexp ^(remote\\..*\\.url|branch\\..*\\.remote|branch\\..*\\.x)$", "/r/src", "vps"]], "in the folder, on its machine, the remotes and the keys asked for");
  answer = () => ({ code: 128, stdout: "" });
  assert.match((await g.discoverRepo("/tmp", null)).problem, /not in a Git repository/);
  assert.equal((await g.discoverRepo(null, null)).problem, "This tab has no folder.");

  // gh: numbers typed, everything else raw; its two failures that stop a page.
  ran.length = 0;
  answer = () => ({ code: 0, stdout: JSON.stringify({ data: { ok: 1 } }) });
  assert.deepEqual(json(await g.gql("query", { n: 7, body: "42", s: "@x" })), { ok: 1 });
  assert.deepEqual(json(ran[0].args), ["api", "graphql", "-f", "query=query", "-F", "n=7", "-f", "body=42", "-f", "s=@x"]);
  answer = () => ({ code: 4, stdout: "", stderr: "To get started with GitHub CLI, please run:  gh auth login\n" });
  await assert.rejects(g.gh(["api", "user"]), /not logged in/);
  assert.equal(g.ghProblem("GitHub CLI is not logged in.").command, "gh auth login");
  assert.equal(g.ghProblem("GitHub CLI (gh) is not installed.").title, "GitHub CLI isn't installed");
  assert.equal(g.ghProblem("GitHub: something else"), null);
  answer = () => ({ code: 0, stdout: JSON.stringify({ errors: [{ message: "Could not resolve" }] }) });
  await assert.rejects(g.gql("q", {}), /GitHub: Could not resolve/);

  // bodyHTML's signed addresses, paired with the Markdown's pictures only when both say the same ones in the same order.
  const id1 = "c523b8b3-e7f2-4520-bb42-8a68ab28c022", id2 = "6b723918-8152-463e-859c-6a1d71e4de16";
  const md = `![one](https://github.com/user-attachments/assets/${id1}) :tada: ![two](https://github.com/user-attachments/assets/${id2})`;
  const signed = (id) => `https://private-user-images.githubusercontent.com/1/9-${id}.png?jwt=A&amp;x=1`;
  const html = `<p><a href="#"><img src="${signed(id1)}" alt="one"></a> <g-emoji><img class="emoji" alt="tada" src="https://github.githubassets.com/tada.png"></g-emoji> <img src="${signed(id2)}" alt="two"></p>`;
  const srcs = (body, h) => json(g.pairImages(g.splitBody(body), h).filter((p) => p.image).map((p) => p.image.src));
  assert.deepEqual(json(g.htmlImages(html).map((a) => a.alt)), ["one", "two"], "an emoji's <img> isn't a picture of the body");
  assert.deepEqual(json(g.pairImages(g.splitBody(md), html).filter((p) => p.image).map((p) => [p.image.key, p.image.src])),
    [[id1, signed(id1).replace("&amp;", "&")], [id2, signed(id2).replace("&amp;", "&")]], "the n-th to the n-th, entities decoded");
  assert.deepEqual(srcs(md, `<img src="${signed(id2)}" alt="two"><img src="${signed(id1)}" alt="one">`), [null, null], "out of order: none is guessed");
  assert.deepEqual(srcs(md, `<img src="${signed(id1)}">`), [null, null], "a different count: none");
  assert.deepEqual(srcs("![x](https://a/x.png)", '<img src="https://camo/x" alt="y">'), [null], "no asset id: the alt has to agree");
  const table = `![one](https://github.com/user-attachments/assets/${id1})\n\n| a | b |\n| - | - |\n| :tada: | ![two](https://github.com/user-attachments/assets/${id2}) |\n`;
  const cells = g.pairImages(g.splitBody(table), html), inTable = cells[1].table.rows[0][1][0].image;
  assert.deepEqual(json([cells[0].image.src, inTable.key, inTable.src]), [signed(id1), id2, signed(id2)].map((s) => s.replace("&amp;", "&")), "a table cell's picture is paired in its turn");
  console.log("ok: github: a folder's repository, gh's arguments and failures, and a body's signed picture addresses");
})().catch((e) => { console.error(e); process.exit(1); });
