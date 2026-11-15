# 中文工单草稿：mod 的 exec 超过 8 MiB 后静默截断输出，调用方无法判断结果是否完整

状态：用户审阅后，已于 2026-11-15 翻译并发布为 [herdrdev/herdr-app#1080](https://github.com/herdrdev/herdr-app/issues/1080)。[英文正文](exec-output-truncation.md)与提交内容一致；下文保留审阅时的中文草稿。

## 发生了什么？

`herdr.exec()` 对 stdout、stderr 分别只保留前 8 MiB，继续读取并丢弃后续输出。命令正常退出时，调用仍返回 `code: 0`；返回对象只有 `code`、`stdout`、`stderr`，没有标明输出被截断。

这使 mod 无法区分「成功取得完整输出」与「命令成功，但输出只取得一部分」。例如，用 stdout 传递 JSON、文件列表或 base64 图片数据时，调用方可能将不完整内容当作完整结果处理。

本项目在图片导入中遇到了这个限制，目前先把图片缩成小采样图再读回，避免触及上限。通用的 `exec()` 调用仍存在这个问题。

## 期望什么？

当 stdout 或 stderr 被截断时，调用方能够明确得知，并区分是哪一路输出被截断。例如，返回截断标志，或以明确错误拒绝调用。

输出大小限制可以继续用于控制内存占用；本工单不要求取消限制或把 8 MiB 调高，也不限定具体 API 设计。

## Herdr 版本

验证源码：上游 `master` 提交 `5216e6f9f8c0c281a65e09816c66e4319e671784`。

本次复现把该版本的 `run_blocking` 原函数提取到独立 Rust harness 中运行，保留其输出收集逻辑；没有在 GUI 中重跑 mod。检查用的本机安装版为 Herdr App 0.1.15，不代表对该安装二进制做了同样的调用测试。

## 操作系统与架构

macOS 27.0，Apple Silicon（arm64）。

## 布局名称

Herdr T3；问题位于通用 mod 执行接口，与布局无关，函数级复现不需要加载布局。

## 如何复现？

让命令正常退出，并分别向 stdout 写入 8 MiB−1、8 MiB、8 MiB＋1 个 ASCII 字节。下面是维护者可在 mod 的异步任务中使用的对应 API 片段；本次实测使用的是上述原生函数 harness。

```js
import { exec } from "herdr";

for (const size of [8388607, 8388608, 8388609]) {
  const result = await exec("python3", [
    "-c",
    `import sys; sys.stdout.buffer.write(b'a' * ${size})`,
  ]);
  console.log(JSON.stringify({
    requested: size,
    returned: result.stdout.length, // 此例全是 ASCII，一个字符等于一个字节。
    code: result.code,
    fields: Object.keys(result),
  }));
}
```

原生函数实测结果：

| 写入 stdout 的字节数 | 返回的字节数 | 退出码 |
| --- | --- | --- |
| 8,388,607 | 8,388,607 | 0 |
| 8,388,608 | 8,388,608 | 0 |
| 8,388,609 | 8,388,608 | 0 |

对 stderr 写入 8,388,609 字节，也只返回 8,388,608 字节，退出码为 0。

另一个已运行的边界用例是：写入 8,388,607 个 ASCII 字节，再写入中文字符「中」的三个 UTF-8 字节。截断后只留下该字符的第一个字节，`String::from_utf8_lossy` 把它替换成 `�`；退出码仍为 0。

以上截断均没有独立的截断状态可供调用方检查。

## 源码与相关工作

- [输出上限与收集逻辑](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/src/mods.rs#L831-L881)：`take(EXEC_OUTPUT)` 之后，余下内容被读入 `sink()`。
- [返回对象](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/src/mods.rs#L951-L969)：只有 `code`、`stdout`、`stderr`。
- [PR #446](https://github.com/herdrdev/herdr-app/pull/446) 修复收集输出时超时失效的问题，并保留既有 8 MiB 上限。本工单关注调用方如何得知截断，是独立诉求。
