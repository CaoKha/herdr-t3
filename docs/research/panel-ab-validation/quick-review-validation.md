# Details / Quick Review / Open in 验收

**最新补修**：[Quick Review 行锚定菜单](quick-review-anchor-fix.md)已移除下文旧截图中的独立范围触发器；旧图只保留作历史证据，不代表当前布局。

## 结果

用户原话（`Snapzy_2026-11-14_01-50-45_225.png`）：

> 这里 git 操作相关的，我暂时不需要做。我们只需要在这里加一个快速 review 的入口就好了。把我们的那个 review 的选择、快速选择放到这里就可以了。

- Details点不开已独立修复并提交：主仓`e960e449`、Actions仓`d14f07f`。原生0高视口的原场景和回归见[独立报告](details-open-regression.md)。
- 按最新决定删除整个Git操作区，不保留分支、PR或写操作。Workspace保留locked机器／路径、Open in和全局Actions，下面只有Quick Review。
- Quick Review与Review页共用scope、Commits、base及键盘实现，选中范围即打开／切换唯一Review标签。base的remote开关保留原菜单的stays行为。没有分叉一份菜单。

```text
shared/review-scope.js + review-menu.js
  ├─ Review页
  └─ Details Quick Review → 选中范围 → Review标签
```

## 原生整窗与原场景回放

独立demo：1680×1042窗口，默认256px侧栏，zoom1.1。不修改用户窗口的space、tab、pane、zoom或布局；截图短暂聚焦demo后恢复原窗口。

原始截图与原生尺寸JSON未入库，下表记录当时逐张核对的结果。

| 场景 | 结果 |
| --- | --- |
| 新Details整卡 | 整窗：四行完整，只有Quick Review，没有Git操作区 |
| 范围菜单 | scope、Commits、base：同源菜单及向左子页均在窗口内 |
| 选择范围 | 实际Review：选中自有fixture的真实commit `3fd1d6b`，唯一Review标签显示该提交的文件与一行diff，不是只改标题。使用独立17855端口的本地demo daemon，未动用户daemon |
| Open in | 按钮与菜单：统一57×28分体几何，Finder／Visual Studio Code／VSCodium均可见，通用图标不空白 |
| 实测截断 | 长名整窗、短名整窗及原生尺寸：长电脑名336.36>容器190，长surface292.73>112.27；短电脑名177.27<190。长名仍ellipsis且folder图标保留 |

自然测宽曾在原生长名场景失败：量副本继承了父层ellipsis，误判长名能放下；改成自然副本与截断文字为兄弟后回放通过。随后修正加tooltip时丢失flex槽导致的溢出，长名整窗不再挤掉folder。宽度未变不notify，未测时不先显示重复提示。

Open in采用T3完整20款编辑器候选，通过macOS LaunchServices异步检测，避免GUI进程PATH没有CLI而漏装在本机的应用。不加入Sublime Text、Xcode、TextEdit等T3名单外应用。修复热加载后Files旧init名单仍为Finder的问题：从共享缓存读取已完成metadata，真实原场景菜单恢复三项；绘制只读内存，不等待进程或扫应用。

真实鼠标点击、物理快捷键和指针形状没有冒充已验；以上为真实handler、共享键盘逻辑及`herdr-app do`回放。可点行显式pointer、分体箭头仅aria-label，相关行为检查通过。

## 性能

改前样本来自`a9e2f769`的可见三行Details；最终样本为本轮四行Details及实测文字实现。原始样本未入库，汇总见下表。每项25次、排除3次预热，同一独立窗口、50个surface标签；计时从命令handler开始，CLI往返单独记录，不计入render_ms。最终每次popup均断言宽高大于0，最小实测高度179.5。

| 测量（ms） | 改前 median / P95 | 最终 median / P95 |
| --- | --- | --- |
| Details首次非零布局 | 73 / 81 | 71 / 83 |
| 切标签到活动header绘制 | 17 / 30 | 27 / 31 |

popup没有同步Git探测；范围读取只在用户打开选择器后异步发生。标签header的median增加10ms，P95增加1ms；不把它写成性能提升，也不把header计时当作整份文件加载时间。此前0高popup产生的after/cold计时已删除，未用于比较。

## 检查与删除

- 全仓门禁：`scripts/check.sh`输出`all checks passed`；`scripts/sync.sh`已运行，最后的store检查也通过。本轮不保留新增的旧openTarget键迁移。
- Actions／Files／shared Open in、Review scope、实测文字、Tabs／Chrome／Spaces相关检查均先观察失败再修复；原Review范围／base／Commits／键盘场景继续通过，strict tsc和原生mod检查通过。
- [独立审查](quick-review-review.md)发现并修复四个并发来源驱逐pending的问题；原例独立复核后五个live owner／follower均收到数据。缓存仅保留最近三份完成快照，活跃读取不会被容量驱逐为永久Reading；关闭owner、关闭follower和迟到结果另有检查。
- 删除未提交的`git-details.js`、`git-details-cli.js`、`check-git-details.cjs`、五个Git专属图标及两份Git实施／安全报告；没有保留备用实现。旧`scope.js`迁到共享源，不留wrapper。另删Chrome不再使用的619个Cat资产和两个旧JS副本；Files／Review仍需要的Cat源保留。
- 没有外网push、GitHub发布或修改真实用户仓库。demo中的提交、分支与daemon仅用于自有fixture，随demo清理；所有测试探针只放独立demo，不进入产品代码。

## 安装与收尾

最后已正常运行`sh scripts/sync.sh`，安装目录的Actions／Review原生检查均通过，旧Git操作模块不再存在。三关联仓的JS副本与主仓一致并各自提交：Actions `897f377`、Review `b7e1080`、Inbox `cbe0e91`，未push。

独立demo、其core／daemon／fixture、基线与安装快照、临时探针／测量脚本和中间文件已清理；本轮创建的实施／审查agent全部关闭。后续另行授权的子agent菜单修改不属于本报告，不混入本任务提交。
