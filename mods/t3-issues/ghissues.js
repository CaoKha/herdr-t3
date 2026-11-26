// GitHub issues for the Issues page, read only, through gh (github.js) on this computer.
import { gql, ownerName, githubParts } from "./github.js";
import { pageRest } from "./paging.js";
import { fromGitHub, branchIssueNumber } from "./model.js";

export const GH_MINE_PAGE = 50;

const GH_CARD = "number title url state stateReason updatedAt assignees(first: 5) { nodes { login name } }";
const GH_COMMENT = "id body bodyHTML url createdAt author { login }";
const GH_FULL = `${GH_CARD} body bodyHTML labels(first: 20) { nodes { name color } } milestone { title }
  closedByPullRequestsReferences(first: 10) { nodes { number title url state repository { nameWithOwner } } }
  comments(first: 100) { pageInfo { hasNextPage endCursor } nodes { ${GH_COMMENT} } }`;
const GH_ISSUE = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { ${GH_FULL} } } }`;
const GH_COMMENTS = `query($owner: String!, $name: String!, $number: Int!, $after: String) { repository(owner: $owner, name: $name) { issue(number: $number) {
  comments(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${GH_COMMENT} } } } } }`;

/** The repository's issues the viewer is assigned and still open, or with `search` any issue its words find; newest first. */
export async function listGitHub(repo, search = "") {
  const q = search.trim() ? `repo:${repo} is:issue sort:updated-desc ${search.trim()}` : `repo:${repo} is:issue is:open assignee:@me sort:updated-desc`;
  const data = await gql(`query($q: String!) { search(type: ISSUE, query: $q, first: ${GH_MINE_PAGE}) { issueCount nodes { ... on Issue { ${GH_CARD} } } } }`, { q });
  const nodes = (data?.search?.nodes ?? []).filter((n) => n?.number);
  return { items: nodes.map((i) => fromGitHub(i, repo)), more: (data?.search?.issueCount ?? 0) > nodes.length };
}

/** Issue `number` in full with its comments (paging.js, up to its cap), or null when the number isn't an issue (a PR, none). */
export async function gitHubIssue(repo, number) {
  let data;
  try { data = await gql(GH_ISSUE, { ...ownerName(repo), number }); }
  catch (e) { if (/Could not resolve to an Issue/i.test(e?.message ?? "")) return null; throw e; }
  const issue = data?.repository?.issue;
  if (!issue) return null;
  const { nodes, truncated } = await pageRest(issue.comments, async (after) => (await gql(GH_COMMENTS, { ...ownerName(repo), number, after }))?.repository?.issue?.comments);
  return fromGitHub({ ...issue, comments: { nodes }, commentsTruncated: truncated }, repo);
}

/** Repository `repo`'s GitHub issues as the page's provider (linear.js linearIssues has the same shape), read only: no `write`. */
export function githubIssues(repo) {
  return {
    id: "github", where: repo, refreshLabel: `Refresh GitHub issues in ${repo}`, openLabel: "Open on GitHub", canWrite: false, hasStates: false, branchInFull: true,
    branchIssues: async (info) => {
      const n = branchIssueNumber(info.branch), issue = n ? await gitHubIssue(repo, n) : null;
      return issue ? [issue] : [];
    },
    noBranchIssue: (info) => {
      const n = branchIssueNumber(info.branch);
      return n ? `No issue #${n} in ${repo}.` : `No issue number in this branch's name (${info.branch}).`;
    },
    mine: () => listGitHub(repo),
    search: (q) => listGitHub(repo, q),
    detail: (card) => gitHubIssue(repo, card.number),
    parts: (owner, body, html) => githubParts(owner, body, html),
  };
}
