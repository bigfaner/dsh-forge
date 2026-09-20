---
journey: "tray-residence-notification-recall"
step: "3"
step-action: "Click the notification to focus the session"
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
# Contract: tray-residence-notification-recall / Step 3: Click the notification to focus the session

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A — no form submission. -->

## Outcome "success"
- Preconditions: "A waiting-for-user-input notification for a specific session is present while the window is closed"
  fixture_spec:
    entities:
      - entity_type: "Notification"
        min_count: 1
        field_constraints:
          - field: "kind"
            value: "waiting for user input"
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "waiting"
- Input: "User clicks the waiting-for-user-input notification"
- Output: "The main window reopens/restores and focuses the corresponding session"
- State: "Window restored and focused on the target session; app process count still 2"
- Side-effect: "none"

## Outcome "session-already-focused"
- Preconditions: "The user has already restored the window and focused the session before clicking the notification"
  fixture_spec:
    entities:
      - entity_type: "Notification"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "stale (session already focused)"
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "already focused in restored window"
- Input: "User clicks the notification anyway"
- Output: "No duplicate window or broken focus; the existing window/session is simply brought to front"
- State: "Still exactly one window and one focused session"
- Side-effect: "none"

## Journey Invariants

- While resident, the app never spawns extra own processes beyond the shell main process plus host subprocess (idle steady-state own process count = 2)
- Every notification click always focuses the specific session the notification refers to
- Notification and tray texts are bilingual per the upstream locale mechanism
