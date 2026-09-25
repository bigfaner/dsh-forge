---
status: "completed"
started: "2026-09-25 21:31"
completed: "2026-09-25 21:40"
time_spent: "~9m"
---

# Task Record: fix-1 fix unit-test: just unit-test failure in quality gate

## Summary
Second attempt (green-gate run): both environmental blockers cleared and the full unit quality gate is GREEN — 115 files / 1802 tests, 1802 passed, 0 failed, 0 errors, 0 worker crashes via the capped pool (pnpm exec vitest run --maxWorkers=4). base-selfcheck AC-4 (instance-lock live enumeration) passes 14/14 with port 19387 verified free (user closed the dev instance with approval). Combined with attempt 1's diagnosis, the verdict stands: the gate failure was OS commit exhaustion under vitest's default ~15-fork parallelism (just-binary malloc failure pre-vitest at 196608 bytes exit 127; worker Zone Allocation failures at ~50MB heap; stub-CLI subprocess 0x80000003 STATUS_BREAKPOINT collateral) plus the by-design M1 instance-lock guard detecting the user's live dev app — zero code defects, zero source changes across both attempts.

## Type Reclassification
- Original: coding.fix
- Actual: coding.cleanup
- Reason: Root cause was machine memory (commit) exhaustion plus a live user dev instance tripping the by-design instance-lock guard — not a code bug; zero source files changed, the deliverable is the environmental diagnosis with evidence and operational guidance

## Changes

### Files Created
无

### Files Modified
- docs/features/dsh-forge-m3/tasks/fix-1.md

### Key Decisions
- No source changes in either attempt: the crash layer is environmental (OS commit exhaustion), proven by three independent signatures — Rust just binary failing its own malloc before vitest started, Zone Allocation failures at ~50MB heap (commit-exhaustion signature, not a V8 heap leak), and a stub subprocess hard-crashing with 0x80000003 instead of its scripted exit 1 — while the same 115-file/1802-test universe runs green under --maxWorkers=4 with each worker handling ~29 files sequentially without OOM
- Rerun used the capped pool: baseline free commit at rerun time was only ~4 GB of 36.1 GB total (spread across many small user processes, no single hoarder), below the headroom default ~15 forks need; the dispatcher authorized the capped pool for this run
- base-selfcheck AC-4 red in attempt 1 was correct M1 instance-lock behavior (live dev app on 19387, spawned 2 min after the gate failed); with the instance closed and the port free it passes 14/14 — no test or guard change warranted
- Gate-runner operational note: vitest 4.1.11 honors VITEST_MAX_WORKERS, so a memory-tight quality gate can be capped purely via environment (VITEST_MAX_WORKERS=4) without touching vitest.config.ts or the justfile; permanently capping workers in config remains a team product decision, deliberately not made here

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1802
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] Root cause identified with evidence (gate capture + isolated runs + default-worker repro + capped-worker control run)
- [x] Worker-crash layer proven environmental — no per-file/per-suite leak (same universe green at maxWorkers=4)
- [x] Single test failure (e2e-stub-cli orchestrates-failure) proven OOM collateral (passes 10/10 in isolation)
- [x] Full unit suite green in one run once blockers cleared (1802/1802, zero worker crashes)
- [x] base-selfcheck AC-4 instance-lock guard passes with port 19387 free (14/14 in full run and isolated run)

## Notes
Evidence: tests/results/unit-raw-output.txt (attempt-1 gate capture), .forge/tmp/fix1-rerun.log (default-worker repro, 3 Zone failures), .forge/tmp/fix1-rerun-maxw4.log (attempt-1 capped control, 1801/1802), .forge/tmp/fix1-attempt2-maxw4.log (this attempt, 1802/1802 full green, 37.75s). ERR_*/WARN_* JSON lines in captures are expected negative-path test output, not failures. Port probe: PowerShell Get-NetTCPConnection -LocalPort 19387 returned zero LISTEN entries before the rerun.
