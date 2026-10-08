# Eval Report: expedition-full-sdd-chain — Iteration 1

- Scorer: adversarial QA (Senior QA Engineer persona)
- Date: 2026-10-08
- Rubric: journey.md (1150 pts, target 975, all dimensions ≥ min threshold)
- Surface: web (rules/surface-web.md)
- Sources reality-checked: prd-user-stories.md, prd-spec.md, proposal.md, prd-ui-functions.md, design/tech-design.md, design/schema.sql, business-rules (task-pipeline / product-discipline)

## Verdict

**FAIL — 881/1150** (target 975). One dimension below min threshold: **Surface Fitness 56/150 (min 90)**. All other dimensions above threshold.

| Dimension | Score | Min | Status |
|---|---|---|---|
| Completeness | 150/200 | 120 | PASS |
| Semantic Purity | 175/200 | 120 | PASS |
| Precondition Exclusivity | 110/150 | 90 | PASS |
| Fact Alignment | 114/150 | 90 | PASS |
| Surface Fitness | 56/150 | 90 | **FAIL** |
| Internal Consistency | 138/150 | 90 | PASS |
| Workflow Coverage | 138/150 | 90 | PASS |
| **Total** | **881/1150** | 975 | **FAIL** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Problem→solution fit**: good. The 8-step chain is a faithful extraction of PRD Story 3 + 业务流程三 + 关键场景 2 + SC5. Overview claim "跨实体交互 8 步" matches the complex-feature golden path expectation (5+ steps, cross-entity).
2. **Evidence→solution support**: strong. Expected Results are dense with verifiable specifics (tool channels, audit verbs, atomicity, superseded lineage) — I verified each against PRD/proposal/tech-design/schema (see Fact Alignment).
3. **Success criteria validity**: Step 8's "四域全景一致（e2e 一条链断言）" is the PRD's own SC5 criterion — valid.
4. **Self-contradiction found (mild)**: Step 8b audits `register / transition / doc-upsert` writes, but no journey step ever performs a feature `transition` (phase advances via doc registration in this chain).
5. **Critical gap**: the document declares `surface_types: ["web"]` yet contains **zero** of the two mandatory Web derived Outcomes (`validation-error`, `session-expired`). This is not an abstract miss — the PRD's own UF-1 defines a concrete form-validation behavior for this exact workflow (裁决对话框 "reason 必填——空因拒绝留场") that the journey leaves untested.
6. **Divergence-quality gap**: Step 6b's Precondition restates the happy path rather than diverging from it.
7. **SoT ambiguity inherited**: Step 1 fuses "经 tool 读写入提案域" with "提案发现扫描建行" in one Expected Result without stating which channel creates the proposals row (BIZ-task-009 defines the scan as a separate absorption channel).

---

## Phase 2 — Dimension Scores

### 1. Completeness — 150/200

| Criterion | Score | Justification |
|---|---|---|
| Metadata complete | 50/50 | `journey: "expedition-full-sdd-chain"` kebab-case ✓; `risk_level: "High"` valid and justified (DB writes, git commits, append-only audit — state mutation throughout) ✓; `golden_path: true`, `surface_types`/`surface_keys`/`sources`/`generated` all present ✓. |
| Steps complete with required fields | 72/80 | Every step has User Action + Expected Result; High-risk edge density satisfied (9 edge ≥ 8 happy) ✓. Deduction: Step 3's User Action is a declared non-action — "**User Action**: 远征提案 accepted 触发成链（**无需人工另起步骤**）" — the field describes the absence of a user operation (system-automatic trigger folded in as a step). Executable as an e2e checkpoint, but not a user action; a downstream generator must infer the actor (core). |
| Outcomes cover happy path + required derived scenarios | 28/70 | Happy path rich ✓; domain edge cases substantial (9) ✓. But the Web surface's mandatory derived Outcomes are **completely absent**: no `validation-error` (despite UF-1's "reason 必填——空因拒绝留场" being a ready-made invalid-input scenario for Step 2/2b/2c) and no `session-expired` (despite a long multi-session SDD chain being the natural expiry host). Per surface-web.md these "must be considered for every Web Journey"; neither appears nor is any non-applicability justification given. |

### 2. Semantic Purity — 175/200

| Criterion | Score | Justification |
|---|---|---|
| Natural language, not code/regex | 74/80 | No regex/CSS selectors/assertion calls ✓. Deduction: test-machinery vocabulary leaks into Expected Results as parentheticals — Step 8 "四域全景一致（**e2e 一条链断言**）", Step 8b "（**表断言**）", Step 7c "（**文件系统与库对账**）", Step 1b "（**移除/未迁断言**）". These describe how to verify, not what the user observes. |
| Preconditions declarative | 51/60 | Mostly state declarations ✓. Deductions: Step 1b's Precondition is the action itself, not a state — "**Precondition**: 远征会话查看技能目录" vs "**User Action**: 枚举远征会话技能目录" (duplicated, no differing state). Step 3b's "（或**注入失败**）" embeds test-setup procedure into the precondition. |
| No implementation coupling in Steps | 50/60 | Tool names (upsertFeatureDoc / addTask / createProposal / transitionProposal) are the PRD's own domain vocabulary — acceptable. Deduction: Step 8b asserts at SQL-trigger level — "append-only（**UPDATE / DELETE 直接 ABORT**）" and "检查 **feature_records 表**" — DB mechanics rather than observable behavior (PRD-grounded, but couples the journey to table/trigger internals). |

### 3. Precondition Exclusivity — 110/150

| Criterion | Score | Justification |
|---|---|---|
| Preconditions distinct across Outcomes | 38/60 | **Ambiguous pair #1 (-20)**: Step 6b's Precondition "breakdown 产出带依赖关系的任务集" is semantically identical to happy Step 6's Expected Result "依赖关系构成 DAG" — the edge case's precondition holds in the happy path too, so nothing distinguishes which outcome applies. **Half deduction #2**: Step 1b's precondition (see above) does not diverge from any happy state; it can co-hold with the happy path. |
| Preconditions sufficient to uniquely select an Outcome | 40/50 | For 6b, given the state after Step 6, both the happy outcome ("依赖关系正确落库；派发按 DAG 顺序") and the edge outcome apply — the intended divergent state (a ready-selection attempt while a prerequisite is not yet terminal) is only hinted inside the Expected Result ("前置未终态不可领取——无越序"), not established by the Precondition. |
| No missing Preconditions for error/boundary Outcomes | 32/40 | Step 2c's Precondition "该提案已被后续版本取代" implies a successor exists but omits the operative conditions per tech-design (`supersededBy` 目标提案在场校验) and UF-1 (reason 必填). Step 1b has no state precondition at all (audit/verification scenario with an action-shaped precondition). |

### 4. Fact Alignment — 114/150

| Criterion | Score | Justification |
|---|---|---|
| Factual claims traceable | 54/60 | Verified against sources, all substantive claims hold: 成链门 "accepted ∧ mode=expedition" (schema.sql L181, SC3) ✓; feature_records append-only 双触发器 verb/actor (schema.sql L62-75, InScope ③) ✓; core 包无 git-commit/git-checkout (Story 3 AC2 verbatim) ✓; fix 链 block_source/恢复钩子 (Story 5, BIZ-task-003) ✓; "DAG 视图" exists (UF-3 三视图) ✓; upsert 幂等 consistent with PK (feature_id, doc_kind) + upsert semantics ✓. Deductions: Step 4's "（prd/ 分组）" is a loose paraphrase — UF-4 specifies 中文分组标题（需求文档(N)/设计文档(N)/UI 文档(N)）， not a "prd/" group label; Step 2c's "取代链在提案行谱系元数据可见" traces to prd-ui-functions.md (UF-1 谱系 = "superseded 取代链") and tech-design — documents **not listed in `sources:`** (proposal.md, the listed source, only says "accepted → superseded 演进链可用" without the lineage-visibility claim). |
| Inferred claims have required_outcomes rule support + `source: inferred` | 20/50 | No edge case carries any inference annotation; boundary outcomes that are reasonable inferences (4b 幂等细节, 6b 无越序) cite no derivation basis. Worse, the surface-mandated derivations that *should* exist (validation-error from UF-1's 空因拒绝; session-expired) are absent entirely, so no rule-triggered inference is present at all. |
| No hallucinated unclassified claims | 40/40 | Every specific assertion I checked resolved to a PRD/proposal/design/schema fact. No fabricated behavior found. |

### 5. Surface Fitness — 56/150 (**below threshold**)

| Criterion | Score | Justification |
|---|---|---|
| Mandatory derived Outcomes present | **0/60** | surface-web.md: `validation-error` and `session-expired` "must be considered for every Web Journey". Both are **completely absent** from all 8 happy steps and 9 edge cases, with no justified non-applicability note. Rubric: "Score 0 if mandatory Outcomes are completely absent." The omission is consequential: the review-dialog validation behavior is explicitly specified in this feature's UI contract (UF-1: "reason 必填——空因拒绝留场") and a long multi-session SDD chain is the canonical session-expiry host. |
| Test strategy proportions (Web = balanced 50/50) | 32/50 | Journey-smoke side is strong (8-step contiguous chain). Contract-side density exists (9 edge cases) but is entirely domain/data-flavored (atomicity, idempotency, audit, DAG) — zero web-interaction Contract material (form validation states, navigation, loading), so the Contract half of the 50/50 balance lacks its web-specific share. |
| Realistic Web environment/execution assumptions | 24/40 | Browser interaction is plausible for Steps 2/8 (提案子 tab, 概览四域) ✓. But Steps 1b/3b/7c/8b expected results are pure enumeration/DB assertions with **no browser-observable outcome** ("检查库中 feature 行 / proposal_id 谱系 / feature_records 审计行", "检查 feature_records 表", "枚举远征会话技能目录") — out-of-band checks a Web E2E cannot see (PRD-mandated chain assertions, hence no -25 violation applied, but the journey never states the UI-observable counterpart). No async consideration anywhere (loading-state during skill execution / dispatch, network-error) despite surface-web.md's async-handling principles. |

### 6. Internal Consistency — 138/150

| Criterion | Score | Justification |
|---|---|---|
| Invariants hold in every Step | 58/60 | No step violates the five declared invariants (tool-only channels, atomic chaining, 归属模型, append-only audit, SoT residency). Mild: Step 1's single Expected Result fuses the tool channel with the scan channel ("产出 proposal.md（经 tool 读写入提案域）；提案发现扫描建行"), leaving it undetermined which channel creates the row the invariant "提案 → createProposal" governs (BIZ-task-009 defines the scan as the absorption channel for pre-existing files). |
| Cross-Step references consistent | 40/50 | Step 8 correctly aggregates artifacts created in Steps 1-7 ✓; 2b's "不破坏既有扫描行" ties to Step 1 ✓; 3b's three artifacts match Step 3 ✓. Deduction: Step 8b's Precondition "feature 域发生过多次写入（**register / transition** / doc-upsert）" references a `transition` write **no step in this journey ever performs** (phases advance via doc registration; transitionFeature is never invoked) — a dangling reference for any reader executing the journey as written. |
| Risk level consistent with content | 40/40 | High ↔ state mutation + git commits + append-only audit. Consistent. |

### 7. Workflow Coverage — 138/150

| Criterion | Score | Justification |
|---|---|---|
| Golden Path existence (veto) | 54/60 | Veto **not** triggered: `golden_path: true`; 8 contiguous steps map semantically to PRD Story 3 / 流程三 / 关键场景 2 (brainstorm → 评审 accepted → 成链 → PRD → 设计文档 → 拆任务 → 派发 → 全景核查); domain terminology throughout, no HTTP/API-call steps; complex-feature depth (5+ steps, cross-entity: proposal→feature→documents→tasks→records) ✓. Deductions: Step 3 is titled by tool name with no user action ("registerFeature 单步成链" — partial API-level flavor, PRD's own vocabulary mitigates); Step 8 is a verification-only step ("打开概览核查") — PRD-anchored (Story 3 AC3) so not padding, but it advances no goal. |
| Multi-step coverage depth | 46/50 | Deep: entity lifecycle (proposal draft→under-review→accepted→superseded), state transitions, cross-entity interactions, error recovery (fix chain, atomicity fault injection), idempotency. |
| Workflow completeness against PRD scope | 38/40 | Story 3's three ACs all covered (tool-chain 1-7+7c; skill catalog 1b; overview 8). Remaining stories partitioned to sibling journeys (9 journeys ↔ 8 stories + hero). Within assigned scope, only micro-gap: transitionFeature verb of the feature domain never exercised (ties to 8b finding). |

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] Required user inputs for the review workflow are omitted.** UF-1 specifies the 裁决 dialog as "目标态仅列五态机允许集 + **reason 必填——空因拒绝留场**" and tech-design requires `toStatus='superseded'` 必带 `supersededBy`（目标提案 id 在场校验）. The journey's Steps 2/2b/2c say only "人工裁决打回"/"将其流转至 superseded" — no reason, no superseding target. No rubric dimension explicitly checks *input sufficiency*; a downstream gen-test-scripts run would generate transition calls missing mandatory inputs and trip validation for the wrong reason.
2. **[blindspot] Step 1 leaves the proposals-row SoT channel ambiguous.** "产出 proposal.md（经 tool 读写入提案域）；提案发现扫描建行" — per BIZ-task-009 the discovery scan is the absorption channel (frontmatter 初值单向阀门, DB 为 SoT); whether brainstorm's row comes from createProposal or from scan absorption determines which assertion a test makes (incl. mode 溯源 = expedition vs NULL 缺省占位). The journey asserts "mode 溯源 = expedition 创建时写入" while simultaneously crediting the scan — these two channels have different mode provenance per DF006/schema (NULL = 扫描吸收旧提案). A test derived from this step could assert the wrong channel.
3. **[blindspot] Post-recovery dispatch continuation has no actor.** Step 7b: "fix 链自动恢复（block_source 单事务、恢复钩子——M2 机制回归）；**恢复后派发继续**" — per BIZ-product-008 the app has zero orchestration (dispatcher outer loop lives in the agent skill side); "派发继续" implicitly requires the run-tasks loop to still be alive or be re-triggered. The journey never states this precondition (dispatcher session still running), so the edge case as written can hang on a terminated dispatcher.

---

## Deduction Ledger (rubric rules applied)

| Rule | Instances | Effect |
|---|---|---|
| Precondition overlap across Outcomes (-20/pair) | 6b ↔ happy Step 6 (1 full pair; 1b half) | Precondition Exclusivity 38/60 |
| Hallucinated unclassified claim (-30/instance) | 0 | — |
| Surface type violation (-25/instance) | 0 (DB assertions are PRD-mandated chain assertions; penalized under realism instead) | — |
| Invariant violation (-40/violation) | 0 | — |
| Golden Path veto | Not triggered | — |

## What Must Improve (for reviser)

1. **Add the two mandatory Web derived Outcomes** (highest priority, unblocks the failing dimension): a `validation-error` edge on the 裁决 dialog (empty reason → 留场拒绝; grounded in UF-1) and a `session-expired` edge on the long SDD chain (expiry mid-chain → redirect/message, unsaved state handling). Add `prd-ui-functions.md` to `sources:` since UI behavior is now referenced.
2. **Fix Step 6b's Precondition** to the divergent state: "某任务的前置任务尚未达到终态（pending/in_progress），此时派发循环尝试领取该任务" — the no-out-of-order claim then has a real trigger.
3. **Give Step 3 a real actor/action** (e.g., system-side checkpoint with actor=core stated) or fold it into Step 2's Expected Result; note the feature `transition` verb in 8b is never produced — either add a transitionFeature exercise or drop `transition` from 8b's precondition list.
4. **State the Step 1 row-creation channel** (createProposal with mode=expedition at creation; scan absorption is the legacy-file path with NULL mode) to remove the SoT ambiguity.
5. **Strip test-machinery parentheticals** ("e2e 一条链断言", "表断言", "文件系统与库对账") from Expected Results or rephrase as user-observable counterparts ("概览提案区显示 accepted 且谱系元数据在场").
6. **Include mandatory inputs** in review-transition user actions (reason 必填; supersededBy target for superseded).
