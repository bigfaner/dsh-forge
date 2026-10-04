---
status: "completed"
started: "2026-10-04 21:26"
completed: "2026-10-04 22:14"
time_spent: "~48m"
---

# Task Record: fix-36 Fix(P2): 客户端整洁批——defaultClient×4/时间标签×3/锚模式×4 三组收敛（~120 行复制）+ fix-25 后注释漂移 5 处 + 复杂度热点（相位链三元/RegisterForm 行件）+ data 锚域前缀

## Summary
客户端整洁批（clean code 客户端路 A- 扣分项清偿）。恢复任务前提为假：前次执行未留任何实现于盘上（工作树仅 docs 变更、HEAD 停在 fix-33），本会话按任务文件完成真实实现。三组重复收敛（~120 行复制消除）：defaultClient×4 + RpcClientFactory 两重一别名 → rpc/client.ts 单一 preloadRpcClientFactory + 类型导出（AddProjectFlow/flow-actions/dir-source 三处内联构造一并收编）；relativeTime 桶→中文 switch×3 → components/time-label 单一来源（三域模型薄委托）；「快照 useState + useForgeProjects + 条件 WorkspacesAnchor」15 行模式×4 → workbench/anchored-projects.tsx 的 useAnchoredProjects 共享 hook（WorkspacesAnchor/isWorkspacesSnapshot 随迁并加共享单测）。顺带 P3：effectiveNativePick useMemo×2 + EMPTY_REGISTERED×4 → dir-picker resolveNativePickSource + 共享常量；错误条/骨架近同构四域 → components/ErrorBar + SkeletonRows 共享件（EmptyState 先例，域 CSS/锚全参数化注入）。注释漂移与 HEAD 机制对齐 5 处（原单中 KnowledgeView.tsx:6/30/17 三处经核对已由 fix-32 提前修复；实际在树漂移 = flow-open 桥归属更正 workbench-bridge、product-views 书+闪电字形、RecallTab.test SessionPanel 先例退役引用、components.css/knowledge.css zones 残引）。复杂度热点：ForgeWorkspacePanel 相位链四层三元 → phaseBody 纯函数早返（导出可测）；RegisterFormView 155 行 JSX → FormRow 行件（93 行 < 100）；AddProjectFlow keep-alive 推导 → flow-model formMountedOf（类型守卫保持 JSX 窄化，附单测）；plugin.ts apply() ≈160 行 → registerSidebarSlots/registerCenterPanels/registerConversationViews 三族子函数（登记序与诊断面零变化）。一致性：data-dswf-skeleton 双域裸名 → data-dswf-sidebar-skeleton / data-dswf-kn-skeleton（与 className 同域对齐，单测 + e2e 引用点随迁）；knowledge.css:287 0.22s 补 dsw-raw 注记；host main.ts 端口兜底 19400/400 → PORT_FALLBACK 命名常量（守 ≤110 行结构 pin）。测试与残项：RecallTab 行载体加 data-dswf-recall-rowbtn 值锚（button/static），测试正则断言改 data 锚；child.ts void shutdownTree() 补 catch；publishWorkbenchBridge 标注测试面用途；expandSidebar JSDoc 标契约占位·当前未消费。零行为/零视觉变更边界保持（DOM 逐字节等价，除任务明列的锚改名/加锚）。

## Changes

### Files Created
- apps/web/src/components/ErrorBar.tsx
- apps/web/src/components/ErrorBar.test.tsx
- apps/web/src/components/SkeletonRows.tsx
- apps/web/src/components/SkeletonRows.test.tsx
- apps/web/src/components/time-label.ts
- apps/web/src/workbench/anchored-projects.tsx
- apps/web/src/workbench/anchored-projects.test.tsx

### Files Modified
- apps/host/src/boot/child.ts
- apps/host/src/main.ts
- apps/web/src/client-plugin/plugin.ts
- apps/web/src/components/README.md
- apps/web/src/components/components.css
- apps/web/src/components/index.ts
- apps/web/src/flows/add-project/AddProjectFlow.tsx
- apps/web/src/flows/add-project/DirectoryBrowser.tsx
- apps/web/src/flows/add-project/RegisterForm.tsx
- apps/web/src/flows/add-project/dir-picker.ts
- apps/web/src/flows/add-project/dir-source.ts
- apps/web/src/flows/add-project/flow-actions.ts
- apps/web/src/flows/add-project/flow-model.test.ts
- apps/web/src/flows/add-project/flow-model.ts
- apps/web/src/flows/add-project/flow-open.ts
- apps/web/src/product-views.ts
- apps/web/src/rpc/README.md
- apps/web/src/rpc/client.ts
- apps/web/src/views/knowledge/EntryDrawer.tsx
- apps/web/src/views/knowledge/KnowledgeBrowse.test.tsx
- apps/web/src/views/knowledge/KnowledgeBrowse.tsx
- apps/web/src/views/knowledge/KnowledgeCardGrid.test.tsx
- apps/web/src/views/knowledge/KnowledgeCardGrid.tsx
- apps/web/src/views/knowledge/KnowledgeView.tsx
- apps/web/src/views/knowledge/README.md
- apps/web/src/views/knowledge/browse-model.ts
- apps/web/src/views/knowledge/knowledge.css
- apps/web/src/views/knowledge/use-knowledge-browse.ts
- apps/web/src/views/session/ConversationViews.tsx
- apps/web/src/views/session/HeroWorkspacePicker.tsx
- apps/web/src/views/session/README.md
- apps/web/src/views/session/RecallTab.test.tsx
- apps/web/src/views/session/RecallTab.tsx
- apps/web/src/views/session/recall-model.ts
- apps/web/src/views/sidebar/ForgeSidebarSlot.test.tsx
- apps/web/src/views/sidebar/ForgeWorkspacePanel.test.tsx
- apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx
- apps/web/src/views/sidebar/sidebar-model.ts
- apps/web/src/views/sidebar/use-forge-projects.ts
- apps/web/src/workbench/KnowledgePanel.tsx
- apps/web/src/workbench/README.md
- apps/web/src/workbench/ShellHost.test.tsx
- apps/web/src/workbench/ShellHost.tsx
- apps/web/src/workbench/index.ts
- apps/web/src/workbench/workbench-bridge.ts
- e2e/specs/p1mvp/knowledge-browsing.spec.ts
- e2e/specs/p1mvp/session-workbench.spec.ts

### Key Decisions
- 恢复任务假前提裁决：盘上零实现（仅任务文件自身）→ 按派发指令执行任务文件的真实实现，而非 blocked
- 共享落点全走公共下层不破「视图同级互禁」铁律：rpc/（client 工厂）、components/（time-label/ErrorBar/SkeletonRows）、workbench/anchored-projects（装配域共享 hook）——三域模型对 time-label 薄委托保留各自公开 API，测试面零迁移
- formMountedOf 做成 selection 类型守卫（selection is BrowserSelection）——抽出内联布尔后保持 AddProjectFlowView JSX 分支内 selection 非空窄化能力不灭
- host main.ts 端口常量与 110 行结构 pin 兼容：watchdog 改 setTimeout(...).unref() 链式 + 单行 PORT_FALLBACK 复合常量，净行数零增长（109 新行）
- 注释漂移 5 处按「与 HEAD 机制一致」意图清偿：任务单所引 KnowledgeView.tsx:6/30/17 经 git 考古确认已被 fix-32 提前修复（评审快照早于 fix-32），实际修复在树 5 处真实漂移（flow-open/product-views/RecallTab.test/components.css/knowledge.css zones）
- RecallTab 行载体测试断言去标签正则：加 data-dswf-rowbtn 值锚（button|static）区分可点/静态载体——加 data 属性属任务明列的测试面迁移，无视觉变化

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1033
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] 三组重复单一来源（grep 逐字拷贝清零）
- [x] 注释漂移 5 处与 HEAD 机制一致
- [x] RegisterFormView <100 行
- [x] 全部单测绿（1033/1033）+ data 锚域前缀同步 e2e 引用点并随迁全绿

## Notes
门禁（恢复任务四步，本分支无 justfile 的等价命令）：compile = tsc -b 全绿；fmt = 无操作（本分支未配置格式化器——无 prettier/fmt script，格式纪律由 oxlint correctness 承担）；lint = pnpm lint 全绿（ox + imports + tokens + selftest + types + test-types）；unit-test = vitest run 1033/1033（VITEST_MAX_WORKERS=4）。e2e 补充证据：knowledge-browsing 全 7 例实跑全绿（含 Step1d cold-cache-skeleton 直证改名锚 [data-dswf-kn-skeleton]）；spec 收集 64/64。发现两处先于本任务存在的 e2e 红灯（经临时 checkpoint 对照 HEAD~1 源码实跑复现，与本改动无关，候选后续 fix 任务）：①knowledge-recall-flywheel:416 选择器笔误 '[data-trajectory-scroll"]'（fix-29 引入的 stray 引号，Playwright 解析即失败）；②:774 空会话下「知识召回」页签未呈现（同因于改动前源码，根因待查——官方 conversation.view roster 或 locale 面时机）。零行为/零视觉承诺核验：错误条/骨架共享件 DOM 逐字节等价（属性序除外）；任务明列的例外 = 骨架锚改名双域 + recall 行载体新增 data 锚。
