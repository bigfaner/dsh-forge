# Eval Report: journey / interrupted-dispatch-recovery — Iteration 1

- **Eval type**: journey
- **Surface type**: web (rule: `skills/gen-journeys/rules/surface-web.md`)
- **Target**: `docs/features/dsh-forge-m2-pipeline/testing/interrupted-dispatch-recovery/journey.md`
- **Cross-referenced**: prd-spec.md, prd-user-stories.md (Story 4), design/tech-design.md (Interface 1, 交互一)
- **Scorer stance**: adversarial, verification mode (every assertion treated as unverified until traced)
- **Date**: 2026-10-07

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Story mapping is faithful.** Happy Path (re-claim → re-synthesized brief → settle) maps one-to-one onto PRD Story 4's AC ("Given 任务 in_progress 但执行记录缺失… Then 无状态转移（仍 in_progress），返回按当前状态重新合成的 dispatchPrompt（digest 新值）") and 业务流程一 step 7 / mermaid branch `F -->|会话中断·record 缺失| K`. Setup bullet 3 ("中断前该任务曾领取过（有历史 claim 审计行）") correctly disambiguates "执行记录缺失" as the missing *submit-side* record while claim rows remain — more precise than the PRD itself. Good.
2. **Outcomes are behavior-level, not implementation-level.** "无状态转移（仍 in_progress）", "人工处置结果不被覆盖" are observable behaviors. No regex/selectors/assert calls found.
3. **Real design constraint dropped on the floor.** tech-design Interface 1: "in_progress 幂等重入仅限显式 taskRef 或 links 已含本会话——无 taskRef 的盲选**不领** in_progress（双 dispatcher 并发不双派发）". The journey's Step 1 outcome ("claimTask 对 in_progress 幂等重入——无状态转移") is only true under this eligibility condition, which the journey never states. A downstream test that re-claims blind (no taskRef) gets a *different* outcome (task not picked up) than the happy path asserts. Likewise the design's explicit `reclaimed=true` return signal — the single most direct observable of the recovery path — appears nowhere.
4. **Declared surface never appears.** `surface_types: ["web"]`, yet not one step observes anything in the browser. The user of Story 4 (单人开发者) never appears in the journey; all actors are dispatcher/executor. The web-observable anchors exist in PRD/design (概览列表单次重取即见新值; TaskDetail records 时间线含 digest) and are unused.
5. **Determinism concern inherited silently.** tech-design: "digest = sha-256(全文,含人格段与标签)前 12 hex" — a pure content hash. If nothing changed in the library between interruption and re-claim, a deterministic synthesis yields an identical digest, and the journey's "digest 新值（与中断前简报相异可判）" would not hold. The journey (like the PRD) asserts the new-digest outcome but names no fixture condition that guarantees the brief content differs.
6. **Edge numbering is loose.** "Step 3b" performs a claimTask (a Step-1 action), not a Step-3 (settlement) action; Step 3 has no anchored edge variant at all.

## Phase 2 — Rubric Scoring

### 1. Completeness — 157/200

| Criterion | Score | Notes |
|---|---|---|
| Metadata complete | 47/50 | kebab-case name ✓, valid risk value ✓, surfaces/sources/generated ✓. Risk "Medium" justification is borderline (see Internal Consistency). |
| Steps complete with required fields | 70/80 | Every step has User Action + Expected Result; sequence coherent. Deduct 10: Step 2's action is passive reception, not an action — "**User Action**: dispatcher 接收 claimTask 的返回" describes the system handing back a value, not anything the actor does. |
| Outcomes cover happy + required derived scenarios | 40/70 | Happy ✓, three edges ✓ (non-interruption guard / repeated interruption / human intervention). But web-mandatory derived outcomes (`validation-error`, `session-expired`) are neither present nor explicitly considered/mapped (see Surface Fitness); no outcome for the settlement step's failure modes (late/zombie executor submit, dirty workspace from dead executor). |

### 2. Semantic Purity — 185/200

| Criterion | Score | Notes |
|---|---|---|
| Natural language outcomes | 75/80 | No regex, CSS/XPath, or `expect(...)`-style assertions anywhere. `claimTask`/`submitTask`/`digest` are the PRD's own domain vocabulary (PRD Story 2/4 AC use them verbatim), not framework coupling. Minor: "digest 新值" leans on a technical artifact, though it is the PRD's own acceptance anchor. |
| Preconditions declarative | 58/60 | Setup bullets and all edge Preconditions are states, not procedures ("任务 in_progress 且执行记录在场"). ✓ |
| No implementation coupling in steps | 52/60 | Steps stay at domain-verb level. Mild coupling: Step 2's Expected Result reaches into prompt internals — "（动态信息块按当前库状态实时取数）" describes the synthesis mechanism's internals rather than what the dispatcher observes. |

### 3. Precondition Exclusivity — 121/150

| Criterion | Score | Notes |
|---|---|---|
| Preconditions distinct across outcomes | 50/60 | Single outcome per step → no intra-step collisions. Across variants: 1b (record 在场) vs happy (record 缺失) vs 3b (人工转移) are mutually exclusive. Deduct 10: Step 2b's precondition "同一任务连续多次中断（执行记录持续缺失）" is indistinguishable from the happy-path state at any single claim instant — the differentiator is history ("多次"), and its Expected Result restates the happy outcome plus one addition. |
| Preconditions sufficient to uniquely select outcome | 38/50 | The unstated eligibility precondition is load-bearing: per tech-design, "无 taskRef 的盲选不领 in_progress". Step 1's action "对执行记录缺失的 in_progress 任务再次调 claimTask" implies targeted re-claim and Setup implies same-session links, but neither is explicit — the outcome selection is ambiguous for the blind-claim case. |
| No missing preconditions for error/boundary outcomes | 33/40 | 1b/2b/3b all state triggers ✓ (3b uses illustrative "如人工置 blocked 或 skipped" — loose but adequate). Missing: no precondition/outcome pair at all for a still-alive-but-slow executor submitting after re-dispatch, the most dangerous boundary of this exact scenario. |

### 4. Fact Alignment — 109/150

| Criterion | Score | Notes |
|---|---|---|
| Factual claims traceable or marked UNKNOWN | 48/60 | Substantively traceable via `sources` + Overview citations: idempotent re-entry and "digest 新值" = PRD Story 4 AC verbatim; "completed + 审计 + git 提交" = Story 2 AC; append-only = SC7 ("append-only 触发器 ABORT"); from-mismatch rejection = PRD Goals "动词 API 单测全路径（from 匹配…）". Deduct: no per-claim marking convention exists in the document, and 1b's behavioral claim "按 record 在场判定非中断态，不触发重派路径" is an inverse inference from prd-spec ② ("恢复出口 = dispatcher 外环（record 缺失 → 按当前状态重派）") presented as fact about the run-tasks skill's logic without marker. |
| Inferred claims have required_outcomes support + `source: inferred` | 25/50 | Zero `source: inferred` annotations and zero citations of the web surface's `required_outcomes` rules anywhere in the document. Step 2b ("连续多次中断反复幂等重入") is a pure inferred boundary with no rule citation. The two web-mandatory derivations were not generated and their absence is not justified. |
| No hallucinated unclassified claims | 36/40 | No claim contradicts PRD/design; 3b's rejection semantics and 1b's record-presence detection are consistent with tech-design. Small reserve for the unannotated gloss "（与中断前简报相异可判）", which adds a distinguishability assertion beyond the PRD's "digest 新值" without basis or marker. |

### 5. Surface Fitness — 75/150  (below min threshold 90)

| Criterion | Score | Notes |
|---|---|---|
| Mandatory derived Outcomes present | 15/60 | Web rule: "validation-error" and "session-expired" "must be considered for every Web Journey". Neither is present, mapped, or justified-N/A. The only partial credit: Step 3b is an unlabeled domain analog of validation-error (invalid transition request rejected, state preserved: "状态机转移校验拒绝非法领取（from 不匹配）"), and the journey's whole theme (session dies mid-workflow, no data loss, recovery without manual cleanup) is an unlabeled analog of session-expired. A strict reading of the rubric ("Score 0 if mandatory Outcomes are completely absent") yields 0; 15 credits the implicit analogs. |
| Test strategy proportions (Web 50/50 Contract/Journey) | 30/50 | All six scenarios are Contract-shaped (tool-call input → return-value assertion). No Journey-smoke/browser flow exists to balance: nothing like the sibling task-dispatch-pipeline Step 6 (developer confirms state in the overview list). One-sided depth. |
| Realistic web environment/execution assumptions | 30/40 | surface declared `["web"]` but zero browser interaction, page state, or async-UI handling appears. The web-observable anchors exist and are unused: overview list "写入返回后单次重取即见新值" (SC2) and TaskDetail records timeline containing digest (tech-design TaskDetail: "records 时间线(verb/from→to/…/digest)") — the latter is the natural web assertion for "digest 新值" (two claim rows, different digests, visible in timeline). The agent-pipeline assumptions themselves are realistic for this domain; the web adaptation is absent. |

### 6. Internal Consistency — 119/150

| Criterion | Score | Notes |
|---|---|---|
| Invariants hold in every step | 55/60 | No step violates the four invariants: re-entry steps keep in_progress; Step 3's settlement is the single final settlement (not a duplicate); append-only is compatible with Setup *if* the simulation means "executor died before submit" — but Setup never says how "执行记录缺失" is established, leaving an ambiguous reading (deleting an audit row to simulate would contradict "审计链 append-only"). |
| Cross-step references consistent | 38/50 | Step 2/3 correctly consume Step 1's re-claim. Deduct: edge anchor numbering is wrong — "Step 3b: 中断期间任务已被人工处置" performs "**User Action**: dispatcher 外环 claimTask 同一任务", a Step-1 variant mislabeled 3b; consequently Step 3 (settlement) has no edge variant while three edges all crowd the claim step. |
| Risk level consistent with content | 26/40 | Medium = "multi-step interaction without irreversible side effects" per the document's own criteria comment, but the happy path ends in "任务正常落账（completed + 审计 + git 提交）" — state mutation plus a git commit, i.e., the stated High trigger ("state mutation"), and both sibling pipeline journeys (task-dispatch-pipeline, fix-chain-auto-recovery) are High. Medium also implies "edge cases for each step with branching preconditions"; Step 3 has none. |

### 7. Workflow Coverage — 108/150

| Criterion | Score | Notes |
|---|---|---|
| Golden Path existence (veto item) | 48/60 | No veto: the 3 contiguous happy steps (re-claim → receive re-synthesized brief → re-dispatch and settle) semantically cover PRD Story 4's core workflow with domain-level step titles; `golden_path: false` correctly delegates feature-level Golden Path to task-dispatch-pipeline. Deduct 12: Step 2 ("dispatcher 接收 claimTask 的返回") is a passive system-response checkpoint rather than a distinct user action, weakening the 3-step span's action quality (2 genuine operations + 1 receive). |
| Multi-step coverage depth | 32/50 | Recovery path with guard variants (1b/3b) and a repetition boundary (2b) — decent for the scoped story. Thin beyond it: no cross-entity verification (links row, audit rows, records timeline), no observation of the recovered state anywhere. |
| Workflow completeness against PRD/Design scope | 28/40 | Story 4's single AC fully covered ✓. Gaps against design for this same workflow: `reclaimed=true` signal unmentioned (tech-design's explicit recovery observable), re-entry eligibility (taskRef / links 已含本会话) unmentioned, web-observable digest timeline unmentioned, late-submit race unmentioned. |

## Cross-dimension coherence check

- Steps ↔ outcomes ↔ invariants are mutually aligned; no invariant is violated by any step.
- The single largest coherence gap radiates from the surface declaration: `surface_types: ["web"]` is inconsistent with the document's total absence of web interaction. It manifests most clearly in Surface Fitness (75) and echoes in Completeness (missing derived scenarios) and Workflow Coverage (no user-visible verification step). These are distinct facets (presence / adaptation / coverage) scored separately per rubric.
- Risk level Medium vs. mutation+git-commit content is inconsistent with the document's own classification criteria and with sibling journeys — scored in Internal Consistency.

## Phase 3 — Blindspot Hunt

1. **[blindspot] digest 新值 may be non-deterministic — no fixture condition guarantees the brief differs.** Quote: "digest 新值（与中断前简报相异可判）". Per tech-design, digest = sha-256 of the full prompt text (前 12 hex); if library state is unchanged between interruption and re-claim, deterministic synthesis yields an identical digest and the assertion fails. The journey must state what input differs at re-claim time (e.g., changed BLOCKERS/PHASE_SUMMARY, elapsed-state deltas) or the derived test is flaky by construction.
2. **[blindspot] Zombie-executor late submit untested — the most dangerous error path of this exact scenario.** Quote: Step 1b "不产生重复派发或重复执行" guards only the record-present case. Nothing covers an interrupted-but-alive executor submitting *after* the re-dispatched executor already settled (double quality-gate runs, duplicate git commits, second submitTask hitting from-mismatch). Design guards double-*dispatch*, not double-*settlement*; the journey as the test narrative should carry this negative test.
3. **[blindspot] Dead executor's workspace residue ignored.** Quote: invariant "中断恢复零人工清理：全程无人工介入即可续链". "状态" covers the task layer only; the interrupted executor may leave uncommitted edits/locks that the re-dispatched executor inherits before "executor 完成执行后 submitTask … git 提交". If out of scope by design, say so explicitly; currently silent.
4. **[blindspot] Setup simulation mechanism is unspecified and potentially contradicts append-only.** Quote: "任务处于 in_progress 但其执行记录缺失（模拟 executor 子会话中断）". A downstream agent cannot establish this state from the document: the only mechanical reading (delete an audit row) violates "审计链 append-only"; the intended reading (kill executor between claim and submit) is never stated. Needs an explicit fixture recipe.
5. **[blindspot] Recovery observability is asserted but never located.** Quote: Step 2 "返回按当前状态重新合成的 dispatchPrompt…digest 新值". All verification lives in tool return values; the design's web-visible anchors (records timeline digest rows, overview single-refetch freshness) would make this journey actually testable on its declared web surface. Missed both as coverage and as surface fitness.

## Score Summary

| Dimension | Score | Min | Status |
|---|---|---|---|
| Completeness | 157/200 | 120 | PASS |
| Semantic Purity | 185/200 | 120 | PASS |
| Precondition Exclusivity | 121/150 | 90 | PASS |
| Fact Alignment | 109/150 | 90 | PASS |
| Surface Fitness | 75/150 | 90 | **FAIL** |
| Internal Consistency | 119/150 | 90 | PASS |
| Workflow Coverage | 108/150 | 90 | PASS |
| **Total** | **874/1150** | 975 | **FAIL** |

**Verdict**: below target (874 < 975); Surface Fitness below its min threshold (75 < 90). Priority fixes for revision: (1) add web-mandatory derived outcomes (validation-error / session-expired) or explicit domain mappings with `source: inferred` + rule citation; (2) add at least one web-observable verification step (overview single-refetch, records-timeline digest rows); (3) state the re-entry eligibility precondition (explicit taskRef / links 已含本会话) and the `reclaimed` signal; (4) fix edge anchor numbering (3b is a Step-1 variant; give Step 3 its own edge, e.g., zombie late-submit); (5) specify the interruption-simulation fixture and the digest-difference condition; (6) revisit risk level (High per stated criteria) or justify Medium.
