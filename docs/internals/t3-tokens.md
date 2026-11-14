# T3 视觉基准

布局的圆角、边距、尺寸、字号统一到 T3 Code。本文是统一时的查表入口，**T3 源码优先于本表**：`pingdotgg/t3code` 的 `apps/web/src`，提交 `337c5858`（2026-11-05）。本机副本在 `/private/tmp/t3code-terminal-research`，没有时重新 clone 这个提交。

## 规则

1. 每个数值都能指向 T3 的一个组件。没有直接对应时，用用途最接近的组件，并在代码注释里写一句为什么。
2. 同一种用途全布局只有一个值。三处相同就够了，不要新建共享常量文件。
3. 宿主做不到的（Herdr 弹窗外壳、玻璃效果、缩放动画）记进下面的「做不到」，不写模拟层。
4. 只统一视觉。行为、颜色（由主题决定）和下面的「有意不同」不改。T3 的 `destructive` 取 `ansi1`，不取 Herdr 的 `destructive`（即 `blocked`，部分主题是琥珀色）；只用作文字色，不填色块（见「有意不同」）。

换算：T3 `1rem = 16px`，`spacing(1) = 4px`，Herdr 的逻辑 px 与之一比一。带 `sm:` 的取 `sm:` 的值，这是桌面尺寸。

### 设计原则

每块重写都按这九条自查（依据 [design-audit](../research/rewrite-review-2026-11-14/design-audit.md)，2026-11-14 用户全部采纳）：

- **P1 一列一条边**：同一列上下相邻的两行，首个图标或文字用同一条左缘，末个控件用同一条右缘。对的是所在列的内容边，不是窗口边。截图量，误差 ≤1px。
- **P2 中心一致**：同一条栏里的元素垂直中心相同（40px 栏是 20）；图标在按钮框里居中；同一组按钮尺寸相同。
- **P3 同组相接，组间 8**：同一组相邻的图标按钮间距 0；组与组之间、按钮与文字或输入框之间 8。
- **P4 一套笔画**：UI 图标用 Lucide 24 网格、1.75px 笔画，并排图标的视觉重量相近。`scripts/check.sh` 拦其他笔画（Pierre 图标和 Windows 窗口按钮除外）。
- **P5 不写自明或重复的字**：提示只补控件自己说不出的东西（动作名、按键、被截掉的全文、禁用原因）；说明文字不重复标签已说过的话。
- **P6 打开弹层的按钮一种做法**：照侧栏 Filter by space，用 `shared/trigger.js`。提示是布局自己的卡片，可带第二行说明；弹层开着时提示收起，按钮保持 on；再点一次是关闭。见下文「按钮」。
- **P7 静止时安静，颜色只表达状态**：ghost 按钮和 split 静止时无底、无分隔线；同一条栏上的按钮用同一种悬停面和 on 面；`accent` 不做按钮的底。
- **P8 T3 优先，偏离写明**：每个数值都能指到一个 T3 组件；不同之处写进「有意不同」。
- **P9 层级从上往下**：卡片和弹层先放标题或内容，再放控件，说明放最后。

### 对齐

- **R1 末端对齐**：每条顶栏最右的按钮，框的右缘对齐正下方那一行最右的控件。侧栏是两行都离侧栏边 8；工作列对齐窗格头末端（离窗口边 12）；面板列对齐页头（面板内 12）。左侧同理：面板头首个标签的框和页头的面包屑框都在面板内 12。
- **R2 列内同尺寸**：上下对齐的两行用同一尺寸的按钮，同一组也一样。
- **R3 内容右缘**：侧栏卡片和 slim 行的横向内边距 8，状态文字和程序图标的右缘落在按钮图标的右缘上，左缘与 Search 图标、底栏齿轮同线。

## 圆角

| T3 | px | 用途 |
| --- | --- | --- |
| `rounded-sm` | 4 | 菜单和 combobox 的行、20px 及更小的按钮、标签的 ×、徽章、键帽 |
| `rounded-md` | 6 | tooltip、compact 输入框、28px 高的小按钮 |
| `rounded-lg`、`--control-radius` | 8 | 菜单、popover、combobox、select 的面板，输入框，默认按钮 |
| `rounded-2xl` | 16 | 对话框、命令面板 |

## 组件

| 组件 | T3 文件 | 数值 |
| --- | --- | --- |
| 菜单面板 | `ui/menu.tsx` | 内边距 4，圆角 8，大阴影 |
| 菜单位置 | `ui/menu.tsx` 的 `sideOffset`、各处 `align` | 按钮下方 4；对齐按钮朝窗口那侧的边：靠右的按钮右边对齐（`align="end"`），靠左的左边对齐（`start`）；位置取按下时按钮的 `e.bounds`，没有按下（辅助技术）就用 app 默认的指针处。右键菜单在指针处，命令面板顶部居中 |
| 菜单行 | `ui/menu.tsx` | 最小高 28，横向 8、纵向 4，间距 8，字号 14，圆角 4；图标 16 muted、左右各内缩 2；子菜单箭头 16 muted 80%、右内缩 2；行尾提示 12 medium dim；分隔线 1、横 8、纵 4。由 `shared/menu-row.js` 统一绘制，见下文「菜单行」 |
| 菜单搜索框 | `ui/menu.tsx` | 外层横向 8、上 6、下 4；输入框高 26，下 6 后 1px 下划线，图标 16，文字起点 20 |
| Combobox 搜索框 | `ui/combobox.tsx` | 外层横向 12、上 10；其余同菜单搜索框 |
| Combobox 行 | `ui/combobox.tsx` | 见源码，横向 8、纵向 4，圆角 4 |
| Tooltip | `ui/tooltip.tsx` | 横向 8、纵向 4，字号 12，圆角 6，最宽 320；卡片由 `shared/tip.js` 的 `tipCard` 画，`measured-text.js` 的 `named()` 也用它 |
| Popover | `ui/popover.tsx` | 圆角 8；default 纵向 16、横向 16，compact 纵向 8、横向 12 |
| 输入框 | `ui/input.tsx` | 默认高 30、横向 11、圆角 8；sm 高 26、横向 9；compact 高 28、横向 9、字号 12、圆角 6 |
| Select | `ui/select.tsx` | 同尺寸的按钮；面板内边距 4，圆角 8；箭头 14 |
| 按钮 | `ui/button.tsx` | 默认高 32；sm 高 28；xs 高 24，字号 12，图标 14 |
| 图标按钮 | `ui/button.tsx` | 32、28、24（图标 14）、20（圆角 4，图标 12）、16（图标 12） |
| 键帽 | `ui/kbd.tsx` | 高 20，最小宽 20，横向 4，字号 12，圆角 4 |
| 徽章 | `ui/badge.tsx` | 见源码，圆角 4 |
| 对话框 | `ui/dialog.tsx`、`dialog-styles.ts` | 最宽 512，圆角 16；头部内边距 24、间距 8；标题 20 半粗；正文 24；底部横向 24、纵向 16；默认有上边线，`bare` 变体没有（Actions 编辑器用它） |
| 确认框 | `ui/alert-dialog.tsx` | 同对话框 |
| 命令面板 | `ui/command.tsx`、`CommandPalette*.tsx` | 最宽 576，最高 420，圆角 16；搜索纵向 6；底部纵向 10，上边线 |
| 标签关闭 | `ui/panel-tab-close-button.tsx` | 16，圆角 4，图标 12 |
| 标题栏按钮 | `index.css`、`ui/sidebar.tsx` 的 `SidebarTrigger` | 28，间距 12，图标 16 |
| 侧栏 | `Sidebar*.tsx`、`ui/sidebar.tsx` | 见源码；RECIPE 里已写明的是之前量过的值，仍要对照 |
| 侧栏图标 | `SidebarThreadHeader.tsx`、`SidebarProjectFolderHeader.tsx`、`ui/collapsible-section-header.tsx`、`SidebarThreadRow.tsx` | 图标跟着按钮框走：28 的按钮图标 16，24 的小按钮（`icon-xs`）图标 14；收纳区和文件夹的折叠箭头、行内控件和标记 12 |
| 面板标签 | `RightPanelTabs.tsx`、`ui/panel-tab-close-button.tsx`（`09a54f01`） | 高24、最宽144、圆角6、左内距6／右8、子项间距2、字号12。左16px槽平时12px surface图标，标签悬停／键盘聚焦换12px ×，关闭圆角4／`tab`面。面板头两端在卡片内12（「规则」R1）：首个标签的框、末个按钮的框与下面页头同边；标签与+项间距4；+ 为 `trigger()` 的 xs ghost（24方／图标14），紧跟末项在同一滚动条内；菜单左对齐、下偏移6（键盘打开时按面板头宽与滚动量算出同一位置）；surface菜单宽220、高为行数×28＋8。溢出时照T3 ‹ ›（xs，相接）并排在标签条后，与放大／隐藏那组（sm，相接）间隔8，到头置灰（`DISABLED`），条两端各16px渐隐（`shared/scroll-strip.js`，与标签栏共用）。当前底selected，悬停hover，文字foreground／muted（与标签条未选中tab同色）；layout controls最右。空页 Open a surface 照 T3 `RightPanelEmptyState` 与 Home：标题foreground，列表最宽320，行32／横10／间距10／圆角8，键提示是20高键帽（圆角4、字12 medium、foreground 7%底），整组底部让出40（T3 的顶栏高）后在面板里居中 |
| 详情 popup | `chat/threadDetailsPanelStyles.ts`、`ThreadDetailsSection.tsx`、`threadDetailsCardLayout.ts`（`09a54f01`） | 宽280、内容自然高且最高420、1px主题border、圆角16。分区内距8；行32、字13 medium、图标16、gap10、横距10、圆角8。机器locked行透明、无hover／chevron；folder只作提示，放在行尾32槽，与各行箭头同一竖线。split用 `shared/button.js` 的 `split()`（`row`）：箭头槽宽32、中线1×16；箭头始终显示（dim，照T3），静止时无底无中线，hover（7%）或对应菜单开启（12%）时整组一块底并显示中线；子菜单与整行同宽、下偏移4。卡片不加阴影：原生popup与卡片同大，阴影会被裁成方角。Quick Review也是 `split()`（`row`）：主半边是图标、名字和其后12px dim的Review当前范围（只认现存Review标签写的 `review.shown`，无则不写），箭头半开范围菜单。可见且前区非空时才画border1，不造空分隔线。范围菜单与行同宽、下偏移4，行用「菜单行」；Commits子菜单另开popup，宽320（T3 `w-80`）、列表最高320，用 `submenu.js` 的 `subPlace` 放在Commits行旁 |

详情与面板入口按 `chat/PanelLayoutControls.tsx` 的形状：28×28 的 ghost sm、16px 的 square-menu／panel-right，间距按「规则」P3：Details（t3-actions 的 `actions` 块）和 Lists 的新终端 +、panel-right（t3-tabs 的 `tabs-end`）相接成一组，平台窗口按钮另成一组间隔8；组的右缘由布局的 `tabs-end-inset`（12，不归任一 mod）对齐窗格头末个控件（R1），面板打开时 Details 同样离工作列边12。两个块按内容 `layout.resize`，缩放后半像素以内的余量不进位，否则两块之间会多出1。它们在 40px 顶栏上，和品牌栏、面板头一样取「按钮」表的 `chrome` 面（悬停 `hover`、on `selected`），不另造开启底；Details 是触发按钮（`trigger()`）。popup 行属于列表／split 豁免，文字 foreground、图标 dim、底 popover、边 border、悬停同 card 7%，菜单开启用card的12%；父组与半区各自响应hover；非split的行用 `shared/button.js` 的 `cardRow()`。详情机器名是单行截断的电脑名，folder仅tooltip，整行右键出一项 Copy full path 的菜单（与全布局右键一致：右键总是出菜单）。Open in 应用图标是彩色 `image()`；没有专属图标时用本 mod 的 app-window，不引用别的 mod 文件。数值采用本仓token，不直接复制T3的foreground/80或黑白alpha。

详情滚动视口最小高50：一行32、上下各8、外边框各1；自然内容超过420时才在限高视口里滚动。这个下界防止宿主把无确定高度的滚动根测成0，不是把卡片固定成50或420高。内容高度在布局回调中测量，外层明确使用测得高度加2px边框。

## Files 文件头与树

对照 `09a54f01` 的 `files/fileSurfaceChrome.tsx`、`FileBrowserPanel.tsx`、`FileBreadcrumbs.tsx` 和 Pierre `style.js`。

- **文件头**（inline）：高28／下距12／横12（「规则」R1，与面板头同边），无下边线。面包屑在左，最高宽160、横2；› 槽16×20／横外距2／图标14，菜单开着时 on（12%）。右侧两组相隔8（P3）：Open in 分体控件，再是 Preview／Code、Wrap、Tree 三个 sm（28）按钮相接。整排按钮的悬停和 on 面取 `chrome`（P7）。
- **Open in**：`split()`（`sm`，`surface: "chrome"`）：图标半28方、箭头半宽20、图标16、圆角8，总宽49；静止透明无中线，hover 或菜单开时整组一块底并显示1×16 border中线；始终保留箭头槽，禁用不跳位。菜单与 Details 共用 `shared/open-in.js` 的 `targetsMenu`，220宽、行28，右边与组右边对齐（align end）、下偏移4；不画勾，主按钮图标已说明当前目标。应用图标见 `targetIcon`（彩色品牌图、单色品牌标 foreground、其余 dim 通用窗口）。
- **树头**：高36／下距4／横12，按钮与输入框之间8；搜索框用 compact 输入框：高28、横内距9、字12、圆角6；静止透明，hover foreground 7%；焦点背景 background、1px accent 边及内侧3px accent 24% ring（`ui/input-group.tsx`），不改变布局；无×槽，Escape 清空并退出。导航列头（Review 的40高头也一样）横12。
- **树行**（`shared/file-tree.js` 的 `treeRow`，Files 与 Review 共用，插槽不改几何）：行24／字12／圆角6／横内距6.4／外距1.6／图标16／gap4.8；每层缩进 16＋4.8＝20.8，子行图标落在上一层名字下。没有折叠箭头：目录图标是 Lucide folder／folder-open（dim，开合两态），文件是原 Pierre 图形按主题 ansi／dim 上色。Review 的已看框是图标前的固定16槽（加 gap），三态框和状态字母照旧。指针在树上时每层画1px foreground 14% 缩进线，位于该层目录图标中线。hover 7%、selected 12%、右键菜单开着的行7%；键盘焦点环 accent 1px，只在按键移动后出现。ignored／已看：文字 dim、图标50%，已看再加删除线。树 viewport 左内距14.4、右8.4（Pierre `padding-inline` 16 减行外距，右侧再减6px滚动条槽）。树宽 handle 键盘步长16。
- **菜单**：行菜单、面包屑目录菜单和 Open in 都是本 mod 的原生 popup，行用「菜单行」，220宽、上下各4；目录菜单最多12行后滚动。子菜单用 `shared/submenu.js` 的 `subPlace` 放在上一级旁边：右侧放得下放右侧，否则放左侧，第三级可以盖住第一级。行菜单在指针处，面包屑菜单左边与 › 对齐、下偏移4。
- 用户明确删除面包屑和文件树行 tooltip；Open in 分体箭头只留无障碍标签。可点按钮／菜单行显式 pointer。

## Review 顶栏与组页签

- **顶栏**（`DiffPanel` 头）：高40／横12（R1），下有 border。按钮全用 sm（28）、悬停和 on 面取 `chrome`：范围按钮、commit ‹ ›、Analyze、折叠菜单、设置、导航开关；图标按钮相接，文字按钮与图标组之间8。比较目标（combobox 触发）照 T3 留 xs。弹层在按钮下4（顶38），右对齐按钮。
- **组页签行**：横12（与顶栏同边）、纵8、间6；页签圆角8、1px 描边、内距8／2；类别图标14、名字12 medium、第二行11、进度环14；当前组 foreground 12%，其余悬停7%。组说明：标题13 medium、正文12 muted、最高160。

## 壁纸

asciicn 壁纸的控件（`extras/mods/asciicn-wallpaper/main.js`）。切换器：距 Home 右下角12，`chrome` 底、圆角8、内距4、gap4，按钮 `xs` 24（‹ › 取景 +，+ 用 `trigger.js`）；名字槽宽160，Home 窄于304时缩为Home宽减144，截断居中，字12 `dim`。只有指针进入右下368×104、菜单或文件对话框开着、Apply 后1.5s或键盘模式时显示，opacity 150ms ease-out。

`+` 的菜单是本 mod 的 popup：宽260，在 `+` 上方6、右缘对齐 `+`；`popover` 底、内距4，`menu-row.js` 的行28，图标 image／file／external-link／folder；asciicn Studio 一行高44，第二行字12 `dim`。

取景卡是 T3 popover，占切换器的位置：右12、底12、宽300（Home 窄时为Home宽减24）、内距16、gap12、圆角8、`popover` 底、`border` 边、阴影lg、字12 `muted`。各行固定高：名字20（13 semibold `foreground`，截断）、模式28、Fill/Fit 28（分段 flex · 8 · Reset `xs` 24，rotate-ccw）、Zoom 24（− `xs` 24 · 8 · 滑条 flex · 8 · + `xs` 24 · 4 · 读数宽40，12 `dim` 右对齐）、底栏28（状态槽 flex，12 `dim`，错误 `ansi1` 截断；Cancel outline、Apply primary 最小宽72，都是 `compact`；Delete… 是 `compact` ghost）。展开高208，没有模式行时168；紧凑态只有名字、一行进度（spinner 14 加12 `dim` 字）或最多48高的红字原因，再加底栏。卡片贴底，所以底栏在紧凑和展开时位置相同。模式行和 Fill/Fit 是 T3 ToggleGroup：`raised` 底、内距2、gap2、圆角8，每段等宽的 `xs` 按钮、圆角6，模式段横内距3，正在画的那段加12的 spinner；Home 宽不足324时 Quadrants 写作 Quads。T3 没有滑条：轨道高4、圆角4，`border` 底、已选段 `foreground`，圆点16，`foreground`；对数刻度；禁用时整个控件0.64。缩放档位 100／125／150／200／250／300／400%。

等待（`main.js` 的 `track`）：等待不到150ms什么都不显示；一旦显示，至少留300ms，避免一闪而过。新的画先以 opacity 0 在上一张画下面加载400ms（`WARM`，见 [layout implementation](layout-implementation.md)「壁纸转换」），这期间上一张一直显示，Home 不会空白。各处的样子：
- 取景卡紧凑态的进度：名字下面一块高26，字12 `dim` 的步骤名（高16）、间距6、进度条高4（轨道 `border`、圆角4、`overflow_hidden`，进度段 `foreground`）。图片有步骤，所以是确定进度：宽度随步骤变化，transition 300ms ease-out，最后一段在 `WARM` 内 linear 到满；`.ans` 没有步骤，用宽为轨道30%的段 `loop("left")` 来回扫，周期1600ms。等待显示之前这块是空的26高，卡片高度不变。
- 换模式：上一个模式的画留着，opacity 降到0.7（transition 150ms ease-out）；正在画的那段模式按钮里加12的 spinner，底栏状态槽写 spinner 12 加「Drawing Braille…」，画好后在加载期间写「Loading picture…」。
- Apply：超过150ms才把 Apply 写成「Applying…」并把卡内控件画成禁用。
- 切换壁纸、换主题或明暗、Apply 之后：切换器显示时，名字槽（固定宽）里名字左边加12的 spinner、gap6；切换器隐藏时，右12、底12（切换器右端的位置）放一个32见方、`chrome` 底、圆角8的块，中间 spinner 14，随切换器的显隐反向淡入淡出150ms。

## 按钮

按钮一律用 `shared/button.js` 的 `button()` 画，对照 T3 `ui/button.tsx`；为什么按钮例外于规则 2，见 [ADR 0016](../adr/0016-buttons-share-one-helper.md)。颜色只从这张表取，`accent` 不做按钮的底（它是焦点环和强调文字的色），`accent_foreground` 只配 `accent` 底的非按钮元素（`check.sh` 查）。

| variant | T3 | 静止 | 悬停 | on（按下、弹层开着） |
| --- | --- | --- | --- | --- |
| `primary` | `default` | `solid` 底和边、`solid_foreground` 字 | 透明度 0.9 | — |
| `outline` | `outline` | `raised` 底、`input` 边、`foreground` 字 | 透明度 0.9 | — |
| `danger` | `destructive-outline` | 同 outline，字 `ansi1` | 透明度 0.9 | — |
| `ghost` | `ghost-muted` | 无底无边，`dim` 字；`hot` 时 `foreground` | 底见下 | 底见下，字 `foreground` |
| `plain` | `ghost` | 无底无边，`foreground` 字（工具栏里的文字动作，如 Review 的 Analyze、Retry） | 底见下 | 底见下 |

- ghost 和 plain 的底随它所在的面（`surface`）：`chrome` 上悬停 `hover`、on `selected`；`card`（`background` 卡片、`popover`、对话框）上悬停 foreground 7%、on 12%，因为部分主题的 `hover` 等于 `popover` 和 `background`；`row`（侧栏的行和卡片里的控件，T3 行控件）没有底，只变亮；`tab`（标签的 ×）悬停 `raised`，照 T3 tab close 的 `bg-muted`。
- 禁用：整体透明度 0.64（T3 `disabled:opacity-64`），不换底色和字色，没有悬停，不响应点击；禁用的 toggle 不算按下，不画 on 底。
- 焦点：`stop()` 的 2px `accent` 内环，半径取 `radiusOf(size)`。
- 打开弹层或菜单的按钮一律用 `shared/trigger.js` 的 `trigger(view, t, id, { label, hint?, action?, below?, open?, closed?, onOpen, icon?, text?, size?, surface?, color?, disabled? }, extra?)`（P6）：画 `button()`（默认 `sm`／`chrome`）、`tip()` 卡片和 `stop()`；按下记 `pressed()` 和按钮位置，点击时若这次按下刚关掉弹层（`justClosed(view, closed)`）就不再打开，否则 `onOpen(bounds, cx)`；`open` 为真时按钮 on、提示 `off`。`closed` 是弹层 `close()` 写的时间戳键（见 [storage.md](storage.md)）；不传 `open` 时由 `popupOpen(view, id, closed)` 判断：本按钮打开之后键还没再写过。`onOpen` 返回 `false` 表示没开出弹层（如直接新建 space）。不是按钮的触发处（split 的箭头半、详情行、标题、面包屑 ›）用同文件的 `opener(view, { id?, closed?, onOpen, press? })` 接同样的按下和点击，on 态自己画。Review 页内弹层由 `closePopup` 在外部按下时写 `review.<名字>Closed`。
- svg 不吃悬停样式，ghost 的字色变化靠调用方传 `hot`（`view.hot === id`）。卡片上的 ghost 图标按钮一律用同文件的 `ghostButton(view, t, id, { icon, label, act, press?, on?, disabled?, color?, size?, surface? })`（`surface` 默认 `card`，40px 顶栏上传 `chrome`）：它接好悬停（tip.js `glow`）、按下不下传、点击执行，调用方只加 `stop()` 和 `tip()`。
- 不是按钮却按 ghost 方式点亮的元素（详情行），底色取同文件导出的 `tint(t, surface, on)`。
- 尺寸：`default` 32、`sm` 28、`compact` 28（字 12、圆角 6）、`xs` 24、`micro` 20（字 11、圆角 4）、`tiny` 16（圆角 4）；只有图标时是正方形，图标 16/16/14/14/12/12。

分体控件（T3 OpenInPicker／ThreadDetailsControl 的 primary＋secondary）用同文件的 `split()`：一体 ghost 组，底和中线属于整组，见上文 Files 与详情 popup。

不走 `button()` 的：列表行、菜单行（`shared/menu-row.js`，见下）、标签、分段切换（ToggleGroup）、日历格、select 的触发框和画成输入框的按钮（Inbox 的 Search）、按钮组（Actions 的 `▶ | ▾` 共用一圈描边，照 T3 的 ButtonGroup）、输入框自带的 stepper（`NumberInput` 的 − +）、行内链接（Undo，悬停下划线）、命令面板底部的文字动作（只变亮）、Inbox 卡片和行上的悬停控件（T3 行控件，无底）、Update 胶囊、品牌栏 Home。

## 菜单行

所有弹出菜单的行用 `shared/menu-row.js` 的 `menuRow(view, t, id, { at: [state, key, i], label, open?, icon?, lead?, trail?, color?, sub?, disabled?, hint?, pick?, also? })`，照 T3 `ui/menu.tsx` 的 MenuItem：

- 只在指针停在行上或键盘选中时用 `selected` 底；指针离开就熄灭，宿主晚到的 leave 不熄灭指针已进入的下一行（`shared/list.js` 的 `litOnHover`）。子菜单开着时（`open`）父行保持点亮。
- 禁用：整行透明度 0.64（`DISABLED`），不点亮、不响应点击；`hint` 用 `tip()` 说明原因，不用宿主 `.tooltip()`。
- 行尾提示用 `menuHint`，分隔线用 `menuRule`。键盘移动、滚动和子菜单仍由各菜单用 `list.js` 的 `menuJump`／`scrollList` 和 `submenu.js` 自己接。
- 子 agent 列表也用 `menuRow`：每级缩进 16 用 `lead` 放 `16 × 层级 − 8` 的占位（加上行的 gap 8），状态用 `trail`。Review 的 base 和 commit 列表是 combobox，高亮留给 Enter，不用这条规则。

## 程序标志

程序标志直接使用 Herdr 官方资源，各组件沿用 T3 的图标槽尺寸，由 `shared/program.js` 的 `programIcon` 统一绘制。素材的画布、内部留白、宽高比与配色由 Herdr 维护，布局随官方资源更新。mod 提供的自定义图标也按其原画布绘制。

## 有意不同

用户决定保留，不要改回 T3（见 [ADR 0002](../adr/0002-inbox-rules-stay-in-inbox.md) 和 [ADR 0004](../adr/0004-putting-away-lands-on-home.md)）：

- 标签关闭按钮在标签末尾，名字很短的标签最小 96px：末尾那格平时放状态标记。Inbox 右侧的工具标签不显示状态（ADR 0002），那格只会是空白，所以它们按内容收紧、不设最小宽度，悬停时 × 占用图标的位置。
- 标签条放不下时，被裁的一端渐隐，两种模式相同。
- 确认框的执行按钮照 Actions 编辑器的 Delete：`raised` 底、`ansi1` 文字，写出动作；底部 bare。T3 的红色实心按钮在浅色调主题里是一块粉色，和布局别处不搭。
- Settle 后回 Home，Review 回打开它之前的地方。
- `cmd-]` 在 Lists 下也走折叠的组。
- 标签栏高度、工作区框架等 T3 没有的结构，以及 Review 的 diff 内容区。
- 同组图标按钮相接（P3）：T3 只有侧栏头这样，`PanelLayoutControls`、`DiffPanel`、文件头树开关之间是 `gap-1`。面板头的 ‹ › 也相接，T3 是 `gap-0.5`。全窗口一个间距，品牌栏和工作列右上那两对按钮才左右镜像。
- 侧栏顶行 Search 框和按钮组之间 4（T3 原样），不按 P3 的 8：用户定侧栏头保持现状。
- 侧栏卡片和 slim 行横向内边距 8，T3 是 10（R3）。
- 文件树没有折叠箭头，目录图标开合两态表示展开；T3 的 Pierre 树是 chevron。Files 与 Review 两棵树是同一种行（用户决定统一）。
- Spaces 行之间 1，T3 的文件夹之间 8：space 多了太占高度。
- 子 agent 的 Failed 用 `!` 徽章，`ansi1` 的 15% 底，和 Needs you 同形只换颜色：用户决定两者共用一个标记（`shared/status-mark.js`），12px 的底不会成一块粉色。

## 做不到

- 玻璃效果（背景模糊）和弹窗的缩放动画。
- 字距（`tracking-widest`）：kit 没有字距 API。
- 命令面板的背景遮罩：New 和 Go to 是 popup，改 dialog 就不能固定在顶部。顶部 `offset` 96 是 T3 `10vh` 的近似值，宿主只收固定值。
- Herdr 自带的 `space.close` 确认框和 worktree 对话框：数值写死，mod 碰不到。
- 数字框内容居中：`NumberInput` 不接受。
- 竖向滚动条的尺寸由宿主决定。

外壳圆角能做到：`frame: "none"` 由 mod 自画，已用于 16 圆角的 New、Go to、Actions 编辑器、确认框和 Custom snooze。菜单类弹层的宿主外壳本来就接近 8，不用自画。

确认框放在 `t3-actions` 的 `actions: "confirm"` 里，因为宿主 `confirm` 改不了圆角；单独发布的 Inbox 没有 `t3-actions`，回退到宿主 `confirm`。
