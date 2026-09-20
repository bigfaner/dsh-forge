---
journey: "update-awareness-crash-recovery"
step: "4"
step-action: "Restart the host subprocess and recover the session"
generated: "2026-09-20"
sources:
  - docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/journey.md
anchors:
  web:
    page: "主窗口 (inherited upstream GUI)"
    route: "dsh-app://"
    requires_auth: false
    layout: "上游 client UI 插件族"
last_anchor_sync: "2026-09-20T12:00:00Z"
---
# Contract: update-awareness-crash-recovery / Step 4: Restart the host subprocess and recover the session

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: session-expired applies to this step (Outcome session-expired-during-recovery); validation-error N/A — no form submission. -->

## Outcome "success"
- Preconditions: "The host subprocess was killed mid-session; a crash-recovery notice is displayed"
  fixture_spec:
    entities:
      - entity_type: "RecoveryState"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "crash-recovery notice shown"
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "persisted, most recent events"
- Input: "User triggers (or accepts) the host subprocess restart from the recovery notice"
- Output: "The host subprocess restarts with the bundled runtime, and the most recent session state is restored from session persistence so the user can continue where they left off"
- State: "Host subprocess running; session restored; process count back to 2"
- Side-effect: "none"

## Outcome "incomplete-session-persistence"
- Preconditions: "The host was killed before the latest session events were fully flushed"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "persistence"
            value: "partially written event stream (last events unflushed)"
- Input: "User restarts the host subprocess"
- Output: "Recovery restores the last consistently persisted session state; the app does not crash on a partially written event stream"
- State: "Session restored to last consistent checkpoint; corrupt tail handled without data destruction beyond the unflushed events"
- Side-effect: "none"

## Outcome "crash-recovery-with-window-closed"
- Preconditions: "The main window is closed and the app is tray-resident when the host subprocess is killed"
  fixture_spec:
    entities:
      - entity_type: "RecoveryState"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "crash occurred while tray-resident"
      - entity_type: "SystemTray"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "app resident"
- Input: "User restores the window after the crash"
- Output: "The crash-recovery notice is visible after restore and the recovery flow works identically"
- State: "Recovery proceeds as in the window-open case; process count returns to 2 after recovery"
- Side-effect: "none"

## Outcome "recovery-retries-exhausted"
- Preconditions: "The recovery restart fails to reach a responsive state on every attempt (e.g., broken runtime so each restart attempt fails)"
  fixture_spec:
    entities:
      - entity_type: "HostSubprocess"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "fails to become responsive on every attempt"
      - entity_type: "RecoveryState"
        min_count: 1
        field_constraints:
          - field: "backoff"
            value: "2s/4s/8s schedule, 3 attempts"
- Input: "User waits through the automatic retry sequence (3 attempts)"
- Output: "Recovery enters the terminal failed state with an ERR_RECOVERY_RETRY_EXHAUSTED-shaped message (≤120-char failure detail shown); no infinite retry loop, no further restart attempts, no silent exit — the shell stays alive showing the failed state (Fact FT-008 BACKOFF_SCHEDULE_MS = [2000, 4000, 8000], retry-exhausted)"
- State: "Recovery state failed (terminal); shell alive; no host subprocess; no ongoing retry timers"
- Side-effect: "none"

## Outcome "session-expired-during-recovery"
<!-- surface-required: session-expired (surface-web rule) -->
<!-- source: inferred -->
<!-- reasoning: surface-web required outcome; the crash/recovery window is an extended period during which tokens lapse, and the restored-but-expired session is the distinctive boundary of this journey -->
- Preconditions: "The upstream session/auth token lapses during the crash/recovery window before the user returns to the window"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "auth_token"
            value: "expired"
          - field: "state"
            value: "recovered from persistence"
- Input: "User completes recovery and attempts to continue the restored session"
- Output: "Session-expired feedback is shown in-app and the user can re-establish the session without an app restart; the recovered persisted session state is not destroyed"
- State: "Session re-established in-app; recovered persisted data intact"
- Side-effect: "none"

## Journey Invariants

- The update check never blocks or breaks startup, in success or failure, at any point
- The only outbound network traffic is the read-only HTTPS access to the Releases feed — no listening ports are ever opened
- After any crash and restart path, the most recent session state recoverable from session persistence is restored and no persisted session data is destroyed
- At steady state after recovery, own process count returns to exactly 2 (shell main process + host subprocess)
