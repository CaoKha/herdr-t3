# 壁纸图片：四种画法对齐与性能验收

范围：新图片Dots/Braille/Blocks(`░▒▓█`)/Quadrants；网站网格、cover、超采样块平均、autoLevels和字形阈值；主题ANSI16与8档明度不透明度；固定模式行和可取消的草稿重建。Classic/Dense、浅色反转、EXIF、保存后编辑、正式壁纸纹理／淡入和密度不在本轮。后续独立优化见[优化研究](../wallpaper-optimization/README.md)。

## 结果与逐格证据

- `photo-oracle.log`：实际原图在native demo导出的四种画法，**每种320×96=30,720格，明暗两组字形及每格RGB与真正上游mapTones均0差异**。这是主题映射前的RGB；显示颜色按用户约束全部取主题，不宣称和网站真彩相同。
- `check-ascii-art.cjs`：独立上游fixture的四模式各384×96格；112个VGA/随机色的OKLab最近槽、8档value、阈值、空白边、采样平均、BMP完整度与分块均通过。6个旧转换产物SHA和263个内置资源文件SHA保持不变。
- 上游确认为 `d5592fc980cad39578f13b16f6e015404160669b`，MIT。复核纠正了原报告笔误：Dots是**6档**（空白加5点），阈值0.1/0.3/0.5/0.7/0.9；最近VGA槽用OKLab，不是RGB欧氏距离。独立oracle生成器在mod的`fixtures/`，照片回放脚本为`photo-oracle.ts`。

新图片的`.ans`带非绘制OSC版本标记，重启后仍为0.5格宽比及新颜色映射；不改旧纯半调的方格推断。旧无标记`.ans`与内置画继续走原4档和原几何，不迁移、不改写。未复制用户已导入文件当fixture；旧源兼容性以旧路径字节哈希检查，不以修改用户目录来验收。

## 整窗与网站并排对照

只读 `~/Pictures/146943457_p0.png`（2756×1654），SHA256 `c18f70dc005ec5fa88397ff77ec41d9bfc8de9526e9ec1368595009c66266f83`；客体用副本。已有隔离macOS VM、`DEMO=/private/tmp/wallpaper`，独立app/core/HOME，1280×699整窗、默认256侧栏、zoom1；无viewer、VNC、共享目录或剪贴板桥。宿主没有本任务GUI输入。

下列PNG保存在本目录，按仓库规则不入Git。已逐张亲看8张完整原图；卡片及4个全名没有裁切或空白图标（本轮用文字，不增图标）。`compare-captures.py`把报告的网站算法面板放左边、**完整**demo窗口原尺寸放右边，不裁掉侧栏或卡片。

| 画法 | 暗色整窗／并排 | 浅色整窗／并排 |
| --- | --- | --- |
| Dots | `final-dark-dots.png` / `compare-dark-dots.png` | `final-light-dots.png` / `compare-light-dots.png` |
| Braille | `final-dark-braille.png` / `compare-dark-braille.png` | `final-light-braille.png` / `compare-light-braille.png` |
| Blocks | `final-dark-blocks.png` / `compare-dark-blocks.png` | `final-light-blocks.png` / `compare-light-blocks.png` |
| Quadrants | `final-dark-quadrants.png` / `compare-dark-quadrants.png` | `final-light-quadrants.png` / `compare-light-quadrants.png` |

浅色测试明确切了`appearance=light`；`app.theme`只选择主题槽并不切明暗，脚本已修正，`check-mode-performance.py`要求两组palette确实不同。浅底上的白色亮部较淡、近底片效果是本轮按VGA槽／value映射的真实现状，**没有顺手做反转或按暗度取透明度**；该项由独立后续范围处理。

`button-positions.json`／`pixel-measurement.log`：24张原生整窗覆盖四模式、loading、converting、error、saveError、Applying、快速切换和Studio固定字形行，**13个按钮像素配准偏移全部为0**；文字／图标用归一化配准，避免颜色或禁用透明度让字形阈值边界虚假变化，脚本自检能抓1px平移。三个底部按钮另测实体背景位置。布局行为检查覆盖312组状态×平台×主题×宽度，包括四种模式转换中和窄卡的Quads短名。

## 性能与过期任务

Zoom优先独立修复已在 `3e3f4f21` 提交：[根因与同图回放](../wallpaper-composition-redo/performance.md)。原生CPU帧均值 **185.63→1.19ms**，100步Zoom事件间隔p95 **260→23ms**；拖动／缩放／方向键的转换和文件调用均0。SVG mask缓存以绘制尺寸为key，故草稿改用固定分辨率原生image缓存，输入只改几何；正式壁纸仍是原SVG。

四模式实际native重建的指标在`mode-performance.json`／`.log`，不是Node时序：

| 模式 | 暗／浅切换总耗时(ms) | 暗／浅16ms心跳间隔p95(ms) |
| --- | --- | --- |
| Dots | 1203 / 959 | 30 / 32 |
| Braille | 1362 / 976 | 31 / 32 |
| Blocks | 1473 / 1053 | 33 / 32 |
| Quadrants | 2239 / 1748 | 28 / 32 |

生成器单步最高25ms；模式期间心跳最大45ms，没有长时间占住主线程。心跳是输入事件循环响应的旁证，不冒充GPU呈现或原生CPU帧时间。6ms预算批处理便宜yield，下一块前检查代次；所有模式复用`draft.pixels`，没有source re-decode。

`final-rapid.json`：快速连续请求4种模式，代次增加4，但采样只有最终Quadrants的1021块，与单次Quadrants完全相同，不排队完成旧计算。生命周期检查还暂停旧tile写入，再切新模式，释放旧任务后核对新text、scene和纹理不被覆盖。

首次真实大图另抓到宿主`exec`静默截断8MiB的限制：15MiB BMP/base6420MiB只解了前39/96行，见`truncated-draft-before.png`、`initial.json`。修复为3字节对齐的786432B块（每块base641MiB）传输、直接分块解码、RGBA分配前验证完整度；最后的RGBA转码每4096像素让出。`bounded-import.json`回放完整96行：导入总8.285s，解码单步最大 **197→13ms**、心跳p95 **55→30ms**、最大 **197→35ms**。导入CPU成本与切换耗时分别记录，不用小图片或截断数据伪装提速。

## 保存、竞态与门禁

`final-applied.json`：真实四模式草稿完成后Apply，只发布`.ans`和构图；保留Quadrants／OSC标记、aspect0.5、contain/1.7/0.65/0.25。`after-restart.json`重启重读相同选择／构图／aspect；`final-studio.png`保留并禁用处理行。最终撤probe后的`production-check.log`记录原生check及`status.errors=[]`，`production-final.png`是生产代码整窗。

只读审查的两个反例已修并独立回放错误消失，见`review.md`：黑色`#000000`不再重复替换成非法颜色；旧job在等待清旧目录时被新模式取代、且新模式失败，不会删除仍在显示的已发布frame。`black-theme-red.log`、`published-frame-red.log`、`lifecycle-green.log`保留红绿；行为检查带watchdog，未完成的Promise不能静默退出算通过。

已执行`scripts/sync.sh`和`scripts/check.sh`。壁纸专属最终门禁见`owned-check.log`；全仓这次失败日志是`repository-check.log`：并行tooltip的`mods/t3-chrome/measured-text.js`缺失、spaces/sidebar及tabs实测文字断言，以及Review `check-colors`的`PANE`未定义，均属panel-ab施工中间态。用户已确认壁纸先独立提交、由原owner补齐总门禁；**不将这次全仓失败写成all checks passed**。早先整仓绿色记录是`repository-check-in-progress.log`，不替代当前结果。同步见`sync.log`。本mod不复制进三个standalone仓库，本轮没有归属壁纸的外部改动；其中并行A/B改动由其所有者提交，不代暂存。

提交顺序：`3e3f4f21`性能修复 → `d45de403`网站映射/BMP边界 → `feat(wallpaper): add fixed-slot image mode previews`（UI、集成、文档与证据）。均不push。没有删除产品文件或用户数据；去掉了重复Braille生成逻辑，保留入口复用公共mapper；任务临时资源在收尾清理。

未验证：原生chooser（probe从真实startPreview送文件）、新模式按钮的真实点击／方向键（行为检查与CLI实跑，非物理输入）、Linux/Windows实机、EXIF与Classic/Dense；未重新生成内置资源。原生缩放内核与浏览器canvas不同，逐格一致针对**相同采样字段**；网站实际网格也随舞台大小改变。上述后续功能不在本轮擅自扩展。
