# Journey Eval Report — iteration 1

- **Document**: `docs/features/dsh-forge-m2/testing/task-board-browsing/journey.md`
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, target 975, every dimension ≥ threshold)
- **Surface**: web (`rules/surface-web.md`); test strategy Web = balanced 50/50; mandatory derived outcomes: `validation-error` + `session-expired`
- **Scorer persona**: Senior QA Engineer (adversarial)
- **Verdict**: **FAIL** — Total 977/1150 (≥ 975) BUT Surface Fitness 88/150 < 90 threshold. Pass requires both conditions; the conjunction fails.

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 174/200 | 120 | ✓ |
| 2. Semantic Purity | 198/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 142/150 | 90 | ✓ |
| 4. Fact Alignment | 122/150 | 90 | ✓ |
| 5. Surface Fitness | **88/150** | 90 | **✗** |
| 6. Internal Consistency | 134/150 | 90 | ✓ |
| 7. Workflow Coverage | 119/150 | 90 | ✓ |
| **Total** | **977/1150** | 975 | **✗ (dimension threshold miss)** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Chain check (problem → solution → evidence → success criteria)**: The journey addresses PRD Why ① (工程资产散落, tasks/deps only via terminal `forge task list`) with the read-only task board (dep tree, status grouping/list view, worktree marks, detail panel). Step-level tracing to Story 1 is near-verbatim: Step 1 ← Story 1 AC1 + SC1 + G1; Step 2 ← UF2 Data Requirements (7 态, branch column); Step 3 ← UF2 flow 3; Step 4 ← Story 1 AC2; Step 5 ← Story 1 AC3 + UF3. The journey genuinely exercises the user story it claims — the chain is sound.

**Pre-score anchors recorded before rubric scoring**:

1. **Anchor A (surface discipline entirely absent)**: Zero engagement with the web surface's mandatory `required_outcomes` (`validation-error`, `session-expired`) — no mapping, no exclusion note, no `source: inferred` annotations anywhere. The revised sibling journey (`task-session-execution-loop`) now carries explicit `surface-web required_outcomes 映射` comments, establishing what compliance looks like in this pipeline; this document has none.
2. **Anchor B (scale-assertion executability)**: Step 1 asserts "首屏 ≤2 秒(500 任务规模)" while Setup establishes only "≥10 个任务" — the timing bound cannot be executed as written. (The revised sibling fixed this same defect by scoping the计时口径 to Setup's actual scale.)
3. **Anchor C (fixture gaps)**: Setup does not establish the enabling facts three steps depend on — a task with non-default-worktree execution traces (Step 4), tasks with execution branch names (Step 2 column), and a second registered project with zero tasks (edge 2b). Edge 1b additionally requires *corrupting* forge data while Setup nominates the live production repo as fixture.
4. **Anchor D (edge misanchoring)**: Step 2b's Precondition and User Action ("用户进入任务看板") make it a variant of Step 1 (打开任务看板), not Step 2 (切换状态分组/列表视图).
5. **Anchor E (invariant over-claim)**: Invariant 3's absolute "只读浏览操作不产生任何 forge 数据或工作台自有状态的变更" collides with DF005, which lists 视图状态 as workbench-own-state with 按需 local read/write — Steps 2/3 are precisely view-state-changing interactions.
6. **Anchor F (risk/structure sound)**: `risk_level: Low` correct (purely read-only; rubric expects Low = read-only). `golden_path: false` is correct bookkeeping — the feature's Golden Path is owned by `task-session-execution-loop` (`golden_path: true`, Overview claims it explicitly). No internal self-contradiction found beyond the mapping tensions above.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 174/200

**1a. Journey metadata (50/50)** — Name `task-board-browsing` kebab-case ✓; `risk_level: Low` valid and justified (every step is read-only observation; invariants enforce it) ✓; `golden_path: false` consistent with the feature-level delegation to `task-session-execution-loop` ✓; `surface_types`/`surface_keys` populated ✓; sources list all three PRD files ✓; `generated` present ✓. Full marks.

**1b. Steps complete with required fields (75/80)** — All 5 happy steps have User Action + Expected Result and form a coherent ordered sequence matching UF2's interaction flow plus Story 1. Deduction −5: Step 4's action is a targeting description, not an executable action:

> "**User Action**: 查看在非默认 worktree 有执行痕迹的任务卡片/详情"

A downstream agent cannot execute this — it is not told how to *find* such a task, and Setup never establishes one exists (see 3c). The action describes the test's oracle object, not a user operation.

**1c. Outcomes cover happy path + required derived scenarios (49/70)** — Boundary/error outcomes present: read failure with retry (1b), no-task empty state (2b), filter-empty state (3b, traced to UF2's own validation rule). Deductions:
- −15: the surface-web **mandatory** derived outcomes are unconsidered. `validation-error` has only an unlabeled partial analog (3b covers the invalid-combination/no-result boundary, not form validation); `session-expired` has no analog, no exclusion note, nothing. Neither is derived from, cited to, or reconciled with the web `required_outcomes` rules — the page contains zero evidence of consideration.
- −6: `loading-state` (web additional common outcome; UF2 documented state "loading | 骨架/进度 | 首次加载/切换项目") is absent — a natural boundary for a board whose first-load timing Step 1 asserts.

### 2. Semantic Purity — 198/200

**2a. Natural language outcomes (78/80)** — No regex, selectors, or framework assertions anywhere; outcomes describe what the user observes. Dock −2 (pipeline-consistent with sibling scoring): Step 1's expected result is phrased as a verification mechanism rather than an observation — "任务数/状态/依赖与 `forge task list` 输出一致" (see also Phase 3 B2).

**2b. Preconditions declarative (60/60)** — Setup bullets and all three edge Precondition fields are declarative states ("forge 任务数据读取失败(文件损坏/权限异常)", "注册激活的项目没有任何任务数据"). Full marks.

**2c. No implementation coupling in steps (55/60 → 60/60)** — Steps are user-level operations (进入看板 / 切换视图 / 使用筛选器 / 点击卡片). "`.forge`/`docs/features`", "7 态", "`forge task list`" are all PRD-verbatim domain terms. Unlike the sibling, no step couples a web observation to an out-of-surface execution channel. Full marks.

### 3. Precondition Exclusivity — 142/150

**3a. Distinct across outcomes (60/60)** — The three edge preconditions are mutually distinct and specific: read-failure (corrupt/permission), readable-but-empty, filter-no-match. The Step 1 family (happy / 1b / 2b) is selected purely by precondition and each pair is distinguishable.

**3b. Sufficient to uniquely select (50/50)** — Given Setup plus an edge precondition, exactly one outcome applies. No ambiguous scenario found.

**3c. No missing preconditions for error/boundary outcomes (32/40)** — Edges state their triggers ✓. Dock −8: happy steps carry enabling conditions inside the action text instead of as established preconditions, and the fixture does not guarantee them:
- Step 4 requires "在非默认 worktree 有执行痕迹的任务" — Setup's fixture ("≥10 个任务…含依赖关系…含 M1 已完成任务") never establishes such a task exists; the step may be unexecutable as written.
- Step 2's "任务执行分支名在列表视图列展示" requires tasks with execution branches — likewise unestablished.
- Step 5's "已有执行记录的任务" is only inferable (M1 completed tasks imply records), still undeclared.

### 4. Fact Alignment — 122/150

**4a. Factual claims traceable (54/60)** — Traceability is strong: nearly every expected result is a near-verbatim PRD trace (≤2s/500 ← G1 metric; 一致性 ← SC1/G1; 含已完成历史任务 ← SC1; 7 态分组 + 分支名列 ← UF2 Data Requirements; 即时更新 ← UF2 flow 3; worktree 角标 ← Story 1 AC2/UF2; 详情三要素 + 挂接空态 ← Story 1 AC3/UF3; error+retry ← UF2 error state; 空态引导 ← UF2 empty state; 筛选空态 ← UF2 validation rule). Dock −6: Invariant 3's absolute claim

> "只读浏览操作不产生任何 forge 数据或工作台自有状态的变更"

is only partially traceable — BIZ-task-ops-001 ("看板仅呈现、不写回") grounds the forge-data half, but DF005 lists 视图状态 as workbench-own-state with 按需 local read/write, and no source establishes that view switching/filtering writes nothing. Unverified absoluteness without UNKNOWN marking.

**4b. Inferred claims have rule support + `source: inferred` (28/50)** — The document contains derived boundary content and *none* of it carries a `source: inferred` annotation or a `required_outcomes` citation:
- 3b "清除筛选后视图恢复" — recovery semantics beyond UF2's validation rule (which only defines the empty state);
- 1b "应用不崩溃、不展示残缺或错误的数据" — crash-containment/no-partial-data atomicity derivations beyond UF2's error-state row;
- the mandatory web outcomes (Anchor A) are neither derived-from nor excluded-by the rules.

Half credit: the derivations are individually sensible; the annotation discipline required by the rubric is entirely absent.

**4c. No hallucinated unclassified claims (40/40)** — Sweep of every assertion found no inverted or invented behavior: all headline claims trace to PRD/business-rule text; the derived clauses are sensible inferences (scored under 4b); the invariant-3 over-breadth is a traceability weakness (scored under 4a), not a hallucination. No −30 instances.

### 5. Surface Fitness — 88/150 (BELOW THRESHOLD)

**5a. Mandatory derived outcomes present (20/60)** — `validation-error` and `session-expired` are the two mandatory web outcomes. On the page:
- `validation-error`: no form exists in this workflow; the closest functional analog is 3b ("显示明确空态,不显示错误" — UF2's own validation rule), which is neither labeled nor derived from the web rule;
- `session-expired`: no analog, no exclusion note, no consideration evidence of any kind.

For calibration: the sibling journey at its iteration 1 scored 35/60 with two unlabeled functional analogs; this journey has one weaker analog and nothing for the second mandatory outcome. Not scored 0 — the boundary content is not "completely absent" — but the consideration discipline the rule demands ("must be considered for every Web Journey") is entirely missing from the page. HARD-RULE applied: score only what is on the page.

**5b. Test strategy proportions (34/50)** — Journey-smoke side is solid (5 contiguous real browse operations). Contract side is thin: 3 boundary outcomes, no per-step alternates on the hot steps (view load, filter application), no async/timing boundary, no recovery exercise (see 7b). Web's balanced 50/50 wants comparable weight on both sides; here journey depth clearly exceeds contract depth.

**5c. Realistic web environment/execution assumptions (34/40)** — Browser-interaction assumptions are realistic (navigate, switch views, operate filters, click cards); all triggers are user-drivable (unlike the sibling's agent-triggered step). Dock −6: an execution assumption that cannot run in the declared environment —

> "**Expected Result**: …首屏 ≤2 秒(500 任务规模)"

against Setup's "该项目含 ≥10 个任务". The 500-task performance bound is asserted in a fixture established at ≥10 tasks; a downstream runner cannot execute the timing assertion as written. (Note: the sibling's iteration-1 report treated this identical pattern as a rubric-external blindspot; this scorer charges it here because 5c's own text — "environment and execution assumptions are realistic… Unrealistic assumptions indicate poor surface adaptation" — covers it. Either way the reviser must fix it; the revised sibling's wording "计时口径 = Setup 实际任务规模;500 任务规模上限的性能口径属 SC1 性能腿" is the established fix pattern.)

### 6. Internal Consistency — 134/150

**6a. Invariants hold in every step (54/60)** — Invariants 1 and 2 hold across all steps and edges; no step grants a human write path; Step 5's detail panel stays read-only. Dock −6 on invariant 3: Steps 2/3 ("切换'状态分组/列表'视图", "使用筛选器…与排序") are precisely the interactions whose persisted state DF005's 视图记录 exists to record — as written ("不产生任何…工作台自有状态的变更") the invariant is falsifiable by a conforming implementation and the journey never scopes it (e.g., to forge data + 注册表/挂接索引). This is a PRD-tension, not a demonstrated violation, hence −6 rather than the −40 violation rate.

**6b. Cross-step references consistent (40/50)** — Dock −10: Step 2b is misanchored. Its Precondition ("注册激活的项目没有任何任务数据") and User Action ("用户进入任务看板") are a variant of **Step 1** (打开任务看板), but it is filed as "Step 2b" implying a variant of Step 2 (切换状态分组/列表视图). Per the journey template, "Each edge case references a happy path step (variant)"; gen-contracts indexes contracts as `step-N-*.md`, so an enter-board empty-state contract would land on the view-switch step's contract file. (1b and 3b anchor correctly.)

**6c. Risk level consistent (40/40)** — Low is exactly right: the workflow is read-only observation throughout, matching the rubric's "A Low risk Journey should be read-only" and the gen-journeys Low criteria.

### 7. Workflow Coverage — 119/150

**7a. Golden Path existence (60/60, veto not triggered)** — Semantic verification performed: the 5 contiguous domain-level steps map verbatim onto Story 1's "I want" clause list — 依赖树 (Step 1), 状态分组 (Step 2), worktree 标识 (Step 4), 任务详情 (Step 5), plus UF2's 筛选/排序 (Step 3). Steps reference domain operations, not API mechanics; verified against Story 1 AC1–AC3, not merely step-counted. Constraint A (3+ steps) and Constraint B (semantic completeness) both satisfied. (`golden_path: false` frontmatter is correct feature-level delegation to `task-session-execution-loop`; the veto tests content, which qualifies.)

**7b. Multi-step coverage depth (30/50)** — Read-only scope legitimately bounds state-machine depth, and view-mode/filter/detail variation plus three boundary states give moderate variation. But:
- the error-recovery path is asserted and never exercised — 1b demands "显示错误(error)态与重试入口" yet no step or edge clicks retry and verifies recovery (rubric rewards "error recovery paths" explicitly);
- the board's async boundary (loading during first load / project switch) is absent;
- depth beyond single-entity browse+filter+detail is nil — records and worktree marks are viewed, never interacted with.

**7c. Workflow completeness against PRD scope (29/40)** — Story 1 ACs all covered ✓; UF2 validation rules both covered (只读 invariant 1; 筛选空态 3b) ✓. Gaps:
- −6: UF2's `loading` state ("首次加载/切换项目") is unexercised in this journey *and* across the whole journey set for the board — multi-project Step 2 covers only the registration wizard's scanning indicator; no journey covers the task board's load state.
- −5: UF3's per-task error state ("error | 错误 + 重试 | 单任务数据异常") is uncovered anywhere — 1b covers board-level read failure only, not the single-task detail failure this journey's own traceability header claims via UF3.
- Acceptable decompositions (no penalty): `updating`/reflow → `dual-form-consistency` + `task-session-execution-loop`; 变更来源标识 → Stories 3 journeys; 挂接历史 populated view → sibling Step 6b.

### Cross-dimension coherence check

- **Mandatory-outcomes omission** legitimately spans Completeness 1c (coverage), Surface Fitness 5a (surface-rule compliance), and Fact Alignment 4b (annotation discipline) — three rubric-defined facets of one omission, the same split the sibling report used. Each sub-score reflects its own facet only.
- **Scale mismatch** charged once (5c only); the sibling-pipeline blindspot treatment is acknowledged inline but not double-counted.
- **Fixture gaps** charged once in 3c (precondition sufficiency); the test-data-safety facet (corrupting the live-repo fixture for 1b) is a rubric-external blindspot (B1), not re-scored in-dimension.
- **Invariant 3** charged once in 4a (traceability of the absolute claim) and once in 6a (step-level falsification risk) — distinct facets (fact origin vs. step consistency), mirroring the sibling precedent of splitting one defect across 4c/6a for distinct defects only.
- **Step 2b misanchor** charged once in 6b; it is not additionally charged in 3a/3b because the preconditions themselves remain distinct and selecting.
- Semantic Purity vs Fact Alignment cross-check: the CLI-oracle phrasing costs −2 in 2a while its claim remains PRD-traceable (no FA dock for it) — no conflict.

---

## Phase 3 — Blindspot Hunt ([blindspot] = outside all rubric dimensions)

1. **[blindspot] Error-path fixture provisioning is undefined and incompatible with the nominated live-repo fixture.** Setup nominates the production repository — "该项目含 ≥10 个任务、含依赖关系(如本仓 dsh-forge,含 M1 已完成任务)" — while edge 1b's precondition is "forge 任务数据读取失败(文件损坏/权限异常)". To execute 1b, a runner must corrupt or lock forge data *on the repo that builds the tool itself*; 2b additionally requires a registered zero-task project that Setup never declares. No isolation, provisioning, or rollback statement exists anywhere. (The revised sibling established the disposable-fixture convention — "测试承载 = 一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理" — this document predates it.) No rubric dimension evaluates test-data isolation (confirmed by the sibling iteration-1 report's blindspot 2). *Fix: prescribe a disposable fixture project plus explicit provisioning recipes for the corrupt-data and empty-task edge states.*

2. **[blindspot] Cross-surface oracle dependence is unspecified.** Step 1 asserts "任务数/状态/依赖与 `forge task list` 输出一致(含已完成历史任务)" and Step 3 "筛选/排序结果与 forge 任务数据一致" — a browser-level test cannot observe CLI output or forge files on its own. The document never states the verification channel. (The revised sibling added an explicit oracle-channel Setup bullet: "校验通道 = 测试进程直读 fixture forge 文件或 stub CLI stdout".) Adjacent to, but not covered by, Surface Fitness 5c, which scores environment realism, not assertion observability. *Fix: add the oracle-channel statement to Setup.*

3. **[blindspot] The web surface's accessibility principle is ignored.** surface-web.md General Testing Principle 4 requires testing that interactive elements are reachable via keyboard navigation and that ARIA labels are present for dynamic content. This journey owns the application's most interaction-dense dynamic surface — "**User Action**: 用户切换"状态分组/列表"视图", "使用筛选器(feature/状态/worktree)与排序", task cards/nodes — yet no step, edge, or invariant touches keyboard reachability, focus, or accessible names. Surface Fitness's three criteria (outcomes, proportions, environment) do not cover accessibility, so this is genuinely rubric-external. *Fix: add an accessibility edge or invariant (board controls keyboard-reachable, dynamic content labeled).*

---

## Revision Priorities (for reviser)

1. **Surface-web required_outcomes engagement** (fixes 5a/1c/4b — the threshold-failing dimension): add explicit mapping or exclusion comments for `validation-error` and `session-expired` (mirror the revised sibling's `surface-web required_outcomes 映射` convention), and annotate derived clauses (`3b 恢复`, `1b 原子性/不崩溃`) with `source: inferred`.
2. **Scale-scoped timing claim** (fixes 5c −6): scope the ≤2s assertion to Setup's actual task scale or add a 500-task fixture leg — reuse the sibling's "计时口径 = Setup 实际任务规模;500 任务规模上限的性能口径属 SC1 性能腿" wording.
3. **Re-anchor 2b** as a Step 1 variant (renumber to 1c or add explicit "variant of Step 1") — fixes the 6b misanchor.
4. **Establish fixture facts in Setup**: a task with non-default-worktree execution traces, tasks with execution branch names, a task with execution records; plus a disposable isolated fixture with provisioning for the corrupt-data and empty-task edges, and the cross-surface oracle channel (blindspots 1–2).
5. **Scope invariant 3** to forge data + 注册表/挂接索引 (or mark the 视图状态 question UNKNOWN) — resolves the 4a/6a tension.
6. **Add coverage**: loading state (first load / project switch), UF3 per-task detail error state, and a retry-recovery follow-through after 1b; optionally an accessibility edge (blindspot 3).

**Final: 977/1150 — FAIL (Surface Fitness 88 < 90 despite total ≥ 975). Revision required.**
