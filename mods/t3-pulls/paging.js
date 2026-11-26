// The rest of a paged GraphQL connection (GitHub's or Linear's), so a long one is read to its end, up to a cap.

// More pages than this past the first and the rest is left for the browser.
export const PAGE_CAP = 10;

const cursor = (conn) => (conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null);

/**
 * Every node of connection `first` ({ nodes, pageInfo }), reading each next page with `next(cursor)`, at most `max` more;
 * `truncated` when there was more past that.
 * @param {any} first @param {(cursor: string) => Promise<any>} next
 */
export async function pageRest(first, next, max = PAGE_CAP) {
  const nodes = [...(first?.nodes ?? [])].filter(Boolean);
  for (let page = 0, at = cursor(first); at; page++) {
    if (page === max) return { nodes, truncated: true };
    const conn = await next(at);
    nodes.push(...(conn?.nodes ?? []).filter(Boolean));
    at = cursor(conn);
  }
  return { nodes, truncated: false };
}
