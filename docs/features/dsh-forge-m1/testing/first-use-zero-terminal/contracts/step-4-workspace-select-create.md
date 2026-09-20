---
journey: "first-use-zero-terminal"
step: "4"
step-action: "Select or create a workspace"
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
# Contract: first-use-zero-terminal / Step 4: Select or create a workspace

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A — workspace creation has no validation-bearing form in this journey; session-expired N/A — no active session yet. -->

## Outcome "success"
- Preconditions: "API key configured and at least one existing workspace available in the picker"
  fixture_spec:
    entities:
      - entity_type: "Credential"
        min_count: 1
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "count"
            value: "at least 1 existing"
- Input: "User chooses an existing workspace from the workspace switcher"
- Output: "The workspace is selected and the session UI is ready to start a conversation"
- State: "Current workspace selection set; session UI ready"
- Side-effect: "none"

## Outcome "no-workspace-yet"
- Preconditions: "Fresh profile with no existing workspaces"
  fixture_spec:
    entities:
      - entity_type: "ProfileDirectory"
        min_count: 1
        field_constraints:
          - field: "workspaces"
            value: "none exist"
- Input: "User creates a new workspace when prompted"
- Output: "Workspace creation succeeds and the session UI becomes ready"
- State: "New workspace persisted in the upstream existing format; profile no longer empty of workspaces"
- Side-effect: "none"

## Outcome "create-workspace-with-shared-home-data"
<!-- source: inferred -->
<!-- reasoning: Fact FT-013 (profile isolation) — the freshest-boundary variant is creating state while shared upstream data already exists; first-use on a truly clean machine never exercises this interleaving -->
- Preconditions: "Fresh dsh-forge profile, but shared $DSH_HOME already contains upstream product data (sessions/settings from CLI or official desktop)"
  fixture_spec:
    entities:
      - entity_type: "ProfileDirectory"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "dsh-forge (fresh)"
      - entity_type: "SharedHomeData"
        min_count: 1
        field_constraints:
          - field: "source"
            value: "upstream CLI or official desktop"
- Input: "User creates a new workspace in dsh-forge"
- Output: "Workspace creation succeeds without touching or migrating the pre-existing shared data; the new workspace coexists with upstream data"
- State: "dsh-forge profile and shared $DSH_HOME both present and mutually unmodified"
- Side-effect: "none"

## Journey Invariants

- The entire journey uses zero terminal commands — every interaction happens inside the app UI or the OS installer flow
- The app opens no listening ports at any point; all traffic is carried over the dsh-app:// carrier
- The dsh-forge profile directory remains independent of (and never overwrites) the upstream desktop profile
- Shared $DSH_HOME data (sessions, settings, credentials) is only read/written in the upstream existing format
