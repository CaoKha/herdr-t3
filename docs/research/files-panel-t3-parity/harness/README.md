# 本机可复现的验收fixture

这些是验证记录，不是产品或上游改动。原T3代码保持`09a54f01`；绝对路径记录本机依赖来源，不打包node_modules。

## T3参考图

`main.tsx`直接import原`FileBrowserPanel`、`FileBreadcrumbs`、`FileSurfaceAction`和`ReadOnlySourcePreview`。`fixture.tsx`只stub backend/host hooks；Markdown Preview正文是简短fixture，不是完整ChatMarkdown，不用它证明Markdown渲染等价。`style.css`引入原index.css和Tailwind。配置root为`/private/tmp/t3-files-reference`，把这里的文件放回该目录，并链接T3的web node_modules即可启动本机Vite7463。

先用`python3 fixture.py /private/tmp/<fixture-project>`造目录，再把相对路径、file/directory、`.cache` ignored标记写成`paths.json`，供fixture hooks读取。`capture.mjs`记录全部状态和computed facts，截图留在上级目录（git忽略PNG）。它把原闭合shadow root改为open仅供选择器读取，不改变布局；鼠标事件仅发往headless Chromium。

## Herdr原生图与性能

按仓库`scripts/demo/stage.sh`工作流建立独立`DEMO=/private/tmp/files-parity`；离线时只把demo副本的repos.sh换成fixture.py创建本地项目，不改产品脚本。将产品Files main复制为demo的`files-view.js`，命令循环增加`else if (what === "perf") this.probe(st, arg, cx)`，再以`native-probe.js`作demo main。其`shown`覆盖仅允许独立窗口在后台读fixture，不拉用户桌面焦点。

`t3-files.perf:race/reset/expand/scroll/collapse/search/clear/file`记录app.log中的`[files-perf]` JSON。`scene=default/expanded/focus/search-results/search-no-results/code/preview/long/nav-closed/crumb/targets/menu/loading/empty/error`建立截图状态。loading/empty/error为显式注入的边界数据；focus直接置事件状态以在失活窗口展示ring，不称作真实鼠标焦点验收。

`native-small/native-large/html-small/html-large`只用于源码候选对比：先在`.agents/project-01/`建立10k/40k行、每行22字节的probe-small.txt/probe-large.txt。**HTML large已卡住原生paint，不要在有用的窗口重跑**。原型无语法色/行号/虚拟化，用户已拒绝替换原生Editor；保留代码只为解释失败证据。
