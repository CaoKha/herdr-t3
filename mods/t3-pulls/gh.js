// Every GitHub read the page makes, through the `gh` CLI on this computer and with its login, remote spaces included. Read
// only. Arguments go to gh as they are, never through a shell; exec has no stdin, so a query goes as a raw `-f` field.
// After Branch PR's gh.js (munza/herdr-mods, Apache-2.0).
import { exec } from "herdr";

const GH_TIMEOUT = 26000;
// The repository's open PRs, most recently updated first: the Repo list and every stack drawn from it.
export const OPEN_PAGE = 100;
export const BRANCH_PAGE = 30;

const CARD = "number title url state isDraft updatedAt headRefName baseRefName author { login } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }";

/** gh's stdout for `args`, or a throw that says what went wrong; ghProblem (model.js) knows the two that stop everything. */
export async function gh(args) {
  let r;
  try { r = await exec("gh", args, { timeout: GH_TIMEOUT }); }
  catch { throw new Error("GitHub CLI (gh) is not installed."); }
  if (r.code === 0) return r.stdout;
  const err = (r.stderr ?? "").trim();
  if (err.includes("gh auth login") || err.includes("not logged in")) throw new Error("GitHub CLI is not logged in.");
  throw new Error(`GitHub: ${err || `gh exited with ${r.code}`}`);
}

// Numbers are the only typed variables; every other is a raw string.
async function gql(query, vars) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(vars)) args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`);
  const res = JSON.parse(await gh(args));
  if (res.errors?.length) throw new Error(`GitHub: ${res.errors.map((e) => e.message).join("; ")}`);
  return res.data;
}

const owner = (repo) => ({ owner: repo.split("/")[0], name: repo.split("/")[1] });

/** One read for both tabs: `branch`'s PRs in any state (none when HEAD is detached) and the repository's open PRs. */
export async function listPRs({ repo, branch }) {
  const mine = branch ? `branch: pullRequests(headRefName: $branch, states: [OPEN, CLOSED, MERGED], first: ${BRANCH_PAGE}, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ${CARD} headRepository { nameWithOwner } } }` : "";
  const data = await gql(`query($owner: String!, $name: String!${branch ? ", $branch: String!" : ""}) { repository(owner: $owner, name: $name) { ${mine}
    open: pullRequests(states: [OPEN], first: ${OPEN_PAGE}, orderBy: { field: UPDATED_AT, direction: DESC }) { totalCount nodes { ${CARD} isCrossRepository } } } }`,
  { ...owner(repo), ...(branch ? { branch } : {}) });
  const r = data?.repository;
  if (!r) throw new Error(`GitHub: ${repo} isn't there, or this gh login can't read it.`);
  return { branch: branch ? r.branch?.nodes ?? [] : null, open: r.open?.nodes ?? [], openTotal: r.open?.totalCount ?? 0 };
}

const DETAIL = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) {
  ${CARD} body headRefOid baseRefOid mergeable mergeStateStatus reviewDecision
  latestOpinionatedReviews(first: 50) { nodes { state author { login } } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 100) { nodes { __typename
    ... on CheckRun { name status conclusion detailsUrl } ... on StatusContext { context state targetUrl } } } } } } } } } }`;
// Its own read: a team reviewer can take more access than the PR, and that mustn't cost the whole detail.
const REQUESTS = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) {
  reviewRequests(first: 50) { nodes { requestedReviewer { ... on User { login } ... on Bot { login } ... on Mannequin { login } ... on Team { combinedSlug } } } } } } }`;

/** PR `number` in full: checks, reviews, mergeability and body; `reviewersError` when only the review requests failed. */
export async function prDetail(repo, number) {
  const vars = { ...owner(repo), number };
  const [data, asked] = await Promise.all([gql(DETAIL, vars), gql(REQUESTS, vars).then((d) => ({ d, e: null }), (e) => ({ d: null, e }))]);
  const pr = data?.repository?.pullRequest;
  if (!pr) throw new Error(`GitHub: #${number} isn't there, or this gh login can't read it.`);
  return { ...pr, reviewRequests: asked.d?.repository?.pullRequest?.reviewRequests ?? null, reviewersError: asked.e?.message ?? null };
}
