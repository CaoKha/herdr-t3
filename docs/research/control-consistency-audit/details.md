# 控件一致性审计：Details popup 及其子控件

审计范围：本轮 `git log a9e2f769^..HEAD`（忽略 wallpaper 提交）里属于我这一块的控件——`mods/t3-actions/workspace-details.js`、`review-details.js`、`mods/t3-actions/main.js` 的 Details 入口与 Actions 行/菜单、`shared/review-scope.js` 在 Quick Review 下的用法。

审计方式：只读，没改任何代码。规范依据 `docs/internals/t3-tokens.md`、`docs/internals/layout-implementation.md`、`RECIPE.md`、`docs/research/tooltip-audit.md`、`docs/research/panel-ab-validation/details-interaction-audit.md`；基线为既有实现 `shared/button.js`、`shared/focus.js`、`shared/tip.js`、`shared/list.js`、`shared/submenu.js`、`shared/review-menu.js`、`mods/t3-menu/main.js`、`mods/t3-new-menu`、`mods/t3-picker`、`mods/t3-files/main.js` 的 Open in（只作对照；Files 的面包屑文件夹菜单不在本审计内），并对照 T3 Code `~/my/tools/t3code`（`apps/web/src/components`）。

`mods/t3-actions` 里 13 个共享副本与 `shared/` 逐字节一致（`cmp` 通过），所以下文行号以 `mods/t3-actions/` 为准，共享源同名。

按控件索引：卡片外壳与 Quick Review 子弹层 → 高 1；Choose what to show → 高 2；Open in → 中 3；Quick Review 行 → 中 4、低 8；split（Open in / Actions 行）→ 中 5；Details 卡片里的 tooltip → 中 6；Actions 行与菜单 → 低 7；目录菜单 → 低 7、低 10；两个可见性菜单的勾 → 低 9；Details 开关按钮 → 无发现（见「已核对」）。

## 高

### 1. Quick Review 的子弹层是一个 736×500 的透明原生 popup，只用到右边 264px

- 新代码：`mods/t3-actions/review-details.js:26-27`（`width = Math.min(736, viewport.width/z - 16)`、`height = Math.min(500, viewport.height/z - 32)`、`frame: "none"`），`review-details.js:72-82`（根 `div().w(view.width).h(view.height)`，菜单只是其中一个 `absolute().left(scopeOrigin.x)` 的子块）。
- 既有做法：Details 的其他三个子弹层都按自己要画的东西定尺寸——Open in `workspace-details.js:207`（`height: 8 + targets*28`、宽用 `underDetails` 的行宽）、Actions 菜单 `mods/t3-actions/main.js:97`、右键菜单 `workspace-details.js:24`。宿主 popup 是一个会吃事件的窗口：`shared/tip.js:59` 的原话是「透明 popup 仍挡住下面输入」（这也是 `tip()` 不用 `HoverCard` 的原因）。
- 人看到的差别：Quick Review 菜单打开时，它左边约 470px、下面约 350px 是一整块看不见但存在的窗口。在终端或面板上点一下，第一下点击被这块透明区域吞掉（只把菜单关掉），要点第二次才有反应；滚轮、拖动也一样落在它上面。菜单本身看起来正常，所以用户只会觉得「点了没反应」。
- 严重度：高（不可见的交互遮挡；只在菜单打开期间出现）。
- 修法（最小）：把画布缩到真正会画出来的并集——宽 `scopeMenuWidth + Commits 子菜单宽`（`shared/review-menu.js:43-50` 的 `subAt` 最小 260）、高 `菜单高 + 子菜单高`，`scopeOrigin` 与之配套；根治是让 Commits 子菜单像 `mods/t3-menu/main.js:246-258` 的 `openSub` 那样自己开一个 popup（复用 `shared/submenu.js` 的 `subPlace`），画布就只剩菜单本体。
- 未验证：没有真实指针，吞点击这一点来自上面 tip.js 的宿主限制说明和 popup 是独立窗口这一事实，不是实测。

### 2. 「Choose what to show」的菜单在指针处打开，不在这一行下面

- 新代码：`mods/t3-actions/workspace-details.js:24`（`chooseDetailsItems()` 不带任何位置），调用点 `workspace-details.js:216-217`（左键）与 `workspace-details.js:222`（卡片右键）。
- 既有做法：同一个 T3 控件把菜单锚在这一行上——`apps/web/src/components/chat/ThreadDetailsPanel.tsx:307-317` 用 `rect.left/rect.bottom` 与 `MenuPopup side="bottom"`；本仓自己的行也这么做：`workspace-details.js:71-73` 的 `underDetails`（行宽、下方 4px），Open in 与 Actions 的箭头都传了按下时的 `e.bounds`（`workspace-details.js:206-207`、`main.js:96-97`）。`docs/internals/t3-tokens.md`「菜单位置」是「按钮下方 4」。
- 人看到的差别：鼠标点在行上时，菜单盖住这一行和卡片下半部，而不是挂在下面；没有按下坐标时（辅助技术、或哪天给这一行接上 Enter）菜单开在**上一次鼠标所在处**——可能在窗口另一头、叠在别的控件上。它是唯一一个不跟着行走的子弹层（右键那条路径在指针处是对的，与 token 相符）。
- 严重度：高（鼠标路径就能看到：菜单盖住了它自己的触发行，与 T3 的 `side="bottom"` 和 token 的「按钮下方 4」相反）。
- 修法（最小）：行上记 `e.bounds`（照 `:206` 的写法），`chooseDetailsItems(bounds)` 里 `{ ...underDetails(view, bounds), height: 185 }`；没有 bounds（键盘/辅助技术）时用卡片自身的 bounds，与 `workspace-details.js:96-100` 给 Details 开关兜底同一套做法。

## 中

### 3. Open in 的菜单没有滚动列表，也没给行加 role/label

- 新代码：`mods/t3-actions/workspace-details.js:141-157`（`children(names.map(...))` 直接铺行），高度 `workspace-details.js:207`（`8 + targets*28`）。
- 既有做法：所有可能长的菜单都用 `shared/list.js` 的 `scrollList` 并封顶 420——Actions 菜单 `main.js:132`（`MENU_MAX - rest`）、`mods/t3-new-menu/main.js:14,131`、`mods/t3-picker/main.js:20,120`、Review 的 base/commits `shared/review-scope.js:343-374` 与 `:403-424`；行的无障碍写法见 `workspace-details.js:39`（`role("button").accessibility_label(label)`）、`mods/t3-picker/main.js:75`、`mods/t3-new-menu/main.js:88`。
- 人看到的差别：`shared/open-in.js:6-7` 的候选是 Finder + 20 个编辑器，装上十几个时菜单高 300–600px 且没有滚动；窗口矮一些时底部几行被 popup 裁掉，↑/↓ 还能把高亮移到看不见的行上。读屏软件里这些行只是纯文本。
- 严重度：中（多编辑器 + 矮窗口才触发；标签缺失一直存在）。
- 修法（最小）：换成 `scrollList(view, "open-in-list", { count: names.length, row: 28, at: view.at, height: Math.min(names.length * 28, 420 - 8), draw })`，popup 高度随之封顶；行上加 `.role("button").accessibility_label(name)`。

### 4. Quick Review 行尾的范围标签被截断却没有提示

- 新代码：`mods/t3-actions/review-details.js:31`（`.max_w(120).truncate()`，没有 tooltip）。
- 既有做法：T3 同一位置的 base 标签带 tooltip——`apps/web/src/components/GitActionsControl.tsx:1632-1656`（`TooltipPopup` 给全文）；本卡自己的截断文字用 `measuredTooltip` + `nameText`（`workspace-details.js:197` 的电脑名，`shared/measured-text.js:30-41`），`docs/internals/layout-implementation.md`「尺寸、滚动与重排」要求截断提示统一走这个帮助函数。
- 人看到的差别：分支名长时行尾只剩 `feature/lo…`，没有任何办法读到全名；同一张卡片里电脑名被截断却有提示，两者不一致。
- 严重度：中。
- 修法（最小）：照电脑名那两行改成 `measuredTooltip(view, t, "details-review-scope-label", scope.label, nameText(view, "details-review-scope-label", scope.label, { size: 12 }).max_w(120))`。

### 5. split 组悬停时只有整组一块底，hover 的那半不叠色

- 新代码：`shared/button.js:83-88`（`lit` 只给整组上 `foreground+12`/`+1f`，两个半区自己没有悬停底），调用点 `workspace-details.js:199-208`（Open in）与 `main.js:91-97`（Actions 行）。
- 既有做法：`docs/internals/t3-tokens.md` 详情 popup 段最后一句「父组与半区各自响应 hover」，对应 `apps/web/src/components/chat/threadDetailsPanelStyles.ts:6,39-44`：组一层 8%，`primary`/`secondary` 各自再叠一层 8%，所以指针在哪一半更暗、按下去打哪一半看得见。
- 人看到的差别：从 Open in 的图标半移到箭头半，除了箭头出现之外两块底完全一样；T3 里被指到的那半会明显更深。整组 7% 也比 T3 的双层（约 14%）浅。
- 严重度：中。
- 修法（最小）：`split()` 里给对应半区加一条 `hot === "main"` / `hot === "more"` 时的 `foreground+12`（`button()` 已有同色 token），组底不动。这份共享模块归另一位审计者，他按 token 的数值核对了整组、没核这一句，所以列在这里以免漏掉。

### 6. 卡片里的三个提示用宿主的 `.tooltip()`，不是布局的 `tip()`

- 新代码：`workspace-details.js:198`（文件夹图标的路径）、`workspace-details.js:201`（Open in 主半区的路径/不可用原因）、`review-details.js:23`（Quick Review 不可用原因）。
- 既有做法：`shared/tip.js:2` 的注释就是「`.tooltip()` 只有字符串和宿主样式，故有本文件」，`tip()` 的外观在 `shared/tip.js:107`（12px、px8/py4、圆角 6、`chrome` 底、1px 边、150ms 淡入）；Files 的同一个 Open in 控件用的就是 `tip(...)`（`mods/t3-files/main.js:615-619`）。
- 人看到的差别：这三处悬停出现的是宿主的提示（字号/内距/底色/延时与全窗口其它提示不同，也没有淡入），紧挨着它们的电脑名提示是本仓样式，两种并排能看出不一样。
- 严重度：中（`docs/research/tooltip-audit.md` 只定了「哪些提示该留」，这四处保留没错，样式没跟着走）。
- 修法（最小）：`tip(view, t, "details-finder", available ? s.folder : reason, el, { below: true })`；文件夹图标用现成的 `tipMark(view, t, "details-path", s.folder, mark)`（`shared/tip.js:138-141` 就是为「只有标记」准备的）；Quick Review 行的 reason 同理（该行没有 `.disabled()`，hover 能到）。
- 未验证：宿主 `.tooltip()` 的确切外观没截图对比，「不是本仓样式」由 tip.js 注释与两种提示并存的事实确定。

## 低

### 7. 可点的行没有手型光标

- 新代码：`mods/t3-actions/main.js:89-90`（Details 里的 Add action 行，`on_click` 但无 `cursor_pointer`）、`workspace-details.js:216`（Choose what to show 行）、`workspace-details.js:177`（目录菜单唯一那行）。
- 既有做法：`shared/button.js:56,78`（有 `act` 就 `cursor_pointer`，split 的可用半区也是）、`workspace-details.js:156`（Open in 菜单行）、`review-details.js:24`（Quick Review 行）；`docs/internals/t3-tokens.md` Files 段「可点按钮／菜单行显式 pointer，不继承内容的选字光标」。
- 人看到的差别：悬停这几行时指针不变，而同卡片的其它三行都变手型；看起来像不可点。
- 严重度：低（与 `mods/t3-chrome` 空面板菜单同类，另一位审计者已报那一处）。
- 修法（最小）：几行加 `.cursor_pointer()`。

### 8. Quick Review 行显示 commit 页时退化成 7 位 sha，Review 那边显示 subject

- 新代码：`review-details.js:21`（`scopeOf({ page: shown.page })`，只喂了 page）。
- 既有做法：`shared/review-scope.js:44-53` 的 `scopeOf` 对 commit 页优先用 `diffCommits(view)`／`view.picks.commits` 的 subject，拿不到才退回 `sha.slice(0,7)`；Review 页自己的范围按钮拿的是完整 view，所以显示 "fix: …"。
- 人看到的差别：Review 停在某个 commit 上时，卡片行尾是 `1a2b3c4`，旁边 Review 的范围按钮是同一个提交的标题；同一份「当前范围」两种写法。
- 严重度：低（没有便宜的修法：`review.shown` 里没有 subject）。
- 修法：要么由 Review 写 `review.shown` 时一并存 label（改 extras 的 `review.shown` 结构），要么卡片这一格改用 kind 文案（如 "Commit"）。不建议在卡片里另读 git。

### 9. 同一张卡片开出来的两个菜单，勾不同色

- 新代码：`workspace-details.js:52-54`（勾 svg 不带颜色，继承行的 `text_color(t.foreground)`；16px＝T3 的 `MenuItemCheckbox` 尺寸）。
- 既有做法：`shared/review-menu.js:13-15` 的 `pickMark` 用 `t.accent`（14px＝T3 的 `MenuRadioItemIndicator`）。T3 两个勾都取行文字色——`apps/web/src/components/ui/menu.tsx:164-235`（checkbox indicator 无自带色）与 `:250-266`（radio indicator）。
- 人看到的差别：「显示哪些分区」的勾是前景色（白），Quick Review 的勾是 accent 蓝。
- 严重度：低。
- 修法：二选一，改一处——`pickMark` 去掉 `accent`（跟 T3），或把 `workspace-details.js:53` 的勾改成 `accent`。改 `pickMark` 会同时改 Review 页，需要用户拍板。

### 10. 右键电脑名那行：文档说「直接复制」，代码是多一步菜单

- 新代码：`workspace-details.js:195`（右键开 `directory-menu`），`workspace-details.js:172-178`（一条 `Copy full path` 行）。
- 规范冲突：`docs/internals/t3-tokens.md` 详情 popup 段「整行右键复制完整路径」、`docs/research/panel-ab-validation/details-interaction-audit.md` 表格「right-click the row copies it」；`RECIPE.md:71` 只写了「row Copy full path」。
- 人看到的差别：右键之后再点一项才复制，而不是直接复制——取决于哪份文档算数。
- 严重度：低（文档不一致，不是明显坏掉）。
- 修法：按 t3-tokens 与 interaction-audit 直接复制并删掉 `directoryMenu`；若要保留菜单，就改这两处文档。需要用户确认哪份是意图。

## 已核对、未发现问题（附证据）

- **Details 开关（`main.js:290-295`）**：`button()` 的 `sm`/`card` 28×28、`square-menu` 16px、`pr(4)`（`layouts/herdr-t3.json:96` 的 32px block + `tabs-end` 的 `pr(8)` 合出 4px 间距）、`on` 用 `foreground+1f`（12%）、提示 `Details (⌘⇧B)` 在下方、`pressed`/`justClosed("t3-actions.detailsClosed")` 齐（stamp 写在 `workspace-details.js:109`）——与 `docs/internals/t3-tokens.md`「详情 popup」段和 tooltip 规则 R1 一致；键盘打开无按下坐标时用 `globalThis.t3Titlebar` 的实测宽度兜底（`workspace-details.js:96-100`，写入方 `mods/t3-tabs/main.js:320`、`mods/t3-chrome/main.js:202`）。
- **卡片外壳（`workspace-details.js:220`）**：280 宽（`:101`）、圆角 16、1px border、无阴影（原生 popup 会裁方角）、内容高测量 +2、`min_h(50)/max_h(420)`、超过才滚动——逐条对应 tokens「详情 popup」段与 `layout-implementation.md`「尺寸、滚动与重排」。
- **行（`detailsRow` `:165-170`）**：32 高、13 medium、gap10、px10、圆角 8、foreground、悬停 7%、菜单开 12%、locked 无悬停——对应 tokens 与该段指向的 `threadDetailsPanelStyles.ts:18-20,29`。
- **电脑名行（`:194-198`）**：单行截断 + 仅截断时提示（自然宽副本与截断文字是兄弟），文件夹在行尾 32 槽（与各行箭头同一条竖线），locked 行无 hover/chevron，右键不冒泡到卡片——对应 tokens「机器名…folder 仅 tooltip」与 `docs/research/tooltip-audit.md` #16（笔记本图标上的提示已删、名字仅实测截断时提示）。
- **Actions 行与它的菜单（`main.js:87-97` 与 `main.js:108-136`）**：空态 Add action 行、有动作时 split（图标 dim16、名称 truncate、箭头 quiet）、菜单用行宽（`underDetails`）+ 下方 4、panel 模式去掉 Add action 前的分隔线（`:135`）、Edit 只 hover/键盘选中时出现（`:132-134`）、列表 `scrollList` + 420 封顶、`pressed`/`justClosed(MENU_CLOSED)`——与 `RECIPE.md:71`、tokens、T3 `GitActionsControl.tsx:1493-1630` 一致。
- **Quick Review 菜单的几何（`review-details.js:27` + `shared/review-scope.js:207,376-400,403-424,343-374`）**：菜单左右边都与 Quick Review 行对齐、下方 4、宽=行宽 264、无第二个 scope 触发按钮、base 控件在同一个菜单框里、菜单内 28px 头部、Commits 子菜单在菜单左侧且不重叠（`docs/research/panel-ab-validation/quick-review-anchor-*.png` 可见）。这是本轮唯一被截图验过的部分。
- **`t3-actions.detailsItems` 存储与菜单结构（`workspace-details.js:26-57`）**：只存 `false`、Reset 清空、默认全开、全隐藏时留 Choose what to show；菜单的分组标题（12 medium dim、高 28、px8）、16px 勾槽 + gap8（文字起点 32）、分隔线 `mx8 my4`、Reset 行不缩进、Reset 在默认值时禁用——与 `apps/web/src/components/chat/ThreadDetailsItemsMenu.tsx`、`threadDetailsItems.ts`、`ui/menu.tsx:164-235` 及 `docs/internals/storage.md` 逐项一致。

## 未检查 / 未验证

- **没有开 demo 窗口，没有截图，也没有真实指针**。本轮最后一次卡片截图是 `docs/research/panel-ab-validation/quick-review-anchor-scope.png`（14 日 03:24，`a5f32595`），早于 `dd152b27`（12:05）的 split 改造——**现在的 Open in / Actions 行（共享 split、quiet 箭头）没有任何截图**，静止时两行不再有箭头这一点只有代码证据；同一份截图里三行都画着箭头，属于旧实现。
- 高 1 的「透明区域吞点击」来自 `shared/tip.js:59` 的宿主说明，高 2 的「无坐标时开在指针处」是宿主 popup 的默认行为（`underBar` 注释 `main.js:33-35` 记录了同一条），两者都没有实测。
- 没有跑 `scripts/sync.sh`（会写已装 app home 和三个工作树）、没有跑 `scripts/check.sh`，因此没复验门禁；共享副本一致性只做了只读 `cmp`。
- 关闭子弹层后键盘是否回到卡片根（`view.detailsKeys` 只在 `workspace-details.js:113` focus 一次，`main.js:269` 的 `close()` 也不回焦）**没有结论**：GPUI 每个窗口各有 focus，母 popup 重新成为 key window 时其追焦元素大概会恢复；同一 popup 内的子菜单关闭时共享代码会显式 `view.handle.focus()`（`shared/review-scope.js:153,162,198`），popup 与 popup 之间没有这个调用。要坐实得实测 Tab/Esc。
- 未核：卡片内 Tab 走完 5 个 stop 后离开的路径；`Enter`/`Space` 对只有 `on_click` 的 stop 是否生效（全布局一致依赖宿主，不是 Details 特有）；宿主 `.tooltip()` 与 `tip()` 的实际外观差异；`baseMenu`（`shared/review-scope.js:343-374`）在 264 宽画布里、窗口贴边时的 x 夹取表现。
