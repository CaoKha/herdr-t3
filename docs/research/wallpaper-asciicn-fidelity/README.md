# Home 壁纸：与 asciicn Studio 的图片处理差异、可对齐清单与方案

调研日期：2026-11-13。asciicn 源码基线 `d5592fc980cad39578f13b16f6e015404160669b`（2026-11-09，MIT，`extras/mods/asciicn-wallpaper/LICENSE-asciicn`）。我们的管线基线 `ee935ef` + 当前工作树里 `ascii-art.js`（`VERSION=2`）。本轮只读调研：没有改实现、没有动原图和已导入的 `.ans`、没有在用户桌面或 Herdr 窗口里操作。

对比用图：`~/Pictures/146943457_p0.png`（2756×1654，当前壁纸 `file:146943457_p0` 的原图）。

## 结论

**为什么不一样（一句话）：我们的“Dots”不是网站图片源的任何一档；它是网站自带背景组件的方格半调，被改成了 2×2 采样、没有空档、格子是正方形。** 网站图片源的默认是 Classic 字符 ramp（`" .:-=+*#%@"`），它的 Halftone（dots）是“每格 1 个采样、5 档含空白、格子 4.5×9（非正方）”。同一张图的三处硬差异：

1. **字符集**：网站图片默认 Classic ramp；我们图片固定 Dots。网站选 Halftone 时才是 dots，且算法不同。
2. **Dots 的档位与空档**：我们 5 档按 `floor(tone*5)` 取，阈值 0.2/0.4/0.6/0.8，且 `tone>0` 就画点 → 这张图 **99.6% 的格子有墨**；网站按 `round(tone*4)` 取，阈值 0.125/0.375/0.625/0.875，0 档是空格 → 同一张图 **54.8% 有墨**。所以我们的画面“满、亮、糊成一片”，网站的“有留白、像网点印刷”。
3. **格子几何与密度**：我们每格 2×2 采样、格子正方（宽高比 1）、192 行；网站每格 1 个采样、格子 4.5×9（宽高比 0.5）、同一画面 96 行。同一张图，我们的平均墨量 0.19，网站 0.074（正方格子换算 0.149）。

另外两处次要差异：采样（我们是 sips 一次缩放取像素，网站是 cover 裁切到舞台比例 + 最多 4 倍超采样后按 k×k 块平均）、以及颜色（我们映射到主题 16 色 × 4 档不透明度，网站用原图真彩；后者是用户已确认的硬约束，不是缺陷）。

**能不能一致：形状、密度、明暗层次可以做到逐格一致**（用网站自己的 `mapTones` 跑同一张图，再交给我们的转换器，见第 4 节面板），前提是只做形状可画的字符集：**Dots、Braille、Blocks（shades）、Quadrants**。**Classic／Dense 等字体 ramp 做不到**：我们的 SVG 图块只画几何形状，ASCII 字母会退化成竖条（证据 `evidence/02-classic-ramp.png`、`06-dense-ramp.png`），要一致就得内置字形轮廓路径。

## 1. 证据与复现

- `evidence/00-source.png`：原图缩略，面板的参照。
- `evidence/01`…`08`：每种处理方式三联并排 —— **左：网站算法（真彩、字体/形状按网站绘制）｜中：我们现在（同一张图、当前 `.ans`、主题色）｜右：按网站算法改后的预期（主题色）**。
- `evidence/09-dots-detail.png`：Dots 的 1:1 细节，看清“横向短线 vs 满屏圆点”。
- 面板 PNG 按仓库约定不入库（`.gitignore` 的 `docs/research/**/*.png`：截图是某台机器的证据，与笔记放在一起但不提交）；`scripts/run.sh` 会把它们重建到 `evidence/`。
- `scripts/`：复现整条对比链路的脚本。`sh scripts/run.sh` 从原图重建全部面板；`scripts/vendor-asciicn.sh` 只把上游的纯函数模块复制出来并改写 import，不在 clone 里构建或运行任何东西。网站侧用的是它自己的 `lib/ascii/frame.ts`（`mapTones`）、`charsets.ts`、`palettes.ts`、`matrices.ts`，`autoLevels` 逐字复制（`scripts/auto-levels.ts`，注明出处）。

网站侧的采样用 Pillow/numpy 复刻 `sampleToField`：cover 裁切 → LANCZOS 缩到网格整数倍 → k×k 块平均 → 色调取块均色亮度。舞台取 1440×864（16:9 面板，宽高比 1.667 ≈ 原图 1.666，所以 cover 裁切为空）；格子 9 高、4.5 宽（网站 `cell=9`、`fontSize=cell/1.2=7.5`、SF Mono 前进宽度 0.6em）；网格 320×96。我们侧 320×192、正方格子 4.5×4.5，两面板都渲染成 1440×864。

## 2. asciicn 对一张图片做了什么

Studio 的“Image”源（`components/studio/sources.ts:261`）：`{ cell: 9, charset: "standard", colorMode: "truecolor" }`，其余取 `BASE_LOOK`（`components/studio/state.ts:86`）：`dither "none"`、`brightness 0`、`contrast 1`、`gamma 1`、`saturation 1`、`invert false`、`background "paper"`、无 fx、无 interaction；媒体设置 `levels: true`（`state.ts:138-141`，即每帧做 autoLevels）。

| 步骤 | 网站的做法 | 源码 |
| --- | --- | --- |
| 网格 | 舞台像素 ÷ 格子像素，向上取整；格子高 = `cell`（默认 9），宽 = `cell/1.2 × 字体前进宽度`（等宽字体 0.6em → 4.5），宽高比 0.5；**没有传 `square`**，所以图片的 dots 也是 4.5×9 | `lib/ascii/measure.ts:92-93,113`；`components/studio/renderers.tsx:517-527` |
| 采样 | cover 裁切到舞台比例（居中）、最多 4 倍超采样、每 k×k 像素块平均成一个采样：颜色取块均值，色调取该均值的亮度（`0.2126/0.7152/0.0722`）；每格采样数由字符集定：ramp `[1,1]`、quadrants `[2,2]`、braille `[2,4]` | `lib/ascii/sample.ts:200-262`；`lib/ascii/charsets.ts:135-207` |
| 色调 | 每帧 autoLevels：两端各裁 0.5% 后拉伸到 [0,1]，并夹到 1 | `lib/ascii/sample.ts:280-330`；`renderers.tsx:490` |
| 字形 | ramp：`floor(tone×(n−1)+0.5)`（有 dither 时用该格的阈值）；braille/quadrants：每个采样 `tone > 0.5` 点亮对应点；edge：3×3 Sobel | `lib/ascii/frame.ts:459-476`（ramp）、`391`（阈值）、`frame.ts` 的 `mapPacked` |
| 颜色 | 每格颜色 = 该格全部采样的颜色均值；`truecolor` 原样输出、`ansi16` 吸附到 VGA/xterm 16 色、`duotone` 走多段 ramp、`mono` 单墨色 | `lib/ascii/frame.ts:495-540`；`lib/ascii/palettes.ts:52-91,185-215` |
| 绘制 | Canvas2D + 共享字形图集：几何字形（dots/braille/blocks/quadrants/线框）按**单位格内的矢量形状**画，点的半径与线宽以“格宽”为单位；其余字形用字体，字号 = `cell/1.2` | `lib/ascii/glyphs.ts:1-14,159-180`；`lib/ascii/paint.ts`；`lib/ascii/grid.tsx` |
| 导出 `.ans` | `toAnsi`，真彩 `ESC[38;2;r;g;bm`，每行结尾 reset | `lib/ascii/export.ts:98-150` |

每个字符集的参数（`lib/ascii/charsets.ts`）：

| 字符集 | 字形 | 每格采样 | 档位 |
| --- | --- | --- | --- |
| `standard`（Classic，**图片默认**） | ` .:-=+*#%@` | 1×1 | 10 档 ramp |
| `dots`（Halftone） | ` ·∙•⦁●`（半径 0.07/0.13/0.24/0.33/0.42 格宽） | 1×1 | 5 档，0 档是空格 |
| `blocks`（ANSI blocks） | ` ░▒▓█`（2×4 子格方块） | 1×1 | 5 档 |
| `quadrants` | 16 个象限字形 | 2×2 | 4 点掩码 |
| `braille` | 256 个盲文 | 2×4 | 8 点掩码 |
| `dense` | 70 个字符 | 1×1 | 70 档 ramp |
| `cp437` / `petscii` / `katakana` | 各自字形 | 1×1 | ramp |
| `edge` | `- / \| \` + 内部 ramp | 1×1 | Sobel 阈值 0.22 |
| 自定义 ramp | 2–96 个字形 | 1×1 | 均匀分档 |

Studio 对图片还能改的：`cell` 4–28（`state.ts:107`）、`levels` 开关、`brightness/contrast/gamma/saturation`（`gradeTone`，`palettes.ts:185`）、`invert`、`dither`（`none`/`bayer2`/`bayer4`/`bayer8`/`blue-noise`，`matrices.ts:15`）、`colorMode`（`native`/`mono`/`truecolor`/`ansi16`/`duotone`，`state.ts:32`）、`ink`（`theme`/`p1`/`p3`/`ibm`/`blueprint`/`#rrggbb`）、`ansi` 表（`vga`/`xterm`）、`ramp`（10 套 duotone）、`background`（`paper`/`transparent`）、`fx`（scanlines/bloom/curvature/glitch/flicker/vignette，`state.ts:44`）、`interaction`（`none`/`repel`/`ripple`/`trail`，`lib/ascii/look.ts:65`）、`speed`。

**注意**：网站自带背景组件（Nebula、Lighthouse…）与图片源不是一套参数——它们用 `cell: 7`、`square`（方格）和 dots。我们的四张内置画正是这些组件的截图（`scripts/wallpaper.mjs` 注释：2317×959、`charset="dots"`、`cell={7}`、`square`、331×137 方格）。所以“网站效果”本身有两种：图片源的 4.5×9 短划线感，和背景组件的方格点。

## 3. 与我们的管线逐条对照

我们的图片导入：`main.js:266-318` → `sips`（或 ImageMagick）把原图缩到 `imageGrid` 的像素尺寸（`ascii-art.js:202`：96 格行、列数 16–480，每格 2×4 像素）→ `decodeBmp` → `imageAns(pixels, "dots")`（`ascii-art.js:289-318`）→ `convert` 成主题色 SVG 图块。

| # | 差异 | 我们 | 网站 | 分类 |
| --- | --- | --- | --- | --- |
| 1 | 图片默认字符集 | 固定 Dots | Classic ramp（`sources.ts:261`） | 算法偏差，应对齐 |
| 2 | Dots 的采样与档位 | 每格 2×2 采样取均值，`floor(tone*5)`，阈值 0.2 步进，`tone>0` 就画（没有空白档） | 每格 1 采样，`round(tone*4)`，阈值 0.125 步进，0 档空白 | 算法偏差，应对齐 |
| 3 | 格子宽高比 | dots 强制 1（`ascii-art.js:173`），192 行 | 0.5（4.5×9），96 行 | 算法偏差，应对齐（但见第 7 节决策） |
| 4 | 网格来源 | 固定 96 格行，列数按原图比例 | 舞台像素 ÷ 格子像素，随窗口变 | 算法偏差；壁纸侧按“构图裁切”处理更合适 |
| 5 | 采样质量 | sips/IM 一次缩放到网格（`-z` 拉伸填满，无 cover 裁切），逐像素 | cover 裁切 + ≤4 倍超采样 + k×k 块平均 | 算法偏差，可对齐（sips 缩放 + 我们自己块平均） |
| 6 | autoLevels 的统计对象 | 缩略图像素的逐像素亮度 | 每格采样颜色的亮度，结果夹到 [0,1] | 算法偏差，细节 |
| 7 | 我们的 “blocks” 语义 | 2×4 采样 → 2×2 象限掩码（其实是 quadrants） | `blocks` = `░▒▓█` 密度档 | 算法偏差，应对齐（补 shades 与真正的 quadrants） |
| 8 | 字体 ramp 字形 | `inked()` 竖条近似（`ascii-art.js:65-68`） | 字体字形 | **宿主限制**：SVG 图块不画文字 |
| 9 | 颜色 | 16 主题色槽 × 4 档不透明度；6 个色相桶 + 灰→foreground | 原图真彩（`truecolor`），或 16 色吸附 | **刻意设计**（用户已定：颜色必须跟随主题） |
| 10 | 主题切换 | 图块是单色遮罩，主题变了立刻跟着变 | 无此概念 | 刻意设计，且是对齐时的约束 |
| 11 | dither | 无 | 可选 4 种阈值矩阵 | 未实现（可做） |
| 12 | 动画/fx/交互 | 无（静态 SVG） | 动画 canvas + CSS 覆盖层 | **宿主限制**（静态壁纸） |
| 13 | 渲染方式 | 按 (颜色, 档位) 分层切 40 格高的 SVG 图块 | 一块 canvas | 宿主限制（1 MiB 单次写入、按图块内存） |
| 14 | 舞台裁切时机 | 保存整张图，显示时 cover/contain 裁切（t34d 构图） | 采样时就把舞台比例裁掉 | 设计取舍：构图在显示侧做更好，采样按原图比例 |

## 4. 同一张图的实测

数字（同一张图、同一 1440×864 画面）：

| | 我们（现在） | 网站 dots | 网站 dots，换算正方格 |
| --- | --- | --- | --- |
| 格子 | 320×192（正方 4.5×4.5） | 320×96（4.5×9） | 320×96 |
| 有墨的格子 | 99.6% | 54.8% | 54.8% |
| 平均墨量（覆盖面积/总面积） | 0.191 | 0.074 | 0.149 |
| 字形分布 | `·`28737 `●`11513 `⦁`10908 `•`5156 `∙`4907 空格 219 | `·`1587 `∙`2074 `•`4689 `⦁`5250 `●`3222 空格 13898 | 同左 |

网站帧经我们的转换器后的规模（主题色、`aspect=0.5`、TILE=40）：

| 字符集 | `.ans` | 图块 | SVG 合计 | 最大图块 |
| --- | --- | --- | --- | --- |
| dots | 312 KB | 79 | 144 KB | 17 KB |
| standard | 329 KB | 86 | 372 KB | 37 KB |
| blocks | 309 KB | 73 | 1.67 MB | 284 KB |
| quadrants | 265 KB | 67 | 319 KB | 47 KB |
| braille | 270 KB | 69 | 857 KB | 136 KB |
| dense | 339 KB | 87 | 606 KB | 57 KB |

对照：我们现在的 `146943457_p0.ans` 是 763 KB、237 图块、SVG 411 KB、最大图块 9.8 KB（缓存目录 1.2 MB）。对齐后 Dots 的帧只有一半行数，缓存也更小；`blocks`（阴影块）的 SVG 最大图块 284 KB，仍在宿主 1 MiB 单次写入以内。

面板读法：左=网站算法原色，中=我们现在，右=网站算法 + 主题色。

- `01-dots.png`、`09-dots-detail.png`：Dots。网站是“留白 + 网点”，格子里是横向短划；我们是“满屏圆点、更亮更糊”。
- `02-classic-ramp.png`：网站图片默认。我们的渲染器把 `. : - = + * # % @` 画成竖条，所以右侧只是“形状对、字形不对”的证据。
- `03-braille.png`：我们的 Braille 算法本来就接近网站（2×4、阈值 0.5），主要差在采样、行数和色调统计；对齐后形态基本一致。
- `04-blocks-shades.png`：网站 `░▒▓█`；我们的转换器能画阴影块，但生成器没这一档。
- `05-quadrants.png`：网站 2×2 象限；我们只有“blocks”名字下的一套象限算法。
- `06-dense-ramp.png`、`07-classic-bayer4.png`：ramp 与 dither，同样卡在字形。
- `08-theme-colour-steps.png`：主题色映射。四联：网站原色｜现在（4 档、按亮度）｜对齐几何 + 4 档｜对齐几何 + 8 档按明度。这张图里 8 档把层次拉开了（现在 16822 个有墨格子里有 13783 个落在最高档，4 档几乎退化成 1–2 档）。

## 5. 全部处理方式清单与纳入判断

判断依据：静态 SVG 图块渲染（只有几何形状，没有字体）、宿主单次 1 MiB 文本写入、按图块内存、颜色必须来自主题。

| Studio 的处理方式 | 建议 | 理由 |
| --- | --- | --- |
| charset `dots`（Halftone） | **纳入（默认）** | 形状已有（点半径与网站一致），补 1×1 采样与 5 档含空白即可；`01`/`09` |
| charset `braille` | **纳入** | 已有算法与形状，只需对齐网格/采样；`03` |
| charset `blocks`（`░▒▓█`） | **纳入** | 阴影块形状已有，缺生成分支；SVG 体积最大（284 KB/图块）仍安全；`04` |
| charset `quadrants` | **纳入** | 16 个象限形状已有，缺生成分支；`05` |
| charset `standard`（Classic） | 可做但不建议 | 需要 ASCII 字形轮廓；现在只能画成竖条（`02`）。真要做：构建期把 10 个字形的轮廓路径写进 `ascii-art.js`（体积小，但要解决字体授权与字形风格），或验证宿主 SVG 是否支持 `<text>`/内嵌字体 |
| charset `dense`（70 字形） | 可做但不建议 | 同 Classic，且 70 个轮廓更大；`06` |
| charset `cp437` / `petscii` / `katakana` | 做不到 | 全部依赖字体字形 |
| charset `edge`（Sobel） | 可做但不建议 | 方向字形 `- / \| \` 我们有线条，但内部 ramp 需要字体；静态壁纸上边缘检测容易显得脏 |
| 自定义 ramp | 做不到 | 同字体问题 |
| `cell` 4–28 | 不做 | 壁纸的格子大小由布局缩放决定，用户改它没有可见收益 |
| `levels` 开关 | 可做，保持常开 | 网站图片默认开；关掉会让低对比图变成一片空白 |
| `brightness`/`contrast`/`gamma`/`saturation` | 可做但不建议暴露 | 生成阶段各一行；但壁纸只需要一个“像网站”的结果，多三个滑杆不值 |
| `invert` | 可做但不建议 | 主题色下“反相”语义混乱，且和留白策略冲突 |
| `dither`（bayer2/4/8、blue-noise） | 可做但不建议默认 | 逐格阈值，几十行；Dots 本身就是网点，再叠 dither 只会更碎；Classic 的渐变需要它，但 Classic 做不到；`07` |
| `colorMode mono`（theme） | 部分纳入 | 主题色约束下就是“全 foreground”，可作为一档“单色”样式（不需要新代码，生成时写 `ESC[39m` 即可） |
| `colorMode mono`（phosphor/`#rrggbb`） | 做不到 | 与“颜色跟随主题”冲突；最近做法是 foreground |
| `colorMode truecolor` | 做不到（原色） | 最近做法 = 我们现在的“主题 16 色 × N 档不透明度”，可把 4 档提到 8 档、按明度取档（`08`） |
| `colorMode ansi16`（vga/xterm） | **建议纳入为映射规则** | 网站这档本身就是“吸附到 16 色”，与主题 ANSI16 天然对应：把每格吸附到 16 个槽位（VGA 表作为与调色板无关的参照），主题负责实际颜色；比现在的 6 色相桶更接近网站的层次 |
| `colorMode duotone`（10 套 ramp） | 可做但不建议 | 只能映射到两个主题色 + 档位，信息量与 foreground+档位重复 |
| `colorMode palette`/`native` | 不适用 | 媒体源没有自己的调色板 |
| `background paper`/`transparent` | 不做 | 我们本来就透明铺在 Home 背景上 |
| `fx`（scanlines/bloom/curvature/glitch/flicker/vignette） | 做不到 | 动画/像素级后处理；静态版可画一层覆盖图，但属于装饰，不是“网站的处理效果” |
| `interaction`（repel/ripple/trail） | 做不到 | 需要指针与逐帧重绘 |
| `speed`/动画、video/webcam/text 源 | 做不到 | 壁纸是静态图片 |
| 导出 `.txt`/`.svg`/`.png`/视频 | 不做 | 我们只吃 `.ans` |

## 6. 对齐方案

### A. 算法对齐（`extras/mods/asciicn-wallpaper/ascii-art.js`）

1. `imageGrid(width, height, grid = [1, 1])`：改成“96 **格**行”，列数 = `clamp(16, 480, round(2 × 96 × 宽/高))`，返回的采样尺寸 = 格数 × `grid`。dots/blocks/standard 是 1×1（320×96 采样），quadrants 2×2（640×192），braille 2×4（640×384）。约 6 行。
2. `imageAns(pixels, style)`：按网站规则重写三个分支（braille 分支不动，只吃新网格）：
   - 公共档位 `level = Math.min(n-1, Math.max(0, Math.floor(tone*(n-1)+0.5)))`，`tone` 用 autoLevels 后夹到 [0,1] 的值；
   - `dots`：1×1，`" ·∙•⦁●"[level]`，颜色 = 该采样颜色；
   - `blocks`：1×1，`" ░▒▓█"[level]`；
   - `quadrants`：2×2，每采样 `tone > 0.5` 置位；
   - `braille`：2×4，不变。
   约 40–60 行（现在 dots/blocks 分支约 25 行）。
3. `convert(text, aspect)`：**不改推断**（见下面的迁移问题），由 `main.js` 显式传 `0.5`；`scripts/wallpaper.mjs` 本来就显式传。
4. 可选：`tintOf` + `STEPS` 改 8 档、按明度取档（`08`）。约 15 行。
5. `VERSION` 2 → 3（只要第 2 步或第 4 步落地）。

`main.js`：`imageGrid(w, h, GRIDS[style])`、`imageAns(pixels, style)`、`convert(text, 0.5)`；约 10 行。

**迁移陷阱**：现在两张已导入的 `.ans` 是旧生成器产出的**方格** dots 帧（320×192）。如果改 `convert` 的推断（“全是半调点 → 0.5”），它们会被横向压扁 2 倍。所以要么保持推断不动、由调用方传 aspect；要么把 cell aspect 记进构图记录（t34d 正在重写那份存储，加 `cellAspect` 更干净）。推荐前者：旧导入不变，新导入正确，用户想换效果就重新导入一次原图（原图在 `~/Pictures`，我们没有保存原图副本）。

### B. 模式选择放进构图预览（与 t34d 的衔接）

- **位置**：`previewCard`（`main.js:504-531`，300 宽、现在 312 高）最上面加一行 28px 的字符集分段控件（Dots／Braille／Blocks／Quadrants），样式沿用现有 Fill／Fit 那套 `h(28) p(2) gap(2) rounded(8) bg(raised)`；卡片高度 312 → 352。四行（字符集／铺放／缩放／状态）都是常驻行，所以 **C 节“控件按钮在各状态下位置固定”** 成立：`Reset/Cancel/Apply` 与 Fill/Fit 的偏移不随状态变化。
- **复用 t34d 的流程**：切换字符集只改草稿，不发布文件。需要保留草稿的解码像素（`draft.pixels`，640×384 RGBA ≈ 1 MB），切换时重新 `imageAns(pixels, style)` + 在草稿目录重画图块；沿用现有草稿 id + 一个“代次”计数器让迟到的转换作废（现有 `previewRequest`/`draft` 身份机制已够）。Apply 仍然只提交最终 `.ans` 与构图。
- **`.ans` 导入**：字符集由文件决定，这一行保留槽位但禁用，并用现有 tooltip 说明“文件已固定字形”，避免按钮位移。
- **图标**：t34d 正在删除 `icons/style-{braille,blocks,dots}.svg`。要么保留这三张并补 `style-quadrants.svg`，要么这一行用文字标签。需要 t34d 与本次改动排一次先后（先落 t34d，再加这一行）。
- **键盘**：把四个按钮加进预览的焦点组，方向键切换，沿用现有 focus helper。

预计：`main.js` +60~80 行（控件、状态、重生成、焦点），`ascii-art.js` +60~80 行，`check-ascii-art.cjs` +40~60 行（每档阈值、空格档、网格、aspect），`check.cjs` +30~50 行（切换、迟到结果、`.ans` 禁用行）。

### 影响面

- **缓存**：`VERSION` 提升后，两张已导入的壁纸各自重转一次（`convert` 重新跑，`cksum-VERSION` 失配）。`.ans` 本身不会被重写；想拿到新算法必须重新导入原图。
- **内置四张画**：它们的 `.svg` 图块是提交在仓库里的（`extras/mods/asciicn-wallpaper/scenes/`，1.7 MB），由 `scripts/wallpaper.mjs` 从**仓库外**的 asciicn 帧生成。第 2 步只影响新导入，内置画不变；如果第 4 步（8 档）落地，内置画仍是 4 档——视觉上新旧会有细微差别，重新生成需要那四份原始 `.ans`（当前不在仓库里）。
- **写入上限**：最大图块 284 KB（blocks），低于 1 MiB；`TILE=40` 不需要改。
- **验证**：`check-ascii-art.cjs`（档位阈值、空格档、网格、aspect、颜色）、`check.cjs`（切换、Apply/Cancel、迟到结果、`.ans` 禁用）、`scripts/sync.sh` + `scripts/check.sh` 到 `all checks passed`，最后在演示窗口按默认侧栏宽度整窗截图（四种字符集各一张）。本轮没有跑 GUI。

## 7. 需要用户拍板

1. **Dots 用哪种格子**：网站**图片源**是 4.5×9（横向短划线感，`09` 左）；网站**自带背景组件**是方格（我们的内置画）。建议：图片导入按 4.5×9，内置画保持方格。若你更喜欢方格点，就保留现在的比例、只对齐档位与采样。
2. **上哪几档**：只对齐 Dots；还是 Dots + Braille + Blocks + Quadrants（建议后者，都是形状可画的，代码量最小）。
3. **Classic/Dense 要不要以后做**：需要内置 ASCII 字形轮廓（授权 + 体积），或者验证宿主 SVG 支持字体。建议先不做，报告里留作后续。
4. **不透明度档位**：4 档 → 8 档（按明度取档，`08` 第四联）。会改 `tintOf`，内置画保持旧观感，是否接受。
5. **色相映射**：是否把“6 个色相桶”换成“吸附到 16 个 ANSI 槽（以 VGA 表为与主题无关的参照）”——更接近网站的 ansi16 模式，主题负责实际颜色。
6. **旧导入**：两张已导入壁纸保持现状、需要重新导入原图才有新效果，是否接受（我们没有保存原图副本）。
7. **`.ans` 导入时字符集行禁用**（保留槽位）是否符合预期。

## 8. 未验证 / 边界

- 没有在演示窗口或用户的 Herdr 里跑过：面板是离线渲染的证据，不是宿主截图。
- 网站侧采样用 LANCZOS 近似浏览器的 `imageSmoothingQuality: "high"`；舞台取 1440×864，真实 Studio 的舞台尺寸取决于窗口与侧栏，网格行列数会随之变化（格子像素不变）。
- 字体按 SF Mono（0.6em 前进宽度）计算；网站字体栈是 `ui-monospace, "SF Mono", …`。极小的点（直径 < 4 px）在网站上由图集用方块近似（`lib/ascii/atlas.ts:158`），我们的面板一律画圆，细节可能略有出入。
- 用户当时在 Studio 里用的字符集与参数未知；本轮按“默认 + 逐个字符集”对比。
- 没有验证宿主 SVG 是否支持 `<text>`/内嵌字体（这是 Classic ramp 能否做的关键前提）。
- 没有验证 8 档映射在浅色主题（`maple-light`）下的观感；面板只用 `maple-dark`。
