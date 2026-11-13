# A/B：详情与 space 面板标签验证

日期：2026-11-13。需求基线 `210f95a5`；实现见本报告所在提交。范围为 A/B，不包括并行的壁纸构图 C。未 push。

## 结果

- 详情改为按需三行 popup，入口是 square-menu；机器名为单行截断的 ComputerName，目录只在 folder 图标的提示／复制菜单显示，Open in 使用应用图标，Actions 保留运行／编辑／删除流程与来源目录。
- 固定 Files／Review 两页被动态标签替代：空态、添加、文件去重／通用 Files 原位替换、唯一 Review、关闭和批量关闭、隐藏／恢复、放大及每 space 状态均已实现。左图标槽悬停／聚焦换 ×，+ 紧跟末标签，布局控件固定最右。
- 文件树菜单只属于 Files：本机 Reveal、相对路径 Copy path、Insert 到当前终端标签最后活动的 terminal，不按 Enter。Insert 恢复文本剪贴板，不覆盖图片／用户后来复制的文本，拒绝控制字符路径。
- 关闭 Review 清持久范围、使在途结果失效；即使关闭后尚未到清理定时器，迟到 diff 也不能重新占用缓存、发布旧范围或启动分析。
- 经用户确认，每 space 仅最近显示的三个文件标签保留 Editor／阅读位置；更早标签从顶部重读。每页仍只缓存最近三个 space，最多九个文件 Editor。
- **B2b 终端路径点击首版未完成**：宿主没有终端链接检测／点击回调，未以覆盖终端或轮询文本替代。宿主事实见 [host-capability-verification.md](../host-capability-verification.md)。

## 原始视觉反馈与回放

保留用户原话：

> 现在完全不一样，而且图标也用错了
>
> 我们得用我们的设计token来做！！
>
> 其实这些细节也可以对齐啊 关闭按钮位置 新建位置

按反馈重放本机多动作、空动作、长远程名三种详情，以及多个文件／Files 标签的面板头；逐张查看整窗，不以一词可见或 crop 替代布局验收。三行均不换成标签／值表格；× 位于左图标槽，+ 不在固定右工具区。对比图只说明形状与位置，不宣称真实 hover 已回放。

## 可运行检查

- `sh scripts/sync.sh` 成功：共享源码和图标同步到各 mod、三个关联仓库和本机安装。
- `sh scripts/check.sh` 输出 **all checks passed**，见 [check.log](check.log)。覆盖共享副本一致性、每 mod 宿主检查／TypeScript、图标字面量路径、render guard、行为测试与更新脚本。
- 十个相关检查单独运行并通过，命令与输出见 [targeted-checks.log](targeted-checks.log)：面板模型、最后活动终端、文件菜单、Actions、Chrome、Files、标题栏／侧栏、Review、standalone Review。
- Review 回归包含：pending read → 关闭 Review → 在生命周期 timer 前返回 → 旧 diff／范围不恢复 → 重加新实例默认范围。文件菜单回归包含图片剪贴板、后来新复制、并发 Insert 和控制字符。
- `git diff --check` 及三个关联仓库的同项检查通过。最终双语 RECIPE 分别为 59,832／55,110 UTF-8 bytes，均低于 60,000；后续 C 提交仍需保持此门禁。

### Token 核对

唯一数值出处为 [t3-tokens.md](../../internals/t3-tokens.md) 的「面板标签」「详情 popup」「按钮」。对照 T3 Code `09a54f01` 的 `RightPanelTabs.tsx`、`panel-tab-close-button.tsx`、`threadDetailsPanelStyles.ts` 和 `threadDetailsCardLayout.ts`。

| 部位 | 已采用值／来源 |
| --- | --- |
| 详情／面板入口 | 现有 `button()` ghost/sm/card，28 方、icon16、radius8、gap4；hover7%、on12%，不另造5%开启底 |
| 详情卡片 | 280×112、inset8、radius16、主题 border1；三行32、text13 medium、icon16、gap10、px10、row radius8 |
| split | 箭头宽32、中线高16、仅悬停显示；文字 foreground、图标 dim、底 popover、边 border |
| 标签 | 高24、max144、radius6、pl6/pr8/gap2、text12；左16槽内 icon12，换 × 时 tiny/tab、radius4 |
| 添加入口 | 现有 xs ghost 24 方、icon14；与标签 gap4 同条滚动，菜单 start、offset6 |
| 菜单／禁用 | 复用现有菜单行和 button 规则；无专属应用图标时本 mod 的 app-window，避免空白 |

[token-audit.log](token-audit.log) 留有 grep 输出：检查范围内无 UI 十六进制色值或被替换的5%／80%自定义色；数值几何逐项可追溯。代码仍有对应 token 的 px 参数，**不是“零硬编码 px”**。Finder／VS Code 用彩色 image；Cursor／Zed／generic 图标也在 demo 菜单中实际见到。

## 整窗证据

独立 demo，macOS，默认 sidebar256，zoom1.1；默认窗口1680×1042 point，截图3360×2084 pixel。窄窗1100×1042 point。以下均为完整窗口，popup／comparison 图仅为辅助放大。

| 场景 | 证据 |
| --- | --- |
| 本机，多 Actions | [整窗](details-actions-window.png) · [popup](details-actions-popup.png) · [对比](details-actions-comparison.png) |
| 本机，无 Actions | [整窗](details-empty-window.png) · [popup](details-empty-popup.png) · [对比](details-empty-comparison.png) |
| 长远程机器名，Open in 禁用 | [整窗](details-remote-window.png) · [popup](details-remote-popup.png) · [对比](details-remote-comparison.png) |
| 多文件与通用 Files／+／最右控件 | [整窗](panel-tabs-window.png) · [头部放大](panel-tabs-zoom.png) · [位置对比](panel-tabs-comparison.png) |
| 大量标签溢出 | [整窗](panel-overflow-window.png) |
| 文件内容与共用树 | [整窗](panel-files-window.png) |
| Open a surface 空态 | [整窗](panel-empty-window.png) |
| 窄窗暗／亮色 | [暗](panel-narrow-window.png) · [亮](panel-narrow-light-window.png) |
| 亮色详情 | [整窗](details-light-window.png) |
| 放大／详情恢复工作列 | [放大](panel-wide-window.png) · [详情恢复](details-restores-work-window.png) |
| 没装 Review | [整窗](panel-without-review-window.png) · [状态](without-review-status.json) |
| 应用图标资产 | [整窗](editor-icons-window.png) |

[demo-status.json](demo-status.json) 无运行错误。另创建第二 demo space 后，[source-invalidation-status.json](source-invalidation-status.json) 只剩预期 toast，没有详情 overlay、没有 errors，确认来源失效自动关闭；未改用户窗口的 space／tab／pane。

## 验证边界

- 由 `herdr-app do` 和 demo-stage 脚本驱动，没有执行真实鼠标操作；中／右键、拖动、hover 换 ×、斜移子菜单及真实 `cmd-t`／`cmd-w`／Escape 焦点路由仍需硬件回放。相应 handler 由行为测试覆盖，不等于硬件验收。
- 远程三行截图为明确的 props 视觉 fixture，不是真实 SSH；编辑器图标菜单也包含未安装目标作资产 fixture。真实远程终端和真实编辑器接收目录未在本轮端到端验证。
- 非 macOS 原生窗口按钮仅有模型／渲染测试，未在相应平台 GUI 回放。
- 打开／关闭详情不改变布局；“放大时进入详情先恢复工作列”是需求明确的例外。已回放外部命令打开／来源失效／恢复工作列，未声称所有真实输入焦点场景通过。

## 删除与同步提交

删除旧 `shared/check-panel.cjs`，由 surface 测试替代；删除 Review 专属 file-menu 和 `at-sign`／`external-link`／`folder-open` 图标、Files 的 `external-link` 图标、pulls-review 的 `panel-right` 图标与旧 panelButton。固定两页 UI／协议由 surface 实现取代，不保留旧模式开关；已有持久 page 在首次读取时迁移为相应标签。

关联仓库已分别提交且工作树干净：

| 仓库 | commit |
| --- | --- |
| `herdr-t3-actions` | `ac1fe37` — `feat(actions): add on-demand workspace details` |
| `herdr-t3-inbox` | `a0d0aae` — `chore(store): sync shared editor target key` |
| `herdr-pulls-review` | `c6c8b33` — `feat(review): support closable space panel surfaces` |

本任务 demo `/private/tmp/panel-ab` 已 `stage.sh down`；离线源码副本、临时门禁日志已清除，无辅助分支／worktree／子 agent。截图、日志和本报告保存在此目录。并行 C 的资源与改动保留，未混入本任务提交。
