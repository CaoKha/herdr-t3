# Files 面包屑补修与同步交接

## 可见行为

用户原话：「这里的鼠标悬停效果我感觉没必要，而且这里还有一个没必要的背景」（`Snapzy_2026-11-14_01-00-56_291.png`）。

用户已明确要求目录面包屑不要hover底色。本补修移除文字段的hover填色，仅保留文字提亮；滚动行仍透明，原`stop()`键盘focus-visible内环不变。chevron菜单按钮的按钮态不在这次“文字段”修复范围。

`check-files.cjs`先将“hover有7%底”改为“hover无底、文字foreground”，旧代码失败；一行实现后通过。`shared/check-focus.cjs`同时验证键盘模式及焦点环，Files定向/原生/严格类型检查均通过（红绿与门禁日志未入库）。

**真实Herdr hover未验证，未补hover态局部截图。** 没有向用户桌面注入鼠标，也不以假的hover样式图冒充原生悬停验收。原报告第12行对照和“有意差异”已删除“按card7%对齐”的结论；T3参考图/数值仍只描述原组件。

## sync与三个关联仓库

初次Files任务已运行`HERDR_APP_HOME=/private/tmp/files-parity-sync-target sh scripts/sync.sh`；本补修又运行`HERDR_APP_HOME=/private/tmp/files-crumb-sync-target sh scripts/sync.sh`，退出0。两个都是隔离安装目标，**没有同步到用户安装目录**：panel-ab仍在验收新版Details/Quick Review，明确要求继续冻结正常安装，最终用户安装与联合门禁由其收口。临时同步目标在验证后删除。

同步确实更新了三个关联工作树，但没有把其他人的中间态全目录提交：

| 仓库 | Files对应提交 | 范围 |
| --- | --- | --- |
| `herdr-t3-actions` | `34ce20a` | 共用Open in helper、Files目录surface的panel增量 |
| `herdr-pulls-review` | `c7b580a` | 两个panel副本、共用file-tree/nav-column |
| `herdr-t3-inbox` | 无新增Files提交；当前`eb67d37`是子agent状态修复 | Files没有分发到Inbox的改动；唯一剩余store改动属于Details，不造空提交、不混入他人scope |

两个新提交都未push。Actions/Review提交的panel刻意保留工作树里尚未提交的`keepDetails`参数增量，留给panel-ab的新Quick Review提交；其余Details/Review/measured-text中间态也未纳入本次提交。Inbox的`eb67d37`不是本次Files补修创建的提交。
