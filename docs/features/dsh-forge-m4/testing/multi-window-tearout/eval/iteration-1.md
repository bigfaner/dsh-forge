---
feature: dsh-forge-m4
journey: multi-window-tearout
iteration: 1
rubric: eval/rubrics/journey.md (1150pt, 7 dimensions)
surface: web (rules/surface-web.md)
score: 915
target: 975
status: fail (Surface Fitness below min threshold; total below target)
generated: 2026-09-30
---

# Eval-Journey Iteration 1 — multi-window-tearout

**Final Score**: 915/1150 (target 975) — **NOT reached**
**Threshold**: Surface Fitness 70/150 < 90 → dimension threshold FAIL; all other dimensions pass (Fact Alignment 92/150 passes the 90 floor by 2 points).
**Golden Path veto**: NOT triggered (semantically verified Golden Path present; see Workflow Coverage).

Scorer context loaded: `rules/surface-web.md` (SURFACE_TYPE=web, mandatory `validation-error` + `session-expired`, strategy 50/50), all 6 files in `docs/business-rules/` (esp. workbench.md BIZ-workbench-002 单激活指针, coexistence.md 单实例锁/ERR_SINGLE_INSTANCE), `prd/prd-user-stories.md` (Story 6 AC3 = ground truth), `prd/prd-spec.md` (必答⑨ 分屏/多窗口 L211-215, Data Requirements 布局记忆 L243), `prd/prd-ui-functions.md` (UF10 L398-433, UF9), proposal Key Scenarios (docs/proposals/dsh-forge-m4/proposal.md L71 「分屏/多窗口」 verified). Reality-check cross-refs: `design/tech-design.md` L205 (windowOpenDetached / OS 关闭 ≡ windowRecall), `design/page-map.md` L71, `ui/ui-design.md` L586, `tasks/4.3-window-role-boot-detached-gui.md`, sibling journeys (split-pane-layout-memory, project-workbench-home).

---

## Phase 1 — Reasoning Audit (pre-score anchors)

Trace of the journey's internal argument before rubric application:

1. **Story workflow trace (拆出→并行→收回→记忆恢复)**: Story 6 AC3 ("Given 将某视图拆出为独立窗口,When 主窗口与独立窗口并行操作,Then 互不干扰且同属单实例(e2e 断言)") is the in-scope core; Step 1 ↔ UF10 Placement ("pane 操作菜单「拆出」"); Step 2 ↔ UF10 Flow ("视图迁入新窗口") + 必答⑨ ("布局(主窗口 pane 结构 + 拆出窗口集合)随项目记忆"); Step 3 ↔ AC3 near-verbatim ("互不干扰"); Step 4 ↔ UF10 Flow ("关闭独立窗口可「收回」主窗口"); Step 5 ↔ UF10 States `restored` ("重进恢复拆出态"). **The macro argument covers the story's 拆出→并行→收回→恢复 arc** — the mapping is sound.
2. **Cross-step references**: Step 5's restore presupposes Step 2's 记入布局记忆 ✓; edge numbering (1b–5b) correctly binds variants to happy steps; 4b chains on the close surface of 4; 5b chains on 5's restore. **One real seam found**: Step 4 recalls the window (emptying the detached set), then Step 5 expects "拆出窗口集合随项目记忆恢复" — a non-empty restore is presupposed with no re-tearout step between 4 and 5 (scored in Internal Consistency).
3. **Fact anchor spot-checks (mostly pass)**: 拆出来源 = pane (UF9/UF10 verbatim); 拆出窗口集合记入布局记忆 (必答⑨ verbatim "主窗口 pane 结构 + 拆出窗口集合"); 全部窗口同属单实例 (必答⑨/UF10 Validation); 聚焦既有实例 (coexistence.md "聚焦既有窗口并退出" — ERR_SINGLE_INSTANCE); 关闭主窗口 = 退出应用 (UF10 Validation verbatim); 项目删除时布局记忆清除 (prd-spec L243 verbatim); 恢复态 restored (UF10 States verbatim); proposal 「分屏/多窗口」 (proposal.md L71 verified). Ungrounded vocabulary found: "让位" (Step 2/2b, no PRD source for main-pane behavior on tearout), "数据内核" (conventions TECH-product-arch-003 vocabulary, uncited in the journey's own source list).
4. **Pre-identified weak seams** (scored in Phase 2): (a) web-surface mandatory derived outcomes (`validation-error`, `session-expired`) completely absent — worse than split-pane-layout-memory, which at least carried one non-mandatory `responsive-layout` mapping; (b) Step 4b posits a "close-without-recall" branch that the design layer collapsed — tech-design.md L205: "OS 标题栏关闭 ≡ windowRecall(主窗 pane 原位恢复,不待重启)" — and that UF10 leaves as an open branch ("(或记忆保持拆出态)"); (c) Step 3 vs 3b precondition partition is fuzzy (Step 3's own Expected Result already asserts "两窗口呈现同一数据内核的派生视图"); (d) no `source: inferred` markers anywhere; (e) window lifecycle × project lifecycle (归档标题追加 / 删除全部关闭 / 绑定来源项目) entirely uncovered.

---

## Phase 2 — Dimension Breakdown

### 1. Completeness (完整性) — 167/200 (min 120, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Metadata complete | 49/50 | |
| Steps complete with required fields | 76/80 | |
| Happy path + required derived scenarios | 42/70 | |

- **Metadata (49/50)**: `journey: "multi-window-tearout"` kebab-case ✓; `risk_level: "Medium"` valid and fits content (multi-step window orchestration; only reversible view-state writes — see Internal Consistency 40/40); `surface_types/keys: ["web"]` ✓; `sources` lists all three PRD files ✓; `generated` ✓. −1: `golden_path: false` on a fully qualifying sequence (feature-level assignment to project-workbench-home is legal; same treatment as split-pane-layout-memory / task-session-roundtrip).
- **Steps complete (76/80)**: 5 happy steps, each with User Action + Expected Result; coherent ordered sequence (select → tearout → parallel → close/recall → re-enter restore). −2: Step 4's "关闭独立窗口,**选择收回**主窗口" implies an unstated close-time choice mechanism (no source describes a recall prompt); −2: Step 4's Expected Result never states recall quality — design is explicit ("主窗 pane **原位**恢复,**不待重启**", tech-design.md L205) but the journey's "视图收回主窗口 pane" carries no position/immediacy caliber.
- **Derived scenarios (42/70)**: boundary breadth is real — single-instance relaunch (1b), sole-pane yield (2b), mirrored-surface concurrency (3b), direct-close memory consistency (4b), restore-target-missing degradation (5b). But: (a) the web-mandatory pair (`validation-error`, `session-expired`) is entirely unaddressed — no outcome, no mapping comment, no N/A discharge (−20; decisive, see Surface Fitness D1); (b) no edge for project lifecycle × detached windows — 归档 → 窗口保持可用 + 标题追加「已归档」 and 删除 → 该项目全部拆出窗口关闭 + toast are both design-anchored (ui-design.md L586, page-map.md L71, task 4.3) and both absent (−4); (c) no step/edge exercises 主窗关闭 = 退出应用 although invariant 1 asserts it (−3); (d) Step 1 carries no edge variant and edge depth is uniform single-scenario (−1).

### 2. Semantic Purity (语义纯度) — 186/200 (min 120, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Natural language, no code/regex | 76/80 | |
| Preconditions declarative | 54/60 | |
| No implementation coupling in steps | 56/60 | |

- **Natural language (76/80)**: no regex, selectors, or `expect(...)`-style assertions anywhere. −4: test-caliber tags embedded inside Expected Results and Setup — Step 3 "两侧互不干扰(操作互不抢占、状态互不串扰)(e2e 断言)", Step 1b "全部窗口同属单实例(断言)", Setup "断言口径:主窗口与独立窗口并行操作互不干扰且同属单实例(e2e 断言)". Inherited from the PRD's own convention, hence −4 not more.
- **Preconditions declarative (54/60)**: 1b/2b/3b/5b are clean state descriptions ("已存在拆出的独立窗口", "被拆出视图原占主窗口唯一内容 pane", "主窗口与独立窗口呈现同一项目数据(如同一任务状态面)", "拆出窗口记忆中的视图目标数据已删除"). −4: Step 4b's Precondition is an action restatement, not a divergent state — "用户直接关闭独立窗口(不经收回动作)" duplicates its own User Action ("关闭独立窗口后重进项目"); the actual state (window closed, view neither recalled nor remembered) is unstated. −2: Setup mixes assertion-caliber framing into preconditions ("断言口径:…(e2e 断言);布局记忆 = …").
- **Implementation coupling (56/60)**: actions are user-level throughout (选中 pane / 打开菜单 / 点击拆出 / 并行操作 / 关闭 / 重进). −2: "数据内核…派生视图" — conventions-traceable product vocabulary (TECH-product-arch-003) but uncited in this journey's source list, reads as architecture-layer token; −2: "让位" design jargon in Step 2/2b with no domain anchor in the PRD.

### 3. Precondition Exclusivity (前置条件互斥性) — 132/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Preconditions distinct across outcomes | 54/60 | |
| Sufficient to uniquely select an outcome | 41/50 | |
| No missing preconditions for boundary outcomes | 37/40 | |

- **Distinct (54/60)**: the five edges target disjoint surfaces (instance boundary / pane yield / mirrored concurrency / close-memory / restore degradation), and 1b/2b/5b are cleanly distinct states. −6: **Step 3 vs Step 3b partition is fuzzy** — Step 3's own Expected Result already asserts "两窗口呈现同一数据内核的派生视图", so 3b's Precondition ("主窗口与独立窗口呈现同一项目数据") co-holds in every Step-3 execution; the actual distinguishing element (same *surface* mirrored on both sides, not two different views) is buried in the example "如同一任务状态面". Booked partial (not full −20) because the assertions converge rather than contradict — same defect class as split-pane-layout-memory's 2b.
- **Sufficient to uniquely select (41/50)**: the same 3b fuzziness leaves a contract generator unable to decide when 3b applies vs Step 3's own assertion (−4). −5: Step 4b's activation region is undecidable — whether a "close without recall" path exists *in the system* is unresolved (design says close ≡ recall), so the precondition may describe an unreachable state; no state in the document determines when 4b vs 4 fires.
- **Missing preconditions for boundary outcomes (37/40)**: every edge carries a Precondition line ✓. −3: 4b's real divergent state (detached window closed, view disposition — recalled? dropped?) is never stated; its Expected Result asserts absence of stale references but the precondition pins only an action frame.

### 4. Fact Alignment (事实依据) — 92/150 (min 90, PASS by 2)

| Sub-criterion | Score | Notes |
|---|---|---|
| Factual claims traceable | 48/60 | |
| Inferred claims: rule support + `source: inferred` | 10/50 | |
| No hallucinated unclassified claims | 34/40 | |

- **Traceable (48/60)**: the traceability block verifies in full — Story 6 (AC3), SC4, UF10/UF9, 必答⑨, proposal Key Scenarios 「分屏/多窗口」 (docs/proposals/dsh-forge-m4/proposal.md L71 exists as cited). Load-bearing assertions tracing verbatim: 拆出来源 = pane (UF10 Placement); 视图迁入新窗口 (UF10 Flow); 拆出窗口集合随项目记忆 (必答⑨); 互不干扰且同属单实例 (AC3); 聚焦既有实例 (coexistence.md ERR_SINGLE_INSTANCE); 关闭主窗口 = 退出应用 (UF10 Validation); 项目删除时随之清除 (prd-spec L243); 重进恢复拆出态 (UF10 States `restored`). Deductions: −4: **Step 4b "不恢复已关窗口" picks a side in an unresolved PRD branch** — UF10 Flow reads "关闭独立窗口可「收回」主窗口(**或记忆保持拆出态**)", i.e., the PRD itself leaves a keep-detached-in-memory branch that 4b silently forecloses, and the design layer resolved the ambiguity the *other* way (tech-design.md L205 "OS 标题栏关闭 ≡ windowRecall"); the journey asserts a third semantics (close = gone) as fact with no marking; −4: "主窗口 pane 结构让位更新" / "主窗口按布局规则让位呈现" (Step 2/2b) — no PRD source describes main-window pane behavior on tearout; unmarked inference presented as fact; −2: "同一数据内核的派生视图" — conventions vocabulary (TECH-product-arch-003), not in the journey's cited sources, uncited; −2: Step 4 "选择收回" invents a close-time choice affordance no source describes.
- **Inferred claims (10/50)**: **zero** required_outcomes mappings and **zero** `source: inferred` markers anywhere in the document — weaker than split-pane-layout-memory iteration 1 (which at least carried one non-mandatory `responsive-layout` mapping and scored 20/50). Free unmarked inferences: 2b "不出现空白主窗口死区", 3b "状态以数据内核为事实源,两侧一致更新、互不覆盖互不丢失" (this is actually the surface-web `concurrent-edit` family — citable, uncited), 4b "不残留不可达窗口引用", 5b "降级呈现、不崩溃;其余布局正常恢复" (−15); the mandatory pair (`validation-error`, `session-expired`) has no citation, discharge, or N/A note (−25). Net 10/50.
- **Unclassified hallucinations (34/40)**: nothing rises to hallucination — no invented error codes, exit codes, or message text; every behavior-level assertion either traces to PRD/UF or is a conservative composition of traced facts. −6: unmarked failure-behavior assertions that read as factual — "不出现空白主窗口死区"(2b), "互不覆盖互不丢失"(3b), "不恢复已关窗口、不残留不可达窗口引用"(4b), "不崩溃"(5b) — kept below the −30 hallucination bar as negative-UX expectations rather than fabricated specifics.

### 5. Surface Fitness (Surface 适配) — 70/150 (min 90, **FAIL**)

| Sub-criterion | Score | Notes |
|---|---|---|
| Mandatory derived outcomes present | **0/60** | rubric floor rule applied |
| Test strategy proportions (50/50) | 38/50 | |
| Realistic web/e2e assumptions | 32/40 | |

- **Mandatory outcomes (0/60)**: surface-web.md declares "Mandatory derived Outcomes (must be considered for every Web Journey): validation-error… session-expired…". Both are completely absent — no outcome, no mapping comment, no N/A justification; the document contains **no** required_outcomes trace at all (unlike split-pane-layout-memory, which mapped `responsive-layout`). The rubric instructs "Score 0 if mandatory Outcomes are completely absent" — floor applied, consistent with split-pane-layout-memory iteration 1 (same generation batch). The house discharge pattern was demonstrated by sibling `task-session-roundtrip/journey.md`; natural mappings existed here: validation-error → 拆出目标会话已失效/不可拆 (pane 菜单「拆出为窗口」对已失效 target — 5b's family on the tearout side), session-expired → detached conversation 视图所依 dsh 会话通道不可用 (detached window losing host session mid-parallel-operation). Silence is a generation miss, not a convention gap.
- **Strategy proportions (38/50)**: 10 outcomes — 5 journey-level traversal steps (multi-window orchestration incl. restart persistence = Journey-smoke material) vs 5 preconditioned boundary cases (instance lock, pane yield, concurrency, close-memory, restore degradation = Contract material); roughly balanced, edges contract-assertable. Deductions: no loading/async observation anywhere although window-open and re-entry restore are async surfaces (−4); no window-set enumeration/identity caliber — asserting "拆出窗口集合…恢复" and "全部窗口同属单实例" in a Playwright contract needs a window-count/handle identity stance (multi-page context), never given (−4); nothing in the document states or brackets the 50/50 balance, and edge depth is uniform single-scenario (−4).
- **Environment realism (32/40)**: genuinely web/e2e-plausible — menu-driven tearout, parallel two-window operation, OS relaunch for single-instance. Deductions: accessibility dimension wholly absent (surface-web General Principles #4; interactive pane menu and window controls never touch keyboard/ARIA) (−3); no async wait/stability stance for window creation (surface-web async principle #5 — animation/settle before asserting) (−3); Step 1b "从操作系统再次启动应用" needs a second-process spawn caliber in e2e with instance-lock determinism (ERR_SINGLE_INSTANCE timing), unstated (−2).

### 6. Internal Consistency (一致性) — 140/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Invariants hold in every step | 56/60 | |
| Cross-step references consistent | 44/50 | |
| Risk level consistent with content | 40/40 | |

- **Invariants (56/60)**: all five invariants verified against all 10 steps — no step violates 单实例 (inv 1/5, exercised by 1b), 布局随项目记忆/删除清除 (inv 2), 数据内核事实源 (inv 3), or 记忆-实际恒一致 (inv 4). −4: invariant 1's second half — "关闭主窗口 = 退出应用(M1 语义继承)" — is *asserted but never exercisable* under this document: no step or edge closes the main window while detached windows exist, and the invariant does not state the design-resolved consequence (detached 随之关闭, tech-design.md L205), leaving the most safety-relevant window behavior untested. Declared-but-unwalked invariant, same class as split-pane-layout-memory's D14 (scope-narrowing, not violation — no −40 booked).
- **Cross-step references (44/50)**: numbering and antecedents otherwise sound (Phase 1 #2). −6: **Step 4 → Step 5 sequence gap** — Step 4 recalls the view ("视图收回主窗口 pane;布局记忆更新为收回后结构"), which empties the detached set, yet Step 5 ("重进恢复拆出态") expects "拆出窗口集合随项目记忆恢复…恢复态与离开时一致" — a non-empty tearout restore is presupposed with no re-tearout step in between. Under the document's own memory semantics, Step 5's assertion is only vacuously true after Step 4; a contract generator cannot produce a meaningful restore assertion from this sequence.
- **Risk level (40/40)**: Medium fits the rubric definition — multi-step interaction (tearout/parallel/recall/restore) with no irreversible side effects (layout-memory writes are reversible view state; window operations lose no user data).

### 7. Workflow Coverage (工作流覆盖度) — 128/150 (min 90, PASS; veto NOT triggered)

| Sub-criterion | Score | Notes |
|---|---|---|
| **Golden Path existence (veto)** | 57/60 | semantically verified |
| Multi-step coverage depth | 41/50 | |
| Completeness vs PRD scope | 30/40 | |

- **Golden Path (57/60)**: **semantic verification performed**: Steps 1→5 form a contiguous 5-step sequence covering Story 6 AC3 in order — 拆出 (Step 1 select → Step 2 tearout) → 并行操作互不干扰 (Step 3, AC3 near-verbatim) → 收回 (Step 4, UF10 Flow) → 记忆恢复 (Step 5, UF10 `restored` state) — extended by 必答⑨'s 多窗口 requirements (拆出窗口集合随项目记忆). Step language is domain-level throughout (选中 pane / 拆出为窗口 / 并行操作 / 收回 / 重进恢复); zero API/HTTP-level steps — no veto, no −15/step penalty. 分屏 (page-internal) is explicitly delegated to sibling split-pane-layout-memory, matching 必答⑨'s 交付顺序. −3: frontmatter `golden_path: false` while the content fully qualifies (legal feature-level assignment; same treatment as siblings).
- **Depth (41/50)**: a real window-state machine — single-window → multi-window → parallel → recalled → restored, plus instance-boundary, concurrency, and degraded-restore variants. −5: **project lifecycle × window set is a hole** — 归档/删除项目 while detached windows exist (the richest cross-entity interaction available on this surface, design-anchored) has no variant; −4: "拆出窗口**集合**" (plural, 必答⑨/UF10 "窗口集合 | list") is never exercised in the plural — every step tears out exactly one view ("某视图", "该视图", "独立窗口" singular); no two-detached-windows scenario, no second tearout, no per-window restore ordering.
- **PRD-scope completeness (30/40)**: 必答⑨ 多窗口's three elements (拆出并行 / 单实例不变 / 布局含拆出窗口集合随项目记忆) all covered ✓; UF10's three states (single-window/multi-window/restored) all exercised ✓; UF10 Data Requirements partially (窗口集合 ✓, 收回动作 ✓; 视图类型/尺寸/位置 fields not distinctly asserted). Gaps (design-layer, in-scope per "PRD/Design scope"): 归档 → 拆出窗口保持可用 + 标题追加「已归档」 (ui-design.md L586, page-map.md L71) untouched although the invariant block claims the memory side of project deletion (−3); 删除 → 该项目全部拆出窗口关闭 + toast untouched (−3); **拆出窗绑定来源项目,不随主窗激活指针** (task 4.3 "窗口语义:绑定来源项目(不随主窗激活指针)" — the BIZ-workbench-002 单激活-pointer distinction that makes a detached window NOT a second active project) untouched (−3); 收回原位即时恢复 (不待重启) unstated (−1).

---

## Deduction Log

| # | Dimension | Rule / ground | Deduction | Evidence quote |
|---|---|---|---|---|
| D1 | Surface Fitness | Mandatory web outcomes (`validation-error`, `session-expired`) completely absent, zero required_outcomes traces in doc → sub-criterion floor 0 | −60 (sub 0/60) | no mapping comment exists anywhere in the file (cf. sibling's "<!-- surface-web required_outcomes 映射:responsive-layout → … -->") |
| D2 | Completeness | Same absence mirrored in "required derived scenarios" | −20 (sub 42/70) | (as D1) |
| D3 | Completeness | No 归档/删除 × 拆出窗口 edges; 主窗关闭=退出 unexercised; Step 1 no variant | −8 | invariants list "关闭主窗口 = 退出应用(M1 语义继承)" with no exercising step |
| D4 | Completeness | Step 4 compound action + recall-quality caliber absent | −4 | "关闭独立窗口,选择收回主窗口" vs expected lacking 原位/即时 |
| D5 | Fact Alignment | Inferred-claim annotations: zero mappings, zero `source: inferred` markers; mandatory pair uncited | −40 (sub 10/50) | Steps 2b/3b/4b/5b all carry unannotated derived assertions |
| D6 | Fact Alignment | Step 4b forecloses UF10's "(或记忆保持拆出态)" branch and contradicts design close≡windowRecall, unmarked | −4 | "不恢复已关窗口、不残留不可达窗口引用" vs UF10 "关闭独立窗口可「收回」主窗口(或记忆保持拆出态)" vs tech-design L205 "OS 标题栏关闭 ≡ windowRecall" |
| D7 | Fact Alignment | "让位" vocabulary ungrounded (Step 2 + 2b) | −4 | "主窗口 pane 结构让位更新";"主窗口按布局规则让位呈现,不出现空白主窗口死区" |
| D8 | Fact Alignment | 数据内核 uncited conventions vocabulary; 选择收回 invented affordance | −4 | "两窗口呈现同一数据内核的派生视图";"选择收回主窗口" |
| D9 | Fact Alignment | Unmarked negative-UX failure-behavior assertions | −6 | "不崩溃"(5b);"互不覆盖互不丢失"(3b);"不出现空白主窗口死区"(2b) |
| D10 | Precondition Exclusivity | 3b precondition co-holds with Step 3's own expected state; distinguishing element only in "如" example | −10 (spread 54/60, 41/50) | "主窗口与独立窗口呈现同一项目数据(如同一任务状态面)" vs Step 3 "两窗口呈现同一数据内核的派生视图" |
| D11 | Precondition Exclusivity | 4b trigger = action frame; activation region possibly unreachable (design collapses close≡recall) | −8 (spread 41/50, 37/40) | "Precondition: 用户直接关闭独立窗口(不经收回动作)" |
| D12 | Semantic Purity | "(e2e 断言)"/"(断言)" tags inside Expected Results + Setup | −4 | "两侧互不干扰…(e2e 断言)"(3);"全部窗口同属单实例(断言)"(1b) |
| D13 | Semantic Purity | 4b precondition procedural; Setup 断言口径 mixing | −6 | "用户直接关闭独立窗口(不经收回动作)";"断言口径:…" |
| D14 | Semantic Purity | 数据内核 / 让位 tokens in outcomes (light: conventions-traceable / design-adjacent) | −4 | "同一数据内核的派生视图";"让位更新" |
| D15 | Internal Consistency | Step 4 recall empties detached set, Step 5 presupposes non-empty restore | −6 | "拆出窗口集合随项目记忆恢复(布局记忆的一部分);恢复态与离开时一致" directly after Step 4 "视图收回主窗口 pane" |
| D16 | Internal Consistency | Invariant "关闭主窗口 = 退出应用" declared but unwalked; detached-closure consequence absent | −4 | "全部窗口(主窗口 + 独立窗口)同属单实例;关闭主窗口 = 退出应用(M1 语义继承)" |
| D17 | Workflow Coverage | `golden_path: false` on a qualifying primary-story sequence | −3 | frontmatter `golden_path: false` |
| D18 | Workflow Coverage | Project archive/delete × windows absent; 集合 plural never exercised | −9 | "已注册项目含会话与看板数据"(Setup) — no second tearout anywhere; "拆出窗口集合" only ever singular in steps |
| D19 | Workflow Coverage | 归档标题追加 / 删除全部关闭 / 绑定来源项目 / 原位即时收回 unaddressed | −10 (sub 30/40) | ui-design.md L586 "归档 → 其拆出窗口保持可用,窗口标题追加「已归档」;删除 → 该项目全部拆出窗口关闭 + toast 通知" — no counterpart in journey |
| D20 | Surface Fitness | No loading/async stance; no window-set identity caliber; no balance statement | −12 (sub 38/50) | "拆出窗口集合记入布局记忆"(no enumeration stance for e2e) |
| D21 | Surface Fitness | A11y absent; window-open settle stance absent; Step 1b relaunch determinism unstated | −8 (sub 32/40) | "从操作系统再次启动应用"(no ERR_SINGLE_INSTANCE timing caliber) |

No Golden Path veto. No −25 surface-type violations (assertions are browser-appropriate). No −40 full invariant violations booked (D16 is declared-but-unwalked, not violated). No −30 hallucination instances booked (D6/D9 kept below that bar with rationale above). Risk level Medium: no deduction.

---

## Threshold Pass/Fail Table

| Dimension | Score | Min | Status |
|---|---|---|---|
| 1. Completeness | 167/200 | 120 | PASS |
| 2. Semantic Purity | 186/200 | 120 | PASS |
| 3. Precondition Exclusivity | 132/150 | 90 | PASS |
| 4. Fact Alignment | 92/150 | 90 | PASS (by 2) |
| 5. Surface Fitness | **70/150** | 90 | **FAIL** |
| 6. Internal Consistency | 140/150 | 90 | PASS |
| 7. Workflow Coverage | 128/150 | 90 | PASS (veto not triggered) |
| **Total** | **915/1150** | **975** | **FAIL** |

---

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. **[blindspot] Step 4b describes a window-close semantics the shipped system does not have.** tech-design.md L205 and task 4.3 record the design resolution: "OS 标题栏关闭 ≡ windowRecall(主窗 pane 原位恢复,不待重启)" — direct close IS recall. The journey instead posits a third path ("用户直接关闭独立窗口(不经收回动作)" → "不恢复已关窗口、不残留不可达窗口引用") and separately frames Step 4 as close-then-"选择收回". A downstream gen-contracts pass will emit a contract for an unreachable precondition and a contradiction with the recall contract. The step must either model close ≡ recall (design-grounded) or explicitly mark the branch as PRD-open ("或记忆保持拆出态") with `source: inferred`.
2. **[blindspot] 拆出窗 ≠ 第二激活指针 (BIZ-workbench-002 adjacency) is the journey's biggest semantic omission.** Task 4.3: "窗口语义:绑定来源项目(不随主窗激活指针);主窗切项目 B 后 A 窗仍 A 上下文". The single-active-pointer business rule is the reason a detached window is bound to its *source* project — no step exercises switching the main window to project B while project A's torn-out window stays in A's context. This is the core cross-entity interaction of the multi-window surface and it is entirely absent.
3. **[blindspot] Project lifecycle × window lifecycle untested.** ui-design.md L586: "归档 → 其拆出窗口保持可用,窗口标题追加「已归档」;删除 → 该项目全部拆出窗口关闭 + toast 通知(布局记忆随删除清除)". The journey's invariant block covers only the memory-clearing half ("项目删除时随之清除") — the window-closure half and the entire archive behavior (title suffix, window stays usable) have no invariant, no step, no edge.
4. **[blindspot] Window-set memory fields are never distinctly asserted.** UF10 Data Requirements: "窗口集合 | list | 布局记忆 | 视图类型/尺寸/位置" (tech-design `rect?: Rect`). Step 5's umbrella "恢复态与离开时一致" cannot tell a contract generator whether 视图类型 restore, 尺寸/位置 (rect) restore, or both are asserted — the only concrete sub-assertion given is the set's existence.
5. **[blindspot] Single-instance lock discipline absent from Setup.** Repo testing memory makes the active-instance check explicit before full e2e (ERR_SINGLE_INSTANCE pitfall; coexistence.md). Step 1b deliberately launches a second OS process — the Setup must state the instance-check precondition so the e2e run itself doesn't trip the lock it is testing.
6. **[blindspot] Restore performance caliber absent.** BIZ-workbench-005 / SC6 bound the workbench at 首屏 ≤2s (500 任务规模); re-entry with a remembered window set replays N window creations on top of first paint, and Step 5 asserts restore correctness with no timing stance against the inherited budget.
7. **[blindspot] No step-level cross-reference to split-pane sibling on the shared memory write path.** Both journeys write 主窗口 pane 结构 + 拆出窗口集合 through the same 布局记忆 (one `project_ui_state.layout_json` per tech-design L239); only the Overview carries the sibling delegation. A tearout necessarily mutates the pane structure the sibling's restore assertions depend on — without a step-level note, the two journeys' memory semantics can drift apart silently (same latent risk flagged in split-pane-layout-memory eval blindspot #7).

---

## Revision Priorities (for reviser)

1. **Surface Fitness (blocking)**: add explicit required_outcomes discharges for `validation-error` and `session-expired` in the task-session-roundtrip house style — natural mappings: validation-error → 拆出目标会话已失效/不可拆 (pane 菜单侧, 5b's family); session-expired → detached 会话视图所依 dsh 会话通道不可用 → 明确错误 + 恢复引导,不静默. Add literal `source: inferred` markers to every derived-outcome comment (2b/3b/4b/5b).
2. **Fact Alignment**: resolve Step 4/4b against the design resolution (close ≡ windowRecall, 原位即时) — either model it directly or keep both PRD branches explicitly marked as open/inferred; drop or ground "让位" vocabulary; mark "数据内核" with its conventions source.
3. **Internal Consistency**: insert a re-tearout (or restate Step 5 to run from a multi-window leave state) so "拆出窗口集合…恢复" is non-vacuously assertable after Step 4's recall.
4. **Workflow Coverage**: add the two design-anchored lifecycle edges — 归档项目 → 拆出窗口保持可用 + 标题追加「已归档」; 删除项目 → 全部拆出窗口关闭 + toast — plus one 主窗切项目 × 拆出窗仍绑定来源项目 step (BIZ-002 单激活 adjacency) and one two-detached-windows variant to exercise "集合" in the plural.
5. **Precondition Exclusivity**: restate 3b's precondition as the divergent state (同一数据面在两窗口镜像呈现, not merely 同一项目数据); restate 4b's precondition as a state (窗口已关闭且视图未收回) or replace the branch per revision 2.
