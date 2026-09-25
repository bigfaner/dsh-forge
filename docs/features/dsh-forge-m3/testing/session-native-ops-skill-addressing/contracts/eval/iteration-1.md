# Eval-Contract Report: session-native-ops-skill-addressing (iteration 1)

**Final Score**: 919/1100 (target: 935)
**Iterations Used**: 1/3
**Outcome**: Target NOT reached — FAIL (total 919 < 935 AND Fixture Specification 0 < 60 threshold)

**Scope**: 4 Contract files scored (`step-1-session-task-query.md`, `step-2-session-task-claim.md`, `step-3-session-task-submit.md`, `step-4-skill-flat-addressing.md`). Surface = web; handbook = `docs/features/dsh-forge-m3/design/page-map.md` (exists).

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 919/1100 | — |

### Phase 1 — Reasoning Audit (pre-score anchors)

Traced the chain journey → contracts → code. Independent verification performed against the codebase (not just the Fact Table):

- **Verified TRUE in code** (all error-code and behavior claims): `ERR_TASK_STATE_INVALID` with Go message passthrough (`apps/desktop/src/main/workbench/tasks/task-service.ts:122-124`), `ERR_TASK_DEPS_UNSATISFIED` with unmet verbatim list (`task-service.ts:127-133`), `ERR_TASK_NOT_AUTHORITATIVE` with CLI hint (`task-service.ts:222-233`; FT-059), `ERR_TASK_KEY_INVALID` tool-side gate `requireTaskKey` (`packages/plugins/forge-workbench/src/host/forge-tools/task-tools.ts:74-79,114-117`), actor fail-closed throw (`task-tools.ts:55-66`; FT-060), `ERR_TOOL_BRIDGE_UNAVAILABLE` throw-after-retry (`bridge-core.ts:71`; `task-tools.ts:104-108`; FT-089), `ERR_SKILL_DIR_SYNC` non-silent alert + drift repair + byte-preserving user entries (`packages/plugins/forge-workbench/src/host/skill-dirs/sync.ts`; FT-090), claim deps dialect pending+unmet→rejected (`task-service.ts:378-401`), task_updated direct emit after writes (`task-service.ts:212-219,304,399`; FT-093), 15 skill dirs on disk match the contract list exactly, 20 deferred skills incl. `eval-*` confirmed (`design/skills-migration-manifest.md:11,104-127`).
- **Pre-score anchor A1 (test feasibility)**: `taskSubmit` does NOT write the execution record — `recordPath` is "接受不落库 —— 记录 .md 由 agent 会话经文档根写入" (`task-service.ts:410-415`); records are read from the doc tree at `records/<stem>.md` with missing-file = empty non-error state (`task-service.ts:187-193`). Step-3 success asserts record renderability but declares no record fixture and no input step that writes it — the assertion cannot pass with the declared fixture.
- **Pre-score anchor A2**: Step-4 success asserts "项目仓零新增文件(harness 级断言)" — a negative assertion over the registered project's repository — while its `fixture_spec.entities` declares only `SkillDirectory` + `PluginSkillRoot`, no `Project`.
- **Pre-score anchor A3**: Step-4 deferred-skill-absent asserts behavior of an EXTERNAL system ("外部会话(冻结 CC 提件)继续可用该技能") that the app's web test channel cannot drive or observe.
- **Pre-score anchor A4 (invariant scope tension)**: journey invariant "已注册项目会话内任务操作唯一通道 = dsh tool(零 CLI 依赖…)" is reproduced unqualified in all four Contracts, while step-2's (correct, FT-059-grounded) `not-authoritative-rejected` outcome demonstrates a registered-but-unmigrated project where the sanctioned write channel is the forge CLI. The invariant needs the migrated-project qualifier.

### Dimension Breakdown

#### 1. Completeness — 142/150 (threshold 90, PASS)
- **Four mandatory dimensions per Outcome (50/50)**: all 14 Outcomes across 4 files carry non-empty Preconditions, Input, Output, State; Side-effect explicit everywhere; Invariants per-Outcome present.
- **Journey Invariants section (50/50)**: present with 4 entries in every file.
- **Happy path + surface-mandated derived scenarios (42/50)**: happy path in all 4 steps; `session-expired` analog explicitly mapped in step-1 (`<!-- surface-web required_outcomes 映射:session-expired → tool 通道不可用… -->`). Deduction: web-mandated `validation-error` is never explicitly mapped/considered — `task-key-invalid` covers it in substance (invalid input → clear error, no side effects) but carries no surface-mapping annotation, so a reader cannot tell the rule was applied. -8.

#### 2. Semantic Purity — 180/200 (threshold 120, PASS)
- **Natural language, no regex/selectors/framework assertions (78/80)**: no regex patterns, CSS/XPath selectors, or assertion calls anywhere. -2 for provenance chatter in Output values: "ERR_TASK_STATE_INVALID,Go 原码消息透传" (implementation lineage, not observable behavior phrasing).
- **Preconditions declarative (54/60)**: mostly declarative state descriptions. Deduction: step-2 success uses imperative setup phrasing — "备一个可执行任务(带执行 prompt,状态 pending,依赖满足)" ("prepare a task") instead of "任务存在且…"; also "审计日志通道可查" mixes channel readiness into entity preconditions. -6.
- **No implementation coupling (48/60)**: several values name internal mechanisms/tables: "纯读路由(sqlite → task 权威表)" (internal table name), "(前缀校验通过)" (guard mechanism), "经内核状态机合法边"/"(状态机 7 态约束外)" (kernel mechanism — arguably the system under test, but phrased as internals). These describe *how* the kernel is organized rather than *what* the system produces. -12.

#### 3. Precondition Exclusivity — 146/150 (threshold 90, PASS)
- **Distinct Preconditions across Outcomes (60/60)**: within each step, outcomes sit on orthogonal axes (tool availability / session identity / task status / dependency state / data authority / taskKey form / skill-set membership / config drift). No two Outcomes share equivalent Preconditions.
- **Sufficient to uniquely select (46/50)**: fixtures disambiguate the one textual overlap: step-2 `illegal-transition-rejected` Precondition "目标任务当前状态不允许该操作(状态机 7 态约束外,如 completed 任务)" does not itself exclude a files-authority project, where the kernel's check order fires `ERR_TASK_NOT_AUTHORITATIVE` first (`task-service.ts:379` — authority check precedes task read). The `data_authority=sqlite` fixture constraint resolves it, but the Precondition text alone is ambiguous. -4.
- **Error/boundary triggers explicit (40/40)**: every non-happy outcome states its trigger (e.g., "dsh tool 暂不可用(宿主/插件面缺席)", "目标任务当前状态不允许该操作", "agent 调用携带非法任务地址(非 <featureSlug>/<localId> 看板限定地址形态)").

#### 4. Fact Alignment — 128/150 (threshold 90, PASS)
- **Factual claims traceable (48/60)**: all specific claims verified TRUE against code/facts (see Phase 1), so no false statements. But happy-path Outcomes assert concrete system behavior with zero in-document traceability: step-2 success "task_updated 事件直发" (FT-093), "updated_by 记 session 会话标识" (FT-060), step-1 success "forge_task_list/forge_task_query/forge_task_get 类只读工具" (FT-088), "零 bash spawn CLI" (FT-096) — none reference a fact_id. The inferred Outcomes carry reasoning comments; the success Outcomes carry nothing. -12.
- **Inferred claims carry rule support + `source: inferred` (40/50)**: `actor-missing-fail-closed` (FT-060 ✓), `not-authoritative-rejected` (FT-059 ✓), `task-key-invalid` (FT-088 ✓), `skill-dirs-sync-alert` (FT-090 ✓) are exemplary. Two deductions: (a) `tool-unavailable-degraded` — the surface-mandated session-expired analog — has the mapping comment but lacks the required literal `source: inferred` annotation; (b) `illegal-transition-rejected` / `deps-unsatisfied-rejected` present `source: inferred` citing the journey's inference, but embed concrete error codes (`ERR_TASK_STATE_INVALID`, `ERR_TASK_DEPS_UNSATISFIED`) that exist in no Fact Table fact — accurate (code-verified) yet unclassified as to origin (fact vs inference). -10. Observation, no deduction: `task-key-invalid` cites "FT-088(task-tools.ts:68-91,114-117)" while FT-088's own citation is `task-tools.ts:1-27;1-66`; the cited ranges match real code (verified) — keep citations synchronized with the Fact Table.
- **No hallucinated claims (40/40)**: every asserted code, message shape, and state transition was verified against source or FT facts; zero unclassified fabrications found.

#### 5. Surface Fitness — 83/100 (threshold 60, PASS)
- **Mandatory derived Outcomes present (28/40)**: `session-expired` → `tool-unavailable-degraded` explicitly mapped in step-1. `validation-error` never explicitly mapped anywhere despite being co-mandatory for Web (`surface-web.md`: "validation-error: User submits a form with invalid data… Assert: error message displayed… user can correct and retry"); `task-key-invalid` is its substantive twin but unlabeled, and no "correct and retry" continuation is specified. -12.
- **Surface-appropriate language (30/35)**: Inputs are user-action phrased; web-facing observables present (board backflow ≤5s, settings alert entries). But the dominant assertion vocabulary is tool-result-level ("结果以 canonical JSON 返回(ok 为真)") rather than session-view-level (what the user SEES in the conversation when degradation/audit results occur). The journey's test-channel note legitimizes this partially; the user-visible rendering of degraded tool calls is never asserted. -5. Also note `deferred-skill-absent` asserts "外部会话(冻结 CC 插件)继续可用该技能" — behavior of an external frozen plugin outside the app's browser surface, not assertable from this harness (no fixture, no channel).
- **TUI async timeout (25/25)**: N/A for web — full marks.

#### 6. Internal Consistency — 140/150 (threshold 90, PASS)
- **Invariants hold in every Contract (50/60)**: no outcome violates an invariant's letter (refusals produce no writes; degraded path is explicit). Deduction for scope tension: invariant "已注册项目会话内任务操作唯一通道 = dsh tool(零 CLI 依赖、零 bash spawn、零 forge: 前缀)" is stated without the migrated-project qualifier in all 4 files, while step-2 `not-authoritative-rejected` Output says "提示走 forge CLI 双形态纪律" for a registered (unmigrated) project — an in-scope registered project whose sanctioned channel is NOT dsh tool. The outcome is factually right (FT-059); the invariant text overstates. -10.
- **Cross-Contract state references consistent (50/50)**: step-3 "目标任务已被 agent 领取(in_progress)" correctly matches step-2 State "任务行 pending → in_progress"; "claim/submit 均已完成" matches step-2 success + step-3 success terminal states. No dangling references.
- **Preconditions achievable from preceding State (40/40)**: chain step-1 (read, any status) → step-2 (pending fixture per Setup) → step-3 (in_progress from step-2) → step-4 (standalone skills) is realizable; boundary fixtures (completed task, files project, drifted config) are fixture-constructible.

#### 7. Anchor Integrity — 100/100 (threshold 60, PASS)

Handbook `design/page-map.md` exists and defines the session page (`### 上游会话视图(existing,跳转目标)`, View Key `session`).

- **Anchor field completeness (40/40)**: all 4 Contracts carry `anchors.web.page` + `route` (+ `requires_auth`, `layout`). No missing fields.
- **Anchor values match handbook (30/30)**: `route: "session"` matches the handbook View Key exactly in all 4 files; `page: "上游会话视图(agent 会话)"` shares the handbook entry's core identifier. Observation (no deduction): the parenthetical qualifier differs from the handbook title "上游会话视图(existing,跳转目标)" — recommend copying the handbook title verbatim in regeneration.

**### Missing Anchor Fields**

| Contract File | Missing Field | Expected Value (from handbook) |
|---------------|---------------|-------------------------------|
| (none) | — | — |

**### Handbook Conflicts**

| Conflict Type | Entry A | Entry B | Description |
|---------------|---------|---------|-------------|
| (none) | — | — | Tab order 概览/提案/Feature/任务 consistent between header note, page sections, and FT-092 (`WORKBENCH_TABS`); view keys unique; no duplicate page/route definitions. |

- **Handbook internal consistency (30/30)**: no duplicate or conflicting page/route definitions found.

#### 8. Fixture Specification — 0/100 (threshold 60, **FAIL — entity-completeness veto triggered**)

- **Entity completeness (veto) — 0/40**: two Outcomes reference entity types in State that are absent from their own `fixture_spec.entities`:
  1. step-3 `success`: State asserts "执行记录(md 写_ONCE 形态)经记录渲染入内核可查" and Output asserts "执行记录可渲染(记录渲染入内核)", but the outcome's fixture declares only `Project` + `Task`. `ExecutionRecord` is declared as a fixture entity type in the sibling `audit-tri-consistency` outcome of the same file (proving the generator knows the type) — its omission here makes the assertion unfulfillable: per code, submit does not write records and a missing record file renders as an empty non-error state (`task-service.ts:187-193,410-415`), so a downstream agent executing this contract with the declared fixture would fail the Output assertion.
  2. step-4 `success`: State asserts "项目仓零新增文件(harness 级断言)" — a negative assertion over the registered project's repository — but the fixture declares only `SkillDirectory` + `PluginSkillRoot`; no `Project` entity anchors the repo under assertion.

  Per rubric: entity referenced in State missing from `fixture_spec.entities` → criterion scores 0 → entire dimension 0.
- **Relationship and constraint coverage (not scored — veto)**: for reference, declared relationships (`Task belongs_to Project`, `ExecutionRecord belongs_to Task`, `SkillDirectory belongs_to PluginSkillRoot`) are semantically correct.
- **Minimum data quantity (not scored — veto)**: for reference, `SkillDirectory min_count: 15` matches the mandatory set; step-2 `deps-unsatisfied-rejected` correctly declares the two-task fixture (pending + in_progress blocker). Minor under-declarations also present: step-2 success Precondition "带执行 prompt" has no corresponding fixture constraint (harmless — claim/submit never read the prompt); step-3 `task-key-invalid` asserts "任务行不变" without declaring any Task row to anchor the unchanged-assertion.

### Per-Dimension Threshold Table

| Dimension | Score | Threshold | Pass |
|-----------|-------|-----------|------|
| Completeness | 142/150 | 90 | PASS |
| Semantic Purity | 180/200 | 120 | PASS |
| Precondition Exclusivity | 146/150 | 90 | PASS |
| Fact Alignment | 128/150 | 90 | PASS |
| Surface Fitness | 83/100 | 60 | PASS |
| Internal Consistency | 140/150 | 90 | PASS |
| Anchor Integrity | 100/100 | 60 | PASS |
| Fixture Specification | 0/100 | 60 | **FAIL (veto)** |
| **Total** | **919/1100** | **935** | **FAIL** |

### Attack List

1. **[Fixture Specification]** entity-completeness veto: step-3 success asserts record renderability with no record fixture — "执行记录(md 写_ONCE 形态)经记录渲染入内核可查" — Add `ExecutionRecord` (belongs_to Task, record-file-at-doc-root constraint) to step-3 success `fixture_spec.entities`, or specify the agent-side record write in Input; note submit itself never writes records.
2. **[Fixture Specification]** step-4 success State references the project repo with no Project entity — "项目仓零新增文件(harness 级断言)" — Add `Project` (registered, with repo-root reference) to step-4 success fixture so the zero-new-files assertion has an anchored subject.
3. **[Surface Fitness]** web-mandated `validation-error` outcome never explicitly considered/mapped — "全部解析成功(无 forge: 前缀障碍)" / task-key-invalid carries no mapping annotation — Annotate `task-key-invalid` (or a new outcome) as the surface-web `validation-error` mapping with correct-and-retry continuation.
4. **[Fact Alignment]** surface-mandated derived outcome lacks `source: inferred` annotation — "tool-unavailable-degraded" has only "<!-- surface-web required_outcomes 映射:session-expired → … -->" — Add the literal `source: inferred` marker alongside the rule citation.
5. **[Fact Alignment]** happy-path Outcomes carry zero fact traceability — e.g., step-2 success "task_updated 事件直发" (FT-093), "updated_by 记 session 会话标识" (FT-060) — Reference fact_ids in success Outcomes as the inferred Outcomes already do.
6. **[Internal Consistency]** unqualified invariant vs not-authoritative outcome — "已注册项目会话内任务操作唯一通道 = dsh tool(零 CLI 依赖、零 bash spawn、零 forge: 前缀)" vs "写操作被拒并返回明确错误(ERR_TASK_NOT_AUTHORITATIVE,提示走 forge CLI 双形态纪律)" — Qualify the invariant (migrated/sqlite-authoritative projects) or scope the outcome's project as outside the invariant's steady-state.
7. **[Precondition Exclusivity]** illegal-transition Precondition text does not exclude files-authority projects where a different outcome fires first — "目标任务当前状态不允许该操作(状态机 7 态约束外,如 completed 任务)" — State `data_authority='sqlite'` in the Precondition text (fixture already does).
8. **[Semantic Purity]** implementation coupling in dimension values — "纯读路由(sqlite → task 权威表)", "ERR_TASK_STATE_INVALID,Go 原码消息透传", "(前缀校验通过)" — Describe observable behavior (read-only routing, error code + message content, install-prefix containment) without internal table/provenance/guard names.
9. **[Completeness]** imperative Precondition phrasing — "备一个可执行任务(带执行 prompt,状态 pending,依赖满足)" — Rewrite declaratively: task exists, status pending, deps terminal.
10. **[Surface Fitness]** external-system assertion not drivable from the web harness — "外部会话(冻结 CC 插件)继续可用该技能" — Either move this assertion to a harness-observable proxy (e.g., frozen-plugin availability check outside app channel) or mark its verification channel explicitly.
11. **[blindspot]** the "测试通道" (test channel) that every Input depends on is never specified — "用户在已注册项目的 agent 会话内指示 agent 查询任务状态与依赖(经测试通道驱动 dsh tool 只读调用集)" — Reasoning audit flagged this independently of dimension scoring: gen-test-scripts must invent the injection mechanism; define it once (drive surface, identity provisioning, call-recording) in the journey or contract frontmatter.
12. **[blindspot]** the observable for "skill resolution success" is undefined — "全部解析成功(无 forge: 前缀障碍)" — No contract states HOW a flat-name skill invocation's resolution is observed in the session view (assistant action surface? tool roster? harness record?); without a defined observable the 15-item assertion is untestable.

### What is already solid (for the reviser — do NOT churn these)
All error codes, state transitions, deps dialects, event pushes, skill-carriage semantics, and anchor values verified accurate against source and handbook; exclusivity structure is strong; inferred-outcome reasoning comments (FT-059/060/088/090) are the model to extend to success outcomes. The two fixture additions (attacks 1-2) plus annotations (3-4) are the highest-leverage fixes.
