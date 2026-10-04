---
status: "completed"
started: "2026-10-04 14:50"
completed: "2026-10-04 14:55"
time_spent: "~5m"
---

# Task Record: fix-22 Fix: 侧栏过滤输入框失焦不收起——补 blur 自动收起（用户预期规格：失焦后自动收起，与 Esc 同径「收起即清空」），含头部钮 blur 竞态守卫

## Summary
侧栏过滤输入框补 blur 自动收起（走查人规格演进——超原型）：官方 Input 透传 onBlur → shouldCollapseFilterOnBlur 纯裁决（sidebar-model.ts）→ 与 Esc 同缝 onCollapse（收起即清空查询，树还原）；头部钮 blur 竞态守卫口径 a：relatedTarget（closest 鸭型探测）入 .dswf-sidebar-sectionhead（搜索/视图选项/＋ 三钮容器）不收起——头部交互保持搜索态，防 mousedown blur 收起+清空后 click 到达 toggle 再翻转 searchOpen 的双翻转重开。零态机改动（blur 复用既有 onSearchToggle 缝）。单测照 fix-6/flow-model 形制：态机行为面 = 纯裁决函数三分支直测（web 项目无 DOM 环境）+ renderToStaticMarkup 面 = 守卫选择器 ↔ sectionhead class 互钉（改名即红）。

## Changes

### Files Created
无

### Files Modified
- apps/web/src/views/sidebar/sidebar-model.ts
- apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx
- apps/web/src/views/sidebar/ForgeWorkspacePanel.test.tsx

### Key Decisions
- 官方 Input 透传 onBlur 已实证（lib/types/Input.d.ts：InputHTMLAttributes 全透传到原生 input），无需 wrapper focusout 回退
- blur 收起守卫抽纯函数 shouldCollapseFilterOnBlur（closest 鸭型探测而非 instanceof Element——Node 单测环境无 Element 全局可伪造目标直测），落位 sidebar-model.ts 与 sidebarFilterOf 同层
- 守卫选择器导出 SIDEBAR_SECTIONHEAD_SELECTOR 与头部容器 class 由单测互钉（class 改名即红——守卫契约面）
- blur 复用 onCollapse（= onSearchToggle）缝：翻转 searchOpen + 清空 query 既有语义承载，面板态机零改动
- web 项目 vitest 无 DOM 环境（无 jsdom/happy-dom）——blur 事件行为不可静态渲染发难，照 flow-model 形制抽纯裁决函数测分支

## Test Results
- **Tests Executed**: Yes
- **Passed**: 46
- **Failed**: 0
- **Coverage**: 76.5%

## Acceptance Criteria
- [x] 点搜索钮 → 行展开聚焦；点空白/树行/其他区域 → 行收起且查询清空（树还原）
- [x] 行展开时点视图选项钮/「＋」→ 行不收起（头部交互保持搜索态）；点搜索钮 → 正常收起（无双翻转、无重开抖动）
- [x] Esc 语义不变（收起+清空）
- [x] 单测：ForgeWorkspacePanel.test.tsx 补 blur 收起 + relatedTarget 守卫分支（renderToStaticMarkup 面 + 态机行为面照 fix-6 形制）

## Notes
静态门全绿（tsc -b / pnpm lint 含 14 条 selftest；仓库无 fmt 工具——N/A）。targeted vitest：apps/web/src/views/sidebar 5 文件 46/46 绿，模块覆盖 76.51% stmts / 77.86% lines（目标 60%），sidebar-model.ts 96.92%（新增守卫函数全覆盖）。无 e2e/主机引用该过滤行（dswf-search-toggle/dswf-sidebar-searchrow 全仓零命中）——行为变化封闭。相关引用行号较任务文件微移（SidebarFilterRow 166→166-193 区域；fix-25/fix-27 未触碰本面板过滤面——fix-25 仅迁 rail 知识入口）。工作树中 dock-kit/dock 删除为他人会话预存改动，未触碰未提交。
