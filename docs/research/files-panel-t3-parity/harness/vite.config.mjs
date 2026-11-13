import { pathToFileURL } from 'node:url';
const t3 = '/Users/jinjiebewater/my/tools/t3code';
const { default: tailwind } = await import(pathToFileURL(t3 + '/apps/web/node_modules/@tailwindcss/vite/dist/index.mjs'));
const stubs = new Set(['~/hooks/useTheme', '~/composerHandleContext', '~/hooks/useWorkspaceMutationRefresh', '~/fileContextMenu', '~/localApi', '~/state/queries', '~/lib/utils', '~/components/ui/toast', '~/hooks/useCopyToClipboard', '~/lib/windowControlsOverlay', '@t3tools/client-runtime/state/runtime', '~/components/DiffWorkerPoolProvider', '~/hooks/useSettings', '~/lib/syntaxHighlighting']);
export default {
  root: '/private/tmp/t3-files-reference',
  plugins: [{ name: 'isolated-file-fixtures', enforce: 'pre', resolveId(id, importer) {
    if (stubs.has(id) || importer?.endsWith('/files/FileBrowserPanel.tsx') && id === './useDirectoryEntries' || importer?.endsWith('/files/FileBreadcrumbs.tsx') && id === './projectFilesQueryState') return '/private/tmp/t3-files-reference/fixture.tsx';
  } }, tailwind()],
  cacheDir: '/private/tmp/t3-files-reference/.vite-cache',
  optimizeDeps: { entries: ['main.tsx'], include: ['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','@pierre/trees','@pierre/trees/react'] },
  resolve: { alias: [...Array.from(stubs, find => ({find,replacement:'/private/tmp/t3-files-reference/fixture.tsx'})), {find:'~',replacement:t3+'/apps/web/src'}, {find:'react',replacement:t3+'/apps/web/node_modules/react'}, {find:'react-dom',replacement:t3+'/apps/web/node_modules/react-dom'}], dedupe: ['react','react-dom'] },
  server: { host: '127.0.0.1', port: 7463, strictPort: true, fs: { allow: ['/private/tmp/t3-files-reference', t3] } },
  esbuild: { jsx: 'automatic' },
};
