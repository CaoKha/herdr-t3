# Herdr T3 可选扩展

[English](extras.md) · 中文

不属于布局本身，安装时也不会被复制；需要的话手动添加。

## pulls.review

`extras/mods/pulls-review` 和 `extras/mods/review` 为 space 面板添加 Review，使用[我的 pulls.review fork](https://github.com/JinJieBeWater/pulls.review/tree/multi-repo)（`jin.review`）。安装两个 mod，`scripts/update.sh` 加入 review 渲染位。在 Herdr T3 用 + → Review 或 `cmd-shift-g` 打开唯一可关闭标签，无需额外 Review 栏；旧纯开关栏自动收成零宽。切换保留范围／组／文件／阅读位置，关闭重加回默认范围。在页内工具栏选择 Changes、Uncommitted、To push／To pull、Commits 或 Branches，与 Files 独立；树有已看框但无右键菜单。Herdr 自带布局里的 Review 栏仍用数量打开所选 diff。阅读操作和资源边界见[指南](guide.zh-CN.md)。

Review 跟随你的主题，包括 Graphite 等主题里带透明度的复选框颜色。吸顶文件头保留不透明底色，滚动的代码不会透出并和文件名重叠。

## 给 Pi 用的主题导出

`extras/mods/t3-theme-export` 是 [pi-herdr-theme](https://github.com/JinJieBeWater/pi-stuff/tree/main/packages/pi-herdr-theme) 在 Herdr 这一侧的部分。pi-herdr-theme 是[我的 Pi 配置](https://github.com/JinJieBeWater/pi-stuff)里的一个 Pi 扩展，让 Pi 的配色跟着 Herdr 走。这个 mod 没有界面：Herdr 实际显示的颜色一变（设置页点选、布局主题、系统明暗、内置预设都算），它就把 `{ "name", "colors" }` 写到 `~/.cache/herdr-app-theme.json`；扩展监听这个文件，重新生成 Pi 主题。两边都要装：把目录复制进 `~/.config/herdr-app/mods/`，再让你的 Herdr agent 在这个布局的 `work` 列末尾加一次 `{ "id": "theme-export", "type": "block", "size": { "px": 0 }, "content": { "mod": "t3-theme-export" } }`。不要设成隐藏，隐藏的块不会启动。它只在放了这个块的布局里运行：切到其他布局后 Pi 保持原来的颜色，想跟随就在那个布局里也加上。`scripts/update.sh` 更新这个布局时会保留这个块。

## asciicn 壁纸

把 Home 换成一张静止的 [asciicn](https://asciicn.dev) 风格的画，颜色取自你的主题，换主题或明暗模式时跟着变。自带 4 张 asciicn 的画（灯塔、黄昏山峦、星云、余烬），也可以用你自己的图片或 `.ans` 文件。

鼠标移到 Home 的右下角，那里会出现切换器：`‹ ›` 换画，裁切按钮重新打开自己加的画的构图。`+` 打开一张卡片，主操作是 **Choose image…**，已经在 Studio 做好的画用 **Import Studio file (.ans)…** 导入。

按钮始终留在原位：长画名和进度只占同一个截断文字槽，内置画的裁切按钮和 `×` 保留并置灰。首尾循环切换，仅一张时翻页置灰。图片预览时，切换器仍在预览卡片下方，浏览动作置灰。Studio 指引、错误、Applying… 和删除确认都不挤动其他按钮。明暗主题用同一布局；没有文件选择框时，相应按钮保留并置灰，仍可用 **Open folder**。

**Choose image…** 选一张图片（PNG、JPG、HEIC 等），默认以 **Dots**（半调圆点）在整个 Home 上预览。首行常驻 **Dots**、**Braille**、**Blocks**（`░▒▓█`）和 **Quadrants**（四象限填充，窄卡缩写 **Quads**）；点击或聚焦后用方向键切换。切换只从已解码的原像素重画草稿，不重读原图或另存文件；连续切换会取消未完成的旧任务。**Import Studio file (.ans)…** 保留原字符画，同一行保留并禁用，不挪位置，悬停可看原因。

四种图片模式的网格、采样与色调阈值遵循 asciicn Studio，颜色始终完全取自主题，分8档不透明度。浅色主题里新图片像墨画在纸上：照片暗的地方落笔，不会像底片。新Dots用4.5×9格；四张内置画和已经导入的画保持原样，重新导入原图才用新处理，不做迁移，保存后没有模式编辑入口。

两者都先构图再保存：**Fill** 铺满 Home，允许裁切；**Fit** 在1倍时展示整张图，允许留白。拖动或方向键移动（10px，Shift为50px）；Tab走画布、模式、铺放、缩放和操作。缩放是铺放基准的1–4倍，Fit放大后也可能裁切；聚焦缩放控件时方向键每次调0.1倍。**Reset** 恢复居中1倍，不改变Fill/Fit。不可用动作留槽置灰，模式切换及转换中也不挪按钮。

**Apply** 保存一张 `.ans` 和构图，再选中它；**Cancel** 回到原壁纸，不保存。预览与保存后的画面使用同一构图。新 Home、重启、换主题以及改变窗口／侧栏大小都沿用相对铺放、缩放与对齐，不是冻结旧窗口的像素截图。拖动、缩放和方向键复用缓存预览，不重新转换或读写文件。极大缩放时预览可能比保存后的矢量画略软。只保存生成的画，不复制或修改原图；以后想改已保存壁纸的构图，选中它再按裁切按钮：预览从上次的构图打开，**Apply** 只保存新构图，不另存一张画。模式不能改，要换模式请重新导入原图。

Apply 未能完成保存时，预览保持打开，卡片内显示错误。处理问题后再点 **Apply**：草稿未变且已保存文件的内容仍一致时，沿用这个草稿自己的文件，不重复保存。失败不改变当前选择或构图；之后即使取消，已经发布的 `.ans` 也会留在文件夹里。

想精细调整（对比度、抖动、换其他字符），点 **Create in asciicn Studio…** 展开三步：1. **Open asciicn Studio ↗**；2. 做好画，用画面下方的 **.ans** 按钮保存（会存到「下载」）；3. 回来点 **Import Studio file (.ans)…**，构图后 Apply。Braille、方块等原字形保留，不重转成 Dots。删除自己加的画时按 `×`，在确认里核对画名再删除；取消保持不动。确认删除会清掉构图，停止转换或待提交的 Apply，即使重转时条目暂时移出了列表也不跳过删除；迟到任务不能复活它。

你加的画以 `.ans` 文件存在 `~/.config/herdr-app/asciicn-wallpaper/`，辅助入口 **Open folder** 会打开它。直接复制的文件按旧默认构图出现，不弹导入预览；修改文件会重画，但不丢失已保存的构图。Braille、方块、象限和半调圆点保留形状；其他 ASCII 字符按暗度近似成短条，保留明暗而非字母轮廓。颜色映射到最接近的主题色。内置画和没有构图记录的画保持旧规则：填满 Home 高度，宽度变化时露出更多或更少两侧；较窄的画填宽，上下均匀裁切。横着存的手机照片会先按相机旋转标签转正再转换。

支持 Unicode、以 `-` 开头的名字，以及 `.hidden.ans` 等普通隐藏文件。外部文件名恰好为 `.ans`、`..ans` 或 `...ans` 时会拒绝，先换个有意义的名字再导入。阴影字符（`░`、`▒`、`▓`）密集的画也能导入，不会再生成过大的图块。

安装：把 `extras/mods/asciicn-wallpaper` 复制到 `~/.config/herdr-app/mods/`，然后在这套布局的设置里，把 **Home shows** 选成 asciicn wallpaper。它由 `scripts/update.sh` 负责更新，不会动你加的画。选图片在 macOS 上、以及装了 `zenity` 和 ImageMagick 的 Linux 上可用；没有 ImageMagick 时用 **Import Studio file (.ans)…**。没有文件选择框的平台（包括 Windows），用 **Open folder** 把 `.ans` 文件复制进去。自带的画来自 asciicn，MIT 许可（`LICENSE-asciicn`）。

## 主题和设置

布局不指定主题，沿用你自己的。`extras/themes/` 里附带两对明暗主题，需要的话可以用：

- `catppuccin-mocha` 和 `catppuccin-latte`：[Catppuccin](https://catppuccin.com) 官方色板，终端色按官方规范，界面用 Catppuccin 自己的层次色（底层 mantle、卡片 base、选中和边框 surface0），强调色为 blue。
- `t3-code-dark` 和 `t3-code-light`：T3 Code 网页端默认绘制的颜色，深色 canvas 为纯黑、accent 为 `#346bf1`，浅色 canvas 为 `#fcfcfc`、accent 为 `#1b4ed8`，终端用 T3 Code 采用的 VS Code 终端配色。终端文字取对话正文的 90% 前景色，让 agent 的回复读起来和 T3 Code 一样。

把想要的文件复制进 `~/.config/herdr-app/themes/`，在设置页选上；或者在 `settings.json` 里写一对，跟随系统明暗切换，例如 `"theme": { "light": "catppuccin-latte", "dark": "catppuccin-mocha" }`。预览图里的其余设置：

```json
{
  "font": "Geist Mono",
  "ui_font": "Geist",
  "font_size": 12,
  "zoom": 1.1,
  "minimum_contrast": 3
}
```
