# Eval Report: journey/task-overview-review — Iteration 1

- **Eval type**: journey (rubric scale 1150, target 975, every dimension ≥ min threshold)
- **Surface**: web (rule: `gen-journeys/rules/surface-web.md`)
- **Scorer stance**: adversarial; every deduction cites the document
- **Date**: 2026-10-07

## Final Score

| Dimension | Score | Min Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 170/200 | 120 | YES |
| 2. Semantic Purity | 180/200 | 120 | YES |
| 3. Precondition Exclusivity | 132/150 | 90 | YES |
| 4. Fact Alignment | 110/150 | 90 | YES |
| 5. Surface Fitness | 106/150 | 90 | YES |
| 6. Internal Consistency | 132/150 | 90 | YES |
| 7. Workflow Coverage | 120/150 | 90 | YES |
| **Total** | **950/1150** | **975 + all thresholds** | **NO (total 950 < 975)** |

**Verdict: FAIL.** Every dimension clears its min threshold, but the total is 25 points below the 975 pass line. The document is faithful to PRD Story 1 and structurally clean; the deficit concentrates in the absent inference/N-A annotation mechanism (Fact Alignment), the partially-missed web mandatory derived outcomes (Surface Fitness), several UI-unexecutable or under-enumerated outcomes, and a set of mild sequencing/coverage gaps.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Workflow fidelity is high.** The 6-step happy path is a faithful extraction of PRD Story 1 and prd-spec 流程二 (items 1–6) plus UI Function 1. Spot-checks verify nearly verbatim: 「首屏呈现 ≤2s（机械判据）」 = SC2; 「IME 安全——中文组合态不被打断」 = 流程二 item 2; 「活跃优先：in_progress→blocked→pending→…→completed；最新创建：created_at 降序」 = 流程二 item 3 exact; 「chip disabled（禁用淡化）」 = UI Function 1 item 5; 「SVG 贝塞尔连线（完成边绿）」 = UI Function 1 任务子 tab DAG.
2. **Scope partitioning is deliberate and complete.** 7 journeys ↔ 7 stories (verified on disk). The transition-triggered autoRestore omitted from this journey's Step 5 is covered pipeline-side by `fix-chain-auto-recovery` Step 4b (「阻塞源 fix 任务被人工跳过（skipped…）→ auto-restore」) — acceptable partitioning, though this journey gives no cross-pointer.
3. **`golden_path: false` is a convention, not a defect.** All six non-dispatch siblings carry `false`; only `task-dispatch-pipeline` (SC-M2 核心场景) is `true`. The rubric's Golden Path criterion is content-based, and this document's Happy Path Steps 1–6 do form a content-level golden path for Story 1 — so the veto is not triggered.
4. **Real defects found**: (a) Step 5c is a self-negating, UI-unexecutable scenario; (b) web-mandatory `session-expired` is absent without any N/A annotation while `validation-error` is present in substance but uncited; (c) code-audit/methodology phrases embedded in browser-journey outcomes; (d) three sequencing soft spots (implicit sub-tab switch, Step 5 uses the drawer before Step 6 introduces it, Step 3 names DAG/泳道 before Step 4); (e) explicit enumerations under-cover PRD-specified content (list 副行, drawer regions); (f) the overview error state for an unavailable workspace DB is covered by no journey in the feature.

---

## Phase 2 — Dimension Scoring

### 1. Completeness — 170/200

**Metadata (48/50).** Frontmatter complete and valid: kebab-case `task-overview-review`, `risk_level: "High"` (justified — the workflow's core step mutates task state through irreversible-leaning transitions such as skip), `surface_types: ["web"]`, three real `sources` (including prd-ui-functions.md, which exists), `generated`. `golden_path: false` matches the sibling convention. Minor only: sources omit tech-design.md although invariant 4's 「allowedTransitions 纯函数，服务端同源提前校验」 is a design-level fact (see Fact Alignment).

**Steps complete (72/80).** All 6 happy steps carry `**User Action**` + `**Expected Result**` and the overall arc is coherent. Three deductions:
- The switch to the 任务 sub-tab never happens as a step. Step 1 opens the overview tab; Step 2's action is 「在任务子 tab 点击 feature pill」 — the intervening user action (selecting the 任务 sub-tab among 提案|feature|任务) is skipped, and per prd-spec 流程二 item 7 that switch itself has reset semantics worth a step.
- Step 5's action 「从抽屉或 ⋯ 菜单发起转移」 uses the drawer one step before Step 6 (「点击任务行 / DAG 节点 / 泳道卡片打开详情抽屉」) establishes how a drawer comes to exist — at Step 5's position in the sequence only the ⋯-menu branch is executable.
- Step 1 merges two entry paths with one outcome: 「点击 dock 开始页「项目概览」入口卡（或会话头挂接 pill）」 → 「dock 原位开出概览 tab」. Per prd-ui-functions UI Function 1 item 1, the pill path additionally opens the task drawer (「或会话头挂接 pill 点击 → dock 开概览 + 任务抽屉打开」) — that behavior is dropped from the expected result.

**Happy + required derived scenarios (50/70).** Happy path fully covered; 6 edge cases each with explicit Precondition (performance, IME search, 0-count chip, sort, empty reason, illegal target). `validation-error` is substantively present via Step 5b. Deductions: web-mandatory `session-expired` produced zero outcomes and zero consideration records (no N/A note, no rule citation); no empty-state outcome for a feature with zero tasks (PRD gives lanes a defined 0-count shape — 「0 计数列折叠为窄头」 — and chips a disabled shape, but the all-zero feature view is untested); no outcome for the overview error state when a workspace DB is unavailable (tech-design: 「概览错误态」); no chip toggle-off outcome (PRD: 「点击七态 chip → toggle 该状态」).

### 2. Semantic Purity — 180/200

**Natural language, no code/regex (70/80).** No regex patterns, CSS/XPath selectors, or framework assertion calls anywhere; outcomes are overwhelmingly observational (「列表无 watch / 回流 / 快照同步模块」 aside). Deduction: verification methodology is baked into outcomes — Step 1b: 「列表无 watch / 回流 / 快照同步模块（代码审计 0 个）」 states a static code property plus its audit procedure, not anything a user or browser observes; Step 2: 「数据全部直读每工作区库（数据来源断言，无第二来源）」 carries the SC2 assertion vocabulary into the observation. These are PRD-mandated judgments, but the phrasing is procedural.

**Preconditions declarative (58/60).** Setup and all six edge-case preconditions are states, not procedures (「概览首屏含 500 条任务的压力数据集」, 「转移对话框中 reason 留空」). Clean.

**No implementation coupling in steps (52/60).** Step actions are pure UI interactions — the strongest aspect of this document. Deductions: Step 5's expected result names the internal write layer — 「与 agent 写入同门（core 动词）」; invariant 4 names an implementation symbol — 「（allowedTransitions 纯函数，服务端同源提前校验）」; Step 4's 「DAG 呈现 SVG 贝塞尔连线」 describes rendering technology rather than appearance (minor, PRD-inherited).

### 3. Precondition Exclusivity — 132/150

**Distinctness across outcomes (54/60).** The six edge preconditions are pairwise distinct and no two outcomes within a step compete (each step has exactly one expected result). Deductions: Step 5c's precondition is a vacuous disjunction — 「所选目标态与当前态相同，或不在状态机允许集」: per tech-design Interface 10 the human-face allowed set is 「七态 − 当前态」, so the two disjuncts name the same excluded set and the disjunction adds no discriminative power. Step 1's two entry variants (入口卡 vs 挂接 pill) are not modeled as distinct conditions although their real behaviors diverge (drawer opens on the pill path).

**Sufficient to uniquely select (42/50).** Where states are constructible, selection is unique. Two failures: (a) Step 5c's precondition cannot be constructed through the described interface at all — the expected result itself concedes 「用户点不到非法目标」, so no reachable state selects this outcome, and no alternate construction path (e.g., direct RPC with an illegal toStatus) is given; (b) Step 1's merged entry paths mean the stated action does not determine which observed behavior applies (replace-tab vs pill-with-drawer).

**Missing preconditions for error/boundary outcomes (36/40).** All six boundary outcomes state an explicit trigger. Minor: Step 2b's trigger for the IME-composition sub-behavior lives in the action (「含中文组合输入过程」) rather than the precondition, and the 「切换子 tab 自动清空搜索」 assertion inside 2b's result depends on a sub-tab switch that has no step and thus no state.

### 4. Fact Alignment — 110/150

**Factual claims traceable (48/60).** Document-level traceability exists (frontmatter `sources`; Overview cites 「PRD Story 1；业务流程二；UI Function 1 + 任务详情抽屉」), and every spot-checked behavioral claim verifies against PRD/ui-functions/design (sort ordering, ≤2s@500, IME safety, 0-count disable, green completed edges, WYSIWYG target set). Deductions: no per-claim trace markers anywhere (no fact references, no UNKNOWN markings); and two explicit enumerations under-cover their PRD sources while reading as complete — Step 4's list secondary row 「副行类型 / 优先级 / 前置 / 挂接」 omits prd-spec's 「实际耗时[completed]/…/fix」, and Step 6's drawer enumeration 「通用区（类别彩色 chip + 优先级 + 复杂度）+ … + 执行时间线 + 挂接 + 转移入口」 omits 「预估耗时 + 实际耗时[completed] + breaking」 and the 「前置依赖」 section from 流程二 item 5. A test author asserting these lists as written would under-verify the UI.

**Inferred claims with rule support + `source: inferred` (28/50).** Zero `source: inferred` annotations and zero `required_outcomes` citations exist. Step 5b is a genuine `validation-error` analogue but is traced to the PRD AC, never linked to the web rule; `session-expired` was not considered at all (no derived outcome, no reasoned N/A). The annotation mechanism is entirely absent — identical failure mode to the sibling journeys.

**No hallucinated unclassified claims (34/40).** No claim contradicts PRD/design. Two mild unclassified inferences: Step 5b's 「无状态写入、无审计行」 (follows from design's 「动词服务内校验先于写」 but is presented as bare fact) and Step 5's 「概览列表即时反映新状态」 (design defines 即时 mechanically as 「写入返回后单次重取即见新值」 + 事件 ≤500ms; the journey's bare 「即时」 is an unmarked simplification).

### 5. Surface Fitness — 106/150

**Mandatory derived outcomes (34/60).** The web rule requires `validation-error` and `session-expired` to be considered for every Web Journey:
- `validation-error`: substantively present via Step 5b — 「拒绝提交（reason 必带），对话框留场可修正；无状态写入」 matches the rule's pattern (invalid/empty submission → rejected, correctable in place, not submitted), though the rule's 「error message displayed near the relevant field」 assertion is missing and the outcome is never tied to the rule.
- `session-expired`: completely absent with no N/A annotation. For a local single-user Electron workbench with no auth sessions this is likely genuinely inapplicable, **but the document never says so** — a reasoned N/A was the rule's minimum bar.
Not "completely absent", so the zero rule is not applied; partial credit only.

**Test strategy proportions (40/50).** Web guidance is balanced 50/50 Contract/Journey. As the feature's designated pure-UI journey, interaction-observational density is appropriate and rich (12 scenarios). Deduction: several outcomes are not executable at the web layer at all — 「（代码审计 0 个）」 and 「数据来源断言，无第二来源」 are static-analysis/contract concerns seated inside browser journey outcomes, skewing the executable proportion down.

**Environment/execution assumptions (32/40).** Setup is realistic for Playwright-driven Electron e2e (registered workspace, 500-task stress dataset for the performance scenario). Deductions: Step 5's 「即时反映」 lacks the single-refetch 判据 the design mandates for e2e, inviting fixed-timeout waits; Step 1b's 「首屏呈现 ≤2s」 defines no start/stop events (click-to-first-render?), leaving the mechanical 判据 unoperationalized for a browser executor.

### 6. Internal Consistency — 132/150

**Invariants hold in every step (56/60).** All five invariants checked against all 12 scenarios: direct-read/no-watch holds everywhere and is positively instantiated by 1b; reason-required + audit holds (5b asserts the negative space 「无审计行」); unified filter/sort across views holds in 3/4/4b; WYSIWYG target set holds in 5c (indeed, holds so strongly that 5c cannot occur — see Exclusivity); ≤2s@500 instantiated by 1b. No violations found.

**Cross-step references consistent (38/50).** Three soft defects, none dangling to a nonexistent step but each forcing the executor to improvise order:
- Step 5 references 「从抽屉…发起转移」 before Step 6 is the step that opens drawers.
- Step 2 operates 「在任务子 tab」 though no step performs the sub-tab selection from Step 1's fresh overview tab.
- Step 3's expected result 「列表（及 DAG / 泳道）仅显示…」 names the two alternate views one step before Step 4 introduces them; at Step 3's point only the list view has been seen.

**Risk level consistent (38/40).** High is right: the story's pivot is 「在任务行直接做人工状态决策」 — state mutations with audit writes, including skip (effectively irreversible). The browsing majority is read-only, but the mutation step is the workflow's purpose, so the classification stands with only a formal note.

### 7. Workflow Coverage — 120/150

**Golden Path existence (56/60, no veto).** Verified semantically: contiguous Steps 1–6 map one-to-one onto PRD Story 1 (「在概览页签按 feature 绑定浏览任务列表、用七态 chips 过滤、在任务行直接做人工决策」 → 「掌握任务域全貌并纠偏」) and prd-spec 流程二. Step titles are domain-level user operations (「选择 feature 绑定」「用七态 chips 过滤任务」), no API-level steps. Minor dock for the implicit sub-tab switch inside the sequence.

**Multi-step coverage depth (34/50).** Covers multi-entity reading (task↔feature binding), three view switches with unified filter/sort, search with IME boundary, a performance boundary, and a mutation workflow with two rejection boundaries. Missing depth for the overview surface: chip toggle-off (PRD: 「toggle 该状态」 — only filter-on is tested), multi-chip accumulation, filter+search composition, lane 0-count column collapse (「0 计数列折叠为窄头」), ov-head expand/collapse (「▾ 展开路径 4 行」), and the sub-tab-switch reset semantics beyond search.

**Workflow completeness vs PRD/Design scope (30/40).** Story 1's three ACs are each covered (AC1→Steps 2–3, AC2→Steps 5/5b/5c, AC3→Step 1b); 流程二 items 1–6 all have steps; item 7 only partially (search clearing asserted in 2b; chips + expand-state clearing not). Step 5 omits the PRD-specified terminal-transition consequence (prd-ui-functions: 「确认 → 留审计 + 若终态则触发 autoRestore」) — covered by `fix-chain-auto-recovery` Step 4b on the pipeline side, acceptable partitioning but with no cross-reference. The overview error state for an unavailable workspace DB (tech-design: 「概览错误态」 + isolation semantics) has no coverage in this or any sibling journey (grep-verified) — this journey is its natural owner.

**Cross-dimension coherence check.** Steps ↔ outcomes ↔ invariants ↔ risk level are mutually consistent; the 5c untestability manifests in Precondition Exclusivity and is carried as blindspot #1; the enumeration under-coverage is split between Fact Alignment (assertion-fidelity) and Workflow Coverage (scope), each scoring a different facet. No dimension double-charges the same defect.

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] Step 5c is unexecutable as written.** Precondition: 「所选目标态与当前态相同，或不在状态机允许集」 while the expected result itself states 「目标态仅列允许集——所见即所得，用户点不到非法目标」. Per tech-design Interface 10 the human face lists 「七态 − 当前态」, so neither disjunct is reachable through the UI — the scenario negates its own setup and no construction path (e.g., direct RPC with an illegal toStatus, exercising the server-side ERR_INVALID_TRANSITION guard) is stated. A downstream agent cannot build this case from the page.
2. **[blindspot] Workspace-unavailable overview error state is uncovered feature-wide.** Tech-design rules 「失败 → 该工作区标不可用…+ 概览错误态，应用与其余库照常」 — a designed, user-facing overview state. Neither this journey (the overview owner) nor any sibling mentions 不可用/隔离/错误态 (grep-verified). A corrupted-DB workspace opened from the start page is a classic production breakage with zero test representation.
3. **[blindspot] 「即时」 is left unoperationalized in the one step that depends on it.** Step 5: 「概览列表即时反映新状态」. The design's mechanical criterion is 「写入返回后单次重取即见新值」 + 事件 ≤500ms (SC7 e2e anchor; the dispatch journey states it explicitly). Without the 判据, an e2e author will wait on fixed timeouts — the exact flake source the design's wording exists to prevent.
4. **[blindspot] Chip filter is a toggle, tested only in one direction.** PRD: 「点击七态 chip → toggle 该状态」. The journey covers only 「点击某状态 chip…仅显示该 feature 该状态的任务」; de-selecting (return to all), multiple active chips, and chips interacting with search are all unspecified — a filter-state bug class with no outcome.
5. **[blindspot] Layer-mixing outcome cannot be executed by a web tester.** Step 1b: 「列表无 watch / 回流 / 快照同步模块（代码审计 0 个）」 is a source-audit assertion seated in a browser journey step; as written, a web e2e executor has no action that produces it. It should live in invariants/annotations with the audit named as its executor.
6. **[blindspot] Transition-dialog dismissal behavior is untested.** The dialog collects mandatory reason text and per ui-functions closes via 「Esc / 取消」; nothing verifies what happens to entered-but-unsubmitted reason text on dismissal (preserved vs discarded) — the web rule's `navigation-guard` family analog for this surface.
7. **[blindspot] Sub-tab switch resets are one-third asserted.** PRD 流程二 item 7: 「子 tab 切换时清空搜索 + chips + 展开态」; Step 2b asserts only 「切换子 tab 自动清空搜索」 — chips and expansion resets are dropped even though the journey elsewhere leans on chip state.

---

## Attack Summary (what must improve for iteration 2)

1. **[fact-alignment]** Introduce the claim-classification mechanism: annotate design-derived or rule-derived outcomes with `source: inferred` + basis (e.g., 5b's 「无审计行」 ← 「校验先于写」), and add a reasoned N/A for `session-expired` citing the web surface rule. Currently zero annotations exist.
2. **[surface-fitness]** Complete the `validation-error` outcome to the rule's assert shape (error message near the reason field) and link it to the web rule's `required_outcomes`.
3. **[precondition-exclusivity]** Rework Step 5c: either state the construction path (direct RPC with illegal toStatus → server-side rejection per ERR_INVALID_TRANSITION) or split it into "UI prevents selection" (an invariant note) and "server guard rejects" (an executable outcome with a stated setup).
4. **[internal-consistency]** Fix sequencing: add the 任务 sub-tab selection step between Steps 1–2, move the drawer-dependent transition branch after Step 6 (or make ⋯-menu the sole Step-5 entry), and defer 「（及 DAG / 泳道）」 in Step 3's result to Step 4.
5. **[completeness/fact-alignment]** Align the two render enumerations with PRD (list 副行 += 实际耗时[completed]/fix; drawer 通用区 += 预估耗时/实际耗时/breaking, plus 前置依赖 section) or explicitly scope them as partial.
6. **[workflow-coverage]** Add outcomes for: chip toggle-off/multi-select, sub-tab-switch full reset semantics (chips + 展开态), lane 0-count collapse, ov-head expand, the overview error state for an unavailable workspace DB, and the terminal-transition autoRestore consequence (or a cross-reference to `fix-chain-auto-recovery` Step 4b).
7. **[semantic-purity]** Move audit-methodology phrases (「代码审计 0 个」「数据来源断言，无第二来源」「core 动词」「allowedTransitions 纯函数」) out of step outcomes into the invariants section where their verification layer is named.
8. **[blindspot]** Operationalize 「即时反映新状态」 with the design's single-refetch 判据 and define the ≤2s measurement window for Step 1b.
