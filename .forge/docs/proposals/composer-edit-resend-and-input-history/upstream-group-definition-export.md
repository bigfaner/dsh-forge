# Upstream suggestion draft (deepseek-ai/deepseek-harness Discussions)

> User decision 2026-10-18: settle with a paper trail + submit an upstream suggestion.
> The main session's web channel is read-only, so the user posts this on our behalf;
> backfill the link below once posted.

## Title

Feature request: export `processGroupDefinition` (or add a chat group-definition filtering seam) — client-side products need to hide chat rows by event range

## Body

**Use case.** We are building an "edit & resend" feature in a third-party host on top of the official client machinery: after the user edits their last sent message, the whole trailing turn is voided via `dsh-session`'s `surfaceOp: replace` (model-visible masking is already fully handled by the surface machinery). For the human-readable view, the original **user message** row can be masked by shadowing the `conversation.chat.node` keyed slot (priority shadowing, lowest renders). However, masking the original **assistant reply** rows is not reachable through any client-side registration seam.

**Seams we exhausted** (verified against dsh-client-ui-chat 0.2.0-rc.2 source):

1. Shadowing the `assistant-step` key on `conversation.chat.node`: the official `AssistantNodeView` is not exported from the package, so a replacement would have to re-implement the entire assistant message rendering (markdown / streaming / tool blocks) — unacceptable fidelity-wise.
2. Claiming events via `uiConversation.events.register`: `ConversationNodeAssembler.dispatchInput` visits every definition with no event exclusivity, so the official assistant definition still renders its nodes.
3. The node `visibility` field: each definition decides its own nodes' visibility; third parties cannot influence another definition's output.

**The real seam.** `ConversationGroupDefinition` — `GroupUpdate.entries` is the chat root render sequence (the contract states "only its Node references and referenced group members render"), and `update` receives the full node order / `readNode` / `readTurn` after official nodes are materialized. Semantically it is exactly the gatekeeper position for "filter the root sequence by range" — but the chat target's single seat is already occupied by the official `processGroupDefinition` (one group definition per target), and that definition is **not exported on either the type or the runtime surface** (the `./src/*` export maps to files that are not shipped in the published artifact — a dead path). Third parties can neither delegate to it nor legally replace it.

**Ask** (either one unlocks the scenario):

- **Export `processGroupDefinition`** (and the `ProcessState` type) — third parties can then wrap it: delegate `update` / `buildGroups` to the official implementation and filter out node references inside the voided range from the output `entries`. Roughly 50 lines to achieve "collapse the whole turn" in the human-readable view.
- Or provide an official composition seam: allow registering a group definition that *delegates to the existing target group definition plus an output filter* (similar in spirit to priority shadowing on slots).

**Benefit.** Any third-party product that needs to void/collapse a stretch of an existing transcript (edit-and-resend, branch management, redaction views) could complete the presentation-side projection without touching official renderers, while correctness of the model-visible view remains single-sourced by the official surface machinery.

## Post backfill

- [ ] Link:
