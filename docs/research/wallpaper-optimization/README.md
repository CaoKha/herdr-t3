# 壁纸模组优化：实测研究与结论

起因：t350 会话给出 6 条“真正能做”的方案（明暗层次、点阵密度、正式壁纸纹理化、切换淡入、内置画局部动效、视差）。本轮对照代码、GPUI 源码和上游 asciicn 逐条核实，并用 mod 自己的转换代码离线实测。基线 `d45de403`；只读，不改 mod。

## 结论

按收益 / 代价排序：

| # | 方案 | 证据 | 代价 |
|---|---|---|---|
| 1 | **浅色主题按“纸面”转换**：明暗反转后再映射字形，透明度按“暗度”取 | 浅色主题现在是底片：明暗相关 −0.87 ~ −0.93；`maple-light` 几乎空白（Dots 跨度 0.015）。改后 +0.88 ~ +0.96 | 中：需要第二份 `.ans`／图块，Apply 时多转一次 |
| 2 | **正式壁纸改用整张纹理（`image()`）** | `svg()` 在绘制帧内同步栅格化，切换或改高度时卡 50–570ms，遮罩 105–124MB；`image()` 在后台线程栅格化，4096 宽 36MB | 中：换主题需重建纹理；缓存回收待验证 |
| 3 | **修正 EXIF 方向** | 复现：`sips` 不读方向，手机照片会躺倒；ImageIO 读方向约 50ms | 小 |
| 4 | **已应用的壁纸可重新调构图** | 现在只有导入时能调；`applyPreview` 已支持“文件未变只写 placement” | 小 |
| 5 | **切换淡入** | 可做，但没有图片加载完成的回调；要等第 2 项完成后才不卡 | 小 |
| 6 | **点阵密度三档** | 144/192 行细节明显更多；列数上限 480 会改变 16:9 的裁切；细档 Braille 冷栅格化 572ms | 中，放在第 2 项之后 |
| 7 | **内置画动效** | 上游本身就是 shader 动画，“哪里动”已有定义 | 中→大 |
| — | 图层合并（透明度烘进遮罩） | 像素一致，图块 −89%、遮罩内存 −47%，耗时不变 | 小；如果做第 2 项就不需要 |

**建议的第一批：1 → 3 → 4。第二批：2 → 5。** 第 2 项还得在演示窗口里补测内存回收。第 6、7 项等第 2 项落地后再定。

## 方法

- 导入链路与 mod 一致：`imagePlan` → `sips` 裁切缩放 → `decodeBmp` → `sampleImage` → `imageAns` → `convert`（`scripts/pipe.mjs`、`scripts/render.mjs`）。变体只改 3 处，见 `scripts/art-variant.patch`：`ROWS` 控制密度，`INVERT=1|2` 做浅色转换。
- 合成：每个图块按主题色和透明度叠在主题背景上，用 `rsvg-convert` 出图。
- 指标（`scripts/metrics.py`）：把渲染结果与原图（按同样方式裁切）都缩到 80 列网格，算 OKLab 明度的 Pearson 相关（“明暗是否同向”）；再算渲染明度 5%–95% 的跨度（“看得见多少层次”）。
- 样本：4 张图（`~/Pictures/146943457_p0.png`、`120672551_p0.png`、`138149243_p0.png`、`个人壁纸.png`）× 4 种画法 × 6 个主题。
- 栅格化（`scripts/raster.mjs`）：按 GPUI 的规则，每个图块以绘制尺寸的 2 倍（`SMOOTH_SVG_SCALE_FACTOR`）用 resvg 渲染。测试机 Apple M5，单线程，`@resvg/resvg-js` 2.6.2（宿主用 resvg 0.46）。只作相对量级参考，不等于宿主帧时间。

## 发现 1：浅色主题是底片，`maple-light` 近乎空白

原因有两层：

1. **明暗方向**：字形大小和透明度都表示“亮度越高、墨越多”。深色底上这是对的；浅色底上，墨是深色，亮部反而画得最重。
2. **颜色槽撞背景**：亮色映射到 `ansi7`、`ansi15`。`maple-light` 的背景是 `#fffffe`，`ansi15` 是 `#ffffff`，`ansi7` 是 `#f3f2f2`，亮部完全看不见。t3 系浅色主题把 `ansi15` 调成了 `#a5a5a5`，所以能看见，但明暗是反的。

上游 asciicn 的 ink/paper 在亮暗两种模式下都是 `foreground`/`background`，同样是“亮 = 墨多”。它在 Studio 里提供 `invert` 开关（`lib/ascii/frame.ts:263`），所以反转属于上游已有的处理，不是自创。

| 主题 | 画法 | 现状 相关 / 跨度 | 浅色转换（`INVERT=2`）相关 / 跨度 |
|---|---|---|---|
| maple-light | Dots | −0.26 / 0.015 | +0.91 / 0.109 |
| maple-light | Braille | −0.27 / 0.044 | +0.96 / 0.152 |
| maple-light | Blocks | −0.05 / 0.123 | +0.95 / 0.418 |
| t3-code-light | Dots | −0.93 / 0.073 | +0.88 / 0.125 |
| t3-code-light | Blocks | −0.94 / 0.341 | +0.92 / 0.477 |
| catppuccin-latte | 四种平均 | −0.89 ~ −0.93 | +0.92 ~ +0.96 |
| maple-dark（参照） | 四种 | +0.91 ~ +0.97 / 0.20 ~ 0.74 | — |

`INVERT=1`（只把透明度档位反成 `7 − step`）也能把相关拉正，但高饱和色（例如纯蓝底）的 HSV 明度高，反转后会太淡。`INVERT=2` 改按亮度的反值取透明度，效果更稳。见 `evidence/sheet-light.jpg`（现状）和 `evidence/sheet-inv2.jpg`（浅色转换）。

实现约束：

- 反转发生在**字形选择**（`imageAns`），而 Apply 后只保存 `.ans`、不保存像素。所以必须在 Apply 时同时生成浅色版本，或者保存像素。
- 用户的设置是 `theme: { light: maple-light, dark: maple-dark }`，跟随系统切换，所以两份都要事先转换好。
- 浅色版本的命名不能是 `*.ans`，否则 `sourceFiles` 会把它当成另一张壁纸。存储规则先看 `docs/internals/storage.md`。
- Studio 导入的 `.ans` 没有像素，只能退而求其次：遇到与背景太接近的颜色槽改用 `foreground`。这样能看见，但仍是底片。
- 内置画是风格化画面，在浅色主题下读起来像“白天”（灯塔变雪景，星云变云层），可以接受。Ember 和 Mountain dusk 偏淡（`evidence/sheet-builtin.jpg`）。

## 发现 2：切换和改高度时，一帧内同步栅格化全部图块

GPUI 源码（`herdr-app/vendor/gpui-pre`）：

- `window.rs` 的 `paint_svg`：缓存键是 `RenderSvgParams { path, size: 绘制尺寸 × 2 }`；未命中时，在 paint 里同步调用 `render_alpha_mask`，也就是同步解析加栅格化。
- `asset_cache.rs:28`：`image()` 资源通过 `background_executor().spawn` 加载，SVG 图片在后台以固有尺寸栅格化。

冷栅格化代价（填充模式）：

| 画面 | 图块 | 叠层倍数 | 1280×700 | 2200×1300 | 遮罩（2200×1300） |
|---|---:|---:|---:|---:|---:|
| Lighthouse | 128 | 5.3 | 68ms | 110ms | 83MB |
| Nebula | 48 | 4.1 | 52ms | 78ms | 63MB |
| Ember | 31 | 1.8 | 24ms | 40ms | 29MB |
| 导入 Dots | 275–280 | 10.2–10.8 | 50–59ms | 90–100ms | 117–124MB |
| 导入 Blocks | 276 | 10.1 | 75ms | 129ms | 116MB |
| 导入 Braille | 249 | 9.2 | 224ms | 293ms | 105MB |
| 导入 Braille 192 行 | 476 | 7.9 | 458ms | 572ms | 117MB |

触发时机：切换壁纸、窗口高度变化（每个新高度都算一次；填充模式下多数画面由高度决定缩放）、首次打开 Home。侧栏折叠只改宽度，通常不触发。叠层约 10 倍，是因为导入图约 40 个“颜色 × 透明度”图层，各自占一块 40 格的方框。

## 发现 3：图层合并——像素一致，内存减半，耗时不变

把同色、同一方格的 8 档透明度合成一个 SVG，透明度写成 `stroke-opacity`/`fill-opacity`（`scripts/merge.mjs`）。GPUI 把 SVG 当 alpha 遮罩乘单色，所以画出来的像素不变。实测在 2% 容差下差异像素为 0，PSNR 59–66dB。

| 2200×1300 | 图块 | 遮罩 | 栅格化 |
|---|---|---|---|
| 导入 Dots | 280 → 30 | 117 → 62MB | 100 → 102ms |
| 导入 Braille | 249 → 27 | 105 → 58MB | 293 → 278ms |
| Lighthouse | 128 → 66 | 83 → 51MB | 110 → 104ms |

用 `<g opacity>` 实现会强制离屏合成，耗时变成 4 倍（实测 436ms），不可取。耗时主要取决于路径数量，与面积关系不大，所以合并救不了卡顿。

## 发现 4：整张纹理的收益与约束

| 合成图宽 | Dots | Blocks | Braille | RGBA |
|---|---|---|---|---|
| 2200 | 118ms | 135ms | 257ms | 10MB |
| 4096 | 327ms | 360ms | 473ms | 36MB |

- 收益：栅格化移到后台线程，界面线程不再卡；改尺寸只是 GPU 缩放；内存 36MB，对比遮罩的 105–124MB。预览已用这条路径，Zoom 的 p95 从 260ms 降到 23ms（`../wallpaper-composition-redo/performance.md`）。
- 约束：
  - `image()` 不能用主题色着色，换主题要重建纹理（预览的 `previewImage` 已有这段逻辑）。
  - JS 拿不到“加载完成”回调，新图加载期间是空白。所以新图应叠在旧图上，旧图保留到新图出现后再移除。
  - Retina 上 2200 宽的 Home 是 4400 设备像素，4096 宽的纹理略软。
- 待验证：宿主只在监视到文件变化时调用 `invalidate_asset` 回收图片缓存（`src/window.rs:4863`），`.preview/`、`.tiles/` 都是隐藏目录。如果隐藏路径不触发回收，每次换主题或换画法生成的新路径纹理会一直留在内存里（每张约 36–64MB）。现有预览也可能有这个问题，需要在演示窗口里观察进程内存。

## 发现 5：点阵密度

`ROWS` 64/96/144/192，同一张 16:9 图（`evidence/sheet-density.jpg`）：

| 行数 | 列数 | Dots 图块 | Braille SVG 体积 | 转换耗时 |
|---|---|---|---|---|
| 64 | 228 | 135 | 0.6MB | 34ms |
| 96（现状） | 341 | 280 | 1.4MB | 65ms |
| 144 | 480（触顶） | 477 | 2.9MB | 127ms |
| 192 | 480（触顶） | 561 | 3.4MB | 145ms |

144 行起，眼睛、发丝等细节明显更多。但 `imageGrid` 的 480 列上限会让宽图的裁切变窄（16:9 在 144 行时画面比例变成 1.67:1），所以上限要同步放宽。另外，细密度的冷栅格化会到 572ms，必须先做第 2 项。

## 发现 6：EXIF 方向

构造一张原始像素横放、EXIF 方向为 8 的 JPEG：

- ImageMagick 能识别（`LeftBottom`，`-auto-orient` 后是 800×450）。
- `sips -g all` 里没有方向信息，`-z` 输出是横躺的（`evidence/exif-sideways.jpg`）。
- `osascript -l JavaScript scripts/orient.js` 通过 ImageIO 读出 `8`，耗时约 50ms。

修法：macOS 先读方向，再用 `sips -r`/`-f` 转正（方向 5–8 时宽高要对调后再算 `imagePlan`）；Linux 加 `-auto-orient`。

## 发现 7：内置画与上游动画

上游 `/tmp/asciicn-src/asciicn`（`d5592fc`）中：

- `lighthouse.tsx`：灯光微闪（`0.93 + 0.07·sin`）、星星闪烁、海浪涌动、云层漂移。
- `mountain-dusk.tsx`：星星闪烁、每 18 秒一次的流星、按深度分层漂移。
- `ember.tsx` 也有动画。

我们的内置画是这些 shader 在 `stillTime`（例如 6、12、14 秒）时的一帧。宿主动效只支持 `opacity/width/height/left/top`（`gpui-kit.d.ts:22009`），不支持变换或 shader。可行的做法是在不同 `stillTime` 下各导出一帧，按格子做差，自动找出“会变的格子”（星点、灯光）单独成层，再用 `.loop("opacity")` 驱动。这样不用手绘素材。前提是能在本地跑上游组件导出，这一点未验证。

## 对 t350 方案的修正

- “先改明暗层次”：方向对，但最大的问题是浅色主题整体反相，不是暗部细节。
- “正式壁纸用纹理先做小范围对照”：我上一轮说它的收益被高估，这个判断错了。稳态下确实没有收益，但切换和改高度时有 50–570ms 的同步卡顿，还有 100MB+ 的遮罩，这条值得做。
- “切换淡入是成本最低的动效”：在 SVG 图块路径下，淡入的第一帧照样卡；它依赖第 2 项。
- “局部动效需要单独制作素材”：可以从上游自动差分得到，不一定要手绘。

## 未验证

- 宿主内的真实帧时间与内存：本轮全部离线测量，没有在演示窗口里实测。
- 隐藏目录下的图片缓存是否回收（发现 4）。
- 浅色转换只调了透明度映射这一种；8 档分布、`autoLevels` 的配合没有调优。
- 上游组件能否在本地导出多帧（发现 7）。

## 复现

```sh
# 在仓库外的临时目录；metrics.py 按文件名到 ~/Pictures/<名>.png 找原图
R=$PWD; mkdir -p /tmp/wp/out && cp docs/research/wallpaper-optimization/scripts/* /tmp/wp && cd /tmp/wp
cp "$R/extras/mods/asciicn-wallpaper/ascii-art.js" art.js && patch art.js < art-variant.patch
bun pipe.mjs ~/Pictures/x.png dots out/x-dots.ans                 # ROWS=144 / INVERT=2 可选
bun render.mjs out/x-dots.ans ~/.config/herdr-app/themes/maple-light.json out/r-x-dots-maple-light.svg > out/r-x-dots-maple-light.json   # INVERT 须与 pipe 一致；加 MERGE=1 测合并
rsvg-convert -w 1600 out/r-x-dots-maple-light.svg -o out/r-x-dots-maple-light.png
python3 -P metrics.py out                                           # 读 out/r-*.png 与同名 .json
bun add @resvg/resvg-js && bun raster.mjs 2200 1300 x-dots import out/x-dots.ans
```
