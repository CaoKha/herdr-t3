# 重写后的代码整理方案（codebase-cleanup）

范围：`origin/main=9a9fd18c..HEAD`（审查时 HEAD=`bd5df15b`），重点是 `shared/` 和各 mod 怎么用它。视角是 codebase-design：浅模块、同一件事有几份实现、只有一个调用方的接缝、跨 mod 的隐式约定、死代码、只锁实现细节的测试、文档和代码不一致。

行号都以 `shared/` 源文件或 mod 自己的文件为准；`mods/*/` 里和 `shared/` 同名的文件是 `scripts/sync.sh` 复制出来的副本，不单独列出。

分两部分：

- **A. 不改变行为的整理**：第二步按优先级实施。
- **B. 会改变用户可见行为的项**：单独列出，需要用户拍板，不拍板就不动。

第二步在 t366（性能审查）交付后开始，先 rebase 到它的结果上。A8（Files 状态）和 t366 最容易改到同一批文件，放在最后，开工前再看一遍冲突。

---

## A. 不改变行为的整理（按收益排序）

### A1. 原生 popup 菜单：一个模块管“谁挂在谁下面”和“放在哪里”

**现状**：同一套机制在三个 mod 里各写了一遍，第四种写法（放到按钮下方）散在十处。

| 做的事 | t3-menu | t3-files | t3-actions（Details） |
|---|---|---|---|
| 记录打开中的菜单及其上级 | `shared(KEY.menuChain)`，`mods/t3-menu/main.js:25-32`。这是只在本次运行有用的数据，却放在共享状态里 | `globalThis.t3FilesMenus`，`mods/t3-files/menus.js:23-32` | `globalThis.t3Details.layers`，`mods/t3-actions/workspace-details.js:31-59` |
| 在行旁打开子菜单：行的 bounds，否则按 origin 估算 → `subPlace` → `openOverlay` → `subOpened` | `main.js:236-251` | `menus.js:143-158` | `review-details.js:104-114` |
| 子菜单自己关了：上级重绘并拿回键盘 | `main.js:283-287`，读 chain | `menus.js:180-182`，读 `t3-files.submenuClosed` 戳 | `review-details.js:118-119`，读 `layers`，**没有读任何共享键**（见“风险”） |
| 选中一项后整条链一起关 | `main.js:267-269` | `menus.js:172-173` | `workspace-details.js:115-120`（`closeForAction`） |
| cmd-w 关闭全部 | — | `menus.js:106-111` | `dismissDetails` |

origin 估算那段连同它的 `shortcut:` 注释出现了三次。

“挂在按钮下方”：`{ at: { x: b.x + b.width - W*z, y: b.y + b.height + 4*z } }` 及其左对齐版本，出现在 `t3-actions/main.js:36`（`underBar`，+1、5）、`workspace-details.js:43`（`underRow`）、`workspace-details.js:86`、`pulls-review/bar.js:29`（又一个 `underBar`）、`t3-files/main.js:545,578`、`t3-agents/main.js:274`、`t3-pane/main.js:117`、`t3-tabs/main.js:560`、`t3-chrome/main.js:178`（下偏移 6）、`asciicn-wallpaper/main.js:138`（向上）。`Number(settings()?.zoom) || 1` 在这些 mod 里重复了二十多次，大多数就在这几段放置代码里。

**目标接口**：新建 `shared/popup-menu.js`，同步给 t3-menu、t3-files、t3-actions；其中 `hang` 还要同步给用到它的其余 mod。

```js
hang(b, width, { align = "end", gap = 4, above = false } = {})   // → { at } 或 {}（没有按下，交给宿主默认位置）
openMenu(mod, { kind, width, height, at, props })                 // 登记它的上级（props().overlay 和 props().parents），返回 id
openBeside(view, i, { mod, width, height, rowTop, props, lit })   // view.rowsAt[i] ?? origin 估算 → subPlace → openMenu → subOpened
subGone(view, closedKey)                                          // 渲染时调用：读戳，view.sub 已关就清掉并 focus 回来
closeChain()                                                      // 关掉自己和所有上级
menuClosed(view, closedKey)                                       // close() 时调用：注销、关掉自己的子树、写关闭戳
closeTops(mod)                                                    // cmd-w
hasOpen(parent, kind)                                             // Details 行的 on 态（取代 detailsLayerOpen）
```

登记表统一放在本次运行的 `globalThis.t3Popups`（Map：id → `{ mod, parents, kind }`）。各 mod 关闭戳的键名不变，见 A6。

**删除**：`KEY.menuChain` 和 t3-menu 的 `chain`/`closeTree`；`t3FilesMenus`、`openMenus`、`closeMenus` 的实现；`t3Details.layers`、`openLayer`、`layerOpen`、`layerClosed`、`underRow`、`closeForAction` 的实现；两个 `underBar`；三份 origin 估算。

**影响的调用方**：t3-menu `main.js`；t3-files `menus.js`、`main.js:545,578`；t3-actions `main.js`、`workspace-details.js`、`review-details.js`；只用 `hang` 的 pulls-review、t3-agents、t3-pane、t3-tabs、t3-chrome、asciicn-wallpaper；`scripts/sync.sh`。

**测试**：新建 `shared/check-popup-menu.cjs`，通过接口锁定以下行为：链关闭顺序、子菜单关闭后上级拿回键盘、cmd-w 只关顶层、`hang` 的右对齐和 zoom 换算。`mods/t3-menu/check-menu.cjs` 和 `mods/t3-files/check-files.cjs` 里断言 chain 或打开参数的部分改为走接口；`t3-actions/check.cjs` 不用改，它只走视图。

**风险**：t3-menu 的 chain 从共享状态改到 globalThis 以后，它的重绘就不能靠“读 chain 就订阅”了，要改成和 Files 一样读关闭戳。用户已有共享状态里会剩一个没用的 `t3-menu.chain`，`init` 时本来就会清掉它，可以在 `RENAMED` 加一条 `keep=false` 顺手删除。这项改动面最大，需要在演示窗里逐个回放：右键菜单 → Snooze 子菜单、Files 面包屑一层层的文件夹、Details → Quick Review → Commits，各用指针和键盘走一遍。

### A2. `review-scope.js` 拆开：共享的只留“范围模型和菜单行”，Review 页自己的移回 Review

**现状**：`shared/review-scope.js`（384 行）同步给了 t3-actions，但其中一半只有 Review 页在用：`scopeHeader`、`scopeButton`、`baseButton`、`baseList`、`openBase`、`pickBase`、`baseMenu`、`scopeMenu`、`scopeSub`、`scopeBack`、`menuWidth`（`:197-333`、`:363-384`、`:149-161`）。`shared/review-menu.js` 里的 `popover`、`toPane`、`inSub`、`subState`、`subAt`（`:24-51`）也只有 Review 页用。t3-actions 带着这些代码，从来不执行。

Details 为了复用 `scopeKey`，伪造了 `view.popup = "scope"`（`review-details.js:74-76`）。Details 的 `commitsMenu`（`review-details.js:145-161`）和 `scopeSub`（`review-scope.js:363-384`）是同一个搜索加列表加“No matches”的两份写法；按键也写了两份：`commitsMenu` 的 on_key_down 和 `scopeKey` 里子页那一段（`:180-183`）。Details 的 Commits 靠 `globalThis.t3DetailsRange`，把 10 个字段逐个拷过去（`review-details.js:96,134-137`）。

**目标**：

- `shared/review-scope.js` 只保留：读取（`readScope`、`openScope`、`releaseScope`）、`scopeOf`、`scopeRows`、`scopeList`、选择（`pickScopeRow`、`pickListed`、`openReviewPage`）、行（`scopeRow`、`scopeItems`、`commitRow`），再加两个新接口：
  - `menuKey(view, e, cx)`：只处理范围菜单本身的键，不需要伪造 `popup`。
  - `commitsBody(view, t, { height, icons })`：搜索、列表、空状态，加上它自己的按键。Review 的 `scopeSub` 和 Details 的 `commitsMenu` 都只是在外面包一层。
- 新建 `extras/mods/review/scope-header.js`（不进 shared），放 header、base 选择器、页内的菜单和子菜单，以及 `popover`/`toPane`/`subAt`；`review-menu.js` 只剩 `pickMark`、`searchField`、`popupClosed`、常量。
- Commits 拿已读数据：range 菜单在打开 Commits 时，把读到的数据作为 props 交过去（数据很小：picks、refs 和几个键）。如果宿主的 props 不能放这么多，就保留 globalThis，但只拷一个 `scope` 对象。

**删除**：t3-actions 里约 200 行死代码；`view.popup = "scope"` 这个伪造；一份 Commits 的视图和按键。

**影响的调用方**：`extras/mods/review/main.js`、`header.js`、`keys.js`；`mods/t3-actions/review-details.js`。

**测试**：`shared/check-review-scope.cjs` 里 base 和 `scopeKey` 子页的断言（`:95-104`）跟着搬到 Review 的检查；共享部分改为经 `menuKey`/`commitsBody` 断言。`extras/mods/review/check-pane.cjs` 不变。

**风险**：Review 页的键盘路径（`keys.js` 调 `scopeKey`）要原样保留，base 分支同样保留。

### A3. 状态标记只用 `statusMark`

**现状**：`shared/status-mark.js` 只同步给 t3-pane 和 t3-agents。另外有五份手写：

- `mods/t3-tabs/main.js:43-47`（`blockedMark`、`mark`），以及 `:49` 的 `WORDS`，它是 `STATUS_WORD` 的子集
- `mods/t3-picker/main.js:70-73`
- `mods/t3-chrome/main.js:194-197`
- `extras/mods/pulls-review/bar.js:290-292`
- `mods/t3-inbox/row-view.js:129`（16px，颜色继承 pill）

chrome 和 pulls-review 两处都是“Review 运行状态标记”，逻辑一模一样。

和 `statusMark` 唯一的几何差别：`statusMark` 的 done 圆点带 `mx(3)`，占 12 宽的位置（`status-mark.js:16`）；那五份是裸的 6px 圆点。

**目标**：`statusMark(t, st, size)` 的 done 改成裸的 6px 圆点，需要 12 宽位置对齐的两处（`t3-agents/rows.js:91`、`t3-pane/main.js:90` 子 agent 菜单）在调用方包一层 `div().w(12)`。五份手写全部改为 `statusMark(t, st, 14)`，inbox 用 16。`WORDS` 改为 `STATUS_WORD`。sync 列表加上 t3-tabs、t3-picker、t3-chrome、t3-inbox、pulls-review。

**删除**：五份手写，以及 `WORDS`。

**测试**：`shared/` 加一条：同一状态在 12、14、16 下的尺寸和颜色，`error` 用 ansi1。截图对比 Tabs 计数、Go to、品牌栏、Review 栏、Inbox 卡片、Agents 列表、子 agent 菜单，应当零像素差（pane 头 done 的位置除外，见风险）。

**风险**：`t3-pane/main.js:218` 的 pane 头 done 现在也带 `mx(3)`，要一起包一层，否则 pane 头会移动 3px。截图时专门看这一处。

### A4. Details：去掉回调注入，把 Actions 两种菜单拆成两个函数，标题栏的测量收进一个模块

**现状**：

- `detailsView(view, control, reviewView)`（`workspace-details.js:193`）把 Actions 行和 Quick Review 区作为回调传进来，只为了绕开循环 import。每个回调都只有一个实现，是假接缝。
- `control()` 一进来先判断 `props().actions === "details"`，转去 `panelControl`（`main.js:60-61`）。
- `menu()`（`main.js:104-129`）靠 `panel` 这个标志画两种样式：45 或 36 的余量、有没有分隔线、Edit 常显还是只在亮起的行显示。
- `globalThis.t3Titlebar` 由 t3-tabs（`main.js:302`）和 t3-chrome（`main.js:238`）写，t3-actions（`workspace-details.js:79-84`）读。三方之间的约定只出现在注释里。

**目标**：

- 新建 `mods/t3-actions/actions.js`，放 `state`、`primary`、`runAction`、`editor`、`icon`，以及 `barControl`/`detailsControl` 两个控件和 `barMenu`/`detailsMenu`。两种菜单共用一个 `actionRow`，各自的样式差别写在各自函数里。
- 弹层登记表由 A1 接手以后，`workspace-details.js` 和 `review-details.js` 之间就没有循环了。`detailsView` 直接 import `detailsControl` 和 `reviewDetailsView`，参数只剩 `view`。
- 新建 `shared/titlebar.js`：`noteTitlebar(part, widthPx)` 由写入方调用；`detailsAnchor(viewport, z, panel)` 是纯函数，返回 bounds；没测到的时候怎么办由 B4 决定，在那之前保持现在的数值。

**删除**：`detailsView` 的两个回调参数、`control` 开头的分派、`menu` 里的 `panel` 分支，以及三处直接读写 `t3Titlebar` 的代码。

**测试**：`mods/t3-actions/check.cjs` 只走视图，应当原样通过。`detailsAnchor` 补一个纯函数测试：面板开、面板关、zoom 1.25。

### A5. `review.shown` 的读写放到 `panel.js`

**现状**：`review.shown` 的 `born` 约定是 Review 写（`extras/mods/review/main.js:268`），Review 自己读（`:170`），Details 读（`review-details.js:27-30`），pulls-review 读（`bar.js:302`）。前两个读方各自比对一次 `born`，pulls-review 不比对（见 B5）。`panel.js` 已经是 `review` 请求唯一的写入方，也负责 `born`，`review.shown` 却在它外面。

**目标**：`shared/panel.js` 加 `publishShown(space, shown)`，自动带上 `born`；再加 `reviewShown(space)`，只返回当前 Review 标签写的那条记录。Review 和 Details 都改用它们；pulls-review 等 B5 拍板。

**删除**：`review-details.js` 里的 `reviewShown`，以及 Review `main.js:170` 那段比对。

**测试**：`shared/check-panel.cjs` 加一条：标签关掉再加回来以后，`reviewShown` 返回 null。

### A6. 弹窗关闭戳的键名由一处生成

**现状**：键名约定写在 `docs/internals/storage.md`「弹窗关闭时间戳」：`<mod>.closed` 或 `<mod>.<popup>Closed`。但跨 mod 读的时候是手写字符串：`t3-tabs/main.js:563,577`（`"t3-menu.closed"`）、`t3-home/main.js:17-18`、`t3-inbox/filter.js:105,111`、`t3-spaces/main.js:566`；写的时候是各 mod 自己的常量（`SURFACE_CLOSED`、`KIDS_CLOSED`、`MENU_CLOSED`×3、`DETAILS_CLOSED`、`SUB_CLOSED`……）。

**目标**：`shared/trigger.js` 导出 `closedKey(mod, popup?)`，按约定拼出键名，读写两边都用它，这条约定从此写在代码里。键名本身不变。

**删除**：各处字面量和常量定义。

**风险**：低。只要有一个键拼错，按钮就会“点一下关了又重开”，所以 `check-trigger.cjs` 加一条：读写两边用同一个键，测试通过。

### A7. 菜单按键交给 `menuKeys`

**现状**：`shared/list.js` 的 `menuKeys`（`:77-88`）只有 4 处在用。下面这些都是手写的同一套“Enter/Space 选中，Esc 关闭，→ 打开子菜单，← 退回上级，其余交给 menuJump”：`t3-actions/main.js:110-122`、`t3-files/menus.js:187-200`、`t3-menu/main.js:298-312`、`t3-chrome/main.js:282-293`（还要跳过禁用行）、`t3-agents/main.js:134-145`、`t3-chrome/settings.js:80-91`、`asciicn-wallpaper/main.js:154-166`。

**目标**：`menuKeys(view, labels, choose, { at = "at", close, sub, back, disabled, enterGuard })`。`sub(at)` 返回 true 表示 → 和 Enter 打开子菜单；`back` 表示 ← 关闭自己；`disabled(i)` 决定跳过哪些行；`enterGuard` 用于 Actions 行内的 Edit 按钮。上面七处改为调用它。

**测试**：`shared/check-list.cjs` 为每个选项各加一条。

**风险**：中。各处有细微差别：chrome 有行字母快捷键，settings 在 Esc 时要把 focus 交回触发器。差别不能硬塞进选项的，留在调用方，先处理完再交给 `menuKeys`。

### A8. Files 状态拆出 `files-state.js`（建议延后）

**现状**：`mods/t3-files/main.js` 723 行，View 里混着每个 space 的缓存、轮询、读取票据、预览驱逐和渲染（`stateFor`、`drop`、`slim`、`sync`、`going`、`load`、`poll`、`recheck`、`toggle`、`reveal`、`pick`、`open`、`keepPreview`、`find`，`:103-475`）。`files-panel.md:95` 计划过拆分。

**目标**：`files-state.js` 不引用 gpui，接口大致是 `create({ exec, now })`、`sync(spaces, tabs)`、`open(space, rel)`、`find(space, query)`、`toggle(space, path)`、`tick()`，View 只负责画。`check-files.cjs` 里断言状态的部分改到这个接口上。

**建议**：放到最后。如果 t366 改了 `main.js`，就等它合入，再单独做一轮。收益是可测性，风险是异步票据和驱逐时机。

### A9. 死导出、死 import

- `shared/` 里只在本文件内使用、`export` 可以去掉的：`file-tree.js` `TREE_ROW`、`STATUS`；`measured-text.js` `measureText`；`nav-column.js` `NAV`；`open-in.js` `OPEN_IN_MAX`；`review-git.js` `browserPath`；`tree.js` `isAgent`；`review-scope.js` `scopeBack`（A2 之后移到 Review）。
- 只有测试在用的导出：`file-tree.js` `naturalCompare`、`nav-column.js` `navRange`、`tree.js` `agentKids`、`measured-text.js` `isTextCut`、`submenu.js` `inTriangle`/`SUB_DELAY`/`SUB_REST`。这些都是有意给测试留的内部接缝，保留。
- 没用到的 import：`mods/t3-agents/main.js:8-9` 的 `glow`、`tip`、`stop`；`extras/mods/review/main.js:11` 的 `pageLabel`。

### A10. 测试用的假 kit 只留一份（可选）

**现状**：大约 30 个 `check*.cjs` 各写一遍 Proxy 假元素、`find`、`strings`、`fire`、去掉 import 后在 vm 里加载，比如 `shared/check-trigger.cjs:8-40`、`mods/t3-actions/check.cjs:7-30`、`mods/t3-files/check-files.cjs:20-37`。

**目标**：新建 `shared/check-kit.cjs`，提供 `element`、`find`、`texts`、`fire`、`load(dir, files, globals)`，由 sync 复制给需要它的 mod。兄弟仓库会随 rsync 拿到这份副本，所以它们的检查还能单独运行。

**建议**：只在 A1 到A3 动到哪个测试文件，就顺手把哪个迁过去，不一次全改。

### A11. 文档和代码对不上的地方（随对应项一起改）

- `docs/internals/storage.md` 没提到 `t3-menu.chain`（`KEY.menuChain`），也没提到 `globalThis.t3PastePending`（`t3-files/menus.js:62-70`）。A1 之后，`t3FilesMenus`、`t3Details.layers`、`t3-menu.chain` 三段合成一段，写 `t3Popups`。
- `docs/internals/layout-implementation.md:35`：父子链只写了 t3-menu 和 Files，漏了 Details 的 layers。A1 之后改成指向 `popup-menu.js`。
- `shared/status-mark.js:1-4` 的头注释说“wherever it's drawn”，但实际上还有五份副本。A3 之后才名实相符。
- `docs/internals/t3-tokens.md:32`（R3：侧栏卡片和 slim 行横向内边距 8）和 Spaces/Agents 行的 `px(10)` 不一致，见 B1。
- `storage.md:69` 的 `t3Titlebar` 一段，A4 之后改为指向 `shared/titlebar.js`。

---

## B. 会改变用户可见行为的项（需要用户拍板）

| # | 改什么 | 现状 | 建议 |
|---|---|---|---|
| B1 | Lists 里 Spaces/Agents 行的横向内边距 | `px(10)`：`t3-spaces/main.js:246,296,364,384`，`t3-agents/rows.js:193,275`；t3-tokens R3 写的是 8 | **（建议）改成 8**，和 R3、Inbox 卡片对齐；行里文字左移 2px。另一个办法是保留 10，把它写进 t3-tokens 的「有意不同」 |
| B2 | 手写菜单行改用 `menuRow`：设置页 Select 的选项（`t3-chrome/settings.js:92-98`）、Commits 行（`review-scope.js:342-356`）、base 行（`review-scope.js:296-311`） | 指针移进行时点亮，移出后**仍然亮着**；role 是 `list_box_option` 或 `radio_button` | **（建议）改用 `menuRow`**：移出后熄灭，和其余菜单一致（T3 和 Base UI 也是这样）；role 在调用方覆盖回原值。不同意的话，A 部分照做，这三处保持手写 |
| B3 | Details 里 Actions 菜单的样式 | 从栏上 ▾ 打开时有分隔线，Edit 常显；从 Details 打开时没有分隔线，Edit 只在亮起的行出现（`main.js:104-129`） | **（建议）保持两种样式**，A4 只拆代码。如果要统一，建议都用 Details 的样式（Edit 只在亮起的行出现），需要确认 |
| B4 | 第一次绘制前按 cmd-shift-b，Details 偏右 28 | `t3Titlebar.end` 还没测到时当作 0（`workspace-details.js:82`） | **（建议）没测到时用布局常量补上**（面板关闭时 toggle 是 28，再加间距），放在 `detailsAnchor` 里；另一个办法是没测到时不传 `at`，交给宿主默认位置 |
| B5 | Review 栏（pulls-review）读 `review.shown` 时不比对 `born` | Review 标签关掉以后，Review 栏仍按旧记录点亮“正在看的那个 diff”（`bar.js:302-305`） | **（建议）改用 A5 的 `reviewShown`**：标签关掉后不再点亮，和 Details 一致 |

## 待验证（不是结论）

- Details 的 range 菜单在它的 Commits 自己关掉以后，可能不会马上重绘、拿回键盘：`rangeMenu` 渲染时只读 `layers`，没有读任何共享键（`review-details.js:118-119`）。Files 为了这件事专门读 `SUB_CLOSED`。如果宿主是按读到的键来订阅重绘的，这里就是个 bug。A1 的 `subGone` 会顺带修好；修之前在演示窗里用 ← 回放一次确认。
- 栏上的 ▾ 菜单（`underBar`，+1、5）和 t3-chrome 的 surface 菜单（下偏移 6）是 t3-tokens 里写明的有意差别，A1 用 `hang` 的参数保留它们，不算行为变化。

## 实施顺序（第二步）

1. 跑 `scripts/check.sh`，确认基线 `all checks passed`。
2. A9 → A3 → A6 → A5 → A1 → A2 → A4 → A7（每项一个提交）→ A10（随手迁）→ A8（视 t366 而定）。
3. B 部分已经拍板的项，各自单独提交，并在双语 changelog、RECIPE、t3-tokens 里说明。
4. 运行 `scripts/sync.sh`，兄弟仓库各自提交；跑 `check.sh`；在演示窗截图：右键菜单和 Snooze、Files 面包屑菜单、Details 全部菜单、Tabs 计数、Go to、品牌栏和 Review 栏的标记，用默认侧栏宽度。
