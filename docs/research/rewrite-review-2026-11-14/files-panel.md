# Files 面板重写审查（2026-11-14）

范围：`origin/main`（`9a9fd18c`）..`524ef4a6` 中的 Files 部分，即 `f989ba75`、`4ce92221`、`0cf95b32`，以及 `e48beda5`／`e3268ccb`／`524ef4a6` 里与 Files 相关的改动。代码：`mods/t3-files/main.js`、`model.js`、`check-files.cjs`、`check-open-in.cjs`，以及 `shared/file-menu.js`、`shared/file-tree.js`、`shared/nav-column.js`、`shared/pierre-icons*.js`、`shared/open-in.js`、`scripts/sync.sh`、`scripts/vendor-files-icons.ts`，文档以 ADR 0018 为主。只读审查，没有改代码，没有运行 `sync.sh`。

对照依据：T3 Code `09a54f01`（`~/my/tools/t3code`）的 `FileBreadcrumbs.tsx`、`FileBrowserPanel.tsx`、`FilePreviewPanel.tsx` 和服务端 `WorkspaceSearchIndex.ts`；`docs/research/files-panel-t3-parity/`、`control-consistency-audit/files.md`、`herdr-experience-requirements.md`。

演示窗：`DEMO=/private/tmp/review-files`，仓库是 GitHub 上的 `herdr-t3`（`origin/main` 的内容），mod 用当前 HEAD 安装，默认侧栏宽度、zoom 1.1。截图放在 `files-panel-shots/`，按 `.gitignore` 规则只在本地，不入 git，都是整窗图。演示窗已 `down`。

## 1. 结论

**数据层和图标保留，视图与菜单层（`mods/t3-files/main.js`、`shared/file-menu.js`）整块重写。**

理由：读取、忽略标记、Pierre 图标和编辑器探测基本正确，可以直接复用。779 行的 `main.js` 把状态、异步读取、搜索、三种菜单、焦点和绘制全写在一个类里，靠补丁叠加。焦点和搜索状态已经出现可见的错误（见 #1、#2）。菜单是一套与布局 `t3-menu` 原生 popup 平行的面板内实现。局部修补只会继续加特例。

## 2. 问题清单（按严重度）

### 高

**1. 程序触发的 reveal 把键盘焦点移进文件树，并在非键盘模式下画焦点环**（`mods/t3-files/main.js:285`、`:724`）
- 现象：通过命令打开文件（`t3-files.open:…`），全程没有指针和按键，树行却出现 accent 焦点环（`files-panel-shots/11-code-main-js.png`、`12-open-folder-by-command.png`）。
- 原因：`reveal()` 在本轮新增了 `this.treeHandle.focus()`（`origin/main` 只在树的 `on_mouse_down` 里 focus）。`sync()` 在 `st.selection !== s.selected` 时会走 `pick → reveal`，所以切换面板标签、首次显示某个 space 的文件标签，以及外部 reveal 都会把焦点拉进树。树行的焦点环只判断 `treeHandle.is_focused()`，不判断 `this.fs.keyboard`，和 `focus.js` 的 `stop()` 规则不一致；审计 M3 只修了工具栏菜单关闭这一条路径。
- 风险：如果宿主把窗口内的焦点从终端移到树上，用户在终端里正打的字会被树吞掉，方向键也会开始移动树。**焦点是否真的离开终端没有验证**（不能向用户桌面发按键）。
- 证据：截图 11、12；`git show origin/main:mods/t3-files/main.js | grep treeHandle.focus` 只命中 `:537` 的 mouse_down。

**2. 搜索词已经更新，结果却是旧的**（`mods/t3-files/main.js:394-401`）
- 现象：窗口未激活时输入 `index`，搜索框显示 `index`，下面仍是完整未过滤的树（`06-search-inactive-window.png`）。另有一次在窗口激活时把搜索词从 `index` 换成 `file menu`，结果显示 “No matching files.”，而仓库里有 3 个匹配路径（`08-search-two-words.png`）。随后先搜 `menu` 再搜 `file menu`，结果正确（`09`、`10`）。
- 原因：`find()` 在 `if (!fresh()) return;` 之前就写入了 `st.query = query`，而 `st.results` 和 `st.searching` 都没动，`rows()` 于是拿新的搜索词去配旧结果。下次 recheck 前不会重跑，界面又没有 loading 或重试提示，失败被伪装成“无匹配”。这正是 parity README 里说要避免的“把失败伪装成空结果”。
- 证据：截图 06、08；`08` 的具体失败时序没有能稳定复现，记录为观察到一次。

### 中

**3. 搜索悄悄去掉了排序，前 200 条按 git 顺序截断**（`model.js:23,63-73`；`main.js:425-433`）
- 现象：本仓库搜 `icons` 有 2326 个匹配，只显示 `git ls-files` 顺序的前 200 条。`shared/pierre-icons.js` 排在第 2326、`mods/t3-files/pierre-icons.js` 排在第 1551，都看不到，只剩一行 “More matches available”。
- 原因：旧实现是子串过滤，在 ≤1000 条时用 uFuzzy 排序后取前 200（`origin/main:model.js:102-106`）。本轮删除了 uFuzzy 和 `rank`，没有加任何替代排序，CHANGELOG 和 ADR 里都没有说明。T3 用的是服务端 fff `mixedSearch`：模糊匹配、文件和目录一起排名，再取 `limit`（`apps/server/src/workspace/WorkspaceSearchIndex.ts:452-475`）。我们的版本既不模糊，也不匹配目录名，而且没有排序。
- 残留：`RANKED` 只剩下双重 slice（`:430` 先切到 1000，`:433` 再切到 200）；`st.at`、`keep`（`:437`、`recheck` 的第 4 个参数）都是旧平铺 picker 的光标，现在的树不读它们。

**4. Files 菜单是独立的面板内 overlay，和布局其余菜单是两套机制**（`shared/file-menu.js:68-167`；`main.js:445-497`）
- 布局里的右键菜单、子菜单和 Details 都用 `openOverlay` 原生 popup，以及 `t3-menu` 的 `menuChain`。Files 的行菜单、Open in 目标菜单和面包屑级联菜单则在 Files 视图内部画 backdrop 和 panel，结果是：
  - 菜单和级联层都被裁在面板宽度里，默认面板约 600px 时第三层会盖住第一层（`file-menu.js:75` 的注释也承认这一点）。**菜单打开态没有截图**：宿主没有命令能在不动指针、不发按键的情况下打开它们。
  - 审计 H1（再点触发器关不掉菜单）正因为 backdrop 在同一视图里而改不了（`control-consistency-audit/README.md:14`）。
  - 一个 `menuItems()` 用 `this.menu.kind` 混合三种毫不相关的菜单（`main.js:445-458`）。
  - 名义上“共享”的 `shared/file-menu.js` 只有 t3-files 一个使用者（`scripts/sync.sh:43`），却写死了 Files 的元素 id（`file-menu.js:94` 的 `t3-files-open-more`、`browse-…`），还保留了一条永远返回空数组的 `page === "review"` 死分支（`:17`）。
- Open in 目标菜单写了两份：Files 走 `file-menu.js`，Details 在 `mods/t3-actions/workspace-details.js:146-164` 另写了一份行列表。

**5. 菜单位置靠魔法数，按下坐标只在鼠标移动时采集**（`main.js:487-490`、`:563`、`:743`、`:750-752`）
- `browse()` 在没有按下坐标时用 `width - 108 - MENU_W` / `12` / `32`；Shift+F10 回退到 `80`／`40`／`+16`。`this.bounds`、`this.treeBounds` 只在 `on_mouse_move` 时更新，所以纯键盘会话里锚点全部来自猜测；工具栏或列宽一变，菜单就会错位。

**6. 只在窗口激活时读取**（`main.js:156`）
- 现象：窗口可见但没有焦点时（例如放在另一块屏幕上），树停在 “Loading files…”，文件停在 “Loading the file…”（`01-files-default.png`、`04-file-main-js.png`）；聚焦后才加载（`05c-readme.png`）。
- 这条规则在 `origin/main` 就已存在，不是本轮引入的，但它和 #2 叠加后，“看得见却不更新”会显得像坏了。是否保留需要用户决定。

**7. 文件命令和标签不认识目录**（`main.js:81`）
- `t3-files.open:docs/research` 会打开一个文件标签，图标是通用文件，内容是红字 “This file can't be read.”（`12-open-folder-by-command.png`）。目录明明有目录 surface，命令却没有走过去。

**8. Files 仍然打包 Catppuccin 整套图标，却不再使用**（`scripts/sync.sh:37-38,48`；`shared/file-tree.js:7,139`）
- `mods/t3-files/icons/cat` 有 619 个 SVG、2.4 MB，`file-icons-data.js` 也随之复制进来。Files 每行都传入了自己的 `icon` 和 `chevron`，`fileIcon`、`folderIcon` 只服务 Review 的 decorated 分支。`check-files.cjs:13-14` 还在加载它们。
- `treeRow` 里实际是两棵树：Files 的缩进是 `19.2 + 18.7n`、guide 的位置是 `PAD + 7.5`（`file-tree.js:130,143`），Review 是 `LEVEL·depth`。两套几何常量混在一个函数里。
- `sync.sh:51` 从 `mods/t3-actions/icons/` 复制图标到 t3-files，绕开了 `shared/` 作为唯一源的约定（AGENTS.md「Shared modules」）。

**9. 多选没有使用者**（`main.js:525-544`、`:760-764`）
- 支持 Shift／Cmd 选择、Cmd-A 和 Cmd-Space，但所有菜单项都只作用于单个 `path`。T3 的多选服务于拖拽 mention，而我们没有拖拽。Cmd-A 还会顺带打开最后一个文件，这是一个意外副作用。这些都是在补齐 Pierre 的能力，并不是需求。

### 低

**10. 导航列的新增部分**（`shared/nav-column.js`）：键盘调宽时焦点画成 6px 宽、25% accent 的色块，而且不是 `stop()`（审计 L8，没有修）。`ghostButton` 的注释仍写 “xs 24”，实际已经可以传 `size`。`navToggle`、`foldAllButton` 只剩 Review 在用，Files 手写了一份同功能控件，文案还不一样（审计 L7，没有修）。

**11. 测试主要锁实现细节**（`mods/t3-files/check-files.cjs`、`mods/t3-files/check-open-in.cjs`）
- `check-files.cjs`（583 行）在一个 fake 元素 proxy 上断言 `px[0] === 9`、`border_color === "#0000ff"`、`bg === "#ffffff1f"`、`opacity === 0.64` 和大量元素 id；性能用例统计行对象的属性访问次数（diff 中的 “visited” 一段）。换一种写法、行为不变，也会失败。
- `mods/t3-files/check-open-in.cjs` 用字符串替换修改 `main.js` 源码后再执行（`load("main").replace("default class", …)`），断言的是宽 28／20、`bg` 等样式。
- 值得留下的行为用例：Collapse 期间迟到的读取不能重新展开、搜索过滤同一棵树、缓存的 Markdown 在 Code 模式下补建 Editor、目录不被当作文本读取、菜单的 ←／→／Esc／Enter 层级行为、`shared/check-open-in.cjs` 的字面 argv 和来源失效。

**12. 文档**
- `RECIPE.md` 有 59,989 字节，离 60,000 的上限只差 11 字节，下一次任何改动都会超限。
- `herdr-experience-requirements.md:109,199` 仍写着「面包屑文件夹只在树内定位，不开文件夹标签」，和 ADR 0018 的目录 surface 相矛盾；`GLOSSARY.md` 里没有目录 surface 这个概念。
- ADR 0018 是一串补丁说明（“用户后续要求…”“用户明确删除…”），没有写清决定本身。`t3-tokens.md:57` 一行塞了整段几何参数。
- `docs/user/guide.zh-CN.md` 的 Files 条目是一整段，夹着 “trail”“focus ring”“Shift+F10”“不覆盖图片／后来新复制内容” 这类实现语言。
- `CHANGELOG.zh-CN.md` 的 2026-11-14 段（第 11、15、17、30、32 行）是对同一批还没发布的功能的连续修补，应合并成最终行为。

**13. 面包屑级联**：这是用户的选择（RECIPE 写明了“不同于 T3 的原地 Back to”），本身不算问题。问题在于它的载体（#4）。T3 是单个菜单原地换目录，加一行 Back，在窄面板里不会出现盖层问题。

## 3. 重写方案

### 目标行为（不变的部分）

- 通用 Files 是整宽树；打开文件后左边是内容、右边是树。inline 文件头、面包屑、固定槽位的 Preview／Code、Wrap、Tree 和 Open in 分体控件，几何沿用 `t3-tokens.md`。
- 树：目录只有 chevron，文件用 Pierre 图标；紧凑目录链；Files 只标 ignored；搜索过滤同一棵树。
- 目录 surface 和 trail，面包屑 chevron 浏览目录（级联还是原地，见决策 3）。
- 只读文件、远程读取上限和只在可见时刷新，沿用现有规则。

### 模块边界

| 模块 | 职责 | 处理 |
| --- | --- | --- |
| `mods/t3-files/model.js` | shell 脚本、解析、`terms`、`filterPaths`、`ticket`、`kindOf` | **保留**；加一个纯函数排序（见决策 2） |
| 新 `mods/t3-files/files-state.js` | 每个 space 的状态、list、refresh、展开、搜索、读取文件、票据 | 从 `main.js` 抽出来，不引用 gpui，可以单测。搜索词、结果和 searching 一起提交，避免 #2 |
| `mods/t3-files/main.js` | 只负责绘制和事件转发 | **重写**；焦点只由用户在树上的操作或键盘进入，环跟随 `focus.js` 的键盘模式 |
| 菜单 | 行菜单、面包屑目录、Open in 目标 | **重写**为原生 popup：在 `t3-menu` 加 kind，或用一个共享 popup 菜单，沿用 `submenu.js` 和 `menuChain`。锚点用按下时的 `e.bounds`，没有按下就交给宿主。删除 `shared/file-menu.js` 的视图部分，只保留 `fileMenuItems`、`runCommon`、`mention` |
| Open in 目标菜单 | Files 与 Details 共用一份 | 在 `shared/open-in.js` 旁加一个共用的行列表，删除两处各自的实现 |
| `shared/file-tree.js` | 行数据（`treeRows`、`pathEntries`、`treeIndex`、`treeKey`）保留 | 绘制部分拆成 Pierre 行，供 Files 用；Review 是否迁移见决策 5 |
| `shared/pierre-icons*.js`、`scripts/vendor-files-icons.ts` | 保留 | 已核对：生成自 T3 `09a54f01`，颜色来自主题 |
| `shared/open-in.js` 探测和启动 | 保留 | 字面 argv、来源失效都有测试 |

### 可删除

- `mods/t3-files/icons/cat/`（619 个文件）、t3-files 里的 `file-icons*.js`，以及 `sync.sh:37-38,48` 中 t3-files 那一份（Review 仍需要）。
- `sync.sh:51` 跨 mod 复制图标：把图标移到 `shared/icons/` 后统一分发。
- `st.at`、`keep`、`RANKED` 双重 slice；`menuItems` 按 kind 的分支；`browse` 和 Shift+F10 的魔法坐标；`this.bounds` 和 `this.treeBounds` 的 mouse_move 采集。
- `file-menu.js:17` 的 review 分支，`:94` 写死的 id。
- 如果用户同意：多选（`chooseRow` 的 Shift／Cmd 分支、Cmd-A、Cmd-Space）。
- 测试：`mods/t3-files/check-open-in.cjs` 整个文件，以及 `check-files.cjs` 中的样式值、元素 id 断言和属性访问计数，改成对 `files-state.js` 的行为测试，外加演示窗截图验收。
- 文档：ADR 0018 重写成决定本身；`herdr-experience-requirements.md:109,199` 改成目录 surface；CHANGELOG 11-14 段合并成最终行为；guide 的 Files 条目只写用户看到什么。RECIPE 需要把实现细节移到 `docs/internals/`，腾出余量。

### 风险

- 改用原生 popup 要重新实测宿主的 popup 尺寸（`layout-implementation.md` 记录过 popup 里滚动容器高度为 0 的坑），还要看级联在 popup 里的 hover 时序。
- 抽出状态模块时，要保住现有的“Collapse 取消迟到读取”“隐藏即停读”和三个 space 的缓存。这些行为测试现在是对的，应当先迁移测试，再动实现。
- 真实指针和键盘行为没法在演示窗里自动验收，需要用户亲手点一遍。

### 需要用户拍板

1. **窗口没有焦点时 Files 是否读取**（#6）：保持“窗口在前才读”，还是“面板可见就读”，远程降低频率。
2. **搜索排序**（#3）：选一种
   - （建议）子串过滤后用纯函数排序：文件名命中优先，其次路径越短越靠前；
   - 恢复 uFuzzy，只在 ≤1000 条时排序；
   - 保持现状。
   另外，目录名是否参与匹配也要定。
3. **菜单载体与面包屑级联**（#4、#13）：原生 popup 加级联（建议），原生 popup 加 T3 原地 Back，或者维持面板内 overlay。
4. **多选**（#9）：删除（建议），还是保留给以后的批量操作。
5. **Review 的树是否也改用 Pierre 图标**：改了就能删掉整套 Catppuccin 图标和 decorated 几何；这涉及 Review 的审查范围。
6. **reveal 是否聚焦树**（#1）：T3 会聚焦；建议只有用户从树或面包屑发起时才聚焦，外部 reveal 只滚动、只选中。

## 4. 未检查

- 真实指针和键盘：hover、点击、拖宽、菜单打开态和级联盖层、审计 H1 的重开问题，都没有截图，宿主也没有可用的打开命令。#1 中焦点是否真的离开终端，也没有验证。
- #2 中 `08` 那次失败的具体时序。
- 远程 space、外部编辑器启动、Copy 和 Insert 的真实剪贴板。
- 浅色主题，以及窄面板下面包屑和工具栏的溢出。
- Review 一侧（`file-tree.js` 的 decorated 分支只确认了仍被使用）。

## 跨范围

- `shared/panel.js:58-73`：目录标签和文件标签共用 `file:<path>` 这个 id 命名空间，根目录则用 `files`，会把通用 Files 标签变成目录标签。归 panel-surfaces 审查。
- `mods/t3-chrome/main.js:169-174`：从命令打开的目录被当成文件标签，显示通用文件图标（见 #7）。
- `shared/tree.js` 的 `kidStatus` 改动属于子 agent 范围，本报告没有审查。
