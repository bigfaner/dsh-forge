# Contract Evaluation Report — overview-entry-new-session (Iteration 1)

- **Scorer**: Senior QA Engineer (adversarial)
- **Date**: 2026-10-08
- **DOC_DIR**: `docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/contracts/` (5 files, step-1 … step-5, 18 Outcomes)
- **Surface**: web · **Handbook**: `design/page-map.md` (exists) · **Fact table**: `.forge/fact-table.json` (139 entries)
- **Iteration**: 1 (no previous report)

## Verdict

**961 / 1100 — FAIL**. Total clears the 935 gate, but **Fixture Specification scores 32/100 (min threshold 60)**: six task-hosting Outcomes (4b, 4c, 5, 5b, 5c, 5d) declare a `Task` fixture with no container entity (`Feature`/`Proposal`), and per page-map the task sub-tab's container pill set derives from `forge:features/list ∪ forge:proposals/list` with `taskCount > 0` — a Task with no container row appears in no pill, so the toolbar surfaces those Outcomes assert (诊断/派发/行内详情) are unreachable as declared. Everything else is strong: complete 18/18 step coverage, clean web-surface adjudication, accurate fact alignment (no contradictions found against fact table or page-map), intact invariants.

| Dimension | Score | Min |
|---|---|---|
| 1. Completeness | 150/150 | 90 |
| 2. Semantic Purity | 183/200 | 120 |
| 3. Precondition Exclusivity | 125/150 | 90 |
| 4. Fact Alignment | 127/150 | 90 |
| 5. Surface Fitness | 100/100 | 60 |
| 6. Internal Consistency | 144/150 | 90 |
| 7. Anchor Integrity | 100/100 | 60 |
| 8. Fixture Specification | **32/100** | **60** |
| **Total** | **961/1100** | 935 |

## Phase 1 — Reasoning Audit (pre-score anchors)

1. Journey has 18 steps (5 happy: 1–5; 13 edge: 1b/1c/1d/1e/2b/3b/4b/4c/4d/4e/5b/5c/5d). Contract mapping: step-1 → success/no-mode-source-keeps-default/multi-doc-prefill-boundary/expedition-proposal-align/draft-independence (1, 1b, 1c, 1d, 1e); step-2 → success/empty-intent-send (2, 2b); step-3 → success/context-drift-proof (3, 3b); step-4 → success/no-diag-entry-for-nonfailed/task-failure-diag-autosend/diag-success-toast/blitz-container-no-diag-button (4, 4b, 4c, 4d, 4e); step-5 → success/all-terminal-disabled/running-task-jumps-session/no-single-task-execution-entry (5, 5b, 5c, 5d). **All 18 journey steps have carrying Outcomes; no orphan outcomes.** Outcome names and step-action strings are verbatim-consistent with the journey.
2. Fact verification performed against the fact table and page-map: prefill order (M3_FORMAT_PREFILL: `@docs/... 第一行 → 名称： → 摘要： → 状态：|阶段： → 已生成文档：+路径（状态） → 我的意图：`, never a mode line) — contract step-1/3 Outputs match exactly. Terminal set completed/skipped/rejected (M3_TERMINAL_TASK_SET) matches step-5b. Dispatch button rules and jump-to-latest-dispatch-session (M3_DISPATCH_BUTTON_RULES, M3_SESSION_LINKS_SOURCE) match step-5/5c. Registry default = expedition (M3_PRESET_REGISTRY_DEFAULT) matches step-1b "保持默认远征". NULL mode for scanned legacy proposals (M3_PROPOSAL_MODE_LINEAGE) matches step-1b fixture value. No-migration five-check vocabulary (M3_VALIDATE_FIVE_CHECKS) matches step-4. Toast durations 1s/5s, 深灰实底置灰 + tooltip, "不切模式" on jump — all match page-map v22/v23/v24. **No claim contradicts the fact table or handbook.**
3. Step-2b "empty intent send allowed" was checked against EMPTY_SEND_GUARD (blank-message send interception): no contradiction — the guard fires only on `draft.trim()==='' && no attachments`; in 2b the draft carries the full prefill, so "无字段级校验拦截" is accurate.
4. Step-5 success precondition correctly intersects the two page-map rules (enabled iff non-terminal present; in_progress present → jump): "存在未处于终态的任务…且无正在执行的任务" is the right logical cut for the new-session branch.
5. **Primary defect found**: container-entity omission across all task-hosting outcomes (see Fixture Specification) — the same class of gap the mode-selection-alignment iteration-1 report flagged as "primary entities present, ambient omitted", except here the omitted entity is *not* ambient (no default container exists) and the scenarios are unexecutable without it.

## Phase 2 — Dimension Scoring

### 1. Completeness — 150/150

- **Four mandatory dimensions (50/50)**: every Outcome in all 5 files has non-empty Preconditions (each with an embedded `fixture_spec`), Input, Output, State; Side-effect present everywhere (explicit `"none"` or described); Invariants present on selected outcomes.
- **Journey Invariants section (50/50)**: `## Journey Invariants` present in all 5 files, 4 entries each, matching the journey's 4 invariants.
- **Happy path + surface-mandated derived scenarios (50/50)**: all 18 journey steps carried; every file has an explicit `web-surface-required adjudication` comment (e.g. step-1: `validation-error = N/A（…边界承载步 = Step 2b，见 step-2 合约）; session-expired = …承载 Outcome "draft-independence"（本步 1e）`); the two mandatory derived Outcomes exist as real Outcomes (step-2 `empty-intent-send` = validation-error boundary carrier; step-1 `draft-independence` = localized session-expired carrier).

### 2. Semantic Purity — 183/200

- **Natural language, no code/regex (80/80)**: no regex patterns, CSS/XPath selectors, or framework assertion calls in any dimension value. `/run-tasks` and `@docs/...` strings are user-visible message content (the spec'd message body itself), not verification machinery.
- **Declarative preconditions (55/60)**: one procedural embedding — step-5 `no-single-task-execution-entry` Preconditions: `"任务子 tab 任意视图与任务详情在场（观察态——仅核查动作区控件面，不触发派发按钮）"` — "仅核查…不触发" is tester instruction, not system state. −5. (All other Preconditions are clean declarative state descriptions.)
- **No implementation coupling (48/60)**: internal platform API / DB-table / tool-parameter names inside dimension values, mirroring design vocabulary but coupling behavior dimensions to internals:
  - step-1 success State: `"agentPreset.select 以 blitz 写入"`; no-mode State: `"（registry 默认远征）"`; expedition State: `"agentPreset = expedition（select 对齐）"`;
  - step-3 success/drift State: `"agentPreset = expedition（固定）"` / `"（覆盖语境）"`;
  - step-4 blitz-container Output: `"（validateFeatureTasks 为 feature 域校验——突击容器不在面）"` (rationale naming the internal RPC, not message content);
  - step-5 running Preconditions+Output: `"（其派发会话在场——task_session_links 挂接）"` / `"（该任务最新派发挂接——task_session_links/claim 记录）"` (database table name);
  - step-5 success Output: `"（只给 dispatchTask 必要信息 = contextSlug；…）"` and no-single-task Invariants: `"dispatchTask 就绪选择 = 机械序（全库盲选）"` (internal tool + parameter names).
  Nine instances → −12. Observable behavior is always described alongside, so testability survives, but the letter of "not internal function calls, database queries" is breached.

### 3. Precondition Exclusivity — 125/150

- **Distinctness (50/60)**: no two Outcomes share semantically equivalent Preconditions, and step-3 shows the right discipline (success adds `"当前语境无突击漂移源"` to exclude `context-drift-proof`; step-1 success adds `"文档仅 proposal.md 一篇"` to exclude multi-doc on doc-count). Two co-holdable pairs remain:
  - step-4: `no-diag-entry-for-nonfailed` (`"任务状态非 blocked / rejected（如 pending / completed）"`) vs `task-failure-diag-autosend` (`"某任务状态 = blocked…且有失败记录"`) — the Setup world contains *both* task kinds, so both Preconditions hold simultaneously; "该任务/某任务" leaves target resolution to the operator. −10.
  - step-1: `success` (`"mode 溯源 = blitz 的提案在场"`) is an existence claim that also holds when the multi-doc proposal (mode unpinned in `"提案挂有多篇文档"`) is blitz — precondition-only selection is ambiguous; the Input row-target must disambiguate. (Counted once; see next criterion.)
- **Unique selection (35/50)**: the pairs above plus step-5 `no-single-task-execution-entry` (`"任务子 tab 任意视图与任务详情在场"`) — a catch-all that holds in every other step-5 scenario, with only the Input's intent ("寻找单任务执行入口") separating it from `success`/`all-terminal-disabled`/`running-task-jumps-session`. −15.
- **Explicit triggering conditions (40/40)**: every boundary Outcome states its trigger precisely — no mode lineage (1b), multi-doc (1c), expedition source (1d), unsent draft (1e), empty intent (2b), blitz context (3b), non-failed status (4b), blocked + failure records (4c), all-green subgraph (4d), blitz container selected (4e), all-terminal (5b), in_progress present (5c).

### 4. Fact Alignment — 127/150

- **Factual claims traceable (45/60)**: substantive alignment is excellent — every spot-checkable claim matches the fact table and page-map (see Phase 1 anchors 2–4). **However, not a single fact_id citation exists in any of the 5 files**; grounding chains through `sources: [journey.md]` only. The rubric requires factual claims to be traceable to a `fact_id` or marked UNKNOWN. Formal traceability gap → −15. Natural anchors left uncited: M3_FORMAT_PREFILL, M3_DISPATCH_COMMAND_TEMPLATE, M3_TERMINAL_TASK_SET, M3_DISPATCH_BUTTON_RULES, M3_SESSION_LINKS_SOURCE, M3_VALIDATE_FIVE_CHECKS, M3_PROPOSAL_MODE_LINEAGE, M3_PRESET_REGISTRY_DEFAULT, M3_AUTOSEND_EXCEPTIONS.
- **Inferred claims annotated (42/50)**: the surface-rule-derived carriers are properly annotated — step-1 `draft-independence` (`source: inferred` + "surface-web session-expired 规则本地化映射"), step-2 `empty-intent-send` (`source: inferred` + "surface-web validation-error 规则考虑记录的边界承载"), as are `no-mode-source-keeps-default` and `context-drift-proof`. **But step-4 `task-failure-diag-autosend` copies journey Step 4c's inferred clause verbatim — Side-effect: `"窗口过期后可重开——「诊断失败」按钮常驻 blocked/rejected 详情动作区，重展开详情再点即重开结果 toast"` + Invariants `"窗口过期重开通道在场（按钮常驻）"` — while the journey marks exactly this clause `［source: inferred——按钮常驻（UF-3 第 5 条），重开通道 = 按钮再点］`. The inferred marker was dropped. −8.**
- **No hallucinated claims (40/40)**: zero unclassified claims; nothing contradicts the fact table, page-map, or journey.

### 5. Surface Fitness — 100/100

- **Mandatory derived outcomes (40/40)**: validation-error + session-expired adjudicated in all 5 files with reasoned N/A/carrier dispositions consistent with the journey's Derived Outcomes 裁决 section; both carriers are real Outcomes.
- **Surface-appropriate language (35/35)**: user-centric web vocabulary throughout — 座位标签、输入框草稿、toast 5s 自消、按钮置灰 + tooltip、行头、跳转落点、阴性/阳性对照. No DOM selectors or non-web language in dimension values.
- **TUI timeout criterion (25/25)**: non-TUI surface — full marks.

### 6. Internal Consistency — 144/150

- **Invariants hold (60/60)**: no Outcome violates the four journey invariants. Autosend exception closure is intact (steps 1/2/3 all "不自动发送"; steps 4/5 autosend only within the closed exception list); mode routing invariant holds in every Outcome (blitz→blitz, NULL→不切换, expedition→expedition, feature→固定远征, 诊断→容器模式, 派发→容器模式); message bodies carry no mode line; dispatch = single-line minimal message; dispatch button trichotomy (亮起/置灰/跳转) exactly as declared. Step-2b's manual send of an empty-intent message does not violate the "等待用户明确意图" invariant (that invariant governs auto-send, and the journey adjudicates manual empty-intent send as legal).
- **Cross-contract state references (44/50)**: the chains are sound — step-2's `"Step 1 的预填草稿在场（未发送）"` is created by step-1 success; step-1 `draft-independence` correctly consumes step-1's session; step-3 `context-drift-proof`'s blitz context is producible from step-1. One within-file semantic inconsistency: step-1 `multi-doc-prefill-boundary` declares `Side-effect: "none"` although its own Input opens a new session and its State says `"新会话草稿 = 完整多文档清单预填（未发送）"` — the same action is declared `"会话编排创建动作"` in `success`, `expedition-proposal-align`, and `draft-independence` ("第二个会话编排创建动作"). −6.
- **Preconditions achievable from preceding State (40/40)**: step-2 from step-1 draft; 1e from 1; 3b from 1/1d context; 5b/5c/5d are fixture-declared states, each self-sufficient in its own `fixture_spec` (modulo the container gap scored in dimension 8, not double-counted here).

### 7. Anchor Integrity — 100/100

- Handbook `design/page-map.md` exists. All 5 contracts carry `anchors.web.page` matching handbook Page Overview base identifiers: "概览 · 提案子 tab" (step-1), "新会话" (step-2 → entry "新会话（提案/feature/诊断/派发渠道）", unambiguous base-name match), "概览 · feature 子 tab" (step-3), "概览 · 任务子 tab" (step-4, step-5). No missing `page` field. Empty `route` is consistent with the handbook's "M3 无新路由 / Route Guard 不适用". Handbook itself has no duplicate or conflicting page definitions. Completeness 40/40, value match 30/30, handbook consistency 30/30.
- Note (no deduction): step-4 and step-5 share the same page anchor; their `layout` fields differentiate the control surface (DiagToast vs 派发按钮右簇) — acceptable single-anchor practice. Pages not covered by this journey's contracts (评审流转/模式更改对话框、Forge设置、hero 座位) belong to sibling journeys of the same feature.

### 8. Fixture Specification — 32/100

- **Entity completeness (15/40) — veto considered, borderline, NOT triggered** (each Outcome's most-directly-operated entity is declared: Task/Session/Proposal/Feature; the omission is of the *referenced-through-a-generic-word* parent, detailed below — a strict letter reading of "any entity type referenced in Preconditions… missing" could take this to 0 and veto the dimension; the deduction path is taken because the precondition says "当前容器" without naming the entity type).
  **Material gap**: six Outcomes operate on tasks with no container entity in `fixture_spec.entities`:
  - step-4 `no-diag-entry-for-nonfailed`: entities = `[Task]` only — the task row must render inside a container pill's task list for "展开该任务行内详情" to be performable;
  - step-4 `task-failure-diag-autosend`: entities = `[Task(blocked, failure_records)]` only — same, plus the Output asserts dual-branch container routing;
  - step-5 `success` / `all-terminal-disabled` / `running-task-jumps-session` / `no-single-task-execution-entry`: entities = `[Task(…)]` (+ TaskSessionLink for 5c) only.
  Per page-map, the container pill set = `forge:features/list ∪ forge:proposals/list` filtered `taskCount > 0` (core JOIN on container slug); per M3_TASK_MODE_SNAPSHOT tasks snapshot mode from their proposal/feature container. A Task fixture with no `Feature`/`Proposal` row appears in no pill → the toolbar 诊断/派发 buttons and row detail these Outcomes assert have no surface to render on. The Input lines compound it — e.g. step-5 success Input `"点工具栏「派发」按钮"` never establishes which container pill is selected. As declared, these six scenarios are unexecutable. −25.
- **Relationship and constraint coverage (0/35)**: the Task→container parent-child relationship (`relationship_type: belongs_to`, `parent_entity: Feature|Proposal`) is missing in exactly those six Outcomes (present and correct in step-4 success, step-4 diag-success, step-4 blitz-container, step-1 multi-doc, step-3 success). Guidance: −10 per missing relationship → −60, floored at 0.
- **Minimum data quantity (17/25)**: counts are adequate where declared (`ProposalDocument min_count 2` correctly supports the multi-doc boundary; `Task min_count 3` supports the 2-task cycle with margin; `TaskSessionLink min_count 1` supports the jump). But two dual-branch Outcomes assert behavior their fixtures cannot reach: step-4 `task-failure-diag-autosend` Output `"会话模式 = 任务容器对应模式（feature 容器 → 远征 / 突击提案直挂任务 → 突击）"` and step-5 success Output `"模式 = 容器对应模式：feature → 远征 / 突击提案 → 突击"` — verifying both routes requires both a Feature container and a blitz Proposal container (≥2 containers, ≥2 task sets); the fixtures provide neither/one anonymous Task set. −8.

## Phase 3 — Blindspot Hunt (`[blindspot]`, outside rubric dimensions)

1. **[blindspot] The cycle fixture cannot be constructed through the product's write path — seeding semantics unstated.** step-4 success fixture: `dependency_edges: "含环（结构违规子图——诊断失败确定性触发）"`. Fact M2_CYCLE_DETECTION: addTask runs incremental DFS cycle detection and rejects with `ERR_CYCLE_DETECTED` with "zero partial writes" — the only cycle-construction entry refuses to build this fixture. The journey flagged the *fixture semantics* as inferred, but neither journey nor contract states that the ring must be direct-seeded at the DB level (bypassing addTask). A downstream test generator told to "seed a feature with a dependency cycle" via product verbs will fail or silently substitute. The contract should carry an explicit seeding-path note (direct store seed), or switch the deterministic-violation fixture to a legally-constructible form (e.g. stale: blocked whose prerequisites are all satisfied — constructible via block-source + completing the source).
2. **[blindspot] Dual-branch Outputs are not parameterized for single-execution test generation.** Both `"会话模式 = 任务容器对应模式（feature 容器 → 远征 / 突击提案直挂任务 → 突击）"` (4c) and `"模式 = 容器对应模式：feature → 远征 / 突击提案 → 突击"` (5) assert two disjoint behavioral branches inside one Outcome with one fixture. A test run executes one branch; the contract neither splits the branches into separate Outcomes nor marks one as the fixture-realized branch and the other as uncovered. Risk: generated tests cover the convenient branch and the second route silently drops out of the suite. No rubric dimension scores within-Outcome branch coverage.
3. **[blindspot] Platform-side Session fixture fields have no declared seeding semantics.** step-3 `context-drift-proof` fixture: `field: "composition", value: "blitz（当前语境）"`; step-1 `draft-independence` / step-2 fixtures constrain `field: "draft"`. Sessions (and composer drafts) are dsh-platform state, not forge-DB rows — there is no stated mechanism by which a fixture realizes "a session whose composition is blitz" or "a session with an unsent prefilled draft" as *pre-state* (in-app this requires actually performing Step 1 first). Without a provisioning note (procedural pre-step or platform-store seed), the e2e harness must reinvent the chain, and a fresh-instance fixture could trivially "pass" 3b by never establishing the blitz context at all.

## Priority Fix List (for reviser)

1. **Add the container entity to all six task-hosting Outcomes** (4b, 4c, 5, 5b, 5c, 5d): `entity_type: Feature` (or `Proposal` with `mode: blitz` where the blitz route is under test) + `relationship_type: belongs_to` / `parent_entity` on the Task, and state the container-pill selection in Preconditions or Input (e.g. "容器 pill 选中该 feature 容器"). This alone moves the dimension above threshold.
2. **Split or parameterize the dual-branch mode-routing assertions** in 4c and step-5 success: either separate Outcomes per container kind (feature-容器 branch + 突击提案 branch, each with its own fixture), or pin the fixture-realized branch and explicitly scope the other.
3. **Restore the dropped `source: inferred` marker** on step-4 `task-failure-diag-autosend` (journey Step 4c marks the 按钮常驻/重开通道 clause inferred); ideally also annotate the journey-Setup-derived cycle-fixture semantics in step-4 success.
4. **Add fact_id traceability** for factual claims — M3_FORMAT_PREFILL / M3_DISPATCH_COMMAND_TEMPLATE / M3_TERMINAL_TASK_SET / M3_DISPATCH_BUTTON_RULES / M3_SESSION_LINKS_SOURCE / M3_VALIDATE_FIVE_CHECKS / M3_PROPOSAL_MODE_LINEAGE / M3_PRESET_REGISTRY_DEFAULT / M3_AUTOSEND_EXCEPTIONS are the natural anchors (or mark UNKNOWN).
5. **Scrub internal names from dimension values**: replace `agentPreset.select` / `registry` (State values), `task_session_links/claim 记录` (5c), `dispatchTask…contextSlug` (5 success Output), `validateFeatureTasks` (4e Output rationale) with behavioral phrasing ("会话预设写入为突击模式", "按该任务最新派发挂接记录", etc.), or confine them to reasoning comments.
6. Minor: step-1 `multi-doc-prefill-boundary` `Side-effect: "none"` should be `"会话编排创建动作"` to match its siblings; step-5 `no-single-task-execution-entry` Preconditions should drop the procedural "仅核查…不触发" instruction into Input; pin the multi-doc proposal's mode (or its distinctness from the blitz proposal) to sharpen 1 vs 1c exclusivity; state the seeding path for the Session `draft`/`composition` fixture fields and for the dependency-cycle fixture.
