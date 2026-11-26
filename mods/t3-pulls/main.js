// The space panel's Pull requests page (docs/internals/specs/pulls.md): the active tab's branch's PRs and the repository's open
// ones, read through gh, and a PR's detail with its conversation, where the person can comment, reply and resolve. Review shows
// a PR's changes in the Review extra. One copy serves every space, here or on another machine, each one's state kept by its id.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView, TextareaState, Textarea } from "gpui-base";
import { checking, spaces, exec, theme, window, nextCommand, settings } from "herdr";
import { panelState, closeSurface, openReview } from "./panel.js";
import { workFolder } from "./terminal-context.js";
import { treeHead } from "./nav-column.js";
import { button, ghostButton, tint, radiusOf, GROUP_GAP } from "./button.js";
import { loadingState, emptyState, errorBar, noticeBar } from "./panel-states.js";
import { stopsInit, stopsEnd, enter, focusRoot, stop, within } from "./focus.js";
import { tip, glow } from "./tip.js";
import { keycap } from "./palette.js";
import { alpha } from "./color.js";
import { readLocal } from "./store.js";
import { listPRs, prDetail, writePR, OPEN_PAGE } from "./gh.js";
import { READ_EVERY, CONFIG_KEYS, parseDiscovery, ownBranchPRs, ghProblem, prState, rollupKind, CHECK_LOOK, checksOf, reviewersOf, REVIEW_LOOK,
  prStats, TONE_COLOR, stackOf, matches, timeAgo, reviewProblem, fetchArgs, prRefs, comparePage, conversationEntries, threadPlace, hunkTail,
  threadShut, draftKey, sectionOpen, sectionSummary, writeError } from "./model.js";

const MOD = "mods/t3-pulls";
const GIT = ["--no-optional-locks", "-c", "core.fsmonitor=false"]; // reads leave the index and filesystem monitor alone
const GIT_TIMEOUT = 20000, FETCH_TIMEOUT = 120000;
const icon = (name) => `${MOD}/icons/${name}.svg`;
// Which detail sections the person opened or shut, by section (docs/internals/storage.md).
const SECTIONS_KEY = "sections.open";
const codeFont = () => String(settings()?.font_family ?? "") || "Menlo";

// What a space shows: what was read for its tab's folder on its machine, and what the person picked. `token` and `detailToken`
// count reads, so an answer to an older one never lands over a newer. `writing`: the write under way, one at a time.
function blank(sp, folder, tab = "branch") {
  return { id: sp.id, on: sp.machine ?? null, folder, tab, token: 0, detailToken: 0, reading: false, readAt: 0, info: null, problem: null,
    gh: null, error: null, branch: null, open: null, openTotal: 0, picked: null, details: new Map(), busy: null, actionError: null, writing: null };
}

async function openUrl(url) {
  const platform = window()?.platform;
  const [command, args] = platform === "macos" ? ["open", [url]]
    : platform === "windows" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
  const r = await exec(command, args).catch(() => null);
  if (r?.code !== 0) throw new Error(`Couldn't open ${url}`);
}

export default class Pulls extends View {
  init(_props, cx) {
    /** @type {Map<string, any>} */
    this.states = new Map();
    this.seen = null;
    this.hot = null;
    this.handle = cx.focus_handle();
    this.search = InputState.new({ placeholder: "Search pull requests" });
    this.search.on("change", (_e, cx) => cx.notify());
    this.search.on("focus", (_e, cx) => { this.searchFocused = true; cx.notify(); });
    this.search.on("blur", (_e, cx) => { this.searchFocused = false; cx.notify(); });
    // Drafts, by draftKey (model.js): only this run's, so text typed survives a redraw, a refresh and moving between PRs.
    // shortcut: keep them in localStorage if losing one to a restart turns out to matter.
    /** @type {Map<string, string>} */
    this.drafts = new Map();
    // One box for a new comment and one for a reply, each bound to the draft it shows (`commentKey`, `replyTo`).
    this.comment = TextareaState.new({ placeholder: "Leave a comment", rows: 3 });
    this.reply = TextareaState.new({ placeholder: "Reply", rows: 3 });
    for (const box of [this.comment, this.reply]) box.set_auto_grow(3, 12);
    this.commentKey = null;
    this.binding = null;
    this.replyTo = null;
    this.comment.on("change", (_e, cx) => { if (this.commentKey) this.drafts.set(this.commentKey, this.comment.value()); cx.notify(); });
    this.reply.on("change", (_e, cx) => { if (this.replyTo) this.drafts.set(this.replyTo, this.reply.value()); cx.notify(); });
    this.commentFocused = false;
    this.replyFocused = false;
    this.comment.on("focus", (_e, cx) => { this.commentFocused = true; cx.notify(); });
    this.comment.on("blur", (_e, cx) => { this.commentFocused = false; cx.notify(); });
    this.reply.on("focus", (_e, cx) => { this.replyFocused = true; cx.notify(); });
    this.reply.on("blur", (_e, cx) => { this.replyFocused = false; cx.notify(); });
    // Threads the person opened or shut, against threadShut's default; only this run's.
    /** @type {Map<string, boolean>} */
    this.threadsOpen = new Map();
    this.fs = /** @type {any} */ (null);
    stopsInit(this, cx);
    // A hidden copy isn't drawn, so this is what sees the page come back, the space change and the minute pass.
    cx.timer.every(1000, (cx) => this.tick(cx));
    // `t3-pulls.close` (cmd-w while the page has the keyboard) closes the tab, never the terminal behind it.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "close") closeSurface();
        else if (c === "focus") enter(this, cx, "t3-pulls-refresh");
        cx.notify();
      }
    });
  }

  close() { stopsEnd(this); }

  inPanel() { const p = panelState(); return p.open && p.page === "pulls"; }

  // The space's state, its reads made stale when its tab's folder or machine moves: what it shows stays until the new read lands.
  stateFor(sp) {
    const folder = workFolder(sp.id) ?? null, on = sp.machine ?? null;
    let st = this.states.get(sp.id);
    if (!st || st.on !== on) this.states.set(sp.id, st = blank(sp, folder, st?.tab));
    else if (st.folder !== folder) { st.folder = folder; st.token++; st.reading = false; st.readAt = 0; }
    return st;
  }

  // Reads only while the page shows: on showing (a space switch too), when the folder moved, then every READ_EVERY with the window in front.
  tick(cx) {
    if (checking()) return;
    const all = spaces();
    for (const id of this.states.keys()) if (!all.some((s) => s.id === id)) this.states.delete(id);
    const sp = all.find((s) => s.active);
    if (!sp || !this.inPanel()) { this.seen = null; return; }
    const st = this.stateFor(sp);
    if (this.seen !== sp.id || !st.readAt) { this.seen = sp.id; this.read(st, cx); }
    else if (!st.reading && window()?.active !== false && Date.now() - st.readAt >= READ_EVERY) this.read(st, cx);
  }

  refresh(cx) {
    const sp = spaces().find((s) => s.active);
    if (sp) this.read(this.stateFor(sp), cx);
  }

  /** The repository, branch and remote of `st`'s folder, or the problem to show instead. */
  async discover(st) {
    if (!st.folder) return { problem: "This tab has no folder." };
    const o = { cwd: st.folder, on: st.on, timeout: GIT_TIMEOUT };
    try {
      const [top, config] = await Promise.all([exec("git", [...GIT, "rev-parse", "--show-toplevel", "--abbrev-ref", "HEAD"], o),
        exec("git", [...GIT, "config", "--get-regexp", CONFIG_KEYS], o)]);
      return { info: parseDiscovery(top.code === 0 ? top.stdout : "", config.code === 0 ? config.stdout : "") };
    } catch (e) { return { problem: e?.message ?? String(e) }; }
  }

  read(st, cx) {
    if (checking()) return;
    const token = ++st.token, fresh = () => this.states.get(st.id) === st && st.token === token;
    st.reading = true; st.readAt = Date.now();
    cx.spawn(async (cx) => {
      try {
        const found = await this.discover(st);
        if (!fresh()) return;
        if (found.problem) { Object.assign(st, { info: null, problem: found.problem, gh: null, error: null, branch: null, open: null, picked: null }); st.details.clear(); return; }
        const info = found.info;
        // Another repository or branch: nothing picked from the last one carries over.
        if (st.info && (st.info.repo !== info.repo || st.info.branch !== info.branch)) {
          Object.assign(st, { branch: null, open: null, picked: null, actionError: null });
          st.details.clear();
        }
        st.info = info; st.problem = null;
        const lists = await listPRs(info);
        if (!fresh()) return;
        Object.assign(st, { gh: null, error: null, branch: lists.branch && ownBranchPRs(lists.branch, info.heads), open: lists.open, openTotal: lists.openTotal });
        const n = this.shownNumber(st);
        if (n != null) this.readDetail(st, n, cx);
      } catch (e) {
        if (!fresh()) return;
        const message = e?.message ?? String(e), problem = ghProblem(message);
        if (problem) st.gh = problem; else Object.assign(st, { gh: null, error: message });
      } finally {
        if (fresh()) { st.reading = false; cx.notify(); }
      }
    });
  }

  readDetail(st, n, cx) {
    if (checking() || !st.info) return;
    const token = ++st.detailToken, repo = st.info.repo;
    // A read that ends while a write is under way may predate it: the write reads again when it's done.
    const fresh = () => this.states.get(st.id) === st && st.detailToken === token && st.info?.repo === repo && !st.writing;
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
   * Sends one write for PR `pr` of `st`'s repository (gh.js writePR): `{ kind, thread?, body? }`, `draft` the draft it empties.
   * Resolve and Reopen show at once and are each other's undo; a failure puts the thread back. Text sent clears its draft only
   * once GitHub has it; a failure keeps it. Done, the detail is read again.
   */
  write(st, pr, w, cx, draft = null) {
    if (st.writing || !st.info) return;
    const repo = st.info.repo, n = pr.number, flip = w.kind === "resolve" || w.kind === "reopen" ? w.target : null;
    st.writing = { kind: w.kind, thread: w.thread ?? null };
    st.actionError = null;
    // A thread resolved here stays open, its Reopen where Resolve was.
    if (flip) { flip.isResolved = w.kind === "resolve"; this.threadsOpen.set(flip.id, true); }
    cx.notify();
    cx.spawn(async (cx) => {
      let done = false;
      try {
        await writePR(repo, n, { kind: w.kind, thread: w.thread, body: w.body });
        done = true;
        if (draft) {
          this.drafts.delete(draft);
          if (this.commentKey === draft) this.comment.set_value("");
          if (this.replyTo === draft) { this.replyTo = null; this.reply.set_value(""); }
        }
      } catch (e) {
        if (flip) flip.isResolved = w.kind !== "resolve";
        const message = e?.message ?? String(e), problem = ghProblem(message);
        st.actionError = writeError(w.kind, problem ? `${problem.title}: run ${problem.command}.` : message);
      } finally {
        st.writing = null;
        if (done && this.states.get(st.id) === st && st.info?.repo === repo) this.readDetail(st, n, cx);
        cx.notify();
      }
    });
  }

  toggleSection(key, open, cx) {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify({ ...readLocal(SECTIONS_KEY, {}), [key]: open }));
    cx.notify();
  }

  openReply(key, cx) {
    this.replyTo = key;
    this.reply.set_value(this.drafts.get(key) ?? "");
    this.reply.focus();
    cx.notify();
  }

  // The PR whose detail shows: the one picked, else a branch's only PR.
  shownNumber(st) {
    if (st.picked != null) return st.picked;
    return st.tab === "branch" && st.branch?.length === 1 ? st.branch[0].number : null;
  }

  pick(st, n, cx) {
    st.picked = n; st.actionError = null;
    this.readDetail(st, n, cx);
    cx.notify();
  }

  setTab(st, tab, cx) {
    st.tab = tab; st.picked = null; st.actionError = null;
    const n = this.shownNumber(st);
    if (n != null && !st.details.has(n)) this.readDetail(st, n, cx);
    cx.notify();
  }

  reviewReason(st, sp, name = "Review") {
    return reviewProblem({ installed: panelState().pages.includes("review"), machine: sp.machine ?? null, root: st.info?.root ?? null }, name);
  }

  // Fetches the PR's head and its base branch into the space's clone, then asks Review for what GitHub shows: head since it forked from base.
  review(st, sp, pr, cx) {
    if (st.busy || this.reviewReason(st, sp)) return;
    const { root, remote } = st.info, o = { cwd: root, on: st.on, timeout: FETCH_TIMEOUT }, refs = prRefs(pr);
    st.busy = "review"; st.actionError = null; cx.notify();
    cx.spawn((cx) => this.handOff(st, root, remote, refs, o, cx));
  }

  async handOff(st, root, remote, refs, o, cx) {
    // One at a time: each is read back from FETCH_HEAD.
    const fetched = async (ref) => {
      const f = await exec("git", [...GIT, ...fetchArgs(remote, ref)], o);
      if (f.code !== 0) throw new Error((f.stderr || f.stdout || "").trim() || `git fetch ${remote} ${ref} failed`);
      const r = await exec("git", [...GIT, "rev-parse", "--verify", "--quiet", "FETCH_HEAD^{commit}"], o);
      if (r.code !== 0) throw new Error(`git fetch ${remote} ${ref} brought no commit`);
      return r.stdout.trim();
    };
    try {
      const head = await fetched(refs.head), base = await fetched(refs.base);
      if (openReview({ space: st.id, root, page: comparePage(base, head) }) === "unavailable") st.actionError = "Review isn't installed: add the Review extra.";
    } catch (e) { st.actionError = e?.message ?? String(e); }
    finally { st.busy = null; cx.notify(); }
  }

  // The fork's daemon opens a GitHub PR in the browser; it registers the folder it starts in, so a local clone.
  pullsReview(st, sp, pr, cx) {
    if (this.reviewReason(st, sp, "pulls.review")) return;
    const { repo, root } = st.info;
    st.actionError = null;
    cx.spawn(async (cx) => {
      const r = await exec("jin.review", ["-d", `${repo}#${pr.number}`], { cwd: root, timeout: GIT_TIMEOUT }).catch(() => null);
      if (!r) st.actionError = "jin.review isn't installed: bun add --global jin.review.";
      else if (r.code !== 0) st.actionError = (r.stderr || r.stdout || "").trim() || `jin.review exited ${r.code}`;
      cx.notify();
    });
  }

  browse(st, url, cx) {
    cx.spawn(async (cx) => {
      try { await openUrl(url); } catch (e) { st.actionError = e.message; cx.notify(); }
    });
  }

  render(cx) {
    const t = theme(), sp = spaces().find((s) => s.active);
    if (!sp) return div().id("t3-pulls").size_full();
    const st = this.stateFor(sp);
    if (this.seen !== sp.id && this.inPanel() && !checking()) {
      this.seen = sp.id;
      cx.timer.after(0, (cx) => this.read(st, cx));
    }
    return focusRoot(this, v_flex().id("t3-pulls").size_full().min_h(0).text_color(t.foreground).text_size(13)
      .track_focus(this.handle).on_mouse_down("left", () => this.handle.focus())
      .child(treeHead("t3-pulls-head", this.head(st, t)))
      .when(Boolean(st.error) && !st.gh && !st.problem, (el) => el.child(errorBar(t, "t3-pulls-error", st.error, (cx) => this.refresh(cx), this)))
      .child(div().flex_1().min_h(0).child(this.body(st, sp, t, cx))));
  }

  /** @param {any} [state] */
  control(t, id, name, label, press, state = {}) {
    const el = ghostButton(this, t, id, { icon: icon(name), label, act: press, surface: "chrome", ...state });
    const trigger = state.disabled ? div().flex_none().child(el).on_hover(glow(this, id)) : stop(this, t, id, el, radiusOf(state.size));
    return tip(this, t, id, label, trigger);
  }

  // Branch and Repo, T3's segmented ToggleGroup as Custom snooze's; then Repo's search, then Refresh at the row's end.
  head(st, t) {
    const searching = st.tab === "repo" && this.shownNumber(st) == null && Boolean(st.open?.length);
    const segment = (tab, label, n) => {
      const id = `t3-pulls-tab-${tab}`, on = st.tab === tab;
      return stop(this, t, id, h_flex().id(id).h(24).px(10).gap(6).flex_none().items_center().rounded(6).text_size(12).font_medium()
        .when(on, (el) => el.bg(t.selected)).text_color(on ? t.foreground : t.dim).when(!on, (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground)))
        .role("tab").accessibility_label(`${label}${n == null ? "" : `, ${n}`}${on ? ", shown" : ""}`)
        .on_click((_e, cx) => { if (!on) this.setTab(st, tab, cx); })
        .child(label).when(n != null, (el) => el.child(div().text_color(t.dim).child(String(n)))), 6);
    };
    return h_flex().id("t3-pulls-bar").flex_1().min_w(0).h_full().gap(8).items_center()
      .child(h_flex().flex_none().p(2).gap(2).rounded(8).bg(t.input)
        .child(segment("branch", "Branch", st.branch?.length)).child(segment("repo", "Repo", st.open ? st.openTotal : undefined)))
      .child(searching ? this.searchField(t) : div().flex_1())
      .child(this.control(t, "t3-pulls-refresh", "refresh-cw", "Refresh pull requests", (cx) => this.refresh(cx)));
  }

  // Files' search field: T3's compact input, transparent until focused; Escape clears it and leaves.
  searchField(t) {
    const id = "t3-pulls-search-field", focused = Boolean(this.searchFocused);
    return stop(this, t, id, div().id(id).relative().flex_1().min_w(0).h(28).px(9).rounded(6).border_1().border_color(focused ? t.accent : "#00000000")
      .when(focused, (el) => el.bg(t.background))
      .on_mouse_down("left", (_e, cx) => { this.search.focus(); cx.stop_propagation(); })
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        this.search.set_value(""); this.handle.focus();
        cx.stop_propagation(); cx.notify();
      })
      .child(Input.new(this.search).w_full().h_full().text_size(12).text_color(t.foreground).accessibility_label("Search pull requests"))
      .when(focused, (el) => el.child(div().absolute().inset_0().rounded(6).border(3).border_color(alpha(t.accent, "3d")))), 6, { enter: () => this.search.focus() });
  }

  body(st, sp, t, cx) {
    if (st.gh) {
      return emptyState(t, "t3-pulls-gh", icon("git-pull-request"), st.gh.title, st.gh.detail)
        .child(keycap(t, st.gh.command))
        .child(div().pt(8).child(this.textButton(t, "t3-pulls-retry", "Try again", "outline", (cx) => this.refresh(cx))));
    }
    if (st.problem) return emptyState(t, "t3-pulls-problem", icon("git-pull-request"), st.problem, "");
    if (!st.info || !st.open) return st.error ? div() : loadingState(MOD, t, "t3-pulls-loading", "Loading pull requests…");
    const n = this.shownNumber(st);
    return n != null ? this.detail(st, sp, n, t, cx) : this.list(st, t);
  }

  textButton(t, id, text, variant, act, { disabled = false, reason = "" } = {}) {
    const el = button(t, id, { variant, size: "xs", text, disabled, act });
    return disabled ? tip(this, t, id, reason, div().flex_none().child(el).on_hover(glow(this, id))) : stop(this, t, id, el, radiusOf("xs"));
  }

  list(st, t) {
    const empty = (title, hint) => emptyState(t, "t3-pulls-empty", icon("git-pull-request"), title, hint);
    let prs;
    if (st.tab === "branch") {
      if (!st.info.branch) return empty("HEAD is detached", "Check out a branch to see its pull requests.");
      prs = st.branch ?? [];
      if (!prs.length) return empty("No pull requests for this branch", st.info.branch);
    } else {
      if (!st.open.length) return empty("No open pull requests", st.info.repo);
      prs = st.open.filter((p) => matches(p, this.search.value()));
      if (!prs.length) return empty("No matching pull requests", "");
    }
    const now = Date.now(), more = st.tab === "repo" && st.openTotal > st.open.length;
    return v_flex().id(`t3-pulls-list-${st.tab}`).size_full().overflow_y_scrollbar().px(12).pb(8).gap(2)
      .children(prs.map((pr) => this.row(st, pr, t, now)))
      .when(more, (el) => el.child(div().px(8).py(8).text_size(12).text_color(t.dim).child(`The ${OPEN_PAGE} most recently updated of ${st.openTotal}.`)));
  }

  row(st, pr, t, now) {
    const s = prState(pr), kind = rollupKind(pr), id = `t3-pulls-row-${pr.number}`;
    return stop(this, t, id, h_flex().id(id).w_full().px(8).py(6).gap(8).items_start().rounded(6).cursor_pointer()
      .hover((h) => h.bg(tint(t, "chrome", false)))
      .role("button").accessibility_label(`#${pr.number} ${pr.title}, ${s.label}`)
      .on_click((_e, cx) => this.pick(st, pr.number, cx))
      .child(svg(icon(s.icon)).size(16).mt(1).flex_none().text_color(t[s.color]))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().child(pr.title))
          .when(Boolean(kind), (el) => el.child(svg(icon(CHECK_LOOK[kind].icon)).size(14).flex_none().text_color(t[CHECK_LOOK[kind].color]))))
        .child(h_flex().min_w(0).gap(8).text_size(12).text_color(t.dim)
          .child(div().flex_none().child(`#${pr.number}`))
          .child(div().flex_1().min_w(0).truncate().child(`${pr.headRefName} → ${pr.baseRefName}`))
          .child(div().flex_none().child(timeAgo(pr.updatedAt, now))))), 6);
  }

  // A list row's PR, the detail's until its own read lands.
  card(st, n) { return st.branch?.find((p) => p.number === n) ?? st.open?.find((p) => p.number === n) ?? null; }

  detail(st, sp, n, t, cx) {
    const d = st.details.get(n), pr = d?.pr ?? this.card(st, n);
    if (!pr) return d?.error ? emptyState(t, "t3-pulls-detail-error", icon("git-pull-request"), `#${n} couldn't be read`, d.error) : loadingState(MOD, t, "t3-pulls-loading", `Loading #${n}…`);
    const full = Boolean(d?.pr), s = prState(pr), now = Date.now();
    const reason = this.reviewReason(st, sp), pullsReason = this.reviewReason(st, sp, "pulls.review"), busy = st.busy === "review";
    const prId = "t3-pulls-pulls-review", stack = pr.state === "OPEN" ? stackOf(pr, st.open.filter((p) => !p.isCrossRepository)) : null;
    const pullsButton = button(t, prId, { size: "sm", surface: "chrome", label: "Open in pulls.review", hot: this.hot === prId, disabled: Boolean(pullsReason) })
      .child(image(`${MOD}/icons/pulls-review.svg`).size(14))
      .when(!pullsReason, (el) => el.on_hover(glow(this, prId)).on_click((_e, cx) => this.pullsReview(st, sp, pr, cx)));
    const actions = h_flex().id("t3-pulls-actions").h(28).flex_none().gap(8).items_center()
      .when(st.picked != null, (el) => el.child(this.control(t, "t3-pulls-back", "arrow-left", "Back to pull requests", (cx) => { st.picked = null; st.actionError = null; cx.notify(); }, { size: "sm", iconSize: 14 })))
      .child(div().flex_1())
      .child(this.textButton(t, "t3-pulls-review", busy ? "Fetching…" : "Review", "primary", (cx) => this.review(st, sp, pr, cx), { disabled: Boolean(reason) || busy, reason: reason || "Fetching the pull request…" }))
      .child(h_flex().flex_none().gap(GROUP_GAP).items_center()
        .child(tip(this, t, prId, pullsReason || "Open in pulls.review", pullsReason ? div().flex_none().child(pullsButton).on_hover(glow(this, prId)) : stop(this, t, prId, pullsButton, radiusOf("sm"))))
        .child(this.control(t, "t3-pulls-github", "external-link", "Open on GitHub", (cx) => this.browse(st, pr.url, cx), { size: "sm", iconSize: 14 })));
    return v_flex().id("t3-pulls-detail").size_full().min_h(0)
      .when(Boolean(st.actionError), (el) => el.child(noticeBar(t, "t3-pulls-action-error", st.actionError, t.ansi1, "dismiss", "Dismiss", (cx) => { st.actionError = null; cx.notify(); }, this)))
      .when(Boolean(d?.error) && full, (el) => el.child(errorBar(t, "t3-pulls-detail-error", d.error, (cx) => this.readDetail(st, n, cx), this)))
      .child(v_flex().id(`t3-pulls-detail-${n}`).flex_1().min_h(0).overflow_y_scrollbar().px(12).pb(16)
        .child(actions)
        .child(h_flex().pt(8).gap(8).items_start()
          .child(svg(icon(s.icon)).size(16).mt(2).flex_none().text_color(t[s.color]))
          .child(div().flex_1().min_w(0).text_size(14).font_medium().child(pr.title))
          .child(div().flex_none().text_size(14).text_color(t.dim).child(`#${n}`)))
        .child(h_flex().pt(4).min_w(0).gap(4).text_size(12).text_color(t.dim)
          .child(div().flex_none().child(`${pr.author?.login ?? "ghost"} ·`))
          .child(div().min_w(0).truncate().child(`${pr.headRefName} → ${pr.baseRefName}`))
          .child(div().flex_none().child(`· ${s.label}, ${timeAgo(pr.updatedAt, now)}`)))
        .child(full ? this.stats(pr, t) : div().pt(8).text_size(12).text_color(t.dim).child(d?.error ? "" : "Loading…"))
        .when(Boolean(stack), (el) => el.child(this.section(t, "stack", "Stack", () => this.stackRows(st, stack, n, t), { pr, stack })))
        .when(full, (el) => el.child(this.section(t, "checks", "Checks", () => this.checkRows(st, pr, t), { pr }))
          .child(this.section(t, "reviewers", "Reviewers", () => this.reviewerRows(pr, t), { pr }))
          .child(this.section(t, "description", "Description", () => [(pr.body ?? "").trim() ? this.markdown(`t3-pulls-body-${st.id}-${n}`, pr.body) : this.note(t, "No description.")], { pr }))
          .child(this.section(t, "comments", "Comments", () => this.commentRows(st, pr, t, now, cx), { pr, count: conversationEntries(pr).length }))));
  }

  markdown(id, text) { return div().px(6).pt(4).child(TextView.markdown(id, text).selectable(true).scrollable(false).text_size(13)); }

  stats(pr, t) {
    return h_flex().id("t3-pulls-stats").pt(8).gap(12).flex_wrap().text_size(12)
      .children(prStats(pr).map((s) => h_flex().id(`t3-pulls-stat-${s.key}`).gap(4).flex_none()
        .child(div().text_color(t.dim).child(s.label)).child(div().font_medium().text_color(t[TONE_COLOR[s.tone]]).child(s.value))));
  }

  // A heading over its rows, as Clean up's shelf head: a dim label, its count in `muted`, a 12px chevron; shut, a one-line
  // summary at its right. Open or shut is the person's last choice for that section (sectionOpen), kept across PRs and runs.
  section(t, key, title, rows, { pr, stack = null, count = null }) {
    const id = `t3-pulls-${key}-head`, open = sectionOpen(key, readLocal(SECTIONS_KEY, {}), pr), sum = open ? null : sectionSummary(key, pr, stack);
    const lit = this.hot === id || within(this, [id]);
    const head = h_flex().id(id).h(28).px(6).gap(6).items_center().rounded(6).text_size(12).cursor_pointer()
      .role("button").accessibility_label(`${open ? "Hide" : "Show"} ${title}`)
      .on_hover(glow(this, id)).on_click((_e, cx) => this.toggleSection(key, !open, cx))
      .child(div().flex_none().font_medium().text_color(lit ? t.muted : t.dim).child(title))
      .when(count != null, (el) => el.child(div().flex_none().text_color(t.muted).child(String(count))))
      .child(svg(icon(open ? "chevron-down" : "chevron-right")).size(12).flex_none().text_color(t.dim))
      .when(Boolean(sum), (el) => el.child(div().id(`${id}-summary`).flex_1().min_w(0).truncate().text_right().text_color(t[TONE_COLOR[sum.tone]]).child(sum.text)));
    return v_flex().id(`t3-pulls-${key}`).pt(12).gap(2).child(stop(this, t, id, head, 6)).when(open, (el) => el.children(rows()));
  }

  note(t, text) { return div().px(6).text_size(12).text_color(t.dim).child(text); }

  // A section row: 24 high, its box on the column's edge and its words 6 in, lit on hover when it does something; `on` lit as picked.
  line(t, id, label, act, children, on = false) {
    const el = h_flex().id(id).h(24).px(6).gap(8).items_center().rounded(6).text_size(12).when(on, (r) => r.bg(tint(t, "chrome", true)).font_medium())
      .when(Boolean(act), (r) => r.cursor_pointer().role("button").accessibility_label(label).hover((h) => h.bg(tint(t, "chrome", false))).on_click((_e, cx) => act(cx)))
      .children(children);
    return act ? stop(this, t, id, el, 6) : el;
  }

  stackRows(st, stack, n, t) {
    return [...stack.layers.map((p) => {
      const s = prState(p), self = p.number === n;
      return this.line(t, `t3-pulls-layer-${p.number}`, `Open #${p.number} ${p.title}`, self ? null : (cx) => this.pick(st, p.number, cx), [
        svg(icon(s.icon)).size(14).flex_none().text_color(t[s.color]),
        div().flex_none().text_color(t.dim).child(`#${p.number}`),
        div().flex_1().min_w(0).truncate().child(p.title)], self);
    }), this.line(t, "t3-pulls-trunk", stack.trunk, null, [svg(icon("git-branch")).size(14).flex_none().text_color(t.dim),
      div().flex_1().min_w(0).truncate().text_color(t.dim).child(stack.trunk)])];
  }

  checkRows(st, pr, t) {
    const checks = checksOf(pr);
    if (!checks.length) return [this.note(t, "No checks reported.")];
    return checks.map((c, i) => {
      const look = CHECK_LOOK[c.kind];
      return this.line(t, `t3-pulls-check-${i}`, `Open ${c.name}'s details`, c.url ? (cx) => this.browse(st, c.url, cx) : null, [
        svg(icon(look.icon)).size(14).flex_none().text_color(t[look.color]),
        div().flex_1().min_w(0).truncate().child(c.name),
        div().flex_none().text_color(t.dim).child(look.label)]);
    });
  }

  reviewerRows(pr, t) {
    const rows = reviewersOf(pr).map((r) => {
      const look = REVIEW_LOOK[r.state] ?? { label: r.state, color: "dim" };
      return this.line(t, `t3-pulls-reviewer-${r.login}`, r.login, null, [
        div().flex_1().min_w(0).truncate().child(r.login),
        div().flex_none().text_color(t[look.color]).child(look.label)]);
    });
    if (!rows.length) rows.push(this.note(t, "No reviewers."));
    if (pr.reviewersError) rows.push(this.note(t, `Review requests couldn't be read: ${pr.reviewersError}`));
    return rows;
  }

  // Comments and review bodies, then review threads (model.js conversationEntries); then, always, a box for a new comment.
  commentRows(st, pr, t, now, cx) {
    const entries = conversationEntries(pr);
    const rows = entries.map((e) => e.thread ? this.threadBlock(st, pr, e.thread, t, now) : this.said(st, t, `t3-pulls-said-${e.id}`, e, now, e.kind === "Comment" ? null : e.kind));
    if (!entries.length) rows.push(this.note(t, "No comments yet."));
    if (pr.conversationTruncated) rows.push(this.note(t, "The conversation goes on past what's read here: the rest is on GitHub."));
    if (pr.conversationError) rows.push(this.note(t, `Comments couldn't be read: ${pr.conversationError}`));
    rows.push(this.commentBox(st, pr, t, cx));
    return rows;
  }

  // One comment: who, what kind of review it was if one, how long ago, a link to it; then its words.
  said(st, t, id, c, now, word = null) {
    const color = word === "Approved" ? t.ansi2 : word === "Changes requested" ? t.ansi1 : t.dim;
    return v_flex().id(id).pt(8).gap(2)
      .child(h_flex().h(24).px(6).gap(6).items_center().text_size(12)
        .child(div().flex_none().font_medium().child(c.author?.login ?? "ghost"))
        .when(Boolean(word), (el) => el.child(div().flex_none().text_color(color).child(word)))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(timeAgo(c.createdAt ?? c.submittedAt, now)))
        .when(Boolean(c.url), (el) => el.child(this.control(t, `${id}-link`, "link", "Open comment on GitHub", (cx) => this.browse(st, c.url, cx), { size: "micro" }))))
      .when(Boolean(c.body?.trim()), (el) => el.child(this.markdown(`${id}-body`, c.body)));
  }

  // A review thread: its place, shut when resolved or outdated (a click opens it); open, the end of its hunk, its comments,
  // then Reply and Resolve, or Reopen, each only where GitHub lets the viewer.
  threadBlock(st, pr, thread, t, now) {
    const id = `t3-pulls-thread-${thread.id}`, open = this.threadsOpen.get(thread.id) ?? !threadShut(thread), comments = thread.comments;
    const state = [thread.isOutdated && "Outdated", thread.isResolved && "Resolved"].filter(Boolean).join(" · ");
    const head = this.line(t, `${id}-head`, `${open ? "Shut" : "Open"} the thread on ${threadPlace(thread)}`, (cx) => { this.threadsOpen.set(thread.id, !open); cx.notify(); }, [
      svg(icon(open ? "chevron-down" : "chevron-right")).size(12).flex_none().text_color(t.dim),
      div().min_w(0).truncate().font_family(codeFont()).child(threadPlace(thread)),
      div().flex_1(),
      ...(open ? [] : [div().flex_none().text_color(t.dim).child(`${comments[0].author?.login ?? "ghost"}, ${comments.length} ${comments.length === 1 ? "comment" : "comments"}`)]),
      ...(state ? [div().flex_none().text_color(t.dim).child(state)] : [])]);
    const block = v_flex().id(id).pt(8).gap(2).child(head);
    if (!open) return block;
    const key = draftKey(st.info.repo, pr.number, thread.id), writing = st.writing, mine = writing?.thread === thread.id;
    const busy = writing ? "Another change is being sent." : "";
    const hunk = comments[0]?.diffHunk;
    return block
      .when(Boolean(hunk), (el) => el.child(div().mx(6).mt(4).p(8).rounded(6).bg(t.background).text_size(12).font_family(codeFont()).text_color(t.muted).child(hunkTail(hunk))))
      .children(comments.map((c) => this.said(st, t, `${id}-${c.id}`, c, now)))
      .child(h_flex().id(`${id}-actions`).pt(4).px(6).gap(GROUP_GAP).items_center()
        .when(!thread.isResolved && thread.viewerCanReply && this.replyTo !== key, (el) => el.child(this.textButton(t, `${id}-reply`, "Reply", "plain", (cx) => this.openReply(key, cx), { disabled: Boolean(writing), reason: busy })))
        .when(!thread.isResolved && thread.viewerCanResolve, (el) => el.child(this.textButton(t, `${id}-resolve`, "Resolve", "plain",
          (cx) => this.write(st, pr, { kind: "resolve", thread: thread.id, target: thread }, cx), { disabled: Boolean(writing), reason: busy })))
        .when(thread.isResolved && thread.viewerCanUnresolve, (el) => el.child(this.textButton(t, `${id}-reopen`, "Reopen", "plain",
          (cx) => this.write(st, pr, { kind: "reopen", thread: thread.id, target: thread }, cx), { disabled: Boolean(writing), reason: busy }))))
      .when(this.replyTo === key && !thread.isResolved, (el) => el.child(this.editor(t, `${id}-editor`, this.reply, Boolean(this.replyFocused), "Reply", {
        send: { text: mine ? "Sending…" : "Send", disabled: Boolean(writing) || !this.reply.value().trim(), reason: busy || "Write a reply first.",
          act: (cx) => this.write(st, pr, { kind: "reply", thread: thread.id, body: this.reply.value() }, cx, key) },
        cancel: (cx) => { this.replyTo = null; cx.notify(); } })));
  }

  // After the last comment, always: what's typed here is this PR's draft. The box takes the draft outside the draw.
  commentBox(st, pr, t, cx) {
    const key = draftKey(st.info.repo, pr.number), writing = st.writing;
    if (this.commentKey !== key && this.binding !== key) {
      this.binding = key;
      cx.timer.after(0, (cx) => {
        if (this.binding !== key) return;
        this.binding = null; this.commentKey = key;
        this.comment.set_value(this.drafts.get(key) ?? "");
        cx.notify();
      });
    }
    const bound = this.commentKey === key, empty = !bound || !this.comment.value().trim();
    return v_flex().id("t3-pulls-new-comment").pt(12).child(this.editor(t, "t3-pulls-comment-editor", bound ? this.comment : null, bound && Boolean(this.commentFocused), "Leave a comment", {
      send: { text: writing?.kind === "comment" ? "Sending…" : "Comment", disabled: Boolean(writing) || empty,
        reason: writing ? "Another change is being sent." : "Write a comment first.", act: (cx) => this.write(st, pr, { kind: "comment", body: this.comment.value() }, cx, key) } }));
  }

  // A multi-line box as the compact field (Files' search): an `input` outline, `accent` and its ring while focused; then the
  // buttons at its right, Cancel before the action. `state` null draws the empty box while it takes its draft.
  editor(t, id, state, focused, label, { send, cancel = null }) {
    const box = state ? Textarea.new(state).w_full().px(11).py(7).rounded(8).text_size(13).text_color(t.foreground).accessibility_label(label)
      : div().w_full().h(76).px(11).py(7).text_size(13).text_color(t.dim).child(label);
    return v_flex().id(id).px(6).pt(4).gap(8)
      .child(div().id(`${id}-frame`).relative().rounded(8).border_1().border_color(focused ? t.accent : t.input).when(focused, (el) => el.bg(t.background))
        .child(box)
        .when(focused, (el) => el.child(div().absolute().inset_0().rounded(8).border(3).border_color(alpha(t.accent, "3d")))))
      .child(h_flex().gap(8).justify_end().items_center()
        .when(Boolean(cancel), (el) => el.child(this.textButton(t, `${id}-cancel`, "Cancel", "outline", cancel)))
        .child(this.textButton(t, `${id}-send`, send.text, "primary", send.act, { disabled: send.disabled, reason: send.reason })));
  }
}
