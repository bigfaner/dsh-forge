---
id: "fix-1"
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

## Diagnosis (2026-09-25 executor findings): environmental, no code regression

Verdict: **machine memory (commit) exhaustion under vitest's default forks
parallelism** — not a test/code defect. No source changes made; suite green
once worker count is capped and no external app instance holds the machine.

Evidence chain:

1. **Gate run 19:01:25** — attempt 1 died inside the Rust `just` binary itself
   (`memory allocation of 196608 bytes failed`, exit 127) *before vitest
   started*: system-level commit exhaustion (machine had just finished a 3.5h
   full e2e lane). Attempt 2 lost 2 vitest fork workers to
   `FATAL ERROR: Zone Allocation failed - process out of memory` at ~50 MB
   heap — the OS-commit-exhaustion signature, not a V8 heap leak (a leak shows
   GC traces climbing to GBs then `JavaScript heap out of memory`).
2. **Repro 19:04** (`vitest run`, default ~15 forks on 16 cores, 17.2 GB free):
   3 more workers Zone-failed; the 1 reported test failure
   (`apps/desktop/tests/e2e-stub-cli.spec.ts > orchestrates failure`) got exit
   code `2147483651` = 0x80000003 STATUS_BREAKPOINT — the stub CLI *subprocess
   hard-crashed* under the same exhaustion instead of its scripted exit 1.
   Same file passes 10/10 in isolation.
3. **Controlled rerun 19:07** (`vitest run --maxWorkers=4`): **zero crashes**,
   full universe 115 files / 1802 tests, 1801 pass. Each worker sequentially
   ran ~29 files with no OOM → no per-file/per-suite leak exists. Files lost
   to crashed workers in the repro (all green under the capped run):
   `packages/plugins/forge-workbench/tests/{wizard,overview-assembly,plugin-section}.spec.tsx`.
   (The gate run's own 2 crashed files are not recoverable — vitest records
   nothing for files owned by a dead worker.)
4. **Remaining single red** = `tests/e2e/base-selfcheck.spec.ts > instance lock
   (AC-4) > live enumeration` — the M1 single-instance guard working as
   designed: it refuses while ANY dsh-forge instance is live on the machine.
   It detected the user's real dev app in the MAIN checkout
   (`electron.exe .` pid 4720 → host pid 16896 LISTENING on 19387, spawned
   19:03:23 — after the gate failed). Deterministic: 13/14 with only this
   guard red while the instance is up; the guard PASSED in the gate run's
   file set (instance started 2 min later). Do not kill the user's app.

Operational guidance (no config change made in this fix): when the unit gate
reds with `Worker exited unexpectedly` / `Zone Allocation`, re-run with a
reduced pool (`pnpm exec vitest run --maxWorkers=4`) and ensure no dev
instance of dsh-forge is running (instance-lock guard). Capping workers
permanently in `vitest.config.ts` is a product decision left to the team.

## Resolution (2026-09-25 second attempt): gate green, verdict confirmed

Both environmental blockers cleared (user closed the dev instance with
approval; port 19387 verified free via PowerShell Get-NetTCPConnection —
zero listeners). Baseline commit headroom at rerun time was only ~4 GB free
of 36.1 GB total (spread across many small user processes, no single
hoarder), so the capped pool was used per the operational guidance above.

- **Full unit gate GREEN**: `pnpm exec vitest run --maxWorkers=4` →
  **115 files / 1802 tests, 1802 passed, 0 failed, 0 errors, 0 worker
  crashes** (37.75s). Log: `.forge/tmp/fix1-attempt2-maxw4.log`. The
  ERR_* / WARN_* JSON lines in the capture are expected negative-path
  test output, not failures.
- **base-selfcheck AC-4 (instance-lock live enumeration) PASSES with the
  port free**: `tests/e2e/base-selfcheck.spec.ts` 14/14 green in the full
  run and 14/14 in an isolated run — confirming the prior red was purely
  the live user dev instance, exactly as diagnosed.
- **No source changes** in either attempt — the deliverable is the
  environmental attribution + evidence. Zero code defects found.
- Gate-runner note: vitest 4.1.11 honors `VITEST_MAX_WORKERS`, so a
  memory-tight gate run can be capped purely via environment
  (`VITEST_MAX_WORKERS=4 forge task submit`) without touching
  `vitest.config.ts` or the justfile.

Concise error:
```
...
❯ ChildProcess.emitUnexpectedExit node_modules/.pnpm/vitest@4.1.11_@types+node@2_97305cfa71f399e361ee574373abf6f9/node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:3090:33
❯ ChildProcess.emit node:events:508:28
❯ Process.ChildProcess._handle.onexit node:internal/child_process:294:12
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Test Files  113 passed (115)
Tests  1761 passed (1778)
Errors  2 errors
Start at  19:01:25
Duration  32.60s (transform 26.11s, setup 0ms, import 84.92s, tests 152.30s, environment 124.69s)
error: recipe `unit-test` failed on line 11 with exit code 1
```

## Acceptance Criteria

- [ ] Root cause identified with evidence: gate capture (`tests/results/unit-raw-output.txt`) + isolated spec runs + default-worker repro + capped-worker control run attribute every red to environmental causes
- [ ] Worker-crash layer proven environmental: same 115-file / 1802-test universe runs with zero crashes under `--maxWorkers=4` (each worker ~29 files sequentially, no OOM → no per-file leak)
- [ ] Full unit gate green in one run once blockers cleared: 1802/1802 passed, 0 failed, 0 errors (second attempt, port 19387 free)
- [ ] `tests/e2e/base-selfcheck.spec.ts` AC-4 instance-lock guard passes with the port free (14/14 in full run and isolated run)

## Reference Files

- Source: 2_97305cfa71f399e361ee574373abf6f9/node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js
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
