# 面板 surfaces 重写审查

范围：每 space 的 surface 标签、`+`／Open a surface、隐藏／放大／关闭释放、跨终端标签跟随。基线 `origin/main=9a9fd18c`，审查 `HEAD=524ef4a6`。涉及提交：`a9e2f769`（主体）、`f989ba75`（目录 surface）、`b843396f`、`8605edbd`、`e48beda5`、`e3268ccb`（补修）。代码：`shared/panel.js`、`shared/panel-states.js`、`shared/check-panel-surfaces.cjs`、`mods/t3-chrome/main.js`（`panelHead`／`surfaceView`）、`mods/t3-chrome/check-surfaces.cjs`、`mods/t3-tabs/main.js` 的面板命令、`mods/t3-files/main.js` 与 `extras/mods/review/main.js` 的面板接线、`keys.json`、`layouts/herdr-t3.json`、ADR 0015／0017。

审查方式：读需求（`herdr-experience-requirements.md` B1–B5）、ADR 0015/0017/0018、T3 源码 `09a54f01`（`rightPanelStore.ts`、`RightPanelTabs.tsx`）、当前代码与 diff；独立 demo（`DEMO=/private/tmp/review-panel-surfaces`，只用 `herdr-app do`，已 `down`）。截图在 [panel-surfaces/](panel-surfaces/)。负载假设：单人单窗口，几个 space、几十个标签。

## 1. 结论

**局部重写**：可见行为大体做对，数据形状也可以保留（`{tabs, active, open, wide}`）。需要重写的是 `shared/panel.js` 的接口和 `t3-chrome` 的面板头。前者把 Review 的存储、单机模式判断和"外部选择"事件都揉在一个模块里，靠 born／随机 token／`panel-empty` 是否存在去推断；后者的标签条自己又写了一套横滚。Files／Review 内部不用重写，只改接线。

已回放并确认正确的行为：空面板 Open a surface（01）；`+ Files`、文件去重、通用 Files 被原位替换、已有文件时删除通用标签并激活已有项；Review 唯一（02）；关闭活动标签选右邻；关闭最后一个收起，重开为空；每个 space 各自独立（03）；关闭 Review 清掉 `review.shown[space]`；文件被删后标签保留，并提供 Retry 和 Locate（07）。

## 2. 问题清单（按严重度）

### 必须修

1. **`cmd-t` 打开的 `+` 菜单出现在窗口左上角，压在侧栏上**（`mods/t3-tabs/main.js:143`，`shared/panel.js:8`）
   - 现象：命令路径用 `openOverlay({ … width: 220, height: 72 })`，没有传 `at`。宿主只好把它放到窗口原点，离 `+` 有整个工作列那么远。见 [04-cmd-t-menu.png](panel-surfaces/04-cmd-t-menu.png)。
   - 为什么错：需求 B3 和 `t3-tokens.md`「面板标签」要求菜单在 `+` 下方左对齐、下偏移 6。`e48beda5` 只清掉了之前残留的 `surfaceAddPress`，修好了一个症状（菜单跑到上一次鼠标位置），结果换成了另一个症状（菜单跑到原点）。
   - 修法：由面板头自己处理这条命令。它知道 `+` 在哪：位置可以像 `globalThis.t3Titlebar.panel` 那样记下来，也可以由面板头的 `nextCommand` 直接打开。

2. **同名文件标签无法区分**（`mods/t3-chrome/main.js:177`，`check-surfaces.cjs` "a whole basename has no tooltip even when its path differs"）
   - 现象：根目录的 `package.json` 和 `packages/app/package.json` 两个标签写着同样的字，悬停也没有提示。见 [05-overflow.png](panel-surfaces/05-overflow.png)。
   - 为什么错：需求 B3 和 `RECIPE.zh-CN.md:83` 都写着"tooltip 显示相对路径，同名靠 tooltip 区分"。`tooltip-audit.md` #23 改成了"仅截断时提示"，测试把这个改动锁死，文档却没改，所以现在文档与行为互相矛盾。T3 的文件标签本身也没有路径提示（`RightPanelTabs.tsx:1012-1019`，只有 device 标签带 Tooltip），因此这里需要决策，不能简单地"跟 T3"。
   - 修法：见第 3 节决策点 (a)。

3. **`cmd-w` 和 `cmd-t` 各有两条路径，存在一次关两个标签的风险**（`keys.json:162,167`；`shared/panel.js:7-11`；`mods/t3-files/main.js:564`；`extras/mods/review/main.js:497`）
   - 现象：`mod:t3-files`／`mod:review` 在 keys.json 里把 `cmd-w` 映射到 `*.close`，最终调用 `closeSurface()`。同时，这两个 mod 的 `on_key_down` 里 `surfaceKey()` 也在 `cmd-w` 上调用 `closeSurface()`。`cmd-t` 同理。
   - 为什么错：如果宿主既派发绑定的命令，又把按键交给 view，一次 `cmd-w` 会连关两个标签。如果只走其中一条，另一条就是死代码。`host-capability-verification.md` §4.2 建议只保留一条主路径，并补真机回放。两者都未验证。
   - 修法：只保留一条路径（第 3 节决策点 (d)）。

### 应该修

4. **面板模块直接写 Review 的存储，Review 又另外加了三层防护**（`shared/panel.js:82-86`；`extras/mods/review/main.js:129-130,167,214-216,256`）
   - 现象：`closeSurface` 直接删除 `review.shown[space]`，并把 `review` 置空。Review 那边又用 `surfaceBorn` 比对、`surfaceAlive()`、`keep()` 拦截写入、每秒定时驱逐，四处一起负责"关闭后释放"。
   - 为什么错：共享面板模块需要知道 Review 的 key 名，独立安装的 Review 也绑在这个协议上。这是补丁叠补丁：每发现一个迟到写入就多加一道门。Files 的释放只靠 born 比对一个机制（`mods/t3-files/main.js:129-131`），而且是对的。
   - 修法：面板只负责移除标签。每个 mod 发现自己的实例（born）不在了，就自己释放、删除自己的持久记录。Review 只保留 born 这一种判断。

5. **"是不是 T3 布局"靠 `pages.includes("panel-empty")` 推断，散落 7 处**（`shared/panel.js:8,51,79,99,107`；`extras/mods/review/main.js:215,429`）
   - 现象：布局里有没有 `panel-empty` 子块，同时用来表示"这是 T3 布局、标签由 t3-chrome 管理"，以及"这是单装 Review 时宿主自己的 stack"。
   - 为什么错：这是一个隐式模式开关。每个函数都要记得分两条路走，`showPage`、`closeSurface`、`togglePanel` 各自分叉。以后加 surface 类型，每处都要再判断一次。
   - 修法：在适配层只算一次 `ownsSurfaces`，并且只让两三个公开入口分叉。

6. **用随机 token 当事件总线，并且每次切标签都写一次 shared**（`shared/panel.js:40,54,60,70`；`mods/t3-files/main.js:135-147,303-305`）
   - 现象：`activateSurface` 每次都往 `t3.panels` 写入 `selected: Date.now()-Math.random()`，`shared.json` 随之落盘。Files 在 render 和 1s 定时器里比对这个 token，用来判断是外部选择（需要清搜索并 reveal），还是自己 `openFile` 触发的（这时 `open()` 立刻回填 `st.selection`，避免误判）。
   - 为什么错：这种握手很脆，靠"自己写完立刻改本地值"来抵消自己的写入。T3 用的是每个 surface 自己的 `revealRequestId` 递增（`rightPanelStore.ts:802-806`），语义清楚。`page` 字段也只是 `active` 的冗余副本（`slot(active)` 可以算出来），却被持久化，还参与 `same()` 比较。
   - 修法：改成每个标签一个 `reveal` 计数，只在外部打开或点击标签时 +1。删掉持久化的 `page`。

7. **面板头的横滚是重写的一份，而且比 T3 和已有标签条都差**（`mods/t3-chrome/main.js:201-216`；已有实现在 `mods/t3-tabs/main.js:541-560`）
   - 现象：左箭头在条的最左边，右箭头在 `+` 后面，滚到两端时箭头也不会禁用：[07](panel-surfaces/07-deleted-file-tab.png) 里 offset 为 0，左箭头仍然可点。两端没有渐隐。未测量的标签按 100px 估宽。`surfaceWidths` 按 tab id 缓存，只增不减。
   - 为什么错：T3 把两个箭头并排放在右侧，并在到边时禁用（`RightPanelTabs.tsx:1470-1510`，`canScrollLeft/Right`）。工作区标签条已经有滚轮、截断渐隐和"当前项滚入可见"，这里是近似复制。
   - 修法：把 t3-tabs 的横滚抽成 `shared/scroll-strip.js`，两处共用。箭头按 T3 的位置和禁用规则来。

8. **"Review 可用吗"写了三份，文案各不相同**（`mods/t3-chrome/main.js:30-46`；`mods/t3-tabs/main.js:129-136`；`mods/t3-actions/review-details.js:12-15,78`）
   - 现象：三处各自执行 `git rev-parse --show-toplevel`。t3-chrome 的版本每 250ms 跑一次 probe，停靠的空页和右键菜单这两个用不到 Review 的 part 也在跑。远程、非 Git、未安装三种文案在三处都不一样。
   - 修法：在 `shared/review-git.js` 里提供一个带缓存的 `reviewAvailability(space)`，三处共用。probe 只在 `surface-menu`／`surface-empty` 里运行。

9. **弹层尺寸是魔法数，和内容对不上**（`mods/t3-chrome/main.js:184,199`；`mods/t3-tabs/main.js:143`）
   - 现象：标签右键菜单固定 220×148，正好是 5 行 × 28 + 8。Review 或 folder 标签没有 Copy path，只有 4 行，底部会留出约 28px 空带。`+` 菜单的 72 在两个文件里各写了一次。这是从代码推出来的，没有真实右键截图。
   - 修法：高度按 `items.length` 计算，常量只定义一处。

10. **Review 图标在启动页和菜单里是单色**（`mods/t3-chrome/main.js:233-234,241`）
    - 现象：标签上用 `image()` 画 pulls.review 的彩色 logo（文件顶部注释说明了这样做的原因），启动页和 `+` 菜单却用 `svg().text_color(muted)`，画成了单色。见 [01](panel-surfaces/01-empty-panel.png) 和 [04](panel-surfaces/04-cmd-t-menu.png)。
    - 修法：菜单行图标复用标签的 glyph 规则。

11. **测试大量锁实现细节**（`mods/t3-chrome/check-surfaces.cjs`；`shared/check-panel-surfaces.cjs`）
    - `check-surfaces.cjs` 断言元素 id、子项顺序（`items[0].id`）、`style.min_w === 0`、`opacity === 0.64`、图标 src 路径，还靠 Proxy 伪造整个 GPUI。任何重排都会让它失败，可前面列出的真实缺陷（菜单锚点、箭头禁用、同名区分）它一个也抓不到。真正有价值的只有键盘选择和禁用项这几条。
    - `check-panel-surfaces.cjs` 是 53 行连续有状态的脚本，用正则剥掉 import 后在 vm 里跑。它断言 `born`／`folder`／`trail` 这些内部字段，某一步失败后难以定位。
    - 修法：标签增删改做成纯 reducer，用表驱动测试（输入 tabs、动作，输出 tabs 和 active）。面板头只测行为：箭头到边禁用、菜单锚在 `+` 下方、同名可区分。

12. **文档与行为不一致**
    - `docs/adr/0017-space-panel-surfaces.md:6` 仍写着"面包屑目录只在树里定位"，但 0018 已经修订了这一条，0017 里却没有指向 0018 的修订行（0015 有指向 0017 的）。0017 有一半篇幅在讲详情 popup，和面板 surface 是两个决定，应该拆出来。
    - `RECIPE.zh-CN.md:83`／`RECIPE.md:83` 写着"相对路径提示"，与第 2 条的实际行为相反。
    - 固定两页时代的残留：`RECIPE.zh-CN.md:89`"两页共用"，`RECIPE.zh-CN.md:103`／`RECIPE.md:103`"可选 Review 页"，`RECIPE*.md:265/267`"Review 页开关"，`docs/user/guide*.md:28`"面板的 Review 页……点它的页签"，`README.md:87`／`README.zh-CN.md:87`"Review page"。
    - `docs/user/guide.zh-CN.md:27` 的 Files 一条约 1000 字，把树的键盘操作、tooltip 策略等实现细节都写成了用户说明，篇幅过长。

### 可选

13. **每次 render 都要多次遍历 layout 树**（`shared/panel.js:21-24`）：`panelState()` 每次调用会遍历 3 次（`layout()` 查找 2 次，加 `surfacesFor` 1 次）。`t3-tabs` 的 end 部分每帧调用 4 次。规模小，可以顺手每帧只算一次。
14. **旧固定 page 自动迁移成标签**（`shared/panel.js:16-19`，加一条测试）：如果项目确认没有真实用户，按 AGENTS.md 应该删除；如果 Gallery 已有用户，就保留。需要拍板。

## 3. 重写方案

### 目标行为

保持 B1–B5 和 ADR 0018（目录 surface 与 trail）的现有可见行为，同时修复以下几点：
- `cmd-t` 打开的菜单锚在 `+` 下方；
- 横滚箭头按 T3 并排放在右侧，到边禁用，两端有渐隐；
- 同名标签可以区分；
- 一次按键只关闭一个标签；
- 菜单高度跟着实际行数；
- Review 图标在各处一致。

### 模块边界

| 模块 | 职责 | 备注 |
| --- | --- | --- |
| `shared/surfaces.js`（新，纯函数） | `add(kind)`、`openFile(path)`、`navigateFolder(src, path, trail, keep)`、`close(id, mode)`：输入 `{tabs, active}`，输出新的 `{tabs, active, closed[]}` | 直接对照 `rightPanelStore.ts:784-843` 翻译。不碰 `layout()`／`shared()`，表驱动测试 |
| `shared/panel.js`（重写适配层） | 读写 `t3.panels[space]`；`layout.select/show/hide`；只算一次 `ownsSurfaces`；每 space 恢复（沿用现有 `syncPanel`／`restorePanel` 的 1s pending 逻辑） | 不知道 Review 的任何 key。去掉 `page`、`selected`，每个标签改用 `reveal` 计数 |
| `t3-chrome` 面板头 | 标签条（用 `shared/scroll-strip.js`）、`+` 及其菜单锚点、`surface-menu` 命令、右键菜单 | 菜单行复用 t3-menu 行样式和 `menuJump`（已用）；高度按行数算 |
| `shared/scroll-strip.js`（从 t3-tabs 抽出） | 滚轮、当前项滚入可见、两端渐隐、箭头禁用状态 | 工作区标签条和面板头共用 |
| `shared/review-git.js` 加 `reviewAvailability` | 一处判断远程、非 Git、未安装，并带缓存 | chrome、t3-tabs、details 共用 |
| Files／Review | 发现 born 不在时，各自释放自己的状态和持久记录；按 `reveal` 变化执行 reveal | Review 删掉 `surfaceAlive`／`keep` 的门，只留 born 比对 |

### 可删除

- `shared/panel.js:82-86`（Review 存储清理）、`page` 的持久化与比较、`selected` token；如果决策 (b) 选删除，还有 `:16-19` 的旧 page 迁移。
- `extras/mods/review/main.js` 中 `surfaceAlive()` 和 `keep()` 开头的防护，以及每秒定时器里的 `!s.surfaceAlive()`，改由 born 一个机制负责。
- `mods/t3-chrome/main.js:201-216` 的手写横滚和 `surfaceWidths` 缓存；`:30-46` 的 250ms git probe。
- `mods/t3-tabs/main.js:129-136` 的重复 git 检查；`:143` 不带锚点的 `openOverlay`。
- keys.json 和 `surfaceKey` 两条键盘路径删掉其中一条。
- `check-surfaces.cjs` 里断言 id、样式、src 的部分；`check-panel-surfaces.cjs` 改写成 reducer 表测试和一条适配层测试。
- 文档：0017 拆出详情 popup 的 ADR，并加上指向 0018 的修订行；修正第 12 条列出的 RECIPE、guide、README 残留；压缩 guide 里的 Files 段。

预计净删除 150–250 行（不含测试）。panel.js 182 行拆成大约 60 行 reducer 加 80 行适配层。

### 风险

- 每 space 恢复依赖 `t3-tabs` keys 副本在 render 里调用 `syncPanel`，并有 1s pending 窗口。demo 里窗口不在前台时，`t3.panels` 的 `page`／`wide` 一直没有更新，说明窗口不渲染时状态不会同步。重写如果碰这部分，要回放 Home `arrive`、快速切换 space、放大后切走再回来这几个场景。
- Files 的 1s `sync` 和 render 内 sync 一起决定什么时候 reveal。改成 `reveal` 计数后，要回放：搜索结果点击不清搜索，外部点击标签要清搜索。
- 单装 Review（pulls-review 的 `open.js:78` 调用 `showPage`）走宿主自己的 stack，`ownsSurfaces=false` 那条分支要保留并回放。

### 需用户拍板

- (a) 同名文件标签怎么区分：①（建议）只在存在同名标签时，名字后附上淡色的父目录（VS Code 做法，不依赖悬停）；② 文件标签始终用 tooltip 显示相对路径（需求原文的做法）；③ 保持现状，和 T3 一样不区分。
- (b) 旧固定 page 迁移：保留，还是按"无真实用户"规则删除。
- (c) 横滚箭头：按 T3 并排放右侧（建议），还是保留现在左右分开的位置。
- (d) 面板内 `cmd-t`／`cmd-w` 走哪条路：只用 mod 的 `on_key_down`（建议，与宿主验证文档一致，面板必须真的有焦点），还是只用 keys.json 的 `mod:` 分区。

## 4. 未检查项

- 真实鼠标的中键关闭、右键菜单（包括 148 高的空带）、悬停换成 ×；真实 `cmd-t`／`cmd-w` 的焦点路由，以及第 3 条是否真会关两个标签。没有输入合成，只用了 `herdr-app do`。
- 放大状态的持久化：用 `layout.hide work` 模拟放大后，store 里 `wide` 没有变，但这是因为 demo 窗口在后台不渲染，`syncPanel` 没有运行，无法定论（06 只证明布局保持了放大）。
- 亮色主题、窄窗、没装 Review 的布局、远程 space 的禁用项、单装 Review 的模式、Home 往返恢复。
- 面包屑目录 surface（`navigateFolder`）只读了代码，并和 T3 `rightPanelStore.ts:819-843` 对照过；没有在 demo 里点面包屑（宿主没有对应命令）。
- 一次 `setShared(t3.panels)` 内部的读-改-写如果和另一个 mod 的写入交错会怎样：宿主 shared 的合并语义没有查证。

## 跨范围

- Review 页面在 demo 里报 "Port 7855 is already in use"（[02](panel-surfaces/02-files-review-tabs.png)）：其他审查者的 demo 占用了 jin.review 的默认端口，是环境问题，归 Review 审查者判断是否需要换端口。
- `t3-actions/review-details.js` 的 Quick Review 可用性判断，与第 8 条一起收敛，归详情审查者。
