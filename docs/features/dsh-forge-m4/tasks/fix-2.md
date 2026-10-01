---
id: "fix-2"
title: "Fix: SC7 家族回归 — 4.5 首启默认 blob 恢复清空激活自动展开(stored 字段修法)"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: SC7 家族回归 — 4.5 首启默认 blob 恢复清空激活自动展开(stored 字段修法)

## Root Cause

4.5 布局记忆引擎对无行项目(默认布局)也执行 restore 重放,空 tree 分支清掉了激活会话祖先链自动展开。4.6 已诊断:干净修法 = getProjectUiState 返回体增加 additive stored 字段(行是否存在),persistence 仅在 stored=true 时下发 tree/展开态重放;修后 SC7 与 SC4 家族需同绿,不得弱化任何断言。

## Reference Files

- Source: packages/plugins/forge-workbench/src/client/layout/persistence.ts,apps/desktop/src/main/workbench/ui-state/,packages/plugins/forge-workbench/src/client/layout/
- Test script: tests/e2e/specs/m4/sc7-task-session-trace.spec.ts + tests/e2e/specs/m4/sc4-split-windows.spec.ts
- Test results: SC4 2/2 绿×4;SC7 家族红:新项目首启默认 blob restore 推空树覆盖 §2.3 激活自动展开(引擎缺 row-exists 信号;诊断记录于 process/record-4.6.json notes)

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `packages/plugins/forge-workbench/src/client/layout/persistence.ts,apps/desktop/src/main/workbench/ui-state/,packages/plugins/forge-workbench/src/client/layout/` to extract the first file path (comma-separated).
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

When this task is recorded as completed via `task record`, the source task 4.5 is automatically restored to pending if all its dependencies are completed.
