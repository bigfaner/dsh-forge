---
id: "fix-3"
title: "Fix: 任务抽屉诊断失败 toast「发送给 agent」被抽屉 overflow 裁剪不可点"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: 任务抽屉诊断失败 toast「发送给 agent」被抽屉 overflow 裁剪不可点

> 本 fix 任务承载 T-test-run 遗留的**两处**独立问题（forge task add 每源任务限一活跃 fix 任务，故合并于此）：
> 问题①（本标题，产品缺陷）：T3 抽屉 toast 裁剪。
> 问题②（断言可观测缺口，需裁决）：T1 Step1e「两会话常驻可回访」侧栏会话行——见下方「问题②」节。

## Root Cause（问题①）

产品缺陷（CSS 几何实证）：drawer 上下文 DiagToast 发送钮被裁剪不可点。T-test-run 期间判定为生产缺陷，按任务约束未在本任务内修改产品代码。修复时注意 e2e T3 已改为先关抽屉再点发送（形态②）——若修复保留 toast 随抽屉卸载语义，请同步回调 e2e 点按顺序为抽屉开时直点（形态①）。

## 问题②：T1 Step1e 侧栏会话行可观测缺失（需产品面裁决）

- 现象：T1（spec :83）Step1e 断言 `[data-dswf-session]` 行 30s element(s) not found——三连排障后仍红：已加工作区芯片开局选定（`selectWorkspaceViaChip`——sc1/mode-selection 同径），行仍缺席。
- 源码事实：侧栏 ForgeWorkspacePanel 按 owner share `wide` 双态渲染（ForgeWorkspacePanel.tsx:817 rail 早退分支——收起态不渲染行）；会话行数据 = dsh 会话账本快照 `ctx.sessions.list`（ForgeSidebarSlot.tsx useSyncExternalStore 实时读）——blank 会话（dock 编排 openWorkspace 创建、仅预填草稿未发消息）是否入账本待核实（sc1 的会话行仅在发送消息后复启时验证在场，无 blank 期先例锚）。
- 契约出处：step-1 Outcome draft-independence Output『两会话均常驻可回访（中区会话面常驻——Page Composition）』——生成器将其映射为侧栏行锚。
- 裁决与修复：确定「中区会话面」的诚实回访可观测（侧栏展开通道后行在场？账本列 blank 会话？或以持久化草稿 + 回访通道另证），据此补齐/改写 T1 Step1e（现有侧栏行断言 + `sessionRows.last().click()` 回访半段）。若判为测试锚漂移则仅改 e2e；若 blank 会话不入账本属产品缺口则两改。
- 注：同 test 内另三处生成器事实漂移已由 T-test-run 修复（发现面吸收顺序/docsMap 展开门槛/工作区开局选定），勿重复处理。

## Reference Files

- Source: apps/web/src/views/overview/drawer/drawer.css;apps/web/src/views/overview/task-tab/task-tab.css;apps/web/src/views/overview/drawer/index.tsx
- Test script: e2e/specs/m3/overview-entry-new-session.spec.ts
- Test results: T3（spec :301）两形态皆红：形态①抽屉开时点 toast 发送钮——Playwright hit-test 30s 全程被 data-dswf-ov-content 子树拦截指针（run1 实证）；形态②先关抽屉再点——toast 随抽屉卸载消失，按钮 locator 永不解析（run2 实证）。根因（源码核实）：.dswf-tt-diagtoast 定位 right:calc(100%+行高) 左伸 + width:max-content（task-tab.css:571-577，为工具栏宽面设计）；任务抽屉脚 dswf-td-diagwrap 复用同款（drawer/index.tsx:358-361），失败档行集（所属/状态·原因/记录≤3/任务键）典型宽 ~340px 超出抽屉左缘，被 .dswf-td-drawer overflow:hidden（drawer.css:24-33，clamp 最小宽 320px）裁剪；发送钮在 toast 内左对齐落裁剪区。修复方向候选：drawer 上下文改锚（如 fixed 定位/右缘贴抽屉内侧/max-width 收敛行集换行）——需与 ui-design UF-3 v19–v21 对齐后实施。修后跑 just test overview-entry-new-session 确认 T3 三断言（@docs 提及芯片归属行/任务键行/突击头标签）全绿。

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `apps/web/src/views/overview/drawer/drawer.css;apps/web/src/views/overview/task-tab/task-tab.css;apps/web/src/views/overview/drawer/index.tsx` to extract the first file path (comma-separated).
2. Run `forge surfaces --json <file-path>` to resolve surface-key/type.
3. Use the resolved surface-type to load the appropriate `rules/surfaces/<type>.md` for test orchestration guidance.

If `forge surfaces --json` fails (no surfaces configured, command not found), proceed without surface information — this does not block the fix.

## Fix Boundaries

When fixing test failures, observe these boundaries:

**Forbidden:**
- Starting dev server (`npx expo start`, `npm run dev`, etc.)
- Running `npm install` more than 3 times — mark task as blocked if dependency installation fails 3 times
- Running full test suite — regression is verified by the dispatcher after fix completes
- Manually opening browser to verify rendering

**Correct workflow:**
1. Read failing test + corresponding component source
2. Compare test's expected testID/selectors vs actual DOM structure
3. Modify component (add testID) or test (adjust selectors/assertions)
4. Run targeted tests on affected packages — unit tests must pass
5. Record completion

## Verification

After fixing, verify the fix works:
1. Run targeted tests on changed packages: `go test -race ./affected/package/...`
2. Replace the path with the actual packages you modified

> **Note:** Full project-wide tests run at CLI submit (`forge task submit`) — agent runs targeted tests only.

Full regression is verified by the dispatcher, not by this fix task.

When this task is recorded as completed via `task record`, the source task T-test-run is automatically restored to pending if all its dependencies are completed.
