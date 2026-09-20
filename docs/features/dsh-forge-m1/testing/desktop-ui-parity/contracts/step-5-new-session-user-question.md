---
journey: "desktop-ui-parity"
step: "5"
step-action: "Create a new session and answer a user-question"
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
# Contract: desktop-ui-parity / Step 5: Create a new session and answer a user-question

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A — new-session creation in this journey has no validation-bearing form; session-expired covered at Step 4c. -->

## Outcome "success"
- Preconditions: "A workspace is selected and its session UI is ready; the assistant can raise a user-question during a turn"
  fixture_spec:
    entities:
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "session UI ready"
- Input: "User creates a new session in the current workspace, then triggers and answers a user-question raised by the assistant"
- Output: "New-session creation works as in the web GUI; the user-question renders in-app; the submitted answer is accepted and the workflow resumes — identical to web GUI behavior (PRD SC7 smoke list)"
- State: "New session persisted to shared $DSH_HOME in the upstream existing format; workflow resumed after the answer"
- Side-effect: "none"

## Outcome "user-question-dismissed-without-answer"
<!-- source: inferred -->
<!-- reasoning: parity risk framing requires the boundary where the user abandons the question; the web GUI keeps the session usable after dismissal and the desktop carrier must match -->
- Preconditions: "A turn has raised a user-question that is rendered and awaiting an answer"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "user-question pending, unanswered"
- Input: "User dismisses the user-question without answering it"
- Output: "The question closes without an answer; the session remains open and usable (no hang, no forced answer, no lost session) — identical to web GUI behavior"
- State: "Session intact and interactable; unanswered question recorded in session state; workflow paused but resumable"
- Side-effect: "none"

## Outcome "new-session-creation-failure"
<!-- source: inferred -->
<!-- reasoning: new-session creation depends on writes to shared $DSH_HOME; a failed write (e.g., disk/permission fault) is the creation-side boundary of this step -->
- Preconditions: "A workspace is selected; a write to shared $DSH_HOME for the new session fails (e.g., no space or permission denied at the OS level)"
  fixture_spec:
    entities:
      - entity_type: "Workspace"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "session UI ready, storage write failing"
- Input: "User attempts to create a new session"
- Output: "Creation fails with visible in-app error feedback (no silent failure, no hang); existing sessions and shared data are not corrupted"
- State: "No partial new-session entry persisted; pre-existing sessions and settings unchanged"
- Side-effect: "none"

## Journey Invariants

- Every web GUI functional surface exercised in this journey remains 100% usable in the desktop carrier — the user observes identical behavior, rendering, and outcomes on every surface, with no capability loss or carrier-specific failure
- The desktop carrier introduces no UI rewrite artifacts — behavior matches upstream web GUI semantics
- No listening port is opened while using any surface
