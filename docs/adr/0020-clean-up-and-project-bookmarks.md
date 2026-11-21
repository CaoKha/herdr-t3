# 闲置终端由 Clean up 一步回收，Project 存于 t3.projects

Herdr 的 space 靠活窗格维持存在，而每个终端都是真实进程。Inbox 只列需要你的 agent，于是已 Settle 的 agent 和停在提示符的 shell 离开了注意力却还占着内存。此前 Inbox 在 Settled 头部塞入 `Clear`，清理最后一个窗格时还通过 `tab.new` 补建后台空 shell 给 space 续命：把进程回收混进了注意力分组，又制造了 Inbox 看不见的空壳 space。

我们把回收做成一个不离开 Inbox 的动作，并让项目不再靠活终端保活：

- **Project（`t3.projects`）**：`t3-tabs` 自动记录打开过的非 Home 项目 `(machine, folder, name, named?)`（最近在前，上限 50）。`New`（`t3-new-menu`）在当前存活 space 之后顺序列出尚未打开的 Project，选中即调 `space.new` 原地唤醒；未打开的 Project 行（含离线／已移除远程机器上的记录）可在行尾用 `×` 或在选中行按 `ctrl-d` 从 `t3.projects` 移除并留在 `New` 里，不碰存活 space 或磁盘文件；存活 space 行不显示进程状态或关闭控件。关掉整个 space 不再有损失，也就不再需要盘点哪些项目还活着。
- **Clean up（`t3-tabs.cleanup`）**：快捷键与侧栏底栏的垃圾桶图标打开它的对话框，对话框就是确认框，不先打开任何列表。闲置的终端按两类折成各自可展开的分组——`Settled`（当前标签之外、core 已确认 `settled` 且无忙碌子 agent 的顶层 agent）和 `Idle shells`（`atPrompt` 的非 agent shell），各自默认折起到数量与随之关闭的 space，展开按 space 列名字与程序图标；既可由底部主按钮一步全部关掉（两组都在时写作 `Close all <n>`，否则 `Close <n>`，按 `Enter` 同效），也可按分组 `Close` 或在展开行上按行 `Close`（或 `ctrl-d`）逐个关掉而留在对话框里。右侧全部 `Close`／`Stop` 按钮统一固定 54px 宽列，悬停不重排，首按（含行／卡片上的 `ctrl-d`）即执行而不再二次确认；按 `Esc` 立即关闭对话框。每次关闭都经 `scanCleanup` 复查目标，只把整标签全在待关子集里的标签经 `tab.close`（`confirmed: true`）关闭，空掉的 space 随之关闭。被落下的程序（Left behind）各是一张卡片，写明所在 space 和前台进程：点卡片跳过去，卡片上的 `Stop`（或 `ctrl-d`）直接停掉而留在对话框里；用文字而不用 `×`，因为布局别处的 `×` 在有程序运行时会另弹确认框，同一个图标不该有两种后果。数量和随之关闭的 space 按仍在的终端实时计算，底部说明在合并关闭才会清空额外 space 时先写明它们，再写明跳过的两种范围：当前标签，以及当前 space 里的程序。名字统一为 Clean up：它回收的东西不能恢复，所以不叫回收站或 Trash，垃圾桶只是图标。被落下指它仍在运行，但所在 space 已没有在工作的 agent（没有未 Settle 的顶层 agent，Snooze 中的算在工作），且不是你正在的 space。三样都没有时只弹提示。被忘掉的程序就是在这里被发现并处理的。
- **找终端**：交给 Go to（它本就搜 space 名，输入项目名即列出该项目的窗格）和面包屑的 space 菜单。
- **Inbox 与 Filter**：从 `Settled` 头部移除 `Clear`；`Filter by space` 仅列出当前在 Inbox 有条目或仍在 `scope` 中的 space。

## Considered Options

- **温缓冲自动回收 Settled 终端**：否决。后台静默杀进程会让想回翻终端历史的人措手不及；回收必须由人触发并确认。
- **Running：列出全部存活 space 与窗格的弹层，兼管 space 关闭、右键菜单与清理**（实现过一版）：否决。它是存活清单而不是动作：跳转与 Go to 重复，关 space 与 space 菜单重复，还列出正需要你的 agent；底栏的存活 space 数说明不了该不该动手。
- **Background：只列已 Settle 的 agent 和不含 agent 的窗格，按 space 分组，做成弹层或侧栏模式**（弹层实现过一版）：否决。逐个真实场景过下来没有非它不可的：回收由 Clean up 一步完成，确认框顺带暴露忘掉的程序；回到某个程序时人记得它叫什么，用 Go to；回到 Settle 的 agent 有 Settled 收纳区。先开一个列表再清理，只是把人从 Inbox 里拖出来多走一步。
- **在 Inbox 底部增加 `Spaces` 或 `Terminals` 收纳区**：否决。Inbox 只按注意力组织。
- **把存活状态与关闭塞进 `New` 或 `Filter by space`**：否决。污染了「新建」与「过滤卡片」各自的单一动作。
- **把其他 space 加进面包屑的 space 菜单**：否决。它的语义是「当前 space 下有什么」。
- **底栏按钮在没有可关的东西时置灰**：否决。shell 是否空闲要用 `hc get` 探测，底栏不能每帧探测；按下后什么都没有就弹出提示。
- **确认框只用一段文字点名要关的和仍在运行的**（实现过一版）：否决。名字一多读不过来，读到被忘掉的程序也没法当场处理，还得再开 Go to。
- **把当前标签之外所有仍在运行的程序都列成卡片**（实现过一版）：否决。系统只知道它在跑，不知道你还在不在用；正在看的 `btop`、正在用的 dev server 也会进来，而这个对话框的意思是「这些可以扔」。改为只列所在 space 已无 agent 在工作的程序，人手动测试时开着的 dev server 仍可能被列出，但不会被默认清掉。
- **只列很久没看过的程序**：否决。要定一个时间阈值，长期在后台跑、确实不用看的程序会被误判。
- **卡片用 `×` 停止**（实现过一版）：否决。同一个 `×` 在 space 菜单里会另弹确认框、在这里是卡片内直接停止的动作；改用文字 `Stop`，避免同一个图标表达两种后果。
- **关掉的终端可以恢复**：否决。进程结束就没了；恢复 agent 要逐个程序记会话 ID 再 resume，代价远超所得。
