# 重写审查：Details 弹出层（cmd-shift-b）

审查范围：`origin/main`（`9a9fd18c`）..`HEAD`（`524ef4a6`）中 Details 部分，提交 `210f95a5`、`546508b1`、`a1f08b50`、`a9e2f769`（details）、`e960e449`、`b843396f`、`a5f32595`、`dd152b27`（t3-actions），以及顺带触及 Details 的 `8605edbd`、`e48beda5`、`e3268ccb`、`524ef4a6`。代码：`mods/t3-actions/{workspace-details,review-details,main,check}.*`，共享源 `shared/{open-in,review-scope,review-menu,measured-text,terminal-context}.js`（`mods/t3-actions/` 与 `extras/mods/review/` 下同名文件经 `cmp` 确认与源逐字节一致，只审源）。只读审查，未改仓库代码和文档。

审查视角：ponytail-review（按正确、安全、负载、测试、速度、精简排序）。负载假设：一个人、一扇窗口、同时开几个 space，Details 一次只开一个。

## 1. 结论

**重写**，但只重写实现，行为规格和视觉 token 保留。截图里三行加 Quick Review 的外观和需求（A2/A3）基本对得上，问题出在实现上：

- **Quick Review 子菜单要整块重写。** 它靠一块 736×500 的透明 popup 做画布，又往共享的 `review-scope.js` 里塞了 Details 专用的钩子，还加了一层自制的快照缓存。
- **Workspace 三行要按新的模块边界重写。** 改法是复用现成部件，几何不动。它的毛病是补丁叠补丁：一个文件管了生命周期、定位、四个子菜单和可见性；魔法数到处散落；三处各自跑 100ms 轮询。
- **测试只锁样式值**，换个写法就会全红，挡不住真正的行为回归，要跟着重写。

## 2. 问题清单（按严重度）

### 高

**H1. Quick Review 用一块 736×500 的透明原生 popup 装一个 264 宽的菜单**
- 位置：`mods/t3-actions/review-details.js:27`（`width = Math.min(736, (viewport?.width ?? 810) / z - 16)`、`height = Math.min(500, … 660 … - 32)`、`frame: "none"`）；`review-details.js:50`（`scopeOrigin` 把菜单推到画布右边）；`review-details.js:95-105`（根 `div().w(view.width).h(view.height)`）；`shared/review-scope.js:208-211,363,411`（`scopeOrigin`、`menuHeadHeight` 坐标补偿）。
- 现象：看得见的只有约 290×175pt 的范围菜单，挡住输入的却是约 810×550pt 的整块区域。截图 [quick-review-menu.png](details-popup/quick-review-menu.png) 里，菜单左边和下面那一大片终端区域都在这块透明 popup 里面。
- 为什么错：宿主 popup 是独立窗口，透明部分照样挡输入（`shared/tip.js` 的说明，也是 `tip()` 不用 HoverCard 的原因）。在菜单旁边的终端上点一下，只会关掉菜单。更大的问题是做法和其他菜单不一样：Files 面包屑、t3-menu、Actions、Open in 的子层都是各自一个 popup，用 `shared/submenu.js` 的 `subPlace` 定位（`524ef4a6` 刚统一过）。只有 Quick Review 把三层菜单（范围、Commits、base）画在同一块大画布里，为此 `review-scope.js` 要带上原点偏移、菜单头高度补偿和 `scopeMenuWidth`。
- 证据：截图；`docs/research/control-consistency-audit/README.md`「Not fixed — details H1」明确留着没修，理由是「把 Commits 移到自己的 popup 是更大的改动」。
- 未验证：点击被吞没有用真实指针测过（按要求只能用 `herdr-app do`）。

**H2. 共享的 `review-scope.js` 被 Details 的需求改坏了边界：两条路径写同一个 Review 请求**
- 位置：`shared/review-scope.js:151-163`（`ask()`、`openReviewPage()` 开头都是 `if (view.selectReview) return view.selectReview(...)`）；`mods/t3-actions/review-details.js:68-76`（`selectReview` 自己拼 `{space, root, page, base, n, analyze}` 写进 `setShared("review")`）；`review-scope.js:153-155,161`（Review 页的拼法）。另外 `scopeInMenu`、`scopeOrigin`、`scopeMenuWidth`、`scopeMod` 也都是 Details 专用的开关，通过 duck-typed 的 `view` 传进去（`review-details.js:48-90` 一次给 view 塞了二十来个字段）。
- 现象：请求格式（`n` 的算法、`base`、`analyze`）写在两处。以后改其中一处，另一处就会悄悄漂移，Details 选的范围在 Review 页里会读错。
- 为什么错：共享模块应该只给出「选中了哪个 page」，写请求的事归调用方。现在是共享模块知道有 Details，Details 又在模仿共享模块的写法。
- 证据：上述行号；`scopeIcons(view)` 靠 `view.scopeMod` 切换图标目录（`shared/review-menu.js:9`），是同一类开关。

**H3. 自制的范围快照缓存（单飞、LRU3、TTL 5 秒、owner/follower、retry）没有证据表明需要，已经出过一次死锁，还让 Review 页的计数变旧**
- 位置：`shared/review-scope.js:62-128`（`scopeRun`、`releaseScope`、`readScope`，约 60 行，四处 `owned()` 检查）；`docs/internals/storage.md:68`。
- 现象：
  1. `docs/research/panel-ab-validation/quick-review-review.md` 记了一次「第四个在途来源把 picker 卡在 Reading」，补了一刀之后才过。
  2. Review 页原来每次打开范围菜单都重读 git（旧 `scope.js` 的注释是「read afresh on each opening」），现在 5 秒内重开会直接用缓存（`review-scope.js:85-86,97`）。场景：打开菜单看一眼，关掉，agent 提交一次，5 秒内再打开，Uncommitted/Changes 的计数还是旧的。
- 为什么错：需求只要求「异步读取、有界缓存、迟到结果作废」。异步加 token 作废就已经满足「打开 Details 不做同步 Git 探测」；同一时刻只开一个 Details，跨窗口共享在途读取没有现实收益。这块复杂度是在给 `releaseScope` 的「原生 owner 可能永远不 resume」打补丁。
- 证据：上面的行号；`git diff -M 9a9fd18c HEAD -- extras/mods/review/scope.js extras/mods/review/review-scope.js`。

### 中

**M1. Details 里 Actions 行的长名字被截断，也没有提示**
- 位置：`mods/t3-actions/main.js:94`（`div().flex_1().min_w(0).truncate().child(main.name)`），对比栏位版 `main.js:73-75`（用了 `nameText` 和 `measuredTooltip`）。
- 为什么错：违反三处规格。`RECIPE.md:71`「action/computer names only when actually clipped」（只在真的被截断时给提示）；需求 A2 表格 Actions 行「显示完整动作名」；`docs/internals/layout-implementation.md:37`「Actions、电脑名…仅截断时提示」。同一张卡片里电脑名和 Quick Review 的范围都有截断提示，只有 Actions 没有。
- 证据：代码对比；`control-consistency-audit/details.md` 把这一行判成「一致」，属于漏判。

**M2. 用户能看到的文案违反 GLOSSARY**
- 位置：`mods/t3-actions/workspace-details.js:52`「Show in thread details」；`:15`「Environment and worktree」。
- 为什么错：GLOSSARY 的 Agent 条目写着 _Avoid_: thread（T3 Code 的叫法）。Herdr 也没有 worktree 这个概念。这是照抄 T3 `ThreadDetailsItemsMenu.tsx`、`threadDetailsItems.ts` 的原文。同一个菜单里的 scripts 已经改叫「Actions」，两种处理混在一起。
- 修法方向：标题改成「Show in Details」，第一项改成「Computer and folder」之类，按 GLOSSARY 的用词。存储用的 id（`environment` 等）不用动。

**M3. Quick Review 菜单一打开就高亮并勾上 Uncommitted，哪怕 Review 还没显示过任何范围**
- 位置：`shared/review-scope.js:245`（`openScope` 把 `scopeAt` 设成打勾那一行）；`mods/t3-actions/review-details.js:51`（`view.page = "/worktree"` 当作默认值）。
- 现象：截图 [quick-review-menu.png](details-popup/quick-review-menu.png)：指针不在菜单上，Uncommitted 行已经有 `selected` 底色，也打了勾；而 Details 行尾这时什么范围都没写（`review.shown` 为空）。
- 为什么错：`RECIPE.md:71`「no initial highlight」，`8605edbd` 刚把各菜单统一成「只在指针在行上时点亮」。打勾表示「Review 正在显示 Uncommitted」，这一点也不成立。

**M4. 定位靠散落的魔法数和跨 mod 的 `globalThis` 拼出来**
- 位置：
  - `workspace-details.js:96-104`：键盘打开时的锚点，用 `36*z`、`4*z`、`480*z`、`16*z`、`6*z`、`28*z`、`280`、`420`。
  - `:73`：`264*z` 兜底宽度，且行宽只在 Open in 行上测（`:215`），隐藏 Open in 后 Actions 菜单就退回 264。
  - `:25`：`185`、`220`。
  - `main.js:97,109`：`36`、`45`。
  - `review-details.js:27`：`736`、`810`、`16`、`500`、`660`、`32`。
  - `globalThis.t3Titlebar` 由 `mods/t3-tabs/main.js:320` 写、t3-actions 读，代码里看不出这层依赖。
- 为什么错：每加一个子层就多一套「行宽、下偏移 4、按下坐标、zoom 换算」的复制。`underDetails`、`underBar`、Quick Review 的 `at` 是同一件事的三种写法。

**M5. 来源失效靠三套 100ms 轮询，规则也不一致**
- 位置：`workspace-details.js:129`（Details 本体）；`main.js:254-256`（四种子菜单，每个各开一个）；`review-details.js:90`（Quick Review）。
- 现象：
  - 菜单开着时，每 100ms 同时有两三个定时器在跑 `spaces()`/`panes()`。
  - Quick Review 的 `reviewSourceOkay`（`review-details.js:43-44`）多查了一条「终端 cwd 必须还等于 source.folder」；Details 本体、Open in、Actions 不查。同一个来源，在终端里 `cd` 之后，Quick Review 会关掉并作废，Open in 照样打开旧目录。按 A3「打开时捕获来源」，后者才是规格；两边至少要统一。
- 修法方向：父 Details 统一盯来源，失效时关掉自己，`detailsClosed` 已经会连带关掉子层。子层不用再各自轮询。

**M6. 测试锁的是样式值，不是行为**
- 位置：`mods/t3-actions/check.cjs:275-434`（本轮 +182 行）。例子：`style.h === 242`、`=== 420`、`style.rounded === 16`、`details-open-row-rule` 的 bg、锚点坐标 `219.6`、`1190.4`、元素 id 和 `kind === "div"`。`check.cjs:49` 把 16 个源文件拼成一个字符串，再用字符串替换注入 `const drawButton = button;`。
- 为什么错：换个实现，几乎每一行都会失败；真正的行为反而没覆盖：Escape 分层、子菜单关闭后焦点回到哪里、Open in 选择不执行、隐藏 Open in 后菜单宽度。真正锁行为的只有十来条：失效来源不能执行或改 Review、编辑器保留父层、Open in 回退 Finder、可见性只存 false、选范围写出的请求。重写时只留这些。

**M7. 文档臃肿，而且把实现细节写进了用户文档**
- `docs/user/guide.md:20`：一个约 400 词的单条 bullet，写进了「bounded cache; stale results are ignored」「Split arrows have accessible labels without redundant hover text」这类实现细节（AGENTS.md：用户文档只写人看到和做的事）。
- `RECIPE.md:71,73`：电报体长段，没法逐条对照验收。
- `docs/internals/t3-tokens.md:49`：一个段落里 token 和行为混写。
- `docs/internals/storage.md:58-68`：五段写的是只活在本次运行的 `globalThis` 状态（`t3DetailsLayers`、`t3ReviewScopeRun`、`t3Titlebar`），不是持久存储。
- ADR 0017 后两段把 Details 和 Files Insert 写在一起。
- `CHANGELOG.md` 的 2026-11-13、11-14 两节（都是还没推送的这一轮）里，Details 至少有 6 条在写用户从没见过的中间状态，比如「Fixed Details registering an invisible, zero-height popup」「without a detached second scope button」。

### 低

**L1. 死代码和双模式函数。** `main.js:63` 的 `props()?.actions === "details" ? false : …` 永远走不到，因为 `:61` 已经提前 return 了。`menu()` 靠 `panel` 在 `rest 36/45`、分隔线有无、Edit 何时显示之间切换（`main.js:109-136`），一个函数画了两种菜单。

**L2. 状态生命周期混着用。** `let detailsOverlay` 是模块变量（`workspace-details.js:60`），子层登记却放在 `globalThis.t3DetailsLayers`（`:62`）。关闭时还要 `run("t3-actions.dismiss-details")` 绕一圈（`:109`）。实测反复开关正常（见第 4 节），但这套写法离开代码注释就读不懂。

**L3. 首帧高度靠猜。** `workspace-details.js:228` 先按 `112` 画，`on_size_change` 测到真实高度后再 notify。实际内容是 3 行加 Quick Review，约 161。首帧高度不对，会先出滚动条再跳一下。没有逐帧截图核实。这个 workaround 的来由写在 `layout-implementation.md:11`（不能用 max_h 自适应）。

**L4. `shared/measured-text.js` 的 `named()` 只有 t3-tabs 用（`mods/t3-tabs/main.js:21`），却放在共享模块。** 它用的 `view.details`、`details-${id}` 指的是悬停卡片，和 Details 弹层撞名。测宽部分（`nameText`、`measuredTooltip`）本身设计合理，可以保留。

**L5. 新加的 `t3-actions.detailsClosed`（`workspace-details.js:110`）每次关闭都会写一次共享状态，`storage.md` 里没有登记。**

### 应保留的部分（重写时直接复用）

- `shared/open-in.js`（44 行）：参数按原样传 argv，不经 shell；检测已装编辑器每次运行只做一次；缺编辑器时回退 Finder；来源失效就不启动。`check-open-in.cjs` 测的是行为。
- `shared/terminal-context.js`（14 行），以及它的测试。
- `shared/measured-text.js` 的 `nameText`、`isTextCut`、`measuredTooltip`。
- `shared/button.js` 的 `split()`（`row`、`sm` 两种尺寸）：截图里静止时没有底色和中线，和 token 一致。
- `t3-actions.detailsItems` 只存 `false`、Reset 清空、全部隐藏时留一个入口：语义和 T3 一致。
- 视觉几何：宽 280、圆角 16、行高 32、13 medium、32 宽的行尾槽、无阴影。截图 [details-keyboard-open.png](details-popup/details-keyboard-open.png) 里电脑名、Open in Finder、Test、分隔线和 Quick Review 都对齐。

## 3. 重写方案

### 目标行为（不变）

A2/A3 和 ADR 0017 的「详情」段落保持不变：
- 三行 Workspace：locked 的电脑名、folder 提示、整行右键 Copy full path；Open in 用 split，菜单只选偏好；Actions 为空时显示 Add，否则显示 split。
- Quick Review 一行，行尾用 dim 字写当前范围。
- 卡片右键切换各项显隐，可 Reset。
- 打开时捕获来源，来源失效就关闭并提示；打开面板会收起 Details；面板放大时先恢复工作列。

改动只有三处：
1. 菜单不再初始高亮任何行（M3）。
2. Review 没显示过范围时，范围菜单里不打勾。
3. Actions 名字被截断时给提示（M1）。

### 模块边界

| 模块 | 职责 | 复用 |
| --- | --- | --- |
| `mods/t3-actions/details.js` | 弹层生命周期：toggle、捕获来源、**唯一一个**来源监视器（失效时关闭父层，再连带关闭子层）、子层登记（只用一处存储）、`openChild(kind, rowBounds, height)`，统一「行宽、下偏移 4、zoom」的锚定 | `terminal-context.js`、`focus.js` 的 `pressed`/`justClosed` |
| `mods/t3-actions/details-view.js` | 画四个分区和「Choose what to show」，只管渲染 | `button.js` 的 `split()`、`measured-text.js`、`tip.js` |
| 子菜单 | Open in、显隐、Copy path、Actions 共用一个「行列表菜单」画法（行 28、`scrollList`、`menuJump`、Escape、只在指针在行上时点亮）；每个子菜单只提供 rows 和 onPick | `list.js`；现在四个菜单各写了一遍 on_key_down，把它们并起来 |
| Quick Review | 范围菜单开成一个**按内容定尺寸**的 popup，挂在 Quick Review 行下面；Commits 和 base 各自开子 popup，用 `submenu.js` 的 `subPlace` 定位，和 t3-menu、Files 的级联同一套机制 | `review-scope.js` 只保留纯数据部分：`scopeOf`、`scopeRows`、`scopeList`、`baseList`、读 git、行渲染 |
| `shared/review-scope.js` | 去掉 `selectReview`、`scopeInMenu`、`scopeOrigin`、`scopeMenuWidth`、`scopeMod` 这些开关。改为导出一个 `reviewRequest(space, root, page, opts)`，由 Review 页和 Details 共用 | — |

### 可删除

- `review-scope.js` 的快照缓存：`scopeRun`、`releaseScope` 里的 owner/follower、`readScope` 的大部分，约 −50 行；`check-review-scope.cjs` 里对应的用例；`storage.md:68`。恢复成「每次打开就读，靠 token 作废迟到结果」。
- `review-details.js` 的大画布：`initReviewScope` 的坐标字段、`reviewScopeView` 根节点；`review-scope.js` 的 `menuHeadHeight` 和 `scopeOrigin` 分支。
- `main.js:61-63` 的死分支；`menu()` 里 panel 和栏位两种模式的分叉，栏位菜单直接调同一个菜单画法。
- 三处 100ms 轮询，只留父层那一处。
- `globalThis.t3Titlebar` 加魔法数兜底：改由 t3-tabs 在发 `t3-actions.details` 命令时带上按钮的 bounds（t3-tabs 本来就测了 `tabs-end`），或者干脆不带 `at`，交给宿主默认位置。这一点要先确认宿主能力。
- `check.cjs:275-434` 的样式断言，只留第 2 节 M6 列的那十来条行为断言。
- 文档：
  - `guide.md:20` 改成 5–8 条只写可见行为的 bullet。
  - `RECIPE.md:71/73` 按六段结构改成可验收的短句。
  - `storage.md:58-68` 只留持久键（`t3.openTarget`、`t3-actions.detailsItems`、`review.shown`），运行期状态挪到 `layout-implementation.md`。
  - CHANGELOG 未推送的两节里，Details 相关条目合并成一条，写最终行为。
  - `panel-ab-validation/` 里过时的 Details 截图和日志（早于 `dd152b27` 的那些），可以考虑归档。

### 风险

- 宿主 popup 叠多层子 popup 时的焦点和 Escape 顺序（Commits 子菜单独立成 popup 之后）：t3-menu 的级联已经证明可行，但 Details 加范围菜单加 Commits 是三层，要实测。
- 去掉缓存后，大仓库里每次打开范围菜单都要重读，计数会慢一点出来（菜单先显示「Reading…」）。这是旧的 Review 页行为，可以接受，但要跟用户确认。
- 栏位版 Actions（独立的 `herdr-t3-actions` 仓库）也走 `main.js`，合并菜单画法时要一起回归。

### 需用户拍板

1. Quick Review 的子层：独立 popup 级联（建议，和 t3-menu、Files 一致），还是保留单画布但缩到实际内容大小？
2. 删掉范围快照缓存，恢复「每次打开就读」（建议）？
3. 菜单文案：「Show in thread details」「Environment and worktree」换成 GLOSSARY 用词（建议），还是照抄 T3？
4. Quick Review 的来源规则：和 Details 统一成「只看 space/tab/terminal 是否还在」（建议），还是保留 cwd 变了就作废？
5. 范围菜单在 Review 还没显示过时，不打勾（建议），还是默认勾 Uncommitted？

## 4. 未检查项

- **没有真实指针和键盘**：H1 的点击被吞、Escape 分层、子层关闭后焦点回到哪里、Tab 顺序，都没有实测。
- **截图只有两张有效**：演示窗（`DEMO=/private/tmp/review-details`，已经 down）在后台时，`herdr-app shot` 之后返回的都是旧帧。为了不抢用户桌面焦点，没有把窗口切到前台。所以以下几项**只用 `herdr-app status` 核对了 overlay 的开关，没有画面证据**：
  - 新建标签让来源失效：overlays 变成 `["toast"]`，也就是 Details 关闭并弹出提示，行为符合 A3。
  - 键盘反复开关：`t3-tabs.details` 连按两次能正常开、关、再开。
  - 面板打开时用键盘打开 Details 的锚点位置。
- Quick Review 的截图是用 `demo-stage.overlay` 按代码里的参数手动开出来的子层，没有挂父 Details，所以截图里 Quick Review 行没有显示开启态。这是截图手法造成的，不是缺陷。
- 窄窗口、浅色主题、远程 space、没装 Review 扩展这几种情况都没有截图。
- 没有跑 `scripts/check.sh`（任务说明它全过）；没有跑 `scripts/sync.sh`。
- `546508b1`（宿主能力验证文档）和 `a1f08b50`（交互审计文档）只做了交叉引用，没有复核文档里的每一条结论。

## 跨范围

- `shared/button.js` 的 `split()`、`dd152b27` 改的另外 11 个 `button.js` 副本：归按钮和共享控件的审查者。
- `extras/mods/review`：H3 的缓存让 Review 页范围菜单的计数最多旧 5 秒，归 Review 审查者确认。
- `mods/t3-tabs/main.js:138-141`（面板放大时打开 Details，先 `toggleWide`、再隔 50ms 发命令）和 `:320`（写 `t3Titlebar`）：归 tabs/chrome 审查者。
- `herdr-t3-actions` 独立仓库：sync 会把 Details 和 Quick Review 整套（连带 `panel.js`、`review-scope.js`）复制过去。独立安装、没有 Review 扩展时，Quick Review 会一直置灰，需要单独确认这是不是想要的。
