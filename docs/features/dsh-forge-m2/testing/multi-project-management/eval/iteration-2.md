# Eval Report: journey/multi-project-management — Iteration 2

- **Evaluator**: Scorer (adversarial), Senior QA Engineer persona
- **Date**: 2026-09-23
- **Document**: `docs/features/dsh-forge-m2/testing/multi-project-management/journey.md` (REVISED since iteration 1)
- **Rubric**: `eval/rubrics/journey.md` (1150 pts, target 975, per-dimension thresholds)
- **Surface**: web (`gen-journeys/rules/surface-web.md`)
- **Iteration**: 2 (previous: `eval/iteration-1.md`, total 855/1150, FAIL)
- **Verdict**: **PASS** — Total 1097/1150 (≥ 975) AND every dimension ≥ threshold

| Dimension | Score | Threshold | Status | Δ vs iter-1 |
|-----------|-------|-----------|--------|-------------|
| 1. Completeness | 190/200 | 120 | PASS | +30 |
| 2. Semantic Purity | 195/200 | 120 | PASS | +12 |
| 3. Precondition Exclusivity | 144/150 | 90 | PASS | +39 |
| 4. Fact Alignment | 145/150 | 90 | PASS | +83 |
| 5. Surface Fitness | 144/150 | 90 | PASS | +47 |
| 6. Internal Consistency | 142/150 | 90 | PASS | +14 |
| 7. Workflow Coverage | 137/150 | 90 | PASS | +17 |
| **Total** | **1097/1150** | **975** | **PASS** | +242 |

---

## Iteration-1 Attack Resolution Audit (claimed vs actual)

All 9 attacks from iteration 1 were re-checked against the revised text, with artifact-level verification of every citation the reviser added:

| # | Iteration-1 attack | Status | Evidence in revised doc / repo |
|---|--------------------|--------|-------------------------------|
| 1 | Inferred outcomes unannotated (old 4b/5b/6b) | **RESOLVED** | `source: inferred` comments on Step 2c (cites tech-design ERR_PROJECT_EXISTS — verified at `design/tech-design.md:259`, near-verbatim), Step 4b (cites UF4 validation rule — verified at `prd-ui-functions.md:216`), Step 5b (cites tasks 裁决 + e2e sc5 — verified at `apps/desktop/e2e/tests/m2/sc5-multi-project.spec.ts:289-312` and `tasks/records/2.2` "removeProject clears the app_state active pointer", `2.7` "removeProject of the active project -> retarget(null)") |
| 2 | Unclassified disjunctive claim (old 6b "提示已注册或复用既有注册项") | **RESOLVED** | Step 2c commits to one deterministic behavior: "提示该代码根目录已注册并定位既有项目卡片,注册不重复落库" |
| 3 | 2b/3b precondition overlap (missing ≠ code root) | **RESOLVED** | Step 3c precondition: "仓外本地路径,且 ≠ 代码根目录(与代码根目录相同的情形归 Step 3b)" |
| 4 | Remove-active fork on unstated state | **RESOLVED** | Split into Step 5b (剩余 ≥1) and Step 5c (仅剩 1), each with distinct precondition and distinct expected result |
| 5 | session-expired undispositioned; no mapping comments | **RESOLVED** | Mapping comments at Step 2b (validation-error, two named instances) and Step 4b (session-expired → offline no-port model, channel-invalidation analogue) |
| 6 | No fixture isolation / no cross-surface assertion channel | **RESOLVED** | Setup: "一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理" + "跨面断言口径:「项目仓内文件与 forge 数据不被改动」= 测试进程对项目目录做操作前/后文件树快照对拍;注册/激活态 = 工作台状态读数对拍" — matches the landed e2e practice (hashTree/assertTreesIdentical + bridge getState in sc5 spec) |
| 7 | Edge numbering drift (old 5b/6b) | **RESOLVED** | 2b/2c ↔ Step 2, 3b/3c ↔ Step 3, 4b ↔ Step 4, 5b/5c ↔ Step 5 — every edge now a variant of its base step |
| 8 | "或"-forked action (old 3b) | **RESOLVED** | Step 3c action is single: "查看授权提示并勾选确认授权"; the default-仓内 observation moved to Expected Result as a grounded assertion (Story 6 AC3) |
| 9 | UF1 显示名 unexercised | **PARTIALLY RESOLVED — claimed-but-unresolved deferral** | Default now asserted in Step 3 ("以代码根目录名作为默认显示名进入项目列表") ✓; BUT the 覆盖说明 defers editing to "UF1 编辑模式/重指向腿衔接(feature-board-docs-browsing journey)" — that journey contains NO edit-mode/repoint/display-name leg (verified: its steps are feature-board browsing + 仓外 registration + rendering; grep across all six journey files shows 重指向/编辑模式 appear only in this journey's deferral note). Charged as a new deduction under Internal Consistency |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Chain check**: problem (multi-project owner registers/switches/removes) → solution (wizard → switch → remove, 7 edges) → evidence (PRD Traceability: Story 5/G5/UF1/SC5 — all verified to exist; added artifact citations verified genuine, none fabricated) → success criteria (Step 3/4/5 expected results map one-to-one onto Story 5's three ACs). The journey does exercise the user story it claims; the happy path state chain (1 active → register+activate 2nd → switch back → remove 2nd) is coherent with no contradictions.

**Pre-score anchors recorded before rubric scoring**:

1. **Annotation citations are real, not decorative.** All three `source: inferred` bases and both surface-mapping comments were independently verified against repo artifacts (tech-design.md:259, sc5 e2e spec, tasks records 2.2/2.7, UF4 rule, UF1 States). This is the single largest fix vs iteration 1 and it holds.
2. **One dangling cross-journey pointer.** The 覆盖说明's deferral names a journey that does not own the deferred leg (attack 9's resolution vehicle is fictional).
3. **One residual compound-state ambiguity**: registered-but-no-forge-data path satisfies both 2b and 2c preconditions with divergent outcomes; the implementation resolves precedence (detection precedes UNIQUE per tasks/records/2.4) but the journey does not.
4. **One observation-locus gap**: Step 4b's action (switcher selection) and expected result (项目卡片失联提示) do not state where the observable lives; the grounded e2e channel shows the lost card on the overview tab without switcher selection.
5. **Fixture-content distinctness unspecified** (Setup defines two projects but not that their data must be distinguishable — a vacuous-switch risk for Step 4). Recorded for blindspot phase.
6. No invariant violations found; 单激活/三分模型/移除-only-registry hold across all 12 scenarios; risk High remains justified (irreversible registration deletion + data-safety invariants under test).

---

## Phase 2 — Rubric Scoring (verification stance)

### 1. Completeness — 190/200

**Metadata (50/50)**: `journey: "multi-project-management"` kebab-case; `risk_level: "High"` valid and justified (irreversible removal of registration + filesystem-safety invariants); frontmatter complete (feature/journey/risk/golden_path/surfaces/keys/sources incl. prd-ui-functions.md/generated).

**Steps complete with required fields (73/80)**: Every scenario has User Action + Expected Result; sequence coherent; assertion channels cross-referenced ("校验通道见 Setup", "状态读数见 Setup"). Deductions:
- Step 4b observation locus unspecified (-4): action is "打开项目切换器并选择该项目" but the expected result's observable — "该项目卡片呈现明确的失联/不可访问提示与重新指向/移除引导" — does not say which surface the card appears on after a (presumably failed) switcher selection. The cited e2e channel observes the lost card on the 概览 tab (`[data-dsh-forge-overview-lost]`) without switcher selection; a downstream agent must guess where to assert.
- Step 3's persistence claim is only in-session verifiable (-3): "项目三分信息持久化为工作台自有状态(状态读数见 Setup)" — the defined channel (工作台状态读数对拍) proves registered DB state, not persistence across restart; no restart/reload leg exists. Small but real for a claim whose word is "持久化".

**Outcomes cover happy path + required derived scenarios (67/70)**: validation-error mapped with named instances; session-expired dispositioned with reasoning; loading-state covered (Step 2 "显示扫描中 loading 指示" ← UF1 States); destructive boundaries split cleanly (5b/5c); duplicate registration (2c) with artifact basis. Deduction:
- Wizard cancel/abandonment still absent (-3): the wizard demonstrably gates steps ("停留在步骤 ①,不得进入步骤 ②") yet no edge covers abandoning mid-wizard or partial-registration leakage. Not surface-mandated, hence minor — but a classic multi-step-form partial-state bug left untested.

### 2. Semantic Purity — 195/200

**Natural language, no code/regex (78/80)**: No regex, selectors, or assertion calls anywhere; iteration-1's "正确处理"/"系统明确处理" non-observables are gone. Minor: "注册不重复落库" and "激活指针置空" carry storage/DB vocabulary into expected results (-2 here; see coupling below for the balance).

**Declarative preconditions (60/60)**: All preconditions are state descriptions — "所选代码根目录下未检出 forge 数据(无 `.forge`/`docs/features`)", "待移除项目是当前激活项目,且移除后剩余注册项目 ≥1", "注册项目仅剩 1 个(即当前激活项目)". Zero procedural setup leaked.

**No implementation coupling (57/60)**: Steps are user-level throughout. Deduction: Step 5b's "注册信息删除,激活指针置空" and Step 2c's "不重复落库" express outcomes in storage-model terms; 5b does pair the pointer language with its user-observable consequence ("任务/feature 等项目域页面呈现选择/注册引导"), keeping this mild (-3).

### 3. Precondition Exclusivity — 144/150

**Distinct across outcomes (60/60)**: No two edges share identical or semantically equivalent preconditions. The old 2b/3b overlap is eliminated ("且 ≠ 代码根目录"); 5b/5c are cleanly separated by remaining-count.

**Sufficient to uniquely select (44/50)**: One residual compound state (-6): a code root that is already registered AND whose forge data was later deleted satisfies both "所选代码根目录下未检出 forge 数据(无 `.forge`/`docs/features`)" (2b) and "向导步骤 ① 选定的代码根目录已被注册为项目" (2c) simultaneously — with divergent expected results (2b: "停留在步骤 ①,不得进入步骤 ②" with init guidance; 2c: "提示该代码根目录已注册并定位既有项目卡片"). The implementation resolves precedence (tasks/records/2.4: forge 检出 precedes repos 落库, ERR_PROJECT_EXISTS mapped from UNIQUE at the end of the chain), but the journey neither states 2c assumes detection passing nor specifies which failure wins. A test-writer hitting the compound state cannot derive the expected outcome from the document.

**Missing preconditions for error/boundary outcomes (40/40)**: All seven edges state their triggers, including the previously-missing remaining-count condition (5b/5c).

### 4. Fact Alignment — 145/150

**Factual claims traceable (57/60)**: Verified exhaustively against PRD/UF1/tech-design/e2e/tasks records — every previously-unverified claim is now grounded or annotated:
- Step 1 ← UF1 flow 1; Step 2 ← UF1 flow 2 + States loading; Step 3 ← Story 5 AC1 + UF1 flow 4 + UF1 Data (显示名目录名默认); Step 4 ← Story 5 AC2 (verbatim); Step 5 ← Story 5 AC3 + UF1 validation rule (near-verbatim)
- 2b ← prd-spec 异常流; 3b ← UF1 validation; 3c ← UF1 description + Story 6 AC3; 5c ← UF1 States empty ("首次使用/全部移除")
- 2c ← tech-design.md:259 ERR_PROJECT_EXISTS row (verified near-verbatim); 5b ← e2e sc5 (verified: "移除 ACTIVE 的 A:指针清空(非迁移)→ 项目域页呈现引导卡", sc5 spec lines 304-312) + records 2.2/2.7; 4b ← UF4 rule (verified) + e2e 失联卡 (verified `[data-dsh-forge-overview-lost]`)
Deduction: 5b's "工作台不残留已移除项目的看板/挂接数据" extends past its cited evidence (-3) — the sc5 e2e asserts registry rows cleared and gate cards shown, not 挂接(session-link)非残留; that clause is repo-groundable (FK CASCADE per records 2.2) but is cited nowhere.

**Inferred claims annotated with rule/basis support (48/50)**: All three inferred edges carry `source: inferred` with named bases, and every basis checks out against the artifact it names — no decorative citations. Deduction: the 5b residue clause above sits outside its annotation's umbrella (-2).

**No hallucinated unclassified claims (40/40)**: None found. Every behavioral assertion is PRD-traceable, artifact-cited, or under an inference annotation. The iteration-1 -30 hallucination instance is eliminated.

### 5. Surface Fitness — 144/150

**Mandatory derived outcomes (58/60)**: Both web-mandated outcomes handled per family convention — validation-error: "<!-- surface-web required_outcomes 映射:validation-error → 向导输入校验失败 = 本边与 Step 3b(仓外路径冲突)两处实例;错误文案 + 修正引导、停留当前步骤 -->"; session-expired: "<!-- ... session-expired → 本旅程为离线桌面应用(继承 M1 无端口模型),无字面会话过期面;通道失效类比 = 已注册项目数据通道(路径)失效 = 本边 -->" with a substantive analogue edge (4b) behind it. loading-state additionally covered in Step 2. Minor (-2): the mapping names two validation-error instances but omits 2c (duplicate registration is a third validation-family instance at the same submit boundary).

**Test strategy proportions 50/50 (48/50)**: 12 scenarios (5 happy + 7 edge) with per-step granularity suitable for Contract extraction and a coherent end-to-end spine; edge depth now includes state-read channels. Minor (-2): a few assertions stop at PRD-verbatim phrasing where siblings operationalize comparable claims (contrast task-board-browsing's "首屏 ≤2 秒(计时口径 = ... 连续 3 次取中位数——已落地 sc1 e2e 口径)" vs this journey's un-enumerated "完整切换").

**Environment realism (38/40)**: Fixture isolation and cross-surface assertion channels now match landed e2e practice exactly (tree-hash before/after + bridge state reads; DSH_FORGE_USER_DATA isolation implied by "隔离 userData"). The wizard's path entry is a text input in the real implementation, so "选择代码根目录" is automatable without native-dialog handling. Minor (-2): no restart leg for the persistence claim (see Completeness).

### 6. Internal Consistency — 142/150

**Invariants hold in every step (60/60)**: 单激活 verified through activation (Step 3), switch (Step 4), pointer-clearing removals (5b/5c); 移除-only-registry now operationalized via the Setup snapshot channel at Step 5 and 5c ("校验通道见 Setup"); 三分模型 referenced consistently. Iteration-1's "verifiability assumed but never operationalized" is fixed.

**Cross-step references consistent (42/50)**: Intra-journey references all resolve; edge numbering convention fully repaired. NEW deduction (-8): the 覆盖说明's cross-journey deferral is dangling — "显示名编辑与 ≤20 注册项目规模边界...前者随 UF1 编辑模式/重指向腿衔接(feature-board-docs-browsing journey)" — but feature-board-docs-browsing/journey.md contains no edit-mode, repoint, or display-name leg (its five steps are feature-board browsing, 仓外 registration, rendering; its only repoint mention is the guidance display in Step 2b's expected result). This was attack 9's resolution vehicle, and it points at a leg that does not exist anywhere in the journey family (grep-verified). A claimed-but-unresolved fix.

**Risk level consistent (40/40)**: High matches irreversible registration deletion plus filesystem-safety invariants under assertion.

### 7. Workflow Coverage — 137/150

**Golden Path existence — veto item (56/60)**: NOT triggered. Contiguous 5-step Happy Path (进入注册向导 → 选根目录并检出 → 选文档位置并完成 → 切换 → 移除) maps one-to-one onto Story 5's three ACs plus UF1 flow, in domain-level operations. Residual (-4): Step 1 remains borderline navigation-only within the ≤3-step registration AC, and the frontmatter still leaves this journey's qualifying sequence unmarked (`golden_path: false` with the family designation held elsewhere — accepted at feature level in iteration 1, unchanged).

**Multi-step coverage depth (44/50)**: Registration lifecycle create → use → delete; activation-pointer handling split by boundary (5b/5c); duplicate registration (2c) proving UNIQUE semantics; path invalidation (4b); authorization gating (3c); loading state (Step 2). Missing (-6): re-register-after-removal (would prove registry cleanup end-to-end), cancel-mid-wizard, and repoint/edit — the last is the deferred leg whose deferral target is broken (charged in IC; here charged for the coverage itself remaining absent).

**Workflow completeness against PRD scope (37/40)**: Story 5 fully covered; UF1 display-name default now asserted; ≤20 scale boundary explicitly dispositioned to a performance leg ("后者属性能验收腿" — reasonable disposition). Deduction (-3): UF1's edit/repoint workflow (updateProject repoint — real per tech-design Interface 1, exercised by the sc5 e2e repoint leg) now has NO owner anywhere in the journey family after this journey's deferral pointed at a journey that doesn't carry it.

### Cross-dimension coherence check

The revision is coherent: the annotation/disposition discipline fix lifts Fact Alignment (+83), Surface Fitness (+47), and Exclusivity (+39) simultaneously, exactly the systemic defect iteration 1 diagnosed. The two residual defect clusters are (a) one dangling cross-journey reference (IC -8 / WC -3, charged on distinct axes: false reference vs unowned workflow) and (b) executability micro-gaps (4b locus, 2b/2c compound state, restart leg) charged once each in their home dimensions. No double-counting found; no dimension contradicts another; no dimension is below threshold.

---

## Phase 3 — Blindspot Hunt ([blindspot] — outside all rubric dimensions)

1. **[blindspot] Fixture distinctness is unspecified — Step 4 can pass vacuously.** Quote: "存在第二个可注册的 forge 项目路径(含 `.forge`/`docs/features` 等 forge 数据)". Setup never requires the two projects' data to be *distinguishable*. If a downstream agent registers two structurally identical fixtures, "看板/feature/挂接数据完整切换到目标项目" cannot fail — the switch assertion becomes vacuous. The landed e2e solves this with distinct seeds/counts (setA 14 tasks vs setB 15/11) and asserts count flips; the journey should require distinguishable content (e.g., 不同任务数/feature slug) as a fixture property. Outside rubric dimensions (test-data design, not document structure).

2. **[blindspot] "完整" remains unenumerated (re-raise, softer: PRD-inherited).** Quote: "看板/feature/挂接数据完整切换到目标项目(单激活)". The phrase is verbatim from Story 5 AC2, so Fact Alignment is clean — but the repo's own e2e enumerates the checklist (dock 关、过滤清、feature 列表换、无跨项目徽标, sc5 spec lines 275-286). Citing that enumeration as the assertion口径 (the way task-board-browsing cites its timing protocol) would make the step executable without negotiation. Persists from iteration-1 blindspot 3.

3. **[blindspot] Wizard abandonment still untested (re-raise).** Quote: "停留在步骤 ①,不得进入步骤 ②". The wizard demonstrably has step gating, yet no edge covers abandoning after a validated step ① (partial-registration leakage, resume position on re-entry). PRD is silent on cancel, so no rubric dimension can flag it; persists from iteration-1 blindspot 2.

4. **[blindspot] Repoint recovery is displayed but never exercised.** Quote: "该项目卡片呈现明确的失联/不可访问提示与重新指向/移除引导" (4b). The recovery affordance is asserted as visible, but no journey in the family executes a code-root repoint recovery (the sc5 e2e exercises repoint for 仓外-docs loss only). Combined with the dangling deferral (IC deduction), the recovery workflow is asserted-then-abandoned across the whole family. 

---

## Attacks Summary (for reviser, if another iteration runs)

1. **[Internal Consistency]** Deferral points at a nonexistent leg — "前者随 UF1 编辑模式/重指向腿衔接(feature-board-docs-browsing journey)" — the named journey has no edit-mode/repoint/display-name leg (grep-verified across all six journeys). Fix: own the leg in this journey, name the real owner, or mark it explicitly unowned.
2. **[Precondition Exclusivity]** 2b/2c compound state unresolved — "向导步骤 ① 选定的代码根目录已被注册为项目" does not exclude the forge-data-deleted state, which also matches 2b ("无 `.forge`/`docs/features`") with a divergent expected result. Fix: state that 2c assumes detection passing, or specify precedence.
3. **[Completeness]** 4b observation locus unstated — action "打开项目切换器并选择该项目" vs expected "该项目卡片呈现明确的失联/不可访问提示" — which surface carries the card after a failed selection is unspecified; the cited e2e observes it on the 概览 tab without switcher selection.
4. **[Fact Alignment]** 5b residue clause beyond cited evidence — "工作台不残留已移除项目的看板/挂接数据" — sc5 asserts registry rows + gate cards, not 挂接非残留; cite the FK CASCADE basis (records 2.2) or scope the clause to asserted observables.
5. **[Semantic Purity]** Storage vocabulary in expected results — "注册信息删除,激活指针置空" / "注册不重复落库" — prefer user-observable phrasing with the state-read channel as verification note.
6. **[Workflow Coverage]** UF1 edit/repoint workflow unowned family-wide — tech-design Interface 1 defines updateProject repoint and the sc5 e2e exercises it, but after this journey's deferral no journey claims the leg.
7. **[Completeness, minor]** No restart leg behind "项目三分信息持久化为工作台自有状态(状态读数见 Setup)" — in-session state reads don't prove the word "持久化".
8. **[Surface Fitness, minor]** validation-error mapping omits 2c as an instance — "validation-error → ...本边与 Step 3b(仓外路径冲突)两处实例" — duplicate registration is a third validation-family instance at the same submit boundary.

---

## Pass/Fail

**PASS** — Total 1097/1150 ≥ 975; all dimensions above threshold (lowest: Workflow Coverage 137/150 vs 90). All 9 iteration-1 attacks addressed (8 fully resolved and artifact-verified, 1 partially resolved with a dangling deferral that is now on record). Remaining findings are quality refinements, not threshold risks.
