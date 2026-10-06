# Contract Evaluation Report — task-overview-review / Iteration 1

- **Eval type**: contract | **Surface**: web | **Iteration**: 1
- **Target directory**: `docs/features/dsh-forge-m2-pipeline/testing/task-overview-review/contracts/`
- **Scorer stance**: adversarial, verification-first (every assertion treated as unverified until grounded)
- **Handbook**: `design/page-map.md` (present → Anchor Integrity scored normally)

## Documents Evaluated

| File | Outcomes |
|---|---|
| step-1-open-overview-tab.md | success, stress-500-first-screen-under-2s |
| step-2-select-feature-binding.md | success, ime-safe-bilingual-search |
| step-3-filter-by-status-chips.md | success, zero-count-chip-disabled |
| step-4-switch-three-views.md | success, sort-toggle-reorders-all |
| step-5-manual-transition.md | success, reason-required-empty-reject, illegal-target-not-offered, terminal-transition-triggers-restore |
| step-6-open-task-detail-drawer.md | success, eval-type-conditional-section-empty-note |

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Journey decomposition is faithful.** All 6 happy-path steps and all 6 journey edge cases (1b/2b/3b/4b/5b/5c) map to Contract Outcomes; two additional derived Outcomes (terminal-transition-triggers-restore, eval-type-conditional-section-empty-note) are annotated `source: inferred` with reasoning comments.
2. **Pre-score anchor A**: Step 5 `success` State explicitly subsumes the restore case ("若目标态 ∈ {completed, skipped} 且存在满足恢复条件的 blocked 后继则恢复钩子触发"), while `terminal-transition-triggers-restore` is the same scenario specialized — precondition containment, potential Outcome-selection ambiguity.
3. **Pre-score anchor B**: Step 5 and Step 6 fixture_specs omit the `Feature` entity although `tasks.feature_id TEXT NOT NULL REFERENCES features(id)` (schema.sql:84) makes Feature mandatory for any Task fixture, and Step 5 success State explicitly mutates features ("features 相位重算") and task_records ("task_records 新增 transition 行") without declaring either entity.
4. **Pre-score anchor C**: `illegal-target-not-offered` Output asserts the illegal target is not clickable ("用户点不到非法目标") while its Input says "尝试提交转移（目标 = 当前态，或不合法目标）" — an action the web surface cannot perform as described.
5. **Pre-score anchor D**: the bottom `## Fixture Specification` YAML blocks are lossy summaries that drop field_constraints and sibling Outcomes' requirements (details under Internal Consistency).

All factual claims spot-checked against the Fact Table and design docs: `idx_tasks_feature_status` exists (schema.sql:90); dialog copy 「原因必填——填写后重试」 matches M2_TRANSITION_DIALOG_GATING verbatim; sort semantics match M2_SEARCH_SORT; three-views match M2_THREE_VIEWS; zero-count chip matches M2_STATUS_CHIPS_ZERO_DISABLED; restore-hook behavior matches M2_RESTORE_HOOK. **No hallucinated claims found.**

---

## Phase 2 — Rubric Scoring

### 1. Completeness (完整性) — 150/150

- **Four mandatory dimensions per Outcome (50/50)**: every Outcome in all 6 files carries non-empty Preconditions, Input, Output, State; Side-effect present throughout ("Side-effect: none" where applicable). No missing mandatory dimension.
- **Journey Invariants section (50/50)**: all 6 files carry `## Journey Invariants` with the 5 journey invariants verbatim.
- **Happy path + surface-mandated derived scenarios (50/50)**: web `validation-error` is materialized where a form exists (step 5 `reason-required-empty-reject`, explicitly tagged `<!-- surface-required: web validation-error（表单提交步骤必派生——转移对话框 reason 表单） -->`); `session-expired` is adjudicated N/A with a stated reason in every file ("session-expired N/A — 本地单人工作台无服务端会话凭据") — consistent with page-map "Route Guard Configuration: 不适用". Beyond the journey edges, two extra boundary Outcomes (restore-hook, eval-type empty state) are added. Coverage is complete.

### 2. Semantic Purity (语义纯度) — 178/200

- **Natural language, not code/regex (74/80)**: no regex patterns, XPath, or framework assertion calls anywhere. One CSS class name leaks into an Output value: step 3 "chip disabled（禁用淡化，is-zero 样式）" — `is-zero` is a CSS class (M2_STATUS_CHIPS_ZERO_DISABLED: "is-zero class"), i.e. implementation styling vocabulary in a behavior description. −6.
- **Preconditions declarative (56/60)**: preconditions are predominantly declarative state descriptions. Two operator-intent phrasings read as action/procedure rather than state: step 5 terminal "操作者将 T 人工转移到 completed 或 skipped" and step 5 success "操作者备有原因文本". −4.
- **No implementation coupling (48/60)**: dimension values repeatedly embed internal identifiers:
  - step 1 stress State: "EQP 索引命中：idx_tasks_feature_status" (DB index name);
  - step 2 State: "服务端 core 过滤：tasks.list search 参数" (verb + parameter);
  - step 5 success State: "tasks.task_status = 目标态；task_records 新增 transition 行（verb='transition'，actor='ui'，reason 落审计列）" (table/column assignment expression);
  - step 5 State/Output: "ERR_REASON_REQUIRED 兜底", "ERR_INVALID_TRANSITION 兜底" (error-code constants — partially defensible as the product's in-band RPC contract, but still internal identifiers);
  - step 6 State: "打开 + 数据水化：files_json / commit 只读 git 查找 / refs 水化 / allowedTransitions" (`files_json` is a column name).
  These describe *how/where* rather than *what the system produces*. −12. (Note: `allowedTransitions` and `autoRestore` are treated as the journey's own declared vocabulary — the journey invariant itself names them — and are not deducted.)

### 3. Precondition Exclusivity (前置条件互斥性) — 130/150

- **Distinct Preconditions across Outcomes**: no two Outcomes share identical or semantically equivalent Preconditions; each edge Outcome adds a distinguishing condition (500-task dataset, CJK-mixed data, zero-count status, multi-status/multi-timestamp set, empty reason, from=to target, blocked successor, eval type).
- **One ambiguous pair (−20, per deduction rule)**: in step 5, `terminal-transition-triggers-restore` Preconditions ("目标任务 T 有 blocked 后继 W…；操作者将 T 人工转移到 completed 或 skipped；reason 已填") are a strict subset of `success` Preconditions ("目标态在允许集内且 from 不等于 to；操作者备有原因文本" — completed/skipped ∈ human allowed set per M2_TRANSITION_TARGETS_HUMAN). When W exists and target=completed, **both** Outcomes are simultaneously applicable; the success State even handles the restore case itself. The documents never state a specificity/precedence rule for Outcome selection.
- **Error/boundary triggers explicit (40/40)**: every boundary Outcome states its triggering condition concretely ("当前 feature 下某状态任务计数为 0", "转移对话框中 reason 留空；目标态已选定", "所选目标态与当前态相同，或不在状态机允许集", …).

### 4. Fact Alignment (事实依据) — 134/150

- **Factual claims traceable (48/60)**: all spot-checked claims verify TRUE against the Fact Table (copy, sort order, chip behavior, restore semantics, drawer sections, anchor names) — zero hallucinations. However, no non-inferred Outcome references a `fact_id`; traceability runs only through `sources: journey.md`. The two inferred Outcomes are the only ones carrying explicit Fact Table citations. A downstream auditor must re-derive the mapping (M2_THREE_VIEWS, M2_SEARCH_SORT, M2_STATUS_CHIPS_ZERO_DISABLED, M2_TRANSITION_DIALOG_GATING, M2_TRANSITION_TARGETS_HUMAN, M2_RESTORE_HOOK) that the document should have stated. −12.
- **Inferred claims annotated (46/50)**: both derived Outcomes carry `<!-- source: inferred -->` plus a reasoning comment citing facts with file:line — good. Two gaps: (a) the rule-mandated derived Outcome (`reason-required-empty-reject`) cites the surface rule (`surface-required: web validation-error`) but lacks the `source: inferred` tag; (b) the two `source: inferred` Outcomes cite facts rather than a `required_outcomes` rule — acceptable since they are fact-derived, not rule-derived, but the annotation scheme is inconsistent across the set. −4.
- **No hallucinated unclassified claims (40/40)**: none found; `idx_tasks_feature_status` verified present at schema.sql:90.

### 5. Surface Fitness (Surface 适配) — 85/100

- **Mandatory web derived Outcomes (40/40)**: `validation-error` present (step 5); `session-expired` adjudicated N/A with surface-consistent justification in all 6 files. Loading/network-error outcomes are optional under surface-web.md and their absence is not penalized.
- **Surface-appropriate, executable interaction language (20/35)**: the documents use proper web vocabulary (点击 chip/pill、抽屉滑入、对话框留场、三视图切换), but two Outcomes are not executable by a web E2E agent as written:
  1. step 5 `illegal-target-not-offered` — Output asserts "用户点不到非法目标：选项集 = allowedTransitions 机械排除当前态" while Input demands "尝试提交转移（目标 = 当前态，或不合法目标）". If the option is not offered, the browser cannot click it; the only executable residue is "assert option absent". Testing the submit-rejection path requires bypassing the UI (direct RPC `forge:tasks/transition` or DOM forging), which the Contract never states. −10.
  2. step 2 `ime-safe-bilingual-search` — Output asserts "切换子 tab 自动清空搜索", an effect of a sub-tab switch action that the Input ("在搜索栏输入关键词…") never performs. The test script cannot know it must click another sub-tab mid-scenario. −5.
- **TUI timeout criterion (25/25)**: non-TUI surface — full marks.

### 6. Internal Consistency (一致性) — 135/150

- **Invariants hold in every Contract (60/60)**: read-direct discipline upheld in steps 1–4/6 ("库无变更（数据直读）"); step 5 writes only through the sanctioned single gate ("与 agent 写入同门（core 动词 API 单门）", "verb='transition'，actor='ui'"); chips/sort uniformity (steps 3–4), allowed-set所见即所得 (step 5), ≤2s@500 (step 1 stress) all reasserted. No invariant is violated.
- **Cross-Contract references (35/50)**: step-chain references are sound (step 3 "feature 绑定已选定" ← step 2; step 4 "feature 绑定与（可选）chips 过滤已设定" ← steps 2–3; step 5's drawer/⋯ menu entries match page-map). **However**, the bottom `## Fixture Specification` YAML block in each file is a lossy, sometimes divergent summary of the inline fixture_specs:
  - step 1 bottom block drops the success constraint `taskStatus: 覆盖多个不同状态（多态）` present inline;
  - step 3 bottom block drops `taskStatus: in_progress`;
  - step 4 bottom block mirrors only the success variant (2 tasks) and ignores `sort-toggle-reorders-all`'s `min_count: 3` + status/timestamp constraints;
  - step 5 bottom block shows `Task min 2 + TaskEdge 1` — the terminal variant's shape, not the success variant's (`Task min 1`, no edge) — and omits Feature/TaskRecord that the success State writes;
  - step 6 keeps constraints (the only faithful one).
  A downstream agent consuming the summary block alone under-provisions the fixture for at least 4 of 6 files. −15.
- **Preconditions achievable from preceding States (40/40)**: steps 1–4 are read/navigation-only; step 5's write is orthogonal to step 6's read preconditions; no sequencing contradiction.

### 7. Anchor Integrity (锚点完整性) — 100/100

Handbook `design/page-map.md` exists → scored normally. Required field for web = `page`.

#### Missing Anchor Fields

| Contract | Required field | Status |
|---|---|---|
| step-1 … step-6 | `page` | present in all (inside `anchors.web`) |

None missing. Extra fields (`route`, `requires_auth`, `layout`) are informative and consistent.

#### Handbook Conflicts

None. Verification detail:

| Contract | anchors.web.page | Handbook entry | Match |
|---|---|---|---|
| step-1 | 右栏「项目概览」tab（dswf-overview） | 右栏「项目概览」tab (`dswf-overview`, singleton replaceTab) | ✓ (route `dswf-overview` and layout `sidebar.right.pane.tab` + guide-entry-first both match) |
| step-2/3/4 | …任务子 tab（七态 chips / 三视图） | same entry, 任务子 tab structure | ✓ |
| step-5 | 转移状态对话框（任务详情抽屉 / ⋯ 菜单发起） | 转移状态对话框（模态 官方 Modal；入口 抽屉/⋯ 菜单） | ✓ |
| step-6 | 任务详情抽屉 | 任务详情抽屉（右侧滑入浮层 320–760px 可拖宽） | ✓ (layout incl. EntryDrawer/拖宽手柄 matches) |

Empty `route` for step-5/6 is correct — handbook declares "M2 无新路由" (modal/drawer, not pages). Handbook internal consistency: no duplicate/conflicting page definitions. Scoping note: handbook entries `dswf-doc`, `会话头挂接 pill 行`, `注册表单派生行` have no contracts in this journey — they belong to the document-browsing / task-session-linkage / workspace-registration journeys, so no per-journey coverage deduction applies.

### 8. Fixture Specification (前置数据声明) — 0/100 (VETO TRIGGERED)

- **Entity completeness (0/40 → dimension veto)**: `fixture_spec` is present in all Outcomes (newly generated — scored normally, no backward compatibility), and entity types (Project/Feature/Task/TaskEdge/TaskRecord) all correspond to design domain entities. **But step 5 references entities in its State changes that are absent from `fixture_spec.entities`**:
  1. success State: "task_records 新增 transition 行（verb='transition'，actor='ui'…）" — `TaskRecord` is created, not declared (entities: Project, Task only);
  2. success State: "features 相位重算" — `Feature` is mutated, not declared in any step-5 Outcome;
  3. schema constraint: `tasks.feature_id TEXT NOT NULL REFERENCES features(id)` (schema.sql:84) — no Task fixture can be constructed without a Feature parent, yet step 5 declares Task with `relationship_type: has_many, parent_entity: Project` and step 6 declares Task with no relationship at all. Steps 1–4 get this right (`Task belongs_to Feature`).
  Per the rubric's explicit rule ("Score 0 if any entity type referenced in the Contract's Preconditions, Input, or State changes is missing from fixture_spec.entities — this triggers the veto"), the dimension scores 0.
- **Relationship/constraint coverage (would be 25/35)**: steps 1–4 declare correct belongs_to chains; step 5's `Task has_many parent Project` misparents the Task→Feature FK edge (−10); step 6 omits Task's parent entirely (−10 in effect); creative `field_constraints` on `roles`/"coveredStatuses" are not real domain fields (labeling conventions masquerading as field constraints).
- **Minimum data quantity (would be 17/25)**: step 2 success declares "多态任务在场" in Preconditions but `Task min_count: 1` with no status constraint — 1 task cannot be polymorphic (−8); step 4's summary-block regression is counted under Internal Consistency.

### Cross-Dimension Coherence Check

- The Step-5 fixture hole manifests most clearly in Fixture Specification (veto) but is enabled by Semantic Purity leakage: because State is written as table-level mutations ("tasks.task_status = …", "task_records 新增…行"), the entity surface the Contract actually touches is visible yet was not reconciled with fixture_spec.
- The illegal-target executability gap (Surface Fitness) is inherited verbatim from journey edge 5c; the Contract had the opportunity (and the RPC-channel knowledge, per M2_RPC_CHANNEL_FAMILIES) to specify the bypass mechanism but did not.

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] Untestable primary path in illegal-target Outcome** — quote: "尝试提交转移（目标 = 当前态，或不合法目标）" combined with "用户点不到非法目标：选项集 = allowedTransitions 机械排除当前态" — the Contract must split this into (a) UI assertion "option absent from dialog" and (b) server-side rejection via an explicit bypass channel (e.g., direct `forge:tasks/transition` RPC), otherwise gen-test-scripts cannot generate a runnable web test for the submit-rejection half.
2. **[blindspot] Missing action for an asserted effect** — quote (step 2): "切换子 tab 自动清空搜索" — asserted in Output but no sub-tab-switch action exists in Input; the Outcome bundles two user actions while declaring only one.
3. **[blindspot] Summary Fixture Specification blocks are lossy/divergent** — quote (step 5 bottom block): entities list `Project / Task / TaskEdge` while the same file's success Outcome writes `task_records` rows and `features` 相位重算 — whichever block a downstream tool consumes, it provisions a different (and insufficient) dataset; the two representations inside one file are not reconciled.
4. **[blindspot] Fixture field_constraints use non-domain fields** — quotes: "field: 'roles'" (step 5 terminal) and "field: 'coveredStatuses'" (step 3 zero-count) — neither is a tasks-table column; they are scenario labels. A schema-driven fixture generator cannot map them; they should be expressed as per-entity field_constraints (e.g., W.taskStatus=blocked) or as named fixture roles outside the field_constraints schema.
5. **[blindspot] Outcome-selection precedence unstated** — quote: success Preconditions "目标态在允许集内且 from 不等于 to；操作者备有原因文本" vs terminal-transition Preconditions "操作者将 T 人工转移到 completed 或 skipped；reason 已填" — the set needs an explicit rule (most-specific-first, or disjoint fixtures) so the test generator does not double-fire success assertions against the restore fixture.
6. **[blindspot] No fact_id linkage on factual Outcomes** — quote (step 4 Output): "活跃优先：in_progress → blocked → pending → … → completed；最新创建：created_at 降序" — verifiably true (M2_SEARCH_SORT) but the Contract carries no fact reference; requiring per-Outcome fact citations (or a fact-mapping appendix) would make the traceability auditable without a scorer-side re-derivation.

---

## Score Summary

| Dimension | Score | Min | Status |
|---|---|---|---|
| 1. Completeness | 150/150 | 90 | PASS |
| 2. Semantic Purity | 178/200 | 120 | PASS |
| 3. Precondition Exclusivity | 130/150 | 90 | PASS |
| 4. Fact Alignment | 134/150 | 90 | PASS |
| 5. Surface Fitness | 85/100 | 60 | PASS |
| 6. Internal Consistency | 135/150 | 90 | PASS |
| 7. Anchor Integrity | 100/100 | 60 | PASS |
| 8. Fixture Specification | 0/100 | 60 | **FAIL (veto)** |
| **Total** | **912/1100** | 935 | **FAIL** |

**Verdict**: FAIL. Total 912 < 935 AND Fixture Specification 0 < 60 (entity-completeness veto).

**Revision priorities** (highest leverage first):
1. Fix the Fixture veto: add `Feature` (and `TaskRecord` where written) to step-5/6 fixture_specs; restore `Task belongs_to Feature`; correct step-5 Task→Project misparenting. (~+100 pts, unlocks threshold)
2. Make `illegal-target-not-offered` executable on the web surface (split UI-absence assertion from server-rejection bypass; name the bypass channel). (+~10)
3. Reconcile bottom Fixture Specification blocks with inline specs (carry constraints + union of per-Outcome requirements). (+~15)
4. Disambiguate success vs terminal-transition (precedence rule or disjoint precondition). (+~20)
5. Purge implementation identifiers from dimension values (idx_*, tasks.task_status, files_json, tasks.list params). (+~12)
6. Add fact_id citations / `source: inferred` to the rule-derived Outcome; extend the sub-tab-switch action into step-2 Input. (+~13)
