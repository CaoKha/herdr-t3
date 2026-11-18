# 存活盘点与清理收归 Running，项目书签存于 t3.projects

Herdr 的 space 靠活窗格维持存在，而每个终端都是真实进程。此前 Inbox 在 Settled 头部塞入 `Clear`，且清理最后一个窗格时通过 `tab.new` 补建后台空 shell 给 space 续命：既把进程回收混进了注意力视图，又在后台制造了 Inbox 看不见却占内存的空壳 space 與孤儿终端。

我们将五个入口按单一职责拆开：

- **项目书签（`t3.projects`）**：`t3-tabs` 自动记录打开过的非 Home 项目 `(machine, folder, name, named?)`（最近在前，上限 50）。`New`（`t3-new-menu`）在当前存活 space 之后顺序列出尚未打开的书签，选中即调 `space.new` 原地唤醒，不显示进程状态或关闭控件。项目入口不再依赖活终端保活。
- **Running（`t3-running`）**：侧栏底栏按钮（显示存活 space 数）与 `cmd-shift-r` / `ctrl-alt-r` 打开的 576 宽弹层，按存活 space 分组列出全部非 Home 窗格。点击或回车窗格行聚焦该窗格；space 标题行不跳转，仅提供关闭整个 space 与右键 space 菜单（含 worktree 管理）；底栏 `Clean up` 手动确认后关闭所有 core 已确认 `settled` 的非当前标签 agent 与停在提示符的非 agent 空 shell（`atPrompt`），若某 space 窗格全部被清则经 `tab.close`（`confirmed: true`）连同空 space 一起关闭。
- **Inbox 与 Filter**：从 `Settled` 头部移除 `Clear`；`Filter by space` 仅列出当前在 Inbox 有条目或仍在 `scope` 中的 space。

## Considered Options

- **温缓冲自动回收 Settled 终端**：否决。后台静默杀进程会让想回翻终端历史的人措手不及；回收必须由人触发并确认。
- **在 Inbox 底部增加 `Spaces` 或 `Terminals` 收纳区**：否决。Space 是容器，点击它没有自然的落脚窗格；`Terminals` 则会把正陪着活 agent 工作的分屏工具重复列进纯 agent 列表。
- **把存活状态与关闭塞进 `New` 或 `Filter by space`**：否决。污染了「新建」与「过滤卡片」各自的单一动作。
