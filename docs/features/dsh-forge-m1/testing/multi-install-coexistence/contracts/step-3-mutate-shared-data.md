---
journey: "multi-install-coexistence"
step: "3"
step-action: "Mutate shared data from dsh-forge"
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
# Contract: multi-install-coexistence / Step 3: Mutate shared data from dsh-forge

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A — no validation-bearing form in this journey step; session-expired covered at Step 4d. -->

## Outcome "success"
- Preconditions: "dsh-forge is running against the shared $DSH_HOME with existing sessions and credentials"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
      - entity_type: "Credential"
        min_count: 1
      - entity_type: "Settings"
        min_count: 1
- Input: "User creates a new session and updates settings/credentials inside dsh-forge"
- Output: "Writes persist to $DSH_HOME in the upstream existing format with no schema change or migration"
- State: "New session and updated settings/credentials persisted in upstream format"
- Side-effect: "none"

## Outcome "credential-updated-by-cli-between-sessions"
- Preconditions: "While dsh-forge is resident in tray, the user has updated the API key via CLI"
  fixture_spec:
    entities:
      - entity_type: "Credential"
        min_count: 1
        field_constraints:
          - field: "last_writer"
            value: "dsh CLI (updated while dsh-forge tray-resident)"
- Input: "User resumes dsh-forge and starts a new session"
- Output: "dsh-forge picks up the externally updated credential without stale-state failure; no credential file corruption"
- State: "Credential file valid and consistent after the new session starts"
- Side-effect: "none"

## Outcome "settings-write-visible-to-cli"
<!-- source: inferred -->
<!-- reasoning: Fact FT-013 (upstream-format-only writes) is symmetric — the write direction asserted in the journey happy path implies the read-back direction; verifying it closes the format round-trip -->
- Preconditions: "Settings were just written by dsh-forge to the shared $DSH_HOME"
  fixture_spec:
    entities:
      - entity_type: "Settings"
        min_count: 1
        field_constraints:
          - field: "last_writer"
            value: "dsh-forge"
- Input: "User reads the same settings via the dsh CLI"
- Output: "The CLI reads the dsh-forge-written settings normally in the upstream existing format — no parse failure, no missing keys"
- State: "Settings file unchanged by the CLI read"
- Side-effect: "none"

## Journey Invariants

- The dsh-forge profile directory is never equal to, and never overwrites, the upstream desktop profile directory at any point
- All reads/writes to $DSH_HOME use the upstream existing format — no data migration or schema change ever occurs
- After every alternation step, shared sessions and credentials remain readable by all installed forms
- A single-instance lock ensures at most one dsh-forge instance runs at any time
