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
  vm.runInContext(source('review-scope.js') + '\nglobalThis.api = {openScope,releaseScope,scopeRows,scopeList,pickScopeRow,pickListed,pickBase,baseList,scopeKey,scopeHeader,scopeMenu,scopeSub,baseMenu};', context);
  return context.api;
}
const state = new Map(), reads = [], pending = [], jobs = [], tops = new Map();
const cx = { notify() {}, stop_propagation() {}, spawn(fn) { const p = fn(cx); jobs.push(p); return p; } };
let blocked = false, now = 10000;
const exec = async (_cmd, args, opts) => {
  reads.push([opts.cwd, args]);
  if (blocked && args.includes('--show-toplevel')) return new Promise(resolve => pending.push(resolve));
  if (args.includes('--show-toplevel')) return {code:0,stdout:(tops.get(opts.cwd) ?? opts.cwd)+'\n'};
  if (args.includes('status')) return {code:0,stdout:'# branch.head fix\n# branch.upstream origin/fix\n# branch.ab +2 -1\n'};
  if (args.includes('symbolic-ref')) return {code:0,stdout:'origin/main\n'};
  if (args.includes('--left-right')) return {code:0,stdout:'0\t2\n'};
  if (args.includes('log')) return {code:0,stdout:'abc123\x1ffix: scope\x1f1\x1fA\n'};
  if (args.includes('refs/remotes')) return {code:0,stdout:'refs/heads/main\nrefs/remotes/origin/main\nrefs/remotes/origin/dev\n'};
  return {code:0,stdout:''};
};
const input = () => ({text:'',value(){return this.text;},set_value(v){this.text=v;},focus(){}});
const view = (root='/repo') => ({root,space:'s',page:'/branch/fix',handled:0,width:736,height:500,popup:'scope',handle:{focus(){}},scopeSearch:input(),refSearch:input(),closePopup(){this.popup=null; api.releaseScope(this);}});
const icons = [], elements = new Map();
function element() {
  const values = {};
  const el = new Proxy({}, {get(_target,key) {
    if (key === 'when') return (test,fn) => {if(test) fn(el); return el;};
    if (key === 'id') return id => {elements.set(id,values); return el;};
    return (...args) => {values[key]=args[0]; return el;};
  }});
  return el;
}
const api = load({exec,shared:k=>state.get(k),setShared:(k,v)=>state.set(k,v),settings:()=>({zoom:1}),
  div:element,h_flex:element,v_flex:element,svg:p=>{icons.push(p);return element();},Input:{new:element},drawButton:element,
  Date:class extends Date {static now(){return now;}}});
const flush = async () => { for(let i=0;i<50;i++) await Promise.resolve(); };

(async () => {
  // Capacity limits completed snapshots, never delivery to still-live owners or their followers.
  blocked=true;
  const parallelRoots=['/capacity-one','/capacity-two','/capacity-three','/capacity-four'];
  const parallel=parallelRoots.map(root=>view(root)), firstFollower=view(parallelRoots[0]);
  api.openScope(parallel[0],cx); api.openScope(firstFollower,cx);
  parallel.slice(1).forEach(v=>api.openScope(v,cx)); await flush();
  assert.equal(pending.length,4,'four sources read once each, including the shared first source');
  blocked=false;
  pending.splice(0).forEach((resolve,i)=>resolve({code:0,stdout:parallelRoots[i]+'\n'})); await flush();
  for(const v of [...parallel,firstFollower]) {
    assert.equal(api.scopeRows(v)[0].count,2,`${v.root}: still-live menu receives counts`);
    assert.equal(api.scopeList(v)[0]?.commit.sha,'abc123',`${v.root}: commits stop Reading`);
  }
  // Closing the native owner can strand its await forever. A follower must restart without it.
  blocked=true;
  const owner=view(), follower=view();
  api.openScope(owner,cx); api.openScope(follower,cx); await flush();
  assert.equal(pending.length,1,'same source has one read');
  api.releaseScope(owner); blocked=false; await flush();
  assert.equal(api.scopeRows(follower)[0].count,2,'follower recovers after dead owner closes');
  pending.shift()({code:0,stdout:'/old\n'}); await flush();
  assert.equal(owner.scopeGit,undefined,'closed owner never gets its late result');
  const before=reads.length, warm=view(); api.openScope(warm,cx); await flush();
  assert.equal(reads.length,before,'warm open reuses complete snapshot');
  assert.equal(api.scopeList(warm)[0].commit.sha,'abc123');
  tops.set('/repo/sub','/repo');
  const nested=view('/repo/sub'); api.openScope(nested,cx); await flush();
  assert.equal(api.scopeRows(nested)[0].count,2,'a space folder inside a repository still shows its scopes');
  // Closing only a follower does not cancel the live owner or deliver data to the closed follower.
  blocked=true;
  const liveOwner=view('/follower-close'), closedFollower=view('/follower-close');
  api.openScope(liveOwner,cx); api.openScope(closedFollower,cx); await flush();
  api.releaseScope(closedFollower); blocked=false;
  pending.shift()({code:0,stdout:'/follower-close\n'}); await flush();
  assert.equal(api.scopeRows(liveOwner)[0].count,2);
  assert.equal(closedFollower.scopeGit,undefined);
  blocked=true;
  for(let i=0;i<25;i++) {
    const transient=view('/quick-close'); api.openScope(transient,cx); await flush(); api.releaseScope(transient);
  }
  blocked=false;
  const reopened=view('/quick-close'); api.openScope(reopened,cx); await flush();
  assert.equal(api.scopeRows(reopened)[0].count,2,'rapid closing never leaves a dead pending owner');
  pending.splice(0).forEach(resolve=>resolve({code:0,stdout:'/stale\n'})); await flush();
  assert.equal(reopened.scopeGit.root,'/quick-close','all late owners leave the new snapshot alone');
  // Every captured source dimension rejects a late result. It cannot warm a later open either.
  for (const change of [v=>{v.root='/different';},v=>{v.page='/worktree';},v=>{v.space='other';},v=>{v.evicted=true;},()=>state.set('review.bases',{s:'origin/dev'})]) {
    state.delete('review.bases'); blocked=true;
    const old=view('/late-'+reads.length); api.openScope(old,cx); await flush();
    change(old); blocked=false; pending.shift()({code:0,stdout:old.root+'\n'}); await flush();
    assert.equal(old.scopeGit,undefined,'changed source never receives late data');
    api.releaseScope(old);
  }
  state.delete('review.bases');
  // A warmed snapshot expires at five seconds, and only the newest three sources remain warm.
  const expiry=view('/expiry'); api.openScope(expiry,cx); await flush();
  now+=5000;
  const expiredReads=reads.length; api.openScope(view('/expiry'),cx); await flush();
  assert.ok(reads.length>expiredReads,'expired snapshots read afresh');
  for(const root of ['/keep-1','/keep-2','/keep-3','/keep-4']) {api.openScope(view(root),cx);await flush();}
  const evictedReads=reads.length; api.openScope(view('/keep-1'),cx); await flush();
  assert.ok(reads.length>evictedReads,'fourth source evicts the oldest snapshot');
  const selected=[], adapter=view('/adapter'); adapter.selectReview=(page,options)=>selected.push({page,...options});
  api.openScope(adapter,cx); await flush();
  api.pickScopeRow(adapter,api.scopeRows(adapter)[0],cx);
  assert.deepEqual(JSON.parse(JSON.stringify(selected.pop())),{page:'/branch/fix',analyze:true,stays:false});
  api.pickListed(adapter,api.scopeList(adapter)[0],cx);
  assert.deepEqual(JSON.parse(JSON.stringify(selected.pop())),{page:'/commit/abc123',analyze:false,base:'/branch/fix',stays:false});
  api.pickBase(adapter,'origin/dev',cx,true);
  assert.equal(state.get('review.bases').s,'origin/dev');
  assert.deepEqual(JSON.parse(JSON.stringify(selected.pop())),{page:'/compare/origin/dev...fix',analyze:false,stays:true});
  assert.equal(adapter.popup,'scope','adapter alone controls its popup lifetime');
  state.delete('review.bases');
  api.openScope(adapter,cx); await flush();
  adapter.scopeAt=4;
  assert.equal(api.scopeKey(adapter,{key:'right'},cx),true);
  assert.equal(adapter.scopePage,'commits');
  api.scopeKey(adapter,{key:'down'},cx); assert.equal(adapter.scopeListAt,0);
  api.scopeKey(adapter,{keystroke:'escape'},cx); assert.equal(adapter.scopePage,null);
  adapter.popup='base'; assert.equal(api.scopeKey(adapter,{key:'down'},cx),true);
  adapter.popup='settings'; assert.equal(api.scopeKey(adapter,{key:'down'},cx),false);
  // Actions draws exactly the shared UI, but every icon belongs to Actions and commits open leftward.
  adapter.scopeMod='t3-actions'; adapter.scopeOrigin={x:408,y:40}; adapter.popup='scope'; adapter.scopePage='commits';
  const t={foreground:'#eeeeee',dim:'#aaaaaa',border:'#333333',accent:'#123456',selected:'#444444'};
  api.scopeHeader(adapter,t); api.scopeMenu(adapter,t); api.scopeSub(adapter,t); api.baseMenu(adapter,t);
  assert.ok(icons.length && icons.every(p=>p.startsWith('mods/t3-actions/icons/')),'no cross-mod icon paths');
  assert.ok(elements.get('review-sub-at').left<adapter.scopeOrigin.x,'right-anchored commits open to the left');
  assert.equal(elements.get('review-scope-menu').w,320);
  assert.equal(elements.get('review-base-menu').w,288);
  adapter.scopeOrigin={x:472,y:0}; adapter.scopeMenuWidth=264;
  api.scopeSub(adapter,t); const rowTop=elements.get('review-sub-at').top;
  adapter.scopeInMenu=true;
  api.scopeMenu(adapter,t); api.scopeSub(adapter,t);
  assert.equal(elements.get('review-scope-menu').w,264,'Details uses the Quick Review row width');
  assert.equal(elements.get('review-sub-at').top,rowTop+28,'the Commits submenu stays aligned with its row after inline base controls');
  const topCalls=reads.filter(([,args])=>args.includes('--show-toplevel')).length;
  const otherBase=view('/adapter'); state.set('review.bases',{s:'origin/dev'}); api.openScope(otherBase,cx); await flush();
  assert.ok(reads.filter(([,args])=>args.includes('--show-toplevel')).length>topCalls,'chosen base has its own snapshot');
  await Promise.all(jobs);
  console.log('ok: shared Review scope cache/TTL/bounds, owner/follower close, late-source invalidation, selection hook/base/commits, keys and own-mod icons/geometry');
})().catch(e=>{console.error(e);process.exitCode=1;});
