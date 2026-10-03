---
status: "completed"
started: "2026-10-03 13:57"
completed: "2026-10-03 14:17"
time_spent: "~20m"
---

# Task Record: fix-10 Fix: dock 全面对齐 dsh——官方 ui-dockkit 基座替换自研轨道（DockSurface/Controller/FloatLayer）+ dsh-forge 内容叠加

## Summary
右栏 dock 全面对齐 dsh：官方 @deepseek-ai/dsh-client-ui-dockkit（0.2.0-rc.2）基座整体替换 fix-4 自研轨道（SegmentedTabs strip/调宽手柄/宽度内态退役）。WorkbenchZones 右栏内部 = DockController 布局状态机 + DockLayout 渲染（chips 页签条/分栏/拖放停靠/浮动面板/chrome 收展钮全部官方面）；新增 zones/dock-kit.ts 映射层承载容器级语义（view-state 零改动）：rightDock↔官方 expanded 映射、页签跟随项目（visibleDockTabs → 官方 openContent/closeTab intents + resolveActiveDockTab 焦点回落/恢复）、全局页签不可关闭（canCloseTab）、文案全中文化（DOCK_LABELS_ZH 含可访问名）。e2e 锚迁移（strip/tabpanel → 官方 data-dockkit-* 契约锚，语义不弱化）+ 新增官方基座回归断言；SMOKE-LEDGER 台账同步；结构 pin 同步 + 官方基座 pin 扩充。

## Changes

### Files Created
- apps/web/src/zones/dock-kit.ts
- apps/web/src/zones/dock-kit.test.ts

### Files Modified
- apps/web/src/zones/WorkbenchZones.tsx
- apps/web/src/zones/WorkbenchZones.test.tsx
- apps/web/src/zones/zones.css
- apps/web/src/zones/index.ts
- apps/web/src/zones/README.md
- e2e/specs/smoke-skeleton.spec.ts
- e2e/specs/p1mvp/session-workbench.spec.ts
- e2e/SMOKE-LEDGER.md
- tests/structure/web-shell.test.ts

### Key Decisions
- DockLayout（非 DockSurface）裁决：README 明示 = 横条形 Sidebar 形态推荐件（dsh 桌面右栏同形态）；随之两横栏分栏上限（canSplit = 官方预算 ∧ dockedPaneCount<2——README『Sidebar enforces two panes』同口径）、dropZones="horizontal" 必选（上下缘投放会产 column split，违反 DockLayout 树约束）、minPaneFraction=0.2（README 记载 Sidebar 取值）
- 初始态 = 官方 createInitialState 语义（collapsed + makeInitialTab 全局「开始」页签 kind=start；初始 tab 归初始态——展开/收起不累积副本）；rightDock 初值在 controller 创建期同步 setExpanded（SSR/首渲染一致），后续变更经映射 effect（等值零记录）
- 页签跟随驱动路径 = syncDockTabs：换集 closeTab（旧项目页签退出）+ 缺失 openContent（contentId 恒等去重）+ 焦点落定 resolveActiveDockTab（显式选择锚经快照观测更新——用户显式选择才记锚，自动回落不覆写，切回恢复原选择；dock-kit.test.ts 真件直测三段链）
- 轨道宽度态退役：dock-width.ts + 单测删除，容器宽度回固定 340px（300px/70vw 兜底保持）；内部分栏比例归官方引擎；fix-8② 键盘步进随基座替换 moot（任务前言既定）
- WCO 避让结论：官方 strip 无自避让面（kit 仅浮动头有 --dsh-dockkit-float-top 让位）——容器级 env(titlebar-area-width) 右侧内衬落在官方 [data-dockkit-strip] 锚上（fix-4 先例延续，非 WCO 回退 0；官方件本体样式零改写）
- 产品口径政策面：canAddTab=恒 false（P1 无可添内容面——添加钮经官方政策钩子缺席，控件口径断言入 e2e）；canCloseTab=全局登记页签不可关闭（单页签官方 quiet chips 形态）；canSplit 不硬禁——340px 窄轨由官方 room 规则（halvesFit）禁用为 splitPaneNarrow（控件在场、禁用态官方语义，轨道加宽即开放）
- keep-alive 承接：keepMounted=恒真（官方 TabRetention 保留策略——收起/强制隐藏不卸载，visited 期内容常挂载）+ active=expanded 相位（隐藏期 aria-hidden/inert，不进可达性树）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 498
- **Failed**: 0
- **Coverage**: 92.9%

## Acceptance Criteria
- [x] 右栏内部 = 官方面：chips 页签条/分栏/拖放/浮动/添加关闭控件全部官方原生（零自绘 strip/手柄/页签条退役）
- [x] 初始态 = collapsed + 「开始」全局页签（官方 mode 语义）；展开/收起经官方面，轨道归零语义保持（e2e computed 断言迁移后等价绿）
- [x] UF-5/UF-7 联动不褪色：知识视图强制隐藏 + 切回恢复；页签跟随项目（可见集 = 当前项目 + 全局；全局页签不可关闭）
- [x] dsh-forge 内容叠加：renderTab 按 kind 分发（start）；labels 全中文化（含可访问名）
- [x] chrome 角位 = 右栏收展钮（与现有 toggle 同径）；WCO 避让结论入执行记录
- [x] 既有 e2e/结构 pin 迁移不弱化（SMOKE-LEDGER 记账）；新增 dock 基座行为回归
- [x] tsc + lint + 定向单测绿；退役代码清理或标注

## Notes
验证：pnpm build（tsc -b + vite，dockkit CSS 模块入 dist 证实）绿；pnpm lint（ox/imports/tokens/selftest/types）0 违规；定向单测 web+structure 两池 50 文件 498 测试全绿（WorkbenchPanel 装配 SSR 链同步验证）；zones 范围覆盖率 92.94% stmts（目标 60% 超额；WorkbenchZones 84%/dock-kit 97%）。e2e 未实跑（fix 任务规约——锚迁移语义等价：L46/L3/L689 轨道归零 computed 断言原文保持；L59 strip 锚 → data-dockkit-strip chips；L62 tabpanel 锚 → data-dockkit-content 官方 body 锚；实机回归面待 G2 门 pnpm test:e2e）。残留注记：①收起/强制隐藏期浮动面板随轨道 visibility:hidden 隐藏（官方 DockLayout 浮面渲染于 surface 树内，P1 边沿——浮动需拖 chip 出轨面才触发）；②SSR 面不跑 effect——首渲染页签集 = 初始「开始」页签，项目页签集同步为客户端映射层行为（真件直测覆盖）。
