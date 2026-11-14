# Files 的结构与交互跟随 T3 Code

Files 的结构和交互照 T3 Code 的 Files 面板，尺寸、边距、颜色和圆角取本布局 token（[t3-tokens](../internals/t3-tokens.md)「Files 文件头与树」）。修订 [0013](0013-space-panel-pages-share-one-frame.md) 的 Files 常驻工具栏、两页强制同头/同状态，以及 [0017](0017-space-panel-surfaces.md) 的“目录面包屑仅定位树”。

- 通用 Files 直接显示整宽树；打开文件后左边是内容，右边是导航列里的树。文件头是 inline：面包屑、Open in、Preview/Code、Wrap、Tree，后三个固定槽，不适用时禁用（T3 条件隐藏 Wrap，这里有意不同）。
- **一棵树，两个页面**：Files 与 Review 用同一种行（`shared/file-tree.js` 的 `treeRow`），几何不随插槽变化；没有折叠箭头，目录图标开合两态表示展开，图标都用 T3/Pierre 图形。Review 只多已看框和状态字母。Catppuccin 图标包删除。
- 搜索过滤同一棵树，子串匹配，结果超过200时文件名命中、路径短的优先留下。搜索词和它的结果一起提交，界面不会把一次搜索的结果显示在另一个搜索词下；还没搜的词显示加载。
- 单选。焦点只在用户从树或面包屑发起时进入树；标签切换、命令等外部定位只滚动和选中，不夺走终端的键盘。
- 菜单（行菜单、面包屑目录菜单、Open in）是 Files 自己的原生 popup，和布局其余菜单一致；目录菜单在旁边级联，层数不限（不照 T3 的原地 Back to）。Open in 菜单与详情共用一份（`shared/open-in.js`）。cmd-w 先关菜单，再关标签。
- 目录面包屑从文件旁边打开目录 surface，保留原文件和 trail；目录之间继续导航原位替换。目录不当文本读取。
- 只在面板显示 Files、窗口在前时读取；全部展开最多200目录、4路读取，折叠、单目录操作和搜索使旧展开失效。

保留只读、每 space 共用树和有界预览缓存，不加入编辑/保存。T3 的 Web 文档/媒体预览与拖进 composer 无对应 GPUI/终端接口；Insert 是安全的终端映射。源码和 Markdown 内容区阻断冒泡的左键按下，避免根元素夺走原生选择焦点；宿主未暴露 gutter 颜色/高度，保留原生 readonly Editor（见[报告](../research/files-panel-t3-parity/source-selection-and-gutter.md)）。完整对照见[审计](../research/files-panel-t3-parity/README.md)和 [2026-11-14 审查](../research/rewrite-review-2026-11-14/files-panel.md)。
