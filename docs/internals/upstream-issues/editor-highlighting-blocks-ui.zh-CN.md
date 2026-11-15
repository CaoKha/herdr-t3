# 中文工单草稿：Editor 在 UI 线程同步解析整份文件，打开和更新较大文件时阻塞窗口

状态：用户审阅后，已于 2026-11-15 翻译并发布为 [herdrdev/herdr-app#1081](https://github.com/herdrdev/herdr-app/issues/1081)。[英文正文](editor-highlighting-blocks-ui.md)与提交内容一致；下文保留审阅时的中文草稿。

## 发生了什么？

自定义 Files mod 用 `EditorState.new({ language: "rust", value, readonly: true })` 预览代码。创建有语法着色的 Editor，或通过 `set_value()` 更新文件内容时，着色器会在 UI 调用路径上同步解析整份文本。在较大文件上，窗口会明显停顿。

文件预览需要跟随 agent 写入的内容刷新。即使新旧文件只差一行，当前着色器也没有利用传入的修改范围：`SyntectHighlighter::update` 忽略 `_edit`，重新创建解析状态、清空高亮结果，再遍历全文。

我们目前的绕行是：较大文件被改写后先显示纯文本，等内容稳定后才创建着色 Editor；超过 256 KB 默认需要手动选择着色。这减少了连续刷新时的重复停顿，但最后一次着色仍然同步阻塞窗口。

## 期望什么？

打开或刷新较大代码文件时，语法着色不应长时间阻塞窗口的输入和绘制；较小的内容变化也应尽量避免触发整份文件的同步重复工作。

实现可以采用后台解析、分批处理、复用解析状态等方式。本工单关注交互响应，不要求某一种实现，也不要求取消语法着色。

## Herdr 版本

源码核对基线：上游 `master` 提交 `5216e6f9f8c0c281a65e09816c66e4319e671784`。

运行数据来自此前 [PR #1077](https://github.com/herdrdev/herdr-app/pull/1077) 已记录的 debug 构建验证：该基线加 `EditorState.set_soft_wrap` 补丁。该补丁未改着色器或 Editor 创建路径。这些数值是已有实验数据，本轮拟稿没有重新测量发行版。

## 操作系统与架构

已有测量环境：隔离的 macOS 虚拟机，4 vCPU，Apple Silicon（arm64）。

## 布局名称

问题来自 Herdr T3 的 Files 预览；已有计时使用独立小 mod 和只读 Editor，无需加载完整 T3 布局。

## 如何复现？

1. 在一个最小 mod 的 `init()` 或事件回调中创建只读 Editor，显示约 1 MB 的 Rust 文本。
2. 对照同样文字、没有 `language` 的纯文本 Editor。关闭 soft wrap 和 folding，以减少折行和折叠的干扰。
3. 只修改文本中的一处内容，再调用 `set_value()`；分别记录创建和更新的同步调用时间。
4. 将 Editor 放进窗口显示，再记录后续绘制和事件循环是否出现明显停顿。同步调用和下一帧应分别报告。

下面是整理出的最小 API 对照片段，应在有有效 context 的 `init()` 或事件回调中运行，不要放入 `render()`。该片段仅计同步调用；本轮尚未运行这一新对照，已有运行数据见下文。

```js
import { EditorState } from "gpui-base";

const text = "pub fn f() { let value = 1; }\n".repeat(35000);
const changed = text.replace("value = 1", "value = 2");

for (const language of [undefined, "rust"]) {
  const start = Date.now();
  const editor = EditorState.new({
    language, value: text, readonly: true,
    soft_wrap: false, folding: false,
  });
  const created = Date.now() - start;
  const updateStart = Date.now();
  editor.set_value(changed);
  console.log(JSON.stringify({
    mode: language ?? "plain",
    createMs: created,
    updateMs: Date.now() - updateStart,
  }));
  editor.release();
}
```

### 已有运行数据

此前的独立 mod 使用约 1 MB、28,822 行的 Rust 文件，并通过连续零延时计时器记录调用之后的事件循环停顿。三次运行中，重建着色 Editor 的结果为：

| 阶段 | 耗时 |
| --- | --- |
| 创建调用 | 1,256–1,289 ms |
| 随后一帧的阻塞 | 1,230–1,491 ms |
| 合计 | 2,499–2,759 ms |

这组实验包含折行切换场景，合计时间包含着色、布局等工作，不能全部归因于语法解析，也不能当作发行版性能指标。它证明了重建 Editor 时存在秒级窗口阻塞；着色同步执行且重新解析全文的机制则由下述源码确认。

## 源码与相关工作

- [Editor 创建与设置初始文本](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/vendor/gpui-kit/crates/shell/src/entities.rs#L461-L488)。
- [同步调用 highlighter.update](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/vendor/gpui-kit/crates/base/src/input/editor/mod.rs#L154-L166)。
- [忽略修改范围、重新遍历全文的着色实现](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/vendor/gpui-kit/crates/shell/src/syntax.rs#L70-L106)。
- [PR #1077](https://github.com/herdrdev/herdr-app/pull/1077) 让 Wrap 可以原地切换，减少这个操作引起的 Editor 重建。本工单关注打开文件和更新文本仍会遇到的同步着色性能问题。
