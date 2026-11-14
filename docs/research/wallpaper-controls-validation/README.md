# Home 壁纸按钮固定位置验收

2026-11-13；仅改 `extras/mods/asciicn-wallpaper` 的控件布局，未恢复或重做 c3a329b4／22622fdd 的导入构图方案。

## 环境与回放方法

- `DEMO=/private/tmp/wallpaper`，使用 `scripts/demo/stage.sh` 的离线源码副本启动独立 app/core；默认侧栏 **256**，zoom **1.1**，窗口 **1680×1042**，整窗截图 **3360×2084**。不操作真实桌面指针。
- disposable fixture 只把下列状态送入原生产 renderer（不模拟布局）；通过 `herdr-app do asciicn-wallpaper.fixture:<json>` 驱动。before 用任务开始时的生产 renderer，after 用本次 renderer。单张输入只缩减内置 scene 列表，不改绘制函数。
- 深色 Catppuccin Mocha、浅色 Catppuccin Latte；修改的是 demo 自己的 appearance。只有换 theme 名称不会改变当前明暗模式，已实际确认浅色画面。
- 最后移除 fixture，恢复生产 `main.js`，通过 `herdr-app do asciicn-wallpaper.focus` 显示真实控件，见 `production-light.png`；status 无错误。
- PNG 按仓库规则保留在本目录、**不提交 Git**；完整每帧 status 和像素坐标已提交。`python3 -I measure-screenshots.py` 使用已装 ImageMagick 重新测量原始整窗图，不根据代码推算坐标。

## 全部状态与前后差异

每个 after 状态都有 `after-dark-<状态>.png`、`after-light-<状态>.png`；before 除单张输入外都有 `before-dark-<状态>.png`。表中的 T/G/P 对应下一节逐按钮坐标，`—` 表示该独立卡片未打开，不是其他按钮来补位。

| 状态／截图名 | 修复前问题 | 修复后按钮位置／可用性 |
| --- | --- | --- |
| `builtin-first` | 没有删除槽，切换器较窄 | T；删除置灰，首张可循环到末张 |
| `builtin-last` | 画名长度影响前一个按钮 | T；末张可循环到首张 |
| `single-picture` | 无需翻页仍可点击 | T；前后翻页置灰；合成单张输入测试 |
| `imported-short` | 新增 × 导致已有按钮横移 | T；删除可用 |
| `imported-long` | 画名从最小96增到最大160，前一个按钮再横移 | T；固定160文字槽、截断；含 Unicode |
| `importing` | 进度／长文件名改变文字宽度 | T；文字仍在同一160槽 |
| `guide-collapsed` | 展开前卡片高度较小 | T + G；Studio 打开按钮保留并置灰 |
| `guide-opening` | Opening… 可能改变文字自然宽度 | T + G；选择与导入按钮置灰，整行宽不变 |
| `guide-expanded` | 增加指引把关闭、选择、导入、展开按钮向上挤 | T + G；预留指引行，Open folder 也原位 |
| `preview-loading` | 预览取代整个切换器；提示高度可变，尚无像素的样式项可点却无效 | T + P；原切换器保留、浏览置灰，样式与Apply置灰 |
| `preview-braille` | 原切换器消失 | T + P；Braille选中 |
| `preview-blocks` | 原切换器消失 | T + P；Blocks选中 |
| `preview-dots` | 原切换器消失 | T + P；Dots选中 |
| `preview-converting` | 提示行高度随内容变化 | T + P；状态栏固定高，Apply置灰 |
| `preview-applying` | Apply → Applying… 变宽、挤动 Cancel；旧卡片自动高度 | T + P；等宽按钮；Cancel、样式项置灰 |
| `preview-error` | 多行错误使卡片变高、标题和样式按钮上移 | T + P；固定48高提示区内滚动，Apply置灰 |
| `delete-confirmation` | 本来是独立弹层，不重排；继承可删除画的切换器漂移 | T；仍是独立确认弹层，位置不变 |

另在 `check-layout.cjs` 覆盖 macOS／Linux／Windows × 明暗主题 × 15状态，共90组。Windows 不能选择文件时，Choose/Import 保留位置并置灰，Open folder 可用；平台间不因少两行而移动其他按钮。hover 隐藏／显示只改透明度，不改几何。预览与添加是独立临时卡片，关闭卡片不让其他按钮补位。

## 每个按钮的屏幕位置

原始截图像素坐标，以整窗左上角为原点；对全部同名按钮取图标或填色矩形中心。34张 after 整窗图中，15个按钮的同名中心坐标**完全相同，偏差为 0**。坐标里的 `.5` 只表示按钮宽或高是奇数像素，中心落在两像素之间，不是偏移。每帧原始坐标未入库。

| 组 | 按钮 | 中心 `(x,y)` |
| --- | --- | --- |
| T | Previous | (2729,2000) |
| T | Next | (3152,2000) |
| T | Add | (3214,2000) |
| T | Remove | (3276,2000) |
| G | Close | (3252.5,876.5) |
| G | Choose image／Opening | (2981.5,1060.5) |
| G | Import Studio | (2981.5,1148.5) |
| G | Expand／Hide Studio guide | (2981.5,1236.5) |
| G | Open Studio | (2981.5,1421.5) |
| G | Open folder | (2981.5,1861.5) |
| P | Braille | (2780,1525) |
| P | Blocks | (2981.5,1525) |
| P | Dots | (3183,1525) |
| P | Cancel | (2830.5,1793.5) |
| P | Apply／Applying | (3132.5,1793.5) |

修复前的代表性实测：`before-dark-builtin-first.png` 的 chrome 切换器背景框为415×71、左上(2897,1965)；修复后为618×71、左上(2694,1965)。切到可删除短画名时会多一个约62px删除槽；文字槽从96增至160还会增加约141px。现在两者始终预留，文字和按钮宽不再由当前壁纸决定。

修复前逐状态按钮位置（与上述同一物理像素坐标；`—` 是按钮不存在）：

| before 状态 | Previous / Next / Add / Remove 的 x（y均2000） | 该卡片全部按钮 |
| --- | --- | --- |
| builtin-first、builtin-last | 2932 / 3214 / 3276 / — | — |
| single-picture | 与 builtin-first 同槽（源码布局规则，未拍before图），但翻页仍启用 | — |
| imported-short、delete-confirmation | 2870 / 3152 / 3214 / 3276 | 删除是独立弹层 |
| imported-long | 2729 / 3152 / 3214 / 3276 | — |
| importing | 2791 / 3214 / 3276 / — | — |
| guide-collapsed、guide-opening | 2932 / 3214 / 3276 / — | Close=(3252.5,1402.5)；其余x均2981.5：Choose y1595.5，Import y1683.5，Guide y1771.5，Folder y1887.5；Open Studio不存在 |
| guide-expanded | 2932 / 3214 / 3276 / — | Close=(3252.5,941.5)；其余x均2981.5：Choose y1134.5，Import y1223.5，Guide y1311.5，Open Studio y1502.5，Folder y1887.5 |
| preview-loading、preview-converting | — / — / — / — | 三样式x=(2780,2981.5,3183)，y1751；Cancel=(3091.5,1967.5)，Apply=(3221.5,1967.5) |
| preview-braille、preview-blocks、preview-dots | — / — / — / — | 三样式x同上、y1708；Cancel=(3091.5,1967.5)，Apply=(3221.5,1967.5) |
| preview-applying | — / — / — / — | 三样式x同上、y1708；Cancel=(3039.5,1967.5)，Applying=(3195.5,1967.5) |
| preview-error | — / — / — / — | 三样式x同上、y934；Cancel=(3091.5,1967.5)，Apply=(3221.5,1967.5) |

因此不只是删除按钮：展开 Studio 时上方按钮上移约461px；正常提示／转换提示相差43px；长错误使样式按钮上移774px；Applying 文案让 Cancel 左移52px。after 中这些状态的同名按钮均保持上一表的位置。

## 检查与同步

- **先红**：原始代码跑新检查失败，缺少 `wallpaper-remove`；初次错误为 `first: wallpaper-remove keeps its slot`。最终加强后的同一检查在原 renderer 上仍失败（toolbar order 缺 Remove），exit 1（原始日志未入库，下同）。
- **后绿**：90组布局检查、原导入生命周期、字符转换、真实文件系统回归以及 `herdr-app check` 全部通过；单独 TypeScript 检查通过。
- **全仓门禁尚不通过**：Actions/chrome 的并行施工和旧 panel/sidebar/Review/update 检查失败；没有修改别人的文件去绕过门禁，不声称已打印 `all checks passed`。
- `scripts/sync.sh` 已执行。已装 `~/.config/herdr-app` 的壁纸副本已更新。三个 standalone 仓库无壁纸 mod 分发路径：inbox无变更；actions/review 的同步改动均属于并行 panel-ab，由其各自提交，本任务不抢暂存。
- 审查结论：生产 diff 仅 `render`／`previewCard`／`guideCard` 的槽位、样式和禁用状态，`choose`／`previewStyle`／`applyPreview`／`remove` 及文件／缓存流程均未改。

## 未验证与删除项

- 未用真实鼠标点击；原生图片选择框、GUI真实导入／转换／应用不在本次视觉回放里重新执行，原有生命周期／文件系统测试提供旁证。Linux／Windows 只有惰性渲染检查，没有真实平台截图。
- 未验证改变窗口尺寸、缩放、侧栏宽度后的跨尺寸坐标不变；固定位置契约比较的是相同屏幕几何下不同控件状态。默认宽度整窗中卡片完整可见；长错误和 Studio 末段说明在固定区域滚动。
- 没有生产文件或功能删除，未删除用户文件。任务创建的临时 demo、离线源码、脚本和后台门禁终端收尾清理；截图是验收证据，保留在本目录。没有推送。
