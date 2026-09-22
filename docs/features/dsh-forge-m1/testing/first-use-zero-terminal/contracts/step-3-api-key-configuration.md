---
journey: "first-use-zero-terminal"
step: "3"
step-action: "Complete API key configuration in-app"
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
# Contract: first-use-zero-terminal / Step 3: Complete API key configuration in-app

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error applies to this step (credential form submission — see Outcome invalid-api-key). -->

## Outcome "success"
- Preconditions: "App is launched with the main window showing the upstream session GUI and no credential configured yet"
  fixture_spec:
    entities:
      - entity_type: "ProfileDirectory"
        min_count: 1
        field_constraints:
          - field: "credentials"
            value: "none configured yet"
- Input: "User follows the in-app credential configuration flow and enters a valid API key"
- Output: "The API key is stored via the upstream $DSH_HOME credential mechanism without leaving the app; sensitive values are masked in the UI"
- State: "Credential persisted in shared $DSH_HOME in the upstream existing format; UI shows masked value"
- Side-effect: "none"

## Outcome "invalid-api-key"
<!-- surface-required: validation-error (surface-web rule) -->
- Preconditions: "The user has entered an invalid or rejected API key into the credential form"
  fixture_spec:
    entities:
      - entity_type: "ProfileDirectory"
        min_count: 1
        field_constraints:
          - field: "credentials"
            value: "none or prior key; draft key invalid"
- Input: "User submits the credential configuration"
- Output: "Upstream validation feedback is shown in-app; the user can correct the key without restarting; no partial or corrupt credential state is persisted"
- State: "No credential persisted from the invalid submission; prior credential state (if any) unchanged"
- Side-effect: "none"

## Outcome "masked-key-redisplay"
<!-- source: inferred -->
<!-- reasoning: journey expected result specifies masking on store (Step 3); residual eval attack point (mask observation) extends it to redisplay — the highest-risk leak path for a shell carrier rendering the upstream settings surface -->
- Preconditions: "A valid API key has been configured and persisted"
  fixture_spec:
    entities:
      - entity_type: "Credential"
        min_count: 1
        field_constraints:
          - field: "masking"
            value: "stored, masked in UI"
- Input: "User re-opens the settings/credential view after configuration"
- Output: "The stored key remains masked on redisplay; the full key value is never rendered in cleartext"
- State: "Credential unchanged; no cleartext exposure in UI state"
- Side-effect: "none"

## Journey Invariants

- The entire journey uses zero terminal commands — every interaction happens inside the app UI or the OS installer flow
- The app opens no listening ports at any point; all traffic is carried over the dsh-app:// carrier
- The dsh-forge profile directory remains independent of (and never overwrites) the upstream desktop profile
- Shared $DSH_HOME data (sessions, settings, credentials) is only read/written in the upstream existing format
