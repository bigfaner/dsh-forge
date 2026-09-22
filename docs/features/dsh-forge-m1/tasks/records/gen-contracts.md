---
status: "completed"
started: "2026-09-20 12:26"
completed: "2026-09-20 12:32"
time_spent: "~6m"
---

# Task Record: T-test-gen-contracts Generate Test Contracts

## Summary
Generated 24 step-level Contract files (67 outcomes) for the 5 evaluated journeys of dsh-forge-m1 via forge:gen-contracts, plus a 14-entry static fact table (.forge/fact-table.json) from code reconnaissance. Six-dimension declarations with fixture_spec, semantic descriptors (no regex), web anchors from design/page-map.md, and risk-driven density all ON_TARGET (desktop-ui-parity 11/8-12 Medium, first-use-zero-terminal 17/13-20 High, multi-install-coexistence 13/13-20 High, tray-residence-notification-recall 12/8-12 Medium, update-awareness-crash-recovery 14/13-20 High). Residual eval attacks applied: mask x banner queueing edge (FT-010), locale observation on notification output, ERR_TRAY_UNAVAILABLE precise assertion on tray-unavailable-linux, validation-error N/A notes on non-form steps; surface-required validation-error and session-expired outcomes present per journey. Schema validation passed with zero failures.

## Changes

### Files Created
- docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-1-session-chat.md
- docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-2-approval-surface.md
- docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-3-plan-settings.md
- docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-4-filetree-workspace-switch.md
- docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-5-new-session-user-question.md
- docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-1-download-install.md
- docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-2-first-launch.md
- docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-3-api-key-configuration.md
- docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-4-workspace-select-create.md
- docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-5-session-shell-tool.md
- docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-6-approval-interaction.md
- docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-1-install-alongside.md
- docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-2-read-shared-data.md
- docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-3-mutate-shared-data.md
- docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-4-alternate-back.md
- docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-1-close-window-tray-residence.md
- docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-2-waiting-input-notification.md
- docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-3-notification-click-focus.md
- docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-4-turn-completed-notification.md
- docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-5-tray-menu-restore-exit.md
- docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-1-detect-new-version.md
- docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-2-jump-to-release-page.md
- docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-3-force-kill-host.md
- docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-4-restart-recover-session.md
- .forge/fact-table.json

### Files Modified
无

### Key Decisions
无

## Cases Generated
67

## Cases Evaluated
67

## Scripts Created
- docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-1-session-chat.md
- docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-2-approval-surface.md
- docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-3-plan-settings.md
- docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-4-filetree-workspace-switch.md
- docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-5-new-session-user-question.md
- docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-1-download-install.md
- docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-2-first-launch.md
- docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-3-api-key-configuration.md
- docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-4-workspace-select-create.md
- docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-5-session-shell-tool.md
- docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-6-approval-interaction.md
- docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-1-install-alongside.md
- docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-2-read-shared-data.md
- docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-3-mutate-shared-data.md
- docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-4-alternate-back.md
- docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-1-close-window-tray-residence.md
- docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-2-waiting-input-notification.md
- docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-3-notification-click-focus.md
- docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-4-turn-completed-notification.md
- docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/contracts/step-5-tray-menu-restore-exit.md
- docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-1-detect-new-version.md
- docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-2-jump-to-release-page.md
- docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-3-force-kill-host.md
- docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-4-restart-recover-session.md

## Test Results
67 outcomes generated across 24 contract files; schema validation passed (six dimensions, fixture_spec, semantic purity, outcome uniqueness, mutual exclusivity, journey invariants, anchors, side-effect defaults); risk density ON_TARGET for all 5 journeys

## Acceptance Criteria
- [x] At least 1 Contract file generated per Journey
- [x] Each Contract has six-dimension declarations with semantic descriptors (no regex)
- [x] Risk-driven Outcome density targets met per Journey risk level
- [x] Fact Table written to .forge/fact-table.json
- [x] All Contracts passed schema validation

## Notes
Eval gate satisfied via testing/eval/report.md aggregate (1016/1150 PASS, all 7 dimensions above threshold). Residual eval enhancement attacks applied where they mapped naturally: mask x banner queueing (update-awareness step-1, FT-010), locale observation (tray step-2 success output), ERR_TRAY_UNAVAILABLE precise assertion (tray step-5b), validation-error N/A notes on non-form steps, multi-install step-3b inference annotation.
