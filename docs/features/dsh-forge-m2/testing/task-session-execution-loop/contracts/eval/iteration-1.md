# Contract Eval Report — task-session-execution-loop / Iteration 1

> Scored by `forge:eval-contract` adversarial scorer (Senior QA Engineer persona), 2026-09-23.
> Scale 1100 / target 935 / max 3 iterations. ITERATION = 1 (no previous contract-eval report; the sibling `testing/<journey>/eval/` directory holds the journey-type eval, not this one).
> Evaluated documents: `contracts/step-{1..7}-*.md` (7 files, 14 Outcomes).
> Cross-references read: `journey.md`, `design/page-map.md`, `.forge/fact-table.json` (FT-001..FT-056), `gen-journeys/rules/surface-web.md`, `docs/business-rules/{coexistence,privacy,resilience,task-operations}.md`, `design/tech-design.md` (domain model), `gen-contracts` skill rules (dimension-rules / fixture-spec / journey-contract-model).

## Phase 1 — Reasoning Audit (pre-score anchors)

Independent judgment before touching the rubric:

1. **Step fidelity**: journey has 7 steps + 7 edge cases (3b/3c/3d/3e/5b/5c/6b). Contracts map 1:1 — step 2 carries `worktree-trace-visible`; step 3 carries all four edge legs (`no-prompt-disabled`, `launch-channel-failure`, `duplicate-launch-supersede`, `interrupted-launch`); step 5 carries `sync-degraded` + `multi-change-flowback`; step 6 carries `multi-history-recovery`. No journey step or edge case is dropped, none invented beyond the two journey-annotated inferences.
2. **Setup propagation**: journey Setup (one-shot fixture project, isolated userData, ≥10 tasks, cross-plane oracle = test-process reads fixture forge files / stub CLI stdout) is carried into step-1 Preconditions and cited back in steps 4/5 Outputs ("校验通道见 Setup").
3. **Fact grounding spot-checks (all verified true)**: 1-click + 3s budget (FT-043), caller-minted session id + cwd=registered root + queue-mode first message + deterministic requestId (FT-041), single appended FORGE_ACTOR line (FT-045), persistence-after-launch + hiccup tolerance (FT-044), supersede/ended/no-delete/newest-first/no-exit-convergence (FT-035), 7-state vocab (FT-033), 400ms debounce + 500ms batch (FT-047), sync-error + silent retry + last-good board (FT-056), tooltip/badge/进入会话 copy (FT-052), worktree/branch projection + no fabricated fields (FT-032/FT-055), degradation chain three-terminal shape (FT-041/FT-042).
4. **Suspects to attack in Phase 2**: `data-probe` DOM attribute in a State value; internal channel/DTO/table identifiers in State values; harness procedure inside a Preconditions string; source-determination precedence phrasing vs FT-045; `status: 处于可执行状态` not a 7-state value; SessionLink parent_entity vs schema FK; unanchored exact copy `正在发起会话…`; unanchored "旧挂接会话本体不被强制结束".

## Phase 2 — Rubric Scoring

### 1. Completeness — 150/150 (threshold ≥90)

| Criterion | Score | Evidence |
|---|---|---|
| All four mandatory dimensions non-empty in every Outcome | 50/50 | All 14 Outcomes across 7 files carry non-empty Preconditions (each with `fixture_spec`), Input, Output, State; Side-effect present everywhere (explicit `none` on read-only legs). No missing dimension found. |
| `## Journey Invariants` present with ≥1 entry in every file | 50/50 | All 7 files carry the section exactly once with 5 invariants each (verbatim journey invariants 1–5). |
| Happy path + surface-mandated derived Outcomes | 50/50 | Web `required_outcomes` both satisfied with declared mapping comments: step-3 `no-prompt-disabled` ("surface-web required_outcomes 映射:validation-error → … 入口禁用 + 原因说明") and `launch-channel-failure` ("session-expired → 宿主不可用/凭据失效…UF5 error(发起失败)态 + 恢复引导"). Plus 6 additional boundary Outcomes. |

### 2. Semantic Purity — 172/200 (threshold ≥120)

| Criterion | Score | Deduction evidence |
|---|---|---|
| Natural language, no regex/selectors | 70/80 | No regex, CSS/XPath selectors, or framework assertions anywhere. **-10**: Output values embed verification-channel instructions rather than what the system produces — step-1 Output "与 forge task list 输出一致(校验通道 = 测试进程直读 fixture forge 文件或 stub CLI stdout 对拍)"; step-4 Output "与 stub CLI stdout 逐字符一致". "How to verify" belongs to gen-test-scripts, not the contract dimension value. |
| Preconditions declarative, not procedural | 54/60 | Preconditions are overwhelmingly declarative ("看板上存在处于可执行状态的任务卡片/节点"). **-6**: step-6 success embeds a test-harness procedure in the Preconditions string — "应用重启(测试进程等待进程退出 + 单实例锁释放后重新启动)". Compare step-3 `interrupted-launch`, which correctly places the equivalent procedure inside `fixture_spec.state_requirements` ("测试进程在发起链中途杀掉应用进程…"). |
| No implementation coupling in dimension values | 48/60 | State values carry internal identifiers: step-3 `no-prompt-disabled` "探测状态在入口上可见(data-probe 属性呈现 unavailable)"; step-5 success "变更以 task_updated(changeKind = attribute)事件批推送(dsh-forge:workbench-events 通道)"; step-6 "session_links 持久于工作台自有 SQLite(userData 内库文件)"; step-1 "任务看板快照(TaskBoardData)载入". **-12** for the cluster. Mitigation acknowledged: gen-contracts `dimension-rules.md` sources the State dimension from "Fact Table state storage info", and each identifier is fact-anchored (FT-043/FT-046/FT-035/FT-056) — hence a cluster deduction, not per-instance zeros. The `data-probe` attribute is additionally charged under Surface Fitness. |

### 3. Precondition Exclusivity — 150/150 (threshold ≥90)

| Criterion | Score | Evidence |
|---|---|---|
| Preconditions distinct across Outcomes per Step | 60/60 | Step 2 partitions on worktree trace (success "执行痕迹均在默认工作区…(无非默认 worktree 执行痕迹)" vs "该任务在非默认 worktree 有执行痕迹(带执行分支名…)"). Step 3 partitions on prompt availability × host availability × active-link existence × crash timing. Step 5 on chain health × change multiplicity. Step 6 on link-history shape (1 active + 0 ended vs "至少 1 条 active + 1 条 ended 行并存"). No overlapping pair found. |
| Preconditions sufficient to uniquely select | 50/50 | `duplicate-launch-supersede` explicitly pins "宿主可用" to stay disjoint from `launch-channel-failure` ("dsh 宿主不可用或凭据异常"); `interrupted-launch` occupies a temporal condition (mid-chain kill) no other Outcome can hold. |
| Error/boundary triggers stated explicitly | 40/40 | Every boundary Outcome names its trigger: "原因码 ERR_NO_PROMPT——任务键合法但 forge prompt get-by-task-id 无输出/非零退出,或键方言非法即不 spawn"; "发起链各通道腿失败…三终态齐备、无静默"; "发起链进行中(会话创建/挂接写入未完成)时应用被强制退出或崩溃"; "破线源于感知链故障(watcher/扫描错误)". |

### 4. Fact Alignment — 140/150 (threshold ≥90)

| Criterion | Score | Evidence |
|---|---|---|
| Factual claims traceable or marked UNKNOWN | 50/60 | Extensive spot-verification passed (see Phase 1 item 3). Three blemishes, **-10 combined**: (a) step-5 success State "来源判定 = 挂接推断主路径或 FORGE_ACTOR actor 标记" inverts FT-045's documented order (path 1 = actor frontmatter `'session:'` prefix → session; path 2 fallback = active-session-link inference) — as written it reads as if link inference were the primary path; (b) step-3 success Input asserts exact copy "发起中显示发起中指示(正在发起会话…)" — `launch.initiating` is absent from the Fact Table (FT-052's locale inventory does not list it; it does exist in `packages/plugins/forge-workbench/src/client/locale/zh.ts:39`, but the contract provides no anchor); (c) `duplicate-launch-supersede` Side-effect "旧挂接会话本体不被强制结束(仅挂接行状态迁移)" — no fact asserts the old dsh session survives; FT-035 covers row semantics only. None marked UNKNOWN. |
| Inferred claims carry rule support + `source: inferred` | 50/50 | All three derived Outcomes annotated: `launch-channel-failure` ("source: inferred:「不残留半初始化的挂接记录」推自 Interface 5 成功链序…"), `duplicate-launch-supersede` ("source: inferred:并发再发起无 PRD 明文;依据 = 挂接索引允许多行(UNIQUE(project_id, task_key, session_id),tech-design)…"), `sync-degraded` ("source: inferred:超时指示无来源定义——updating 仅在变更事件到达时点亮…"). Both Web `required_outcomes` mappings cite the rule by name. Journey invariant 5 also carries the annotation. |
| No hallucinated unclassified claims | 40/40 | Everything traces to Fact Table, journey, page-map, or tech-design. Even the step-1 fixture enrichment "依赖关系覆盖链/菱形/悬空依赖各至少一处" (stricter than this journey's Setup "含依赖关系") traces to the sibling task-board-browsing journey Setup and task 5.6 records ("悬空依赖显式标记(不静默丢弃)"). |

### 5. Surface Fitness — 90/100 (threshold ≥60)

Parameterized by `gen-journeys/rules/surface-web.md`; SURFACE_TYPE = web.

| Criterion | Score | Evidence |
|---|---|---|
| Mandatory derived Outcomes present | 40/40 | `validation-error` and `session-expired` both present in step 3 with declared mapping rationale (the journey is form-free, so validation-error maps to precondition-driven entry disablement + reason tooltip; session-expired maps to host/credential unavailability as UF5 failed-launch state). Mapping is faithful to the journey's own annotations. |
| Surface-appropriate language | 25/35 | Interactions, page elements, and async semantics dominate: 点击/审批/查看/返回, 任务卡/徽标/详情面板/工具栏指示/toast/对话框, ≤3 秒/≤5 秒/发起中指示/重试. **-10**: step-3 `no-prompt-disabled` State "探测状态在入口上可见(data-probe 属性呈现 unavailable)" — a DOM test-hook attribute inside a dimension value; surface-web language rules exclude DOM selector/hook language from dimension values (it is user-invisible implementation surface). |
| TUI async timeout Outcomes | 25/25 | N/A for web surface — full marks per rubric. |

### 6. Internal Consistency — 150/150 (threshold ≥90)

| Criterion | Score | Evidence |
|---|---|---|
| Journey invariants hold in every Contract | 60/60 | Read-only board: user's only write-ish action is approval inside the session UI ("审批走主窗口现有会话 UI"), the sanctioned channel; no board write entry appears in any Outcome. Sole-source-of-truth: every Outcome that touches forge data says "只读感知,不写 forge 数据". Source marking per change (step 5 Outputs). ≤5s 回流 with degradation path (step 5 success + sync-degraded). Link-write-after-create honored in success, failure ("不残留半初始化的挂接记录"), and interrupt ("要么挂接行完整…要么无行"). No violation found. |
| Cross-Contract state references consistent | 50/50 | Step 4 "Step 3 发起成功的会话已进入" resolves to step-3 success State ("会话经宿主通道创建…首条用户消息按队列模式持久化"). Steps 5/6/7 active-link preconditions resolve to step-3 State ("session_links 写入新的 active 行"). Step 3's "任务详情已打开" resolves to step-2 State. Bonus coherence: step-3 `duplicate-launch-supersede` end-state (1 active + 1 ended) exactly feeds step-6 `multi-history-recovery` precondition. Note (no deduction): invariant text "见 Step 5b" uses journey edge-case numbering; the contract Outcome is named `sync-degraded` — resolvable via journey.md, which each file lists in `sources`, and it is neither dangling nor contradictory. |
| Outcome Preconditions achievable from preceding State changes | 40/40 | Chain 1→2→3→4→5→6→7 verified stepwise; step-6 restart precondition ("该任务存在已写入的挂接关系(active)") is exactly step-3's post-state; step-7's precondition is step-6's post-state. |

### 7. Anchor Integrity — 100/100 (threshold ≥60)

Handbook `design/page-map.md` exists → dimension active. Web anchor field = `page`.

| Criterion | Score | Evidence |
|---|---|---|
| Anchor field completeness | 40/40 | All 7 contracts carry `anchors.web.page` (+route/requires_auth/layout). Values used: `workbench/tasks` ×5 (steps 1,2,3,5,6), `session` ×2 (steps 4,7) — both are handbook view keys. Scope note: "every handbook page has a corresponding Contract" is satisfied at feature scope, not journey scope — the other view keys are covered by the sibling journeys' contract sets (verified: `workbench/overview` in multi-project-management + plugin-management, `workbench/features` in feature-board-docs-browsing). `workbench/dialog/*` appears only inside layout strings (step-3 "…+ workbench/dialog 确认/错误浮层"); acceptable since dialogs are overlays raised by page actions, not standalone destinations. |
| Anchor values match handbook | 30/30 | `workbench/tasks` and `session` match handbook view keys exactly. Empty `route: ""` matches the view-key addressing design (explicitly NOT a defect — page-map header note + FT-053). `requires_auth: false` matches "Auth: none". Layout chains match handbook sections (TaskDagView default 视图 A, TaskDetailPanel 侧板, FlowOverlay aria-live 回流呈现, LaunchErrorDialog family). |
| Handbook internal consistency | 30/30 | Five view-key families, no duplicate keys, no conflicting navigation definitions; the feature-detail "Route Parameters" table is self-consistently re-labeled "视图键段" per the header note. No method/path/navigation conflicts found. |

### 8. Fixture Specification — 85/100 (threshold ≥60)

| Criterion | Score | Evidence |
|---|---|---|
| Entity completeness (veto item) | 40/40 | Every entity referenced in Preconditions/Input/State is declared: Project + Task in all 7; SessionLink in steps 3–7 (step-3 success correctly omits it — no link exists pre-first-launch). Entity types match the design domain model (tech-design storage tables `projects`/`task_snapshot`/`session_links`; §cross-layer table explicitly names `SessionLink`). `sync_state`, referenced in step-5 State, is a non-seedable derived cache whose failure injection is properly declared as a state_requirement ("感知链故障注入(watch/扫描错误;fixture 控制面注入)") — not fixture data, so the veto is not triggered. |
| Relationship and constraint coverage | 20/35 | Task `belongs_to` Project declared everywhere. **-8**: SessionLink declares `parent_entity: "Task"`, but the storage model parents `session_links` to Project (`project_id` FK CASCADE; `task_key` is a plain column — FT-035 / tech-design §242). Logical ("挂接 = 任务↔会话") but diverges from the schema relationship a fixture generator would mirror; the Project relationship of SessionLink is never declared. **-7**: step-2 Task constraint `status: "处于可执行状态"` is not a value from the 7-state vocabulary (FT-033: pending/in_progress/completed/blocked/suspended/skipped/rejected) — a fixture generator cannot resolve which status value(s) to seed. Note (no deduction): step-3/4 constraint `hasPrompt` is a probe outcome (FT-039), not a Task storage field — workable fixture-level abstraction, but synthetic. |
| Minimum data quantity declarations | 25/25 | Step-1 Task `min_count: 10` matches journey Setup ≥10. Step-2 union Task `min_count: 2` covers the two worktree outcomes. Step-6 union SessionLink `min_count: 2` covers "active 与 ended 各至少一条". All others ≥1 and sufficient. |

### Cross-dimension coherence check

- No double-counting: `data-probe` charged once (Surface Fitness); stub-stdout verification-channel language charged once (Semantic Purity); FT-045 precedence phrasing charged once (Fact Alignment) — no invariant contradicts FT-045, so Internal Consistency is unaffected.
- The fixture `status` vagueness does not create precondition overlap (exclusivity partitions on worktree/prompt/host/link axes, not status values), so no cross-dimension contradiction.
- Anchor values and Surface Fitness agree (all contracts are web-page-anchored; no CLI/TUI leakage in Input/Output).

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. **[blindspot] Stale active link is a real, untested production state.** Tech-design concluded no terminal session signal exists ("不可得终态信号…`session_links.status→ended` 迁移维持发起侧收敛"), so an active row can outlive its dsh session. No contract tests what the board/detail shows, or what「进入会话」does, when the active link points at a dead session. Quotes: step-7 Preconditions "该任务存在进行中(active)的挂接会话"; step-3 Output "任务卡呈现会话运行中徽标". The badge can assert liveness that no longer holds — a user-facing correctness gap no rubric dimension catches (each contract is internally fact-faithful).
2. **[blindspot] Restart harness-safety asymmetry (known flake source on win32).** Step-6 encodes the single-instance-lock wait — "应用重启(测试进程等待进程退出 + 单实例锁释放后重新启动)" — but step-3 `interrupted-launch`, which also kills and restarts the app, says only "重启应用,重新打开该任务详情" with no lock-release wait. This is precisely the documented ERR_SINGLE_INSTANCE flake pattern (project memory: 外部持锁即整片失败). A downstream script generator will copy the unsafe restart in step 3.
3. **[blindspot] Timing T0 undefined for all three budgets.** "首屏 2 秒内可交互(计时口径 = Setup 实际任务规模…)" and "发起到会话界面可交互不超过 3 秒" define scale/scope but never the measurement start event (app ready? view-key switch committed? confirm click?). Automation must guess the clock origin; two implementers will measure two different things.
4. **[blindspot] Locale pinned implicitly to zh with no fixture declaration.** Contracts assert exact zh copy — "tooltip:该任务没有执行 prompt,无法从它发起会话", "任务卡呈现会话运行中徽标", "正在发起会话…" — while the workbench plugin carries en locale keys too (`en.ts` `'launch.initiating': 'Launching session…'`). No Outcome declares an app-locale precondition, so a test running under en locale fails on copy equality for environment reasons, not product reasons.
5. **[blindspot] First-load perception failure has no Outcome in this journey.** Step-1 Preconditions require "forge 数据可正常读取(感知链健康)" and the only degradation leg (`sync-degraded`) covers post-change watcher failure at step 5. A cold start over an unreadable/corrupt forge tree at board load is uncovered anywhere in this contract set (resilience rule BIZ-resilience-001 adjacent: which failures are silent vs surfaced at first load).

## Score Summary

| Dimension | Score | Threshold | Result |
|---|---|---|---|
| Completeness | 150/150 | ≥90 | PASS |
| Semantic Purity | 172/200 | ≥120 | PASS |
| Precondition Exclusivity | 150/150 | ≥90 | PASS |
| Fact Alignment | 140/150 | ≥90 | PASS |
| Surface Fitness | 90/100 | ≥60 | PASS |
| Internal Consistency | 150/150 | ≥90 | PASS |
| Anchor Integrity | 100/100 | ≥60 | PASS |
| Fixture Specification | 85/100 | ≥60 | PASS |
| **Total** | **1037/1100** | **≥935** | **PASS** |

**Verdict: PASS.** Every dimension above threshold; total 1037 ≥ 935.

## Attacks List (for reviser, if iterations remain)

1. [Semantic Purity] Output values embed the verification channel instead of system output — "校验通道 = 测试进程直读 fixture forge 文件或 stub CLI stdout 对拍" — move oracle definitions to a Setup/notes block; dimension values state what the system shows.
2. [Semantic Purity] Harness procedure inside Preconditions — "应用重启(测试进程等待进程退出 + 单实例锁释放后重新启动)" — demote to `fixture_spec.state_requirements` like step-3 does.
3. [Semantic Purity/Surface Fitness] DOM test-hook in dimension value — "data-probe 属性呈现 unavailable" — replace with user-visible phrasing (探测结果与禁用原因在入口上可见).
4. [Fact Alignment] Source-determination precedence inverted/ambiguous vs FT-045 — "来源判定 = 挂接推断主路径或 FORGE_ACTOR actor 标记" — state actor-mark-first, link-inference-fallback.
5. [Fact Alignment] Unanchored exact copy "正在发起会话…" — cite FT/locale fact or mark UNKNOWN; ideally add `launch.initiating` to the Fact Table.
6. [Fact Alignment] Unanchored behavioral claim "旧挂接会话本体不被强制结束" — trace to a fact (IPC verb inventory shows no session-termination verb) or annotate inferred.
7. [Fixture Specification] SessionLink `parent_entity: "Task"` diverges from schema FK parent (Project) — declare the Project relationship (or both) so fixture generation mirrors storage.
8. [Fixture Specification] `status: "处于可执行状态"` is not a 7-state vocabulary value — resolve to concrete value(s), e.g. pending.
9. [blindspot] Add a stale-active-link Outcome (step 7) — badge/进入会话 behavior when the linked session no longer exists.
10. [blindspot] Add the single-instance-lock wait to step-3 `interrupted-launch` restart (parity with step 6).
11. [blindspot] Define T0 for the 2s/3s/5s budgets (which event starts the clock).
12. [blindspot] Declare app-locale precondition (zh) wherever exact copy is asserted.
