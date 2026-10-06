# Journey Eval Report — iteration 1

- **Target**: `docs/features/dsh-forge-m2-pipeline/testing/workspace-registration-derived-path/journey.md`
- **Scorer**: Senior QA Engineer persona, adversarial 3-phase protocol
- **Surface**: web (rule: `gen-journeys/rules/surface-web.md`)
- **Cross-referenced**: `prd/prd-spec.md`, `prd/prd-user-stories.md`, `prd/prd-ui-functions.md`, `design/tech-design.md`
- **Date**: 2026-10-07

## Phase 1 — Reasoning Audit (pre-score anchors)

1. The happy path (select directory → view derived row → confirm registration) corresponds step-for-step to PRD Story 7 AC1, 业务流程五, and UI Function 4 items 1–3. Steps are domain-level user operations, not API descriptions.
2. Every load-bearing behavioral claim was verified against the cited sources and holds: path format `{dsh-forge-home}/{扁平化}@{hash8}` (PRD ①, UF-4 item 2), single-source RPC delivery (PRD In Scope ③, DF006, Interface 5/7), registration-time DB creation + discovery scan (PRD In Scope ①, 交互三), suspected-move rejection semantics verbatim from Story 7 AC2, retry-after-rejection verbatim from UF-4 item 4, hash8 = sha-256 first 8 hex (PRD ①). **No hallucinated behavior found.**
3. Gaps identified before rubric scoring: (a) web mandatory outcomes `validation-error`/`session-expired` never explicitly considered; (b) Step 3b/3c preconditions overlap for a second suspected-move re-selection; (c) tech-design Interface 5's registration collision **tri-state** includes 幂等复用 (idempotent attach) which this journey never models; (d) no transient/loading outcome for the RPC-fetched derived row; (e) two claims go beyond PRD text without inference markers ("无手动输入路径", "表单不残留旧值").
4. No invariant violations found; all cross-step references resolve (3c's "曾因疑似移动被拒绝" ← 3b; 1b's "表单已展示某目录的派生路径" ← Steps 1/2). Risk High is justified (registration = state mutation + suspected-move data risk). High-risk density rule satisfied: 4 edge cases ≥ 3 happy steps.

## Phase 2 — Rubric Scores

### 1. Completeness — 174/200

| Criterion | Score | Justification |
|---|---|---|
| Metadata complete | 50/50 | Name `workspace-registration-derived-path` kebab-case; `risk_level: "High"` valid and justified by content (registration writes central row + creates per-workspace library; suspected-move scenario is precisely a data-confusion risk). `surface_types`/`surface_keys` present and non-empty. Sources list three real files, all existing. |
| Steps complete | 76/80 | Every step (3 happy + 4 edge) has User Action + Expected Result; edge steps additionally carry Precondition; sequence is coherent and ordered. Happy-path steps carry no explicit Precondition fields (family convention: Setup carries them — acceptable, minor). Step 2 ("查看注册表单的任务清单只读行") is observational but legitimate as a web verification step. |
| Happy + required derived scenarios | 48/70 | Happy path covered; boundary set is substantive (re-selection update, hash8 disambiguation, suspected-move rejection, retry recovery). However the web surface's **mandatory derived outcomes (`validation-error`, `session-expired`) are never explicitly considered** — no labeled outcome, no considered-and-N/A note. Step 3b/3c do functionally embody the validation-error behavioral trio (error shown, form not submitted, correct-and-retry) but unlabeled. Deduct 22. |

### 2. Semantic Purity — 182/200

| Criterion | Score | Justification |
|---|---|---|
| Natural language, no code/regex | 72/80 | Zero regex/CSS selectors/XPath/assertion calls anywhere. Mild deductions: expected results embed transport/architecture vocabulary — "该串由应用侧单一来源下发（core 派生 + RPC 下发，web 侧不自算）" describes provenance auditable only at architecture level, not what the user observes; "（SC2 单源断言）" is a spec-audit reference inside an outcome. Each is PRD-anchored, so coupling is mild, not trivial. |
| Preconditions declarative | 58/60 | All four edge preconditions are declarative states ("表单已展示某目录的派生路径", "存在扁平化后主体相同的多个工作区路径", "目标存储目录不存在，但发现同扁平化主体、异 hash8 的既有目录（疑似移动）", "曾因疑似移动被拒绝"). Setup items are environment states, not procedures. Minor dock: Setup's "tasksHome 已定（env `DSH_FORGE_TASKS_HOME` 覆盖 > `{userData}/forge-workspaces` 默认）" mixes config-resolution mechanics into a state description. |
| No implementation coupling in steps | 52/60 | User Action fields are clean user-level operations ("打开 OS 目录选择器，选定工作区目录", "确认注册提交"). Coupling lives in Expected Results/Setup: "core 派生 + RPC 下发", "env `DSH_FORGE_TASKS_HOME`", "（含发现面只读扫描建行）". ~3 instances, each encoding a PRD-specified acceptance property rather than internal trivia — deducted but not penalized as surface violation. |

### 3. Precondition Exclusivity — 126/150

| Criterion | Score | Justification |
|---|---|---|
| Preconditions distinct across outcomes | 58/60 | At the confirm-registration decision point, Step 3 (implicit healthy state), 3b (orphan-dir state), 3c (previously rejected + re-selected) carry distinct conditions; 1b/2b distinct from their base steps. |
| Sufficient to uniquely select | 30/50 | **Ambiguous pair (3b, 3c), -20**: after a 3b rejection, if the user re-selects *another* suspected-move directory, 3b's precondition ("目标存储目录不存在，但发现同扁平化主体、异 hash8 的既有目录") holds **and** 3c's precondition ("曾因疑似移动被拒绝") holds simultaneously — both outcomes match. 3c asserts "复检通过" as a *result*, not a precondition; the precondition must include "重选后的目录复检通过（无疑似移动）" to be selective. |
| No missing preconditions for error/boundary outcomes | 38/40 | All boundary outcomes state their triggers (3b's suspected-move state is exemplary). Minor dock: 2b's "存在扁平化后主体相同的多个工作区路径" does not state those dirs arise from prior registrations, nor how "各自注册表单" are sequentially reached in a single-user app — trigger underspecified for fixture construction. |

### 4. Fact Alignment — 116/150

| Criterion | Score | Justification |
|---|---|---|
| Factual claims traceable or marked UNKNOWN | 48/60 | No fact table exists in this doc family (gen-journeys produces none), and the document uses frontmatter `sources` + Overview citations ("PRD Story 7；业务流程五；UI Function 4") as its traceability mechanism — every claim was verified against those sources and holds. Deduct 12: per-step/per-claim traceability markers absent (no fact_id-equivalent, no UNKNOWN marking), and two claims exceed the cited sources without inference markers: "选定目录一步回填注册表单（系统对话框，**无手动输入路径**）" (PRD never asserts the absence of a manual input field) and "**表单不残留旧值**" (not in any PRD/UI text). |
| Inferred claims have rule support + source: inferred | 30/50 | Steps 1b and 2b are LLM-derived boundary outcomes (Story 7 has only two ACs — display and suspected-move; neither re-selection update nor multi-workspace disambiguation is an AC). They are well-grounded in PRD disambiguation semantics but carry **no `source: inferred` annotation and no citation of the deriving rule/basis**. Same for the two beyond-PRD claims above. |
| No hallucinated unclassified claims | 38/40 | Systematic verification against prd-spec/user-stories/ui-functions/tech-design found zero fabricated behavior. Small residual dock for the exclusionary claim "无手动输入路径" (asserting an absence the sources never state). |

### 5. Surface Fitness — 114/150

| Criterion | Score | Justification |
|---|---|---|
| Mandatory derived outcomes present | 38/60 | surface-web mandates `validation-error` + `session-expired` be *considered* for every web journey. Neither appears as a labeled outcome nor as an explicit considered-and-N/A note. Mitigation preventing a harsher score: Step 3b/3c substantively deliver the validation-error pattern for this form ("拒绝注册并给出手工指引…表单留场" + "复检通过，恢复正常确认" = error near form / not submitted / correct-and-retry); the form has no free-text inputs (OS picker) and the app has no auth/session concept, so field-validation and session-expiry are near-inapplicable — but the document never says so, leaving downstream gen-contracts unable to distinguish "considered and mapped/N-A" from "missed". |
| Test strategy proportions (web 50/50) | 40/50 | The journey provides a genuine end-to-end workflow (multi-step, error recovery) suitable for Journey-smoke, with per-step outcomes suitable for Contract derivation — consistent with balanced emphasis. Dock 10: outcome depth per step is single-outcome; no async consideration for the RPC-fetched derived row (see blindspot #2). |
| Realistic web environment/execution assumptions | 36/40 | "OS 目录选择器可用（系统对话框一步）" is a realistic Electron-web assumption (matches UF-4 and P1 fix-14·16 现态); browser automation via Playwright `_electron` is the design's e2e model. Minor dock: a native OS directory dialog is awkward for browser automation (filechooser interception) — journey-level acceptable, but no note acknowledges the interception strategy for the picker. |

### 6. Internal Consistency — 148/150

| Criterion | Score | Justification |
|---|---|---|
| Invariants hold in every step | 58/60 | Checked all four invariants against all seven steps: single-source derivation (Step 2), fixed library location format (Step 3, 2b), zero-side-effect rejection (3b: "不清理、不认领、不崩溃（零副作用，表单留场）" — consistent with tech-design's "ERR_SUSPECTED_MOVE 在中央行落库之前抛出"), core single write gate (Step 3, 3c). No violations. Minor: invariant 4's "core 单门/建库协作者" is design vocabulary absent from the three cited sources' UI texts (it is in prd-spec Related Changes, so grounded). |
| Cross-step references consistent | 50/50 | 3c "曾因疑似移动被拒绝" resolves to 3b's outcome; 1b "表单已展示某目录的派生路径" resolves to Steps 1/2. No dangling or contradictory references. |
| Risk level consistent | 40/40 | High = state mutation + data-risk workflow: registration creates libraries and central rows, and the suspected-move guard exists precisely because of split-library/data-confusion risk. Consistent. |

### 7. Workflow Coverage — 119/150

| Criterion | Score | Justification |
|---|---|---|
| Golden Path existence (veto item) | 52/60 | **No veto.** The journey contains a contiguous 3-step happy path that semantically corresponds to a specific PRD user story (Story 7) and core workflow (业务流程五 / UF-4), with domain-level actions — the rubric's semantic-verification clause is satisfied. The feature's designated Golden Path journey exists separately (`task-dispatch-pipeline`, `golden_path: true`, per the one-golden-path-per-feature convention), and this file honestly declares `golden_path: false`. Docked 8: bare-minimum 3 steps, Step 2 is observational, and the self-declared non-golden status leaves the rubric's "primary user story" wording only partially satisfied (Story 7 is *a* user story, not *the* primary one). |
| Multi-step coverage depth | 35/50 | Beyond the happy path: state variation (derived row update on re-selection), collision disambiguation, and a full error-recovery arc (reject → guide → retry → succeed). However the workflow is single-entity (workspace registration) with create-only lifecycle; no cross-entity interaction depth beyond implicit central-registry/library/filesystem interplay. |
| Workflow completeness against PRD/Design scope | 32/40 | Story 7's two ACs fully covered; UF-4's four interaction items fully covered; 流程五 fully covered. Gap: tech-design Interface 5 defines the registration collision **tri-state** — "正常新建 / 幂等复用（中央 ws_path 精确确认）/ 疑似移动拒绝" — and this journey models only two of three. Re-registering an already-registered canonical path (attach, no duplicate library, no compensation — BIZ-workspace-001/002 semantics: 幂等命中不得误删既有工作区) is uncovered, and it is the classic production-bug surface for registration flows. |

## Cross-Dimension Coherence Check

- Steps/outcomes/invariants are mutually consistent; risk level matches mutation semantics; edge density matches High classification.
- The single strongest cross-dimension gap — unmodeled 幂等复用 collision state — manifests most clearly in Workflow Coverage (7c, -8) and is echoed as blindspot #1; it is not double-counted elsewhere.
- The 3b/3c precondition overlap is scored once (Precondition Exclusivity, -20); it does not rise to an invariant violation since both outcomes preserve the zero-side-effect invariant.
- The validation-error/session-expired gap is scored in Surface Fitness (5a) and Completeness (1c); both reflect the same root cause (no explicit consideration record) — treated as two dimension-specific manifestations of one defect, per rubric structure.

## Phase 3 — Blindspot Hunt

1. **[blindspot] Missing idempotent re-registration (attach) path** — quote: "**Precondition**: 目标存储目录不存在，但发现同扁平化主体、异 hash8 的既有目录（疑似移动）" (Step 3b). The journey models only the new/suspected states; tech-design Interface 5's third state "幂等复用（中央 ws_path 精确确认）" (re-register the same canonical path → attach existing, no second library, no compensation; BIZ-workspace-002: 幂等命中不得误删既有工作区) has no step. A regression that duplicates or deletes a workspace library on re-registration would pass this journey green. Improvement: add Step 3d (re-register registered workspace → derived row unchanged, confirm → attach, exactly one library, prior data intact).
2. **[blindspot] Transient state of the RPC-fetched derived row unspecified** — quote: "**Expected Result**: 选定目录一步回填注册表单（系统对话框，无手动输入路径）" (Step 1). The derived row arrives via RPC after selection; no outcome defines what renders while the call is in flight or if it fails (loading/placeholder/stale-suppression). surface-web lists `loading-state`/`network-error` among common boundary outcomes; downstream contracts cannot pin interim rendering. Improvement: add a loading/failure boundary outcome for the derive fetch.
3. **[blindspot] Exclusionary UI claim without source basis** — quote: "（系统对话框，无手动输入路径）" (Step 1). PRD/UF-4 state only that selection happens via a one-step system dialog; none asserts manual path input is absent. If a legacy editable path field remains, this outcome is untestable as written. Improvement: mark as inferred or restrict the assertion to "选定目录一步回填".
4. **[blindspot] Mandatory web outcomes lack an explicit consideration record** — quote: the Edge Cases section contains only Steps 1b/2b/3b/3c with no mention of validation-error/session-expired applicability. Step 3b/3c do map onto the validation-error pattern for this form, and session-expired is structurally N/A (local app, no auth) — but the mapping/N-A reasoning lives only in this eval, not in the document, so gen-contracts inherits the ambiguity. Improvement: add a short "surface outcome consideration" note mapping 3b/3c → validation-error and recording session-expired as N/A (no session concept in local app).
5. **[blindspot] Step 2b fixture semantics underspecified** — quote: "**Precondition**: 存在扁平化后主体相同的多个工作区路径" — does not state these directories exist under tasksHome due to prior registrations, nor the sequencing needed to observe "各自注册表单的派生行" in a single-user flow. A downstream agent constructing the fixture must guess whether to pre-create directories manually or register workspaces first (the two constructions produce different intermediate states). Improvement: state the fixture provenance (prior registrations produced the colliding dirs).

## Score Summary

| Dimension | Score | Min Threshold |
|---|---|---|
| Completeness | 174/200 | 120 ✓ |
| Semantic Purity | 182/200 | 120 ✓ |
| Precondition Exclusivity | 126/150 | 90 ✓ |
| Fact Alignment | 116/150 | 90 ✓ |
| Surface Fitness | 114/150 | 90 ✓ |
| Internal Consistency | 148/150 | 90 ✓ |
| Workflow Coverage | 119/150 | 90 ✓ |
| **Total** | **979/1150** | **≥975 ✓** |

**Verdict: PASS** (979 ≥ 975; all dimensions above threshold). Margins are thin (total +4, Surface Fitness +24, Fact Alignment +26 above floor) — the mandatory-outcome consideration record and the 3b/3c precondition fix are the cheapest repairs to solidify the margin; the idempotent re-registration step is the highest-value coverage addition.
