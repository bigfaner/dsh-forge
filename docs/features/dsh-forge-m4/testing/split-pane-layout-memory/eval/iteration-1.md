---
feature: dsh-forge-m4
journey: split-pane-layout-memory
iteration: 1
rubric: eval/rubrics/journey.md (1150pt, 7 dimensions)
surface: web (rules/surface-web.md)
score: 936
target: 975
status: fail (Surface Fitness below min threshold; total below target)
generated: 2026-09-30
---

# Eval-Journey Iteration 1 — split-pane-layout-memory

**Final Score**: 936/1150 (target 975) — **NOT reached**
**Threshold**: Surface Fitness 74/150 < 90 → dimension threshold FAIL; all other dimensions pass.
**Golden Path veto**: NOT triggered (semantically verified Golden Path present; see Workflow Coverage).

Scorer context loaded: `rules/surface-web.md` (SURFACE_TYPE=web, mandatory `validation-error` + `session-expired`, strategy 50/50), all 6 files in `docs/business-rules/` (esp. workbench.md BIZ-workbench-002/006/007, resilience.md), `prd/prd-user-stories.md` (Story 6 = ground truth), `prd/prd-spec.md` (必答⑨ 分屏/多窗口、必答⑧ 收起状态、Data Requirements 布局记忆), `prd/prd-ui-functions.md` (UF9/UF3/UF2), proposal Key Scenarios (L71 「分屏/多窗口」 verified). Reality-check cross-refs: `ui/ui-design.md` L564, `tasks/4.4-c9-split-panes.md`, sibling journeys (multi-window-tearout, project-workbench-home).

---

## Phase 1 — Reasoning Audit (pre-score anchors)

Trace of the journey's internal argument before rubric application:

1. **Story workflow trace (分屏→操作→调整→重进恢复→收口)**: Story 6's 分屏部分 has 2 in-scope ACs (AC3 多窗口 explicitly delegated). Step 1 ↔ single 默认态 baseline (UF9 States `single`); Step 2 ↔ AC1 (添加分屏, 两视图同屏可操作 — near-verbatim "e2e 断言"); Step 3 ↔ UF9 flow 拖拽调比例 + validation 复用组件; Step 4 ↔ AC2's subagent 收起 half (必答⑧/UF3); Step 5 ↔ AC2's 重进恢复 half (near-verbatim); Step 6 ↔ UF9 flow 关闭 pane → 布局自动记忆. **The step sequence does cover the story's workflow** — the macro argument is sound and tightly mapped.
2. **Cross-step references**: Step 5's restore enumeration ("pane 结构、比例与 subagent 收起状态") presupposes exactly the artifacts established by Steps 2/3/4 — grounded, unambiguous. Step 6 acts on the two-pane state built by Steps 2–5; 6b chains on 6. Edge numbering (2b/3b/5b/5c/6b) correctly binds each variant to its happy step. No dangling references found.
3. **Fact anchor spot-checks (all pass)**: 工作台头部「分屏」控制 (UF9 Placement); 可选视图 = 代码区/forge 文件区视图集 (UF9 Data Requirements); 会话/feature 任务面板/看板类 (UF9 Flow verbatim); 分屏不改变视图本身的功能面(复用同一视图组件) (UF9 Validation verbatim); 后代默认收起、行尾 ▾ 递归展开 (UF3 Data verbatim); 收起/展开状态随项目记忆 (必答⑧/UF3 Validation); 布局随项目、项目删除时随之清除 (prd-spec Data Requirements verbatim); 每组 >5 溢出折叠「展开其余 N 个会话」 (UF2/UF3); 知识区扩展位不渲染 (UF2 Validation, SC2 断言); M1 壳行为不受影响 (必答⑨); proposal 「分屏/多窗口」 (proposal.md L71). Traceability block checks out in full.
4. **Pre-identified weak seams** (scored in Phase 2): (a) web-surface mandatory derived outcomes (`validation-error`, `session-expired`) are completely absent — the sole required_outcomes trace is the non-mandatory `responsive-layout`; (b) Step 2b's precondition does not partition from Step 2's own expected result (always co-holds); (c) Step 5c's example "(如会话已归档)" conflates archive with deletion against the 归档≠删除 business rule; (d) no `source: inferred` markers anywhere; (e) Step 4 (subagent collapse) has no edge variant despite 必答⑥ specifying the descendant-cap boundary (默认 20 → 「查看全部」).

---

## Phase 2 — Dimension Breakdown

### 1. Completeness (完整性) — 170/200 (min 120, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Metadata complete | 49/50 | |
| Steps complete with required fields | 77/80 | |
| Happy path + required derived scenarios | 44/70 | |

- **Metadata (49/50)**: `journey: "split-pane-layout-memory"` kebab-case ✓; `risk_level: "Medium"` valid and fits content exactly (multi-step interaction; writes limited to reversible layout memory — see Internal Consistency 40/40); `surface_types/keys: ["web"]` ✓; `sources` lists all three PRD files ✓; `generated` ✓. −1: `golden_path: false` on a fully qualifying sequence (feature-level assignment to project-workbench-home is legal; same treatment as task-session-roundtrip).
- **Steps complete (77/80)**: 6 happy steps, each with User Action + Expected Result; coherent ordered sequence (enter → split → adjust → collapse → re-enter restore → close back to single). −3: Step 4's action is "展开/收起 subagent 后代列表" but its Expected Result answers only the collapsed-default half ("后代默认收起,行尾 ▾ 递归展开;收起/展开状态记入随项目记忆的布局状态") — the outcome of the 展开 action (UF3 `expanded` state: 内嵌后代列表呈现) is never stated.
- **Derived scenarios (44/70)**: boundary breadth is genuinely good for a layout workflow — enumeration boundary (2b), ratio extreme (3b), cross-project isolation (5b), restore-target-missing degradation (5c), all-closed re-entry consistency (6b). But: (a) the web-mandatory pair (`validation-error`, `session-expired`) is entirely unaddressed — no outcome, no mapping comment, no N/A discharge (−20; decisive, see Surface Fitness D1); (b) Step 4 has no edge variant although 必答⑥ specifies a concrete boundary on its surface — "后代数超上限(默认 20)时尾部呈现「查看全部」" (−4); (c) Steps 1 and 4 carry no edge variant at all (Medium-risk guidance: edge cases for each step with branching preconditions) (−3, folded here).

### 2. Semantic Purity (语义纯度) — 182/200 (min 120, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Natural language, no code/regex | 76/80 | |
| Preconditions declarative | 52/60 | |
| No implementation coupling in steps | 54/60 | |

- **Natural language (76/80)**: no regex, selectors, or `expect(...)`-style assertions anywhere; no CSS expressions (unlike task-session-roundtrip's `min(440px, 45vw)`). −4: test-caliber tags embedded inside Expected Results — Step 2 "两视图同屏可见且均可操作(e2e 断言)", Step 5 "pane 结构、比例与 subagent 收起状态恢复(重进恢复,e2e 断言)" — plus Setup's "断言口径 = 重进恢复(e2e 断言)". Inherited from the PRD's own convention, hence −4 not more.
- **Preconditions declarative (52/60)**: 5b/5c/6b are clean state descriptions ("两个项目各自摆过不同布局", "记忆布局中某视图的目标数据已删除…", "已关闭全部分屏至单视图"). −6: two edge preconditions are action-restatements, not divergent states — Step 2b "Precondition: 添加 pane 时察看可选视图集" (procedural/temporal frame duplicating its own User Action "打开视图选择") and Step 3b "Precondition: 分隔条拖至极值" (duplicates User Action "拖拽分隔条至边界"; the actual state — ratio at clamp boundary — is unstated). −2: Setup mixes assertion-caliber framing into preconditions ("断言口径 = 重进恢复(e2e 断言)…").
- **Implementation coupling (54/60)**: actions are user-level throughout (添加 pane / 拖拽分隔条 / 展开收起 / 重进 / 关闭 pane). −2: "origin=subagent" data-field token in the invariant ("顶层列表永不出现 origin=subagent 条目") — defensible as 必答⑥/UF3 domain vocabulary, hence light; −2: "复用同一视图组件" is a component-level implementation token (UF9-verbatim, retained); −2: "single 默认态" / "视图集" enum-spec vocabulary leaks UI-state-table language into outcomes (mild).

### 3. Precondition Exclusivity (前置条件互斥性) — 127/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Preconditions distinct across outcomes | 52/60 | |
| Sufficient to uniquely select an outcome | 41/50 | |
| No missing preconditions for boundary outcomes | 34/40 | |

- **Distinct (52/60)**: the five edges target disjoint surfaces (view enumeration / ratio extreme / cross-project / missing target / all-closed), and 5b/5c/6b are cleanly distinct states. −8: **Step 2 vs Step 2b do not partition** — Step 2's Expected Result already asserts "可选视图 = 当前项目可用的代码区/forge 文件区视图集", and 2b's precondition ("添加 pane 时察看可选视图集") is true in every Step-2 execution; both outcomes always co-apply, and 2b adds only the knowledge-zone exclusion. There is no state in which exactly one of Step 2 / Step 2b applies — same defect class as task-session-roundtrip's 3b/3c overlap, booked partial (not the full −20) because the assertions converge rather than contradict.
- **Sufficient to uniquely select (41/50)**: the same 2b pair leaves a contract generator unable to decide when 2b applies vs Step 2's own assertion (−6). −3: Step 3b's trigger is under-specified — "分隔条拖至极值" names the action, not the boundary state; whether mid-range drags also trivially satisfy "受最小可读宽度约束" is undecidable, so the outcome's activation region is fuzzy.
- **Missing preconditions for boundary outcomes (34/40)**: every edge carries a Precondition line ✓. −4: 2b's actual divergent trigger (项目存在未启用视图类型/知识区为扩展位) is buried in the Expected Result ("知识区扩展位视图不出现(未启用即不渲染)") instead of stated as the precondition. −2: 5c's trigger is blurred by its own example — "(如会话已归档)" describes an unreachable-but-existing target, not a deleted one (see Fact Alignment D5), leaving the real selector (数据已删除 vs 目标不可达) ambiguous.

### 4. Fact Alignment (事实依据) — 108/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Factual claims traceable | 52/60 | |
| Inferred claims: rule support + `source: inferred` | 20/50 | |
| No hallucinated unclassified claims | 36/40 | |

- **Traceable (52/60)**: the traceability block verifies in full — Story 6 (分屏部分), SC4, UF9, UF3 (收起状态随项目记忆 = UF3 Validation verbatim), UF2 (布局记忆字段 = UF2 Data Requirements), 必答⑨/必答⑧, proposal Key Scenarios 「分屏/多窗口」 (proposal.md L71 exists as cited). Every load-bearing step assertion traces to PRD/UF text (spot-list in Phase 1 #3). Deductions: −4: Step 5c's example misaligns a business rule — "记忆布局中某视图的目标数据已删除(如会话已归档)" conflates 归档 with 删除 against BIZ-workbench-006 / 必答⑤ ("归档 ≠ 删除…保历史分组可找回") and UF3 (归档会话行消失但经设置页可恢复: target unreachable ≠ target deleted); −2: Step 1 "此前无布局记忆时无残留布局" is a soft negative-UX claim with no source and no marking; −2: Step 2's "当前项目可用" qualifier is the journey's own extension of UF9's plain "代码区/forge 文件区视图" enum (mild, unmarked).
- **Inferred claims (20/50)**: exactly one derived-outcome annotation exists — "<!-- surface-web required_outcomes 映射:responsive-layout → pane 比例在窗口尺寸变化下保持可用(最小宽约束),内容不溢出不可读 -->" — and `responsive-layout` is an *additional common* outcome, not one of the two mandatory ones. No literal `source: inferred` marker anywhere in the document (rubric-explicit format) (−4); free unmarked inferences: Step 3b "不失能、不产生 0 宽死区;松手后布局可继续操作" (a design-grounded fact exists — ui-design.md L564 "钳制 30%–70%,两侧 pane 最小宽 30%" — but the journey cites neither it nor an inference rule), Step 5c "恢复不崩溃;缺失目标降级呈现(空态/可替换)" (whole outcome is an inference with no rule citation), Step 5b "项目间布局互不串扰" (derivable from 随项目记忆, semi-factual) (−8); and the mandatory pair (`validation-error`, `session-expired`) has no rule citation, discharge, or N/A note at all (−18). Net 20/50 — same band as project-workbench-home (which scored 20/50 for the identical miss).
- **Unclassified hallucinations (36/40)**: nothing rises to hallucination — no invented error codes, exit codes, or messages; every behavior-level assertion either traces to PRD/UF or is a conservative composition of traced facts. −4: unmarked failure-behavior assertions that read as factual — "恢复不崩溃"(5c), "不失能、不产生 0 宽死区"(3b), "无残留布局"(1) — kept below the −30 hallucination bar because they are negative-UX expectations, not fabricated specifics.

### 5. Surface Fitness (Surface 适配) — 74/150 (min 90, **FAIL**)

| Sub-criterion | Score | Notes |
|---|---|---|
| Mandatory derived outcomes present | **0/60** | rubric floor rule applied |
| Test strategy proportions (50/50) | 40/50 | |
| Realistic web/e2e assumptions | 34/40 | |

- **Mandatory outcomes (0/60)**: surface-web.md declares "Mandatory derived Outcomes (must be considered for every Web Journey): validation-error… session-expired…". Both are completely absent from this journey — no outcome, no mapping comment, no N/A justification. The only required_outcomes trace is the non-mandatory `responsive-layout` (Step 3b comment). The rubric instructs "Score 0 if mandatory Outcomes are completely absent" — floor applied, exactly as in project-workbench-home iteration 1 (same generation batch). The house discharge pattern was available and demonstrated by sibling `task-session-roundtrip/journey.md` L91/L117; natural mappings existed here too (validation-error → pane view-target invalid/unavailable at restore, i.e., 5c's family; session-expired → dsh host/会话通道不可用 during pane operations or restore), so silence is a generation miss, not a convention gap.
- **Strategy proportions (40/50)**: 11 outcomes — 6 journey-level traversal steps (full rendering + restart persistence = Journey-smoke material) vs 5 preconditioned boundary cases (enumeration, clamp, isolation, degradation, closure consistency = Contract material); the edges are more contract-assertable than project-workbench-home's, hence 40 vs their 38. Deductions: no loading/async observation anywhere although re-entry restore is an async surface (UF2 declares `loading` 分区骨架屏; `loading-state` is a listed common web boundary) (−4); nothing in the document states or brackets the 50/50 balance, and edge depth is uniform single-scenario (−6).
- **Environment realism (34/40)**: genuinely web-e2e-realistic — drag-based separator interaction, "典型断言组合:会话 + 看板(或任务面板)两 pane 同屏可操作" fixture, per-combination e2e assertion caliber. Deductions: no determinism caliber for ratio assertions — Step 3/Step 5 assert 比例即时生效/恢复 with no measurement stance (proportion-of-width with tolerance), which a Playwright contract will need (−3); accessibility dimension wholly absent — surface-web General Principles #4 requires keyboard reachability/ARIA consideration for interactive elements, and the design layer defines a concrete separator keyboard model (tasks/4.4: "分隔条键盘模型(role=separator + aria-valuenow;←/→ ±2%…)") that the journey never touches (−3).

### 6. Internal Consistency (一致性) — 142/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Invariants hold in every step | 56/60 | |
| Cross-step references consistent | 46/50 | |
| Risk level consistent with content | 40/40 | |

- **Invariants (56/60)**: all five invariants verified against all 11 steps — no step places a subagent in the top level (inv 3), violates 功能面不变 (inv 1), or contradicts 布局随项目记忆/删除清除 (inv 2) or M1 壳不受影响 (inv 5). −4: inv 4 — "每组会话 >5 条溢出折叠为「展开其余 N 个会话」;溢出/收起状态随项目记忆" — is (a) unexercisable under the declared Setup (no >5-per-group session fixture is required), and (b) silently narrowed by the journey's own restore assertion: Step 5 restores "pane 结构、比例与 subagent 收起状态" only, never the 溢出 dimension the invariant promises is remembered. Declared memory scope > asserted restore scope, inside the same document.
- **Cross-step references (46/50)**: numbering and antecedents sound (Phase 1 #2). −2: the Step 5 restore enumeration vs invariant 4 narrowing above. −2: Overview promises "同屏操作多个 pane" but every step exercises exactly the two-pane shape — no step adds, removes, or swaps panes beyond the initial pair, so the "多个" claim is never carried by the steps.
- **Risk level (40/40)**: Medium fits the rubric definition verbatim — multi-step interaction (add/drag/collapse/re-enter/close) with no irreversible side effects (layout memory writes are reversible view state, not user data).

### 7. Workflow Coverage (工作流覆盖度) — 133/150 (min 90, PASS; veto NOT triggered)

| Sub-criterion | Score | Notes |
|---|---|---|
| **Golden Path existence (veto)** | 57/60 | semantically verified |
| Multi-step coverage depth | 42/50 | |
| Completeness vs PRD scope | 34/40 | |

- **Golden Path (57/60)**: **semantic verification performed**: Steps 1→5 (closed by 6) form a contiguous 6-step sequence covering Story 6's in-scope ACs in order — AC1 (Step 1 single baseline → Step 2 添加分屏,两视图同屏可操作) and AC2 (Step 3 比例 + Step 4 收起 → Step 5 重进恢复), near-verbatim against the AC text. Step language is domain-level throughout (分屏/pane/比例/收起/重进恢复); zero API/HTTP-level steps — no veto, no −15/step penalty. AC3 (多窗口) is explicitly out of this journey's scope with a named sibling (multi-window-tearout), matching 必答⑨'s 交付顺序 (分屏先于多窗口). −3: frontmatter `golden_path: false` while the content fully qualifies — legal feature-level assignment (project-workbench-home holds the flag) but an unlabeled qualifying sequence invites downstream promotion mis-prioritization (same treatment as task-session-roundtrip).
- **Depth (42/50)**: a real layout state machine — single → split → adjusted → persisted → restored → closed-back-to-single, plus cross-project isolation and restore-time degradation. No entity lifecycle/cross-entity work, legitimately delegated to sibling journeys per the Overview. −5: single-shape depth — only the two-pane combination is ever exercised; 必答⑨ says "pane 数量与比例随项目记忆" (plural quantity) and the Overview promises "同屏操作多个 pane", yet no 3-pane, pane-swap, or re-add-on-existing-split variation exists; −3: no restore-vs-live divergence recovery beyond 5c (e.g., re-picking a view for a degraded pane — the "可替换" affordance is asserted but never reachable).
- **PRD-scope completeness (34/40)**: Story 6 AC1/AC2 fully covered, AC3 delegated; UF9 flow fully covered (添加→选择→拖拽→关闭→记忆→重进恢复) and all three UF9 states exercised (single/split/restored). Gaps: 必答⑥ descendant-cap boundary "后代数超上限(默认 20)时尾部呈现「查看全部」" untouched although Step 4 claims the collapse surface (−3); 溢出折叠状态恢复 asserted by invariant but never stepped (−2); 必答⑧ "展开动画不阻塞列表滚动" unaddressed (−1).

---

## Deduction Log

| # | Dimension | Rule / ground | Deduction | Evidence quote |
|---|---|---|---|---|
| D1 | Surface Fitness | Mandatory web outcomes (`validation-error`, `session-expired`) completely absent → sub-criterion floor 0 | −60 (sub 0/60) | only mapping in doc: "surface-web required_outcomes 映射:responsive-layout → pane 比例在窗口尺寸变化下保持可用…" |
| D2 | Completeness | Same absence mirrored in "required derived scenarios" | −20 (sub 44/70) | (as D1) |
| D3 | Completeness | Step 4 boundary missing (必答⑥ 后代超上限 → 「查看全部」); Steps 1/4 no edge variant | −7 | "后代默认收起,行尾 ▾ 递归展开"(no cap variant anywhere) |
| D4 | Completeness | Step 4 Expected Result answers only the collapsed half of its own action | −3 | "**User Action**: 在左栏 parent 会话行展开/收起 subagent 后代列表" vs expected stating only 默认收起 |
| D5 | Fact Alignment | Inferred-claim annotations: rule citation for 1 non-mandatory family only; no `source: inferred` marker anywhere; mandatory pair uncited | −30 (sub 20/50) | "<!-- surface-web required_outcomes 映射:responsive-layout → … -->"(sole instance) |
| D6 | Fact Alignment | 归档≠删除 misalignment in 5c example (BIZ-workbench-006/必答⑤) | −4 | "记忆布局中某视图的目标数据已删除(如会话已归档)" |
| D7 | Fact Alignment | Soft unmarked claims | −6 | "此前无布局记忆时无残留布局"(1);"恢复不崩溃"(5c);"不失能、不产生 0 宽死区"(3b) |
| D8 | Precondition Exclusivity | 2b does not partition from Step 2 (precondition always co-holds with happy path) | −14 (spread 52/60, 41/50) | "Precondition: 添加 pane 时察看可选视图集" |
| D9 | Precondition Exclusivity | 3b trigger state under-specified (action restatement, not boundary state) | −3 | "Precondition: 分隔条拖至极值" |
| D10 | Precondition Exclusivity | 2b real trigger buried in outcome; 5c selector blurred by its own example | −6 | "知识区扩展位视图不出现(未启用即不渲染)" |
| D11 | Semantic Purity | "(e2e 断言)" markers inside Expected Results (+ Setup) | −4 | "两视图同屏可见且均可操作(e2e 断言)"(2);"…恢复(重进恢复,e2e 断言)"(5) |
| D12 | Semantic Purity | Procedural precondition fragments (2b/3b) | −8 | "分隔条拖至极值";"添加 pane 时察看可选视图集" |
| D13 | Semantic Purity | Data/component tokens in outcomes (PRD-traceable, hence light) | −6 | "顶层列表永不出现 origin=subagent 条目";"复用同一视图组件" |
| D14 | Internal Consistency | Invariant 4 unexercisable under Setup fixture + Step 5 restore narrows its memory scope | −4+−2 | "每组会话 >5 条溢出折叠…溢出/收起状态随项目记忆" vs Step 5 "pane 结构、比例与 subagent 收起状态恢复" |
| D15 | Internal Consistency | Overview "多个 pane" promise vs two-pane-only steps | −2 | "同屏操作多个 pane" |
| D16 | Workflow Coverage | `golden_path: false` on a qualifying primary-story sequence | −3 | frontmatter `golden_path: false` |
| D17 | Workflow Coverage | Two-pane-only depth; no pane re-configuration variation; degraded-pane forward path unreachable | −8 | "关闭一个 pane 至单视图"(only pane-count change in doc) |
| D18 | Workflow Coverage | 必答⑥ descendant cap, 溢出恢复, 动画不阻塞 unaddressed | −6 | "收起/展开状态记入随项目记忆的布局状态"(无「查看全部」/溢出恢复) |
| D19 | Surface Fitness | No loading/async observation; no ratio-measurement caliber; keyboard/a11y absent | −16 (subs 40/50, 34/40) | "比例即时生效"(no tolerance);design "role=separator + aria-valuenow" untouched |

No Golden Path veto. No −25 surface-type violations (assertions are browser-appropriate). No −40 full invariant violations booked (D14 is scope-narrowing, not violation). No −30 hallucination instances booked (D6/D7 kept below that bar with rationale above). Risk level Medium: no deduction.

---

## Threshold Pass/Fail Table

| Dimension | Score | Min | Status |
|---|---|---|---|
| 1. Completeness | 170/200 | 120 | PASS |
| 2. Semantic Purity | 182/200 | 120 | PASS |
| 3. Precondition Exclusivity | 127/150 | 90 | PASS |
| 4. Fact Alignment | 108/150 | 90 | PASS |
| 5. Surface Fitness | **74/150** | 90 | **FAIL** |
| 6. Internal Consistency | 142/150 | 90 | PASS |
| 7. Workflow Coverage | 133/150 | 90 | PASS (veto not triggered) |
| **Total** | **936/1150** | **975** | **FAIL** |

---

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. **[blindspot] Layout-memory write timing unspecified.** Design layer says 拖拽即时存 (ui-design.md L564 "拖分隔条→比例即时存(钳制 30%–70%)"; tasks/4.4 同), but the journey only asserts visual effect ("比例即时生效") and post-leave restore (Step 5). Whether the ratio survives an *ungraceful* exit (app kill after drag, before leave) is undecidable from the document — the persistence-caliber boundary (per-action write vs on-leave write) determines if Step 5's assertion holds in crash scenarios, and resilience.md's degradation discipline would apply.
2. **[blindspot] The clamp fact was citable, not inferable.** Step 3b re-derives "pane 收缩受最小可读宽度约束" as a responsive-layout inference when the design layer states it concretely ("钳制 30%–70%,两侧 pane 最小宽 30%", ui-design.md L564 / tasks/4.4). Citing it would upgrade 3b from inferred to traceable and give the downstream contract exact bounds.
3. **[blindspot] 必答⑥/⑧ count-badge vs UF3 「无计数徽标」 discrepancy silently sidestepped.** Step 4 asserts no badge behavior at all — safe today, but a downstream gen-contracts pass reading 必答⑧ ("徽标计数 = 运行中数 + 历史总数") will emit a contradictory assertion against UF3's 2026-09-25 原型验收定形 ("**无计数徽标**,计数入 hover 卡"). The journey should name UF3 as the later authority (same latent conflict flagged in task-session-roundtrip eval).
4. **[blindspot] Single-instance lock discipline absent from Setup.** Repo testing memory makes the active-instance check explicit before full e2e (ERR_SINGLE_INSTANCE pitfall); Step 5's 离开后重进 pattern relaunches/re-enters the real shell and needs the instance-check precondition stated (sibling project-workbench-home eval flagged the identical gap).
5. **[blindspot] Degraded pane has no forward path.** 5c's "缺失目标降级呈现(空态/可替换)" asserts a replace affordance that no step or edge can reach — re-picking a view for an existing degraded pane is never exercised, leaving a contract hole for the recovery interaction.
6. **[blindspot] Restored-entry performance caliber absent.** BIZ-workbench-005 / SC6 bound the workbench at 首屏 ≤2s (500 任务规模); layout replay on re-entry adds restore work on top of first paint, and the journey asserts restore correctness with no timing stance against the inherited budget.
7. **[blindspot] Overlap with sibling not cross-referenced at step level.** Step 5b (跨项目布局隔离) overlaps multi-window-tearout's memory-isolation surface (拆出窗口集合随项目) and project-workbench-home's project-switch behavior; only the Overview carries the cross-reference, so revisions to either sibling's memory semantics can drift apart from this journey's 5b/6b silently.

---

## Revision Priorities (for reviser)

1. **Surface Fitness (blocking)**: add explicit required_outcomes discharges for `validation-error` and `session-expired` in the task-session-roundtrip house style — natural mappings: validation-error → pane view-target invalid/unavailable (5c family); session-expired → dsh host/会话通道不可用 during pane operation or restore → 明确错误 + 恢复引导,不静默. Add literal `source: inferred` markers to every derived-outcome comment (3b/5b/5c/6b).
2. **Precondition Exclusivity**: restate 2b's precondition as the divergent state (e.g., "项目存在未启用的扩展位视图类型(知识区)"), not "添加 pane 时察看可选视图集"; restate 3b's precondition as the boundary state (e.g., "分隔条已拖至钳制边界,比例达最小宽限制"), not the action.
3. **Fact Alignment**: fix 5c's example — split 已删除 vs 已归档不可达 or drop the 归档 example (归档≠删除 per BIZ-workbench-006/必答⑤); ground 3b's clamp in the design fact or keep it consistently marked inferred.
4. **Completeness / Workflow Coverage**: add Step 4's descendant-cap edge (必答⑥ 默认 20 → 「查看全部」); extend Step 5's restore enumeration to the 溢出 dimension or narrow invariant 4; add one 3-pane / pane-swap variation to carry the "多个 pane" promise.
5. **Semantic Purity**: move "(e2e 断言)" tags from Expected Results into Setup's 断言口径 block; naturalize "origin=subagent"/"复用同一视图组件" tokens or accept as PRD-verbatim with a note.
