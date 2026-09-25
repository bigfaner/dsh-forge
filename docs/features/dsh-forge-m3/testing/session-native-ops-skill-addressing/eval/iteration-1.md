# Eval Report — Journey: session-native-ops-skill-addressing (Iteration 1)

- **Rubric**: journey (1150 pts, 7 dimensions, target ≥975, per-dimension min thresholds)
- **Expert persona**: Senior QA Engineer
- **Surface**: web (scored against `gen-journeys/rules/surface-web.md`)
- **Document**: `docs/features/dsh-forge-m3/testing/session-native-ops-skill-addressing/journey.md`
- **Iteration**: 1 (no previous report)
- **Date**: 2026-09-24

## Verdict

**980 / 1150 — PASS** (total ≥ 975; every dimension above its min threshold; margins are thin on Fact Alignment and Surface Fitness)

| Dimension | Score | Min | Status |
|---|---|---|---|
| 1. Completeness | 172/200 | 120 | PASS |
| 2. Semantic Purity | 182/200 | 120 | PASS |
| 3. Precondition Exclusivity | 131/150 | 90 | PASS |
| 4. Fact Alignment | 120/150 | 90 | PASS (thin) |
| 5. Surface Fitness | 110/150 | 90 | PASS (thin) |
| 6. Internal Consistency | 137/150 | 90 | PASS |
| 7. Workflow Coverage | 128/150 | 90 | PASS |
| **Total** | **980/1150** | **975** | **PASS** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Problem → Solution**: The journey addresses Story 9 (会话内原生操作与技能寻址) directly: read-only query (Step 1), claim (Step 2), submit (Step 3), 15-skill flat-name addressing (Step 4), plus tool-unavailable degradation (Step 1b). It does not solve an easier substitute problem.

**Solution → Evidence**: Traceability claims were independently verified against sources — all check out:
- The 15-skill list in Setup matches prd-spec 技能迁移划分表 exactly (6 核心执行闭环 + 6 管线创作系 + 3 生成系; counted = 15, zero mismatch).
- D2/D4/D5 citations match the PRD 裁决表; ≤5s 回流 matches DF004 / BIZ-workbench-005; actor 标识 (FORGE_ACTOR 语义延续) matches DF003; 7-态状态机 matches prd-spec In Scope.
- proposal.md Key Scenarios 「agent 会话内查询」(L70)、「技能原生寻址」(L71)、「错误路径…dsh tool 不可用时的会话降级提示」(L76) all exist as quoted.
- Step 4b matches prd-spec 暂缓迁移 row verbatim in substance ("外部会话(冻结 CC 插件)继续可用,已注册项目 dsh 会话缺席不阻断").

**Evidence → Success Criteria**: Step 4 asserts "全部解析成功" — resolution-level, which mirrors Story 9 AC and SC1 wording, but as a QA matter resolution is a weak proxy for skill *executability* (see blindspot #3).

**Self-contradiction check / Invariant audit**: All 4 declared invariants hold across every happy step and edge case — no step spawns CLI, mutations leave actor traces, tool-unavailability never silently fails, illegal changes are rejected. No SC/InScope contradiction structure exists in a journey document; the analogous check (invariants ↔ steps) passes. One elision found: Step 3 says "agent 完成执行后" but no step establishes execution (detailed under Internal Consistency).

**Pre-score anchors channeled into dimensions/blindspots**: execution elision (→ Internal Consistency); mixed annotation discipline (→ Fact Alignment); Steps 1/4 lacking browser-observable outcomes (→ Surface Fitness); serial single-actor flow (→ blindspot #2).

---

## Phase 2 — Rubric Scoring (verification stance)

### 1. Completeness — 172/200

**1a. Journey metadata complete — 50/50**
- `journey: "session-native-ops-skill-addressing"` — kebab-case ✓; `risk_level: "High"` valid and justified by content (claim/submit state mutations + audit semantics match the stated "High = state mutation" criterion) ✓; sources/generated/surface fields present ✓. No gap found.

**1b. Steps complete with required fields — 68/80**
- All 4 happy steps have User Action + Expected Result; all 5 edge cases have Precondition + User Action + Expected Result; sequence is coherent and ordered.
- Deduction −6: Step 3's outcome rests on an off-screen phase — "**User Action**: agent 完成执行后,指示其提交(submit)任务" — the execution that produces the record asserted in "**Expected Result**: …执行记录可渲染" is never established by any step; a downstream test-script generator receives no instruction for what "完成执行" means.
- Deduction −6: Step 4b's outcome is not concretely observable — "已注册项目 dsh 会话内该技能缺席不阻断(无错误级失败)" — what the user/agent *sees* when a deferred skill is absent (message? omission? no-op?) is unspecified, so "缺席不阻断" cannot be asserted unambiguously.
- Deduction −6 (criterion 1b/1c boundary): Step 1's "(看板同口径)" is vague — the assertion "查询结果与数据内核一致(看板同口径)" names two comparison targets without defining the compared fields or which surface presents them.

**1c. Outcomes cover happy path + required derived scenarios — 54/70**
- Happy path outcomes present for every step ✓. session-expired mandatory outcome is present and explicitly mapped (Step 1b mapping comment) ✓.
- Deduction −10: validation-error (mandatory for web) has **no mapping annotation anywhere** — Steps 2b/2c are its natural carriers (invalid operation → clear error, state unchanged) but neither carries the `required_outcomes 映射` comment that Step 1b carries, and the web rule's "user can correct and retry" element is absent from both.
- Deduction −6: QA-thin error surface for a mutating journey — no not-found outcome (agent queries/claims a nonexistent task id), no concurrent-claim outcome (surface-web lists `concurrent-edit` as a common web boundary; this feature's historical core risk was multi-writer contention).

### 2. Semantic Purity — 182/200

**2a. Outcome descriptions use natural language — 76/80**
- Zero regex patterns, CSS/XPath selectors, or framework assertion calls across all outcomes ✓. Outcomes describe observations ("任务状态回流看板 ≤5s", "项目仓零新增文件").
- Deduction −4: some outcomes name internal mechanisms rather than observations — "技能经 customSkillDirs 配置路径承载,项目仓零新增文件" and "(记录渲染入内核)" describe carrier/implementation machinery; the observable halves (flat-name resolution, zero repo files) stand alone and would be cleaner.

**2b. Preconditions are declarative — 52/60**
- Edge preconditions are declarative states ✓ ("dsh tool 暂不可用(宿主/插件面缺席)", "目标任务当前状态不允许该操作(状态机 7 态约束外)").
- Deduction −8: Setup mixes in procedural fixture-preparation phrasing — "备一个可执行任务(带执行 prompt)用于 claim/submit" — an instruction to the test author, not a state that holds (compare sibling journey's declarative "fixture 内含 ≥3 个…任务"). Template requires Setup = environment states, not actions.

**2c. No implementation coupling in Step descriptions — 54/60**
- Steps describe domain-level operations (查询/claim/submit/扁平名调用) using PRD domain terminology ✓.
- Deduction −6: expected results lean on design-level machinery — "customSkillDirs 配置路径承载"、"状态机 7 态约束外"、"(记录渲染入内核)" couple the journey to the carrier design (D2) and kernel internals rather than user/system-observable behavior; PRD-level terms, but borderline for downstream contract derivation.

### 3. Precondition Exclusivity — 131/150

**3a. Preconditions distinct across Outcomes — 55/60**
- All five edge preconditions are semantically distinct concepts (channel down / state disallows / deps unmet / both ops done / deferred skill invoked). No two outcomes share equivalent preconditions.
- Deduction −5: Step 1b's "dsh tool 暂不可用(宿主/插件面缺席)" bundles two distinct failure origins (host absent vs plugin surface absent) into one precondition, implying one outcome for potentially different degradations.

**3b. Preconditions sufficient to uniquely select an Outcome — 38/50**
- Deduction −12: the Step-2 variant pair can co-occur — "目标任务当前状态不允许该操作(状态机 7 态约束外)" (2b) and "任务依赖未满足(blocker 未终态)" (2c) are not mutually exclusive; a task can be both non-claimable and dependency-blocked, and the journey states no precedence between state-machine and dependency checks, so which Outcome (and which error) applies is ambiguous. A test generator must guess exclusive fixture construction.

**3c. No missing Preconditions for error/boundary Outcomes — 38/40**
- Every edge case states its triggering precondition explicitly ✓.
- Deduction −2: Step 3b's precondition "claim/submit 均已完成" states sequence but not the state it discriminates against (it is a consistency-check step, not an error path — its precondition does not distinguish it from simply being at the end of the happy path).

### 4. Fact Alignment — 120/150

**4a. Factual claims traceable or marked UNKNOWN — 52/60**
- Every load-bearing factual claim verified traceable: 15-skill list (= prd-spec 划分表), D2/D4/D5, SC1, spike ①, ≤5s, actor/FORGE_ACTOR, 7 态, 暂缓 20 项, proposal Key Scenarios — all check out against sources. This is genuinely strong.
- Deduction −8: Step 1b extends beyond any source wording — "提示指向可用恢复路径;不产生任何部分写" — neither "恢复路径" nor the partial-write guarantee for the degradation path appears in PRD/proposal ("dsh tool 不可用时的会话降级提示" is the full source extent; grep confirms 恢复路径/恢复引导 absent from PRD and proposal). Unclassified behavioral specifics.

**4b. Inferred claims have required_outcomes rule support + source: inferred — 36/50**
- Steps 2b/2c correctly carry `source: inferred` with reasoning basis ("状态机(7 态)入数据内核,非法转换必拒") ✓ classification discipline exists.
- Deduction −8: the cited basis is PRD reasoning, not the surface `required_outcomes` rule; 2b/2c are semantically the web validation-error outcome yet never cite that rule, while Step 1b cites the session-expired rule but lacks `source: inferred`. Annotation discipline is mixed in both directions — a downstream consumer cannot mechanically reconstruct which outcomes were rule-mandated.
- Deduction −6: Step 4b is annotated "source: prd-spec 技能迁移划分表" (factual trace, fine), but Step 1b's mapped outcome carries no source classification at all despite containing the inferred extensions noted in 4a.

**4c. No hallucinated unclassified claims — 32/40**
- No fabricated system behavior found; the two Step 1b extensions ("指向可用恢复路径", "不产生任何部分写") are plausible but unclassified — they are neither source-traceable nor `source: inferred`-annotated.
- Deduction −8 for those unclassified specifics (well short of the −30 hallucination penalty; these are embellishments of a sourced scenario, not fabrications).

### 5. Surface Fitness — 110/150

**5a. Mandatory derived Outcomes present — 42/60**
- session-expired: present, with explicit mapping — "surface-web required_outcomes 映射:session-expired → tool 通道不可用映射为会话内明确降级提示 + 恢复引导,非静默失败" ✓. The analogy mapping (session-expired → tool channel down) is defensible for an agent-tool domain with no human login session.
- validation-error: only implicitly present via 2b/2c with **no mapping annotation** and without the rule's "user can correct and retry" assertion element — half-credit.
- Scored under the mandatory-outcome criterion: absent explicit mapping, a validator scanning for the mandatory outcome set finds only 1 of 2 addressed.

**5b. Test strategy proportions match surface guidance — 42/50**
- Web = balanced 50/50 Contract/Journey: 4 happy steps (journey-shaped) + 5 edge cases with contract-shaped rejection semantics (state machine, dependency resolution, three-way consistency) — proportions are broadly balanced.
- Deduction −8: Steps 1 and 4 are pure contract-level tool-channel checks with no journey-smoke (browser workflow) contribution, concentrating the journey half entirely in Steps 2/3/3b.

**5c. Surface-specific environment and execution assumptions realistic — 26/40**
- The journey honestly discloses the drive-channel problem — "agent 动作不由 web 面直接驱动;以测试通道驱动 dsh tool 调用集(或宿主侧注入记录)模拟 agent 会话操作,回流/审计/寻址断言不受模拟方式影响" — and board-reflux assertions (Steps 2/3) are genuine async web assertions ✓.
- Deduction −8: Steps 1 and 4 produce **no browser interaction at all** — "全部解析成功(无 `forge:` 前缀障碍);技能经 customSkillDirs 配置路径承载,项目仓零新增文件" is resolvable only via tool channel + filesystem; a generated Web E2E test for half the happy path has nothing to do in a browser, and no web-observable proxy (e.g., board rendering of the queried task state) is offered.
- Deduction −6: Setup omits test-fixture isolation/cleanup for a state-mutating High-risk journey — no counterpart to the sibling journey's "测试承载 = 一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理;本旅程含任务状态变更,不得以生产仓为承载", despite this journey performing claim/submit mutations.
- Deduction −4 (criterion 1a/1c boundary note carried here): Step 4b's external leg — "外部会话(冻结 CC 插件)继续可用该技能" — executes on a surface (frozen CC plugin session) no web test harness can drive; realistic as a manual/auxiliary leg but not executable as written.

### 6. Internal Consistency — 137/150

**6a. Invariants hold in every Step — 55/60**
- Verified each invariant against each step: no CLI spawn anywhere; mutations carry actor assertion; Step 1b satisfies "永不静默失败"; Steps 2b/2c satisfy "非法变更恒被拒绝". Step 4b's skill absence is correctly *not* treated as tool-unavailability — no violation.
- Deduction −5: invariant 1 conflates two concerns in one sentence — "已注册项目会话内任务操作唯一通道 = dsh tool(零 CLI 依赖、零 bash spawn、零 `forge:` 前缀)" — the `forge:` prefix concerns skill addressing, not task operations; a downstream invariant check generated from this sentence would test the wrong predicate on task-op steps.

**6b. Cross-Step references consistent — 42/50**
- "该可执行任务" (Step 2) → Setup's prepared task ✓; "claim/submit 均已完成" (3b) → Steps 2/3 ✓; Step 4's 15 skills → Setup list ✓ (count re-verified = 15).
- Deduction −8: dangling reference — Step 3's "agent 完成执行后" points to a phase no step performs; within the document, "执行" is never created, so the submit outcome's "执行记录可渲染" references evidence the journey never produces.

**6c. Risk level consistent with content — 40/40**
- High risk ↔ claim/submit state mutations with audit semantics — exact match to the stated classification criteria. ✓

### 7. Workflow Coverage — 128/150

**7a. Golden Path existence (veto item) — 54/60**
- No veto: the happy path is a contiguous 4-step sequence (查询 → claim → submit → 技能扁平名寻址) that semantically corresponds to Story 9's user story, using domain-level user operations throughout — no API-level or bare-call steps. Frontmatter `golden_path: false` correctly defers the feature-level Golden Path to `task-dispatch-execution-loop`; this journey still contains a valid golden-path-quality sequence for its story.
- Deduction −6: the sequence has an internal hole (execution elided between claim and submit), weakening the "covers the primary user story end-to-end" claim for the claim→submit arc.

**7b. Multi-step coverage depth — 40/50**
- Depth present: read + mutate ops, rejection paths (state machine, dependency), cross-artifact consistency (board source mark ↔ execution record ↔ audit log, Step 3b), coexistence behavior (deferred skills, Step 4b). Beyond single-entity CRUD ✓.
- Deduction −10: no state-machine traversal beyond claim→submit (e.g., transition/reopen from the PRD's write-set add/claim/transition/submit/reopen are never exercised; only 2 of 5 write verbs appear), and no concurrent/parallel agent write scenario.

**7c. Workflow completeness against PRD/Design scope — 34/40**
- Story 9's three ACs are each covered by a step (AC1 → Steps 2/3; AC2 → Step 4; AC3 → Step 1b) ✓. Within its assigned slice of the 8-journey partition, primary coverage is complete.
- Deduction −6: the traceability block claims "D4(知识系数据面入 tool)" yet no step exercises any knowledge-plane tool operation (fact/lesson/research/forensic) — a cited-but-uncovered scope linkage that either needs a read-only knowledge-query step or should be dropped from the citation.

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **Simulation-equivalence assumption is asserted, never validated** — "回流/审计/寻址断言不受模拟方式影响" — the entire web-executable portion of this journey depends on test-channel simulation being behaviorally identical to real agent-driven dsh tool calls (including actor attribution, which historically depends on injection mechanics per BIZ-task-ops-002). If the equivalence fails, every board/audit assertion passes while the real agent path is broken. Must improve: add a one-leg real-agent spot check (a single real session performing a real claim) per suite, or cite spike evidence for the equivalence claim.

2. `[blindspot]` **Parallel-write contention — this feature's historically documented core risk — is never tested** — Step 2 is strictly serial and single-actor ("指示 agent 领取(claim)该可执行任务"); no outcome covers two agents claiming the same task, or claim-after-claim rejection with actor attribution preserved. The PRD's own motivation cites `tasks/index.json` 多写者一致性 as the structural risk this milestone retires (SC8 spike §4). No rubric dimension explicitly demands concurrency outcomes, but a QA signing off a state-mutation journey without a contention case is signing off the exact bug class that motivated the milestone. Must improve: add a Step 2d contention edge case (second claim on an active task → rejected, first actor's attribution intact).

3. `[blindspot]` **Skill addressing is verified only at the resolution proxy, and the carrier's lifecycle risk is never exercised** — Setup assumes "customSkillDirs 已由应用写入用户层 dsh 配置(D2)" and Step 4 asserts "全部解析成功(无 `forge:` 前缀障碍)"; resolution success does not prove any skill executes, and the PRD explicitly assigns path-drift-on-upgrade risk to the app ("路径漂移 = 应用责任", D2). No edge case covers a drifted/stale skill root (what the session observes when flat names stop resolving after upgrade — is it the Step 1b degradation or something else?). Must improve: assert at least one skill invocation (not just name resolution) and add a stale-carrier edge case or explicitly declare invocation-level assertion deferred with a reason.

---

## Attack List (for reviser)

1. **Surface Fitness**: validation-error mandatory outcome unmapped — Steps 2b/2c carry no `required_outcomes 映射` comment (contrast Step 1b's session-expired mapping) and lack the "correct and retry" element — annotate the mapping and add the retry assertion.
2. **Surface Fitness**: half the happy path has no browser-observable outcome — "全部解析成功(无 `forge:` 前缀障碍);技能经 customSkillDirs 配置路径承载,项目仓零新增文件" — add a web-observable proxy (e.g., board rendering of the queried task) or a per-step test-channel execution note.
3. **Surface Fitness**: mutating journey lacks fixture isolation — "备一个可执行任务(带执行 prompt)用于 claim/submit;审计日志通道可查(actor 标识可断言)" — add the sibling journeys' isolation/cleanup statement (一次性 fixture 项目, 不得以生产仓为承载).
4. **Fact Alignment**: mixed annotation discipline — Step 1b has rule mapping but no source annotation and contains unsourced extensions ("提示指向可用恢复路径" appears in no source); Steps 2b/2c have `source: inferred` but no rule citation — unify: every edge outcome carries both classification and (where applicable) rule mapping; mark extensions `source: inferred` or remove.
5. **Precondition Exclusivity**: 2b/2c co-occurrence unresolved — "目标任务当前状态不允许该操作(状态机 7 态约束外)" vs "任务依赖未满足(blocker 未终态)" can both hold; no check precedence stated — make fixtures exclusive or declare evaluation order.
6. **Internal Consistency**: dangling execution reference — "**User Action**: agent 完成执行后,指示其提交(submit)任务" with no step establishing execution — insert a minimal execution step or rephrase submit to not presume off-screen work.
7. **Completeness**: unobservable outcome in Step 4b — "该技能缺席不阻断(无错误级失败)" — specify the concrete observable behavior (what the session shows when a deferred skill is invoked).
8. **Semantic Purity**: procedural Setup phrasing — "备一个可执行任务(带执行 prompt)用于 claim/submit" — rewrite as declarative environment state.
9. **Workflow Coverage**: cited-but-uncovered traceability — "D4(知识系数据面入 tool)" with no knowledge-plane step — add a read-only knowledge tool step or drop D4 from the citation.
10. **[blindspot]**: unvalidated simulation-equivalence claim — "回流/审计/寻址断言不受模拟方式影响" — justify with spike evidence or add a real-agent spot-check leg.
11. **[blindspot]**: concurrent claim contention untested despite being the milestone's motivating risk class — serial single-actor flow throughout ("指示 agent 领取(claim)该可执行任务") — add a contention edge case.
12. **[blindspot]**: resolution-only skill assertion + missing upgrade path-drift scenario — "customSkillDirs 已由应用写入用户层 dsh 配置(D2)" assumed healthy; PRD names 路径漂移 as app responsibility — add invocation-level assertion and stale-carrier edge case.

## Bias note

No pre-revision markers present; standard rubric flow. All quotes verified against the document as written on disk.
