# Contract Eval — bootstrap-walkthrough (Iteration 1)

**Scorer**: adversarial protocol, rubric `skills/eval/rubrics/contract.md` (1100 pts, 8 dimensions)
**Inputs**: 5 contract files (step-1…step-5), journey.md, surface-web rule, page-map.md (web handbook), .forge/fact-table.json (139 entries)
**Iteration**: 1 (no previous report)

## Verdict

**SCORE: 947/1100 — PASS** (rubric target 935; all dimensions above min thresholds)

| Dimension | Score | Min | Pass |
|-----------|-------|-----|------|
| 1. Completeness | 146/150 | 90 | ✓ |
| 2. Semantic Purity | 178/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 110/150 | 90 | ✓ |
| 4. Fact Alignment | 124/150 | 90 | ✓ |
| 5. Surface Fitness | 87/100 | 60 | ✓ |
| 6. Internal Consistency | 142/150 | 90 | ✓ |
| 7. Anchor Integrity | 90/100 | 60 | ✓ |
| 8. Fixture Specification | 70/100 | 60 | ✓ |

Passing but with real, fixable defects concentrated in Precondition Exclusivity (three selection-ambiguity pairs) and Fixture Specification (dangling parent entities, pseudo-fields). Details below; all deductions quote the document.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Journey → contract mapping is complete.** All 5 happy-path steps and all 7 edge cases (1b/2b/2c/3b/4b/5b/5c) are operationalized: walkthrough-not-started, manifest-md-appears, interrupted-recovery, record-drift-detected, panorama-inconsistent, constitution-regression-red, accounting-omission — one per journey edge, no invention, no omission. Plus one surface-derived validation-error outcome. 13 total (High-risk target 13–20: at floor, within range).
2. **Invariants block present in all 5 files** with the journey's 5 invariants (cosmetic drift: the qualifier "（走查通过 = 纪律从纸面变现实）" on invariant 4 is dropped in files 2–5).
3. **Step-chain state coherence is good**: S1 creates accepted+chain → S2 consumes "M3.5 提案已 accepted 且 feature 成链" → S3 "任务已全部结算（终态）" → S4 "任务终态、记录入库" → S5 "走查任务链收口". No step demands a state a predecessor destroys.
4. **Pre-scored suspicion (confirmed in Phase 2)**: assertion-style journeys (this one is mostly 核查/断言 steps) tend to leave happy-path Preconditions silent on the negation of the violation they assert — S3 and S5 both exhibit exactly this.
5. **Fact spot-checks (against fact-table.json)**: chain-gate same-transaction chaining (M3_CHAIN_GATE_EXPEDITION ✓), decided_at (M3_DECIDED_AT_SEMANTICS ✓), fix depth ≤6 (M3_FIX_CHAIN_MAX_DEPTH ✓), block_source atomic (M3_BLOCK_SOURCE_ATOMIC ✓), restore blocked→pending (M2/M3_RESTORE_HOOK ✓), commit_hash on submit record (M3_SUBMIT_COMMIT_HASH ✓), terminal set (M3_TERMINAL_TASK_SET ✓), dispatch template (M3_DISPATCH_COMMAND_TEMPLATE ✓), SC9/顺延表 #1–#13/四条款 grounded in proposal.md L283/L305/L351 ✓. Two misalignments found (see Fact Alignment).

---

## Phase 2 — Dimension Scoring

### 1. Completeness — 146/150

- **Four mandatory dimensions (50/50)**: every Outcome in all 5 files has non-empty Preconditions / Input / Output / State; Side-effect is explicit everywhere ("none" where applicable); optional step-level Invariants used where meaningful. fixture_spec present in all 13 Outcomes with ≥1 entity each.
- **Journey Invariants section (50/50)**: all 5 files carry `## Journey Invariants` with ≥1 (actually 5) entries.
- **Coverage incl. surface-mandated derived scenarios (46/50)**: happy 5/5, edges 7/7; validation-error concretely realized at the journey's only form step (S1, with `source: inferred` + reasoning); session-expired adjudicated N/A per file with a surface-consistent reason ("本地单人工作台无登录态"). **-4**: steps 3 and 4 sit at 2 Outcomes each, below the High-risk per-step band (3–5, `rules/risk-density.md`); no fact-informed boundary was derived for either (e.g., S3 partial-drift / task-row-present-record-missing; S4 loading-state during the event-refresh window). The band's exception clause only covers exceeding, not falling below.

### 2. Semantic Purity — 178/200

- **Natural language, no code/regex (76/80)**: no regex, CSS/XPath selectors, or framework assertion calls anywhere. **-4**: Outputs carry test-verdict meta-language rather than system behavior — e.g. S2 manifest-md-appears Output "断言红（零 manifest 纪律）——即时发现并修正" and S3 "断言红（记录必须 100% 入自身库）" describe the *test's* assertion outcome, not what the system produces (inherited from the journey, but the contract layer should operationalize, not repeat, assertion markers).
- **Declarative Preconditions (60/60)**: all Preconditions are state descriptions ("走查运行期间文件系统出现 manifest.md", "评审流转对话框已选目标态 accepted 但 reason 留空"), no setup procedures.
- **No implementation coupling (42/60)**: three clusters deducted:
  - **-8** schema-column notation in State values — S1: "proposals.proposal_status = accepted（decided_at 写入）；features 表新增 feature 行…feature_records 新增审计行（actor=core 成链内聚）" couples the dimension to table/column names.
  - **-6** file-system path + event constants in a dimension value — S2 Side-effect: "task-claimed / task-spawned / task-submitted 事件入 logs/容器 slug.jsonl" (rubric explicitly bars file system paths; this one is also fact-misaligned, see Dimension 4).
  - **-4** tool-call vocabulary in Input/Output — S2: "按 DAG 顺序领取 → worker 执行 → AC gate → commit → submitTask" and "走 blocked / fix 链机制处置（worker submit blocked 或 addTask 追加 fix-N）", plus "block_source 单事务" naming an internal flag rather than the behavior.

### 3. Precondition Exclusivity — 110/150

- **Distinct Preconditions per Step (54/60)**: no two Outcomes share *equivalent* Preconditions. **-6**: S1's pair shares an explicit draft clause — success requires "M3.5 提案已 Draft 在库且处于可评审状态" while walkthrough-not-started requires "M3.5 提案仍为 draft 或内容未就绪（未到可评审态）". A draft **and** reviewable proposal satisfies both texts ("仍为 draft" is a disjunct that alone triggers the negative outcome). Only the fixture (`content_ready: false`) restores exclusivity; the text a downstream agent consumes does not. Fix: drop "仍为 draft 或" and key the trigger on reviewability alone.
- **Sufficient to uniquely select (20/50)**: three state-selector gaps:
  - **-12** S3: success Preconditions ("M3.5 任务已全部结算（终态）；自身 forge.db 活跃…") are *fully satisfiable in the drift state* — a drifted execution record does not contradict either clause — so success vs record-drift-detected ("某任务/执行记录落到了旧线或外部库") cannot be selected by state; selection implicitly relies on the success Outcome's own Output. The no-drift condition the Output asserts ("100% 入自身 forge.db") belongs in the Preconditions. S4 got this right ("任务终态、记录入库"); S3 omitted it.
  - **-10** S5: success Preconditions ("里程碑收尾时点…；总纲文档在场可回归；宪法池回归入口可用") are all satisfiable while a regression is red — "入口可用" ≠ 回归绿 — so success and constitution-regression-red ("总纲 SC2…任一回归失败") co-match. Success needs "回归绿" (or red needs "success 前置已满足") to close the gap.
  - **-8** S2: manifest-md-appears ("走查运行期间文件系统出现 manifest.md") and interrupted-recovery ("走查中某任务受阻（blocked）或需修复") are co-satisfiable — a walkthrough with a blocked task *and* a stray manifest.md matches both; neither negates the other (different assertion channels, but the exclusivity rule is state-based).
- **Error/boundary triggers explicit (36/40)**: every boundary Outcome names its trigger. **-4**: walkthrough-not-started's trigger "内容未就绪" is not operationally establishable — there is no content readiness field or gate in the five-state proposal model (M3_PROPOSAL_FIVE_STATES); a downstream agent cannot construct "not ready" except by leaving the proposal in draft, which collapses the outcome into "not accepted yet" and re-creates the S1 overlap above.

### 4. Fact Alignment — 124/150

- **Factual claims traceable / UNKNOWN-marked (40/60)**: the majority of specific behavioral claims verify cleanly against the fact table (see Phase 1 anchors). Two do not:
  - **-12** S2 Side-effect: "task-claimed / task-spawned / **task-submitted** 事件入 logs/容器 slug.jsonl" — M3_FORGE_EVENT_TYPES enumerates the dispatch-event set written to `logs/{slug}.jsonl` as **task-claimed / task-spawned / task-worker-done / no-ready-task**; `task-submitted` is not in that channel's vocabulary (the submit path surfaces through the separate write-push IPC chain, M2_EVENT_PUSH_CHAIN), and the actual member task-worker-done is omitted. The claim as written is unverified and partially contradicted.
  - **-8** S1 State: "feature_records 新增审计行（**actor=core** 成链内聚）" — M3_FEATURE_RECORDS_AUDIT specifies actor ∈ {plugin-tool, ui, core} without fixing the chain-write actor; the contract asserts a specific value no fact corroborates, with no UNKNOWN/unverified marking.
  - **-10** structural: no positive-Outcome dimension value anywhere carries a fact reference or unverified marker (the sole in-document fact mention is S1's HTML-comment "M3_PROPOSAL_TRANSITION_RULE 域"). The claims happen to verify, but traceability is scorer-supplied, not document-supplied.
  - Note (no deduction): S2 Output "按 DAG 顺序领取" is business shorthand for M2_CLAIM_READY_SELECTION's actual order (branch continuation → priority → created_at → id over the pending pool); acceptable at contract altitude, but gen-test-scripts must not implement a literal topological-order claim.
- **Inferred claims rule support + source: inferred (46/50)**: validation-error-reason-empty carries `<!-- source: inferred -->` plus reasoning citing the web form-step rule and page-map's "目标态仅列五态机允许集 + reason 必填（空因拒绝留场）" — exactly the required form; every file's header documents the web-surface-required adjudication (validation-error / session-expired N/A reasoning). **-4**: the derived outcome's fixture omits the `mode: expedition` constraint its retry-success narrative depends on (a blitz proposal's accept does not chain — M3_CHAIN_GATE_EXPEDITION), leaving the reasoning chain under-specified relative to the fact it invokes.
- **No unclassified hallucinations (38/40)**: SC9 accounting content verified verbatim against proposal.md (顺延表 #1–#13, 四条款 = M3 行收窄 / 全量顺延表 / brainstorm 条目修订 / M3.5 时序注记 + tech-research 偏离注记, L283/L305/L351); SC2/SC3/SC7 semantics match business rules (无投影 / 只读边界 / tool 读写延伸); five-state machine, chain gate, fix-chain constants all fact-consistent. **-2**: "宪法池回归入口" presumes a runnable constitution regression entry whose existence is asserted, not grounded in any fact or design section cited by the contract.

### 5. Surface Fitness — 87/100

- **Mandatory derived Outcomes (36/40)**: validation-error is concretely present at the only form-submission step (S1), shaped to the web form pattern (refused, stays open, correctable-retry — matching M2_TRANSITION_DIALOG_GATING's behavior class); session-expired is adjudicated N/A in all 5 files with a defensible no-auth rationale, and S2 derives interrupted-recovery explicitly framed as the localized continuity form ("中断恢复由 Outcome \"interrupted-recovery\" 承载——本地化连续性形态"). **-4**: none of the surface rule's additional common web boundaries (loading-state during the event-refresh window, network-error on the read faces) is even adjudicated for the read-heavy steps — the headers cover only the two mandatory ones.
- **Surface-appropriate language (26/35)**: where a UI face exists the language is properly user-centric (概览三视图 / 文档 / 提案子 tab, 对话框留场, e2e 一条链). **-9**: six of thirteen Outcomes describe mechanisms with no browser-observable proxy and empty page anchors — S2 success ("worker 执行 → AC gate → commit → submitTask"), both S3 outcomes ("库读面对账"), and all three S5 outcomes ("执行总纲回归断言…SC9 文档断言核查"). The contracts never state how a web E2E test observes these (page state transitions? probe? deferred state-verification level per rules/tui-async.md §State Verification Levels). gen-test-scripts will have to approximate.
- **TUI timeout criterion (25/25)**: N/A for web — full marks.

### 6. Internal Consistency — 142/150

- **Invariants hold in every Contract (58/60)**: no Step violates the journey invariants; the violation-shaped outcomes (manifest-md-appears, record-drift-detected, panorama-inconsistent) are detection framings of the invariants, not violations by the contracts. **-2**: invariant 4's qualifier is silently dropped in files 2–5 ("自举纪律生效记账：M4 起剩余功能一律用自身开发" vs journey's "…（走查通过 = 纪律从纸面变现实）") — cosmetic but the block is declared as the journey's invariants.
- **Cross-Contract state references (44/50)**: the S1→S5 chain is coherent and unambiguous. **-6**: (a) S3 success characterizes the post-run state as "任务已全部结算（终态）；自身 forge.db 活跃" while S4 success characterizes the same state as "任务终态、**记录入库**" — adjacent contracts describe the identical checkpoint inconsistently, which is the root of the S3 exclusivity gap; (b) S2's "M3.5 任务已建（DAG 依赖关系落库）" references task creation that no contract and no journey step produces — it is carried only implicitly by S2's fixture (acceptable, but the reference reads as if a predecessor established it).
- **Preconditions achievable from preceding States (40/40)**: verified step-by-step; S2's task fixture (min_count 2, DAG) legitimately carries what the journey leaves implicit; nothing demanded that a predecessor destroys.

### 7. Anchor Integrity — 90/100

Handbook exists (`design/page-map.md`, 8 page entries) → dimension active.

- **Anchor field completeness (30/40)**: S1 `page: "概览 · 提案子 tab"` and S4 `page: "概览 · 任务子 tab"` filled with `last_anchor_sync` set. **-10**: S2 `page: ""` despite a clear handbook match for its action — page-map's 概览 · 任务子 tab owns the 派发 entry point ("「派发」按钮……自动发送派发指令——「/run-tasks <容器标识>」") and there is a dedicated "新会话（提案/feature/诊断/派发渠道）" page row; the generator's leave-empty-when-unmatched rule does not apply when the handbook maps the step this directly. (S3/S5 empty is defensible: their Inputs describe no page interaction; S5 has no plausible page at all.)
- **Anchor values match handbook (30/30)**: both filled values resolve to page-map Page Overview entries (name portion matches; the (UF-N) suffixes are annotations, not name drift). S1's true interaction target 评审流转对话框 is a modal hosted inside that tab — anchoring to the hosting tab is acceptable (noted, not deducted); a `layout` mention of the dialog is present.
- **Handbook internal consistency (30/30)**: 8 distinct pages, no duplicate/conflicting route or navigation definitions; "Route Guard 不适用——M3 无新路由" is stated once and consistently (contracts' empty `route` values are correct, matching VIEW_STATE_MACHINE's no-URL-routing model).

### 8. Fixture Specification — 70/100

**Veto adjudication (documented)**: the entity-completeness veto was *not* triggered. Entities created by an Outcome (S1's Feature, S2's TaskRecord rows) are State outputs, not pre-existing fixture state — fixture_spec declares what must pre-exist (`rules/fixture-spec.md`). However, two fixtures reference parent entity types they do not declare in-file, which sits close to the veto line; scored under relationship coverage below, with the recommendation to declare them explicitly and remove the ambiguity entirely.

- **Entity completeness (32/40)**: Proposal / Feature / Task / TaskRecord / FeatureDocument map 1:1 to the seven-table schema (M2_DB_SEVEN_TABLES); Session matches the dsh-ledger session domain. **-8**: `WorkspaceDir` — used in 5 outcomes — is not a domain-model entity name: the registration domain's entity is the registered project/workspace whose *input field* is `workspaceDir` (CH_PROJECTS_REGISTER). Declaring a path-shaped pseudo-entity weakens the "match a domain model entity" requirement.
- **Relationship and constraint coverage (13/35)**:
  - **-10** S2 success declares `Feature { relationship_type: has_many, parent_entity: Proposal }` while its Preconditions assert "M3.5 提案已 accepted" — yet **Proposal is not declared among S2's entities** (Feature/Task/Session only). The parent is only salvageable via cross-contract establishment (S1 declares Proposal), which `rules/fixture-spec.md` permits ("or a previously established entity") but which leaves S2's fixture non-self-contained for its own asserted precondition, one ambiguity away from the entity-completeness veto.
  - **-4** S3 success declares `Task { belongs_to, parent_entity: Feature }` without declaring Feature in-file (S2/S4 declare it; S3 alone dangles).
  - **-8** pseudo-field names that exist on no entity: S1 `content_ready`（不可装载）, S2 `manifest_md_present`, S3 `storage`, S4 `task_records`（as a *field* on Task), S5 `constitution_pool` / `master_doc`, S2 Session `composition`. fixture-spec allows natural-language *values*, but the *field names* should be real entity fields; gen-test-scripts cannot mechanically target them.
- **Minimum data quantity (25/25)**: Task `min_count: 2` suffices for a DAG; TaskRecord 2 matches the multi-record reconciliation; no under-declared counts; negative-outcome fixtures are constructible (modulo the pseudo-field caveat above).

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] No verification vehicle for the journey's core mechanism outcomes (web surface).** S2 Output: "远征会话派发开发链运行：按 DAG 顺序领取 → worker 执行 → AC gate → commit → submitTask；管线纪律照旧（自举不豁免）" — a browser test cannot drive worker execution. Neither S2, S3, nor S5 states the observation proxy (任务子 tab 状态推进 + 事件刷新 500ms 内直读可见 + 库探针) nor a deferred state-verification level. Outside Surface Fitness's language criterion — this is about test *realizability*: without a stated vehicle, gen-test-scripts will approximate or skip the walkthrough's strongest bootstrap assertions, and the journey's SC-critical checks silently degrade.
2. **[blindspot] Re-accept idempotency boundary uncovered.** M3_CHAIN_GATE_EXPEDITION: "re-accept idempotent (no duplicate chain)". The classic web double-submit of the 评审流转 confirm button (or a superseded→accepted re-entry) has no Outcome — S1 covers only the empty-reason refusal ("评审流转对话框已选目标态 accepted 但 reason 留空"). For a High-risk journey sitting at the density floor (13 Outcomes), the duplicate-chain guard is the single most test-worthy accept-path boundary and it is absent.
3. **[blindspot] The drift fixture requires a second database that no fixture declares.** S3 record-drift-detected fixture: `field: "storage" value: "旧线或外部库（漂移形态）"` — constructing drift requires an external/legacy forge.db (a second registered workspace) to exist and to have swallowed a record. `fixture_spec.entities` declares only a bare TaskRecord; the cross-workspace precondition entity is absent, so a downstream agent cannot build the violating state from the declaration.
4. **[blindspot] Zero-manifest scan scope is unpinned.** S2 manifest-md-appears Input: "文件系统断言检查（工作区树内 manifest.md 存在性）" — "工作区树" does not fix the scan root set (code workspace only? .forge deriveDir? knowledge dirs?). manifest.md historically lived in feature doc trees; whether those roots are in or out of the assertion changes its meaning, and an under-scoped scan passes vacuously.

---

## Attack List (for reviser)

1. [Precondition Exclusivity] S3 success lacks the no-drift precondition its own Output asserts — "M3.5 任务已全部结算（终态）；自身 forge.db 活跃（dsh-forge 自身工作区注册态）" — add "全部任务与执行记录均在自身 forge.db" (mirror S4's "任务终态、记录入库").
2. [Precondition Exclusivity] S1 negative-outcome trigger overlaps success — "M3.5 提案仍为 draft 或内容未就绪（未到可评审态）" — drop the "仍为 draft 或" disjunct; key the trigger on reviewability, and replace the unestablishable `content_ready` fixture field.
3. [Precondition Exclusivity] S5 success is selectable while regression is red — "宪法池回归入口可用" does not exclude "总纲 SC2…任一回归失败" — add 回归绿 (or scope red's precondition to the post-success checkpoint).
4. [Precondition Exclusivity] S2 manifest-md-appears × interrupted-recovery co-satisfiable — neither "走查运行期间文件系统出现 manifest.md" nor "走查中某任务受阻（blocked）或需修复" negates the other — add mutual negation clauses.
5. [Fact Alignment] Event vocabulary misaligned — "task-claimed / task-spawned / task-submitted 事件入 logs/容器 slug.jsonl" — M3_FORGE_EVENT_TYPES fixes that channel as task-claimed / task-spawned / **task-worker-done** / no-ready-task; correct the list (and drop the path from the dimension value).
6. [Fact Alignment] Unverified actor claim — "feature_records 新增审计行（actor=core 成链内聚）" — facts allow plugin-tool/ui/core without fixing the chain actor; mark unverified or verify against code.
7. [Anchor Integrity] S2 empty `page` despite direct handbook match — 概览 · 任务子 tab owns the 派发 entry ("派发指令 = `/run-tasks <标识>`…"); fill the anchor.
8. [Fixture Specification] Dangling parents — S2's `parent_entity: Proposal` and S3's `parent_entity: Feature` are not declared in-file; declare them (with status constraints matching the asserted Preconditions) to clear the veto ambiguity.
9. [Fixture Specification] Pseudo-fields — `content_ready` / `manifest_md_present` / `storage` / `task_records` / `constitution_pool` / `master_doc` / `composition` are not entity fields; restate as state_requirements or real fields.
10. [Surface Fitness / blindspot-1] State the web verification vehicle for S2/S3/S5 mechanism outcomes, or explicitly mark the state-verification level as deferred with the probe face named.
11. [Completeness] S3/S4 below the High-risk per-step band (2 Outcomes vs 3–5) — derive the fact-informed boundaries each step supports (partial drift; refresh-window loading state).
12. [blindspot-2] Add the re-accept/double-submit idempotency outcome to S1 (fact-grounded in M3_CHAIN_GATE_EXPEDITION's "re-accept idempotent").
13. [blindspot-3] Declare the external/legacy database workspace entity in S3's drift fixture.
