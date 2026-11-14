# Tooltip 审计：哪些悬停标签该留，哪些该删

日期：2026-11-14。范围：`mods/` 里所有 tooltip（共用实现在 `shared/tip.js`，另有直接调 shell 的 `.tooltip()`）。
只读审计：没改 mods 代码，只写了本文件。
判断依据：用户定的两条——结构和交互照 T3 Code，token 用我们自己的；已经点名的两处（文件树里名字完整显示的行、面包屑）不要 tooltip。
T3 Code 基线：`~/my/tools/t3code` @ `09a54f01bc`（下文 `apps/web/src/...` 都相对它）。
调用点行号对应本次审计时的 `herdr-t3` 工作树。

## T3 的 tooltip 规则

六条，每条附源码。行为的共同点是：tooltip 用来补一个元素**说不出来**的东西——动作名、它的键、被切掉的全文、禁用的原因——而不是把已经写在脸上的字再念一遍。

**R1 只有图标的控件，tooltip 说它做什么。**
`components/files/FileBrowserPanel.tsx:56-75`（刷新：`size="icon-xs"` 的 `Button` + `aria-label` + tooltip "Refresh files"），同文件 `:500-524`（展开/收起所有文件夹），`components/RightPanelTabs.tsx:928-949`（静音 tab），`components/ui/panel-tab-close-button.tsx:12-36`（关闭按钮：`aria-label` 恒定，tooltip 由调用方给，不给就没有）。

**R2 文字本来就完整可见的控件，不给 tooltip。**
`components/GitActionsControl.tsx:1568-1591` 的行动主按钮：图标 + 可见标签，只有 `aria-label`，没有 Tooltip；同一分裂按钮的 `⌄`（`:1604-1633`）也只给 `aria-label="Git action options"`。共用的 `components/chat/ThreadDetailsControl.tsx:29-89` 里头根本没有 tooltip 的概念。`panel-tab-close-button.tsx:33` 的 `if (!tooltip) return button;` 是同一个意思：可有可无的东西默认没有。

**R3 文字可能被切掉的地方，tooltip 给全文。**
`components/files/FileBreadcrumbs.tsx:51-77`（`max-w-40 truncate` 的段，tooltip 是它代表的路径），同文件 `:266-285`；`components/chat/ChatHeader.tsx:407-419`（标题，tooltip 给完整 title）；`components/RightPanelTabs.tsx:968-990`（tab 名 `truncate`，tooltip 给全名）；`components/GitActionsControl.tsx:1645-1656`（"Changes" 后面的 base 标签）。
T3 并不判断"这次真的被切了"，它按元素**可能**被切来给。真正需要精确的场合用原生 `title`：`components/ui/middle-truncate.tsx:32` 的 `{...(showTitle ? { title: value } : {})}`。

**R4 控件说不出的话（禁用原因、错误、别处看不见的路径/名字），tooltip 只在那个状态存在时给。**
`components/RightPanelTabs.tsx:284-291`（`DisabledReasonTooltip`），`components/GitActionsControl.tsx:627-647`（"Setup Required" → 原因）。

**R5 图标控件的 tooltip 带上它的键；有第二层说明就另起一行、用弱色。**
`components/chat/PanelLayoutControls.tsx:72-76`（`Toggle thread details (⌘…)`），同文件 `:101-104`、`:124-127`；`components/ThreadTerminalDrawer.tsx:1259-1294` 的 `TerminalActionButton`（悬停弹出 tooltip 样式的 Popover，label 里带键：`:1665-1677` 拼出 `Split Terminal Horizontally (⌘D)`、`Close Terminal (⌘W)`）。二行式：`components/sidebar/SidebarThreadHeader.tsx:108-122` 的 tooltip 是两行，第一行是名字，第二行弱色写 "New thread in current project: Shift+click (⌘T)"。

**R6 纯文字的行和标签页本身不给 tooltip。**
文件树的行来自 `@pierre/trees`，它只在 git 装饰上加 `title`（`apps/web/node_modules/@pierre/trees/dist/render/FileTreeView.js`：`title` 共 5 处，都是 `GIT_STATUS_TITLE` / `decoration.title`），行名没有；T3 自己的 Review 树 `components/diffs/DiffFileTree.tsx:192-219` 也只有表头的展开按钮带 tooltip，行没有。
T3 唯一例外是整行当触发器：`components/sidebar/SidebarThreadRow.tsx:1407-1420` 的 thread 卡片整行给一个 tooltip，内容是完整 title。

**状态标记例外**：`components/ThreadStatusIndicators.tsx:606-655` 的 `ThreadStatusLabel` 连"标签在宽屏可见"的情况也留着 tooltip，因为同一个组件在窄屏只剩圆点。我们照此处理标记类 tooltip。

## 我们已有的"仅截断时显示"

不用新造机制。`mods/t3-tabs/main.js:596-612` 的 `nameText()` / `named()` 已经在做：把一个不可见的整名副本用 `on_size_change` 量出宽度（`crumb-measure-<id>`、`nameW`），和实际盒子比，`cut` 才给标签。注释里那句"A name shown whole has no label, as a tab's"就是本审计要的判据。下面标「改：仅截断时」的项，照这个办法改；不量的情况下拿字符串长度估宽度是 hack，别用。

## t3-files（负责人：files-parity / t34q）

| # | 位置 | 触发元素 | tooltip 内容 | T3 对应 | 结论 |
|---|---|---|---|---|---|
| 1 | `main.js:511` 的 `control()`（`:593`、`:598`、`:599`、`:633`、`:667`、`:674` 共 6 个按钮） | 纯图标 | 动作名（Show preview / Enable word wrap / Show file explorer / Locate / Refresh files / Collapse all folders） | R1：`FileBrowserPanel.tsx:56-75`、`:500-524` | 保持 |
| 2 | `main.js:578` 的 `crumb()`（根 + 每一段，`delay: 600`） | 面包屑文字（`max_w(160)` 可截断） | 完整路径 | T3 有（R3，`FileBreadcrumbs.tsx:51-77`），但用户明确不要 | **删除**（截图 `Snapzy_2026-11-14_01-00-56_291.png`） |
| 3 | `main.js:616` | 纯图标（目标 app 的图标） | `Open in <target>` / "本地应用打不开远程文件" | 无直接对应（T3 的 Open in 是带文字的下拉） | 保持 |
| 4 | `main.js:618` | 纯图标 `⌄` | Choose editor | 无 | 保持 |
| 5 | `main.js:734` `.tooltip(r.path)` | **每个文件树行的整行** | 相对路径 | R6：pierre 的行没有，T3 的树也没有 | **删除**：根层行的名字和路径一模一样（用户举的 `.pi`）。要保留"名字被切时能看全"，改成只在名字被切时给（用 `nameText` 的量法），别用整行 + 路径 |
| 6 | `shared/file-menu.js:80`（`mods/t3-files/file-menu.js:80` 是同步副本） | 禁用的菜单行 | `it.hint ?? "Not available"` | R4：`RightPanelTabs.tsx:284-291` | 保持 |

删除 2，改 0，保持 4。

## t3-actions（负责人：panel-ab / t34b）

| # | 位置 | 触发元素 | tooltip 内容 | T3 对应 | 结论 |
|---|---|---|---|---|---|
| 7 | `main.js:66` | 窄时纯图标，宽时图标 + "Add action" | Add action (+键) | R2：`GitActionsControl.tsx:1568-1591` | **改：仅图标态显示**（`compact` 时有理，宽时只是重念） |
| 8 | `main.js:72` | 图标 + 名字（`max_w(140)` 可截断） | `Run <名字>` (+键) | 同上 | **改：仅图标态或名字被切时显示** |
| 9 | `main.js:76` | 纯图标 `⌄` | Actions | T3 的分裂 `⌄` 只给 `aria-label`（`:1604-1633`），但 R1 覆盖纯图标 | 保持（T3 那条可作删除理由，见边界 3） |
| 10 | `main.js:134` | 纯图标（齿轮） | `Edit <名字>` | R1 | 保持 |
| 11 | `main.js:293` | 纯图标（Details）+ 键 | Details (⌘…) | R1 | 保持 |
| 12 | `main.js:92` `.tooltip(...)` | 详情行（图标 + 名字，行本身 `truncate`） | `Run <名字>` | R2/R6：T3 的详情行不给 | **删除**：行里就写着这个名字 |
| 13 | `git-details.js:114` `.tooltip(reason)` | 禁用的 git 行 | 原因 | R4 | 保持 |
| 14 | `git-details.js:272` `.tooltip(path)` | commit 列表的文件行（同一行有 `.truncate()`） | 路径，重命名时 `旧 → 新` | R3 | **改：路径被切时才显示**；重命名那半句是行里没有的信息，保留 |
| 15 | `git-details.js:311` `.tooltip(item.reason)` | 禁用的菜单项 | 原因 | R4 | 保持 |
| 16 | `workspace-details.js:193` `.tooltip(machineName)` | 笔记本电脑图标 | 机器名 | R2：紧邻的 `details-machine-name` 就写着它 | **删除**；若那个名字会被切，把提示挂到名字上、仅截断时显示 |
| 17 | `workspace-details.js:195` `.tooltip(folder)` | 文件夹图标 | 工作目录路径 | 无对应 | 保持：这一行只有图标，没有文字路径 |
| 18 | `workspace-details.js:200` `.tooltip(folder / reason)` | "Open in Finder" 行（有文字） | 目录路径或不可用原因 | R4 | 保持：文字说的是动作，路径别处没有 |

删除 2，改 3，保持 7。

## t3-chrome（负责人：panel-ab / t34b）

| # | 位置 | 触发元素 | tooltip 内容 | T3 对应 | 结论 |
|---|---|---|---|---|---|
| 19 | `main.js:98` 的 `button()`（`:104`、`:105`、`:202`、`:207`、`:208`、`:209` 共 6 个） | 纯图标（`label` 只给无障碍，`text` 才画字） | 动作名 + 键 | R1 | 保持 |
| 20 | `main.js:107` | 胶囊，可见字只有 "Update" | `Update <ver> downloaded. Click to restart` | R4：控件装不下 | 保持 |
| 21 | `main.js:138` | 纯图标（收件箱/列表） | Show lists / Show inbox + 键 | R1 | 保持 |
| 22 | `main.js:143` | 纯图标 | Hide sidebar | R1 | 保持 |
| 23 | `main.js:170` | 标题栏 surface tab，文字 `max_w(144) truncate` | label，文件 tab 给路径 | R3：`RightPanelTabs.tsx:968-990` | **改：仅名字被切时显示**（同 t3-tabs 的量法） |
| 24 | `main.js:183` 的 `button()`（标签条） | 纯图标 | 动作名 + 键 | R1 | 保持 |
| 25 | `main.js:229` `.tooltip(reason)` | 禁用的 surface 菜单行 | 原因 | R4 | 保持 |

删除 0，改 1，保持 6。

## t3-tabs（负责人：panel-ab / t34b）

| # | 位置 | 触发元素 | tooltip 内容 | T3 对应 | 结论 |
|---|---|---|---|---|---|
| 26 | `main.js:307` | 纯图标 + 各状态计数 | `Show sidebar, 3 working · …` | R1 | 保持 |
| 27 | `main.js:371` 的 `button()`（标签条 5 个） | 纯图标 | 动作名 + 键 | R1 | 保持 |
| 28 | `main.js:464` | 20px 方块：悬停是 ×，否则是状态点 | Close tab (+键) | R1 + `panel-tab-close-button.tsx:12-36` | 保持 |
| 29 | `main.js:591` 的 `link()`（面包屑的 space 段） | 项目图标 + space 名（可截断） | `Open a tab in <space>` | `ChatHeader.tsx:297-316`：同样说动作 "New thread in <project>" | 保持：说的是动作，不是把名字再念一遍 |
| — | `main.js:596-612` 的 `nameText()`/`named()`（标题、父级、tab 名） | 可能被切的文字 | 只有被切时给全文，位置对齐名字起点 | R3 | 已经正确；复制这个做法给上面标「改」的项 |

删除 0，改 0，保持 4 类。

## t3-inbox（暂无负责人）

| # | 位置 | 触发元素 | tooltip 内容 | T3 对应 | 结论 |
|---|---|---|---|---|---|
| 30 | `filter.js:39` 的 `tool()`（2 个） | 纯图标 | New space / New tab + 键 | R1 | 保持 |
| 31 | `filter.js:109` | 头像 / 漏斗 | Filter by space + hint "Shift+click to pick several" | `SidebarThreadHeader.tsx:108-122`：同样第二行弱色说 Shift+click 与键 | 保持：hint 是行里没有的操作说明 |
| 32 | `list-view.js:130` | 收纳区的小文字按钮 | Clear settled agents | R4：点明对象 | 保持 |
| 33 | `row-view.js:112` | 铃 + "Woke" 文字 | Dismiss Woke notification | `SidebarThreadRow.tsx:1288-1301` 同名同义 | 保持 |
| 34 | `row-view.js:146` | 纯图标（√） | Settle agent / Settle and close | `SidebarThreadRow.tsx:1363-1379` | 保持 |
| 35 | `row-view.js:214` | 16px space 头像 | space 名 | T3 的行头像没有 tooltip（R6 例外是整行） | 保持：slim 行不写 space 名，只有这个头像 |
| 36 | `row-view.js:220` | 纯图标（撤销） | 撤销哪一步 + 键 | `SidebarThreadRow.tsx:1343-1359` Un-settle thread | 保持 |
| 37 | `snooze.js:239` | 纯图标（闹钟） | Snooze agent | `SidebarThreadRow.tsx:383-400` Snooze thread | 保持 |

删除 0，改 0，保持 8。

## t3-agents（暂无负责人）

| # | 位置 | 触发元素 | tooltip 内容 | T3 对应 | 结论 |
|---|---|---|---|---|---|
| 38 | `main.js:272` | 纯图标（排序） | `Sort agents: <当前>` | R1 | 保持 |
| 39 | `rows.js:113` 的 `tipMark` | 纯标记 | Working / Done / …（含 note） | `ThreadStatusIndicators.tsx:606-655` | 保持 |
| 40 | `rows.js:139` | 折叠箭头（+计数） | `n sub-agents` | 标记规则 | 保持 |
| 41 | `rows.js:232` | 纯图标（图钉） | Pin / Unpin | `SidebarThreadRow.tsx:1101-1120` | 保持 |

删除 0，改 0，保持 4。

## t3-spaces（暂无负责人）

| # | 位置 | 触发元素 | tooltip 内容 | T3 对应 | 结论 |
|---|---|---|---|---|---|
| 42 | `main.js:273` | 6px 圆点 | Connected / Asleep | `ThreadStatusIndicators.tsx:606-655` | 保持 |
| 43 | `main.js:277` | 文字 "Connect" | `Connect <machine>` | R2：同一行就写着机器名 | **删除**（想去掉歧义就在行上写明，别靠 tooltip） |
| 44 | `main.js:285` | 纯图标 `+` | New space here + 键 | R1 | 保持 |
| 45 | `main.js:316` 的 `mark()` | 纯字形 `↑3` / `↓2` | `3 commits to push` | 标记规则 | 保持 |
| 46 | `main.js:345` | 折叠箭头（+计数） | Collapse / Expand worktrees | 同 #40 | 保持 |
| 47 | `main.js:552` 的 `tool()`（2 个） | 纯图标 | 动作名 + 键 | 同 #30 | 保持 |

删除 1，改 0，保持 5。

## t3-pane（负责人：subagent-menu-impl / t356）

| # | 位置 | 触发元素 | tooltip 内容 | T3 对应 | 结论 |
|---|---|---|---|---|---|
| 48 | `main.js:216` | 只有数字的按钮 | `3 sub-agents, 1 needs you` | 标记规则 | 保持：数字自己说不清 |
| 49 | `main.js:256` 的 `button()`（Split right / Split down / Zoom / Close pane） | 纯图标 | 动作名 + 键 | `ThreadTerminalDrawer.tsx:1259-1294`、`:1665-1677`：同样是图标 + 名字 + 键 | 保持 |
| 50 | `main.js:325`、`:327`、`:329`、`:331`、`:332` | 纯标记（转圈 / `!` / 闹钟 + 剩余时间 / √ / 圆点） | Working / Needs you / Snoozed / Settled / Done | `ThreadStatusIndicators.tsx:606-655` | 保持 |

删除 0，改 0，保持 7。

## 没有 tooltip 的 mod

`t3-home`、`t3-new-menu`、`t3-picker`、`t3-menu` 只有 `keyOf`/`keyLabel` 的导入，没有任何 tooltip 调用点；`t3-*-/tip.js` 在这些 mod 里只为了 `import "./tip.js"` 能解析（mod 不能引用文件夹外的东西）。

## 汇总

| mod | 调用点 | 删除 | 改成有条件 | 保持 | 负责人 |
|---|---|---|---|---|---|
| t3-files | 6 | 2 | 0 | 4 | files-parity（t34q） |
| t3-actions | 12 | 2 | 3 | 7 | panel-ab（t34b） |
| t3-chrome | 7 | 0 | 1 | 6 | panel-ab（t34b） |
| t3-tabs | 4 | 0 | 0 | 4 | panel-ab（t34b） |
| t3-inbox | 8 | 0 | 0 | 8 | 暂无 |
| t3-agents | 4 | 0 | 0 | 4 | 暂无 |
| t3-spaces | 6 | 1 | 0 | 5 | 暂无 |
| t3-pane | 7 | 0 | 0 | 7 | subagent-menu-impl（t356） |
| 合计 | 54 | 5 | 4 | 45 | |

按实例算更大的量在 helper 上：`t3-files` 的 `control()` 一处管 6 个按钮，`t3-chrome` 两个 `button()` 管 6 + N 个，`t3-tabs` 一处管 5 个，`filter.js` / `spaces` 的 `tool()` 各管 2 个。

## 需要用户决定的边界

1. **T3 自己也有几处"名字完整可见还带 tooltip"**：状态标记（`ThreadStatusIndicators.tsx:647-655`，宽屏时标签就在旁边）、`row-view.js:112` 的 Woke 按钮（我们照 T3 抄的）。是否也一起收紧成"仅截断时"，还是一个决定；清单里按 T3 现状列为保持。
2. **面包屑的 tooltip**。T3 有（R3），用户不要。已按用户结论列为删除；日后若有人拿 T3 对齐回来，以本条为准。
3. **分裂按钮的 `⌄`**（#9 `action-more`、#24 的同类）。T3 给了 `aria-label` 却不给 tooltip；R1 又支持给。留或删都说得通，建议留（纯图标，符合 R1）。
4. **文件树行**（#5）。用户举的 `.pi` 是"名字完整显示却弹同样的字"。三种落法：删（T3 的做法，最省）／只在名字被切时给名字／只在名字被切时给路径。清单里推荐第一种，因为第三种要量宽度且路径本来就是树里能读出来的东西。
5. **"仅截断时"要不要量宽**。`t3-tabs` 已经有量法（`main.js:596-612`），复用是真截图验收的事；若嫌重，这些项可以退化成删除，代价是长名字在窄侧栏里读不全。

## 未做的事

- 没开 demo 窗口，没看截图，没验证真实悬停；行号与 T3 源码位置是代码事实，观感结论要照 `AGENTS.md` 的要求用 demo 截图验收。
- 没改任何 mods 代码；`scripts/sync.sh`、`scripts/check.sh` 未跑（本次只加一份文档）。
