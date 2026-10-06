---
id: "fix-2"
title: "Fix: 概览 feature 子 tab 文档行不渲染——列举读面缺失（document-browsing 4 例红）"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: 概览 feature 子 tab 文档行不渲染——列举读面缺失（document-browsing 4 例红）

## Root Cause

根因（单一，4 例同源）：概览 feature 子 tab FeaturesTab.docs 属性自 M2-3.5 未接线（属性注释自证：『3.5 帧不喂——读面无列举源，接口在场供装配注入』）；RPC 面无 docs 列举通道（Interface 7 仅 forge:docs/read + openExternal）。发现链数据在场（features.list 返回 docCount=2 正常，feature_documents 表有行），仅缺列举读面 + 装配接线。旅程/契约（PRD Story 5 / SC4）要求 feature 文档行可浏览可点开。需新增：core feature_documents 列举读 → RPC 通道（contracts CHANNELS + web client Record + host 五通道注册锚）→ OverviewTab 装配注入 docs。注意 contracts 三消费 pin 面（web Record 增码即红）。e2e 面：e2e/specs/m2/document-browsing.spec.ts 4 例待转绿（选择器/流程已在本任务核对无误）。

## Reference Files

- Source: apps/web/src/views/overview/feature-tab.tsx,apps/web/src/views/overview/OverviewTab.tsx,apps/web/src/rpc/client.ts,packages/contracts/src/channels.ts,apps/host/src/ipc/,packages/core/src/forge/
- Test script: e2e/specs/m2/document-browsing.spec.ts
- Test results: 4 failed / 5（冒烟·悬空容错·非法mermaid·守卫面均死于 [data-dswf-ov-doc] 行 not found；零命中空态 1 例通过）

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `apps/web/src/views/overview/feature-tab.tsx,apps/web/src/views/overview/OverviewTab.tsx,apps/web/src/rpc/client.ts,packages/contracts/src/channels.ts,apps/host/src/ipc/,packages/core/src/forge/` to extract the first file path (comma-separated).
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
