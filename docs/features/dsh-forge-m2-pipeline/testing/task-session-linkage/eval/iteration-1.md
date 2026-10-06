# Eval Report: journey/task-session-linkage — Iteration 1

- **Eval type**: journey (rubric scale 1150, target 975, every dimension ≥ min threshold)
- **Surface**: web (rule: `gen-journeys/rules/surface-web.md`)
- **Scorer stance**: adversarial; every deduction cites the document
- **Date**: 2026-10-07

## Final Score

| Dimension | Score | Min Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 186/200 | 120 | YES |
| 2. Semantic Purity | 170/200 | 120 | YES |
| 3. Precondition Exclusivity | 136/150 | 90 | YES |
| 4. Fact Alignment | 128/150 | 90 | YES |
| 5. Surface Fitness | 133/150 | 90 | YES |
| 6. Internal Consistency | 138/150 | 90 | YES |
| 7. Workflow Coverage | 132/150 | 90 | YES |
| **Total** | **1023/1150** | **975 + all thresholds** | **YES** |

**Verdict: PASS.** Total 1023 ≥ 975 and every dimension clears its threshold. The document is a strong revision: it resolves the prior defect class (surface conflation, unexercised 执行 pill, dangling referent, missing derived-outcome adjudication, missing inferred annotations) and adds real boundary depth (N=2 edge, re-claim dedup, live-update). Remaining deductions concentrate on one unverified executability assumption (Step 5), mechanism leakage into outcomes, an invariant contradicted in letter by Step 3e, and residual task-side boundary gaps.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Problem → Solution is faithful.** Story 6 demands bilateral visibility (task side sees sessions, session side sees tasks). The 5-step happy path delivers exactly that: task-side count (Step 1) → task-side typed display (Step 2) → dispatcher-side 派发 pill (Step 3) → pill navigation (Step 4) → executor-side 执行 pill + session-switch reactivity (Step 5). Spot-checks against sources verify nearly verbatim: 「dock 开概览 tab + 切到任务子 tab + 选中 feature + 任务抽屉打开」= UF-3 item 3; 「≤2 并排；>2 显示 +N 溢出菜单」= UF-3 item 2; 「pill 随 session id 变化」= UF-3 item 4; dual-source typing = Story 6 AC1 / SC6③ / `sessionLinks` (links ∪ records.session_id).
2. **Risk classification is sound.** Every user action is viewing or navigation; invariant 2 pins 「不写库、不造挂接」. Low is correct per the stated criteria (read-only/observational).
3. **Evidence → criteria is mostly strong but introduces one new unverified assumption.** Step 5's 「切换到 executor 匿名子会话查看会话头部」 presumes the anonymous sub-session is reachable/switchable in the web conversation UI. The Overview cites S8 as grounding, but S8 proved tool-context id obtainability and distinctness — its record explicitly notes the sub-session 「无独立持久化目录」 with persistence outside the assertion surface. UI listability is established nowhere in the cited sources, and the claim is not marked UNKNOWN.
4. **Self-contradiction (letter-level).** Invariant 2 states 「本旅程一切 claim/submit 均为前置状态而非用户动作」, but Step 3e's precondition 「该会话随后完成对 X 的一次 claim」 places a claim *during* the scenario — a mid-scenario stimulus, not a precondition state. The spirit (user face stays read-only) holds; the letter does not.
5. **Derived-outcome adjudication is now present and reasoned.** Both web-mandatory outcomes get explicit N/A rulings citing the surface rule and the read-only invariant — the prior iteration's gating failure is resolved.

---

## Phase 2 — Dimension Scoring

### 1. Completeness — 186/200

**Metadata (50/50).** Frontmatter complete: kebab-case name, `risk_level: "Low"` (justified — purely observational content), `golden_path: false` (feature-level golden path lives in the sibling dispatch journey; semantic golden path verified under Workflow Coverage), `surface_types`/`surface_keys: ["web"]`, five `sources` all verified on disk (prd-user-stories / prd-spec / prd-ui-functions / tech-design / schema.sql), `generated` date.

**Steps complete (76/80).** All 5 happy steps and all 5 edge steps carry the required fields (Precondition/User Action/Expected Result as applicable) and form a coherent ordered progression (task side → session side → navigation → reactivity → boundary). Deductions:
- Step 1 opens in media res — 「在概览任务子 tab 列表视图查看该任务行的副行」 embeds the UI location in the action, but Setup establishes no starting UI state (which tab is open, which feature selected); a downstream e2e author must infer the entry state (−2).
- Step 4's 「点击会话头挂接 pill」 leaves the acting session implicit from Step 3 context rather than naming it (−2).

**Happy + required derived scenarios (60/70).** Happy path fully covered; boundary set is genuinely deep for a read-only feature: overflow + menu interaction (3b), exact N=2 edge (3c), idempotent re-claim dedup (3d), live pill update on new claim (3e), empty session (5b); both web-mandatory derived outcomes adjudicated with reasoning. Deductions:
- **Task-side zero-link boundary absent.** 5b covers the session side (「无挂接 pill 展示」), but a task with no links and no records — what the 副行's 挂接 element shows (0? omitted?) — has no outcome. The symmetric task-side empty state is untested (−5).
- **Executor-side pill click navigation never exercised.** 「点击会话头挂接 pill」 runs only on the dispatcher session (Step 4) and via the overflow menu (3b, also dispatcher); the 执行-typed pill's navigation parity is asserted nowhere (−3).
- **Cross-surface numeric agreement untested.** Step 1's 「挂接计数（挂接会话数汇总）」 and Step 2's typed entries describe the same linkage data in two forms; no outcome asserts the count agrees with the drawer's entry count — a TaskCard count bug (e.g., links-only, ignoring records) passes both steps individually (−2).

### 2. Semantic Purity — 170/200

**Natural language, no code/regex (70/80).** No regex, CSS/XPath selectors, or framework assertion calls anywhere. Deduction: outcomes embed verification methodology and refresh mechanics rather than pure observation — Step 2 「两侧会话 id 相异可判」 (judge-language), Step 3 「与库中挂接行一致」, 3e 「事件订阅驱动的即时刷新——写入返回后单次重取即见新值，时延有界」 (refresh pipeline mechanics inside an Expected Result). The dual-source wording is PRD-mandated (SC6③'s own language), which keeps this from scoring lower (−10).

**Preconditions declarative (52/60).** Setup and most edges are clean states (「dispatcher 会话挂接任务数 >2」, 「会话从未 claim 过任何任务，亦无以其为执行会话的审计行」). Deductions:
- 3e's precondition contains a temporal stimulus, not a state: 「该会话随后完成对 X 的一次 claim」 — "随后" places the claim after the precondition moment; the applicable state at scenario start is only half-defined (−5).
- 3d's precondition embeds the schema mechanism's effect as if observed setup fact: 「同会话对 T 二次 claim（幂等重入，挂接表 UNIQUE 约束不增行）」 (−3).

**No implementation coupling in steps (48/60).** User actions are clean UI operations, but outcomes/preconditions carry table names (Setup: 「挂接表 task_session_links 与审计 task_records 已在每工作区库」; invariant 1 column-level mapping), write-verb mechanics (Step 3 「该会话的挂接来源 = claim 写入的挂接表行」; Step 5 「submit 落审计行的会话 id」), and the event-subscription pipeline (3e). Much of this is inherited from SC6③/tech-design's dual-source discipline — extraction-faithful but coupling nonetheless (−12).

### 3. Precondition Exclusivity — 136/150

**Distinctness across outcomes (56/60).** The edge set is well-partitioned by link count (0 / 1 / =2 / >2) and by history (re-claim, rendered-then-claim); 5b's 「亦无以其为执行会话的审计行」 cleanly excludes the executor session. Deduction: 3b (>2 links, accumulated claims) and 3d (re-claim of an already-linked task) can co-occur in one session state; their outcomes are compatible so no conflict arises, but the journey gives no combination note, leaving a co-occurrence state formally matching two edges (−4).

**Sufficient to uniquely select (46/50).** Each edge selects uniquely given its declared precondition. Deduction: 3e's temporal phrasing (「已渲染且尚未挂接任务 X；该会话随后完成……」) blurs *when* the outcome applies — at render time or after the claim — forcing the reader to reconstruct the two-phase timeline (−4).

**Missing preconditions for error/boundary outcomes (34/40).** All five edges state explicit triggers — a real strength. Deduction: Step 4 hides a boundary condition inside the Expected Result instead of stating it as a precondition — 「即使概览当前停在另一 feature 亦切至该任务的 feature」 — so the stimulating state (overview pre-positioned on a different feature) is never operationalized as a testable setup; a runner following preconditions alone would not establish it (−6).

### 4. Fact Alignment — 128/150

**Factual claims traceable (47/60).** Document-level traceability is solid: all five sources exist; the Overview's citations (Story 6 / 流程四 / SC6③ / UF-3 / S8) verify; Steps 1–4 map to TaskCard 副行承重挂接计数, TaskDetail sessions 双源分型, Story 6 AC2, UF-3 items 2/3/4 respectively; 3e's refresh criterion paraphrases tech-design's write-push event chain (「写入返回后单次重取即见新值」+ 500ms bound). Deductions:
- **Step 5's UI-reachability presumption (−8).** 「切换到 executor 匿名子会话查看会话头部」 — no cited source establishes that an anonymous sub-session appears as a switchable conversation in the web UI; the S8 record cited via the Overview notes the sub-session runs on an in-process driver with 「无独立持久化目录」 and left persistence outside its assertion surface. The claim is neither traceable nor marked UNKNOWN.
- **Step 4's unannotated elaboration (−3).** 「即使概览当前停在另一 feature 亦切至该任务的 feature」 extends UF-3 item 3's bare 「选中 feature」 into a conditional behavior without inference annotation.
- **Step 1's count semantics imprecise (−2).** 「挂接计数（挂接会话数汇总）」 — the implemented semantics are 双源去重 (links ∪ records.session_id, per the read-facade record); 「汇总」 reads as a sum and could mislead a contract test into non-dedup counting.

**Inferred claims with rule support + `source: inferred` (46/50).** The annotation mechanism is now used and used well: 3b cites UF-3 items 2+3, 3c cites the item-2 boundary value, 3d cites schema `UNIQUE(task_id, session_id)` (verified in schema.sql), 5b cites direct-read + UF-3 item 4. The Derived Outcomes section cites the surface rule by name and adjudicates both mandatory items with reasoning. Minor looseness: the inferred annotations cite UF-3/schema bases rather than surface-rule triggers (acceptable here since the mandatory surface items were adjudicated N/A rather than derived), and 3e — mechanically the closest thing to a loading-state derivation — is presented unannotated (it is traceable to tech-design, so it counts as factual) (−4).

**No hallucinated unclassified claims (35/40).** No claim contradicts the sources; the prior unclassified extrapolation (「不渲染空占位」) is now properly inferred-annotated. Deduction: Step 5's reachability assumption and Step 1's 「汇总」 interpretation are unclassified assumptions presented as plain fact (−5).

### 5. Surface Fitness — 133/150

**Mandatory derived outcomes (55/60).** Both web-mandatory outcomes are explicitly considered with reasoned N/A rulings that cite the rule («依 gen-journeys surface-web 规则 Required Outcome Reference……逐项裁决»): validation-error — 「无表单、无输入、无提交路径」 (accurate); session-expired — 「产品为本地单人工作台，无登录态与服务端会话凭据」 (accurate per design). This clears the rule's consideration bar. Deduction: neither ruling maps to any executable adjacent outcome — the async territory is partially covered by 3e, but the nearest error boundary is dismissed in one clause (「工作区库不可达 → 概览错误态）不在本旅程面内」) rather than assigned to any widget or outcome (−5).

**Test strategy proportions (42/50).** Balanced 50/50 is reasonably reflected: journey-smoke depth (cross-surface navigation, drawer, pill→overview→feature→drawer chain, session switching) plus contract-flavored variations (boundary value 3c, idempotency 3d, eventual consistency 3e, empty 5b, overflow interaction 3b). Deductions: the journey-smoke half's one hole is executor-pill navigation (untested); the contract half lacks cross-surface count↔entries agreement and the task-side zero state (−8).

**Environment/execution assumptions realistic (36/40).** Browser-realistic throughout: dock tabs, drawer, pills, overflow menu, and 3e's observational framing 「停留在该会话头部观察（不切换会话、不重开页签）」 is exactly how a live-update e2e should hold context. The direct-read settle condition (「写入返回后单次重取即见新值，时延有界」) gives an executable wait criterion, though no explicit wait-strategy is framed and Step 5's navigation assumes unverified sub-session listability (−4).

### 6. Internal Consistency — 138/150

**Invariants hold in every step (52/60).** Invariants 1/3/4/5 hold across all ten scenarios; read-only substance holds everywhere (3e's user merely observes). One letter-level defect: invariant 2's 「本旅程一切 claim/submit 均为前置状态而非用户动作」 is contradicted by 3e, where the claim is a mid-scenario event (「该会话随后完成对 X 的一次 claim」) — neither a precondition (it happens after render) nor a user action. The invariant's intent survives; its statement does not. Treated as a partial inconsistency, not a behavioral violation (−8).

**Cross-step references consistent (46/50).** Prior dangling references are resolved: Step 5's target is pinned (executor sub-session from Setup); 5b's subject is unambiguous — its own precondition (「亦无以其为执行会话的审计行」) excludes the executor session and points to Setup's provisioned third session (「另有一个从未 claim 过任何任务的会话在场（供无挂接场景）」 — Setup even labels its purpose). Deductions: Step 4's pill referent is implicit from Step 3 context (−2); edges 3b/3c/3d require fixture state beyond Setup's single dispatch with no global note that edge preconditions extend Setup (each edge self-declares its state, which mitigates) (−2).

**Risk level consistent (40/40).** Low = read-only/observational; every action is a view or navigation click; the journey pins 「不写库、不造挂接」. Exact match.

### 7. Workflow Coverage — 132/150

**Golden Path existence (55/60, no veto).** Five contiguous steps cover PRD Story 6 end-to-end with domain-level user operations (查看副行 / 打开详情抽屉 / 查看会话头部 / 点击挂接 pill / 切换会话), semantically mapped to Story 6 AC1+AC2, 流程四, and UF-3's interaction flow. No API-level step descriptions. Deduction: the path's final step rests on the unverified reachability assumption (Step 5) — if the anonymous sub-session is not UI-listed, the path breaks at its last step with no stated fallback (−5).

**Multi-step coverage depth (41/50).** Genuinely cross-entity and bidirectional (task↔session in both directions), with navigation chaining into the overview tab/feature selection/drawer, and five meaningful display-variation edges (boundary value, idempotency, eventual consistency, empty, overflow interaction) — strong for an inherently stateless (read-only) scope. Deductions: executor-pill click navigation, task-side zero-count display, and cross-surface numeric agreement are absent (−9).

**Workflow completeness against PRD/Design scope (36/40).** Story 6 AC1 → Steps 1–2 ✓; AC2 → Steps 3/5 ✓; UF-3 items 1/2/3/4 → Steps 3+5 / 3b+3c / Step 4+3b / Step 5 ✓; 流程四's two clauses ✓; SC6③ dual-source ✓ on both sides. Gaps: UF-3 item 3's navigation semantics exercised only from the dispatcher pill and the overflow menu, never from an 执行-typed pill; the list-side display is correctly kept count-only (matching TaskCard's contract — no false coverage) (−4).

**Cross-dimension coherence check.** Scope (bilateral visibility) ↔ steps (both sides) ↔ invariants (read-only, direct-read, dual-source) are mutually consistent; the Derived Outcomes adjudication correctly leans on invariant 2 for its validation-error reasoning. The one cross-section wrinkle — the session-expired ruling scopes the DB-unreachable error to the 概览 while the journey's own widgets (pills / 挂接区 / 副行计数) issue their own queries against the same DB — is handled as blindspot #3 below.

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] Step 5 has no fallback assertion path if the anonymous sub-session is not UI-reachable.** 「切换到 executor 匿名子会话查看会话头部」 — the journey stakes its only 执行-pill session-header verification on navigating to a session whose UI listability no cited source establishes (S8 proved tool-context id obtainability; its record notes the sub-session has no independent persistence directory). A downstream Playwright author whose conversation list lacks the sub-session has no instructed alternative (e.g., assert the 执行 typing via the drawer's entries or the `sessionLinks` payload). Reasoning audit flagged this independently of dimension scoring; Fact Alignment scores the truthfulness aspect — this attack targets the executability consequence: pin the reachability (ground it or mark UNKNOWN) and provide a fallback assertion route.
2. **[blindspot] 3e's outcome silently degrades if the fixture seeds the link row directly.** 「该会话随后完成对 X 的一次 claim」 + 「任务 X 的 pill 在当前头部出现（事件订阅驱动的即时刷新——写入返回后单次重取即见新值，时延有界）」 — the asserted immediate refresh depends on the claim riding the real verb closure (which emits the tasks-changed event); a DB-seeded link row fires no event, and the test would either false-fail or, worse, false-pass on a remount-driven update that exercises no reactivity. The journey never pins the injection channel. Must state: the claim goes through the real claim verb (tool/dispatch path), not a fixture insert.
3. **[blindspot] The widget-under-test error path is dismissed by mis-scoping to the overview.** 「最邻近的可用性边界（工作区库不可达 → 概览错误态）不在本旅程面内」 — the ruling points at the *overview's* error state to rule the boundary out of face, but this journey's subjects (session-header pills, drawer 挂接区, 副行挂接计数) each issue their own queries against the same per-workspace DB; their unreachable-DB behavior (error pill area? stale count? silent empty?) is unspecified and untested — the classic untested-error-path pattern for exactly the widgets under test.
4. **[blindspot] The feature-switch boundary is asserted but never operationalized.** 「即使概览当前停在另一 feature 亦切至该任务的 feature」 (Step 4) — this is the state-carryover/residue bug class that invariant 3 itself worries about (「无跨会话残留」), yet no step or edge ever establishes the stimulating state (overview pre-positioned on a different feature) as a precondition; the condition lives only as a parenthetical inside an Expected Result, so the residue bug it exists to catch remains untested as written.

---

## Attack Summary (what must improve)

1. **[fact-alignment]** Ground or UNKNOWN-mark Step 5's reachability assumption — 「切换到 executor 匿名子会话查看会话头部」 — and give the e2e a fallback assertion path for the 执行-typed display.
2. **[internal-consistency]** Reword invariant 2 — 「本旅程一切 claim/submit 均为前置状态而非用户动作」 — to admit 3e's mid-scenario background claim (「该会话随后完成对 X 的一次 claim」), e.g., "非本旅程用户动作；3e 的 claim 为经真实动词通道的外部事件".
3. **[semantic-purity]** Move refresh mechanics out of the Expected Result — 「事件订阅驱动的即时刷新——写入返回后单次重取即见新值，时延有界」 — and confine table/column references to annotations.
4. **[completeness]** Add the task-side zero-link boundary and a cross-surface agreement outcome (「挂接计数（挂接会话数汇总）」 vs drawer typed entries); pin the count's 双源去重 semantics.
5. **[workflow-coverage]** Exercise pill-click navigation from an 执行-typed pill (or fold into the Step 5 fallback path).
6. **[blindspot]** Pin 3e's claim injection to the real verb path; assign (or explicitly rule out with widget-level reasoning) the DB-unreachable behavior of the pills/挂接区/副行; operationalize Step 4's feature-switch condition as an actual precondition.
