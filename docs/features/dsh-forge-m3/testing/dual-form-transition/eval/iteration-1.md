# Eval-Journey Report — Iteration 1

- **Document**: `docs/features/dsh-forge-m3/testing/dual-form-transition/journey.md`
- **Rubric**: journey (1150 pts, target 975, per-dimension thresholds)
- **Surface**: web (`rules/surface-web.md`)
- **Scorer persona**: Senior QA Engineer
- **Iteration**: 1 (no previous report)
- **Reality-check inputs**: `docs/business-rules/{coexistence,privacy,resilience,task-operations,workbench}.md`, `docs/features/dsh-forge-m3/prd/{prd-user-stories,prd-spec,prd-ui-functions}.md`, `docs/proposals/dsh-forge-m3/proposal.md`

## Verdict

**Total: 813 / 1150 — FAIL** (target 975 not met; Surface Fitness 54 < 90 threshold — both web-mandatory derived Outcomes are completely absent with no mapping/N-A comments. All other dimensions pass their thresholds.)

| Dimension | Score | Min | Pass |
|-----------|-------|-----|------|
| 1. Completeness | 141/200 | 120 | PASS |
| 2. Semantic Purity | 163/200 | 120 | PASS |
| 3. Precondition Exclusivity | 122/150 | 90 | PASS |
| 4. Fact Alignment | 111/150 | 90 | PASS |
| 5. Surface Fitness | 54/150 | 90 | **FAIL** |
| 6. Internal Consistency | 112/150 | 90 | PASS |
| 7. Workflow Coverage | 110/150 | 90 | PASS |
| **Total** | **813/1150** | **975** | **FAIL** |

---

## Phase 1 — Reasoning Audit

**Problem → Solution**: The journey claims Story 8 (过渡双形态不破坏), SC7, SC1, proposal Key Scenario「过渡双形态」, and prd-spec 外围命令归宿表·过渡纪律. Story 8's three ACs map one-to-one onto the three happy steps (AC1→Step 1 未注册 CLI 照旧, AC2→Step 2 已注册零插件依赖, AC3→Step 3 交替互不破坏); the proposal Key Scenario (proposal.md L75) and 过渡纪律 (prd-spec 外围命令归宿表) both verify verbatim. The solution addresses the stated problem, not a proxy. The `golden_path: false` delegation is valid — task-dispatch-execution-loop carries `golden_path: true`.

**Solution → Evidence**: Each AC has a step; the three edge cases extend beyond the ACs (channel parity 1b, external-session tolerance 2b, write-alternation consistency 3b). Evidence is not cherry-picked, but every edge case is a compatibility-success variant — there is not a single failure-path outcome in the document.

**Evidence → Success Criteria**: Outcomes match SC7/SC1 assertion口径 (zero-spawn 脚本断言, zero-CLI, ≤5s 回流), but two load-bearing oracles are undefined: "各自任务全集与各通道预期一致" (Step 3 — "各通道预期" is never defined) and "行为与 M3 之前完全一致" (Step 1 — no baseline capture method; which build, captured how).

**Self-contradiction check (cluster by affected area, bidirectional derivation)**:

- **Cluster: registered-project write ownership.**
  ```
  CONTRADICTION: Invariant "双形态数据互不破坏:每个项目恒单写者(未注册 = CLI,已注册 = 数据内核)" ↔ Step 2b "已注册项目经外部会话(终端/冻结 CC 插件)执行任务操作" + Expected "变更被感知回流看板"
  | Type: mutual-exclusion (write-ownership) / mechanism-undefined
  | Evidence: assume invariant holds (kernel sole writer) → an external forge CLI task write has no write path (post-migration tasks/index.json is eliminated per SC2; forge 文件侧仅剩文档资产 per Related Changes #2), so 2b's operation is impossible as described or requires an undefined ingestion bridge. Assume 2b works as described → either a second writer exists (invariant broken, BIZ-coexistence-002 second-SoT risk) or an unstated kernel-ingestion mechanism must exist. Neither direction closes on the page.
  | Resolution required: rewrite as compatible — define the external-write→kernel bridge (or restrict 2b to operations that do not write task state), and reconcile the "恒" qualifier.
  ```
- **Cluster: zero-spawn discipline on registered project.** Invariant 2 ("已注册项目应用通道日常管线零冻结 CC 插件 spawn、零 forge CLI 调用") ↔ Step 2b CC-plugin usage on the registered project: consistent only through the implicit scope qualifier "应用通道日常管线" — a generated test reading the invariant without the scoping could flag 2b (or worse, skip asserting 2b's spawn). Mild.
- **Cluster: 2b outcome vs its own precondition.** Precondition "执行任务操作(过渡期场景)" does not establish a cross-phase operation, yet the outcome asserts "跨阶段操作呈现偏离标识" — the deviation flag is defined (SC4/stage-gates Step 7) only for cross-phase operations. Precondition-outcome mismatch.
- Step 2 zero-CLI ↔ Setup "forge CLI 对未注册项目可用": consistent (assertion is about calls made, not availability).
- 1b "不受应用通道演进影响" ↔ 归宿分解决议 "过渡期由双形态承载(CLI 留机器)": consistent.

**Pre-score anchors (channeled into dimensions/blindspot below)**:
1. Both web-mandatory derived Outcomes (validation-error, session-expired) completely absent — no case, no mapping comment, no N/A justification (surface-web: "must be considered for every Web Journey"). Feeds D5 (0-criterion).
2. Write-ownership contradiction (above). Feeds D6 + blindspot.
3. External write on a migrated project could recreate `tasks/index.json` — SC2/BIZ-coexistence-002/spike §4 risk never asserted. Feeds blindspot.
4. Zero failure-path outcomes anywhere. Feeds D1/D7.
5. Risk Medium while both steps execute state-mutating task pipelines (sibling task-dispatch = High for the same 派发→执行→提交). Feeds D6.
6. Zero source annotations (`source:` / required_outcomes mapping / UNKNOWN) in the entire document. Feeds D4.
7. Undefined oracles ("各通道预期", M3-之前 baseline). Feeds D3/D5.

---

## Phase 2 — Rubric Scoring (verification stance)

### 1. Completeness — 141/200

| Criterion | Score | Notes |
|-----------|-------|-------|
| Metadata complete | 50/50 | `journey: "dual-form-transition"` kebab-case; `risk_level: "Medium"` valid value; `golden_path: false` correctly delegated (verified sibling has `golden_path: true`); `surface_types/surface_keys = ["web"]`; sources list all three PRD files; `generated` present. (Risk-content justification is scored in D6-c3.) |
| Steps complete (name/action/outcome) | 52/80 | All 6 steps (3 happy + 3 edge) have User Action + Expected Result, in a coherent order (per-form behavior → alternation). But every happy step is a mega-action a downstream agent cannot execute without inventing the script: Step 1 "执行完整 forge 工作流(任务管线:init → 任务操作 → 提交)" — "任务操作" is a category, not an action (which commands? which tasks?); Step 2 "执行日常任务管线(派发 → 执行 → 提交)" delegates the entire sibling golden path in one step; Step 3 "在两个项目间交替操作(终端 ↔ 应用,多轮)" names no concrete operation and leaves "多轮" unquantified. Each Expected Result bundles 3 assertions with no per-assertion anchoring. Contrast: sibling task-dispatch operationalizes the same 派发→执行→提交 in 7 concrete steps. -28. |
| Outcomes cover happy + required derived | 39/70 | Boundary variants that exist are meaningful and traceable (1b channel parity, 2b external interference, 3b write consistency — 3 edges for 3 steps, satisfying Medium density). But: (a) zero failure/error-path outcomes — CLI failure mid-pipeline, app-channel/host failure during alternation, perception-chain failure, external write conflicting with kernel state are all untested (QA persona: "Untested error paths — only success scenarios covered"; "Missing negative tests"); (b) the web-mandatory derived outcomes are completely absent — no validation-error or session-expired case, mapping comment, or N/A justification, despite Step 2's pipeline depending on host sessions (mapped deduction in D5, coverage gap here); (c) 2b bundles "跨阶段操作呈现偏离标识" into an outcome whose trigger (cross-phase op) is absent from its Precondition (scored in D3). -31. |

### 2. Semantic Purity — 163/200

| Criterion | Score | Notes |
|-----------|-------|-------|
| Outcomes natural language, no code/regex | 65/80 | No regex, no CSS/XPath, no `expect()`/`assertEqual` — clean on hard prohibitions. Verification-method leaks into outcomes: Step 2 "全程无冻结 CC 插件 spawn(脚本断言)" and "零 forge CLI 调用(SC1 口径)" are process-level counter assertions (how to verify, not what the user observes — PRD-faithful for SC7 but still method directives); Step 1 "数据落仓内 forge 文件(CLI 通道照旧)" is a storage-sink assertion; Step 3b "单写者纪律未被破坏(未注册 = CLI 写 forge 文件,已注册 = 数据内核单写者)" is an architecture invariant, not an observation; invariant 2 embeds "(进程/日志级断言)". -15. |
| Preconditions declarative, not procedural | 48/60 | All three edge Precondition fields are activity-phrased rather than state-phrased: 1b "未注册项目以冻结 CC 插件(/run-tasks 等指令)跑日常管线" (an activity; the state form would be "未注册项目的日常管线由冻结 CC 插件承载"); 2b "已注册项目经外部会话(终端/冻结 CC 插件)执行任务操作(过渡期场景)" (state would be "已注册项目存在经外部会话执行的任务变更"); 3b mixes state and activity ("两项目各自存在进行中变更后进行交替操作"). Setup bullet 3 "spawn/CLI 断言通道 = 进程/日志级(forge CLI 调用与冻结 CC 插件 spawn 可观测;脚本断言)" is test policy, not an environment state. -12. |
| No implementation coupling in Step descriptions | 50/60 | Actions are mostly user-level and channel vocabulary (dsh tool / 冻结 CC 插件 / forge CLI) is legitimate domain terminology in this PRD. Leaks: Step 3b's User Action "分别校验两项目的任务全集" puts the tester's verification act inside the user action; Step 1's outcome pins data location ("数据落仓内 forge 文件"); the Setup assertion-policy bullet (above); Step 2's SC-citation inside the outcome. -10. |

### 3. Precondition Exclusivity — 122/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Preconditions distinct across Outcomes | 52/60 | Each step carries exactly one Expected Result and the three edge preconditions are pairwise distinct (terminal-CLI vs CC-plugin vs external-session-on-registered vs in-flight-changes alternation). Deduction: Step 3b's precondition ("两项目各自存在进行中变更后进行交替操作") *subsumes* Step 3's implicit state (交替操作) — under 3b's precondition both Step 3's outcome and 3b's outcome are selectable simultaneously; the pair is narrowing, not exclusive. -8. |
| Preconditions sufficient to uniquely select | 38/50 | (a) Step 3's "各自任务全集与各通道预期一致" — "各通道预期" is an undefined reference: the unregistered project is invisible to the app (never registered), so its "channel expectation" can only be the CLI's own view (near-tautological), while the registered project's is the board; the document never says, so outcome applicability/pass is indeterminable. (b) Step 1's "行为与 M3 之前完全一致(命令输出/数据格式/插件指令)" requires an M3-之前 baseline that is never defined (which version, captured how, compared how). -12. |
| No missing Preconditions for error/boundary Outcomes | 32/40 | All three edge cases state a trigger — but Step 2b's third outcome clause "跨阶段操作呈现偏离标识(见 stage-gates-cross-phase-context Step 7)" has no triggering precondition: the stated Precondition ("执行任务操作") describes an in-scope transition-period task operation, and only *cross-phase* operations produce the deviation flag per SC4 and stage-gates Step 7. Under the stated precondition the clause is unjustified; under a cross-phase op it is — two different states, one outcome block. -8. |

### 4. Fact Alignment — 111/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Factual claims traceable or marked UNKNOWN | 46/60 | Journey-level traceability present and spot-verified: "行为与 M3 之前完全一致" (Story 8 AC1 verbatim); "全程无冻结 CC 插件 spawn(脚本断言)" (SC7 verbatim); "零 forge CLI 调用(SC1 口径)" (SC1, honest口径 citation); "任务状态回流看板 ≤5s" (SC1/G-series, BIZ-workbench-005); "外部会话不被硬阻断(过渡期兼容)" (操作主体模型 table, SC4); cross-journey ref "见 stage-gates-cross-phase-context Step 7" (verified to exist and match); "数据内核单写者" (prd-spec Data storage); "未注册 = CLI 写 forge 文件" (过渡纪律). Unverified without UNKNOWN marking: (a) Step 2b "变更被感知回流看板" — no M3 fact defines perception of external-session task writes on a *migrated* project: DF004 covers kernel→board only; the M2 indexer watched forge files, but post-migration the structured-state file is eliminated (SC2) and no DF describes external-write→kernel ingestion; this is M2 behavior generalized across a SoT change without marking; (b) 1b "不受应用通道演进影响" (inferred gloss); (c) "命令输出/数据格式/插件指令" is a stronger triple-equivalence than the PRD's "行为一致". -14. |
| Inferred claims have rule support + source: inferred | 30/50 | Zero annotations in the entire document — no `source: inferred`, no factual source comments, no required_outcomes mapping comments (the stage-gates sibling at least annotated Step 5b and still lost 15 here). Unannotated inferred fragments: 2b perception claim (above), Step 3 "各自任务全集与各通道预期一致" (oracle inferred), 1b "不受应用通道演进影响", 3b "无交叉污染" (mechanism inferred). The document is the least-annotated journey of the set. -20. |
| No hallucinated unclassified claims | 35/40 | No claim directly contradicts PRD or business rules; external ops on registered projects are sanctioned by the 操作主体模型's "已注册项目过渡期兼容" and the 归宿分解决议's "CLI 留机器". One unclassified capability assertion presented as fact: 2b's perception-of-external-task-writes (asserted expected behavior resting on an undefined mechanism — see Phase 1 contradiction). -5. |

### 5. Surface Fitness — 54/150  (**below 90 threshold**)

| Criterion | Score | Notes |
|-----------|-------|-------|
| Mandatory derived Outcomes present | 0/60 | **Both web-mandatory outcomes completely absent.** validation-error: no case, no mapping comment, no N/A justification — even though the dispatch-validation analog exists in the sibling (task-dispatch Step 1b mapped it explicitly). session-expired: absent despite Step 2's pipeline ("派发 → 执行 → 提交") depending on host sessions and dsh tool availability — the sibling mapped this family to host/credential failure (Step 5c); this journey, whose Step 2 runs the same pipeline, considers nothing. surface-web: "must be considered for every Web Journey". Rubric: "Score 0 if mandatory Outcomes are completely absent." 0/60. |
| Test strategy proportions match surface guidance | 30/50 | Web = balanced 50/50 Contract/Journey. The journey is almost pure journey-smoke: 3 macro happy steps delegating all app-side interaction wholesale to the sibling, plus 3 edge variants. Contract-sized isolatable units are thin (2b board-perception check and 3b task-set verification are the only candidates — and both have undefined oracles). Outcome density (6 steps × 1 bundled outcome) is far below the sibling set (stage-gates: 12 steps). Journey-heavy skew. -20. |
| Realistic web environment/execution assumptions | 24/40 | Positives: Setup honestly declares the process/log assertion channel ("spawn/CLI 断言通道 = 进程/日志级(forge CLI 调用与冻结 CC 插件 spawn 可观测;脚本断言)") and provisions two independent fixtures. Gaps: (a) surface mismatch — Steps 1/1b are pure terminal workflows with zero browser interaction, yet the journey declares only `surface_types: ["web"]`; nothing specifies how a web e2e suite drives/asserts the terminal legs (the skill's coverage rule: a cross-surface workflow must list all involved surface types); (b) "任务状态回流看板 ≤5s" carries no wait-strategy/CI tolerance — surface-web mandates "appropriate wait strategies, not fixed timeouts" and BIZ-workbench-005 mandates "CI 计时用宽松阈值防抖动"; (c) Step 1's M3-之前 baseline is undefined (see D3); (d) no isolated-userData/cleanup discipline for mutating fixtures — the sibling task-dispatch explicitly declares "临时目录 + 隔离 userData、测试后清理"; this journey mutates both fixtures (CLI pipeline runs, completed SoT migration) with no cleanup statement (e2e-single-instance pitfall memory applies). -16. |

### 6. Internal Consistency — 112/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Invariants hold in every Step | 42/60 | Invariants 1/4 hold in all steps (1/1b assert CLI zero-change; 2b asserts non-blocking). Two problems: (a) **Invariant 3 "每个项目恒单写者(已注册 = 数据内核)" is in unresolvable tension with Step 2b** — an external session performing task operations on the registered project means either a second writer (invariant broken) or an undefined bridge (Phase 1 contradiction; SC2 eliminated the file the external CLI would write); the invariant's "恒" cannot be verified under 2b as written. -15. (b) Invariant 2's scope qualifier "应用通道日常管线" is the only thing separating it from 2b's CC-plugin usage on the registered project; the scoping is implicit and easy for a generated test to mis-apply in either direction. -3. |
| Cross-Step references consistent | 42/50 | "见 stage-gates-cross-phase-context Step 7" verifies (exists, covers exactly external cross-phase deviation display). Step 3 builds on Steps 1/2; Setup provisions both fixtures. Deductions: 2b's deviation-flag clause references behavior whose precondition is not in this step (D3); Step 3's "各通道预期" is a dangling reference to an undefined expectation; "两项目" in 3b is otherwise unambiguous. -8. |
| Risk level consistent with content | 28/40 | Medium is under-classified. The stated High criterion is "state mutation, data loss risk, or irreversible operations" — this journey *executes complete state-mutating task pipelines in both forms*: Step 1 "init → 任务操作 → 提交" (CLI writes forge task state), Step 2 "派发 → 执行 → 提交" (task claim/submit transitions). The sibling covering the identical 派发→执行→提交 pipeline is classified High. The journey's alternation+data-consistency focus is exactly the scenario where mutation going wrong = cross-form data destruction — the journey's own Step 3/3b exist because destruction is the risk. -12. |

### 7. Workflow Coverage — 110/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Golden Path existence (veto) | 48/60 | Veto NOT triggered. `golden_path: false` is correctly delegated (sibling verified `true`), and the journey itself contains a contiguous 3-step sequence — Step 1 未注册 CLI 照旧 → Step 2 已注册应用通道零插件依赖 → Step 3 双形态交替互不破坏 — that maps one-to-one onto Story 8's AC1–AC3 and SC7's two legs, in domain-level operations (no API-level steps). Deductions: the sequence's domain verbs are macro-composites ("执行完整 forge 工作流", "执行日常任务管线") and Step 3 names no concrete operation ("交替操作(终端 ↔ 应用,多轮)") — the semantic concreteness of the sequence is materially weaker than the rubric's "domain-level user operations" bar (not API-level, so the -15/step rule is not applied). -12. |
| Multi-step coverage depth | 30/50 | Conceptual breadth is good: two parallel project lifecycles, cross-channel alternation, external-interference tolerance, aggregate consistency verification. Depth is shallow: every outcome is a compatibility-success assertion; zero failure/recovery paths (CLI dies mid-pipeline; app-channel/host failure mid-alternation; perception failure; external write vs kernel-state conflict); alternation rounds unquantified; no state-machine or per-task granularity — "任务全集" aggregates only. -20. |
| Workflow completeness against PRD/Design scope | 32/40 | Against claimed scope: Story 8's 3/3 ACs covered; SC7 both legs covered; 过渡纪律 both legs covered; SC1 cited as口径 only (clean-environment leg not claimed — acceptable, it is not this journey's promise). Gaps within the transition-discipline scope: (a) 归宿分解决议's "过渡期由双形态承载(CLI 留机器,既有 git hook 不破坏…)" — existing git hook (verify-task-done) non-breakage on registered projects is part of the transition discipline and has no coverage or explicit delegation here; (b) the pre-migration registered window (registered but index.json still present — the riskiest dual-writer state, spike §4) is not provisioned; arguably explicit-sot-migration's territory (its migration-conflict coverage), but this journey never declares that handoff. -8. |

**Cross-dimension coherence check**: The undefined oracle ("各通道预期") manifests in D3 (selection) and D7 (coverage); the write-ownership contradiction manifests in D6 and drives the D4 unverified-claim deduction; the absent web-mandatory outcomes drive both D1-c3 and D5-c1 (scored at full weight in D5 per rubric instruction, coverage gap noted in D1). No double-counting beyond these rubric-mandated overlaps.

---

## Phase 3 — Blindspot Hunt

**[blindspot] The single most dangerous transition failure mode — external writes recreating the eliminated `tasks/index.json` — is never asserted against.** Quote: Step 2b Expected Result: "外部会话不被硬阻断(过渡期兼容);变更被感知回流看板;跨阶段操作呈现偏离标识(见 stage-gates-cross-phase-context Step 7)". After SoT migration, SC2 requires "迁移完成后项目文档树内 `tasks/index.json` 不存在" and spike §4 established the old-writer behavior "旧写者重写静默丢未知字段"; BIZ-coexistence-002 forbids a second source of truth. An external forge CLI task write on the migrated registered project is precisely the operation that could recreate that file (or silently no-op, or corrupt state) — yet 2b's expected results assert nothing about index.json remaining absent or the single-SoT discipline holding after external operations. A generated test from this document would verify tolerance and perception while missing the catastrophic outcome entirely. Add to 2b (or a new edge): after external session operations on the registered project, `tasks/index.json` is not recreated and forge 文件侧仍仅文档资产. Reasoning audit flagged this independently of dimension scoring.

**[blindspot] The central equivalence oracle is baseline-dependent and the PRD itself flags baseline decay as a live risk.** Quote: Step 1 Expected Result: "行为与 M3 之前完全一致(命令输出/数据格式/插件指令)". The proposal's Urgency section states "越晚动手对拍基准(冻结 CLI 行为)越难保持新鲜" — the baseline that this journey's headline assertion compares against is (a) never defined (which forge CLI build = "M3 之前"?), (b) never captured (recorded outputs? fixture golden files?), and (c) known to drift. Without a frozen capture mechanism declared in Setup, "完全一致" is untestable and will silently degrade to "looks the same". The journey must declare the baseline artifact (e.g., recorded command-output golden set from the pre-M3 CLI version) as part of Setup. Reasoning audit flagged this independently of dimension scoring.

---

## Attack List (for reviser)

1. **Surface Fitness (blocking)**: both web-mandatory derived Outcomes absent — no validation-error or session-expired case, mapping comment, or N/A justification anywhere, while "在应用内对已注册项目执行日常任务管线(派发 → 执行 → 提交)" depends on host sessions — add edge cases or explicit mapping comments (sibling pattern: task-dispatch Steps 1b/5c) or a justified N/A annotation.
2. **Internal Consistency**: invariant vs Step 2b write-ownership contradiction — "每个项目恒单写者(未注册 = CLI,已注册 = 数据内核)" vs "已注册项目经外部会话(终端/冻结 CC 插件)执行任务操作" — define the external-write→kernel bridge, restrict 2b's operation scope, or soften the "恒" qualifier so both can hold.
3. **Fact Alignment**: ungrounded perception claim — "变更被感知回流看板" (2b) has no M3 fact for external-write ingestion on a migrated project (DF004 is kernel→board only) — ground it in a PRD fact or mark UNKNOWN.
4. **Fact Alignment**: zero annotations in the whole document — inferred fragments ("各自任务全集与各通道预期一致", "不受应用通道演进影响", "变更被感知回流看板") carry no `source: inferred`/source comments — annotate per the sibling convention.
5. **Precondition Exclusivity**: 2b outcome clause untriggered — "跨阶段操作呈现偏离标识" under Precondition "执行任务操作(过渡期场景)" — add cross-phase to the precondition or split into a separate in-phase/cross-phase pair.
6. **Precondition Exclusivity**: undefined oracle — "各自任务全集与各通道预期一致" — define each channel's expectation (registered = board/kernel view; unregistered = CLI view) so pass/fail is decidable.
7. **Precondition Exclusivity**: 3/3b not exclusive — 3b "两项目各自存在进行中变更后进行交替操作" subsumes Step 3's state — make 3b's differentiator an explicit exclusive condition.
8. **Completeness**: mega-steps not executable by a downstream agent — "执行完整 forge 工作流(任务管线:init → 任务操作 → 提交)" and "在两个项目间交替操作(终端 ↔ 应用,多轮)" — decompose into concrete operations (specific command/task sequence; defined alternation rounds).
9. **Completeness**: zero failure-path outcomes — every edge is a compatibility-success variant — add error paths (CLI failure mid-pipeline, host/app-channel failure during alternation, perception failure, external write conflicting with kernel state).
10. **Internal Consistency**: risk under-classified — Medium while both forms execute state-mutating task pipelines (sibling task-dispatch = High for the same 派发→执行→提交) — reclassify High (edge density 3=3 already satisfies the High rule) or justify Medium explicitly.
11. **Surface Fitness**: timing without tolerance — "任务状态回流看板 ≤5s" — add wait-strategy/CI-tolerance guidance (BIZ-workbench-005: "CI 计时用宽松阈值防抖动").
12. **Surface Fitness**: web-only declaration over terminal workflows — Steps 1/1b have zero browser interaction yet surface is `["web"]` — declare how the web e2e suite drives/asserts terminal legs (subprocess orchestration) in Setup, or split the journey's surface coverage honestly.
13. **Surface Fitness**: fixture hygiene unstated — "同一机器备两个独立 fixture 项目" mutating both fixtures with no isolated-userData/cleanup statement — add the sibling's discipline ("临时目录 + 隔离 userData、测试后清理"; single-instance lock pitfall applies).
14. **Workflow Coverage**: transition hook non-breakage uncovered — 归宿分解决议's "过渡期…既有 git hook 不破坏" — add a hook-compatibility edge or explicitly delegate.
15. **[blindspot]**: index.json-recreation risk unasserted — after external ops on the migrated project, assert `tasks/index.json` is not recreated and single-SoT discipline holds (SC2, spike §4, BIZ-coexistence-002).
16. **[blindspot]**: M3-之前 baseline undefined and drift-prone — "行为与 M3 之前完全一致(命令输出/数据格式/插件指令)" — declare the frozen baseline capture (recorded golden outputs from the pre-M3 CLI build) in Setup.

---

## Eval-Journey Complete (iteration 1)

**Score**: 813/1150 (target: 975) — **FAIL** (Surface Fitness 54/150 below the 90 threshold: both web-mandatory derived Outcomes completely absent; total 162 points short)
**Iterations Used**: 1/3
**Threshold table**: 6/7 dimensions above minimum; Surface Fitness FAIL (54 < 90).
**eval-skipped**: no (document parsed successfully).
