# 在 Home 时右侧是一整块表面

Home 原来和别的标签一样放在带框的 `home-main` 里：上面一条 `chrome` 色的标签行（侧栏显示时折到 8），四周留出间隙和圆角。Home 是壁纸时，图被框在中间，顶上那一条什么都没有，看起来像两块拼在一起。2026-11-20 用户决定：Home 只放一个页面或 mod 时，侧栏右边一直到窗口顶边都是 Home，壁纸铺到顶。

做法：

- **单独的布局分支。** `work` 的内容改成 stack `work-view`，两个分支：`work-away`（今天的标签行、`work-body`、`work-bottom-inset`，离开 Home 时用）和 `work-home`（`home-row` 加 `home-surface`）。`home-surface` 是当前标签，`background` 底色，没有边框、圆角和间隙。`t3-tabs` 的 `fitRow` 每帧用 `layout.select` 选分支。原因是布局有两条限制：节点之间不能叠放，所以图没法画在标签行下面；运行时不能改 `padding`、`radius`，因为 `layout.set` 会重写布局文件（ADR 0009、`docs/internals/storage.md`）。剩下的办法只有切到另一套事先写好的节点。
- **顶行固定 40，自己画那一截图。** `home-row` 是 `t3-tabs` 的 part `home`，`window_drag`，侧栏显示和隐藏都是 40 高：在 Home 时总有地方拖窗口，切侧栏时 Home 不跳，`t3-home` 按钮组仍相对整个窗口居中。它没有壁纸时是 `background` 色；有壁纸时画同一张图，大小相同，`right` 相同，`top` 下移 40，再按自己的边界裁掉，两块拼起来是一张图。侧栏隐藏时，开关和 Undo 通知浮在图上，通知放在 `chrome` 底的圆角块里。
- **壁纸通过 `t3.homeShown` 告诉顶行。** 壁纸每次渲染时写出真正画出的那一层 `{ path, w, h, right, top, opacity, home }`，变了才写。顶行只在 Home 当前标签只有一个 `asciicn-wallpaper` pane、并且 `home` 等于当前 Home 时才画，否则用 `background` 色。规则见 `docs/internals/storage.md`。
- **终端或拆分的 Home 仍带框。** Home 设成 Terminal，或被人拆成几个 pane 时，仍走 `work-away` 加带框的 `home-main`，和以前一样：终端贴着分隔线和窗口边很难看，拆分的 pane 之间也要间隙。

代价：

- 这个 key 整台机器只有一份，pane mod 又不知道自己是哪个 pane，没法按 pane 分开写。所以只有顶行读的那个实例写（Home 正在显示、它是 Home 那个 tab 唯一的 pane）；两个实例都写会互相覆盖，每次写都让对方重绘，停不下来。
- 两块图分别由两个 mod 画，GPUI 取整不同时接缝处可能差 1px；构图可能和带框时差约 8px。
- 拖动、缩放构图时每帧都写一次，`setShared` 会让所有 mod 重绘。
- Herdr 会关掉不在显示的分支里的 mod。在整块 Home 时，`work-away` 里的标签栏其他部分、Actions 和 pane 栏都没有加载，它们的命令在 Home 时用不了；离开 Home 时它们重新 init，量好的宽度从头量起。`bar-measure` 关闭时把 `compact` 写成 false，唯一读它的 Actions 也在同一分支，所以看不出来。demo 的 stagehand 因此放在 `work` 下、stack 之外。
- 分支切换和顶行的那一截图都晚一帧：`fitRow` 和壁纸的 `t3.homeShown` 都在渲染里写，布局和别的 mod 下一帧才跟上。前台窗口里是一帧（未单独验证）；demo 的后台窗口只在截图时出帧，所以要连拍两张。
- Windows、Linux 上 `home-row` 自己画窗口按钮，demo 只能在 macOS 上跑，未验证。

## Considered Options

- **标签行改成透明，图画到它下面**：否决。布局节点不能叠放，标签行下面没有 Home 的像素。
- **在 Home 时用 `layout.set` 去掉 `home-main` 的框和间隙**：否决。`layout.set` 会重写布局文件，用户的改动会被冲掉（ADR 0009）。
- **顶行在 Home 时收到 0 高**：否决。在 Home 时就没有地方拖窗口；侧栏隐藏时开关也没地方放，切侧栏时 Home 还会跳。
- **顶行自己读壁纸的设置和缓存，算出图的位置**：否决。取景、缩放、模式、图片加载都在壁纸里，复制一遍会和壁纸慢慢对不上；只让壁纸说出它画了什么，顶行照着画。
- **key 叫 `asciicn-wallpaper.shown`**（设计时的写法）：否决。`store.js` 的 `KEY` 只放 `t3` 和 `t3-*` 的名字；这是一个 mod 写给另一个 mod 读的布局 key。
- **终端或拆分的 Home 也铺满**：否决。终端没有内边距会贴着侧栏分隔线；几个 pane 之间需要间隙，而间隙只能在带框的分支里有。
