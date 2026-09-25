# Contract Eval Report — iteration 1

- **Journey**: task-dispatch-execution-loop
- **Scope**: all 7 step-*.md contracts in `docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/contracts/`
- **Surface**: web (anchor handbook: `docs/features/dsh-forge-m3/design/page-map.md`)
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Date**: 2026-09-25
- **Total**: **950 / 1100** — PASS (target ≥935; all dimensions above min threshold)

| Dimension | Score | Min | Verdict |
|---|---|---|---|
| 1. Completeness | 150/150 | 90 | PASS |
| 2. Semantic Purity | 176/200 | 120 | PASS |
| 3. Precondition Exclusivity | 122/150 | 90 | PASS |
| 4. Fact Alignment | 109/150 | 90 | PASS |
| 5. Surface Fitness | 94/100 | 60 | PASS |
| 6. Internal Consistency | 130/150 | 90 | PASS |
| 7. Anchor Integrity | 95/100 | 60 | PASS |
| 8. Fixture Specification | 74/100 | 60 | PASS (veto triggered on step-5, prorated) |
| **Total** | **950/1100** | **935** | **PASS** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

Trace: journey (7 happy steps + 8 edges) → 7 contracts, 20 outcomes. Mapping is complete and faithful: step-1 covers Step 1 + edges 1b/1c; step-2 covers Step 2 + edge 2b + the acknowledge leg; step-3 adds two inferred boundary outcomes; step-4 covers Step 4 + edge 4b; step-5 covers Step 5 + edges 5b/5c + inferred already-decided; step-6 adds inferred bridge degradation; step-7 covers Step 7 + edges 7b/7c. The solution (contract set) does address the journey, not an easier substitute.

Independent anchors found before rubric scoring:

1. **Step-2 happy-path fixture is self-infeasible.** FT-083 pins a *cumulative* expectation matrix: the in-progress row requires "≥1 dispatched (in_progress|completed) task with non-empty md description". The `artifacts-complete` fixture declares `Feature.status: "in-progress"` with only `Task.status: "pending"` (min_count 1) and one StageAsset — under FT-083 this fixture *cannot* satisfy its own precondition ("产物齐全…全满足"); it would land in `artifacts-missing-warning` instead. Either the stage should be `tasks` (first-dispatch stage) or a previously dispatched task must be declared. This is the strongest pre-score anchor and is scored under Fixture Specification / Internal Consistency.
2. **Step-5 recovery narrative has a mechanism gap.** Outcome `channel-unavailable` claims "受影响派发行进入 failed 态并记录原因(启动/终局回调路径)" for dispatches that are *running/awaiting* when the host channel dies. Per FT-073 all failed-transitions arrive via host callbacks (notifyLaunchFailed / notifyDispatchEnded) — the very transport that is down. No watchdog fact exists. The claim is ungrounded for mid-flight rows (it is valid only for the `starting` leg). Scored under Fact Alignment; raised again as a blindspot.
3. **"可派发阶段" is never pinned to the stage vocabulary.** Step-1 preconditions require "所属 feature 处于可派发阶段" without saying which stage that is; step-2 fixtures then pin `in-progress` (artifacts-complete) and `tasks` (artifacts-missing) with no stated basis. A downstream test author cannot determine the happy-path stage. Raised as a blindspot.
4. SC/In Scope deep-dive (outcome-level bidirectional derivation): the only confirmed intra-cluster contradiction is anchor #1 above (fixture constraints ↔ outcome assertion within step-2 `artifacts-complete`). No mutual-exclusion pairs found among outcomes; step outcome families are pairwise derivable-compatible.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 150/150

- **Four mandatory dimensions per Outcome (50/50)**: all 20 outcomes across 7 files carry non-empty Preconditions, Input, Output, State; every outcome also carries explicit Side-effect ("none" where applicable) and most carry per-outcome Invariants. Verified file-by-file; zero gaps.
- **Journey Invariants section (50/50)**: all 7 contracts contain `## Journey Invariants` with the full 6-entry journey invariant set verbatim (e.g., step-1: "看板对人无任务状态写入口…人的写操作仅限编排发起(派发/审批/重派发)").
- **Happy path + required derived scenarios (50/50)**: all 7 happy steps covered; all 8 journey edge cases ported; Web mandatory derived outcomes both present with explicit mapping comments — step-1 `deps-unmet-selection-blocked`: "surface-web required_outcomes 映射:validation-error → …多选校验失败…的阻止 + 依赖关系提示"; step-5 `channel-unavailable`: "session-expired → 宿主不可用/凭据失效使会话通道不可用…". Additional boundary outcomes (already-decided, type-not-dispatchable, launch-failed, bridge-degraded) exceed the mandate.

### 2. Semantic Purity — 176/200

- **Natural language, not code/regex (72/80)**: no regex, CSS/XPath selectors, or framework assertion calls anywhere. Deductions for type/field names leaking into dimension values: step-2 Output "(MissingItem 逐项:阶段/规则/产物/原因)" and State "检查结果 satisfied 为真" (internal result-shape vocabulary — verified real in `artifacts-check.ts:305` but still implementation nouns); step-4 State "prompt_hash = 组合首条消息 sha256(测试通道可对拍核验)".
- **Preconditions declarative (56/60)**: overwhelmingly declarative state descriptions ("已注册且完成 SoT 迁移的 fixture 项目处于激活态;…看板上存在至少 3 个依赖满足…的任务"). Minor leaks: step-2 acknowledged-continue "用户已在警告对话框显式确认继续(acknowledgeMissing 表达)" embeds the kernel flag name; step-1 deps-unmet "其余前置同 success" relies on cross-outcome incorporation instead of restating the state.
- **No implementation coupling (48/60)**: recurring kernel-column mechanics inside dimension values: step-5 State "approval_request 行 pending → approved,decided_by/decided_at 记录人侧审计"; step-3 Side-effect "(create 为 caller-minted 幂等 adopt)+ 注入组合首条消息(queue 模式逐字符交付)" (host API param `mode:'queue'`); heaviest: step-4 Input/Output/Preconditions mix test-harness instructions into the user-facing dimensions — "并经测试通道断言 subagent 系统提示词", "测试通道可直读注入记录/宿主侧产物(浏览器面不自测提示词内容)". These are meta-instructions to the test author, not system behavior descriptions.

### 3. Precondition Exclusivity — 122/150

- **Distinct preconditions across outcomes (40/60)**: one by-the-book ambiguous pair: step-5 `reject` Preconditions = "看板存在待审批条目(同 approve-success 的条目形态)" — explicitly identical to `approve-success`; the pair is separable only via Input (-20 per ambiguous pair). Partial overlap in step-7: `backflow-success` ("subagent 处于运行态并经 dsh tool 完成任务领取与提交") vs `concurrent-serial-backflow` ("多个并行 subagent 先后完成提交") — under a multi-submit state both match (compatible but not unique) (-10 reserved under sufficiency below, overlap noted here).
- **Sufficient to uniquely select (42/50)**: given Preconditions + state alone, step-5 approve/reject are indistinguishable (both match a pending entry); step-7 multi-submit matches two outcomes simultaneously. All other steps select uniquely (step-2's 齐全 / 缺失∧未确认 / 缺失∧已确认 split is clean; step-3's type-reject vs launch-fail split by "落行之前" vs "派发行已落(starting 态)" is clean).
- **Error/boundary triggers explicit (40/40)**: every non-happy outcome names its trigger: "task_type 为派发受限类型…或被确定性机制取代的类型" (step-3), "host 启动回调失败(如宿主会话通道创建失败)" (step-3), "同一审批条目已被决策(approved 或 rejected),用户在事件回流前再次…决策" (step-5), "宿主会话通道不可用(宿主异常/凭据失效),经测试通道注入" (step-5), "当前项目无任何满足派发条件的任务(依赖/状态/阶段均不满足)" (step-1), "宿主桥不可用(宿主异常)…" (step-6).

### 4. Fact Alignment — 109/150

- **Factual claims traceable / UNKNOWN (41/60)**: most behavioral claims trace cleanly (pending|blocked dispatchable ↔ FT-068; starting→running + session_id/prompt_hash backfill ↔ FT-067/FT-073; awaiting→running on last pending decision ↔ FT-074; redispatch keeps failed row + new row + second confirm ↔ FT-075; ≤3s interactable ↔ BIZ-workbench-005; ≤5s backflow + direct kernel push ↔ FT-093/FT-094). Deductions:
  - step-1 Output "错误码 ERR_TASK_DEPS_UNSATISFIED 语境" and step-3 Output "ERR_DISPATCH_LAUNCH_FAILED 呈现口径" — both codes verified real in code and `design/tech-design.md` error table, but **absent from `.forge/fact-table.json`** (FT-068/FT-073 do not name them) and cited without fact_id, UNKNOWN, or inferred annotation → untraceable per the declared fact base (-5 each).
  - step-5 `channel-unavailable` State "受影响派发行进入 failed 态并记录原因(启动/终局回调路径)" — grounded for the `starting` leg (FT-073 notifyLaunchFailed) but unsupported for running/awaiting rows whose failed-transition requires the (dead) host callback transport; unmarked (-5).
  - step-7 Output "完成态(done)呈现" — task-status vocabulary is `completed` (FT-033/FT-057); `done` is the dispatch-row vocabulary (FT-067); applied to the task card this is an unverified vocabulary blend (-4).
- **Inferred claims have rule support + source: inferred (34/50)**: exemplary on four outcomes — step-3 `type-not-dispatchable` ("source: inferred…FT-072…"), step-3 `launch-failed` (FT-073), step-5 `already-decided` (FT-074), step-6 `bridge-unavailable-degraded` (page-map Route Guard). But the two required_outcomes-derived outcomes carry the mapping comment yet **lack `source: inferred`**: step-1 `deps-unmet-selection-blocked` and step-5 `channel-unavailable` (-8 each).
- **No hallucinated unclassified claims (34/40)**: both ERR_* codes are real (repo-verified) — not hallucinations. Residual: step-7 State "执行记录渲染入内核(记录可查)" — record persistence for sqlite-authority projects is unspecified in the fact table (FT-055 describes file-derived records); asserted without classification (-6).

### 5. Surface Fitness — 94/100

- **Mandatory Web derived outcomes present (40/40)**: validation-error → step-1 blocked-selection outcome with mapping comment; session-expired → step-5 channel-unavailable with mapping comment. Both assert the surface-rule essentials (error surfaced near the interaction, no submit/no subagent started; degraded state shown, recovery reachable).
- **Surface-appropriate language (29/35)**: user interactions, page elements, dialogs, badges dominate ("点击任务工具栏「派发」", "浮动选择条呈现已选计数", "审批按钮带呼吸点计数" implied via page anchors). Deductions: State dimensions consistently speak kernel-row language rather than observable web state ("数据内核落派发行:同批单 batch_id…", "approval_request 行 pending → approved"); "完成态(done)呈现" as a *card* status is not the surface's user-facing vocabulary. The contracts never leak non-web surface idioms (no CLI exit codes as contract values, no DOM selectors) — the deduction is for state-description register, not for wrong-surface idioms.
- **TUI timeout criterion (25/25)**: N/A for web surface — full marks per rubric.

### 6. Internal Consistency — 130/150

- **Journey invariants hold in every contract (60/60)**: no contract gives the human a task-status write (human verbs are exactly 派发/审批/重派发/进入会话); zero-CLI chain never spawns forge CLI (step-4 asserts the negative: "调用日志无 forge prompt 类自跑合成调用"); task-status changes only via agent dsh tool (step-3 launch-failed explicitly holds "任务状态不变(仍待 agent 通道变更)"); ≤5s / parallel-isolation / dispatchable-set invariants respected everywhere.
- **Cross-Contract state references consistent (38/50)**: the step-to-step chain is sound (step-4 "Step 3 派发已完成" ↔ step-3 rows running; step-6 "派发行已回填 session_id" ↔ step-3 "session_id 回填"; step-7 redispatch failed-rows ↔ step-3/5 failed producers; step-2 acknowledged-continue "派发行按 Step 3 语义落库" ↔ step-3). Deductions: **fixture lineage inconsistency across contracts** — Task's parent is Feature in steps 1–2 but Project in steps 3/4/7; Dispatch's parent is Task in steps 4/7 but Project in steps 5/6 (both defensible per DDL FKs, but the same journey declares two different parentage models, which a downstream fixture author must reconcile) (-12); step-2's sibling outcomes pin different feature stages (in-progress vs tasks) with no stated basis, interacting with anchor #1 (-covered below, noted here).
- **Preconditions achievable from preceding steps (32/40)**: step-2 `artifacts-complete` as fixture-declared is not reachable on a first dispatch pass (in-progress-stage artifact matrix requires ≥1 already-dispatched task per FT-083; nothing upstream in this journey's step-1→2 chain produces one) (-8). All other step chains are achievable.

### 7. Anchor Integrity — 95/100

Handbook `design/page-map.md` exists; Web anchor field = `page`. All 7 contracts carry `anchors.web.page` (+ supplementary `route`/`layout`/`requires_auth`).

- **Anchor field completeness (40/40)**: no missing `page` fields. Verified against handbook entries: step-1/7 → "工作台 · 任务看板" (`workbench/tasks`); step-2 → tasks page + dispatch dialog chain; step-3 → tasks page + DispatchConfirm; step-4 → 任务详情侧板 (`workbench/panel/*`, TaskDetailPanel 编排分区 "预合成要素 ✓✓✓" — matches handbook tasks-page section row); step-5 → 审批 dock (ApprovalPanel, "与详情侧板互斥" matches handbook); step-6 → 上游会话视图 (`session`, uiWorkspace.openSession matches handbook "subagent 会话经 dispatch-launch 创建,详情「进入会话」切入").

  **Missing Anchor Fields** table: none — no deductions.

- **Anchor values match handbook (25/30)**: all page values resolve to handbook pages/sections. One inconsistency: the *same* dispatch-dialog chain is anchored two ways — step-2 `route: "workbench/tasks"` with layout "DispatchWarning/DispatchConfirm 浮层", while step-3 `route: "workbench/dialog/dispatch-confirm"`; the handbook's own convention assigns dialog overlays the `workbench/dialog/*` view-key namespace. Not a factual mismatch (dialogs open within the tasks page) but sibling contracts use conflicting conventions for the same overlay (-5).

  **Anchor value mismatches**: 1 minor (above).

- **Handbook internal consistency (30/30)**: no conflicting page/route definitions — view keys unique (`workbench/overview|proposals|features|tasks`, `workbench/dialog/*`, `workbench/panel/*`, `session`); tab order 概览/提案/Feature/任务 matches FT-092; panels mutually exclusive; Esc layering and close-guard rules conflict with nothing else in the map.

  **Handbook Conflicts** table: none found.

### 8. Fixture Specification — 74/100

Scored per-contract (entity completeness / relationships+constraints / min_count), then averaged, because the entity-completeness veto applies per Contract.

| Contract | Entity | Rel/Cstr | MinCount | Total | Notes |
|---|---|---|---|---|---|
| step-1 | 40 | 35 | 20 | **95** | idle outcome instantiates only the status leg of "依赖/状态/阶段均不满足" (Feature has no stage constraint) — minor. deps-unmet min_count 2 correctly covers blocked+upstream pair. |
| step-2 | 40 | 35 | 13 | **88** | **artifacts-complete infeasible**: `Feature.status: "in-progress"` + only pending Task contradicts FT-083's cumulative in-progress row (needs ≥1 dispatched in_progress/completed task) (-8); acknowledged-continue drops the Feature.status constraint its state-identity ("同 artifacts-missing-warning 的缺失状态") requires (-4). |
| step-3 | 35 | 28 | 25 | **88** | `task.feature_slug` is NOT NULL (schema-v2) yet no Feature entity/constraint declared anywhere — task rows cannot be constructed without the feature slug value (-12 spread). min_count 3 matches the 3-way parallel dispatch; type-not-dispatchable fixture correctly typed. |
| step-4 | 30 | 25 | 25 | **80** | StageAsset declared `parent_entity: "Feature"` but **Feature is not in `entities`** — the stage-asset row (and the feature whose 目标/摘要 the outcome asserts) cannot be seeded (-10 entity, -10 relationship). |
| step-5 | 0 | — | — | **0** | **Veto triggered**: Input/Output reference the source task ("查看内容与来源任务"; approval panel renders it; `approval_request.task_key` NOT NULL) yet `Task` is missing from `fixture_spec.entities` in all four outcomes. A Contract that does not declare the entities it operates on cannot guarantee test data sufficiency → dimension 0 for this contract per rubric. |
| step-6 | 30 | 25 | 25 | **80** | Dispatch row requires `feature_slug` + `task_key` NOT NULL; neither Feature nor Task declared — the running dispatch fixture cannot be constructed as declared. |
| step-7 | 37 | 30 | 25 | **92→90** | `error` field verified against dispatch DDL (schema-v2 `error TEXT`) ✓; redispatch and concurrent (2 Task + 2 Dispatch) min_counts correct; Feature tier again absent for `feature_slug` (-8), Dispatch→Task correctly declared. |

Average: (95+88+88+80+0+80+90)/7 = **74**. The veto's harshness is contained to step-5 rather than zeroing the journey because 5/7 contracts declare complete, mostly constraint-rich entity sets (notably good: step-1's blockers/task_type/status constraints, step-5 approve-success's ApprovalRequest session_id constraint).

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **"可派发阶段" is never grounded in the stage vocabulary** — step-1 Preconditions: "所属 feature 处于可派发阶段" (which of prd/design/tasks/in-progress/completed?). Step-2 then pins `in-progress` for the happy outcome and `tasks` for the warning outcome with no derivation. FT-080/FT-083 define the vocabulary; the contract set never maps the journey's qualifier onto it, so the happy-path fixture stage is author's choice, not specification. Must improve: pin the dispatch stage explicitly (first dispatch = `tasks`) and make step-2's sibling outcomes share it.
2. `[blindspot]` **Step-4's load-bearing assertion has no specified test-channel contract** — "测试通道可直读注入记录/宿主侧产物(浏览器面不自测提示词内容)". The entire three-element guarantee (the point of Step 4) is delegated to an unnamed channel with no record shape, location, or access method. A downstream agent cannot construct the assertion. Reasoning audit flagged this independently of dimension scoring (Surface Fitness scored the delegation as honest, not as specified). Must improve: name the artifact (e.g., dispatch row prompt_hash 对拍 + host-side injection record) and its access path inside the outcome's State or a fixture note.
3. `[blindspot]` **Step-5 recovery loop doesn't close** — "通道恢复后经重派发重新进入运行态,无中间残留态" depends on rows reaching `failed`, but FT-075 accepts only failed rows for redispatch and FT-073's failed-transitions ride the dead transport; no watchdog fact exists. If a running row cannot transition, the promised no-residue end-state is unreachable. Must improve: specify the mechanism (launch-leg failure vs. terminal-callback path vs. stale-running detection) or scope the claim to the starting leg.

---

## Attack List (for reviser)

1. [Fixture Specification] step-5 entity-completeness veto: Task missing from all four fixture_specs — "用户在看板对待审批条目查看内容与来源任务" — declare Task (+ its feature lineage, `task_key` NOT NULL) in every step-5 fixture.
2. [Fixture Specification] step-2 happy fixture infeasible under FT-083 — `Feature.status: "in-progress"` with only `Task.status: "pending"` — set stage `tasks` (first dispatch) or declare the ≥1 previously-dispatched task the in-progress matrix requires.
3. [Precondition Exclusivity] approve/reject share preconditions — "看板存在待审批条目(同 approve-success 的条目形态)" — differentiate preconditions (e.g., pending entry not yet decided + distinct decision intents stated in Preconditions) or explicitly declare Input as the outcome selector.
4. [Fact Alignment] untracked error-code citations — "错误码 ERR_TASK_DEPS_UNSATISFIED 语境", "ERR_DISPATCH_LAUNCH_FAILED 呈现口径" (both real in code/tech-design, absent from fact-table.json) — extend the fact table or annotate the citations' source.
5. [Fact Alignment] unsupported failed-transition for mid-flight rows — "受影响派发行进入 failed 态并记录原因(启动/终局回调路径)" while the transport that carries those callbacks is the thing that died — scope to the starting leg or specify the watchdog/terminal-callback mechanism, and mark inferred.
6. [Fact Alignment] missing `source: inferred` on the two required_outcomes-derived outcomes — step-1 "surface-web required_outcomes 映射:validation-error → …" and step-5 "session-expired → …" comments lack the annotation the rubric mandates — add `<!-- source: inferred -->` + reasoning lines matching step-3/5/6 precedent.
7. [Internal Consistency] parentage model flips between contracts — Task→Feature (steps 1–2: `parent_entity: "Feature"`) vs Task→Project (steps 3/4/7: `parent_entity: "Project"`); Dispatch→Task (4/7) vs Dispatch→Project (5/6) — pick one lineage model (recommend Feature-tier: Project→Feature→Task→Dispatch/ApprovalRequest) and apply it in all seven files.
8. [Semantic Purity] test-harness meta-language inside user-facing dimensions — step-4 Input "并经测试通道断言 subagent 系统提示词" — move channel mechanics out of Input/Output into State or a dedicated note; keep dimension values behavior-only.
9. [Semantic Purity] implementation nouns in dimension values — "(MissingItem 逐项…)", "检查结果 satisfied 为真", "(queue 模式逐字符交付)" — replace type/flag/param names with behavioral phrasing.
10. [blindspot] "可派发阶段" never mapped to stage vocabulary; step-2 sibling outcomes pin conflicting stages — "所属 feature 处于可派发阶段" + fixtures `in-progress`/`tasks` — define the dispatch stage once and reuse.
11. [blindspot] step-4's three-element assertion delegated to an unspecified channel — "测试通道可直读注入记录/宿主侧产物" — specify the record, its shape, and access path so a downstream agent can construct the check.
12. [blindspot] step-5 recovery story unclosed (failed-state reachable only via the dead transport; redispatch accepts only failed rows) — "通道恢复后经重派发重新进入运行态,无中间残留态" — close the loop or narrow the claim.

---

## Verdict

**950/1100 — PASS.** The contract set is structurally complete, journey-faithful, and strongly grounded in the fact table where it cites it; the four inferred outcomes with full reasoning annotations are the model the rest should follow. The material risks for test generation are the step-5 fixture veto (unseedable approval panel), the step-2 infeasible happy fixture, and the unspecified step-4 assertion channel — all fixable without restructuring.
