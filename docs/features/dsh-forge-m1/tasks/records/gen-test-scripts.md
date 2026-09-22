---
status: "completed"
started: "2026-09-20 12:41"
completed: "2026-09-20 13:20"
time_spent: "~39m"
---

# Task Record: T-test-gen-scripts Generate Web E2E Test Scripts

## Summary
Generated Playwright web e2e test scripts from all 24 evaluated contracts across the 5 dsh-forge-m1 journeys (desktop-ui-parity, first-use-zero-terminal, multi-install-coexistence, tray-residence-notification-recall, update-awareness-crash-recovery): one spec per contract step (24) plus one happy-path smoke per journey (5), built on a new shared fixture upstream-GUI SPA + host API helper (journeys.ts). Output placed under the existing apps/desktop Playwright infra (workers:1 Electron carrier). OS-surface qualifiers declared by contracts (tray icon, OS notifications, installer, CLI read-back, process-count=2) are annotated per test; one Linux-only degradation test is conditionally skipped. Full run: 73 passed, 1 skipped, 0 failed; tsc gate clean for all generated files.

## Changes

### Files Created
- apps/desktop/e2e\desktop-ui-parity\smoke.spec.ts
- apps/desktop/e2e\desktop-ui-parity\step-1-session-chat.spec.ts
- apps/desktop/e2e\desktop-ui-parity\step-2-approval-surface.spec.ts
- apps/desktop/e2e\desktop-ui-parity\step-3-plan-settings.spec.ts
- apps/desktop/e2e\desktop-ui-parity\step-4-filetree-workspace-switch.spec.ts
- apps/desktop/e2e\desktop-ui-parity\step-5-new-session-user-question.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\smoke.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\step-1-download-install.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\step-2-first-launch.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\step-3-api-key-configuration.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\step-4-workspace-select-create.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\step-5-session-shell-tool.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\step-6-approval-interaction.spec.ts
- apps/desktop/e2e\multi-install-coexistence\smoke.spec.ts
- apps/desktop/e2e\multi-install-coexistence\step-1-install-alongside.spec.ts
- apps/desktop/e2e\multi-install-coexistence\step-2-read-shared-data.spec.ts
- apps/desktop/e2e\multi-install-coexistence\step-3-mutate-shared-data.spec.ts
- apps/desktop/e2e\multi-install-coexistence\step-4-alternate-back.spec.ts
- apps/desktop/e2e\tray-residence-notification-recall\smoke.spec.ts
- apps/desktop/e2e\tray-residence-notification-recall\step-1-close-window-tray-residence.spec.ts
- apps/desktop/e2e\tray-residence-notification-recall\step-2-waiting-input-notification.spec.ts
- apps/desktop/e2e\tray-residence-notification-recall\step-3-notification-click-focus.spec.ts
- apps/desktop/e2e\tray-residence-notification-recall\step-4-turn-completed-notification.spec.ts
- apps/desktop/e2e\tray-residence-notification-recall\step-5-tray-menu-restore-exit.spec.ts
- apps/desktop/e2e\update-awareness-crash-recovery\smoke.spec.ts
- apps/desktop/e2e\update-awareness-crash-recovery\step-1-detect-new-version.spec.ts
- apps/desktop/e2e\update-awareness-crash-recovery\step-2-jump-to-release-page.spec.ts
- apps/desktop/e2e\update-awareness-crash-recovery\step-3-force-kill-host.spec.ts
- apps/desktop/e2e\update-awareness-crash-recovery\step-4-restart-recover-session.spec.ts
- apps/desktop/e2e/helpers/journeys.ts

### Files Modified
无

### Key Decisions
无

## Cases Generated
74

## Cases Evaluated
24

## Scripts Created
- apps/desktop/e2e\desktop-ui-parity\smoke.spec.ts
- apps/desktop/e2e\desktop-ui-parity\step-1-session-chat.spec.ts
- apps/desktop/e2e\desktop-ui-parity\step-2-approval-surface.spec.ts
- apps/desktop/e2e\desktop-ui-parity\step-3-plan-settings.spec.ts
- apps/desktop/e2e\desktop-ui-parity\step-4-filetree-workspace-switch.spec.ts
- apps/desktop/e2e\desktop-ui-parity\step-5-new-session-user-question.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\smoke.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\step-1-download-install.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\step-2-first-launch.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\step-3-api-key-configuration.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\step-4-workspace-select-create.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\step-5-session-shell-tool.spec.ts
- apps/desktop/e2e\first-use-zero-terminal\step-6-approval-interaction.spec.ts
- apps/desktop/e2e\multi-install-coexistence\smoke.spec.ts
- apps/desktop/e2e\multi-install-coexistence\step-1-install-alongside.spec.ts
- apps/desktop/e2e\multi-install-coexistence\step-2-read-shared-data.spec.ts
- apps/desktop/e2e\multi-install-coexistence\step-3-mutate-shared-data.spec.ts
- apps/desktop/e2e\multi-install-coexistence\step-4-alternate-back.spec.ts
- apps/desktop/e2e\tray-residence-notification-recall\smoke.spec.ts
- apps/desktop/e2e\tray-residence-notification-recall\step-1-close-window-tray-residence.spec.ts
- apps/desktop/e2e\tray-residence-notification-recall\step-2-waiting-input-notification.spec.ts
- apps/desktop/e2e\tray-residence-notification-recall\step-3-notification-click-focus.spec.ts
- apps/desktop/e2e\tray-residence-notification-recall\step-4-turn-completed-notification.spec.ts
- apps/desktop/e2e\tray-residence-notification-recall\step-5-tray-menu-restore-exit.spec.ts
- apps/desktop/e2e\update-awareness-crash-recovery\smoke.spec.ts
- apps/desktop/e2e\update-awareness-crash-recovery\step-1-detect-new-version.spec.ts
- apps/desktop/e2e\update-awareness-crash-recovery\step-2-jump-to-release-page.spec.ts
- apps/desktop/e2e\update-awareness-crash-recovery\step-3-force-kill-host.spec.ts
- apps/desktop/e2e\update-awareness-crash-recovery\step-4-restart-recover-session.spec.ts

## Test Results
74 test cases generated from 24 contracts; playwright run: 73 passed, 1 skipped (Linux-only tray qualifier), 0 failed

## Acceptance Criteria
- [x] All acceptance criteria met (task file): executable web test scripts generated from approved test cases
- [x] Every contract step outcome mapped to a test function with traceability comments
- [x] Exactly one happy-path smoke test per journey (5/5)
- [x] Compile gate: tsc --noEmit clean for all generated files
- [x] Coverage self-check: web journeys 5/5 covered, 0 gaps

## Notes
Residual eval attack points from testing/eval/contract-report.md applied: non-observable-state selectors and OS-qualified assertions (process count, notification posting, CLI round-trip) recorded as test annotations instead of flaky selectors; relationship declarations realized as fixture entities (SharedHomeData/Workspace/Session parent-child) in journeys.ts. Deviation: output written to apps/desktop/e2e/<journey>/ (project's existing Playwright testDir) rather than tests/<journey>/ so the specs run under the existing workers:1 Electron config.
