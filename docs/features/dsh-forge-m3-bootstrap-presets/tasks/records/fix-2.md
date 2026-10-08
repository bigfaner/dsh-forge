---
status: "completed"
started: "2026-10-08 12:56"
completed: "2026-10-08 13:42"
time_spent: "~46m"
---

# Task Record: fix-2 Fix: 4 M3 journeys below eval-journey target 850 (Surface Fitness <90)

## Summary
Revised 4 M3 journeys below eval-journey target 850 to 990/1020/1043/999 out of 1150 (preset-physical-isolation 815->990, mode-selection-alignment 816->1020, overview-entry-new-session 838->1043, worker-provisioning 844->999); every dimension now above its min threshold incl. the previously failing Surface Fitness (40/60/60/59 -> 118/126/130/120). Revision per M2 fix-1 recipe: added Derived Outcomes adjudication sections (validation-error mapped to config-assembly/settings-form/boundary-step carriers or reasoned N/A citing surface-web rules; session-expired localized as restart-continuity/draft-independence/config-timeliness or reasoned N/A); annotated all inference claims with source: inferred; declared per-step observation channels (web/contract/session-projection) plus 50/50 Contract-Journey division-of-labor statements; added positive controls for absence assertions; grounded fault-injection procedures in the boot-overlay draft-only persistent-fault-source semantics with upstream baseline pinning; resolved journey-specific defects (blank-lock seat-unload unification per SC1+S5, Step 4 mode-bracket narrowing to expedition-always per UF-3 item 6, deterministic dependency-cycle fixture, always-true 5c precondition repair, invariant 2 qualification, output-token tension dissolved via flow-4 item 3, risk re-graded High with justification where warranted); closed source lists (UF/spikes/3.9/tech-design). Single-pass adversarial re-eval run for all 4 journeys; final-report.md regenerated (stale failing reports superseded; pre-fix attack lists preserved in git history). No source code modified; static checks green. Source task T-test-gen-contracts auto-recovers for re-dispatch.

## Type Reclassification
- Original: coding.fix
- Actual: doc.fix
- Reason: Root cause was not a code bug: 4 journey artifacts scored below the 850 eval-journey gate; the fix was pure doc revision (only .md files modified, no source code touched)

## Changes

### Files Created
无

### Files Modified
- docs/features/dsh-forge-m3-bootstrap-presets/testing/preset-physical-isolation/journey.md
- docs/features/dsh-forge-m3-bootstrap-presets/testing/preset-physical-isolation/eval/iteration-1.md
- docs/features/dsh-forge-m3-bootstrap-presets/testing/preset-physical-isolation/eval/final-report.md
- docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/journey.md
- docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/eval/iteration-1.md
- docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/eval/final-report.md
- docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/journey.md
- docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/eval/iteration-1.md
- docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/eval/final-report.md
- docs/features/dsh-forge-m3-bootstrap-presets/testing/worker-provisioning/journey.md
- docs/features/dsh-forge-m3-bootstrap-presets/testing/worker-provisioning/eval/iteration-1.md
- docs/features/dsh-forge-m3-bootstrap-presets/testing/worker-provisioning/eval/final-report.md

### Key Decisions
- testsPassed/testsFailed = 0 and coverage = -1.0 sentinel: docs-only revision, no unit tests apply; verification = eval-journey adversarial re-run (990/1020/1043/999 vs gate 850) plus just compile/fmt/lint all green
- Grounded every added fact in PRD/UI-functions/spike/tech-design sources (frontmatter sources closed) instead of loosening claims; never fabricated mandatory outcomes - validation-error/session-expired either mapped to real carriers (config-assembly 2b/3b, settings form 1b, boundary steps 2b/1e/1d) or reasoned N/A citing surface-web rules
- Fault-injection procedure grounded in boot-overlay semantics read from code (preset rows live in userData boot-overlay.yml rewritten from the three product drafts every boot - the draft is the only persistent fault source; user-layer corruption self-heals)
- Type reclassified coding.fix -> doc.fix per M2 fix-1 precedent: root cause = journey artifacts below eval gate, zero source code touched

## Test Results
- **Tests Executed**: No
- **Passed**: 0
- **Failed**: 0
- **Coverage**: N/A (task has no tests)

## Acceptance Criteria
- [x] All 4 revised journeys score >= eval.journey.target 850
- [x] No dimension below its min threshold (Surface Fitness was 40/59/60/60 < 90)
- [x] Web-mandatory derived outcomes (validation-error, session-expired) explicitly adjudicated with rule citation or localized carrier step in all 4 journeys
- [x] Inference claims annotated source: inferred; per-step observation channels declared; positive controls for absence assertions
- [x] Eval re-run single-pass (iterations=1) for the 4 journeys with final-report.md regenerated
- [x] No contracts generated in this fix task (source task auto-recovers for re-dispatch)

## Notes
Eval executed as single-pass adversarial QA re-scoring per .forge/config.yaml (eval.journey.target=850, iterations=1); pre-fix failing reports superseded and preserved in git history. Commit delta round (fix-2.1) resolved 6 scorer-flagged residuals (injection-target self-contradiction, spike evidence generation mix, git-commit division note, 3.9 source closure, session-expired overreach clause, Step 5b fixture source). Remaining minor deductions documented per-journey in eval/iteration-1.md Phase 3 / revision guidance - all above threshold, safe for gen-contracts to derive surface-required Outcomes at contract stage.
