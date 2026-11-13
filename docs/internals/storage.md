# 数据存在哪里、怎么取名、怎么读写

布局里凡是要保留到下一帧之后的数据，都按本文存放、取名和读写。本文是唯一出处：新增一种数据、改一个键名，先改这里。

## 六个地方

先问两件事：谁要看到它，它要留多久。答案决定存放位置。

| 存在哪里 | 放什么 | 谁看得到 | 留多久 | 例子 |
|---|---|---|---|---|
| 终端标签 | 某个终端（agent）自己的事实 | 每个窗口、每台机器 | 和终端一样长 | `settled`、`snoozed` |
| 共享状态 `shared()` | 本机几个 mod 共用的数据 | 本机所有 mod、所有窗口 | 重启后保留 | `t3.pins`、`t3.settings` |
| `localStorage` | 一个 mod 自己的界面状态（折叠、筛选、收纳区开合） | 只有这个 mod 副本 | 重启后保留 | Inbox 的 `scope`、`settled.open` |
| 内存 | 本次运行的记忆 | 只有这个 mod 副本 | 重启就没了 | `navigation.js` 的 `trail`、`lastIn`、`fresh` |
| 布局文件 | Herdr 没有命令能改的布局字段 | Herdr | 直到下次更新覆盖 | `traffic_lights` |
| 用户文件夹 | 用户放进来的文件，和由它们生成的缓存 | 读它的 mod，以及用户本人 | 直到用户删除 | `<appHome>/asciicn-wallpaper/*.ans` |

- **终端标签**只经 `shared/labels.js` 的 `writeLabel` 写：它统一报错（`Couldn't update the agent`），返回是否写成；`quiet` 用于会重试的写入，只在第一次失败时提示。
- **内存**里的记忆在代码注释里写明「只记本次运行」，必要时附 `shortcut:` 说明何时改为持久。
- **用户文件夹**放在 `<appHome>/<用途>/`，不放进 mod 文件夹：`scripts/update.sh` 用 `rsync --delete` 更新 mod，会把它冲掉。生成的缓存放在其中的隐藏子目录（`asciicn-wallpaper/.tiles/`），以源文件的 `cksum` 加生成代码的版本号为键，最后写完成标记，所以源文件改了、生成中断、或生成代码换了，都会重新生成；源文件没了，缓存一起删。
- **布局文件**只用 `writeTextFile` 带 `expected` 写，在文本里只替换那一个字段，替换后和解析结果核对。`layout.set` 会清空 Herdr 记的点击状态（侧栏宽度、当前 stack、选过的主题），不用于外观字段（[ADR 0009](../adr/0009-settings-hold-real-preferences.md)）。

### 壁纸草稿

构图期间的合成预览纹理和分块文件也只写在该草稿的 `.preview/<unique-id>/` 中，随草稿清理；图形正文、主题签名和纹理路径只在内存里。它不是源文件或最终 `.tiles/` 缓存，不持久化新的偏好。

图片和 Studio `.ans` 导入都先建立本次运行的内存草稿：原图引用、转换结果、请求身份、相对构图和 `draft.savedName` 不提前持久化。新图片只生成 Dots，`.ans` 保留原字符画法；迟到的读取或转换必须核对请求／草稿身份。`draft.savedName` 只记这个草稿已经发布的 `.ans` 文件名：Apply 的最终缓存失败时保留草稿、预览 SVG 和已发布的源文件；重试只可复用同一草稿记下的文件，并先逐内容核对它与当前草稿一致。文件缺失或内容不同就按不覆盖规则另存，不能复用其他草稿或仅仅同名的文件。预览用的 SVG 写入 `<appHome>/asciicn-wallpaper/.preview/<unique-id>/`，每个草稿独占一个目录，和已导入壁纸的 `.tiles/` 分开。每次 app 运行，各副本共用 `previewsReady` promise，在创建草稿前只清理一次上次运行的遗留预览；之后各副本仅在取消、成功应用、关闭时清理自己的草稿目录，不扫描其他运行中副本的目录。

预览不写 `.ans`，也不改变共享的 `asciicn-wallpaper.scene`。**Apply** 保存 `.ans`，最终场景就绪后才写构图、更新选择并清草稿；**Cancel** 保留原来的选择、构图和文件，包括失败的 Apply 已发布的 `.ans`。只保存生成的画，不复制或修改原图；原图引用不持久化，保存后没有回到原图编辑的入口。删除已导入的壁纸必须先显示文件名并再次确认；取消确认不删除文件、缓存或构图。确认删除不依赖转换期间暂时移出的显示列表；它使对应的在途转换及等待中的 Apply 失效。取消标记与任务一起只留在内存中，等任务结束才释放，防止新任务与未结束的旧任务并行写同一缓存。迟到的结果既不能发布场景、选择或构图，也不能留下重建的缓存。

`shared("asciicn-wallpaper.placements")` 是本 mod 唯一写入的持久构图表，键为 `file:<文件名主干>`，值为 `{ mode: "cover" | "contain", zoom: 1..4, x: 0..1, y: 0..1 }`。x/y 表示画布与缩放后图片之间剩余空间的对齐比例；0/0是左上，0.5/0.5居中，1/1是右下。画布／侧栏尺寸变化和主题切换只重算相同参数下的几何，不重转字符画。读取有限数值并钳制范围；无记录保留旧壁纸的主体focus和铺满规则。构图独立于 `.tiles/` 可重建缓存；确认删除后清对应条目，外部源文件消失时也清理；扫描开始后若有更新构图提交，旧扫描不得删掉新记录。拖动、缩放、重置只改草稿，不写共享表或文件。Reset 保留当前 mode，只恢复居中与1倍。

用户文件名保留合法 Unicode、前导短横和普通隐藏名；文件枚举及校验元数据用 NUL 分隔，文件路径按参数而非选项处理。外部 `.ans` 的文件名主干为空、`.` 或 `..`（`.ans`、`..ans`、`...ans`）时安全拒绝，不能把它们用作 `.tiles/` 缓存目录；`.hidden.ans` 等普通隐藏文件照常支持。转换器版本 2 使用 40 大小的图块，使展开后的阴影图形也低于每次写入的 1 MiB 上限；旧版缓存通过现有版本键重建。

Apply 和 Studio 导入保存时，在独占的 `.preview/save-<unique-id>/` 写入文本分块（每块最多 64K 个 Unicode 字符，低于 `writeTextFile` 的 1 MiB 上限），拼成完整文件后通过 POSIX `link` 原子发布目标 `.ans`；已有文件、符号链接或目录都不覆盖。成功或失败都清理自己的保存目录，源图和其他草稿保持不动。

确认删除先等待同名、已启动的源发布收口再删文件，避免发布落在删除之后；等待中的重试收到删除取消标记后不能再发布源文件。发布 promise 和 Apply 取消标记都只留本次运行的内存，任务结束即释放。

## 共享状态的键名

布局 mod（`mods/`）带数据的键都列在 `shared/store.js` 的 `KEY` 里，代码只写 `KEY.<名字>`，不写字面量；`extras/` 里的 mod 按同一取名规则管理自己的键（`review.shown`）。取名按写入方：

- **`<mod>.<name>`**：只有一个 mod 写，其他 mod 可以读。`t3-tabs.home`、`t3-inbox.rows`。
- **`t3.<name>`**：几个 mod 都写，或者属于整个布局。`t3.pins`、`t3.notice`、`t3.settings`。
- `<name>` 用 lowerCamel：`t3.spaceIcons`、`t3.agentOrder`。

两类按约定取名，不进 `KEY`：

- **弹窗关闭时间戳**：mod 整个就是一个弹窗时用 `<mod>.closed`（`t3-picker.closed`）；mod 平时是别的东西、另外还会以某种弹窗打开时用 `<mod>.<那种弹窗>Closed`（`t3-agents.sortClosed`）。由弹窗的 `close()` 写，打开它的控件用 `focus.js` 的 `justClosed` 读。
- **名字由别人定的键**，照用：和 Herdr 自带 mod 共用的 `layout`、`space.colors`、`agents.sort`；Inbox 的 mod 卡片约定 `<mod>.program`、`<mod>.status`、`<mod>.titles`。

## 读写

`t3.panels[space]` 保存 `{ open, wide, tabs, active }`，标签为 `{ id, path?, born }`：`files`、`file:<相对路径>` 或 `review`。`born` 是同名标签关闭再开后的新实例号，使隐藏 mod 也能识别状态已释放。旧 `{ page }` 在首次读取时转成一个对应标签；无记录从空列表开始。布局 stack 子块只是渲染位，空列表选择 `panel-empty`（独立 Review 安装无此块时回退 Files 渲染位）。

`selected` 是最后一次选择标签的事件号，用于 Files 在重复选择当前标签时也清空搜索并定位；旧 `page` 字段只作 stack 布局回传的同步记号，不是可见的页签模式。`t3-actions.openTarget` 全局只保存一个目标名；本机每次运行并行检测应用列表，目标卸载时回退 Finder。最后一个非 null 的活动终端（space/tab → terminal/cwd/pane）只保留在本次运行的 `globalThis.t3TerminalContext`，与 focus.js 一样依赖宿主当前共用 JS context；终端关闭即移除。Insert 短暂借用文本剪贴板，粘贴后恢复；图片剪贴板不覆盖，用户在延时内新复制的内容优先。

Files 的树按 space 共用，文件阅读位置按标签实例只记本次运行；每个 space 仅最近显示的三个文件标签保留预览和 Editor，更早标签从顶部重读；关闭立即释放。页级最近三个 space 的边界照旧，因此最多九个文件 Editor。Review 标签关闭同步删除 `review.shown[space]`，其内存副本按实例号驱逐，迟到读取失效。详情来源和弹层 id 只通过 popup props 传递，不写持久状态；本机机器名在弹层启动时读取。

`globalThis.t3Titlebar` 只记本次运行测到的标题栏末端和面板宽度，供键盘打开详情时锚定到同一入口；不写共享状态或磁盘。Insert 拒绝带控制字符的路径，防止粘贴成为终端控制输入；Copy path 仍可用。

- 几个 mod 都要读写的数据，经 `shared/` 里的一个模块读写，默认值也写在那里：置顶经 `shared/pins.js`（`pinList`、`pin`、`unpin`、`putBack`），布局设置经 `shared/layout-settings.js`。所以 Pin 不管从哪里点，都会结束 Snooze；Undo 不管从哪里点，都会把置顶放回原位。
- 只有一个 mod 读写的键，在那个 mod 里写 `shared(KEY.x) ?? 默认值`。

## `localStorage` 的键名

小写单词，用点连接，写成 `<东西>.<状态>`：`settled.open`、`repos.folded`；只有一个词就够时用一个词：`scope`、`changes`。每个 mod 副本各有一份，不加 mod 前缀。

Files 和 Review 各自保存 `lines.wrap`（布尔字符串）、`nav.width`（逻辑 px）和 `nav.open`。两页复用读写函数，但只访问自己副本的 `localStorage`。`migratePagePrefs()` 在各页初始化时，从旧 `t3.wrap`、`t3.navWidth` 复制尚未设置的初值；更早的 `review.prefs.wrap` 作为换行初值的后备。旧共用偏好暂留作尚未启动页面的迁移来源，不再写入，也不参与已迁移页面的日常读取。跨页请求 `review.reveal`、`t3-files.reveal` 已退休，迁移只清理它们。

两页的完整 space 数据都是本次运行的缓存，每页最多保留最近三个。较早的 space 只留轻量的选择、展开和评审范围等阅读设置；文件内容、Editor、diff 行、换行和布局缓存都要释放。驱逐时使已发出的异步读取失效；迟到的结果不能重新填满已释放的数据。两页使用仅可见时的有界刷新，不保留不可退订的目录监听。关闭 space 时一并清理它的内存记录。

## 改名

布局有真实用户（[ADR 0008](../adr/0008-change-behaviour-without-toggles.md)），所以改持久的名字必须带迁移：

- 共享状态的键：在 `shared/store.js` 的 `RENAMED` 里加一条 `[旧名, 新名, 是否带走值]`。只是缓存或转瞬即逝的值不带走，只删旧键。新名下已有值时以新名为准，但空值（`null`、空数组、空对象）不算有值。`t3-tabs`、`t3-inbox`、`t3-actions` 在 `init` 里调 `migrate()`，它们任何一个都可能单独运行。
- `localStorage` 的键：读它的 mod 在 `init` 里调 `migrateLocal([[旧名, 新名]])`。
- 终端标签不改名：它们分布在各台机器上活着的终端里，没有地方能一次迁完。所以 `settled`、`snoozed` 不带前缀，和 `herdr.seen`、`pi.session` 不同，这是本规则之前就有的例外。

迁移条目保留到确定所有安装都已更新过一次后再删。
