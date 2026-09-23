# Journey Eval Report — iteration 2

- **Document**: `docs/features/dsh-forge-m2/testing/task-board-browsing/journey.md` (revised since iteration 1)
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, target 975, every dimension ≥ threshold)
- **Surface**: web (`.forge/config.yaml` `surfaces: web`; `rules/surface-web.md`); Web = balanced 50/50; mandatory derived outcomes: `validation-error` + `session-expired`
- **Scorer persona**: Senior QA Engineer (adversarial)
- **Verdict**: **PASS** — Total 1119/1150 (≥ 975) AND every dimension ≥ threshold (min scored dimension: Workflow Coverage 138 ≥ 90)

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 194/200 | 120 | ✓ |
| 2. Semantic Purity | 196/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 150/150 | 90 | ✓ |
| 4. Fact Alignment | 146/150 | 90 | ✓ |
| 5. Surface Fitness | 145/150 | 90 | ✓ |
| 6. Internal Consistency | 150/150 | 90 | ✓ |
| 7. Workflow Coverage | 138/150 | 90 | ✓ |
| **Total** | **1119/1150** | 975 | **✓** |

---

## Iteration-1 resolution verification (required before scoring)

Every iteration-1 attack was checked against the revised text; none is claimed-resolved-but-unresolved.

| Iteration-1 finding | Status in revision | Evidence |
|---|---|---|
| Anchor A / 5a/1c/4b: zero engagement with web `required_outcomes` (`validation-error`, `session-expired`); zero `source: inferred` annotations | **RESOLVED** | Explicit mapping comments added at Step 1b ("session-expired → 本旅程为离线桌面应用(继承 M1 无端口/无服务端会话模型)…映射为 UF2 error(读取失败)态 = 本边") and Step 3b ("validation-error → 本旅程无表单输入面;唯一输入面 = 筛选器组合,按 UF2 校验规则映射为明确空态(非错误)= 本边"); `source: inferred` annotations present on 1b (atomicity), 3b (recovery), 5b (isolation), each with a stated basis. Both mappings are sound and match the pipeline convention the revised sibling established. |
| Anchor B / 5c: "首屏 ≤2 秒(500 任务规模)" unexecutable against a "≥10 任务" fixture | **RESOLVED** (by adding the scale leg, not by scoping the assertion down) | Setup: "首屏计时腿 = 同一生成器 500 任务/50 feature 固定种子 preset(同种子 ⇒ 同文件字节)"; Step 1 scopes the bound to that leg. **Disk-verified**: `apps/desktop/e2e/tests/m2/sc1-board-consistency.spec.ts` implements exactly this 口径 (warm-up boot uncounted; 3 measured runs; median ≤ 2000ms; t0 = tasks-tab click, t1 = 500 nodes + two rAFs), and `apps/desktop/e2e/fixtures/task-generator.ts` exports `sc1TaskSet` = 500 tasks / 50 features, seed-pinned. The claim "已落地 sc1 e2e 口径" is TRUE. |
| Anchor C / 3c: fixture never establishes worktree-trace task, branch-named tasks, execution-record tasks; live-repo fixture incompatibility | **RESOLVED** | Setup bullet 1: "含带执行记录的任务(actor = 会话/终端各 ≥1)与无记录任务"; bullet 2: "fixture 预置 ≥1 个在非默认 worktree 有执行痕迹、带执行分支名的任务(真实 git worktree + 执行痕迹写入…)"; disposable-fixture convention adopted: "测试承载 = 一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理,不以生产仓为承载;SC1 真实项目口径以本仓注册另腿验收". Steps 2/4/5 each gained an explicit Precondition tied to Setup 预置. |
| Anchor D / 6b: Step 2b misanchored (empty-state edge filed under view-switch step) | **RESOLVED** | Renumbered to "Step 1c: 项目无任务数据" with User Action "用户进入任务看板" — a true Step 1 variant; 1b/1d likewise anchor to Step 1's action; 3b/5b anchor to Steps 3/5 respectively. Zero misanchors remain. |
| Anchor E / 4a/6a: invariant 3 absolute "不产生任何…工作台自有状态的变更" contradicts DF005 view state | **RESOLVED** | Invariant 3 now scoped with the carve-out: "不写入注册表/挂接索引等工作台自有事实数据;当前视图/筛选/排序的本地记忆属 DF005 视图状态按需读写,不在此限(写入面细节留数据内核设计)" — matches DF005's 视图状态 row exactly. |
| Blindspot 1: error-path fixture provisioning undefined / live-repo mutation | **RESOLVED** | "错误腿供给 = 在 fixture 副本上注入文件损坏/权限异常、排除障碍后复测,空态腿 = 另备零任务 fixture 项目,均随 fixture 一并清理". |
| Blindspot 2: cross-surface oracle unspecified | **RESOLVED** | "跨面断言口径:与 `forge task list` 输出一致的校验通道 = 测试进程直读 fixture forge 文件或 stub CLI stdout(浏览器侧不自行观测 CLI 输出)" — matches the landed e2e's approach (generator-model ground truth, no browser-side CLI observation). |
| Blindspot 3: accessibility ignored | **RESOLVED** (as invariant) | Invariant 4 added: "可达性:看板交互件(视图切换/筛选/排序/任务卡片/详情开关)可经键盘到达与操作,动态内容(任务卡片/状态列/详情)带可读名称(aria-label/文本,中英双语)". Residual: no exercising leg — noted in Phase 3. |
| 1c/7b/7c gaps: loading state absent; UF3 per-task error uncovered; retry never exercised | **RESOLVED** | Step 1d added (loading, anti-error/empty during load); Step 5b added (UF3 error 行 单任务数据异常 + isolation); 1b now carries the recovery follow-through: "排除读取障碍后点击重试,看板恢复渲染且与 forge 数据一致(校验通道见 Setup)". |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Chain check**: problem (PRD Why ① 工程资产散落 — tasks/deps only via terminal `forge task list`) → solution (read-only board: dep tree, status grouping/list, worktree marks, detail panel) → evidence (traceability block: Story 1 / SC1 / G1 / UF2 / UF3) → success criteria (per-step expected results with PRD-quantified bounds and a disk-verified timing 口径). Step-level tracing re-verified: Step 1 ← Story 1 AC1 + SC1 + G1 + UF2 flow 1; Step 2 ← UF2 Data Requirements (7 态, 分支名列); Step 3 ← UF2 flow 3; Step 4 ← Story 1 AC2; Step 5 ← Story 1 AC3 + UF3. The journey genuinely exercises the user story it claims.

**Pre-score anchors**:

1. **Anchor A (revision is real, not cosmetic)**: every iteration-1 attack resolved with evidence, and the two new repo-state claims verify on disk — the SC1 e2e implements the cited timing 口径 verbatim (warmup uncounted, median of 3, budget 2000ms, 500-node interactivity window) and the generator's header pins the cited dialect rule ("branch/worktree are NEVER generated… Hard Rule: 不虚构 forge 未写的字段"). No claimed-but-unresolved fix found.
2. **Anchor B (residual annotation gaps)**: the three material derived edges (1b/3b/5b) are annotated, but two smaller derived clauses are not — Step 2's "无执行痕迹的任务显示空占位(不虚构 forge 未写的字段)" (no UF2 text specifies the no-trace display) and 1d's "未就绪期间不显示错误态或空态" (beyond the UF2 loading row's literal text). Charged under 4b.
3. **Anchor C (Step 4 action/outcome asymmetry)**: the action promises two observation targets ("查看卡片角标与详情内标识") but the outcome asserts only "worktree 标识可见(卡片角标)" — the detail-side mark is never asserted anywhere. Charged under 1b.
4. **Anchor D (transient/persisted-state hazards)**: 1d's loading window has no deterministic trigger provision ("首次加载大任务集" does not name the 500-task leg); and Step 1's "默认展示图形化依赖树" is exposed to persisted view state (DF005/invariant-3 carve-out) across reruns — the landed e2e must clear `dsh.forge.workbench.view` between boots, the journey never says so. Former charged under 5c; latter is rubric-external (Phase 3).
5. **Anchor E (structure sound)**: `risk_level: Low` correct (purely read-only; rubric expects Low = read-only); `golden_path: false` correct feature-level delegation (`task-session-execution-loop` owns it with `golden_path: true`); all edge anchors verified individually; no internal self-contradiction found.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 194/200

**1a. Journey metadata (50/50)** — `task-board-browsing` kebab-case ✓; `risk_level: Low` valid and justified (every step is read-only observation; invariants enforce it) ✓; `golden_path: false` consistent with feature-level delegation ✓; `surface_types`/`surface_keys` populated ✓; sources list all three PRD files ✓; `generated` present ✓.

**1b. Steps complete with required fields (76/80)** — All 5 happy steps carry User Action + Expected Result in coherent order (matches UF2's interaction flow + Story 1); every enabling fact is now either a Setup bullet or an explicit Precondition. Dock −4: Step 4's outcome under-covers its own action —

> "**User Action**: 点击该任务卡片/节点,查看卡片角标与详情内标识"
> "**Expected Result**: worktree 标识可见(卡片角标)"

The action directs observation of the detail-side worktree 标识 (Story 1 AC2's "查看该任务卡片/详情" names both surfaces), but no outcome in the journey — Step 4 or Step 5 — asserts it. A downstream agent executing the action as written has no expected result for half of it; either cover both targets or drop "详情内标识" from the action.

**1c. Outcomes cover happy path + required derived scenarios (68/70)** — Both mandatory web outcomes explicitly considered and mapped (see 5a); boundary coverage is now rich: read failure + retry + recovery (1b), zero-task empty (1c), loading with anti-error/empty negative (1d), filter-empty + recovery (3b), per-task detail error + isolation (5b), plus the scale/timing leg. Dock −2: the no-fabrication discipline is applied asymmetrically — Step 2 asserts

> "带执行分支的任务显示分支名、无执行痕迹的任务显示空占位(不虚构 forge 未写的字段)"

for the branch column, but Step 4's worktree badge has no analogous negative clause (traceless task ⇒ no fabricated badge). The landed e2e already asserts both directions for the badge ("worktree badge fabricated" checks in sc1 view B), so the boundary is real, tested in code, and absent from this journey.

### 2. Semantic Purity — 196/200

**2a. Natural language outcomes (78/80)** — No regex, selectors, or framework assertions; outcomes describe what the user observes. Dock −2 (same class and calibration as sibling iteration 2): Step 1/Step 3 outcomes are phrased as verification oracles with channel pointers —

> "任务数/状态/依赖与 `forge task list` 输出一致(含已完成历史任务;校验通道见 Setup)"

— PRD-verbatim (G1) and now backed by a declared channel, but still mechanism-flavored rather than observation-flavored.

**2b. Preconditions declarative (60/60)** — Setup bullets and all five edge preconditions are declarative states ("forge 任务数据读取失败(文件损坏/权限异常…)", "注册激活的项目没有任何任务数据", "看板正常加载,但所选任务的单任务数据读取异常"). Parenthetical provisioning pointers ("fixture 副本上注入,见 Setup") reference Setup rather than script procedure. Full marks.

**2c. No implementation coupling in steps (58/60)** — Steps are user-level throughout; `.forge`/`docs/features`, "7 态", `forge task list` are PRD-verbatim domain terms. Dock −2 (placement, mirroring the sibling's e2e-note dock): Step 1's Expected Result embeds the full run protocol —

> "预热一次不计、连续 3 次取中位数——已落地 sc1 e2e 口径"

The content is required and correct (disk-verified), but measurement mechanics belong with Setup's timing-leg bullet ("首屏计时腿 = …固定种子 preset"), keeping the outcome observation-level ("首屏可交互 ≤2 秒(计时口径见 Setup)").

### 3. Precondition Exclusivity — 150/150

**3a. Distinct across outcomes (60/60)** — The Step 1 family is cleanly partitioned by data state: readable+populated (happy) / read-failure (1b) / readable+zero-tasks (1c) / not-yet-ready (1d); 3b's no-match filter state and 5b's board-loaded-but-task-corrupt state are each distinct and explicitly contrasted against 1b ("看板正常加载,但…"). No overlapping pair.

**3b. Sufficient to uniquely select (50/50)** — Given Setup plus a precondition, exactly one outcome applies at any observation point; 1c passing transiently through 1d's loading phase is phase-scoped, not ambiguous. No ambiguous scenario found.

**3c. No missing preconditions for error/boundary outcomes (40/40)** — Every edge states its trigger. The iteration-1 class (happy steps carrying enabling facts inside action text, fixture not guaranteeing them) is fully cured: Steps 2/4/5 each declare "…(Setup 预置)" and Setup bullets 1–2 establish exactly those facts; 1b/1c/5b name their injection provisioning; 1d names its trigger condition. Steps 1/3 run on Setup's global state without anaphora. Full marks — cleaner than the sibling's revision, which left two implicit-anaphora steps.

### 4. Fact Alignment — 146/150

**4a. Factual claims traceable (60/60)** — Traceability is strong end-to-end and was spot-verified against disk: ≤2s/500 + median-of-3 口径 ← G1/SC1 + `sc1-board-consistency.spec.ts` (verified: warm-up uncounted, 3 measured runs, `FIRST_INTERACTIVE_BUDGET_MS = 2_000`); "同种子 ⇒ 同文件字节" ← `task-generator.ts` determinism contract (verified verbatim); "生成器方言恒不虚构 branch/worktree 字段" ← generator header Hard Rule (verified verbatim); 7 态 ← UF2 + generator `TASK_STATUSES` (7 members, verified); 分支名列/角标/详情三要素/挂接空态/error+重试/空态引导/筛选空态/即时更新 ← UF2/UF3/Story 1 rows verbatim; invariants ← BIZ-task-ops-001 (人侧只读、仅呈现不写回), G1, DF005 (invariant 3's carve-out matches the 视图状态 row). The iteration-1 invariant-3 over-claim is cured. No unverified factual claim found.

**4b. Inferred claims have rule support + `source: inferred` (46/50)** — All three material derived edges now carry both the `required_outcomes` mapping comments and `source: inferred` annotations with stated bases (1b atomicity ← UF2 error-state semantics + SoT discipline; 3b recovery ← view-state-vs-data-state reasoning + UF2 flow 3 symmetry; 5b isolation ← 1b atomicity's per-object generalization). Dock −4 for two residual unannotated derived clauses:

- Step 2: "无执行痕迹的任务显示空占位(不虚构 forge 未写的字段)" — UF2's Data Requirements specify the branch column for tasks that have one, but say nothing about the no-trace display; the clause (true in the repo — the e2e asserts the '—' placeholder) is presented without any source marker;
- Step 1d: "未就绪期间不显示错误态或空态" — the parenthetical "(UF2 States:loading 行)" cites the loading row, but state-exclusivity during load is an inference beyond the row's literal text, unannotated while sibling edges 1b/3b/5b annotate the same class.

**4c. No hallucinated unclassified claims (40/40)** — Sweep of every assertion found no inverted or invented behavior; all headline claims trace to PRD/business-rule text or to disk-verified artifacts; the two residual unlabeled clauses above are sensible inferences scored under 4b, not hallucinations. No −30 instances.

### 5. Surface Fitness — 145/150

**5a. Mandatory derived outcomes present (60/60)** — Both mandatory web outcomes explicitly considered with labeled mapping comments: 1b ("surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口/无服务端会话模型),无字面会话过期面;通道失效类比 = forge 数据读取失败…") and 3b ("validation-error → 本旅程无表单输入面;唯一输入面 = 筛选器组合,按 UF2 校验规则映射为明确空态(非错误)= 本边"). Both mappings are sound: the exclusion rationale is domain-true (M1 无端口 model, BIZ-privacy-001 offline baseline), and the functional analogs carry the rules' assert elements (distinct failure surface + retry/recovery + no wrong data). Unlike the sibling (whose session-expired analog missed the re-entry point), this journey's only gated entries are board entry and detail open — both covered (1b, 5b).

**5b. Test strategy proportions (47/50)** — Balanced 50/50 well served: 5 journey-level happy steps + 5 edge outcomes, with the load step carrying three state alternates (1b/1c/1d), the filter step one (3b), the detail step one (5b), and 1b adding a recovery exercise. Dock −3: the interaction-time boundary class is represented only by 3b — Step 2 (view switch) and Step 4 (worktree observation) have no contract-grade alternate, the no-fabrication boundary being the obvious candidate (see 1c).

**5c. Realistic web environment/execution assumptions (38/40)** — Much improved and disk-grounded: isolated disposable fixture + userData + cleanup; declared oracle channel; realistic async handling; a timing leg whose measurement convention is implemented and landed. Dock −2: Step 1d's transient state has no deterministic trigger provision —

> "**Precondition**: 任务看板数据尚未就绪(首次加载大任务集;切换项目同口径)"

— "尚未就绪" cannot be commanded by a browser driver; on a small fixture the loading window may be too brief to observe (flaky leg). Step 1 pins its timing leg to Setup's 500-task preset explicitly; 1d should do the same (or declare a throttle seam) so the loading window is guaranteed observable.

### 6. Internal Consistency — 150/150

**6a. Invariants hold in every step (60/60)** — All four invariants verified against all steps and edges: 人侧只读 (no step or edge grants a write path; detail stays read-only); forge task list 全维度覆盖 (Steps 1/2/4/5 collectively cover 状态/依赖树/worktree/记录); invariant 3 now correctly scoped — forge data + 注册表/挂接索引 untouched, view state carved out per DF005, so Steps 2/3's view/filter interactions no longer falsify it; invariant 4 contradicted by no step. No violation found.

**6b. Cross-step references consistent (50/50)** — Every edge is correctly anchored to its true base step (1b/1c/1d share Step 1's exact action "用户进入任务看板"; 3b is a Step 3 variant; 5b is a Step 5 variant — the iteration-1 misanchor is cured); every "(Setup 预置)"/"见 Setup" pointer resolves to an actual Setup bullet (verified individually); "该任务" in Step 4 resolves to its own Precondition-named task. No dangling or contradictory reference.

**6c. Risk level consistent (40/40)** — Low is exactly right: read-only observation throughout, matching the rubric's Low = read-only expectation and the gen-journeys Low criteria.

### 7. Workflow Coverage — 138/150

**7a. Golden Path existence (60/60, veto not triggered)** — Semantic verification performed: 5 contiguous domain-level steps map onto Story 1's "I want" clause list — 依赖树 (Step 1), 状态分组 (Step 2), 筛选/排序 (Step 3), worktree 标识 (Step 4), 任务详情 (Step 5) — verified against Story 1 AC1–AC3 and UF2's interaction flow, not merely step-counted. Steps reference domain operations, not API mechanics. (`golden_path: false` frontmatter remains correct feature-level delegation to `task-session-execution-loop`; the veto tests content, which qualifies.)

**7b. Multi-step coverage depth (43/50)** — Within the read-only envelope the depth is now good: error recovery exercised end-to-end (1b: inject → error+retry → clear obstacle → recover → consistency re-check), loading boundary (1d), empty boundary (1c), filter-empty with recovery (3b), per-task fault isolation (5b), multi-view and multi-filter interaction. Dock −7 for what the envelope still leaves unexercised: no state transitions or entity lifecycle operations are possible by design (write operations are out of scope), so depth rests on view/filter/detail variation plus recovery — and even there, Step 3 treats all three filter dimensions and sorting in a single generic step ("使用筛选器(feature/状态/worktree)与排序") with no per-dimension leg, and Step 4's negative space (traceless task) is unasserted.

**7c. Workflow completeness against PRD scope (35/40)** — Story 1 AC1–AC3 all covered ✓; UF2 validation rules both covered (只读 invariant 1; 筛选空态 3b) ✓; UF2 states fully covered (loading/empty/error/populated; updating delegated to `dual-form-consistency`/`task-session-execution-loop` — legitimate decomposition, confirmed to exist) ✓. Docks:
- −3: UF3's validation rule "记录内容按 forge 原文渲染(markdown 防注入)" is uncovered and undelegated — Step 5 asserts "详情面板展示描述、依赖链、执行记录,均可只读浏览" but nothing about rendering fidelity or injection safety, although the oracle channel to assert verbatim rendering already exists in Setup and the landed e2e asserts exactly this fidelity (description body line + record summary containment). 只读 ≠ 防注入; the UF3-named surface's own validation rule has no leg.
- −2: UF3's loading state ("loading | 骨架 | 打开详情") is unexercised — the journey added 1d for the board's loading state but not the detail panel's, despite claiming UF3 in the traceability header.

### Cross-dimension coherence check

- **Step 4 action/outcome asymmetry** charged once, under Completeness 1b; not re-charged in 6b (not a cross-step reference) or 7c (AC2's card-badge half is covered).
- **No-fabrication asymmetry** legitimately spans two facets: Completeness 1c (missing boundary outcome) and Surface Fitness 5b (contract-side depth); each sub-score reflects its own facet, mirroring the sibling precedent for the injection-boundary gap.
- **Measurement-protocol placement** charged once in Semantic Purity 2c; the protocol's content is disk-verified and costs nothing under Fact Alignment.
- **Unannotated clauses** charged once in 4b; they are not hallucinations (4c clean) and their behavior is repo-true.
- **1d trigger determinism** charged once in 5c; the persisted-view-state hazard (Phase 3 B1) is a distinct, rubric-external execution concern and costs no points in-dimension.
- **UF3 rendering-fidelity gap** charged once in 7c; it is not re-charged in 1c (1c's dock is the worktree-badge boundary, a different clause).
- Mandatory-outcomes engagement now costs nothing anywhere (5a full) — the iteration-1 triple-facet charge (1c/4b/5a) is dissolved by the mapping comments.

---

## Phase 3 — Blindspot Hunt ([blindspot] = outside all rubric dimensions)

1. **[blindspot] Persisted view state makes Step 1's "默认" assertion non-deterministic across reruns.** Step 1 asserts "默认展示图形化依赖树" while invariant 3 explicitly allows "当前视图/筛选/排序的本地记忆属 DF005 视图状态按需读写" — i.e., a conforming implementation persists the last view (the landed e2e proves it does: `sc1-board-consistency.spec.ts` must run `localStorage.removeItem('dsh.forge.workbench.view')` in every `finally` block precisely so the tree view is the deterministic default on the next boot). The journey never states a view-state reset between legs/boots; a downstream generator that reuses the userData dir (as the timing leg's 3 measured boots do) will see Step 2's list/grouped view leak into Step 1's "默认展示" on rerun. No rubric dimension covers inter-leg state leakage from workbench-own persistence. *Fix: add to Setup — "每腿启动前重置视图状态(DF005 视图记忆),保证 Step 1 默认视图确定性".*

2. **[blindspot] The one fixture fact Steps 2/4 depend on has no data dialect.** Setup prescribes "fixture 预置 ≥1 个在非默认 worktree 有执行痕迹、带执行分支名的任务(真实 git worktree + 执行痕迹写入;生成器方言恒不虚构 branch/worktree 字段)" — but the generator (verified: `task-generator.ts` pins branch/worktree to null/false and never emits them) deliberately cannot produce this task, and the journey nowhere specifies the forge-file form that carries 分支名/worktree 痕迹 (which file, which frontmatter key, how the indexer detects it). Every other fixture fact is either generator-produced (byte-deterministic) or an explicitly injected corruption; this one is neither. A downstream agent assembling the fixture from Setup + generator alone cannot provision the Step 2 branch-name column or the Step 4 badge. *Fix: specify the trace/branch data dialect (or cite the parser/indexer rule that consumes it) in Setup bullet 2.*

3. **[blindspot] Frontmatter `sources` is stale relative to the body's actual citations.** The body grounds its two strongest claims in repo artifacts — "已落地 sc1 e2e 口径"(Step 1) and "同种子 ⇒ 同文件字节"(Setup, the generator's determinism contract) — but frontmatter `sources` still lists only the three PRD files. Traceability works because the citations resolve on disk (both verified), yet a tooling consumer reading only frontmatter misses the e2e/generator provenance. Same class as the sibling iteration-2 blindspot (no rubric dimension checks frontmatter-vs-body source consistency). *Fix: extend `sources` with the e2e spec and fixture-generator paths.*

4. **[blindspot] Declared invariants carry no exercising leg — a rubric criterion gap.** Invariant 4 declares "看板交互件(视图切换/筛选/排序/任务卡片/详情开关)可经键盘到达与操作,动态内容…带可读名称(aria-label/文本,中英双语)" — surface-web.md General Testing Principle 4 — yet no step or edge exercises keyboard reachability or accessible names (the landed e2e incidentally asserts card aria-labels, but the journey neither knows nor says so). The rubric checks that invariants are not *violated* (6a) but no dimension requires a declared invariant to be *tested*; this journey's accessibility posture is therefore assertion-without-coverage. No points charged (no dimension owns it). *Fix: add a keyboard-traversal edge or note the delegated coverage target.*

---

## Verdict

All iteration-1 attacks resolved with verifiable sources (two repo claims disk-verified true); remaining deductions (31 pts total) are concrete, quoted, and concentrated in annotation/coverage residuals (unannotated derived clauses, Step 4's unasserted detail-side mark, UF3 rendering-fidelity and detail-loading legs, 1d's trigger determinism). No hallucinated claims, no invariant violations, no precondition overlaps, golden-path veto not triggered.

**Final: 1119/1150 — PASS (total ≥ 975; every dimension ≥ 90).**
