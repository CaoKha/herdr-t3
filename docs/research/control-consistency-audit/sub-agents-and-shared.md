# 控件一致性审计：子 agent 入口/弹层、split()、tooltip、measured-text 与 chrome/tabs

审计范围：本轮 `git log a9e2f769^..HEAD`（忽略 wallpaper 提交）里属于我这一块的全部控件——`mods/t3-pane` 的子 agent 入口与弹层及其共享模块，`shared/button.js` 的 `split()`，`shared/measured-text.js` 及其调用点的标签，以及本轮改到的 `t3-chrome` / `t3-tabs` 控件。Files 的面包屑文件夹菜单（父子菜单嵌套与导航）与 Details popup 属于其他人，未审计；`t3-actions/main.js` 的详情面板部分（`panelControl`、`workspace-details.js`）只在涉及我负责的共享模块时引用。

审计方式：只读。以 `docs/internals/t3-tokens.md`、`docs/internals/layout-implementation.md`、`docs/research/tooltip-audit.md`、`RECIPE.md` 为规范，以既有实现（`shared/button.js`、`shared/focus.js`、`shared/tip.js`、`shared/list.js`、`shared/submenu.js`、`mods/t3-menu/main.js`、`mods/t3-agents/rows.js`、`mods/t3-inbox/filter.js`、`mods/t3-tabs/main.js`、`mods/t3-actions/main.js`）为基线，并对照 T3 Code `~/my/tools/t3code` @ `09a54f01`（`apps/web/src/components`）。没有运行 `scripts/sync.sh` / `scripts/check.sh`（会写已装 app home），没有开 demo 窗口，没有真实指针。

先记一条事实：本轮 `shared/tip.js`、`shared/focus.js`、`shared/list.js`、`shared/submenu.js` **没有代码改动**（`git log a9e2f769^..HEAD -- shared/tip.js shared/focus.js shared/list.js shared/submenu.js` 为空）。所谓“tooltip 改动”本轮只是 `docs/research/tooltip-audit.md` 的文档与新控件的用法；`shared/button.js` 只加了 `split()` 与禁用 toggle 的 `on` 修正，`shared/measured-text.js` 是新增的共用源（三份副本与源一致，`diff -q` 通过）。

## 高

### 1. Surface 头的 `+`（Open a surface）无法用自己的按钮关掉

- 新代码：`mods/t3-chrome/main.js:189-193`（`add` 的 `on_click` 只 `openOverlay`，没有 `pressed`/`justClosed`），`mods/t3-chrome/main.js:26-40` 与 `mods/t3-chrome/main.js:117`（`close()` 只有 `stopsEnd`，不写任何 stamp）。
- 既有做法：`shared/focus.js:88-92` 的 `pressed`/`justClosed` 与 `docs/internals/layout-implementation.md`「键盘、关闭键与菜单链」：点已开 popup 的按钮，outside press 先关弹层、click 才到按钮，所以按钮必须记 stamp 才不会立刻重开。布局里同类入口都这样做：`mods/t3-pane/main.js:194-201`（`KIDS_CLOSED`）、`mods/t3-actions/main.js:75-80`（`MENU_CLOSED`）、`mods/t3-tabs/main.js:373` 的 `panel-toggle`。
- 人看到的差别：菜单在 `+` 下方 6px 打开（`main.js:190`），按钮仍露在外面。再点一次 `+`，菜单被 outside press 关掉、同一帧的 click 又把它打开——按钮看起来点不动，只能用 Esc 或点别处。其它菜单触发器不会这样。
- 修法（最小）：给 t3-chrome 一个共用 stamp（如 `t3-chrome.menuClosed`，在 `close()` 里 `setShared(…, Date.now())`），`+` 的 `on_mouse_down` 里 `pressed(this)`、`on_click` 里 `if (!justClosed(this, KEY)) openOverlay(...)`。`surface-tab` 右键的 context menu 不需要（右键不会重复触发）。

### 2. 停靠的空 panel 页（`surface-empty`）按弹层处理，会抢键盘并吃掉 Enter/↑/↓

- 新代码：`mods/t3-chrome/main.js:27-29`（`init` 里 `this.surfaceKeys = cx.focus_handle(); this.surfaceKeys.focus()`，条件只有 `props().part.startsWith("surface-")`）、`main.js:237-249`（`track_focus(this.surfaceKeys)`、`on_key_down` 里 `enter`/`up`/`down` 分支后无条件 `cx.stop_propagation()`）。
- 这个 part 不只是弹层：`layouts/herdr-t3.json:184`、`:189` 把 `panel-empty` 作为 `panel-body` 的 stack 子项（默认 active）停靠渲染 `t3-chrome` `{ part: "surface-empty" }`。`docs/internals/layout-implementation.md`「隐藏副本与常驻入口」说明 stack 子项在显示时才绘制——也就是面板第一次打开到空页时该 view 才被创建，`focus()` 于是把键盘从终端拿走。
- 人看到的差别：面板打开在空页时，键入/Enter/↑/↓ 落在这一页（Enter/↑/↓ 被吞，Esc 侥幸落到 `findIndex` 的 early return 才没被吞）；点回终端才能继续工作。这跟同一行里 `button()` 那些真正的弹层控件不是一个行为。
- 修法（最小）：把 `focus()` 与 `on_key_down` 限定在弹层三种 part（`surface-menu` / `surface-context`），或 `if (props()?.overlay)` 时才 `track_focus`/`focus`/监听按键；停靠页只保留 `on_mouse_down` 的普通行点击。同一处 `probe` 的 250ms timer（`main.js:30-40`）也只该给弹层用。
  - 未验证：宿主在面板打开后是否另有一次终端聚焦；如果有，症状只在“面板开着、键盘原本在别处”时出现。机制上这行 `focus()` 与 `docs/internals/layout-implementation.md` 里“常驻/停靠副本不该夺键盘”的规则冲突。

## 中

### 3. 新 surface 菜单自己实现键盘移动，绕开 `shared/list.js`

- 新代码：`mods/t3-chrome/main.js:240-249`（手写 up/down 数组、`e.keystroke === e.key` 走助记键）。
- 既有做法：`shared/list.js:16-36` 的 `menuJump`（↑/↓ 环绕、Home、End、750ms 内连打首字母、同字母轮转）是“每个 popup 列表移动的唯一条路”（`mods/t3-menu/main.js:295-305`、`mods/t3-actions/main.js:112-124`、`shared/file-menu.js` 同级实现）。
- 人看到的差别：surface 菜单里 Home/End 无效、键入首字母无法跳行；和右键菜单、Actions 菜单的手感不同。
- 修法：`menuJump(this, e, items.map(i => i.label), this.surfaceAt)` 替换手写分支，`at` 落在禁用行时再跳下一个可用行（`mods/t3-chrome/main.js:246` 的 enabled 过滤可保留为一次修正）。

### 4. 禁用的菜单行透明度 0.5，不是 0.64

- 新代码：`mods/t3-chrome/main.js:230` `.when(it.disabled, el => el.opacity(0.5).tooltip(...))`。
- 既有做法：`docs/internals/t3-tokens.md:76`「禁用：整体透明度 0.64」，`shared/button.js:18` 的 `DISABLED = 0.64`，`shared/file-menu.js:111` 与 `mods/t3-files/file-menu.js:82` 的禁用行都是 `0.64`。
- 人看到的差别：同一个「Review 不可用」在 surface 菜单里比在其它菜单里更淡；两处并排（比如 Files 与 surface 菜单先后打开）能看出差别。
- 修法：改成 `DISABLED`（从 `./button.js` 导入），reason 的 tooltip 保留。

### 5. Review 行在打开菜单的瞬间灰一帧（“Checking repository…”）

- 新代码：`mods/t3-chrome/main.js:30-40`（每次都先把 `reviewReason` 设成 `"Checking repository…"`，再 `exec("git", rev-parse)` 异步回来清空）、`main.js:226`（`disabled: Boolean(this.reviewReason)`）。
- 人看到的差别：点 `+` 打开菜单，Review 先以禁用态（0.5 透明 + 宿主样式 tooltip）出现，几十到几百毫秒后才变成可用；每次换 space/folder 后的第一次都这样。禁用语义也被误用成“还没算完”。
- 修法（最小）：未算出结果时按可用显示（`disabled: this.reviewReason === "" ? false : reason && reason !== "Checking repository…"`），或把上一个 space 的结果留在 `this.reviewReason` 直到新结果到达（不动 disabled 判断）。

### 6. surface 菜单行不是「菜单行」的样子

- 新代码：`mods/t3-chrome/main.js:229-233`。
- 既有做法 / 规范：`docs/internals/t3-tokens.md:29`「菜单行：最小高 28、横向 8、纵向 4、间距 8、字号 14、圆角 4」；`mods/t3-menu/main.js:314-327` 的行：图标 `svg(...).size(16).mx(-2).text_color(t.muted)`、名称 `div().flex_1().min_w(0).truncate()`、尾部提示 `text_size(12).font_medium().text_color(t.dim)`。
- 人看到的差别：
  - 图标用行文字的 `foreground`，而菜单图标按 token 是 `dim`（tokens:51“图标 dim”），两行菜单并排时 surface 菜单的图标更亮；
  - 图标没有 `mx(-2)`，图标和名字比既有菜单各向右偏 2px；
  - 名称没有 `truncate()`，长名字会把尾部键提示挤出去而不是省略号；
  - 键提示（`F`/`R`）少了 `font_medium`，比菜单里的快捷键提示细。
- 修法：把这四行照 `t3-menu` 的行改（`.mx(-2)`、`text_color(t.muted)`、`.truncate()`、`.font_medium()`）。context 菜单那组没有图标（`it.icon` 未定义），所以两组菜单的文字起点不一致（8 vs 32）——要么给 context 项也配图标，要么两组都按无图标排版。

### 7. 启用的菜单行没有手型光标

- 新代码：`mods/t3-chrome/main.js:229-231`（只有 `on_hover`/`on_click`，没有 `cursor_pointer`）。
- 既有做法：`docs/internals/t3-tokens.md:57`「可点按钮／菜单行显式 pointer，不继承内容的选字光标」；`shared/file-menu.js:111`、`mods/t3-pane/main.js:157`（子 agent 行）都显式设置了。
- 人看到的差别：在 surface 菜单上悬停是文本光标，和布局里其它菜单、以及本轮新写的子 agent 列表不一致。
- 修法：启用行加 `.cursor_pointer()`（`when(!it.disabled, …)` 里加一行）。

### 8. 子 agent 弹层的折叠箭头：12×12 唯一命中区、无 tooltip、收起后不报数量

- 新代码：`mods/t3-pane/main.js:166-169`（`absolute().left(20).top(2).size(12)` 的裸 `div`，只有 `accessibility_label`）。
- 既有做法：`mods/t3-agents/rows.js:132-144` 同一件事用 `button(t, id, { size: "micro", wide: true, surface: "row", label })`（20 宽命中区）+ `tip(view, t, id, label, …)`，并在收起时把子数量写在箭头前；`docs/research/tooltip-audit.md` R1（只有图标的控件用 tooltip 说它做什么，#40 也是“保持”）。
- 人看到的差别：折叠箭头是这一行里唯一的 12px 目标，紧挨着点开 peek 的整行；悬停无标签（不知道是“Collapse sub-agents”还是别的）；收起后整棵子树消失，但行上没有任何“这里藏了 N 个”的提示——Agents 列表里同样操作会显示数量。
- 修法：用 `button(t, id, { size: "micro", wide: true, surface: "row", label })` 包一层（保留 12px 图标与 `left(20)` 位置，命中区向右扩到 20），外面套 `tip(this, t, id, label, stop(...))`；收起时把 `String(hiddenCount)` 作为箭头前的文字（Agents 的做法）。

### 9. 入口计数在自己的列表打开时不变样

- 新代码：`mods/t3-pane/main.js:182-201` 的 `kidsButton`，其中 `:188` 的 `drawButton` 选项只有 `{ text, label, surface: "card", color, hot }`，没有 `on`。
- 既有做法：`docs/internals/t3-tokens.md:65-77` 按钮表里 `on` 的定义是“按下、弹层开着”；`mods/t3-inbox/filter.js:72` 的 scope chip `on: view.scopeOpen`、`mods/t3-tabs/main.js:373` 的 panel toggle `on: panelState().open` 都是弹层触发器的样板。
- 人看到的差别：弹层挂在按钮下 4px（`main.js:198-199`），按钮一直露着；列表开着时按钮没有任何“开着”的底，关掉再开也看不出状态差。
- 修法：`openOverlay` 返回的 overlay id 存在 view 上（或一个 shared 键），`on: Boolean(this.kidsOpen)`，并在 `close()`/`is closed` 时清掉。不改弹层本身（用户已定“菜单打开时行不点亮”只针对行）。

### 10. 子 agent 行的状态既写进整行 label，又单独有 `role="status"`

- 新代码：`mods/t3-pane/main.js:157`（行 `accessibility_label(WORD[st] ? \`${kidName(k)}, ${WORD[st]}\` : kidName(k))`）与 `main.js:172-173`（`role("status").accessibility_label(WORD[st] ?? "Unknown")`）。
- 既有做法：`mods/t3-agents/rows.js:110-112` 的状态只有一个 `role="status"` + label，行本身的 label 是名字；两侧各说一次会让屏幕阅读器把“Needs you”念两遍。
- 修法：行的 label 只留名字（或去掉内层 status 的 label，保留 role 供标记语义），二选一。

## 低

### 11. `named()` 与 `tip()` 是同一张 hover 卡的两份样式

- 新代码：`shared/measured-text.js:38-45`（`mt(4).max_w(320).px(8).py(4).rounded(6).border(1)…shadow_md().text_size(12)`）。
- 既有：`shared/tip.js:104-112` 同一张卡另有 `line_height(1.375)` 与 `gap(2)`。
- 人看到的差别：同一个布局里的 hover 卡行距/两行间距略有不同（面包屑/tab 用的 `named` 卡 vs 按钮用的 `tip` 卡），大段两行内容时能看出。
- 修法：让 `named()` 复用 `tip()` 的卡样式（抽出这几个 builder 调用），或在 `named` 上补同样的 `line_height`/`gap`。

### 12. Surface tab 的关闭格没有 tooltip

- 新代码：`mods/t3-chrome/main.js:178-179`（`drawButton(... label: \`Close ${label}\` )`，只有 aria-label）。
- 既有：`mods/t3-tabs/main.js:466-470` 同一位置的 × 用 `tip(..., "Close tab", …)`；tooltip-audit R1 与 #28“保持”。T3 的 `PanelTabCloseButton` 的 tooltip 是可选的（调用方不给就没有），所以这不算违背 T3，但和本布局自己的标签条不一致。
- 修法：`tip(this, t, closeId, \`Close ${label}\`, stop(...), { below: true })`。

### 13. Surface 条的分页箭头是 28，条内其它控件是 24

- 新代码：`mods/t3-chrome/main.js:203`、`:208`（`button(...)` 默认 `size = "sm"` → 28/图标 16）。
- 既有：同一条 strip 的标签 24、`+` 是 `xs` 24（`main.js:189`），`docs/internals/t3-tokens.md:48` 把 strip 的控件定为 24；标签条里的 `+` 同样是 24（`mods/t3-tabs/main.js:382`）。
- 人看到的差别：翻页箭头的按钮和图标都比它翻的那些标签高一档，和 `+` 并排时高低不齐。
- 修法：两处传 `"xs"`。

### 14. 面板最大化按钮（`panel-wide`）没有按下态

- 新代码：`mods/t3-chrome/main.js:185`（`on: id === "panel-close"`）与 `:209`（`button("panel-wide", …)` 不传 `on`）。
- 既有：T3 `chat/PanelLayoutControls.tsx` 的 `RightPanelMaximizeControl` 是 `Toggle`，`pressed={maximized}`；相邻的 Hide panel 在这里被当作“面板开着”的按下态（`on`），只有它一半的开关有按下态。
- 人看到的差别：面板已最大化时（`s.wide`）只有图标从 maximize-2 换成 minimize-2，没有其它按下底；同一行的 Hide panel 却有底。
- 修法：`on: id === "panel-close" ? true : id === "panel-wide" && s.wide`（把 `s` 传进 `button`）。

### 15. 空 panel 页把菜单行直接画在页面底上

- 新代码：`mods/t3-chrome/main.js:229-238`（`empty` 时行高 32、`max_w(320)`，根节点不画 `popover` 底，只 `justify_center().gap(12).p(24)` + 标题 “Open a surface”）。
- 规范：t3-tokens 没有任何空状态条目；这页与 `+` 打开的菜单内容完全相同（Files/Review），但少了菜单的面（`popover` 底、4px 内距）。
- 人看到的差别：面板里出现一块“没有菜单壳的菜单行”，hover/选中是 `t.selected`，在 `background` 上浮着；和 `+` 菜单长得不一样。
- 修法（择一）：给这页的列表套上菜单面的最小外壳（`rounded(8).bg(t.popover).p(4)`）与同样的行高 28，或改成一句话 + 一个 `button()` 的 “Open a surface” 而不是复制菜单行。顺带说：`surface-empty` 作为弹层的分支（`empty` 时的 `max_w(320)`、`h(32)`、`finish()` 的 `!empty` 守卫）永远走不到，因为只有 layout 用它。

## 检查过、没有发现问题的部分

- `shared/button.js:60-88` 的 `split()`：组高/半宽/圆角（8）/中线 1×16/悬停 `foreground+12`(7%)/开启 `foreground+1f`(12%)/禁用 `DISABLED`/`locked` 只关主半/`quiet` 只看得到箭头，与 `docs/internals/t3-tokens.md:49`、`:57` 的详情行与 Files Open in 规格逐项一致；两个调用点传的 `hot`/`on`/`quiet`/`label`/`moreLabel` 都齐（`mods/t3-actions/main.js:92-103`、Files 的 `sm` 用法）。`disabled` 不算按下、`locked` 不显示手型光标也对。
- `shared/button.js:41-58` 本轮只加了“禁用的 toggle 不画 on 底”，与 tokens:76 一致。
- `shared/measured-text.js`：`measureText`/`nameText` 的“零高自然宽副本必须是 truncate 的兄弟、字体字重相同、只按布局宽变化 notify、未测量按完整算、zoom 归一”全部有断言（`shared/check-measured-text.cjs`），三份副本与源一致；`isTextCut` 的未测量/`shown:false` 语义与 tooltip-audit 的“仅截断时”一致。
- 标签调用点的语义：#7 Add action 仅图标态提示、#8 `Run <名>` 仅图标态或实测被切时提示（`mods/t3-actions/main.js:67-75`）、#23 surface tab 仅实测被切时提示（`mods/t3-chrome/main.js:171-183`）、t3-tabs 面包屑/tab 名的量法搬到共享源后键与 `widths` 仍一致（`mods/t3-tabs/main.js:513`、`:593`、`:605-650`）。
- 子 agent 弹层本体：根 `p(4)`/`popover`/字号 14 与其它菜单一致；行 28/横向 8/间距 8/圆角 4/`t.selected` 选中/悬停即选中、无初始高亮、右键复用 `shared/menu.js` 的 `openMenu`（220×260）、Esc/Enter/←→ 折叠、`menuJump` 类型化查找、`justClosed` + `KIDS_CLOSED`、宽度 280 右对齐 + 下方 4 的位置、`scrollList` 固定 10 行高度——都和菜单规范对得上。

## 没检查 / 未验证

- 没有开 demo 窗口，没有截图：上面所有“看起来不一样”的判断都来自代码与 token 表，没有像素证据。真实指针（悬停、全窗口的坐标、outside press 的先后）和真实键盘路由也未验证；因此第 1、2 条的实际症状和“菜单开着时按钮是否被弹层挡住”都只按机制推断。
- 没验 Windows（`window().buttons` 有值）时面板头里的三个窗口按钮：本机 macOS 走不到那条分支，尺寸/间距（`w(28).px(0)`、`gap(4)` vs token 的“标题栏按钮间距 12”）未确认。
- 没验 10 行以上、窗口很矮时 popup 被宿主推回后的位置（没有按下时的 `at` 断言）。
- 没验远程 space（`Review is unavailable on remote spaces`）的菜单表现。
- `t3-tabs` 端点块的右侧内距从 12 改成 8（`mods/t3-tabs/main.js:380`）、窗口按钮移到面板头（`:387`）只按代码读过，右边缘是否仍与标签、面板头对齐需要整窗截图。
- 未运行 `scripts/sync.sh` / `scripts/check.sh`，也未改任何文件（本报告除外）。
