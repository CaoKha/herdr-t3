# Herdr 宿主能力验证：A2 Open in、B2b 终端路径点击、B2c 右键 Insert、B4 中键／右键／键盘上下文

验证对象：`Herdr.app` 0.1.15 + `hc`（herdr-core）0.1.21，macOS 本机。
方法：读 `~/.config/herdr-app/herdr.d.ts`、`gpui-kit.d.ts`、`AGENTS.md`（安装版指南）、`hc --skill`、`herdr-app --skill`、`commands` 全表，仓库内先例；在独立 demo（`DEMO=/private/tmp/host-verify`，`scripts/demo/stage.sh up`，自己的 core `HC_SESSION=herdr-t3-demo`）里用 `herdr-app do`／`hc` 实测。产品代码与用户自己的 Herdr 窗口未改动。

## 结论总表

| 待验证项 | 结论 | 首版能不能做 |
| --- | --- | --- |
| 1 终端输出里的路径点击（B2b） | **不支持** | 不能。按需求列为未完成 |
| 2 检测并启动本机编辑器（A2） | **支持**（本机）；远程不支持 | 能做，本机用 `open -Ra` / `open -a` |
| 3 往终端写入但不回车（B2c） | **支持**，但只能写进当前**聚焦**的终端，且会占用剪贴板 | 能做，沿用仓库已有的 `mention()` 做法 |
| 4 元素上的中键、右键（B4） | 右键**支持**（现网在用）；中键**部分支持**（API + 厂商先例，真机事件未测） | 能做；中键的真机验收留作未验证项 |
| 4 `keys.json` 的 `mod:<name>`（B4） | **支持**（文档 + 现网配置依赖），焦点路由真机未测 | 能做，但主路径应走 mod 自己的 `on_key_down` |

## 1. 终端路径点击：不支持

**结论**：mod 无法得知"用户点了终端输出里的某个路径"。既没有链接检测回调，也没有"点击位置 → 终端单元格 → 文本"的接口。因此 B2b 首版列为未完成（与需求写明的一致），不要用别的方式凑。

**证据**

- `herdr.d.ts` 全文与终端有关的能力只有：`terminal.open|kill|keep|park|peek|show|copy|paste|paste_image|scroll|search|right_click|pin`（命令说明第 61–67 行；`run()` 在第 81 行），`focused()`（第 234 行）、`panes()`（第 209 行）、`terminals()`（第 221 行）。没有终端文本、选区、链接或点击回调；`terminal.search` 只是"在焦点终端里开查找栏"，`terminal.copy` 只复制选区。
- 宿主自带的唯一"终端文本里可点"的东西是终端地址：`Ctrl-click`／`Cmd-click` 一个 live 终端地址去 peek（安装版 `AGENTS.md` 第 163 行）。这条由 app 内部实现，没有暴露给 mod，也不是文件路径。
- Herdr 的 VT 引擎会解析 OSC 8 超链接（二进制里有 `osc_hyperlink`／`start_hyperlink`／hyperlink 单元格错误串），但没有可供 mod 订阅的打开动作，也没有给 mod 的接口。
- 终端在 layout 里是 terminal block，不是 mod：mod 收不到它的点击。`terminal_menu`（`AGENTS.md` 第 267、283 行）只接管**右键**菜单，拿到的只是 `{target:{pane,terminal}}`，不含文本与坐标。
- 理论上唯一的旁路（layout 的 `floating` 块盖在终端上）也不可行：`AGENTS.md` 第 392 行——盖上去的块会吞掉所有点击与悬停，而且没有"像素 → 终端单元格"的 API，无法把点击映射到某段路径。
- 能拿到的相关东西（不足以替代）：mod 可以读屏幕文本 `exec("hc",["read","<t>","--lines","2"])`（实测 15 ms，返回纯文本），也能拿 `focused().cwd`；但都回答不了"点的是哪个字符"。

**建议做法**：B2b 首版不做，交付里按需求列为未完成。

**退路**：无。等宿主提供终端 link／click 回调（或 OSC 8 的打开回调）后再做。

## 2. 编辑器检测与启动：本机支持，远程不支持

**结论**：mod 能检测本机装了哪些编辑器并打开目录，代价很小（并行探测 27 ms，启动交接 76–155 ms）。远程机器上打不开（`open` 不存在），与需求"远程只复制路径"一致。

**证据（都在 mod 内用 `exec()` 实测，结果 JSON 见下）**

- 检测：`exec("open", ["-Ra", "<名称>"])` —— 已装 code 0，未装 code 1 且 stderr 为 `Unable to find application named 'Cursor'`。

  | 候选 | 结果 | 单次耗时 |
  | --- | --- | --- |
  | Visual Studio Code | code 0 | 12–24 ms |
  | Cursor / Zed / Sublime Text | code 1（未安装） | 12–27 ms |

  4 个候选 `Promise.all` 并行 **27 ms**，串行 57 ms。`open -Rb com.microsoft.VSCode`（按 bundle id）同样可用；未装时 stderr 为 `LSCopyApplicationURLsForBundleIdentifier() failed…`。
- 启动：`exec("open", ["-a", "<名称或 .app 路径>", "<目录>"])` → code 0，**76–155 ms**返回（只等 LaunchServices 接受，不等编辑器窗口画出来）。缺 app 时 code 1、16 ms，stderr 同上。
  - 用自建的 throwaway `.app` 验证了交接与耗时；它收到的 argv 为空——`open` 是通过 open-document AppleEvent 交付目录，不是 argv。VS Code／Cursor／Zed 都处理这个事件（macOS 常见用法 `open -a "Visual Studio Code" <dir>`），但"编辑器真的打开了该目录"本轮**未实测**：那会在用户桌面上弹出窗口。
- 远程：`hc exec --on kvm open -Ra Cursor` → `{"error":{"kind":"spawn_failed","message":"cannot start open: No such file or directory"}}`。所以远程 space 的 Open in 只能显示不可用（需求 A2 已如此规定）。
- 另有一条已装 CLI 可作后备：本机 `command -v code` → `/usr/local/bin/code`。
- `knownAgents()`（`herdr.d.ts` 第 35 行）只覆盖 agents，不覆盖编辑器，不能复用。

**建议做法**

- 候选表写死少量条目（显示名 + macOS bundle id）：Visual Studio Code、Cursor、Zed（可加 Sublime Text）。渲染弹层时并行探测一次，进程内缓存结果，别每次重探。
- 打开：macOS `exec("open", ["-a", name, dir])`；Linux `exec("xdg-open", [dir])`（未测）。远程（`space.machine` 非空）直接置灰并给原因。
- 失败表现：`code !== 0` 就 toast 出 stderr 的那句话；超时 30 s 默认值与这里无关（实际都在 200 ms 内）。
- 只有 Finder 可用时，主按钮仍是 Finder（本机 `open <dir>`），下拉不显示箭头（与 A2 的"只有一个目标不显示箭头"一致）。

**退路**：完全不列编辑器，只用 Finder；需求 A2 已把这条列为可退方案。

## 3. 往终端写入但不执行：支持，但有三个代价

**结论**：能做——写剪贴板 → 聚焦目标终端 → `terminal.paste`。文本落在 pi／claude 这类 TUI 的输入框里，不回车、不提交；程序开了 bracketed paste 时 Herdr 用 `ESC[200~ … ESC[201~` 包起来。代价：覆盖用户剪贴板、键盘焦点转到终端、只能对"聚焦的终端"生效。

**证据**

- 仓库里已有同一做法，可直接沿用：`shared/file-menu.js` 的 `mention(path, address, cx)` —— `cx.write_to_clipboard("@path ")` → `run("pane.focus",{terminal})` → `run("terminal.paste")` → 150 ms 后写回原剪贴板；剪贴板里没有文本（图片）时直接提示而不是覆盖。
- bracketed paste（demo，一个自己开 2004 的原始字节监听器）：

  | 目标程序 | 收到的字节 |
  | --- | --- |
  | 未开 2004 的程序 | `b'src/main.js\r'`（`\r` 是我事后按的 enter） |
  | 开了 2004 的程序 | `b'\x1b[200~src/main.js\x1b[201~\r'` |

  即：Herdr 只在程序请求 bracketed paste 时加 `ESC[200~`／`ESC[201~`，否则发原样字节；两种情况都**不补回车**。
- 真 agent TUI（demo 里的 pi 1.5.2，deepseek-v4.1-flash）：`pane.focus {terminal:t9}` + `terminal.paste` 之后 `src/main.js` 出现在 pi 的输入行，未提交。pi 空闲时如此；pi 正在跑 `!sleep 8`（屏幕显示 `Running... (escape/ctrl+c to cancel)`）时同样落进输入行。
- 焦点不在终端时**无效**：把焦点交给一个 mod pane（`focused_pane: p8416…`）后再 `terminal.paste`，pi 的输入行没有任何变化；此时 `focused()` 给的是 `{terminal: null, cwd: null, pane: "<mod 的 pane>", agent: "t9"}`。
- 不能替代的两条：
  - `hc send <t> <text>` 是"粘贴 + 回车"——同一个 bracketed-paste 监听器收到 `\x1b[200~src/main.js\x1b[201~\r`，会执行。
  - `hc keys <t> <…>` 只能按命名键：字母、数字、`/`、`.`、`-`、`space` 可以，`_` 与 `~` 报 `unknown key "_"` 并让整条命令失败，而且它是逐字符"打字"而不是粘贴。路径里常有的 `_`、`~` 就打不出来。

**建议做法（B2c Insert into agent terminal）**

1. 目标终端＝当前标签的活动终端（取法见第 5 节，面板有焦点时 `focused()` 为 null，需自己记住最后一次值）。
2. 没有活动终端、或它的程序不接受输入时，菜单项置灰并说明原因。
3. 选中后：文本前补空格 → 保存剪贴板 → 写剪贴板 → `run("pane.focus",{terminal})` → `run("terminal.paste")` → 150 ms 后写回剪贴板。剪贴板无文本时按仓库现有做法提示而不是覆盖。
4. 接受副作用：焦点落到终端（面板失去键盘焦点，点回面板才恢复），剪贴板被短暂借用。这两条要在验收里写清楚。

**退路**：Insert 只写剪贴板并提示"已复制，粘贴到终端"（不动焦点、不动用户剪贴板之外的东西）；需求 B2c 若不接受副作用，可退回这一版。

## 4. 事件与按键

### 4.1 中键、右键（含位置）

**结论**：API 层面两者都支持，右键在本仓库已经是现网用法；中键只有 API 与 Herdr 自带 mod 的先例，本轮没有真实指针事件可测。

**证据**

- `gpui-kit.d.ts`：第 277 行 `MouseButton = "left" | "right" | "middle"`；第 764／769 行 `on_mouse_down(button, handler)`／`on_mouse_up(button, handler)`；第 490 行 `MouseButtonEvent { button, click_count, position, local_position?, bounds?, modifiers }`；第 781 行 `on_mouse_down_out`（外点关闭）。同元素上给左右键各注册一个 handler 是允许的（第 758–763 行注释）。
- 右键的现网先例（菜单就按 `local_position` 定位）：`mods/t3-files/main.js:418/534/573`、`shared/file-menu.js:73`、`mods/t3-tabs/main.js:495/595/625/647`、`mods/t3-agents/rows.js:91/247/310`、`mods/t3-spaces/main.js:262/372/421`、`mods/t3-inbox/row-view.js:59` 等。
- 中键的厂商先例：安装版 `mods/win98/mines.js:176-177` 用 `on_mouse_down("middle")`／`on_mouse_up("middle")`。
- 终端本身的右键走 layout root 的 `terminal_menu` mod，与 mod 自己画的行无关，互不影响。
- 为什么本轮没能真机验证：`herdr-app commands` 里没有任何合成点击或按键的命令（全表 71 个，名字里带 click 的只有 `terminal.right_click`，它只决定右键给程序还是给菜单），而 demo 窗口摆在用户的内置屏上，真实鼠标会占用用户桌面。

**建议做法**：行的右键（B2c 文件树菜单）直接用 `on_mouse_down("right", (e,cx) => …)` + `e.local_position` 定位，和现有菜单一致；中键关标签用 `on_mouse_down("middle")`，但要在验收里留一条真机确认。

**退路**：中键若真机不灵，标签关闭保留 `×` 与 `cmd-w` 两条入口（需求 B2 已列 `×`／中键两可）。

### 4.2 `keys.json` 的 `mod:<name>`

**结论**：机制存在，且用户当前的 `keys.json` 正依赖它区分"面板里的 `cmd-w`"与"终端里的 `cmd-w`"。但"只在该 mod 有键盘焦点时生效、焦点在终端时落回布局级绑定"本轮只有文档与现网配置两层证据，没有真机按键验证。

**证据**

- 安装版 `AGENTS.md` 第 501–503 行：分区为 `global`、`layout:<name>`（该 layout 显示时）、`terminal`（终端有焦点时）、`mod:<name>`，"更具体的分区胜出：`layout:terminals` 胜过 `global`，`terminal` 胜过两者"。
- 安装版 `keys.json` 里三者并存且互不冲突，正是需求要的行为：`layout:herdr-t3` 有 `"cmd-w": "t3-tabs.close-tab"`、`"cmd-t": "t3-tabs.new"`，同时 `"mod:t3-files": { "cmd-w": "t3-files.close" }`、`"mod:review": { "cmd-w": "review.close" }`。只有当面板有焦点时前者才压过布局绑定，否则 `cmd-w` 就该关终端标签。弹层 mod（`mod:confirm`、`mod:help` 等）同样是"弹出层有焦点时"才把 `cmd-w` 改成 `overlay.close`。
- 仓库里更稳的路径是 mod 自己吃键：`this.h = cx.focus_handle()` + `.track_focus(this.h).on_key_down(...)`（`AGENTS.md` UI 段），t3-files 的 Escape／方向键就是这么做的。mod 只有拥有键盘焦点才会收到 `on_key_down`，天然满足"焦点在终端时不抢键"。

**建议做法**：`cmd-t`（面板里开 `+` 菜单）与 `cmd-w`（关面板标签）在面板 mod 里用 `on_key_down` 处理；`keys.json` 的 `mod:<name>` 分区只作补充（例如仍把 `cmd-w` 指到 `t3-files.close`），并在验收里补一条真机按键回放。

**退路**：只靠 mod 内 `on_key_down`，不动 `keys.json`；代价是"面板有焦点"必须是真的键盘焦点（要点一下面板）。

## 5. 顺带发现的两个硬约束（影响 A2／B2b／B2c 的实现）

1. **面板有焦点时 `focused()` 基本是空的**。实测（`host-probe` mod 在面板聚焦时取的快照）：

   ```json
   "focused": { "space": "sp78…", "tab": "tbf3…", "terminal": null, "shown": null,
                "pane": "p8416…（面板自己的 pane）", "agent": "t9", "cwd": null }
   ```

   由此：
   - A2 的"目录优先当前终端 cwd"必须在详情弹出**之前**取（需求 A3 的"打开时确定来源"正好对上）；弹出后再读就是 null。
   - B2c 的"当前标签的活动终端"不能用 `focused()` 取：面板有焦点时为 null；`TabInfo`（`herdr.d.ts` 第 88–112 行）没有活动 pane id，`panes()` 也没有"tab 的活动 pane"标记（面板聚焦时全部 `focused:false`）。可行做法是 mod 每次拿到非 null 的 `focused().terminal` 就记住，作为"当前标签的活动终端"的最后一个值；或退一步用 `agents()`（第 159 行起，带 `tab`／`focused`）取该 tab 的 agent（仓库 `shared/file-menu.js` 的 `agentFor()` 已是这个思路）。
2. **远程**：mod 的 `exec(..., {on: "<machine>"})` 只认**该 core 自己**配置过的机器——demo 的独立 core 没配机器，`exec("uname",[],{on:"kvm"})` 直接报 ``Error: `herdr.exec`: unknown machine "kvm"``（16 ms）。用户 core 上有 `kvm`，实测 `hc exec --on kvm uname -sm` → `Linux x86_64`，`open` 则 `spawn_failed`。远程 space 的 cwd 只能靠 `panes()`／`focused()` 上的 machine 前缀值（`herdr.d.ts` 第 185 行起的 `PaneInfo.cwd`），本轮未在真远程 space 上实测。

## 6. 复现命令

```sh
# demo（自己的 core 与 app home，不动用户的窗口）
DEMO=/private/tmp/host-verify sh scripts/demo/stage.sh up

# 2 编辑器检测与启动（在 demo 的 mod 里用 exec 调；shell 里等价命令）
open -Ra "Visual Studio Code"; echo $?   # 0
open -Ra "Cursor"; echo $?               # 1, stderr: Unable to find application named 'Cursor'
open -a "/private/tmp/host-verify/probe/Probe.app" /private/tmp/host-verify/probe/target-dir
hc exec --on kvm open -Ra Cursor         # spawn_failed

# 3 写入但不回车：监听器 + 剪贴板 + paste
python3 raw.py bp 60                     # 开 2004 的原始字节监听器
printf 'src/main.js' | pbcopy
herdr-app do pane.focus '{"terminal":"t3"}'
herdr-app do terminal.paste              # 监听器：b'\x1b[200~src/main.js\x1b[201~'
hc send t5 "src/main.js"                 # 对照：粘贴 + 回车，b'\x1b[200~src/main.js\x1b[201~\r'
hc keys t6 a / . - space                 # 可以；hc keys t6 _  → unknown key "_"

# 4 命令表里没有任何合成点击/按键的命令
herdr-app commands | jq -r '.[].name' | grep -iE '(click|key|input)'
# terminal.right_click 一个，且它只设定右键去向
```

demo 已 `stage.sh down` 关闭，`/private/tmp/host-verify` 已删除；过程中的探针 mod 只写在 demo 自己的 app home 里。

## 7. 本轮未验证（不要当成已支持）

- 真实的中键、右键事件投递，以及 `keys.json` 的焦点路由：没有输入合成手段，也没有在用户桌面上做真实鼠标／键盘自动化。
- `open -a <editor> <dir>` 之后编辑器真的打开了该目录（AppleEvent 交付）；只验证了交接成功与耗时。
- 远程 space 的 `cwd` 读取与远程 Open in 的实际表现（demo core 没有配置机器）。
- Linux（`xdg-open`）与 Windows。
- 用户剪贴板里是图片时的 Insert（`cx.read_from_clipboard()` 返回 `undefined`，仓库现有做法是提示后不覆盖；本轮剪贴板是文本，未走到这条分支）。
