---
journey: "multi-install-coexistence"
step: "2"
step-action: "Read shared data from dsh-forge"
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
# Contract: multi-install-coexistence / Step 2: Read shared data from dsh-forge

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A — read-only step; session-expired covered at Step 4d. -->
<!-- fixture entity mapping: RunningInstance ≙ UpstreamLock (tech-design §Data Models) observed at the OS-process level (one per app) -->

## Outcome "success"
- Preconditions: "dsh-forge is launched; $DSH_HOME contains sessions and credentials created earlier by CLI and/or the official desktop"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "created_by"
            value: "CLI or official desktop"
      - entity_type: "Credential"
        min_count: 1
        field_constraints:
          - field: "created_by"
            value: "CLI or official desktop"
    relationships:
      - parent_entity: "SharedHomeData"
        child_entity: "Session"
        relationship_type: "stored_in (shared $DSH_HOME, upstream existing format)"
      - parent_entity: "SharedHomeData"
        child_entity: "Credential"
        relationship_type: "stored_in (shared $DSH_HOME, upstream existing format)"
- Input: "User opens dsh-forge and browses sessions and credentials created earlier by CLI/official desktop"
- Output: "Shared $DSH_HOME sessions and credentials are read correctly in the upstream existing format"
- State: "No write occurs to the browsed data; format unchanged"
- Side-effect: "none"

## Outcome "second-instance-while-both-apps-run"
<!-- known-unknown: simultaneous cross-form concurrent writes are not specified by PRD/tech-design; this journey only asserts alternating access (see Step 4c) -->
- Preconditions: "dsh-forge is running and the official upstream desktop app is also running (two different apps, one instance each)"
  fixture_spec:
    entities:
      - entity_type: "RunningInstance"
        min_count: 1
        field_constraints:
          - field: "app"
            value: "dsh-forge"
      - entity_type: "RunningInstance"
        min_count: 1
        field_constraints:
          - field: "app"
            value: "official upstream desktop"
- Input: "User launches a second dsh-forge instance while both apps are running"
- Output: "The dsh-forge single-instance lock prevents the second dsh-forge instance (existing window focused or restored from tray); the official desktop app is unaffected; no second dsh-forge host subprocess or profile contention (Fact FT-006)"
- State: "Exactly one dsh-forge instance and one official desktop instance remain"
- Side-effect: "none"

## Outcome "credential-read-shared"
<!-- source: inferred -->
<!-- reasoning: Journey Step 3b covers the CLI-updates-while-resident case; the plain read variant (no tray residency) isolates format compatibility of the newest CLI-written credential — residual eval attack point (Step 3b inference annotation) -->
- Preconditions: "A credential was most recently written by the CLI in the shared $DSH_HOME"
  fixture_spec:
    entities:
      - entity_type: "Credential"
        min_count: 1
        field_constraints:
          - field: "last_writer"
            value: "dsh CLI"
- Input: "User opens the credential/settings view inside dsh-forge"
- Output: "The CLI-written credential is read and displayed (masked) without stale-state failure or format complaint"
- State: "Credential file unchanged on read"
- Side-effect: "none"

## Journey Invariants

- The dsh-forge profile directory is never equal to, and never overwrites, the upstream desktop profile directory at any point
- All reads/writes to $DSH_HOME use the upstream existing format — no data migration or schema change ever occurs
- After every alternation step, shared sessions and credentials remain readable by all installed forms
- A single-instance lock ensures at most one dsh-forge instance runs at any time
