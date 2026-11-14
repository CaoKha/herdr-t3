# Files / T3 Code parity

基线：Herdr T3 `a9e2f769`；T3 Code `09a54f01bc0ae83865347a965ced50f8c8ec2953`，本机 `~/my/tools/t3code`。下表是**实施前**逐项审计，不是通过声明。T3 路径均相对 `apps/web/src/`；Pierre 为该快照安装的 `@pierre/trees@1.0.0-beta.6/dist/`。尺寸、间距、颜色和圆角的落地值只见 [token 表](../../internals/t3-tokens.md)。既有宿主实测见 [能力报告](../host-capability-verification.md)。

## 区域、控件和状态对照

| 区域 / 状态 | T3 行为与源码 | 我们的实施前行为 | 差异 / 处理 |
| --- | --- | --- | --- |
| 通用 Files / 未选文件 | 整宽树，无文件 subheader；`files/FilePreviewPanel.tsx:1261-1263,1540-1548` | 树上另有根名工具栏，再一行搜索 | 删除多余根名工具栏 |
| 文件打开 / 树开关 | 左预览、右树；文件行最后的 FolderTree 开关；无文件强制显示树；`FilePreviewPanel.tsx:1330-1342,1540` | 结构相同，但按钮为 xs，列头仍是 sheet 几何 | 用本布局 sm 控件；Files 使用 T3 inline subheader 几何 |
| 文件头 / 路径 | 可横滚面包屑，目录名可导航，分隔 chevron 可浏览目录，同级文件菜单；目录导航保留 trail；`files/FileBreadcrumbs.tsx:212-347` | `/` 纯分隔，根/目录只在树定位，没有目录菜单，长名挤占全行 | 改 chevron、截断、目录浏览菜单；保持本项目只读路径边界 |
| 路径默认 / hover / 聚焦 | muted 目录、foreground medium 当前文件；hover 背景和文字提亮；focus-visible 内环；`FileBreadcrumbs.tsx:47-79,212-347` | hover 有底，但不能键盘到达，当前文件不加粗，无全路径提示 | 补全可达性/状态；用户要求目录hover仅文字提亮、无底色，focus-visible内环保留；删除面包屑tooltip，不跟随T3的hover底/提示 |
| Preview / Code | **一个图标 toggle**；预览中图标 Code2，源码中图标 Eye；tooltip 描述下一动作；`FilePreviewPanel.tsx:1300-1319` | 两个常驻文字 pill，额外耗宽 | 改单图标切换，沿用既有 Markdown 偏好 |
| wrap 默认 / on / hover | 仅 raw text 显示，pressed=wrap，tooltip Enable/Disable word wrap；`FilePreviewPanel.tsx:1320-1329` | Editor 存在时显示，即 Markdown Preview 也可能出现；文字 Scroll/Wrap long lines | 只在真正源码视图显示 |
| Open in / Open with | 文件头 compact OpenInPicker；树菜单 Open、Reveal、Open with 编辑器；`FilePreviewPanel.tsx:1286-1299`、`hooks/useFileContextMenu.ts` | 文件头没有外部打开；树只有 Finder / Copy path / Insert | 复用本机 `open` 能力；远程不能打开本机编辑器 |
| 树头 | 刷新 xs + ghost Search files + 有目录才有全部展开/折叠；inline 36+下4；`files/FileBrowserPanel.tsx:487-524` | 搜索图标 + Input + 总显示折叠；没有刷新 | 加刷新，删搜索前多余图标，无目录不显示折叠 |
| 搜索输入 / Escape | 200ms 路径查询，256 字符上限；Escape 清空并 blur；`FileBrowserPanel.tsx:74-101,163-166` | 本机立刻查询、远程防抖；Escape 只清空 | 同步 debounce 和 Escape 焦点 |
| 搜索有结果 | **过滤树，保留目录结构**，hide-non-matches，不是 picker；`FileBrowserPanel.tsx:268-305`、`files/fileTreeEntries.ts` | fuzzy 平铺列表，名字+目录两列，鼠标移过就改变选中底 | 用同一棵树显示结果与祖先，hover 不修改选中 |
| 搜索无结果 / 截断 | No matching files；截断 More matches available. Refine your search.；`FileBrowserPanel.tsx:537-559` | 无结果文案相同，截断为数量 footer | 对齐状态位置与文案 |
| 搜索中 / 旧结果 | 有内容不加可见 loading，空时一行 Loading files…；`FileBrowserPanel.tsx:540-551` | 没有搜索中状态；异步错误当零命中 | 加 pending/error，不把失败伪装成空结果 |
| 树默认 | 初始折叠、目录优先自然序；`FileBrowserPanel.tsx:268-296`、Pierre model | 初始折叠、目录优先自然序 | 保留 |
| 文件夹图标 | **目录只有 chevron，没有彩色 folder 图标**；文件只有一个文件类型图标；Pierre `render/FileTreeView.js:362-397` | 每行固定 chevron 空槽，后面又放 file/folder 图标 | 删除重复图标槽，文件/目录同一 leading slot；Review 的已看框位置另保留 |
| 深层缩进 / guide | spacing 区，首层8+6.4+4.8=19.2，之后每层18.7；树 hover 显示 guides，聚焦祖先 guide 加深；Pierre `style.js` spacing / spacing-item | 每层27.2，没 guide，深层可读宽度过早耗尽 | 按 token 表修正 Files 树缩进与 guides |
| 树行默认 / hover | 24 高，字12；hover 前景7%底，不改变选择；Pierre `style.js` / `pierre-tree-theme.ts` | 24 / 12 / 7% 基本相同；文件图标槽多了一格 | 保留 token 底色，删除多余槽 |
| 选中 / 右键上下文 | selected 前景12%；右键行有 context-hover；焦点与选择独立；Pierre `render/FileTreeView.js:398-480` | 当前文件12%；右键不高亮目标 | 右键行按 hover 展示，不改当前文件 |
| 键盘聚焦 | Up/Down、Home/End、Right 展开/进入、Left 折叠/父级，Enter/Space 激活；focus ring；Pierre `FileTreeView.js:1100-1145` | 同方向键，只有 Enter，无 Space，点击文件清 focus | 补 Space 与焦点恢复；不把 hover 当选择 |
| 多选 | Shift / Cmd-click、Shift+方向键、Cmd+A、Cmd+Space；Pierre `rowClickPlan.js`、`FileTreeView.js:1114-1122` | 单选 | 需要保留独立树选择集合；最后选中文件打开，但方向键只移动焦点 |
| 展开 / 折叠 / 加载 | 点击目录 toggle；加载子目录有 loading decoration；expand-all 跳过 ignored；`FileBrowserPanel.tsx:129-132,289-295` | toggle、expand-all 跳过 ignored，有200目录上限；子目录加载无标记 | 保留安全上限，补目录加载提示 |
| 紧凑目录 | flattenEmptyDirectories；闭合时也能显示已知完整链；链内 segment hover 下划线；Pierre `formatFlattenedSegments` / model | 只有已展开链合并，折叠链再次裂开；整段只是一段文字 | 保留已读链折叠后紧凑，并可按 segment 定位 |
| 长名 | 单行截断，不挤掉图标；扩展名优先截断；`pierre-tree-theme.ts:11`、Pierre MiddleTruncate | 末尾截断，图标固定 | 宿主无中部截断组件，尽量保留扩展名；用户决定树行无tooltip，包括截断时 |
| 点文件 / 隐藏文件 | entries 中正常列出，ignored 仍可展开；无隐藏文件开关；`FileBrowserPanel.tsx`、目录 API | 包括 `.env` 等，只过滤 `.git` | 保留，测试固定边界 |
| Git 状态 | **Files 只标 ignored**；A/M/D/R 是 Diff 的行为；`FileBrowserPanel.tsx:351-363` | Files 有 A/M/D/R badge、deleted 幽灵文件、目录变化点 | 移除 Files 的 Diff 装饰与额外 git status 读取；Review 不变 |
| ignored | muted 名称，图标半透明，祖先 ignored 继承；Pierre `style.js` ignored | 名称和图标全部 opacity .5 | 用主题 dim 文字、仅图标半透明 |
| 树加载 / 空目录 | Loading files… 小字；空目录不画额外卡片；`FileBrowserPanel.tsx:540-563` | spinner 居中；空目录 This folder is empty | 改小字加载、空树留空 |
| 树错误 | 红字整行，Click to retry，树内显示；`FileBrowserPanel.tsx:528-535` | 全面板顶部共用 Retry bar | 改为树内可重试，不影响预览 |
| 文件加载 | 内容中央 spinner；`FilePreviewPanel.tsx:1486-1490` | spinner+Loading the file | spinner 可复用；不将树加载变成内容占位 |
| 文件缺失 / 读取失败 | alert 错误、尝试路径、根、locate 提示；`FilePreviewPanel.tsx:1458-1483` | failed 顶部 error bar，missing 图标空态，不统一路径上下文 | 在内容区保留路径/根和定位，避免丢标签 |
| 滚动 / reveal | 虚拟树；外部选文件清搜索、展开祖先、居中且 focus；tree 内选文件不清搜索；`FileBrowserPanel.tsx:411-478` | 虚拟树；外部选择清搜索/展开/滚到可见，内部点击通过 shared selected 又清搜索 | 区分内部选择和外部 reveal，内部选中不销毁搜索 |
| 树宽 / resize | 初始256，160..560，内容至少256；可聚焦 handle，←/→16、Home/End；`files/FileExplorerPane.tsx:8-108` | 指针 resize 有，键盘 handle 没有 | Files 补键盘 resize，不改变 Review 既有行为 |
| 右键 / Shift+F10 | 指针菜单；键盘锚到目标行；Open/Reveal/Open with/Copy mention/Add to chat；`FileBrowserPanel.tsx:178-249` | 指针菜单；键盘固定 y84；Copy path / Insert 已有宿主映射 | 保留安全 Copy path / Insert，补 Open/with；键盘按可见行锚定 |
| 拖到 composer | 自定义 MIME 拖拽，树内不能 drop；`files/fileTreeDragMention.ts` | 无 | Herdr 没有 composer 或 terminal drop 接口；最近替代为 Insert（不回车、保护剪贴板），本轮不实际执行剪贴板操作 |
| Preview 能力 | Markdown、表格、PDF、字体、音视频、office、HTML 等；大型文本/二进制渐进加载；`files/FilePreviewPanel.tsx` 及同目录 preview 组件 | Markdown、图片、≤1MB文本，readonly Editor | T3 浏览器渲染器不能直接运行于 GPUI；本轮聚焦既有文件查看器/树交互，不声称已实现这些格式 |
| 编辑 / 保存 | 支持可写连接、dirty state 和 save coordinator；`files/fileSaveCoordinator.ts` | 明确只读文件查看器 | 现有只读契约保持；不增加用户未要求的磁盘写入 |

## 变更触达范围

- `mods/t3-files/main.js`、`model.js`、`check-files.cjs`：绘制、命令、树与搜索的公开行为检查。
- `shared/file-tree.js`、`check-file-tree.cjs`：Files/Pierre 行形状与键盘；Review 的已看框、状态和调用保持原契约。
- `shared/nav-column.js`、`check-nav-column.cjs`：Files 使用 inline 头、键盘 resize；默认 Review 保留原规格。
- `shared/file-menu.js`、`check-file-menu.cjs`：本机 Open 与安全终端映射；不在验收中占用剪贴板。
- 单一 token 表、双语 RECIPE / README / changelog / guide；sync 的生成副本和关联 Review 仓库独立提交。

## 验收记录

实施完成；上表保留实施前审计。结果分为已实现、用户指定差异和宿主缺口，不将三者混作“完全像素等价”。

### 已实现

- 通用Files移除额外根工具栏；文件inline头、透明面包屑行、目录surface/trail及chevron浏览、单图标Preview/Code、Open in/with，外部目标与Details共用。Search改为同一棵层级树，点击结果不清搜索，取消旧平铺picker输入submit行为；错误不伪装无匹配。
- 每行只保留目录chevron或原Pierre文件图形；主题供色，Files只标ignored，移除Diff徽章/删除幽灵与额外status扫描。紧凑目录、深度、guides、独立hover/选择/焦点、多选/范围、Space及键盘resize已覆盖。
- Collapse取消异步展开，连单目录紧凑链的迟到读取也不能重开。4,497项原生场景先复现163目录重开，再确认0；[性能报告](performance.md)列出展开、滚动、搜索、折叠、切文件的同fixture前后值。
- 内容wrapper阻断根mousedown抢焦点；保留readonly Editor和Markdown原生选择。候选HTML大文件paint失败，用户明确保留Editor，见[源码选择/gutter报告](source-selection-and-gutter.md)。

### 原T3组件证据

`harness/`保存可复现fixture与capture。截图来自原`09a54f01`组件，不是手绘复刻，也不是完整T3应用：backend/host hooks stub；Preview正文是fixture，Code则是原`ReadOnlySourcePreview`。实测（原始JSON未入库）无page errors、Search高28/padding9/原字14/radius8/内环3px24%，目录hover为白4%、nav透明、tooltip为`packages/client`（等待750ms跨过原600ms延迟）；源码gutter高80而viewport810，行号user-select:none，headless拖选文本不含行号。

### 整窗图

全部位于本目录，PNG按仓库约定不入git；原生图3360×2084、默认侧栏256逻辑px、zoom1.1。由独立`DEMO=/private/tmp/files-parity`窗口`herdr-app shot`取得，不裁切伪装整窗。`herdr-state-contact-sheet.png`是索引；细节裁图仅用来标注，不替代整窗。

| 状态 | 原T3参考 | Herdr整窗 |
| --- | --- | --- |
| 默认 / 忽略项 | `t3-default.png` | `herdr-default.png` |
| 展开 / 紧凑链 | `t3-expanded.png` | `herdr-expanded.png` |
| Search焦点 | `t3-search-focus.png` | `herdr-focus.png` |
| 有 / 无搜索结果 | `t3-search-results.png` / `t3-search-no-results.png` | `herdr-search-results.png` / `herdr-search-no-results.png` |
| Preview / Code | `t3-preview.png` / `t3-code.png` | `herdr-preview.png` / `herdr-code.png` |
| 长路径 / 关闭树 | `t3-long.png` / `t3-nav-closed.png` | `herdr-long.png` / `herdr-nav-closed.png` |
| loading / 空 / 错误 | `t3-loading.png` / `t3-empty.png` / `t3-error.png` | `herdr-loading.png` / `herdr-empty.png` / `herdr-error.png` |
| 目录 / 编辑器 / 右键菜单 | 原组件源码与交互检查 | `herdr-crumb.png` / `herdr-targets.png` / `herdr-menu.png` |

原生焦点图以隔离窗口的事件状态展示ring，空/加载/错误使用同一产品render的显式边界数据；不把状态注入冒充真实网络失败或用户点击。参考图的tree hover/focus、crumb hover/tooltip和source selection为headless浏览器真实事件；Herdr没有发送真实鼠标/滚轮，不声称完成真实hover、拖选、拖动或外部应用启动。Copy/Insert仅运行fake剪贴板安全回归，未占用用户剪贴板。

### 有意差异与缺口

- 用户要求Preview/Code、Wrap、Tree跨模式固定28px槽，不适用禁用；T3会条件隐藏Wrap。Open in依用户要求用本布局同排ghost/sm/card57×28，不复制原outline24。Search使用本布局compact12px/radius6；目录面包屑hover仅文字提亮，不填底色；这是用户明确要求，不跟随T3原组件的hover底，键盘focus-visible内环保留。用户明确删除面包屑和树行tooltip（包括截断时），Open in的⌄只留aria-label；不因T3面包屑有提示而恢复。颜色、字体和圆角遵循本布局主题/token，而不复制T3黑色调。
- 用户选择保留原生Editor。宿主没有gutter底色/高度setter，这个已知缺口不通过全窗改主题掩盖；真实Herdr拖选仍未验。大文件HTML候选失败，不入产品。
- 只读文件查看器不新增编辑/保存；T3专属Web文档/媒体预览和composer拖拽无宿主对应能力。远程真实机器与外部编辑器启动未跑；安全命令边界有回归，不能替代真实投递。

### 检查

`mods/t3-files/check-files.cjs`覆盖命令/原生元素事件、层级搜索保留、固定槽、内容按下焦点、菜单子级Escape/Right/Enter/焦点恢复、展开race和4k+暖重绘复杂度。`shared/check-file-tree.cjs`、`check-nav-column.cjs`、`check-panel-surfaces.cjs`、`check-file-menu.cjs`、`check-pierre-icons.cjs`及Files独立Open in检查通过。完整`scripts/check.sh`首次只报非Files的sidebar子agent spinner断言，已交父scope修复；最终门禁记录随提交更新，不隐藏失败。

面包屑hover无底色的补修、定向通过记录、真实hover未验边界，以及两次隔离sync和三个关联仓库的提交状态，见[补修与同步交接](crumb-follow-up-validation.md)；关联提交的源副本已逐字核对（日志未入库）。
