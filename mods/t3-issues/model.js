// What Linear's and GitHub's answers mean for the Issues page, as plain functions: no Herdr, no drawing. Both providers' issues
// come out in one shape (fromLinear, fromGitHub), so the page draws one kind of issue.

// A branch name rarely carries more identifiers than this; each is asked of Linear.
const MAX_CANDIDATES = 4;
// Branch Issue's binding, `branch.<name>.herdr-issue`, as a `git config --get-regexp` part (github.js discoverRepo).
export const ISSUE_BINDING = "branch\\..*\\.herdr-issue";

/** Every `TEAM-123` in `text`, upper-cased, once each, in order. After Branch Issue's identifiersIn (munza/herdr-mods, Apache-2.0). */
export function identifiersIn(text) {
  return [...new Set([...String(text ?? "").matchAll(/([A-Za-z][A-Za-z0-9]*)-([1-9][0-9]*)/g)].map((m) => `${m[1].toUpperCase()}-${m[2]}`))];
}

/** The Linear issues a branch names: its `branch.<name>.herdr-issue` binding first, then the identifiers in the name, a few at most. */
export function branchCandidates(branch, config) {
  if (!branch) return [];
  const bound = String(config ?? "").split("\n").filter((l) => l.startsWith(`branch.${branch}.herdr-issue `)).flatMap((l) => identifiersIn(l.slice(l.indexOf(" ") + 1)));
  return [...new Set([...bound, ...identifiersIn(branch)])].slice(0, MAX_CANDIDATES);
}

/** The GitHub issue number a branch names: `123-…` or `…/123-…` (GitHub's own `gh issue develop` names), else null. */
export function branchIssueNumber(branch) {
  const m = /(?:^|\/)([1-9][0-9]*)-/.exec(String(branch ?? ""));
  return m ? Number(m[1]) : null;
}

const NAME = /^([A-Za-z][A-Za-z0-9]*)-([1-9][0-9]*)$/;

/** Linear's IssueFilter for what the person typed: words in the title or description, a number in any team, or an identifier. */
export function searchFilter(text) {
  const q = String(text ?? "").trim();
  /** @type {any[]} */
  const or = [{ title: { containsIgnoreCase: q } }, { description: { containsIgnoreCase: q } }];
  const n = /^#?([1-9][0-9]*)$/.exec(q);
  if (n) or.push({ number: { eq: Number(n[1]) } });
  const id = NAME.exec(q);
  if (id) or.push({ and: [{ team: { key: { eqIgnoreCase: id[1] } } }, { number: { eq: Number(id[2]) } }] });
  return { or };
}

/** Linear's IssueFilter for issues by identifier (`ENG-12`): each its team's key and its number. */
export const identifierFilter = (ids) => ({ or: ids.map((id) => { const m = NAME.exec(id); return { and: [{ team: { key: { eqIgnoreCase: m[1] } } }, { number: { eq: Number(m[2]) } }] }; }) });

// Mine: assigned to the viewer, not started yet or under way.
export const MINE_FILTER = { assignee: { isMe: { eq: true } }, state: { type: { in: ["unstarted", "started"] } } };

const person = (u) => u?.displayName || u?.name || u?.login || "";
const LINEAR_ICON = { triage: "circle-dashed", backlog: "circle-dashed", unstarted: "circle", started: "circle-dot", completed: "circle-check", canceled: "circle-x" };

/** A Linear PR attachment as the page shows a linked PR, or null when the link isn't a GitHub PR. */
function prLink(url, title, status) {
  const m = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(String(url ?? ""));
  return m ? { repo: m[1], number: Number(m[2]), url, title: title || `#${m[2]}`, status: String(status ?? "").toLowerCase() } : null;
}

/** A Linear workflow state as the page draws it (page.js stateIcon): its own color, an icon by its type. */
export const linearState = (s) => ({ id: s?.id ?? null, name: s?.name ?? "", color: s?.color ?? null, icon: LINEAR_ICON[s?.type] ?? "circle" });

/** A Linear issue (a card or in full) in the page's shape. */
export function fromLinear(i) {
  return {
    id: i.id, ref: i.identifier, title: i.title ?? "", url: i.url, updatedAt: i.updatedAt,
    state: linearState(i.state),
    assignee: person(i.assignee), priority: typeof i.priority === "number" ? i.priority : 0,
    labels: (i.labels?.nodes ?? []).map((l) => ({ name: l.name, color: l.color })), project: i.project?.name ?? null,
    cycle: i.cycle ? (i.cycle.name || `Cycle ${i.cycle.number}`) : null, description: i.description ?? null,
    prs: (i.attachments?.nodes ?? []).map((a) => prLink(a.url, a.title, a.metadata?.status)).filter(Boolean),
    comments: (i.comments?.nodes ?? []).map((c) => ({ id: c.id, body: c.body ?? "", url: c.url, at: c.createdAt, author: person(c.user) || "someone", parentId: c.parent?.id ?? null })),
    states: (i.team?.states?.nodes ?? []).map((s) => ({ id: s.id, name: s.name, type: s.type, color: s.color, position: s.position })),
    truncated: Boolean(i.commentsTruncated),
  };
}

/** A GitHub issue (a card or in full) in the page's shape; read only, so no workflow states. */
export function fromGitHub(i, repo) {
  const open = i.state === "OPEN", done = i.stateReason !== "NOT_PLANNED";
  return {
    id: `${repo}#${i.number}`, number: i.number, ref: `#${i.number}`, title: i.title ?? "", url: i.url, updatedAt: i.updatedAt,
    state: open ? { name: "Open", color: "ansi2", icon: "circle-dot" } : { name: done ? "Closed" : "Not planned", color: done ? "ansi5" : "dim", icon: done ? "circle-check" : "circle-x" },
    assignee: (i.assignees?.nodes ?? []).map(person).join(", "), priority: 0,
    labels: (i.labels?.nodes ?? []).map((l) => ({ name: l.name, color: `#${l.color}` })), project: i.milestone?.title ?? null, cycle: null,
    description: i.body ?? null, descriptionHTML: i.bodyHTML ?? "",
    prs: (i.closedByPullRequestsReferences?.nodes ?? []).map((p) => ({ repo: p.repository?.nameWithOwner ?? repo, number: p.number, url: p.url, title: p.title, status: String(p.state ?? "").toLowerCase() })),
    comments: (i.comments?.nodes ?? []).map((c) => ({ id: c.id, body: c.body ?? "", bodyHTML: c.bodyHTML ?? "", url: c.url, at: c.createdAt, author: person(c.author) || "ghost", parentId: null })),
    states: [], truncated: Boolean(i.commentsTruncated),
  };
}

/** Linear's priorities (0 none … 1 urgent, 4 low) as a mark: an icon and its color, or null for none. */
export const PRIORITY = { 1: { icon: "circle-alert", color: "ansi1", label: "Urgent" }, 2: { icon: "signal-high", color: "muted", label: "High" },
  3: { icon: "signal-medium", color: "muted", label: "Medium" }, 4: { icon: "signal-low", color: "muted", label: "Low" } };

/** One or two letters for who an issue is assigned to. */
export const initials = (name) => String(name ?? "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

const threaded = new WeakMap();
/**
 * Comments as threads: each top-level one and its replies, in the order the provider gave them; once per issue object (a read
 * replaces it). After Branch Issue's commentThreads.
 */
export function commentThreads(issue) {
  if (threaded.has(issue)) return threaded.get(issue);
  const all = issue.comments ?? [], ids = new Set(all.map((c) => c.id)), replies = new Map();
  for (const c of all) {
    if (!c.parentId || !ids.has(c.parentId)) continue;
    if (replies.has(c.parentId)) replies.get(c.parentId).push(c); else replies.set(c.parentId, [c]);
  }
  const threads = all.filter((c) => !c.parentId || !ids.has(c.parentId)).map((root) => [root, ...(replies.get(root.id) ?? [])]);
  threaded.set(issue, threads);
  return threads;
}

const WORKFLOW = ["triage", "backlog", "unstarted", "started", "completed", "canceled"];
/** A team's states in the order work moves through them, then by Linear's own position. */
export const workflowOrder = (states) => [...states].sort((a, b) => WORKFLOW.indexOf(a.type) - WORKFLOW.indexOf(b.type) || (a.position ?? 0) - (b.position ?? 0));

/** What a shut section says on its heading's right. */
export function sectionSummary(key, issue) {
  if (key === "prs") return issue.prs.length ? `${issue.prs.length} linked` : "None";
  if (key === "comments") { const n = (issue.comments ?? []).length; return n ? `${n} ${n === 1 ? "comment" : "comments"}` : "None"; }
  return null;
}

/** The page's words for a Linear key it can't use: none found, or Linear refused it. */
export const KEY_ADD = 'security add-generic-password -a "$USER" -s linear-api-key -w';
export function keyProblem(kind) {
  return kind === "rejected"
    ? { title: "Linear rejected the API key", detail: "The key found isn't valid any more. Create a new one at linear.app/settings/api and store it again, then try again." }
    : { title: "No Linear API key", detail: "Create a personal key at linear.app/settings/api and store it in the Keychain (this asks for it), or export LINEAR_API_KEY in your shell profile. Then try again." };
}
