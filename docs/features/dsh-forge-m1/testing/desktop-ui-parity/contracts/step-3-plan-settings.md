---
journey: "desktop-ui-parity"
step: "3"
step-action: "Exercise the plan and settings surfaces"
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
# Contract: desktop-ui-parity / Step 3: Exercise the plan and settings surfaces

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error applies to this step (settings form submission — see Outcome invalid-settings-rejected). -->

## Outcome "success"
- Preconditions: "App is running with a valid, persisted settings state and at least one session"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
      - entity_type: "Settings"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "valid (persisted, loadable)"
- Input: "User opens the plan view and reviews/modifies settings pages"
- Output: "Plan display and settings read/write work identically to the web GUI, including API key masking behavior"
- State: "Modified settings persist to shared $DSH_HOME in the upstream existing format; sensitive values remain masked in the UI"
- Side-effect: "none"

## Outcome "settings-confirmation-dialog"
- Preconditions: "A pending settings change requires an upstream confirmation dialog"
  fixture_spec:
    entities:
      - entity_type: "Settings"
        min_count: 1
        field_constraints:
          - field: "pending_change"
            value: "requires confirmation"
- Input: "User confirms the dialog inside the desktop carrier"
- Output: "The dialog renders and behaves the same as in the web GUI; the change takes effect on confirm"
- State: "Settings updated only after confirmation"
- Side-effect: "none"

## Outcome "invalid-settings-rejected"
<!-- surface-required: validation-error (surface-web rule) -->
- Preconditions: "Settings currently hold valid persisted values and the user has entered a draft value that upstream validation rejects"
  fixture_spec:
    entities:
      - entity_type: "Settings"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "valid prior values persisted"
          - field: "draft"
            value: "invalid value rejected by upstream validation"
- Input: "User submits the invalid settings value"
- Output: "In-app validation feedback is shown (same message and behavior as the web GUI); previous valid settings are preserved; no partial settings write"
- State: "Persisted settings unchanged from the last valid state"
- Side-effect: "none"

## Journey Invariants

- Every web GUI functional surface exercised in this journey remains 100% usable in the desktop carrier — the user observes identical behavior, rendering, and outcomes on every surface, with no capability loss or carrier-specific failure
- The desktop carrier introduces no UI rewrite artifacts — behavior matches upstream web GUI semantics
- No listening port is opened while using any surface
