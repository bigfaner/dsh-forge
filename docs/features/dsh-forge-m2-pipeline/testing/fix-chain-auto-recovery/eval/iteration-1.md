# Eval Report: journey / fix-chain-auto-recovery — Iteration 1

- **Eval type**: journey (rubric scale 1150, target 975)
- **Surface**: web (rules: `gen-journeys/rules/surface-web.md`)
- **Scorer stance**: adversarial, verification-first (every claim treated unverified until traced)
- **Date**: 2026-10-07
- **Document**: `docs/features/dsh-forge-m2-pipeline/testing/fix-chain-auto-recovery/journey.md`

## Phase 1 — Reasoning Audit (pre-score anchors)

Grounding check against PRD Story 3 (`prd-user-stories.md`), `prd-spec.md` (In Scope ① fix 链语义; 流程一步骤 5–6; SC-M2 gate), and `design/tech-design.md` (交互一 mermaid H→I→J; error table):

| Journey claim | Source verification | Verdict |
|---|---|---|
| 单事务三件套 + `verb='auto-block'` | PRD Story 3 AC1 verbatim | Traceable |
| blocked→pending + `verb='auto-restore'`, 边保留, 恢复行 e2e 断言 | PRD Story 3 AC2 / SC-M2 gate verbatim | Traceable |
| 成环拒绝 + 完整环路径 | PRD Story 3 AC3 / `ERR_CYCLE_DETECTED` (data 带完整环路径) | Traceable |
| 链深 ≤6, 超限拒绝提示人工介入 | PRD Story 3 AC3 / `ERR_CHAIN_DEPTH_EXCEEDED` (fix 链 >6) | Traceable |
| 满足集 = {completed, skipped}, 恢复/领取同源 | prd-spec In Scope ① / invariant in design | Traceable |
| blocked 缺 reason 拒绝 | PRD Story 2 AC3 / `ERR_REASON_REQUIRED` | Traceable |
| 单次重取即见 / DAG 呈现依赖边 | PRD 流程一.8 / SC7; design DAG 贝塞尔边 | Traceable |
| Step 4c (前置未全满足不恢复) | Logical complement of AC2, not verbatim | Inference, unannotated |

Anchors recorded before rubric scoring:

- **A1 (ambiguity)**: Step 1 already transitions X to blocked ("任务 X in_progress→blocked"); Step 2's transaction then includes "源任务置 blocked（审计 verb='auto-block'）" — the state of X at Step 2 entry and the semantics of re-blocking an already-blocked task are unstated. The PRD has the same structure, but the journey propagates the ambiguity instead of resolving it for downstream contract generation.
- **A2 (surface gap)**: Web-mandatory derived outcome `session-expired` is entirely absent; `validation-error` exists only as a tool-level rejection (Step 1b), not a web interaction boundary.
- **A3 (boundary gaps)**: No duplicate/retry boundary for `addTask --block-source` (design's 两级去重 / `reused: boolean` return is a named e2e anchor in tech-design B.5); chain-depth boundary tested only above the limit (`>6`), never at the limit (`==6` accepted).
- **A4 (actorless step)**: Step 4's "User Action" is a system event ("恢复钩子触发（无需人工介入）"), not an action any actor performs.

## Phase 2 — Rubric Scoring

### 1. Completeness — 158/200

| Criterion | Score | Justification |
|---|---|---|
| Metadata complete | 48/50 | Name kebab-case, `risk_level: High` valid and justified by content (state mutation via auto transitions). `sources` lists three real files. No defect found beyond minor: proposal.md listed as source but contributes nothing cited in the body. |
| Steps complete with required fields | 68/80 | All 5 happy steps and 5 edge cases carry User Action + Expected Result (edges also Precondition), sequence is coherent. Deductions: Step 4's action is actorless — "恢复钩子触发（无需人工介入）" describes a system trigger, giving a downstream agent no executable action (-8); Step 3 merges two actors and defers to another document — "派发链领取 fix 任务并执行（同派发链旅程）" (-4). |
| Happy path + required derived scenarios | 42/70 | Happy path complete; edge count (5) ≥ happy count (5) satisfies High-risk density. Deductions: `session-expired` mandatory web outcome absent with no inapplicability note (-20); missing duplicate/retry boundary for fix-task creation and the `==6` depth acceptance boundary (-8). |

### 2. Semantic Purity — 177/200

| Criterion | Score | Justification |
|---|---|---|
| Outcomes natural language | 72/80 | No regex, selectors, or assertion calls. Minor couplings: "fix 任务行"（DB-row phrasing in Step 2 expected result）, "恢复行在场（e2e 断言）"（test-strategy meta-language inside an expected result, inherited from PRD AC2 verbatim）. |
| Preconditions declarative | 55/60 | All edge preconditions are states, not setup procedures. "试图构造会成环的依赖（addTask 双 flag 组合）" describes an intent and uses unexplained jargon ("双 flag") that a downstream agent cannot operationalize. |
| No implementation coupling in steps | 50/60 | `submitTask` / `addTask --block-source` are the PRD's own domain verbs (acceptable), but the invariant block references the storage table by name — "task_edges 恒无环" — and Setup references "审计记录链在场"; both leak schema-level detail into narrative. |

### 3. Precondition Exclusivity — 135/150

| Criterion | Score | Justification |
|---|---|---|
| Preconditions distinct across outcomes | 52/60 | Families 1/1b, 2/2b/2c, 4/4b/4c are pairwise distinguishable. Happy steps carry no explicit Precondition field; Step 4's selecting condition ("前置全满足") lives only inside the Expected Result, so the 4-vs-4c distinction is recovered from outcome text rather than declared preconditions. |
| Sufficient to uniquely select an outcome | 45/50 | Within each family exactly one outcome applies given the state. Step 4 vs 4b differ on completed-vs-skipped of the fix task — distinct dimensions. Residual ambiguity from A1: Step 2's implicit precondition on X's status is unstated. |
| Error/boundary outcomes state triggers | 38/40 | 1b (reason absent), 2b (cycle), 2c (depth >6), 4b (skipped), 4c (unmet co-dependency) all state their trigger. No missing-trigger outcome found. |

### 4. Fact Alignment — 122/150

| Criterion | Score | Justification |
|---|---|---|
| Factual claims traceable | 50/60 | Every specific assertion traced and verified true against the declared `sources` (audit verbs, ≤6, satisfaction set, cycle-path return, single-refetch). No per-claim fact_id mechanism exists in the journey format; traceability is document-level only — claims like "审计 verb='auto-block'" carry no anchor to the specific PRD AC that grounds them. |
| Inferred claims have rule support + `source: inferred` | 32/50 | Zero `source: inferred` annotations in the document. Step 4c ("源任务不恢复（保持 blocked）；待全部前置终态后再恢复") is a logical-complement inference not present verbatim in any source and is unclassified. The web `required_outcomes` rules (validation-error / session-expired) that should have driven derivations were not applied — the one validation-shaped outcome (Step 1b) is PRD-grounded, not rule-derived, and session-expired was never considered. |
| No hallucinated unclassified claims | 40/40 | All checked claims exist in PRD/design (see Phase 1 table). No hallucination found. |

### 5. Surface Fitness — 102/150

| Criterion | Score | Justification |
|---|---|---|
| Mandatory derived outcomes present | 30/60 | `validation-error`: present only as tool-level rejection — "拒绝提交；任务状态不变更，不进入 fix 链" — with no web-form interaction, no error-displayed-near-field, no explicit correct-and-retry assertion. `session-expired`: completely absent, with no annotation of inapplicability (the surface rule says both "must be considered for every Web Journey"). Not "completely absent" (one boundary exists), so partial credit only. |
| Test strategy proportions (web 50/50) | 42/50 | Contract-granular outcomes (per-step edge cases with preconditions) and a journey-level happy sequence are both present in reasonable balance; depth on the contract side (state machine, atomicity, guard rejections) is good. |
| Surface environment/execution assumptions realistic | 30/40 | The single UI step is realistic and anchored ("写入返回后单次重取即见" matches SC7/replay-e2e design). But a web-surface journey with 5 of 6 steps containing no browser interaction is thin: no loading state, no UI error surface, no drawer-level blocked-state assertion in the only UI step. |

### 6. Internal Consistency — 131/150

| Criterion | Score | Justification |
|---|---|---|
| Invariants hold in every step | 55/60 | All five invariants checked against every step and edge case; no violation found (2b/2c uphold 无环 and 链深; Step 4 upholds 只改状态不删边). Residual: invariant 1's "三件套原子性" coexists with Step 1's separate blocked transition without stating their relationship. |
| Cross-step references consistent | 38/50 | Step 4 correctly consumes Step 3's hook trigger; Step 5 consumes Steps 2–4 artifacts. Deductions: A1 double-block ambiguity — Step 1 "任务 X in_progress→blocked" then Step 2 "源任务置 blocked（审计 verb='auto-block'）" leaves X's entry state at Step 2 undefined for downstream contract generation (-8); "（同派发链旅程）" is an unnamed cross-document reference the reader must guess (-4). |
| Risk level consistent | 38/40 | High matches "state mutation" (auto transitions, task creation, append-only audit). Content supports it. |

### 7. Workflow Coverage — 126/150

**Golden Path veto: NOT triggered.** The Happy Path is a contiguous 5-step sequence mapping step-for-step to PRD Story 3 (受阻提交 → fix 创建 → fix 执行 → 自动恢复 → 概览反映), i.e., semantically tied to a specific PRD user story and core workflow (流程一受阻分支 5–6, SC-M2 gate component). The frontmatter `golden_path: false` reflects the feature-level designation convention (exactly one journey per feature carries `true`; here `task-dispatch-pipeline`), consistent with the template default — it does not negate the content-level golden-path sequence.

| Criterion | Score | Justification |
|---|---|---|
| Golden Path existence | 50/60 | Present in content, domain-terminology compliant (`addTask`/`submitTask` are the PRD's own story vocabulary). Deduction: Steps 1–2 user actions are bare tool invocations ("executor 调 submitTask result=blocked") with executor as actor rather than the story's human beneficiary, and Step 4 has no actor at all. |
| Multi-step coverage depth | 42/50 | Strong: three-state arc (in_progress→blocked→pending), entity creation, cross-entity edge (源→fix), rejection and recovery variants. Gaps: restore loop not closed (design mermaid J→B — restored source re-claimed by dispatcher — absent); duplicate fix-task creation (两级去重 / `reused`) uncovered; restore triggered by human transition of fix to `completed` (design: "→completed/skipped 同挂恢复钩子") not covered — only `skipped` (4b). |
| Workflow completeness vs PRD/design scope | 34/40 | All three Story 3 ACs covered plus Story 2's blocked ACs; SC-M2 fix-chain assertions (block 边写入 + auto-restore 恢复行) present. Missing: developer-visible blocked reason in UI (PRD 流程二.5 drawer "状态条件区（blocked → 阻塞原因 ⚠）") never asserted; post-restore re-dispatch delegated implicitly. |

### Cross-dimension coherence check

- Risk `High` consistent across Completeness/Internal Consistency scoring. ✓
- Edge density (5 ≥ 5) consistent with High-risk rule. ✓
- The A1 ambiguity manifests most concretely in Internal Consistency (cross-step) and Precondition Exclusivity (Step 2 entry state) — deducted once in each where it does distinct damage, not double-counted elsewhere.
- The surface gap (A2) manifests in Surface Fitness (mandatory outcomes) and, as missing scenarios, in Completeness criterion 3 — scored as absence-of-coverage and absence-of-mandate respectively.

## Phase 3 — Blindspot Hunt

1. **[blindspot] Duplicate/retried fix-task creation untested** — quote: "executor 调 addTask --block-source 创建修复任务 … 单事务原子完成三件事" — no edge case covers a retry after partial/ambiguous failure or duplicate submission; the design's addTask returns `reused: boolean` and names 两级去重 as a B.5 e2e anchor. A downstream suite built from this journey will not test fix-chain idempotency — exactly the class of production bug (double fix chains on retry) this rubric misses.
2. **[blindspot] Chain-depth boundary value at the limit untested** — quote: "fix 链深度将超过上限（>6）" — only the above-limit rejection is specified; acceptance at exactly depth 6 is never asserted. Edge-values-at-limits gap; off-by-one regressions in the depth counter would pass.
3. **[blindspot] Blocked reason never surfaced to the user** — quote: "fix 链关系（fix 任务、依赖边、源任务恢复后状态）在写入返回后单次重取即见" — the only UI step asserts edges/status visibility but not the blocked reason display, which is the developer-facing essence of a block (PRD drawer: 状态条件区 blocked → 阻塞原因 ⚠). The web surface's reason-to-exist in this journey is under-exercised.
4. **[blindspot] Step 2 entry state of the source task undefined** — quote: Step 1 "任务 X in_progress→blocked" vs Step 2 "源任务置 blocked（审计 verb='auto-block'）" — a contract generator cannot decide whether Step 2's precondition is `X in_progress` or `X blocked`, nor whether auto-block on an already-blocked task writes a second audit row or no-ops.
5. **[blindspot] Unexplained inherited jargon** — quote: "试图构造会成环的依赖（addTask 双 flag 组合）" — "双 flag" is never defined (design: `dependsOn` + `sourceTask/blockSource`); the journey copies the PRD phrase without operationalizing it, pushing interpretation burden onto every downstream agent.

## Score Summary

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| Completeness | 158/200 | 120 | ✓ |
| Semantic Purity | 177/200 | 120 | ✓ |
| Precondition Exclusivity | 135/150 | 90 | ✓ |
| Fact Alignment | 122/150 | 90 | ✓ |
| Surface Fitness | 102/150 | 90 | ✓ |
| Internal Consistency | 131/150 | 90 | ✓ |
| Workflow Coverage | 126/150 | 90 | ✓ |
| **Total** | **951/1150** | **975** | **✗ (below target)** |

**Result: FAIL** (total 951 < 975; all dimensions above min thresholds).

**Top revision priorities**:
1. Address web-mandatory outcomes: either derive a session-expired/validation boundary appropriate to this surface or explicitly annotate inapplicability with reasoning (Surface Fitness +30 potential).
2. Add duplicate/retry edge for `addTask --block-source` and the depth==6 acceptance boundary (Completeness + Workflow depth).
3. Define Step 2's precondition on the source task's state and the auto-block semantics when already blocked (Internal Consistency + Precondition Exclusivity).
4. Give Step 4 an executable action framing (e.g., the fix task's completion event as the trigger with the system actor named) and name the referenced sibling journey.
5. Assert blocked-reason visibility in the UI step; annotate Step 4c with `source: inferred` reasoning.
