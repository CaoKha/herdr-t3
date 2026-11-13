import Base from "./files-view.js";
import { div } from "gpui-kit";
import { panelState } from "./panel.js";
import { showPage } from "./panel.js";
import { TextView } from "gpui-base";
import { theme, setShared } from "herdr";
import { wrapLines } from "./store.js";

export default class MeasuredFiles extends Base {
  shown() { const p = panelState(); return p.open && p.page === 'files'; }
  poll(cx) { if (!this.freeze && (!this.perf || this.perf.done)) super.poll(cx); }
  allExpanded(st) { const start = Date.now(), result = super.allExpanded(st); if (this.perf) { this.perf.statsMs += Date.now() - start; this.perf.statsCalls++; } return result; }
  editor(view, rel) {
    const start = Date.now();
    if (this.alt) {
      view.wrap = wrapLines();
      const html = '<pre>' + view.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre>';
      view.code = { html, value:()=>view.text, release(){} };
    } else super.editor(view, rel);
    if (this.perf) { this.perf.editorMs = (this.perf.editorMs ?? 0) + Date.now()-start; this.perf.bytes = view.text.length; }
  }
  codeView(code) {
    if (!this.alt) return super.codeView(code);
    return div().size_full().overflow_y_scrollbar().child(TextView.html(`selection-probe-${this.perf?.id}`,code.html).selectable(true).scrollable(false).text_size(12));
  }
  async list(st, rel) {
    const p = this.perf, start = Date.now();
    try { return await super.list(st, rel); }
    finally { if (p) { p.listMs += Date.now() - start; p.listCalls++; } }
  }
  changed(st) { const start = Date.now(); super.changed(st); if (this.perf) this.perf.stateMs += Date.now() - start; }
  rows(st) {
    const rebuilt = !st.rows, start = Date.now(), rows = super.rows(st);
    if (this.perf) { this.perf.treeMs += Date.now() - start; this.perf.treeBuilds += Number(rebuilt); this.perf.rows = rows.length; }
    return rows;
  }
  render(cx) {
    const start = Date.now(), el = super.render(cx), end = Date.now(), p = this.perf;
    if (!p) return el;
    p.renderMs += end - start; p.frames++;
    return el.child(div().id(`perf-frame-${p.id}-${p.frames}`).absolute().left(0).bottom(0).size(1).on_size_change(() => {
      p.firstFrameMs ??= Date.now()-p.started;
      p.layoutTailMs += Date.now() - end; p.lastFrame = Date.now();
      if (p.done && !p.reported) { p.reported = true; console.log('[files-perf] ' + JSON.stringify({ ...p, wallMs: Date.now() - p.started })); }
    }));
  }
  probe(st, action, cx) {
    if (action.startsWith('scene=')) { this.scene(st, action.slice(6), cx); return; }
    this.freeze = false;
    if (action === 'reset') { this.perf = null; this.drop(st); st.expanded.clear(); st.expandAll = false; st.query = ''; st.results = null; this.search.set_value(''); this.changed(st); this.recheck(st, cx); cx.notify(); return; }
    if (action === 'fold') { this.foldAll(st, cx); return; }
    st.refreshed = Date.now();
    const p = this.perf = { id: Date.now(), action, started: Date.now(), listMs: 0, listCalls: 0, stateMs: 0, treeMs: 0, treeBuilds: 0, statsMs: 0, statsCalls: 0, renderMs: 0, frames: 0, layoutTailMs: 0, rows: 0 };
    if (/^(native|html)-(small|large)$/.test(action)) {
      this.alt = action.startsWith('html'); this.navOpen = false;
      for (const kept of st.previews.values()) this.releasePreview(kept.view);
      st.previews.clear(); st.view = null;
      this.pick(st, `.agents/project-01/${action.endsWith('small')?'probe-small':'probe-large'}.txt`, cx);
    }
    if (action === 'expand' || action === 'race' || action === 'collapse') this.foldAll(st, cx);
    else if (action === 'search') { this.search.set_value('file-2'); this.find(st, 'file-2', cx); }
    else if (action === 'clear') { this.search.set_value(''); this.find(st, '', cx); }
    else if (action === 'file') this.pick(st, '.agents/project-01/file-01.ts', cx);
    else if (action === 'scroll') { const id = `t3-files-tree-${st.id}`; this.scrollTop = { ...this.scrollTop, [id]: (this.scrollTop?.[id] ?? 0) + 6000 }; cx.notify(); }
    let last = -1, same = 0, collapsed = false;
    const timer = cx.timer.every(25, cx => {
      if (this.perf !== p) { timer.cancel(); return; }
      if (action === 'race' && !collapsed && st.expanded.size >= 2) {
        p.beforeCollapseMs = Date.now() - p.started; p.expandedAtCollapse = st.expanded.size;
        this.foldAll(st, cx); collapsed = true;
      }
      const size = st.expanded.size;
      same = size === last ? same + 1 : 0; last = size;
      const pending = st.loading.size > 0 || st.searching || st.view?.loading;
      if ((action !== 'race' || collapsed) && !pending && same >= 3 || Date.now() - p.started > 30000) {
        timer.cancel(); p.done = true; p.finalExpanded = size; p.settledMs = Date.now() - p.started; cx.notify();
      }
    });
  }
  scene(st, name, cx) {
    this.perf = null; this.alt = false; this.freeze = true; this.menu = null;
    const generic = ['default','expanded','focus','loading','empty','error','search-results','search-no-results'].includes(name);
    if (generic) { showPage('files'); this.sync(cx); }
    cx.timer.after(10, cx => {
      if (name === 'default' || name === 'focus') { st.expanded.clear(); st.expandAll=false; this.changed(st); }
      if (name === 'expanded' && !this.allExpanded(st)) this.foldAll(st,cx);
      if (name === 'focus') { this.search.focus(); this.searchFocused = true; }
      if (name === 'search-results' || name === 'search-no-results') { const q = name === 'search-results' ? '.agents file-01' : '__missing__'; this.search.set_value(q); this.find(st,q,cx); }
      if (name === 'loading') { st.entries = new Map(); st.errors.clear(); this.changed(st); }
      if (name === 'empty') { st.entries = new Map([['',[]]]); st.errors.clear(); this.changed(st); }
      if (name === 'error') { st.entries = new Map(); st.errors.set('',"This folder can't be listed. Click to retry."); this.changed(st); }
      if (name === 'code' || name === 'preview') { this.navOpen=true; setShared('t3-files.markdown',name==='code'?'code':'preview'); this.pick(st,'README.md',cx); }
      if (name === 'long') { this.navOpen=true; this.pick(st,'packages/client/src/components/deeply-nested/an-intentionally-long-file-name-for-truncation-behaviour.test.ts',cx); }
      if (name === 'nav-closed') { this.navOpen=false; this.pick(st,'README.md',cx); }
      if (name === 'crumb') this.browse(st,'crumb','.agents',null,cx);
      if (name === 'targets') this.browse(st,'targets',st.file,null,cx);
      if (name === 'menu') { this.menu={path:st.file??'README.md',context:this.context(),x:Math.max(4,(this.size?.width??800)-228),y:90,at:-1};this.handle.focus(); }
      cx.notify();
    });
  }
}
