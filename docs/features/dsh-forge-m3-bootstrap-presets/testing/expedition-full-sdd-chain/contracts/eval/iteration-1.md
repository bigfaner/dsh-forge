# Contract Eval Report — expedition-full-sdd-chain / iteration-1

- Scorer: adversarial (Senior QA persona), verification stance
- DOC_DIR: `docs/features/dsh-forge-m3-bootstrap-presets/testing/expedition-full-sdd-chain/contracts/` (8 files, step-1 … step-8)
- Surface: web (rule `gen-journeys/rules/surface-web.md`); handbook: `design/page-map.md` (exists → Anchor Integrity active); fact table: `.forge/fact-table.json` (139 entries)
- Code reconnaissance performed against `packages/plugin-forge/src/**` and `docs/features/dsh-forge-m3-bootstrap-presets/design/` (tech-design, schema.sql) to verify factual claims before docking

## Verdict

**SCORE: 963/1100 — NOT PASS**: total ≥ 935 but **Fact Alignment 88 < 90 (min threshold)**. Revision iteration required.

| Dimension | Score | Min | Status |
|---|---|---|---|
| Completeness | 145/150 | 90 | PASS |
| Semantic Purity | 185/200 | 120 | PASS |
| Precondition Exclusivity | 127/150 | 90 | PASS |
| Fact Alignment | **88/150** | 90 | **FAIL** |
| Surface Fitness | 98/100 | 60 | PASS |
| Internal Consistency | 145/150 | 90 | PASS |
| Anchor Integrity | 90/100 | 60 | PASS |
| Fixture Specification | 85/100 | 60 | PASS |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

- Journey structure faithfully operationalized: all 8 happy steps + all 10 edge cases mapped to 17 journey-derived Outcomes (1→success+spec-skill-catalog-complete[1b]; 2→success+revised-back-to-draft[2b]+superseded-evolution[2c]+validation-error-reason-empty[derived]; 3→success+chain-atomicity[3b]; 4→success+upsert-idempotent[4b]; 5→success(+spec-skill-unavailable-outside-expedition[inferred extra]); 6→success+dag-dependency-ordering[6b]; 7→success+blocked-recovery[7b]+zero-manual-file-transfer[7c]; 8→success+audit-rows-accompany[8b]). Journey Invariants restated (5 entries) in all 8 files.
- Web required-outcome adjudication comment present in all 8 files; validation-error materialized only where a form exists (Step 2 评审流转对话框) — correct surface judgment; session-expired N/A everywhere (local single-user workbench, no login state — genuine).
- Cross-contract state chain (draft → accepted → chained feature → prd → ui/design → tasks → terminal → panorama) is coherent; step references (5→4, 6→5, 3→2, 4→3, 7→6) all resolve.
- Code reconnaissance results that drove Fact Alignment scoring:
  - **Emit-point closure** (`packages/plugin-forge/src/index.ts` tail comment, M3 3.3/3.4): "tool 面 emit 点已接线（dispatchTask 五事件 + submitTask task-submitted + 全 tool-error）". Verified: `create-proposal.ts:119` and `add-task.ts:274` call ONLY `emitToolError` (failure path); `submit-task.ts:192-197` DOES emit `task-submitted` (so Step 7's event list is correct). Design `tech-design.md:26`: "业务日志 = 工具发事件 → 监听器落盘 `logs/{slug}.jsonl`"; `tech-design.md:185`: UI 面状态变更审计 = feature_records / task_records / proposals.decided_at（DB）——两纪律不混不重复.
  - **feature_records append-only 双触发器 ABORT**: verified in `design/schema.sql:80-83` (trg_feature_records_no_update/no_delete RAISE ABORT) — Step 8's ABORT claim is design-grounded, no deduction.
  - **Spec skill directory** = 8 entries per fact `M3_PLUGIN_FORGE_SPEC_SKILLS` (incl. `eval`); Step 1's "全集" enumeration lists 7 spec skills, omitting `eval`.
  - **Proposal row-creation channels** (`tech-design.md:231,388,477`): scanned-absorbed rows carry NULL mode ("NULL（扫描吸收旧提案）→ 无链——边界：先 setProposalMode"); mode=expedition at creation only via createProposal 透传 (`M3_PROPOSAL_MODE_LINEAGE`).

## Phase 2 — Dimension Scoring

### 1. Completeness — 145/150

- All 17 Outcomes across 8 files carry non-empty Preconditions / Input / Output / State; Side-effect present everywhere ("none" where applicable); Invariants present where load-bearing. 50/50.
- `## Journey Invariants` present in all 8 files, 5 entries each. 50/50.
- Happy path + all edges + web-mandated derived outcomes covered with documented adjudication. 45/50: Step 2 "success" Output asserts a dual-face property the Input cannot drive — "双面流转同门——agent 经 transitionProposal 写库与人工面一致" — while the Input is only "单人开发者在概览提案子 tab 评审该提案（…人工裁决按钮，reason 必填）". A web e2e generated from this contract can exercise the human face only; the agent-face sameness clause is asserted but not operationalized (no second input face, no oracle). -5.

### 2. Semantic Purity — 185/200

- No regex, CSS/XPath selectors, or framework assertion calls anywhere. 80/80.
- Preconditions declarative throughout; minor scene leakage: Step 1 "且处于技能行使态（brainstorm 探索执行中）" and Step 7 "（入库通道审计场景——只读对账，不触发派发动作）" embed scenario intent into state descriptions (the latter at least serves disambiguation). 58/60.
- Implementation coupling beyond the house DB-vocabulary convention (schema is a public contract per `M2_DB_SEVEN_TABLES`): Step 3 Output "transitionProposal 返回携带 chained feature 行" (tool-return shape) -4; Step 7 Side-effect "task-claimed / task-spawned / task-submitted 事件入 logs/容器 slug.jsonl" (file path + event payload names) -4; Step 6 State "依赖边落库（增量环校验通过）" (names the internal validation algorithm) -3. 47/60.

### 3. Precondition Exclusivity — 127/150

- Distinctness 40/60:
  - **Step 4 "success" vs "upsert-idempotent" genuine overlap**: success Preconditions ("远征 feature 已成链（feature 行在场）；远征会话规格技能可用") do not exclude a pre-existing document row, and success's own Output embraces the re-write case — "feature_documents 新增/更新一行" — while upsert-idempotent's precondition ("同一文档经技能重复产出/修订（同名同路径——feature_documents 已有该 feature_id + doc_kind 行）") describes exactly that same re-write scenario. A revision pass through write-prd matches BOTH outcomes. Contrast Steps 3 and 6 which pin first-occurrence ("该提案尚无对应 feature 行" / "该 feature 尚无任务行（首次拆解形态）") — Step 4 lacks the analogous qualifier. -15.
  - Step 8 "audit-rows-accompany" precondition ("feature 域发生过多次写入（register / transition / doc-upsert）") is a strict subset of "success" precondition ("全链走完：提案 accepted、feature 成链、分层文档在场、任务终态与执行记录在场") — in the terminal state both are applicable; discriminator lives in Input only. -5.
- Unique selection with (state, input) pairs: unambiguous elsewhere; Step 7 "zero-manual-file-transfer" quantifies "全链走完（或任一中间态）" (near-universal) but carries its discriminator inside the precondition parenthetical. 47/50 (-3).
- All error/boundary outcomes state explicit triggers ("成链写入过程中发生故障（或注入失败）", "某任务执行受阻（质量门未过或重大问题）", "评审流转对话框已选目标态但 reason 留空", "会话组合为突击（customSkillDirs 不含 plugin-forge-spec 技能目录）"). 40/40.

### 4. Fact Alignment — 88/150 (BELOW THRESHOLD)

- Factual claims traceable / correct: 40/60
  - **Step 1 "success" Side-effect is contradicted by code**: "提案域写入动词事件落事件日志". Verified: `create-proposal.ts:119` emits only `emitToolError` on failure; the emit closure is "dispatchTask 五事件 + submitTask task-submitted + 全 tool-error"; design `tech-design.md:185` keeps proposal-domain state changes in DB columns (decided_at / superseded_by), not an event log. After brainstorm's createProposal, zero events land in any 事件日志. A generated test asserting this side-effect fails 100%. -12.
  - **Step 2 "success" Side-effect is likewise false**: "提案域转移动词事件落事件日志" — transitionProposal has no success emit point (tool face), and this journey's step drives the human RPC face which has no jsonl sink at all. -12.
  - **Step 1 Output enumeration under-asserts the physical boundary**: "规格技能全集可见可用（write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks / brainstorm）" — the spec subset lists 7, omitting `eval`, while "全集" claims completeness; fact `M3_PLUGIN_FORGE_SPEC_SKILLS` and the on-disk directory contain 8 spec skills. A set-equality assertion fails (eval is physically present); a subset assertion under-asserts. (Journey-inherited verbatim, but the contract is the operational layer for tests.) -12.
  - **Step 1 row-creation channel left dual and unreconciled**: Output asserts "提案发现扫描建行（五态 draft 起步）；mode 溯源 = expedition 创建时写入" while State asserts "proposals 表新增一行（status=draft、mode=expedition）". Per `M3_PROPOSAL_MODE_LINEAGE` and design (`tech-design.md:231` "扫描吸收旧行 = NULL 缺省占位"; `:388` "NULL（扫描吸收旧提案）→ 无链"), the scan channel yields mode=NULL — which would kill the Step 3 chain gate (accepted ∧ mode=expedition). Only the createProposal 透传 channel produces the asserted state. The contract (and its fixture) never pins which verb creates the row, so gen-test-scripts can seed a NULL-mode proposal and the golden path breaks at Step 3. -8. (Step 6's "任务域写入动词事件落事件日志" is scored under criterion 3 — task_records audit rows do land, but the wording claims the wrong artifact.)
- Inferred claims annotated: 48/50
  - Step 2 "validation-error-reason-empty": `source: inferred` + reasoning citing the web form-step justification, page-map reason-必填 convention and `M3_PROPOSAL_TRANSITION_RULE` — exemplary.
  - Step 5 "spec-skill-unavailable-outside-expedition": `source: inferred` + fact-based reasoning (`M3_PRESET_BLITZ_SKILL_DIRS`) — good, but it is a domain boundary not mandated by any `required_outcomes` rule and the derivation adjudication is thinner. -2.
- No hallucinated unclassified claims: 0/40
  - **Step 6 "success" Side-effect half-false**: "任务域写入动词事件落事件日志" — addTask emits nothing on success (`add-task.ts:274` failure-path only); what DOES land is a task_records add audit row (`M2_ADD_ATOMIC_TRIPLE`). The artifact exists but is misnamed as an event log. -10 (floors criterion).
  - (Step 7's event claims verified TRUE: task-claimed/task-spawned from dispatchTask, task-submitted from `submit-task.ts:192-197` — correctly listed, no deduction. Steps 3/4/5/8 correctly phrase feature-domain audits as 审计行 per `M3_FEATURE_RECORDS_AUDIT` + `design/schema.sql:80-83`.)

### 5. Surface Fitness — 98/100

- Mandatory derived outcomes: validation-error present where a form exists (Step 2), N/A-adjudicated with reasons in all other files; session-expired N/A-adjudicated everywhere (no login state in a local single-user workbench — genuine; `requires_auth: false` consistent with page-map "Route Guard 不适用"). 40/40.
- Surface language: web interactions well-rendered ("概览提案子 tab 评审…人工裁决按钮", "对话框不关闭、不落部分写库", "feature 子 tab 分层文档区可见真实路径（prd/ 分组——需求文档组）", "任务子 tab「派发」入口", "查看任务 DAG 视图并发起派发"); occasional tool-face jargon in Outputs ("transitionProposal 返回携带 chained feature 行", "AC gate → commit → submitTask 全绿") where the step's face genuinely includes the agent session — acceptable. 33/35.
- TUI timeout criterion: N/A for web. 25/25.

### 6. Internal Consistency — 145/150

- Journey invariants hold in every contract: tool-only writes enforced (zero-manual-file-transfer outcome), chain atomicity asserted with fault branch, attribution model carried in fixtures (Feature belongs_to Proposal, Task/FeatureDocument belongs_to Feature), feature_records append-only asserted with ABORT (design-grounded), panorama consistency asserted. No invariant violation. 60/60.
- Cross-contract references: all step references resolve (Step 5 "PRD 已入 feature_documents（Step 4）" ← Step 4 State; Step 6 "技术设计已入 feature_documents（Step 5）" ← Step 5 State; Step 3 accepted ← Step 2; Step 8 aggregation ← Steps 2-7, doc_kind "至少两类" feasible from prd+ui+design). 48/50 (-2: Step 2 success fixture field value "draft（经 under-review 走人工裁决按钮）" conflates two states in one constraint — not a broken reference, but state-vocabulary drift within the Outcome the generator must interpret).
- Preconditions achievable from prior steps: all chains valid (2b under-review mid-step; 8's terminal tasks after 7; 8b's ≥3 feature_records feasible from register + 3 doc-upserts). 37/40 (-3: Step 6 and Step 7 use two different event-audit vocabularies for the same domain — Step 6 Side-effect "任务域写入动词事件落事件日志" vs Step 7 "task-claimed / task-spawned / task-submitted 事件入 logs/容器 slug.jsonl" — semantic drift across contracts in what "事件" means; scored here for the cross-contract vocabulary inconsistency, truth value docked in Fact Alignment).

### 7. Anchor Integrity — 90/100

Handbook `design/page-map.md` exists → dimension active. Route fields empty everywhere is CORRECT (handbook: "M3 无新路由"; Route Guard 不适用).

- Field completeness 30/40: **Step 3 ships `page: ""` while its trigger surface is a handbook page** — the chain is fired by the accept verdict in the 评审流转对话框 on 概览 · 提案子 tab, whose handbook entry explicitly carries the fork copy ("accepted 分叉文案（远征 → 将单步成链建 feature…）"). An anchor existed and was left empty. -10. Step 1's `page: ""` is treated as honest N/A (in-session skill exploration has no page-map entry; pages cover overview tabs/dialogs/settings/hero/新会话 only) — recommend an explicit "N/A" marker instead of empty string to remove ambiguity, no deduction.
- Value match 30/30: "概览 · 提案子 tab" / "概览 · feature 子 tab" / "概览 · 任务子 tab" match handbook entries (UF annotations aside); layouts consistent with Target Files (proposal-tab.tsx 评审流转对话框 / feature-tab.tsx 分层文档区 / task-tab DAG 视图 / task-tab 工具栏「派发」按钮). Note: Step 8 anchors only 任务子 tab though its Output spans 提案/文档/任务/记录 across three sub-tabs — defensible (primary face; layout field acknowledges "跨面核查"), but a generator will need the proposal/feature tab navigation from the journey, not the anchor.
- Handbook internal consistency: no duplicate/conflicting page definitions. 30/30.

### 8. Fixture Specification — 85/100

- Entity completeness (veto check): entity_types (WorkspaceDir, Session, Proposal, Feature, FeatureDocument, Task, TaskRecord, FeatureRecord) all correspond to design domain entities (forge.db tables per `M2_DB_SEVEN_TABLES` + M3 feature_records eighth table; Session/WorkspaceDir environmental); every prerequisite entity referenced in Preconditions is covered; created artifacts are outputs, not fixtures. No veto. 40/40.
- Relationship/constraint coverage 20/35: Step 2 "superseded-evolution" models the two-proposal supersede link as a pseudo-field — `field: "relation"`, `value: "前版与后继（取代链目标在场）"` — instead of a relationship_type/parent_entity declaration or a superseded_by field constraint; the rubric's relationship machinery is bypassed. -10. Step 7 "success" fixture constrains Task only by `task_status: "pending（依赖满足集内）"` while its own Output asserts "worker 按 DAG 依赖顺序领取执行" — no depends_on edge constraint is declared (contrast Step 6's dag outcome which declares it), so the ordering scenario is under-specified for seeding. -5.
- Minimum data quantity: Step 2 superseded needs 2 ✓; Step 6 dag needs ≥2 (uses 3) ✓; Step 8 Task 2 + TaskRecord 2 + FeatureDocument 2 ✓ feasible; Step 7 success Task 2 ✓. 25/25.

## Cross-dimension coherence check

- The false event-log side-effects (Fact Alignment) and the Step 6/7 vocabulary drift (Internal Consistency) trace to the same root — the generator used a generic "写入动词事件落事件日志" template for proposal/task domains while correctly naming real events in Step 7; docked once per dimension (truth value in FA, cross-contract drift in IC), no double-counted points.
- The Step 1 channel ambiguity is docked once in Fact Alignment; its harness-realization consequence is escalated as blindspot #3 (fault-injection seam belongs to Step 3's chain-atomicity, same class).
- Step 4 exclusivity gap and Step 4 anchor absence do not co-occur (anchor issue is Step 3); kept separate.

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. **[blindspot] No termination oracle for the dispatch loop.** Step 7 "success" Output: "worker 按 DAG 依赖顺序领取执行；AC gate → commit → submitTask 全绿（提交哈希入执行记录）" — nothing in Output/State states an observable done-criterion. Facts provide ready oracles (`M3_DISPATCH_POOL_SNAPSHOT` verdicts all-settled/done; `M3_DISPATCH_BUTTON_RULES` all-terminal → 派发按钮置灰 + tooltip). Without one, gen-test-scripts must invent a polling/timeout strategy for a long-running async loop. Add an observable completion condition (e.g., 任务子 tab 派发按钮置灰 + all tasks terminal).
2. **[blindspot] Supersede's downstream consequence on the chained feature/tasks is unspecified.** Step 2 "superseded-evolution" Output: "accepted → superseded 演进链可用；取代链在提案行谱系元数据可见（superseded_by 落库）" — in this journey the proposal is accepted AND chained (Step 3) before edge 2c can apply (its precondition requires an accepted proposal with a successor), yet State asserts nothing about the already-created feature row, feature_documents, or tasks (does the chain persist? does feature 恒远征 survive a superseded parent?). The cross-entity consequence is untested and unasserted.
3. **[blindspot] Fault-injection realization seam unstated.** Step 3 "chain-atomicity" fixture declares `field: "fault_injection"`, `value: "成链事务中段失败（写入过程故障）"` as a Proposal field constraint — but `FAULT_INJECTION_CONTRACT` records that no setFault/injectFault/faultPoint exists in shipped code and "e2e lacks a fault facility". The contract does not tell the generator which seam realizes the fault (core unit test with stub/transaction hook vs a new e2e harness), so the outcome is likely to be silently dropped or mis-implemented at gen-test-scripts time.

## Required fixes (for reviser, priority order)

1. Steps 1/2/6 Side-effects: delete or correct the "…写入动词事件落事件日志" claims — per the emit closure, createProposal/transitionProposal/addTask emit nothing on success. Correct artifacts: Step 1/2 → DB state only (proposals row; decided_at on accept; no proposal event log exists); Step 6 → task_records add 审计行（+ task_edges 落库）. (Restores Fact Alignment above the hallucination floor.)
2. Step 1 success Output: pin the row-creation verb to createProposal(mode=expedition) 透传 (or explicitly adjudicate 扫描吸收 = NULL mode → 先 setMode 的边界路径), so the fixture cannot seed a NULL-mode proposal that kills Step 3's chain gate.
3. Step 1 spec-skill enumeration: either add `eval` (8 spec skills per `M3_PLUGIN_FORGE_SPEC_SKILLS`) or rephrase as "plugin-forge-spec 目录全部技能可见".
4. Step 4 success Preconditions: add the first-occurrence qualifier ("该 feature 尚无 prd 文档行" or equivalent) to restore exclusivity vs upsert-idempotent (mirror Steps 3/6 phrasing).
5. Step 3 anchors: set `page: "概览 · 提案子 tab"` (chain fork copy lives in the 评审流转对话框 there); recommend explicit "N/A" for Step 1's empty anchor.
6. Step 2 superseded fixture: replace the pseudo-field `relation` with a proper relationship declaration (or superseded_by field constraint naming the successor proposal).
7. Step 7 success fixture: add the depends_on edge constraint its DAG-ordering Output presupposes; add an observable dispatch-completion oracle (pool settled / 派发按钮置灰).
8. Step 2 success: either operationalize the 双面流转同门 clause (agent-face scenario or oracle) or move it from Output to Invariants as a design property not asserted by this web contract.
