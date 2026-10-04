---
status: "blocked"
started: "2026-10-04 13:42"
completed: "N/A"
time_spent: ""
---

# Task Record: fix-23 Fix: 对话界面右上角对齐原生 dsh——官方 header 链点亮（「打开方式」+「⋯」更多操作 + corner 收展钮）+ 右栏 dock 全面复用官方 ui-sidebar-right（自研 dock 骨架退役，官方右栏已在运行时活体待接）

## Summary
fix-record 恢复执行（前次仅诊断零实现——本执行为真实现）。② 右栏 dock 全面复用官方 ui-sidebar-right 已交付全绿：自研面整体退役（.dswf-zones-dock 轨道 + zones/dock.ts/dock-kit.ts + M0_DOCK_TABS + view-state rightDock/rightDockPreference/toggle-right-dock + data-dswf-wco 避让标记），右栏 = 官方 AppFrame 第三列活体（官方 per-session dockkit 基座 + guide「开始」种子页 + files/terminal/documentpreview 页签类型自动注册）；client-plugin inject 增 sidebarRight 服务 → main.conversation 占用者注入 rightbar 窄面（isExpanded/toggleExpanded），会话面板钮（.dswf-workbench-docktoggle 锚保持）动作 = 官方 toggleExpanded（官方 ExpandButton/strip chrome 同一动作径），知识模式隐藏/恢复（UF-5/SC8）= rightbarViewPlan 纯函数 + 装配 effect；e2e 锚迁移官方 DOM 契约 + SMOKE-LEDGER 记账 + 结构 pin 随迁；实证全绿（探针：面板钮点开 → 官方右栏 649px/guide「开始」可见/再点收起往返；e2e：smoke-skeleton 组一 + session-workbench dogfood 冒烟 + Step5/6 子集 + knowledge-integration + knowledge-browsing 全绿；单测 1017 全绿；tsc/oxlint/imports/tokens 门全绿）。① 官方 header 链点亮（「打开方式」+「⋯」+官方 corner 三件）runtime 受阻转后续任务：slot runtime 按占用者注册行自声明的 children 发放 renderSlot 授权（renderer standardKit entry.children 在场才注入 + boundRenderSlot 逐 key 校验 entry.children），子槽声明全局唯一（register 重声明即 throw）——产品 main.conversation 影子行（不声明 children——声明即与官方 ConversationRoot 行冲突）恒拿不到 renderSlot('conversation.header') 渲染权（探针实证 [data-slot=conversation.header] 恒缺席；任务预案路径 B「直渲染官方子座」同墙——session.header 影子同样拿不到四子座 renderSlot；slots.d.ts:507 类型面为官方占用者所有，前次预案按类型面推断不成立）；头部维持 fix-9 裁决（官方件组合在 SessionPanel 内组装——三页签/标题/工具行形态零变化，AC3 保持），官方链点亮需要官方 ConversationRoot 渲染 main.conversation（产品工作台架构级重排，超出本 fix 边界）。

## Changes

### Files Created
无

### Files Modified
- apps/web/src/client-plugin/plugin.ts
- apps/web/src/client-plugin/plugin.test.ts
- apps/web/src/client-plugin/README.md
- apps/web/src/product-views.ts
- apps/web/src/shell/view-state.ts
- apps/web/src/shell/view-state.test.ts
- apps/web/src/views/session/README.md
- apps/web/src/views/session/SessionPanel.tsx
- apps/web/src/views/session/SessionPanel.test.tsx
- apps/web/src/views/session/SessionToolbar.tsx
- apps/web/src/views/session/index.ts
- apps/web/src/views/session/session.css
- apps/web/src/workbench/ChatSurface.tsx
- apps/web/src/workbench/ChatSurface.test.tsx
- apps/web/src/workbench/README.md
- apps/web/src/workbench/WorkbenchPanel.tsx
- apps/web/src/workbench/WorkbenchPanel.test.tsx
- apps/web/src/workbench/workbench.css
- apps/web/src/zones/README.md
- apps/web/src/zones/WorkbenchZones.tsx
- apps/web/src/zones/WorkbenchZones.test.tsx
- apps/web/src/zones/index.ts
- apps/web/src/zones/slots.ts
- apps/web/src/zones/zones.css
- e2e/SMOKE-LEDGER.md
- e2e/specs/flywheel.spec.ts
- e2e/specs/installer-smoke.spec.ts
- e2e/specs/knowledge-integration.spec.ts
- e2e/specs/p1mvp/installer-smoke.spec.ts
- e2e/specs/p1mvp/knowledge-browsing.spec.ts
- e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts
- e2e/specs/p1mvp/session-workbench.spec.ts
- e2e/specs/smoke-skeleton.spec.ts
- tests/contract/pin-03-sidebar-slots.test.ts
- tests/structure/web-shell.test.ts
- docs/features/dsh-forge-p1-mvp/tasks/fix-23.md

### Key Decisions
- ① 受阻定性：官方 header 链不可从 main.conversation 影子点亮——renderSlot 授权 per-entry（占用者注册行 children 声明），子槽声明全局唯一不可重声明；路径 C 与路径 B 同墙，非实现层问题而是产品工作台占用中区与官方头部链渲染权的结构性冲突（需官方 ConversationRoot 渲染 main.conversation 的架构级重排）
- ② 右栏动作面：面板钮（.dswf-workbench-docktoggle 锚保持）经官方 sidebarRight.toggleExpanded 驱动官方右栏（官方 ExpandButton/strip chrome 同一动作径）——按钮本体产品件（官方 corner 钮随 ① 受阻不在场），展开物全官方（guide 开始页/dockkit 基座/tab 类型）
- 知识模式右栏联动（UF-5/SC8）= rightbarViewPlan 纯函数 + 装配 effect（进知识视图收起并记忆、回会话按记忆恢复；已展开他径仅清记忆），收展态本体归官方 per-session store 自持——不进视图态机（rightDock/rightDockPreference/toggle-right-dock 退役）
- 无会话态 = 官方原生语义（官方右栏无面板无展开钮）；e2e 无会话分支迁移为休眠形态断言（frame 收起标记 + 无展开钮负向）
- SessionToolbar/SessionPanel 头部形态回滚保持（三页签/标题/WCO 避让随右栏镜像态）——① 受阻实证后回滚 ProductSessionHeader 迁移（官方 session.header 槽位在影子链下无渲染点，页签行迁入即 UF-4 断链）
- 官方右栏 DOM 锚（e2e/结构 pin）：frame [data-rightbar-collapsed]（收起/休眠在场、展开退场）、列 [data-rightbar-col]、strip [data-dockkit-strip]（guide「开始」= 官方 defaultSeed）、strip chrome [data-sidebar-right-toggle]

## Test Results
- **Tests Executed**: Yes
- **Passed**: 0
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [ ] AC1 右上角三件在场：「打开方式」（open-in-app 应用解析后）+「⋯」（菜单含 下载 Session 日志/反馈）+ 右栏收展钮（右栏隐藏时在场）
- [x] AC2 收展钮 → 官方右栏展开，开始页 = 原生 guide 形态；tab 开合/收展/再展开正常
- [x] AC3 产品三页签（chat/召回/轨迹）与中区知识视图（show-knowledge）形态零变化
- [x] AC4 .dswf-zones-dock DOM 消失；e2e 锚迁移（官方 DOM 契约）；WorkbenchZones/SessionToolbar 相关单测随迁

## Notes
受阻实证链：dsh-client-ui-renderer lib/client.js standardKit（entry.children 才注入 renderSlot）+ boundRenderSlot（逐 key 校验 entry.children）+ ui-slots register（子槽重声明 throw）+ 探针 tmp-ui-review/fix23-diag.mjs（dogfood 真会话下 [data-slot=conversation.header] 恒缺席、三件零渲染）+ e2e dogfood 实跑红（页签行随头部迁官方链后不可达——已回滚）。② 实证：同探针面板钮点开官方右栏 649px/guide「开始」/往返收展 + smoke-skeleton/session-workbench dogfood/knowledge 族 9 e2e 全绿。① 后续任务输入：让官方 ConversationRoot 渲染 main.conversation（产品三区工作台重排为 content 工厂域或等价架构——触及 UF-4/UF-5/hero/知识视图装配，需设计权威）。
