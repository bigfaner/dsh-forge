---
journey: "tray-residence-notification-recall"
step: "1"
step-action: "Close the main window and verify tray residence"
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
# Contract: tray-residence-notification-recall / Step 1: Close the main window and verify tray residence

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A and session-expired N/A — no form submission; session dependency exercised at Step 4d. -->

## Outcome "success"
- Preconditions: "App is running with at least one active session; system tray available; notification permission granted"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "running"
      - entity_type: "SystemTray"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "available"
- Input: "User closes the main window while a session is running"
- Output: "The app stays resident in the system tray (does not exit); both the shell process and host subprocess remain alive"
- State: "App tray-resident; own process count remains 2 (shell + host)"
  <!-- source: inferred — the steady-state process-count bound (shell main + host subprocess = 2) comes from this journey's invariant, not from a fact-table entry; verified by the journey-level OS/desktop smoke -->
- Side-effect: "none"

## Outcome "full-exit-via-tray"
<!-- distinguishing system state vs success: the user's session is finalized for termination (exit intent already registered), not merely window-close residency -->
- Preconditions: "App is running with a session whose work the user has concluded; the app is in a terminable state (exit intent registered — distinct from the close-window-to-residency state of the success outcome)"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "running"
      - entity_type: "SystemTray"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "available"
- Input: "User confirms full exit from the tray menu"
- Output: "The app and host subprocess terminate cleanly; session data remains persisted and available on next launch"
- State: "No dsh-forge processes remain; session data persisted"
- Side-effect: "none"

## Journey Invariants

- While resident, the app never spawns extra own processes beyond the shell main process plus host subprocess (idle steady-state own process count = 2)
- Every notification click always focuses the specific session the notification refers to
- Notification and tray texts are bilingual per the upstream locale mechanism
