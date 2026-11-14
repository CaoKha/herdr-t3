# 重写审查：共享控件与设计系统一致性

日期：2026-11-14。基线 `origin/main`=`9a9fd18c`，HEAD=`524ef4a6`。只读审查，没有改代码。
范围：`dd152b27`（共享部分）、`8605edbd`、`e48beda5`、`e3268ccb`、`524ef4a6`、`07e96a64`。代码看的是 `shared/` 源：`button.js`、`file-menu.js`、`submenu.js`、`list.js`、`nav-column.js`、`panel-states.js`、`tip.js`、`measured-text.js`、`review-menu.js`/`review-scope.js`（只看菜单行部分）。另外看了各 mod 怎么调用它们。
对照的 T3：`/private/tmp/t3code-terminal-research` @ `09a54f01`（`chat/threadDetailsPanelStyles.ts`、`ThreadDetailsControl.tsx`、`OpenInPicker.tsx`）。

## 1. 结论

**局部修。菜单行要整块重做。** 底层几个共享件做得对，可以保留：`button()`、`split()`、`list.js` 的 `scrollList`/`menuJump`、`submenu.js`、`focus.js` 的 `pressed`/`justClosed`。问题出在共享件没管到的地方，主要是两样：

- **菜单行**：同一条规则「行只在指针停在上面时点亮，晚到的 leave 不熄灭下一行」，在 7 个地方各抄了一份，还有 2 个菜单根本没照做。
- **tooltip**：有两套画法，禁用原因的提示也分成两种做法。

本轮每个 fix 提交都是「发现一处不一致 → 就地补一处」，没有把规则收进共享层。

## 2. 问题清单（按严重度）

### 高

**H1 菜单行没有共享件：同一规则抄了 7 份，另有 2 个菜单不一致**

- 抄写处（`to = on ? i : at === i ? -1 : at`，一字不差）：
  - `shared/file-menu.js:119-123`
  - `shared/review-scope.js:379`
  - `mods/t3-actions/workspace-details.js:22`（`litRow`）
  - `mods/t3-actions/main.js:115`
  - `mods/t3-chrome/main.js:239`
  - `mods/t3-menu/main.js:325`
  - `mods/t3-inbox/snooze.js:279`
- 没照做的：
  - `mods/t3-pane/main.js:158-160`：子 agent 列表只在 enter 时点亮，指针离开后那行一直亮着。
  - `mods/t3-actions/workspace-details.js:184`：directoryMenu 的 Copy full path 用宿主 `.hover()`。这样键盘点不亮它，也不受「晚到 leave」的保护。
- 行的几何也是各写各的。`h(28).px(8).gap(8).rounded(4).text_size(14)` 加 `bg(t.selected)` 加禁用透明度，至少在下面这些文件里各写一遍：`shared/file-menu.js`、`shared/review-scope.js`、`mods/t3-actions/{main,workspace-details}.js`、`mods/t3-chrome/main.js`、`mods/t3-menu/main.js`、`mods/t3-pane/main.js`、`mods/t3-inbox/snooze.js`。看 `grep -rn "h(28).px(8)\|h(MENU_ROW).px(8)"` 的输出。
- 这样的后果：`8605edbd` 的提交信息说「as the other menus do」，可它只改了 5 处。审计（`control-consistency-audit/sub-agents-and-shared.md` #4、#6、#7）抓到的 surface 菜单问题，也全是「这一处行没照 t3-menu 画」。下一次改行的样子，还得再改 9 处。ADR 0016 当初给按钮立 helper 的理由（「靠复制守不住」），放在菜单行上一样成立。
- 证据：上面的 grep 结果；`shared/check-file-menu.cjs` 只锁住了 file-menu 这一份，其余 6 份抄写没有测试。

### 中

**M1 子菜单的定位：注释和 CHANGELOG 都说「不会盖住来源菜单」，窄页面上并不成立**

- 位置：`shared/file-menu.js:74-79`，`CHANGELOG.md:7`（「it no longer covers the menu it opened from」）。
- 现象：`place()` 先用 `subPlace` 选左边还是右边，然后又把 x 夹回 `[4, width-224]`。如果两边都放不下，夹完以后子菜单就压在父菜单上。
- 反例：页宽 464（panel 的 min 是 480，减去 padding），菜单从 x=150 打开。这时 level1 落在 4..224，盖住了 level0（150..370）左侧 74px，打开它的那一行的图标和名字开头都被盖住。复现脚本：`shared-controls/submenu-overlap.cjs`，输出见 `shared-controls/submenu-overlap.txt`。
- 这不是本轮引入的回归，旧的「最少重叠」算法给出的位置一样。问题在于注释、测试名和 CHANGELOG 写的保证是假的，测试里只放了宽页的用例。

**M2 tooltip 两套画法，禁用原因也是两种做法**

- `shared/tip.js:96-100`（`tip()` 卡片）和 `shared/measured-text.js:38-43`（`named()` 卡片）是同一张卡的两份样式，FADE 常量也重复了。审计 L11 列为「未修」。
- 禁用原因（T3 R4）：Details 已经改用 `tip`（`e48beda5`）。但 `shared/file-menu.js:115` 和 `mods/t3-chrome/main.js:238` 还在用宿主 `.tooltip()`，`tip.js:2` 自己就写明那是「shell 自己的样式」。所以同一类提示在不同菜单里长得不一样。

**M3 Details 的 split 静止时藏起箭头，和 T3 不一致，也没找到用户决定的记录**

- 位置：`shared/button.js:89`（`quiet`）；`mods/t3-actions/main.js:91`、`workspace-details.js:206` 传了 `quiet: true`；`review-details.js:37-39` 照着手写了一份。
- T3：`ThreadDetailsControl.tsx:83` 的 `ChevronDownIcon` 用的是 `THREAD_DETAILS_PANEL_CHEVRON_CLASS = "size-4 shrink-0 text-muted-foreground"`，没有 opacity 或 group-hover 条件，箭头一直画着。只有中线（`SPLIT_SEPARATOR_CLASS`）是 hover 时才出现。
- 需求文档 `herdr-experience-requirements.md:47` 写的是「箭头始终提供选择」，`:54` 只说「中线在悬停或菜单开启时出现」。`t3-tokens.md:49` 和 CHANGELOG 把这条写成了「静止箭头不画」，但我找不到用户这样定过的记录。见第 3 节的决策点 1。
- 影响：静止时 Open in 和 Actions 两行看起来和普通行一样，看不出右边有菜单（可发现性差）。还要为此多一个 `quiet` 参数，外加 Quick Review 的一份手写复制。

**M4 本轮 6 个提交都没有截图证据**

- `AGENTS.md`「Finishing a change」第 4 步要求可见改动有整窗截图。`dd152b27` 之后 split 静止和 hover 的样子、Files Open in 新的 49px 组、菜单 hover，都没有截图。审计自己也承认（`control-consistency-audit/details.md:111`）。
- 我这次用 `DEMO=/private/tmp/review-shared-controls` 起了演示窗。窗口在后台时 `herdr-app shot` 只返回旧帧：space 已经建了，画面还停在「No space open」。原生 popup 和 hover 也不能靠 `herdr-app do` 触发，所以我同样拿不到截图。演示窗已经 `down`。

**M5 文档膨胀，而且越出了各自的读者**

- `RECIPE.md` 从 56,745 字节涨到 **59,989 字节，离 60,000 的上限只剩 11 字节**。为了塞进去，`RECIPE.md:71` 写成了「popup280/r16, content-sized≤420, p8 sections/32px rows」这种电报体。这些像素值又和 `t3-tokens.md` 重复，违反 AGENTS「用 t3-tokens 作单一来源」那条。下一次任何新增都会撞上限。
- `docs/user/guide.md:20` 的 Details 条目是一个约 500 词的段落，里面有「bounded cache; stale results are ignored」「accessible labels without redundant hover text」这类实现说法。用户文档应该只写人看到什么、做什么。
- `docs/internals/t3-tokens.md:49` 的「详情 popup」只占表格一格，却有约 600 个汉字，把规格、用户决定和宿主限制混在一起，已经没法当查表用。

### 低

**L1 split 和行的颜色、几何没有复用同文件的 `tint()`**

- `shared/button.js:80,83` 又写了一遍 `t.foreground + "12"/"1f"`，同文件 `:26-27` 的 `tint(t, "card", on)` 已经是这个值。
- `mods/t3-actions/workspace-details.js:172-177` 的 `detailsRow` 又抄了一遍 split `row` 主半的几何（32/px10/gap10/13 medium/7%/12%）。
- `review-details.js:37-39` 手写了 `quiet` 箭头槽。
- 现在数值一致，但改一处要同时改三处。

**L2 ghost 图标按钮包装出现三份**

- `shared/nav-column.js:86` 的 `ghostButton`，`shared/review-menu.js:53` 的 `iconButton`，`mods/t3-files/main.js:518` 的 `control()`。都是「`button(card)` + `glow` + 按下时 stop + 点击时 stop」。
- `iconButton` 只多了 `press` 回调和 `color`，可以合成一个。

**L3 死代码：`shared/review-menu.js:11` 的 `hover`**

- `hover = t => t.foreground + "0f"`（6%）被 `extras/mods/review/controls.js:6-7` 导入后又再导出，全仓没有一处调用。
- 它的值还和设计系统的 7% 冲突，读代码的人会被误导。

**L4 写死的数字**

- `shared/file-menu.js:115` 写死了 `opacity(0.64)`，没用 `button.js` 的 `DISABLED`。t3-chrome 已经改成用 `DISABLED`（`e48beda5`），file-menu 是漏网的那一份。

**L5 测试锁的是调用顺序和像素**

- `shared/check-button.cjs` 的 split 断言写成 `["#fff12", "BORDER"]`，同时锁了 bg 的调用顺序（先组底、后中线）。换一种等价写法测试就会失败。
- `mods/t3-actions/check.cjs:343-345` 用 219.6、1190.4 这样的绝对坐标锁位置，没有表达成「行下 4px、和行右对齐」。
- 能留下来的行为测试：「晚到 leave 不熄灭下一行」「子菜单开着时父行保持点亮」「第二次点击关闭」。

### 检查过、没有问题

- `button()` 的「禁用 toggle 不画 on 底」（`button.js:41-42`）是对的，有测试。
- `split()` 的 hover 7% / 开启 12% / 禁用 0.64 / locked 只关主半，和 `t3-tokens.md` 一致。T3 是 hover 和 open 同值（8%）叠一层半区底，我们用 12% 表示开启，这是本仓既定的 token。
- `pressed`/`justClosed` 用在 Quick Review 和 Choose what to show 上（`524ef4a6`），和侧栏 filter、t3-pane 的做法一致，有测试。只有一个开着的菜单时，点另一个触发器要点两次，这和 Base UI 的 modal 菜单一样，不算问题。
- `pickMark` 去掉 accent、未选中 panel 标签改用 `muted`（`e3268ccb`）：改动小，和审计决定一致。
- `review.shown.label`（`e3268ccb`）：`storage.md` 已经记录。
- 本轮 `submenu.js`、`list.js`、`focus.js` 没有改。

## 3. 重写方案

### 目标行为

1. 所有弹出菜单（Files 右键、面包屑、Open in、Details 各菜单、surface `+`/右键、Review 范围、t3-menu、snooze、子 agent 列表）用同一种行：
   - 28 高、横向 8、间距 8、圆角 4、14 号字、图标 16 muted 内缩 2、子菜单箭头 16 muted 80%。
   - 只在指针停在上面或键盘选中时点亮。晚到的 leave 不熄灭下一行。子菜单开着时父行保持点亮。
   - 禁用时 0.64，原因用 `tip()` 显示。启用时 `cursor_pointer`。
2. tooltip 只有一张卡（`tip()`）。`named()` 复用它的样式，或者直接并进 `measuredTooltip`。
3. split 的静止态由用户拍板（决策点 1）。拍板后 `quiet` 要么删掉，要么成为唯一的 Details 行为，Quick Review 也走 `split()` 或同一个行 helper，不再手写。

### 模块边界

- **新增 `shared/menu-row.js`**（或者放进 `shared/list.js`，它已经写着「The one way a popup's list moves」，归属正合适）：
  - `menuRow(t, { id, at, i, open, disabled, hint, icon, glyph, label, trail, checked }, view, key)`：返回带行几何、点亮、禁用和 `tip` 原因的行。
  - `litOnHover(state, key, i)`：唯一的那份 race-safe leave 逻辑。
  - 调用方只加 `on_click` 和 `on_mouse_move`（子菜单）。
- `shared/button.js`：导出 `tint`，或者导出一个 `cardFill(t, on)`，split 和 detailsRow 都用它。把 `detailsRow` 的几何收成 `split` 的一部分，或者在同文件导出 `detailsRow`。
- `shared/nav-column.js` 的 `ghostButton` 留作唯一的 ghost 图标按钮包装，吸收 `iconButton` 的 `press`/`color`。`review-menu.js` 改成从它导入。
- `shared/file-menu.js` 的 `place()`：保留 `subPlace`，把注释和 CHANGELOG 改成如实的说法：放不下时会盖住父菜单的一部分。如果要真的保证不盖住，就要换策略（比如窄页改成原地替换，像 T3 FileBreadcrumbs 的 Back to），这需要用户决定（决策点 2）。

### 可以删的

- 7 份 `to = on ? i : …` 抄写，以及 `workspace-details.js:22` 的 `litRow`。
- `review-menu.js:11` 的 `hover`，以及 `controls.js` 里对它的导入和再导出。
- `review-details.js:37-39` 手写的箭头槽（改用共享件）。
- `measured-text.js:38-43` 的卡片样式（改为复用 `tip`）。
- `shared/file-menu.js:115`、`mods/t3-chrome/main.js:238` 的宿主 `.tooltip()`。
- 文档：
  - `RECIPE.md`/`RECIPE.zh-CN.md` 里 Details/Files 段和 t3-tokens 重复的像素值，换成一句「见 t3-tokens」，腾出预算。
  - `guide.md`/`guide.zh-CN.md` 的 Details 条目只留用户能看到的行为。
  - `t3-tokens.md:49` 拆成真正的表行，用户决定移到「有意不同」。
- 测试：
  - `check-button.cjs` 的 split 断言改成按语义查（组有底、中线显示），不再锁调用顺序。
  - `check-file-menu.cjs` 的点亮测试改成测共享 `menuRow`，每个菜单只需要一条「用了 menuRow」的断言。

### 风险

- 菜单行要横跨 9 个 mod 迁移，同步副本会变多（`scripts/sync.sh` 要多加一个文件）。t3-menu、snooze 是旧功能，迁移时要回放它们原来的键盘行为（`menuJump`、助记键）。
- 子 agent 列表改成「离开就熄灭」会改变它现在的行为。审计当时把它记为「悬停即选中」并接受了，见决策点 3。
- hover 没法在 demo 里用命令触发，迁移后的视觉验收仍然要靠真实鼠标或人工截图。

### 需要用户拍板

1. **Details split 静止时显示箭头吗？** 建议照 T3 一直显示（muted），只有中线在 hover 时出现。这样可以删掉 `quiet`。
2. **窄页时面包屑多级菜单怎么放？** 建议接受盖住一部分，并如实写进文档。另一个选项是窄页改成原地替换 + Back（T3 的做法，但这一项之前被用户改成了级联）。
3. **子 agent 列表的点亮要不要也改成「离开就熄灭」？** 建议改，和其他菜单统一。
4. **RECIPE 预算：** 是否同意把 Details/Files 的像素值移出 RECIPE，只留在 t3-tokens？

## 4. 没有检查的

- 真实鼠标的 hover 和 leave 时序、原生 popup 的截图：演示窗在后台不出新帧，`herdr-app do` 也触发不了 hover 和面包屑菜单，所以以上视觉判断都来自代码和 T3 源码。
- Windows 平台上的面板头窗口按钮。
- `scripts/check.sh` 我没有重跑（父任务说它全过）。`scripts/sync.sh` 按要求没有运行。
- Base UI 在 safe polygon 期间是否点亮其他行，没有核对。

## 跨范围

- Files：审计 H1「chevron/⌄ 再点一次不关」至今未修（属于 Files 审查者）。
- t3-chrome：surface 菜单行自己画，属于 panel-surfaces 审查者。照 H1 迁移时一起处理。
- Review 页的 `scopeMenu`、`baseMenu`、`scopeList` 三种 `lit` 规则不一样（`review-scope.js:345,379,406`），按行内注释是有意的（combobox 保留点亮）。归 Review 审查者确认。
