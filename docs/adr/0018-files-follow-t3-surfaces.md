# Files 的结构与交互跟随 T3 Code

用户要求整体按 T3 Code，尺寸、边距、颜色和圆角仍取本布局 token。修订 [0013](0013-space-panel-pages-share-one-frame.md) 的 Files 常驻工具栏、两页强制同头/同状态/同图标槽，以及 [0017](0017-space-panel-surfaces.md) 的“目录面包屑仅定位树”。Review 的已看框、diff 内容及其头部不在本次范围。

- 通用 Files 直接显示整宽树；文件使用 inline subheader 和右侧导航列。Markdown 的 Preview/Code 是一个图标 toggle。
- 用户后续要求文件头跨模式不跳位：Preview/Code、Wrap、Tree始终保留固定槽，不适用时禁用。这是对T3条件隐藏Wrap的有意修订。Search沿用compact ghost输入，焦点用accent边和内环；面包屑滚动行透明，目录hover仅保留文字提亮，不加底色（用户指定差异）；键盘focus-visible内环保留；用户明确删除面包屑及树行tooltip（包括截断时），Open in分体箭头只留无障碍标签。
- 树只有一个 leading slot：目录 chevron，文件类型图标。搜索过滤同一棵树，不切换成平铺 picker。hover、选择集合和键盘焦点独立；Files 只标 ignored，A/M/D/R 仍属于 Review。
- 目录面包屑从文件旁边打开目录 surface，保留原文件和 trail；目录之间继续导航原位替换。chevron 菜单浏览子目录并选择同级文件。目录复用 Files 渲染位，整宽树，不当文本读取。
- 本机 Open in 与详情共用编辑器探测和目标偏好。工具栏菜单选择只记偏好，主按钮才打开；树 Open with 直接打开。远程不能用本机应用。
- 每次树重建只建立一次焦点索引与目录统计；暖重绘只访问可见行。全部展开最多200目录、4路读取。折叠、单目录操作和搜索使旧展开请求失效，await之后再次检查，迟到读取不能重新展开。展开时刷新不与它抢读。

保留既有只读、每 space 共用树和有界预览缓存契约，不加入编辑/保存。T3 的 Web 文档/媒体预览与拖进 composer 无对应 GPUI/终端接口，不冒充已经实现；Insert 仍是安全的终端映射。完整对照与真实性能证据见 [审计](../research/files-panel-t3-parity/README.md)。

源码和Markdown内容区阻断冒泡的左键按下，避免Files根元素夺走原生选择焦点。保留原生readonly Editor；宿主未暴露gutter颜色/高度，未加入全窗主题覆盖或HTML替代。候选HTML原型大文件paint失败，测量及真实鼠标未验边界见[报告](../research/files-panel-t3-parity/source-selection-and-gutter.md)。
