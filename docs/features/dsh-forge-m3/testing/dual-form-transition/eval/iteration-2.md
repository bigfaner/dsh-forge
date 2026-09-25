# Eval-Journey Report — Iteration 2

- **Document**: `docs/features/dsh-forge-m3/testing/dual-form-transition/journey.md`
- **Rubric**: journey (1150 pts, target 975, per-dimension thresholds)
- **Surface**: web (`rules/surface-web.md`)
- **Scorer persona**: Senior QA Engineer
- **Iteration**: 2 (previous report: `eval/iteration-1.md`, 813/1150 FAIL)
- **Reality-check inputs**: `docs/business-rules/{coexistence,privacy,resilience,task-operations,workbench}.md`, `docs/features/dsh-forge-m3/prd/{prd-user-stories,prd-spec,prd-ui-functions}.md`, `docs/features/dsh-forge-m3/design/tech-design.md`, `docs/proposals/dsh-forge-m3/proposal.md`

## Verdict

**Total: 1041 / 1150 — PASS** (target 975 met; every dimension above its minimum threshold; lowest = Surface Fitness 130 ≥ 90).

| Dimension | Score | Min | Pass |
|-----------|-------|-----|------|
| 1. Completeness | 182/200 | 120 | PASS |
| 2. Semantic Purity | 173/200 | 120 | PASS |
| 3. Precondition Exclusivity | 142/150 | 90 | PASS |
| 4. Fact Alignment | 138/150 | 90 | PASS |
| 5. Surface Fitness | 130/150 | 90 | PASS |
| 6. Internal Consistency | 143/150 | 90 | PASS |
| 7. Workflow Coverage | 133/150 | 90 | PASS |
| **Total** | **1041/1150** | 975 | **PASS** |

Scored only what is on the page now; no credit for improvement itself.

### Iteration-1 issues → revision disposition (verification, not scoring)

| Iter-1 attack | Disposition |
|---|---|
| #1 both web-mandatory outcomes absent | Addressed: validation-error mapped + delegated (Step 2 comment, sibling Step 1b verified); session-expired materialized as Step 3c (sibling Step 5c family verified) |
| #2 write-ownership contradiction (invariant vs 2b) | Addressed: T3 watcher reingest bridge imported and asserted (2b + invariant 3) |
| #3 ungrounded perception claim (2b) | Addressed: grounded in tech-design Interface 4 item 7 (verified verbatim) |
| #4 zero source annotations | Addressed: `source:` / `source: inferred` comments on Steps 3, 1b, 1c, 2b, 2c, 2d, 3b, 3c; required_outcomes mapping comments on Steps 2 and 3c |
| #5 2b deviation clause untriggered | Addressed: 2b now asserts project-level deviation (`projects.deviated` semantics, correct trigger); feature-level cross-phase deviation explicitly delegated to stage-gates Step 7 (verified to exist) |
| #6 undefined oracle "各通道预期" | Addressed: per-channel oracle defined (registered = board vs kernel authoritative table zero-diff; unregistered = CLI view = in-repo forge files; app never sees it) |
| #7 3/3b not exclusive | Addressed: 3b precondition declares explicit mutual exclusion with Step 3 |
| #8 mega-steps | Largely addressed: Step 1 decomposed to init→add→claim→transition→submit; Step 3 quantified (两轮, order + reverse); Step 2 remains delegation-backed composite (residual, see D1-c2) |
| #9 zero failure-path outcomes | Addressed: 1c (illegal transition rejection + retry), 2c (reingest chain failure + recovery), 3c (host/session channel failure) added |
| #10 risk Medium under-classified | Addressed: reclassified High with explicit justification comment |
| #11 ≤5s without tolerance | Addressed: wait strategy + CI tolerance + BIZ-workbench-005 citation |
| #12 web-only declaration over terminal legs | Addressed: Setup declares harness subprocess channel for terminal legs and browser channel for board assertions (enumeration gap remains, see D6-c2) |
| #13 fixture hygiene unstated | Addressed: temp dirs + isolated userData + cleanup + single-instance lock check |
| #14 git hook non-breakage uncovered | Addressed: Step 2d added, grounded in 归宿分解决议 |
| #15 [blindspot] index.json recreation unasserted | Addressed: 2b asserts recreation detected + reingested + not a second SoT |
| #16 [blindspot] M3-之前 baseline undefined | Addressed: Setup defines frozen pre-M3 build golden set on fixed fixture tasks, verbatim comparison |

---

## Phase 1 — Reasoning Audit

**Problem → Solution**: unchanged from iteration 1 and still sound — the three happy steps map one-to-one onto Story 8 AC1–AC3 and SC7's two legs (verified against prd-user-stories.md and prd-spec SC7); the proposal Key Scenario 「过渡双形态」 (proposal.md L75) verifies verbatim. `golden_path: false` delegation remains valid (sibling carries `golden_path: true`).

**Solution → Evidence**: the revision closed the two oracle gaps iteration 1 flagged: the M3-之前 baseline is now a defined artifact ("M3-之前行为基线 = 冻结的 pre-M3 forge CLI 构建,在固定 fixture 任务集上预录制的 golden 对照集(init/add/claim/transition/submit 的命令输出、任务数据格式、CC 插件指令清单)"), and per-channel expectations are now explicit ("已注册项目:看板呈现 = 数据内核权威表(ID/状态/依赖/标题对拍零差异);未注册项目:forge CLI 任务视图 = 仓内 forge 文件,应用恒不可见该项目"). Evidence now includes three genuine failure paths (1c, 2c, 3c).

**Evidence → Success Criteria**: outcome口径 match SC7/SC1/BIZ-workbench-005 and are now executable (baseline artifact declared, wait strategy declared, assertion channels declared).

**Self-contradiction check (cluster + bidirectional derivation, re-run on revised entries per protocol)**:

- **Cluster: registered-project write ownership** (iteration-1 CONTRADICTION — re-verify). Invariant 3 now reads "已注册项目的外部会话写不构成第二写路径 —— 经 T3 watcher 重摄入回收并置偏离,读路由恒经内核,单一事实源恒成立"; Step 2b asserts the bridge. Derivation: assume invariant holds (kernel sole authority, read routing via `projects.data_authority`) → an external write recreating `tasks/index.json` is a non-authoritative artifact that is detected and reingested — 2b satisfiable. Assume 2b holds (recreation detected → idempotent reingest → `projects.deviated=1` + `migration_event(reingest)`, verified verbatim in tech-design Interface 4 item 7) → authority never leaves the kernel → invariant holds. **Contradiction resolved; both directions close.**
- **Cluster: zero-spawn discipline vs external CC-plugin usage** (iteration-1 mild). Invariant 2 now scopes explicitly: "口径不含外部会话过渡形态 —— 2b/2c/2d 的外部操作不属本条管线". Resolved for 2b/2c/2d. Residual: 3b executes an app-channel commit on the registered project inside an alternation whose terminal half is external — whether invariant 2's zero-spawn assertion applies during 3b's app commit must be inferred (it does apply, but 3b's outcome never asserts it). Narrowed, not fully closed (scored D6-c1).
- **Cluster: 2b trigger vs outcome** (iteration-1 mismatch). 2b's outcome now asserts project-level deviation, whose trigger (external write → reingest) IS its precondition; the feature-level cross-phase clause moved to an explicit delegation note. **Resolved.**
- **New-entry check (1c, 2c, 2d, 3c)**: 1c (illegal transition on unregistered) conflicts with nothing — invariant 1 asserts zero-change vs baseline and 1c asserts the rejection behavior IS baseline-identical. 2c is 2b + fault (distinct preconditions, exclusive). 2d's external terminal submit on the registered project is within invariant 2's exclusion and consistent with 2b's T3 mechanism — but 2d's own outcome set is silent on the T3 consequences of its own external submit (scored D1-c3, not a contradiction). 3c vs 3b: distinct fault conditions (channel unavailable vs in-flight changes present). **No new contradictions introduced by the revision.**

**Pre-score anchors** (channeled into dimensions/blindspot): (a) Setup terminal-leg enumeration "Steps 1/1b/1c/2d/3b" omits Step 3 and Step 3c terminal legs → D6-c2; (b) 1b is a CC-plugin interactive session, not a bare CLI subprocess the declared harness channel can drive → D5-c3; (c) Setup's assertion-channel inventory covers spawn/CLI/terminal/board but not the audit/read-routing channel the new SoT assertions require → D5-c3; (d) 3c conflates host-down with session-channel-down and "通道恢复后可继续,不残留半状态" has no defined mechanism → D3/D4; (e) validation-error delegated only while Step 2 itself performs the dispatch input action → D5-c1; (f) `sources:` frontmatter omits tech-design.md though the document's load-bearing grounding now rests on it → D1-c1; (g) divergent external write (stale-base conflict vs kernel state) untested → D7-c2; (h) reingested changes' board source-labeling (BIZ-task-ops-001/002 observable) never asserted → blindspot.

---

## Phase 2 — Rubric Scoring (verification stance)

### 1. Completeness — 182/200

| Criterion | Score | Notes |
|-----------|-------|-------|
| Metadata complete | 48/50 | `journey: "dual-form-transition"` kebab-case; `risk_level: "High"` valid and now justified in-content (Risk comment ties it to state-mutating pipelines in both forms + cross-form data destruction, consistent with the sibling's High for the same 派发→执行→提交); `golden_path: false` delegation valid (sibling verified `true`); `generated` present. Deduction: `sources:` lists only the three PRD files while Steps 2b/2c now ground their central mechanisms in `design/tech-design.md` (Interface 4.7, §Error Handling) — the fact base actually relied on is wider than the declared sources list; a downstream agent resolving facts from `sources:` alone would miss the load-bearing document. -2. |
| Steps complete (action/outcome) | 72/80 | All 10 steps (3 happy + 7 edge) carry User Action + Expected Result in coherent order; preconditions present on all edges. Step 1 is now concretely executable ("初始化(init)→ 新增并领取一个任务(add → claim)→ 完成后提交(transition → submit)"); Step 3 is quantified ("两轮交替,每轮在两项目各推进一个任务至提交:第 1 轮先终端…第 2 轮反序"). Residual: (a) Step 2 remains a delegation-backed composite — "看板多选任务并派发 → subagent 执行(经 dsh tool claim/submit)→ 提交后回看看板" requires the downstream agent to open the sibling to know how to dispatch/execute; the scoping comment ("本步断言过渡形态口径") mitigates but does not make the step self-executable. -3. (b) 2b/2d's external-change setup mechanics are underspecified: on a migrated project `tasks/index.json` is archived, so the external session starts from an empty CLI view and must recreate the file (the expected result acknowledges 复现, but which operation the harness performs to realize "经外部会话执行的任务状态变更" is left to inference). -2. (c) Step 1's "transition → submit" names no target state and edge bundles carry no per-assertion anchoring. -3. |
| Outcomes cover happy + required derived | 62/70 | Strong coverage now: three failure/recovery paths (1c CLI rejection + retry, 2c perception-chain failure + recovery, 3c channel failure + recovery), external-interference tolerance (2b), hook compatibility (2d), in-flight alternation (3b); web-mandatory derived outcomes considered via mapping comments (Step 2 validation-error, Step 3c session-expired); 2b doubles as the concurrent-edit analog (external modifier vs kernel-authoritative resource). Deductions: (a) async intermediate states (loading-state family) never considered even as a mapping note despite the ≤5s 回流 wait depending on one ("等待策略 = 感知事件/轮询断言" asserts the strategy, no outcome asserts the intermediate state). -2. (b) Step 2's dispatch/subagent failure family is carried by the sibling but no delegation comment says so (only validation-error is explicitly delegated) — a test generator scanning this document for Step 2 failure variants finds nothing and no pointer. -2. (c) Step 3 verifies only the end state ("两轮交替后双方数据与行为互不破坏") — no per-round checkpoint localizes a round-1 failure. -2. (d) 2d's external terminal submit necessarily triggers 2b's reingest/deviation behavior on the same registered project, but 2d's outcome set is silent on it — a hook test could pass while SoT discipline silently changed state. -2. |

### 2. Semantic Purity — 173/200

| Criterion | Score | Notes |
|-----------|-------|-------|
| Outcomes natural language, no code/regex | 64/80 | No regex, CSS/XPath, or `expect()`-class assertions — hard prohibitions clean; Setup centralizes the assertion-channel declaration, which reduces in-step leakage versus iteration 1. Remaining method/mechanism leaks: Step 2 "全程无冻结 CC 插件 spawn(进程/日志级断言,SC7 口径)" and "零 forge CLI 调用(SC1 口径)" embed verification-standard language; Step 2 "任务状态回流看板 ≤5s(等待策略 = 感知事件/轮询断言,不用固定 sleep;CI 计时用宽松阈值防抖动,BIZ-workbench-005)" puts pure test-strategy guidance inside an Expected Result (belongs in Setup, where part of it already lives); Step 2b "外部写致 `tasks/index.json` 复现/变更被 watcher 检出并幂等重摄入…migration_event(reingest) 留档" names the internal pipeline and an audit-table row rather than the user/board observation; Step 3b "单写者纪律未被破坏(未注册 = CLI 写仓内 forge 文件;已注册 = 数据内核权威,外部写经重摄入回收而非第二写路径)" asserts an architecture invariant inside an outcome; Step 1 "任务数据落仓内 forge 文件(CLI 通道照旧)" is a storage-sink assertion. -16. |
| Preconditions declarative, not procedural | 54/60 | Substantially improved: 1b "未注册项目的日常管线由冻结 CC 插件承载(/run-tasks 等指令可用)", 1c "存在一笔触发非法状态迁移的提交", 2b "存在经外部会话…执行的任务状态变更", 2c "感知/重摄入链路故障", 2d "仓内存在 M3 之前安装的 verify-task-done git hook" are all state-phrased. Residual mixes: 3b "两项目各自存在未提交的进行中变更(在途写入)状态下发生交替操作" and 3c "交替操作进行中,已注册项目的宿主/会话通道不可用" append activity context to state ("发生交替操作/交替操作进行中"), leaving the setup act readable inside the precondition. -6. |
| No implementation coupling in Step descriptions | 55/60 | Actions are user-level; CLI command names in Step 1 are the user's literal operations and dsh tool / 冻结 CC 插件 are PRD domain vocabulary. Leaks: 2d "经外部会话在终端完成一笔任务提交(触发 hook),检查 hook 文件与应用侧状态" puts the tester's verification act ("检查") inside the User Action; Step 2's parenthetical "(经 dsh tool claim/submit)" names the agent's write mechanism mid-action (acceptable as domain shorthand, minor). -5. |

### 3. Precondition Exclusivity — 142/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Preconditions distinct across Outcomes | 58/60 | All seven edge preconditions are pairwise distinct and each selects exactly one step: plugin-channel (1b) vs illegal-transition-pending (1c) vs external-write-present (2b) vs 2b+chain-fault (2c) vs hook-present (2d) vs in-flight-changes+alternation (3b, now explicitly exclusive with Step 3: "与 Step 3 互斥:Step 3 = 每轮写入即提交、无在途残留") vs channel-unavailable (3c). -2: 2c is 2b plus a fault — narrowing rather than orthogonal, acceptable since the fault condition is decisive, but the pair's relationship is sequential-causal and never stated. |
| Preconditions sufficient to uniquely select | 44/50 | The iteration-1 undefined oracles are gone (golden baseline defined; per-channel expectations defined). Remaining: (a) 3c "宿主/会话通道不可用(宿主异常/凭据失效)" conflates two states — host-process abnormal (board may be unreachable entirely, making "看板以错误/失败态呈现" unsatisfiable) vs session-channel unavailable with the app alive (presentation possible, the sibling 5c framing). One outcome block, two satisfiability profiles. -3. (b) 3c "通道恢复后可继续,不残留半状态" — "可继续" (continue what: the in-flight dispatch? the alternation round?) and the no-half-state mechanism are undefined, so pass/fail is not decidable as written. -3. |
| No missing Preconditions for error/boundary Outcomes | 40/40 | Every error/boundary outcome states its trigger: 1c (illegal transition exists), 2c (chain fault after external write), 3c (channel unavailable), 2b (external change present), 1b (plugin-carried pipeline). None missing. |

### 4. Fact Alignment — 138/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Factual claims traceable or marked UNKNOWN | 56/60 | Inline source comments now cover every edge step, and spot-verification confirms them: 2b's mechanism matches tech-design Interface 4 item 7 verbatim ("watcher 检出已迁移项目 index.json 复现/变更 → 幂等重摄入 → projects.deviated=1 + migration_event(reingest) 留档;不阻断外部会话"); 2c matches tech-design §Error Handling 感知面 verbatim + BIZ-resilience-001; 2d matches prd-spec 归宿表 verify-task-done 行 ("过渡期既有 hook 不破坏") + 归宿分解决议; 1b matches 归宿分解决议 ("CLI 留机器"); Step 3's channel-expectation inference cites prd-spec §操作主体模型 + §Data storage (both verify); ≤5s matches BIZ-workbench-005 ("会话/终端侧任务变更 → 看板免手动刷新可见 ≤5 秒" — external terminal write is a terminal-side change, so the rule's letter applies). Deductions: (a) 1c cites "prd-spec Solution 2 七态状态机" — prd-spec has no "Solution 2" heading (the 7-态 statemachine lives in What#2); fact correct, citation label imprecise. (b) 3c "沿用 M1/M2 错误呈现模式" is an uncited family reference — the underlying fact lives in M1/M2 material, reachable only through the sibling journey's Step 5c. (c) Step 1 "应用不干预该项目(未注册项目不在工作台注册表内,应用不可见)" carries no source comment (definitional, but asserted as fact). -4. |
| Inferred claims have rule support + source: inferred | 45/50 | Both web required_outcomes mappings carry the "surface-web required_outcomes 映射" label with reasoning (Step 2 comment; Step 3c comment); `source: inferred` annotations present on Steps 3, 1b (partial), 3b, 3c (partial) with stated bases that check out. Missing annotations: 3c "通道恢复后可继续,不残留半状态" (inference, no basis cited); 2d "应用侧操作不受 hook 存在影响" (inference, no annotation); Step 1's app-invisibility claim (above). -5. |
| No hallucinated unclassified claims | 37/40 | No claim contradicts PRD, tech-design, or business rules; the previously-floating perception claim is now grounded in T3. Remaining unclassified strength-claims: "未注册项目 CLI 形态完全不受影响" (3c — "完全" is stronger than the cited no-coupling inference supports), "应用恒不可见该项目" (Step 3 — "恒" unqualified), "不残留半状态" (3c — no fact at all). -3. |

### 5. Surface Fitness — 130/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Mandatory derived Outcomes present | 54/60 | Both considered, matching the sibling convention. session-expired is materialized as a real case: Step 3c with mapping comment "session-expired → 交替期间宿主不可用/凭据失效使已注册项目会话通道不可用:看板以错误/失败态呈现 + 恢复引导". validation-error is mapping-comment-only with delegation: "派发输入校验失败(依赖未满足混入)由同应用面的 task-dispatch-execution-loop Step 1b 承载,此处不重复设例" (sibling Step 1b verified). -6: the mapping's premise "本旅程看板交互为观察型(浏览/回流/回看),无新增表单输入面" undersells Step 2's own action — "看板多选任务并派发" IS an input surface, and the selection-validation failure belongs to exactly that surface; delegation is defensible for de-duplication, but the journey's own dispatch step then carries no validation-failure variant and the justification's first half is inaccurate on its own page. |
| Test strategy proportions match surface guidance | 42/50 | Balanced 50/50 is now credibly approached: journey-smoke macro flows (Steps 1–3) plus contract-sized isolatable units — 1c (single illegal-transition rejection), 2b (external write → reingest → board reflection), 2c (fault → degradation), 2d (hook compatibility), 3c (channel failure presentation) are single-behavior contract checks, and the terminal legs are output/exit-code/on-disk assertions. Residual: the app-side contract depth (dispatch mechanics, approval, presynthesis) is carried wholesale by the sibling; this document's app-side units are perception/presentation-level only. -8. |
| Realistic web environment/execution assumptions | 34/40 | Positives: disposable fixtures with "临时目录 + 隔离 userData、测试后清理" and the single-instance lock pre-check (matches the known e2e pitfall); explicit harness/browser channel split ("终端腿…由测试 harness 以子进程驱动 forge CLI 并断言输出/退出码/落盘数据,浏览器面承载看板侧断言"); wait strategy forbidding fixed sleep per surface-web; frozen golden baseline. Gaps: (a) Step 1b is a frozen-CC-plugin interactive session ("在 CC 插件内执行任务工作流(领取 → 执行 → 提交)"), not a bare CLI subprocess — the declared channel ("以子进程驱动 forge CLI") cannot drive it, and no provision (headless CC invocation, scripted plugin commands) is stated. -3. (b) The Setup assertion-channel inventory covers spawn/CLI, terminal, and board — but the new SoT assertions in 2b/2c/3b ("migration_event(reingest) 留档", "读路由恒经内核", "复现文件不构成第二事实源") are verifiable only via audit rows/read-routing behavior, for which no observation channel is declared. -3. |

### 6. Internal Consistency — 143/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Invariants hold in every Step | 57/60 | The iteration-1 contradiction is resolved: invariant 3 now states the T3 recycling path and 2b asserts it, so "唯一权威写者" and external writes coexist by design (bidirectional derivation closes). Invariants 1/4/5 hold in all steps (1/1b/1c assert golden-set equality; 2b/2c/2d assert non-blocking; 2/2b assert ≤5s with CI tolerance). Residual: invariant 2's exclusion list ("口径不含外部会话过渡形态 —— 2b/2c/2d 的外部操作不属本条管线") names 2b/2c/2d but not 3b — 3b executes an app-channel commit on the registered project ("再经应用提交已注册项目在途变更") inside a mixed alternation, so zero-spawn applies there, yet 3b's outcome never asserts it; the scope boundary under alternation is still inferred by the reader. -3. |
| Cross-Step references consistent | 46/50 | All delegation references verify: task-dispatch-execution-loop exists with `golden_path: true`; its Step 1b (validation mapping) and Step 5c (host/session channel family) exist with the cited content; stage-gates-cross-phase-context Step 7 exists covering exactly external cross-phase deviation display; 3b's exclusivity note accurately characterizes Step 3 ("每轮写入即提交、无在途残留" matches Step 3's action). Deduction: the Setup terminal-leg enumeration "终端腿(Steps 1/1b/1c/2d/3b)" omits Step 3 and Step 3c — Step 3's rounds include terminal operations on the unregistered project and its expected result asserts a CLI-side view ("未注册项目:forge CLI 任务视图 = 仓内 forge 文件"), and 3c's action includes "同时在终端继续未注册项目操作"; the enumeration contradicts the document's own step content. -4. |
| Risk level consistent with content | 40/40 | High is now correct and justified in-content: both forms execute state-mutating pipelines (init/add/claim/transition/submit; 派发→执行→提交), and the alternation-consistency failure mode is cross-form data destruction — matching the rubric's High criterion (state mutation + data loss risk) and the sibling's High for the same pipeline. The Risk comment states the rationale explicitly. |

### 7. Workflow Coverage — 133/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Golden Path existence (veto) | 54/60 | Veto NOT triggered. `golden_path: false` correctly delegated; the journey itself contains a contiguous 3-step sequence — Step 1 未注册 CLI 照旧 → Step 2 已注册应用通道零插件依赖 → Step 3 双形态交替互不破坏 — mapping one-to-one onto Story 8's AC1–AC3 (verified in prd-user-stories.md) in domain-level operations. -6: Step 2's verbs remain delegation-backed composites ("看板多选任务并派发 → subagent 执行…→ 提交后回看看板") whose concrete mechanics live in another document; Steps 1/3 are now concretely operational. |
| Multi-step coverage depth | 44/50 | Deep coverage: task lifecycle (init→add→claim→transition→submit) with illegal-transition rejection and recovery (1c), cross-project state-machine alternation with quantified rounds and reversed order (Step 3), in-flight-change coexistence (3b), external-interference tolerance with reingest convergence (2b), failure/degradation and recovery on both perception (2c) and channel (3c) planes. Remaining: no divergent-content case — external write based on stale state conflicting with newer kernel-authoritative state (the concurrent-edit family's hard case) is untested; 2b covers only the benign converge-via-reingest path. -6. |
| Workflow completeness against PRD/Design scope | 35/40 | Claimed scope fully covered: Story 8 3/3 ACs, SC7 both legs, 过渡纪律 both legs, git hook non-breakage (2d), frozen baseline, same-machine premise in Setup. Gaps: (a) the 技能迁移划分表's transition promise — "暂缓迁移(20)…外部会话(冻结 CC 插件)继续可用,已注册项目 dsh 会话缺席不阻断" — i.e., deferred-skill availability via external sessions on registered projects is a dual-form-transition behavior with no coverage or delegation here. -3. (b) The pre-migration registered window (registered but not yet migrated — the riskiest dual-writer state) is neither provisioned nor explicitly handed to explicit-sot-migration. -2. |

**Cross-dimension coherence check**: the 3c host/channel conflation manifests in D3 (satisfiability) and D4 (uncited "不残留半状态"); the Setup enumeration gap manifests in D6-c2 (cross-reference) with the 1b drivability and audit-channel gaps kept in D5-c3 (no double-counting of the same root); the SoT mechanism detail is scored once in D2 (purity) and its channel gap once in D5. No other overlaps.

---

## Phase 3 — Blindspot Hunt

**[blindspot] The board's per-change source labeling — a cross-milestone business-rule observable — is never asserted for reingested external writes.** Quote: Step 2b Expected Result: "外部会话不被硬阻断(过渡期兼容,操作可完成);外部写致 `tasks/index.json` 复现/变更被 watcher 检出并幂等重摄入,变更回流看板(≤5s 感知口径)". BIZ-task-ops-001 requires "每笔变更在看板逐笔标记来源[会话/终端],看板仅呈现、不写回", and its M3 修订 note states "变更来源标识语义延续(actor 序),「终端」来源收敛为未注册项目外部通道" — precisely the 2b scenario. The journey asserts that the change flows back to the board, but not what the user sees about WHERE the change came from: after reingest, is the externally-written change marked 来源=终端 on the board? A generated test from this page would pass while the source-labeling observable silently regressed (or while reingested changes mislabel as 会话/内核). This is not a required_outcomes category (D5), not a PRD user story of M3 (D7), and not an oracle/purity issue — it is a board observable mandated by an injected business rule that the outcome set skips. Add to 2b's expected result: the reingested changes render with the external/terminal source marking, per BIZ-task-ops-001/002. Reasoning audit flagged this independently of dimension scoring.

---

## Attack List (for reviser — all non-blocking at 1041, ordered by point weight)

1. **Semantic Purity**: test-strategy and internal-mechanism content inside Expected Results — "任务状态回流看板 ≤5s(等待策略 = 感知事件/轮询断言,不用固定 sleep;CI 计时用宽松阈值防抖动…)" and "外部写致 `tasks/index.json` 复现/变更被 watcher 检出并幂等重摄入…migration_event(reingest) 留档" — move wait/CI guidance fully into Setup and phrase 2b around board/audit observables (回流、偏离标记、审计可查) rather than pipeline internals.
2. **Surface Fitness**: 1b drivability — "在 CC 插件内执行任务工作流(领取 → 执行 → 提交)" cannot be driven by the declared "以子进程驱动 forge CLI" channel — declare the harness mechanism for the frozen-plugin session, or narrow 1b's action to what the harness can drive.
3. **Internal Consistency**: Setup terminal-leg enumeration contradicts step content — "终端腿(Steps 1/1b/1c/2d/3b)" omits Step 3 and Step 3c, both of which contain terminal operations and CLI-view assertions — fix the enumeration.
4. **Precondition Exclusivity / Fact Alignment**: 3c conflates host-down with session-channel-down and defines no recovery mechanism — "已注册项目的宿主/会话通道不可用(宿主异常/凭据失效)" + "通道恢复后可继续,不残留半状态" — split the precondition or scope it to the app-alive reading, and ground "可继续/不残留半状态" in a fact or mark inferred.
5. **Surface Fitness**: audit/read-routing assertion channel undeclared — "数据内核恒权威(读路由恒经内核),复现文件不构成第二事实源(migration_event(reingest) 留档)" has no observation channel in Setup's 断言口径 — add it (audit query / read-route probe).
6. **Surface Fitness**: validation-error delegation justified by an inaccurate premise — "本旅程看板交互为观察型(浏览/回流/回看),无新增表单输入面" vs Step 2's own "看板多选任务并派发" — reword the justification (dispatch input exists here; delegation is for de-duplication only) or add a local selection-validation variant.
7. **Completeness**: 2b/2d external-change setup mechanics — on a migrated project the external session starts from an archived index.json and must recreate it — specify which harness operation realizes "经外部会话执行的任务状态变更".
8. **Completeness**: 2d does not assert the T3 consequences of its own external submit (reingest/deviation on the same registered project) — add a clause or an explicit "SoT 侧效应由 2b 口径覆盖" note.
9. **Workflow Coverage**: divergent external write untested — 2b covers benign convergence only; add a stale-base conflict case (external write vs newer kernel state) or document the design's conflict semantics.
10. **Workflow Coverage**: deferred-skill external availability on registered projects ("外部会话(冻结 CC 插件)继续可用…不阻断", 技能迁移划分表) uncovered and undelegated; pre-migration registered window not handed off to explicit-sot-migration.
11. **Completeness (metadata)**: `sources:` omits `design/tech-design.md` though Steps 2b/2c ground their central mechanisms in it — add it to the fact base declaration.
12. **Internal Consistency**: invariant 2's exclusion list names 2b/2c/2d but not 3b's mixed alternation — extend the scope note so 3b's app-channel commit is unambiguously inside the zero-spawn口径.
13. **[blindspot]**: reingested external writes' board source labeling (BIZ-task-ops-001/002) never asserted — add the 来源标识 assertion to 2b.

---

## Eval-Journey Complete (iteration 2)

**Score**: 1041/1150 (target: 975) — **PASS** (all 7 dimensions above minimum; Surface Fitness recovered 54 → 130 with both web-mandatory outcomes considered; total margin +66 over target)
**Iterations Used**: 2/3
**Threshold table**: 7/7 dimensions above minimum.
**eval-skipped**: no (document parsed successfully).

