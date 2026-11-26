// What git and GitHub's answers mean for the Pull requests page, as plain functions: no Herdr, no drawing.

export const READ_EVERY = 60000;

// `git config --get-regexp` of these: every remote's URL and every branch's tracking remote, in one read.
export const CONFIG_KEYS = "^(remote\\..*\\.url|branch\\..*\\.remote)$";

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
 * Where a tab's PRs come from, from `git rev-parse --show-toplevel --abbrev-ref HEAD` and `git config --get-regexp CONFIG_KEYS`:
 * the repository root, the branch (null when HEAD is detached), the remote that names the GitHub repository (`upstream`, else
 * the branch's tracking remote, else `origin`) and that `repo`. `heads` are every GitHub repository the remotes name, where the
 * branch can have been pushed. Throws with what to tell the person.
 */
export function parseDiscovery(revParse, config) {
  const [root = "", head = ""] = String(revParse ?? "").split("\n").map((l) => l.trim());
  if (!root) throw new Error("This tab's folder is not in a Git repository.");
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
  const remote = ["upstream", follows, "origin"].find((r) => r && r !== "." && urls.has(r));
  if (!remote) throw new Error("This repository has no GitHub remote.");
  const repo = repositoryFromRemote(urls.get(remote));
  if (!repo) throw new Error(`The ${remote} remote isn't a GitHub repository.`);
  const heads = [...new Set([...urls.values()].map(repositoryFromRemote).filter(Boolean).map((r) => r.toLowerCase()))];
  return { root, branch, remote, repo, heads };
}

/** The branch's PRs from a branch read: only those pushed from one of this clone's remotes, not a fork's same-named branch. */
export const ownBranchPRs = (prs, heads) => prs.filter((p) => heads.includes(String(p.headRepository?.nameWithOwner ?? "").toLowerCase()));

/** gh's two failures that leave the page nothing to show, with what to do; anything else is null. */
export function ghProblem(message) {
  if (/GitHub CLI \(gh\) is not installed/.test(message ?? "")) return { title: "GitHub CLI isn't installed",
    detail: "This page reads GitHub through gh. Install it from cli.github.com, log in, then try again.", command: "gh auth login" };
  if (/GitHub CLI is not logged in/.test(message ?? "")) return { title: "GitHub CLI isn't logged in",
    detail: "This page uses your gh login. Run this in a terminal, then try again.", command: "gh auth login" };
  return null;
}

/** A PR's state as its row and detail draw it: the icon (in the mod's icons/) and the theme color. */
export function prState(pr) {
  if (pr.state === "MERGED") return { key: "merged", label: "Merged", icon: "git-merge", color: "ansi5" };
  if (pr.state === "CLOSED") return { key: "closed", label: "Closed", icon: "git-pull-request-closed", color: "ansi1" };
  if (pr.isDraft) return { key: "draft", label: "Draft", icon: "git-pull-request-draft", color: "dim" };
  return { key: "open", label: "Open", icon: "git-pull-request", color: "ansi2" };
}

/** A check's kind from any of GitHub's words for it (a CheckRun's status and conclusion, a StatusContext's state, a rollup). */
export function checkKind(word) {
  const w = String(word ?? "").toUpperCase();
  if (["FAILURE", "ERROR", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(w)) return "failure";
  if (w === "SUCCESS") return "success";
  if (["SKIPPED", "NEUTRAL", "CANCELLED", "STALE"].includes(w)) return "skipped";
  return "pending";
}

export const CHECK_LOOK = {
  failure: { icon: "circle-x", color: "ansi1", label: "Failed" },
  pending: { icon: "circle-dashed", color: "ansi3", label: "Pending" },
  success: { icon: "circle-check", color: "ansi2", label: "Passed" },
  skipped: { icon: "circle-minus", color: "dim", label: "Skipped" },
};

/** A list row's mark: GitHub's rollup of the head commit's checks, or null when it has none. */
export function rollupKind(pr) {
  const state = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  return state ? checkKind(state) : null;
}

const WORST_FIRST = ["failure", "pending", "success", "skipped"];
/** The head commit's checks, those needing attention first, then by name. */
export function checksOf(pr) {
  const nodes = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? [];
  return nodes.filter(Boolean).map((n) => n.__typename === "StatusContext"
    ? { name: n.context ?? "", kind: checkKind(n.state), url: n.targetUrl ?? null }
    : { name: n.name ?? "", kind: checkKind(n.status === "COMPLETED" ? n.conclusion : n.status), url: n.detailsUrl ?? null })
    .sort((a, b) => WORST_FIRST.indexOf(a.kind) - WORST_FIRST.indexOf(b.kind) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** One row per person: their latest approval or change request, a waiting request over it, since that is what they owe now. */
export function reviewersOf(pr) {
  const rows = new Map();
  for (const n of pr.latestOpinionatedReviews?.nodes ?? []) if (n?.author?.login) rows.set(n.author.login, n.state);
  for (const n of pr.reviewRequests?.nodes ?? []) {
    const r = n?.requestedReviewer ?? {}, login = r.combinedSlug ?? r.login;
    if (login) rows.set(login, "REQUESTED");
  }
  return [...rows].map(([login, state]) => ({ login, state }));
}

export const REVIEW_LOOK = {
  APPROVED: { label: "Approved", color: "ansi2" },
  CHANGES_REQUESTED: { label: "Changes requested", color: "ansi1" },
  REQUESTED: { label: "Requested", color: "ansi3" },
  COMMENTED: { label: "Commented", color: "dim" },
  DISMISSED: { label: "Dismissed", color: "dim" },
};

/**
 * The detail's stats line, the same three in the same order: Checks passed/counted (skipped ones aside), Reviews approved/asked,
 * and only for an open PR what stands before a merge. `tone`: danger, waiting, good, or none when there's nothing to say.
 */
export function prStats(pr) {
  const checks = checksOf(pr), counted = checks.filter((c) => c.kind !== "skipped"), passed = counted.filter((c) => c.kind === "success").length;
  const reviewers = reviewersOf(pr).filter((r) => r.state !== "COMMENTED" && r.state !== "DISMISSED");
  const approved = reviewers.filter((r) => r.state === "APPROVED").length;
  const changes = pr.reviewDecision === "CHANGES_REQUESTED" || reviewers.some((r) => r.state === "CHANGES_REQUESTED");
  return [
    { key: "checks", label: "Checks", value: counted.length ? `${passed}/${counted.length}` : "–",
      tone: !counted.length ? "none" : counted.some((c) => c.kind === "failure") ? "danger" : passed < counted.length ? "waiting" : "good" },
    { key: "reviews", label: "Reviews", value: reviewers.length ? `${approved}/${reviewers.length}` : "–",
      tone: changes ? "danger" : pr.reviewDecision === "APPROVED" ? "good" : pr.reviewDecision === "REVIEW_REQUIRED" ? "waiting" : "none" },
    ...(pr.state === "OPEN" ? [{ key: "merge", label: "Merge", ...mergeState(pr) }] : []),
  ];
}

/** What GitHub says of merging an open PR now, in one word. */
export function mergeState(pr) {
  if (pr.isDraft) return { value: "Draft", tone: "none" };
  if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") return { value: "Conflicts", tone: "danger" };
  if (pr.mergeStateStatus === "BEHIND") return { value: "Behind", tone: "waiting" };
  if (pr.mergeStateStatus === "BLOCKED") return { value: "Blocked", tone: "waiting" };
  // GitHub works mergeability out after it's first asked: a later read has it.
  if (pr.mergeable === "UNKNOWN" || pr.mergeStateStatus === "UNKNOWN" || !pr.mergeStateStatus) return { value: "Checking", tone: "none" };
  return { value: "Ready", tone: "good" };
}

export const TONE_COLOR = { danger: "ansi1", waiting: "ansi3", good: "ansi2", none: "dim" };

/**
 * The open PRs this one is stacked on (its base is another's head, and so on down to `trunk`) and those stacked on it, top
 * first, as Graphite and gh-stack draw them; null for a PR on its own. `open`: the repository's open PRs from this repository,
 * not forks. After Branch PR's stackOf (munza/herdr-mods, Apache-2.0).
 */
export function stackOf(pr, open) {
  const others = open.filter((p) => p.number !== pr.number);
  const byHead = new Map(others.map((p) => [p.headRefName, p]));
  const seen = new Set([pr.headRefName]);
  const below = [];
  let trunk = pr.baseRefName;
  while (byHead.has(trunk) && !seen.has(trunk)) {
    const p = byHead.get(trunk);
    below.push(p);
    seen.add(trunk);
    trunk = p.baseRefName;
  }
  const above = [];
  const climb = (head) => {
    for (const p of others.filter((o) => o.baseRefName === head && !seen.has(o.headRefName))) {
      seen.add(p.headRefName);
      climb(p.headRefName);
      above.push(p);
    }
  };
  climb(pr.headRefName);
  if (!below.length && !above.length) return null;
  return { layers: [...above, open.find((p) => p.number === pr.number) ?? pr, ...below], trunk };
}

/** Whether `pr` matches every word of `query`: its number (`12` or `#12`) exactly, or words in its title or head branch, case aside. */
export function matches(pr, query) {
  const text = `${pr.title ?? ""}\n${pr.headRefName ?? ""}`.toLowerCase();
  return String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean)
    .every((w) => /^#?(\d+)$/.exec(w)?.[1] === String(pr.number) || text.includes(w));
}

export function timeAgo(iso, now = Date.now()) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (!(minutes >= 1)) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 43200) return `${Math.floor(minutes / 1440)}d ago`;
  return `${Math.floor(minutes / 43200)}mo ago`;
}

/** Why Review (or pulls.review, `name`) can't show a PR of this space, or "" when it can: both read a local clone, through the Review extra. */
export function reviewProblem({ installed, machine, root }, name = "Review") {
  if (!installed) return "Review isn't installed: add the Review extra.";
  if (machine) return `${name} is unavailable on remote spaces.`;
  if (!root) return "This tab's folder is not in a Git repository.";
  return "";
}

/** The git calls that bring a PR's head and its base branch into the clone, each then read from FETCH_HEAD. */
export const fetchArgs = (remote, ref) => ["fetch", "--no-tags", "--quiet", remote, ref];
export const prRefs = (pr) => ({ head: `refs/pull/${pr.number}/head`, base: `refs/heads/${pr.baseRefName}` });
/** Review's page for what GitHub shows of a PR: what head adds since it forked from base. */
export const comparePage = (base, head) => `/compare/${base}...${head}`;
