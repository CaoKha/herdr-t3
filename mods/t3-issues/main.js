// The space panel's Issues page (docs/internals/specs/issues.md): the issue the active tab's branch names and the person's
// own, from Linear when a key is found on this computer, else GitHub's issues through gh, read only. An issue's detail shows
// its linked PRs, description and comments; on Linear the person changes its state, comments and replies. One copy serves
// every space, here or on another machine, each one's state kept by its id.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { checking, spaces, theme, nextCommand, run } from "herdr";
import { panelState, closeSurface, showPage } from "./panel.js";
import { tint } from "./button.js";
import { loadingState, emptyState, errorBar, noticeBar } from "./panel-states.js";
import { stopsInit, stopsEnd, enter, stop } from "./focus.js";
import { keycap } from "./palette.js";
import { alpha } from "./color.js";
import { inlineMenu } from "./inline-menu.js";
import { discoverRepo, ghProblem } from "./github.js";
import { initPictures, dropPictures } from "./pictures.js";
import { codeFont, dropCode } from "./code.js";
import { initPage, refreshPage, freshness, pageFrame, pageShown, sectionOpen, section, control, textButton, note, line, rich, said, stateIcon,
  openUrl, writeError, draftKey, since } from "./page.js";
import { initComposer, sent, commentBox, replyBox, replyButton } from "./composer.js";
import { segmented } from "./segmented.js";
import { compactField } from "./field.js";
import { findKey, linearIssues } from "./linear.js";
import { githubIssues } from "./ghissues.js";
import { ISSUE_BINDING, linearState, PRIORITY, initials, commentThreads, workflowOrder, sectionSummary, KEY_ADD, keyProblem } from "./model.js";
import { ui } from "./layout-settings.js";

const MOD = "mods/t3-issues";
const icon = (name) => `${MOD}/icons/${name}.svg`;
// A search is sent once typing has paused this long.
const SEARCH_WAIT = 300;

export default class Issues extends View {
  // Set by initPage and initComposer.
  /** @type {Map<string, any>} */ states;
  /** @type {any} */ handle;
  /** @type {string | null} */ replyTo;

  init(_props, cx) {
    initPage(this, cx, { page: "issues", mod: MOD });
    initComposer(this);
    // The Linear key: undefined until looked for, null when none was found or Linear refused it (`keyIssue` says which).
    // Only this run's memory: never drawn, logged, written or passed to a program.
    /** @type {string | null | undefined} */
    this.key = undefined;
    /** @type {"missing" | "rejected" | null} */
    this.keyIssue = null;
    /** @type {Promise<void> | null} */
    this.looking = null;
    // The person chose GitHub's issues while there's no key; Try again asks for the key again.
    this.useGitHub = false;
    this.search = InputState.new({ placeholder: "Search issues" });
    // Keystrokes so far: a search waits out the pause after the last one only.
    this.typed = 0;
    this.search.on("change", (_e, cx) => {
      const n = ++this.typed;
      cx.timer.after(SEARCH_WAIT, (cx) => { if (n === this.typed) this.searchNow(cx); });
      cx.notify();
    });
    this.search.on("focus", (_e, cx) => { this.searchFocused = true; cx.notify(); });
    this.search.on("blur", (_e, cx) => { this.searchFocused = false; cx.notify(); });
    initPictures(this, cx, "cache/t3-issues");
    this.fs = /** @type {any} */ (null);
    stopsInit(this, cx);
    // `t3-issues.close` (cmd-w while the page has the keyboard) closes the tab, never the terminal behind it.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "close") closeSurface();
        else if (c === "focus") enter(this, cx, "t3-issues-refresh");
        cx.notify();
      }
    });
  }

  async close() {
    stopsEnd(this);
    dropCode(this);
    await dropPictures(this);
  }

  // What a space shows: what was read for its tab's folder on its machine, and what the person picked. `token`, `detailToken`
  // and `searchToken` count reads, so an answer to an older one never lands over a newer. `provider`: linear.js's or
  // ghissues.js's, chosen by the last read; `asking` the search in flight; `writing` the write under way.
  blank(sp, folder, tab = "branch") {
    return { id: sp.id, on: sp.machine ?? null, folder, tab, token: 0, detailToken: 0, searchToken: 0, reading: false, readAt: 0, provider: null,
      info: null, problem: null, gh: null, error: null, branch: null, mine: null, found: null, asking: null, picked: null, details: new Map(),
      writing: null, actionError: null };
  }

  // Linear while a key is found, GitHub when the person asked for it meanwhile, else neither until they choose.
  source() { return this.key ? "linear" : this.useGitHub && this.key !== undefined ? "github" : null; }

  // Looked for once, by every read waiting on the same look.
  lookForKey() {
    return this.looking ??= findKey().then((key) => { this.key = key; this.keyIssue = key ? null : "missing"; }, () => { this.key = null; this.keyIssue = "missing"; })
      .finally(() => { this.looking = null; });
  }

  retryKey(cx) {
    this.key = undefined; this.keyIssue = null; this.useGitHub = false;
    refreshPage(this, cx);
  }

  // A failure: gh's that stop everything, Linear refusing the key, else a bar over what was last read.
  failed(st, e) {
    if (e?.rejected) { this.key = null; this.keyIssue = "rejected"; return; }
    const message = e?.message ?? String(e), problem = ghProblem(message);
    if (problem) st.gh = problem; else Object.assign(st, { gh: null, error: message });
  }

  read(st, cx) {
    if (checking()) return;
    const fresh = freshness(this, st, "token");
    st.reading = true; st.readAt = Date.now();
    cx.spawn(async (cx) => {
      try {
        if (this.key === undefined) await this.lookForKey();
        const source = this.source();
        if (!fresh() || !source) return;
        const found = await discoverRepo(st.folder, st.on, { keys: [ISSUE_BINDING] });
        if (!fresh()) return;
        if (found.problem) { Object.assign(st, { info: null, problem: found.problem, gh: null, error: null, branch: null, mine: null, picked: null }); st.details.clear(); return; }
        const info = found.info;
        if (source === "github" && !info.repo) { Object.assign(st, { info, problem: info.repoProblem, branch: null, mine: null, picked: null }); return; }
        const provider = source === "linear" ? linearIssues(this.key) : githubIssues(info.repo);
        // Another provider, repository or branch: nothing picked from the last one carries over.
        if (st.provider?.id !== provider.id || st.info?.repo !== info.repo || st.info?.branch !== info.branch) {
          Object.assign(st, { branch: null, mine: null, found: null, asking: null, picked: null, actionError: null });
          st.details.clear();
        }
        Object.assign(st, { info, problem: null, provider });
        const [branch, mine] = await Promise.all([provider.branchIssues(info), provider.mine()]);
        if (!fresh()) return;
        Object.assign(st, { gh: null, error: null, branch, mine });
        if (provider.branchInFull) for (const i of branch) st.details.set(i.id, { issue: i, error: null });
        const shown = this.shownIssue(st);
        if (shown && !(provider.branchInFull && branch.some((i) => i.id === shown.id))) this.readDetail(st, shown, cx);
      } catch (e) {
        if (fresh()) this.failed(st, e);
      } finally {
        if (fresh()) { st.reading = false; cx.notify(); }
      }
    });
  }

  readDetail(st, card, cx) {
    if (checking() || !st.info || !st.provider) return;
    const provider = st.provider, repo = st.info.repo, latest = freshness(this, st, "detailToken");
    // A read that ends while a write is under way may predate it: the write reads again when it's done.
    const fresh = () => latest() && st.provider?.id === provider.id && st.info?.repo === repo && !st.writing;
    cx.spawn(async (cx) => {
      const was = st.details.get(card.id);
      try {
        const issue = await provider.detail(card);
        if (!fresh()) return;
        st.details.set(card.id, issue ? { issue, error: null } : { issue: was?.issue ?? null, error: "This issue isn't there any more." });
      } catch (e) {
        if (!fresh()) return;
        if (e?.rejected || ghProblem(e?.message)) this.failed(st, e);
        else st.details.set(card.id, { issue: was?.issue ?? null, error: e?.message ?? String(e) });
      }
      cx.notify();
    });
  }

  // What Mine's field asks, while the page shows: sent unless it's what was last asked; an empty field is the person's own list again.
  searchNow(cx) {
    const sp = spaces().find((s) => s.active), st = sp && this.states.get(sp.id), q = this.search.value().trim();
    if (!st?.provider || !pageShown(this) || q === (st.asking ?? st.found?.q ?? "")) return;
    const latest = freshness(this, st, "searchToken"), provider = st.provider;
    st.asking = null;
    if (!q || q === st.found?.q) { if (!q) st.found = null; cx.notify(); return; }
    st.asking = q;
    cx.spawn(async (cx) => {
      try {
        const found = await provider.search(q);
        if (latest()) st.found = { q, ...found };
      } catch (e) {
        if (latest()) this.failed(st, e);
      } finally {
        if (latest()) st.asking = null;
        cx.notify();
      }
    });
  }

  // The issue whose detail shows: the one picked, else a branch's only issue.
  shownIssue(st) {
    if (st.picked) return st.picked;
    return st.tab === "branch" && st.branch?.length === 1 ? st.branch[0] : null;
  }

  pick(st, card, cx) {
    st.picked = card; st.actionError = null; this.menu = null;
    this.readDetail(st, card, cx);
    cx.notify();
  }

  setTab(st, tab, cx) {
    st.tab = tab; st.picked = null; st.actionError = null;
    const shown = this.shownIssue(st);
    if (shown && !st.details.has(shown.id)) this.readDetail(st, shown, cx);
    cx.notify();
  }

  /**
   * One write on `issue`, where its provider takes them: `{ kind: "state", target }` (a team state), or `{ kind: "comment" |
   * "reply", body, parent? }` (`parent` the thread's first comment) with `draft` the draft it empties. A state shows at once and
   * goes back if refused; text clears its draft only once the provider has it. Never retried. Done, the detail is read again.
   */
  write(st, issue, w, cx, draft = null) {
    const provider = st.provider;
    if (st.writing || !provider?.canWrite || this.source() !== provider.id) return;
    const cards = [issue, ...(st.branch ?? []), ...(st.mine?.items ?? []), ...(st.found?.items ?? [])].filter((i) => i.id === issue.id);
    const was = cards.map((c) => c.state);
    st.writing = { kind: w.kind, thread: w.parent ?? null };
    st.actionError = null;
    if (w.kind === "state") for (const c of cards) c.state = linearState(w.target);
    cx.notify();
    cx.spawn(async (cx) => {
      let done = false;
      try {
        await provider.write(issue, w);
        done = true;
        if (draft) sent(this, draft);
      } catch (e) {
        cards.forEach((c, i) => { c.state = was[i]; });
        if (e?.rejected) { this.key = null; this.keyIssue = "rejected"; }
        st.actionError = writeError(w.kind, e?.message ?? String(e));
      } finally {
        st.writing = null;
        if (done && this.states.get(st.id) === st && st.provider?.id === provider.id) this.readDetail(st, issue, cx);
        cx.notify();
      }
    });
  }

  browse(st, url, cx) {
    cx.spawn(async (cx) => {
      try { await openUrl(url); } catch (e) { st.actionError = e.message; cx.notify(); }
    });
  }

  // A PR of the tab's own repository opens in the Pull requests page (its `open:<n>` command); any other on GitHub.
  openPR(st, pr, cx) {
    if (st.info?.repo && pr.repo.toLowerCase() === st.info.repo.toLowerCase() && showPage("pulls")) run(`t3-pulls.open:${pr.number}`, {});
    else this.browse(st, pr.url, cx);
  }

  render(cx) {
    const t = theme(), sp = spaces().find((s) => s.active), panel = panelState(), st = sp ? this.states.get(sp.id) : null;
    if (!sp) return div().id("t3-issues").size_full();
    const source = this.source(), bars = [];
    if (source === "github") bars.push(noticeBar(t, "t3-issues-github", "GitHub issues: no Linear API key found.", t.muted, "linear", "Try Linear again", (cx) => this.retryKey(cx), this));
    if (source && st?.error && !st.gh && !st.problem) bars.push(errorBar(t, "t3-issues-error", st.error, (cx) => refreshPage(this, cx), this));
    return pageFrame(this, t, cx, { panel, head: st ? this.head(st, t) : div().flex_1(), bars, body: this.body(st, t, cx) });
  }

  // One row, as Pull requests' header: Branch and Mine, or Back to them from an issue picked off a list; Mine's search; then
  // Refresh and, for the issue shown, its state (where the provider has states) and ⋯.
  head(st, t) {
    const shown = this.shownIssue(st), d = shown && st.details.get(shown.id), issue = shown && (d?.issue ?? this.card(st, shown.id) ?? shown);
    const searching = st.tab === "mine" && !shown && Boolean(st.mine);
    const tab = (id, label, count) => ({ id: `t3-issues-tab-${id}`, label, count, on: st.tab === id, pick: (cx) => { if (st.tab !== id) this.setTab(st, id, cx); } });
    return h_flex().id("t3-issues-bar").flex_1().min_w(0).h_full().gap(8).items_center()
      .child(st.picked
        ? control(this, t, "t3-issues-back", "arrow-left", st.tab === "mine" ? "Back to my issues" : "Back to the branch's issues",
          (cx) => { st.picked = null; st.actionError = null; this.menu = null; cx.notify(); }, { size: "sm", iconSize: 14 })
        : segmented(this, t, [tab("branch", "Branch", st.branch?.length), tab("mine", "Mine", st.mine ? `${st.mine.items.length}${st.mine.more ? "+" : ""}` : undefined)], { role: "tab" }))
      .child(searching ? this.searchField(t) : div().flex_1())
      .child(control(this, t, "t3-issues-refresh", "refresh-cw", st.provider?.refreshLabel ?? "Refresh issues", (cx) => refreshPage(this, cx)))
      .when(Boolean(d?.issue && st.provider?.hasStates && issue.states.length > 0), (el) => el.child(this.stateMenuButton(st, issue, t)))
      .when(Boolean(issue), (el) => el.child(this.moreMenu(st, issue, t)));
  }

  // ⋯: the issue in the browser, its link copied.
  moreMenu(st, issue, t) {
    return inlineMenu(this, t, "t3-issues-more", { label: "More", icon: icon("ellipsis"), items: [
      { label: st.provider.openLabel, icon: icon("external-link"), pick: (cx) => this.browse(st, issue.url, cx) },
      { label: "Copy link", icon: icon("link"), pick: (cx) => cx.write_to_clipboard(issue.url) }] });
  }

  searchField(t) {
    return compactField(this, t, "t3-issues-search-field", { focused: Boolean(this.searchFocused), focus: () => this.search.focus(),
      escape: (cx) => { this.search.set_value(""); this.handle.focus(); this.searchNow(cx); },
      child: Input.new(this.search).w_full().h_full().text_size(ui(12)).text_color(t.foreground).accessibility_label("Search issues") });
  }

  body(st, t, cx) {
    if (this.key === undefined) return loadingState(MOD, t, "t3-issues-loading", "Looking for a Linear API key…");
    if (!this.source()) return this.keyPage(t);
    if (st?.gh) {
      return emptyState(t, "t3-issues-gh", icon("circle-dot"), st.gh.title, st.gh.detail)
        .child(keycap(t, st.gh.command))
        .child(div().pt(8).child(textButton(this, t, "t3-issues-retry", "Try again", "outline", (cx) => refreshPage(this, cx))));
    }
    if (st?.problem) return emptyState(t, "t3-issues-problem", null, null, st.problem);
    if (!st?.info || !st.mine) return st?.error ? div() : loadingState(MOD, t, "t3-issues-loading", "Loading issues…");
    const shown = this.shownIssue(st);
    return shown ? this.detail(st, shown, t, cx) : this.list(st, t);
  }

  // No key, or Linear refused it: how to add one, Try again, and GitHub's issues meanwhile.
  keyPage(t) {
    const p = keyProblem(this.keyIssue);
    return emptyState(t, "t3-issues-key", icon("circle-dot"), p.title, p.detail)
      .child(div().id("t3-issues-key-command").max_w(360).px(6).py(2).rounded(4).bg(alpha(t.foreground, "12")).text_size(ui(12)).font_family(codeFont())
        .text_color(t.foreground).child(KEY_ADD))
      .child(h_flex().pt(8).gap(8).justify_center()
        .child(textButton(this, t, "t3-issues-key-retry", "Try again", "outline", (cx) => this.retryKey(cx)))
        .child(textButton(this, t, "t3-issues-use-github", "Show GitHub issues", "plain", (cx) => { this.useGitHub = true; refreshPage(this, cx); })));
  }

  // An empty list says why in one line, and which provider answered (Linear, or the GitHub repository read).
  list(st, t) {
    const empty = (text) => emptyState(t, `t3-issues-empty-${st.tab}`, null, null, text);
    let items, more = false;
    if (st.tab === "branch") {
      if (!st.info.branch) return empty("HEAD is detached: no branch to read an issue from.");
      items = st.branch ?? [];
      if (!items.length) return empty(st.provider.noBranchIssue(st.info));
    } else {
      const q = this.search.value().trim(), found = q && st.found?.q === q ? st.found : null;
      ({ items, more } = found ?? st.mine);
      if (!items.length) return empty(found ? `No issues match "${q}" in ${st.provider.where}.` : `No open issues assigned to you in ${st.provider.where}.`);
    }
    const now = Date.now();
    return v_flex().id(`t3-issues-list-${st.tab}`).size_full().overflow_y_scrollbar().px(12).pb(8).gap(2)
      .children(items.map((issue) => this.row(st, issue, t, now)))
      .when(more, (el) => el.child(div().px(8).py(8).text_size(ui(12)).text_color(t.dim).child("More than these: search to narrow them down.")));
  }

  row(st, issue, t, now) {
    const id = `t3-issues-row-${issue.id}`, mark = PRIORITY[issue.priority];
    return stop(this, t, id, h_flex().id(id).w_full().px(8).py(6).gap(8).items_start().rounded(6).cursor_pointer()
      .hover((h) => h.bg(tint(t, "chrome", false)))
      .role("button").accessibility_label(`${issue.ref} ${issue.title}, ${issue.state.name}`)
      .on_click((_e, cx) => this.pick(st, issue, cx))
      .child(stateIcon(this, t, issue.state, 16).mt(1))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().child(issue.title))
          .when(Boolean(mark), (el) => el.child(svg(icon(mark.icon)).size(14).flex_none().text_color(t[mark.color])))
          .when(Boolean(issue.assignee), (el) => el.child(div().size(18).flex_none().rounded_full().bg(alpha(t.foreground, "12")).flex().items_center().justify_center()
            .text_size(ui(9)).font_medium().text_color(t.muted).accessibility_label(`Assigned to ${issue.assignee}`).child(initials(issue.assignee)))))
        .child(h_flex().min_w(0).gap(8).text_size(ui(12)).text_color(t.dim)
          .child(div().flex_none().child(issue.ref))
          .child(div().flex_1().min_w(0).truncate().child(issue.assignee || "Unassigned"))
          .child(div().flex_none().child(since(issue.updatedAt, now))))), 6);
  }

  // A list row's issue, the detail's until its own read lands.
  card(st, id) { return [...(st.branch ?? []), ...(st.mine?.items ?? []), ...(st.found?.items ?? [])].find((i) => i.id === id) ?? null; }

  detail(st, shown, t, cx) {
    const d = st.details.get(shown.id), issue = d?.issue ?? this.card(st, shown.id) ?? shown;
    const full = Boolean(d?.issue), now = Date.now(), mark = PRIORITY[issue.priority];
    const facts = [issue.state.name, issue.assignee || "Unassigned", mark?.label, issue.project, issue.cycle].filter(Boolean);
    const part = (key, title, rows, count = null) => {
      const open = sectionOpen(this, key), sum = open ? null : sectionSummary(key, issue);
      return section(this, t, key, title, rows, { open, count, summary: sum && { text: sum } });
    };
    return v_flex().id("t3-issues-detail").size_full().min_h(0)
      .when(Boolean(st.actionError), (el) => el.child(noticeBar(t, "t3-issues-action-error", st.actionError, t.ansi1, "dismiss", "Dismiss", (cx) => { st.actionError = null; cx.notify(); }, this)))
      .when(Boolean(d?.error) && full, (el) => el.child(errorBar(t, "t3-issues-detail-error", d.error, (cx) => this.readDetail(st, issue, cx), this)))
      .child(v_flex().id(`t3-issues-detail-${issue.id}`).flex_1().min_h(0).overflow_y_scrollbar().px(12).pb(16)
        .child(h_flex().id("t3-issues-title").pt(4).gap(8).items_center().text_size(ui(14))
          .child(stateIcon(this, t, issue.state, 16))
          .child(div().min_w(0).truncate().font_medium().child(issue.title))
          .child(div().flex_none().text_color(t.dim).child(issue.ref)))
        .child(h_flex().id("t3-issues-facts").pt(4).gap(4).flex_wrap().text_size(ui(12)).text_color(t.dim)
          .children(facts.flatMap((f, i) => i ? [div().flex_none().child("·"), div().flex_none().child(f)] : [div().flex_none().child(f)])))
        .when(issue.labels.length > 0, (el) => el.child(h_flex().id("t3-issues-labels").pt(6).gap(6).flex_wrap()
          .children(issue.labels.map((l, i) => h_flex().id(`t3-issues-label-${i}`).h(20).px(6).gap(4).flex_none().items_center().rounded(4).bg(alpha(t.foreground, "0a"))
            .text_size(ui(11)).text_color(t.muted).child(div().size(6).rounded_full().bg(l.color || t.dim)).child(l.name)))))
        .when(!full, (el) => el.child(div().pt(8).text_size(ui(12)).text_color(t.dim).child(d?.error ? d.error : "Loading…")))
        .when(full, (el) => el
          .child(part("prs", "Linked PRs", () => this.prRows(st, issue, t), issue.prs.length))
          .child(part("description", "Description", () => [(issue.description ?? "").trim()
            ? rich(this, t, `t3-issues-body-${st.id}-${issue.id}`, st.provider.parts(issue, issue.description, issue.descriptionHTML), (url, cx) => this.browse(st, url, cx))
            : note(t, "No description.")]))
          .child(part("comments", "Comments", () => this.commentRows(st, issue, t, now, cx), issue.comments.length))));
  }

  // The state, as Linear draws it, opening the team's workflow states; picking one changes the issue's at once.
  stateMenuButton(st, issue, t) {
    const id = "t3-issues-state", open = this.menu?.id === id;
    return inlineMenu(this, t, id, { label: `State: ${issue.state.name}`, wide: true, disabled: Boolean(st.writing), items: !open ? [] : workflowOrder(issue.states).map((s) => ({
      label: s.name, icon: stateIcon(this, t, linearState(s), 16), trail: s.id === issue.state.id ? svg(icon("check")).size(16).flex_none().text_color(t.muted) : null,
      pick: (cx) => { if (s.id !== issue.state.id) this.write(st, issue, { kind: "state", target: s }, cx); } })) },
    (el) => el.child(stateIcon(this, t, issue.state, 14)).child(div().max_w(120).truncate().child(issue.state.name))
      .child(svg(icon("chevron-down")).size(14).flex_none().text_color(t.dim)));
  }

  prRows(st, issue, t) {
    if (!issue.prs.length) return [note(t, "No linked pull requests.")];
    const here = (pr) => Boolean(st.info?.repo) && pr.repo.toLowerCase() === st.info.repo.toLowerCase();
    return issue.prs.map((pr, i) => {
      const look = pr.status === "merged" ? ["git-merge", t.ansi5] : pr.status === "closed" ? ["git-pull-request-closed", t.ansi1] : ["git-pull-request", t.ansi2];
      return line(this, t, `t3-issues-pr-${i}`, here(pr) ? `Show #${pr.number} in Pull requests` : `Open ${pr.repo}#${pr.number} on GitHub`, (cx) => this.openPR(st, pr, cx), [
        svg(icon(look[0])).size(14).flex_none().text_color(look[1]),
        div().flex_none().text_color(t.dim).child(here(pr) ? `#${pr.number}` : `${pr.repo}#${pr.number}`),
        div().flex_1().min_w(0).truncate().child(pr.title)]);
    });
  }

  said(st, t, id, c, now) {
    return said(this, t, id, c, { now, parts: c.body.trim() ? st.provider.parts(c, c.body, c.bodyHTML) : [], open: (url, cx) => this.browse(st, url, cx) });
  }

  // Each thread: its first comment, its replies indented; where the provider takes writes, Reply under it and a new-comment box at the end.
  commentRows(st, issue, t, now, cx) {
    const canWrite = st.provider.canWrite, writing = st.writing;
    const rows = commentThreads(issue).map(([root, ...replies]) => {
      const id = `t3-issues-thread-${root.id}`, key = draftKey(issue.id, root.id);
      return v_flex().id(id).gap(2)
        .child(this.said(st, t, `${id}-${root.id}`, root, now))
        .children(replies.map((r) => div().pl(16).child(this.said(st, t, `${id}-${r.id}`, r, now))))
        .when(canWrite && this.replyTo !== key, (el) => el.child(h_flex().px(6).pt(2).child(replyButton(this, t, id, key, writing))))
        .when(canWrite && this.replyTo === key, (el) => el.child(replyBox(this, t, id, key, { writing, mine: writing?.thread === root,
          send: (cx, body) => this.write(st, issue, { kind: "reply", body, parent: root }, cx, key) })));
    });
    if (!rows.length) rows.push(note(t, "No comments yet."));
    if (issue.truncated) rows.push(note(t, "The conversation goes on past what's read here: the rest is in the browser."));
    if (canWrite) rows.push(commentBox(this, t, "t3-issues", draftKey(issue.id), cx, { writing, send: (cx, body) => this.write(st, issue, { kind: "comment", body }, cx, draftKey(issue.id)) }));
    return rows;
  }
}
