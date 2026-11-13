// The space panel's shared Files view (docs/adr/0017): the active space's folder, read-only, as
// one block: the file picked on the left, the tree on the right by the window's edge, the split between them dragged.
// One copy serves every space, here or on another machine: what each one shows is kept by its id.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Editor, EditorState, TextView } from "gpui-base";
import { spaces, nextCommand, exec, readTextFile, theme, settings, shared, setShared, appHome, window, notify } from "herdr";
import * as fs from "fs/promises";
import { panelState, surfacesFor, closeSurface, openFile, navigateFolder, surfaceKey } from "./panel.js";
import { terminalFor } from "./terminal-context.js";
import { TREE_ROW, treeRows, treeIndex, pathEntries, sortEntries, treeKey, treeList, treeRow, revealRow } from "./file-tree.js";
import { withNav, ghostButton, navWidth, navOpen, setNavOpen, holdWidth } from "./nav-column.js";
import { fileMenuItems, fileMenuView, runCommon } from "./file-menu.js";
import { KEY, migratePagePrefs, wrapLines, setWrapLines } from "./store.js";
import { installedTargets, knownTargets, openTarget } from "./open-in.js";
import { pierreFileIcon, pierreChevron } from "./pierre-icons.js";
import { button as drawButton } from "./button.js";
import { loadingState, emptyState } from "./panel-states.js";
import { stopsInit, stopsEnd, enter, focusRoot, stop } from "./focus.js";
import { tip, hoverKept } from "./tip.js";
import { LIST, IGNORED, PROBE, REMOTE_SEARCH, RANKED, join, parentOf, nameOf, ancestors, parseListing, parseIgnored, markIgnored, folderEntries, terms, narrows,
  filterPaths, kindOf, languageOf, readProblem, failedRead, ticket } from "./model.js";

const MOD = "mods/t3-files";
const RESULTS = 200, REMOTE_IMAGE = 512 * 1024, TEXT_MAX = 1024 * 1024;
// Expand all lists at most this many folders, Git-ignored ones left closed, as T3's.
// shortcut: a folder past it stays closed; list more in batches if a big repo wants it all.
const EXPAND_MAX = 200;
// Asked again while it shows: here every 5 s, another machine every 10; a refresh that took long, 10 times as long, a minute at
// most. Nothing is watched: Herdr's folder watch can't be stopped once asked, and a hidden page runs nothing.
const LOCAL_EVERY = 5000, REMOTE_EVERY = 10000, SLOWEST = 60000;
const FULL = 3; // the spaces last shown that keep all they read; older ones keep their file, open folders and search
const CACHE = "cache/t3-files"; // under the app's home, where image() can read
const MARKDOWN = "t3-files.markdown"; // "code" once someone picked it; Preview otherwise
const TARGET_FILES = { Finder: "finder", "Visual Studio Code": "vscode", Cursor: "cursor", Zed: "zed" };

const GIT = ["--no-optional-locks", "-c", "core.fsmonitor=false"]; // keep reads from updating the index or filesystem-monitor state

const zoom = () => Number(settings()?.zoom) || 1;

// What one space's page knows and shows.
function blank(sp) {
  return { id: sp.id, root: sp.folder, on: sp.machine ?? null, git: undefined, entries: new Map(), expanded: new Set(), ignored: new Set(),
    version: 0, file: null, folder: null, trail: null, view: null, previews: new Map(), selectedPaths: new Set(), focus: null, query: "", at: -1, results: null, total: 0, paths: null, loading: new Set(), errors: new Map() };
}

export default class Files extends View {
  init(_props, cx) {
    migratePagePrefs();
    this.states = new Map();
    this.treeHandle = cx.focus_handle();
    this.navHandle = cx.focus_handle();
    this.search = InputState.new({ placeholder: "Search files" });
    this.search.on("change", (_e, cx) => { const st = this.current(); if (st && this.search.value() !== st.query) this.find(st, this.search.value(), cx); });
    this.handle = cx.focus_handle();
    this.fs = /** @type {any} */ (null);
    this.treeHot = null;
    this.listHeight = {};
    stopsInit(this, cx);
    this.fs.hold = () => this.searchFocused || this.treeHandle.is_focused() || this.navHandle.is_focused();
    this.search.on("focus", (_e, cx) => { this.searchFocused = true; cx.notify(); });
    this.search.on("blur", (_e, cx) => { this.searchFocused = false; cx.notify(); });
    this.targets = ["Finder"];
    if (window()?.platform === "macos") cx.spawn(async cx => { this.targets = await installedTargets(); cx.notify(); });
    this.navOpen = navOpen();
    // The width the code is laid out at, behind its room while that moves (codeView, nav-column.js holdWidth).
    /** @type {{ at?: number, want?: number, run?: number }} */
    this.codeHold = {};
    this.cached = new Set();
    // The state being worked for, and a count that moves each time that changes (going).
    this.awake = null; this.gen = 0;
    cx.spawn(async () => { await exec("rm", ["-rf", `${appHome()}/${CACHE}`]).catch(() => null); });
    // A hidden copy isn't drawn, so this is what sees it go out of view.
    cx.timer.every(1000, (cx) => { this.sync(cx); this.poll(cx); });
    // `t3-files.open:<path from the space's folder>` and `t3-files.search:<words>`, for keys and scripts (the demo's);
    // `t3-files.close`, cmd-w while it has the keyboard, closes the active surface, never the terminal behind it.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand(), st = this.current(), at = c.indexOf(":"), [what, arg] = [c.slice(0, at), c.slice(at + 1)];
        if (c === "close") { if (this.menu) this.menu = null; else closeSurface(); cx.notify(); }
        if (c === "focus") { enter(this, cx, "t3-files-refresh"); this.search.focus(); }
        if (!st || at < 0) continue;
        if (what === "open") this.pick(st, arg, cx);
        else if (what === "search") { this.search.set_value(arg); this.find(st, arg, cx); }
      }
    });
  }

  // Its images go with it; one a crash left is cleared at the next start.
  async close() {
    stopsEnd(this);
    await Promise.all([...this.cached].map((f) => fs.unlink(`${appHome()}/${f}`).catch(() => null)));
  }

  current() {
    const sp = spaces().find((s) => s.active);
    return sp ? this.states.get(sp.id) : null;
  }

  // A space's state, made the first time and made again when its folder moves; the latest one last. The FULL last keep all
  // they read; older ones only how they were being read, and read again when back.
  stateFor(sp) {
    let st = this.states.get(sp.id);
    if (!st || st.root !== sp.folder || st.on !== (sp.machine ?? null)) { if (st) this.drop(st); st = blank(sp); }
    else if ([...this.states.keys()].at(-1) === sp.id) return st;
    this.states.delete(sp.id);
    this.states.set(sp.id, st);
    for (const old of [...this.states.values()].slice(0, -FULL)) this.states.set(old.id, this.slim(old));
    return st;
  }

  // What `st` read let go, for whatever still holds it too (a read under way): its editor, image and lists.
  drop(st) {
    for (const v of new Set([st.view, ...[...st.previews.values()].map(p => p.view)])) this.releasePreview(v);
    st.previews.clear();
    Object.assign(st, { view: null, entries: new Map(), ignored: new Set(), rows: null, index: null, paths: null, lower: null, last: null, results: null });
  }

  // A space let go of, keeping its file, open folders and search's words.
  slim(st) {
    this.drop(st);
    return Object.assign(blank({ id: st.id, folder: st.root, machine: st.on }), { file: st.file, folder: st.folder, trail: st.trail, fileBorn: st.fileBorn, selection: st.selection, expanded: new Set(st.expanded), selectedPaths: new Set(st.selectedPaths), focus: st.focus, query: st.query });
  }

  // It works only while it shows: the page in the open panel, the window in front, for the active space. Shown, it reads at
  // once; hidden, answers still under way are dropped and nothing more is asked. A closed space's state goes.
  sync(cx) {
    const all = spaces(), sp = all.find((s) => s.active);
    for (const [id, st] of this.states) {
      if (!all.some((s) => s.id === id)) { this.drop(st); this.states.delete(id); continue; }
      const tabs = surfacesFor(id).tabs;
      for (const [path, kept] of st.previews) if (!tabs.some(t => t.path === path && t.born === kept.born)) { this.releasePreview(kept.view); st.previews.delete(path); if (st.view === kept.view) st.view = null; }
      if (st.file && !tabs.some(t => t.path === st.file && t.born === st.fileBorn)) { st.file = null; st.view = null; }
    }
    const st = sp && this.shown() ? this.stateFor(sp) : null;
    if (st) {
      const s = surfacesFor(sp.id), tab = s.tabs.find(t => t.id === s.active);
      if (st.selection !== s.selected || st.file !== (tab?.folder ? null : tab?.path ?? null) || st.folder !== (tab?.folder ? tab.path ?? "" : null)) {
        st.selection = s.selected;
        cx.timer.after(0, (cx) => {
          if (!this.shown() || spaces().find(p => p.active)?.id !== st.id || surfacesFor(st.id).selected !== st.selection) return;
          if (tab?.folder) {
            st.file = null; st.view = null; st.folder = tab.path ?? ""; st.trail = tab.trail ?? st.folder;
            this.find(st, "", cx); this.search.set_value(""); this.reveal(st, st.folder, cx);
          } else if (tab?.path) this.pick(st, tab.path, cx, true);
          else { st.file = null; st.view = null; st.folder = null; st.trail = null; this.select(st, new Set()); this.changed(st); cx.notify(); }
        });
      }
    }
    if (st === this.awake) return;
    if (this.awake) { this.awake.loading.clear(); this.awake.expanding = false; }
    this.awake = st; this.gen++;
    if (!st?.root) return;
    if (st.git === undefined) this.load(st, cx); else this.recheck(st, cx);
  }

  // The page in the open panel, the window in front.
  shown() { const p = panelState(); return p.open && p.page === "files" && Boolean(window()?.active); }
  // Whether what started now may go on: `st` still the one worked for and in view, without having gone out of it since. It
  // asks the layout itself, as sync sees a hide only at its next tick; one it finds puts the page to sleep, so showing again
  // reads again.
  going(st) {
    const gen = this.gen;
    return () => {
      if (this.gen !== gen || this.awake !== st || !this.live(st)) return false;
      if (this.shown() && spaces().find((s) => s.active)?.id === st.id) return true;
      this.awake = null; this.gen++;
      return false;
    };
  }
  // A ticket (model.js) that also lapses once `st` stops showing.
  fresh(st, kind) { const t = ticket(st, kind), go = this.going(st); return () => t() && go(); }
  live(st) { return this.states.get(st.id) === st; }
  changed(st) { st.version++; st.rows = null; }

  // Git asked where the folder is, then the rest as a recheck: a space read again gets its file and search back too.
  load(st, cx) {
    const going = this.going(st);
    cx.spawn(async (cx) => {
      const top = await exec("git", ["rev-parse", "--show-toplevel", "--show-prefix"], { cwd: st.root, on: st.on }).catch(() => null);
      if (!going()) return;
      const [dir, prefix] = top?.code === 0 ? top.stdout.split("\n") : [];
      st.git = dir ? { top: dir, prefix: prefix ?? "" } : null;
      this.recheck(st, cx);
    });
  }

  // Git's marks, and every folder shown listed again. The search's list of files is made again at its next word.
  async refresh(st, cx) {
    const go = this.going(st);
    if (!go() || st.git === undefined) return;
    const began = st.refreshed = Date.now();
    const shown = ["", ...st.expanded].filter((p) => p === "" || ancestors(p).every((a) => st.expanded.has(a)));
    await Promise.all(shown.map((p) => this.list(st, p)));
    if (!go()) return;
    st.refreshed = Date.now(); st.took = st.refreshed - began; st.paths = null;
    cx.notify();
  }

  async list(st, rel) {
    const fresh = this.fresh(st, `list:${rel}`), dir = join(st.root, rel);
    if (!fresh()) return;
    st.loading.add(rel);
    const inIgnored = [rel, ...ancestors(rel)].some((p) => p && st.ignored.has(p));
    const [r, ig] = await Promise.all([
      exec("sh", ["-c", LIST, "files", dir], { on: st.on }).catch((e) => ({ code: 1, stdout: "", stderr: String(e) })),
      st.git && !inIgnored ? exec("sh", ["-c", IGNORED, "files", dir, rel ? `${rel}/` : ""], { cwd: st.root, on: st.on }).catch(() => null) : null,
    ]);
    if (!fresh()) return;
    if (r.code !== 0) {
      st.errors.set(rel, "This folder can't be listed. Click to retry.");
    } else {
      const entries = parseListing(r.stdout);
      st.entries.set(rel, entries);
      st.errors.delete(rel);
      if (ig) {
        markIgnored(st.ignored, rel, entries, parseIgnored(ig.stdout));
      }
    }
    st.loading.delete(rel);
    this.changed(st);
  }

  // While it shows (sync), asked again: every LOCAL_EVERY here or REMOTE_EVERY on another machine from the last refresh's end,
  // 10 times as long as that refresh took if longer, SLOWEST at most.
  poll(cx) {
    const st = this.awake;
    if (!st || st.git === undefined || st.expanding) return;
    const every = Math.min(SLOWEST, Math.max(st.on ? REMOTE_EVERY : LOCAL_EVERY, 10 * (st.took ?? 0)));
    if (Date.now() - (st.refreshed ?? 0) >= every) this.recheck(st, cx);
  }

  // Git, the folders shown and the file asked again. An image shown is copied whole each time, so it's left be: one changed
  // shows when it's picked again.
  recheck(st, cx) {
    st.refreshed = Date.now();
    cx.spawn(async (cx) => {
      await this.refresh(st, cx);
      // A search showing, found again, the lit result kept lit; each asks only while it shows.
      if (st.query) this.find(st, st.query, cx, st.results?.[st.at]?.path ?? null);
      if (st.file && !st.view?.image) this.open(st, st.file, cx, true);
    });
  }

  toggle(st, path, cx) {
    ticket(st, "expand"); st.expanding = false; st.expandAll = false;
    const row = this.rows(st).find(r => r.path === path), top = row?.top ?? path;
    const chain = [...new Set([top, ...ancestors(path).filter(p => p.startsWith(`${top}/`)), path])];
    if (st.query.trim()) {
      st.searchClosed ??= new Set();
      if (row?.open) st.searchClosed.add(top); else for (const p of chain) st.searchClosed.delete(p);
      this.changed(st); cx.notify(); return;
    }
    if (st.expanded.has(path)) for (const p of chain) st.expanded.delete(p);
    else {
      for (const p of chain) st.expanded.add(p);
      // A folder holding just a folder opens with it, as the tree shows them as one row.
      const go = this.fresh(st, "expand");
      cx.spawn(async (cx) => {
        for (let p = path, kids; p && go(); p = kids?.length === 1 && kids[0].dir ? join(p, kids[0].name) : null) {
          await this.list(st, p);
          if (!go()) return;
          kids = st.entries.get(p);
          if (kids?.length === 1 && kids[0].dir) st.expanded.add(join(p, kids[0].name));
        }
        if (!go()) return;
        this.changed(st);
        cx.notify();
      });
    }
    this.changed(st);
    cx.notify();
  }

  // Opens the folders down to `path` (a file's, or a folder lit until the next click) and brings its row into view.
  reveal(st, path, cx) {
    for (const p of ancestors(path)) st.expanded.add(p);
    this.select(st, new Set(path ? [path] : []));
    st.focus = path || null;
    this.changed(st);
    const go = this.going(st);
    cx.spawn(async (cx) => {
      for (const p of ancestors(path)) if (go() && !st.entries.has(p)) await this.list(st, p);
      if (!go()) return;
      // The space's folder is the tree's top.
      const id = `t3-files-tree-${st.id}`;
      if (path) { revealRow(this, id, path); this.treeHandle.focus(); } else this.scrollTop = { ...this.scrollTop, [id]: 0 };
      cx.notify();
    });
    cx.notify();
  }

  // A search result: the file opens, and the tree shows where it is.
  pick(st, path, cx, selected = false) {
    st.folder = null; st.trail = null;
    st.query = ""; st.results = null; st.at = -1;
    this.search.set_value("");
    this.open(st, path, cx, false, selected);
    this.reveal(st, path, cx);
  }

  // Shows a file; `again` reads it again where it may have changed, and leaves it as it was if it hasn't.
  open(st, rel, cx, again = false, selected = false) {
    if (!again) {
      if (!selected) openFile(rel);
      const surfaces = surfacesFor(st.id), tab = surfaces.tabs.find(t => t.path === rel), kept = st.previews.get(rel);
      st.selection = surfaces.selected;
      st.file = rel; st.fileBorn = tab?.born;
      st.view = kept?.born === tab?.born ? kept.view : { loading: true };
      this.changed(st);
      cx.notify();
    }
    const fresh = this.fresh(st, "file"), abs = join(st.root, rel), kind = kindOf(rel);
    if (!fresh()) return;
    if (!again && !st.view.loading) {
      if (st.view.text !== undefined && !st.view.code && (kind === "text" || shared(MARKDOWN) === "code")) this.editor(st.view, rel);
      this.keepPreview(st, rel, st.view); return;
    }
    cx.spawn(async (cx) => {
      const view = await this.read(st, abs, rel, kind, fresh).catch(() => ({ problem: "This file can't be read." }));
      if (view?.problem) view.failed = failedRead(view.problem);
      if (!view) return;
      if (!fresh() || st.file !== rel) { this.releasePreview(view); return; }
      const old = st.view;
      if (again && old && view.text !== undefined && view.text === old.text) return;
      if (old?.image && old.image !== view.image) this.uncache(old.image);
      if (view.text !== undefined && (kind === "text" || shared(MARKDOWN) === "code")) this.editor(view, rel);
      if (old?.code) old.code.release();
      st.view = view; this.keepPreview(st, rel, view);
      cx.notify();
    });
  }

  releasePreview(view) { view?.code?.release(); if (view?.image) this.uncache(view.image); }

  keepPreview(st, rel, view) {
    st.previews.delete(rel); st.previews.set(rel, { born: st.fileBorn, view });
    for (const [path, kept] of [...st.previews].slice(0, -3)) { this.releasePreview(kept.view); st.previews.delete(path); }
  }

  /** @returns {Promise<any>} */
  async read(st, abs, rel, kind, fresh) {
    let size = null;
    if (st.on) {
      const p = await exec("sh", ["-c", PROBE, "probe", abs], { on: st.on });
      if (!fresh()) return null;
      if (p.code !== 0) return { problem: "This file can't be read." };
      const [bytes, nuls] = p.stdout.trim().split(" ").map(Number);
      size = bytes;
      if (kind !== "image" && bytes > TEXT_MAX) return { problem: "This file is larger than 1 MB, too large to preview." };
      if (kind !== "image" && nuls > 0) return { problem: "This is a binary file, so there's no text to show." };
    }
    if (kind === "image") {
      if (st.on && size > REMOTE_IMAGE) return { problem: `This image is larger than 512 KB, too large to bring over from ${st.on}.` };
      const name = `${CACHE}/${Date.now()}-${nameOf(rel).replace(/[^\w.-]/g, "_")}`, dest = `${appHome()}/${name}`;
      await fs.mkdir(`${appHome()}/${CACHE}`, { recursive: true }).catch(() => null);
      if (!fresh()) return null;
      if (st.on) {
        const r = await exec("base64", [abs], { on: st.on, timeout: 60000 });
        if (!fresh()) return null;
        if (r.code !== 0) return { problem: "This image can't be read." };
        const bin = /** @type {any} */ (globalThis).atob(r.stdout.replace(/\s+/g, "")), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        await fs.writeFile(dest, bytes);
      } else {
        const r = await exec("cp", [abs, dest]);
        if (r.code !== 0) return { problem: "This image can't be read." };
      }
      if (!fresh()) { await fs.unlink(dest).catch(() => null); return null; }
      this.cached.add(name);
      return { image: name };
    }
    let text;
    try { text = await readTextFile(abs, { on: st.on }); }
    catch (e) { return { problem: readProblem(e) }; }
    if (text === null) return { problem: "This file isn't there anymore." };
    if (st.on && text.includes("\uFFFD")) return { problem: "This file isn't UTF-8 text, so there's nothing to show." };
    return { text };
  }

  uncache(name) {
    this.cached.delete(name);
    fs.unlink(`${appHome()}/${name}`).catch(() => null);
  }

  // The view's code, wrapped as the layout's Lines choice says (store.js), which it notes: the editor takes it only when made.
  editor(view, rel) {
    const t = theme();
    view.wrap = wrapLines();
    view.code = EditorState.new({ language: languageOf(nameOf(rel)), value: view.text, readonly: true, soft_wrap: view.wrap, font_family: /** @type {string} */ (settings().font_family), font_size: 12,
      syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
  }

  // Every term in the path, case aside. Here, over the folder's whole list, kept until the next refresh; elsewhere, there.
  // `keep`: the path to keep lit, if it's still found.
  find(st, query, cx, keep = null) {
    query = query.slice(0, 256);
    if (st.query !== query) { st.searchClosed = new Set(); ticket(st, "expand"); st.expanding = false; st.expandAll = false; }
    st.query = query;
    if (!keep) st.at = 0;
    const words = terms(query), fresh = this.fresh(st, "search");
    if (!words.length) { st.results = null; st.searching = false; this.changed(st); cx.notify(); return; }
    if (!fresh()) return;
    st.searching = true; st.searchError = null;
    cx.spawn(async (cx) => {
      await cx.sleep(200);
      if (!fresh()) return;
      let found, total;
      if (st.on) {
        const r = await exec("sh", ["-c", REMOTE_SEARCH, "search", query], { cwd: st.root, on: st.on }).catch(() => null);
        if (!fresh()) return;
        if (!r || r.code !== 0) { st.searchError = "Files can't be searched. Click to retry."; st.searching = false; cx.notify(); return; }
        found = (r?.stdout ?? "").split("\n").filter(Boolean);
        total = found.length;
        st.more = total >= RANKED;
      } else {
        if (!st.paths) {
          const r = st.git
            ? await exec("git", [...GIT, "ls-files", "-co", "--exclude-standard", "-z"], { cwd: st.root }).catch(() => null)
            : await exec("sh", ["-c", "find . -name .git -prune -o -type f -print | sed 's|^\\./||' | head -n 200000"], { cwd: st.root }).catch(() => null);
          if (!fresh()) return;
          if (!r || r.code !== 0) { st.searchError = "Files can't be searched. Click to retry."; st.searching = false; cx.notify(); return; }
          st.paths = (r?.stdout ?? "").split(st.git ? "\0" : "\n").filter(Boolean);
          st.lower = st.paths.map((p) => p.toLowerCase());
          st.last = null;
        }
        const from = narrows(query, st.last?.query) ? st.last.idx : null;
        const idx = await filterPaths(st.lower, words, from, () => cx.sleep(0), fresh);
        if (!idx) return;
        st.last = { query, idx };
        total = idx.length;
        found = idx.slice(0, total <= RANKED ? RANKED : RESULTS).map((i) => st.paths[i]);
        st.more = false;
      }
      st.results = found.slice(0, RESULTS).map(path => ({ path }));
      st.total = total;
      st.searching = false;
      const kept = keep ? st.results.findIndex((r) => r.path === keep) : -1;
      st.at = kept >= 0 ? kept : Math.min(Math.max(keep ? 0 : st.at, 0), st.results.length - 1);
      this.changed(st);
      cx.notify();
    });
    cx.notify();
  }

  // A row's menu: file-menu.js's items.
  menuItems(st, path) {
    const targets = knownTargets() ?? this.targets;
    if (this.menu?.kind === "targets") return targets.map(name => ({ id: name, label: name, glyph: this.targetIcon(name, theme()), checked: name === (shared(KEY.openTarget) ?? "Finder"), run: () => setShared(KEY.openTarget, name) }));
    if (this.menu?.kind === "crumb") {
      const m = this.menu, dir = m.dir;
      const browse = (path, cx) => { m.dir = path; m.at = -1; cx.spawn(async cx => { if (!st.entries.has(path)) await this.list(st, path); cx.notify(); }); cx.notify(); };
      const up = dir !== m.root ? [{ id: "back", label: `Back to ${nameOf(parentOf(dir)) || nameOf(st.root)}`, icon: "chevron-left", keepOpen: true, run: cx => browse(parentOf(dir), cx) }] : [];
      const entries = st.entries.get(dir);
      if (st.errors.has(dir)) return [...up, { id: "retry", label: "Retry loading folder", icon: "refresh-cw", keepOpen: true, run: cx => cx.spawn(async cx => { await this.list(st, dir); cx.notify(); }) }];
      if (!entries) return [...up, { id: "loading", label: st.errors.get(dir) ?? "Loading folder…", disabled: true }];
      return [...up, ...(entries.length ? entries.map(e => ({ id: join(dir, e.name), label: e.name, glyph: e.dir ? pierreChevron(theme(), MOD, false) : pierreFileIcon(theme(), MOD, join(dir, e.name)), checked: join(dir, e.name) === st.file, keepOpen: e.dir, run: cx => e.dir ? browse(join(dir, e.name), cx) : this.pick(st, join(dir, e.name), cx) })) : [{ id: "empty", label: "This folder is empty.", disabled: true }])];
    }
    const abs = join(st.root, path), platform = window()?.platform, agent = terminalFor(st.id);
    const action = it => ({ ...it, ...(it.children ? { children: it.children.map(action) } : {}), ...(it.id.startsWith("editor:") ? { glyph: this.targetIcon(it.id.slice(7), theme()) } : {}), run: cx => {
      if (it.id === "open") this.launch(st, path, shared(KEY.openTarget) ?? "Finder", cx);
      else if (it.id.startsWith("editor:")) this.launch(st, path, it.id.slice(7), cx);
      else runCommon(it.id, { abs, rel: path, platform, agent }, cx);
    } });
    return fileMenuItems({ page: "files", remote: Boolean(st.on), platform, agent, editors: targets.filter(name => name !== "Finder") }).map(action);
  }

  context() { const sp = spaces().find(s => s.active); return `${sp?.id}:${sp?.tabs.find(t => t.active)?.id}`; }

  launch(st, path, name, cx) {
    if (st.on || window()?.platform !== "macos") return;
    const context = this.context();
    cx.spawn(async () => {
      try { const actual = await openTarget(name, join(st.root, path), () => this.live(st) && this.context() === context); if (actual) setShared(KEY.openTarget, actual); }
      catch (e) { notify({ title: "Couldn't open this file", body: String(e), level: "error" }); }
    });
  }

  browse(st, kind, path, box, cx) {
    const z = zoom(), from = this.bounds;
    this.menu = { kind, path, dir: path, root: path, context: this.context(), at: -1,
      x: box && from ? (box.x - from.x) / z : Math.max(4, (this.size?.width ?? 800) - 224),
      y: box && from ? (box.y + box.height - from.y) / z + 4 : 32 };
    this.handle.focus();
    if (kind === "crumb" && !st.entries.has(path)) cx.spawn(async cx => { await this.list(st, path); cx.notify(); });
    cx.notify();
  }

  navigate(st, path, cx) {
    if (path && path === st.trail && path !== st.folder) { this.pick(st, path, cx); return; }
    navigateFolder(path, st.trail ?? st.file ?? path, Boolean(st.file));
    this.sync(cx);
  }

  rows(st) {
    if (st.rows) return st.rows;
    let rows;
    if (st.query.trim() && st.results) {
      const kids = pathEntries(st.results);
      rows = treeRows(p => sortEntries(kids.get(p) ?? []), p => !st.searchClosed?.has(p), true);
    }
    else rows = treeRows(folderEntries(st), p => st.expanded.has(p), true);
    st.index = treeIndex(rows);
    this.select(st, st.selectedPaths);
    return st.rows = rows;
  }

  select(st, paths) { st.selectedPaths = paths; st.selectedRows = new Set([...paths].map(path => st.index?.at.get(path))); }

  /** @param {any} state */
  control(t, id, icon, label, press, state = {}) {
    const el = ghostButton(t, MOD, id, icon, label, press, { ...state, view: this });
    const trigger = state.disabled ? div().flex_none().child(el).on_hover((on, cx) => { this.hot = on ? id : null; cx.notify(); }) : stop(this, t, id, el, 8);
    return tip(this, t, id, label, trigger);
  }

  // Selection belongs to the tree, not the pointer or the current preview; Pierre opens only the last selected file.
  chooseRow(st, row, modifiers, cx) {
    const rows = this.rows(st), add = modifiers?.platform || modifiers?.control;
    let selected = new Set(add ? st.selectedPaths : []);
    if (modifiers?.shift) {
      const from = Math.max(0, rows.findIndex(r => r.path === (st.anchor ?? st.focus ?? row.path))), to = rows.findIndex(r => r.path === row.path);
      for (const r of rows.slice(Math.min(from, to), Math.max(from, to) + 1)) selected.add(r.path);
    } else {
      if (add && selected.has(row.path)) selected.delete(row.path); else selected.add(row.path);
      st.anchor = row.path;
    }
    this.select(st, selected); st.focus = row.path;
    const last = [...selected].at(-1), target = rows.find(r => r.path === last);
    if (target && !target.dir) this.open(st, target.path, cx);
    if (row.dir && !add && !modifiers?.shift) this.toggle(st, row.path, cx);
    cx.notify();
  }

  render(cx) {
    const t = theme(), sp = spaces().find((s) => s.active);
    if (!sp) return div().id("t3-files").size_full();
    this.sync(cx);
    const st = this.stateFor(sp);
    const context = `${sp.id}:${sp.tabs.find(t => t.active)?.id}`;
    if (this.menu && this.menu.context !== context) this.menu = null;
    // Lines changed: the editor made again, just after this draw, as an editor can't be made in one.
    const v = st.view;
    if (v?.code && v.wrap !== wrapLines()) cx.timer.after(0, (cx) => {
      if (st.view !== v || !v.code || v.wrap === wrapLines()) return;
      const old = v.code;
      this.editor(v, st.file);
      old.release();
      cx.notify();
    });
    // The search field shows this space's words.
    if (this.searchFor !== st.id) { this.searchFor = st.id; if (this.search.value() !== st.query) this.search.set_value(st.query); }
    const width = this.size?.width ?? 800;
    return focusRoot(this, v_flex().id("t3-files").relative().size_full().min_h(0).text_color(t.foreground).text_size(13)
      .track_focus(this.handle).on_mouse_down("left", () => this.handle.focus())
      .on_mouse_move(e => { this.bounds = e.bounds; })
      .on_key_down((e, cx) => { if (this.menu && e.keystroke === "cmd-w") { this.menu = null; cx.stop_propagation(); cx.notify(); } else surfaceKey(e, cx); })
      .on_size_change((size, cx) => { this.size = { width: size.width / zoom(), height: size.height / zoom() }; cx.notify(); })
      .on_mouse_down("right", (e, cx) => {
        if (!this.menuFor) return;
        this.menu = { path: this.menuFor, context, x: (e.local_position?.x ?? 0) / zoom(), y: (e.local_position?.y ?? 0) / zoom(), at: -1 };
        this.menuFor = null;
        this.handle.focus();
        cx.notify();
      })
      .when(Boolean(st.file) || st.folder !== null, el => el.child(this.toolbar(st, t)))
      .child(div().flex_1().min_h(0).child(st.file ? withNav(t, "t3-files", width, { content: this.content(st, t), head: this.searchHead(st, t), list: this.tree(st, t), open: this.navOpen, inline: true, handle: this.navHandle })
        : v_flex().size_full().min_h(0).child(div().h(36).mb(4).px(8).flex_none().child(this.searchHead(st, t))).child(div().flex_1().min_h(0).child(this.tree(st, t)))))
      .when(Boolean(this.menu), (el) => el.child(fileMenuView(this, t, MOD, this.menuItems(st, this.menu.path), this.handle, this.size ?? { width: 800, height: 600 }))));
  }

  // Only a file has a subheader; Markdown uses one icon toggle, not a segmented text control.
  toolbar(st, t) {
    const md = kindOf(st.file ?? "") === "markdown", code = shared(MARKDOWN) === "code";
    const parts = (st.trail ?? st.file)?.split("/").filter(Boolean) ?? [], current = st.folder ?? st.file;
    const crumb = (label, path, last) => {
      const id = `crumb-${path}`, el = div().id(id).flex_none().max_w(160).truncate().px(2).rounded(4).text_color(last ? t.foreground : t.dim).when(last, el => el.font_medium())
        .when(!last, el => el.cursor_pointer().hover(s => s.text_color(t.foreground)).on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => this.navigate(st, path, cx)))
        .child(label);
      return last ? el : stop(this, t, id, el, 4);
    };
    const separator = path => stop(this, t, `browse-${path}`, div().id(`browse-${path}`).w(16).h(20).mx(2).rounded(4).flex_none().flex().items_center().justify_center().cursor_pointer().hover(s => s.bg(t.foreground + "12"))
      .on_mouse_down("left", (e, cx) => { this.crumbPress = { path, box: e.bounds }; cx.stop_propagation(); }).on_click((_e, cx) => {
        const box = this.crumbPress?.path === path ? this.crumbPress.box : null; this.crumbPress = null;
        this.browse(st, "crumb", path, box, cx);
      })
      .child(svg(`${MOD}/icons/chevron-right.svg`).size(14).text_color(t.dim)).accessibility_label(`Browse ${path || nameOf(st.root)}`), 4);
    return h_flex().id("t3-files-toolbar").h(28).mb(12).flex_none().px(12).gap(8).items_center()
        .child(h_flex().id("t3-files-breadcrumbs").flex_1().min_w(0).overflow_x_scroll().bg("#00000000").items_center().text_size(12)
          .when(Boolean(st.root), (el) => el.child(crumb(nameOf(st.root.replace(/\/$/, "")) || st.root, "", current === "")))
          .children(parts.flatMap((part, i) => [separator(parts.slice(0, i).join("/")), crumb(part, parts.slice(0, i + 1).join("/"), parts.slice(0, i + 1).join("/") === current)])))
        // The page's buttons 4 apart, as Review's.
        .child(h_flex().flex_none().gap(4).items_center()
          .child(this.openControl(st, t))
          .child(this.control(t, "t3-files-render-mode", md && !code ? "code-xml" : "eye", md ? code ? "Show preview" : "Show code" : "Preview is not available for this file", cx => {
            if (!code && st.view?.text !== undefined && !st.view.code) this.editor(st.view, st.file);
            setShared(MARKDOWN, code ? "preview" : "code"); cx.notify();
          }, { on: md && !code, disabled: !md, size: "sm" }))
          // Wrap or scroll long lines, this page's own choice.
          .child(this.control(t, "t3-files-wrap", "text-wrap", st.view?.code && (!md || code) ? wrapLines() ? "Disable word wrap" : "Enable word wrap" : "Word wrap is only available in code", (cx) => { setWrapLines(!wrapLines()); cx.notify(); }, { on: wrapLines(), disabled: !st.view?.code || md && !code, size: "sm" }))
          .child(this.control(t, "t3-files-nav-toggle", "folder-tree", !st.file ? "File explorer is always visible for folders" : this.navOpen ? "Hide file explorer" : "Show file explorer", cx => { this.navOpen = !this.navOpen; setNavOpen(this.navOpen); cx.notify(); }, { on: !st.file || this.navOpen, disabled: !st.file, size: "sm" })));
  }

  openControl(st, t) {
    const target = (knownTargets() ?? this.targets).includes(shared(KEY.openTarget)) ? shared(KEY.openTarget) : "Finder", available = !st.on && window()?.platform === "macos";
    const on = this.menu?.kind === "targets", id = "t3-files-open-in";
    const primary = drawButton(t, id, { size: "sm", surface: "card", on, label: `Open in ${target}`, disabled: !available }).rounded_r(0).child(this.targetIcon(target, t, 16))
      .on_hover((on, cx) => { this.hot = on ? id : null; cx.notify(); })
      .when(available, el => el.cursor_pointer().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => {
        cx.stop_propagation(); this.launch(st, st.file ?? st.folder, target, cx);
      }));
    const secondary = drawButton(t, "t3-files-open-more", { size: "sm", surface: "card", on, icon: `${MOD}/icons/chevron-down.svg`, label: "Choose editor", disabled: !available }).rounded_l(0)
      .on_hover((on, cx) => { this.hot = on ? "t3-files-open-more" : null; cx.notify(); })
      .when(available, el => el.cursor_pointer().on_mouse_down("left", (e, cx) => { this.openPress = e.bounds; cx.stop_propagation(); }).on_click((_e, cx) => {
        cx.stop_propagation(); const box = this.openPress; this.openPress = null; this.browse(st, "targets", st.file ?? st.folder, box, cx);
        cx.spawn(async cx => { this.targets = await installedTargets(); if (this.menu?.kind === "targets") cx.notify(); });
      }));
    return h_flex().id("t3-files-open-group").flex_none().items_center().gap(0).cursor_default()
      .child(tip(this, t, id, available ? `Open in ${target}` : "Local applications cannot open a remote file", available ? stop(this, t, id, primary, 8) : primary))
      .child(div().w(1).h(16).flex_none().bg(t.border))
      .child(available ? stop(this, t, "t3-files-open-more", secondary, 8) : secondary);
  }

  targetIcon(name, t, size = 16) { return TARGET_FILES[name] ? image(`${MOD}/icons/${TARGET_FILES[name]}.svg`).size(size).flex_none() : svg(`${MOD}/icons/app-window.svg`).size(size).text_color(t.dim).flex_none(); }

  // The file: Preview or Code for Markdown, the code, an image or why there's none; with no file, a quiet line.
  content(st, t) {
    const v = st.view, md = kindOf(st.file ?? "") === "markdown", code = shared(MARKDOWN) === "code";
    if (!st.file) return emptyState(t, "t3-files-empty", `${MOD}/icons/file-text.svg`, "No file open", st.root ? "Pick one in the tree, or search for it." : "This space has no folder.");
    return div().id("t3-files-content").size_full().min_h(0).min_w(0).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(!v || v.loading ? loadingState(t, "t3-files-loading", "Loading the file…")
          // A read that failed is the error bar's (the toolbar's); a file there's nothing to show of says why, as an empty page.
          : v.problem ? v_flex().id("t3-files-problem").size_full().p(24).gap(12).items_center().justify_center().text_center().text_size(12).role("alert")
            .child(div().text_color(t.ansi1).child(v.problem))
            .child(div().max_w_full().whitespace_normal().child(st.file)).child(div().max_w_full().whitespace_normal().text_color(t.dim).child(st.root))
            .child(this.control(t, "t3-files-locate", "folder-tree", "Locate the file in Files", cx => { this.navOpen = true; this.reveal(st, st.file, cx); }))
          : v.image ? div().size_full().p(16).flex().items_center().justify_center().child(image(v.image).max_w_full().max_h_full())
          : md && !code ? div().id("t3-files-md").size_full().overflow_y_scrollbar().px(24).py(16).child(TextView.markdown(`t3-files-md-${st.id}-${st.file}`, v.text).selectable(true).scrollable(false).text_size(14))
          // Laid out at the width its room last held (nav-column.js holdWidth), cut off or short of it while the room moves.
          : v.code ? this.codeView(v.code)
          : div());
  }

  codeView(code) {
    const hold = this.codeHold;
    return div().id("t3-files-code").size_full().min_w(0).overflow_hidden()
      .on_size_change((size, cx) => {
        const width = size.width / zoom();
        if (Math.abs(width - (hold.want ?? hold.at ?? -1)) < 1) return;
        holdWidth(hold, width, (ms, f) => cx.timer.after(ms, f));
        cx.notify();
      })
      // Always at the held width once known: switching between it and w_full laid the file out again, as long as the drag's step.
      .child(Editor.new(code).h_full().when(hold.at != null, (el) => el.w(hold.at)).when(hold.at == null, (el) => el.w_full()));
  }

  // The column's head: the search, as T3's ghost InputGroup, and Collapse all / Expand all. Its keys are the results'.
  searchHead(st, t) {
    this.rows(st);
    const folders = st.index.folders;
    return h_flex().id("t3-files-search").flex_1().min_w(0).h_full().gap(4).items_center()
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        this.find(st, "", cx); this.search.set_value(""); this.treeHandle.focus();
        cx.stop_propagation();
        cx.notify();
      })
      .child(this.control(t, "t3-files-refresh", "refresh-cw", "Refresh files", cx => this.recheck(st, cx)))
      .child(div().id("t3-files-search-field").relative().flex_1().min_w(0).h(28).px(9).rounded(6).border_1().border_color(this.searchFocused ? t.accent : "#00000000")
        .when(Boolean(this.searchFocused), el => el.bg(t.background))
        .when(!this.searchFocused, el => el.hover(s => s.bg(t.foreground + "12")))
        .on_mouse_down("left", (_e, cx) => { this.search.focus(); cx.stop_propagation(); })
        .child(Input.new(this.search).w_full().h_full().text_size(12).text_color(t.foreground).accessibility_label("Search files"))
        .when(Boolean(this.searchFocused), el => el.child(div().id("t3-files-search-ring").absolute().inset_0().rounded(6).border(3).border_color(t.accent + "3d"))))
      .when(folders > 0, el => el.child(this.control(t, "t3-files-fold-all", this.allExpanded(st) ? "chevrons-down-up" : "chevrons-up-down", this.allExpanded(st) ? "Collapse all folders" : "Expand all folders", cx => this.foldAll(st, cx))));
  }

  // Collapse all while any folder is open; else open every folder, Git-ignored ones aside, EXPAND_MAX at most.
  allExpanded(st) { this.rows(st); return Boolean(st.expandAll || st.index.allExpanded); }

  foldAll(st, cx) {
    const collapse = this.allExpanded(st);
    st.expandAll = !collapse;
    const go = this.fresh(st, "expand"); // Collapse invalidates the in-flight expansion before any awaited read can reopen a folder.
    st.expanding = !collapse;
    if (st.query.trim() && st.results) { st.expanding = false; st.searchClosed = collapse ? new Set([...pathEntries(st.results).keys()].filter(Boolean)) : new Set(); this.changed(st); cx.notify(); return; }
    if (collapse) { st.expanded.clear(); this.changed(st); cx.notify(); return; }
    cx.notify();
    cx.spawn(async (cx) => {
      const queue = [""];
      for (let n = 0; queue.length && n < EXPAND_MAX && go();) {
        const batch = queue.splice(0, Math.min(4, EXPAND_MAX - n));
        n += batch.length;
        await Promise.all(batch.map(async rel => {
          if (!go()) return;
          if (!st.entries.has(rel)) await this.list(st, rel);
          if (!go()) return;
          if (rel) st.expanded.add(rel);
          for (const e of st.entries.get(rel) ?? []) if (e.dir && !st.ignored.has(join(rel, e.name))) queue.push(join(rel, e.name));
        }));
      }
      if (!go()) return;
      st.expanding = false;
      this.changed(st);
      cx.notify();
    });
  }

  // The folder's tree, as T3's: a click opens a file or a folder; the keys move a ring, ↵ opens what it's on.
  tree(st, t) {
    if (!st.root) return div().p(8).text_size(12).text_color(t.dim).child("This space has no folder.");
    const errors = () => v_flex().p(16).gap(4).children([...st.errors].map(([path, message]) => div().id(`t3-files-retry-${path}`).text_size(12).text_color(t.ansi1).cursor_pointer().child(`${path ? `${path}: ` : ""}${message}`).on_click((_e, cx) => cx.spawn(async cx => { await this.list(st, path); cx.notify(); }))));
    if (st.errors.size && !st.entries.has("")) return errors();
    if (st.searchError) return div().p(16).text_size(12).text_color(t.ansi1).cursor_pointer().on_click((_e, cx) => this.find(st, st.query, cx)).child(st.searchError);
    if (!st.entries.has("") || st.searching && !st.results?.length) return div().id("t3-files-tree-loading").px(12).py(4).text_size(12).text_color(t.dim).child("Loading files…");
    const rows = this.rows(st);
    if (st.errors.size && !rows.length) return errors();
    if (!rows.length) return st.query.trim() ? div().id("t3-files-no-matches").px(12).py(16).text_size(12).text_color(t.dim).child("No matching files.") : div();
    const ringed = this.treeHandle.is_focused() ? st.index.at.get(st.focus ?? st.file) ?? -1 : -1;
    const act = (r, cx) => { if (r.dir) this.toggle(st, r.path, cx); else this.open(st, r.path, cx); };
    const draw = (r, i) => {
      let label;
      if (r.dir && r.top !== r.path) {
        let path = parentOf(r.top);
        label = h_flex().min_w(0).overflow_hidden().gap(2).items_center().children(r.name.split(" / ").flatMap((name, j) => {
          path = join(path, name); const segment = path;
          const el = div().min_w(0).truncate().hover(s => s.underline()).child(name).on_click((_e, cx) => { cx.stop_propagation(); this.select(st, new Set([segment])); st.focus = segment; this.toggle(st, r.path, cx); });
          return j ? [div().flex_none().text_color(t.dim).child("/"), el] : [el];
        }));
      }
      return treeRow(t, MOD, { ...r, label, chevron: r.dir ? pierreChevron(t, MOD, r.open) : undefined }, `row-${r.path}`, { selected: st.selectedRows.has(i), focused: i === ringed, context: this.menu?.path === r.path, dim: r.ignored,
        icon: !r.dir ? pierreFileIcon(t, MOD, r.path) : undefined,
        guides: Boolean(this.treeHot || r.parents.some(p => st.focus?.startsWith(`${p}/`))),
        trailing: r.dir && r.open && st.loading.has(r.path) ? svg("mods/workspace-chrome/spinner.svg").size(14).text_color(t.dim).spin(900) : null })
        .on_click((e, cx) => this.chooseRow(st, r, e.modifiers, cx))
        .on_mouse_down("right", () => { this.menuFor = r.path; });
    };
    return div().id("t3-files-tree-region").size_full().on_mouse_move(e => { this.treeBounds = e.bounds; }).child(hoverKept(this, "treeHot", "tree", div().id("t3-files-tree").size_full().track_focus(this.treeHandle).tab_index(0)
      .on_mouse_down("left", (_e, cx) => { this.treeHandle.focus(); cx.stop_propagation(); })
      .on_key_down((e, cx) => {
        if (e.keystroke === "shift-f10") {
          const path = st.focus ?? st.file;
          if (path) {
            const width = this.size?.width ?? 800, z = zoom(), index = st.index.at.get(path) ?? 0, id = `t3-files-tree-${st.id}`;
            const x = this.treeBounds && this.bounds ? (this.treeBounds.x - this.bounds.x) / z : st.file ? width - navWidth(width) : 4;
            const top = this.treeBounds && this.bounds ? (this.treeBounds.y - this.bounds.y) / z : st.file || st.folder !== null ? 80 : 40;
            const row = Math.max(0, Math.min(index * TREE_ROW - (this.scrollTop?.[id] ?? 0), (this.listHeight?.[id] ?? 600) - TREE_ROW));
            this.menu = { path, context: this.context(), x: x + 16, y: top + row + TREE_ROW, at: -1 };
            this.handle.focus(); cx.stop_propagation(); cx.notify();
          }
          return;
        }
        const at = st.focus ? rows.findIndex((r) => r.path === st.focus) : rows.findIndex((r) => r.path === st.file);
        const mods = /** @type {any} */ (e.modifiers ?? {}), add = mods.platform || mods.control;
        if (add && e.key === "a") {
          this.select(st, new Set(rows.map(r => r.path)));
          const last = rows.at(-1); if (last && !last.dir) this.open(st, last.path, cx);
          cx.stop_propagation(); cx.notify(); return;
        }
        if (add && e.key === "space" && rows[at]) { this.chooseRow(st, rows[at], mods, cx); cx.stop_propagation(); return; }
        const k = treeKey(e.key, rows, at);
        if (!k) return;
        if (k.at !== undefined) { if (mods.shift) this.chooseRow(st, rows[k.at], mods, cx); else st.focus = rows[k.at].path; revealRow(this, `t3-files-tree-${st.id}`, st.focus); }
        else { st.focus = (k.toggle ?? k.pick).path; if (k.pick) this.chooseRow(st, k.pick, {}, cx); else act(k.toggle, cx); }
        cx.stop_propagation();
        cx.notify();
      })
      .child(v_flex().size_full().min_h(0)
        .when(Boolean(st.errors.size), el => el.child(errors()))
        .when(Boolean(st.query.trim() && !st.searching && (st.more || st.total > st.results?.length)), el => el.child(div().px(12).py(4).text_size(12).text_color(t.dim).child("More matches available. Refine your search.")))
        .child(div().flex_1().min_h(0).pl(14.4).pr(8.4).child(treeList(this, `t3-files-tree-${st.id}`, rows, draw).size_full())))));
  }

}
