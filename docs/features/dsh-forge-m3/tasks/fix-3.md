---
id: "fix-3"
title: "fix unit-test: just unit-test failure in quality gate"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
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

- [ ] Both gate-reported failures confirmed green in isolation: `tests/verify-plugins.spec.ts` 54/54 and `apps/desktop/tests/e2e-stub-cli.spec.ts` 10/10, exit 0 each — collateral of OS commit exhaustion, not code defects (same verdict as fix-1, commit 3182e9e)
- [ ] Durable mitigation applied in the unit-test lane: `VITEST_MAX_WORKERS=4` pinned in the justfile `unit-test` recipe with an evidence comment (smallest blast radius; env var honored by vitest 4.1.11 resolveConfig)
- [ ] Full unit gate green via the actual recipe path after the change: `just unit-test` → 115 files / 1802 tests passed, exit 0, ~36s
- [ ] No production or test code modified — fix is config-only (justfile), consistent with the environmental root-cause verdict

## Reference Files

- Source: apps/desktop/tests/e2e-stub-cli.spec.ts
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
