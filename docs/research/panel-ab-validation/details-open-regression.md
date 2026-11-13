# Details“点不开”回归

用户原话：**现在这个点不开了。** 参考图：`~/Pictures/Snapzy/Snapzy_2026-11-14_01-00-25_175.png`。

## 根因与修复

在独立 `DEMO=/private/tmp/panel-ab` 复制当前安装目录的三个标题栏 mod，保留安装字节快照，不复制用户共享状态、不操作用户窗口。安装的 `main.js` SHA-1 为 `895dec2485d6669ee99188775c61be7d9e067461`，`workspace-details.js` 为 `d29e374317dea17f0a051ee618598c808afb7845`。

```text
按钮／快捷键命令 → 已注册 popup → 根滚动视口高度0 → 看不见
修后             → 内容层实测 → 明确的非零视口 → 正常显示
```

详情分区重做把固定内容根改成了 `w_full + max_h + overflow_y_scrollbar`，没有确定高度。Herdr 的原生布局把该滚动根测为 **width308、height0**；`status` 仍有 `t3-actions` overlay，`errors=[]`。因此不是按钮事件丢失、Git CLI 异常或锚点落到窗口外。

修复只处理尺寸：不收缩的内层在布局回调中测内容高度；外层滚动视口使用实测高度加2px边框，保留50px最小值、420px上限。只有有效高度变化才notify，0不覆盖既有高度。绘制中不读盘、不启动Git或定时测量。

独立修复提交把同一护栏应用到已提交的旧三行实现和进行中的分区版；不借此提交未收口的其他功能。完整分区重做另外收口。

## 原场景回放

| 证据 | 结果 |
| --- | --- |
| [安装字节、快捷键命令路径整窗](details-regression-zero-height-window.png)／[尺寸](details-regression-zero-height.json) | 已注册但不可见，height0 |
| [修后同窗口整窗](details-regression-fixed-shortcut-window.png)／[尺寸](details-regression-fixed-height.json) | width308、height249.5，当时的详情内容完整显示 |
| [修后宿主状态](details-regression-fixed-status.json) | overlay存在、errors为空 |

同一代码中，按钮的真实 `on_mouse_down/on_click` handler 回放会打开 Details 并保留420px可增长空间；快捷键绑定的 `t3-tabs.details` 命令在原生 demo 成功显示。真实鼠标点击、物理按键的焦点路由未伪称已验证。

回归检查先失败于 `an open Details scroll viewport has room for a control, never zero height`，修后通过；另验证内容240→视口242、长内容→限高420。独立提交快照的 Actions 行为检查和 `herdr-app check` 也通过，见 [检查日志](details-regression-check.log)。

## 校正与边界

先前性能探针只记录“第一次layout发生”，没有断言非零尺寸，0高也产生回调；此前 popup after/cold 计时不作为修后性能验收。后续重测必须同时断言可见尺寸，标签栏计时不受此根视口问题影响。

后续范围已改为Quick Review；旧图只记录尺寸回归，不表示Git功能交付。最新布局和范围选择另看[本轮验收](quick-review-validation.md)。未对外网push、未删除用户文件，未改变用户窗口的焦点、space、tab、pane或zoom。
