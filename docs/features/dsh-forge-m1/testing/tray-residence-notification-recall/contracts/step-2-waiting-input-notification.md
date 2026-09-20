---
journey: "tray-residence-notification-recall"
step: "2"
step-action: "Receive a waiting-for-user-input notification"
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
# Contract: tray-residence-notification-recall / Step 2: Receive a waiting-for-user-input notification

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A — no form submission; session-expired covered at Step 4d. -->
<!-- fixture entity mapping: OSPermission is OS-level state (notification permission) with no tech-design §Data Models counterpart; fixture generation sets it via the OS notification settings of the test environment -->

## Outcome "success"
<!-- residual eval attack point (locale observation) folded into success Output: notification text must follow the active upstream locale, observed in both zh and en -->
- Preconditions: "App is tray-resident with the window closed; a session reaches a waiting-for-user-input state; OS notification permission granted"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "waiting for user input"
      - entity_type: "SystemTray"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "app resident"
- Input: "The session reaches the waiting state while the window is closed (no explicit user action; system-driven event)"
- Output: "A system notification fires (verified on each of Windows, macOS, and Linux at least once) identifying the waiting session, with text in the currently active upstream locale (zh or en) — Fact FT-014 locale mechanism"
- State: "Notification dispatched; app remains tray-resident with process count 2"
- Side-effect: "OS notification posted via the notifier"

## Outcome "notification-permission-denied"
- Preconditions: "The OS notification permission for the app is denied"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "waiting for user input"
      - entity_type: "OSPermission"
        min_count: 1
        field_constraints:
          - field: "notifications"
            value: "denied"
- Input: "A session reaches a waiting state while permission is denied"
- Output: "No crash or error loop; the app degrades gracefully (session state still visible on manual window restore) — Fact FT-002 ERR_NOTIFICATION_DENIED semantics"
- State: "App healthy, tray-resident; no retry storm"
- Side-effect: "none"

## Journey Invariants

- While resident, the app never spawns extra own processes beyond the shell main process plus host subprocess (idle steady-state own process count = 2)
- Every notification click always focuses the specific session the notification refers to
- Notification and tray texts are bilingual per the upstream locale mechanism
