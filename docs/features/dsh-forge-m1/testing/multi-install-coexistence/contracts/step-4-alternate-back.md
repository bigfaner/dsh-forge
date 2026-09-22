---
journey: "multi-install-coexistence"
step: "4"
step-action: "Alternate back to CLI and official desktop"
generated: "2026-09-20"
sources:
  - docs/features/dsh-forge-m1/testing/multi-install-coexistence/journey.md
anchors:
  web:
    page: "主窗口 (inherited upstream GUI)"
    route: "dsh-app://"
    requires_auth: false
    layout: "上游 client UI 插件族"
last_anchor_sync: "2026-09-20T12:00:00Z"
---
# Contract: multi-install-coexistence / Step 4: Alternate back to CLI and official desktop

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: session-expired applies to this step (Outcome session-expired-between-forms); validation-error N/A — no form submission. Per-step Outcome count is 4 (within High range). -->

## Outcome "success"
- Preconditions: "dsh-forge has created sessions and settings in the shared $DSH_HOME and is now exited"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 3
        field_constraints:
          - field: "created_by"
            value: "at least one of each: CLI, official desktop, dsh-forge"
      - entity_type: "Credential"
        min_count: 1
    relationships:
      - parent_entity: "SharedHomeData"
        child_entity: "Session"
        relationship_type: "stored_in (shared $DSH_HOME, upstream existing format)"
      - parent_entity: "SharedHomeData"
        child_entity: "Credential"
        relationship_type: "stored_in (shared $DSH_HOME, upstream existing format)"
- Input: "User exits dsh-forge, then uses the CLI and the official desktop app against the same $DSH_HOME"
- Output: "All three forms read the sessions and credentials — including those created by dsh-forge — normally, with zero data corruption"
- State: "Shared data unchanged in format and content apart from each form's own legitimate writes"
- Side-effect: "none"

## Outcome "uninstall-dsh-forge"
<!-- known-unknown: whether the uninstaller removes only the dsh-forge profile directory is not specified by PRD/tech-design; any destructive effect on shared $DSH_HOME data or the upstream desktop profile is a defect and must be recorded -->
- Preconditions: "dsh-forge has created sessions and settings in $DSH_HOME"
  fixture_spec:
    entities:
      - entity_type: "Installation"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "dsh-forge (to be uninstalled)"
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "created_by"
            value: "dsh-forge"
- Input: "User uninstalls dsh-forge, then uses CLI again"
- Output: "Shared $DSH_HOME data remains intact and usable by CLI"
- State: "Shared sessions/credentials intact; observed uninstaller behavior recorded"
- Side-effect: "none"

## Outcome "rapid-alternation"
<!-- known-unknown: absence of torn writes or lock residue under simultaneous access is not asserted — concurrent cross-form writes are UNKNOWN per Step 2b note -->
- Preconditions: "Sessions exist from all three forms; each form is used one at a time (no simultaneous writes)"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "created_by"
            value: "all three forms represented"
- Input: "User rapidly alternates CLI, then dsh-forge, then official desktop, then CLI again, each reading the shared data"
- Output: "All reads succeed each time; no data corruption from rapid alternating access (PRD/tech-design DF003/SC8)"
- State: "Shared data readable by every form after each alternation"
- Side-effect: "none"

## Outcome "session-expired-between-forms"
<!-- surface-required: session-expired (surface-web rule) -->
<!-- source: inferred -->
<!-- reasoning: surface-web required outcome for session-dependent steps; token lapse during time spent in another form is the natural coexistence boundary -->
- Preconditions: "While working in CLI, the upstream session/auth token created in the dsh-forge session has lapsed"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "auth_token"
            value: "expired"
          - field: "created_by"
            value: "dsh-forge session"
- Input: "User switches back to dsh-forge and attempts to continue the session"
- Output: "Session-expired feedback is shown in-app and the user can re-establish the session; shared $DSH_HOME data is not corrupted by the expiry"
- State: "Session re-established in-app; shared data intact"
- Side-effect: "none"

## Journey Invariants

- The dsh-forge profile directory is never equal to, and never overwrites, the upstream desktop profile directory at any point
- All reads/writes to $DSH_HOME use the upstream existing format — no data migration or schema change ever occurs
- After every alternation step, shared sessions and credentials remain readable by all installed forms
- A single-instance lock ensures at most one dsh-forge instance runs at any time
