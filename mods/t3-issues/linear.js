// Linear for the Issues page: the person's API key, found on this computer and kept only in memory (never logged, drawn,
// written or put in a program's arguments), and Linear's GraphQL API through fetch, the key in the Authorization header as
// Linear's personal keys take it: the key itself, no scheme (Branch Issue's helper/main.go).
import { exec, window } from "herdr";
import { ownParts } from "./images.js";
import { pageRest } from "./paging.js";
import { MINE_FILTER, searchFilter, identifierFilter, fromLinear, branchCandidates } from "./model.js";

export const ENDPOINT = "https://api.linear.app/graphql";
// Upload addresses in what Linear sends come back signed for this long, so a picture downloads without the key.
export const SIGNED_FOR = "600";
export const MINE_PAGE = 50;

/**
 * The key, or null: the macOS Keychain's `linear-api-key` item, else LINEAR_API_KEY in Herdr's own environment, else in a login
 * shell's (a GUI app often lacks the shell's exports; startup files may print first, so the last line). What each prints is
 * the key; none takes it as an argument.
 */
export async function findKey() {
  if (window()?.platform === "macos") {
    const k = await exec("security", ["find-generic-password", "-s", "linear-api-key", "-w"], { timeout: 5000 }).catch(() => null);
    if (k?.code === 0 && k.stdout.trim()) return k.stdout.trim();
  }
  const env = await exec("printenv", ["LINEAR_API_KEY"], { timeout: 5000 }).catch(() => null);
  if (env?.code === 0 && env.stdout.trim()) return env.stdout.trim();
  const sh = await exec("printenv", ["SHELL"], { timeout: 5000 }).catch(() => null);
  const shell = (sh?.code === 0 && sh.stdout.trim()) || "/bin/sh";
  const r = await exec(shell, ["-lic", 'printf "\\n%s" "$LINEAR_API_KEY"'], { timeout: 5000 }).catch(() => null);
  return (r?.code === 0 && r.stdout.split("\n").pop().trim()) || null;
}

/** Linear's answer's data, or a throw in words that never carry the key; `rejected` on the error when Linear refused the key. */
export async function linear(key, query, variables = {}) {
  let res;
  try {
    res = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: key, "Content-Type": "application/json", "public-file-urls-expire-in": SIGNED_FOR },
      body: JSON.stringify({ query, variables }) });
  } catch { throw new Error("Linear is unreachable. Check your connection, then try again."); }
  const refused = () => Object.assign(new Error("Linear rejected the API key."), { rejected: true });
  if (res.status === 401 || res.status === 403) throw refused();
  let body;
  try { body = await res.json(); } catch { throw new Error(`Linear answered something unreadable (HTTP ${res.status}).`); }
  if (body?.errors?.length) {
    const message = String(body.errors[0]?.message ?? "");
    if (/authentication|api key/i.test(message)) throw refused();
    throw new Error(`Linear: ${message}`);
  }
  if (!res.ok) throw new Error(`Linear: HTTP ${res.status}`);
  return body.data;
}

const LINEAR_CARD = "id identifier title url priority updatedAt state { id name type color } assignee { name displayName } team { id key }";
const LINEAR_COMMENT = "id body url createdAt user { name displayName } parent { id }";
const LIST = `query($filter: IssueFilter) { issues(filter: $filter, first: ${MINE_PAGE}, orderBy: updatedAt) { pageInfo { hasNextPage } nodes { ${LINEAR_CARD} } } }`;

/** The viewer's issues (MINE_FILTER), or with `search` any issue it finds, most recently updated first; `more` past the page. */
export async function listIssues(key, search = "") {
  const data = await linear(key, LIST, { filter: search.trim() ? searchFilter(search) : MINE_FILTER });
  return { items: (data?.issues?.nodes ?? []).map(fromLinear), more: Boolean(data?.issues?.pageInfo?.hasNextPage) };
}

/** The issues named by `ids` (`ENG-12`) that Linear has; the others are dropped. */
export async function issuesNamed(key, ids) {
  if (!ids.length) return [];
  const data = await linear(key, `query($filter: IssueFilter) { issues(filter: $filter, first: ${ids.length}) { nodes { ${LINEAR_CARD} } } }`, { filter: identifierFilter(ids) });
  const found = (data?.issues?.nodes ?? []).map(fromLinear);
  return ids.map((id) => found.find((i) => i.ref === id)).filter(Boolean);
}

const DETAIL = `query($id: String!) { issue(id: $id) { ${LINEAR_CARD} description labels { nodes { name color } } project { name } cycle { number name }
  attachments { nodes { title url metadata } } comments(first: 100) { pageInfo { hasNextPage endCursor } nodes { ${LINEAR_COMMENT} } }
  team { id key states { nodes { id name type color position } } } } }`;

const LINEAR_COMMENTS = `query($id: String!, $after: String) { issue(id: $id) { comments(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${LINEAR_COMMENT} } } } }`;

/** An issue in full, by Linear's id: its comments paged to the end (paging.js, up to its cap), its team's workflow states. */
export async function issueDetail(key, id) {
  const issue = (await linear(key, DETAIL, { id }))?.issue;
  if (!issue) throw new Error("This issue isn't there, or the key can't read it.");
  const { nodes, truncated } = await pageRest(issue.comments, async (after) => (await linear(key, LINEAR_COMMENTS, { id, after }))?.issue?.comments);
  return fromLinear({ ...issue, comments: { nodes }, commentsTruncated: truncated });
}

/**
 * One write on `issue`: `{ kind: "state", target }` (a team state) or `{ kind: "comment" | "reply", body, parent? }` (`parent` the
 * thread's first comment); typed text only in the JSON body.
 */
export async function writeIssue(key, issue, w) {
  const data = w.kind === "state"
    ? await linear(key, "mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }", { id: issue.id, stateId: w.target.id })
    : await linear(key, "mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }", { input: { issueId: issue.id, body: w.body, ...(w.parent ? { parentId: w.parent.id } : {}) } });
  if (!(data?.issueUpdate?.success ?? data?.commentCreate?.success)) throw new Error("Linear didn't take it.");
}

/** Linear as the page's provider (ghissues.js githubIssues has the same shape), read and written with `key`. */
export function linearIssues(key) {
  return {
    id: "linear", where: "Linear", refreshLabel: "Refresh Linear issues", openLabel: "Open in Linear", canWrite: true, hasStates: true, branchInFull: false,
    branchIssues: (info) => issuesNamed(key, branchCandidates(info.branch, info.config)),
    noBranchIssue: (info) => {
      const ids = branchCandidates(info.branch, info.config);
      return ids.length ? `No Linear issue ${ids.join(", ")}.` : `No Linear issue in this branch's name (${info.branch}). Name it like ABC-123-… or pick one in Mine.`;
    },
    mine: () => listIssues(key),
    search: (q) => listIssues(key, q),
    detail: (card) => issueDetail(key, card.id),
    write: (issue, w) => writeIssue(key, issue, w),
    parts: (owner, body) => ownParts(owner, body),
  };
}
