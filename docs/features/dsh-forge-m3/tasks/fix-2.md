---
id: "fix-2"
title: "fix unit-test: just unit-test failure in quality gate"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: skipped
breaking: true
type: "coding.fix"
---

# fix unit-test: just unit-test failure in quality gate

## Root Cause

Quality gate step `just unit-test` failed during quality-gate hook.

Error output saved to: `tests/results/unit-raw-output.txt`

Concise error:
```
...
{"ts":"2026-09-25T13:43:22.432Z","level":"info","code":"HOST_STARTED","message":"host subprocess ready","data":{"pid":4242}}
{"ts":"2026-09-25T13:43:22.438Z","level":"info","code":"HOST_STARTED","message":"host subprocess ready","data":{"pid":4242}}
{"ts":"2026-09-25T13:43:22.439Z","level":"info","code":"HOST_STARTED","message":"host subprocess ready","data":{"pid":4242}}
{"ts":"2026-09-25T13:43:22.478Z","level":"info","code":"HOST_STARTED","message":"host subprocess ready","data":{"pid":4242}}
{"ts":"2026-09-25T13:43:22.480Z","level":"info","code":"HOST_STARTED","message":"host subprocess ready","data":{"pid":4242}}
{"ts":"2026-09-25T13:43:22.480Z","level":"info","code":"HOST_STARTED","message":"host subprocess ready","data":{"pid":4242}}
{"ts":"2026-09-25T13:43:22.482Z","level":"info","code":"HOST_STARTED","message":"host subprocess ready","data":{"pid":4242}}
{"ts":"2026-09-25T13:43:22.662Z","level":"info","code":"WORKBENCH_WATCH","message":"watch strategy recursive (recursive watch established (watch targets established))","data":{"projectId":"f600053b-976c-4e2c-8da6-b9f4a9b14a22","strategy":"recursive","reason":"recursive watch established (watch targets established)"}}
{"ts":"2026-09-25T13:43:22.683Z","level":"warn","code":"WARN_HOST_SHUTDOWN_TIMEOUT","message":"host did not exit after shutdown request, escalating to SIGTERM","data":{"pid":4242}}
error: recipe `unit-test` failed on line 11 with exit code 127
```

## Acceptance Criteria

- [ ] Root cause identified and fixed (superseded: skipped as duplicate of fix-3 — durable mitigation 9b51d14)
- [ ] Targeted tests pass

> 处置(2026-09-25,dispatcher):与 fix-3 同一 stop-hook 门抖动的重复任务,根因环境性(vitest 默认 ~15 fork 并行在低内存时耗尽 OS 提交内存);持久修复 = justfile unit-test 通道 `VITEST_MAX_WORKERS=4`(fix-3,9b51d14),门经真实 recipe 路径验证 1802/1802 全绿。

## Reference Files

- Source: tests/verify-plugins.spec.ts
- Test script: just unit-test
- Test results: tests/results/unit-raw-output.txt

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

When this task is recorded as completed via `task record`, the source task N/A (project-wide gate) is automatically restored to pending if all its dependencies are completed.
