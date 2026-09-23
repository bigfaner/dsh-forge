# Eval-Contract Report — feature-board-docs-browsing (Iteration 1)

**Scorer**: Senior QA Engineer (adversarial) · **Date**: 2026-09-23 · **ITERATION**: 1 (no previous report)

**Scope scored**: `contracts/step-1-open-feature-board.md` … `step-5-external-docs-consistent-rendering.md` (5 files, 11 Outcomes total)
**Reference inputs**: surface-web rule, `design/page-map.md` (handbook), `.forge/fact-table.json` (FT-001..FT-056), parent `journey.md` (read-only)

---

## Final Score

**885 / 1100** (target: 935) — **FAIL**

| Check | Result |
|---|---|
| Total ≥ 935 | NO (885) |
| Every dimension ≥ threshold | NO (Fixture Specification 0 < 60) |

### Dimension Breakdown

| Dimension | Score | Max | Threshold | Pass |
|---|---|---|---|---|
| 1. Completeness | 150 | 150 | 90 | PASS |
| 2. Semantic Purity | 142 | 200 | 120 | PASS |
| 3. Precondition Exclusivity | 150 | 150 | 90 | PASS |
| 4. Fact Alignment | 101 | 150 | 90 | PASS |
| 5. Surface Fitness | 96 | 100 | 60 | PASS |
| 6. Internal Consistency | 146 | 150 | 90 | PASS |
| 7. Anchor Integrity | 100 | 100 | 60 | PASS |
| 8. Fixture Specification | **0** | 100 | 60 | **FAIL (veto)** |
| **Total** | **885** | **1100** | 935 | **FAIL** |

### Score Progression

| Iteration | Score | Delta |
|---|---|---|
| 1 | 885 | — |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

Independent observations carried into scoring:

1. **Vacuous assertion input (Step 1)**: Output asserts task-count states ("计数全满" / "计数部分完成") but `fixture_spec.entities` declares only Project + Feature — no Task entity, no task-status constraints. "Partial completion" cannot be materialized from the declared fixture. State value "FeatureBoardData 载入(slug/状态/文档类/任务计数)" references the same ungrounded data (FT-034: counts derive from task data).
2. **Vacuous assertion input (Step 4)**: Output asserts "feature 列表与文档均读仓外树(slug 与仓外 fixture 一致)" but Step 4's entities declare only Project + ExternalDocTree — no Feature living in the external tree (the carrier of "同构五类文档"). Step 5 models the same external project WITH Feature min_count 1; Step 4 does not.
3. **Zero FT-xxx anchors family-wide** (grep-verified) while ≥7 claims are directly supported by existing facts (FT-034, FT-054, FT-030, FT-036, FT-047, FT-051, FT-053). Family convention requires inline FT anchors on factual claims.
4. **Oracle-channel leakage into Output values** ("测试进程直读对拍", "空白剥离后逐字对比", "状态读数对拍") — family convention: oracle channels live ONLY in `fixture_spec.state_requirements` (which do carry them properly; the Output parentheticals are redundant violations).
5. **Setup/procedural detail in Preconditions** (Step 1: 临时目录 + 隔离 userData + 测试后清理 + 单实例锁探测) — family convention assigns these to `state_requirements`.
6. **Implementation coupling in State values**: DB schema columns (`doc_location_type`/`doc_location_path`, "projects 行"), IPC verb name (`readFeatureDoc`), watcher internals ("感知链 watch 目标"), component identity ("同一渲染组件").
7. **Non-instantiable fixture constraint** (Step 2): "in-progress 缺可选文档类" names no concrete kind.
8. **Union-spec ambiguity** (Step 1): union declares Project min_count 1, but empty-state requires a second project ("Setup 另备") and loading-state's "切换项目" variant implies ≥2 registered projects.

---

## Phase 2 — Dimension Scoring (verification stance)

### 1. Completeness — 150/150

- **All four mandatory dimensions per Outcome: 50/50.** All 11 Outcomes across 5 files carry non-empty Preconditions/Input/Output/State (Side-effect explicitly present everywhere; Invariants present where judged).
- **Journey Invariants section: 50/50.** All 5 files carry `## Journey Invariants` with the same 3 invariants.
- **Happy path + surface-mandated derived scenarios: 50/50.** Web mandatory derived outcomes dispositioned per project convention: Step 4 carries the `<!-- surface-web required_outcomes 映射 -->` comment for validation-error (family认领 by multi-project-management 2b/3b/3c); Step 5 carries the session-expired analog mapping (offline desktop → channel-failure = external-path-invalid-repoint). Boundary coverage is rich: empty-state, loading-state, doc-read-error, external-link-guard, injection-guard, external-path-invalid-repoint.

### 2. Semantic Purity — 142/200

- **Natural language, no code/regex: 62/80.** No regex, CSS selectors, XPath, or framework assertions (grep-verified). Deducted for oracle procedures inside dimension values: Step 1 Output "与 fixture 模型一致(**测试进程直读对拍**)", Step 3 Output "按规范化口径全等(**空白剥离后逐字对比**)", Step 3 doc-read-error "渲染恢复正常(**规范化口径对拍**)", Step 4 "落库为仓外文档位置(不等于代码根目录,**状态读数对拍**)", Step 5 "按同一规范化口径与仓外 fixture 文件全等(**「格式与仓内一致」的可观测口径**)". Family convention: these channels live ONLY in `state_requirements` (they already do — the inline copies are redundant how-to-verify leakage). −18.
- **Preconditions declarative: 48/60.** Step 1 success Preconditions embed disposable-fixture procedure: "(**一次性 fixture:临时目录 + 隔离 userData、测试后清理;跑腿前探测本机无活跃 dsh-forge 实例——单实例锁教训**)" — procedural setup/cleanup instructions; family convention explicitly assigns these to `state_requirements`. All other Preconditions are declarative state descriptions. −12.
- **No implementation coupling: 32/60.** Systematic backend-internals coupling in State values: Step 4 "State: **projects 行 doc_location_type = external、doc_location_path = 仓外路径**;激活指针指向新项目;**感知链 watch 目标含仓外 docs 路径**(授权已登记)"; Step 5 repoint "doc_location_path 更新为第二仓外树"; Step 3 "每次读取 = **readFeatureDoc** 逐文档动词调用"; Step 5 "文档读取自仓外路径(**readFeatureDoc** 按项目文档位置解析);呈现层零分叉(**同一渲染组件**)". DB table/column names, IPC verb names, and component identity are internal implementation, not system-level behavior; family convention requires State values stay behavioral. −28.

### 3. Precondition Exclusivity — 150/150

- **Distinct across Outcomes: 60/60.** Step 1's success (双 feature fixture) / empty-state (零 feature project) / loading-state (temporal not-ready window, distinct fixture shape Feature min_count 1) are unambiguous. Step 3's four outcomes are partitioned by content properties, with explicit mutual exclusion ("包含外部链接且**不含注入性脚本/HTML 内容**…**与 injection-guard 互斥**") and explicit routing in success ("安全腿见 external-link-guard / injection-guard;损坏腿见 doc-read-error"). Step 5 partitions on path validity.
- **Sufficient to uniquely select: 50/50.** No ambiguous pair found.
- **Error/boundary triggers explicit: 40/40.** doc-read-error names its trigger ("内容读取失败(文件损坏)"), repoint names its trigger ("路径失效(仓外 docs 树被移动/删除)"), guards name content properties.

### 4. Fact Alignment — 101/150

- **Factual claims traceable to fact_id or UNKNOWN: 20/60.** Grep-verified: **zero FT-xxx anchors in all five files**, while numerous specific behavioral claims are fact-supported and therefore required to carry anchors per family convention: Step 1/2 "feature 状态为 forge manifest 词表透传" (= FT-034, uncited); Step 2 "五类 tab 恒在,按该 feature 实际文档类启用、缺类禁用不隐藏" and State "docKinds 投影驱动 tab 启停" (= FT-054, uncited); Step 3 "readFeatureDoc 逐文档动词调用" (= FT-030, uncited); Step 4 "projects 行 doc_location_type = external" (= FT-036, uncited), "感知链 watch 目标含仓外 docs 路径" (= FT-047, uncited); Step 5 "编辑模式走同一注册校验链,仓外同样需授权——无豁免" (= FT-051, uncited), "提供重新指向/移除项目引导" (= FT-053, uncited). Accuracy is fine; traceability is absent. −40.
- **Inferred claims have rule support + source: inferred: 45/50.** Step 3 doc-read-error carries a reasoned `<!-- source: inferred -->` annotation (basis: Interface 1 readFeatureDoc per-document verb + UF4 error row); Step 4/5 carry the required surface-web mapping comments. Minor: the doc-read-error inference basis cites interface semantics rather than naming which surface-rule outcome class it derives from (it functionally matches the surface rule's "network-error … error message displayed, retry option available, no data loss"). −5.
- **No hallucinated unclassified claims: 36/40.** All checked claims are consistent with the fact table and handbook; no contradictions found. Minor: "completed 样板带完成徽标" and card-level 任务计数 are not documented in page-map's feature sections ("slug/状态 Pill/进度/更新时间") — inherited from the journey without a design anchor. −4.

### 5. Surface Fitness — 96/100

- **Mandatory derived Outcomes: 40/40.** validation-error and session-expired both dispositioned via the project's established mapping comments (Step 4 family认领; Step 5 offline-analog to channel failure). Not absent — present in the convention-sanctioned form.
- **Surface-appropriate language: 31/35.** Good web language throughout (tab 切换、点击、loading 骨架、空态、角标、向导步骤②). Deducted for State values written in backend language (DB rows, watch targets, IPC verbs) — not web-surface behavioral descriptions. −4.
- **TUI timeout criterion: 25/25.** N/A for web surface (full marks per rubric).

### 6. Internal Consistency — 146/150

- **Invariants hold: 60/60.** Read-only-render invariant never violated (write-side outcomes confined to workbench-owned state with explicit "零项目目录与仓外树写入" side-effects); forge-consistency and 仓内外等价 invariants actively asserted.
- **Cross-Contract references consistent: 46/50.** Step 5 "仓外文档项目已注册并激活(Step 4 产物)" matches Step 4's State; Step 2/3 build on Step 1's loaded-board state. Minor: Step 3's guard/injection fixtures do not state which project/feature world the preset docs belong to (leg-specific fixture implied but unlinked). −4.
- **Preconditions achievable from prior State: 40/40.** No unreachable preconditions.

### 7. Anchor Integrity — 100/100

Handbook `design/page-map.md` exists → dimension active. `route: ""` is by-design (route-less view-key addressing per page-map header and FT-053) — not a defect.

#### Missing Anchor Fields

| Contract File | Missing Field | Expected Value |
|---|---|---|
| (none) | — | — |

All 5 contracts carry `anchors.web.page` (+ route/requires_auth/layout). `requires_auth: false` matches handbook "Auth: none".

#### Handbook Conflicts

| Conflict Type | Entry A | Entry B | Description |
|---|---|---|---|
| (none) | — | — | — |

Anchor values match handbook view keys exactly: `workbench/features` (steps 1, 2, 3, 5), `workbench/overview` (step 4, wizard entry per "顶栏项目切换器「添加项目」/ 空态「注册项目」进向导"). Layout strings faithfully mirror handbook layouts including the `workbench/features/:slug` subview. `workbench/tasks` / `session` pages are outside this journey's scope (held by sibling journeys) — not a defect of this family. Handbook has no conflicting view-key definitions.

### 8. Fixture Specification — 0/100 (entity-completeness VETO triggered)

**Entity completeness (veto item): 0/40.** Two contracts reference entity data that is absent from their `fixture_spec.entities`:

1. **Step 1 — Task missing.** Output: "各带状态标识与任务计数:completed 样板带完成徽标、**计数全满**,in-progress 样板无徽标、**计数部分完成**,与 fixture 模型一致" and State: "FeatureBoardData 载入(slug/状态/文档类/**任务计数**)" — yet `entities` = Project + Feature only. Per FT-034 the counts are task-derived; "部分完成" requires a fixture with tasks in mixed statuses. Neither Task entities nor task-status field constraints exist anywhere in Step 1 → the count assertions are ungroundable/vacuous (family convention: entities sized so assertions are non-vacuous).
2. **Step 4 — Feature missing.** Output: "**feature 列表与文档均读仓外树(slug 与仓外 fixture 一致)**" and Preconditions: "仓外 docs 树 fixture **同构五类文档**" — five doc kinds are per-feature properties, yet `entities` = Project + ExternalDocTree only, with no Feature declared under the tree (no slug constraints to compare against). Step 5 models the same external project with Feature min_count 1; Step 4 omits it.

Veto rule: entity-completeness criterion scores 0 → entire dimension scores 0.

Sub-criteria (recorded for revision guidance, all zeroed by veto):
- Relationship/constraint coverage (0/35): would have been ~26 — relationships properly declared where entities exist; but "in-progress 缺可选文档类" (Step 1/2) names no concrete doc kind (not deterministically instantiable), and Step 4 lacks Feature→ExternalDocTree linkage.
- Minimum data quantity (0/25): would have been ~14 — ExternalDocTree min_count 2 for the repoint recovery leg is well-judged; but Step 1's union Project min_count 1 is under the 2 projects the empty-state leg ("Setup 另备") and loading-state's "切换项目" variant require; loading-state needs no Feature-count conflict but "切换项目" implies ≥2 registered projects.

---

## Phase 3 — Blindspot Hunt

- **[blindspot] External-docs badge has no design anchor.** Step 5 Output: "feature 详情带**仓外文档角标**". page-map's feature-page sections define FeatureCardGrid ("slug/状态 Pill/进度/更新时间"), StatusStepper, and DocTabs — no 仓外角标 element exists in the handbook. A downstream gen-test-scripts agent has no handbook grounding for this assertion. Must improve: add the badge to page-map's feature-page sections (or cite its UF4/ui-design source) before asserting it as Output.
- **[blindspot] Loading-state window is asserted but not engineerable.** Step 1 loading-state Input: "用户进入 feature 看板(**数据未就绪窗口期内观察**)" with fixture_spec declaring only Project+Feature. Nothing pins the window's existence or width (no large fixture, no readiness-delay state_requirement) — a downstream agent gets a racy test that passes or flukes depending on timing. Reasoning audit flagged this independently of dimension scoring. Must improve: declare a state_requirement that makes the not-ready window deterministically observable (e.g., readiness-gated fixture volume or an explicit await-readiness gate in the harness channel).
- **[blindspot] Recovery half of doc-read-error lacks fixture mutation declaration.** Step 3 doc-read-error Output: "**恢复文件后重试**,渲染恢复正常(规范化口径对拍)" while its only mutation state_requirement is "目标文档在 fixture 副本上**注入内容损坏**(单文档粒度)". The mid-test restore (un-corrupt the file) is asserted but never declared as a fixture operation — asymmetric with Step 5, which correctly declares the second tree (min_count 2) for its recovery leg. Must improve: add a state_requirement declaring the restoration mutation (single-document granularity, same file) so the retry-restore leg is executable.

---

## Attacks (consolidated)

1. **Fixture Specification**: entity-completeness veto — Step 1 asserts task counts with no Task entity — "计数全满,in-progress 样板无徽标、计数部分完成" (Output) + "任务计数" (State) vs entities = Project/Feature only — add Task entity with per-feature status constraints (completed feature: all tasks completed; in-progress feature: mixed) so 全满/部分完成 are materializable.
2. **Fixture Specification**: entity-completeness veto (2nd instance) — Step 4 asserts rendered features with no Feature entity — "feature 列表与文档均读仓外树(slug 与仓外 fixture 一致)" vs entities = Project/ExternalDocTree only — declare Feature (belongs_to the registered project / lives in ExternalDocTree) with slug constraints matching Step 5's modeling.
3. **Fact Alignment**: zero FT anchors family-wide — e.g. Step 2 State "docKinds 投影驱动 tab 启停" (= FT-054, uncited), Step 5 "仓外同样需授权——无豁免" (= FT-051, uncited) — add inline FT-xxx anchors for every fact-supported claim (FT-034/FT-054/FT-030/FT-036/FT-047/FT-051/FT-053 all apply).
4. **Semantic Purity**: oracle channels leaked into Output values — Step 3 "渲染文本与 fixture 文件按规范化口径全等(空白剥离后逐字对比)" (+ 4 more instances) — keep oracle mechanics only in `fixture_spec.state_requirements`; Output states the behavioral equality.
5. **Semantic Purity**: procedural Setup in Preconditions — Step 1 "(一次性 fixture:临时目录 + 隔离 userData、测试后清理;跑腿前探测本机无活跃 dsh-forge 实例——单实例锁教训)" — move to a state_requirement.
6. **Semantic Purity**: implementation coupling in State — Step 4 "projects 行 doc_location_type = external、doc_location_path = 仓外路径;…感知链 watch 目标含仓外 docs 路径" (+ readFeatureDoc/同一渲染组件 in Steps 3/5) — restate behaviorally; keep schema literals in state_requirements.
7. **[blindspot]**: unanchored UI element — Step 5 "feature 详情带仓外文档角标" absent from page-map sections — ground it in the handbook or cite its design source.
8. **[blindspot]**: racy transient assertion — Step 1 "数据未就绪窗口期内观察" with no mechanism pinning the window — add a determinism state_requirement.
9. **[blindspot]**: undeclared mid-test fixture mutation — Step 3 "恢复文件后重试,渲染恢复正常" with only the corruption injection declared — declare the restore mutation symmetric to Step 5's second-tree declaration.

---

## Outcome

**Target NOT reached — FAIL (885/1100; Fixture Specification 0 < 60 veto).**

Blocking fixes for revision: (a) Step 1 Task entity + constraints; (b) Step 4 Feature entity + constraints; (c) inline FT-xxx anchors on factual claims. Non-blocking but scored: oracle/Setup/schema literals relocation to state_requirements, loading-window determinism, restore-leg declaration, 仓外角标 handbook grounding.
