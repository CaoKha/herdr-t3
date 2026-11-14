# Quick Review 行锚定补修

## 反馈与决定

本轮独立修复 `b843396f` 中 Quick Review 下方又浮出一个 Uncommitted 范围按钮的问题：子菜单应像 Open in 一样直接锚在该行，不增加第二个触发器。

澄清后的决定原文：

> 用户要的是「把 review 的选择放到这里」，base 也算在内。base 入口放在子菜单里跟 Review 页同样的位置和形式，不要再多出一个独立触发按钮。

范围／Commits／base／键盘仍用 `shared/review-scope.js`。仅给共用 header 增加隐藏 scope trigger 的呈现参数；在 Changes 下，把原比较目标控件放进同一个菜单框。Uncommitted 与 Review 页一致，不额外显示比较目标。没有修改范围读取、缓存、选择请求或持久键。

## 原场景回放

独立 demo：1680×1042、默认256px侧栏、zoom≈1.1。自有本地 fixture 有一个新提交及一处未提交修改，无分析 daemon、外网请求或真实用户仓库写操作。

| 场景 | 整窗／局部 | 亲自检查结果 |
| --- | --- | --- |
| Uncommitted | [整窗](quick-review-anchor-scope.png)／[局部](quick-review-anchor-scope-detail.png) | 菜单直接在 Quick Review 行下，无第二个 Uncommitted 按钮 |
| Changes 与 base | [整窗](quick-review-anchor-base-entry.png)／[局部](quick-review-anchor-base-entry-detail.png) | 比较目标和范围选项在同一个菜单框内，长分支名截断，不挤掉 base 箭头 |
| Commits | [整窗](quick-review-anchor-commits.png)／[局部](quick-review-anchor-commits-detail.png) | 搜索和提交子页向左展开，与 Commits 行对齐，整窗没有截断 |
| base picker | [整窗](quick-review-anchor-base-picker.png)／[局部](quick-review-anchor-base-picker-detail.png) | 同一 overlay 切到共用 base picker，Automatic、分支、remote 控件完整；`status.errors=[]` |

原生布局读回（原始JSON未入库）：行左1337.50、宽288、高35；菜单左1337.50、宽288、顶215.20。菜单和行左右对齐，间距4个逻辑像素（约4.4窗口像素），不再有旧 header 的40逻辑像素空档。

驱动只在 demo 副本：在真实 Details view context 回放原行 handler，行宽高来自原生 `on_size_change`，位置由父 popup 和分区布局推导；Commits 用真实 `scopeKey` Right，base 用原 `togglePopup`。没有把脚本回放说成真实鼠标点击。截图短暂聚焦 demo 后恢复原窗口；没有修改用户窗口的布局或项目。

## 回归与收尾

- 先加回归观察 RED：旧菜单顶263.6，而行锚定期望219.6。修复后检查菜单左右边、4px间隔、无第二个 scope trigger、base 为同一菜单的后代。
- 共享检查保留 Review 默认320px菜单；Details 使用行宽264px fixture；加入菜单内28px header 后，Commits 子页相应下移28px。原 Review 范围／base／Commits／键盘检查仍通过。
- 全仓门禁：`scripts/check.sh` 输出 `all checks passed`，包括所有行为检查、strict tsc、原生 mod 检查和共享副本一致性。`git diff --check` 通过。
- 按 ponytail-review 自查共用 header/menu/submenu 的所有调用方及数据流，无待修发现；单用户本地窗口，无新增进程、轮询、缓存或依赖。
- C 的列表精简已先独立提交 `363ef6fc`，确认 `mods/t3-pane` 无未提交改动后才正常运行 `scripts/sync.sh`。已安装 Actions／Review 原生检查通过，installed scope 与共享源一致，pane 与已提交版本一致；没有装入 C 的半成品。
- 删除独立 scope header／触发器的渲染，不删除用户数据，不保留旧布局备用。双语 Recipe、README、changelog 和用户指南已同步。
- 截图按仓库规则只留本机，不入 Git。实现和报告独立提交；不 push。独立 demo/core、临时驱动、隔离同步目录和中间图已清理。

未验真实鼠标／物理快捷键；本轮不重复上一轮性能采样，也不声称性能变化。
