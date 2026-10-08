# Eval Report: bootstrap-walkthrough — Iteration 1

- Scorer: adversarial QA (Senior QA Engineer persona)
- Date: 2026-10-08
- Rubric: journey.md (1150 pts, target 975, all dimensions ≥ min threshold)
- Surface: web (rules/surface-web.md)
- Sources reality-checked: prd-user-stories.md (Story 8), prd-spec.md (SC8/SC9/流程三/InScope ④/Security), docs/proposals/dsh-forge-m3-bootstrap-presets/proposal.md (Key Scenario 6, §⑧, Constraints "M3.5 提案须处于可评审状态"), docs/proposals/dsh-forge-m3.5-knowledge-consolidation/proposal.md (`status: Draft`), prd-ui-functions.md (UF-1 裁决对话框), business-rules (task-pipeline / product-discipline)

## Verdict

**FAIL — 860/1150** (target 975). One dimension below min threshold: **Surface Fitness 52/150 (min 90)**. All other dimensions above threshold.

| Dimension | Score | Min | Status |
|---|---|---|---|
| Completeness | 144/200 | 120 | PASS |
| Semantic Purity | 170/200 | 120 | PASS |
| Precondition Exclusivity | 126/150 | 90 | PASS |
| Fact Alignment | 114/150 | 90 | PASS |
| Surface Fitness | 52/150 | 90 | **FAIL** |
| Internal Consistency | 134/150 | 90 | PASS |
| Workflow Coverage | 120/150 | 90 | PASS |
| **Total** | **860/1150** | 975 | **FAIL** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Problem→solution fit**: good. The 5-step happy path is a faithful 1:1 extraction of PRD Story 8 (AC1→Steps 1–3, AC2→Step 4, AC3→Step 5), which is itself the feature's acceptance main-axis (proposal §⑧ 自举达成与走查， SC-M3 门). Every Step 5b/5c clause traces to SC9 verbatim.
2. **Evidence→solution support**: strong on facts. I verified each specific claim against sources — 关键场景 6 exists (proposal Key Scenarios item 6), 业务流程三作用于 M3.5 (prd-spec 流程三 title "自举走查即此流程作用于 M3.5"), SC2/SC3/SC7 constitution regression (proposal L183/L191), 顺延表 #1–#13 四条款 (SC9), M3.5 status Draft (frontmatter). No fabrication found.
3. **Self-contradiction found**: Step 3 audits "M3.5 全部任务与执行记录" but no step or Setup item ever establishes that M3.5 has a task pool — the Overview claims the walkthrough applies 业务流程三 (which includes write-prd/design/breakdown-tasks before run-tasks), yet Step 2 jumps straight from 成链 to dispatch. The chain's middle is invisible.
4. **Critical gap**: `surface_types: ["web"]` declared, yet both mandatory Web derived Outcomes (`validation-error`, `session-expired`) are completely absent — and `validation-error` has a ready-made, grounded host in this journey's own Step 1 (UF-1 裁决对话框 "reason 必填——空因拒绝留场").
5. **Precondition overlap**: Edge 1b's "仍为 draft" names the same state as the Setup's happy precondition "已 Draft 在库".
6. **Executability**: Step 2 is an umbrella macro-action folding weeks of development into one step; Steps 3/5 state no verification channel (UI? DB? out-of-band suite?).

---

## Phase 2 — Dimension Scores

### 1. Completeness — 144/200

| Criterion | Score | Justification |
|---|---|---|
| Metadata complete | 50/50 | `journey: "bootstrap-walkthrough"` kebab-case ✓; `risk_level: "High"` valid and justified (proposal acceptance → feature chaining, task/git execution, constitution merge — state mutation and irreversible accounting throughout) ✓; `surface_types`/`surface_keys`/`sources`/`generated` present ✓. |
| Steps complete with required fields | 66/80 | Every step has User Action + Expected Result; edge density healthy (7 edge ≥ 5 happy) ✓. Deductions: **Step 2 is an umbrella macro-action** — "**User Action**: 在 dsh-forge 自身里用远征会话开发 dsh-forge（M3.5 任务经 run-tasks 派发执行）" folds an entire multi-session development phase into one step; a downstream agent cannot execute "develop dsh-forge" as a discrete action (it must infer: initiate dispatch → wait for chain → confirm terminal states). **Step 3 states no channel** — "核查 M3.5 全部任务与执行记录的落库位置" (via UI task/record views? direct DB read? tool?). Step 5's "执行总纲回归与记账合入" is similarly coarse (run which suite? edit which documents?). |
| Outcomes cover happy path + required derived scenarios | 28/70 | Happy path rich ✓; 7 domain guard edges substantial ✓. But the Web surface's mandatory derived Outcomes are **completely absent**: no `validation-error` (despite Step 1's own action — 提案评审流转 — being governed by UF-1's "reason 必填——空因拒绝留场" dialog, a ready-made invalid-input scenario) and no `session-expired` (despite a multi-session, milestone-scale walkthrough being the canonical expiry host). Per surface-web.md these "must be considered for every Web Journey"; neither appears, nor is any non-applicability justification given. |

### 2. Semantic Purity — 170/200

| Criterion | Score | Justification |
|---|---|---|
| Natural language, not code/regex | 70/80 | No regex/selectors/assertion calls ✓. Deduction: test-machinery vocabulary is pervasive in Expected Results — "任务/执行记录 100% 入自身 forge.db**（断言）**" (Step 3), "**（文件系统断言）**" (Step 4), "**（文档断言，SC9）**" (Step 5), "e2e 一条链断言核查" (4b), and "**断言红**" as the leading expected-result word in four edge cases (2b/3b/4b/5c). These describe test outcomes, not what the user/system observes. |
| Preconditions declarative | 52/60 | All seven edge Preconditions are state declarations ✓. Deductions: 1b's "内容未就绪" is unmeasurable (no mechanical criterion distinguishes 就绪/未就绪); 5c's "缺席" states the violation but not the state that produces it (收尾动作已执行、产物缺失). |
| No implementation coupling in Steps | 48/60 | registerFeature / run-tasks / submitTask are the PRD's own domain vocabulary — acceptable. Deduction: Steps 3/5 verify at DB/regression-suite altitude with no user-observable counterpart stated anywhere — "核查 M3.5 全部任务与执行记录的落库位置", "执行总纲回归断言" — coupling the journey to out-of-band internals (the PRD provides UI carriers — 任务详情执行记录时间线 — that are never named). |

### 3. Precondition Exclusivity — 126/150

| Criterion | Score | Justification |
|---|---|---|
| Preconditions distinct across Outcomes | 46/60 | **Overlapping pair (half charge, -10 equivalent)**: Edge 1b's "**Precondition**: M3.5 提案仍为 draft 或内容未就绪" vs Setup's happy precondition "M3.5（知识沉淀）提案已 Draft 在库**且处于可评审状态**". "仍为 draft" literally names the happy-path state (the M3 proposal's own constraint is "**M3.5 提案须处于可评审状态**（已 Draft 在库）"); the only differentiator — 可评审 vs 内容未就绪 — has no mechanical boundary, so for a Draft proposal both the happy precondition and the edge precondition hold. |
| Preconditions sufficient to uniquely select an Outcome | 44/50 | Consequence of the above: given a Draft-and-ready proposal, whether 1b's outcome ("走查不启动") applies depends on the action taken (start-review vs attempt-start), not on distinguishable states — selection is only possible from the edge's side. The intended divergent state (评审尚未接受 / 提案未过 under-review) is only implied inside the Expected Result ("时序耦合记账：走查时点 = 评审接受之时"). Other six edges select cleanly (2b manifest 出现 / 2c 受阻 / 3b 漂移 / 4b 矛盾 / 5b 回归失败 / 5c 记账缺席 are genuine divergent states). |
| No missing Preconditions for error/boundary Outcomes | 36/40 | All seven edge cases carry explicit triggers ✓. Minor: 2b's precondition ("走查运行期间文件系统出现 manifest.md") states the violation fact rather than the system state that admits checking it; 1b's "内容未就绪" lacks a verifiable criterion. |

### 4. Fact Alignment — 114/150

| Criterion | Score | Justification |
|---|---|---|
| Factual claims traceable | 54/60 | Verified against sources — all substantive claims hold: 走查即立项启动 + 飞轮第一批真实数据 + 时序耦合（proposal §⑧, Constraints "走查时点 = 其评审接受之时"）；registerFeature 成链三件套（SC8/SC6）；DAG→AC gate→commit→submitTask 链（流程四）；SC2（无投影）/SC3（只读边界）/SC7（tool 读写延伸）宪法回归（proposal L191 verbatim）；顺延表 #1–#13 + 四条款（SC9, Out of Scope 节）；M3.5 提案 Draft 在库（frontmatter `status: Draft` + proposal L202）；"失败走 fix 链自动恢复（M2 机制回归）"（SC7 verbatim）；全景一致为放行条件（InScope ④ "SC-M3 门（SC8 全断言）"）✓. Deductions: Step 5's "顺延表 #1–#13 与总纲回写四条款" double-mentions the 顺延表 (SC9's 四条款 already contains 全量顺延表 — Step 5c disambiguates but Step 5's phrasing is redundant/overlapping); Step 5c regroups the four clauses ("M3.5 时序注记 + tech-research 偏离注记" joined) vs SC9's slash-separated original — same content, loose citation form; 2b's "即时发现并修正" asserts undefined "即时" precision no source supports. |
| Inferred claims have required_outcomes rule support + `source: inferred` | 20/50 | No edge case carries any inference annotation. Edges 1b/3b/4b are LLM-derived boundary outcomes (the drift scenario "落到了旧线或外部库", the timing guard, the 全景矛盾 example "如任务终态但记录缺席" appear in no source AC as stated) with no derivation basis cited — only 2c/5b gesture at sources via "（M2 机制回归）"/"（SC-M3 门条件）". Worse, the surface-mandated derivations that *should* exist (validation-error from UF-1's 空因拒绝； session-expired) are absent entirely, so no rule-triggered inference is present at all. |
| No hallucinated claims without classification | 40/40 | Every specific assertion I checked resolved to a PRD/proposal fact (see above). No fabricated behavior found. |

### 5. Surface Fitness — 52/150 (**below threshold**)

| Criterion | Score | Justification |
|---|---|---|
| Mandatory derived Outcomes present | **0/60** | surface-web.md: `validation-error` and `session-expired` "must be considered for every Web Journey". Both are **completely absent** from all 5 happy steps and 7 edge cases, with no justified non-applicability note. Rubric: "Score 0 if mandatory Outcomes are completely absent." The omission is consequential and grounded-missed: Step 1's own action (评审流转至 accepted) is exactly the UF-1 裁决 dialog flow whose "reason 必填——空因拒绝留场" behavior is a specified validation-error contract; and a milestone-scale multi-session walkthrough is the natural session-expiry host. |
| Test strategy proportions (Web = balanced 50/50) | 30/50 | Journey-smoke side is adequate (5-step contiguous walkthrough chain). Contract-side density exists (7 edges) but is entirely domain/data/regression-flavored (drift, consistency, gate regression, accounting) — zero web-interaction Contract material (form validation states, navigation, loading, async), so the Contract half of the 50/50 balance lacks its web-specific share. Nothing in the document structures or marks the split. |
| Realistic Web environment/execution assumptions | 22/40 | Browser interaction is plausible for Step 1 (though the channel is unstated — UI 裁决按钮 vs transitionProposal tool) and Step 4 (概览三视图/文档/提案子 tab 核查) ✓. But Steps 2/3/5 expected results are tool/DB/filesystem/regression-suite assertions with **no browser-observable outcome** — "核查 M3.5 全部任务与执行记录的落库位置", "检查文件系统", "执行总纲回归断言" — out-of-band checks a Web E2E cannot see (PRD-mandated assertion altitudes, hence no -25 violation applied, but the journey never states the UI-observable counterpart the PRD does provide). Zero async consideration anywhere (dispatch chain spans sessions; loading/network never appear) despite surface-web.md's async-handling principles. |

### 6. Internal Consistency — 134/150

| Criterion | Score | Justification |
|---|---|---|
| Invariants hold in every Step | 54/60 | No step violates the five declared invariants (零 manifest, 100% 入库， 时序耦合， 自举纪律记账， 门放行条件) ✓. Minor tension: invariant 3's "不提前、不事后补" sits alongside Step 5's post-walkthrough 记账合入 — reconcilable (记账 ≠ 立项； SC9 is closure duty), but the document never draws that line. |
| Cross-Step references consistent | 40/50 | **Dangling reference**: Step 3's "核查 **M3.5 全部任务**与执行记录的落库位置" and Step 2's "M3.5 任务经 run-tasks 派发执行" presuppose a task pool that **no step and no Setup item establishes** — breakdown-tasks never appears, yet the Overview claims "业务流程三作用于 M3.5" and the proposal's Key Scenario 6 says "远征会话**全链**开发" (流程三 includes write-prd/design → breakdown-tasks → run-tasks). Related: Step 4's 全景核查 includes the **文档** tab, but no step produces any M3.5 feature document, leaving what the 文档 tab must show undetermined. |
| Risk level consistent with content | 40/40 | High ↔ proposal acceptance, feature chaining, task/git execution, append-only audit, irreversible constitution merge. Consistent. |

### 7. Workflow Coverage — 120/150

| Criterion | Score | Justification |
|---|---|---|
| Golden Path existence (veto) | 50/60 | Veto **not** triggered: the happy path is a contiguous 5-step sequence semantically tied to a specific PRD user story (Story 8 — the feature's acceptance main-axis ⑧ / SC-M3 门)： 评审接受 → 成链 → 自举派发 → 入库核查 → 全景/零 manifest → 回归与记账. Domain-level operations throughout, no bare API-call steps ✓. Deductions: frontmatter self-declares `golden_path: false` (feature-level golden path lives in expedition-full-sdd-chain — acceptable coordination, noted for accuracy); Step 2's umbrella hides the SDD chain middle (see Cross-Step finding); Steps 3/5 are verification-only steps (PRD-anchored, not padding, but they advance no goal). |
| Multi-step coverage depth | 36/50 | Guard coverage is good: error recovery (fix chain 2c), drift detection (3b), consistency guard (4b), regression gate (5b), accounting guard (5c), timing guard (1b). But: no entity-lifecycle variation within this journey (proposal acceptance is the only state transition exercised), no cross-entity create/update operations, and the SDD middle phases (spec authoring, task breakdown) are absent — the depth is audit-shaped rather than workflow-shaped. |
| Workflow completeness against PRD scope | 34/40 | Story 8's three AC blocks all covered (AC1→Steps 1–3; AC2→Step 4+5b; AC3→Step 5/5c); SC8's every clause represented (评审接受/成链/派发/100% 入库/全景/零 manifest/SC 回归) plus SC9. Gap: the Overview's own scope claim — "业务流程三作用于 M3.5" — is only half honored: 流程三's spec-authoring and breakdown sub-chain (steps 4–5 of the flow) has no corresponding journey step, defensible only via the sibling expedition journey covering the generic chain. |

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] Required user input for the acceptance transition is omitted.** Step 1: "**User Action**: 单人开发者将 M3.5 提案评审流转至 accepted" — UF-1 specifies the 裁决 dialog as "目标态仅列五态机允许集 + reason 必填——空因拒绝留场"， and 流程三 shows the path draft → under-review → accepted. The journey never states the reason input, nor whether direct draft→accepted is permitted. No rubric dimension checks input sufficiency; a downstream gen-test-scripts run would generate a transition missing mandatory inputs and trip validation for the wrong reason.
2. **[blindspot] Verification altitude is undeclared per step.** Step 3: "**User Action**: 核查 M3.5 全部任务与执行记录的落库位置" — via UI (task/record views), direct DB read, or tool response? The PRD systematically distinguishes 功能断言 / e2e 断言 / 文件系统断言 / 文档断言； this journey marks assertion kinds but never the observing channel. gen-contracts cannot tell which outcomes are browser-observable, DB-only, or filesystem-only — each step should declare its verification channel.
3. **[blindspot] Dispatcher liveness / completion precondition missing between Steps 2 and 3.** Step 2 folds the entire dispatch phase into one step ("M3.5 任务经 run-tasks 派发执行") and Step 3 immediately audits "M3.5 全部任务与执行记录". Per BIZ-product-008 the app has zero orchestration (the dispatch loop lives in the agent skill side), so Step 3 has no stated precondition that dispatch has completed (全部任务终态) — run mid-flight, "100% 入库" conflates eventual completeness with current observability, and the audit could legitimately observe in-progress tasks.

---

## Deduction Ledger (rubric rules applied)

| Rule | Instances | Effect |
|---|---|---|
| Mandatory Web derived Outcomes absent | validation-error + session-expired, no N/A | Surface Fitness mandatory criterion 0/60; Completeness outcome coverage 28/70 |
| Precondition overlap across Outcomes | 1b ↔ Setup/happy Step 1 (half pair — "仍为 draft" vs "已 Draft 在库且可评审") | Precondition Exclusivity 46/60, 44/50 |
| Hallucinated unclassified claim (-30/instance) | 0 | — |
| Surface type violation (-25/instance) | 0 (DB/filesystem assertions are SC8-mandated assertion altitudes; penalized under realism instead) | — |
| Invariant violation (-40/violation) | 0 | — |
| Golden Path veto | Not triggered (5 contiguous steps tied to Story 8) | — |

## Cross-dimension coherence check

- The mandatory-outcome absence is charged once in Completeness (coverage) and once in Surface Fitness (surface-rule compliance) — different criteria, consistent with sibling-journey precedents.
- The invisible SDD middle is charged in Internal Consistency (dangling "M3.5 全部任务" reference) and in Workflow Coverage (scope claim "业务流程三作用于 M3.5" unfulfilled) — reference validity vs coverage are distinct criteria.
- Step 2's umbrella coarseness appears in Completeness (executability) and contributes to the Golden Path deduction (step quality) — no double-counting of the same criterion.

## What Must Improve (for reviser)

1. **Add the two mandatory Web derived Outcomes** (highest priority, unblocks the failing dimension): a `validation-error` edge on the Step 1 裁决 dialog (empty reason → 留场拒绝， grounded in UF-1) and a `session-expired` edge on the multi-session walkthrough (or an explicit reasoned N/A). Add `prd-ui-functions.md` to `sources:` once UI behavior is referenced.
2. **Close the dangling task-pool reference**: either add the SDD middle steps (M3.5 write-prd/tech-design/breakdown-tasks producing the task pool and feature documents) or a Setup precondition ("M3.5 任务清单已建立") plus a note on what the 文档 tab shows for M3.5.
3. **Decompose Step 2** into discretely executable actions (发起派发 → 链执行 → 终态确认) and state the verification channel for Steps 3/5 (UI carrier vs out-of-band).
4. **Fix Edge 1b's Precondition** to a mechanically distinguishable state (e.g., "评审尚未接受（提案处于 draft/under-review）或提案内容未达可评审标准[具体判据]").
5. **Annotate inferred edges** (1b/3b/4b) with `source: inferred` and their derivation basis; strip "断言红"-style test-result vocabulary from Expected Results in favor of user/system-observable outcomes.
6. **Declare dispatcher-completion precondition** for Step 3 (全部任务已达终态 / 派发循环结束) per BIZ-product-008 zero-orchestration.
