# Quick Review and measured-tooltip review

## What this change does

Details now opens the existing Review scope, Commits and base menus. A choice activates the space's unique Review tab; the base remote switch keeps the picker open. Shared text measurements suppress repeated labels when the visible text fits.

Reviewed read-only against `f989ba75`, including untracked scope/measurement sources. HEAD changed independently during review (`a6c09d9d` → `4ce92221`); the reviewed `shared/review-scope.js` blob is `e8bdaf765d37cdab20e558fd36a0942a30324d15`. Scope is the assigned Actions, shared scope/menu/measurement/panel helpers, Review adapters, and relevant Tabs/Chrome measurement callers and tests. Deleted Git-operation UI and old Chrome icon assets were excluded. Expected load is one local user, including multiple native overlays/windows sharing the documented run cache.

## Findings

### Must fix

1. **A fourth pending source leaves an open picker stuck on Reading** (`shared/review-scope.js:93–108,110–118`; visible effect at `mods/t3-actions/review-details.js:85–94`).
   - **What this is:** The shared cache holds three repository/base entries. An entry may still own an unfinished read, with other open pickers waiting for it.
   - **Problem:** Start an owner and follower on one root, then start three other roots before the first read finishes. Capacity eviction deletes the first pending entry and resolves its waiters with `"drop"`; followers handle only `"retry"` and `"ready"`. The original owner also refuses its completed read because its entry is no longer in the map. Both remain live, but neither receives data or starts another read.
   - **Fix:** Make capacity eviction settle live readers without losing their result or leaving them waiting. Preserve the three-entry reusable-cache bound and late-source checks; do not blindly retry all evicted sources, which can churn when four readers remain active. Add the pending-capacity case below to the shared check.
   - **If we skip it:** An open Quick Review can display `Reading review ranges…` indefinitely after four concurrent root/base reads. The user must close and reopen it. A previously populated Review menu can instead retain old data.

#### Executed counterexample

This reuses the existing inert fixture loader, blocks only its fake Git reads, and touches no Git repository, GUI, daemon or network. Run from the repository root:

```sh
node <<'NODE'
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const prelude = fs.readFileSync('shared/check-review-scope.cjs', 'utf8').split('(async () => {')[0];
vm.runInNewContext(prelude + `(async () => {
  blocked = true;
  const owner = view('/evict-pending'), follower = view('/evict-pending');
  api.openScope(owner, cx); api.openScope(follower, cx); await flush();
  for (const root of ['/second', '/third', '/fourth']) {
    api.openScope(view(root), cx); await flush();
  }
  blocked = false;
  pending.splice(0).forEach(resolve => resolve({code: 0, stdout: '/evict-pending\\n'}));
  await flush();
  console.log(JSON.stringify({ownerReady: !!owner.scopeGit, followerReady: !!follower.scopeGit}));
  assert.ok(owner.scopeGit, 'a live owner must finish after pending-cache eviction');
  assert.ok(follower.scopeGit, 'a live follower must finish after pending-cache eviction');
})().catch(e => { console.error(e); process.exitCode = 1; });`,
  {require, __dirname: path.resolve('shared'), console, process});
NODE
```

Observed output:

```text
{"ownerReady":false,"followerReady":false}
AssertionError [ERR_ASSERTION]: a live owner must finish after pending-cache eviction
```

## Verdict

Fix 1 first. No other concrete defect was established in the assigned paths. The blocker was posted to the existing `panel-ab` thread (`61d9f8dc-b66a-4a19-be23-e44614fbd687`).

Checked callers and read/selection lifetimes, owner/follower release, source checks, base-switch `stays`, unique Review activation, measured font/zoom/container comparisons, unmeasured no-tip behavior, and relevant fixture assertions. The assigned diff whitespace check passed. Reused the caller's successful Actions, shared scope, Review, measured-text, Tabs and Chrome gates instead of rerunning them.

## Not checked

No full-repository gate, fresh native GUI run, real mouse/keyboard routing, real multi-window concurrency replay, or independent replay of the supplied daemon/demo evidence. The counterexample is an executable in-memory shared-module reproduction. No source was changed, deleted, staged or committed; this report is the only authored file.

## Follow-up: finding 1 resolved

The author changed capacity eviction to retain only the three newest **completed** snapshots. Live pending reads remain until completion or explicit release. The existing source/token checks and dead-owner retry remain in place. This matches the caller's confirmed multi-window expectation.

Independently replayed the original in-memory fixture after the fix, without rerunning the full suite. The same four blocked roots, with an owner and follower on the first root, now all finish. Additional assertions confirmed that all five live views receive their repository data and one commit:

```text
{"ownerReady":true,"followerReady":true,"othersReady":[true,true,true]}
```

Reviewed fixed source SHA-256: `926e1660dc6842228bdd6bc2a4acad5c55fbf930cc234ee1090c050c7efec7a9`. The Review copy matched this source. The Actions copy still needed the caller's planned sync at replay time; that integration step is not claimed complete here.

**Verdict: Ship.** This supersedes the earlier verdict. Finding 1 is fixed and the original failure no longer reproduces. No unresolved finding remains in the assigned scope. Validation limits above are unchanged.
