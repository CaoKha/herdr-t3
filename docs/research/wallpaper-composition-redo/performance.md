# 构图 Zoom 卡顿：复现、根因与回放

用户反馈：28425912 的预览 Zoom 拖动很卡；原始截图 `~/Pictures/Snapzy/Snapzy_2026-11-14_00-23-27_923.png`。先独立修此问题，再继续图片处理对齐。

## 场景与测量边界

基线 `d3b300af`（构图实现为28425912），Herdr 0.1.15，已有隔离 macOS VM；无 viewer、VNC、共享目录或剪贴板桥。客体 `DEMO=/private/tmp/wallpaper`，app/core/HOME 独立，1280×699整窗、默认256侧栏、zoom1，Maple主题。宿主没有 GUI 输入、未操作用户自己的 Herdr。

只读原图 `~/Pictures/146943457_p0.png`，2756×1654；客体仅用副本，二者 SHA256 都为 `c18f70dc005ec5fa88397ff77ec41d9bfc8de9526e9ec1368595009c66266f83`。经真实 `startPreview`、旧 Dots 生成器建立草稿，不用小图替代。测试副本注入 `performance-probe.py`，生产代码不留 probe。

每种输入100步、每步请求16ms后的下一tick：Zoom从1到3.871；画布拖动和Right键调用生产鼠标／键盘回调。真实窗口实际布局、绘制，不是空元素模拟。记录每步间隔、`render` JS耗时、转换与exec/read/write调用数。`HERDR_APP_BENCH` 的原生计数记录JS、元素materialization和CPU绘制阶段，按秒累计；帧均值只用完全位于该回放内的桶。事件间隔含16ms调度等待，不等同于CPU帧耗时；不足一帧的JS用Date.now毫秒精度记录，不称微秒精度。

## 根因

优先假设：尺寸变化触发SVG重新栅格化；其次是大量JS元素重建；最后是意外转换／文件I/O。

```text
旧：Zoom → 新尺寸 → svg(path, 新尺寸) → 同步解析/栅格化全部mask → paint
新：导入/换主题 → 固定4096px预览源 → image()解码一次
    Zoom/拖动/方向键 → 已有纹理的新位置/尺寸 → GPU缩放
```

实测转换、exec、readTextFile、writeTextFile在三种回放中始终为0。旧JS描述平均不足1.3ms，并非主要阻塞。原生SVG的缓存键却是 `(path, drawn size)`：`herdr-app/vendor/gpui-pre/src/window.rs:4914` 的 `paint_svg` 创建 `RenderSvgParams`，包含新尺寸，miss时同步 `render_alpha_mask`；`svg_renderer.rs` 明确尺寸进入key，并把mask以2倍绘制尺寸栅格化。相同path并不意味着Zoom复用纹理。旧每帧仍重新描述全部图块；新版只描述一个原生image和现有控件。

修复只动本仓mod。草稿转换时保留既有图形正文，按当时主题颜色合成固定分辨率SVG，让宿主原生 `image()` 固定尺寸解码；换主题才在render外更新，拖动和缩放不读写、不重转。分块仍低于1MiB，分块之间让出tick；取消／关闭清理自己的目录。新主题纹理替换旧文件，避免反复切主题积累文件。Apply仍只提交原 `.ans` 和构图，最终壁纸仍用原SVG图块，内置图未改。

## 对比

原始值（含原生每秒计数）未入库，以下表是其汇总；验证脚本 `check-performance.py`：旧场景必红，修复后必绿。首次探索的独立100步 Zoom 均值198.16ms、最大635ms，不混进正式对照。

| 输入 | 旧事件间隔均值 / p95 / 最大(ms) | 新事件间隔均值 / p95 / 最大(ms) | 原生CPU帧均值：旧→新(ms) |
| --- | --- | --- | --- |
| Zoom | 193.02 / 260 / 269 | 19.11 / 23 / 67 | 185.63 → 1.19 |
| 画布拖动 | 20.46 / 25 / 200 | 18.54 / 22 / 30 | 3.21 → 2.11 |
| Right方向键 | 21.90 / 26 / 80 | 18.51 / 23 / 64 | 2.77 → 2.02 |

验收门槛：三种回放的事件间隔p95≤33ms，所有转换与文件调用计数为0。修复前Zoom p95=260ms，稳定复现；其他两种没有相同持续卡顿，Zoom档位变化后的单次冷栅格化也会污染拖动的最大间隔。性能修复未以降采样原图或跳过输入来掩盖问题。

原生客体输入另做一次背景拖动，读回确认没有变化后才改foreground；真实slider从2.00变3.54（截图未入库）。这是真实HID拖动的UI确认，不把Driver的 `effect: unverifiable`当成功。逐帧计量用上述受控回放，不把一次人工式手势冒充100步计量。原 `app.theme` 只选择明暗各自的主题槽，并未切appearance，该探索图更名 `theme-selection-only.png`，不作浅色证据；明确切appearance后的明暗整窗补验见[模式验收](../wallpaper-image-alignment/README.md)。

## 门禁与边界

红绿日志未入库，结论如下。

- 旧构图不复用原生image的回归断言确实失败；`check.cjs`修后通过，并检查移动不改变文件集合。
- 同图、同窗口、同输入程序的时序检查：旧实现失败、修复后通过；原生CPU帧见上表。
- `check-filesystem.cjs`的17个原文件生命周期场景通过；原204组布局检查通过。处理方式选择的新布局检查在独立后续改动中，不混进本性能提交。
- 客体 `herdr-app check`通过，`status.errors=[]`；截图已亲看。全仓sync/check在本次算法/UI接续完成后一并收口。

没有改宿主／第三方源码、删除用户数据、复制或修改原图、改变缓存版本或持久偏好；没有推送。预览长边4096px，极大缩放时可略软，最终矢量壁纸不变。未用实机Linux/Windows、4K/5K外屏验证；native计数为CPU绘制时间，不是GPU呈现延迟。
