---
feature: dsh-forge-m4
journey: project-workbench-home
iteration: 1
rubric: eval/rubrics/journey.md (1150pt, 7 dimensions)
surface: web (rules/surface-web.md)
score: 893
target: 975
status: fail (Surface Fitness below min threshold; total below target)
generated: 2026-09-30
---

# Eval-Journey Iteration 1 — project-workbench-home

**Final Score**: 893/1150 (target 975) — **NOT reached**
**Threshold**: Surface Fitness 72/150 < 90 → dimension threshold FAIL; all other dimensions pass.
**Golden Path veto**: NOT triggered (semantically verified Golden Path present; see Workflow Coverage).

Scorer context loaded: `rules/surface-web.md` (SURFACE_TYPE=web, mandatory `validation-error` + `session-expired`, strategy 50/50), all 6 files in `docs/business-rules/`, `prd/prd-user-stories.md` (Story 1 = ground truth), `prd/prd-spec.md`, `prd/prd-ui-functions.md`, proposal Key Scenarios.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

Trace of the journey's internal argument before rubric application:

1. **Story coverage trace**: Story 1 ("项目一页可见") has 3 ACs. Step 1 ↔ AC1 (startup first-screen + restore last active); Step 2 ↔ AC1 (left tree enumerates/switches all projects, no standalone list page); Step 3 ↔ AC1 (switch via tree row); Step 4 ↔ AC2 (code zone + forge file zone same page, knowledge zone no empty placeholder); Step 5 ↔ AC3 (orphan views = 0) + SC5 (zero shrink); Step 6 reinforces AC1 restore semantics + SC6 performance. **The step sequence does cover the story's workflow** — the argument is sound at the macro level.
2. **Cross-step references**: Step 6 says "恢复最后活跃项目(步骤 3 切换后的项目)" — Step 3 indeed switches the project and states "活跃项目指针切换即写", so the reference is grounded and unambiguous. Edge numbering (1b/3b/4b/6b) correctly hangs each variant on its happy step. Sound.
3. **Fact anchor spot-checks** (verified against sources): `/p/:projectId` 2026-09-27 裁决 (prd-user-stories AC1; prd-ui-functions UF1/UF2 Placement); 归档分区降透明只读、不挂会话 (UF1 States/Validation; Story 5 AC2); 路径健康角标 degraded (UF1 States `path-degraded`); error 态「明确错误 + 重试按钮」 (UF2 States `error`); 删除当前项目 → 工作台落到其余项目或空态 (UF1 Validation Rules); M2 看板不从属 feature / M3 提案板·阶段资产面板收纳 / 发起链原位保留 (prd-spec 必答② 迁移清单 #2/#3/#4/#6); 首屏 ≤2s@500 任务 (SC6, BIZ-workbench-005). All check out.
4. **Pre-identified weak seams** (scored in Phase 2): (a) the web-surface mandatory derived outcomes are only partially handled — the single mapping comment covers `network-error` (an *additional common* outcome), not the two *mandatory* ones; (b) invariant "三区容器为常驻结构" sits in unrelieved tension with Step 4b's error state; (c) risk_level "Low" vs the pointer-writing switch step; (d) a handful of unannotated soft behavioral claims ("不白屏、不静默失败" etc.).

---

## Phase 2 — Dimension Breakdown

### 1. Completeness (完整性) — 164/200 (min 120, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Metadata complete | 46/50 | |
| Steps complete with required fields | 76/80 | |
| Happy path + required derived scenarios | 42/70 | |

- **Metadata (46/50)**: name `project-workbench-home` kebab-case ✓; `risk_level: "Low"` is a valid enum value; `golden_path: true` correctly unique across the 6 sibling journeys (verified by grep). `sources` lists all three PRD files (ui-functions included, beyond minimum). Deduction: "Low" justification is borderline — see Internal Consistency (the journey mutates persistent state: "活跃项目指针切换即写").
- **Steps complete (76/80)**: 6 happy steps + 4 edge cases, every one with User Action + Expected Result (edges additionally with Precondition). Ordered, coherent sequence. Deduction: Step 4's action ("察看项目工作台页") is pure re-observation of state established in Steps 1–3 — it earns its place only because Story 1 AC2 is precisely a seeing-assertion; Steps 2/4/6 all use observational verbs ("查看/察看/巡检"), flattening action distinctness.
- **Derived scenarios (42/70)**: boundary breadth is genuinely good — empty state (Step 1b), degraded path (Step 3b), load failure with retry (Step 4b), stale active pointer (Step 6b). But the surface-web rule's **mandatory** pair (`validation-error`, `session-expired`) is entirely unaddressed — neither as outcomes nor as explicit N/A discharges. Only the *additional* `network-error` is handled ("<!-- surface-web required_outcomes 映射:network-error → 工作台数据加载失败,呈现为 error 态明确错误 + 重试入口,无数据丢失 -->"). The sibling `task-session-roundtrip/journey.md` demonstrates the intended discharge pattern for both mandatory outcomes (lines 91/117), so the mechanism was available and skipped here.

### 2. Semantic Purity (语义纯度) — 172/200 (min 120, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Natural language, no code/regex | 70/80 | |
| Preconditions declarative | 54/60 | |
| No implementation coupling in steps | 48/60 | |

- **Natural language (70/80)**: no regex, selectors, or `expect(...)`-style assertions anywhere. Deduction: test-caliber tags are embedded inside Expected Results — Step 4 "…不渲染任何空 tab/空视图/预置数据(e2e 断言)", Step 5 "(孤儿视图 = 0,全量路由归属断言)", Step 6 "(500 任务规模,性能断言口径)". The outcome text itself stays semantic, but the parentheticals leak test-strategy framing into user-observable statements.
- **Preconditions declarative (54/60)**: edge preconditions are clean states ("无任何注册项目(全新安装)", "上次活跃项目指针指向的项目已被删除"). Deduction: Setup item 1 contains a procedural instruction — "测试承载 = fixture 项目集(临时目录 + 隔离 userData,测试后清理)" — "测试后清理" is a cleanup step, not a state.
- **Implementation coupling (48/60)**: actions are user-level throughout, but outcome/precondition text repeatedly reaches for internal store and route names: Setup "app_state 存在上次活跃项目指针" (app_state is the SQLite state table, BIZ-workbench-002), Step 1 "(/p/:projectId,2026-09-27 裁决)", Step 3 "活跃项目指针切换即写". These are PRD-traceable domain facts, hence partial credit, but the journey narrates them through storage-layer vocabulary rather than user-observable terms ("恢复上次打开的项目").

### 3. Precondition Exclusivity (前置条件互斥性) — 138/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Preconditions distinct across outcomes | 56/60 | |
| Sufficient to uniquely select outcome | 46/50 | |
| No missing preconditions for boundary outcomes | 36/40 | |

- All four happy↔edge pairs are cleanly exclusive on their differing preconditions: Step 1 (≥1 project + pointer) vs 1b ("无任何注册项目"); Step 3 (healthy target) vs 3b ("路径探测失败(路径健康 degraded)"); Step 4 (load OK) vs 4b ("工作台数据加载出错(通道异常/数据缺失)"); Step 6 (pointer target alive) vs 6b ("指针指向的项目已被删除"). Given any concrete system state, exactly one variant of each pair applies.
- Minor deductions: Step 4b's trigger bundles two causes ("通道异常/数据缺失") without distinguishing whether both produce the same error rendering — a contract downstream may need them split; Step 3b does not state whether the *previous* project's zones remain or the target project's zones render degraded — the outcome asserts "切换完成" plus "不白屏" but leaves the zone-content state under-specified.

### 4. Fact Alignment (事实依据) — 104/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Factual claims traceable | 50/60 | |
| Inferred claims: rule support + `source: inferred` | 20/50 | |
| No unclassified hallucinated claims | 34/40 | |

- **Traceable (50/60)**: the traceability block ("Story 1…SC1/SC2/SC5/SC6…UF1、UF2、UF3;PRD 必答①/②…proposal Key Scenarios「项目工作台(happy)」「既有能力收纳」") checks out against all cited sources — every checked SC/UF/必答 clause exists and says what the journey claims. Remaining slippage: soft behavioral claims with no source and no marking — Step 3 "无前一项目内容残留", Step 1b "不渲染空项目树/空三区骨架", Step 3b "工作台不白屏、不静默失败" (the PRD/proposal error-path clause covers *加载失败 → 明确错误与重试*, i.e., Step 4b, not the degraded-switch case).
- **Inferred claims (20/50)**: exactly one derived-outcome annotation exists, and it cites the rule family but not the literal marker: "<!-- surface-web required_outcomes 映射:network-error → 工作台数据加载失败… -->" — no `source: inferred` anywhere in the document, and the two mandatory derivations (`validation-error`, `session-expired`) have no rule citation at all. The rubric requires both the reasoning basis and the annotation; only half of one instance qualifies.
- **Unclassified claims (34/40)**: no claim is *contradicted* by PRD/design/business rules and no error codes/messages/exit codes are invented, so no -30 hallucination instance is booked. However the unmarked failure-behavior assertions above ("不白屏、不静默失败", "无报错残留") assert specific system behavior under failure without factual trace or inference annotation — treated as weak unclassified inferences (-6), one notch below the hallucination bar because they are negative-UX expectations rather than fabricated specifics.

### 5. Surface Fitness (Surface 适配) — 72/150 (min 90, **FAIL**)

| Sub-criterion | Score | Notes |
|---|---|---|
| Mandatory derived outcomes present | **0/60** | rubric floor rule applied |
| Test strategy proportions (50/50) | 38/50 | |
| Realistic web/e2e assumptions | 34/40 | |

- **Mandatory outcomes (0/60)**: surface-web.md declares "Mandatory derived Outcomes (must be considered for every Web Journey): validation-error… session-expired…". Both are completely absent from this journey — no outcome, no mapping comment, no N/A justification. The only required_outcomes trace is the non-mandatory `network-error`. The rubric instructs "Score 0 if mandatory Outcomes are completely absent", and the floor rule is applied. This is decisive for the dimension: even the most charitable read of the journey (read-only browse, no forms, desktop app with no auth session) required an *explicit* consideration note — the sibling `task-session-roundtrip/journey.md` shows the house pattern ("validation-error → 本旅程无表单输入面,映射为未挂接/目标缺失的错误态呈现(no-link / open-failed)"; "session-expired → 宿主/会话通道不可用使打开动作失败…"), so silence here is a generation miss, not a convention gap.
- **Strategy proportions (38/50)**: 6 journey-level steps (full rendering pipeline, restart persistence — Journey-smoke material) vs 4 tightly-preconditioned boundary cases plus per-step interaction-level expectations (Contract material) — a defensible 50/50 reflection. Deduction: nothing in the document states or brackets the balance, and edge depth is uniform single-scenario (no multi-condition matrices) which tilts Journey-heavy.
- **Environment realism (34/40)**: Setup is genuinely web-e2e-realistic — "fixture 项目集(临时目录 + 隔离 userData,测试后清理)", timing at scale ("首屏 ≤2s 在 500 任务规模下计测"), element-count style assertions ("空 tab/空视图/预置数据元素计数为 0"), matching PRD Test Pipeline (Playwright, web surface). Deduction: "孤儿视图 0 = 应用内全量路由归属断言" is an app-internal route enumeration — a system-level invariant better left to the contract layer than embedded in a journey Setup.

### 6. Internal Consistency (一致性) — 121/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Invariants hold in every step | 50/60 | |
| Cross-step references consistent | 43/50 | |
| Risk level consistent with content | 28/40 | |

- **Invariants (50/60)**: "孤儿视图恒 0", "知识区…不渲染任何空 tab", "归档…不挂会话" hold across all steps including edges (Step 1b's "不渲染空项目树/空三区骨架" actively reinforces invariant 2). Violation-adjacent tension: invariant 5 — "代码区与 forge 文件区同页可见性在项目切换与重启之间保持(三区容器为常驻结构)" — is contradicted-by-omission in Step 4b, where the page renders "明确错误 + 重试按钮(error 态)" and the zones are *not* visible; Step 3b (degraded) likewise never affirms zone visibility. The invariant lacks an error/degraded carve-out, so as literally written it fails in the very edge cases the journey itself declares. Scored as a partial violation (-10), not the full -40, because the intent ("常驻结构" across *successful* switches and restarts) is recoverable and no happy step violates it.
- **Cross-step references (43/50)**: the one explicit reference ("步骤 3 切换后的项目") is sound (Step 3 writes the pointer). Deductions: Overview promises "forge 文件区(feature/提案/管线入口)" but Step 4's Expected Result enumerates "提案/feature/任务" and no step ever exercises 管线入口 (nav placeholder) — a dangling promise; Step 5's action "依次打开提案板、feature/任务浏览、任务看板等既有 forge 视图" covers 阶段资产面板 only via the "等" hand-wave while its Expected Result asserts that panel's zero-shrink ("M3 提案板/阶段资产面板收纳进 forge 文件区后功能面完整可用(零缩水)") — the assertion outruns the action that would verify it.
- **Risk level (28/40)**: "Low = read-only or purely observational" (template's own criteria comment), yet Step 3 performs a persistent state mutation — "活跃项目指针切换即写" — whose effect survives restart (Step 6 verifies it). "Medium = multi-step interaction without irreversible side effects" describes this journey more precisely. Low is defensible only under a charitable "dominant mode is observation" reading; the pointer write makes "purely observational" factually false.

### 7. Workflow Coverage (工作流覆盖度) — 122/150 (min 90, PASS; veto NOT triggered)

| Sub-criterion | Score | Notes |
|---|---|---|
| Golden Path existence (veto) | 55/60 | semantically verified |
| Multi-step coverage depth | 35/50 | |
| Completeness vs PRD scope | 32/40 | |

- **Golden Path (55/60)**: `golden_path: true`, 6 contiguous steps ≥3, and semantic verification passes: the sequence maps 1:1 onto Story 1's ACs (see Phase 1 audit), every step uses domain terminology (项目树/三区容器/forge 文件区/孤儿视图/归档分区), zero API-level descriptions — no veto, no per-step -15. It is the feature's designated Golden Path and the only `golden_path: true` among the six journeys. Deduction: Step 4 (action: "察看") is a verification-only step in the golden-path anti-pattern's sense; it is excusable here only because Story 1's AC2 is itself a seeing-assertion.
- **Depth (35/50)**: state variation exists (switch + restart persistence + empty/degraded/error/stale-pointer), but there is no entity-lifecycle or cross-entity state machine work in this journey (no add/archive/restore/delete of projects; no session-tree interaction). Deliberate delegation to sibling journeys (project-registration-projection, project-lifecycle-projection, task-session-roundtrip) keeps this journey narrow — legitimate for a read-only browse journey, hence mid-band rather than low.
- **PRD-scope completeness (32/40)**: Story 1 is fully covered; no primary workflow inside this journey's stated scope (startup → workbench → tree switch → three-zone view → orphan-zero → restart) is missing. Listed gaps (all auxiliary, siblings exist): UF1's 区头「＋」添加项目入口 and 归档行恢复/删除菜单 are untouched even by reference; proposal's 零缩水 companion clause "操作路径不长于现状" is not asserted anywhere in Step 5's inspection.

---

## Deduction Log

| # | Dimension | Rule / ground | Deduction | Evidence quote |
|---|---|---|---|---|
| D1 | Surface Fitness | Mandatory web outcomes (`validation-error`, `session-expired`) completely absent → sub-criterion floor 0 | -60 (sub 0/60) | only mapping in doc: "surface-web required_outcomes 映射:network-error → 工作台数据加载失败…" |
| D2 | Completeness | Same absence mirrored in "required derived scenarios" | -28 (sub 42/70) | (as D1) |
| D3 | Fact Alignment | Inferred-claim annotations: rule citation present for 1 of 3+ derived cases; no `source: inferred` marker anywhere | -30 (sub 20/50) | "<!-- surface-web required_outcomes 映射:network-error → … -->" (sole instance) |
| D4 | Fact Alignment | Unclassified soft behavioral claims (failure-mode assertions without trace/marking) | -6 (sub 34/40) | "工作台不白屏、不静默失败"(3b);"无前一项目内容残留"(3);"不渲染空项目树/空三区骨架;无报错"(1b) |
| D5 | Internal Consistency | Invariant lacks error/degraded carve-out; fails by omission in journey's own edge cases (partial violation) | -10 (sub 50/60) | invariant "三区容器为常驻结构" vs 4b "明确错误 + 重试按钮(error 态)" |
| D6 | Internal Consistency | risk_level Low inconsistent with persistent state mutation | -12 (sub 28/40) | "活跃项目指针切换即写"(Step 3) |
| D7 | Semantic Purity | Test-caliber tags embedded in Expected Results | -10 (sub 70/80) | "…不渲染任何空 tab/空视图/预置数据(e2e 断言)" |
| D8 | Semantic Purity | Procedural fragment in Setup preconditions | -6 (sub 54/60) | "临时目录 + 隔离 userData,测试后清理" |
| D9 | Semantic Purity | Storage-layer vocabulary in outcomes/preconditions | -12 (sub 48/60) | "app_state 存在上次活跃项目指针"; "活跃项目指针切换即写" |
| D10 | Completeness | Verification-only step inside happy path; action distinctness flattened | -4 (sub 76/80) | "**User Action**: 察看项目工作台页"(Step 4) |
| D11 | Internal Consistency | Overview↔Step 4 forge-文件区 enumeration mismatch; 管线入口 dangling; Step 5 action/expected mismatch ("等" vs 阶段资产面板零缩水断言) | -7 (sub 43/50) | Overview "forge 文件区(feature/提案/管线入口)" vs Step 4 "(右栏项目概览子 tab:提案/feature/任务)" |
| D12 | Precondition Exclusivity | 4b bundles two triggers undifferentiated; 3b zone-state under-specified | -14 (spread) | "(通道异常/数据缺失)" |
| D13 | Workflow Coverage | Golden path contains a verification-only step; depth lacks lifecycle (delegated) | -5 / -15 / -8 | "察看项目工作台页";(delegation note) |

No Golden Path veto. No -25 surface-type violations (assertions are all browser-appropriate). No -40 full invariant violations booked (D5 partial). No -30 hallucination instances booked (D4 kept below that bar with rationale above).

---

## Threshold Pass/Fail Table

| Dimension | Score | Min | Status |
|---|---|---|---|
| 1. Completeness | 164/200 | 120 | PASS |
| 2. Semantic Purity | 172/200 | 120 | PASS |
| 3. Precondition Exclusivity | 138/150 | 90 | PASS |
| 4. Fact Alignment | 104/150 | 90 | PASS |
| 5. Surface Fitness | **72/150** | 90 | **FAIL** |
| 6. Internal Consistency | 121/150 | 90 | PASS |
| 7. Workflow Coverage | 122/150 | 90 | PASS |
| **Total** | **893/1150** | **975** | **FAIL** |

---

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. **[blindspot] Route-enumeration assertion belongs downstream.** Setup bakes "孤儿视图 0 = 应用内全量路由归属断言(任何 forge 视图均处于项目上下文)" into the journey; a full-route-ownership sweep is a Contract/test-harness concern, and gen-contracts works in semantic descriptors. The invariant's semantic form ("任何 forge 视图入口均处于项目上下文") is already the right journey-level statement — keep that, move the enumeration caliber to the contract layer, else downstream docs will inherit an unparseable assertion.
2. **[blindspot] "视图切换不劣于重构前" has no baseline harness.** The invariant "首屏 ≤2s(500 任务规模),视图切换不劣于重构前" and Step 6's timing assertion are only testable against a captured pre-refactor baseline; neither Setup nor any step defines where that baseline comes from. Without it, SC6's second clause silently degrades to untestable.
3. **[blindspot] Proposal's 零缩水 companion clause dropped.** proposal Key Scenario「既有能力收纳」pairs functional availability with "操作路径不长于现状" — Step 5 asserts only "功能面完整可用(零缩水)". Reachability/depth non-regression is part of the cited source's scenario and is absent.
4. **[blindspot] Overlap with sibling journey not cross-referenced.** Step 6b ("上次活跃项目指针指向的项目已被删除…首屏落到其余项目或空态") duplicates project-lifecycle-projection Step 5b (delete active project → "工作台落到其余项目或空态,不指向已删 id"). Legitimate coverage from two directions, but with no cross-reference the two copies will drift independently under revision.
5. **[blindspot] Single-instance lock discipline absent from Setup.** Repo testing memory makes full e2e precondition of checking active dsh-forge instances explicit (ERR_SINGLE_INSTANCE risk); the Setup specifies userData isolation but not the instance-check step, which matters for a journey whose Step 1/6 launch the real shell twice.
6. **[blindspot] Business-rule resonance unexploited.** BIZ-workbench-005's other时效 baselines (看板可见 ≤5s, 一键发起 ≤3s) bound this same workbench surface; the journey cites only 首屏 ≤2s. At least the ≤5s board-visibility budget is relevant to Step 5's board-opening inspection and its omission narrows the acceptance surface below the rule set.

---

## Revision Priorities (for reviser)

1. **Surface Fitness (blocking)**: add explicit required_outcomes discharges for `validation-error` and `session-expired` — either mapped N/A notes in the task-session-roundtrip house style (this journey has no form face; desktop shell has no auth session → nearest analogue = Step 4b channel failure / host unavailable) or a dedicated edge case. Add literal `source: inferred` markers to every derived-outcome comment.
2. **Internal Consistency**: qualify invariant 5 with an error/degraded carve-out ("除 error/降级态外"); reconcile Overview's forge-文件区 enumeration with Step 4; make Step 5's User Action explicitly open 阶段资产面板 (drop the "等"); consider risk_level Medium or justify Low against the pointer write.
3. **Fact Alignment**: mark or ground the four soft claims (D4 quotes).
4. **Semantic Purity**: move "(e2e 断言)" tags out of Expected Results into Setup's 断言口径 block; rephrase app_state references user-observably.
