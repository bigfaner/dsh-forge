# Eval-Journey Report — Iteration 1

- **Document**: `docs/features/dsh-forge-m3/testing/preferences-tiered-override/journey.md`
- **Rubric**: journey (1150 pts, target 975, per-dimension thresholds)
- **Surface**: web (`rules/surface-web.md`)
- **Scorer persona**: Senior QA Engineer
- **Iteration**: 1 (no previous report)
- **Reality-check inputs**: `docs/business-rules/{coexistence,privacy,resilience,task-operations,workbench}.md`, `docs/features/dsh-forge-m3/prd/{prd-user-stories,prd-spec,prd-ui-functions}.md`, `docs/features/dsh-forge-m3/design/tech-design.md` (prefs interface cross-check)

## Verdict

**Total: 1021 / 1150 — PASS** (target 975 met; all dimension thresholds met)

| Dimension | Score | Min | Pass |
|-----------|-------|-----|------|
| 1. Completeness | 184/200 | 120 | PASS |
| 2. Semantic Purity | 179/200 | 120 | PASS |
| 3. Precondition Exclusivity | 137/150 | 90 | PASS |
| 4. Fact Alignment | 130/150 | 90 | PASS |
| 5. Surface Fitness | 131/150 | 90 | PASS |
| 6. Internal Consistency | 132/150 | 90 | PASS |
| 7. Workflow Coverage | 128/150 | 90 | PASS |
| **Total** | **1021/1150** | **975** | **PASS** |

---

## Phase 1 — Reasoning Audit

**Problem → Solution**: The journey claims Story 5 (偏好三级覆盖) + SC5 + UF4 + D3. The 6-step Happy Path (open panel → view three tiers & resolution → modify feature-level value → clear override → dispatch consumption assertion → global fallback) maps one-to-one onto UF4's User Interaction Flow plus Story 5's AC2 (dispatch consumption) and AC3 (three-tier view/modify). It solves the stated problem, not a proxy.

**Solution → Evidence**: All three Story 5 ACs have corresponding steps (AC1 → Steps 2/4/6; AC2 → Step 5; AC3 → Steps 1–3 with surfaces exclusion in Step 1). All four UF4 Validation Rules are exercised somewhere (key set fixed → Step 1; type validation → 3b; feature-tier conditionality → 1b; single write path → invariant 3 + Step 3c comment). Evidence is not cherry-picked.

**Evidence → Success Criteria**: Outcomes are behavioral (visible values, 「本级覆盖」/「继承自上级」 source labels, fallback values) except Step 5's test-channel assertion (see below). Traceability blockquote present: "Story 5(偏好三级覆盖);SC5;UF4(偏好编辑面·三级);D3(键集全量三级化,surfaces 除外)".

**Self-contradiction check (steps + invariants cluster)**:
- Invariant "键集固定…无自由键编辑,值类型校验" vs Steps 3/3b: consistent (modify within fixed set; validation on save).
- Invariant "生效解析恒为 feature > 项目 > 全局" vs Steps 2/4/6: consistent chain (feature wins → clear → project → clear both → global).
- Invariant "修改仅经内核偏好 API(单一写路径)" vs Steps 3/3c: consistent, and 3c's no-partial-write inference matches tech-design's `setPrefs // 事务原子`.
- Invariant 4 "已派发会话不追溯改写(inferred)" vs Step 5b: consistent, properly annotated.
- **Two confirmed state-level defects** (not mutual-exclusion of SCs, but satisfiability defects — channeled into Internal Consistency):
  1. Setup fixture is unsatisfiable as written: "已备一个布尔键(如 auto.test.quick)在三级设不同值" — a boolean has exactly two values; three tiers cannot carry pairwise-different values.
  2. Step 5's "修改任一层级偏好后派发一个任务" does not specify which tier is modified, leaving Step 6's entry state underdetermined and enabling a false literal reading of the assertion (modifying a non-winning tier while a lower-tier override exists does NOT change the effective value).

No SC↔SC-style mutual exclusions found; no invariant violated by any step.

**Pre-score anchors** (channeled into dimensions/blindspot):
1. Boolean fixture impossibility → Internal Consistency.
2. "任一层级" tier ambiguity → Internal Consistency (+ PE scent).
3. Undefined "测试通道" (assertion channel) → Surface Fitness.
4. Boolean key chosen for the invalid-input scenario (toggles cannot receive invalid input) → Surface Fitness.
5. Step 5's dispatch has no dispatchable-task fixture and ignores the SC4 stage-artifact check that fires on every dispatch → Completeness / Workflow Coverage.
6. Step 5b's system-prompt comparison is not user-observable on the web surface → Semantic Purity.

---

## Phase 2 — Rubric Scoring (verification stance)

### 1. Completeness — 184/200

| Criterion | Score | Notes |
|-----------|-------|-------|
| Metadata complete | 50/50 | `journey: "preferences-tiered-override"` kebab-case; `risk_level: "Medium"` valid and justified (multi-step interaction, reversible edits, no data loss — matches the stated Medium criteria); `golden_path: false` is the template default and correct at feature level (task-dispatch-execution-loop holds the feature's golden path); `surface_types/surface_keys = ["web"]`; sources list all three PRD files; `generated` present. |
| Steps complete (name/action/outcome) | 71/80 | All 6 happy steps and 5 edge steps have step name, User Action, Expected Result; coherent ordered sequence. Deductions: (a) Step 5 is unexecutable as provisioned — "派发一个任务" requires a dispatchable task, but Setup declares only "含 ≥1 feature 的已注册项目" with no task fixture (可派发任务集 per UF1 requires 依赖满足 + 状态允许); -6. (b) Step 1b's variant state (project without features) is not provisioned — Setup provides only the with-feature project, so a downstream runner must invent a second fixture project; -3. |
| Outcomes cover happy + required derived | 63/70 | Both web mandatory derived outcomes present and mapped (3b validation-error, 3c session-expired). Boundary richness decent: no-feature tier (1b), round-trip (4b), non-retroactivity (5b), global fallback (Step 6), channel failure (3c). Deductions: (a) no durability outcome — Step 3 claims "保存经内核偏好 API 持久化" but no step verifies persistence across restart/reload, the entire point of persistence; -4. (b) no unsaved-edit abandonment outcome — user edits a value and navigates away/closes panel without saving; the web surface rule's navigation-guard analog is untested; -3. |

### 2. Semantic Purity — 179/200

| Criterion | Score | Notes |
|-----------|-------|-------|
| Outcomes natural language, no code/regex | 72/80 | No regex, no CSS/XPath, no `expect()`/`assertEqual` — clean on hard prohibitions. Mild verification/mechanism phrasing leaks into outcomes: Step 5 "生效偏好反映修改后的最终生效值(断言)" (assertion verb inside outcome); Step 3 "保存经内核偏好 API 持久化" (mechanism stated as outcome — UF4 vocabulary, but the user observes persistence, not the API); Step 3c "不落半写状态" / Step 4b "无残留中间态" (internal state-model vocabulary). -8. |
| Preconditions declarative, not procedural | 56/60 | All five edge Precondition fields are declarative states ("feature 级覆盖已清除(回落至项目级)", "存在偏好修改前已派发的 subagent"). One impurity: Setup bullet 3 "派发链消费断言通道就绪(预合成系统提示词经测试通道直读)" is test policy, not an environment state the template reserves Setup for. -4. |
| No implementation coupling in Step descriptions | 51/60 | Steps are user-level ("点击清除 feature 级覆盖"). Coupling leaks: Step 5's action invokes test infrastructure — "修改任一层级偏好后派发一个任务,经测试通道断言预合成系统提示词"; Step 5b's action is built on a non-UI-observable internal artifact — "对比修改前后派发的两个 subagent 系统提示词" (system prompts are not rendered anywhere in the app); -9. |

### 3. Precondition Exclusivity — 137/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Preconditions distinct across Outcomes | 58/60 | Variant triggers are pairwise distinct (1b no-feature vs 3b invalid-input vs 3c channel-failure vs 4b override-cleared vs 5b pre-existing-subagent); each step has a single outcome so no intra-step ambiguity exists. Minor: Step 1b's "当前项目不存在 feature(或无激活项目)" bundles two states into one precondition, blurring the boundary against the happy path's activated-project state. -2. |
| Preconditions sufficient to uniquely select | 42/50 | The 1b bundling is a genuine dual-shape defect: with 无激活项目, the workbench overview (where the preference panel lives) is not the reachable surface — M2/UF3 routes "无激活项目自动进入" the registration wizard — and the expected result "全局/项目级查看与修改照常可用" is undefined because "当前项目" tier refers to nothing. A generator cannot determine the outcome shape for the second disjunct. -8. |
| No missing Preconditions for error/boundary Outcomes | 37/40 | Every edge case states its trigger. Minor: Step 5b provisions only one of the two subagents its comparison requires ("存在偏好修改前已派发的 subagent") — the after-modification dispatch is implied from Step 5 but never stated within the variant. -3. |

### 4. Fact Alignment — 130/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Factual claims traceable or UNKNOWN | 52/60 | Journey-level traceability blockquote present; spot-checks verify verbatim against PRD: 三级层级呈现 (UF4 flow 1), 键集 auto.\*/worktree.\*/eval.\* + surfaces 除外 (D3/SC5), 生效值即时更新 (UF4 flow 3), 「本级覆盖」+ 清除入口 / 「继承自上级」 (UF4 States overridden/inherited), feature 级条件可编辑 (UF4 Validation), 单一写路径 (UF4 Validation "修改仅经偏好 API(与 dsh tool 写路径同源,无第二写者)"), 派发消费断言 (Story 5 AC2/SC5/DF008). Deductions: (a) "全局层作为兜底恒有值" (Step 6) — global-tier pre-population/defaults is stated nowhere in PRD or tech-design; unannotated assumption; -4. (b) traceability is journey-level only — no per-step source refs, forcing the reviewer to re-derive grounding for each claim; -4. |
| Inferred claims have rule support + source: inferred | 40/50 | The exemplars are good: Step 3c carries both the mapping comment ("surface-web required_outcomes 映射:session-expired → …") and a `<source: inferred>` line with reasoning basis; Step 5b carries `source: inferred` (预合成发生于派发时点). Deductions: (a) Step 3b has the mapping comment but lacks the literal `source: inferred` annotation; -4. (b) Step 4b "往返后生效值与来源标识与此前状态一致,无残留中间态" is an inferred idempotency/no-residue claim with NO annotation of any kind; -6. |
| No hallucinated unclassified claims | 38/40 | No claim contradicts PRD, tech-design, or injected business rules (operator model: 偏好 = human orchestration verb per BIZ-task-ops-001 M3 revision — consistent). Small deduction for unspecified behavior presented as fact: "无残留中间态" (no source defines intermediate-state cleanup) and "继承链仍完整" (Step 6). -2. |

### 5. Surface Fitness — 131/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Mandatory derived Outcomes present | 56/60 | Both web mandatory outcomes present with explicit mapping comments: validation-error → 3b (类型校验失败), session-expired → 3c (通道异常 adaptation). 3b is fully faithful to the rule ("error message displayed near the relevant field, form is not submitted, user can correct and retry" ≈ "类型校验错误就近呈现;不保存;用户改正后可重试"). 3c drops the unsaved-data element — the rule requires "unsaved data is either preserved or user is warned about data loss"; 3c asserts "恢复后可重试" without stating whether the pending edit survives the failed save (retry what — re-entered value or retained edit?). -4. |
| Test strategy proportions match surface guidance | 47/50 | Web = balanced 50/50: 11 steps each with isolatable single outcomes (contract-friendly) plus a contiguous 6-step workflow (journey smoke); no structural skew. Minor: Step 5 bundles modify + dispatch + channel-read into one step, compressing what should be distinct contract units (edit-outcome vs consumption-outcome). -3. |
| Realistic web environment/execution assumptions | 28/40 | Two real gaps: (a) "测试通道" is never defined — "派发链消费断言通道就绪(预合成系统提示词经测试通道直读)" names no mechanism (injection record? IPC? debug artifact?); this is the single most load-bearing unverifiable assumption in the document; a downstream gen-test-scripts run must invent it. -8. (b) The invalid-input scenario is pinned to a boolean key — "修改布尔键时输入非法值" — but the natural control for a boolean preference is a toggle/checkbox, which cannot receive invalid input; the scenario silently presumes a free-text control the PRD never defines. A numeric/enum key (eval.\*/auto.\* 枚举) would make the scenario operable as written. -4. |

### 6. Internal Consistency — 132/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Invariants hold in every Step | 60/60 | All four invariants verified against all 11 steps: key-set fixedness never violated (Step 3 modifies within the set); resolution precedence upheld in 2/4/6; single-write-path never bypassed (3c reinforces it); non-retroactivity exercised in 5b. Invariant 4 honestly carries "(inferred)". No violations. |
| Cross-Step references consistent | 32/50 | Two confirmed defects: (a) **Boolean fixture contradiction** — Setup "已备一个布尔键(如 auto.test.quick)在三级设不同值" is unsatisfiable: a boolean has exactly two values, so three tiers cannot be pairwise different; even under the charitable reading ("values set at all three tiers"), at least two tiers collide, undermining Step 2's "三级值分别可见;生效值 = feature 级值(feature > 项目 > 全局覆盖正确)" — with feature == global the feature-wins-over-global precedence cannot be demonstrated. -12. (b) **Step 5 tier ambiguity propagates** — "修改任一层级偏好后派发一个任务" never says which tier; if the feature tier was re-set, Step 6's "依次清除项目级与 feature 级覆盖" is coherent, but if not, the feature-clear in Step 6 is a no-op (already cleared in Step 4). Worse, the literal reading of Step 5's outcome ("生效偏好反映修改后的最终生效值") is false when a non-winning tier is modified while a lower-tier override exists — the effective value legitimately does not change. -6. Positive: "该键" traces cleanly from Step 2 to Steps 3/4/4b; 4b's precondition matches the post-Step-4 state. |
| Risk level consistent with content | 40/40 | Medium is correct: preference edits are persisted state writes but fully reversible (clear/modify back), no data loss, no irreversible operations — "multi-step interaction without irreversible side effects". Step 5's subagent dispatch is disposable. No tension with the classification criteria. |

### 7. Workflow Coverage — 128/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Golden Path existence (veto) | 58/60 | Veto NOT triggered. 6 contiguous steps cover Story 5's complete AC set + UF4's interaction flow with domain-level operations: 打开偏好编辑面 → 查看三级与生效解析 → 修改 feature 级 → 清除覆盖回落 → 派发链消费断言 → 全局兜底. Every step uses PRD domain terminology (层级/覆盖/生效值/派发), no API-level descriptions. Step 5 is partially a verification step but is AC-justified (Story 5 AC2 makes dispatch-consumption the story's payoff) — mild -2 for bundling modify+dispatch+assert into one step. |
| Multi-step coverage depth | 42/50 | Covers the value lifecycle (set → modify → clear → fallback → round-trip), tier-disabled boundary, non-retroactivity, channel failure — decent state-machine depth for one entity. Gaps: (a) no direct project-tier or global-tier modification scenario — the fixture supplies the project value and Step 6 only CLEARS project level; no step ever edits a non-feature tier and observes the cross-tier effect; (b) no multi-feature selector interaction — UF4 defines a "feature 选择器" consumed "编辑 feature 级时", but the ≥1-feature fixture makes the selector trivial; (c) no concurrent-refresh concern (prefs_updated event) — minor. -8. |
| Workflow completeness against PRD/Design scope | 28/40 | Story 5's three ACs and SC5's three clauses are each covered. Gaps: (a) **the persona's core motivation is untested** — Story 5's "So that" reads "全局默认一次设定、按项目与按 feature 精细覆盖" for a 多项目拥有者, i.e., global tier is app-level cross-project; the journey's single-project fixture never exercises a global change propagating to (or being overridden by) a second registered project — the entire three-tier model's raison d'être; -5. (b) Step 5's dispatch silently crosses into UF1/SC4 territory: every dispatch fires the 派发前产物齐全性检查 (warning + missing list when incomplete); the journey neither provisions stage artifacts nor acknowledges the warning path, so the step as written can be derailed by an unrelated gate; -4. (c) persistence durability (save → restart → retained) unverified despite the 持久化 claim; -3. |

### Cross-dimension coherence check

Scope (Story 5 + UF4 + SC5 + D3), steps, and success criteria are aligned — no scope drift; the dispatch-consumption step is legitimately in scope via Story 5 AC2. The two cross-section defects (boolean fixture, tier ambiguity) are scored once each in Internal Consistency; fixture-provisioning consequences are scored once each in Completeness (task/second-project fixtures) without double-counting. Business-rules reality check: no violation of BIZ-coexistence-001/002 (prefs live in the app kernel, not forge data), BIZ-task-ops-001 M3 revision (偏好 = human verb — consistent), BIZ-workbench-00X (no invariant touched).

---

## Phase 3 — Blindspot Hunt

**[blindspot] 1. The one user-visible PRD artifact for preference consumption is omitted in favor of the undefined channel.** UF1's Data Requirements define "预合成要素标识 | badge | 内核 | 协议/目标摘要/偏好三要素已合成(可断言)" — the only UI-rendered evidence that the dispatch chain consumed preferences. Step 5's outcome ("生效偏好反映修改后的最终生效值(断言)") leans entirely on the undefined "测试通道" while never asserting the badge a web e2e CAN observe. Add the badge-level assertion as the user-observable outcome; keep the channel read as a secondary/contract-level check. Reasoning audit flagged the observability mismatch independently of dimension scoring; Surface Fitness scored only the channel-definition gap.

**[blindspot] 2. Cross-journey demarcation for system-prompt assertions is undeclared.** "已派发 subagent 的提示词不被追溯改写;仅新派发消费新生效值" (Step 5b) and Step 5's consumption assertion overlap task-dispatch-execution-loop's Step 4b territory (三要素 prompt assertions). Neither journey declares ownership boundaries or fixture compatibility; gen-contracts will receive two overlapping prompt-content contract surfaces with independently invented fixtures (preferences-driven here, three-elements-driven there), risking duplicated or mutually inconsistent contracts. Declare demarcation (this journey owns the preference element; the dispatch journey owns composition) or reference a shared fixture.

---

## Attack List (for reviser)

1. **Internal Consistency**: unsatisfiable fixture — "已备一个布尔键(如 auto.test.quick)在三级设不同值" — a boolean has two values; switch the fixture key to an enum/numeric key (three distinct values possible) or restate the fixture as "feature 与 project 级设不同值" so Step 2's precedence proof is demonstrable.
2. **Internal Consistency**: unspecified tier in Step 5 — "修改任一层级偏好后派发一个任务" — name the tier (e.g., feature 级, consistent with Step 3's key) and scope the outcome to "派发消费当前最终生效值" so the non-winning-tier case is not a false assertion; also fixes Step 6's entry-state ambiguity.
3. **Surface Fitness**: undefined assertion channel — "派发链消费断言通道就绪(预合成系统提示词经测试通道直读)" — specify the mechanism (artifact path / IPC / debug surface) so gen-test-scripts can operationalize it.
4. **Surface Fitness**: inoperable invalid-input scenario — "修改布尔键时输入非法值" — move validation-error to a numeric or enum key, or state the control model (free-text with type coercion) the scenario presumes.
5. **Precondition Exclusivity**: dual-state bundle — "当前项目不存在 feature(或无激活项目)" — split into two variants or drop the second disjunct; with no active project the overview panel is unreachable (UF3 auto-enters the wizard) and "项目级查看与修改照常可用" is undefined.
6. **Fact Alignment**: unannotated inferences — "往返后生效值与来源标识与此前状态一致,无残留中间态" (4b) and "全局层作为兜底恒有值" (Step 6) — add `source: inferred` with reasoning basis; add the literal annotation to 3b's mapping comment (3c/5b already model the correct form).
7. **Semantic Purity**: assertion mechanics inside actions/outcomes — "经测试通道断言预合成系统提示词" / "生效偏好反映修改后的最终生效值(断言)" / "对比修改前后派发的两个 subagent 系统提示词" — restate as observations ("新派发 subagent 的预合成提示词包含修改后的偏好值"), move channel references to Setup.
8. **Completeness**: Step 5 unexecutable as provisioned — "派发一个任务" with no dispatchable-task fixture in Setup — provision a dispatchable task (and note the SC4 stage-artifact check interaction, e.g., "派发前置检查满足").
9. **Workflow Coverage**: persona's core scenario untested — "全局默认一次设定" for a 多项目拥有者 needs a second registered project to exercise global-tier cross-project propagation and per-project override isolation.
10. **Workflow Coverage**: no non-feature-tier edit scenario — Step 6 only clears project level; add a project-level (or global-level) modification step observing the cross-tier effective-value change.
11. **Completeness**: durability unverified — "保存经内核偏好 API 持久化" with no restart/reload outcome; add an edge or step asserting the value survives app restart.
12. **[blindspot]**: assert UF1's 预合成要素标识 badge as the user-visible consumption evidence instead of relying solely on the undefined channel.
13. **[blindspot]**: declare cross-journey demarcation with task-dispatch-execution-loop for system-prompt content assertions.

---

## Eval-Journey Complete (iteration 1)

**Score**: 1021/1150 (target: 975) — PASS
**Iterations Used**: 1/3
**Threshold table**: all 7 dimensions above minimum (see Verdict).
**eval-skipped**: no (document parsed successfully).
