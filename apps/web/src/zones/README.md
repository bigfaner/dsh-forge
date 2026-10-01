# zones/

定位：**基础** —— 三区结构骨架：容器、视图互换机制、页签跟随（布局机制，无域内容）。填充：2.5。
边界：禁 import `views/`、`flows/`（依赖铁律① 基础↛业务，oxlint + selftest 机械执行）；域内容一律经 `WorkbenchZoneSlots` 槽位注入。

- `WorkbenchZones.tsx` —— 三区容器：左 rail 常驻槽 / 中区会话⇄知识视图互换（keep-alive：双面板
  常挂载 + `hidden` 属性切显隐——切换零状态丢失）/ 右 dock 轨道（收起归零 ↔ 页签条+内容区；知识
  视图态强制隐藏，切回按记忆恢复——`dockTrackMode` 推导）。页签条 = 官方 `SegmentedTabs`、控制钮 =
  官方 `Button`（Hard Rule 官方件复用优先；dockkit `DockSurface` 拆分/浮动引擎 2.6+ 消费，本件不预建）。
- `dock.ts` —— UF-7 页签跟随纯逻辑：登记表（全局 + 按项目；登记 fail-loud / 撤销幂等）与可见集推导
  （可见 = 当前项目页签 + 全局页签，注册序；推导即跟随——切项目换集不打断、切回恢复，含激活页签
  回落/恢复）。锚点断言：`WorkbenchZones.test.tsx` + `dock.test.ts`（UF-5/UF-7 Validation 全三条）。
- `slots.ts` —— 槽位契约：`rail` / `session` / `knowledge` / `renderDockTab`（缺省 = 机制占位——
  M0 知识面板空态占位入槽）。
- `zones.css` —— 布局样式（零裸值令牌纪律；结构基准 = 第一版原型：宽度轨道收展 + hidden 守卫）。
- 状态唯一源 = `shell/view-state`（React 绑定 `shell/use-shell-view`）；三区装配（hero 相位/真实视图
  注入）归 2.12。
