# 子 agent 菜单重设计：问题、参考与三个画法

2026-11-14。HTML 对照稿未入库：该设计后被否决，结果见[只留列表](sub-agent-menu-list-only/README.md)。只出稿，不改 `mods/`。

现状来自截图 `Snapzy_2026-11-14_01-18-35_748.png`，实现是 `mods/t3-pane/main.js`（入口按钮 `:178`、行 `:118`）、`tree.js`、`details.js`。规范见 [RECIPE §Panes and sub-agents](../../RECIPE.md)，上一版验收见 [sub-agent-menu-validation.md](sub-agent-menu-validation.md)。

## 它要回答的问题

1. 这个终端下面有几个子 agent，谁派的谁？
2. 有谁需要我？
3. 谁还在跑，跑了多久？
4. 这一行是哪个终端：在哪个 space / tab、哪台机器、哪个目录或分支？
5. 我怎么看它一眼，能对它做什么？

现在第 1 条答得含糊（数字不含父级，却和标题栏的聚合转圈并排），第 2 条在入口和标题栏各说一遍，第 4 条只在悬停卡里、且卡片只能往左压在终端上，第 5 条只有 peek。

核对截图后需要修正用户的三条判断：

- 「每行都重复同一个 Pi 图标」成立：`programIcon(k.program, 16)` 每行都画，七个 Pi 子 agent 完全同形。
- 「父级用转圈加时长，子级用 Idle 加圆环」不成立，差别来自**状态而非层级**：运行行是「时长 + 转圈」，空闲行是「Idle + 圆环」，需要你是「Needs you + `!`」。缩进只表示深度，`panel-ab` 和 `files-parity` 都是第 0 层。真正的问题是同一状态在右列被写了两遍，且列的**形状随状态变**。
- 「7 agents 把父级和子级混在一起计数」不成立：`kidRows` 只走子孙，父级不在列表里，7 就是 7 行。含糊的是措辞和位置，不是算术。

补充一条截图看不出的：`kidStatus` 把子 agent 的 `done` 读成 `idle`，所以「跑完交回结果」和「从没开工」完全同形。

## 数据与宿主能力（读源码与 `herdr-app commands` 确认）

| 要显示 | 从哪来 |
| --- | --- |
| 层级 | `terminals().parent`，`tree.js` 只算 `state === "live"` 且跳过中间的命令 shell |
| 状态 | `terminals().status`（working / blocked / done / idle / error）；`agents()` 没有 error |
| 时长 | `status_ms`、`created_ms`，`mods/t3-inbox/row-model.js` 已按同一口径用过 |
| 在哪 | `cwd`；有自己的 pane 才有 `panes().branch`；地址前缀即机器；`labels["pi.session"]` 是 spawn 时给的任务名，`labels.where` 形如 `space / tab` |
| 看一眼 | `terminal.peek`（自带 keep / close 控件） |
| 其它动作 | `terminal.keep`、`terminal.park`、`terminal.kill`、`agent.focus`、`copy` 地址；侧栏 `t3-menu` 的 agent 菜单已经列着这些，窗格菜单没有 |

## T3 Code（`pingdotgg/t3code@09a54f01`）能借鉴什么

可迁移：

- `SidebarThreadRow.tsx`：一行一个状态位。有状态时是「图标 + 词 + 运行时长」，没有状态位时才退回相对时间；悬停时状态位让位给行控件。状态词表固定（Working / Waiting / Approval / Input / Failed / Done…），不是每种状态自己发明一种形状。
- `ThreadActivityBanners.tsx` 的 `childInputNowItem`：子线程等人时收成**一句**，句子里列出名字，尾部一个动作（Open question）；父级自己在等人时不重复说。
- `ThreadNow.tsx`：行的形制固定为「图标 + 标题 + 说明 + 动作」，标题先截断，动作永不被截断。
- `NativeChildWorkDialog.tsx`：provider 原生子 agent 的**只读**记录单独放一个对话框，并明说「这些子 agent 收不到消息」——记录与操作分开。

不能迁移：

- **单位不同**。T3 的子 agent 是一个线程：有标题、prompt、消息、模型、lastError、审批。我们的是一个终端：`cwd`、程序、状态、按时长。所以「它在做什么」只能靠目录 / 分支 / 任务名回答，做不出 prompt 摘要或步骤流水。
- **可操作性相反**。T3 那个对话框明确只读；我们的子 agent 是能 peek、能 keep、能 kill 的终端，所以菜单是操作面，不是记录面。
- **位置不同**。T3 侧栏在左，悬停卡往右开进正文；我们的菜单贴着窗口右缘，卡片只能往左压在终端上。
- **粒度不同**。T3 有九种状态词（含审批、限流）。Herdr 的 OSC 7501 只给 working / blocked / done / idle，一轮失败记在终端上的 `error`，再细分就是编。

## 三个画法

| | A 一行一个状态 | B 详情进菜单（首推） | C 行自己带身份 |
| --- | --- | --- | --- |
| 行 | 28，树线 + 折叠 | 同 A | 44，两行 |
| 右列 | 一个状态：转圈+时长 / `!` Needs you / `!` Failed / 完成点 / 空 | 同 A | 同 A，悬停换成 `Peek` |
| 身份 | 悬停卡，菜单外，压终端 | 菜单底部 3 行 + 3 个动作，固定高 | 每行第二行写 space / tab · 目录 |
| 键盘选中 | 只有高亮，无身份 | 详情跟着走 | 详情常驻 |
| 可见行数 | 10 | 10（菜单更高） | 6 |
| 代价 | 遮挡与无键盘详情都留着 | 多一层要维护、菜单高 60px | 第二行常常七行同值，正是上一版撤掉的双行常驻 |

三案共用：入口恒定「7 ⌄」（需要你时转 `blocked`，数量与原因进 tooltip，标题栏自己的 `!`/转圈留给没有子 agent 的窗格）；图标槽只在程序与父级不同时画程序，有子级时改放折叠箭头；空闲行不再写「Idle」，只留空或改写成「闲了多久」。

## 首推 B

1. 菜单在窗口最右边，悬停卡没有右边可去，只能压在正在看的终端上——这是位置决定的，不是取舍。
2. 卡片挂在 `on_hover` 上，方向键走到哪一行都没有身份信息；B 顺手补上这个缺口。
3. 「能对它做什么」还没有落点；B 的详情条给 Peek / Send back / Copy address 一个位置，命令都是现成的。
4. A 是 B 的退化版，行语言相同，只差详情放哪；担心菜单变高就选 A。

## 待决定

- 详情层留在菜单外（与 Inbox / Agents 的共用卡片一致）还是进菜单？
- 程序图标：与父级相同时换成折叠箭头，还是每行照画？
- 空闲行：留空，还是写「闲了多久」？
- 排序：严格树序（靠折叠收），还是「需要你的浮到最上面」（会切断父子关系）？

未验证：真机鼠标点击、悬停与时序；三张图是静态示意，`terminal.*` 命令取自 `herdr-app commands` 的清单，没有执行。

用户看过实装后改为只留列表。
