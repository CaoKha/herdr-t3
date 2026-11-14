# 重写审查：子 agent 菜单

2026-11-14。范围：提交 `319268d3`、`d6bcf6bf`、`387e9034`、`363ef6fc`（及 `e48beda5` 对同一段代码的跟进），基线 `origin/main=9a9fd18c`，HEAD `524ef4a6`。代码：`mods/t3-pane/main.js`、`mods/t3-pane/check-pane.cjs`、`shared/tree.js`、`shared/check-tree.cjs`、`mods/t3-spaces/{main.js,check-sidebar.cjs}` 的相关部分；文档：`docs/research/sub-agent-menu-*`、RECIPE、README、CHANGELOG、`docs/user/guide*`。只读审查，没有改代码。负载按单人桌面估计：一个窗口，几十个终端。

截图在 [sub-agent-menu/](sub-agent-menu/)，来自隔离 demo（`DEMO=/private/tmp/review-sub-agent-menu`，fake-agent，只用 `herdr-app do` 驱动；为了让 OmniWM 画出这个窗口，借用过一次焦点并已交还），用完已 `down`。按仓库规则，PNG 不入 Git。注意：OmniWM 把 demo 窗口排成了 801pt 宽，不是全宽；侧栏是默认宽度，标题栏和弹层不受影响。

## 1. 结论

**局部修，不整块重写。** 用户已拍板的方向（入口只显示数量，弹层里只有一棵按树序排列的列表，右键复用共享 agent 菜单）是对的，实现也只有约 150 行。要动的是四处：标题栏把父 agent 自己的状态丢了（回归）；`shared/tree.js` 的 `kidStatus` 语义悄悄改了，波及 Agents 列表；折叠控件是第三套自造写法；一套为 1ms 级性能写的快照状态机。测试和文档要随修复一起大幅删减。下面第 3 节按“局部重写这几块”给出方案。

## 2. 问题清单（按严重度）

### 必修

**1. 有子 agent 的窗格，标题栏不再显示父 agent 自己的 working／needs-you**（`mods/t3-pane/main.js:300`、`:302`、`:186`）

- 现象：父 agent 自己卡住等人（blocked），子 agent 都闲着时，标题栏只有一个不着色的 `1 ⌄`，没有 `!`。侧栏卡片和标签都写着 Needs you。父 agent 自己在跑时，标题栏也没有转圈。
- 原因：`st === "working" && !kids.length` 和 `st === "blocked" && !kids.length` 让有子级的窗格不再画任何状态标记。原意是“入口已经代表后代的状态，不要再说一遍”，但入口的 `stuck` 只数子 agent（`rows.filter(r => r.st === "blocked" || r.st === "error")`），根本不看父级自己。结果父级自己的状态在标题栏上没有任何地方能看到。只有 done 点（`:308`）还保留，所以三种状态的处理也不一致。
- 证据：[parent-blocked-header.png](sub-agent-menu/parent-blocked-header.png)：`Parent blocked` 的 agent 是 `hc ls` 里的 `status: blocked`，标题栏只有灰色的 `1 ⌄`。[parent-working-header.png](sub-agent-menu/parent-working-header.png)：`Parent working` 是 `status: working`，标题栏没有转圈，只有 `3 ⌄`（黄色，因为它有一个孙级在等人）。测试反而把这个回归锁住了：`mods/t3-pane/check-pane.cjs:269`、`mods/t3-spaces/check-sidebar.cjs:730`、`:1587`。
- 修法：标题栏的标记改用父级**自己**的状态 `ownStatus(p.status, …)`，不用 `treeStatus` 聚合；后代的状态只由入口的着色来表达。这样两边各说各的，也不重复。

### 应修

**2. `kidStatus` 改了共享语义，Agents 列表跟着变了，但没有写进文档**（`shared/tree.js:12-15`；调用方 `mods/t3-agents/rows.js:53`、`:124`，`t3-inbox/row-model.js:85,108`，`t3-tabs/navigation.js:342`）

- 现象：原来子 agent 的 done 一律读成 idle，状态优先取 `agents()`。现在改成先取终端的原始状态，并保留 done。所以 Lists 里子 agent 行的圆环变成了 done 圆点，而且看过之后圆点也不会消失。
- 为什么错：GLOSSARY 规定“未读的 done……显示为圆点”。现在同一个圆点，在顶层行表示“没看过”，在子 agent 行表示“结束了，看没看过都一样”。Agents 列表的这个可见变化，CHANGELOG 没有提（`CHANGELOG.md:27` 只说了菜单）。另外，菜单要区分 error，`kidStatus` 却又把 error 映射成 blocked，于是 `main.js:42` 只能再打一层补丁：`k.status === "error" ? "error" : kidStatus(...)`。
- 证据：`git diff origin/main..HEAD -- shared/tree.js`；`shared/check-tree.cjs` 的新断言 `"reading its pane doesn't erase the terminal's completed state"` 锁的就是这个新语义。
- 修法：`kidStatus` 只返回原始词（working／blocked／done／idle／error），error 归入 blocked 这一步放进聚合函数 `treeStatus`／`subAgents` 里做。“子 agent 的 done 看过之后算不算圆点”交给用户拍板（见第 3 节），定下来后 GLOSSARY、RECIPE、CHANGELOG 一起改。

**3. 同一个失败的子 agent，在两处长得不一样**（`main.js:177` 对比 `t3-agents/rows.js:104-111`）

- 现象：菜单里画成红色（`ansi1`）、没有底色的 `! Failed`；Agents 列表里画成黄色、带底色的 `!`（Needs you）。菜单里 Needs you 的 `!` 有 15% 底色，Failed 的没有，看起来像一个漏掉的字符（见 `docs/research/sub-agent-menu-list-only/menu-detail.png`）。
- 为什么错：RECIPE `:131` 规定 blocked／error 共用圆角 `!`，状态标记应该在各组件里共用。
- 修法：要么 Failed 也用同一个徽章、只换颜色和文字，要么在 Agents 列表里也区分 error。两边都从同一个 `statusMark(t, st, size)` 取。

**4. 折叠控件是第三套写法，而且把需要你的子 agent 也藏起来了**（`main.js:164-170`、`:111-126`、`mods/t3-pane/icons/chevron-right.svg`）

- 现象：(a) 每一行都在图标右边留 16px 空位给箭头，没有子级的行也留着，所以名字和图标之间有一个空洞，名字被提前截断（见 [menu-parent-working.png](sub-agent-menu/menu-parent-working.png)：`nested-block…`、`sub-agent-with…`）。(b) 箭头是 12px 的裸 `div`，用 `absolute().left(20).top(2)` 定位，点击区只有 12px，紧挨着点击即 peek 的整行。(c) 收起后，下面需要你的子 agent 也一起消失；Agents 列表的规则是“收起时需要你的子 agent 仍然显示”（`rows.js:122-125`，RECIPE `:55`）。(d) 没有用 `shared/motion.js` 的 `foldArrow`，也没有用 `button({ size: "micro" })`，还另加了一个图标文件。
- 证据：控件一致性审计 `docs/research/control-consistency-audit/sub-agents-and-shared.md` #8 已经指出 (b)，它的 README “Not fixed” 部分以“用户批准的几何”为由没修。(c) 来自代码：`visibleKids` 会滤掉深度大于折叠点的所有行。[lists-sub-rows.png](sub-agent-menu/lists-sub-rows.png) 里 Agents 列表收起后仍挂着 `nested-blocked`，菜单里收起后它会消失。
- 修法：见第 3 节，倾向于直接删掉弹层里的折叠（需用户拍板）；要保留的话，就复用 Agents 的 fold button，并沿用它“收起时需要你的仍显示”的规则。

**5. 指针离开后，行还亮着**（`main.js:158-160`）

- 现象：`on_hover` 只处理移入（`if (on && this.at !== i)`），指针离开时不清除高亮。
- 为什么错：本轮 `8605edbd` 刚把规则统一成“指针在行上才亮”，`t3-menu` 的写法是 `mods/t3-menu/main.js:325`。这个菜单是唯一的例外，RECIPE 也没有说明原因。
- 修法：照搬 t3-menu 那一行。

**6. 为 1ms 级耗时写了一套快照状态机**（`main.js:79-83`、`:100-126`、`check-pane.cjs:79-102`、`:333`）

- 现象：每秒在定时器里刷新 `allRows`／`rows`／`labels`，在刷新之间对齐选中项和折叠集合；render 不读 `terminals()`。为了证明这一点，测试里加了 `reads` 计数器，还把一段 `PANE_BENCH` 基准测试塞进了行为检查文件。
- 为什么错：改之前在 5,000 个终端的 VM 里打开一次是 0.83ms（`performance-before.log`），远低于一帧，这个负载下没有要解决的问题。代价是状态最多滞后 1 秒（一个刚结束的子 agent 在这 1 秒内仍然能点，peek 的是一个已经结束的终端），并且多了约 30 行协调代码。`kidRows` 也因此自己写了一份父子索引（`main.js:29-45`），和 `shared/tree.js` 的 `agentKids` 逻辑重复：两份都要处理“跳过 shell”和“防环”，以后要一起改。
- 修法：render 里直接调用 `descendants`，再加一个返回带深度结果的共享 helper（比如 `shared/tree.js` 导出 `kidTree(all, addr)`，Agents 的 `agentTree` 也改用它）；定时器只负责 `cx.notify()` 和“没有子 agent 就关闭”。删掉 `refreshKids`／`visibleKids`、`reads` 计数器和 `PANE_BENCH`。

**7. 测试锁的是实现细节和已删掉的功能**（`check-pane.cjs:284`、`:308`、`:333`、`:79-102`；`check-sidebar.cjs:730`、`:1587`）

- `kid-details`／`kid-peek`／`kid-send`／`kid-copy` 的“不存在”断言是给已删功能留的墓碑；`style.w === 96`、`items[0].key` 锁的是布局实现；`reads === beforeReads` 锁的是性能手段；两条 sidebar 断言锁的是问题 1 的回归。
- 应该保留的行为断言：树序和缩进、跳过 shell、状态词、点击／Enter 会 peek 并关闭、右键会先关闭弹层再打开 agent 菜单、全部结束后自动关闭。这些都还在，重写时留下即可。

**8. 文档：changelog 写的是没发布过的中间历史；RECIPE 写了一堆“没有什么”，还混进了实现细节**

- `CHANGELOG.md:27`（中文 `:27`）：“the fixed details/footer buttons … were removed after seeing the installed UI”。对 origin/main 的用户来说，footer 从来没出现过。真正可见的变化是：悬停卡没了；入口从 `3 agents ⌄` 变成 `3 ⌄`；Failed／Done 单独显示；右键能打开 agent 菜单；有子 agent 的窗格不再显示聚合标记。另外这一条放在 `## 2026-11-13` 下面，提交日期却是 11-14。
- `RECIPE.md:79`：“no footer, details or action buttons, no external hover card, no initial highlighted row” 是在写不存在的东西；“Refresh the tree outside render each second; render has no … terminal enumeration” 是实现细节，按 AGENTS.md 应该放在 `docs/internals/`。RECIPE.md 现在 59,989 字节，离 60,000 上限只剩 11 字节，这段是最值得压缩的地方。
- `docs/user/guide.md:15`：同样在描述用户从没见过的东西（“no … details footer or external hover card”）。
- 研究目录：`sub-agent-menu-redesign-validation/` 有 23 个入库文件、约 35KB，验收的是一个已经被否决的设计。里面还有 `check-concurrent-failures.log` 这类别人工作树的失败日志，以及几个 replay patch。`sub-agent-menu-redesign.html` 有 31KB。

### 低

**9. 固定 96px 的状态列挤掉了名字**（`main.js:174`）。只显示一个圆点或 `1m` 的行也占着 96px。弹层宽 280，名字到 13 个字左右就被截断（[menu-parent-working.png](sub-agent-menu/menu-parent-working.png)）。可以改成按内容收缩，或者只让 `Needs you`／`Failed` 用宽一点的列。

**10. 无障碍：状态读两遍**（`main.js:157` 行的 label 已经带了状态，`:175` 又有 `role=status` 的 label）。审计 #10 没修。

**11. 空闲行只有一个等宽的 `1m`**：和 working 行的区别只有前面那个转圈，单看一行看不出 `1m` 是什么意思。这是用户的选择（“空闲写闲了多久”），列在这里供重写时再确认。

**12. `d6bcf6bf` 夹带了一个无关改动**：删掉 Spaces 里 Connect 的 tooltip，那是 tooltip 审计的事，放在 sub-agent 提交里，以后回溯会混淆。改动本身没问题。

## 3. 重写方案（局部）

### 目标行为

- 标题栏：父 agent **自己**的状态标记照常显示（working 转圈／`!`／done 点／settled／snoozed）。有后代时多一个入口 `N ⌄`，只要有后代需要你就着 `blocked` 色；tooltip 写 `N sub-agents, M need you`。父级和后代各说各的，不重复。
- 弹层：宽 280，行高 28，最多显示 10 行，之后滚动；严格树序，每层缩进 16；每行是程序图标、名字和右侧的单一状态位。状态位的形状和 Agents 子行完全一样，来自同一个函数。点击或 Enter 会 peek 并关闭；右键关闭弹层后打开共享的 agent 菜单；hover 只在指针停在行上时点亮；全部结束后自动关闭。
- 状态语义：`kidStatus` 返回原始状态词，聚合时把 error 当 blocked。done 圆点的含义（见下面的决策 1）在所有地方统一。

### 模块边界与复用

- `shared/tree.js`：新增 `kidTree(all, addr) → [{ k, depth }]`，由 `descendants` 的同一套遍历带出深度。`t3-agents/rows.js` 的 `agentTree` 和 t3-pane 的 `kidRows` 都改用它，删掉 `main.js:29-45` 的那份重复实现。`kidStatus` 恢复成纯取词，error 到 blocked 的映射移进 `treeStatus`。
- 状态标记：把 `t3-agents/rows.js` 里 `agentStatus` 画标记的部分抽到共享模块（比如 `shared/status-mark.js`，由 sync 分发），参数是 size。菜单、Agents 子行和标题栏都调用它。这会碰到 Agents 列表，要和 Agents 的负责人对齐。
- 列表机制照旧复用 `shared/list.js` 的 `scrollList`／`menuJump`、`shared/menu.js` 的 `openMenu`、`shared/focus.js` 的 `pressed`／`justClosed`、`shared/button.js` 的 `button`。
- 如果保留折叠：复用 `motion.js` 的 `foldArrow` 加 `button({ size: "micro", surface: "row" })`，收起时需要你的子 agent 仍然显示（和 Agents 一样）。

### 可删除

- 代码：`refreshKids`／`visibleKids`／`foldKid`（如果不保留折叠）、`allRows`／`labels`／`folded` 状态、`main.js:29-45` 重复的遍历、`main.js:42` 的 error 补丁、`mods/t3-pane/icons/chevron-right.svg`（如果不保留折叠，或改用 foldArrow 的图标）、`kidsOpen` 的时间戳比较（改成在 overlay 关闭时清掉）。
- 测试：`check-pane.cjs:79-102`（PANE_BENCH）、`:284`（墓碑）、`:308`（宽度 96）、`:333` 及 `reads` 计数器；`check-sidebar.cjs:730`、`:1587` 改成断言“父级自己的标记还在”。
- 文档：`docs/research/sub-agent-menu-redesign-validation/` 整个目录（已被否决的设计；如需留痕，在 `sub-agent-menu-list-only/README.md` 里写一句话即可）；`sub-agent-menu-redesign.html` 可以删，`.md` 留作需求记录；CHANGELOG 的条目按“相对 origin/main 用户看到了什么”重写，并放到 11-14 下面；RECIPE `:79` 删掉否定句，实现细节移到 `docs/internals/layout-implementation.md`。

### 风险

- `kidStatus` 和状态标记都是共享代码，改动会同时影响 Agents、Inbox、Tabs 和 Go to。`shared/check-tree.cjs` 和 `check-sidebar.cjs` 要覆盖“子 agent done 在 Agents 行”和“error 在两处同形”两种情况。
- 改完后要在全宽 demo 里重新截图：标题栏（父级 blocked／working 且有子级），以及弹层（混合状态、长名字）。

### 需用户拍板

1. **子 agent 的 done 看过之后还画圆点吗？**（建议：按 GLOSSARY，圆点只表示“没看过”；子 agent 看过的 done 画空，或者显示“完成于多久前”。）
2. **弹层里要不要折叠？**（建议：不要。弹层是临时的，选一行就关闭，通常不到 10 行；需要折叠的场景交给 Agents 列表。这样可以删掉每行 16px 的空洞和整套折叠状态。）
3. **Failed 和 Needs you 在各处要不要区分？**（建议：用同一个 `!` 徽章，Failed 只换文字和颜色；Agents 列表也跟着区分。）
4. **标题栏有子级时，要不要显示父级自己的状态？**（建议：要。这是回归修复，不是新功能。）

## 4. 未检查项

- 真实鼠标点击、物理按键、屏幕阅读器、远程机器：都没有验证。弹层是通过 stagehand 的 `overlay` 命令打开的，hover／按键 handler 没有在原生窗口里回放。
- 没有对照 T3 源码（`pingdotgg/t3code`）逐条复核研究稿的引用，只核对了研究稿和代码是否一致。
- 没有在全宽窗口截图（OmniWM 把它排成了 801pt 宽）。
- 没有运行 `scripts/check.sh` 和单项检查（任务说明它当前全过；本审查不依赖它）。

## 跨范围

- `mods/t3-spaces/check-sidebar.cjs` 这一轮里 tabs-end／Review toggle／`text-measure-*` 的断言改动属于其他审查范围，没有审查。
- `docs/research/control-consistency-audit/README.md` 的 “Not fixed” 部分以“用户批准的几何”为由放过了折叠控件的 12px 点击区，建议负责这份审计的审查者确认用户当时是否真的批准过这个几何。
