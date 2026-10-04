---
status: "completed"
started: "2026-10-04 13:43"
completed: "2026-10-04 14:32"
time_spent: "~49m"
---

# Task Record: fix-25 Fix: 官方头部链三件不可达——main.conversation 影子与 renderSlot 授权冲突的架构重排（让官方 ConversationRoot 渲染中区，产品工作台降位到内容域）

## Summary
官方头部链点亮架构重排（fix-23 ① 后续）：main.conversation 产品影子退役——官方 ConversationRoot 直渲中区（官方头部链「打开方式」+「⋯」+官方 corner ExpandButton 与官方页签行/内容面全部白拿）；产品面降位官方缝（裁决：content 工厂域承载不可行——registerFactory 定义唯一 throw；落位「官方 main 面板 roster + conversation.view roster」双缝组合，官方先例 ui-plugin-manager/ui-schedule + ui-trajectory）。交付：main keyed 'dswf-hero'（UF-2 零项目 hero——ShellHost boot 驱动选中/注册让位）+ 'dswf-knowledge'（UF-5 知识视图——KnowledgePanel + 桥抽屉缝）；sidebar.panellist 'dswf-knowledge'（官方 PanelRow 行——知识入口，产品 nav 行退役）；conversation.view 'dswf-trajectory'/'dswf-recall'（UF-4 三页签——对话 = 官方 chat 直用，轨迹台账+fix-11 转录接线原样迁入，召回 only:id 激活即挂载）；shell.overlay 'dswf-host'（常驻壳宿主：UF-3 流程宿主 + data-dswf-workbench/phase/view e2e 锚 + hero 驱动 + rightbarViewPlan 知识模式右栏联动）；工作台桥重排（createWorkbenchBridge——nav 绑官方 layout.selectPanel + 知识抽屉缝；inject 增 'layout'）。退役：WorkbenchPanel/ChatSurface/zones 容器族/视图态机（view-state+use-shell-view）/SessionPanel/SessionToolbar/自管面板钮/自研嵌入配方。测试随迁：新增 panel-model/ShellHost/KnowledgePanel/workbench-bridge/ConversationViews 单测（转录映射族原样迁入）+ plugin.test 登记族重写 + 结构/契约 pin 随迁 + e2e 全量锚迁移（官方 DOM 契约）+ SMOKE-LEDGER 记账 + lint selftest 负样例迁域。

## Changes

### Files Created
- apps/web/src/workbench/panel-model.ts
- apps/web/src/workbench/ShellHost.tsx
- apps/web/src/workbench/HeroPanel.tsx
- apps/web/src/workbench/KnowledgePanel.tsx
- apps/web/src/workbench/panel-model.test.ts
- apps/web/src/workbench/ShellHost.test.tsx
- apps/web/src/workbench/KnowledgePanel.test.tsx
- apps/web/src/workbench/workbench-bridge.test.ts
- apps/web/src/views/session/ConversationViews.tsx
- apps/web/src/views/session/ConversationViews.test.tsx
- apps/web/src/views/sidebar/KnowledgeGlyph.tsx

### Files Modified
- apps/web/src/client-plugin/plugin.ts
- apps/web/src/client-plugin/plugin.test.ts
- apps/web/src/client-plugin/README.md
- apps/web/src/product-views.ts
- apps/web/src/workbench/workbench-bridge.ts
- apps/web/src/workbench/workbench.css
- apps/web/src/workbench/index.ts
- apps/web/src/workbench/README.md
- apps/web/src/shell/index.ts
- apps/web/src/shell/README.md
- apps/web/src/views/session/index.ts
- apps/web/src/views/session/session.css
- apps/web/src/views/session/README.md
- apps/web/src/views/sidebar/ForgeSidebarSlot.tsx
- apps/web/src/views/sidebar/ForgeSidebarSlot.test.tsx
- apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx
- apps/web/src/views/sidebar/ForgeWorkspacePanel.test.tsx
- apps/web/src/views/sidebar/sidebar-actions.ts
- apps/web/src/views/sidebar/sidebar-actions.test.ts
- apps/web/src/views/sidebar/sidebar.css
- apps/web/src/views/sidebar/index.ts
- apps/web/src/views/sidebar/README.md
- e2e/specs/p1mvp/session-workbench.spec.ts
- e2e/specs/p1mvp/installer-smoke.spec.ts
- e2e/specs/p1mvp/knowledge-browsing.spec.ts
- e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts
- e2e/specs/smoke-skeleton.spec.ts
- e2e/specs/knowledge-integration.spec.ts
- e2e/specs/installer-smoke.spec.ts
- e2e/specs/flywheel.spec.ts
- e2e/specs/web-shell.spec.ts
- e2e/SMOKE-LEDGER.md
- tests/structure/web-shell.test.ts
- tests/structure/scaffold.test.ts
- tests/contract/pin-03-sidebar-slots.test.ts
- scripts/lint-selftest.mjs
- oxlint.config.ts
- docs/features/dsh-forge-p1-mvp/tasks/fix-25.md

### Key Decisions
- 裁决：content 工厂域承载不可行（ui-slots registerFactory 定义唯一——already has a definition 即 throw）；落位官方 main 面板 roster（keyed 'dswf-hero'/'dswf-knowledge'）+ conversation.view roster（'dswf-trajectory'/'dswf-recall'）双缝组合
- UF-2 hero = 产品全局 main 面板 + ShellHost 驱动（boot 期零项目 selectPanel 选中、注册成功 selectPanel(null) 让位——一次性守卫防导航争用；零 workspace 下官方 hero 为死端故产品引导面板为功能必需）
- 轨迹页签自登记 'dswf-trajectory' 保 UF-4 三页签恒在场（官方 'trajectory' 受 developerTools 门控默认隐藏）；developerTools 开启期两项并陈 = 已知边界
- keyed main 面板非选中即卸载（官方语义）——DOM keep-alive 退役，会话状态（草稿/转录）归官方 store 自持；e2e 保留探针改官方语义断言
- 知识面板 root 作用域无会话锚——项目锚恒走唯一项目兜底（多项目知识锚定降级为 P1 已知边界，会话锚定径由召回/轨迹视图承载）
- e2e 锚迁移官方 DOM 契约：[data-slot=main.conversation]/[data-conversation-tabs]/[data-composer-input]/[data-sidebar-right-expand]/官方 PanelRow button[aria-label=知识库]/[data-dswf-workbench][data-dswf-view] 视图镜像锚（壳宿主承载 data-dswf-workbench/phase 三锚）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 972
- **Failed**: 0
- **Coverage**: 77.6%

## Acceptance Criteria
- [x] 官方头部链三件在场（「打开方式」+「⋯」+官方 corner ExpandButton）——main.conversation 影子退役后官方 ConversationRoot 直渲（fix-23 ① P0 目标）
- [x] 收展钮 → 官方右栏展开（官方 corner ExpandButton 直用）
- [x] 产品功能零损失：三页签（官方 roster：对话=官方 chat 直用+轨迹/召回产品登记）/知识视图（官方 main 面板+panellist 行）/hero（产品面板+驱动）
- [x] 自研 DOM 退役 + e2e 锚迁移（zones/SessionPanel/SessionToolbar/docktoggle/嵌入配方退役；e2e 9 spec + SMOKE-LEDGER 迁官方锚）
- [x] 静态门：tsc -b / oxlint / lint:imports / lint:tokens / lint:selftest 全绿；vite 双入口构建 + forge-client classic-script 形状 pin 通过
- [x] 单测全绿：vitest 98 文件 972 测试（含新增 6 个测试文件与登记族重写）

## Notes
coverage 77.59 = vitest --coverage(v8/json-summary) 实测（workbench 域 + ConversationViews.tsx 语句面——fix-9 同径；panel-model/workbench-bridge/HeroEmpty 100%、ConversationViews 92.3%；ShellHost 49/HeroPanel 0 = 效应面与装配壳归 e2e，先在口径）。工作树同时含 fix-23 ② 未提交交付（右栏官方接管——本任务在其上构建，随本任务一并提交）。官方头部链三件/页签行实机在场验证归 e2e 回归（dispatcher）；提交时外部有一活跃 dsh-forge 用户实例（本 worktree dev 形态、真实 user-data）——按 e2e 单实例纪律不杀，若 e2e 质量门因外部持锁失败请重跑。已知边界见 keyDecisions。
