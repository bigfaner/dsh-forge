---
journey: "update-awareness-crash-recovery"
step: "3"
step-action: "Force-kill the host subprocess mid-session"
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
# Contract: update-awareness-crash-recovery / Step 3: Force-kill the host subprocess mid-session

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A and session-expired N/A — no form; expiry covered at Step 5a. Per-step Outcome count is 2 (below High target of 3): the fact-backed crash boundaries are exhausted at this step — shell-main-crash here and the recovery-path variants at Step 4; journey total (14) meets the 13-20 target. -->

## Outcome "success"
- Preconditions: "A session is in progress with the host subprocess running"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "in progress"
      - entity_type: "HostSubprocess"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "running"
- Input: "User (or harness) force-kills the host subprocess while the session is in progress"
- Output: "The shell main process stays alive and shows a crash-recovery notice; the app does not silently exit or hang"
- State: "Shell alive in recovery state; host subprocess dead; own process count temporarily 1"
- Side-effect: "none"

## Outcome "shell-main-crash"
- Preconditions: "The shell main process (not just the host subprocess) terminates abnormally"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "persisted events present"
      - entity_type: "ShellProcess"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "abnormally terminated"
- Input: "User relaunches the app after the shell main process crash"
- Output: "The app starts normally and the most recent session state is restored from session persistence — no work is lost"
- State: "App relaunched; session state restored from persistence; process count returns to 2"
- Side-effect: "none"

## Journey Invariants

- The update check never blocks or breaks startup, in success or failure, at any point
- The only outbound network traffic is the read-only HTTPS access to the Releases feed — no listening ports are ever opened
- After any crash and restart path, the most recent session state recoverable from session persistence is restored and no persisted session data is destroyed
- At steady state after recovery, own process count returns to exactly 2 (shell main process + host subprocess)
