# 本轮界面设计审查（2026-11-14）

只看设计，不重复同目录 6 份报告里的功能问题和 [decisions.md](decisions.md) 已定的事。代码以 HEAD `5e69237e` 为准。工作树里有面板重写还没提交的改动，凡是引用的行号都是 `git show HEAD:<file>` 里的行号。

**结论**：没有哪个界面需要推倒重来。问题集中在三类：

1. **跨行对不齐**：上下两行各自照 T3 取值，单看都对，叠在一起就差 4 到 12px。最明显的有三处：工作列右上那对按钮和下面的窗格头，面板头和页头，品牌栏和工作列这两对按钮之间的间距。
2. **同一种按钮有三四套做法**：打开弹层的按钮，在提示、按下、再点、on 态这几件事上各写各的。
3. **少量多余文字**：壁纸预览卡里重复说明的两行，空页的按键提示写法和 Home 不一样。

工作列右上和面板头/页头属于布局级的小改，要动的是间距和归属，不是重新设计。壁纸预览卡需要局部重排层级，其余各块都是小修。

证据：演示窗 `DEMO=/private/tmp/herdr-t3-demo-design-audit`，默认侧栏宽度，zoom 1.1，catppuccin-mocha，2× 屏。整窗截图按 1 逻辑 px = 2.2 设备 px 换算。用户实际窗口（zoom 1，2×）的最后一帧和用户在 Snapzy 里的点验截图也用作证据。下面的数值都由脚本测量图标墨迹的包围盒得出，单位是逻辑 px。截图在 [design-audit/](design-audit/)，不提交。

## 一、设计原则

来源：AGENTS.md、RECIPE.md、`docs/internals/t3-tokens.md`、ADR、`layout-review-2026-11-08*`、`control-consistency-audit/`、`tooltip-audit.md`，以及 T3 源码 `337c5858`。凡是现有文档没写过、由我推断出来的，都标了「待用户确认」。

| # | 原则 | 怎么检验 | 出处 |
| --- | --- | --- | --- |
| P1 | **一列一条边**。同一列里上下相邻的两行，首个图标或文字用同一条左缘，末个控件用同一条右缘。对的是**所在列的内容边**，不是窗口边。 | 截图量左右缘，误差 ≤1px | RECIPE「First icon/word align under the first tab, last control/state 12px from the window edge」。`filter.js` 的注释：「The right edge is the brand bar's above, so the two rows of icons line up」。t3-tokens「品牌栏按钮……才和下一行的按钮对齐」。**推广到面板列和工作列右上角：待用户确认** |
| P2 | **中心一致**。同一条栏里的元素垂直中心相同（40px 栏的中心是 20）。图标在按钮框里居中。同一组按钮尺寸相同。 | 量 cy；同组按钮尺寸一致 | t3-tokens 的按钮表、标题栏按钮。「同组同尺寸」**待用户确认** |
| P3 | **同组同距，组间加大**。同一组里相邻的同尺寸图标按钮间距 4。组与组之间、按钮和文字或输入框之间间距 8。 | 量相邻按钮的中心距 | T3 `PanelLayoutControls` 和 `DiffPanel` 是 `gap-1`，文件头 `FILE_SURFACE_SUBHEADER_CLASS` 是 `gap-2`。整条规则**待用户确认**（见第三节决策 1） |
| P4 | **一套笔画**。UI 图标统一用 Lucide 24 网格、1.75px 笔画。并排的图标视觉重量相近。 | `grep stroke-width`；量墨迹面积 | RECIPE:319「UI icons are own-folder Lucide 24-grid/1.75px」。「视觉重量相近」**待用户确认** |
| P5 | **不写自明或重复的字**。提示只补控件自己说不出的东西：动作名、按键、被截掉的全文、禁用原因。界面上的说明文字不重复标签已经说过的话。 | 逐条问：去掉它会丢掉什么信息 | tooltip-audit R1–R6；用户已决定删掉树行和面包屑的提示。推广到页内说明小字：**待用户确认** |
| P6 | **打开弹层的按钮一种做法**。照侧栏 Filter by space：提示用布局自己的卡片，可以带第二行说明；弹层开着时提示用 `off` 收起；按下时调用 `pressed()`，点击时调用 `justClosed()`，所以再点一次就是关闭；弹层开着时按钮保持 on 态。 | 对照第二节的触发器总表 | 用户 2026-11-14 点验时的要求；参照 `mods/t3-inbox/filter.js:62-119` |
| P7 | **静止时安静，颜色只表达状态**。ghost 按钮和 split 静止时没有底色、没有分隔线。同一条栏上的按钮用同一种悬停面和 on 面。accent 不做按钮的底。 | 看静止截图；看 `surface` 参数 | t3-tokens「按钮」。「同一条栏同一种面」**待用户确认**（决策 3） |
| P8 | **T3 优先，偏离写明**。每个数值都能指到一个 T3 组件；和 T3 不同的地方写进 t3-tokens 的「有意不同」。 | 查 t3-tokens | t3-tokens 规则 1 |
| P9 | **层级从上往下**。卡片和弹层先放标题或内容，再放控件，说明放在最后。 | 看首行是什么 | **待用户确认** |

## 二、用户点验的三处（优先）

### 2.1 成组图标按钮的间距（品牌栏，Snapzy `16-48-27`）

全布局的成组图标按钮如下。中心距 = 按钮尺寸 + 间距，实测值来自截图。

| 位置 | 按钮 | 现间距 | 实测中心距 | T3 对应 | T3 间距 | 代码（HEAD） |
| --- | --- | --- | --- | --- | --- | --- |
| 品牌栏：模式 / 隐藏侧栏 | sm 28 | **0** | 28.2（demo 205.2→233.4；用户窗口 258.8→287.0） | `SidebarThreadHeader` 右侧按钮组（`flex items-center`，相接） | 0 | `t3-chrome/main.js:150-160`（无 gap） |
| Inbox / Spaces 顶行：Filter / New space / New tab | sm 28 | 0（Search 后 4） | 28 | 同上 | 0 | `t3-inbox/filter.js:96-119`、`t3-spaces/main.js:571` |
| 侧栏底栏：Settings / 布局设置 | 32 | 4 | 36 | sidebar footer | — | `t3-chrome/main.js:107` |
| **工作列右上：Details / panel-right** | sm 28 | **4**（靠 `t3-actions` 块的 `pr(4)` 拼出来，两个按钮属于两个 mod 的两个块） | 32.8（demo 1472.0→1504.8；用户窗口 2464→2496） | `PanelLayoutControls` | 4（`gap-1`） | `t3-actions/main.js:286-289`、`t3-tabs/main.js:380-386`、`layouts/herdr-t3.json:96-97` |
| Lists 下工作列右上：+ / panel-right | xs 24 + sm 28 | 4 | 30 | 同上 | 4 | `t3-tabs/main.js:380` |
| 面板头：‹ › / + / 放大 / 隐藏 | xs 24 / sm 28 | 4 | 32（放大→隐藏） | `RightPanelTabs`：标签条 `gap-1`，滚动箭头 `gap-0.5` | 4；箭头 2 | `t3-chrome/main.js:210-219` |
| Files 文件头：Open in 组 / Preview / Wrap / Tree | split 49 + sm 28 | 4 | 25 / 28 / 32 / 32.7（Finder→⌄→眼→换行→树） | `FILE_SURFACE_SUBHEADER_CLASS` | **8**（`gap-2`，每个动作之间都是 8） | `t3-files/main.js:599-604` |
| Files 树头：刷新 / 搜索 / 全部展开 | xs 24 | 4 | — | `FileBrowserPanel` 头 | 4（`gap-1`） | `shared/nav-column.js` |
| Review 顶栏：工具按钮 | xs 24 | 4 | 28.2 | `DiffPanel` 工具组 | 4（`gap-1`） | `extras/mods/review/header.js:72` |
| 窗格头：split / zoom / close | xs 24 | 4 | — | 无对应 | — | `t3-pane/main.js:292` |
| 壁纸切换器：‹ … › + 裁切 × | xs 24 | 4 | 28 | 无对应 | — | `asciicn-wallpaper/main.js:572` |

**现状**：每处单独看都照了 T3。品牌栏 0、工作列 4、文件头 8，分别对应三个不同的 T3 组件。但在 Herdr T3 里，品牌栏和工作列右上落在**同一条 40px 顶栏**的两端，panel-left 和 panel-right 左右镜像：一对中心距 28、按钮相接，另一对中心距 32。所以看起来不像一套东西。

t3-tokens「有意不同」写着「品牌栏按钮之间没有 T3 的 12 间距」，这是读错了 T3。T3 的 `--workspace-titlebar-control-gap: 0.75rem` 是侧栏开关和标题栏内容之间的距离（`ui/sidebar.tsx:228`），不是按钮之间的间距。T3 侧栏头的按钮本来就相接。

**统一规则（初稿；整窗对齐后的完整方案见第五节）**：同一组里的同尺寸图标按钮间距一律 4（T3 `gap-1`）。组与组之间、按钮与文字或输入框之间一律 8（T3 `gap-2`）。具体改法：

- 品牌栏 0 改成 4，Inbox 和 Spaces 顶行的三个按钮也改成 4，这样两行仍然右缘对齐（P1），Search 框相应短 4。归属：**共享控件**，因为 `t3-chrome`、`t3-inbox`、`t3-spaces` 不在这轮的分块里，要另派或由共享控件负责人带上。和 T3 侧栏头相接的写法不同，这一点写进「有意不同」，同时删掉那句关于 12 的误读。
- Files 文件头：Open in 组和后面三个开关之间改成 8（组间），三个开关之间保持 4。归属：**Files**。
- 其余位置已经符合，不用改。

### 2.2 工作列右上的 Details 和 panel-right（Snapzy `16-48-36`）

证据：[01-work-topright-user-guides.png](design-audit/01-work-topright-user-guides.png)（用户窗口，红线是顶栏两个按钮的中心和右缘，蓝线是下面 `7 ⌄` 的数字中心、箭头中心和按钮右缘），[03-work-topright-demo.png](design-audit/03-work-topright-demo.png)。

逐项判断：

| 方面 | 实测 | 判断 |
| --- | --- | --- |
| 尺寸 | 两个都是 sm 28，图标 16（墨迹 14×14 和 13.2–14） | 对，和 T3 `PanelLayoutControls` 一样 |
| 垂直中心 | 两个按钮 cy 19.8–20.0，品牌栏那对也是 20.0 | 对 |
| 到右边缘 | 按钮右缘离窗口 8（demo 8.5） | 本身没问题，问题在和下一行的关系，见下 |
| **图标笔画** | `t3-actions/icons/square-menu.svg` 是 `stroke-width="2"`，旁边 `t3-tabs` 的 panel-right 和品牌栏的图标都是 1.75。另外 `t3-chrome/icons/panel-right.svg` 也是 2：面板打开后，同一个 panel-right 从 1.75 变成 2 | **问题**，违反 P4。这些都是本轮新加的文件（`git diff --name-status origin/main` 显示为 A） |
| **视觉重量** | 墨迹面积：square-menu 626，panel-right 429，panel-left 429，layout-list 445（用户窗口）；demo 里 574 比 399。重了约 45% | **问题**。一部分来自笔画 2，一部分来自图形本身：方框里三条横线，T3 也是这样。改成 1.75 后约重 30%，可以接受 |
| **间距** | 中心距 32，品牌栏那对 28 | **问题**，见 2.1。另外这 4px 是 `t3-actions` 块的 `pr(4)` 和 `tabs-end` 块拼出来的，两个按钮属于两个 mod，以后任何一边改 padding 都会漂 |
| **悬停面和 on 面** | 这两个按钮都传 `surface: "card"`（foreground 7%/12%），同一条栏另一头的品牌栏按钮和面板头按钮用 `chrome`（`hover`/`selected`） | 不一致，违反 P7。t3-tokens 明文规定这两个用 card，所以列为决策 3 |
| **和下面 `7 ⌄` 的对齐** | 下一行是窗格头。子 agent 入口的右缘离窗口约 12.5（RECIPE 规定窗格头末个控件离窗口边 12），顶栏按钮的右缘是 8，差 4.5。箭头中心 2491，panel-right 中心 2496，差 5。数字 `7` 的中心 2476，Details 的中心 2464，差 12 | **问题**，违反 P1。差 4 到 5px 的「几乎对齐」，比明显不对齐更显眼 |
| 和品牌栏那对的关系 | 品牌栏那对的右缘离侧栏边 8，正好和下一行 Inbox 顶行的右缘对齐，这是有意做的。工作列这一对没有和它下面那一行对齐 | 两端用的规则不同 |

**改法**：

1. square-menu 和 `t3-chrome` 的 panel-right、plus、chevron-left/right 改用 1.75 笔画。`t3-actions` 的 laptop、folder、app-window，以及 `t3-files` 的 folder、app-window 也是 2，一起改。归属：**Details**（`t3-actions/icons`）、**面板**（`t3-chrome/icons`）、**Files**（`t3-files/icons`）。可以在 `scripts/check.sh` 里加一条：UI 图标的 `stroke-width` 只能是 1.75，品牌图标列白名单。
2. 两个按钮合成**一个组**，由一个块画（建议放进 `tabs-end`；Details 弹层仍由 `t3-actions` 打开），组内间距由 2.1 的规则统一决定。归属：**面板**（`tabs-end`）＋ **Details**（入口）。
3. 顶栏这一组的右缘和窗格头的右缘对齐：`tabs-end` 的 `pr` 从 8 改成 12，这样顶栏按钮的右缘和窗格头末个控件的右缘都在离窗口 12 的位置。中心没法对齐，因为子 agent 入口宽度随数字变，所以只要求右缘对齐（P1）。面板打开时，按钮移到面板头，按 2.3 处理。归属：**面板**。
4. 悬停面和 on 面按决策 3 统一。

### 2.3 打开弹层的按钮（Snapzy `16-49-44` 与 `16-49-58`）

Details 现在的问题：

- 提示「Details (⇧⌘B)」在弹层开着时还盖在弹层上，因为 `tip(..., { action, below })` 没有传 `off`。
- 按下时调用的是 `stopPress`，不是 `pressed()`。所以 `justClosed()` 永远返回 false：第二次点击时，原生弹层先因为外部按下而关掉，`detailsClosed` 把 `detailsOverlay` 清空，接着 click 到达，`toggleDetails` 又把它打开，看起来就是闪一下重新打开。
- 点击时没有把 `hot` 清掉。

代码在 `t3-actions/main.js:289-291`、`workspace-details.js:76-98`。

全布局打开弹层或菜单的按钮，和 Filter 的做法逐项对照。Filter 的做法：提示是卡片加第二行说明，开着时 `off`；按下 `pressed()`，点击 `justClosed()`；开着时 on。Filter 本身是视图内的 `Popover`，再点关闭由组件负责；同文件里的 Search 和 New tab 打开原生弹层，用的就是 `pressed`/`justClosed`。

| 触发器 | 代码（HEAD） | 弹层 | 提示 | 开着时收起提示 | 按下 `pressed` | 再点关闭 | 开着时 on | 与 Filter 的差异 | 归属 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Details 按钮** | `t3-actions/main.js:289-291` | 原生 popup | 有，带按键 | ✗ 盖在弹层上 | ✗ 用的是 `stopPress` | ✗ 闪一下重开 | ✓ | 缺 off、`pressed`、`hot=null` | Details |
| 面板 + | `t3-chrome/main.js:190-200` | 原生 popup | 有，带按键 | ✗ | ✓ | ✓ | ✗（`on` 只给 panel-close 和 wide） | 缺 off、on | 面板 |
| Details · Open in ⌄ | `workspace-details.js:198-199` | 子 popup | 无，只有 aria（已决定） | — | ✓ | ✓ | ✓ | 一致 | Details |
| Details · Actions ⌄ | `t3-actions/main.js:96-101` | 子 popup | 无，只有 aria | — | ✓ | ✓ | ✓ | 一致 | Details |
| Details · Quick Review 行 | `review-details.js:24-27` | 子 popup | 无（文字行） | — | ✓ | ✓ | ✓ | 一致 | Details |
| Details · Choose what to show 行 | `workspace-details.js:209-211` | 子 popup | 无 | — | ✓ | ✓ | ✗ | 缺 on | Details |
| 标签栏 Actions ⌄（`details: false` 的布局） | `t3-actions/main.js:78-88` | popup | 无 | — | ✓ | ✓ | ✗（只有 hover 底） | 缺 on | Details |
| 子 agent 入口 `N ⌄` | `t3-pane/main.js:187-205` | popup | 有（数量） | ✗（点击时清了 `hot`，指针再动提示又会出来） | ✓ | ✓ | ✓ | 缺 off | 子 agent |
| Inbox 面包屑标题 ⌄ | `t3-tabs/main.js:577-606` | t3-menu popup | 只在截断时给 | ✗ | ✓ | ✓ | ✗（箭头只在悬停时显示，菜单开着时标题不亮） | 缺 off、on | 面板（`t3-tabs` 在面板重写范围里）或共享控件 |
| Files · Open in ⌄ | `t3-files/main.js:611-626` | **视图内菜单**，已决定改成原生 popup | 无，只有 aria（已决定） | — | ✗ | 靠视图内的遮罩挡住（审计 H1） | ✓ | 迁到原生 popup 后必须补 `pressed`/`justClosed` | Files |
| Files · 面包屑 › | `t3-files/main.js:589-593` | 视图内菜单，同上 | 无（已决定） | — | ✗ | 同上 | ✗（只有悬停时 7% 底） | 缺 on，迁移时补齐 | Files |
| Review · 范围按钮、base 按钮 | `review-scope.js:252`、`:286`；`review/main.js:277-299` | 视图内 popover | 无（文字按钮） | — | ✗：用的是第三套写法，`closedPopup` 加 300ms 时间窗 | ✓ | ✓ | 机制不同，行为接近 | 共享控件迁移时一起换 |
| Review · 折叠、设置等图标按钮 | `review/header.js:72-77`（`ghostButton`） | 视图内 popover | **无**（`ghostButton` 不带提示，这里也没有包 `tip`） | — | ✗ | 同上 | ✓（`on: b.active`） | 图标按钮缺提示（违反 tooltip-audit R1） | 共享控件 |
| Agents 排序 | `t3-agents/main.js:281-293` | popup | 有 | ✗ | ✓ | ✓ | ✗ | 缺 off、on | 共享控件（不在本轮） |
| Inbox/Spaces New space、New tab | `filter.js:105-119`、`t3-spaces/main.js:573-580` | 顶部居中 popup | 有 | ✗ | ✓ | ✓ | ✗ | 缺 off。弹层不挂在按钮下，on 可以不要 | 共享控件（不在本轮） |
| Inbox Search | `filter.js:100-104` | Go to | 无（自带文字） | — | ✓ | ✓ | ✗ | 同上 | — |
| 品牌栏 Home / 模式 / 隐藏 | `t3-chrome/main.js:136-160` | 不开弹层 | — | — | — | — | — | 不适用 | — |
| 壁纸 + | `asciicn-wallpaper/main.js:579` | 视图内添加卡片 | **无** | — | ✗ | ✓（切换） | ✗ | 图标按钮缺提示，开着时缺 on | 壁纸 |
| 壁纸 裁切 | `asciicn-wallpaper/main.js:580-582` | 视图内预览卡 | **无** | — | ✗ | ✗（再点不关） | ✗ | 缺提示和 on，没有再点关闭 | 壁纸 |
| 壁纸 ×（删除） | `asciicn-wallpaper/main.js:583` | 确认对话框 | 无 | — | — | 对话框是模态，不适用 | — | 缺提示 | 壁纸 |

**给共享控件负责人的建议**：在 `shared/button.js` 里加一个触发按钮，例如 `trigger(view, t, id, { icon|text, label, hint, action, open: () => boolean, closedKey, place: (bounds) => void })`。它把下面这些事一次做完：

- 提示卡片，可以带 `hint` 第二行；`off: open()`。
- `on_mouse_down` 时调用 `pressed(view)` 并记下 `e.bounds`。
- `on_click` 时：先 `hot = null`；如果 `justClosed(view, closedKey)` 就返回；否则调用 `place(bounds)`。
- `on: open()`。

视图内的菜单（Files、Review、壁纸）按决定会改成原生 popup，迁过去以后也用这个按钮。Review 的 300ms 时间窗随之删掉。

## 三、按重写块分组的问题清单

严重度：**高**＝用户已经看出来，或者一眼可见；**中**＝对照 T3 或相邻区域时能看出；**低**＝打磨。每条都写明违反哪条原则。

### 共享控件

1. **高** 打开弹层的按钮有四套写法（2.3 的表）。做一个共享触发按钮，然后统一迁移。违反 P6。
2. **高** 成组按钮的间距没有统一规则（2.1）。由共享控件负责人把规则写进 t3-tokens，并带上品牌栏和 Inbox/Spaces 顶行的改动。违反 P3。
3. **中** 图标笔画：本轮新加了 10 个 `stroke-width="2"` 的 UI 图标（`git diff --name-status origin/main` 中的 A），全仓其余 168 个是 1.75。在 `check.sh` 里加检查。违反 P4。
4. **低** `ghostButton` 不带提示，导致 Review 顶栏的图标按钮没有提示。共享触发按钮或 `ghostButton` 应该强制给一个 label 提示。违反 P5 和 tooltip-audit R1。

### 面板

1. **高** 工作列右上那一对按钮：笔画、分成两个块、和窗格头差 4.5px（2.2）。违反 P1、P3、P4。
2. **高** **面板头和页头不在一条网格上**。截图 [06-files-header-demo.png](design-audit/06-files-header-demo.png)、[12-panel-head-vs-header.png](design-audit/12-panel-head-vs-header.png)：
   - 面板头首个标签的图标离卡片左缘 8.6，下面面包屑首字离卡片左缘 13.6。
   - 面板头末个按钮（panel-close，on 态的实心方块）的右缘贴着卡片右缘（0），下面文件头末个按钮（树开关，同样是 on 态的实心方块）的右缘离卡片右缘 11.8。
   - 结果是两块 on 态的方块上下错开 12px。

   改法：面板头左右各内缩，让首个标签图标落在 14（标签条 `pl` 约 6），末个按钮的右缘落在卡片内 12，和文件头 `px(12)` 对齐。Review 顶栏是 `px(8)`，和 Files 差 4：切换页面时右侧按钮会跳 4px。建议统一成 12，或者两页都以 8 为准（决策 2）。违反 P1。
3. **中** 面板的 + 菜单开着时，+ 没有 on 态，提示也没有收起（2.3）。违反 P6。
4. **中** 空页「Open a surface」（[05-panel-empty-demo.png](design-audit/05-panel-empty-demo.png)）：
   - 行尾的按键 `F`/`R` 是 12px 暗色的纯字母，而 Home 的同类列表用 20px 键帽（RECIPE Home「keycaps right」），T3 `RightPanelEmptyState` 也用 `<Kbd>`。改成键帽。违反 P3、P8。
   - 标题用了 `muted`，T3 是 `text-foreground`。
   - 行内边距：T3 是横 10、间距 10、圆角 8（`--control-radius`），我们用的是菜单行的 8/8/4。
   - T3 用 `pb-(--workspace-topbar-height)` 把这组内容上移 40，让它在整列居中；我们是在面板体里居中，比 T3 低约 20。
5. **低** 溢出箭头 xs 24 和放大按钮 sm 28 挨在一起，尺寸混用（[panel-surfaces/05-overflow.png](panel-surfaces/05-overflow.png)）。箭头按决定挪到右侧并排以后，应该和放大、隐藏之间用组间距 8 隔开，组内间距 2（T3 `gap-0.5`）。违反 P3。

结论：**布局级小改**。不用重新设计；面板头的内边距是整个面板的网格基准，要先定下来。

### Details

1. **高** Details 按钮的提示盖住弹层，再点会重开（2.3）。违反 P6。
2. **中** 图标笔画：square-menu、laptop、folder、app-window 都是 2。违反 P4。
3. **中** Quick Review 范围子菜单（[07-quick-review-menu.png](design-audit/07-quick-review-menu.png)，用户截图 `16-33-52`）：
   - 行尾写法四种：「0 ahead of main」「1 file」「↑31」「↓0」。建议统一成「数字＋单位」或者只写数字，方向已经由行名说明。违反 P5。
   - 当前范围为 0 时，勾选落在一行变灰的禁用行上（「✓ Uncommitted 0 files」整行 64%）。当前项应当保持正常不透明度，只给其他为 0 的行变灰。这条要和 Review 的范围菜单一起改（`shared/review-scope.js`）。
4. **低** 机器行（锁定、不可点）和下面两行可点的行，字重、颜色完全相同（[04-details-open-demo.png](design-audit/04-details-open-demo.png)）。T3 也是这样，保留，只记录在这里。

结论：**小修**。

### Files

1. **中** 文件头里 Open in 组和三个开关之间间距 4，T3 是 8（2.1）。加上 split 的箭头半宽是 20，中心距成了 25/28/32/32，读起来不齐。改成组间 8 以后，Open in 读作一组，开关读作另一组。违反 P3。
2. **中** 面包屑的 › 在它的菜单开着时不亮；迁到原生 popup 时，按 2.3 用共享触发按钮。违反 P6。
3. **低** 文件头那一行（面包屑 28 高，下距 12）和树头那一行（36 高）不在同一条基线上，内容区左右两栏顶部错开（[06-files-header-demo.png](design-audit/06-files-header-demo.png)）。T3 的 inline 模式也是这样，可以保留，记一笔。
4. **低** 预览/代码开关处于 on 态时显示的是「目标」图标 `</>`，和 T3 一致，保留。

结论：**小修**。树的视觉（[files-panel-shots/04](files-panel-shots/04-file-main-js.png)）和 T3 Pierre 对齐，没有发现问题。

### 子 agent

1. **高** 入口 `N ⌄` 和上面顶栏按钮差 4.5 到 12px（2.2）。顶栏按 2.2 改了以后，这里不用改；先确认窗格头末个控件确实离窗口 12。违反 P1。
2. **中** 弹层开着时提示没有收起（2.3）。违反 P6。
3. **低** 弹层每行图标右边那 16px 空洞，按决定会删掉（不在弹层里折叠）。删掉后名字从 `图标 + 8` 开始，可以多显示约 5 个字（[08-sub-agent-popup.png](design-audit/08-sub-agent-popup.png)）。

结论：**小修**。

### 壁纸（依据 worktree 的重写截图 `wallpaper-rewrite-shots/`）

1. **中** 预览卡的层级颠倒（[09-wallpaper-preview.png](design-audit/09-wallpaper-preview.png)）：模式分段控件（Dots/Braille/Blocks/Quadrants）放在标题「Preview wallpaper」**上面**，卡片第一眼看到的是一排控件。建议顺序改成：标题，名字，模式，Fill/Fit，Zoom，按钮。RECIPE 说「top row always offers Dots…」，所以这是改规格，见决策 4。违反 P9。
2. **中** 状态区常驻两行说明「Fill crops to fill; Fit shows the whole picture. Drag or use arrow keys; Shift moves faster.」：
   - 第一句把 Fill/Fit 这两个标签再念一遍，可以删掉。Fill/Fit 分段的 aria 已经有完整说明。
   - 第二句是拖动和按键提示，可以留着，也可以放进画布的提示里。
   - 下面固定 60px 的状态区平时大半空着。

   违反 P5。
3. **中** 切换器上 ‹ › + 裁切 × 都是只有图标的按钮，没有提示（2.3 表）。+ 开着添加卡时没有 on 态。违反 P5（R1）和 P6。
4. **低** 「Quadrants」在 4 等分的分段里几乎贴着分段边缘；RECIPE 已经规定窄卡里写「Quads」。300px 卡片的默认宽度下也建议用「Quads」，或者把分段的横向内边距从 3 加到 6。
5. **低** 添加卡（[10-wallpaper-add-card.png](design-audit/10-wallpaper-add-card.png)）开头一句「Turn your image into character art, in your theme's colours.」是介绍性的话，和标题「Add a wallpaper」加第一个按钮「Choose image…」的信息重复。可以删掉。违反 P5。
6. **低** 预览卡（300 宽）的左缘和切换器的左缘差约 9。右缘已经对齐，左缘可以不管。

结论：预览卡**局部重排层级**，切换器和添加卡小修。

## 四、需要用户拍板的设计决策

1. **成组图标按钮的间距规则**（用户要求放到整窗按列对齐里一起定，方案见第五节；下面三项是当时的初稿）
   - **（建议）同组 4、组间 8，全布局一条规则**：品牌栏和 Inbox/Spaces 顶行改成 4，Files 文件头组间改成 8。理由：品牌栏和工作列在同一条顶栏的两端，左右镜像，间距应当相同。4 和 8 正是 T3 `gap-1`/`gap-2` 的用法。和 T3 侧栏头按钮相接的写法不同，写进「有意不同」。
   - 全部照各自的 T3 组件（现状，只把 Files 头改成 8）：保持 T3 原样，但品牌栏和工作列仍然一个 28 一个 32。
   - 全部改成相接（0）：最紧凑，但和 T3 的 `PanelLayoutControls`、`DiffPanel` 都不一样。
2. **面板列的网格基准**
   - **（建议）卡片内 12**：面板头首个标签图标、末个按钮，Files 文件头，Review 顶栏，都以卡片内 12 为边。理由：T3 文件头是 `px-3`；Review 顶栏改动最小，从 8 改成 12。
   - 卡片内 8：Files 文件头从 12 改成 8，偏离 T3 的 `px-3`。
3. **顶栏按钮的悬停面和 on 面**
   - **（建议）同一条 40px 栏上全部用 `chrome` 面**：Details 和 panel-toggle 从 `card` 改成 `chrome`，和品牌栏、面板头一致，t3-tokens「详情与面板入口」那句随之改。理由：t3-tokens 自己的规则就是「ghost 的底随它所在的面」，这两个按钮在 chrome 上。
   - 保留 card：维持现在的文档，接受同一条栏上有两种底。
4. **壁纸预览卡顺序**
   - **（建议）标题在先，然后是名字、模式、取景、按钮**，RECIPE「top row always offers…」改成「first control row」。理由：P9；按钮的固定位置不受影响。
   - 保留模式行在最上：模式是最常切换的控件，放在顶部离指针最近。
5. **原则 P1、P3、P4、P5、P7、P9 中标「待用户确认」的推广部分**
   - **（建议）全部采纳，写进 t3-tokens 的「规则」一节**，供以后每块重写自查。
   - 只采纳 P1 和 P6，其余继续按组件逐个对照 T3。

## 五、整窗对齐方案（决策 1 补充，2026-11-14）

用户点验截图 Snapzy `17-01-23` 里有品牌栏那对按钮、下面的 Filter / New space / New tab，还有卡片的「! Needs you」和「Done」。用户的意思是：间距不能逐条栏单独定，要在整个窗口里看，上下行按列对齐。

下面先列整窗的纵向对齐线，再给一套同时满足「按列对齐」和「同组同距」的值。

### 5.1 测量方法和记号

- **侧栏**：用户窗口（zoom 1，侧栏宽 309.5）。
- **工作列**：用户窗口，窗格头处于悬停态（`⊡ ⊟ ⤢ × 7 ⌄`）。
- **面板列**：演示窗截图（zoom 1.1），Details 和面板标签那几张；面板打开时的工作列用的是 `panel-surfaces/02`。

位置一律写成**离所在列右边缘的距离**，单位是逻辑 px，负号表示往里。所在列的右边缘分别是：侧栏是侧栏右边线，工作列是窗口右边（面板打开时是分隔线），面板是面板卡片的右边。

- 「框」= 按钮或卡片的背景框。
- 「中心」= 图标墨迹中心。
- 「墨右」= 墨迹的右缘。

示意图：[13-sidebar-columns-user.png](design-audit/13-sidebar-columns-user.png)、[14-sidebar-shelves-user.png](design-audit/14-sidebar-shelves-user.png)（红线 −8 是框边，黄线 −16 是内容右缘，蓝线 −22/−50 是图标列），以及 [01-work-topright-user-guides.png](design-audit/01-work-topright-user-guides.png)。

### 5.2 现状：整窗的纵向对齐线

**侧栏**

| 线 | 元素 | 现在 | 差 |
| --- | --- | --- | --- |
| S-框（−8） | 品牌栏隐藏按钮框右缘 | −8.5 | — |
| | 顶行 New tab 框右缘 | −8.0 | 0.5 ✓ |
| | 卡片背景右缘 | −8.5 | 0 ✓ |
| S-图标列 1（中心 −22.5） | 品牌栏 panel-left | 中心 −22.5 | — |
| | 顶行 New tab | 中心 −22.0 | 0.5 ✓ |
| | Working / Snoozed / Settled 的折叠箭头 | 中心 −22.5 | 0 ✓ |
| | 卡片的程序图标 | 中心 −25.5 | **3** ✗ |
| S-图标列 2（中心 −50.5） | 品牌栏模式按钮 | 中心 −50.5 | — |
| | 顶行 New space | 中心 −50.5 | 0 ✓ |
| S-内容右缘 | 按钮图标墨右 | −16.0（New tab −15.0） | — |
| | 卡片状态文字（「1h」「Working 10m」「Needs you」「Done」） | 墨右 −19.0～−19.5 | **3～4.5** ✗（就是截图里 Needs you、Done 比上面图标短一截） |
| | 卡片程序图标 | 墨右 −21.0 | **5** ✗ |
| S-左缘 | Search 图标、卡片头像、Working 标签、底栏齿轮 | 墨左 17～18 | ≤1 ✓ |

结论：侧栏上面两行按钮已经按列对齐（都是相接、都是 28），不对齐的是卡片内容。卡片横向内边距 10（`t3-inbox/row-view.js:161`、`:210`），比按钮图标的内缩（框 6＋墨迹约 2）多 2～4。

**工作列**

| 线 | 元素 | 现在 | 差 |
| --- | --- | --- | --- |
| W-末端（面板关） | 顶栏 panel-right 框右缘 | −8 | — |
| | 窗格卡片右缘 | −8 | 0（外框对齐） |
| | 窗格头末个控件「7 ⌄」框右缘 | −12（RECIPE 规定） | **4** ✗ |
| W-末列中心 | 顶栏 panel-right | 中心 −22 | — |
| | 「7 ⌄」的箭头 | 中心 −27 | **5** ✗ |
| W-第二列 | 顶栏 Details | 中心 −54（节距 32） | — |
| | 「7」 | 中心 −42 | 12（入口宽度随数字变，这一列不可能对齐） |
| W-末端（面板开） | 顶栏 Details 框右缘 | −4.4（离分隔线） | 比窗格卡片右缘（−8.2）**多伸出 3.8** ✗；比窗格头末端（−12）差 **7.6** ✗ |

**面板列**（以面板卡片右边为 0）

| 线 | 元素 | 现在 | 差 |
| --- | --- | --- | --- |
| P-末端 | 面板头 panel-close 框右缘 | 0（贴着卡片边） | — |
| | Files 文件头树开关框右缘 | −12 | **12** ✗ |
| | Review 顶栏末个按钮框右缘 | −8（`header.js:66` `px(8)`） | **8** ✗ |
| P-末列中心 | 面板头 panel-close | 中心 −14 | — |
| | Files 树开关 | 中心 −26 | **12** ✗ |
| | Review 导航开关（xs 24） | 中心 −20.5 | **6.5** ✗ |
| P-第二列中心 | 面板头放大 | 中心 −46.6 | — |
| | Files 换行 | 中心 −58.4 | **11.8** ✗ |
| | Review 设置 | 中心 −48.4 | 1.8（节距 28 和 32 不同，碰巧接近） |
| P-左缘 | 面板头首个标签的框 | 0（贴着卡片边） | — |
| | Files 面包屑框（文字在 +14.6） | +12 | **12** ✗ |

**顶栏和第二行的横向中心**（附带）：三条顶栏的 cy 都是 19.5～20.2 ✓。第二行里，侧栏顶行 cy 55.5，窗格头 cy 55.8，Files 文件头 cy 53.6（高 2），Review 顶栏按钮 cy 59.1（低 3.6）。

### 5.3 两条要求会不会冲突

「按列对齐」要满足三件事：上下两行最末端那个框的右缘相同，按钮尺寸相同，间距相同。这样从右往左数，每一列的中心都会重合。所以「同组同距」本身就是按列对齐的前提，两者不冲突。

真正的约束只有三处：

1. **宽度会变的元素**：「7 ⌄」、Settled 的「Clear 3 ›」、卡片的状态文字。只能对齐右缘或末列的中心，往左的列对不上。方案只要求它们的末列对齐。
2. **尺寸混用**：Review 顶栏用 xs 24，面板头和文件头用 sm 28，节距 28 对 32，越往左差得越多。T3 `DiffPanel` 的工具按钮其实是 `icon-sm`（28）（`DiffPanel.tsx:1135`、`:1155`），我们的 24 本身就偏离了 T3。
3. **侧栏顶行和品牌栏必须同距**。它们已经对齐；改间距时两行要一起改。它们和工作列、面板之间没有上下关系，间距本来可以不同，但这两对按钮在同一条顶栏的两端、左右镜像，用户看到的正是两边不一样。

### 5.4 方案

三套方案共用下面的**对齐规则**，只在间距值上不同：

- **R1 末端对齐**：顶栏末端按钮的框右缘，对齐它下面那一列第一行内容的末端控件框右缘。
  - 侧栏：对齐顶行，−8，已满足。
  - 工作列：对齐窗格头末端，−12。面板打开时，Details 也按 −12 放。
  - 面板：对齐页头，卡片内 −12（用户已定）。
  - 左侧同理：面板头首个标签的框，和页头的面包屑框，都在卡片内 +12。
- **R2 列内同尺寸**：上下对齐的两行用同一尺寸的按钮。Review 顶栏的图标按钮改成 sm 28，回到 T3 `icon-sm`。Lists 下工作列的 + 跟同组的 Details 和 panel-toggle 一样改成 28。
- **R3 内容右缘**：侧栏卡片和行的内容右缘，对齐按钮图标的墨右（−16）。卡片和 slim 行的横向内边距从 10 改成 8。这样程序图标中心落在 −22，正好在图标列 1 上；左缘落在 16，和 Search 图标（墨左 17）、底栏齿轮在同一条线上。

**方案 A（建议）：全窗口同组 4、组间 8，加上 R1–R3**

| 位置 | 改动 | 改后（中心，离列边） | 对齐结果 | 归属 |
| --- | --- | --- | --- | --- |
| 品牌栏 | 两个按钮之间 0 改成 4 | −22 / −54 | 与顶行同列 | 侧栏（`t3-chrome`；不在本轮五块里，建议交共享控件负责人顺带做，或另派） |
| Inbox / Spaces 顶行 | 三个按钮之间 0 改成 4；Search 和按钮之间仍是 4（组间）；Search 框短 8 | −22 / −54 / −86 | 与品牌栏同列 | 侧栏（`t3-inbox/filter.js`、`t3-spaces/main.js`），同上 |
| 卡片、slim 行 | `px(10)` 改成 `px(8)` | 状态文字墨右 −16；程序图标中心 −22 | 与按钮图标墨右、图标列 1 对齐 | 侧栏（`t3-inbox/row-view.js`），同上 |
| 收纳区标题 | 不动 | 箭头中心 −22.5 | 已对齐 | — |
| 工作列顶栏 | Details 和 panel-right 合成一组，组内 4，右内边距 8 改成 12；面板打开时 Details 也离列边 12 | panel-right −26，Details −58 | panel-right 和「7 ⌄」的箭头（−27）差 1；框右缘和窗格头末端都在 −12 | 面板（`tabs-end`、`layouts/herdr-t3.json`）＋ Details（`t3-actions` 入口） |
| Lists 下工作列 | + 改成 sm 28，与 Details、panel-toggle 同组同距 | — | 同尺寸 | 面板 |
| 面板头 | 左右各内缩 12（标签条和末端按钮） | close −26，放大 −58 | 与 Files 树开关、换行同列 | 面板 |
| Files 文件头 | 三个开关之间保持 4；Open in 组和开关之间改成 8 | 树 −26，换行 −58，眼 −90 | 与面板头同列 | Files |
| Review 顶栏 | `px(8)` 改成 `px(12)`；图标按钮 xs 24 改成 sm 28 | 导航 −26，设置 −58 | 与面板头同列 | Files（Review 页和 Files 一起由 Files 块统一，两棵树已经归它） |
| 窗格头、子 agent 入口 | 不动（RECIPE 已定 −12） | — | 由顶栏去对齐它 | — |
| 第二行横向中心（可选） | Files 文件头和 Review 顶栏的 cy 调到 56 | — | 和侧栏顶行、窗格头同一水平线 | Files |

理由：

- 全窗口只有一个间距值（4）和一个组间值（8），所有上下对齐的行自然同列。
- 品牌栏和工作列这两对按钮节距都是 32，左右镜像。这是用户最初指出的问题。
- 代价是侧栏顶行和 T3 侧栏头的相接写法不同（写进「有意不同」，并删掉那句关于 T3 12 间距的误读），Search 框短 8。默认侧栏宽 256 时，Search 文字区还有约 100。

**方案 B：侧栏保持相接（0），其余用 4，加上 R1–R3**

- 侧栏两行都是 0，已经对齐，只改卡片内边距。
- 工作列、面板、Files、Review 照方案 A。
- 优点是侧栏改动最小，侧栏头仍然照 T3。
- 缺点是品牌栏那对节距 28、工作列那对节距 32，左右不镜像，用户最初看到的问题还在。

**方案 C：全部相接（0），加上 R1–R3**

- 工作列、面板头、文件头、Review 顶栏的按钮都改成相接，节距 28。
- 两对按钮镜像，侧栏不用改。
- 缺点是和 T3 `PanelLayoutControls`、`DiffPanel`、文件头都不一样；悬停底色一块接一块，按下的 on 态方块会连在一起；面板头的 + 和溢出箭头也要跟着改。

**建议 A**：它是唯一一个同时满足「两端镜像」「全窗口一个间距」「上下按列对齐」的方案，代价只落在侧栏头那一处偏离 T3。

### 5.5 改完后的验收

整窗截图，默认侧栏宽 256，zoom 1 和 1.1 各一张。量这几条线，误差都应 ≤1px：

- 侧栏 −8、−16、−22、−54。
- 工作列 −12、−26（面板开和关各量一次）。
- 面板卡片内 −12、−26、−58，以及左侧 +12。

悬停窗格头时，「7 ⌄」的箭头应该在 panel-right 正下方。

## 六、未检查项

- **悬停、按下、菜单打开态**：演示窗只能用 `herdr-app do` 驱动，看不到悬停底色、split 的中线、Files 和面包屑菜单、壁纸卡片的打开态。这部分用的是之前审查的截图、用户的 Snapzy 截图和代码推算。
- **Files 树在演示窗里一直显示「Loading files…」**：窗口不在前台时不读取（已决定的行为）。树的视觉用的是 `files-panel-shots/` 里的旧截图（HEAD 前一版）。
- **Review 页**：只看了旧截图里的顶栏（端口被占用的错误态），没有看到真实的 diff、分组标签、导航树，也没有看 Review 树改用 Pierre 图标之后的样子（还没实现）。
- **壁纸**：用的是 worktree 重写分支的截图，不是 HEAD 上的壁纸，也没有起壁纸场景。
- **子 agent**：用的是 `sub-agent-menu/` 里的截图，那张截图窗口只有 801pt 宽。入口的右缘离窗口 12 这一点，是用用户窗口的墨迹位置推算的，误差约 1px。
- **其他条件**：浅色主题、窄窗口、远程 space、Lists 模式下工作列右上（+ 和 panel-toggle 尺寸混用），都没有截图。
- **面板正在 main 上重写**：工作树里未提交的改动没有审查，行号以 HEAD 为准。
- **第五节**：侧栏和工作列用的是用户窗口的最后一帧（侧栏 309.5 宽，不是默认的 256）。卡片里的「Needs you」「Done」没有出现在这一帧里，按同一状态槽「1h」「Working 10m」的右缘推算。补做的演示窗被 OmniWM 排到了屏幕外，只出旧帧，所以没有用它，已经 `down`。Lists 下 Agents 行的右缘、窄侧栏、zoom 1.25 都没有量。

清理：演示窗已 `down`，`/private/tmp/da*` 临时文件已删除。只新增了本文件和 `design-audit/` 下的截图，没有改代码，没有提交。
