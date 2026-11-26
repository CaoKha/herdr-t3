// Every GitHub read and write the Pull requests page makes, through gh (github.js). After Branch PR's gh.js (munza/herdr-mods,
// Apache-2.0).
import { gh, gql, ownerName } from "./github.js";
import { pageRest, PAGE_CAP } from "./paging.js";

// The repository's open PRs, most recently updated first: the Repo list and every stack drawn from it.
export const OPEN_PAGE = 100;
export const BRANCH_PAGE = 30;

const CARD = "number title url state isDraft updatedAt headRefName baseRefName author { login } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }";

/** One read for both tabs: `branch`'s PRs in any state (none when HEAD is detached) and the repository's open PRs. */
export async function listPRs({ repo, branch }) {
  const mine = branch ? `branch: pullRequests(headRefName: $branch, states: [OPEN, CLOSED, MERGED], first: ${BRANCH_PAGE}, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ${CARD} headRepository { nameWithOwner } } }` : "";
  const data = await gql(`query($owner: String!, $name: String!${branch ? ", $branch: String!" : ""}) { repository(owner: $owner, name: $name) { ${mine}
    open: pullRequests(states: [OPEN], first: ${OPEN_PAGE}, orderBy: { field: UPDATED_AT, direction: DESC }) { totalCount nodes { ${CARD} isCrossRepository } } } }`,
  { ...ownerName(repo), ...(branch ? { branch } : {}) });
  const r = data?.repository;
  if (!r) throw new Error(`GitHub: ${repo} isn't there, or this gh login can't read it.`);
  return { branch: branch ? r.branch?.nodes ?? [] : null, open: r.open?.nodes ?? [], openTotal: r.open?.totalCount ?? 0 };
}

const DETAIL = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) {
  ${CARD} body bodyHTML headRefOid baseRefOid mergeable mergeStateStatus reviewDecision
  latestOpinionatedReviews(first: 50) { nodes { state author { login } } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 100) { nodes { __typename
    ... on CheckRun { name status conclusion detailsUrl } ... on StatusContext { context state targetUrl } } } } } } } } } }`;
// Its own read: a team reviewer can take more access than the PR, and that mustn't cost the whole detail.
const REQUESTS = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) {
  reviewRequests(first: 50) { nodes { requestedReviewer { ... on User { login } ... on Bot { login } ... on Mannequin { login } ... on Team { combinedSlug } } } } } } }`;

const settled = (p) => p.then((d) => ({ d, e: null }), (e) => ({ d: null, e }));

/**
 * PR `number` in full: checks, reviews, mergeability, body and its conversation. `reviewersError` or `conversationError` when
 * only that part failed, so the rest still shows.
 */
export async function prDetail(repo, number) {
  const vars = { ...ownerName(repo), number };
  const [data, asked, talk] = await Promise.all([gql(DETAIL, vars), settled(gql(REQUESTS, vars)), settled(conversation(repo, number))]);
  const pr = data?.repository?.pullRequest;
  if (!pr) throw new Error(`GitHub: #${number} isn't there, or this gh login can't read it.`);
  return { ...pr, reviewRequests: asked.d?.repository?.pullRequest?.reviewRequests ?? null, reviewersError: asked.e?.message ?? null,
    comments: talk.d?.comments ?? [], reviews: talk.d?.reviews ?? [], threads: talk.d?.threads ?? [], conversationTruncated: Boolean(talk.d?.truncated),
    conversationError: talk.e?.message ?? null };
}

const PAGE_INFO = "pageInfo { hasNextPage endCursor }";
// bodyHTML beside each body: its pictures' signed addresses (images.js).
const THREAD_COMMENT = "id body bodyHTML url createdAt diffHunk author { login }";
// A page of each part still unread; the three page on their own cursors, and a part read to its end isn't asked again.
const PARTS = {
  comments: "comments(first: 100, after: $comments) { PAGE nodes { id body bodyHTML url createdAt author { login } } }",
  reviews: "reviews(first: 100, after: $reviews) { PAGE nodes { id body bodyHTML url state submittedAt author { login } } }",
  threads: `threads: reviewThreads(first: 50, after: $threads) { PAGE nodes { id path line originalLine isResolved isOutdated viewerCanReply viewerCanResolve viewerCanUnresolve
    comments(first: 100) { PAGE nodes { ${THREAD_COMMENT} } } } }`,
};
// PAGE_CAP rounds read 1000 comments, 1000 reviews and 500 threads; past that, or a thread's 1100th reply, `truncated` says so.

/** Everything said on PR `number`: its comments, review bodies and review threads with every reply, paged as GitHub gives them. */
export async function conversation(repo, number) {
  const found = { comments: [], reviews: [], threads: [] }, after = {};
  let pending = Object.keys(found), truncated = false;
  for (let page = 0; pending.length; page++) {
    if (page === PAGE_CAP) { truncated = true; break; }
    const query = `query($owner: String!, $name: String!, $number: Int!, ${pending.map((k) => `$${k}: String`).join(", ")}) { repository(owner: $owner, name: $name) {
      pullRequest(number: $number) { ${pending.map((k) => PARTS[k]).join(" ").replaceAll("PAGE", PAGE_INFO)} } } }`;
    const vars = { ...ownerName(repo), number };
    for (const k of pending) if (after[k]) vars[k] = after[k];
    const pr = (await gql(query, vars))?.repository?.pullRequest;
    if (!pr) throw new Error(`GitHub: #${number} isn't there, or this gh login can't read it.`);
    for (const k of pending) {
      const conn = pr[k];
      found[k].push(...(conn?.nodes ?? []).filter(Boolean));
      after[k] = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
    }
    pending = pending.filter((k) => after[k]);
  }
  // A long thread's later replies, rather than cutting it short.
  const replies = await Promise.all(found.threads.map((thread) => pageRest(thread.comments, async (cursor) => (await gql(
    `query($id: ID!, $cursor: String) { node(id: $id) { ... on PullRequestReviewThread { comments(first: 100, after: $cursor) { ${PAGE_INFO} nodes { ${THREAD_COMMENT} } } } } }`,
    { id: thread.id, cursor }))?.node?.comments)));
  found.threads.forEach((thread, i) => { thread.comments = replies[i].nodes; truncated ||= replies[i].truncated; });
  return { ...found, truncated };
}

const REPLY = "mutation($id: ID!, $body: String!) { addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $id, body: $body }) { comment { id } } }";
const RESOLVE = "mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { id isResolved } } }";
const REOPEN = "mutation($id: ID!) { unresolveReviewThread(input: { threadId: $id }) { thread { id isResolved } } }";

/**
 * The one write `w` asks for: a `reply` to a review thread, `resolve` or `reopen` it, or a new `comment` on PR `number`. What
 * the person typed only ever goes as a raw `-f` field, which gh never reads as a number, a boolean or `@file`. Never retried.
 */
export async function writePR(repo, number, w) {
  if (w.kind === "comment") return gh(["api", `repos/${repo}/issues/${number}/comments`, "--method", "POST", "-f", `body=${w.body}`]);
  if (w.kind === "reply") return gql(REPLY, { id: w.thread, body: w.body });
  return gql(w.kind === "resolve" ? RESOLVE : REOPEN, { id: w.thread });
}
