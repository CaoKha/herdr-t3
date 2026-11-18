# 闲置终端由 Close idle 一步关掉，项目书签存于 t3.projects

Herdr 的 space 靠活窗格维持存在，而每个终端都是真实进程。Inbox 只列需要你的 agent，于是已 Settle 的 agent 和停在提示符的 shell 离开了注意力却还占着内存。此前 Inbox 在 Settled 头部塞入 `Clear`，清理最后一个窗格时还通过 `tab.new` 补建后台空 shell 给 space 续命：把进程回收混进了注意力分组，又制造了 Inbox 看不见的空壳 space。

我们把回收做成一个不离开 Inbox 的动作，并让项目不再靠活终端保活：

- **项目书签（`t3.projects`）**：`t3-tabs` 自动记录打开过的非 Home 项目 `(machine, folder, name, named?)`（最近在前，上限 50）。`New`（`t3-new-menu`）在当前存活 space 之后顺序列出尚未打开的书签，选中即调 `space.new` 原地唤醒，不显示进程状态或关闭控件。关掉整个 space 不再有损失，也就不再需要盘点哪些项目还活着。
- **Close idle（`t3-tabs.cleanup`）**：快捷键与侧栏底栏的图标按钮直接弹出确认框，不先打开任何列表。确认框按 space 点名要关的终端（当前标签之外、core 已确认 `settled` 的顶层 agent，以及 `atPrompt` 的非 agent shell），说明随之关闭的 space，并列出仍在运行、不会关闭的程序。确认时逐个复查；整标签都属待关集合时经 `tab.close`（`confirmed: true`）关闭，空掉的 space 随之关闭。没有可关的东西时弹出提示，列出仍在运行的程序。
- **找终端**：交给 Go to（它本就搜 space 名，输入项目名即列出该项目的窗格）和面包屑的 space 菜单。
- **Inbox 与 Filter**：从 `Settled` 头部移除 `Clear`；`Filter by space` 仅列出当前在 Inbox 有条目或仍在 `scope` 中的 space。

## Considered Options

- **温缓冲自动回收 Settled 终端**：否决。后台静默杀进程会让想回翻终端历史的人措手不及；回收必须由人触发并确认。
- **Running：列出全部存活 space 与窗格的弹层，兼管 space 关闭、右键菜单与清理**（实现过一版）：否决。它是存活清单而不是动作：跳转与 Go to 重复，关 space 与 space 菜单重复，还列出正需要你的 agent；底栏的存活 space 数说明不了该不该动手。
- **Background：只列已 Settle 的 agent 和不含 agent 的窗格，按 space 分组，做成弹层或侧栏模式**（弹层实现过一版）：否决。逐个真实场景过下来没有非它不可的：回收由 Close idle 一步完成，确认框顺带暴露忘掉的程序；回到某个程序时人记得它叫什么，用 Go to；回到 Settle 的 agent 有 Settled 收纳区。先开一个列表再清理，只是把人从 Inbox 里拖出来多走一步。
- **在 Inbox 底部增加 `Spaces` 或 `Terminals` 收纳区**：否决。Inbox 只按注意力组织。
- **把存活状态与关闭塞进 `New` 或 `Filter by space`**：否决。污染了「新建」与「过滤卡片」各自的单一动作。
- **把其他 space 加进面包屑的 space 菜单**：否决。它的语义是「当前 space 下有什么」。
- **底栏按钮在没有可关的东西时置灰**：否决。shell 是否空闲要用 `hc get` 探测，底栏不能每帧探测；按下后没有可关的就弹出提示。
