# 本轮重写的性能审查与修复（2026-11-14）

范围：`origin/main`（`9a9fd18c`）到 `bd5df15b` 的重写，重点是有意去掉缓存或快照、改成每次都读的地方。先读代码找热点，再测量；用户追加授权后，实测确认的问题和能复现的疑似项已修。脚本在 [performance-audit/](performance-audit/)，原始数据留在 `/tmp/perf-audit`，不入库。

## 1. 结论

**有一处必须修的问题，已经修好。** 子 agent 的树每次都从头扫一遍全部终端：每个 agent 的每一层都要 `filter` 整份 `terminals()`，算一次是 O(agent 数 × 终端数)。Tabs（两个副本）、Agents、Inbox、Go to、窗格头和子 agent 菜单每次渲染都要算一遍。在 Herdr 的 QuickJS 里实测：1000 个终端时每次 28ms；**5000 个终端时直接 `interrupted`**，这几个块根本画不出来。这个问题 origin 就有，算法没变，不是本轮引入的。本轮新增的子 agent 菜单和 Go to 也走同一条路，所以受同样影响。重写前「5000 终端打开菜单 0.83ms」的数字能复现，但只在那个 agent 有约 24 个后代时成立；后代到 200 个是 6.5ms，到 2000 个时 Node 里 60ms，Herdr 里中断。

改法是按每次拿到的 `terminals()` 列表建一次索引：父地址到子终端、地址到终端。改完后在 Herdr 里：1000 终端 28→4ms，5000 终端从中断降到 19ms，2000 个后代的菜单从中断降到 8ms。

另外修了三处：

- Files 搜索在 20 万路径里命中 11 万条以上时，排序那一步会 `interrupted`。这是本轮引入的回退：origin 只排前 1000 条。
- Review 文件树的文件夹行，每画一行就把整组文件过滤一遍。2 万个文件时，一次渲染 63ms。
- 面板空白页每 250ms 轮询一次「Review 能不能读」，窗口空闲时也不停。

其余怀疑点（面板状态、scroll-strip、Quick Review 的 git 调用、壁纸缓存、共享控件）实测没有问题，或者代价在毫秒以下。

## 2. 问题清单（按严重度）

### P1 子 agent 树每次扫全部终端（已修，origin 已有）

- **位置**：`shared/tree.js:24-27` `agentKids` 每次调用都对整份 `all` 做 `filter`；`:8` `ownStatus` 对 `all` 做 `find`。每帧的调用方：
  - `mods/t3-tabs/main.js:383`、`mods/t3-tabs/navigation.js:341`（Tabs 的 keys 副本和主副本各算一遍全部 agent）
  - `mods/t3-agents/main.js:178`、`mods/t3-agents/rows.js:101`（每个 agent 行各调一次 `kidTree`），以及 `mods/t3-agents/main.js:49` 每秒一次的 `compute()`
  - `mods/t3-inbox/row-model.js:85`
  - `mods/t3-picker/main.js:40`（Go to 每次按键都会渲染）
  - `mods/t3-pane/main.js:81`（子 agent 菜单渲染）、`:58`（菜单每秒一次）、`:173`（窗格头）
- **触发**：终端多，或某个 agent 后代多。任何实时数据变化都会让所有显示中的块重新渲染，所以只要有 agent 在跑，就是持续触发。
- **实测**：JS 部分（Node）用 [`bench-render.mjs`](performance-audit/bench-render.mjs) 加载真实 mod，假 Herdr 数据为 20 个 space × 10 个 tab、每个 tab 一个顶层 agent，其余终端挂在它们下面三层、每五个有一个是 shell。QuickJS 部分用 [`host.sh`](performance-audit/host.sh) 起一个隔离的 Herdr，跑 [`probe/bench-core.js`](performance-audit/probe/bench-core.js)。

  | 场景 | 修前 | 修后 |
  | --- | --- | --- |
  | Herdr：200 个 agent 的 `subAgents`，1000 终端 | 27.4ms | 4.2ms |
  | Herdr：同上，5000 终端 | **interrupted** | 19.0ms |
  | Herdr：同上，5000 终端，其中一个 agent 有 2000 个后代 | **interrupted** | 19.7ms |
  | Herdr：该 agent 的 `kidTree`（子 agent 菜单） | **interrupted** | 8.3ms |
  | Node：整帧（Tabs ×4 副本、侧栏、Agents、Actions、窗格头），5000 终端 | 775ms | 18ms |
  | Node：同上，显示 Inbox 时 | 465ms | 13ms |
  | Node：同上，1000 终端 | 36ms | 6.5ms |
  | Node：子 agent 菜单，2000 个后代：渲染 / 每秒 tick | 60 / 59ms | 0.7 / 0.4ms |
  | Node：子 agent 菜单，约 24 个后代（对应重写前测的场景） | 0.82ms | 0.08ms |
  | Node：Go to 一次渲染，5000 终端 | 146ms | 2.9ms |
  | Node：空闲时每秒的 JS（各常驻定时器），1000 / 5000 终端 | 11.9 / 296ms | 1.0 / 3.4ms |

- **修法**：`shared/tree.js` 用 `WeakMap` 按列表对象存一次索引：存活终端按 parent 分组，全部终端按 address 查。`agentKids` 和 `ownStatus` 都改查索引。调用方不用改。在 Herdr 里验证过 `terminals() !== terminals()`：每次调用都返回新列表，所以按列表对象做键不会读到过期的索引。
- **测试**：`shared/check-tree.cjs` 统计对终端列表的读取次数：2000 个终端、200 个 agent 时，修前 4,000,000 次，现在要求不超过 3 × 终端数。三个检查原先在同一个数组上原地修改终端，现在改成每次调用返回新列表，和 Herdr 一致：`check-pane.cjs`、`check-inbox.cjs`、`check-sidebar.cjs`。
- **归属**：子 agent（共享 `tree.js`）。

### P2 Files 搜索：命中多时排序中断（已修，本轮引入）

- **位置**：`mods/t3-files/model.js:77` `rankPaths` 把全部命中排序后，再在 `mods/t3-files/main.js:449` 取前 200。origin 的 `RANKED = 1000` 最多只排 1000 条。
- **触发**：大仓库里输入一个很宽的词，比如一个字母。窗口在前、搜索一直显示时，Files 每 5s 刷新一次，并且会重新搜索（`main.js:253`，origin 也是这样），所以这一步会反复执行。
- **实测（Herdr，20 万条路径）**：

  | 查询 | 命中数 | 修前 | 修后总耗时 | 修后最长一段不让出 |
  | --- | --- | --- | --- | --- |
  | `s` | 200,000 | **interrupted** | 112ms | 3.5ms |
  | `component-1` | 111,111 | **interrupted** | 58ms | 3.1ms |
  | `pkg1 module2` | 15,818 | 20ms | 8.9ms | 3.2ms |

- **修法**：`rankPaths(paths, words, limit, pause)` 只保留要显示的前 `limit` 条，用二分插入维持顺序；每 5000 条 `await pause()` 让出一次，和 `filterPaths` 一样。排序规则不变：文件名命中的在前，其次路径短的在前，最后按文本。`main.js` 等它返回后，再检查一次这次搜索还算不算数。
- **测试**：`mods/t3-files/check-files.cjs`：12000 条命中要让出两次，结果要和完整排序的前 200 条一致。修前没有让出，测试失败。
- **归属**：Files。

### P3 Review 文件树：每个文件夹行都过滤整组文件（已修，本轮引入）

- **位置**：`extras/mods/review/files.js:57`，每画一个文件夹行，就把它所在组的全部文件按前缀 `filter` 一遍，用来算勾选框状态。
- **触发**：组里文件多，可见的文件夹行多。指针悬停树时缩进线要显示，悬停一次就会重新渲染一次。
- **实测**：Herdr 里 40 个文件夹行乘 2 万个文件，每次渲染 60–63ms。检查里 30 个文件夹行、3000 个文件时，修前一次渲染读 90,000 次，修后不超过 3000 次。
- **修法**：建树的时候顺便建一张表：组里每个文件夹下有哪些文件，一趟遍历就能建好，和 `treeOf` 的行一起缓存。
- **测试**：`extras/mods/review/check-pane.cjs`：首次绘制最多读 2N 次，再次绘制最多读 N 次。
- **归属**：Files/Review 树。

### P4 面板空白页每 250ms 轮询（已修，本轮引入）

- **位置**：`mods/t3-chrome/main.js:45`。`surface-empty`（停靠在面板里的空白页）和 `+` 菜单的副本各开一个 `every(250)`，每次 tick 都算 `workFolder`。被隐藏的副本不会调用 `close`，定时器也就一直在跑。
- **实测**：空闲时每秒读宿主列表 46 次，修后 22 次，和 origin 的 20 次基本一样。每次 tick 的 JS 不到 0.01ms，代价主要在宿主把列表复制给 JS。
- **修法**：改成渲染时检查（`render(cx)` 里调用 `probeReview`）。终端换目录、焦点变化本来就会触发重新渲染，key 没变就直接返回。
- **测试**：`mods/t3-chrome/check-surfaces.cjs`：目录变了以后靠渲染重新判断；`surface-empty` 和 `surface-menu` 不开任何周期定时器。
- **归属**：面板。

### 疑似，未处理

| 项 | 位置 | 实测或依据 | 不处理的理由 |
| --- | --- | --- | --- |
| Agents 列表一次画出全部行，不做虚拟化 | `mods/t3-agents/main.js`、`rows.js` | 200 个 agent 时一次渲染 12,419 个元素，origin 一样多；修完 P1 后 Node 4–12ms。悬停一行就重画整个 mod | 要改成虚拟列表，属于结构调整，不在本次范围。宿主物化元素的耗时没测 |
| Details 打开期间每 100ms 检查一次来源 | `mods/t3-actions/workspace-details.js:108` | 每次 tick 读两次列表（`spaces()`、`panes()`），每秒 20 次，只在 Details 打开时 | 代价在微秒级，改了测不出差别 |
| Quick Review 打开时跑两次 `rev-parse --show-toplevel` | `shared/panel.js:144`、`shared/review-git.js` `readReview` | 每次 7ms，占打开耗时的不到 5% | 收益太小 |
| 搜索一直显示时，每 5s 重新 `ls-files` 并重新搜索 | `mods/t3-files/main.js:253` | origin 一样。t3code（3.2 万文件）`ls-files` 0.32s；20 万条时过滤加排序在 Herdr 里约 170ms，全部分段让出 | 这是行为上的取舍（结果保持新），不在纯性能范围 |
| 共享 trigger、menu-row、tip 每行都建闭包；悬停时整个 mod 重新渲染 | `shared/menu-row.js`、`trigger.js`、`tip.js` | Agents 每个 agent 行约 27 个元素；Herdr 规定 mod 每次重画都会重画整个窗口 | 闭包的代价被渲染本身盖住；悬停重画的范围由 Herdr 决定 |

## 3. 已排查、没有问题

- **面板状态**：`panelState`、`surfacesFor`、`surfaceBorn` 每帧各副本调用 1–3 次。它们遍历的是布局树，只有几十个节点，每帧不到 0.01ms（Node）。`reviewRepo` 不在 render 里调用：只在 key 变了以后 `spawn`，或者由命令触发。切换标签时，`showSurfaces` 写一次 `t3.panels`；`syncPanel` 只在开关或加宽状态不一致时才写。`scroll-strip.js` 每帧 O(标签数)，只有尺寸真的变了才 `notify`。
- **Quick Review**（[`bench-scope.mjs`](performance-audit/bench-scope.mjs)，用 child_process 跑和 mod 相同顺序的 git 命令）：
  - t3code（31,781 个文件，2,324 个 ref），工作区干净：打开到出结果 166ms，共 9 次 exec，其中 `status --untracked-files=all` 117ms。
  - 同一仓库改 50 个文件、加 30 个新文件：367ms，其中 `status` 134ms，`changedFiles` 182ms（复制 index 后 `add -N`）。
  - 每次 `await` 之后都检查读取令牌，菜单关了或换了仓库，迟到的结果直接丢弃。
  - 原生 popup 开关的代价没测，见下一节。
- **Files 树的其余部分**（Herdr 实测）：一个 2 万条目的文件夹，`sortEntries` 53ms；全部展开时 `treeRows` 15ms；Review 一次读 2 万条，`pathEntries` 64ms。都只在数据变化时跑一次，`st.rows` 和 `treeOf` 有缓存；渲染只画可见的行。`filterPaths` 扫 20 万条共 56ms，每段最长 2.1ms。
- **「窗口在前才读」**：Files 的 1s 定时器先看是否显示、窗口是否在前，再按 5s（远程 10s，读得慢就按读取耗时 ×10，最长 60s）判断要不要重读。窗口在后时不读。
- **空闲时的定时器**（[`bench-idle.mjs`](performance-audit/bench-idle.mjs)，各常驻副本都稳定以后）：exec 每秒 0 次。周期定时器有：
  - `t3-chrome` 品牌 250ms：对齐红绿灯，origin 也有
  - `t3-spaces` 250ms 和 15s
  - `t3-agents` 1s 和 30s
  - `t3-inbox` 1s 和 60s
  - `t3-pane` 30s
  - `t3-files` 1s
  - Review 1.5s：只在分析中才去读
  
  除 P4 外，都和 origin 相同。焦点 150ms、指针 100ms 的监视只在键盘模式或悬停时运行。
- **壁纸**：
  - 内存里的图缓存（`library.js:40` `pictures`）按「画 × 主题配色」做键，每项只是一个小对象。
  - 磁盘上每张画、每种明暗只保留最新一张合成图（`library.js:122`）。
  - `warm` 是一个路径集合。
  - 400ms 叠层时元素树里最多两层 `image()`：保留的上一张和正在加载的这一张。新的那张显示后，上一张就不再出现在元素树里。
  - JS 这边没有无界增长。宿主纹理缓存会不会增长，见下一节。

## 4. 未检查

- **宿主的绘制和元素物化**：隔离的 Herdr 窗口在后台，GPUI 不绘制。弹窗开关、悬停后整窗重画、Agents 列表 1.2 万个元素物化，这些的宿主耗时都没测。测的话要把窗口切到前台，会打扰用户的桌面。
- **壁纸的宿主纹理缓存**：反复切换后是否增长，同样因为后台不绘制而没测。之前的测量见 [wallpaper-performance.md](wallpaper-performance.md)。
- **QuickJS 的中断阈值**：本轮 Herdr 实测里，112ms 的分段任务能完成，200 个 agent、5000 终端那一次计算会中断，但具体阈值没有定位。Node 和 Herdr 的倍率在 1.7–22 倍之间，按测试项不同差别很大，所以第 2 节的 Node 数字只能用来比较前后，不能换算成 Herdr 的绝对耗时。
- **真实点击和按键**：都没做，所有交互都通过 handler 或 `herdr-app do` 驱动。

## 复现

```sh
cd docs/research/rewrite-review-2026-11-14/performance-audit
# 三棵树：git archive origin/main、修前 commit、工作区（共享文件按 sync.sh 复制到各 mod）解到 /tmp/perf-audit/{origin,head,fixed}
node --experimental-vm-modules --no-warnings bench-render.mjs /tmp/perf-audit/head /tmp/perf-audit/fixed 5000 0 lists
node --experimental-vm-modules --no-warnings bench-kids.mjs /tmp/perf-audit/head /tmp/perf-audit/fixed 5000 2000
node --experimental-vm-modules --no-warnings bench-idle.mjs /tmp/perf-audit/fixed 1000
node --experimental-vm-modules --no-warnings bench-scope.mjs /tmp/perf-audit/fixed ~/my/tools/t3code 5
./prepare.sh /tmp/perf-audit/probe && node --experimental-vm-modules --no-warnings run-core.mjs /tmp/perf-audit/probe   # Node
./host.sh /tmp/perf-audit/probe                                                                                         # Herdr QuickJS，隔离实例，跑完自动拆除
```
