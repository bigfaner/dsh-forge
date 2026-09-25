# Contract Eval Report — iteration 1

- **Journey**: dual-form-transition
- **Scope**: all 3 step-*.md contracts in `docs/features/dsh-forge-m3/testing/dual-form-transition/contracts/`
- **Surface**: web (anchor handbook: `docs/features/dsh-forge-m3/design/page-map.md`)
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Date**: 2026-09-25
- **Total**: **960 / 1100** — PASS (target ≥935; all dimensions above min threshold)

| Dimension | Score | Min | Verdict |
|---|---|---|---|
| 1. Completeness | 142/150 | 90 | PASS |
| 2. Semantic Purity | 176/200 | 120 | PASS |
| 3. Precondition Exclusivity | 132/150 | 90 | PASS |
| 4. Fact Alignment | 120/150 | 90 | PASS |
| 5. Surface Fitness | 78/100 | 60 | PASS |
| 6. Internal Consistency | 148/150 | 90 | PASS |
| 7. Anchor Integrity | 85/100 | 60 | PASS |
| 8. Fixture Specification | 79/100 | 60 | PASS |
| **Total** | **960/1100** | **935** | **PASS** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

Trace: journey (3 happy steps + 7 edge cases) → 3 contracts, 13 outcomes. Mapping is complete and faithful: step-1 covers Step 1 + edges 1b/1c + inferred `app-invisibility`; step-2 covers Step 2 + edges 2b/2c/2d + inferred `authority-guard`; step-3 covers Step 3 + edges 3b/3c + inferred `cross-project-isolation`. The contract set addresses the journey's actual problem (dual-form non-destruction), not an easier substitute; the strongest journey content (zero-spawn/zero-CLI process assertions, reingest discipline, alternation isolation) is all carried.

Independent anchors found before rubric scoring:

1. **step-3 `channel-unavailable-asymmetric` asserts a mid-flight failed-transition with no supporting mechanism.** State claims "受影响派发行转 failed 态并记录原因;恢复后经重派发继续". Per FT-073, dispatch failed-transitions arrive via host callbacks (notifyLaunchFailed / notifyDispatchEnded) — the very channel that is declared unavailable. FT-091 grounds the failure routing only for the launch leg. The journey 3c expected result says only "通道恢复后可继续,不残留半状态"; the contract *added* the failed-state claim. Scored under Fact Alignment.
2. **step-2 `external-write-reingest` asserts "变更回流看板(≤5s 感知口径)" for the reingest path.** FT-066 (reingest mechanism, deviation events) never states a board-facing event push for reingest; FT-093's direct `task_updated` push covers the task-verb path only. The ≤5s figure rides on the journey's tech-design Interface 4.7 citation, which the contract dropped. Partially unverified as written.
3. **step-3 `cross-project-isolation` overstates its citation.** Reasoning says "FT-097(schema-v2 task 表以 project_id 为主键成分)" — FT-097 lists the 7 new v2 tables and indexes but never states the task table's primary-key composition. The schema almost certainly scopes tasks by project, but the cited fact does not contain the cited content.
4. **step-1's anchor note contradicts its own browser-face outcome.** The note claims "无浏览器页面锚点可匹配 —— web 锚点留空不猜值", yet the same file's `app-invisibility` Input is "用户在应用工作台查看项目注册表/项目切换器" and the handbook places ProjectSwitcher on every workbench page. A matchable anchor exists; the rationale for leaving it empty is factually wrong. Scored under Anchor Integrity.
5. **Environment isolation preconditions from the journey Setup are dropped.** Journey Setup mandates "临时目录 + 隔离 userData、测试后清理;跑测前确认无活跃 dsh-forge 实例持单实例锁,避免 ERR_SINGLE_INSTANCE 污染". No contract carries the isolated-userData / no-active-instance precondition. This is a known real-world test-pollution pitfall for this repo. Raised as a blindspot.
6. SC/In Scope deep-dive (outcome-level bidirectional derivation): **no mutual-exclusion contradictions found**. step-3 `success` ↔ `in-flight-coexistence` explicitly declare mutual exclusivity ("与 success 互斥:success = 每轮写入即提交、无在途残留"); step-2 `authority-guard` is exclusive by the `data_authority` value; the reingest pair separates on chain health. All pairs are bidirectionally satisfiable.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 142/150

- **Four mandatory dimensions per Outcome (50/50)**: all 13 outcomes across 3 files carry non-empty Preconditions, Input, Output, State; every outcome also carries an explicit Side-effect ("none" where applicable) and per-outcome Invariants. Verified outcome-by-outcome; zero gaps.
- **Journey Invariants section (50/50)**: all 3 contracts contain `## Journey Invariants` with the full 5-entry journey invariant set verbatim, including the carve-out note "口径不含外部会话过渡形态 —— 2b/2c/2d 的外部操作不属本条管线".
- **Happy path + required derived scenarios (42/50)**: all 10 journey scenarios (3 happy + 7 edges) are ported; session-expired is present as step-3 `channel-unavailable-asymmetric` with an explicit mapping comment. Deduction: the **validation-error mapping/delegation note was dropped between journey and contract**. The journey Step 2 documents "surface-web required_outcomes 映射:validation-error → 本旅程看板交互为观察型…由同应用面的 task-dispatch-execution-loop Step 1b 承载,此处不重复设例" — a legitimate, reasoned delegation — but no contract in this set reproduces it. A contract-only reader (the downstream gen-test-scripts consumer) sees a Web journey with a dispatch interaction and zero validation-error consideration. `authority-guard` partially fills the rejection-shaped gap but carries no mapping comment. -8.

### 2. Semantic Purity — 176/200

- **Natural language, not code/regex (70/80)**: no regex, CSS/XPath selectors, or framework assertion calls anywhere. Deductions for internal nouns leaking into dimension values: step-2 `authority-guard` Preconditions "项目已注册但未迁移(data_authority 为 files)" (schema column name); step-2 `external-write-reingest` State "migration_event 留 reingest 审计" (audit table name); step-3 `cross-project-isolation` Input "内核表查询 + 仓内文件读取" (database/file-access mechanics); step-1 success Output "(harness 级对拍)" (test-harness jargon inside the user-facing Output). -10.
- **Preconditions declarative (58/60)**: overwhelmingly declarative state descriptions ("已注册项目仓内存在 M3 之前安装的 verify-task-done git hook"; "存在一笔触发非法状态迁移的提交"). Minor: step-1 success opens with setup-register phrasing "同一机器备一个未注册 forge 项目(临时目录 fixture…)" — fixture-provisioning instruction flavor rather than pure state. -2.
- **No implementation coupling (48/60)**: recurring kernel mechanics inside dimension values: step-2 `external-write-reingest` State "watcher 检出 index.json 复现/变更 → 幂等重摄入(单事务先删后插 + 对拍校验)" (transaction internals); step-2 success Side-effect "task_updated 事件直发" and step-3 Side-effect "dispatch_updated 事件推送失败态" (internal event names); step-2 Side-effect "projects.deviated 置位 + deviation_detected 事件" (column write). These describe storage-layer mechanics, not system-observable behavior. -12.

### 3. Precondition Exclusivity — 132/150

- **Distinct preconditions across outcomes (50/60)**: no two outcomes share identical Preconditions, and the critical pairs are cleanly split: step-2 `success`(sqlite) vs `authority-guard`(files) split on the authority value; `external-write-reingest` vs `reingest-perception-failure` split on chain health; step-3 `success` vs `in-flight-coexistence` declare mutual exclusivity explicitly. Soft overlaps remain: step-1 `success` Preconditions ("…终端 + 冻结 CC 插件形态;pre-M3 冻结 forge CLI 构建可用…") and `cc-plugin-frozen-works` Preconditions ("未注册项目的日常管线由冻结 CC 插件承载") both hold on the same fixture state — the channel that carries the pipeline differentiates them only via Input; step-1 `app-invisibility` ("未注册 forge 项目存在于本机;应用已启动") co-holds with all three sibling outcomes' states; step-3 `cross-project-isolation` ("交替操作…已全部完成") co-holds with the post-`success` end state. -10.
- **Sufficient to uniquely select (42/50)**: given Preconditions + system state alone, step-1 requires Input to select among 3 of its 4 outcomes, and step-3's terminal audit is reachable from `success`'s end state. step-2 selects uniquely throughout. -8.
- **Error/boundary triggers explicit (40/40)**: every non-happy outcome names its trigger: "终端管线进行中,存在一笔触发非法状态迁移的提交(如对 completed 任务 claim,状态机拒绝)" (step-1); "外部写发生后,感知/重摄入链路故障(watcher 或重摄入失败)" (step-2); "项目已注册但未迁移(data_authority 为 files)" (step-2); "交替操作进行中,已注册项目的宿主/会话通道不可用(宿主异常/凭据失效,经测试通道注入)" (step-3).

### 4. Fact Alignment — 120/150

- **Factual claims traceable / UNKNOWN (48/60)**: the load-bearing claims trace cleanly — zero spawn / zero CLI ↔ FT-096 ("plugin host half contains zero CLI spawn sites; …forge CLI invocation count over an app-channel pipeline is zero"); ≤5s backflow ↔ FT-093 + BIZ-workbench-005; reingest discipline ("单事务先删后插 + 对拍校验", "migration_event 留 reingest 审计") ↔ FT-065/FT-066; "projects.deviated 置位 + deviation_detected 事件" ↔ FT-066; `authority-guard`'s ERR_TASK_NOT_AUTHORITATIVE semantics ↔ FT-059 (cited, verbatim-faithful); dispatch failed/redispatch ↔ FT-073/FT-075. Deductions:
  - step-3 `channel-unavailable-asymmetric` State "受影响派发行转 failed 态并记录原因;恢复后经重派发继续" — grounded only for the launch leg (FT-091); for running rows the failed-transition rides the transport that died; FT-073 gives no watchdog. The journey never claimed row-level failure. -5.
  - step-2 `external-write-reingest` Output "变更回流看板(≤5s 感知口径)" — no fact states a board-facing event push on the reingest path; FT-066 stops at deviation events and audit rows. Unmarked. -4.
  - step-3 `cross-project-isolation` reasoning "FT-097(schema-v2 task 表以 project_id 为主键成分)" — FT-097's value text does not state the task table's PK composition; the citation asserts content the fact does not contain. -3.
- **Inferred claims have rule support + source: inferred (34/50)**: three exemplary annotations — step-1 `app-invisibility`, step-2 `authority-guard` (cites FT-059/FT-062 with file:line anchors), step-3 `cross-project-isolation` — each with `<!-- source: inferred -->` + reasoning. Deductions:
  - step-3 `channel-unavailable-asymmetric` is the required_outcomes (session-expired)-derived outcome and carries the mapping comment "surface-web required_outcomes 映射:session-expired → 交替期间宿主不可用/凭据失效…" but **lacks `source: inferred`** and its reasoning basis ("task-dispatch-execution-loop Step 5c 同族口径;未注册侧不受影响 = inferred" lives only in the journey). -8.
  - Two journey-marked inferred claims were ported without their markers: step-1 `cc-plugin-frozen-works` Output "不受应用通道演进影响" (journey 1b: "「不受应用通道演进影响」= inferred(应用仅作用于已注册项目路径,PRD Security 边界)") and step-3 success Output "看板呈现 = 数据内核权威表(ID/状态/依赖/标题对拍零差异)" (journey Step 3 carries "source: inferred(各通道预期定义依据 prd-spec §操作主体模型 + §Data storage…)"). -4 each.
- **No hallucinated unclassified claims (38/40)**: no fabricated codes or mechanisms found; every ERR_*/event name checks out against the fact table. Residual: step-2 `git-hook-intact` State "hook 文件字节与 mtime 原样" — byte-level preservation is a fair literalization of the journey's "不改动该 hook", but the **mtime** guarantee is a contract-added specificity with no journey or fact basis. -2.

### 5. Surface Fitness — 78/100

- **Mandatory Web derived outcomes present (26/40)**: session-expired → step-3 `channel-unavailable-asymmetric`, with mapping comment and the surface-rule essentials (degraded state shown, recovery guidance, no half state). validation-error → **absent from the contract set**: the journey's reasoned delegation ("无新增表单输入面;派发输入校验失败…由 task-dispatch-execution-loop Step 1b 承载") was not carried into any contract, so the mandated "must be considered for every Web Journey" check leaves no trace at the contract layer where gen-test-scripts consumes it. `authority-guard` is rejection-shaped but is an authority guard, not input validation, and carries no mapping. Partial credit for one of two mandates plus a coherent-but-undocumented delegation. -14.
- **Surface-appropriate language (27/35)**: the web-leg outcomes use proper board language ("看板存在可派发任务", "变更回流看板", "通道异常以错误/失败态呈现 + 恢复引导"). Deductions: step-1 is nearly devoid of web-observable content — its success Output is "各段命令输出与任务数据格式与 M3-之前基线 golden 集逐字一致(harness 级对拍)", pure subprocess-assertion register (defensible for the dual-form journey, but it leaves the web surface asserted only via `app-invisibility`); State dimensions across step-2/3 speak kernel-row language ("任务状态经内核权威行迁移(dsh tool 写通道)"; "受影响派发行转 failed 态") rather than board-observable state. No wrong-surface idioms (no DOM selectors, no CLI exit codes as values). -8.
- **TUI timeout criterion (25/25)**: N/A for web surface — full marks per rubric.

### 6. Internal Consistency — 148/150

- **Journey invariants hold in every contract (60/60)**: baseline parity asserted in step-1; zero-spawn/zero-CLI asserted in step-2 success with the external-session carve-out correctly replicated; single-writer/single-SoT upheld everywhere (reingest recycles external writes, never a second write path); external sessions never hard-blocked ("外部会话不被硬阻断(过渡期兼容,操作可完成)"); ≤5s backflow asserted on both the verb path and reingest path. `authority-guard` correctly *refines* the write-authority invariant for the files-authority transition state rather than violating it ("每个项目唯一权威写者;files 项目走 CLI 形态").
- **Cross-Contract state references consistent (48/50)**: entity naming is uniform across files (UnregisteredForgeProject in steps 1/3; Project(sqlite) in steps 2/3; Task's parent is always the owning project — this journey avoids the parentage-flip defect seen elsewhere); the invariants block is verbatim-identical across all 3 files; step-3's in-flight outcome references and negates success's residue state explicitly; step-2's dispatch pipeline produces the running dispatches step-3's channel-failure outcome consumes. Deduction: step-1 `illegal-submit-rejected` Output asserts "错误呈现与 M3-之前基线一致(基线 golden 集对拍)" but the GoldenBaselineSet entity is declared only in the `success` outcome's fixture — the cross-outcome dependency is implicit, and the outcome is not self-contained for a fixture author. -2.
- **Preconditions achievable from preceding steps (40/40)**: every chain is reachable — the completed task needed by `illegal-submit-rejected` is produced by the success pipeline's transition→submit; the external write and perception-fault states are injectable as declared (`state_requirements` with "测试通道注入"); step-3's in-flight and terminal-audit preconditions follow from the declared alternation inputs; `channel-unavailable`'s running dispatches are producible from step-2's pipeline.

### 7. Anchor Integrity — 85/100

Handbook `design/page-map.md` exists; Web anchor field = `page`.

- **Anchor field completeness (30/40)**: step-2 and step-3 carry full `anchors.web` blocks (page + route + requires_auth + layout). **step-1 carries `web: {}` — empty** — justified by an anchor note that is itself incorrect: "本步为终端 CLI 形态…无浏览器页面锚点可匹配 —— web 锚点留空不猜值". The same file's `app-invisibility` outcome is browser-faced: Input "用户在应用工作台查看项目注册表/项目切换器", Output "该项目不出现在工作台注册表内(应用不可见)". The handbook defines ProjectSwitcher on all workbench pages ("WorkbenchShell / ProjectSwitcher | 全部 workbench 页"), so a matchable anchor exists (e.g., `workbench/overview`). Leaving the field empty was the right instinct for the terminal outcomes but wrong for this one. -10 (missing `page` field).
- **Anchor values match handbook (25/30)**: step-2 "工作台 · 任务看板" / `workbench/tasks` / "WorkbenchShell → TaskBoardPage" — exact. step-3 route and layout exact, but page value "工作台 · 任务看板(已注册项目侧)" decorates the handbook title "工作台 · 任务看板(UF1 编排扩展)" with a different parenthetical. Route-keyed resolution is unambiguous, so minor. -5.
- **Handbook internal consistency (30/30)**: view keys unique and non-conflicting (`workbench/overview|proposals|features|tasks`, `workbench/dialog/*`, `workbench/panel/*`, `session`); tab order 概览/提案/Feature/任务 matches FT-092; panel mutual-exclusion and Esc layering consistent with the Route Guard section; no page defined with two routes.

**Missing Anchor Fields**:

| Contract | Missing field | Evidence | Handbook entry that exists |
|---|---|---|---|
| step-1-cli-unregistered-pipeline.md | `page` (+ entire web anchor block) | `anchors: web: {}` + note "无浏览器页面锚点可匹配" vs same-file Input "用户在应用工作台查看项目注册表/项目切换器" | ProjectSwitcher on 全部 workbench 页 (page-map Shared Components) |

**Handbook Conflicts** table: none found.

### 8. Fixture Specification — 79/100

Scored per-contract (entity completeness / relationships+constraints / min_count), then averaged, per established practice for the veto's per-Contract granularity.

| Contract | Entity | Rel/Cstr | MinCount | Total | Notes |
|---|---|---|---|---|---|
| step-1 | 28 | 35 | 25 | **88** | `cc-plugin-frozen-works` Input runs "任务工作流(领取 → 执行 → 提交)" and State references 任务数据, yet declares no Task entity — claim needs a pre-existing task to 领取 (-8); `illegal-submit-rejected` Output references the golden baseline set without declaring GoldenBaselineSet in its own fixture (-4). FrozenCCPlugin→Project and Task→Project relationships correctly declared where present. |
| step-2 | 40 | 32 | 17 | **89** | Most complete file: authority value, reproduced-file path, hook name+era constraints all pinned; `state_requirements` (fault injection) well used. Deductions: Task `task_type: "可派发类型键"` is unpinned vocabulary — FT-072 defines the dispatchable/restricted type sets; a fixture author cannot construct the value (-3); **success declares Task min_count 1 while its Input is "看板多选任务并派发" — multi-select needs ≥2 (-8)**. |
| step-3 | 13 | 30 | 17 | **60** | Weakest file. `channel-unavailable-asymmetric` State asserts "受影响派发行转 failed 态" but declares **no Dispatch entity** — the central state-changing entity of the outcome cannot be seeded (-15); `in-flight-coexistence` models "未提交的进行中变更" only as a boolean `inFlightChange: true` on the projects — the in-progress Task entities that constitute the in-flight writes are undeclared (-12); `cross-project-isolation` audits "两项目任务全集" with **zero Task entities declared** — seeded alone, the audit passes vacuously (-8 min_count). |

Average: (88+89+60)/3 = **79**. The veto was not fully triggered on any contract (each file declares at least the entities its happy path operates on), but step-3's boundary outcomes systematically under-declare their operating entities.

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **Environment isolation preconditions silently dropped** — step-2 success Preconditions: "已注册并完成 SoT 迁移的应用通道项目就绪(应用 + dsh tool + 宿主)". The journey Setup mandates "临时目录 + 隔离 userData、测试后清理;跑测前确认无活跃 dsh-forge 实例持单实例锁,避免 ERR_SINGLE_INSTANCE 污染" — none of this survives into any contract's Preconditions or fixture_spec. A downstream agent seeding from the contracts alone can run the web suite against the developer's live instance and pollute the suite with ERR_SINGLE_INSTANCE (a real, previously-hit failure mode in this repo). Must improve: carry isolated-userData and no-active-instance as environment Preconditions in step-2/step-3.
2. `[blindspot]` **The zero-spawn / zero-CLI negative assertions have no named observation channel** — step-2 success Output: "全程无冻结 CC 插件 spawn(进程/日志级断言,SC7 口径);零 forge CLI 调用(SC1 口径)". The assertion *register* is named (process/log level) but the observable artifact is not: which log face, which process inventory, accessed how from a web-suite harness. The journey's whole point (SC7/SC1) is delegated to an unspecified channel — a test author cannot construct the negative check. Must improve: name the artifact and access path (e.g., 宿主调用日志 + 子进程清单快照) in State or a fixture note. Reasoning audit flagged this independently (anchor family: unspecified assertion channels).
3. `[blindspot]` **"可派发类型键" is author's choice, not specification** — step-2 success fixture: `field: "task_type", value: "可派发类型键"`. FT-072 defines exactly which types are dispatchable and which are restricted/replaced; the fixture never pins one. Two downstream authors will seed different task_types and both "comply". Must improve: pin a concrete dispatchable task_type (and state the basis) the way FT-072's vocabulary allows. (Partially scored under Fixture Specification; the vocabulary-pinning gap spans the whole set.)
4. `[blindspot]` **Journey→contract annotation loss is systematic, not incidental** — three distinct classes of source annotation were dropped in porting: the validation-error delegation note (journey Step 2 comment absent from step-2), two `source: inferred` markers (journey 1b and Step 3), and the Setup environment preconditions. The contracts are journey-faithful in *content* but lossy in *provenance*, which is exactly the layer Fact Alignment and downstream generation depend on. Must improve: treat journey HTML comments as mandatory porting content in gen-contracts.

---

## Attack List (for reviser)

1. [Anchor Integrity] step-1 empty web anchor contradicted by its own browser-face outcome — anchor note "本步为终端 CLI 形态…无浏览器页面锚点可匹配 —— web 锚点留空不猜值" vs same-file Input "用户在应用工作台查看项目注册表/项目切换器" — add a `page: 工作台 · 项目概览` (route `workbench/overview`) anchor or move `app-invisibility` where an anchor exists; fix the note.
2. [Fixture Specification] step-3 `channel-unavailable-asymmetric` operates on an undeclared entity — State "受影响派发行转 failed 态并记录原因" — declare Dispatch (running state, belongs_to Project) in the fixture.
3. [Fixture Specification] step-3 `in-flight-coexistence` models in-flight task writes as a project boolean — "两项目各自存在未提交的进行中变更(在途写入)" + `inFlightChange: true` — declare in-progress Task entities on both sides instead of / in addition to the flag.
4. [Fixture Specification] step-2 success min_count contradicts its own Input — "看板多选任务并派发" with Task min_count 1 — raise to ≥2 (or reword the interaction to single-select with basis).
5. [Fixture Specification] step-3 `cross-project-isolation` vacuous as seeded — Input "用户经 harness 分别断言两项目任务全集与数据载体归属(内核表查询 + 仓内文件读取)" with zero Task entities — declare both task sets (min_count ≥1 per side) or explicitly reference prior outcomes' fixtures.
6. [Fact Alignment] mid-flight failed-transition unsupported — "受影响派发行转 failed 态并记录原因;恢复后经重派发继续" — scope to the launch leg (FT-091) or specify the detection mechanism, and mark the outcome `source: inferred`.
7. [Fact Alignment] required_outcomes-derived outcome missing `source: inferred` — "surface-web required_outcomes 映射:session-expired → 交替期间宿主不可用/凭据失效…" — add the annotation + reasoning basis, matching the three outcomes that do it right.
8. [Fact Alignment] journey inferred-markers dropped in porting — step-1 Output "不受应用通道演进影响" and step-3 Output "看板呈现 = 数据内核权威表(ID/状态/依赖/标题对拍零差异)" — carry the journey's `source: inferred` comments into the contracts.
9. [Fact Alignment] reingest-path ≤5s backflow has no fact-table basis — "变更回流看板(≤5s 感知口径)" — verify the reingest event-push mechanism or mark UNKNOWN/inferred with the tech-design Interface 4.7 citation restored.
10. [Semantic Purity] kernel nouns inside dimension values — "data_authority 为 files", "migration_event 留 reingest 审计", "projects.deviated 置位 + deviation_detected 事件", "内核表查询 + 仓内文件读取", "(单事务先删后插 + 对拍校验)" — rewrite as board-/system-observable behavior.
11. [Precondition Exclusivity] step-1 outcomes selectable only via Input — success PC "…终端 + 冻结 CC 插件形态…" vs cc-plugin PC "未注册项目的日常管线由冻结 CC 插件承载" both hold simultaneously; app-invisibility PC "未注册 forge 项目存在于本机;应用已启动" co-holds with all — encode the operating channel into Preconditions (e.g., "本轮管线由终端通道承载/由冻结 CC 插件承载").
12. [Completeness/Surface Fitness] validation-error consideration leaves no contract-layer trace — step-2 Input "看板多选任务并派发" with no mapping comment anywhere — reproduce the journey's delegation note ("由同应用面的 task-dispatch-execution-loop Step 1b 承载") in step-2.
13. [blindspot] environment isolation preconditions dropped (isolated userData / no active instance holding the single-instance lock) — "已注册并完成 SoT 迁移的应用通道项目就绪(应用 + dsh tool + 宿主)" — declare them as environment Preconditions.
14. [blindspot] zero-spawn/zero-CLI observation channel unspecified — "零 forge CLI 调用(SC1 口径)" — name the observable artifact and access path.
15. [blindspot] "可派发类型键" unpinned — `value: "可派发类型键"` — pin a concrete dispatchable task_type per FT-072's vocabulary.

---

## Verdict

**960/1100 — PASS.** The contract set is structurally complete, journey-faithful, and cleanly grounded where it cites facts (authority-guard's FT-059/FT-062 annotation is the model). Parentage and invariant handling are noticeably cleaner than the sibling journey's first iteration. The material risks for test generation are step-3's under-declared boundary fixtures (unseedable dispatch rows and in-flight tasks, vacuous isolation audit), step-1's mis-justified empty web anchor on a browser-face outcome, and the systematic loss of journey provenance annotations (inferred markers, the validation-error delegation, environment isolation preconditions) — all fixable without restructuring.
