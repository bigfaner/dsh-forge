---
journey: "tray-residence-notification-recall"
step: "4"
step-action: "Receive a turn-completed notification and return"
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
# Contract: tray-residence-notification-recall / Step 4: Receive a turn-completed notification and return

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: session-expired applies to this step (Outcome session-expired-tray-resident); validation-error N/A — no form submission. Per-step Outcome count is 4 (above Medium per-step target 2-3) due to surface-required + fact-backed dedup boundary — documented override. -->

## Outcome "success"
- Preconditions: "App is tray-resident with the window closed; another turn completes"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "turn in progress, window closed"
      - entity_type: "SystemTray"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "app resident"
- Input: "User triggers another turn, closes the window, waits for turn completion, then clicks the notification"
- Output: "The turn-completed notification fires (each platform at least once) and clicking it focuses the corresponding session window"
- State: "Window restored and focused on the completing session; process count 2"
- Side-effect: "none"

## Outcome "multiple-concurrent-waiting-sessions"
- Preconditions: "Two sessions are both waiting for user input while the window is closed"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 2
        field_constraints:
          - field: "state"
            value: "waiting (2 distinct sessions)"
- Input: "User receives notifications and clicks the one for the second session"
- Output: "Each notification focuses its own corresponding session, with no cross-session misdirection"
- State: "Focus lands on the second session only; first session still waiting"
- Side-effect: "none"

## Outcome "same-session-dedup-window"
- Preconditions: "The same session emits the same event type repeatedly within 10 seconds while the window is closed"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "repeats same event type within 10 seconds"
      - entity_type: "NotificationDedup"
        min_count: 1
        field_constraints:
          - field: "window"
            value: "10s per session per event type"
    relationships:
      - parent_entity: "Session"
        child_entity: "NotificationDedup"
        relationship_type: "scoped_to (dedup window is per session per event type)"
- Input: "User lets both events fire, observes the notification area, then clicks the merged notification"
<!-- Fact FT-007 DEDUP_WINDOW_MS = 10000 — the behavioral 10-second window below is the fact's user-visible form -->
- Output: "The events are merged into a single notification whose content reflects the latest event (no duplicate notification stack) within a 10-second deduplication window; clicking it still focuses the corresponding session"
- State: "Exactly one notification for the session/event-type pair; click focuses the correct session"
- Side-effect: "none"

## Outcome "session-expired-tray-resident"
<!-- surface-required: session-expired (surface-web rule) -->
<!-- source: inferred -->
<!-- reasoning: surface-web required outcome; extended tray residency is precisely the condition under which auth tokens lapse -->
- Preconditions: "The app has been tray-resident with a waiting session long enough that the upstream session/auth token has lapsed"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "auth_token"
            value: "expired"
          - field: "state"
            value: "waiting, window closed"
- Input: "User clicks the recall notification (or restores the window from the tray) and attempts to resume the session"
- Output: "Session-expired feedback is shown in-app and the user can re-establish the session without an app restart; the tray/notification system does not enter an error loop"
- State: "Session re-established in-app; app healthy and resident-state consistent"
- Side-effect: "none"

## Journey Invariants

- While resident, the app never spawns extra own processes beyond the shell main process plus host subprocess (idle steady-state own process count = 2)
- Every notification click always focuses the specific session the notification refers to
- Notification and tray texts are bilingual per the upstream locale mechanism
