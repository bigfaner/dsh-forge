---
journey: "tray-residence-notification-recall"
step: "5"
step-action: "Restore or exit from the tray menu"
generated: "2026-09-20"
sources:
  - docs/features/dsh-forge-m1/testing/tray-residence-notification-recall/journey.md
anchors:
  web:
    page: "主窗口 (inherited upstream GUI)"
    route: "dsh-app://"
    requires_auth: false
    layout: "上游 client UI 插件族"
last_anchor_sync: "2026-09-20T12:00:00Z"
---
# Contract: tray-residence-notification-recall / Step 5: Restore or exit from the tray menu

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A and session-expired N/A — tray-menu step with no form submission; expiry covered at Step 4d. -->

## Outcome "success"
- Preconditions: "App is tray-resident with the window closed and a live session state"
  fixture_spec:
    entities:
      - entity_type: "SystemTray"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "app resident"
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "live"
- Input: "User opens the tray menu, chooses restore window, then later chooses fully exit"
- Output: "Restore reopens the main window with session state intact; fully exit cleanly terminates the app and its child processes"
- State: "After restore: window open, state intact; after exit: no dsh-forge processes remain"
- Side-effect: "none"

## Outcome "tray-unavailable-linux"
<!-- residual eval attack point (ERR_TRAY_UNAVAILABLE precise assertion): the degradation must be attributable to the tray-unavailable condition (FT-001), not an unspecified failure -->
- Preconditions: "No system tray is present in the Linux desktop environment"
  fixture_spec:
    entities:
      - entity_type: "SystemTray"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "unavailable on Linux"
- Input: "User closes the main window"
- Output: "The app does not become unreachable — behavior degrades predictably (window close falls back without orphaning a resident process); an ERR_TRAY_UNAVAILABLE-shaped condition is recorded in diagnostics (Fact FT-001) without crashing the app"
- State: "No orphaned headless resident process; app state consistent and user-reachable"
- Side-effect: "none"

## Journey Invariants

- While resident, the app never spawns extra own processes beyond the shell main process plus host subprocess (idle steady-state own process count = 2)
- Every notification click always focuses the specific session the notification refers to
- Notification and tray texts are bilingual per the upstream locale mechanism
