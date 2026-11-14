# 源码选择与 gutter：事实、探针与决策边界

## T3 09a54f01 的实际行为

- `files/ReadOnlySourcePreview.tsx` 使用 `@pierre/diffs/react` 的 `Virtualizer` / `File`；文件头禁用，代码按 Wrap/Scroll 显示。`FilePreviewPanel.tsx:872-899` 的可编辑分支另有 gutter line selection/comment 回调。
- `files/fileSurfaceChrome.tsx` 的 `FILE_LINK_REVEAL_UNSAFE_CSS` 将 File 的底色置为代码/文件 surface；`lib/diffRendering.ts` 的 context tint 从同一代码底色混合，不是独立的蓝色 gutter。
- 原组件 headless fixture 的三行文本实测：gutter 高80px、所在 viewport 高810px；gutter 不铺到视口底部。行号 computed `user-select:none`。真实的 **headless 浏览器**鼠标拖选得到 `first line\nsecond line`，不含行号。原始数值 JSON 未入库，图为 `t3-source-selection.png`。这不是 Herdr 的鼠标测试。
- Markdown 经 `FileMarkdownPreview.tsx` → `ChatMarkdown` 渲染正文；没有 gutter，也没有禁止正文原生选择的属性。

## Herdr 的最小修复

已安装0.1.15的 `gpui-kit.d.ts` 明确声明：`EditorState.new({readonly:true})` **拒绝编辑，但允许选择和复制**。不需要为了选字切换渲染器。

Files 原根元素的左键按下会 `this.handle.focus()`。内容中的原生 Editor/Markdown 按下冒泡到它后，会把焦点从原生控件夺走。现已在原生内容 wrapper 上停止该次按下的传播；输入框也在原生 wrapper 处理，不把监听器挂到不支持该监听的 Input/Popup。回归检查回放这条冒泡路径，确认焦点留在原生内容。

**真实 Herdr 鼠标拖选仍未验证**：本轮没有在用户桌面发送鼠标，也没有覆盖剪贴板。不能把文档声明或事件回放冒充真实拖选验收。

## gutter 的宿主边界

`EditorState` 仅暴露语言、文本、字体、字号、行号/折叠开关、readonly、soft_wrap 和 syntax 语义色；没有 gutter 背景、gutter 高度或独立代码 surface 的 setter。`Editor` 外层背景不能保证覆盖内部 gutter。全局 `gpui-base.set_theme` 会影响其他控件/副本，不用于局部补丁。

因此不把不受支持的字段塞进 `syntax`，也不通过整窗主题覆盖掩盖它。完全匹配 T3 gutter 需要宿主能力增强或改变源码渲染方式，超出一行样式修复。

## 大文件探针（仅在独立 demo，不进入产品）

同一台Mac、同一文件内容、每项三轮：10,000行/220,000字节和40,000行/880,000字节。比较原生只读 Editor 与一个最小 `TextView.html(<pre>…).selectable(true)` 原型。原始记录未入库。

| 数据 | Editor 创建CPU中位数 | 到布局回调中位数 | HTML创建CPU中位数 | HTML到布局回调中位数 |
| --- | ---: | ---: | ---: | ---: |
| 10k行 / 220KB | 4ms | 3,817ms | 5ms | 20ms |
| 40k行 / 880KB | 10ms | 15,235ms | 22ms | 37ms |

**这些回调不是绘制完成，不能据此宣称 HTML 更快。** HTML大文件随后让 demo 的截图/命令超过30秒不响应、主线程约100% CPU。2秒原生采样的297/297主线程样本落在 `gpui_base::text::inline::Inline::paint` → `TextLayout::position_for_index`（采样原文未入库）。已结束这个仅属于本任务的 demo 进程，未影响用户的窗口。

这个原型还没有语法着色、独立行号、保持行号排除的跨行选择，以及受控虚拟滚动。因此它既没有功能等价，也没有通过大文件绘制/滚动验收，**不能直接替换 Editor**。滚动数据不作通过声明：大文件候选已经在 paint 阶段失败，无法完成同场景安全回放。

## 用户决定

用户确认保留原生 Editor，交付焦点修复与其余 Files 改动；gutter 底色明列为宿主限制带来的已知缺口。本轮不改宿主、不做自制 renderer，产品中没有加入 HTML 原型或降低原有文件大小上限。
