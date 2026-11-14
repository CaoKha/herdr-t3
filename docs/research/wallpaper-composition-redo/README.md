# 壁纸导入构图：旧版审计与重做

授权：交接稿 C；旧实现 `c3a329b4` 曾因细节被撤回。本轮从 `2130051e` 的固定按钮布局继续，不恢复整份旧实现。

## 先审旧版

旧 mod 从 `git archive c3a329b4 extras/mods/asciicn-wallpaper` 放进临时源码 `/private/tmp/wallpaper-redo-source`，主工作树的生产代码保持不变。离线 `scripts/demo/stage.sh up`，`DEMO=/private/tmp/wallpaper`。同一 demo 的 app/mod/input 副本送到已有 `word-acceptance` VM，Herdr 0.1.15；独立 HOME/app/core，1280×699 实际窗口、侧栏256、zoom1。VM 无 viewer、VNC、共享目录或剪贴板桥，未调用剪贴板工具；宿主不接收 GUI 输入。

测试适配器只负责通过 `herdr-app do ...probe` 选定测试输入、导出状态、注入可控最终缓存失败、暂停转换；绘制、Dots转换、构图、Apply/Cancel 和原子发布均为旧生产代码。图片选择器不在这层重测。真实点击／拖动／按键由客体 CuaDriver 执行；background dispatch 无效时先读回，再仅在客体改用 foreground，不能把 `unverifiable` 当成成功。PNG 留在本目录不入 Git；逐帧 `*-state.json`、`*-driver.json` 是原始证据。

### 旧版问题清单（实现前形成）

| ID | 已复现问题与依据 | 旧版截图／状态 | 新版验收条件 |
| --- | --- | --- | --- |
| D1 | 点 Fit 后点 Reset，mode 从 contain 变 cover；与“重置当前铺放方式”的 C2 不符 | `old-fit-selected.png`、`old-reset-after-fit.png` | Reset 只还原当前 mode 的居中与1倍，不切换 mode |
| D2 | Fill/Fit 依赖 `✓` 的自然宽度，选中后下一个按钮横移；Apply→Applying 也挤动 Cancel | `old-landscape-cover.png`、`old-landscape-contain.png`、`old-ui-applying.png` | 模式槽及 Reset/Cancel/Apply 槽等分固定；状态只换颜色／文案 |
| D3 | 提示自然高度参与卡片排版，loading、正常、多行错误之间标题、模式、滑条上下移动，长错误可把顶部挤出 Home | `old-ui-loading.png`、`old-ui-error.png`、`old-landscape-cover.png` | 卡片、标题、文件名、模式、滑条、提示和底部行均预留固定高度，长错误在提示区滚动 |
| D4 | 轨道4px、圆点16px但没有垂直补偿，圆点中心比轨道低6px；禁用 slider 用0.5而非 T3 的0.64 | `old-real-slider.png`、`old-ui-loading.png`；对照 t3-tokens 按钮与禁用规则 | 圆点沿轨道中心，禁用0.64且不能拖动／按键 |
| D5 | 真实鼠标拖动后直接按 Right，构图完全不变；只有先额外用 focus 命令进入键盘模式再 Tab 才能用键盘 | `old-foreground-drag.png`、`old-keyboard-position.png`（x均0.2608827412）；`old-keyboard-slider.png`证明显式 focus 后缩放可用 | 进入预览、点／拖画布后，方向键直接控制画布；Tab 可到缩放、模式及底部动作 |
| D6 | 预览隐藏整条日常切换器；普通状态删除槽和长画名还会使按钮漂移 | `old-landscape-cover.png`、上一任务 `wallpaper-controls-validation/` | 保留2130051e的固定切换器，在预览中保持原位并置灰，不以新卡片挤走旧控件 |
| D7 | 最终缓存失败后产生两条 warning，卡片仍显示正常操作说明；实际错误只有短暂 toast，draft.error=null | `old-failed-apply.png` | 保留草稿、同一已发布源与可重试 Apply；卡片固定提示槽显示具体保存错误，避免重复 toast |
| D8 | 卡片底部距角仅12px，系统更新／错误 toast 会盖住 Apply/Cancel，构图时也失去旧按钮位置基准 | `old-landscape-cover.png`、`old-failed-apply.png` | 卡片在固定切换器上方，底部至少沿用60px定位；不把临时 toast 当作唯一错误说明 |
| D9 | “Fill/Fit”和“Apply fixes this composition”没有说清裁切／完整显示／保存后固定；键盘提示没有 Shift 步长说明 | `old-landscape-contain.png` | 短标签稳定，固定提示说明当前铺放与移动方式，文档明确1–4倍、10px/Shift50px、Apply后不编辑 |
| D10 | 已打开删除确认后暂停该文件真实缓存转换，refresh暂时将旧项从 imported 移出；确认时 remove 的列表成员检查直接返回，文件仍存在 | `old-delete-during-conversion.png`（holding=true/importing=square）、`old-confirmed-during-conversion.png`，文件实测EXISTS | 已确认的源文件不因临时列表状态而跳过删除；取消转换，迟到结果不能复活源／缓存／构图 |
| D11 | 固定300px面板在窗口缩窄、侧栏变宽时可能超出 Home，控件被裁 | `old-narrow-preview.png`（尺寸见同名state） | 卡片宽度随可用Home收紧，按钮等分；同一尺寸下跨状态不移动 |

### C4 旧版完整回放

| 场景 | 结果与证据 |
| --- | --- |
| 横／竖／方图，cover／contain | 六张 `old-{landscape,portrait,square}-{cover,contain}.png`；保持源图比例，Dots渲染可复用。测试方图自身包含椭圆，不能把源图椭圆误报为拉伸 |
| 真实拖动、边界与缩放 | `old-foreground-drag.png`（150px真实拖动对应x变化）、`old-real-slider.png`（2.52倍）；数学边界另有旧 check.cjs 回放 |
| 键盘 | 点画布后的方向键失败（D5）；显式 focus 后 Shift-Tab 到滑条并 Right 从2.52到2.62通过，见 `old-keyboard-slider.png` |
| 重置 | Fit变Fill（D1） |
| Apply、保存后固定 | `old-apply-preview.png`、`old-applied.png`、`old-saved-drag-fixed.png`；构图参数一致，保存后真实拖动无变化 |
| Cancel、同名冲突、失败重试 | `old-before-cancel.png`／`old-cancelled.png`；`old-same-name-conflict.png`新增编号文件而不覆盖；`old-failed-apply.png`／`old-retry-applied.png`实际失败后重试成功，但错误UI有D7 |
| 连续选图、两Home | `old-continuous-selection.png`只保留latest；`old-two-homes.png`与另一Home读回的state显示不同私有草稿，不互相清理 |
| 转换中确认删除 | D10真实暂停／确认／检查文件；原有旧filesystem检查13项也通过，说明旧测试没有覆盖“本副本列表已移除”的窗口 |
| 重开／重启、窗口／侧栏、明暗 | `old-restarted.png`及state重读保留选择与构图；`old-window-narrow.png`、`old-sidebar-wide.png`、`old-theme-light.png`；D11另覆盖极窄Home |
| Studio/Braille `.ans` | `old-studio-preview.png`，保留原字形和内容，不转成Dots |

旧版 narrow checks：`check.cjs`通过，`check-filesystem.cjs`13项survived。复用其已证实的归一化cover/contain计算、1–4倍边界、原子发布、缓存版本与跨Home提交失效机制；不复用上述布局、焦点、Reset和错误呈现问题。

## 新版处理与证据

新版已按相同客体、输入与默认侧栏宽回放，未恢复旧整份实现。图片固定 Dots；Studio `.ans` 保留原画法，两者共用构图草稿。下列文件都在本目录，PNG 不入 Git；同名 `-state.json` 与 `-driver.json` 保留实际状态与 Driver capture。

| ID | 新版结果与对照 |
| --- | --- |
| D1 | `new-fit-selected.png` → `new-reset-after-fit.png`：Reset 后仍为 contain，zoom=1、x=y=0.5。 |
| D2 | 18 张 `new-slots-{dark,light}-*.png` 覆盖 ready/Fit/4倍/loading/converting/error/save-error/applying/长名。九个按钮中心逐个完全相同，坐标见下文；不是“允许1px漂移”。 |
| D3 | 同组18张截图中卡片312px高，状态槽60px，错误滚动；模式／缩放／底部行不随提示重排。 |
| D4 | `new-real-slider.png`、`new-keyboard-slider.png`：16px圆点相对4px轨道 top=-6，中心对齐；禁用opacity=0.64。真实点击到2.52倍，直接Right到2.62倍。 |
| D5 | `new-keyboard-position.png`：打开预览后Right直接使x从0.5变0.4840588494；`new-foreground-drag.png`真实150px拖动至0.2449415906。画布独立focus handle，Tab到独立zoom handle；布局测试加载真实focus helper，防止focus ring把全画布变成0高。 |
| D6 | 预览始终保留四个日常按钮及画名槽，禁用而不移位；所有18状态均已测。 |
| D7 | `new-failed-apply.png`：固定槽显示具体saveError，只有一条warning；`new-retry-applied.png`同一已发布源重试成功，草稿随后关闭。 |
| D8 | `new-slots-dark-ready.png`：卡片bottom=60，切换器bottom=12；保存失败的toast不盖Apply。toast暂时可遮切换器，错误详情不依赖toast。 |
| D9 | 固定提示说明Fill裁切、Fit完整显示与Shift；双语Recipe／extras说明10px/Shift50px、1–4倍、Apply后固定。`new-saved-drag-fixed.png`确认保存后真实拖动不改参数。 |
| D10 | `new-delete-during-conversion.png` → `new-confirmed-during-conversion.png` → `new-deleted-after-conversion.png`：真实暂停转换、点击Delete、释放转换后，源和缓存均ABSENT。另有发布、重试、旧扫描竞态回归。 |
| D11 | `new-narrow-preview.png`：620×651窗口、侧栏340、可用Home约259，卡片收紧，完整保留各行；布局检查在宽1000/259两组跨状态固定。 |

### C4 新版完整回放

- 横／竖／方图，Fill/Fit：`new-{landscape,portrait,square}-{cover,contain}.png`，没有重采样或拉伸；4倍及边界见slots图与行为检查。
- Apply前后：`new-apply-preview.png`、`new-applied.png`，构图为contain/1.7/0.65/0.25；保存后不可拖动，重启仍保留共享选择与构图（`new-restarted.png`）。
- Cancel：`new-before-cancel.png`、`new-cancelled.png`，不发布草稿且保留原选择。重名另存不覆盖，见`new-same-name-conflict.png`。
- 连续选择只留latest（`new-continuous-selection.png`）；两个Home草稿独立，见`new-two-homes.png`及另一Home读回的state。
- 窗口变窄、侧栏加宽、明暗主题：`new-window-narrow.png`、`new-sidebar-wide.png`、`new-theme-light.png`，只重算相对构图，不重建tiles。
- Studio原字符画法：`new-studio-preview.png`，不重转Dots；Apply／Cancel流程同图片。

原始新版回放输出未入库。`measure-slots.py`直接从18张1280×699原图测像素：Fill (1042,410)、Fit (1174,410)、Reset (1016,590.5)、Cancel (1107.5,590.5)、Apply (1199,590.5)、Previous (993.5,659.5)、Next (1185.5,659.5)、Add (1213.5,659.5)、Remove (1241.5,659.5)。每个按钮跨状态／主题最大漂移均为0。不同窗口几何不要求绝对屏幕坐标相同。

### 最小实现与门禁

沿用现有Dots转换器、SVG tiles、原子发布、共享focus/button及官方Slider；没有新增依赖。删除旧三样式选择入口与三个`style-*.svg`；通用Braille/Blocks/Dots字形与转换器未删。模式组依据T3 [ToggleGroup](https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/apps/web/src/components/ui/toggle-group.tsx#L30-L31)的2px padding/gap与[segmented Toggle](https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/apps/web/src/components/ui/toggle.tsx#L17-L20)的24px高度、6px圆角，不用会改变自然宽度的勾选字符。

以下红绿日志未入库，只记结论。

- 先红：证实旧图片仍生成Braille；当前固定Dots通过。
- 两组先红断言防真实focus helper覆盖absolute、滑条排队回调误夺焦点；当前行为与布局检查通过。
- 先红断言在旧实现证实确认删除跳过、发布迟到复活源；另一组防关闭副本旧扫描误删新构图。修复后17个真实文件系统场景全部survived，含shell/Unicode/大文件不覆盖与上述竞态。
- `check-layout.cjs`覆盖204组状态×平台×主题×宽度，检查可用性与固定布局；数学／异步／输入生命周期在`check.cjs`。
- 最终全仓检查为`all checks passed`，退出码0；含sync一致性、类型检查与各mod行为门禁。未重跑并行A/B已通过的独立GUI。
- 撤去测试适配器后，真实生产`main.js`在客体通过`herdr-app check`，`status.errors=[]`；整窗`production-final.png`记录最终状态。

### 边界与未验证

真实GUI操作发生在隔离macOS客体，不宣称Linux/Windows实机验收。原生文件chooser本轮未重测，测试适配器从真实startPreview入口送入文件；EXIF方向沿用现有限制。未验收Home窄于259px或窗口矮到放不下312px卡片。没有删用户数据、修改剪贴板、推送提交；本目录旧/新文件删除只在任务独立副本中执行。
