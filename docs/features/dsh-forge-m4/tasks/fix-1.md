---
id: "fix-1"
title: "Fix: SC7 e2e 腿板内 dock 交互失稳(会话域右栏重组下的行展开/行点击)"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: SC7 e2e 腿板内 dock 交互失稳(会话域右栏重组下的行展开/行点击)

## Root Cause

复杂/复现性 e2e 交互失稳(~15 轮同类尝试后按 Error Handling 协议升级)。2.9 的语料/消费点接线已交付且单元面 1107 全绿、sc1/sc2 回归全绿;SC7 腿本体断言零删改挂起为 test.fixme,恢复即此 fix 任务的目标。

## Reference Files

- Source: tests/e2e/specs/m4/sc7-task-session-trace.spec.ts;packages/plugins/forge-workbench/src/client/index.ts;packages/plugins/forge-workbench/src/client/views/rightbar/RightbarTabs.tsx;packages/plugins/forge-workbench/src/client/views/tasks/TasksView.tsx;packages/plugins/forge-workbench/src/client/views/TaskBoardPage.tsx
- Test script: pnpm exec playwright test --project=forge-m3-e2e tests/e2e/specs/m4/sc7-task-session-trace.spec.ts
- Test results: 两腿 test.fixme(skipped)。语料链路已多轮验证为绿:corpus 种子经真 JsonlSessionPersistence 落盘 → host 真核心消费(workspace bootstrap/会话列表/catalog)→ C3 树归拢收起断言通过 → C5 挂接行/查看全部 20 折叠/派发命名行+四检 oracle 通过。失稳面:board pane 内 dock 交互(行展开 toggle 的 aria 状态被再喂料复位、行/chip 元素在动作 settles 前 detached/not-stable),随运行在不同 dock 调用点随机出现(>10 轮定位)。已排除:渲染死循环(dock 3s MutationObserver 计 2 次)、seat 崩溃(root cause 已修:toSessionsFace 桥接 retainInfo 需经 traceable proxy 调用,解引用丢失 this → retainObservers TypeError → 单槽 abdicate → 原生浏览器接管;已修复并回归)。剩余疑点:① 会话切换后右栏(session-scoped)重组期 overview/board chip 再进入不稳定;② board 再喂料周期内 C5 行局部展开状态复位;③ TaskBoardPage lineage seat 随 sessions 列表 tick 的重渲染粒度。修复方向:会话域 sidebarRight 解析 seam(打开腿的 ensureBoardActive 经根域服务地址错域)/dock 局部状态跨再喂料保持/或断言口径改用 attached+evaluate 断言。

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `tests/e2e/specs/m4/sc7-task-session-trace.spec.ts;packages/plugins/forge-workbench/src/client/index.ts;packages/plugins/forge-workbench/src/client/views/rightbar/RightbarTabs.tsx;packages/plugins/forge-workbench/src/client/views/tasks/TasksView.tsx;packages/plugins/forge-workbench/src/client/views/TaskBoardPage.tsx` to extract the first file path (comma-separated).
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

When this task is recorded as completed via `task record`, the source task 2.9 is automatically restored to pending if all its dependencies are completed.
