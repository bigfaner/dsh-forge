---
status: "blocked"
started: "2026-10-03 20:18"
completed: "N/A"
time_spent: ""
---

# Task Record: T-test-run Run Web E2E Test

## Summary
Third full run after fix-14/fix-15: terminal state identical to previous run - 46 cases across 6 journeys, 37 pass / 1 fail / 8 documented skips; zero new regressions from fix-14 (native directory picker bridge) or fix-15 (brand mark). Pre-emptive NSIS artifact freshness check found release/installer exe (19:27) predating fix-14 (20:02) / fix-15 (20:17); repacked via canonical pipeline BEFORE running (build 20:22 -> STAGE_OK files=26458 -> electron-builder 20:30:49), with fix-14/15 payloads grep-verified inside the package (runtime/host-dist/ipc/directory-picker-channel.js + web-dist brand SVG). installer-smoke green on rebuilt artifact (composer 20.0s, no modal interception). One new flake observed and discriminated: knowledge-browsing smoke failed once on nav-click-then-view-mount (openKnowledgeView 30s timeout) - non-reproducible on 2 subsequent boots (single-case rerun green 36.9s + full journey rerun 7/7); blast-radius check shows fix-14/15 files have zero overlap with knowledge view mount path; classified as the known non-deterministic boot/phase race family (fix-11 Step1c precedent), not a regression. flywheel smoke fails ONLY on the registered [链口径·缺陷信号] expect.soft group (6/6 errors tagged, zero untagged) - intentional design red carrying the recall-count caliber divergence signal, conversion deferred to M5+ core adjudication. Blocked on the letter of Hard AC #1 only (1 registered design red + 8 committed gen-stage 留痕 skips with recorded conversion conditions) - no actionable fix remains; do NOT spawn a fix task for the design red.

## Changes

### Files Created
无

### Files Modified
- docs/features/dsh-forge-p1-mvp/reports/test-run-latest.md

### Key Decisions
无

## Cases Generated
46

## Cases Evaluated
46

## Scripts Created
无

## Test Results
46 cases / 6 journeys: project-registration 10/10; compensation 5 pass + 3 documented skip; session-workbench 6 pass + 1 documented skip; knowledge-browsing 7/7 after one flake discriminated (single-case rerun green + full rerun green); flywheel 5 pass + 1 fail (registered design red: 链口径 soft group only, 6/6 tagged) + 3 documented skip; installer-smoke 4 pass + 1 documented skip on pre-emptively rebuilt NSIS artifact. Report: docs/features/dsh-forge-p1-mvp/reports/test-run-latest.md. Logs: /z/tmp/p1mvp-run3-01..06-*.log (04b/04c = kb flake discrimination reruns).

## Acceptance Criteria
- [ ] All test cases MUST pass - no skipped tests, no expected failures, no TODO placeholders
- [x] Tests MUST verify actual functional behavior - no placeholder tests, no always-pass mocks, no stub assertions that validate nothing

## Notes
Blocked on the letter of Hard AC #1 only: residual = 1 intentional defect-signal red (flywheel smoke 链口径 group; conversion = M5+ core chain-caliber adjudication, registered in contract tensions #1 and spec inline annotation 勿修勿绕) + 8 committed 留痕 skips from T-test-gen-scripts (fault-injection infra, capability-plane channels, project-tab fixture seam, offline observation channel). Identical blocked shape as previous run - no actionable fix, do NOT spawn fix tasks. Environment: TMP/TEMP untouched (inherited user Temp); NSIS artifact pre-emptively rebuilt before running (freshness discipline from previous run's lesson applied pre-run this time); 5 DSH Desktop.exe processes confirmed as a DIFFERENT product (dsh-forge productName = dsh-forge) with zero single-instance interference; no concurrent heavy load during e2e; teardown swept processes (none leaked), removed .forge/test-state.json, cleaned Z:/dsh-forge-smoke lane residuals.
