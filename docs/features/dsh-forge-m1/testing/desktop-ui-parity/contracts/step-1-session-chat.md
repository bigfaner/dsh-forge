---
journey: "desktop-ui-parity"
step: "1"
step-action: "Use the session and chat surfaces"
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
# Contract: desktop-ui-parity / Step 1: Use the session and chat surfaces

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A — this step performs no form submission; session-expired is exercised at Step 4c. -->

## Outcome "success"
- Preconditions: "dsh-forge desktop app is running with a configured API key and at least one existing session in the current workspace"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "workspace"
            value: "currently selected workspace"
      - entity_type: "Credential"
        min_count: 1
- Input: "User opens an existing session from the sessions list and exchanges chat messages with the assistant"
- Output: "Sessions list, session history, and chat interaction behave identically to the existing web GUI; message flow renders correctly in the desktop carrier"
- State: "New chat messages are appended to the session history in the upstream existing format"
- Side-effect: "none"

## Outcome "prior-web-gui-sessions-readable"
- Preconditions: "Sessions were created earlier via the web GUI or CLI in the shared $DSH_HOME and have never been opened in the desktop carrier"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "created_by"
            value: "web GUI or CLI (not dsh-forge)"
- Input: "User opens those prior sessions in the desktop carrier"
- Output: "Prior sessions and their full history are readable and continuable — no format mismatch error, no truncated or missing history"
- State: "Shared $DSH_HOME session data unchanged in format; no migration or rewrite occurs on read"
- Side-effect: "none"

## Journey Invariants

- Every web GUI functional surface exercised in this journey remains 100% usable in the desktop carrier — the user observes identical behavior, rendering, and outcomes on every surface, with no capability loss or carrier-specific failure
- The desktop carrier introduces no UI rewrite artifacts — behavior matches upstream web GUI semantics
- No listening port is opened while using any surface
