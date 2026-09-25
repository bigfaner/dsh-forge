# Eval-Contract Report: session-native-ops-skill-addressing (iteration 2)

**Final Score**: 1057/1100 (target: 935)
**Iterations Used**: 2/3
**Outcome**: Target reached — PASS (total 1057 ≥ 935 AND every dimension ≥ threshold)

**Scope**: 4 Contract files scored (`step-1-session-task-query.md`, `step-2-session-task-claim.md`, `step-3-session-task-submit.md`, `step-4-skill-flat-addressing.md`), 13 Outcomes total. Surface = web; handbook = `docs/features/dsh-forge-m3/design/page-map.md` (exists).

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 919/1100 | — |
| 2 | 1057/1100 | +138 |

### Revision Verification (iteration-1 attacks → current state)

All 12 iteration-1 attacks were addressed on the page: ExecutionRecord + record-write precondition added to step-3 success (attack 1); Project entity added to step-4 success (attack 2); `validation-error` mapping + correct-and-retry closure added to task-key-invalid (attack 3); `source: inferred` added to tool-unavailable-degraded (attack 4); FT citations added to all success Outcomes (attack 5); invariant qualified with sqlite/files authority split in all 4 files (attack 6); illegal-transition Precondition now carries the authority qualifier (attack 7); table-name/prefix-guard/Go-provenance phrasing removed (attack 8); imperative "备一个…" rewritten declarative (attack 9); external-session assertion re-scoped with an explicit verification-channel note (attack 10); test-channel definition header added to all 4 files (attack 11); skill-resolution observable defined (attack 12). Per HARD RULE, no points are awarded for the improvement itself — only the current on-page state is scored below.

### Phase 1 — Reasoning Audit (pre-score anchors)

Independent code verification (beyond the Fact Table):

- **Verified TRUE**: authority gate precedes state/deps checks in claim (`task-service.ts:379` `requireSqliteAuthority` first, then `requireTask`/`validateTransition`, then deps at :389-395) — confirms the not-authoritative outcome's precedence and exposes the deps-unsatisfied gap (A2); `ERR_TASK_STATE_INVALID` Go-message passthrough (`task-service.ts:122-124`), `ERR_TASK_DEPS_UNSATISFIED` unmet verbatim list with resolved-only filtering (`task-service.ts:127-133,391-393` — matches the "已解析 blocker" precondition dialect, FT-058), `ERR_TASK_KEY_INVALID` at tool face with kernel same-code double gate (`task-tools.ts:68-79,155-163`), `task_updated` direct emit with actor→source projection (`task-service.ts:212-219,399` — grounds the audit-tri outcome), submit role-only completion (`task-service.ts:412-415`, FT-057), submit does not persist records (`task-service.ts:410-415`), records missing = empty non-error (`task-service.ts:191-193`).
- **Pre-score anchor A1 (record-path dialect defect)**: the kernel resolves the record at `join(featuresRoot, dir + 'records/' + stem + '.md')` where `dir` is the task `desc_path`'s directory (`task-service.ts:184-193`) — i.e. `<featuresRoot>/<featureSlug>/tasks/records/<taskStem>.md`. Step-3's fixture constraint and Precondition say "项目文档根下 records/<taskStem>.md" / "写入项目文档根 records/ 位置" — anchoring `records/` directly at the project doc root, omitting the per-feature `tasks/` segment. A test writer following the constraint literally places the file where the kernel never looks; the miss is a silent empty-non-error state, so the "执行记录可渲染" assertion fails without any error surfacing (the exact vendor-closure failure class this project has been bitten by before).
- **Pre-score anchor A2**: deps-unsatisfied's Precondition text ("任务依赖未满足(已解析 blocker 未终态)") does not exclude files-authority projects, where `requireSqliteAuthority` rejects with `ERR_TASK_NOT_AUTHORITATIVE` before any dependency evaluation — the identical ambiguity iteration-1 deducted on illegal-transition, fixed there but not here.
- **Pre-score anchor A3**: audit-tri-consistency is now the only Outcome of 13 carrying zero provenance annotation (no fact citation, no `source:` marker).
- **Pre-score anchor A4**: sync-alert's Input invokes skills and its Output asserts skill addressability + user-entry preservation, while its fixture declares only `PluginSkillRoot`.
- **Pre-score anchor A5**: deferred-skill-absent declares `parent_entity: PluginSkillRoot` with no PluginSkillRoot entity entry in that fixture.
- **Pre-score anchor A6**: task-key-invalid's State covers only the error leg while its Output extends through the successful correct-and-retry.
- **Pre-score anchor A7 (minor)**: tool-unavailable's Precondition trigger ("宿主/插件面缺席") and its State's asserted code (`ERR_TOOL_BRIDGE_UNAVAILABLE` = bridge transport failure after retry, FT-089) name two mechanisms whose equivalence is inferred rather than stated; acceptable at outcome level.

SC satisfiability clustering: no mutual-exclusion or direction-clash pairs found. Outcome preconditions within each step sit on orthogonal axes (availability × identity × status × dependency-state × authority × key-form × skill-set-membership × config-drift); the step-1→2→3 state chain (read → pending→in_progress → in_progress→completed) is bidirectionally derivable.

### Dimension Breakdown

#### 1. Completeness — 150/150 (threshold 90, PASS)
- **Four mandatory dimensions per Outcome (50/50)**: all 13 Outcomes carry non-empty Preconditions, Input, Output, State; Side-effect explicit everywhere (including "none"); per-Outcome Invariants present.
- **Journey Invariants section (50/50)**: present with 4 entries in every file.
- **Happy path + surface-mandated derived scenarios (50/50)**: happy path in all 4 steps; web-mandated `session-expired` explicitly mapped in step-1 ("surface-web required_outcomes 映射:session-expired → tool 通道不可用映射为会话内明确降级提示…"), web-mandated `validation-error` explicitly mapped in step-3 ("validation-error → 本 outcome 即无效输入提交形态…agent 可更正后重试") with the correct-and-retry closure in the Output; all journey edge cases (1b/2b/2c/3b/4b) have corresponding Outcomes.

#### 2. Semantic Purity — 192/200 (threshold 120, PASS)
- **Natural language, no regex/selectors/framework assertions (78/80)**: no regex tokens, CSS/XPath selectors, or assertion calls in any dimension value. -2: step-4 success Output asserts directly on harness instrumentation as an assertion surface — "测试通道调用记录 15/15 成功" — an assertion-on-channel-records inside an Output value (the system-facing observable is present in the same sentence; the instrumentation reference belongs in the channel-definition annotation).
- **Preconditions declarative (60/60)**: all Preconditions are state descriptions; iteration-1's imperative "备一个可执行任务" is now "目标任务存在且可执行:状态 pending、依赖全部终态、附执行 prompt"; "经测试通道注入" parentheses are constructibility annotations, not setup commands.
- **No implementation coupling (54/60)**: -6 for residual internal-mechanism naming: "任务行 pending → in_progress(经内核状态机合法边)" (kernel mechanism parenthetical adds no observable content over "pending → in_progress"); "taskKey 白名单双闸防御(工具面 + 内核面)" (defense-in-depth architecture, not observable behavior); "执行记录(md 写_ONCE 形态)经记录渲染入内核可查" ("入内核" is internal phrasing; the observable is record queryability). Error-code + message-content descriptions (ERR_* codes, "ok 为假 + code") are treated as the tool face's output format — appropriate, like exit codes on CLI.

#### 3. Precondition Exclusivity — 146/150 (threshold 90, PASS)
- **Distinct Preconditions across Outcomes (60/60)**: within every step the Outcomes sit on orthogonal axes; no two share equivalent Preconditions.
- **Sufficient to uniquely select (46/50)**: -4 — step-2 deps-unsatisfied's Precondition "任务依赖未满足(已解析 blocker 未终态)" does not state sqlite authority, so a files-authority project with unmet deps matches both deps-unsatisfied and not-authoritative; code order (`task-service.ts:379` authority gate first) means not-authoritative fires, leaving deps-unsatisfied unselectable on that state. The sibling illegal-transition now carries the qualifier ("项目为 sqlite 权威(data_authority='sqlite';files 权威项目在状态判定前即被权威闸以 ERR_TASK_NOT_AUTHORITATIVE 拒绝…)") — deps-unsatisfied needs the same. The fixture's `data_authority: sqlite` constraint resolves it at fixture level only.
- **Error/boundary triggers explicit (40/40)**: every non-happy Outcome states its trigger (host absence, missing session identity, disallowed status, unmet resolved blocker, files authority, invalid key form, deferred-list membership, config drift).

#### 4. Fact Alignment — 144/150 (threshold 90, PASS)
- **Factual claims traceable (54/60)**: all success Outcomes now cite facts (step-1 FT-088+FT-096; step-2 FT-093+FT-060; step-3 FT-057+FT-093; step-4 FT-090); the two FT-external error codes carry honest provenance disclaimers ("错误码溯源:ERR_TASK_STATE_INVALID…准确但未入 Fact Table"). -6: audit-tri-consistency asserts concrete system behavior — "actor 标识、看板来源标记、执行记录三方一致,审计链完整可回查" — with zero fact reference or unverified marking; its grounding exists (FT-060 updated_by, FT-055 records rendering, FT-046/093 event source projection, code-verified `actorSourceOf`) but is uncited, making it the only unclassified Outcome in the set.
- **Inferred claims have rule support + source: inferred (50/50)**: tool-unavailable-degraded now carries `source: inferred` + FT-089 reasoning + the session-expired rule mapping; task-key-invalid carries `source: inferred` + FT-088 + the validation-error rule mapping with correct-and-retry; illegal-transition / deps-unsatisfied / not-authoritative / actor-missing / sync-alert all annotated with reasoning. deferred-skill-absent cites the prd-spec migration table (journey-inherited source, not a surface-rule derivation — outside criterion scope, noted as observation).
- **No hallucinated claims (40/40)**: every asserted code, message shape, transition, event push, and skill-carriage semantic verified against source or FT facts, including the revised record chain, the retry-closure feasibility (valid key + in_progress task → submit legal per FT-057), and skill-sync alert semantics (FT-090). The record-path imprecision (A1) is a constraint-precision defect scored under Fixture Specification; the traceability comment itself cites the correct lines.

#### 5. Surface Fitness — 96/100 (threshold 60, PASS)
- **Mandatory derived Outcomes present (40/40)**: `validation-error` (step-3 task-key-invalid, mapped + correct-and-retry closure) and `session-expired` (step-1 tool-unavailable-degraded, mapped) both explicitly present and substantive.
- **Surface-appropriate language (31/35)**: Inputs user-instruction phrased; web observables present (board backflow ≤5s, session-view skill results, settings alert, degradation notice). -4: (a) deferred-skill-absent's Input "用户观察会话行为并回看外部会话" performs an out-of-surface action with the harness re-scoping deferred to the Output's channel note — read alone, the Input is undriveable from the web harness; (b) skill-dirs-sync-alert asserts "告警条目入设置面" — a settings face with no page/entry in the web page-map, leaving the web harness without a defined location to observe the alert.
- **TUI async timeout (25/25)**: N/A for web — full marks.

#### 6. Internal Consistency — 147/150 (threshold 90, PASS)
- **Invariants hold in every Contract (60/60)**: the authority-qualified invariant ("已注册且已迁移(sqlite 权威)的项目…未迁移(files 权威)项目写被拒并引导走 forge CLI") now coheres with the not-authoritative outcome (FT-059); refusal outcomes produce no writes; actor-missing is a rejection, not an unattributed change; step-3's agent record write does not touch the project repo (M3 default doc root is out-of-repo per FT-095, and the zero-new-files invariant is scoped to skill carriage).
- **Cross-Contract state references consistent (50/50)**: step-3's "目标任务已被 agent 领取(in_progress)" matches step-2 success State "pending → in_progress"; audit-tri's "claim/submit 均已完成" matches both success terminal states; illegal-transition's cross-reference to not-authoritative-rejected matches code-verified check order.
- **Preconditions achievable from preceding States (37/40)**: the step chain is realizable and boundary fixtures are constructible. -3: task-key-invalid's State describes only the error leg ("零写入;任务行不变") while its Output extends through the successful correct-and-retry ("agent 更正为合法 <featureSlug>/<localId> 地址后重试,调用成功(更正-重试闭环)") — the post-retry state (task completed) is undescribed, leaving the Outcome's final state ambiguous against its own State field.

#### 7. Anchor Integrity — 100/100 (threshold 60, PASS)

Handbook `design/page-map.md` exists and defines the session page (`### 上游会话视图(existing,跳转目标)`, View Key `session`).

- **Anchor field completeness (40/40)**: all 4 Contracts carry `page` + `route` (+ `requires_auth`, `layout`); `last_anchor_sync` present.
- **Anchor values match handbook (30/30)**: `route: "session"` matches the handbook View Key exactly in all 4 files; `page: "上游会话视图(agent 会话)"` shares the handbook entry's core identifier. Observation (no deduction, consistent with iteration-1 scoring of identical content): the parenthetical qualifier differs from the handbook heading "上游会话视图(existing,跳转目标)" — copy the handbook title verbatim on regeneration.
- **Handbook internal consistency (30/30)**: no duplicate or conflicting page/view-key definitions; tab order and dialog/panel keys consistent.

#### 8. Fixture Specification — 82/100 (threshold 60, PASS)

- **Entity completeness (40/40, veto NOT triggered)**: every entity asserted in Preconditions/Input/State is now declared — step-3 success declares `ExecutionRecord` (belongs_to Task, recordFile constraint) and step-4 success declares `Project` (codeRoot constraint), closing both iteration-1 veto findings. Borderline case documented: skill-dirs-sync-alert's Input invokes skills ("应用 boot 后用户察看设置面告警条目并调用技能") and its Output asserts "技能照常可寻址" with no `SkillDirectory` entity. Judged NOT a veto: the declared `PluginSkillRoot` whose `configEntry` materially is the skill carriage, plus the product-managed ambient 15 directories, keep every assertion fulfillable with the declared fixture — the veto is reserved for fixtures that cannot satisfy the outcome's assertions (the rubric's stated purpose: test data sufficiency). The gap is scored as constraint-coverage below.
- **Relationship and constraint coverage (17/35)**: declared relationships (`Task belongs_to Project`, `ExecutionRecord belongs_to Task`, `SkillDirectory belongs_to PluginSkillRoot`) are semantically correct; deps-unsatisfied's two-task fixture correctly expresses the blocker via the target's field constraint. Three deductions: (a) -8 the recordFile constraint misplaces the record file — "项目文档根下 records/<taskStem>.md" vs the kernel's actual resolution `<featuresRoot>/<featureSlug>/tasks/records/<stem>.md` (dir = desc_path directory, `task-service.ts:184-193`); literal placement yields a silent empty-non-error record state and an unfulfillable "执行记录可渲染" assertion; (b) -7 skill-dirs-sync-alert asserts skill addressability and user-entry preservation ("技能照常可寻址…用户自有目录条目字节级保留") while declaring neither a `SkillDirectory` presence anchor nor a user-owned config entry to preserve; (c) -3 deferred-skill-absent's `parent_entity: PluginSkillRoot` dangles — the parent entity has no entry in that fixture's entities.
- **Minimum data quantity (25/25)**: `SkillDirectory min_count: 15` suffices for the 15-item enumeration; deps fixture's two Task rows (min 1 each) suffice for the blocker scenario; all single-entity outcomes min 1.

### Per-Dimension Threshold Table

| Dimension | Score | Threshold | Pass |
|-----------|-------|-----------|------|
| Completeness | 150/150 | 90 | PASS |
| Semantic Purity | 192/200 | 120 | PASS |
| Precondition Exclusivity | 146/150 | 90 | PASS |
| Fact Alignment | 144/150 | 90 | PASS |
| Surface Fitness | 96/100 | 60 | PASS |
| Internal Consistency | 147/150 | 90 | PASS |
| Anchor Integrity | 100/100 | 60 | PASS |
| Fixture Specification | 82/100 | 60 | PASS |
| **Total** | **1057/1100** | **935** | **PASS** |

### Attack List

1. **[Fixture Specification]** record-path constraint misplaces the fixture datum — "recordFile: 项目文档根下 records/<taskStem>.md(agent 会话写入,写_ONCE 形态)" — kernel resolves `<featuresRoot>/<featureSlug>/tasks/records/<stem>.md` (desc-path-relative, `task-service.ts:184-193`); a literal write to doc-root `records/` silently yields the empty non-error state and fails "执行记录可渲染". Specify the desc-path-relative dialect exactly.
2. **[Precondition Exclusivity]** deps-unsatisfied Precondition does not exclude files-authority projects where not-authoritative fires first — "任务依赖未满足(已解析 blocker 未终态)" — add the `data_authority='sqlite'` qualifier (with the cross-reference to not-authoritative-rejected), mirroring the sibling illegal-transition fix.
3. **[Fact Alignment]** audit-tri-consistency carries zero provenance — "actor 标识、看板来源标记、执行记录三方一致,审计链完整可回查" — cite FT-060/FT-055/FT-046|FT-093 (updated_by, records rendering, event source projection) or mark unverified, as every sibling Outcome now does.
4. **[Fixture Specification]** sync-alert asserts two anchors its fixture does not declare — "可管理漂移被自动重写恢复(技能照常可寻址)…用户自有目录条目字节级保留" — declare SkillDirectory presence (addressability subject) and a user-owned config entry (preservation subject) in the fixture.
5. **[Fixture Specification]** dangling parent entity — deferred-skill-absent declares "parent_entity: PluginSkillRoot" with no PluginSkillRoot entry in its entities — add the parent entity row (as step-4 success already does).
6. **[Surface Fitness]** settings-face observable has no location in the web handbook — "告警条目入设置面" — name where the alert renders (page-map defines no settings page) or anchor the observable to a defined surface.
7. **[Surface Fitness]** deferred Input performs an out-of-surface action before its qualifier — "用户观察会话行为并回看外部会话" — scope the Input to the harness-drivable leg; keep the external leg only where the channel note defines it.
8. **[Internal Consistency]** task-key-invalid State covers only the error phase while Output extends through successful retry — "State: 零写入;任务行不变" vs "agent 更正为合法 <featureSlug>/<localId> 地址后重试,调用成功" — describe the post-retry state (task completed) or scope the State field to the error leg explicitly.
9. **[Semantic Purity]** residual kernel-mechanism parentheticals — "任务行 pending → in_progress(经内核状态机合法边)" / "taskKey 白名单双闸防御(工具面 + 内核面)" — state the observable transition/behavior without naming internal mechanisms or defense layers.
10. **[Semantic Purity]** Output asserts on harness instrumentation — "测试通道调用记录 15/15 成功" — keep the system-facing observable (session-view results) as the Output; move the channel-record assertion into the channel-definition annotation.
11. **[blindspot]** board-backflow observation leg missing from the test-channel definition — step-2 Output "任务状态回流看板 ≤5s" while the channel definition covers only ①驱动面/②身份供给/③调用记录/④边界注入 — define how the ≤5s backflow is observed (workbench board view open vs `dsh-forge:workbench-events` subscription) so gen-test-scripts does not invent it; reasoning audit flagged this independently of dimension scoring.
12. **[blindspot]** skill "invocation" mechanics undefined — "harness 在 exec 上下文中直接调用 dsh model-facing tool 调用集与技能(与 agent 会话调用同面)" — tools are callable functions; skills are model-consumed artifacts with no defined harness drive/resolution mechanism (registry roster check? prompt-triggered resolution? host-side record?); without it the 15/15 resolution drive step risks being unexecutable — reasoning audit flagged this independently of dimension scoring.
13. **[blindspot]** the authority-qualified invariant exists only in the Contracts; journey.md still carries the unqualified form — contract: "已注册且已迁移(sqlite 权威)的项目,会话内任务操作唯一通道 = dsh tool…" vs journey invariant "已注册项目会话内任务操作唯一通道 = dsh tool(零 CLI 依赖、零 bash spawn、零 forge: 前缀)" — sync the journey invariant (source document) so the next /gen-contracts regeneration does not regress the iteration-1 fix.

### What is already solid (for the reviser — do NOT churn these)

All error codes, check order, deps dialects, event pushes, actor semantics, and skill-carriage claims verified accurate against source; both surface-mandated mappings present with the retry closure; success-outcome FT citations and the 错误码溯源 disclaimers are exemplary annotation discipline; the test-channel definition header resolves the iteration-1 executability blindspots for the tool face; anchor values match the handbook. Highest-leverage remaining fixes: attacks 1-3 (record path, deps authority qualifier, audit-tri provenance).
