# zones/

定位：**基础** —— 三区结构骨架：容器、视图互换机制、页签跟随（布局机制，无域内容）。填充：2.5（fix-10
右栏官方基座化）。
边界：禁 import `views/`、`flows/`（依赖铁律① 基础↛业务，oxlint + selftest 机械执行）；域内容一律经
`WorkbenchZoneSlots` 槽位注入。

- `WorkbenchZones.tsx` —— 三区容器：左 rail 常驻槽 / 中区会话⇄知识视图互换（keep-alive：双面板
  常挂载 + `hidden` 属性切显隐——切换零状态丢失）/ 右 dock 轨道（收起归零 ↔ 官方面；知识视图态
  强制隐藏，切回按记忆恢复——`dockTrackMode` 推导）。fix-10：右栏内部 = 官方
  `@deepseek-ai/dsh-client-ui-dockkit` 基座（`DockController` 状态机 + `DockLayout` 横条形渲染——
  README 对 Sidebar 形态的推荐件；chips 页签条/分栏/拖放停靠/浮动/chrome 收展钮全部官方面，
  fix-4 自研 strip/手柄/宽度态退役）。
- `dock-kit.ts` —— 官方基座映射层（fix-10）：官方初始态（collapsed + 「开始」全局页签）、
  rightDock ↔ 官方 expanded 映射、页签跟随项目（`visibleDockTabs` 可见集 → 官方
  openContent/closeTab intents 同步 + `resolveActiveDockTab` 焦点回落/恢复）、产品口径政策面
  （全局页签不可关闭 / 两横栏分栏预算 / 文案全中文化 `DOCK_LABELS_ZH`）。纯逻辑无 DOM——
  真件 `DockController` 直测（`dock-kit.test.ts`）。
- `dock.ts` —— UF-7 页签跟随纯逻辑（语义锚，随迁移保留复用）：登记表（全局 + 按项目；登记
  fail-loud / 撤销幂等）与可见集推导（可见 = 当前项目页签 + 全局页签，注册序；推导即跟随——
  切项目换集不打断、切回恢复，含激活页签回落/恢复）。锚点断言：`dock.test.ts`。
- `slots.ts` —— 槽位契约：`rail` / `session` / `knowledge` / `renderDockTab`（缺省 = 机制占位——
  M0 知识面板空态占位入槽）。
- `zones.css` —— 布局样式（零裸值令牌纪律；结构基准 = 第一版原型）：宽度轨道收展 + hidden 守卫 +
  官方 surface 装载/WCO titlebar-area 避让（fix-4 先例延续至官方 strip 锚）。
- 状态唯一源 = `shell/view-state`（React 绑定 `shell/use-shell-view`；UF-7 三态/跟随语义零改动——
  官方基座仅经映射层对接）；三区装配（hero 相位/真实视图注入）归 2.12。
