# Eval-Contract Report — feature-board-docs-browsing (Iteration 2)

**Scorer**: Senior QA Engineer (adversarial) · **Date**: 2026-09-23 · **ITERATION**: 2

**Scope scored**: `contracts/step-1-open-feature-board.md` … `step-5-external-docs-consistent-rendering.md` (5 files, 11 Outcomes total)
**Reference inputs**: surface-web rule, `design/page-map.md` (handbook), `ui/ui-design.md` (UF4 sections), `.forge/fact-table.json` (FT-001..FT-056), parent `journey.md` (read-only)

---

## Final Score

**1076 / 1100** (target: 935) — **PASS**

| Check | Result |
|---|---|
| Total ≥ 935 | YES (1076) |
| Every dimension ≥ threshold | YES (lowest: Fixture Specification 96 ≥ 60) |

### Dimension Breakdown

| Dimension | Score | Max | Threshold | Pass |
|---|---|---|---|---|
| 1. Completeness | 150 | 150 | 90 | PASS |
| 2. Semantic Purity | 192 | 200 | 120 | PASS |
| 3. Precondition Exclusivity | 150 | 150 | 90 | PASS |
| 4. Fact Alignment | 141 | 150 | 90 | PASS |
| 5. Surface Fitness | 98 | 100 | 60 | PASS |
| 6. Internal Consistency | 149 | 150 | 90 | PASS |
| 7. Anchor Integrity | 100 | 100 | 60 | PASS |
| 8. Fixture Specification | 96 | 100 | 60 | PASS |
| **Total** | **1076** | **1100** | 935 | **PASS** |

### Score Progression

| Iteration | Score | Delta |
|---|---|---|
| 1 | 885 | — |
| 2 | 1076 | +191 |

---

## Iteration-1 Issue Disposition (verified in current text)

| Iteration-1 finding | Status | Evidence in revision |
|---|---|---|
| Step 1 Task entity missing (veto) | **RESOLVED** | Task `min_count: 3`, belongs_to Feature, constraint "completed 样板名下任务全部 completed(计数全满);in-progress 样板名下 completed 与 pending 并存(计数部分完成)" — count assertions now materializable |
| Step 4 Feature entity missing (veto) | **RESOLVED** | Feature min_count 1 with slug constraint "与仓外 docs 树内 feature 目录名一致(注册后列表对拍锚点)" + docKinds "五类齐备(实体宿主 = 仓外树)" |
| Zero FT anchors family-wide | **RESOLVED** | FT-006/030/034/036/047/051/053/054 inline; every id verified to exist in fact table and to support its claim (spot-checks below) |
| Oracle channels leaked into Outputs | **RESOLVED** | Outputs now pointer-only ("对拍口径见 state_requirements"); mechanics live exclusively in `fixture_spec.state_requirements` |
| Procedural Setup in Preconditions | **RESOLVED** | Moved to state_requirement "承载口径:一次性 fixture(临时目录 + 隔离 userData,测试后清理);跑腿前探测本机无活跃 dsh-forge 实例(单实例锁,FT-006)" |
| Implementation coupling in State values | **RESOLVED** | Schema columns/IPC verb/component identity quarantined in state_requirements marked "(仅供对拍,不入行为断言)"; State values restated behaviorally |
| "缺可选文档类" not instantiable | **RESOLVED** | "in-progress 缺 ui 类(单类缺席实例,可确定实例化)" — concrete kind named in Steps 1 & 2 |
| Step 1 union Project min_count 1 under-declared | **RESOLVED** | Union Project min_count 2 with rationale comment covering empty-state + loading "切换项目" variants |
| [blindspot] 仓外角标 no design anchor | **RESOLVED** | Output cites "设计源 = ui-design UF4 Data Mapping:仓外角标 = 文档位置来源,工作台自有状态 DF005" — citation verified to exist (`ui/ui-design.md:383`, UF4 data-binding table, row content verbatim; actual section header is "Data Binding", the label "Data Mapping" is a one-word imprecision, substance exact) |
| [blindspot] loading window not engineerable | **RESOLVED** | state_requirement "loading 窗口确定性供给:就绪门控——观察点先于数据就绪信号注入…「就绪后转入正常列表」断言以就绪信号为界" |
| [blindspot] restore mutation undeclared | **RESOLVED** | state_requirement "恢复突变声明:重试前将被损坏文档恢复为有效内容(单文档粒度,同一文件);恢复后渲染对比口径与 success 腿一致" |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

Independent observations carried into scoring:

1. **Argument chain now closes for the count assertions.** Step 1 Output's "计数全满/计数部分完成" is backed by Task entities with a qualitative status distribution whose minimal satisfying assignment (1 + 2 = 3) equals `min_count: 3` — non-vacuous and materializable.
2. **Residual unanchored UI claim**: "completed 样板带完成徽标…in-progress 样板无徽标" (Step 1 Output). Neither page-map's feature sections ("slug/状态 Pill/进度/更新时间") nor ui-design UF4's card anatomy (slug + 状态 Pill + 进度条 + 计数 + 更新时间) defines a completion-only badge; the design's own prototype (`ui/prototype/features.html:55,64`) renders a status Pill on EVERY card — including the in-progress one. The 徽标 dichotomy maps to no design element; "无徽标" is anti-anchored against the Pill-on-every-card design.
3. **Recovery-target tree under-specified** (Step 5): the second ExternalDocTree's content is never constrained ("第二棵树为恢复目标"), so (a) the expected post-repoint projection for "feature 列表与文档按新树重建" is undefined, and (b) nothing guarantees the second tree passes forge detection (FT-038: `.forge` or `docs/features` must exist under the location) — without which the recovery half of the Outcome cannot execute at all (repoint would fail `ERR_FORGE_NOT_DETECTED`). Step 4's tree by contrast declares "同构五类文档".
4. **Guard outcomes carry no oracle channels**: external-link-guard and injection-guard are the only verifying Outcomes in the family with no `state_requirements` at all, while their assertions are negatives ("不执行任何注入内容", "禁用外链跳转离开应用") — the hardest kind to observe without a declared channel. The success leg's 全等对拍 channel would prove text-rendering (rendered text == fixture projection containing the markup literally) but is not wired into the guard legs.
5. **Mild mechanism vocabulary residuals** in dimension values: "FeatureBoardData 载入" (DTO name, Step 1 State), "docKinds 投影驱动 tab 启停" (Step 2 State), "注册信息落库" (Step 4 Output). All fact- or design-anchored; none is a selector/schema literal.
6. Cross-contract state flow verified clean: Step 2/3 build on Step 1's loaded-board state; Step 5's Preconditions "(Step 4 产物)" matches Step 4's State ("新项目成为激活项目" + docLocationType external); Step 5's invalidation is a declared fixture mutation.
7. Business-rule reality check (injected context): read-only board discipline (BIZ-task-ops-001) never violated — all write effects confined to 工作台自有库 with explicit "零项目目录与仓外树写入" side-effects; doc-read-error's explicit error card is PRD-mandated UF4 error row, not a BIZ-resilience-001 violation (that matrix governs ambient failures; this is a direct user-action response).

---

## Phase 2 — Dimension Scoring (verification stance)

### 1. Completeness — 150/150

- **All four mandatory dimensions per Outcome: 50/50.** All 11 Outcomes across 5 files carry non-empty Preconditions/Input/Output/State; Side-effect explicit everywhere; Invariants present where judged (Steps 2/3/4).
- **Journey Invariants section: 50/50.** All 5 files carry `## Journey Invariants` with the same 3 invariants.
- **Happy path + surface-mandated derived scenarios: 50/50.** Web mandatory derived outcomes both dispositioned per project convention: Step 4 `<!-- surface-web required_outcomes 映射 -->` (validation-error → family认领 multi-project-management 2b/3b/3c), Step 5 mapping comment (session-expired → offline channel-failure analog = external-path-invalid-repoint). Boundary coverage: empty-state, loading-state, doc-read-error, external-link-guard, injection-guard, external-path-invalid-repoint. Step 2's single success Outcome mirrors a journey step with no defined edges — acceptable.

### 2. Semantic Purity — 192/200

- **Natural language, no code/regex: 77/80.** No regex, CSS selectors, XPath, or framework assertions (verified across all five files). −3 for residual data-structure vocabulary: Step 1 State "FeatureBoardData 载入(slug/状态/文档类/任务计数)" names an internal DTO rather than the user-observable board content (the parenthetical partially redeems it).
- **Preconditions declarative: 59/60.** All Preconditions are declarative state descriptions; the disposable-fixture procedure correctly relocated to state_requirements. −1 for lingering provenance-as-procedure phrasing ("Setup 另备" / "Setup 预置") — informational, not harmful.
- **No implementation coupling: 56/60.** The revision properly quarantined schema literals (`doc_location_type`/`doc_location_path`), the IPC verb (`readFeatureDoc`), and component identity ("同一渲染组件") into state_requirements marked "(仅供对拍,不入行为断言)". −4 for residuals in dimension values: Step 4 Output "注册信息落库为仓外文档位置" (persistence-layer vocabulary), Step 2 State "docKinds 投影驱动 tab 启停" (projection-mechanism phrasing; FT-054-anchored, so verifiable, but mechanism-level rather than behavioral).

### 3. Precondition Exclusivity — 150/150

- **Distinct across Outcomes: 60/60.** Step 1 partitions structurally (双 feature active project / 零 feature project / temporal not-ready window with its own Feature min_count 1 fixture). Step 3 partitions by content property with explicit mutual exclusion ("包含外部链接且不含注入性脚本/HTML 内容…与 injection-guard 互斥") and explicit routing in success ("安全腿见 external-link-guard / injection-guard;损坏腿见 doc-read-error"). Step 5 partitions on path validity.
- **Sufficient to uniquely select: 50/50.** Loading resolves-to-populated vs empty-state resolves-to-empty are disambiguated by their distinct fixtures; no ambiguous pair found.
- **Error/boundary triggers explicit: 40/40.** "内容读取失败(文件损坏;fixture 副本注入)", "仓外 docs 树被移动/删除", "包含外部链接", "包含注入性内容(脚本/HTML 标签)", "数据尚未就绪(首次加载/切换项目)" — all named.

### 4. Fact Alignment — 141/150

- **Factual claims traceable to fact_id or UNKNOWN: 54/60.** All inline anchors verified against the fact table: FT-034 (status passthrough + per-feature task counts), FT-054 (five tabs always present, missing kind disabled-not-hidden, kind whitelist), FT-053 (:slug subview addressing; invalid external doc → error card + repoint guidance), FT-030 (per-document read verb), FT-036 (external location requires path), FT-047 (watch targets include external docs path, authorized roots only), FT-051 (edit mode no authorization exemption), FT-006 (single-instance lock). UF4 States citations verified in `ui/ui-design.md:361-366` (loading 骨架 / empty 「无 feature」+ 引导 / error 错误+重试+仓外失效引导). 仓外角标 citation verified at `ui/ui-design.md:383`. −6 for the one unanchored specific UI claim: "completed 样板带完成徽标…in-progress 样板无徽标" (Step 1 Output) — no design element matches, not marked UNKNOWN.
- **Inferred claims have rule support + source: inferred: 48/50.** doc-read-error carries the reasoned `<!-- source: inferred -->` annotation (basis: readFeatureDoc per-document verb + UF4 error row); both web mandatory outcomes carry the surface-rule mapping comments. −2: the doc-read-error inference basis cites interface semantics without naming the surface-rule outcome class it functionally matches (network-error: error message + retry + no data loss) — carried over from iteration 1, reduced because the annotation is otherwise complete and the outcome is journey-inherited rather than rule-derived.
- **No hallucinated unclassified claims: 39/40.** All remaining claims check out against fact table + handbook + journey. −1: Step 5 Output "已扫快照数据不被静默清空(feature 列表仍在)" is journey-inherited with no FT/design citation in the contract (journey's own "已落地 e2e sc5 口径" note was not carried over; FT-056's last-good-retention semantics cover the task board, not the feature board, so the analog is unverified for this surface).

### 5. Surface Fitness — 98/100

- **Mandatory derived Outcomes: 40/40.** validation-error and session-expired both dispositioned via the convention-sanctioned mapping comments (Step 4 family认领; Step 5 offline-analog).
- **Surface-appropriate language: 33/35.** Good web language throughout (tab 切换、点击、loading 骨架、空态、角标、向导步骤②、错误卡、面包屑). −2 for backend-vocabulary residuals in dimension values ("落库", "FeatureBoardData", "投影驱动") — not web-observable phrasing.
- **TUI timeout criterion: 25/25.** N/A for web surface (full marks per rubric).

### 6. Internal Consistency — 149/150

- **Invariants hold: 60/60.** Read-only-render invariant never violated (write effects confined to workbench-owned state with "零项目目录与仓外树写入" / "重指向只写工作台自有库" side-effects); forge-consistency invariant actively asserted via the state_requirement channels; 仓内外等价 asserted in Steps 4/5.
- **Cross-Contract state references consistent: 49/50.** Step 5 "(Step 4 产物)" matches Step 4's State; Steps 2/3 correctly build on Step 1's loaded-board world (same 双 feature fixture constraints repeated verbatim). −1: Step 3's guard/injection fixtures declare their own Project+Feature+FeatureDoc world but never state whether they reuse the Step 1/2 world or stand alone — inferable from the per-Outcome specs, mildly under-linked.
- **Preconditions achievable from prior State: 40/40.** No unreachable preconditions; Step 5's invalidation and recovery states are declared fixture mutations, not gaps.

### 7. Anchor Integrity — 100/100

Handbook `design/page-map.md` exists → dimension active. `route: ""` is by-design (view-key addressing per page-map header and FT-053) — not a defect.

#### Missing Anchor Fields

| Contract File | Missing Field | Expected Value |
|---|---|---|
| (none) | — | — |

#### Handbook Conflicts

| Conflict Type | Entry A | Entry B | Description |
|---|---|---|---|
| (none) | — | — | — |

All 5 contracts carry `anchors.web.page` (+ route/requires_auth/layout). Values match handbook view keys exactly: `workbench/features` (steps 1, 2, 3, 5), `workbench/overview` (step 4 — wizard entry per "顶栏项目切换器「添加项目」/ 空态「注册项目」进向导"). `requires_auth: false` matches "Auth: none". Layout strings faithfully mirror handbook layouts, including the `workbench/features/:slug` subview (step 2) and RegisterWizard 浮层 (step 4). Step 5's layout adds 仓外文档角标 to the FeatureDetail string — grounded in ui-design UF4 (verified) per the iteration-1 design decision; not an anchor defect. Handbook contains no conflicting view-key definitions.

### 8. Fixture Specification — 96/100

**Entity completeness (veto item): 40/40.** No veto — every entity referenced by each contract's Preconditions/Input/Output/State is declared in its fixture_spec: Step 1 (Project/Feature/Task — Task added this iteration with distribution constraints), Step 2 (Project/Feature), Step 3 (Project/Feature/FeatureDoc in all four legs), Step 4 (Project/ExternalDocTree/Feature — Feature added this iteration with slug/docKinds), Step 5 (Project/ExternalDocTree/Feature). All entity types correspond to domain-model concepts in the design (page-map data sources, FT-034/FT-036 semantics).

- **Relationship and constraint coverage: 31/35.** Relationships declared wherever parent-child exists (Feature→Project, Task→Feature, FeatureDoc→Feature); ExternalDocTree correctly stands unowned pre-registration in Step 4. Step 4's Feature↔tree linkage expressed via slug-equality constraint — workable. −4: Step 5's recovery-target tree is content-unconstrained — "第二棵树为恢复目标" declares neither docKinds nor feature-slug structure, so the expected projection for "feature 列表与文档按新树重建" is undefined, and nothing guarantees the tree satisfies forge detection (FT-038) so the repoint can succeed at all.
- **Minimum data quantity declarations: 25/25.** Step 1 union Project min_count 2 (with rationale comment covering empty-state + loading 切换项目 variants); Task min_count 3 matches the minimal distribution satisfying 全满+并存 (1+2); Step 5 ExternalDocTree min_count 2 supports the repoint recovery leg; Step 3 FeatureDoc min_count 5 supports the five-kind iteration.

---

## Phase 3 — Blindspot Hunt

- **[blindspot] Guard Outcomes assert negatives with no observation channel.** Step 3 injection-guard Output: "内容按 forge 原文只读安全渲染(markdown 防注入),不执行任何注入内容" — and external-link-guard Output: "只读渲染禁用外链跳转离开应用(安全约束),用户停留在应用内". These are the only verifying Outcomes in the family whose fixture_specs carry **no state_requirements whatsoever**, while every sibling leg declares its oracle there (渲染对比口径, 状态读数对拍). "不执行任何注入内容" is not directly observable in a browser; the natural channel — rendered-text 全等对拍 against a fixture projection that contains the injected markup as literal text (proving text rendering, hence non-execution) — already exists in the success leg but is not wired into the guard legs. Reasoning audit flagged this independently of dimension scoring (the rubric's fixture criteria cover entities/counts, not oracle-channel presence). Must improve: add a state_requirement to each guard leg declaring the observation channel (e.g., reuse the 空白剥离规范化全等 口径 with the guard fixture, plus an application-view-unchanged check for the link leg).
- **[blindspot] "完成徽标" dichotomy risks a false-failing test, not just an unanchored claim.** Step 1 Output: "completed 样板带完成徽标、计数全满,in-progress 样板无徽标、计数部分完成". The design's own prototype renders a status Pill on every feature card (`ui/prototype/features.html`: `<span class="pill">…completed</span>` and `<span class="pill">…in-progress</span>` on sibling cards), and page-map/ui-design define no completion-only badge. A downstream gen-test-scripts agent implementing this literally will either assert a badge element that does not exist (fail on completed) or assert badge-absence on a card that wears a Pill (fail on in-progress, if Pill is read as the 徽标). The traceability cost is scored under Fact Alignment; the executability/false-fail consequence is outside every rubric dimension. Must improve: restate behaviorally against the designed anatomy (e.g., "completed 样板状态 Pill 显示 completed 且计数全满;in-progress 样板 Pill 显示 in-progress 且计数部分完成") or mark the 徽标 claim UNKNOWN pending a design decision.

---

## Attacks (consolidated)

1. **Fact Alignment**: unanchored UI element claim — "completed 样板带完成徽标…in-progress 样板无徽标" (Step 1 Output) matches no element in page-map ("slug/状态 Pill/进度/更新时间") or ui-design UF4 card anatomy, and the prototype puts a Pill on every card — anchor the claim to the Pill/进度 anatomy or mark UNKNOWN.
2. **Fixture Specification**: recovery-target tree content unconstrained — "第二棵树为恢复目标" (Step 5) declares no docKinds/slug structure and no forge-detection guarantee (FT-038), leaving "feature 列表与文档按新树重建" without a declared expected projection and the repoint-success leg without a validatable tree — constrain the second tree (同构五类 + feature 目录名) as Step 4 does.
3. **Semantic Purity**: residual mechanism vocabulary in dimension values — "FeatureBoardData 载入" (Step 1 State), "docKinds 投影驱动 tab 启停" (Step 2 State), "注册信息落库为仓外文档位置" (Step 4 Output) — restate in user-observable terms; the fact anchors can stay.
4. **[blindspot]**: guard legs assert negatives with no oracle channel — "不执行任何注入内容" / "禁用外链跳转离开应用" have zero state_requirements while all sibling legs declare channels — wire the 全等对拍 channel (and a view-unchanged check) into external-link-guard and injection-guard.
5. **[blindspot]**: 徽标 dichotomy engineers a false-failing test — "in-progress 样板无徽标" anti-anchored against Pill-on-every-card design (prototype features.html) — align the assertion with the designed card anatomy before gen-test-scripts consumes it.

---

## Outcome

**Target reached — PASS (1076/1100; all dimensions above threshold).**

Residual gaps are non-blocking: the 徽标 anatomy mismatch (attack 1/5) and the second-tree constraints (attack 2) are the two items a downstream gen-test-scripts agent will feel first; guard oracle channels (attack 4) would harden the safety legs. No veto conditions, no invariant violations, no anchor defects.
