# Eval Report: contract/task-dispatch-pipeline — Iteration 1

- **Eval type**: contract (rubric scale 1100, target 935, every dimension ≥ min threshold)
- **Surface**: web (rule: `gen-journeys/rules/surface-web.md`)
- **Scope**: 6 Contract files (`contracts/step-1` … `step-6`)
- **Scorer stance**: adversarial; every deduction cites the document
- **Date**: 2026-10-07

## Final Score

| Dimension | Score | Min Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 140/150 | 90 | YES |
| 2. Semantic Purity | 185/200 | 120 | YES |
| 3. Precondition Exclusivity | 120/150 | 90 | YES |
| 4. Fact Alignment | 128/150 | 90 | YES |
| 5. Surface Fitness | 93/100 | 60 | YES |
| 6. Internal Consistency | 145/150 | 90 | YES |
| 7. Anchor Integrity | 90/100 | 60 | YES |
| 8. Fixture Specification | 90/100 | 60 | YES |
| **Total** | **991/1100** | **935 + all thresholds** | **YES** |

**Verdict: PASS.** 991 ≥ 935 and every dimension clears its min threshold. Remaining deductions are concentrated in Precondition Exclusivity (one carried-over ambiguous pair), Fact Alignment traceability formalism, and Anchor/Fixture declaration asymmetries.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Decomposition is faithful and complete.** All 6 happy-path steps and all 6 journey edge cases (2b, 2c, 3b, 5b, 5c, 6b) have corresponding Outcomes in the matching step file. Two additional boundary Outcomes were derived from code reconnaissance and are properly annotated (`<!-- source: inferred -->` + reasoning citing `M2_CLAIM_REENTRY` in step-2, `M2_SUBMIT_INPUT_VALIDATION` in step-5).
2. **One journey defect was fixed at contract altitude; another was not.** The journey's 5b/5c precondition overlap is repaired here: `blocked-settlement` now pins 「reason 已备」 vs `blocked-reason-required`'s 「reason 缺席（空串或未提供）」 — explicitly exclusive. The journey's 2b/2c overlap, however, is carried into the contracts verbatim and remains disambiguated only by Input (盲选 vs 显式 taskRef), not by Preconditions (see Dimension 3).
3. **Substantive fact fidelity is high.** Spot-checked assertions verify against the Fact Table nearly verbatim: Z1 exit shape (`{ task: null, dispatchPrompt: '', digest: '', reclaimed: false }` = M2_CLAIM_Z1_EXIT), digest `sha-256 全文前 12 hex` (M2_DISPATCH_PROMPT_COMPOSITION), `actor='plugin-tool'` claim row (M2_CLAIM_RECORD_SHAPE), `INSERT OR IGNORE` links write (M2_LINKS_WRITE_SOURCE), ERR_DEPENDENCIES_UNMET data.unmet (M2_CLAIM_GUARDS), restore-hook semantics (M2_RESTORE_HOOK), event chain / single-refetch criterion (M2_EVENT_PUSH_CHAIN), submit return `{ taskId, status, restored }` and claimTask `TaskSnapshot` return (tech-design Interface 1:104-109), 「插件不注册人类通道 tool…代码审计 0 注册」 (M2_TOOL_FACE). No fabricated behavior found.
4. **Verified-in-code but unmarked claims**: 「WAL 模式读写并发」 for the per-workspace DB is true in code (`packages/core/src/db/open.ts:58`, `store.test.ts:98`) but absent from the Fact Table; 「严格顺序，遇首个未解决失败即停」 (step 4 Input) and 「技能经 customSkillDirs 挂载，系统提示段 forge:pipeline 在场」 (step 1 State) likewise rest on design/code without fact citation or UNKNOWN marking.
5. **Pre-score anchors for deductions**: (a) 2b/2c precondition overlap; (b) internal IPC call chain in step-2 Side-effect; (c) empty web anchors on steps 1–5; (d) Feature parent inconsistently declared across fixture_specs; (e) Step 4 fail-stop boundary with no Outcome; (f) Step 1 Output not observably assertable.

---

## Phase 2 — Dimension Scoring

### 1. Completeness — 140/150

**Four mandatory dimensions (50/50).** Every Outcome in all six files carries non-empty Preconditions, Input, Output, and State; Side-effect is explicit everywhere (「无」/「none」), and step-5's success/blocked Outcomes additionally carry per-Outcome Invariants. No missing mandatory dimension anywhere.

**Journey Invariants section (50/50).** All six files contain `## Journey Invariants` with the journey's five invariants reproduced verbatim (cross-checked against `../journey.md` — identical wording, no drift).

**Happy path + required derived scenarios (40/50).** Boundary/error Outcomes are present for steps 2 (three: no-ready, deps-unmet, inferred foreign-in-progress), 3 (one), 5 (three), 6 (one). Web-mandatory derived outcomes are handled via explicit per-file adjudication comments (see Surface Fitness). Deduction −10: **Step 4 asserts a testable boundary behavior in its Input that no Outcome validates** — 「随后依次执行质量门四步：编译 → 格式 → lint → 测试（严格顺序，遇首个未解决失败即停）」. The fail-stop strict-order rule is exactly the kind of sequencing behavior a Senior QA would pin with its own Outcome (gate fails at compile → fmt/lint/test never run → settlement is blocked); delegating the entire failure surface to Step 5's `blocked-settlement` verifies the *settlement*, not the *stop-at-first-failure* discipline. Step 1 similarly has only a success Outcome, though for an NL-intent entry step that is defensible.

### 2. Semantic Purity — 185/200

**Natural language, no regex/selectors/assertions (80/80).** No regex syntax, CSS/XPath selectors, or framework assertion calls anywhere. The XML tag names (`<constraints>`, `<task-context>`, `<type-policy>`) are the domain's own dispatchPrompt composition facts (M2_DISPATCH_PROMPT_COMPOSITION), not test-verification syntax.

**Preconditions declarative (60/60).** All Preconditions describe holding state, not setup steps — e.g. step-1 「已注册工作区，其每工作区任务库中有某 feature 的就绪任务（前置依赖全部处于终态 completed 或 skipped）」; step-3's 「claimTask 已返回 dispatchPrompt 与 digest」 references the tool as state, not procedure.

**No implementation coupling (45/60).** Three instances of internal-mechanism naming in dimension values:

1. Step-2 success Side-effect names the internal propagation chain: 「事务提交后 emitTasksChanged(projectId) → process.send → webContents.send('forge:events/tasks-changed')」 — this is host-internal IPC plumbing, not system-level behavior. The pure statement of behavior is already present in the same sentence (「概览在写入返回后单次重取即见新值」); the call chain is redundant coupling (−6).
2. Step-2 success State embeds a SQL upsert idiom: 「task_session_links 新增行（INSERT OR IGNORE）」 — the *effect* (idempotent link row) is the contract-level fact; the SQL clause is mechanism (−5). Column-level naming (`tasks.task_status = in_progress`) is borderline-acceptable for a state-layer contract and not counted.
3. Step-1 State names an internal mounting option: 「技能经 customSkillDirs 挂载，系统提示段 forge:pipeline 在场」 — mechanism vocabulary with no behavioral counterpart (−4).

Tool return shapes (「返回 { taskId, status, restored }」) are NOT counted as violations: for agent-face tools the return shape is the interface contract itself (tech-design Interface 1), equivalent to the rubric's accepted "success confirmation containing feature-slug" altitude.

### 3. Precondition Exclusivity — 120/150

**Distinctness across Outcomes (40/60).** One ambiguous pair in step 2, inherited unfixed from the journey: `no-ready-tasks` (「库中无就绪任务：任务前置均未满足，或全部已处终态，或库中无任务」) vs `dependencies-unmet-guard-rejects` (「某 pending 任务存在未终态前置依赖」). A library containing exactly one pending task with an in_progress prerequisite satisfies **both** Preconditions simultaneously; the disambiguator lives entirely in Input (「盲选」 vs 「显式 taskRef 定位」). Per the mutual-exclusivity HARD-RULE this is an invalid pair as written → −20. All other steps verified exclusive: step 5's four Outcomes are pairwise exclusive on reason/summary presence and gate outcome (「reason 已备」 vs 「reason 缺席」；「success 摘要非空」 vs 「执行摘要缺席」 — the journey's 5b/5c overlap was explicitly repaired here); step 3's pair is exclusive on task state; step 6's pair on write-timing.

**Sufficiency of selection (40/50).** Because the 2b/2c pair overlaps at precondition level, pure (Preconditions × state) selection is ambiguous for that state; selection only becomes deterministic once Input is considered → −10. All other Outcomes select uniquely.

**Explicit triggering conditions (40/40).** Every error/boundary Outcome states its trigger explicitly — e.g. 「executor 提交 blocked 但 reason 缺席（空串或未提供）」；「任务实际状态与动词假设不符（如已被人工转移出 in_progress——转移为 suspended / skipped 等非 in_progress 态）」；「库中存在 in_progress 任务，其挂接会话为另一会话（非当前 dispatcher 会话）」. No bare error Outcomes.

### 4. Fact Alignment — 128/150

**Factual claims traceable (45/60).** Substantive accuracy is high — every behavior-level assertion I checked maps to a Fact Table entry or tech-design Interface (see Phase 1 anchor 3). The deficiency is formal: **inline fact traceability is almost entirely absent**. Only the two inferred Outcomes carry citations (「Fact Table M2_CLAIM_REENTRY（claim.ts:15-17、63-78）」; 「Fact Table M2_SUBMIT_INPUT_VALIDATION（submit.ts:42-48）」); the ~15 other outcome-level factual assertions (digest algorithm, Z1 exit shape, actor value, restore hook, event chain, ERR codes, audit shapes) carry no fact_id reference and no UNKNOWN marking, leaving a downstream auditor to re-derive traceability themselves (−10). Additionally three specific claims rest outside the Fact Table with no marking: 「WAL 模式读写并发」 (step-6 concurrent State — true in code per `db/open.ts:58`, absent from M2_DB_SEVEN_TABLES/DB_SCHEMA_TABLES), 「遇首个未解决失败即停」 (step-4 Input), 「技能经 customSkillDirs 挂载，系统提示段 forge:pipeline 在场」 (step-1 State) (−5).

**Inferred claims annotated (45/50).** Both derived Outcomes have `source: inferred` plus reasoning with fact citations — good practice, and the recon basis is legitimate (concurrency boundary and symmetric input validation). −5: the reasoning cites Fact Table entries rather than the surface rule that mandated derivation; the required_outcomes linkage for the web-mandatory pair exists only implicitly through the step-5 adjudication comment (「其拒绝形态见下方 blocked-reason-required / success-summary-required 两 Outcome（语义等价承载）」), not in the inferred annotations themselves.

**No hallucinated claims (38/40).** Zero fabricated behavior found — all spot-checks verified true against Fact Table / tech-design / code. −2 reserved for the unmarked extra-fact-table claims above (they are plausible-and-verified-in-code, but unclassified in-document; classification, not truth, is the gap).

### 5. Surface Fitness — 93/100

**Mandatory derived Outcomes (38/40).** Web-mandatory `validation-error` + `session-expired` are absent as Outcomes but every file carries an explicit adjudication comment with per-step rationale — e.g. step-6: 「validation-error N/A — 只读浏览面（查看任务列表），无表单。session-expired N/A — 本地单人工作台无服务端会话凭据」 — and step-5 maps the validation-error semantics onto real Outcomes: 「必填字段校验（reason/summary）在动词输入面完成…其拒绝形态见下方 blocked-reason-required / success-summary-required 两 Outcome（语义等价承载）」. This is the honest treatment for a local single-user Electron surface with no web forms; the pair was genuinely "considered" per surface-web.md. −2: the adjudications live in HTML comments that downstream tooling may strip, with no frontmirror (e.g. frontmatter surface-applicability field), so the consideration is not machine-visible.

**Surface-appropriate language (30/35).** Step 6 uses proper web vocabulary (页签、浏览、任务行、状态 tag、重取). Steps 1–5 are written entirely in agent-tool vocabulary (技能指令、tool 调用、subagent 派发、审计行) — factually correct for those steps' faces, but the contract set offers no per-step surface declaration to reconcile a `surface_types: ["web"]` journey whose 5/6 steps have no web face; the web renderer gets exactly one anchorable step. −5 for the unannotated face mismatch.

**TUI timeout criterion (25/25).** Non-TUI surface — full marks by rule.

### 6. Internal Consistency — 145/150

**Invariants hold in every Contract (60/60).** Verified each invariant against every file: no Outcome has the app initiating orchestration (auto-restore is correctly framed as verb-intrinsic, matching M2_AGENT_TRANSITION_MATRIX's 「write-path-intrinsic effect」), no watch/reflow anywhere (step-6 asserts the opposite as its Output), the append-only audit invariant is honored in all write Outcomes and correctly suspended in pure-read Outcomes (「零写入（纯读出口，不发射事件）」), and the single-writer-door invariant is consistent with the human-transition premise in step-3's mismatch Outcome (transitionTask RPC is the same core verb door).

**Cross-Contract references consistent (45/50).** The state chain verifies end-to-end: step-2 Output returns 「TaskSnapshot + dispatchPrompt + digest」 → step-3 Preconditions 「claimTask 已返回 dispatchPrompt 与 digest」 ✓; step-2 State sets in_progress → steps 3/4/5 Preconditions 「任务处于 in_progress」 ✓; step-5 State sets completed/blocked → step-6 Preconditions 「派发链已完成 submit 落账（任务 completed 或 blocked）」 ✓. Cross-journey pointer 「后续 fix 链承接归 fix-chain-auto-recovery 旅程」 resolves to the existing sibling journey. −5: within step 5, the two rejection Outcomes' fixture_specs omit `TaskRecord` while their State asserts 「不落部分审计（单事务全成全败零残留）」 — the entity whose non-writing is asserted is undeclared in those Outcomes (file-level spec does include it), an intra-file declaration asymmetry.

**Preconditions achievable from preceding State (40/40).** Every step's Preconditions are reachable from the prior step's State changes. Step-3's mismatch Outcome requires an out-of-band manual transition — explicitly declared in its own Preconditions (「如已被人工转移出 in_progress——转移为 suspended / skipped 等非 in_progress 态」) and supported by the human transition face (M2_TRANSITION_TARGETS_HUMAN), so it is reachable, not dangling.

### 7. Anchor Integrity — 90/100

Handbook `design/page-map.md` exists with six web entries; anchor checks ran.

**Anchor field completeness (30/40).** Step-6 is fully and correctly anchored (page/route/requires_auth/layout + `last_anchor_sync: "2026-10-07T12:00:00+08:00"`). Steps 1–5 carry `page: ""`, `route: ""`, `layout: ""`, `last_anchor_sync: ""` — structurally present but empty. For steps 2–5 (agent-tool faces) no page-map entry exists to fill, so empty is the honest value; step 1's session-chat face is likewise absent from the page-map (upstream shell surface). Deduction −10 (grouped, not the mechanical 5×−10): the empty anchors carry **no N/A adjuduation in the frontmatter** — nothing tells a downstream consumer whether the anchor is unfilled-by-omission or not-applicable-by-design; the justification exists only in body comments about a different topic (surface-required adjudication). Actionable fix: annotate the anchors block per file (e.g. `page: ""  # N/A — agent-face step, no page target`).

**Anchor values match handbook (30/30).** Step-6 values match page-map: page 「右栏「项目概览」tab（dswf-overview）」 ↔ handbook entry 「右栏「项目概览」tab(`dswf-overview`)」; route `dswf-overview` ↔ registered tab id (`sidebarRightTabs.register('dswf-overview')`); layout 「sidebar.right.pane.tab（dock tab 注册制，guide 入口卡最前）」 ↔ handbook 注册缝/body-slot description. No mismatches.

**Handbook internal consistency (30/30).** page-map.md has no duplicate or conflicting page/route definitions; the six entries are disjoint and each carries one 注册缝.

#### Missing Anchor Fields

| File | Field | Value | Assessment |
|---|---|---|---|
| step-1 | page / route / layout | `""` / `""` / `""` | empty — session-chat face not in page-map; needs N/A note |
| step-2 | page / route / layout | `""` / `""` / `""` | empty — agent tool face; needs N/A note |
| step-3 | page / route / layout | `""` / `""` / `""` | empty — agent dispatch face; needs N/A note |
| step-4 | page / route / layout | `""` / `""` / `""` | empty — agent execution face; needs N/A note |
| step-5 | page / route / layout | `""` / `""` / `""` | empty — agent tool face; needs N/A note |

#### Handbook Conflicts

None — no duplicate/conflicting page definitions found in `design/page-map.md`.

### 8. Fixture Specification — 90/100

**Entity completeness (40/40, veto not triggered).** Every entity referenced in Preconditions/Input/State at file level is declared: step-1 (Project/Feature/Task), step-2 (Project/Feature/Task/TaskEdge/TaskSessionLink — the pre-existing link for the foreign-in-progress scenario correctly declared), step-3/4/5 (Project/Task/TaskRecord), step-6 (Project/Feature/Task/TaskRecord×2). Entities *created by* operations (new claim rows, new links) are correctly excluded as they are not pre-existing state. All entity types map to domain-model entities (tech-design Data Models: tasks/task_edges/task_records/task_session_links/features + app-DB projects).

**Relationship and constraint coverage (25/35).** Two issues. (a) **Feature parent declaration is inconsistent across files**: steps 1/2/6 declare 「Task … belongs_to Feature」 but steps 3/4/5 omit Feature entirely, although every Task in the domain is FK-scoped to a Feature (`tasks.feature_id FK`) — the same entity graph is declared at two different altitudes within one contract set (−7). Also step-2's deps-unmet Outcome declares Task as 「has_many, parent Project」 while the file-level summary says 「belongs_to Feature」, dropping the has_many relation in the union. (b) **Pseudo-field constraints**: step-1 constrains Project by 「field: "registered", value: true」 — `registered` is not a projects-table column but a derived UI marker; and step-2's TaskEdge constraint 「prerequisiteStatus」 is a derived read-time value, not a column (acceptable as constraint text per fixture-spec rules, but the field naming invites column-looking queries) (−3).

**Minimum data quantity (25/25).** All min_counts are scenario-feasible: step-2 file-level Task min_count 2 covers target + unmet prerequisite; TaskSessionLink 1 and TaskEdge 1 cover the two boundary Outcomes; step-6 TaskRecord min_count 2 supports asserting the claim+submit audit pair; single-entity rejection scenarios need only 1. No under-declaration found.

---

## Phase 3 — Blindspot Hunt (what the rubric missed)

1. **[blindspot] Step 1's Output is not observably assertable.** Quote: 「Output: "dispatcher 进入派发循环；应用自身不发起任何编排动作（web 无编排逻辑），管线推进全部由 dispatcher 驱动"」. State is 「无直接状态变更」, Side-effect 「无」. A downstream test-generator receives zero assertable signal — "进入派发循环" has no observable proxy (no event, no row, no tool call specified). Improve: give an observable assertion face (e.g., first claimTask observed within a bound / claim audit row appears), or explicitly mark the Outcome as verified-via-Step-2 so scripts don't emit a vacuous test.
2. **[blindspot] Step 4's fail-stop ordering asserted but never tested.** Quote: 「依次执行质量门四步：编译 → 格式 → lint → 测试（严格顺序，遇首个未解决失败即停）」. The strict-order stop-at-first-failure is a sequencing bug magnet (executor running lint after compile failed) and no Outcome pins it. Improve: add a gate-fails-at-first-step Outcome asserting later steps never execute.
3. **[blindspot] Event-latency bound from the fact table not carried.** M2_EVENT_PUSH_CHAIN pins 「event latency bound 500ms」; step-6's Output only asserts 「写入返回后单次重取即见新值」. The interaction-refetch criterion is well-formed, but the pushed-event path (Side-effect: 「写后事件推送（forge:events/tasks-changed）与用户交互重取双通道并存」) has no bound, so a degenerate event storm or dead subscriber passes. Improve: carry the 500ms bound into the concurrent-browse Outcome.
4. **[blindspot] Verb-face/step-face mismatch silently inherited.** Step-3's second Outcome is a submitTask rejection (「Input: "executor 调 submitTask 结算…"」) housed under the step titled 「dispatcher 同步派发匿名 executor」 — mirroring the journey's own 3b placement. Internally consistent and exclusive, but a script generator grouping tests by step will file a submit-verb test under the dispatch step. Improve: note the outcome's verb ownership or re-house under step 5.
5. **[blindspot] Git-absent narrowing is silent.** Step-5 success Preconditions require 「executor 持有…提交哈希」; tech-design rules git an optional dependency (git 缺席 → submitTask result=blocked). The journey Setup pins git available, legitimately scoping this out — but the contract nowhere records that narrowing, so a reader cannot tell whether commit-hash-absent success is impossible or untested. Improve: one clause in Preconditions noting the git-available setup dependency.

---

## Attack Points (deduction summary)

1. [precondition-exclusivity] 2b/2c Preconditions overlap (「库中无就绪任务」 vs 「某 pending 任务存在未终态前置依赖」 both true for one-pending-with-unmet-deps state) — disambiguation lives only in Input — move the 盲选/taskRef discriminator into Preconditions or merge.
2. [semantic-purity] Internal IPC chain in step-2 Side-effect (「emitTasksChanged(projectId) → process.send → webContents.send('forge:events/tasks-changed')」) plus 「INSERT OR IGNORE」 and 「customSkillDirs」 — replace mechanism names with behavior statements.
3. [fact-alignment] ~15 outcome-level factual assertions carry no fact_id/UNKNOWN marking; three claims (WAL concurrency, gate fail-stop, customSkillDirs/forge:pipeline) sit outside the Fact Table unmarked — add per-outcome fact citations or UNKNOWN tags.
4. [completeness] Step 4 boundary gap — 「遇首个未解决失败即停」 asserted in Input, no Outcome validates it.
5. [anchor-integrity] Steps 1–5 empty anchor values with no frontmatter N/A adjudication (page: "" ×5).
6. [fixture-specification] Feature parent omitted in steps 3/4/5 while declared in 1/2/6; Project pseudo-field 「registered」; TaskEdge 「prerequisiteStatus」 derived-field naming.
7. [internal-consistency] Step-5 rejection Outcomes' fixture_specs omit TaskRecord while asserting 「不落部分审计」.

## Revision Priorities (for iteration 2)

1. Fix the step-2 2b/2c precondition overlap (largest single deduction, −30 across two criteria).
2. Add fact-id trace annotations to outcome blocks; mark the three extra-fact-table claims.
3. De-mechanize step-2 Side-effect / State and step-1 State.
4. Normalize Feature parent declaration across all fixture_specs; formalize empty anchors with N/A notes.
5. Add a step-4 fail-stop Outcome and an observable proxy for step-1's Output (blindspots 1–2).
