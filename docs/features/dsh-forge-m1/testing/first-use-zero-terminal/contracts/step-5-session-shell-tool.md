---
journey: "first-use-zero-terminal"
step: "5"
step-action: "Start a session and exercise the shell tool"
generated: "2026-09-20"
sources:
  - docs/features/dsh-forge-m1/testing/first-use-zero-terminal/journey.md
anchors:
  web:
    page: "主窗口 (inherited upstream GUI)"
    route: "dsh-app://"
    requires_auth: false
    layout: "上游 client UI 插件族"
last_anchor_sync: "2026-09-20T12:00:00Z"
---
# Contract: first-use-zero-terminal / Step 5: Start a session and exercise the shell tool

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: session-expired applies to this step (Outcome session-expired-during-first-session); validation-error N/A — message send has no validation-bearing form. -->

## Outcome "success"
- Preconditions: "Workspace ready with a configured API key; a session is running"
  fixture_spec:
    entities:
      - entity_type: "Credential"
        min_count: 1
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "session UI ready"
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "running"
    relationships:
      - parent_entity: "Workspace"
        child_entity: "Session"
        relationship_type: "contains (session runs inside the selected workspace)"
      - parent_entity: "SharedHomeData"
        child_entity: "Credential"
        relationship_type: "stored_in (credential persisted in shared $DSH_HOME)"
- Input: "User sends a message that triggers a shell tool call in the running session"
- Output: "At least one shell tool call executes successfully and its result is visible in the session UI"
- State: "Shell tool call and result recorded in the session history in the upstream existing format"
- Side-effect: "none"

## Outcome "waiting-for-user-input"
- Preconditions: "The session enters a waiting-for-user-input state while the window is open"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "waiting for user input"
- Input: "User continues interacting with the session (responds in-app)"
- Output: "The session state is presented in the GUI and the user can respond in-app to resume the workflow"
- State: "Session resumed from the waiting state; no state loss"
- Side-effect: "none"

## Outcome "session-expired-during-first-session"
<!-- surface-required: session-expired (surface-web rule) -->
<!-- source: inferred -->
<!-- reasoning: surface-web required outcome for session-dependent steps; token lapse during extended idle is the realistic first-use boundary -->
- Preconditions: "The upstream session/auth token lapses while the user is mid-workflow in the first session (e.g., extended idle after the shell tool call)"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "auth_token"
            value: "expired"
          - field: "state"
            value: "mid-workflow"
- Input: "User sends the next message or triggers the next approval"
- Output: "Session-expired feedback is shown in-app and the user can re-establish the session (re-authenticate/restart the session) without restarting the app; no silent data loss"
- State: "Session re-established in-app; persisted session history intact"
- Side-effect: "none"

## Journey Invariants

- The entire journey uses zero terminal commands — every interaction happens inside the app UI or the OS installer flow
- The app opens no listening ports at any point; all traffic is carried over the dsh-app:// carrier
- The dsh-forge profile directory remains independent of (and never overwrites) the upstream desktop profile
- Shared $DSH_HOME data (sessions, settings, credentials) is only read/written in the upstream existing format
