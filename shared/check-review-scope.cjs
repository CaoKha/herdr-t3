// node shared/check-review-scope.cjs: the scope menu's reads, rows and picks, as the Review page and Details share them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(env) {
  const seen = new Set();
  const source = name => {
    if (seen.has(name)) return '';
    seen.add(name);
    const src = fs.readFileSync(path.join(__dirname, name), 'utf8');
    if (name === 'button.js') return '';
    const needs = [...src.matchAll(/^import [^;]*? from "\.\/(.+?)";/gm)].map(m => source(m[1])).join('\n');
    return needs + '\n' + src.replace(/^import [^;]*;\r?\n/gm, '').replace(/^export /gm, '');
  };
  const context = vm.createContext(env);
  vm.runInContext(source('review-scope.js') + '\nglobalThis.api = {openScope,releaseScope,scopeRows,scopeList,pickScopeRow,pickListed,pickBase,scopeKey,openScopePage,scopeMenu};', context);
  return context.api;
}
const state = new Map(), reads = [], pending = [];
const cx = { notify() {}, stop_propagation() {}, spawn(fn) { return fn(cx); }, timer: { after() { return { cancel() {} }; } } };
let blocked = false;
const exec = async (_cmd, args, opts) => {
  reads.push([opts.cwd, args]);
  if (blocked && args.includes('--show-toplevel')) return new Promise(resolve => pending.push(resolve));
  if (args.includes('--show-toplevel')) return {code:0,stdout:opts.cwd+'\n'};
  if (args.includes('status')) return {code:0,stdout:'# branch.head fix\n# branch.upstream origin/fix\n# branch.ab +2 -0\n'};
  if (args.includes('symbolic-ref')) return {code:0,stdout:'origin/main\n'};
  if (args.includes('--left-right')) return {code:0,stdout:'0\t3\n'};
  if (args.includes('log')) return {code:0,stdout:'abc123\x1ffix: scope\x1f1\x1fA\n'};
  if (args.includes('refs/remotes')) return {code:0,stdout:'refs/heads/main\nrefs/remotes/origin/main\n'};
  return {code:0,stdout:''};
};
const input = () => ({text:'',value(){return this.text;},set_value(v){this.text=v;},focus(){}});
const picked = [];
const view = (root='/repo', page='/branch/fix') => ({root,space:'s',page,width:736,height:500,popup:'scope',handle:{focus(){}},scopeSearch:input(),refSearch:input(),
  closePopup(){this.popup=null; api.releaseScope(this);},
  pick(page,opts){picked.push({page,...opts});},
  openCommits(cx,lit){api.openScopePage(this,'commits',cx,lit);}});
function element() {
  const el = new Proxy({}, {get(_target,key) {
    if (key === 'when') return (test,fn) => {if(test) fn(el); return el;};
    return () => el;
  }});
  return el;
}
const api = load({exec,shared:k=>state.get(k),setShared:(k,v)=>state.set(k,v),settings:()=>({zoom:1}),
  div:element,h_flex:element,v_flex:element,svg:element,Input:{new:element},drawButton:element,ghostButton:element,DISABLED:0.64});
const flush = async () => { for(let i=0;i<50;i++) await Promise.resolve(); };

(async () => {
  // Each opening reads afresh: a commit made since the last opening shows in the counts.
  const v = view();
  api.openScope(v,cx); await flush();
  const first = reads.length;
  api.openScope(v,cx); await flush();
  assert.ok(reads.length > first, 'reopening reads again');
  assert.equal(v.scopeAt, -1, 'nothing lit on opening');

  // A read for a menu since closed, or for another base, never lands.
  blocked = true;
  const closed = view('/closed'); api.openScope(closed,cx); await flush();
  closed.closePopup();
  const moved = view('/moved'); api.openScope(moved,cx); await flush();
  state.set('review.bases',{s:'origin/dev'});
  blocked = false;
  pending.splice(0).forEach((resolve,i)=>resolve({code:0,stdout:['/closed','/moved'][i]+'\n'})); await flush();
  assert.equal(closed.scopeGit, undefined, 'closed: dropped');
  assert.equal(moved.scopeGit, undefined, 'base changed meanwhile: dropped');
  state.delete('review.bases');

  // Rows: each count a number and its unit; only the range shown checked; an empty range greyed unless it's the one shown.
  const rows = api.scopeRows(v);
  assert.deepEqual([...rows.map(r => r.detail)], ['3 commits','0 files','2 commits','0 commits',undefined]);
  assert.deepEqual([...rows.map(r => Boolean(r.on))], [true,false,false,false,false]);
  const shownEmpty = view('/repo','/worktree'); api.openScope(shownEmpty,cx); await flush();
  const uncommitted = api.scopeRows(shownEmpty).find(r => r.id === 'scope-uncommitted');
  assert.ok(uncommitted.on && !uncommitted.count, 'the range shown at nothing');
  api.pickScopeRow(shownEmpty, uncommitted, cx);
  assert.equal(picked.pop().page, '/worktree', 'the range shown stays pickable at nothing');
  api.pickScopeRow(v, api.scopeRows(v).find(r => r.id === 'scope-uncommitted'), cx);
  assert.equal(picked.length, 0, 'another empty range picks nothing');
  const none = view('/repo', null); api.openScope(none,cx); await flush();
  assert.ok(api.scopeRows(none).every(r => !r.on), 'no review shown yet: nothing checked');

  // A radio asks for its range, analyzed; Commits opens where the view puts it; a commit keeps its branch's Changes as base.
  api.pickScopeRow(v, rows[0], cx);
  assert.deepEqual(JSON.parse(JSON.stringify(picked.pop())), {page:'/branch/fix',analyze:true});
  api.pickScopeRow(v, rows.at(-1), cx, 0);
  assert.ok(v.scopePage === 'commits' && v.scopeListAt === 0);
  api.pickListed(v, api.scopeList(v)[0], cx);
  assert.deepEqual(JSON.parse(JSON.stringify(picked.pop())), {page:'/commit/abc123',base:'/branch/fix'});
  // A base picked: the space keeps it, Changes against it; the switch's pick stays open.
  api.pickBase(v, 'origin/dev', cx, true);
  assert.equal(state.get('review.bases').s, 'origin/dev');
  assert.deepEqual(JSON.parse(JSON.stringify(picked.pop())), {page:'/compare/origin/dev...fix',stays:true});

  // Keys: ↓ from nothing lights the first row; → on Commits opens it; Escape goes back, Commits lit.
  const k = view(); k.popup = 'scope'; api.openScope(k,cx); await flush();
  api.scopeKey(k,{key:'down'},cx); assert.equal(k.scopeAt,0);
  k.scopeAt = api.scopeRows(k).length - 1;
  api.scopeKey(k,{key:'right'},cx); assert.equal(k.scopePage,'commits');
  api.scopeKey(k,{keystroke:'escape'},cx); assert.ok(k.scopePage === null && k.scopeAt === api.scopeRows(k).length - 1);
  k.popup = 'settings'; assert.equal(api.scopeKey(k,{key:'down'},cx), false);
  console.log('ok: scope reads afresh and drops late reads; rows count in units, check only the range shown; picks go through the view');
})().catch(error => { console.error(error); process.exit(1); });
