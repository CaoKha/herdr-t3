# 详情 popup：T3 源码交互对照

日期：2026-11-13。修正基线：Herdr T3 `a9e2f769`；参照：本机 `~/my/tools/t3code`，提交 `09a54f01bc`。这是逐状态源码审计，不是 GUI 全部通过的声明。用户反馈原话：

> 这个里面的交互细节做的不一致！！！没按照T3的逻辑来，还有一些UI的设计也不太对！我们要整体按照T3code来，具体细节token边距颜色按照我们的设计系统来

用户截图：`Snapzy_2026-11-13_23-45-27_598.png`（Herdr）；`Snapzy_2026-11-13_22-07-54_149.png`（T3），原件在 `~/Pictures/Snapzy/`。下面的 T3 状态均以源码为准；两张截图的脚本数据状态不同，不能直接把差异当成渲染 bug。

## 源码索引

以下路径均相对于 T3 `apps/web/src/`，行号对应上述固定提交：

| 代号 | 文件／关键位置 |
| --- | --- |
| P | `components/chat/ThreadDetailsPanel.tsx:125–320`：分区、显示条件、卡片右键菜单 |
| C | `components/chat/ThreadDetailsCard.tsx:133–220`：原生 Popover、关闭条件、initialFocus |
| R | `components/chat/ThreadDetailsControl.tsx`、`threadDetailsPanelStyles.ts`：整行／select／split、静止／hover／popup-open |
| S | `components/chat/ThreadDetailsSection.tsx`：区块内距、空分区及 divider |
| E | `components/BranchToolbar.tsx:106–140,173–430,680–745`：环境／工作区、路径提示／右键、锁定态 |
| O | `components/chat/OpenInPicker.tsx:180–440`：选择目标与实际打开是两种操作 |
| A | `components/ProjectScriptsControl.tsx:97–460`、`projectScripts.ts:105–108`：主脚本、菜单、编辑器、无脚本态 |
| G | `components/GitActionsControl.tsx:1049–1138,1284–1416,1488–1674`、`GitActionsControl.logic.ts`：Git 状态机、确认、进度、Changes |
| PR | `components/chat/ThreadDetailsPrRow.tsx`、`ThreadDetailsPrRows.tsx`：PR 状态／操作／watch／列表 |
| M | `components/ui/menu.tsx`、`ui/popover.tsx`：Base UI 原语；`chat/ThreadDetailsItemsMenu.tsx`、`threadDetailsItems.ts`：显隐设置 |

Herdr 当前对应：`mods/t3-actions/workspace-details.js`、`mods/t3-actions/main.js`，共享键盘工具在 `shared/focus.js`。Git 与 PR UI 当前不在详情内。

## 结构

```text
T3 ThreadDetailsCard
├─ Workspace（非空才显示）
│  ├─ 环境／工作区 select 或 locked row
│  ├─ Open in：主按钮 + 选择目标菜单
│  └─ Project scripts：空态整行 / 主脚本 split / 仅可导入时 Actions split
├─ divider（前面有非空分区且当前分区应分隔才显示）
├─ Version Control（有 cwd 且有内容）
│  ├─ Git repo 才有 Branch／PR
│  └─ 非 repo Initialize Git；repo 动态 quick action + Changes
└─ 其他可选分区（Servers/Automations/Lineage/Side chats/Usage/Context）
```

Herdr 原已确认的 A2 明确限定三行，排除了 Git 等内容；最新“整体按 T3”与该边界冲突。Git 是否纳入、全局 Actions 与项目脚本的对应关系、机器行是否仍复用 space 管理菜单，需要先明确再改行为。

## 逐控件对照

| 控件／状态 | T3 的实际行为 | Herdr `a9e2f769` | 差异／判定 |
| --- | --- | --- | --- |
| 打开 popup 的焦点 | C 的 `initialFocus` 请求 workspace details 区域，返回 `false`，不自动聚焦第一按钮；详情是 dialog，不是 Menu | focus 到专用 root handle，不主动 focus 第一行 | 源码都没有“第一行默认选中”。用户图确有第一行底色；需区分 pointer hover 与焦点，不能只从图片断言是 `at=0` |
| 打开时高亮 | R 静止透明；只有真实 hover／相应子菜单 open 才显中性底 | `detailsRow().hover()` 由宿主直接驱动；没有初始行选择号 | 现象待 demo 最小回放；不能用有高亮的现状当设计要求 |
| 详情内键盘 | C/R 是普通按钮顺序，Tab/Shift+Tab；Enter/Space 激活当前按钮；↑↓不实现整卡菜单式遍历 | root 仅拦 Escape，按钮用现有 stop/Tab | 基本模型一致；真实焦点路由未验，不应新增全卡 ↑↓ roving |
| 子菜单键盘 | M 的 Menu：↑↓移动、Enter选择、Escape收当前层；Tab/方向键由 Base UI 管 | Actions/Open in 子菜单自管 ↑↓/Enter/Escape | 行为测试已有；真实嵌套焦点恢复待验 |
| 点外关闭 | C Popover outside-press／focus-out 关闭；点 thread find bar 是明确例外 | 宿主 native popup 点外关闭；没有 find-bar 例外 | 宿主没有终端 find-bar 命中目标回调，不能伪造例外 |
| Workspace 行是否可点 | E 的 unlocked 为一个整行 MenuTrigger；locked 变 span，不可点且没有 chevron | 总是整行“Space menu”，复用 Rename/Close/Worktree 等 space 管理菜单 | **内容和操作目的不同**；不能把 space 管理菜单称作 T3 Run on/Workspace selector |
| Workspace chevron | E 打开 Run on（可选环境）与 Workspace（当前/新worktree/之前worktree）单选；已启动线程无迁移 handler，按锁定规则禁用 | 打开现有 space 管理菜单 | **需产品映射**；Herdr 已有终端不能原地换机器，最接近 T3 locked row，而非假装迁移 |
| folder 图标 | E 是 span + Tooltip，不是独立 button；左键随行打开 selector，locked 态无动作 | 独立 button，左键直接复制路径，右键 Copy directory | **不一致**：需移除独立复制点击，路径复制放右键菜单 |
| 路径右键 | E 整个 workspace row 的 context menu：Copy full path，成功 toast；保留格式化的完整路径 | 仅 folder button 右键 Copy directory，无成功反馈 | **不一致**：应是整行菜单、统一名称／反馈；不能污染 card 右键菜单 |
| 名称／路径 tooltip | E 机器 glyph 提示环境名，folder glyph 提示 workspacePath；标签按容器截断 | 机器名单行 truncate；folder 提示完整路径；机器 glyph 无专门提示 | 机器提示缺口；截断规则已有 |
| 第一行的 hover/split | R 的 select 是一个 trigger，label区／chevron区有独立半区 hover，父行同步底；竖线只 hover／popup-open | 一个整行 hover，folder 又是独立小按钮，没有select半区结构 | **不一致**；结构应按 select／locked 两态实现，色值仍用本仓 token |
| Open in 主按钮 | O 打开 preferredEditor；本组件不主动收掉详情；成功 announce | 立即关闭详情，再打开目录 | **不一致**，详情关闭策略不能与编辑器选择混为一谈 |
| Open in chevron | O 无条件保留选择菜单入口（host权限拒绝时禁用）；并非只在多目标时显示 | available 且目标多于1才显示 | **不一致**（当前实现遵循旧 A2，而非 T3源码） |
| Open in 菜单选择 | O toolbar/panel presentation 中只 `setPreferredEditor`，不打开；presentation=`menu` 才执行打开 | 选择目标会立即打开该目录并收掉详情 | **明确行为 bug**：panel 模式必须只改偏好，主按钮才执行 |
| Open in 菜单定位 | O 相对整条split的 anchor，align=end，菜单与整行同宽 | 以chevron边界定位，固定220宽 | **不一致**；应复用本仓菜单token，但宽度随整行anchor，不另写神秘常数 |
| Open in 空目标／远程 | O 无目标有disabled提示；remote-links按SSH路由用本机editor scheme，remote-unavailable显示No SSH route；权限不足禁用 | 非macOS／远程整行禁用并说明；只探测Finder+VSCode/Cursor/Zed/Sublime | 当前为旧版已批准宿主适配；不能声称完整T3 editor/remote backend已实现 |
| Open in 图标 | O 品牌图标独立配色；无品牌用通用glyph，不空白 | Finder/VSCode彩色，Cursor/Zed/通用glyph均有资产 | 基本一致；目标目录仍按打开时来源 |
| Project scripts 无脚本 | A 没有primary、没有其他脚本／导入项时整行 `+ Add project script`，打开编辑器 | 无全局Actions时 `+ Add action` | 数据为空条件近似；**命名／数据归属不同** |
| Project scripts 有主脚本 | A 显示 script.icon + script.name；右侧chevron为Script actions，整行split；静止无中线，hover或子菜单开时显线 | 全局上次动作（否则第一条）图标／名字＋split箭头 | **形状不是bug**：用户两图分别是“有脚本”和“无脚本”；不能强制有动作也显示Add行。主脚本选择语义与项目归属仍不同 |
| 没有primary但有importable | A Wrench＋Actions split，左右都能开导入／脚本菜单；来源`t3.json`，去重后列From t3.json | 不存在导入状态，第一条总是primary后备 | 新产品能力，不是调边距能解决；需确定是否纳入本次 |
| 脚本运行中 | A 控件不追踪running/spinner；只看onRunScript权限是否存在。脚本终端由其他组件管理 | 启动新tab/right/down终端；无running spinner | **不能凭空增加运行spinner**；运行状态不是本行的分体变体 |
| 脚本菜单 | A 每脚本带glyph/name/快捷键，hover/focus显示Edit；最后Add project script；有可导入项时附From t3.json分组 | glyph/name/Edit常驻，末项Add action；无文件脚本／快捷键 | hover Edit可直接对齐；导入与项目级数据是范围决策 |
| 脚本编辑器与详情 | A editorRequest作为同树Dialog，不主动关闭详情；Edit关脚本菜单但详情仍在 | editor()先closeForAction，详情也关闭 | **不一致**（旧A3明确要求收详情）；新T3对齐需改关闭／返回焦点策略 |
| split菜单打开态 | R 父组和相应half保持柔和底、中线持续显示，不依赖鼠标仍hover | 中线只依赖actionsHot/openHot，没跟踪子菜单open | **明确缺口**，不能把菜单open持态替换成永久竖线 |
| card空白区域右键 | P/M 打开Show in thread details checkbox菜单；输入/链接/选中文本保留原菜单；可Reset默认 | 无卡片级显隐菜单 | 新偏好功能；旧规格三行固定，需确认是否引入完整显隐配置 |
| divider | S 每个section独立内边；只在前方有非空section且当前separated时画border-top；不是脚本行自带横线 | 固定三行一张卡，无section/divider | 加Git后应按分区规则，不是无条件给Actions底部画线 |
| 其他分区 | P 按visible/density/data分别显示Servers/Automations/Relationships/Usage/Context | 无对应宿主数据模型 | 不创建空按钮或假状态；是否开发这些属于独立范围，不由“照T3形状”暗中追加 |

## Git／PR 逐状态（当前 Herdr 详情均缺失）

| 条件／控件 | T3 状态与操作 | 实施边界 |
| --- | --- | --- |
| 无gitCwd | G 返回null，不显示Git actions | 必须有真实来源cwd，不能对用户HOME误读／写git |
| 非Git | G 单一Initialize Git整行；pending显示Initializing...并禁用；失败toast | 这是实际`git init`写操作，旧A2明确排除，需确认范围 |
| 是Git | P 显示branch selector（E），G依据状态显示quick action及Changes；新空draft可能quiet掉无事可做的actions/Changes | 不能用永远显示“Initialize Git”冒充Git完整态 |
| 无远端／有改动 | logic quick=Commit；菜单仅Commit，另提供Publish repository对话框 | Publish涉及真实远端写入／网络，不是宿主静态菜单能力 |
| 无远端／干净／无upstream | logic quick=Publish repository | 需provider／身份信息与创建仓库流程，现有详情没有此后端 |
| detached HEAD | logic quick disabled Commit并提示先checkout ref；菜单Commit有改动可用，Push/PR不启用 | 状态读取和disabled原因必须一致 |
| 有改动且behind | quick=Commit，避免误push；有远端的菜单仍按ahead/behind禁用Push/PR | 不得用固定“Commit & push”替代 |
| 有改动，open PR或默认分支 | quick=Commit & push；其他feature branch通常Commit, push & PR | 默认分支额外确认；不能省掉安全确认与新分支选项 |
| 干净且落后 | quick=Pull，执行后inline success；ahead+behind/diverged则disabled Sync ref并提示先rebase/merge | 涉及工作树变更，必须防并发和错误回报 |
| 干净且领先 | open PR/default ref为Push，否则Push & create PR；无差异时禁用并给原因 | 需正确upstream/default-delta语义，不仅判断远端是否存在 |
| 有默认分支差异且未open PR | 满足条件quick=Create PR；已有open PR则不列Create PR | 需要真实PR查询，不用fixture当生产值 |
| Commit菜单 | 打开有文件清单／排除项／可选message的确认Dialog，支持Commit on new branch；空选禁用 | 完整流程不能降成直接`git commit -am`（会漏未跟踪文件） |
| Git operation运行 | G primary改多行进度／输出，secondary改elapsed，禁用菜单；完成态停留一段时间 | 与“Project script运行中”不同，是Git action独有状态 |
| Changes | G真实insertions/deletions和base提示；点击onOpenChanges；repo才显示，缺handler禁用 | Herdr可考虑映射现有唯一Review，但与T3 diff源／计数并非自动等价 |
| branch／PR | E的BranchToolbarBranchSelector提供分支选择／checkout；PR由PR组件展示 | 必须区分当前space folder与临时worktree，不误checkout别的目录 |
| PR无详情 | PR用#number/状态glyph；可watch时split带Eye，hover换EyeOff并停止watch | 无Herdr PR watch契约，不能造可点击但无语义的眼睛 |
| PR有详情 | PR标题最多两行；下面#、checks汇总、watch及状态操作；tooltip显示标题、base/head、checks、diff统计 | 字符串不能替代PR live state |
| PR冲突／draft／checks失败／可merge | PR分别Resolve（新thread处理）、Ready、Fix（新thread处理）、Merge；pending文字、禁用避免重入；Merge需确认 | 需要Git provider、agent handoff、PR action后端；不是现有Review mod自带能力 |
| 多个关联PR | PRRows默认当前PR；Show N more展开其余，Show less收起 | 有数据才出现，不无条件加“更多” |

## Token 与待验证

结构／行为以以上源码为准；尺寸、内距、颜色、圆角仍只用本仓 `docs/internals/t3-tokens.md`、`button()` 和theme。T3的foreground/80、黑白自定义alpha不直接复制。新section、locked/select/split形状要先补入token文档再实施。当前R源码`ThreadDetailsSection`的bottom padding与旧“上下都8”的转述也不完全相同，必须按本仓token决定数值、不能混写为T3原值。

未进行新修正的demo回放；没有把hover／真实鼠标／键盘路由标成通过。原计划门禁和整窗证据见 [README.md](README.md)，它们只证明`a9e2f769`的旧规格交付，不证明本次反馈已解决。

## 本轮需要明确的产品映射

1. Git：按新反馈加入完整Version Control，还是维持原A2三行，仅修可对齐的行为？前者包含Init、branch/PR/commit/push/pull/publish以及确认与后端，不应只补一条视觉行。
2. 脚本：继续用现有全局Actions作为脚本行数据源，还是改T3项目级scripts（包括`t3.json`导入／primary规则）？现有全局动作的归属不能自行迁移或删除。
3. 第一行：保留原来space管理入口，还是按T3既有线程locked环境／工作区显示，只留路径tooltip与整行右键复制、不提供假迁移？

在这些决定前不改新行为；Open in“选择不执行”、folder非独立按钮、split open持态和菜单宽度已定位为可修的明确差异，后续沿用已有Actions render/handler测试及独立demo seam回放。
