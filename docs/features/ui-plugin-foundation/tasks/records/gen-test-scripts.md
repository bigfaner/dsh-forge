---
status: "completed"
started: "2026-09-22 03:14"
completed: "2026-09-22 03:56"
time_spent: "~42m"
---

# Task Record: T-test-gen-scripts Generate Web E2E Test Scripts

## Summary
Generated Web E2E test scripts for all 6 ui-plugin-foundation Journeys via forge:gen-test-scripts: 35 spec files (29 step files + 6 journey smokes, one test function per Contract Outcome) plus a shared plugin-journey fixture helper, under the established Playwright Electron journey layout apps/desktop/e2e/<journey>/. 72/72 contract Outcomes covered by 79 tests, all tagged @feature ui-plugin-foundation | @web-e2e | @journey <name> with per-file Traceability comments and SKIP_EVAL_GATE extra-scrutiny headers (Quick-mode pipeline: contracts carry skip_eval: true, no eval-contract reports exist by design). Tests drive REAL systems: the real dist/main.cjs over isolated temp profiles + temp product config (DSH_FORGE_PLUGIN_BUNDLES/DSH_FORGE_PROFILE_DIR seams) in two flavors — real-chain (vendored host child + real web dist: boot roster __DSH_BOOT__ @dsh-forge/* entries, pageerror channel, dead-proxy offline boots) and fast fixture-host (real startup reconciliation state legs: manifest order, .dsh-forge-seed.json sha markers, prune/converge/orphan-marker cycles, .dsh-module-fallback immunity) — plus the real verify-plugins.mjs gate functions (alignment/engines/stamps/artifact-source scans), the real stage-plugin-tarballs --check CLI, real pnpm-pack of the collision fixture (replica mode pageerror naming hello-world.panel observed live), and real spike-report/evidence doc structure assertions. Full validation: 79/79 passed in 3.7m; compile gate `just compile` (new justfile recipe, playwright --list) green at 164 tests/73 files; oxlint zero errors on all new files.

## Changes

### Files Created
- apps/desktop/e2e/helpers/plugins.ts
- apps/desktop/e2e/config-driven-plugin-lifecycle/step-1-config-add-entry.spec.ts
- apps/desktop/e2e/config-driven-plugin-lifecycle/step-2-shell-boot-apply-add.spec.ts
- apps/desktop/e2e/config-driven-plugin-lifecycle/step-3-write-once-preservation.spec.ts
- apps/desktop/e2e/config-driven-plugin-lifecycle/step-4-config-remove-entry.spec.ts
- apps/desktop/e2e/config-driven-plugin-lifecycle/step-5-reinstall-lifecycle-loop.spec.ts
- apps/desktop/e2e/config-driven-plugin-lifecycle/smoke.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/step-1-official-web-self-install.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/step-2-consume-slot-render.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/step-3-contribute-subslot.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/step-4-panel-interaction.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/step-5-shell-config-assembly.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/step-6-packaged-offline-assembly.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/smoke.spec.ts
- apps/desktop/e2e/slot-collision-coexistence/step-1-hello-world-baseline.spec.ts
- apps/desktop/e2e/slot-collision-coexistence/step-2-install-collision-fixture.spec.ts
- apps/desktop/e2e/slot-collision-coexistence/step-3-observe-collision-behavior.spec.ts
- apps/desktop/e2e/slot-collision-coexistence/step-4-archive-collision-conclusion.spec.ts
- apps/desktop/e2e/slot-collision-coexistence/step-5-uninstall-restore.spec.ts
- apps/desktop/e2e/slot-collision-coexistence/smoke.spec.ts
- apps/desktop/e2e/spike-conclusion-fallback/step-1-probe-plugin-add-profile.spec.ts
- apps/desktop/e2e/spike-conclusion-fallback/step-2-probe-out-of-tree-materialization.spec.ts
- apps/desktop/e2e/spike-conclusion-fallback/step-3-probe-inject-declarant.spec.ts
- apps/desktop/e2e/spike-conclusion-fallback/step-4-distribution-offline-conclusion.spec.ts
- apps/desktop/e2e/spike-conclusion-fallback/step-5-report-review-gate.spec.ts
- apps/desktop/e2e/spike-conclusion-fallback/smoke.spec.ts
- apps/desktop/e2e/third-party-template-onboarding/step-1-scaffold-plugin-package.spec.ts
- apps/desktop/e2e/third-party-template-onboarding/step-2-declare-versions.spec.ts
- apps/desktop/e2e/third-party-template-onboarding/step-3-build-plugin.spec.ts
- apps/desktop/e2e/third-party-template-onboarding/step-4-install-official-web.spec.ts
- apps/desktop/e2e/third-party-template-onboarding/step-5-view-injection-result.spec.ts
- apps/desktop/e2e/third-party-template-onboarding/smoke.spec.ts
- apps/desktop/e2e/version-consistency-assertion/step-1-green-light-baseline.spec.ts
- apps/desktop/e2e/version-consistency-assertion/step-2-red-light-mismatch.spec.ts
- apps/desktop/e2e/version-consistency-assertion/step-3-template-stamp-visibility.spec.ts
- apps/desktop/e2e/version-consistency-assertion/smoke.spec.ts
- justfile

### Files Modified
无

### Key Decisions
无

## Cases Generated
79

## Cases Evaluated
79

## Scripts Created
- apps/desktop/e2e/config-driven-plugin-lifecycle/step-1-config-add-entry.spec.ts
- apps/desktop/e2e/config-driven-plugin-lifecycle/step-2-shell-boot-apply-add.spec.ts
- apps/desktop/e2e/config-driven-plugin-lifecycle/step-3-write-once-preservation.spec.ts
- apps/desktop/e2e/config-driven-plugin-lifecycle/step-4-config-remove-entry.spec.ts
- apps/desktop/e2e/config-driven-plugin-lifecycle/step-5-reinstall-lifecycle-loop.spec.ts
- apps/desktop/e2e/config-driven-plugin-lifecycle/smoke.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/step-1-official-web-self-install.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/step-2-consume-slot-render.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/step-3-contribute-subslot.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/step-4-panel-interaction.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/step-5-shell-config-assembly.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/step-6-packaged-offline-assembly.spec.ts
- apps/desktop/e2e/dual-env-plugin-assembly/smoke.spec.ts
- apps/desktop/e2e/slot-collision-coexistence/step-1-hello-world-baseline.spec.ts
- apps/desktop/e2e/slot-collision-coexistence/step-2-install-collision-fixture.spec.ts
- apps/desktop/e2e/slot-collision-coexistence/step-3-observe-collision-behavior.spec.ts
- apps/desktop/e2e/slot-collision-coexistence/step-4-archive-collision-conclusion.spec.ts
- apps/desktop/e2e/slot-collision-coexistence/step-5-uninstall-restore.spec.ts
- apps/desktop/e2e/slot-collision-coexistence/smoke.spec.ts
- apps/desktop/e2e/spike-conclusion-fallback/step-1-probe-plugin-add-profile.spec.ts
- apps/desktop/e2e/spike-conclusion-fallback/step-2-probe-out-of-tree-materialization.spec.ts
- apps/desktop/e2e/spike-conclusion-fallback/step-3-probe-inject-declarant.spec.ts
- apps/desktop/e2e/spike-conclusion-fallback/step-4-distribution-offline-conclusion.spec.ts
- apps/desktop/e2e/spike-conclusion-fallback/step-5-report-review-gate.spec.ts
- apps/desktop/e2e/spike-conclusion-fallback/smoke.spec.ts
- apps/desktop/e2e/third-party-template-onboarding/step-1-scaffold-plugin-package.spec.ts
- apps/desktop/e2e/third-party-template-onboarding/step-2-declare-versions.spec.ts
- apps/desktop/e2e/third-party-template-onboarding/step-3-build-plugin.spec.ts
- apps/desktop/e2e/third-party-template-onboarding/step-4-install-official-web.spec.ts
- apps/desktop/e2e/third-party-template-onboarding/step-5-view-injection-result.spec.ts
- apps/desktop/e2e/third-party-template-onboarding/smoke.spec.ts
- apps/desktop/e2e/version-consistency-assertion/step-1-green-light-baseline.spec.ts
- apps/desktop/e2e/version-consistency-assertion/step-2-red-light-mismatch.spec.ts
- apps/desktop/e2e/version-consistency-assertion/step-3-template-stamp-visibility.spec.ts
- apps/desktop/e2e/version-consistency-assertion/smoke.spec.ts
- apps/desktop/e2e/helpers/plugins.ts

## Test Results
79/79 passed across all 6 journeys (3.7m, workers=1): config-driven-plugin-lifecycle 18/18 (real reconciliation: add/remove/reinstall cycles, malformed+missing config -> UF4 failed overlay, sha-drift converge via two-version pack, write-once marker identity, .dsh-module-fallback junction immunity, orphan-marker converge, shell-code hash identity); dual-env-plugin-assembly 19/19 (real gate green/red on doctored manifests, roster assembly, dead-proxy offline boot, replica pageerror observable, zero plugin identity in dist/main.cjs, dual-env evidence agreement, stage --check + runtime basename mismatch); slot-collision-coexistence 12/12 (single-declarant baseline clean, fixture-alone control, live replica collision pageerror naming hello-world.panel + 'already declared' with host core alive, three-type archive structure, uninstall restore both variants); spike-conclusion-fallback 11/11 (per-item conclusion+independent-fallback two-column structure, distribution adjudication, M2 gating, SHA-anchored inline facts); third-party-template-onboarding 12/12 (derived-package structure, engines/alignment/stamp gates red-green, artifact contract, host assembly roster); version-consistency-assertion 7/7 (real runGate green baseline, cordis single-line no-false-positive, mismatch/mutable-tag red, template stamp drift). Compile gate `just compile` (playwright --list): 164 tests / 73 files, zero import errors. oxlint: zero errors on all new files.

## Acceptance Criteria
- [x] Test scripts generated for all 6 journeys (at least one spec per journey, journey-scoped directories under the established Playwright testDir apps/desktop/e2e)
- [x] Every Contract Outcome (72/72) covered by at least one test function; exactly one happy-path smoke per journey
- [x] Every file carries @feature ui-plugin-foundation | @web-e2e | @journey tags + Traceability comment to its Contract + SKIP_EVAL_GATE extra-scrutiny header
- [x] Tests execute against real systems (real shell main process, real reconciliation, real gate functions, real plugins/artifacts) with per-test isolation (temp profile/config/resources; repo tree, real userData and $DSH_HOME never touched)
- [x] Compile gate passes (just compile = playwright --list: 164 tests / 73 files) and all 79 generated tests pass (79/79, 3.7m)
- [x] Coverage self-check: 6/6 web journeys -> 6 test suites, 0 gaps

## Notes
Output-directory decision: the skill's single-surface default tests/<journey>/ would collide with vitest's tests/**/*.spec.ts include (pnpm test would execute Playwright specs); the project's established Playwright Electron journey root is apps/desktop/e2e/<journey>/ (playwright.config.ts testDir, 5 prior journeys from this same pipeline) — followed the local convention, journey-scoped direct directories, no staging. SKIP_EVAL_GATE mode: no docs/conventions/testing/web/core.md and no eval-contract reports exist; the running CLI's Quick-mode templates waive the eval gate at the contracts stage (contracts carry skip_eval: true), so generation proceeded with the mandated extra-scrutiny headers; no Convention file -> framework resolved from existing test files (Playwright 1.61 + _electron, per Step 0.3 existing-scan) and the tag format from the established @feature | @web-e2e | @journey header. Two contract-vs-code divergences flagged IN-BAND (low-confidence, reported not auto-resolved per cross-validation rules): (1) dual-env step-2 target-slot-missing and third-party step-4 injection-failure Contracts expect loud failure for absent/invalid slot keys, but archived upstream semantics (spike §3.2, §5移交语 2) are inject-never-fires silent absence with a boot gate deferred to M2 — tests pin the CURRENT archived classification with explicit divergence-flag annotations; (2) config-driven step-1 source-missing Contract says the manifest must not contain the unmaterializable entry, but the implementation rewrites the manifest before seeding and aborts loudly — test asserts the gated behavior (loud abort, no half materialization, no scratch residue) with the nuance annotated. External-environment legs (official dsh web self-install via npx+registry, panel DOM markers on historical assistant turns = user session data, fresh third-party toolchain builds) are annotated per local precedent and asserted via their archived evidence channels (dsh-web-assembly-evidence.md, shell-assembly-packaged-evidence.md, template-walkthrough-evidence.md, artifacts SHELL-S0-panel-*.png) plus hermetic equivalents (roster, gate functions, offline dead-proxy boots, real artifact scans). stage-plugin-tarballs.mjs executes main() at import (module side effect) — never imported; driven via CLI + shipped-source assertions only. New justfile adds the missing `compile` recipe (playwright --list) required by the compile gate.
