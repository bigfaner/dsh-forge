---
journey: "desktop-ui-parity"
step: "2"
step-action: "Exercise the approval surface"
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
# Contract: desktop-ui-parity / Step 2: Exercise the approval surface

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- surface-required note: validation-error N/A — no form submission in this step; session-expired covered at Step 4c. -->

## Outcome "success"
- Preconditions: "An active session is open and a chat turn can trigger an approval prompt"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
- Input: "User triggers an approval prompt during a chat turn and responds to it"
- Output: "The approval prompt appears and resolves exactly as in the web GUI"
- State: "The session proceeds according to the approval decision"
- Side-effect: "none"

## Outcome "rapid-surface-switch-mid-turn"
<!-- source: inferred -->
<!-- reasoning: Journey edge 2b; the carrier renders upstream surfaces over the dsh-app:// carrier (Fact FT-011), so surface switching under an active stream is the highest-risk parity boundary for a shell carrier -->
- Preconditions: "A chat turn is actively streaming a response while the window is open"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "actively streaming a turn"
- Input: "User switches between chat, plan, and settings surfaces mid-turn, then returns to chat"
- Output: "No surface breaks state; the streaming turn continues correctly when returning to chat"
- State: "Session streaming state preserved across surface switches; no turn reset or duplication"
- Side-effect: "none"

## Journey Invariants

- Every web GUI functional surface exercised in this journey remains 100% usable in the desktop carrier — the user observes identical behavior, rendering, and outcomes on every surface, with no capability loss or carrier-specific failure
- The desktop carrier introduces no UI rewrite artifacts — behavior matches upstream web GUI semantics
- No listening port is opened while using any surface
