---
status: "completed"
started: "2026-10-08 11:41"
completed: "2026-10-08 11:47"
time_spent: "~6m"
---

# Task Record: T-review-doc Review Documentation Quality

## Summary
Documentation quality review (breakdown mode) over docs/features/dsh-forge-m3-bootstrap-presets/ and docs/proposals/dsh-forge-m3-bootstrap-presets/ against the pre-extracted AC for 3.2 / 3.6 / 5.4. All 14 AC items verified against deliverables: 3.2 (8 spec skills at packages/plugin-forge-spec/skills/<name>/SKILL.md one level deep, kebab-case names matching dirs; state-layer adaptation via upsertFeatureDoc/addTask/registerFeature/transitionProposal with zero manifest or hand-index residuals; OQ#3 eval survivor list in skill header note; one-sentence descriptions; enumeration matches In Scope ①) — PASS. 3.6 (run-tasks four-exit dispatch protocol + pool three-state verdict + halt handling + contextSlug + non-blocking mismatch guard; submit-task judgment-surface focus with commit two-state conventions; run-tests on-demand loading + no-falsification; quick-tasks blitz semantics explicit; brainstorm tool-carried proposal.md + mode=expedition lineage; git-commit removed with skills/README.md synced, SC2 assertion object in place) — PASS. 5.4 (总纲 M3 row narrowed to 聚焦版九项 + #1–#13 deferral table with 去向/兜底 columns matching the M3 proposal Out of Scope table; four ledger clauses present; roadmap sync with walkthrough evidence citation) — one fix applied: 4 stale '#1–#12' references in the M3 proposal (§⑨ 路书与总纲回写记账, In Scope item 9, 总纲回写记账 clause 1, SC9 criterion) contradicted the proposal's own 13-row table and the executed 总纲 merge; corrected to '#1–#13' after verifying no e2e assertion pins the stale string. Docs-only change; no tasks/ or non-docs paths modified.

## Changes

### Files Created
无

### Files Modified
- docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md

### Key Decisions
无

## Document Metrics
14/14 AC items verified (13 pass unchanged, 1 fixed); 1 doc file corrected (4 line-level reference fixes)

## Referenced Documents
- docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md
- docs/proposals/dsh-forge-redesign/proposal.md
- docs/features/dsh-forge-m3-bootstrap-presets/tasks/review-doc.md

## Review Status
reviewed

## Acceptance Criteria
- [x] 3.2: 8 skills one level deep in packages/plugin-forge-spec/skills/<name>/SKILL.md, frontmatter name kebab-case matching dirs, discovery-convention compatible
- [x] 3.2: state-layer adaptation — all outputs via tools (upsertFeatureDoc / addTask + registerFeature / transitionProposal), zero handwrite-to-docs residual instructions
- [x] 3.2: eval survivors trimmed per M3 form with OQ#3 list in skill header note
- [x] 3.2: one-sentence descriptions; migration source untouched (frozen old line read-only)
- [x] 3.2: directory enumeration matches In Scope ① (write-prd/ui-design/tech-design/gen-journeys/gen-contracts/gen-test-scripts/breakdown-tasks + survivor)
- [x] 3.6: run-tasks single-call-per-round protocol with four exits, pool-snapshot three-state judgment, halt handling, contextSlug, non-blocking mismatch guard
- [x] 3.6: submit-task LLM judgment surface (summary organization / test evidence / commit two states), zero mechanical repetition
- [x] 3.6: run-tests judgment focus + on-demand loading semantics; no-falsification discipline retained
- [x] 3.6: quick-tasks one-pass createProposal mode=blitz + addTask source=proposal with explicit blitz semantics
- [x] 3.6: brainstorm proposal.md via tools + mode=expedition lineage
- [x] 3.6: git-commit deleted + README synced; core skills dir free of git-commit/git-checkout (SC2 object)
- [x] 5.4: 总纲 M3 row narrowed + #1–#13 deferral table merged with 去向/兜底 columns, consistent with M3 proposal
- [x] 5.4: 总纲 four ledger clauses (brainstorm revision / M3.5 timing note / tech-research deviation note / M3 row narrowing)
- [x] 5.4: roadmap sync (M3 closing state + walkthrough evidence citation); SC9 doc assertion baseline consistent

## Notes
Reference Files section absent from task file — fell back to pre-extracted AC summary as review baseline. The write-then-register flow in write-prd matches the upsertFeatureDoc tool contract (registration-only; rel_path may dangle) — not a residual. Stale count fix rationale: the proposal's own Out of Scope table carries 13 rows (#13 追溯矩阵→M3.75 added by the 2026-10-07 弹性裁决 update) and 总纲 版本历史 records the merge as #1–#13; grep confirmed no e2e SC9 assertion pins '#1–#12'.
