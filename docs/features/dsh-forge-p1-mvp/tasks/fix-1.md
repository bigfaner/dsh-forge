---
id: "fix-1"
title: "Fix: direct-in-main 宿主内 agent 工具派发恒挂起——boot 切 child 形态并桥接产品双服务（4.2 dogfood 阻塞根因）"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: direct-in-main 宿主内 agent 工具派发恒挂起——boot 切 child 形态并桥接产品双服务（4.2 dogfood 阻塞根因）

## Root Cause

复杂/复发性错误（10+ 轮插针定位，根因在官方 runtime 与宿主形态交互面，超出 4.2 内联修复面）。已落地资产（勿重做）：host 集成转正（profile 行启用/link 三件/boot overlay/bindings 维护/通道接线）、ws 401 Host 头根修（rewriteStreamHeaders 按 URL 判定）、knowledge bindingsFile 动态绑定缝、flywheel e2e 全断言骨架。单测 232 绿 + pnpm lint 全绿 + tsc -b 绿；main.ts 91 行纪律保持。

## Reference Files

- Source: apps/host/src/boot/run.ts;apps/host/src/main.ts;apps/host/src/ipc/bindings.ts;packages/knowledge/src/tools/session.ts;e2e/specs/flywheel.spec.ts
- Test script: npx playwright test -c e2e/playwright.config.ts e2e/specs/flywheel.spec.ts
- Test results: flywheel e2e 卡步 4（事件落库）：sessionRecall 恒空 300s 超时（groups=[]）。逐层插桩定位：模型往返正常（无工具提问完整作答）；任意工具（官方 list/bash 与 knowledge.search）挂「正在调用工具·运行中」3min+；dsh-tools prepareScheduledExecution/dispatchScheduledExecution/dispatchToolBody 与产品 tool execute 全未进入；session 文件不落盘（checkpoint-policy 在 tools/execute 瀑布内同因挂起）；产品两插件行 disabled 后仍复现；glm-5.3-flash/glm-5.3 均复现。结论：direct-in-main（runProfile 跑 Electron main）不耐 agent 工具执行——官方 Desktop 为 child 形态（ELECTRON_RUN_AS_NODE=1 --expose-internals 子进程，S1 spike run3 已验证 boot）。修复方向：bootDshHost 切 child 形态（S1 spike main.mjs run3 母本），产品双服务 forgeProjects/forgeKnowledge 经子进程桥接（main.ts forge:* 通道转发），随后 flywheel.spec.ts 应全绿（其余 5/6 步已实跑通过：注册/工作区菜单选夹具/发消息/agent 调起 knowledge.search 均通）。完整资产清单与环境坑见 agent-memory dsh-forge-p1-dogfood-tool-hang.md

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `apps/host/src/boot/run.ts;apps/host/src/main.ts;apps/host/src/ipc/bindings.ts;packages/knowledge/src/tools/session.ts;e2e/specs/flywheel.spec.ts` to extract the first file path (comma-separated).
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

When this task is recorded as completed via `task record`, the source task 4.2 is automatically restored to pending if all its dependencies are completed.
