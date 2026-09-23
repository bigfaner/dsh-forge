# Journey Eval Report — iteration 2

- **Document**: `docs/features/dsh-forge-m2/testing/task-session-execution-loop/journey.md` (revised since iteration 1)
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, target 975, every dimension ≥ threshold)
- **Surface**: web (`.forge/config.yaml` `surfaces: web`; `rules/surface-web.md`); Web = balanced 50/50; mandatory derived outcomes: `validation-error` + `session-expired`
- **Scorer persona**: Senior QA Engineer (adversarial)
- **Verdict**: **PASS** — Total 1114/1150 (≥ 975) AND every dimension ≥ threshold (min scored dimension: Surface Fitness 135 ≥ 90)

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 196/200 | 120 | ✓ |
| 2. Semantic Purity | 196/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 147/150 | 90 | ✓ |
| 4. Fact Alignment | 145/150 | 90 | ✓ |
| 5. Surface Fitness | 135/150 | 90 | ✓ |
| 6. Internal Consistency | 150/150 | 90 | ✓ |
| 7. Workflow Coverage | 145/150 | 90 | ✓ |
| **Total** | **1114/1150** | 975 | **✓** |

---

## Iteration-1 resolution verification (required before scoring)

Every iteration-1 attack was checked against the revised text; none is claimed-resolved-but-unresolved.

| Iteration-1 finding | Status in revision | Evidence |
|---|---|---|
| Anchor A / 4c: hallucinated timeout-triggered `updating` (−30) | **RESOLVED** | Step 5b now asserts the opposite, grounded: "超时本身不触发任何专用看板状态——`updating` 仅在变更事件到达时点亮". Verified against ui-design.md:235 ("外部变更到达(≤5s 时效)"), task record 5.15 ("the updating highlight lights at EVENT ARRIVAL (pre-fetch)"), record 5.5 ("sync error is a toolbar light with a retry … keeps the last good board"). No new hallucination found. |
| Anchor B / 6b: 5 of 6 edge cases misanchored ("Step Nb" ≠ variant of Step N) | **RESOLVED** | Edges renumbered 3b/3c/3d/3e/5b/5c/6b; each verified against its base step: 3b–3e are all launch-chain variants of Step 3 ✓, 5b/5c reflow variants of Step 5 ✓, 6b a Step 6 variant ✓. Zero misanchors remain. |
| Anchor C / 4b: zero `source: inferred` annotations, zero `required_outcomes` citations | **RESOLVED** | Inline annotations present: 3b (`validation-error` mapping comment), 3c (`session-expired` mapping + inferred atomicity with Interface 5 basis), 3d (UNIQUE constraint + 4.2 supersede basis), 5b (updating/sync-error basis citing UF2 States / ui-design / 5.15 / 5.5), Invariant 5 (`source: inferred,推自 Interface 5 成功链序`). All citations verified to exist on disk. |
| 1b: Step 5 "User Action" carried an agent-autonomous action | **RESOLVED** | Step 5 User Action is now the approval: "用户在会话界面对该 claim 操作进行审批"; the agent action moved to Precondition ("agent 在会话中提出执行一次任务 claim(经 forge CLI)"). |
| 1c/5a: mandatory web outcomes present only as unlabeled analogs | **RESOLVED** | Explicit mapping comments at 3b and 3c reconcile both mandatory outcomes with the web rules (see 5a below). |
| 6a: invariant-4 self-contradiction (absolute ≤5s vs 3b premise) | **RESOLVED** | Invariant 4 now carries the degradation clause: "感知链健康时…破线为降级情形(见 Step 5b)——无专用超时状态,forge 文件恒为事实源,看板快照经重扫/重启重建收敛". |
| 7c: "从挂接条目进入会话" uncovered | **RESOLVED** | Step 7 added: "在任务详情的挂接条目点击'进入会话'" → "跳转主窗口会话界面并定位到该挂接会话(UF5 active 态'进入会话');从会话界面返回时回到任务看板(返回来源)" — both halves verified against prd-ui-functions UF5 states + Secondary Pages table. |
| Blindspot 1 (500-task scale mismatch) | **RESOLVED** | Step 1: "首屏 ≤2 秒(计时口径 = Setup 实际任务规模;500 任务规模上限的性能口径属 SC1 性能腿,不在本旅程 Setup 内)" — honest scoping. |
| Blindspot 2 (live-repo fixture mutation) | **RESOLVED** | Setup: "测试承载 = 一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理;本旅程含任务状态变更(claim),不得以生产仓为承载". |
| Blindspot 3 (cross-surface oracle unspecified) | **RESOLVED** | Setup: "跨面断言口径:…校验通道 = 测试进程直读 fixture forge 文件或 stub CLI stdout(浏览器侧不自行观测 CLI 输出)" — residual enumeration gap noted in 5c. |
| Blindspot 4 (mid-initiation crash untested) | **RESOLVED** | Step 3e added ("发起中途应用被杀"), claim covered by the now-annotated atomicity invariant. |
| Blindspot 5 (step-trigger controllability) | **RESOLVED** | Step 5 e2e note: "agent 动作不由 web 面驱动;以 fixture 任务文件变更 + FORGE_ACTOR 标记模拟 agent 的 claim". |

Sibling-journey delegation claims verified: `testing/task-board-browsing/` (board views/filters) and `testing/dual-form-consistency/` ([终端] marking, Story 3 AC2) exist, so those omissions remain legitimate decomposition.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Chain check**: problem (agent sessions disconnected from task assets) → solution (one-click launch + prompt injection + hooking persistence + reflow + re-entry) → evidence (PRD traceability block) → success criteria (per-step expected results with PRD-quantified bounds). Step-level tracing re-verified: Step 1 ← Story 1 AC1 verbatim; Step 2 ← Story 1 AC3/AC2 + UF3; Step 3 ← Story 2 AC1 + UF5 states + PRD perf (≤1 click / initiating / ≤3s); Step 4 ← Story 2 AC2 + SC3; Step 5 ← Story 3 AC1 + SC3 + prd-spec 会话线 ("审批走主窗口现有会话 UI"); Step 6 ← Story 2 AC3; Step 7 ← UF5 interaction flow 4 + nav table (entry + 返回来源). The journey genuinely exercises the user story it claims, including the previously-missing re-entry leg.

**Pre-score anchors**:

1. **Anchor A (annotations verify)**: every design/record citation in the revised comments resolves on disk — UNIQUE(project_id, task_key, session_id) at tech-design Data Models; supersede at record 4.2 ("Ended convergence = launcher-side supersede … supersede on re-launch") + 6.3 SC3-3 (active→ended history); Interface 5 success chain ("launch → sessionId → recordSessionLink"); 5.15 event-arrival updating; 5.5 sync-error toolbar with last-good board. The iteration-1 hallucination class is eliminated, not merely reworded.
2. **Anchor B (residual seams)**: two execution seams remain under-specified for a downstream web-e2e generator — the approval interaction (Step 5) and the session-links-index oracle (Step 6b) — while the agent-action seam got an explicit note. Charged under Surface Fitness 5c.
3. **Anchor C (fixture-composition class)**: Setup establishes scale/dependencies/prompt-availability but not the two conditional fixtures the text asserts against (worktree traces in Step 2; a no-prompt task for 3b). Outside rubric dimensions → blindspot.
4. **Anchor D (structure sound)**: 7 happy steps + 7 edges (High-risk density satisfied), all edges correctly anchored, five invariants each holding across all steps, golden path semantic and complete.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 196/200

**1a. Journey metadata (50/50)** — `task-session-execution-loop` kebab-case ✓; `risk_level: High` valid and justified (claim mutates task state via the approval chain; persistent 挂接索引 writes; spans process restart) ✓; `golden_path: true` consistent with Overview ✓; `surface_types: ["web"]` matches config ✓; sources list all three PRD files ✓; `generated` present ✓.

**1b. Steps complete with required fields (80/80)** — All 7 happy steps carry User Action + Expected Result in coherent order; every User Action is now a genuine user-level action (iteration-1's actor blur fixed). Criterion (action + ≥1 happy outcome + ordered sequence) fully satisfied.

**1c. Outcomes cover happy path + required derived scenarios (66/70)** — Mandatory web outcomes explicitly considered and mapped (see 5a); boundary coverage is rich across eligibility (3b), launch failure (3c), duplicate launch (3d), mid-init crash (3e), reflow degradation (5b), batch reflow (5c), multi-session history (6b). Dock −4: the loop's SC3 centerpiece assertion has no non-happy variant —

> "**Expected Result**: 消息包含 `forge prompt get-by-task-id` 的完整输出,零手工粘贴"

(Step 4) is happy-path only; 3c covers only *pre-session* failures ("dsh 宿主不可用或凭据异常"), while the session-created-but-injection-failed/partial path is a designed-for behavior (record 4.2: prompt replay-safety, tier-2 recovery, user retry). A downstream contract generator gets no boundary for the one assertion SC3 exists to prove (e2e 6.3 even asserts it character-for-character via hash).

### 2. Semantic Purity — 196/200

**2a. Natural language outcomes (78/80)** — No regex, selectors, or framework assertions anywhere; outcomes remain user/system-observable. Dock −2: Step 1's outcome is phrased as a verification oracle with a channel pointer — "任务数/状态/依赖与 `forge task list` 输出一致(校验通道见 Setup)" — PRD-verbatim and acceptable, but still mechanism-flavored rather than observation-flavored (same dock class as iteration 1, now reduced because the channel pointer resolves a real blindspot).

**2b. Preconditions declarative (60/60)** — Setup items and all edge preconditions are declarative states ("所选任务不存在执行 prompt(不满足发起条件)", "dsh 宿主不可用或凭据异常", "发起链进行中…时应用被强制退出或崩溃"). The Setup channel line declares a convention; it does not script procedure. Full marks.

**2c. No implementation coupling in steps (58/60)** — `forge prompt get-by-task-id`, `挂接索引` are PRD-verbatim domain terms; steps are user-level throughout; the agent's CLI execution is framed as a precondition state, not step mechanics. Dock −2: the Step 5 blockquote note embeds env-var/test mechanics inside the Happy Path section —

> "e2e 驱动面注记:agent 动作不由 web 面驱动;以 fixture 任务文件变更 + FORGE_ACTOR 标记模拟 agent 的 claim(tech-design SC2/SC3 e2e 腿口径)"

— the content is required (iteration-1 blindspot 5), but its placement belongs with Setup's channel conventions ("跨面断言口径…"), keeping Happy Path step bodies user-level. Purity/placement residual, not a content objection.

### 3. Precondition Exclusivity — 147/150

**3a. Distinct across outcomes (60/60)** — All seven edge preconditions are mutually distinct and specific: no-prompt (3b), host/credential failure (3c), one-active-link + re-launch (3d), mid-initiation kill (3e), claim-done-but-stale >5s (5b), multi-change stream ≤5s per change (5c), historical multi-session (6b). 5b vs 5c separated cleanly by the timing condition; 3d vs 6b separated by concurrent-launch vs historical-review states. No overlapping pair.

**3b. Sufficient to uniquely select (50/50)** — Given Setup + an edge precondition, exactly one outcome applies; 6b's state is even constructible via 3d, making the suite coherent. No ambiguous scenario found.

**3c. No missing preconditions for error/boundary outcomes (37/40)** — Every edge states its trigger. Dock −3: declaration discipline is inconsistent across *happy* steps — Steps 2, 3, 5, 7 carry explicit Precondition fields, but:

- Step 4 has none: "**User Action**: 查看该会话中 agent 收到的首条用户消息" — "该会话" is an anaphora whose antecedent (Step 3's launched session with the first message injected) is implied only by sequence;
- Step 6 has none: "重启应用,重新打开该任务详情" — depends undeclared on Step 3's 挂接 write ("挂接关系写入工作台自有状态").

Sequentially resolvable, but a downstream agent consuming steps in isolation cannot reconstruct the enabling state for exactly these two steps.

### 4. Fact Alignment — 145/150

**4a. Factual claims traceable (57/60)** — Traceability is now strong end-to-end and was spot-verified against disk: ≤2s scoped ← G1; ≤1 click/initiating/≤3s ← UF5 + PRD perf; ≤5s reflow + [会话] ← G3/SC3; entry-disabled-with-reason ← UF5 Validation Rules verbatim ("不满足时按钮禁用并说明原因"); error/recovery ← prd-spec 异常流 verbatim; multi-link + ended-supersede ← tech-design UNIQUE + record 4.2 + e2e 6.3; reflow-degradation semantics ← ui-design/5.15/5.5; Step 7 ← UF5 states + nav table. Dock −3: one citation paraphrase drifts from its cited source —

> "以 fixture 任务文件变更 + FORGE_ACTOR 标记模拟 agent 的 claim(tech-design SC2/SC3 e2e 腿口径)"

— tech-design's actual口径 is "模拟 agent claim(**forge CLI 真实执行**,带 FORGE_ACTOR)" (Testing §Key Test Scenarios). The paraphrase swaps real-CLI execution for direct fixture-file edit — a mechanism difference that matters to a generator (format fidelity; and per e2e record 6.3, direct file edit is the **[终端]**-marking leg: "直接改 fixture 任务文件 → ≤5s [终端] 徽标"). The appended claim "回流与来源断言不受模拟方式影响" does hold in Step 5's context, but only via Interface 3's judgment order ② (changed task has an active link → [会话]) — itself an unannotated inference.

**4b. Inferred claims have rule support + `source: inferred` (48/50)** — All major derivations now annotated with verifiable bases: 3c (Interface 5 chain ordering — verified: "成功链:launch → sessionId → recordSessionLink" and 4.2's "the link row is minted only AFTER launch succeeds"); 3d (UNIQUE + UF5/UF3 list model + 4.2 supersede — all verified); 5b (updating arrival-trigger + sync-error failure surface — verified). Dock −2: annotation locality — Step 3e's derived claim

> "**Expected Result**: 无半初始化挂接记录"

carries no inline annotation; its basis lives one section away in Invariant 5 ("挂接索引原子性…source: inferred,推自 Interface 5 成功链序"). Sibling edges 3c/3d annotate inline; 3e should mirror them so a reader of the edge alone sees the classification.

**4c. No hallucinated unclassified claims (40/40)** — The single hallucination from iteration 1 is gone and its replacement is source-verified in the correct direction (timeout triggers nothing; sync-error is the failure surface). No new unclassified claims found: every previously-suspicious assertion now carries either a traceable source or an inferred annotation.

### 5. Surface Fitness — 135/150

**5a. Mandatory derived outcomes present (56/60)** — Both mandatory web outcomes are now explicitly considered with labeled mapping comments: 3b ("surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,按 UF5 校验规则映射为前置不满足的入口禁用 + 原因说明") and 3c ("session-expired → 宿主不可用/凭据失效使会话通道不可用,呈现为 UF5 error(发起失败)态 + 恢复引导"). Both mappings are sound: the analogs carry the rule's assert elements (message + no side effects + retry/recovery accessible). Dock −4: the session-expired consideration is applied only at the *initiation* point; the same host/credential failure class at the *re-entry* point — Step 7 "跳转主窗口会话界面并定位到该挂接会话" — has no analog, although re-entry is now an explicit step of this loop.

**5b. Test strategy proportions (47/50)** — Balanced 50/50 well served: 7 journey-level happy steps + 7 edge outcomes, with the hot step (Step 3) carrying four contract-grade alternates and Step 5 two. Dock −3: edges remain single-scenario/single-outcome; one contract-grade alternate on the injection assertion (Step 4) would complete the contract side (ties to the 1c dock).

**5c. Realistic web environment/execution assumptions (32/40)** — Much improved: isolated fixture + userData + cleanup; declared cross-surface oracle channel; explicit driving seam for the agent action; async windows (≤3s interactivity, ≤5s reflow), restart handling. Dock −8 for two residual seams:
- (−5) Step 5's user action has no driving seam while the agent action got one: "用户在会话界面对该 claim 操作进行审批(审批走主窗口现有会话 UI)" — the approval lives in the upstream-inherited session UI; the e2e note covers only "agent 动作不由 web 面驱动…模拟 agent 的 claim" and is silent on how a browser-level driver performs or observes the approval, especially under the stubbed session chain the cited口径 prescribes;
- (−3) Step 6b's oracle sits outside the Setup channel enumeration: Setup declares "校验通道 = 测试进程直读 fixture forge 文件或 stub CLI stdout" (three oracles: task-list consistency / injection content / final state), but 6b asserts "与挂接索引(工作台自有状态)一致" — a fourth oracle (session_links in workbench.db) with no declared read channel.

### 6. Internal Consistency — 150/150

**6a. Invariants hold in every step (60/60)** — All five invariants verified against all steps and edges: read-only board (no step or edge grants a human write path; 3b explicitly asserts "不发起任何会话、不写入挂接索引"); forge SoT (挂接 writes only to workbench-owned state, asserted again in 3d "forge 数据不受影响(挂接为工作台自有状态)"); per-change source marking; reflow SLA now scoped with its degradation clause, exactly matching 5b's semantics ("无专用超时状态,forge 文件恒为事实源,看板快照经重扫/重启重建收敛"); hooking atomicity consistent with 3c/3e. No violation found.

**6b. Cross-step references consistent (50/50)** — Edge numbering now correctly anchors every variant to its true base step (verified individually); "该会话/该任务" anaphoras resolve unambiguously in sequence; 6b's state is constructible via 3d. Iteration-1's misanchoring is fully cured.

**6c. Risk level consistent (40/40)** — High remains correct: task-state mutation through the approval chain, persistent 挂接索引 writes, restart-spanning behavior.

### 7. Workflow Coverage — 145/150

**7a. Golden Path existence (60/60, veto not triggered)** — Seven contiguous domain-level steps semantically matching prd-spec §Business Flow 会话线 and SC2/SC3, extended through re-entry (UF5 flow 4). Steps reference domain operations ("发起会话", "审批", "回溯挂接"), not HTTP/API mechanics. Semantic verification performed against Stories 1–3 and UF5.

**7b. Multi-step coverage depth (48/50)** — Deep: state transitions (claim → transition → submit in 5c), session-link lifecycle (initiating → active → ended → history), cross-entity hooking, persistence across restart, concurrency (3d), batch reflow (5c), failure recovery with retry (3c), mid-initiation crash recovery (3e), approval as a first-class user action, re-entry with return-target semantics. Dock −2: the approval's own session-UI feedback is never observed — Step 5's outcome confirms the approval only via its board consequence ("审批通过后 agent 完成 claim,看板 ≤5 秒内…"), leaving the in-session half of the one interaction where the user acts inside the session line unasserted.

**7c. Workflow completeness against PRD scope (37/40)** — Within the journey's claimed loop (UF2/UF3/UF5, Stories 1–3, SC2/SC3) coverage is now complete: launch, injection, approval, reflow, restart persistence, history, re-entry all exercised; board views/filters and [终端] marking correctly delegated to existing sibling journeys. Dock −3: Story 1 AC2 is nominally claimed but not executable as specified — Step 2's conditional clause

> "若任务在非默认 worktree 有执行痕迹,worktree 标识可见"

requires a fixture task with non-default worktree traces, which Setup ("含 ≥10 个任务、含依赖关系" + one executable task with prompt) never establishes; the AC's coverage is therefore on-paper only (see blindspot 1).

### Cross-dimension coherence check

- The Steps-4/6 implicit-precondition defect is charged once, under Precondition Exclusivity 3c (−3); it is NOT re-charged in 1b (criterion satisfied: action + outcome present) or 6b (anaphoras resolve unambiguously — the dangling/misanchored class is cured).
- The injection-boundary gap legitimately spans two facets: Completeness 1c (missing boundary outcome) and Surface Fitness 5b (contract-side depth); each sub-score reflects its own facet.
- Surface Fitness 5c's approval-seam dock and Workflow Coverage 7b's approval-observation dock are distinct facets (drivability vs assertion depth) of different criteria; the blindspot-tagged general criterion (every user action needs a controllable seam) costs no points.
- Fact Alignment 4a's paraphrase-drift dock covers the simulation-mechanism claim once; 4c charges nothing there because the underlying sources exist and the direction of the claim is correct.
- Semantic Purity is NOT docked for the content of the Setup channel line or the e2e note's existence (both resolve iteration-1 blindspots and are declaratively framed); the only purity dock on the note is its placement inside Happy Path (2c), a different facet from 5c's seam-content dock.

---

## Phase 3 — Blindspot Hunt ([blindspot] = outside all rubric dimensions)

1. **[blindspot] Fixture-composition assertions are untriggerable under the declared fixture.** Setup establishes scale, dependency structure, and prompt availability, but two asserted clauses need fixture states never declared: (a) Step 2 "若任务在非默认 worktree 有执行痕迹,worktree 标识可见" — no worktree-trace task is established; (b) Step 3b's trigger "所选任务不存在执行 prompt(不满足发起条件)" — Setup guarantees a *with-prompt* task ("存在至少一个处于可执行状态且有执行 prompt 的任务") but never a *without-prompt* one. A downstream runner assembling the fixture from Setup alone cannot execute these two clauses; the worktree AC (Story 1 AC2) silently goes untested. Iteration-1's scale blindspot (same class) was fixed; these residual instances were not. *Fix: extend Setup's fixture spec (≥1 task with non-default worktree traces; ≥1 task without execution prompt) or scope the clauses out explicitly.*

2. **[blindspot] "Every user action needs a controllable trigger/seam" is still not a rubric criterion.** Iteration-1 blindspot 5 raised trigger controllability; the reviser fixed the one instance (agent claim) but the general criterion remains unowned — Step 5's approval ("用户在会话界面对该 claim 操作进行审批(审批走主窗口现有会话 UI)") is a user action in an upstream-inherited UI region with no stated driving policy, and no rubric dimension names this class. The related 5c dock covers environment realism only; the criterion gap itself persists for future journeys.

3. **[blindspot] Frontmatter `sources` is stale relative to the body's actual citations.** The revised body grounds claims in "tech-design"(3c/3d/Step 5 note), "ui-design 回流态/实现记录 5.15/实现记录 5.5"(5b), "已落地 4.2 supersede(e2e sc3 断言)"(3d) — none of which appear in frontmatter sources, which still list only the three PRD files. Traceability works because citations are inline and resolvable (all verified), but a tooling consumer reading only frontmatter would miss the design/record provenance. No rubric dimension checks frontmatter-vs-body source consistency. *Fix: extend `sources` or add a `citations` field.*

---

## Verdict

All iteration-1 attacks resolved with verifiable sources; remaining deductions (36 pts total) are concrete, quoted, and concentrated in execution-seam specification (Surface Fitness) and minor declaration/annotation discipline. No hallucinated claims, no invariant violations, no precondition overlaps, golden-path veto not triggered.

**Final: 1114/1150 — PASS (total ≥ 975; every dimension ≥ 90).**
