---
id: "fix-1"
title: "Fix: task-session-linkage journey below eval target (846 < 850)"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: task-session-linkage journey below eval target (846 < 850)

## Root Cause

Unblocks T-test-gen-contracts, which aborted at the Breakdown-mode eval-journey gate because this journey scored 846/1150 vs the 850 target. Classification: prerequisite artifact below quality gate (doc revision, no code change). Work: (1) lift Surface Fitness above the 90 dimension threshold — the journey exercises no form/input/error path, so per the web surface rule either derive the web-mandatory outcomes (validation-error for form submission steps, session-expired for session-dependent steps) or annotate a reasoned N/A where genuinely absent; (2) optionally address the fact-alignment findings from eval/iteration-1.md (Step 1 conflates list sub-row vs drawer payloads; 执行-side pill asserted but never exercised) for margin above 850; (3) re-run /eval --type journey single-pass and record the new report under testing/task-session-linkage/eval/. Acceptance: revised journey scores >= 850 with no dimension below its threshold. Context: 6/7 sibling journeys already pass (874-994); gen-contracts will derive surface-required Outcomes at contract stage regardless, so keep changes scoped to this journey.

## Reference Files

- Source: docs/features/dsh-forge-m2-pipeline/testing/task-session-linkage/journey.md
- Test script: re-run /eval --type journey on testing/task-session-linkage/journey.md (target 850, iterations 1 per .forge/config.yaml)
- Test results: Final Score 846/1150 < target 850; Surface Fitness 64/150 < threshold 90 (only failing dimension) — full attack list at docs/features/dsh-forge-m2-pipeline/testing/task-session-linkage/eval/iteration-1.md

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `docs/features/dsh-forge-m2-pipeline/testing/task-session-linkage/journey.md` to extract the first file path (comma-separated).
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

When this task is recorded as completed via `task record`, the source task T-test-gen-contracts is automatically restored to pending if all its dependencies are completed.
