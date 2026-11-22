const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const kit = require("../mods/t3-tabs/check-kit.js");
const { plain } = kit;

function harness() {
  let now = 1000;
  const state = {};
  const sharedWrites = [];
  const timers = [];
  let notifies = 0;

  const FakeDate = function (...args) { return args.length ? new Date(...args) : new Date(now); };
  FakeDate.now = () => now;

  const cx = {
    notify() { notifies++; },
    timer: {
      after(ms, fn) {
        const t = { ms, at: now + ms, fn, cancelled: false, cancel() { this.cancelled = true; } };
        timers.push(t);
        return t;
      },
    },
  };

  const env = {
    Date: FakeDate,
    KEY: { notice: "t3.notice" },
    shared: (k) => state[k] ?? null,
    setShared: (k, v) => { sharedWrites.push([k, v && plain(v)]); state[k] = v; },
    t3Notice: { current: null, gen: 0 },
  };

  const src = kit.strip(fs.readFileSync(path.join(__dirname, "notice.js"), "utf8"))
    + "\nglobalThis.api = { rememberNotice, forgetNotice, undoNotice };";

  const loadCaller = () => {
    const scope = vm.createContext({ ...env });
    vm.runInContext(src, scope, { filename: "shared/notice.js" });
    return scope.api;
  };

  const elapse = (ms) => {
    now += ms;
    for (;;) {
      const ready = timers.filter(t => !t.cancelled && t.at <= now).sort((a, b) => a.at - b.at);
      if (!ready.length) break;
      const t = ready[0];
      t.cancelled = true;
      t.fn(cx);
    }
  };

  return {
    cx,
    state,
    sharedWrites,
    timers,
    env,
    loadCaller,
    elapse,
    get now() { return now; },
    set now(v) { now = v; },
    get notifies() { return notifies; },
    set notifies(v) { notifies = v; },
  };
}

(async () => {
  // 1. Metadata-only publication, fade-in (16ms), and fade-out (5000ms -> 250ms) timers.
  {
    const h = harness();
    const tabs = h.loadCaller();
    let ran = 0;
    tabs.rememberNotice("Settled", 1, () => { ran++; }, h.cx);
    assert.deepEqual(plain(h.state["t3.notice"]), {
      action: "Settled", count: 1, gen: 1, shown: false, live: true, at: 1000,
    });
    assert.deepEqual(Object.keys(h.state["t3.notice"]).sort(), ["action", "at", "count", "gen", "live", "shown"]);

    h.elapse(16);
    assert.equal(h.state["t3.notice"].shown, true);
    assert.ok(h.notifies >= 1);

    h.elapse(4984);
    assert.deepEqual([h.state["t3.notice"].live, h.state["t3.notice"].shown], [false, false]);

    h.elapse(250);
    assert.equal(h.state["t3.notice"], null);
    await tabs.undoNotice(h.cx);
    assert.equal(ran, 0, "expired notice after fade-out does not run undo");
  }

  // 2. Cross-source batching (t3-inbox click + t3-tabs cmd-shift-s) refreshes 5000ms timer cleanly.
  {
    const h = harness();
    const inbox = h.loadCaller();
    const tabs = h.loadCaller();
    const order = [];

    inbox.rememberNotice("Settled", 1, async () => { order.push("inbox"); }, h.cx);
    h.elapse(16);
    assert.equal(h.state["t3.notice"].gen, 1);

    h.elapse(3000); // now = 4016 (within 5000ms)
    tabs.rememberNotice("Settled", 2, async () => { order.push("tabs"); }, h.cx);
    assert.deepEqual(plain(h.state["t3.notice"]), {
      action: "Settled", count: 3, gen: 1, shown: true, live: true, at: 4016,
    });

    // Passing the original 1000 + 5000 = 6000 mark must NOT expire the joined notice.
    h.elapse(2500); // now = 6516
    assert.equal(h.state["t3.notice"].live, true, "old 5000ms timer was cancelled when joined");

    // Different action does NOT join and starts a fresh notice.
    tabs.rememberNotice("Unpinned", 1, async () => { order.push("unpin"); }, h.cx);
    assert.deepEqual(plain(h.state["t3.notice"]), {
      action: "Unpinned", count: 1, gen: 2, shown: false, live: true, at: 6516,
    });

    // Joining expired notice (>5000ms) does NOT merge.
    h.elapse(5000); // fading out
    h.elapse(250);  // gone
    assert.equal(h.state["t3.notice"], null);
    inbox.rememberNotice("Settled", 1, async () => { order.push("first"); }, h.cx);
    h.elapse(16);
    tabs.rememberNotice("Settled", 1, async () => { order.push("second"); }, h.cx);
    await inbox.undoNotice(h.cx);
    assert.deepEqual(order, ["second", "first"], "cross-source undo runs reverse order regardless of which caller triggers undo");
  }

  // 3. drop(n, cx) only decrements its own notice; stale handles never touch a newer notice.
  {
    const h = harness();
    const inbox = h.loadCaller();
    const tabs = h.loadCaller();
    const undone = [];

    const h1 = inbox.rememberNotice("Settled", 2, () => { undone.push("h1"); }, h.cx);
    const h2 = tabs.rememberNotice("Settled", 1, () => { undone.push("h2"); }, h.cx);
    assert.equal(h.state["t3.notice"].count, 3);

    h1.drop(1, h.cx);
    assert.equal(h.state["t3.notice"].count, 2, "partial drop decrements count");
    assert.equal(h.state["t3.notice"].live, true);

    h1.drop(1, h.cx);
    assert.equal(h.state["t3.notice"].count, 1, "dropping remaining count of h1 leaves h2 active");
    await tabs.undoNotice(h.cx);
    assert.deepEqual(undone, ["h2"], "dropped entry is excluded from undo");

    // Dropping to 0 forgets the notice.
    const h3 = inbox.rememberNotice("Snoozed", 1, () => { undone.push("h3"); }, h.cx);
    h3.drop(1, h.cx);
    assert.equal(h.state["t3.notice"].live, false, "drop to 0 starts fade-out");
    h.elapse(250);
    assert.equal(h.state["t3.notice"], null);

    // Stale handle drop after notice replacement is a no-op.
    const stale = inbox.rememberNotice("Settled", 1, () => {}, h.cx);
    tabs.rememberNotice("Unpinned", 1, () => { undone.push("unpin"); }, h.cx);
    stale.drop(1, h.cx);
    assert.equal(h.state["t3.notice"].action, "Unpinned");
    assert.equal(h.state["t3.notice"].count, 1);
    assert.equal(h.state["t3.notice"].live, true);
  }

  // 4. Instant undo clears notice & state immediately (preventing double-run) and awaits in reverse order.
  {
    const h = harness();
    const inbox = h.loadCaller();
    const tabs = h.loadCaller();
    const events = [];
    let releaseFirst;

    inbox.rememberNotice("Settled", 1, () => { events.push("first"); }, h.cx);
    tabs.rememberNotice("Settled", 1, () => new Promise((resolve) => {
      events.push("second:start");
      releaseFirst = () => { events.push("second:done"); resolve(true); };
    }), h.cx);

    const running = inbox.undoNotice(h.cx);
    assert.equal(h.state["t3.notice"], null, "KEY.notice is cleared immediately before awaiting");
    assert.equal(h.env.t3Notice.current, null, "in-process state is cleared immediately");
    assert.deepEqual(events, ["second:start"]);

    // Second undo press while first is awaiting must be a no-op.
    await tabs.undoNotice(h.cx);
    assert.deepEqual(events, ["second:start"]);

    releaseFirst();
    await running;
    assert.deepEqual(events, ["second:start", "second:done", "first"]);
  }

  // 5. Failed undo restores notice with only failed entries & summed count for retry.
  {
    const h = harness();
    const inbox = h.loadCaller();
    const tabs = h.loadCaller();
    let failA = true;
    const ran = [];

    inbox.rememberNotice("Settled", 2, async () => { ran.push("A"); return !failA; }, h.cx);
    tabs.rememberNotice("Settled", 1, async () => { ran.push("B"); return true; }, h.cx);
    h.elapse(4900); // now = 5900

    await tabs.undoNotice(h.cx);
    assert.deepEqual(ran, ["B", "A"]);
    assert.deepEqual(plain(h.state["t3.notice"]), {
      action: "Settled", count: 2, gen: 1, shown: true, live: true, at: 5900,
    }, "restores only the failed entry with its count and fresh retry window");

    ran.length = 0;
    failA = false;
    await inbox.undoNotice(h.cx);
    assert.deepEqual(ran, ["A"], "retry runs only the previously failed entry");
    assert.equal(h.state["t3.notice"], null);
  }

  // 6. Expired undo (>= 5000ms) is a no-op even if timer has not fired yet.
  {
    const h = harness();
    const tabs = h.loadCaller();
    let ran = 0;
    tabs.rememberNotice("Settled", 1, () => { ran++; }, h.cx);
    h.now += 5000;
    await tabs.undoNotice(h.cx);
    assert.equal(ran, 0, "expired undo does not run past 5000ms");
  }

  console.log("ok: shared/notice.js unifies notice state, cross-source batching, timers, drop handles, instant undo, and retry restoration.");
})().catch((e) => { console.error(e); process.exit(1); });
