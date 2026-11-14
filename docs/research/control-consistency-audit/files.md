# Files 面板与表面标签 — 控件一致性审计

只读审计，未改任何产品代码。基线 `HEAD = 0cf95b32`（本轮 `a9e2f769^..HEAD`，`f989ba75`/`4ce92221`/`dd152b27`/`8605edbd`/`0cf95b32` 为 Files 相关提交）。

**设计系统判据**：`docs/internals/t3-tokens.md`（尺寸/圆角/间距/颜色）、`docs/internals/layout-implementation.md`（焦点、键盘、菜单、测量）、既有实现 `shared/button.js`、`shared/focus.js`、`shared/tip.js`、`shared/list.js`、`shared/submenu.js`、`shared/measured-text.js`、`mods/t3-menu/main.js`、`mods/t3-tabs`、`mods/t3-chrome`（品牌栏/页脚按钮）、`mods/t3-inbox`、`mods/t3-actions/main.js` 的 Actions 菜单；T3 Code `apps/web/src/components` 为外部参照。`RECIPE.md` 给意图。

**本区范围**：`mods/t3-files/main.js` 的文件工具栏、面包屑、Open in 分体与其菜单、Preview/Code/Wrap/Tree 开关、树头（刷新/搜索/展开折叠）、树行、右键菜单、loading/empty/error 状态，以及 `mods/t3-chrome/main.js` 的面板表面标签。按指示不审面包屑菜单的级联层次与导航（`shared/file-menu.js` 的层级、`mods/t3-files/main.js` 的 `folderItems`）；其余菜单外观/键盘/放置仍在范围内。

结论：**高 2 项、中 8 项、低 13 项**。高项都是“点击后状态与预期相反”，其余集中在“缺少既有 helper 的守护/角色/悬停面”。

---

## 高

### H1. 菜单触发器没有 `pressed`/`justClosed`，点它不能关掉自己的菜单（Files 菜单）

- 新代码：`mods/t3-files/main.js:587-592`（面包屑 chevron `on_click → this.browse`）、`mods/t3-files/main.js:619-621`（Open in 的 ⌄ `on_click → this.browse`）；关闭路径 `shared/file-menu.js:92-97`（`close()` 只置 `view.menu = null`，不写时间戳）。
- 既有模式：`shared/focus.js:64-70` 的 `pressed()`/`justClosed()`；实际使用见 `mods/t3-actions/main.js:83` + `:80`（MENU_CLOSED）、`mods/t3-tabs/main.js:585-587`、`mods/t3-spaces/main.js:568-573`、`mods/t3-inbox/filter.js:103-105`、`mods/t3-pane/main.js:190-195`、`mods/t3-agents/main.js:274-276`、`mods/t3-home/main.js:42`。规则见 `docs/internals/layout-implementation.md`「键盘、关闭键与菜单链」：“点已开的 popup 按钮，outside press 先关弹层、click 才到按钮；`close()` 写时间，按钮用 `justClosed` 避免立刻重开。”
- 人看到的差别：菜单开着时再点同一个 ‹chevron›／⌄，菜单被 backdrop 关掉后同一个 click 又把它打开——这两个控件永远关不掉自己的菜单，只闪一下。
- 最小修法（复用既有机制）：两个触发器的 `on_mouse_down` 调 `pressed(this)`；`shared/file-menu.js` 的 `close()` 里 `setShared("t3-files.menuClosed", Date.now())`；两处 `this.browse(...)` 包一层 `if (!justClosed(this, "t3-files.menuClosed"))`。

### H2. 面板的 `+` 同样会重开「Open a surface」（t3-chrome）

- 新代码：`mods/t3-chrome/main.js:184-192`（`button(...)` 的 `on_click → openOverlay`，无 `pressed`/`justClosed`）；弹层关闭见 `mods/t3-chrome/main.js:217`（`finish()` 只 `closeOverlay`）。
- 既有模式：同 H1 的 `pressed`/`justClosed`（`mods/t3-inbox/filter.js:103-105` 的搜索按钮就是“按钮开 popup”的同一形状）。
- 人看到的差别：`+` 开着选择器时再点 `+`，选择器关掉又立刻打开；只能点旁边关它。
- 最小修法：`+` 的 `on_mouse_down` 调 `pressed(this)`；选择器关闭时 `setShared("t3-chrome.surfaceClosed", Date.now())`；`+` 的 action 改成 `if (!justClosed(this, "t3-chrome.surfaceClosed")) openOverlay(...)`。

> 这两条依赖宿主“outside press 先关、click 后到按钮”的次序（`layout-implementation.md` 写明的既有结论）。本轮没有真实鼠标可点，属**代码级推断**，需要一次真实点击确认；但缺这层守护本身就和九处既有实现不一致。

---

## 中

### M1. 文件读取失败后只剩 Locate，Retry 消失（内容区错误态）

- 新代码：`mods/t3-files/main.js:634-638`（`role="alert"` 页：原因、路径、根、`t3-files-locate`）；上一行注释 `:633` 仍写着“A read that failed is the error bar's (the toolbar's)”，但工具栏里已没有 error bar；`shared/panel-states.js:27-34` 的 `errorBar` 本轮不再被 Files 引用（`mods/t3-files/main.js:17` 只 import `loadingState, emptyState`）。
- 既有模式／意图：T3 `files/fileSurfaceChrome.tsx:113-137` 的 `FileSurfaceFailure` 带 `onRetry` → “Try again” 按钮；`RECIPE.md:87`“Deleted/renamed file retains tab with path/root, Locate in Files tree/Retry”；同一面板里文件夹列举失败仍是“点文字重试”（`main.js:713`）。
- 人看到的差别：文件读不出来（权限、远程探测失败、超大）时只有 Locate，不能就地重试；同一面板另一种错误却可点重试。
- 最小修法：在 Locate 旁加 `this.control(t, "t3-files-retry-file", "refresh-cw", "Retry reading the file", cx => this.open(st, st.file, cx))`，与 T3 的 Try again 同形；或把 `errorBar` 找回来放在工具栏下。

### M2. 没有按下时，菜单被硬放到面板右上角（Open in 菜单、面包屑菜单）

- 新代码：`mods/t3-files/main.js:484-486`，`box`/`bounds` 缺失时 `x = size.width - 224, y = 32`。
- 既有模式：`docs/internals/t3-tokens.md`「菜单」之「菜单位置」：“位置取按下时按钮的 `e.bounds`，没有按下（辅助技术）就用 app 默认的指针处”；`mods/t3-actions/main.js:36` 的 `underBar` 在没有 press 时返回 `undefined`，从而交给宿主按指针定位（`:80`）；`mods/t3-chrome/main.js:191` 同样 `...(b ? { at } : {})`。
- 人看到的差别：用键盘在 ⌄ / chevron stop 上按 Enter/Space（或辅助技术触发）时，菜单出现在面板右上角，离按钮很远。
- 最小修法：没有按下就把 `x`/`y` 留空（`fileMenuView` 自己会夹进页面），不要写死右上角。

### M3. 工具栏菜单关闭后焦点落进文件树，树行立刻亮出焦点环

- 新代码：`shared/file-menu.js:92-97` 的 `(view.fs?.handles.get(trigger) ?? view.treeHandle)?.focus()`；`shared/focus.js:31-34`、`:78-83` 决定 stops 句柄只在键盘模式中存在（`focusRoot` 在模式关掉时清空 `handles`），所以鼠标关闭时永远落到 `treeHandle`。树行的焦点环 `mods/t3-files/main.js:721` 只看 `this.treeHandle.is_focused()`，没有 `this.fs.keyboard` 条件。
- 既有模式：popup 关闭后回到打开它的控件（`t3-actions` 的 `pressed`/句柄、`t3-tabs:585-587` 的 `titleFrom`）；只有树自己的右键菜单该回树（`mods/t3-files/check-files.cjs`“closing a tree menu restores tree focus”）。
- 人看到的差别：鼠标点 Open in ⌄ 选完编辑器、或用面包屑 chevron 浏览后，焦点进了文件树，当前行立即画出 accent 焦点环，接下来的方向键开始移动树。
- 最小修法：⌄ 与 chevron 各留一个 focus handle（像 `mods/t3-tabs/main.js` 的 `titleFrom`/stop 句柄），`close()` 优先回到它；树行环改成 `this.fs.keyboard && this.treeHandle.is_focused() && …`，与 `stop()` 的显示条件一致。

### M4. 搜索框键盘不可达（树头）

- 新代码：`mods/t3-files/main.js:670-675`，字段只有 `on_mouse_down → this.search.focus()`，不是 `stop()`，不是 tab stop；`keys.json:161-164` 里 `t3-files` 只有 `close`，`t3-files.focus`（`main.js:76`）没有绑定任何键。
- 既有模式：指针能操作的控件都应是 `stop()`（`shared/focus.js:78` 的注释与全仓用法），例如 Inbox 的搜索就是 `stop()`（`mods/t3-inbox/filter.js:103-105`）。
- 人看到的差别：全键盘使用 Files 时，树、面包屑、工具栏按钮都能到，唯独无法输入搜索词——搜索等于只有鼠标可用。
- 最小修法：把字段包成 `stop(this, t, "t3-files-search", field, 6, { enter: () => this.search.focus() })`，焦点环由该 stop 画（替掉 `searchFocused` 的临时环），或为 `t3-files.focus` 绑一个键。

### M5. 面包屑文字是 tab stop，却没有 role 也没有标签（面包屑）

- 新代码：`mods/t3-files/main.js:582-585`（`stop(..., 4)` 套在一个纯 div 上，只有文字），而同一行的 chevron 至少给了 `accessibility_label`（`:592`，仍无 role）。
- 既有模式：`mods/t3-actions/main.js:69`、`mods/t3-tabs/main.js:589-595`、`shared/button.js:55` 都是 `.role("button").accessibility_label(...)`；T3 的面包屑是带 `aria-current` 的 `<button>`（`files/FileBreadcrumbs.tsx:290-320`）。
- 人看到的差别：读屏把“可聚焦的 span”念成目录名，不念“按钮”；当前文件那一段也没有“当前项”的角色。
- 最小修法：非末段 crumb 加 `.role("button").accessibility_label(path || nameOf(st.root))`，末段给标签（或与 M4 一致的 `role("text")`）。

### M6. 同一个标签条上并存两套悬停规则（面板表面标签）

- 新代码：`mods/t3-chrome/main.js:185`，页头按钮传 `surface: "card"`（文字前景 7%/12%），而同一条上的 tab 用 `t.hover`（`:173`），同一 mod 的品牌栏/页脚按钮用默认 `chrome` 面（`shared/button.js:34`；`mods/t3-chrome/main.js:99-102`、`:139-146`）。
- 既有模式：`t3-tokens.md`「按钮」按所在面取色：`chrome` 上悬停 `hover`、on `selected`；`card` 上 7%/12%。
- 人看到的差别：在 `hover` 与前景 7% 差别明显的主题（catppuccin、latte）里，`+`/展开/隐藏的悬停底色和紧挨着的 tab 不一样，也和同一 mod 的品牌按钮不一样。
- 最小修法：`panelHead` 的 `button()` 去掉 `surface` 覆盖，用默认 `chrome`；`card` 只留给真正坐在面板体上的按钮。

### M7. 表面菜单：禁用行 50%、图标满亮（面板表面标签的选择器/右键菜单）

- 新代码：`mods/t3-chrome/main.js:230` 的 `.opacity(0.5)`，`:234` 的图标没有 `text_color` 因此继承行文字 `t.foreground`（`:230`）。
- 既有模式：禁用透明度 0.64（`t3-tokens.md`「按钮」“禁用：整体透明度0.64”，`shared/button.js:19` 的 `DISABLED`；`shared/file-menu.js:115` 用 0.64；`mods/t3-actions/review-details.js:23` 用 `DISABLED`）；菜单图标是 `t.muted`（`mods/t3-menu/main.js:332-335`；T3 `ui/menu.tsx:132` `[&>svg:not([class*='text-'])]:text-muted-foreground`）。
- 人看到的差别：禁用的 “Review” 行比别处禁用控件更淡；`+` 菜单里 Files/Review 的图标和文字一样亮，和其它菜单里暗一档的图标不同。
- 最小修法：`opacity(DISABLED)`；图标 `.text_color(t.muted)`（见 L1，与 file-menu 一起统一）。
- 注意：`mods/t3-chrome/check-surfaces.cjs:33` 把 0.5 写进了断言，改实现要同改这条检查。

### M8. 面板展开后没有按下态（面板表面标签）

- 新代码：`mods/t3-chrome/main.js:185` 只有 `on: id === "panel-close"`，`panel-wide` 永远不 `on`。
- 既有模式：T3 这两个控件都是带 `pressed` 的 Toggle（`chat/PanelLayoutControls.tsx` 的 `RightPanelMaximizeControl` `pressed={maximized}`、`Toggle right panel` `pressed={rightPanelOpen}`）；`t3-tokens.md`「按钮」的 on 列 = 按下或弹层开着。
- 人看到的差别：点 Expand panel 之后，只有图标从 `maximize-2` 换成 `minimize-2`；同尺寸、紧挨着的 Hide panel 有常亮底，正在生效的那个反而没有。
- 最小修法：`on: id === "panel-close" || (id === "panel-wide" && s.wide)`。

---

## 低

### L1. 菜单行图标与子菜单箭头和 t3-menu 不一致（Files 菜单）
`shared/file-menu.js:131`：图标 `t.dim`，子菜单箭头 `:133` 是 14px、无 `mr(-2)`、无 80% 不透明度。既有：`mods/t3-menu/main.js:332`（`t.muted`）、`:335`（16px、`mr(-2)`、`opacity(0.8)`）；T3 `ui/menu.tsx:132,340`（`-mx-0.5`、`text-muted-foreground`、非末位 svg 80%）。看到：Files 菜单的图标比其它菜单亮一档，子菜单箭头小 2px 且离行边更远。修：图标改 `t.muted`，箭头 16 / `mr(-2)` / `opacity(0.8)`。

### L2. `glyph` 行少掉图标的 2px 内缩（Files 菜单）
`shared/file-menu.js:131` 的 `mx(-2)` 只加在 `svg(icon)` 那条分支上；`glyph`（Open in 的品牌图、面包屑菜单的 Pierre 文件图标）不加。看到：有 `icon` 的行文字起点比有 `glyph` 的行靠左 2px，Files 的两个菜单相互不对齐。修：把 `mx(-2)` 提到包裹元素上。

### L3. 右键菜单开着时把目标行点亮（树行）
`shared/file-tree.js:132` 的 `context` 分支给 7% 底，`mods/t3-files/main.js:733` 传入。布局里没有别的 popup 标记它所属的元素（表面标签的右键菜单不改标签底色），且本轮决定是“菜单打开时不点亮任何行”。看到：右键某行后该行一直像悬停状态。修：去掉该分支，或改用和 `selected` 同义的既有样式。

### L4. 树内提示缺 `role="status"`、搜索标签过于笼统
`mods/t3-files/main.js:716`（Loading files…）、`:719`（No matching files.）、`:771`（More matches…）都没有 `role="status"`；T3 三处都有（`files/FileBrowserPanel.tsx:537-560`），本仓 `shared/panel-states.js:12-16` 的 loading 也带。搜索输入标签 `main.js:674` 是泛称 “Search files”，T3 是 “Search <project> files”。修：补 role，标签带项目名。

### L5. 刷新按钮没有进行中反馈（树头）
`mods/t3-files/main.js:669` 标签恒为 “Refresh files”，图标不转。T3 的 `RefreshFilesButton`（`FileBrowserPanel.tsx:72-94`）按钮图标在 pending 时转，tooltip 变 “Refreshing…”。看到：大仓库点刷新像没反应（只有个别目录行出现 spinner）。修：用 `st.loading`/`st.refreshing` 给图标 `spin()` 并把标签换成 “Refreshing…”。

### L6. 正在列举的目录把 spinner 放在了行尾（树行）
`mods/t3-files/main.js:733` 的 `trailing` 放 14px spinner；T3 用 `renderRowDecoration` 把目录行的图标位换成 loading 图标（`FileBrowserPanel.tsx:290-296`）。看到：转圈出现在状态徽章/计数所在的位置，而不是目录自身标记的位置。修：把 spinner 放进 leading 的 16px 槽（chevron 位置）或替换 chevron。

### L7. 两个共享 helper 被重新实现，两个页面文案不一（树头／工具栏）
`shared/nav-column.js:96-104` 的 `navToggle`/`foldAllButton` 仍被 Review 使用（`extras/mods/review/header.js:76`、`files.js:21`），Files 却手写（`main.js:606`、`:676`）。同一动作：Files “Hide file explorer”／Review “Hide file tree”；Files “Collapse all folders”／Review “Collapse all”。修：给 helper 加 `size`（Files 需要 sm 28）后复用；文案用 T3 的 “…folders”。

### L8. 树宽拖拽边的焦点是 25% accent 色块，且不走 `stop()`（导航列）
`shared/nav-column.js:70-78`：`.bg(t.accent + "40")` 铺满 6px×全高的边，并且是裸 `track_focus().tab_index(0)`，不注册进 `stops`。布局其它焦点都是 2px accent 内环（`shared/focus.js:130`）。看到：Tab 到窗口边会亮出一条半透明竖条，别处没有这种样式；Review 的同一模块没有这个 stop。修：改成 `stop()` 的内环（或窄的 2px 高亮条），并把句柄交给 stop 注册。

### L9. 空文件夹什么都不显示（树）
`mods/t3-files/main.js:719`：无查询且无行时返回空 div。上一版是 “This folder is empty.”，同一套 `emptyState`（`shared/panel-states.js:19-25`）在 Review 里用于同类状态。看到：一个空目录 surface 在搜索栏下面是一片空白。修：用 `emptyState` 或 `emptyState` 的 12px dim 一行文案。

### L10. 走不到的 “No file open” 空态（内容区）
`mods/t3-files/main.js:630` 的 `if (!st.file) return emptyState(...)` 永远不会绘制——`content()` 只在 `st.file` 为真时被调用（`main.js:572`，文件夹 surface 走的是整宽树分支）。无可观察影响；留着容易误导后续改动。修：删掉该分支。

### L11. 面板标签与标签条：角色和未选中文字色不一致（面板表面标签）
`mods/t3-chrome/main.js:172` 用 `t.dim`、`:174` 用 `role("tab")`；标签条同几何的 tab 行用 `t.muted`（`mods/t3-tabs/main.js:471-472`）、`role("button")`（`:589-595` 一带），且 `surface-strip`（`main.js:207`）没有 `role="tablist"`。注意 `t3-tokens.md`「面板标签」自己写的是 `dim`，所以这是文档与既有标签条之间的矛盾。看到：同一窗口里未选中的表面名比未选中的标签名更淡。修：二选一并统一文档（建议都 `muted`，与标签条一致）。

### L12. 「Open a surface」弹层 Esc 关不掉（面板表面标签）
`mods/t3-chrome/main.js:240-248`：`escape` 只在 `!empty` 时处理，其余分支走到最后 `return`，不 `stop_propagation`。布局里其它弹层都吃 Esc（`mods/t3-menu/main.js:300`、`shared/file-menu.js:150`）。看到：这个选择器只能点旁边关。修：`if (e.key === "escape") finish-or-close`，empty 时也关。

### L13. `+` 的按下位置会滞留（面板表面标签）
`mods/t3-chrome/main.js:187` 每次按下写 `surfaceAddPress`，用完从不清空（`mods/t3-files/main.js:620` 的 `openPress` 会清）。看到：鼠标按过一次 `+` 之后，用 `cmd-t`（`t3-tabs.surface-menu`）打开的菜单会被放到上一次鼠标按下的位置。修：读取后置空，或复用 `pressed()` 的时间戳。

---

## 已核对且与设计系统一致（本区）

- **文件工具栏**：高 28、下 12、横 12、gap 8、无下边线（`main.js:594`），对齐 `t3-tokens.md`「Files 文件头」与 T3 inline `h-7 mb-3 px-3 gap-2`；按钮组 gap 4、四项同为 sm 28（`main.js:598-606`）。
- **面包屑**：最高宽 160、横 2、圆角 4、字 12、当前段 foreground+medium、其它 dim 且悬停只提亮文字（用户决定）；chevron 槽 16×20、外距 2、图标 14（`main.js:582-596`）；滚动行透明。
- **Open in 分体**：28 + 1 + 20 = 49、圆角 8、静止无底无中线、悬停整组 7%、菜单开启 12% 并显示 1×16 中线、箭头槽常留、禁用 0.64、键盘只走启用的一半、箭头只有 aria-label、菜单右边与组右边对齐且下偏移 4、不画勾（`shared/button.js:57-83`、`main.js:609-622`、`main.js:483-487`）。
- **三个开关**：固定 28 槽、gap 4、`on` 反映 Preview/Wrap/Tree 现状、禁用 0.64 且无悬停/on 底、标签描述“下一步动作”（`main.js:600-606`）。
- **菜单面板**：220 宽、内边距 4、圆角 8、`popover` 底、1px border、`shadow_lg`、行 28 / px8 / gap8 / r4 / 14 号、禁用 0.64、点亮 `t.selected`、用 `scrollList` 跟键、`menuJump` 支持 ↑↓/Home/End/首字母（`shared/file-menu.js:114-141`、`:142-160`）。
- **树行**：24 高、12 号、圆角 6、外距 1.6、内距 6.4、gap 4.8、图标 16、目录一个 chevron / 文件一个 Pierre 图标（同一 leading 槽）、悬停 7%、选中 12%、ignored 文字 dim + 图标 50%、焦点 1px accent、guide 1px 14%、viewport 14.4/8.4（`shared/file-tree.js:128-140`、`main.js:723-736`、`:772`）。
- **搜索框**：28 高、px9、r6、12 号、ghost 悬停 foreground 7%、焦点 `background` + 1px accent + 内侧 3px accent24% 内环、Escape 清空并退出到树、无额外 ×（`main.js:670-675`），对齐 `t3-tokens.md`「Files Search」。
- **树内文案**：Loading files…、No matching files.、More matches available. Refine your search. 与 T3 同文案、同 `px-3 py-1/4 text-xs` 的 dim 写法（`main.js:716,719,771`）。
- **面板标签**：24 高、最宽 144、pl6/pr8、gap2、r6、12 号、16 首槽 12 图标→悬停/键盘换 ×、当前 `selected`、悬停 `hover`、× 为 tiny/tab/r4、条 gap4、`+` 为 xs 24 且在滚动条内、菜单左对齐下偏移 6（`mods/t3-chrome/main.js:162-192`）。
- **表面选择器**：`+` 菜单 28 行、空态 32 行（`max_w` 220/320）、图标 16、F/R 键提示 12 dim（`mods/t3-chrome/main.js:229-250`），与 `RECIPE.md:85` 一致。

---

## 未检查

- **真实指针**：所有悬停/按下/关闭态、H1/H2 的“关掉又打开”、L3 的悬停残留都只从代码与既有文档推断；没有截图，也没有起 demo 窗口（`scripts/demo/stage.sh` 需要 GitHub，未做离线副本）。
- **真实键盘**：没有在真窗口里走一遍 Tab 顺序与焦点落点（只逐控件读了 `stop()` 与句柄接线）。
- **主题色差**：`t.dim` 与 `t.muted`、`t.hover` 与前景 7% 的实际亮度差只按“用了哪个 token”判断，没在具体主题窗口里比较。
- **远程 space 与非 macOS**：Open in 的禁用/降级路径（`st.on`、`window().platform`）没有真机；外部编辑器/Finder 的启动没有真跑。
- **未审（按分配）**：面包屑菜单的级联层级与导航；Review 页；`Editor`/Markdown 预览正文本身（只看开关）；`treeRows` 的排序/紧凑链算法。
