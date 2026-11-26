// GitHub as the panel pages reach it: which repository a tab's folder belongs to (git, on the space's machine) and the `gh`
// CLI on this computer, with its login, remote spaces included. Arguments go to gh as they are, never through a shell; exec
// has no stdin, so a query goes as a raw `-f` field. After Branch PR's gh.js (munza/herdr-mods, Apache-2.0).
import { exec } from "herdr";
import { splitBody, imgAttributes, assetKey, size, UUID, mapImages, imagesOf } from "./images.js";

const GH_TIMEOUT = 26000, DISCOVER_TIMEOUT = 20000;
// Reads that leave the index and the filesystem monitor alone.
export const GIT = ["--no-optional-locks", "-c", "core.fsmonitor=false"];

/** "owner/name" of a GitHub remote URL (https, ssh, scp-like, an ssh alias such as github-work), else null. */
export function repositoryFromRemote(remote) {
  const m = /^(?:(?:https?|git|ssh):\/\/(?:[^@/]+@)?([^/:]+)(?::[0-9]+)?\/|[^@/:]+@([^:/]+):)(.+?)(?:\.git)?\/?$/.exec(String(remote ?? "").trim());
  let host = (m?.[1] ?? m?.[2] ?? "").toLowerCase();
  // An ssh alias (github-work) names the real host only in ~/.ssh/config.
  if (/^github(\.com)?-|^ssh\.github\.com$/.test(host)) host = "github.com";
  const parts = (m?.[3] ?? "").split("/");
  const valid = parts.length === 2 && parts.every((s) => /^[A-Za-z0-9_.-]+$/.test(s) && s !== "." && s !== "..");
  return host === "github.com" && valid ? parts.join("/") : null;
}

/**
 * Where a tab works, from `git rev-parse --show-toplevel --abbrev-ref HEAD` and a `git config --get-regexp` of the remotes and
 * tracking remotes: the repository root (null outside one), the branch (null when HEAD is detached), the raw `config`, and the
 * remote that names the GitHub repository (`upstream`, else the branch's tracking remote, else `origin`) and that `repo`, or
 * `repoProblem` saying why there's none. `heads` are every GitHub repository the remotes name, where the branch can have been
 * pushed.
 */
export function parseDiscovery(revParse, config) {
  const [root = "", head = ""] = String(revParse ?? "").split("\n").map((l) => l.trim());
  const branch = head && head !== "HEAD" ? head : null;
  const urls = new Map(), tracking = new Map();
  for (const line of String(config ?? "").split("\n")) {
    const at = line.indexOf(" "), key = at < 0 ? line : line.slice(0, at), value = at < 0 ? "" : line.slice(at + 1).trim();
    let m = /^remote\.(.+)\.url$/.exec(key);
    if (m && !urls.has(m[1])) urls.set(m[1], value);
    m = /^branch\.(.+)\.remote$/.exec(key);
    if (m) tracking.set(m[1], value);
  }
  const follows = branch ? tracking.get(branch) : undefined;
  const remote = ["upstream", follows, "origin"].find((r) => r && r !== "." && urls.has(r)) ?? null;
  const repo = remote ? repositoryFromRemote(urls.get(remote)) : null;
  const heads = [...new Set([...urls.values()].map(repositoryFromRemote).filter(Boolean).map((r) => r.toLowerCase()))];
  const repoProblem = !remote ? "This repository has no GitHub remote." : !repo ? `The ${remote} remote isn't a GitHub repository.` : null;
  return { root: root || null, branch, config: String(config ?? ""), remote, repo, heads, repoProblem };
}

/**
 * The repository `folder` (on machine `on`) belongs to (parseDiscovery's `info`), or the problem to show instead: no folder,
 * not a repository, git failing. `keys`: more `git config` keys to read beside the remotes (regex parts, `branch\\..*\\.x`).
 * @param {string | null} folder @param {string | null} on @param {{ keys?: string[] }} [o]
 */
export async function discoverRepo(folder, on, { keys = [] } = {}) {
  if (!folder) return { problem: "This tab has no folder." };
  const o = { cwd: folder, on, timeout: DISCOVER_TIMEOUT }, pattern = `^(${["remote\\..*\\.url", "branch\\..*\\.remote", ...keys].join("|")})$`;
  try {
    const [top, config] = await Promise.all([exec("git", [...GIT, "rev-parse", "--show-toplevel", "--abbrev-ref", "HEAD"], o),
      exec("git", [...GIT, "config", "--get-regexp", pattern], o)]);
    const info = parseDiscovery(top.code === 0 ? top.stdout : "", config.code === 0 ? config.stdout : "");
    return info.root ? { info } : { problem: "This tab's folder is not in a Git repository." };
  } catch (e) { return { problem: e?.message ?? String(e) }; }
}

/** gh's two failures that leave a page nothing to show, with what to do; anything else is null. */
export function ghProblem(message) {
  if (/GitHub CLI \(gh\) is not installed/.test(message ?? "")) return { title: "GitHub CLI isn't installed",
    detail: "This page reads GitHub through gh. Install it from cli.github.com, log in, then try again.", command: "gh auth login" };
  if (/GitHub CLI is not logged in/.test(message ?? "")) return { title: "GitHub CLI isn't logged in",
    detail: "This page uses your gh login. Run this in a terminal, then try again.", command: "gh auth login" };
  return null;
}

/** gh's stdout for `args`, or a throw that says what went wrong; ghProblem knows the two that stop everything. */
export async function gh(args) {
  let r;
  try { r = await exec("gh", args, { timeout: GH_TIMEOUT }); }
  catch { throw new Error("GitHub CLI (gh) is not installed."); }
  if (r.code === 0) return r.stdout;
  const err = (r.stderr ?? "").trim();
  if (err.includes("gh auth login") || err.includes("not logged in")) throw new Error("GitHub CLI is not logged in.");
  throw new Error(`GitHub: ${err || `gh exited with ${r.code}`}`);
}

/** A GraphQL answer's data. Numbers are the only typed variables; every other, typed text included, is a raw `-f` string. */
export async function gql(query, vars) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(vars)) args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`);
  const res = JSON.parse(await gh(args));
  if (res.errors?.length) throw new Error(`GitHub: ${res.errors.map((e) => e.message).join("; ")}`);
  return res.data;
}

export const ownerName = (repo) => ({ owner: repo.split("/")[0], name: repo.split("/")[1] });

/** The pictures in GitHub's rendering of a body, in order; an emoji is drawn as an `<img>` there but is text in the Markdown. */
export const htmlImages = (html) => [...String(html ?? "").matchAll(/<img\b[^>]*>/gi)].map((m) => imgAttributes(m[0]))
  .filter((a) => a.src && !/(^|\s)emoji(\s|$)/.test(a.class ?? ""));

/**
 * Each picture of `parts`, a table cell's too, with the address to download (`src`, from bodyHTML) and its `key`, when the two say the same
 * pictures in the same order: as many, and each pair the same asset where the Markdown names one, else the same alt where
 * both have one. Otherwise none gets a `src`, and each is drawn as its alt and a link. GitHub's Markdown image addresses
 * answer 404 without a browser session; bodyHTML's signed ones download.
 */
export function pairImages(parts, html) {
  const want = imagesOf(parts), got = htmlImages(html);
  const same = want.length === got.length && want.every((im, i) => {
    const id = UUID.exec(im.url)?.[0], src = got[i].src;
    if (id) return src.toLowerCase().includes(id.toLowerCase());
    return !im.alt || !got[i].alt || im.alt === got[i].alt;
  });
  let i = 0;
  return mapImages(parts, (im) => {
    const h = same ? got[i++] : null;
    return { ...im, key: assetKey(im.url), src: h?.src ?? null, width: im.width ?? size(h?.width), height: im.height ?? size(h?.height) };
  });
}

const parted = new WeakMap();
/** `owner`'s (a PR, issue or comment, read once per object) `body` in parts, its pictures paired with `html`, its bodyHTML. */
export function githubParts(owner, body, html) {
  if (!parted.has(owner)) parted.set(owner, pairImages(splitBody(body), html));
  return parted.get(owner);
}
