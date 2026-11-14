# 子 agent 菜单：只留列表

2026-11-14；基线 `b843396f`。用户看过实装截图后反馈：「这下面这块很丑啊，过度设计了。」「而且感觉和整个布局其他控件的信息重复了。」最终决定删除整块 footer，而不是继续调整它。

## 结果

- 删除固定详情、Peek／Send back／Copy address 三个底部按钮、动作焦点、默认选首个需要你的行及仅供详情使用的身份快照。菜单只剩原树序列表，不恢复外部悬停卡。
- 保留逐行程序图标、图标旁折叠控件、固定状态列、工作／空闲时长、done／idle／error 区分及入口数量 tooltip。
- 点行或方向键加 Enter 仍 peek；行右键先关闭列表，再按该行地址复用 `shared/menu.js` 的 agent 菜单，不另造操作菜单。
- 双语 RECIPE、README、changelog、用户指南已同步；删除 storage 与 token 文档里本轮废弃的详情／footer 条目。先前研究仅保留为历史证据；被否决的 footer 设计的验收目录 `sub-agent-menu-redesign-validation/` 已删除，不入库。

## 回放与检查

先修改行为断言并观察旧实现失败：详情与右键两组断言在旧实现上均失败（原始日志未入库）。`node -r ./scripts/render-guard.cjs mods/t3-pane/check-pane.cjs` 和 `herdr-app check mods/t3-pane` 通过；全仓 `scripts/check.sh` 输出 `all checks passed`。检查覆盖无 footer、无默认高亮、右键目标地址及关闭顺序、Enter 前未选择不执行、键盘 peek、折叠与状态、悬停／键盘不枚举终端。

隔离 demo 在默认侧栏宽度、zoom 1.1 下回放，没有动用户窗口：

| 场景 | 整窗 | 菜单局部 |
| --- | --- | --- |
| 工作、嵌套需要你、空闲、完成、失败、长名六行 | [mixed.png](mixed.png) | [menu-detail.png](menu-detail.png) |
| 只剩一个后代 | [single.png](single.png) | [single-detail.png](single-detail.png) |
| 行右键打开共用 agent 菜单 | [context-menu.png](context-menu.png) | [context-detail.png](context-detail.png) |
| Down 高亮首行，无底部详情 | [keyboard.png](keyboard.png) | — |

已逐张检查上述整窗与局部：六行和单行都随内容收紧，没有空 footer；长名截断不挤状态列。右键回放针对 `t3`，共享菜单显示 Copy address `t3` 和 Send back to parent-running，原列表已关闭。单行 Down／Enter 后读回的 status 中 overlays 仅剩 layout、errors 为空。

回放通过临时 patch（未入库）暴露既有 handler 给 `herdr-app do`，未带入产品。没有使用真实鼠标或物理键盘；菜单的真实指针定位未验，回放菜单出现在默认指针位置。PNG 保留在本目录、按仓库既有规则不入 Git。

## 安装与审阅

同步从本任务提交的不可变快照运行 `scripts/sync.sh`，四个输出目标均隔离，避免将同仓并行 Quick Review 的未提交内容带入安装。用户安装只替换已提交的 `mods/t3-pane/main.js`；共享文件没有变化，三个关联仓没有本任务新增差异。同步和安装检查的日志未入库。不推送。

按单用户桌面菜单负载检查真实树读取、选择、折叠、关闭和共享菜单调用，没有待修问题。未重做性能基准：本轮主要删除详情快照和 footer，未增加周期工作或依赖。
