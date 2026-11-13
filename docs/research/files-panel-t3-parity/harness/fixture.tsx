import { useCallback, useMemo, useState } from 'react';
import fixture from './paths.json';
import { cx } from 'class-variance-authority';
import { extendTailwindMerge } from 'tailwind-merge';
const merge = extendTailwindMerge({extend:{theme:{text:['2xs','3xs','4xs','5xs']},classGroups:{'bg-image':[{'bg':['composer-seam-below','composer-seam-above']}]}}});
export const cn = (...args: any[]) => merge(cx(args));
export const useNativeTitlebarHeight = () => 0;
export const toastManager = { add: () => {} };
export const writeTextToClipboard = async () => {};
export const settlePromise = async (f: () => any) => { try { return { _tag:'Success', value: await f() }; } catch (error) { return {_tag:'Failure',error}; } };
export const DiffWorkerPoolProvider = ({children}:any) => children;
export const useClientSettings = (select:any) => select({wordWrap:true});
export const useRenderedAppearance = () => 'dark';
export const PREFERRED_HIGHLIGHTER = 'highlights';
export const scene = new URLSearchParams(location.search).get('state') ?? 'default';
const parent = (path: string) => path.includes('/') ? path.slice(0,path.lastIndexOf('/')) : '';
const all = fixture as Array<{path:string,kind:'file'|'directory',ignored?:boolean}>;
export const useTheme = () => ({ resolvedTheme: 'dark' });
export const useComposerHandleContext = () => null;
export const useWorkspaceMutationRefresh = () => {};
export const useFileContextMenu = () => ({ buildItems: () => [], activate: async () => {} });
export const readLocalApi = () => null;
export function useDirectoryEntries() {
  const [loaded,setLoaded] = useState(new Set(['']));
  const load = useCallback(async (path: string) => { setLoaded(old => old.has(path) ? old : new Set(old).add(path)); },[]);
  return { entries: scene === 'empty' || scene === 'loading' || scene === 'error' ? [] : all.filter(e => loaded.has(parent(e.path))),
    ready: scene !== 'loading', error: scene === 'error' ? "This folder can't be listed." : null,
    isPending: scene === 'loading', loadingDirectories: new Set<string>(), load, refresh: () => {} };
}
export function useProjectPathSearch({query}: {query:string}) {
  return useMemo(() => ({ entries: query.trim() ? all.filter(e => e.kind === 'file' && !e.ignored && query.toLowerCase().split(/\s+/).every(w=>e.path.toLowerCase().includes(w))) : [],
    isPending: false, error: null, truncated: false }),[query]);
}
export function useProjectEntriesQuery(_env: unknown,_cwd:string,dir:string) {
  return { data: { entries: all.filter(e=>parent(e.path)===dir), truncated:false }, isPending:false, error:null, refresh:()=>{} };
}
