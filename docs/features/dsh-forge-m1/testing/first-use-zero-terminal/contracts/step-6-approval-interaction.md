---
journey: "first-use-zero-terminal"
step: "6"
step-action: "Complete an approval interaction"
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
# Contract: first-use-zero-terminal / Step 6: Complete an approval interaction

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A — approval response is not a validation-bearing form; session-expired covered at Step 5c. -->

## Outcome "success"
- Preconditions: "A session has a pending approval prompt raised by the session; the user's decision state is to approve the prompt"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "pending approval prompt, decision = approve"
- Input: "User approves the pending approval prompt"
- Output: "At least one approval interaction completes; the session proceeds with the approved tool execution"
- State: "Approval decision recorded in session history; session continues"
- Side-effect: "none"

## Outcome "approval-rejected-path"
<!-- source: inferred -->
<!-- reasoning: journey expected result says the session proceeds according to the approval decision — the reject branch is the boundary the happy-path wording leaves implicit -->
- Preconditions: "A session has a pending approval prompt raised by the session; the user's decision state is to reject/deny the prompt"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "pending approval prompt, decision = reject"
- Input: "User rejects the approval"
- Output: "The session proceeds according to the rejected decision (tool not executed, session continues or terminates per upstream semantics) — identical to web GUI behavior"
- State: "Rejected decision recorded; no tool side-effect executed for the rejected call"
- Side-effect: "none"

## Journey Invariants

- The entire journey uses zero terminal commands — every interaction happens inside the app UI or the OS installer flow
- The app opens no listening ports at any point; all traffic is carried over the dsh-app:// carrier
- The dsh-forge profile directory remains independent of (and never overwrites) the upstream desktop profile
- Shared $DSH_HOME data (sessions, settings, credentials) is only read/written in the upstream existing format
