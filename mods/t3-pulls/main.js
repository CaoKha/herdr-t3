// The space panel's Pull requests page (docs/internals/specs/pulls.md): the active tab's branch's PRs and the repository's open
// ones, read through gh, and a PR's detail with its conversation, where the person can comment, reply and resolve. Review shows
// a PR's changes in the Review extra. One copy serves every space, here or on another machine, each one's state kept by its id.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { checking, spaces, exec, theme, nextCommand } from "herdr";
import { panelState, closeSurface, openReview, REVIEW_PROBLEMS } from "./panel.js";
import { tint, GROUP_GAP } from "./button.js";
import { loadingState, emptyState, errorBar, noticeBar } from "./panel-states.js";
import { stopsInit, enter, stop } from "./focus.js";
import { keycap } from "./palette.js";
import { listPRs, prDetail, writePR, OPEN_PAGE } from "./gh.js";
import { discoverRepo, ghProblem, githubParts } from "./github.js";
import { ownBranchPRs, prState, rollupKind, CHECK_LOOK, checksOf, reviewersOf, REVIEW_LOOK, verdict, tallies, TONE_COLOR, stackOf, matches,
  fetchArgs, fetchHeadShas, comparePage, conversationEntries, threadPlace, hunkTail, threadShut, checksOpenByDefault, sectionSummary } from "./model.js";
import { initPictures } from "./pictures.js";
import { codeFont, diffRowsOf } from "./code.js";
import { inlineMenu } from "./inline-menu.js";
import { initPage, stateFor, refreshPage, freshness, pageFrame, sectionOpen, toggleSection, section, control, textButton, note, line, rich, said,
  stateIcon, browse, writeError, draftKey, since, diffBlock, closePage, ghFailed } from "./page.js";
import { initComposer, sent, commentBox, replyBox, replyButton, BUSY } from "./composer.js";
import { segmented } from "./segmented.js";
import { compactField } from "./field.js";
import { ui } from "./layout-settings.js";
import { GIT } from "./git.js";

const MOD = "mods/t3-pulls";
const JIN_TIMEOUT = 20000, FETCH_TIMEOUT = 120000;
const icon = (name) => `${MOD}/icons/${name}.svg`;
const subject = (st, pr) => `${st.info.repo}#${pr.number}`;

export default class Pulls extends View {
  // Set by initPage and initComposer.
  /** @type {Map<string, any>} */ states;
  /** @type {any} */ handle;
  /** @type {string | null} */ replyTo;

  init(_props, cx) {
    initPage(this, cx, { page: "pulls", mod: MOD });
    initComposer(this);
    this.search = InputState.new({ placeholder: "Search pull requests" });
    this.search.on("change", (_e, cx) => cx.notify());
    this.search.on("focus", (_e, cx) => { this.searchFocused = true; cx.notify(); });
    this.search.on("blur", (_e, cx) => { this.searchFocused = false; cx.notify(); });
    // Threads the person opened or shut, against threadShut's default; only this run's.
    /** @type {Map<string, boolean>} */
    this.threadsOpen = new Map();
    initPictures(this, cx, "cache/t3-pulls");
    this.fs = /** @type {any} */ (null);
    stopsInit(this, cx);
    // `t3-pulls.close` (cmd-w while the page has the keyboard) closes the tab, never the terminal behind it.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "close") closeSurface();
        else if (c === "focus") enter(this, cx, "t3-pulls-refresh");
        // `open:<n>`: PR n of the active space's repository, as a row's pick (Issues' linked PRs send it).
        else if (/^open:[1-9][0-9]*$/.test(c)) {
          const sp = spaces().find((s) => s.active);
          if (sp) this.pick(stateFor(this, sp), Number(c.slice(5)), cx);
        }
        cx.notify();
      }
    });
  }

  async close() {
    await closePage(this);
  }

  // What a space shows: what was read for its tab's folder on its machine, and what the person picked. `token` and `detailToken`
  // count reads, so an answer to an older one never lands over a newer. `writing`: the write under way, one at a time.
  blank(sp, folder, tab = "branch") {
    return { id: sp.id, on: sp.machine ?? null, folder, tab, token: 0, detailToken: 0, reading: false, readAt: 0, info: null, problem: null,
      gh: null, error: null, branch: null, open: null, openTotal: 0, picked: null, details: new Map(), busy: null, actionError: null, writing: null };
  }

  read(st, cx) {
    if (checking()) return;
    const fresh = freshness(this, st, "token");
    st.reading = true; st.readAt = Date.now();
    cx.spawn(async (cx) => {
      try {
        const found = await discoverRepo(st.folder, st.on);
        if (!fresh()) return;
        const problem = found.problem ?? found.info.repoProblem;
        if (problem) { Object.assign(st, { info: null, problem, gh: null, error: null, branch: null, open: null, picked: null }); st.details.clear(); return; }
        const info = found.info;
        // Another repository or branch: nothing picked from the last one carries over.
        if (st.info && (st.info.repo !== info.repo || st.info.branch !== info.branch)) {
          Object.assign(st, { branch: null, open: null, picked: null, actionError: null });
          st.details.clear();
        }
        st.info = info; st.problem = null;
        // A PR already picked reads beside the lists.
        const early = st.picked;
        if (early != null) this.readDetail(st, early, cx);
        const lists = await listPRs(info);
        if (!fresh()) return;
        Object.assign(st, { gh: null, error: null, branch: lists.branch && ownBranchPRs(lists.branch, info.heads), open: lists.open, openTotal: lists.openTotal });
        const n = this.shownNumber(st);
        if (n != null && n !== early) this.readDetail(st, n, cx);
      } catch (e) {
        if (!fresh()) return;
        ghFailed(st, e);
      } finally {
        if (fresh()) { st.reading = false; cx.notify(); }
      }
    });
  }

  readDetail(st, n, cx) {
    if (checking() || !st.info) return;
    const repo = st.info.repo, latest = freshness(this, st, "detailToken");
    // A read that ends while a write is under way may predate it: the write reads again when it's done.
    const fresh = () => latest() && st.info?.repo === repo && !st.writing;
    cx.spawn(async (cx) => {
      const was = st.details.get(n);
      try {
        const pr = await prDetail(repo, n);
        if (!fresh()) return;
        st.details.set(n, { pr, error: null });
      } catch (e) {
        if (!fresh()) return;
        const message = e?.message ?? String(e), problem = ghProblem(message);
        if (problem) st.gh = problem; else st.details.set(n, { pr: was?.pr ?? null, error: message });
      }
      cx.notify();
    });
  }

  /**
   * Sends one write for PR `pr` of `st`'s repository (gh.js writePR): `{ kind, thread?, body? }`, `thread` the review thread
   * object, `draft` the draft it empties. Resolve and Reopen show at once and are each other's undo; a failure puts the thread
   * back. Text sent clears its draft only once GitHub has it; a failure keeps it. Done, the detail is read again.
   */
  write(st, pr, { kind, thread = null, body = undefined }, cx, draft = null) {
    if (st.writing || !st.info) return;
    const repo = st.info.repo, n = pr.number, flip = kind === "resolve" || kind === "reopen";
    st.writing = { kind, thread: thread?.id ?? null };
    st.actionError = null;
    // A thread resolved here stays open, its Reopen where Resolve was.
    if (flip) { thread.isResolved = kind === "resolve"; this.threadsOpen.set(thread.id, true); }
    cx.notify();
    cx.spawn(async (cx) => {
      let done = false;
      try {
        await writePR(repo, n, { kind, thread: thread?.id, body });
        done = true;
        if (draft) sent(this, draft);
      } catch (e) {
        if (flip) thread.isResolved = kind !== "resolve";
        const message = e?.message ?? String(e), problem = ghProblem(message);
        st.actionError = writeError(kind, problem ? `${problem.title}: run ${problem.command}.` : message);
      } finally {
        st.writing = null;
        if (done && this.states.get(st.id) === st && st.info?.repo === repo) this.readDetail(st, n, cx);
        cx.notify();
      }
    });
  }

  // The PR whose detail shows: the one picked, else a branch's only PR.
  shownNumber(st) {
    if (st.picked != null) return st.picked;
    return st.tab === "branch" && st.branch?.length === 1 ? st.branch[0].number : null;
  }

  pick(st, n, cx) {
    st.picked = n; st.actionError = null; this.menu = null;
    this.readDetail(st, n, cx);
    cx.notify();
  }

  setTab(st, tab, cx) {
    st.tab = tab; st.picked = null; st.actionError = null;
    const n = this.shownNumber(st);
    if (n != null && !st.details.has(n)) this.readDetail(st, n, cx);
    cx.notify();
  }

  // Why Review can't take this PR, as Review itself words it; "" when it can.
  reviewReason(st, pages) {
    if (!pages.includes("review")) return REVIEW_PROBLEMS.missing;
    return st.info?.root ? "" : REVIEW_PROBLEMS.noRepo;
  }

  // pulls.review takes the same clone, and its daemon opens the PR in a browser on the machine it runs on.
  pullsReason(st, sp, pages) {
    return sp.machine ? "pulls.review is unavailable on remote spaces: it opens in that machine's browser." : this.reviewReason(st, pages);
  }

  // One fetch brings the PR's head and its base branch into the space's clone, then Review shows what GitHub does: head since
  // it forked from base. FETCH_HEAD lists the two in the order asked.
  review(st, pr, pages, cx) {
    if (st.busy || this.reviewReason(st, pages)) return;
    const { root, remote } = st.info, o = { cwd: root, on: st.on, timeout: FETCH_TIMEOUT };
    st.busy = "review"; st.actionError = null; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const f = await exec("git", [...GIT, ...fetchArgs(remote, pr)], o);
        if (f.code !== 0) throw new Error((f.stderr || f.stdout || "").trim() || `git fetch ${remote} failed`);
        const at = await exec("git", [...GIT, "rev-parse", "--git-path", "FETCH_HEAD"], o);
        const text = at.code === 0 ? await exec("cat", [at.stdout.trim()], o) : null;
        const [head, base] = fetchHeadShas(text?.code === 0 ? text.stdout : "");
        if (!head || !base) throw new Error(`git fetch ${remote} brought no commits`);
        if (openReview({ space: st.id, root, page: comparePage(base, head) }) === "unavailable") st.actionError = REVIEW_PROBLEMS.missing;
      } catch (e) { st.actionError = e?.message ?? String(e); }
      finally { st.busy = null; cx.notify(); }
    });
  }

  // The fork's daemon opens a GitHub PR in the browser; it registers the folder it starts in, so a local clone.
  pullsReview(st, sp, pr, pages, cx) {
    if (this.pullsReason(st, sp, pages)) return;
    const { repo, root } = st.info;
    st.actionError = null;
    cx.spawn(async (cx) => {
      const r = await exec("jin.review", ["-d", `${repo}#${pr.number}`], { cwd: root, timeout: JIN_TIMEOUT }).catch(() => null);
      if (!r) st.actionError = "jin.review isn't installed: bun add --global jin.review.";
      else if (r.code !== 0) st.actionError = (r.stderr || r.stdout || "").trim() || `jin.review exited ${r.code}`;
      cx.notify();
    });
  }

  render(cx) {
    const t = theme(), sp = spaces().find((s) => s.active), panel = panelState(), st = sp ? this.states.get(sp.id) : null;
    if (!sp) return div().id("t3-pulls").size_full();
    return pageFrame(this, t, cx, { panel, head: st ? this.head(st, sp, panel.pages, t) : div().flex_1(),
      bars: st?.error && !st.gh && !st.problem ? [errorBar(t, "t3-pulls-error", st.error, (cx) => refreshPage(this, cx), this)] : [],
      body: st ? this.body(st, t, cx) : loadingState(MOD, t, "t3-pulls-loading", "Loading pull requests…") });
  }

  // One row, as Files' header: Branch and Repo, or Back to them from a PR picked off a list; Repo's search; then Refresh and,
  // for the PR shown, Review and ⋯.
  head(st, sp, pages, t) {
    const n = this.shownNumber(st), pr = n != null ? st.details.get(n)?.pr ?? this.card(st, n) : null;
    const searching = st.tab === "repo" && n == null && Boolean(st.open?.length);
    const tab = (id, label, count) => ({ id: `t3-pulls-tab-${id}`, label, count, on: st.tab === id, pick: (cx) => { if (st.tab !== id) this.setTab(st, id, cx); } });
    const reason = pr ? this.reviewReason(st, pages) : "", busy = st.busy === "review";
    return h_flex().id("t3-pulls-bar").flex_1().min_w(0).h_full().gap(8).items_center()
      .child(st.picked != null
        ? control(this, t, "t3-pulls-back", "arrow-left", st.tab === "repo" ? "Back to the repository's pull requests" : "Back to the branch's pull requests",
          (cx) => { st.picked = null; st.actionError = null; this.menu = null; cx.notify(); }, { size: "sm", iconSize: 14 })
        : segmented(this, t, [tab("branch", "Branch", st.branch?.length), tab("repo", "Repo", st.open ? st.openTotal : undefined)], { role: "tab" }))
      .child(searching ? this.searchField(t) : div().flex_1())
      .child(control(this, t, "t3-pulls-refresh", "refresh-cw", "Refresh pull requests", (cx) => refreshPage(this, cx)))
      .when(Boolean(pr), (el) => el
        .child(textButton(this, t, "t3-pulls-review", busy ? "Fetching…" : "Review", "primary", (cx) => this.review(st, pr, pages, cx),
          { disabled: Boolean(reason) || busy, reason: reason || "Fetching the pull request…" }))
        .child(this.moreMenu(st, sp, pr, pages, t)));
  }

  // ⋯: the PR in pulls.review (greyed with why where it can't) and on GitHub, its link copied.
  moreMenu(st, sp, pr, pages, t) {
    const pullsReason = this.pullsReason(st, sp, pages);
    return inlineMenu(this, t, "t3-pulls-more", { label: "More", icon: icon("ellipsis"), items: [
      { label: "Open in pulls.review", icon: image(`${MOD}/icons/pulls-review.svg`).size(16), disabled: Boolean(pullsReason), hint: pullsReason, pick: (cx) => this.pullsReview(st, sp, pr, pages, cx) },
      { label: "Open on GitHub", icon: icon("external-link"), pick: (cx) => browse(st, pr.url, cx) },
      { label: "Copy link", icon: icon("link"), pick: (cx) => cx.write_to_clipboard(pr.url) }] });
  }

  searchField(t) {
    return compactField(this, t, "t3-pulls-search-field", { focused: Boolean(this.searchFocused), focus: () => this.search.focus(),
      escape: () => { this.search.set_value(""); this.handle.focus(); },
      child: Input.new(this.search).w_full().h_full().text_size(ui(12)).text_color(t.foreground).accessibility_label("Search pull requests") });
  }

  body(st, t, cx) {
    if (st.gh) {
      return emptyState(t, "t3-pulls-gh", icon("git-pull-request"), st.gh.title, st.gh.detail)
        .child(keycap(t, st.gh.command))
        .child(div().pt(8).child(textButton(this, t, "t3-pulls-retry", "Try again", "outline", (cx) => refreshPage(this, cx))));
    }
    if (st.problem) return emptyState(t, "t3-pulls-problem", null, null, st.problem);
    if (!st.info || !st.open) return st.error ? div() : loadingState(MOD, t, "t3-pulls-loading", "Loading pull requests…");
    const n = this.shownNumber(st);
    return n != null ? this.detail(st, n, t, cx) : this.list(st, t);
  }

  list(st, t) {
    const empty = (text) => emptyState(t, `t3-pulls-empty-${st.tab}`, null, null, text);
    let prs;
    if (st.tab === "branch") {
      if (!st.info.branch) return empty("HEAD is detached: no branch to match.");
      prs = st.branch ?? [];
      if (!prs.length) return empty(`No pull request from ${st.info.branch}.`);
    } else {
      if (!st.open.length) return empty(`No open pull requests in ${st.info.repo}.`);
      prs = st.open.filter((p) => matches(p, this.search.value()));
      if (!prs.length) return empty(`No pull requests match "${this.search.value().trim()}".`);
    }
    const now = Date.now(), more = st.tab === "repo" && st.openTotal > st.open.length;
    return v_flex().id(`t3-pulls-list-${st.tab}`).size_full().overflow_y_scrollbar().px(12).pb(8).gap(2)
      .children(prs.map((pr) => this.row(st, pr, t, now)))
      .when(more, (el) => el.child(div().px(8).py(8).text_size(ui(12)).text_color(t.dim).child(`The ${OPEN_PAGE} most recently updated of ${st.openTotal}.`)));
  }

  row(st, pr, t, now) {
    const s = prState(pr), kind = rollupKind(pr), id = `t3-pulls-row-${pr.number}`;
    return stop(this, t, id, h_flex().id(id).w_full().px(8).py(6).gap(8).items_start().rounded(6).cursor_pointer()
      .hover((h) => h.bg(tint(t, "chrome", false)))
      .role("button").accessibility_label(`#${pr.number} ${pr.title}, ${s.label}`)
      .on_click((_e, cx) => this.pick(st, pr.number, cx))
      .child(stateIcon(this, t, s, 16).mt(1))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().child(pr.title))
          .when(Boolean(kind), (el) => el.child(stateIcon(this, t, CHECK_LOOK[kind], 14))))
        .child(h_flex().min_w(0).gap(8).text_size(ui(12)).text_color(t.dim)
          .child(div().flex_none().child(`#${pr.number}`))
          .child(div().flex_1().min_w(0).truncate().child(`${pr.headRefName} → ${pr.baseRefName}`))
          .child(div().flex_none().child(since(pr.updatedAt, now))))), 6);
  }

  // A list row's PR, the detail's until its own read lands.
  card(st, n) { return st.branch?.find((p) => p.number === n) ?? st.open?.find((p) => p.number === n) ?? null; }

  detail(st, n, t, cx) {
    const d = st.details.get(n), pr = d?.pr ?? this.card(st, n);
    if (!pr) return d?.error ? emptyState(t, "t3-pulls-detail-error", icon("git-pull-request"), `#${n} couldn't be read`, d.error) : loadingState(MOD, t, "t3-pulls-loading", `Loading #${n}…`);
    const full = Boolean(d?.pr), s = prState(pr), now = Date.now();
    const stack = pr.state === "OPEN" ? stackOf(pr, st.open) : null;
    const part = (key, title, rows, { fallback = true, count = null } = {}) => {
      const open = sectionOpen(this, key, fallback), sum = open ? null : sectionSummary(key, pr, stack);
      return section(this, t, key, title, rows, { open, count, summary: sum && { text: sum.text, color: t[TONE_COLOR[sum.tone]] } });
    };
    return v_flex().id("t3-pulls-detail").size_full().min_h(0)
      .when(Boolean(st.actionError), (el) => el.child(noticeBar(t, "t3-pulls-action-error", st.actionError, t.ansi1, "dismiss", "Dismiss", (cx) => { st.actionError = null; cx.notify(); }, this)))
      .when(Boolean(d?.error) && full, (el) => el.child(errorBar(t, "t3-pulls-detail-error", d.error, (cx) => this.readDetail(st, n, cx), this)))
      .child(v_flex().id(`t3-pulls-detail-${n}`).flex_1().min_h(0).overflow_y_scrollbar().px(12).pb(16)
        .child(h_flex().id("t3-pulls-title").pt(4).gap(8).items_center().text_size(ui(14))
          .child(stateIcon(this, t, s, 16))
          .child(div().min_w(0).truncate().font_medium().child(pr.title))
          .child(div().flex_none().text_color(t.dim).child(`#${n}`)))
        .child(h_flex().pt(4).min_w(0).gap(4).text_size(ui(12)).text_color(t.dim)
          .child(div().flex_none().child(`${pr.author?.login ?? "ghost"} ·`))
          .child(div().min_w(0).truncate().child(`${pr.headRefName} → ${pr.baseRefName}`))
          .child(div().flex_none().child(`· ${s.label}, ${since(pr.updatedAt, now)}`)))
        .child(full ? this.status(pr, t) : div().pt(8).text_size(ui(12)).text_color(t.dim).child(d?.error ? "" : "Loading…"))
        .when(Boolean(stack), (el) => el.child(part("stack", "Stack", () => this.stackRows(st, stack, n, t))))
        .when(full, (el) => el.child(part("checks", "Checks", () => this.checkRows(st, pr, t), { fallback: checksOpenByDefault(pr) }))
          .child(part("reviewers", "Reviewers", () => this.reviewerRows(pr, t)))
          .child(part("description", "Description", () => [(pr.body ?? "").trim()
            ? rich(this, t, `t3-pulls-body-${st.id}-${n}`, githubParts(pr, pr.body, pr.bodyHTML), (url, cx) => browse(st, url, cx)) : note(t, "No description.")]))
          .child(part("comments", "Comments", () => this.commentRows(st, pr, t, now, cx), { count: conversationEntries(pr).length }))));
  }

  // What stands before a merge, in words and colored by its tone, then the checks' and reviews' counts; each opens its section.
  status(pr, t) {
    const v = verdict(pr), n = tallies(pr);
    const part = (id, text, color, key) => {
      const el = div().id(id).flex_none().text_color(color).child(text);
      return key ? stop(this, t, id, el.cursor_pointer().role("button").accessibility_label(`${text}: show ${key === "checks" ? "Checks" : "Reviewers"}`)
        .hover((h) => h.underline()).on_click((_e, cx) => toggleSection(this, key, true, cx)), 4) : el;
    };
    return h_flex().id("t3-pulls-status").pt(8).gap(4).flex_wrap().items_center().text_size(ui(12))
      .child(part("t3-pulls-verdict", v.text, t[TONE_COLOR[v.tone]], v.section).font_medium())
      .child(div().flex_none().text_color(t.dim).child("·"))
      .child(part("t3-pulls-tally-checks", n.checks, t.dim, "checks"))
      .child(div().flex_none().text_color(t.dim).child("·"))
      .child(part("t3-pulls-tally-reviews", n.reviews, t.dim, "reviewers"));
  }

  stackRows(st, stack, n, t) {
    return [...stack.layers.map((p) => {
      const s = prState(p), self = p.number === n;
      return line(this, t, `t3-pulls-layer-${p.number}`, `Open #${p.number} ${p.title}`, self ? null : (cx) => this.pick(st, p.number, cx), [
        stateIcon(this, t, s, 14),
        div().flex_none().text_color(t.dim).child(`#${p.number}`),
        div().flex_1().min_w(0).truncate().child(p.title)], self);
    }), line(this, t, "t3-pulls-trunk", stack.trunk, null, [svg(icon("git-branch")).size(14).flex_none().text_color(t.dim),
      div().flex_1().min_w(0).truncate().text_color(t.dim).child(stack.trunk)])];
  }

  // Failing, then running or waiting, each its own row; the rest, passed and skipped, one row that opens in place (kept as `passed`).
  checkRows(st, pr, t) {
    const checks = checksOf(pr);
    if (!checks.length) return [note(t, "No checks reported.")];
    const row = (c, i) => line(this, t, `t3-pulls-check-${i}`, `Open ${c.name}'s details`, c.url ? (cx) => browse(st, c.url, cx) : null, [
      stateIcon(this, t, CHECK_LOOK[c.kind], 14),
      div().flex_1().min_w(0).truncate().when(c.kind === "failure", (el) => el.text_color(t.ansi1)).child(c.name)]);
    const open = checks.map((c, i) => [c, i]).filter(([c]) => c.kind === "failure" || c.kind === "pending");
    const done = checks.map((c, i) => [c, i]).filter(([c]) => c.kind === "success" || c.kind === "skipped");
    if (!done.length) return open.map(([c, i]) => row(c, i));
    const passed = done.filter(([c]) => c.kind === "success").length, skipped = done.length - passed, shown = sectionOpen(this, "passed", false);
    const label = `${passed} passed${skipped ? ` · ${skipped} skipped` : ""}`;
    return [...open.map(([c, i]) => row(c, i)),
      line(this, t, "t3-pulls-checks-passed", `${shown ? "Hide" : "Show"} ${label}`, (cx) => toggleSection(this, "passed", !shown, cx), [
        svg(icon("circle-check")).size(14).flex_none().text_color(t.ansi2),
        div().flex_1().min_w(0).truncate().child(label),
        svg(icon(shown ? "chevron-down" : "chevron-right")).size(12).flex_none().text_color(t.dim)]),
      ...(shown ? done.map(([c, i]) => div().pl(16).child(row(c, i))) : [])];
  }

  reviewerRows(pr, t) {
    const rows = reviewersOf(pr).map((r) => {
      const look = REVIEW_LOOK[r.state] ?? { label: r.state, color: "dim" };
      return line(this, t, `t3-pulls-reviewer-${r.login}`, r.login, null, [
        div().flex_1().min_w(0).truncate().child(r.login),
        div().flex_none().text_color(t[look.color]).child(look.label)]);
    });
    if (!rows.length) rows.push(note(t, "No reviewers."));
    if (pr.reviewersError) rows.push(note(t, `Review requests couldn't be read: ${pr.reviewersError}`));
    return rows;
  }

  // Comments and review bodies, then review threads (model.js conversationEntries); then, always, a box for a new comment.
  commentRows(st, pr, t, now, cx) {
    const entries = conversationEntries(pr);
    const rows = entries.map((e) => e.thread ? this.threadBlock(st, pr, e.thread, t, now) : this.said(st, t, `t3-pulls-said-${e.id}`, e, now, e.kind === "Comment" ? null : e.kind));
    if (!entries.length) rows.push(note(t, "No comments yet."));
    if (pr.conversationTruncated) rows.push(note(t, "The conversation goes on past what's read here: the rest is on GitHub."));
    if (pr.conversationError) rows.push(note(t, `Comments couldn't be read: ${pr.conversationError}`));
    rows.push(commentBox(this, t, "t3-pulls", draftKey(subject(st, pr)), cx,
      { writing: st.writing, send: (cx, body) => this.write(st, pr, { kind: "comment", body }, cx, draftKey(subject(st, pr))) }));
    return rows;
  }

  // One comment, a review's word colored by what it says.
  said(st, t, id, c, now, word = null) {
    return said(this, t, id, { author: c.author?.login ?? "ghost", at: c.createdAt ?? c.submittedAt, url: c.url }, { now, word,
      wordColor: word === "Approved" ? t.ansi2 : word === "Changes requested" ? t.ansi1 : t.dim,
      parts: c.body?.trim() ? githubParts(c, c.body, c.bodyHTML) : [], open: (url, cx) => browse(st, url, cx) });
  }

  // A review thread: its place, shut when resolved or outdated (a click opens it); open, the end of its hunk, its comments,
  // then Reply and Resolve, or Reopen, each only where GitHub lets the viewer.
  threadBlock(st, pr, thread, t, now) {
    const id = `t3-pulls-thread-${thread.id}`, open = this.threadsOpen.get(thread.id) ?? !threadShut(thread), comments = thread.comments;
    const state = [thread.isOutdated && "Outdated", thread.isResolved && "Resolved"].filter(Boolean).join(" · ");
    const head = line(this, t, `${id}-head`, `${open ? "Shut" : "Open"} the thread on ${threadPlace(thread)}`, (cx) => { this.threadsOpen.set(thread.id, !open); cx.notify(); }, [
      svg(icon(open ? "chevron-down" : "chevron-right")).size(12).flex_none().text_color(t.dim),
      div().min_w(0).truncate().font_family(codeFont()).child(threadPlace(thread)),
      div().flex_1(),
      ...(open ? [] : [div().flex_none().text_color(t.dim).child(`${comments[0].author?.login ?? "ghost"}, ${comments.length} ${comments.length === 1 ? "comment" : "comments"}`)]),
      ...(state ? [div().flex_none().text_color(t.dim).child(state)] : [])]);
    const block = v_flex().id(id).pt(8).gap(2).child(head);
    if (!open) return block;
    const key = draftKey(subject(st, pr), thread.id), writing = st.writing, hunk = comments[0]?.diffHunk;
    const flip = (kind, text) => textButton(this, t, `${id}-${kind}`, text, "plain", (cx) => this.write(st, pr, { kind, thread }, cx),
      { disabled: Boolean(writing), reason: BUSY });
    return block
      // The whole hunk read once, so its @@ counts tell a removed "-- …" from a header; the end drawn.
      .when(Boolean(hunk), (el) => el.child(diffBlock(this, t, `${id}-hunk`, hunkTail(diffRowsOf(comments[0], hunk))).mt(4)))
      .children(comments.map((c) => this.said(st, t, `${id}-${c.id}`, c, now)))
      .child(h_flex().id(`${id}-actions`).pt(4).px(6).gap(GROUP_GAP).items_center()
        .when(!thread.isResolved && thread.viewerCanReply && this.replyTo !== key, (el) => el.child(replyButton(this, t, id, key, writing)))
        .when(!thread.isResolved && thread.viewerCanResolve, (el) => el.child(flip("resolve", "Resolve")))
        .when(thread.isResolved && thread.viewerCanUnresolve, (el) => el.child(flip("reopen", "Reopen"))))
      .when(this.replyTo === key && !thread.isResolved, (el) => el.child(replyBox(this, t, id, key, { writing, mine: writing?.thread === thread.id,
        send: (cx, body) => this.write(st, pr, { kind: "reply", thread, body }, cx, key) })));
  }
}
