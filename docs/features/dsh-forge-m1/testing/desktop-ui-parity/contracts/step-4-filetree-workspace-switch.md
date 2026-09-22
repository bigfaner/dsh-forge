---
journey: "desktop-ui-parity"
step: "4"
step-action: "Exercise the file tree and workspace switching"
generated: "2026-09-20"
sources:
  - docs/features/dsh-forge-m1/testing/desktop-ui-parity/journey.md
anchors:
  web:
    page: "主窗口 (inherited upstream GUI)"
    route: "dsh-app://"
    requires_auth: false
    layout: "上游 client UI 插件族"
last_anchor_sync: "2026-09-20T12:00:00Z"
---
# Contract: desktop-ui-parity / Step 4: Exercise the file tree and workspace switching

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A — no form submission in this step; session-expired applies (Outcome session-expired-mid-parity). -->

## Outcome "success"
- Preconditions: "At least two workspaces exist, each with a browsable file tree"
  fixture_spec:
    entities:
      - entity_type: "Workspace"
        min_count: 2
        field_constraints:
          - field: "file_tree"
            value: "browsable"
- Input: "User browses the workspace file tree and switches to another workspace"
- Output: "File tree navigation and workspace switching work identically to the web GUI with no state loss"
- State: "Current workspace selection changes; session and UI state of both workspaces preserved"
- Side-effect: "none"

## Outcome "empty-workspace"
- Preconditions: "The target workspace to switch to contains no sessions while at least one other workspace has sessions"
  fixture_spec:
    entities:
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "sessions"
            value: "none in the target workspace"
- Input: "User switches to the empty workspace"
- Output: "An appropriate empty state is shown, matching web GUI behavior"
- State: "Workspace switched; no error, no phantom session entries"
- Side-effect: "none"

## Outcome "session-expired-mid-parity"
<!-- surface-required: session-expired (surface-web rule) -->
<!-- source: inferred -->
<!-- reasoning: residual eval attack point (locale/session observation); upstream auth token lapse during extended UI idle must surface in-app exactly as the web GUI does -->
- Preconditions: "The upstream session/auth token has lapsed (e.g., after an extended pause on the settings surface) while the app stays open"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "auth_token"
            value: "expired"
- Input: "User returns to the chat surface and sends a message"
- Output: "Session-expired feedback is shown in-app; the user can re-establish the session without an app restart; previously completed parity checks remain valid"
- State: "Session re-established in-app; no carrier restart; no loss of already-verified surface state"
- Side-effect: "none"

## Journey Invariants

- Every web GUI functional surface exercised in this journey remains 100% usable in the desktop carrier — the user observes identical behavior, rendering, and outcomes on every surface, with no capability loss or carrier-specific failure
- The desktop carrier introduces no UI rewrite artifacts — behavior matches upstream web GUI semantics
- No listening port is opened while using any surface
