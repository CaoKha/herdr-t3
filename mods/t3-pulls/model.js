// What GitHub's answers mean for the Pull requests page, as plain functions: no Herdr, no drawing. What's derived from a read
// PR is worked out once per object (each read brings new ones).
const memo = (fn) => { const kept = new WeakMap(); return (o) => { if (!kept.has(o)) kept.set(o, fn(o)); return kept.get(o); }; };

/** The branch's PRs from a branch read: only those pushed from one of this clone's remotes, not a fork's same-named branch. */
export const ownBranchPRs = (prs, heads) => prs.filter((p) => heads.includes(String(p.headRepository?.nameWithOwner ?? "").toLowerCase()));

/** A PR's state as its row and detail draw it: the icon (in the mod's icons/) and the theme color. */
export function prState(pr) {
  if (pr.state === "MERGED") return { label: "Merged", icon: "git-merge", color: "ansi5" };
  if (pr.state === "CLOSED") return { label: "Closed", icon: "git-pull-request-closed", color: "ansi1" };
  if (pr.isDraft) return { label: "Draft", icon: "git-pull-request-draft", color: "dim" };
  return { label: "Open", icon: "git-pull-request", color: "ansi2" };
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
  failure: { icon: "circle-x", color: "ansi1" },
  pending: { icon: "circle-dashed", color: "ansi3" },
  success: { icon: "circle-check", color: "ansi2" },
  skipped: { icon: "circle-minus", color: "dim" },
};

/** A list row's mark: GitHub's rollup of the head commit's checks, or null when it has none. */
export function rollupKind(pr) {
  const state = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  return state ? checkKind(state) : null;
}

const WORST_FIRST = ["failure", "pending", "success", "skipped"];
/** The head commit's checks, those needing attention first, then by name. */
export const checksOf = memo((pr) => {
  const nodes = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? [];
  return nodes.filter(Boolean).map((n) => n.__typename === "StatusContext"
    ? { name: n.context ?? "", kind: checkKind(n.state), url: n.targetUrl ?? null }
    : { name: n.name ?? "", kind: checkKind(n.status === "COMPLETED" ? n.conclusion : n.status), url: n.detailsUrl ?? null })
    .sort((a, b) => WORST_FIRST.indexOf(a.kind) - WORST_FIRST.indexOf(b.kind) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
});

/** How many checks are failing, running, passed and skipped; `counted` those not skipped. */
const checkCounts = memo((pr) => {
  const n = { failure: 0, pending: 0, success: 0, skipped: 0 };
  for (const c of checksOf(pr)) n[c.kind]++;
  return { failing: n.failure, running: n.pending, passed: n.success, skipped: n.skipped, counted: n.failure + n.pending + n.success };
});

/** One row per person: their latest approval or change request, a waiting request over it, since that is what they owe now. */
export const reviewersOf = memo((pr) => {
  const rows = new Map();
  for (const n of pr.latestOpinionatedReviews?.nodes ?? []) if (n?.author?.login) rows.set(n.author.login, n.state);
  for (const n of pr.reviewRequests?.nodes ?? []) {
    const r = n?.requestedReviewer ?? {}, login = r.combinedSlug ?? r.login;
    if (login) rows.set(login, "REQUESTED");
  }
  return [...rows].map(([login, state]) => ({ login, state }));
});

/** The reviewers a review is owed or given by, a plain comment aside; `approved` of them. */
const askedReviewers = memo((pr) => {
  const asked = reviewersOf(pr).filter((r) => r.state !== "COMMENTED" && r.state !== "DISMISSED");
  return { asked: asked.length, approved: asked.filter((r) => r.state === "APPROVED").length, changes: asked.some((r) => r.state === "CHANGES_REQUESTED") };
});

export const REVIEW_LOOK = {
  APPROVED: { label: "Approved", color: "ansi2" },
  CHANGES_REQUESTED: { label: "Changes requested", color: "ansi1" },
  REQUESTED: { label: "Requested", color: "ansi3" },
  COMMENTED: { label: "Commented", color: "dim" },
  DISMISSED: { label: "Dismissed", color: "dim" },
};

const count = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Whether a PR can merge now, in words, and its worst reason first, as Branch PR's mergeBlockers ranks them (munza/herdr-mods,
 * Apache-2.0): a draft, conflicts, failing checks, changes requested, running checks, a review required, behind its base,
 * blocked otherwise, GitHub still checking, else ready. `section`: where its detail is (checks, reviewers).
 */
export function verdict(pr) {
  if (pr.state === "MERGED") return { text: "Merged", tone: "merged" };
  if (pr.state === "CLOSED") return { text: "Closed", tone: "danger" };
  const { failing, running } = checkCounts(pr), changes = pr.reviewDecision === "CHANGES_REQUESTED" || askedReviewers(pr).changes;
  if (pr.isDraft) return { text: "Draft", tone: "none" };
  if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") return { text: `Conflicts with ${pr.baseRefName}`, tone: "danger" };
  if (failing) return { text: `Blocked: ${count(failing, "check")} failing`, tone: "danger", section: "checks" };
  if (changes) return { text: "Blocked: changes requested", tone: "danger", section: "reviewers" };
  if (running) return { text: `Waiting: ${count(running, "check")} running`, tone: "waiting", section: "checks" };
  if (pr.reviewDecision === "REVIEW_REQUIRED") return { text: "Blocked: review required", tone: "waiting", section: "reviewers" };
  if (pr.mergeStateStatus === "BEHIND") return { text: `Behind ${pr.baseRefName}`, tone: "waiting" };
  if (pr.mergeStateStatus === "BLOCKED") return { text: "Blocked", tone: "waiting" };
  // GitHub works mergeability out after it's first asked: a later read has it.
  if (pr.mergeable === "UNKNOWN" || pr.mergeStateStatus === "UNKNOWN" || !pr.mergeStateStatus) return { text: "Checking…", tone: "none" };
  return { text: "Ready to merge", tone: "good" };
}

/** The status line's counts after the verdict: checks passed of those counted (skipped aside), reviews approved of those asked. */
export function tallies(pr) {
  const c = checkCounts(pr), r = askedReviewers(pr);
  return { checks: c.counted ? `${c.passed}/${c.counted} checks` : "No checks", reviews: r.asked ? `${r.approved}/${r.asked} reviews` : "No reviews" };
}

export const TONE_COLOR = { danger: "ansi1", waiting: "ansi3", good: "ansi2", merged: "ansi5", none: "dim" };

const stacks = new WeakMap();
/**
 * The open PRs this one is stacked on (its base is another's head, and so on down to `trunk`) and those stacked on it, top
 * first, as Graphite and gh-stack draw them; null for a PR on its own. `open`: the repository's open PRs, worked out once per
 * read; a fork's can't be a layer. After Branch PR's stackOf (munza/herdr-mods, Apache-2.0).
 */
export function stackOf(pr, open) {
  if (!stacks.has(open)) stacks.set(open, new Map());
  const kept = stacks.get(open);
  if (kept.has(pr.number)) return kept.get(pr.number);
  const others = open.filter((p) => p.number !== pr.number && !p.isCrossRepository);
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
  const stack = !below.length && !above.length ? null : { layers: [...above, open.find((p) => p.number === pr.number) ?? pr, ...below], trunk };
  kept.set(pr.number, stack);
  return stack;
}

/** Whether `pr` matches every word of `query`: its number (`12` or `#12`) exactly, or words in its title or head branch, case aside. */
export function matches(pr, query) {
  const text = `${pr.title ?? ""}\n${pr.headRefName ?? ""}`.toLowerCase();
  return String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean)
    .every((w) => /^#?(\d+)$/.exec(w)?.[1] === String(pr.number) || text.includes(w));
}

const REVIEW_WORD = { APPROVED: "Approved", CHANGES_REQUESTED: "Changes requested", COMMENTED: "Reviewed", DISMISSED: "Dismissed" };

/**
 * What's been said on a PR, in order: its comments and reviews (a review the viewer hasn't submitted, or a plain comment
 * review with no words, says nothing here) by time, then its review threads by their first comment. After Branch PR's
 * conversationEntries (munza/herdr-mods, Apache-2.0).
 */
export const conversationEntries = memo((pr) => {
  const said = [
    ...(pr.comments ?? []).map((c) => ({ ...c, kind: "Comment", at: c.createdAt })),
    ...(pr.reviews ?? []).filter((r) => r.state !== "PENDING" && (r.body?.trim() || r.state !== "COMMENTED"))
      .map((r) => ({ ...r, kind: REVIEW_WORD[r.state] ?? "Review", at: r.submittedAt })),
  ];
  const threads = (pr.threads ?? []).filter((t) => t.comments?.length).map((thread) => ({ id: thread.id, thread, at: thread.comments[0].createdAt }));
  const byTime = (a, b) => (a.at ?? "") < (b.at ?? "") ? -1 : (a.at ?? "") > (b.at ?? "") ? 1 : 0;
  return [...said.sort(byTime), ...threads.sort(byTime)];
});

/** `path:line` of a review thread; an outdated one's line is where it was. */
export const threadPlace = (thread) => {
  const line = thread.line ?? thread.originalLine;
  return line == null ? thread.path : `${thread.path}:${line}`;
};

// A comment is about the end of its hunk, which can run to hundreds of lines: its last rows.
const HUNK_LINES = 6;
export const hunkTail = (rows) => rows.slice(-HUNK_LINES);

/** A thread starts shut when it needs nothing now: resolved, or about code that has since changed. */
export const threadShut = (thread) => Boolean(thread.isResolved || thread.isOutdated);

/** Checks starts open only while one is failing or still running, when the person hasn't chosen (page.js sectionOpen's fallback). */
export const checksOpenByDefault = (pr) => { const c = checkCounts(pr); return !c.counted && !c.skipped || c.failing > 0 || c.running > 0; };

/** What a shut section says on its heading's right, and in which tone; null when it has nothing to add. */
export function sectionSummary(key, pr, stack = null) {
  if (key === "checks") {
    const c = checkCounts(pr);
    if (!c.counted) return { text: "None", tone: "none" };
    if (c.failing) return { text: `${c.failing} failing`, tone: "danger" };
    if (c.running) return { text: `${c.running} running`, tone: "waiting" };
    return { text: `${c.counted}/${c.counted} passed`, tone: "none" };
  }
  if (key === "reviewers") {
    const r = askedReviewers(pr);
    return { text: r.asked ? `${r.approved}/${r.asked} approved` : "None", tone: "none" };
  }
  if (key === "comments") {
    const n = conversationEntries(pr).length, open = (pr.threads ?? []).filter((t) => !t.isResolved).length;
    return { text: `${n}${open ? `, ${open} unresolved` : ""}`, tone: open ? "waiting" : "none" };
  }
  if (key === "stack" && stack) return { text: `${stack.layers.length} layers`, tone: "none" };
  return null;
}

/** The one git fetch that brings a PR's head and its base branch into the clone; FETCH_HEAD then lists them in that order. */
export const fetchArgs = (remote, pr) => ["fetch", "--no-tags", "--quiet", remote, `refs/pull/${pr.number}/head`, `refs/heads/${pr.baseRefName}`];
/** The commits a fetch wrote to FETCH_HEAD, in the order it was asked for them. */
export const fetchHeadShas = (text) => String(text ?? "").split("\n").map((l) => /^([0-9a-f]{40,64})\b/.exec(l)?.[1]).filter(Boolean);
/** Review's page for what GitHub shows of a PR: what head adds since it forked from base. */
export const comparePage = (base, head) => `/compare/${base}...${head}`;
