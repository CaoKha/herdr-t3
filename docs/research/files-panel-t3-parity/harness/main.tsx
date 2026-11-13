import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import Browser from '/Users/jinjiebewater/my/tools/t3code/apps/web/src/components/files/FileBrowserPanel.tsx';
import {FileBreadcrumbs} from '/Users/jinjiebewater/my/tools/t3code/apps/web/src/components/files/FileBreadcrumbs.tsx';
import {FileSurfaceAction, FILE_SURFACE_SUBHEADER_CLASS} from '/Users/jinjiebewater/my/tools/t3code/apps/web/src/components/files/fileSurfaceChrome.tsx';
import {TooltipProvider} from '/Users/jinjiebewater/my/tools/t3code/apps/web/src/components/ui/tooltip.tsx';
import {Button} from '/Users/jinjiebewater/my/tools/t3code/apps/web/src/components/ui/button.tsx';
import {FolderTree, Code2, Eye, WrapText, ChevronDown, ExternalLink} from '/Users/jinjiebewater/my/tools/t3code/apps/web/node_modules/lucide-react';
import {ensurePierreIconSprite} from '/Users/jinjiebewater/my/tools/t3code/apps/web/src/pierre-icons.ts';
import {scene} from './fixture';
import Source from '/Users/jinjiebewater/my/tools/t3code/apps/web/src/components/files/ReadOnlySourcePreview.tsx';
import './style.css';
ensurePierreIconSprite();
function App() {
  const file = ['file','code','preview','nav-closed','long'].includes(scene);
  const [selected,setSelected] = useState<string|null>(file ? scene === 'long' ? 'packages/client/src/components/deeply-nested/an-intentionally-long-file-name-for-truncation-behaviour.test.ts' : 'README.md' : null);
  const [path,setPath] = useState(selected ?? '');
  const [rendered,setRendered] = useState(scene !== 'code'), [wrap,setWrap] = useState(true), [nav,setNav] = useState(scene !== 'nav-closed');
  return <TooltipProvider><div className="source-label">T3 Code 09a54f01 · original Files components · isolated fixture</div>
    <div data-preview-panel-mode="inline" className="surface bg-background text-foreground">
      {file ? <div className={FILE_SURFACE_SUBHEADER_CLASS}>
        <div className="min-w-0 flex-1 overflow-x-auto"><FileBreadcrumbs cwd="/fixture" environmentId={'fixture' as any} projectName="files-parity" relativePath={path} trail={selected ?? ''} onNavigateFolder={setPath} onOpenFile={p=>{setSelected(p);setPath(p)}} workspaceMutationId={null}/></div>
        <div className="flex shrink-0 items-center gap-0"><Button variant="outline" size="icon-xs" aria-label="Open in"><ExternalLink className="size-3.5"/></Button><Button variant="outline" size="icon-xs" aria-label="Choose editor"><ChevronDown className="size-4"/></Button></div>
        <FileSurfaceAction label={rendered?'Show code':'Show preview'} pressed={rendered} onPress={()=>setRendered(!rendered)}>{rendered?<Code2 className="size-3.5"/>:<Eye className="size-3.5"/>}</FileSurfaceAction>
        {!rendered?<FileSurfaceAction label={wrap?'Disable word wrap':'Enable word wrap'} pressed={wrap} onPress={()=>setWrap(!wrap)}><WrapText className="size-3.5"/></FileSurfaceAction>:null}
        <FileSurfaceAction label={nav?'Hide file explorer':'Show file explorer'} pressed={nav} onPress={()=>setNav(!nav)}><FolderTree className="size-3.5"/></FileSurfaceAction>
      </div>:null}
      <div className="flex min-h-0 flex-1">
        {file?<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{!rendered?<Source name="marks3.txt" text={'first line\nsecond line\nthird line\n'} wordWrap={wrap}/>:<div className="p-6 text-sm"><h1 className="text-xl font-bold">Files parity</h1><p className="mt-4">Read-only Markdown preview fixture.</p></div>}</div>:null}
        {(!file||nav)?<div className="flex min-h-0 flex-col" style={{width:file?256:'100%',borderLeft:file?'1px solid var(--border)':'none'}}><Browser environmentId={'fixture' as any} cwd="/fixture" projectName="files-parity" selectedPath={selected} selectedPathRevealId={1} onOpenFile={p=>{setSelected(p);setPath(p)}} workspaceMutationId={null}/></div>:null}
      </div>
    </div>
  </TooltipProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
