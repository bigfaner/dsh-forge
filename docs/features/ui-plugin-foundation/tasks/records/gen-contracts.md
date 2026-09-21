---
status: "completed"
started: "2026-09-22 03:03"
completed: "2026-09-22 03:13"
time_spent: "~10m"
---

# Task Record: T-test-gen-contracts Generate Test Contracts

## Summary
Generated Contract specifications for all 6 ui-plugin-foundation Journeys via forge:gen-contracts: 29 Contract files (step-N-*.md) with 72 Outcomes total, six-dimension declarations with semantic descriptors, per-Outcome fixture_spec, SKIP_EVAL_GATE markers (quick mode), and per-Journey invariants. Code reconnaissance produced 15 new static facts (FT-015..FT-029) merged into .forge/fact-table.json (29 total, existing runtime entries preserved). No design handbooks exist (no design/ dir), so web anchors were omitted per graceful-degradation rules.

## Changes

### Files Created
- docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/contracts/step-1-config-add-entry.md
- docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/contracts/step-2-shell-boot-apply-add.md
- docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/contracts/step-3-write-once-preservation.md
- docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/contracts/step-4-config-remove-entry.md
- docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/contracts/step-5-reinstall-lifecycle-loop.md
- docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-1-official-web-self-install.md
- docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-2-consume-slot-render.md
- docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-3-contribute-subslot.md
- docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-4-panel-interaction.md
- docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-5-shell-config-assembly.md
- docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-6-packaged-offline-assembly.md
- docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/contracts/step-1-hello-world-baseline.md
- docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/contracts/step-2-install-collision-fixture.md
- docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/contracts/step-3-observe-collision-behavior.md
- docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/contracts/step-4-archive-collision-conclusion.md
- docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/contracts/step-5-uninstall-restore.md
- docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/contracts/step-1-probe-plugin-add-profile.md
- docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/contracts/step-2-probe-out-of-tree-materialization.md
- docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/contracts/step-3-probe-inject-declarant.md
- docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/contracts/step-4-distribution-offline-conclusion.md
- docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/contracts/step-5-report-review-gate.md
- docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/contracts/step-1-scaffold-plugin-package.md
- docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/contracts/step-2-declare-versions.md
- docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/contracts/step-3-build-plugin.md
- docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/contracts/step-4-install-official-web.md
- docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/contracts/step-5-view-injection-result.md
- docs/features/ui-plugin-foundation/testing/version-consistency-assertion/contracts/step-1-green-light-baseline.md
- docs/features/ui-plugin-foundation/testing/version-consistency-assertion/contracts/step-2-red-light-mismatch.md
- docs/features/ui-plugin-foundation/testing/version-consistency-assertion/contracts/step-3-template-stamp-visibility.md

### Files Modified
- .forge/fact-table.json

### Key Decisions
无

## Cases Generated
72

## Cases Evaluated
72

## Scripts Created
无

## Test Results
29 Contracts / 72 Outcomes across 6 Journeys. Schema validation: ALL PASSED on first attempt (mandatory dimensions non-empty, fixture_spec with >=1 entity per Outcome, semantic descriptor purity, outcome name uniqueness, precondition mutual exclusivity, Journey Invariants section exactly once with >=1 entry). Risk density all ON_TARGET: config-driven-plugin-lifecycle High 3/3/3/4/3=16 (13-20), dual-env-plugin-assembly High 3x6=18 (13-20), slot-collision-coexistence Medium 2/2/3/2/2=11 (8-12), spike-conclusion-fallback Medium 2x5=10 (8-12), third-party-template-onboarding Medium 2/3/2/2/2=11 (8-12), version-consistency-assertion Low 2x3=6 (4-7).

## Acceptance Criteria
- [x] At least 1 Contract file generated per Journey
- [x] Each Contract has six-dimension declarations with semantic descriptors (no regex)
- [x] Risk-driven Outcome density targets met per Journey risk level
- [x] Fact Table written to .forge/fact-table.json
- [x] All Contracts passed schema validation

## Notes
Quick mode: SKIP_EVAL_GATE=true in effect — eval-journey prerequisite waived; every Contract carries skip_eval: true frontmatter plus the extra-scrutiny note. Web surface-required outcomes: validation-error derived on config/dependency/slot-key declaration legs; session-expired considered and documented as N/A (desktop shell + local profiles, no session lifecycle); network-error and loading-state derived as inferred web boundaries where grounded. No docs/conventions/testing/web/core.md convention and no design handbook (page-map.md) — generation used LLM defaults, anchor fields omitted gracefully. All inferred boundary Outcomes annotated with source: inferred and reasoning citing Fact Table entries (FT-015..FT-029) from scripts/verify-plugins.mjs, scripts/stage-plugin-tarballs.mjs, scripts/acceptance/live-ui-probe.mjs, apps/desktop/src/main/host-profile/index.ts, packages/plugins/* manifests. Fact Table merge preserved 14 pre-existing entries.
