---
id: "fix-2"
title: "Fix: 4 M3 journeys below eval-journey target 850 (Surface Fitness <90)"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: 4 M3 journeys below eval-journey target 850 (Surface Fitness <90)

## Root Cause

Complex pipeline-gate blocker (not inline-fixable within T-test-gen-contracts scope): gen-contracts hard gate requires every journey >= eval.journey.target (850); 4/9 fail. Revision recipe per M2 fix-1 precedent (846->1023): (1) for each Web-mandatory derived Outcome that genuinely cannot occur, add explicit N/A adjudication citing surface-web rules (never fabricate outcomes) — validation-error/session-expired absent without annotation is the primary scorer attack in all 4; (2) annotate every inference with source: inferred + reasoning (Fact Alignment debt); (3) declare per-step browser-observation channels — worker-provisioning 9/12 and preset-physical-isolation 0/6 steps browser-unobservable; (4) positive controls for absence assertions (preset-physical-isolation vacuous-pass risk, spike S6-3 probe); (5) journey-specific secondary gaps per eval/iteration-1.md attack lists (mode-selection Step 5 not executable + invariant 4 untestable; overview-entry Step 4 wrong-AC-channel parenthetical + bundled trigger branches; worker-provisioning 5c always-true precondition). After revision re-run /eval-journey single-pass for the 4 journeys and ensure final-report.md is regenerated (stale failing report keeps the gate red). Do not generate contracts in this fix task — source task T-test-gen-contracts auto-recovers for re-dispatch after fix completion.

## Reference Files

- Source: docs/features/dsh-forge-m3-bootstrap-presets/testing/preset-physical-isolation/journey.md,docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/journey.md,docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/journey.md,docs/features/dsh-forge-m3-bootstrap-presets/testing/worker-provisioning/journey.md
- Test script: docs/features/dsh-forge-m3-bootstrap-presets/testing/<journey>/eval/final-report.md (gate: total >= eval.journey.target 850)
- Test results: preset-physical-isolation 815/1150, mode-selection-alignment 816/1150, worker-provisioning 844/1150, overview-entry-new-session 838/1150 — all below target 850; Surface Fitness 40/59/60/60 vs min 90

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `docs/features/dsh-forge-m3-bootstrap-presets/testing/preset-physical-isolation/journey.md,docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/journey.md,docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/journey.md,docs/features/dsh-forge-m3-bootstrap-presets/testing/worker-provisioning/journey.md` to extract the first file path (comma-separated).
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
