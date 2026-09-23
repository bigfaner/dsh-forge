# Eval Report: journey/feature-board-docs-browsing — Iteration 1

- **Evaluator**: Scorer (adversarial), Senior QA Engineer persona
- **Date**: 2026-09-23
- **Document**: `docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/journey.md`
- **Rubric**: `eval/rubrics/journey.md` (1150 pts, target 975, per-dimension thresholds)
- **Surface**: web (`gen-journeys/rules/surface-web.md`)
- **Iteration**: 1 (no previous report)
- **Verdict**: **FAIL** — Total 921/1150 (< 975) AND Fact Alignment 70/150 (< 90 threshold)

| Dimension | Score | Threshold | Status |
|-----------|-------|-----------|--------|
| 1. Completeness | 170/200 | 120 | PASS |
| 2. Semantic Purity | 200/200 | 120 | PASS |
| 3. Precondition Exclusivity | 137/150 | 90 | PASS |
| 4. Fact Alignment | 70/150 | 90 | **FAIL** |
| 5. Surface Fitness | 90/150 | 90 | PASS (barely, at threshold) |
| 6. Internal Consistency | 134/150 | 90 | PASS |
| 7. Workflow Coverage | 120/150 | 90 | PASS |
| **Total** | **921/1150** | **975** | **FAIL** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Chain check (problem → solution → evidence → success criteria)**: The journey claims Story 6 (feature 文档浏览与仓外文档). The chain holds: problem (需求上下文应用内可查 + 过程资产不进代码仓) → solution (feature 看板 → 状态机 → 五类文档只读浏览 → 仓外注册 → 一致渲染) → evidence (traceability header cites Story 6/SC4/SC5/G4/UF4 — all four verified to exist in `prd-user-stories.md` / `prd-spec.md` / `prd-ui-functions.md`) → success criteria (Steps 1–3 map to Story 6 AC1 and SC4; Steps 4–5 map to Story 6 AC2 and SC5). The journey does exercise the user story it claims. No self-contradictions in the state chain; no invariant is violated by any step.

**Pre-score anchors recorded before rubric scoring**:

1. **Zero annotation discipline.** The document contains no `surface-web required_outcomes 映射` comment and no `source: inferred` annotation anywhere. All three siblings demonstrate the convention (`task-board-browsing` has 4 such comments, `multi-project-management` 3, `task-session-execution-loop` 3). At least one outcome in this journey is a genuine PRD-less inference (Step 3b isolation clause).
2. **Setup provisions only the happy path.** None of the five edge-case preconditions (no-feature project, invalidated 仓外 path, corrupted doc, doc with external links, doc with injected content) has a provisioning statement — contrast `task-board-browsing`: "错误腿供给 = 在 fixture 副本上注入文件损坏/权限异常……空态腿 = 另备零任务 fixture 项目". No isolation contract, no 跨面断言口径 channel, and the happy-path carrier is the production repo itself.
3. **Edge numbering drift.** `Step 2b` (仓外路径失效) requires a post-Step-4 state yet hangs under Step 2 (查看 dsh-forge-m1 状态机); `Step 4b` (外链防护) is a rendering variant of Steps 3/5, not of Step 4 (注册).
4. **Derived-outcome gaps.** Step 4 is a wizard form surface ("显式选择并授权") yet `validation-error` has no edge and no disposition; `session-expired` has a substantive analog (Step 2b channel invalidation) but it is never mapped; UF4's declared `loading` state has no edge (sibling added one for UF2's loading row).
5. **Narrative itself is clean.** No "或"-forked outcomes, no precondition overlap pairs, no disjunctions, no code/regex/selectors — the defect mass sits in verification/classification discipline, not in the story.

---

## Phase 2 — Rubric Scoring (verification stance)

All assertions treated as unverified until grounded. Facts checked against `prd-user-stories.md` (Story 6), `prd-spec.md` (G4, In Scope, Security, SC4/SC5), `prd-ui-functions.md` (UF4 flow/states/validation rules, UF1 flow), and business rules (task-operations: 看板只读; resilience; privacy — no conflicts found: the journey asserts no write operations on forge data and no telemetry-adjacent behavior).

### 1. Completeness — 170/200

**Metadata (50/50)**: `journey: "feature-board-docs-browsing"` is kebab-case; `risk_level: "Medium"` is valid and justified — content is read-only browsing plus authorization-bound registration and two security guards (外链/注入防护), sitting between the Low sibling (pure browse) and the High sibling (registry mutation incl. removal). `golden_path: false` is consistent suite labeling — `task-session-execution-loop` holds the feature's `golden_path: true` designation. Sources list all three PRD files, all exist.

**Steps complete with required fields (68/80)**: Every happy step and every edge has User Action + Expected Result; the 1→5 sequence is coherent. Deductions:
- Step 4's Expected Result is not a single assertable outcome: "注册完成并激活;看板/feature/文档功能完整" — "功能完整" names no observable set; a downstream agent cannot derive the assertion checklist (it quotes SC5's "全部正常" phrasing but SC5 is a milestone criterion, not a test step). (-6)
- Step 5 repeats the unquantified adjective: "文档格式与仓内一致,正常只读渲染,功能完整". (-4)
- Step 5b's User Action reaches outside the journey's provisioned surface: "浏览该文档与任务执行记录" — 任务执行记录 is UF3 (任务详情) scope, and Setup provisions no project with task execution records for this journey; the record-browsing half of the action is unexecutable as written. (-2)

**Outcomes cover happy path + required derived scenarios (52/70)**: Happy path complete for Story 6 AC1/AC2; edge spread (empty / path-invalid / per-doc error / link guard / injection guard) is real and security-relevant. Deductions:
- `validation-error` (web mandatory): completely absent as an edge and completely undispositioned — despite Step 4 being a form surface ("以仓外本地路径为文档位置注册该 forge 项目(显式选择并授权)"). The wizard's invalid-input legs exist only in the `multi-project-management` journey (its 2b/3b); no cross-journey deferral note states that. (-10)
- `session-expired`: the Step 2b analog (registered data channel invalidated) exists in substance but is never identified or dispositioned — siblings map exactly this class ("session-expired → 本旅程为离线桌面应用……通道失效类比 = forge 数据读取失败"). (-4)
- UF4 States declares a `loading` row ("loading | 骨架 | 进入/切换") with no corresponding edge; sibling `task-board-browsing` covers its UF2 loading row with Step 1d. (-4)

### 2. Semantic Purity — 200/200

**Natural language, no code/regex (80/80)**: No regex, CSS/XPath selectors, or assertion calls anywhere. Outcomes describe what the user observes ("显示空(empty)态"无 feature"引导,不显示错误").
**Declarative preconditions (60/60)**: All edge preconditions are state descriptions, not procedures ("已注册项目的仓外文档路径失效(目录被移动/删除)", "过程文档内容中包含外部链接").
**No implementation coupling (60/60)**: Steps are user-level (点击 feature、依次点击文档); "(安全约束)" and "(markdown 防注入)" are domain labels the PRD itself uses; no internals, queries, or endpoints leak in.

### 3. Precondition Exclusivity — 137/150

**Distinct across outcomes (56/60)**: Each step carries exactly one outcome, so no same-step pair can collide; edge preconditions are semantically distinct. Minor: Step 3b's "某个过程文档内容读取失败" does not scope "路径有效" — a moved/deleted directory (Step 2b's state) also manifests as document read failure, leaving the boundary between 2b (路径不可访问 guidance) and 3b (单文档错误+重试) informally drawn. (-4)

**Sufficient to uniquely select (44/50)**: Each edge's precondition selects its single outcome — but Step 1b's precondition ("注册激活的项目没有任何 feature 数据") is unreachable inside the journey's own world: Setup's activated project contains dsh-forge-m1 with five doc classes, no feature-less project is provisioned, and no step performs the switch into such a state. The precondition names a state the journey cannot reach. (-6)

**Missing preconditions for error/boundary outcomes (37/40)**: All five edge cases state their triggers — good baseline. (-3 for the 3b path-validity scoping gap above.)

### 4. Fact Alignment — 70/150 — **BELOW THRESHOLD (90)**

**Factual claims traceable / UNKNOWN (50/60)**: Strong core — verified matches:
- Step 1 ← UF4 flow 1 ("用户进入 feature 看板 → feature 列表(状态标识)")
- Step 2 ← UF4 flow 2 ("点击 feature → 状态机视图 + 文档目录(五类)") + SC4 ("dsh-forge-m1 显示 completed 状态")
- Step 3 ← UF4 flow 3 + Navigation Rules ("Every secondary page must have back navigation targeting its entry point page")
- Step 4 ← UF1 flow 4 ("确认 → 注册完成,激活该项目") + UF1 validation ("仓外需显式选择并授权")
- Step 5 ← SC5 / Story 6 AC2 ("看板/feature/文档功能完整,文档格式与仓内一致")
- 1b ← UF4 States empty (""无 feature"引导")
- 2b ← UF4 Validation, near-verbatim ("仓外路径失效时明确提示路径不可访问,并提供重新指向/移除项目引导")
- 3b error+retry ← UF4 States error ("错误 + 重试 | 读取异常(含仓外路径失效)")
- 4b ← UF4 Validation ("文档渲染为只读,禁用外链跳转离开应用(安全约束)")
- 5b (过程文档 half) ← prd-spec Security ("过程文档(含 markdown 渲染)防护内容注入")
Traceability is journey-level (header) only; revised siblings additionally inline-cite UF rows per edge (e.g., task-board-browsing Step 1d "(UF2 States:loading 行)"). (-10)

**Inferred claims annotated with rule support + `source: inferred` (10/50)**: Zero annotations in the document. The clear unannotated inference: Step 3b's "不影响其他文档与其他 feature 的浏览" — failure isolation has no PRD basis (UF4's error row says only "错误 + 重试"); the sibling journey annotates the identical class of claim ("source: inferred:「其余任务不受影响」= Step 1b 原子性的单任务粒度推广"). This is an objective omission against the family baseline, not a stylistic preference. (-40)

**No unclassified claims (10/40)**: Step 3b's isolation clause asserts specific system behavior with no fact, no rule citation, no annotation. Applying the -30 hallucinated-unclassified-claim deduction once (the single clear instance). (-30)

### 5. Surface Fitness — 90/150 (at threshold)

**Mandatory derived outcomes from surface rules (30/60)**: `validation-error` — absent in substance within this journey (no invalid-input edge despite the Step 4 wizard form) and absent in disposition (no mapping comment, no cross-journey deferral note). `session-expired` — substantively present as an analog (Step 2b: registered 仓外 channel invalidated → explicit error + recovery guidance) but never identified as the surface-mandated outcome. Not "completely absent" as a set (so not 0), but well below half. (-30)

**Test strategy proportions 50/50 Contract/Journey (42/50)**: 10 scenarios (5 happy + 5 edge) with per-step granularity suitable for Contract extraction and a coherent end-to-end spine — balanced. Depth is thinner than siblings: several edges are one-line assertions (1b, 4b) where siblings specify retry-after-recovery behavior and testable detail. (-8)

**Environment realism (18/40)**: Three material gaps for a browser-execution model:
- **No edge-leg fixtures.** Setup provisions only happy-path carriers ("存在另一个过程文档位于仓外本地路径的 forge 项目可供注册(仓外路径含同格式五类文档)") — nothing establishes the no-feature project (1b), the invalidated path (2b), the corrupted doc (3b), or the link/injection-content docs (4b/5b). (-8)
- **No isolation contract; real-repo carrier.** The happy path binds to the production repo ("该项目含已完成 feature(如本仓 dsh-forge-m1……)") and Step 4 mutates the real workbench registry with no "一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理" discipline; native directory-picker interaction (Step 4 path selection) is unaddressed for browser automation. (-8)
- **No assertion channel for equivalence/consistency claims.** "文档格式与仓内一致" and invariant "feature 列表与状态机展示与 forge 数据一致" cannot be verified from the browser surface; siblings define exactly this ("跨面断言口径:……校验通道 = 测试进程直读 fixture forge 文件或 stub CLI stdout"). (-6)

### 6. Internal Consistency — 134/150

**Invariants hold in every step (56/60)**: Verified per step — 只读渲染 holds (4b actively tests the link clause; no step offers an edit entry); forge-consistency is asserted, not contradicted; 仓内/仓外 equivalence is asserted in Step 5. No violations. (-4: invariant 2's consistency claim is never operationalized — no step or channel observes forge data to compare.)

**Cross-step references consistent (40/50)**: "该仓外项目" (Step 5) resolves unambiguously to Step 4; "dsh-forge-m1" resolves to Setup. But the `Nb ↔ Step N` edge-parenting convention breaks twice: `Step 2b`'s precondition ("已注册项目的仓外文档路径失效") presupposes the Step-4 registration, not Step 2 (查看 dsh-forge-m1 状态机); `Step 4b` (外链防护) varies the doc-rendering behavior of Steps 3/5, not the registration action of Step 4. (-10)

**Risk level consistent with content (38/40)**: Medium is the defensible midpoint — security guards and authorization present, no irreversible or data-loss operation. (-2: Step 4 mutates persistent workbench registry state, nudging toward High; mitigated by reversibility.)

### 7. Workflow Coverage — 120/150

**Golden Path existence — veto item (54/60)**: NOT triggered. The Happy Path is a contiguous 5-step sequence — 进入 feature 看板 → 查看状态机 → 浏览五类文档 → 注册仓外项目 → 仓外一致渲染 — matching Story 6 AC1+AC2 (and SC4+SC5) one-to-one, in domain-level operations (no HTTP/API-level steps, so no -15/step penalty applies). Deductions: the qualifying sequence is itself unmarked (`golden_path: false`; the feature-level designation lives in `task-session-execution-loop` — acceptable at feature level, but the journey's own spine goes unlabeled); Step 1 is navigation-only. (-6)

**Multi-step coverage depth (38/50)**: Browse hierarchy (board → detail → docs) ✓; cross-entity (project registration ↔ feature docs ↔ 仓外 equivalence) ✓; error recovery (2b re-point guidance, 3b retry) ✓; security guards (4b/5b) ✓. Missing depth: state-machine verification is single-valued — "feature 状态机显示正确(completed)" asserts only `completed`, though UF4 defines a five-stage machine (prd → design → tasks → in-progress → completed) and Setup's own carrier repo contains an in-progress feature (dsh-forge-m2) that would provide a free second leg; no switch-back/re-verify leg after Step 4 activation changes the project context. (-12)

**Workflow completeness against PRD/Design scope (28/40)**: Story 6 AC1/AC2 fully covered. Gaps: AC3 ("Given 注册向导中未显式选择仓外路径,Then 默认文档位置为仓内(外置默认关闭)") has no step or edge here and no deferral note (it is covered in `multi-project-management` Step 3c — the house convention is to state deferrals explicitly, as that journey does in its 覆盖说明); UF4's `loading` state row uncovered; the state machine's non-completed stages uncovered. (-12)

### Cross-dimension coherence check

One systemic defect propagates coherently: **missing classification/disposition and fixture discipline**. It simultaneously produces the Fact Alignment failure (zero annotations + one unclassified inference), the Surface Fitness borderline (validation-error undispositioned, no fixtures/channel/isolation), and the Completeness derived-scenario deductions. The dimensions that score high (Purity 200, Exclusivity 137) measure the narrative itself, which is genuinely clean — consistent with the text. No dimension scores contradict each other. No double-counting: the 3b isolation clause is charged once under Fact Alignment c3 (-30) with the annotation absence under c2; validation-error absence is charged under Surface Fitness sub-1 (-30) and Completeness criterion 3 (-10), which the rubric itself doubles (Completeness c3 explicitly defers to the surface's required_outcomes rules); fixture/isolation gaps live only in Surface Fitness.

---

## Phase 3 — Blindspot Hunt ([blindspot] — outside all rubric dimensions)

1. **[blindspot] Real-repo carrier + real registry mutation creates operational hazards the rubric cannot see.** Quote: "应用已启动并激活一个 forge 项目,该项目含已完成 feature(如本仓 dsh-forge-m1,状态 completed)" and "存在另一个过程文档位于仓外本地路径的 forge 项目可供注册". Step 4 registers and activates a second real project in the developer's actual workbench state: repeated runs become nondeterministic (already-registered/already-active variance), pollute the real registry, and — per the project's own e2e lesson (M1 specs use real userData; an externally held single-instance lock fails whole spec groups with ERR_SINGLE_INSTANCE) — a live dsh-forge instance during the run can invalidate the entire leg. Repeatability/lock-safety is not a rubric dimension, but gen-test-scripts will inherit it.

2. **[blindspot] Equivalence assertions have no comparison basis.** Quote: "文档格式与仓内一致" and invariant "feature 列表与状态机展示与 forge 数据一致". "一致" is undefined: which fields (feature status enum? count? document section structure? rendered output?) and against what source read? The Surface Fitness deduction covers the missing verification *channel*; no rubric dimension requires defining the comparison *criterion* itself. A downstream test-writer must invent the equivalence relation.

3. **[blindspot] Feature-board freshness contract is undefined and untested.** Quote: "feature 列表与状态机展示与 forge 数据一致". G3/DF003's ≤5s freshness guarantee is written for 任务变更回流看板; whether the feature board live-updates when forge feature files change externally (terminal/agent side) is stated nowhere in PRD or this journey — the journey never says whether a stale feature board mid-session is acceptable. A read-only board whose SoT changes underneath it is the exact regression class (stale-status) this product family cares about, and no dimension captures it.

4. **[blindspot] Cross-journey coverage contract is broken.** `multi-project-management`'s 覆盖说明 promises: "显示名编辑与 ≤20 注册项目规模边界……前者随 UF1 编辑模式/重指向腿衔接(feature-board-docs-browsing journey)" — i.e., this journey is the designated owner of the UF1 display-name-edit and re-pointing legs. This journey contains neither leg (Step 2b mentions 重新指向 only as UI guidance text, never exercising a re-point flow). The per-journey rubric cannot see cross-journey promises, so the seam silently drops coverage that another document publicly depends on.

---

## Attacks Summary (for reviser)

1. **[Fact Alignment]** Inferred outcomes carry zero annotations — "不影响其他文档与其他 feature 的浏览" (3b) has no PRD basis and no `source: inferred` + reasoning basis. Add per-outcome annotations per family convention (see any sibling).
2. **[Fact Alignment]** Unclassified behavior assertion — the same 3b isolation clause (-30 applied): annotate as inferred with basis, or mark UNKNOWN.
3. **[Surface Fitness]** `validation-error` neither covered nor dispositioned despite the Step 4 form surface ("以仓外本地路径为文档位置注册该 forge 项目(显式选择并授权)") — add a mapping comment (edge in-journey or explicit cross-journey deferral to multi-project-management 2b/3b), and map `session-expired` explicitly onto the Step 2b channel-invalidation analog.
4. **[Surface Fitness]** No fixtures, no isolation, no assertion channel — extend Setup with edge-leg provisioning (no-feature project, invalidatable path, corrupted/link/injection docs), a disposable-carrier + isolated userData contract, and a 跨面断言口径 for "一致" claims.
5. **[Completeness]** Unquantified outcomes — "注册完成并激活;看板/feature/文档功能完整" and "功能完整" (Steps 4/5): enumerate the observable surfaces/assertions that constitute "完整".
6. **[Completeness]** Missing loading-state edge (UF4 States loading row) per sibling convention.
7. **[Completeness]** Step 5b action reaches unprovisioned UF3 scope — "浏览该文档与任务执行记录": scope to 过程文档 or provision task-execution-record fixtures.
8. **[Internal Consistency]** Edge numbering drift — renumber/restructure so 2b hangs off the 仓外 flow (post-Step-4) and 4b off the rendering steps.
9. **[Workflow Coverage]** Story 6 AC3 (默认仓内/外置默认关闭) absent without a deferral note; state machine verified only for `completed` — add an in-progress leg (Setup's own repo contains dsh-forge-m2) and a house-convention deferral note.

---

## Pass/Fail

**FAIL** — Total 921/1150 < 975; Fact Alignment 70/150 < 90 (dimension threshold breach). Priority fixes for iteration 2: (1) annotation/disposition discipline (attacks 1–3), (2) fixture provisioning + isolation + assertion channels (attack 4), (3) quantify "功能完整"/"一致" and close the numbering/coverage seams (attacks 5–9). The happy-path narrative itself is sound and needs no structural rework.
