# 重写审查：asciicn 壁纸（2026-11-14）

范围：`2130051e f8021375 28425912 d3b300af 3e3f4f21 d45de403 46f38c1b a6c09d9d 9c8e84f5`，代码 `extras/mods/asciicn-wallpaper/`（`button.js`／`focus.js`／`tip.js`／`store.js` 与 `shared/` 一致，只作为共享模块看待），以及 `docs/research/wallpaper-*`。基线 `origin/main=9a9fd18c`，HEAD `524ef4a6`。只读审查，没有改代码，也没有运行 `scripts/sync.sh`。

## 1. 结论

**`main.js` 和它的三份行为检查要整块重写；`ascii-art.js` 的转换核心保留，只做局部修。**

理由：转换算法已经和上游 `mapTones` 逐格对齐，有 oracle fixture 锁住行为，这部分值得保留。`main.js` 有 714 行，一个类同时管文件 IO、转换任务登记、草稿状态机和界面，还在 render 里起异步任务。预览和已保存的壁纸各走一条渲染路径，浅色主题又多出一套图块。这一轮的功能都是一层层补丁叠在这个类上。测试锁的是 shell 命令字符串和样式参数字面值，所以没拦住"重新取景时显示错误文案"这类可见错误。

## 2. 问题清单（按严重度）

### 高

**H1. 预览和已保存壁纸是两条渲染路径；已保存壁纸仍然在绘制帧里同步栅格化全部 SVG 图块**
- 位置：`main.js:154-184`（预览：把各图块拼成一张 4096px SVG，交给 `image()`）；`main.js:562-567`（已保存：逐图块 `svg()`，浅色主题再换成 `scene.paper`）。
- 现象：拖动和缩放在预览里很流畅（`3e3f4f21` 把 Zoom 的 p95 从 260ms 降到 23ms）。但 Apply 之后、切换壁纸、窗口变高的时候，仍然整帧同步栅格化 100–280 个图块。
- 为什么错：需求 C3 写的是"预览和应用后的显示使用相同计算"。现在几何一致，但渲染管线不同：预览会在极大 Zoom 时变软，合成方式也不同。研究给出的头号性能问题没有处理，反而又加了一条渲染路径和一套 `paper-*.svg`。
- 证据：`docs/research/wallpaper-optimization/README.md` 发现 2：切换或改高度时冷栅格化 50–570ms，遮罩 105–124MB。建议的第二批 "2 → 5"（正式壁纸改成纹理）没有做；第一批 1/3/4 做了，但都叠在旧路径上。

**H2. 重新取景（crop）一张图片导入的壁纸时，模式行提示 "Studio files keep their fixed characters"**
- 位置：`main.js:580-581` 以 `ans=true` 调用 `startPreview`，所以 `d.pixels` 是空的；`main.js:651`、`main.js:663` 按 `d.pixels` 是否为空，选用 Studio 那句提示。
- 现象：用户自己的照片（v4 Dots/Braille 等）点 crop 后，模式行置灰，无障碍标签和 tooltip 都说"Studio 文件保持固定字形"。
- 为什么错：这张画不是 Studio 文件。用户文档写的是"Its mode can't change; reimport the original"，界面文案和行为说明对不上。
- 证据：代码路径确定（`check.cjs:370` 只断言能打开，没检查文案）。没有在演示窗截图，因为没有不用鼠标驱动 crop 的入口，见第 4 节。

**H3. 重新取景会把已缓存的画再完整转换一遍**
- 位置：`main.js:580-581` → `startPreview` → `main.js:371` `drawTiles(text, draft.dir, …, true)`，正反两套图块都重写到草稿目录，然后再合成预览纹理。
- 为什么错：`.tiles/<name>/` 里已经有同一份 `.ans` 的图块和 `scene.json`，内容一模一样。一张 96×341 的 Dots 图有约 275 个图块（离线实测 `tiles:275`），浅色版再加约 230 个。只为改构图，就要多等一次转换，多写约 500 个文件。

### 中

**M1. 浅色"纸面"效果有限，而且这次提交没有任何演示窗证据**
- 位置：`ascii-art.js:383-392`（`PAPER` 取反字形）、`ascii-art.js:125-138`（按暗度取色阶）、`main.js:126-151`（第二套图块）。
- 现象：离线用当前 `ascii-art.js` 渲染 `~/Pictures/120672551_p0.png`。深色区域在纸面上变成带白缝的大点，再配上最近的 VGA 槽（多半是 `ansi4`，在 t3-code-light 里是 `#0451a5`），整体呈中灰或浅蓝，明暗方向对了但层次很浅。证据：`wallpaper-paper-offline.png`（第 1 行：dark 原样 / light 原样；第 2 行：t3-code-light 纸面 / maple-light 纸面；第 3 行：Braille 的 dark / 纸面），`wallpaper-paper-crop.png`（同一角落，左 dark、右纸面）。研究自己的数字也说明了这一点：maple-light 纸面 Dots 跨度 0.109，深色是 0.20–0.74。
- 为什么错：`9c8e84f5` 一次提交了纸面、EXIF 和重新取景三项功能，没有新增 `docs/research` 证据，也没有演示窗截图，违反仓库 AGENTS「Finishing a change」第 4 条。旧导入和内置画在浅色主题下仍然是底片。
- 结论：方向保留。实现方式（第二套落盘图块）建议随 H1 改成"按主题合成时取反"，做法见第 3 节。

**M2. 「零漂移」被理解得过于字面，换来很差的 UI**
- 位置：`main.js:703-710` 添加卡的 Studio 指引区，`main.js:661` 预览卡固定 `h(352)`，状态区固定 `h(60)`、内容放不下时滚动。
- 现象：指引折叠时也常驻一个禁用的 **Open asciicn Studio ↗**、一句占位文字 "Expand the Studio guide for instructions."，以及约 92px 空白。证据：`wallpaper-guide-collapsed.png`（复制自 `wallpaper-controls-validation/after-dark-guide-collapsed.png`，`guideCard` 从 `2130051e` 起只改过宽度，截图仍代表当前版本）。长错误挤在 60px 的滚动框里。
- 为什么错：需求要的是"其他按钮不被挤动"，不是"所有内容都预留空槽"。另外，"Create in asciicn Studio…" 按下去并不打开 Studio，而是展开指引；下面另有一个禁用的 "Open asciicn Studio"，两个按钮语义重叠。

**M3. 测试锁的是实现，不是行为**
- `check-layout.cjs:72-93` 用 Proxy 记录样式调用的参数，再断言 `right(12)`、`h(352)`、`w(160|87)` 这些和代码里一模一样的常量。这是同义反复：改一个数，测试和代码就要一起改，但它测不出真实绘制后是否重叠或越界。
- `check.cjs:48-97` 假的 `exec` 按 shell 文本前缀分支（`s.startsWith("for f")`、`"cksum <"`、`'wc -c'`）。`convert` 和 `imageAns` 也是假的，用 `"◐"` 代表"有纸面"。`check.cjs:351-360` 把 EXIF 的 `sips` 完整参数写死。只要重写一条 shell 管道，这些断言就会失败，而行为其实没变。H2 这种文案错误它也测不出来。
- 值得保留的是 `check-ascii-art.cjs` 加 `fixtures/image-v3-map-tones.json`：它用独立 oracle 逐格对比上游结果，锁的是行为。

**M4. `main.js` 一个类承担四份职责，状态旗标层层叠加**
- 模块级全局变量：`converting`、`applying`、`placementsVersion`、`previewsReady`（`main.js:39-45`）。草稿上的旗标有 `busy`、`applying`、`error`、`saveError`、`repainting`、`imageSerial`、`generation`、`conversion`，视图上还有 `previewRequest`。
- `render()` 在 `main.js:536-551` 发现主题调色板变了，就 `timer.after(0)` 再 `spawn` 去重建预览纹理，等于在绘制里产生副作用。
- 文件 IO 用十几段 `sh -c` 拼接（`main.js:189-209`、`main.js:280-305`、`main.js:355-366`）。
- 为什么是问题：每修一个竞态就多一个旗标，`docs/internals/storage.md:27-33` 写了五段规则来描述这些旗标之间的关系。重写时应该收成一个有显式状态的草稿对象，加上一个文件库对象，见第 3 节。

**M5. 文档太长，夹带实现细节，且有过期内容**
- 用户文档 `docs/user/extras.md` 的壁纸段和两份 CHANGELOG 写了 "decoded source"、"yields during generation and drops stale work"、"VGA-reference ANSI16 slot"、"cached preview image" 等实现细节，按 AGENTS 应移到 `docs/internals/`。
- `RECIPE.md` 现在 59,989 字节（上限 60,000）。壁纸段被压成电报体，比如 "shrink after250ms"、"Bottom-right368×104 reveals switcher inset12/chrome/r8"，已经难以作为可读的重建说明。
- 过期内容：`docs/research/herdr-experience-requirements.md:278` 仍写"首版不含…保存后重新编辑"，但 crop 重新取景已经上线；`docs/research/home-wallpaper-understanding.md:84` 仍写"EXIF 旋转不处理"。

### 低

- **L1. 共享键绕开了 `store.js`**：`main.js:32` 自己定义 `asciicn-wallpaper.scene` 和新增的 `.placements`。`store.js` 已同步进本 mod，却没被导入，违反它开头 "Code names a key only through here" 的约定。
- **L2. 死代码**：`ascii-art.js:367-370` 的 `brailleAns` 只有检查在用。`imageGrid` 的默认参数 `style = "braille"` 只服务于 `imagePlan` 不传 style 的调用。
- **L3. 浅色判定和文档不一致**：`main.js:64-67` 在 gamma 编码的 hex 上算 luma，阈值 127.5；`layout-implementation.md:61` 写的是"相对亮度 > 0.5"。遇到 3 位短 hex 会解析错（`#fff` 会被判成深色）。目前已装主题都是 6 位 hex，所以只是潜在风险。
- **L4. EXIF 转正会先把整张原图写成 BMP**（`main.js:389-396`）：一张 4800 万像素的照片约是 145MB 的临时文件，之后才裁切。研究里建议用 `sips -r/-f` 加交换宽高；这里没有测过大图的耗时。
- **L5. 预览纹理可能不被释放（未验证）**：每次切模式或换主题都会生成一个新路径 `image-${serial}.svg`（`main.js:157`），每张 4096px 纹理约 36–64MB。研究发现 4 指出，宿主可能不会回收隐藏目录下的图片资源；这一点从没在演示窗里测过内存。

### 研究证据文件（docs/research/wallpaper-*）

本轮新增 339 个文件，约 2.07MB：

| 目录 | 新增 | 其中 json/jsonl/log/jpg | 建议 |
| --- | --- | --- | --- |
| `wallpaper-composition-redo` | 222 | 217（`*-driver.json`／`*-state.json`／红绿 log、`native.jsonl` 149KB） | 只留 `README.md`、`performance.md`，其余删除 |
| `wallpaper-image-alignment` | 76 | 69（`final-*.json`、`button-positions.json`、各种 log） | 只留 `README.md`；`review.md` 合并进 README 后删除 |
| `wallpaper-controls-validation` | 11 | 9（`positions.json` 等） | 只留 `README.md`；测量脚本对重写没用 |
| `wallpaper-optimization` | 18 | 8，含 4 张 JPG 共约 1MB | 留 `README.md`。JPG 绕过了 `.gitignore` 里的 `docs/research/**/*.png` 规则，应删除 |
| `wallpaper-asciicn-fidelity` | 12 | 0（11 个脚本） | 留 `README.md`。`vendor-asciicn.sh` 和 `auto-levels.ts` 被 `fixtures/generate-image-v3.ts:2` 引用，应移到 mod 的 `fixtures/`，其余脚本删除 |

这些原始 dump 记录的是旧实现的中间状态（红绿日志、驱动快照），重写后就失效了。结论在各目录的 README 里已经写清楚。

## 3. 重写方案

### 目标行为（保持不变的部分）

需求 C1–C4，以及 `storage.md` 里已经定下的这些不变量：
- 图片默认 Dots，可切四种模式；Studio `.ans` 保留原字形。
- 导入时可用 Fill/Fit、拖动或方向键、1–4× 缩放和 Reset 调整构图；Apply 后构图固定。
- 原子发布且不覆盖已有文件；删除需要按文件名确认。
- 迟到的任务不能覆盖新的选择，也不能让已删除的壁纸复活。
- 构图存为相对参数，与缓存分离。
- 旧 `.ans` 和内置画的哈希不变。

### 模块边界

| 模块 | 职责 | 备注 |
| --- | --- | --- |
| `ascii-art.js`（保留） | 纯转换：`.ans` → 形状；图片像素 → `.ans` | 删除 `brailleAns`。纸面改为在 `convert` 时传入取反，不落第二套文件 |
| `picture.js`（新） | `(scene 形状, theme) → 一张合成 SVG 纹理路径`，按调色板哈希缓存 | 预览和已保存壁纸都走这一条路径，替换 `previewImage` 和逐图块 `svg()`。主题变化在 `on_size_change`／主题回调之外的 effect 里触发，不放在 render 里 |
| `library.js`（新） | 扫描文件夹、管理 `.tiles` 缓存、原子保存、删除、构图表 | 键改从 `store.js` 的 `KEY` 取。shell 管道集中在这里，测试在函数边界用真实临时目录（沿用 `check-filesystem.cjs` 的做法） |
| `draft.js`（新） | 一个草稿对象：`state ∈ loading/ready/converting/applying/failed`，加一个 generation token | 把 `busy`/`applying`/`error`/`saveError`/`repainting`/`previewRequest` 收成单一状态。重新取景直接用 `library` 里已有的 scene，不再转换 |
| `source.js`（新） | 文件选择框、EXIF、sips/convert、分块读 BMP | 只负责宿主 IO |
| `main.js` | 只负责 View：切换器、添加卡、预览卡、画布 | 复用 `shared/button.js`、`focus.js`（`stop`/`enter`）、`tip.js`、`store.js`，以及 gpui-base 的 `Slider` |

### 可删除

- `check-layout.cjs` 整个删除。按钮零漂移改用演示窗截图测量，加一条小检查：在固定宽度下，预览卡和切换器的边界盒不重叠。
- `check.cjs` 按 `draft.js`／`library.js` 的行为重写：去掉按 shell 前缀匹配的假 exec，生命周期竞态改在真实临时目录里回放。
- 磁盘上的第二套 `paper-*.svg`、`imageSerial`/`repainting` 等草稿旗标、render 里的副作用、`brailleAns`。
- 用户文档和 CHANGELOG 里的实现细节；`RECIPE` 壁纸段按新结构重写，具体数值改为链接到 `t3-tokens`。
- 上表列出的研究 dump。

### 风险

- 已保存壁纸改用纹理后，没有加载完成回调，可能闪空白：需要新纹理叠在旧纹理上，等新的出现后再移除旧的（研究发现 4）。Retina 大窗口下，4096px 纹理会略软。
- 换主题必须重建纹理，正好是 L5 说的内存问题，必须先在演示窗测内存。
- 不能破坏旧 v3 `.ans` 和内置画的哈希，`check-filesystem.cjs` 里已有的 SHA 检查要保留。

### 需用户拍板

1. **已保存壁纸是否改用纹理**（建议：是）。这样两条渲染路径合成一条，同时解决卡顿和纸面落盘问题；代价是首帧可能空白、高 DPI 下略软。
2. **纸面方案**：继续"取反字形 + 按暗度取色阶"，但改成合成时计算；还是接受浅色主题下层次较浅的现状？另外，旧导入和内置画在浅色主题下是否也要处理？
3. **Studio 指引怎么做"零漂移"**：允许卡片内展开、只保证展开区下方的按钮不动；或者把指引做成独立弹层（建议）。哪种都去掉禁用的占位按钮。
4. **重新取景是否保留**：需求 C4 原本写"首版不含保存后重新编辑"，crop 是研究建议 #4 加进来的。保留的话，修 H2、H3。
5. **研究证据的留存规则**：建议只留 README 结论和可复现所需的脚本，原始 dump 不入库（JPG 也按 PNG 处理）。

## 4. 未检查项

- 没有起演示窗。`stage.sh` 的窗口只能用 `herdr-app do` 驱动，而它没有发按键或点击 mod 按钮的命令；选图要用原生选择框，crop 要点按钮。不注入探针改装 mod 的话，没法到达预览、纸面或 crop 状态。所以 H2、M1 的界面表现没有截图，M1 用的是离线渲染：`wallpaper-optimization/scripts/pipe.mjs` 生成 `.ans`，按 `render.mjs` 的方式合成并调用 `convert(text, undefined, true)`，再用 `rsvg-convert` 出 PNG。临时脚本已清理。
- 没有真实鼠标拖动或缩放，没有测 Linux/Windows，也没有测 EXIF 大图（L4）的耗时和预览纹理内存（L5）。
- 四种模式和上游 `mapTones` 的逐格一致性沿用已有 oracle 检查：本地运行 `node check-ascii-art.cjs` 等四份检查全部通过，但没有重新生成 oracle。
- 没有对照 T3 源码核对预览卡的 token。卡片沿用 `button.js` 的 T3 尺寸，是否符合 T3 popover 结构没有逐项比对。

## 跨范围

- `RECIPE.md` 已到 59,989/60,000 字节，任何新功能都写不进去了，需要整体瘦身，不只是壁纸段。
- `shared/button.js` 新增的 `split()` 被同步进壁纸 mod，但壁纸没用它；这是同步脚本整份复制的结果，不是本范围的问题。
