# Eval Report: journey/task-dispatch-pipeline — Iteration 1

- **Eval type**: journey (rubric scale 1150, target 975, every dimension ≥ min threshold)
- **Surface**: web (rule: `gen-journeys/rules/surface-web.md`)
- **Scorer stance**: adversarial; every deduction cites the document
- **Date**: 2026-10-07

## Final Score

| Dimension | Score | Min Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 170/200 | 120 | YES |
| 2. Semantic Purity | 166/200 | 120 | YES |
| 3. Precondition Exclusivity | 112/150 | 90 | YES |
| 4. Fact Alignment | 106/150 | 90 | YES |
| 5. Surface Fitness | 80/150 | 90 | **NO** |
| 6. Internal Consistency | 132/150 | 90 | YES |
| 7. Workflow Coverage | 128/150 | 90 | YES |
| **Total** | **994/1150** | **975 + all thresholds** | **NO (Surface Fitness 80 < 90)** |

**Verdict: FAIL.** Total exceeds 975 but Surface Fitness is below its min threshold (90). The pass condition requires both.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Workflow fidelity is high.** The 6-step happy path is a faithful extraction of PRD Story 2 and prd-spec 流程一 (items 1–4 + 8). Spot-checked claims verify against the PRD nearly verbatim: 「就绪选择（分支延续优先 + priority → 创建序）」= prd-spec Flow 1 step 2; dispatchPrompt 四段构成 = Story 2 AC1; 「写入返回后单次重取即见新值」= SC7.
2. **Scope partitioning across siblings is deliberate** — fix chain (Story 3) and interrupted recovery (Story 4) have their own journey directories (`fix-chain-auto-recovery`, `interrupted-dispatch-recovery`), so this journey's stopping at 「任务 in_progress→blocked」 for Step 5b matches PRD Story 2 AC3's own boundary.
3. **Git-absent path is compensated, not contradicted**: tech-design rules git an optional dependency (`executor 遇 git 缺席走 submitTask result=blocked`); the journey's Setup pins 「工作区代码仓处于可提交状态（git 可用）」, so Step 5's 「git 提交产生」 is conditionally sound — but the narrowing is silent (see blindspots).
4. **Real defects found**: (a) Step 3b mislabeled cross-reference; (b) precondition overlap pairs 2b/2c and 5b/5c; (c) web-mandatory derived outcomes absent without consideration; (d) code-audit assertions and DB-verb values embedded as outcomes.

---

## Phase 2 — Dimension Scoring

### 1. Completeness — 170/200

**Metadata (48/50).** Frontmatter complete: kebab-case name, `risk_level: "High"`, `golden_path: true`, `surface_types`/`surface_keys` non-empty, three `sources`, `generated`. Risk High is justified by content (task state mutations, git commits, blocked transitions). No deduction beyond minor formality.

**Steps complete (76/80).** All 6 happy steps carry `**User Action**` + `**Expected Result**` and form a coherent ordered sequence. Deduction: Step 4's expected result is a deferral, not an observation — 「质量门四步全部通过，gate 结果可被记录与提交」 states a *capability* ("可被") whose substance only materializes in Step 5; the step has no independently observable outcome of its own.

**Happy + required derived scenarios (46/70).** Happy path fully covered; High-risk density satisfied exactly (6 edge cases ≥ 6 happy steps). Error/boundary outcomes are present for claim (2b, 2c), submit (3b, 5b, 5c), and UI concurrency (6b). Deduction: the surface type's `required_outcomes` (web: `validation-error` + `session-expired`) produced **zero** derived outcomes and **zero** consideration records (no N/A note, no rule citation). The only validation-family outcomes (3b, 5c) are tool-boundary rejections, not the web-surface mandated form, and nothing ties them to the rule.

### 2. Semantic Purity — 166/200

**Natural language, no code/regex (68/80).** No regex, CSS/XPath selectors, or framework assertion calls anywhere. Deduction: several outcomes embed verification *methodology* rather than observation — Step 5b: 「插件不注册人类通道 tool（transitionTask / transitionFeature——代码审计 0 注册）」 is a code-audit assertion (how it will be verified), not what user/system observes in the workflow; Step 1 similarly: 「应用自身不发起任何编排动作（web 无编排逻辑）」 states a code-property. PRD does mandate these assertions (AC3), so extraction is faithful — but the phrasing carries the audit procedure into the outcome text.

**Preconditions declarative (58/60).** Setup items and all six edge-case `**Precondition**` fields are states, not procedures (「库中任务前置均未满足…」, 「executor 提交 blocked 但 reason 缺席」). Clean.

**No implementation coupling in steps (40/60).** Substantial coupling in actions/results: 「dispatcher 经 claimTask tool 领取任务」, 「executor 调 submitTask（携带 gate 结果 / 执行摘要 / 提交哈希 / 执行会话 id）」 are internal API calls; expected results carry database record shapes — 「审计记录（verb='claim'，含派发会话 id + 挂接行）」 — and internal prompt structure — 「人格段（task-executor，无标签）+ 约束块 + 动态信息块（含 BLOCKERS 依赖快照）+ 类型策略块」. These are PRD-mandated assertions, so the coupling is inherited from source, but per rubric ("not internal function calls, database queries, or API endpoint details") this is the weakest criterion of the document. Step titles themselves (「executor 提交结算落账」) are domain-level, which keeps this from scoring lower.

### 3. Precondition Exclusivity — 112/150

**Distinctness across outcomes (40/60).** Two ambiguous pairs, each −20 per the deduction rule:

- **2b ⊃ 2c.** Step 2b's precondition is a three-way disjunction: 「库中任务前置均未满足，或全部已处终态，或库中无任务」. Step 2c's precondition: 「某 pending 任务存在未终态前置依赖（满足集 {completed, skipped} 之外的状态）」. A library containing exactly one pending task with unmet dependencies satisfies both simultaneously ("库中任务前置均未满足" AND "某 pending 任务存在未终态前置"), and both outcomes describe the same terminal behavior (no claim) with different framing (循环等待/结束 vs 守卫拒绝放行) — a tester cannot determine which outcome applies.
- **5b ∩ 5c co-occurrence.** Step 5b's precondition 「executor 执行中质量门未通过或执行受阻」 is silent on `reason`; Step 5c's 「executor 提交 blocked 但 reason 缺席」 is silent on gate outcome. A blocked submission with a failed gate AND a missing reason matches both, yet the expected results diverge materially (5b: 「任务 in_progress→blocked（reason 落审计）」 vs 5c: 「拒绝提交…任务状态不变更」). No precedence (validation-before-transition) is stated.

**Sufficient to uniquely select (37/50).** Given the two overlapping states above, unique selection fails in exactly those states. All other pairs (3b vs 5b/5c; 2b vs 2c against 5x/6b) are cleanly separable by task-library state vs execution-time state.

**Missing preconditions for error/boundary outcomes (35/40).** All six edge cases state an explicit triggering precondition — good. Minor: 3b's precondition 「任务实际状态与动词假设不符（如已被人工转移出 in_progress）」 gives only one example ("如") of the mismatch class rather than the boundary of the class.

### 4. Fact Alignment — 106/150

**Factual claims traceable (45/60).** Document-level traceability exists (frontmatter `sources`; Overview cites 「PRD Story 2；业务流程一主链；SC-M2 门核心场景」), and every spot-checked behavioral claim verifies against prd-spec/tech-design (priority ordering, dispatchPrompt composition, audit field set, 单次重取判据, Z1 no-ready exit, no per-spawn injection per DF004). Deduction: no per-claim trace markers are used anywhere (no fact references, no UNKNOWN markings), and at least one claim is a silent extrapolation — Step 3's 「约束标记原样保留」 appears in neither PRD AC nor DF004 verbatim (nearest anchor: tech-design Interface 9's closed four-tag set); it is presented as fact without classification.

**Inferred claims with rule support + `source: inferred` (25/50).** Zero `source: inferred` annotations exist in the document, and zero of the six edge cases cite a `required_outcomes` rule as derivation basis. The web rule's mandatory derivations were not performed at all (see Surface Fitness), so there is nothing to annotate — the mechanism is entirely absent.

**No hallucinated unclassified claims (36/40).** No claim contradicts PRD/design; the two mild extrapolations noted above (「约束标记原样保留」, 2c's 「不产生部分领取或越序领取」 — grounded in tech-design's 并发与重入域) are reasonable inferences from the cited source set but are technically unclassified.

### 5. Surface Fitness — 80/150 (BELOW THRESHOLD 90)

**Mandatory derived outcomes (18/60).** The web rule requires `validation-error` and `session-expired` to be **considered for every Web Journey**. Both are absent in their specified form, and neither is marked considered/inapplicable:
- `validation-error` (user submits a form with invalid data → error near field, not submitted, can retry): this journey contains no web form outcome. The closest analogues (3b, 5c) are agent-tool API rejections — semantically adjacent (invalid input rejected, state preserved) but never linked to the rule and not user-facing web behavior.
- `session-expired`: completely absent. For a local single-user Electron workbench this is likely genuinely inapplicable (no auth sessions), **but the document never says so** — an explicit N/A annotation with reasoning was the rule's minimum bar. Per the rubric ("Score 0 if mandatory Outcomes are completely absent"), a strict reading scores this criterion 0; the 18 points granted reflect the adapted validation-rejection semantics in 3b/5c.

**Test strategy proportions (32/50).** Web guidance is balanced 50/50 Contract/Journey. Outcome density is rich (12 scenarios with deep per-step assertions), but the browser-facing journey-smoke side is thin: only Step 6 (and 6b) exercise the actual web surface; Steps 2–5 are contract-grade agent-pipeline assertions. For a declared web surface, the depth distribution skews contract-heavy.

**Environment/execution assumptions (30/40).** Realistic where present: 「应用已启动，项目会话可发起技能指令」 covers app-launch readiness; Step 6/6b handle the async write→read path correctly (「写入返回后单次重取即见新值」, no fixed timeouts). No unrealistic CLI-style assumptions. Deduction: web execution realities from the surface rule (browser automation, wait strategies for async, state cleanup between steps) are untouched; the journey assumes its single refetch assertion covers all async behavior.

### 6. Internal Consistency — 132/150

**Invariants hold in every step (56/60).** All five invariants were checked against all 12 scenarios: audit-per-write-verb holds (2b/3b/5c involve no completed write verb → vacuously true; 3b's 「如已被人工转移出 in_progress」 routes through the same core verb gate per invariant 2 「UI 与 tool 同门，无第二写者」); direct-read/no-watch invariant matches Step 6/6b; app-does-not-orchestrate matches Steps 1 and 5b. No violations found.

**Cross-step references consistent (38/50).** One real defect: **Step 3b is numbered as a variant of Step 3 but performs Step 5's action.** Step 3 is 「dispatcher 同步派发匿名 executor」; Step 3b's User Action is 「executor 调 submitTask 结算」 with precondition 「任务实际状态与动词假设不符（如已被人工转移出 in_progress）」 — a submit-time scenario that can only occur after claim (Step 2) and execution (Step 4). The edge-case-to-happy-step reference convention (Nb variants Step N, correctly used by 2b/2c/5b/5c/6b) is broken here; a downstream agent mapping edge cases to steps will bind this rejection case to the wrong step.

**Risk level consistent (38/40).** High is correct: state mutations (pending→in_progress→completed/blocked), git commits, append-only audit writes — irreversible/state-changing operations throughout.

### 7. Workflow Coverage — 128/150

**Golden Path existence (56/60, no veto).** Verified semantically: the contiguous 6-step sequence maps one-to-one onto PRD Story 2's core workflow (「在项目会话里发起 run-tasks，管线自动领任务 → 派发执行 → 质量门通过后落账并提交」 → 「概览列表实时反映」) and prd-spec 流程一. Step titles use domain terminology (「领取就绪任务」, 「提交结算落账」, 「确认新状态」). Minor dock: Steps 2/5 User Action lines lead with the tool call (「executor 调 submitTask…」) alongside domain verbs — mixed altitude, though the step titles keep it above the API-only bar.

**Multi-step coverage depth (38/50).** Covers state transitions (three distinct paths out of pending/in_progress), rejection paths (3), and read/write concurrency (6b); cross-entity touches (task↔session 挂接, git commit artifact) are asserted inline. Missing depth for a pipeline journey: no multi-task loop behavior (the 派发循环 claiming a *second* task after settlement), and no tool↔tool concurrency (see blindspot #1 — both owned by neither this nor, verifiably, the required scope of sibling journeys for the former).

**Workflow completeness vs PRD/Design (34/50→34/40).** Story 2's three ACs are each covered (AC1→Step 2, AC2→Steps 4–6, AC3→Step 5b). Fix-chain continuation and interrupted recovery are absent here but have dedicated sibling journeys (`fix-chain-auto-recovery/`, `interrupted-dispatch-recovery/` exist on disk) — acceptable partitioning. Minor gap: Step 5b ends at 「任务 in_progress→blocked（reason 落审计）」 with no pointer that the story continues elsewhere, unlike the Overview which does cross-reference its PRD anchors.

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] Tool↔tool concurrency (double dispatch) untested.** Tech-design explicitly engineers for it: 「就绪选择仅扫 pending 池；in_progress 幂等重入仅限显式 taskRef 或 links 已含本会话——无 taskRef 的盲选**不领** in_progress（双 dispatcher 并发不双派发）」. This journey — the dispatch-pipeline journey — covers only tool-vs-UI concurrency: 「tool 写入与 UI 读取无锁竞争（派发循环与页签浏览互不阻塞）」 (Step 6b). Two concurrent run-tasks sessions racing to claim the same task is a primary production bug class for this exact pipeline and has no outcome here.
2. **[blindspot] Step 4's expected result is circular.** 「质量门四步全部通过，gate 结果可被记录与提交」 — "can be recorded and submitted" defers all observable substance to Step 5; nothing about Step 4 itself is verifiable from this sentence (what does the developer/dispatcher observe while gates run?).
3. **[blindspot] No user-observable pipeline completion signal.** Step 2b's 「派发循环等待或结束」 describes internal dispatcher behavior only; when all tasks reach terminal state, what the *developer* sees in the session/UI (loop exit message, list quiescence) is never stated — the Golden Path ends at a single task's completion, not the workflow's end state.
4. **[blindspot] Setup silently narrows the git dimension.** 「工作区代码仓处于可提交状态（git 可用）」 pins git present, making tech-design's ruled alternate path (「executor 遇 git 缺席走 submitTask result=blocked（fix 链承接）」) unreachable in this journey with no cross-reference assigning it to a sibling — a downstream test author would not know the branch exists.
5. **[blindspot] Invariant 1 has an untested rejection-state corollary.** 「每次写动词必产生一行 append-only 审计记录」 is only asserted on success/blocked paths; 3b/5c assert 「不落部分审计」 but no outcome verifies that a *rejected* attempt leaves zero audit residue AND that retry-after-rejection then produces exactly one row — the append-only ledger's behavior across rejection-then-success sequences is the classic audit-table bug pattern.

---

## Attack Summary (what must improve for iteration 2)

1. **[surface-fitness]** Add web-mandatory derived outcomes (`validation-error`, `session-expired`) or explicit, reasoned N/A annotations citing the web surface rule — currently neither exists. Highest-priority fix: this alone gates the pass condition (80 < 90).
2. **[internal-consistency]** Renumber/move Step 3b — its action 「executor 调 submitTask 结算」 belongs to Step 5, not Step 3.
3. **[precondition-exclusivity]** Disambiguate 2b vs 2c (make 2b's "前置均未满足" clause exclude 2c's specific single-task case, or restate 2c as the guard-level outcome with 2b reserved for empty/terminal libraries) and 5b vs 5c (state that reason-validation precedes transition).
4. **[semantic-purity]** Split code-audit assertions (「代码审计 0 注册」) out of workflow outcomes into invariant/annotation form; keep outcomes observational.
5. **[fact-alignment]** Mark design-derived claims (「约束标记原样保留」) with `source: inferred` + basis.
6. **[workflow-coverage/blindspot]** Add double-dispatcher claim exclusivity and a user-observable loop-completion outcome.
