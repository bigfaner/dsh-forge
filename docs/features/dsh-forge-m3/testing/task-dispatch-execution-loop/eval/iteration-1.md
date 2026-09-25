# Eval-Journey Report — Iteration 1

- **Document**: `docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/journey.md`
- **Rubric**: journey (1150 pts, target 975, per-dimension thresholds)
- **Surface**: web (`rules/surface-web.md`)
- **Scorer persona**: Senior QA Engineer
- **Iteration**: 1 (no previous report)
- **Reality-check inputs**: `docs/business-rules/{coexistence,privacy,resilience,task-operations,workbench}.md`, `docs/features/dsh-forge-m3/prd/{prd-user-stories,prd-spec,prd-ui-functions}.md`

## Verdict

**Total: 1015 / 1150 — PASS** (target 975 met; all dimension thresholds met)

| Dimension | Score | Min | Pass |
|-----------|-------|-----|------|
| 1. Completeness | 184/200 | 120 | PASS |
| 2. Semantic Purity | 172/200 | 120 | PASS |
| 3. Precondition Exclusivity | 128/150 | 90 | PASS |
| 4. Fact Alignment | 124/150 | 90 | PASS |
| 5. Surface Fitness | 126/150 | 90 | PASS |
| 6. Internal Consistency | 146/150 | 90 | PASS |
| 7. Workflow Coverage | 135/150 | 90 | PASS |
| **Total** | **1015/1150** | **975** | **PASS** |

---

## Phase 1 — Reasoning Audit

**Problem → Solution**: The journey claims to be the M3 main-line workflow (Story 2 看板派发与并行执行闭环 + Story 3 预合成专业化上下文, SC1/SC3, UF1). The 7-step Happy Path (multi-select → stage-artifact check → confirm dispatch → verify pre-synthesized context → approval → enter session → status backflow) maps one-to-one onto the PRD's 执行闭环 Business Flow and UF1's User Interaction Flow. The solution addresses the stated problem, not an easier proxy.

**Solution → Evidence**: Every Story 2 AC (3-task parallel dispatch ≤3s / approval visible+operable / ≤5s backflow / failure+re-dispatch) and every Story 3 AC (three-element prompt assertion / no self-run `forge prompt` calls / summary refresh on re-dispatch) has a corresponding step or edge case. Evidence is not cherry-picked.

**Evidence → Success Criteria**: The success criteria are behavioral (UI states, timing budgets, source/actor marks), not proxies. Traceability blockquote present: "Story 2(看板派发与并行执行闭环)、Story 3(派发即得预合成专业化上下文);SC1、SC3;UF1(任务派发与编排)".

**Self-contradiction check (SC/InScope-cluster style, adapted to Journey steps+invariants)**:
- Invariant "看板对人无任务状态写入口" vs Steps 5/5b/7b (approve/reject/re-dispatch): consistent — the invariant itself carves out "人的写操作仅限编排发起(派发/审批/重派发)". Matches BIZ-task-ops-001 M3 revision exactly.
- Invariant "零 CLI 执行链:旅程全程 forge CLI 调用数 = 0" vs Step 4 "无 `forge prompt` 类自跑合成调用": consistent, mutually reinforcing (SC1).
- Step 2 (齐全 → 无警告) vs Step 2b (缺失 → 警告不阻断): mutually exclusive via explicit Precondition; matches SC4 ("缺失时警告不阻断").
- No intra-group contradictions found. No mutual-exclusion/direction-clash pairs confirmed.

**Pre-score anchors (channeled into dimensions/blindspot below)**:
1. Step 4 bundles three heterogeneous verifications (UI badge, test-channel prompt read, call-log absence) into one user action — structural, feeds blindspot.
2. Step 5c vs Step 7b can dual-match a single host outage — feeds Precondition Exclusivity.
3. Timing SLAs (≤3s/≤5s) stated as hard assertions with no CI/wait-strategy tolerance, while BIZ-workbench-005 explicitly mandates "CI 计时用宽松阈值防抖动" and surface-web mandates "use appropriate wait strategies, not fixed timeouts" — feeds Surface Fitness.
4. Step 5c's "沿用 M1/M2 错误呈现模式" sits in tension with BIZ-resilience-001 (非致命失败静默降级) unless scoped to active-workflow errors — feeds Fact Alignment.

---

## Phase 2 — Rubric Scoring (verification stance)

### 1. Completeness — 184/200

| Criterion | Score | Notes |
|-----------|-------|-------|
| Metadata complete | 50/50 | `journey: "task-dispatch-execution-loop"` kebab-case; `risk_level: "High"` valid and justified (task claim/submit state mutation, subagent spawning = "state mutation"); `golden_path: true`; `surface_types/surface_keys = ["web"]`; sources list all three PRD files; `generated` present. No gaps. |
| Steps complete (name/action/outcome) | 72/80 | All 7 happy steps and 8 edge steps have step name, User Action, Expected Result; coherent ordered sequence; High-risk density satisfied (8 edges ≥ 7 happy). Deductions: (a) Step 2's outcome "产物齐全 → 无警告,直接进入派发确认" never describes the confirmation surface content (what the user confirms — task list? count? stage?), leaving the contract generator without an outcome for the confirmation view; (b) Step 4's "User Action" mixes a non-user operation ("并经测试通道断言 subagent 系统提示词") into the action field; (c) Step 7 "完成态(done)呈现" gives no outcome for the terminal orchestration entry (does the card/侧板 entry persist, clear, or summarize?). -8. |
| Outcomes cover happy + required derived | 62/70 | Both web mandatory derived outcomes present and explicitly mapped (Step 1b validation-error, Step 5c session-expired — see Surface Fitness). Boundary/error coverage is rich (idle, dependency-block, artifact-missing warning, reject, channel failure, re-dispatch, staggered multi-submit). Deductions: (a) the warning-dialog cancel branch is named but has no outcome — "用户确认后可继续派发,或取消" states cancel exists without describing its result (no subagent started, selection preserved?); (b) happy-path Step 7 omits the per-change source marking that BIZ-task-ops-001 requires on every board change ("每笔变更在看板逐笔标记来源[会话/终端]") — it appears only in edge 7c; (c) no empty-selection boundary (tasks dispatchable but zero selected → dispatch click). -8. |

### 2. Semantic Purity — 172/200

| Criterion | Score | Notes |
|-----------|-------|-------|
| Outcomes natural language, no code/regex | 65/80 | No regex, no CSS/XPath selectors, no `expect()`/`assertEqual` calls — clean on the hard prohibitions. However, several Expected Results embed verification-method directives instead of observations: Step 2 "(确定性代码,断言无模型参与)"; Step 4 "系统提示词可断言包含三要素" and "subagent 启动后的调用日志无 `forge prompt` 类自跑合成调用" (log-level verification mechanics stated as outcome); Step 4b "再次派发同 feature 的任务并断言新 subagent 系统提示词" (assertion verb inside the action/outcome). These describe *how to verify*, not *what the user/system observes*. -15. |
| Preconditions declarative, not procedural | 55/60 | All edge Precondition fields are declarative states ("用户勾选集内含依赖未满足(或互相依赖)的任务", "feature 当前阶段期望产物缺失…"); Setup items are environment states plus fixture provisioning. One impurity: the Setup bullet "跨面断言口径:…零 CLI 断言 = 进程/日志级(forge CLI 调用数 = 0)" is test policy, not an environment state the template reserves Setup for. -5. |
| No implementation coupling in Step descriptions | 52/60 | Steps are user-level ("点击任务工具栏「派发」", "显式点击「批准」"). Coupling leaks: Step 4's action invokes test infrastructure ("经测试通道断言"); Step 1's outcome asserts internal-store agreement ("任务数/状态/依赖与数据内核一致") — 数据内核 is PRD vocabulary, but "与数据内核一致" is a data-layer equivalence check, not a user-visible observation; Step 5c "不残留半状态编排条目" presumes an internal state model ("半状态"). -8. |

### 3. Precondition Exclusivity — 128/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Preconditions distinct across Outcomes | 52/60 | Edge preconditions are pairwise distinct in the normal case (1b dep-unsatisfied vs 1c no-dispatchable-tasks vs 2b artifacts-missing vs 5b approval-present vs 5c channel-down vs 7b subagent-failed). Two weaknesses: (a) Step 7 and Step 7c carry near-equivalent scenarios — Step 7's happy path already has 3 parallel subagents completing ("agent 经 dsh tool 完成 claim/submit…各任务独立回流互不串扰") while 7c's precondition is "多个并行 subagent 先后完成提交" — the staggered-completion case is semantically contained in the happy-path scenario, so the two steps' applicability conditions overlap heavily; (b) 7c adds emphasis (逐笔回流) rather than a divergent state. -8. |
| Preconditions sufficient to uniquely select | 40/50 | One genuine dual-match: a single host outage satisfies both Step 5c ("审批链依赖的宿主会话通道不可用(宿主异常/凭据失效)") and Step 7b ("某 subagent 执行失败") — host death both kills the approval channel and fails subagents. The document does not scope 5c to channel-only failure (subagents otherwise healthy) nor state how the board distinguishes the two presentations under a common root cause. A downstream contract generator cannot decide which Outcome is active. -10. |
| No missing Preconditions for error/boundary Outcomes | 36/40 | Every edge case states its trigger. Minor: Step 2's happy branch's differentiator (产物齐全) lives inside the Expected Result rather than a Precondition — template-conformant for happy steps, but it forces the 2/2b split to be inferred from narrative; Step 1's "3 任务进入待派发态" similarly implies (but does not state) that selection succeeded on dispatchable tasks only. -4. |

### 4. Fact Alignment — 124/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Factual claims traceable or marked UNKNOWN | 50/60 | Journey-level traceability blockquote present; spot-checks against PRD all verify: ≤3s (G3/Performance), ≤5s (G3/DF004), three prompt elements (DF002/Story 3), no auto-approval (UF1 Validation), re-dispatch double-confirm (UF1 Validation), dependency block (UF1 Validation), non-blocking warning (SC4), idle state (UF1 States), return-to-source navigation (UF1 Secondary Pages), running/failed/done states (UF1 States), actor marks (DF003). Deductions: (a) "沿用 M1/M2 错误呈现模式" (Step 5c) names no concrete pattern and is unverified — the only injected M1/M2 error-presentation business rule for non-fatal failures (BIZ-resilience-001) mandates *silent* degradation + log, so the claim needs either a named pattern (e.g., M2 wizard ERR_* presentation) or UNKNOWN marking; (b) "blocker 指向可辨" (Step 1b) is a UI-detail assertion with no UF1 source; (c) per-outcome traceability is journey-level only — no per-step source refs. -10. |
| Inferred claims have rule support + source: inferred | 39/50 | The two surface-mandated derivations are properly grounded with mapping comments: Step 1b "<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,映射为多选校验失败… -->" and Step 5c "<!-- surface-web required_outcomes 映射:session-expired → 宿主不可用/凭据失效… -->" — rule cited, adaptation justified. But the literal `source: inferred` annotation required by the rubric is absent, and several inferred fragments carry no annotation: Step 4b "既有已派发 subagent 不受影响" (inferred from pre-synthesis-at-dispatch semantics, not in Story 3 AC3); Step 5c "通道恢复后可继续,不残留半状态编排条目" (inferred); Step 7 "各任务独立回流互不串扰" extends the dispatch-time 互不串扰 (G3) to backflow timing without marking. -11. |
| No hallucinated unclassified claims | 35/40 | No claim contradicts PRD or business rules; the unmarked inferences are reasonable extensions, not fabrications of system behavior. Small deduction for assertions of unspecified behavior presented as fact: "不残留半状态编排条目" (no M3 source defines half-state cleanup) and "blocker 指向可辨". -5. |

### 5. Surface Fitness — 126/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Mandatory derived Outcomes present | 55/60 | Both web mandatory outcomes are present and explicitly mapped with adaptation rationale (validation-error → multi-select validation block in Step 1b; session-expired → host/credential channel failure in Step 5c). Score is not full because the validation-error mapping drops one of the rule's three assert elements: surface-web requires "user can correct and retry" — Step 1b asserts "阻止派发并提示依赖关系(blocker 指向可辨);不启动任何 subagent" but never asserts the user can deselect the dependent task and re-dispatch the remainder. The session-expired mapping is faithful (error state + recovery guidance + resume-after-recovery ≈ redirect/message + warn + login-flow-accessible). -5. |
| Test strategy proportions match surface guidance | 45/50 | Web = balanced 50/50 Contract/Journey. The journey supports both levels: 15 discrete steps each with isolatable outcomes (contract-friendly) plus a contiguous 7-step golden path (journey smoke). No structural skew toward either level. Minor: Step 4's bundled triple verification compresses what should be distinct contract units (see blindspot). -5. |
| Realistic web environment/execution assumptions | 26/40 | The Setup honestly handles the browser surface's limits — "浏览器面不自测提示词内容"、"agent 动作经 dsh tool 通道驱动或测试通道模拟" — and the fixture discipline (临时目录 + 隔离 userData、不得以生产仓为承载) is realistic and safe. Two real gaps: (a) "测试通道" is never concretely defined — "subagent 系统提示词三要素断言经测试通道直读注入记录/宿主侧产物" names no channel (injection-record file? IPC? debug surface?), so a downstream test-script generator must invent it; this is the single most load-bearing unverifiable assumption in the document. (b) Timing budgets are stated as hard assertions ("派发 → subagent 可交互 ≤3 秒", "任务状态 ≤5 秒回流") with no wait-strategy guidance — surface-web explicitly requires "appropriate wait strategies, not fixed timeouts", and BIZ-workbench-005 mandates "CI 计时用宽松阈值防抖动"; as written, a literal e2e implementation will flake. -8 -6. |

### 6. Internal Consistency — 146/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Invariants hold in every Step | 58/60 | Verified all 6 invariants against all 15 steps: no step exposes a task-write entry point (approve/reject/re-dispatch are the invariant's own carve-out); zero-CLI holds (Step 4's no-self-run assertion reinforces it); dsh-tool-only writes hold (Step 7/7c); backflow invariant is correctly conditioned ("感知链健康时"); parallel isolation asserted at every phase; dispatchable-set rule stated in Step 1 and never contradicted. Minor: the invariant "每笔变更留 actor 标识,且与看板来源标记一致" is only exercised in Step 7c, not Step 7 — consistent, but the happy path leaves it unverified (counted in Completeness; no double deduction here). -2 for the unverifiable-in-happy-path tension. |
| Cross-Step references consistent | 48/50 | Step 4's "该任务类型协议" traces to Setup's "带类型(如 coding-feature)…的任务"; Step 4b's "同 feature 的任务" traces to Setup's single activated feature with ≥3 tasks; Step 6's "返回来源页" matches UF1's return target; Step 7's claim/submit matches invariant 3. No dangling references. -2: Step 5 "批准后 subagent 继续执行" implicitly references the requesting subagent of Step 3 but never names which of the 3 (all? any?) — an underspecified quantification. |
| Risk level consistent with content | 40/40 | High is correct: dispatch spawns subagents, agents perform claim/submit state mutations, and failed runs require re-dispatch — "state mutation" per the stated criteria. |

### 7. Workflow Coverage — 135/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Golden Path existence (veto) | 58/60 | Veto NOT triggered. 7 contiguous steps cover the PRD's primary 执行闭环 flow (Story 2 + Story 3 + UF1 interaction flow) using domain-level operations: 看板浏览多选 → 派发 + 产物检查 → 确认启动 → 确认预合成上下文 → 审批 → 进入会话观察 → 状态回流. No API-level or bare-HTTP step descriptions; every step uses PRD domain terminology. Semantic correspondence to Story 2's ACs verified individually. -2: Step 4 is a verification-only step in the golden-path middle — it advances assurance rather than the user's goal, brushing the "inserting verification-only steps" anti-pattern (justified here by SC3 being a core deliverable, hence only -2). |
| Multi-step coverage depth | 47/50 | Deep: full orchestration state machine (idle → 待派发 → running → awaiting-approval → failed → done, all UF1 states touched); failure-recovery loop (7b re-dispatch with double-confirm); cross-entity interactions (task ↔ subagent ↔ approval entry ↔ feature stage products ↔ session view). -3: no interaction between concurrent concerns — e.g., approval arriving while the user is inside the session view (Step 6), or a second dispatch initiated while subagents are running, is not covered. |
| Workflow completeness against PRD/Design scope | 30/40 | Against the journey's claimed scope (Story 2 + Story 3 + UF1): primary workflows covered. Gaps: (a) single-task dispatch — UF1 says "单任务/多选并行派发" and its flow step 1 says "选择 1 个或多个(无依赖)任务", but the journey's only dispatch scenario is "勾选 3 个无依赖的可执行任务"; the n=1 boundary (and empty-selection n=0 with dispatchable tasks present) is a classic dispatch-count boundary left untested; (b) the PRD 执行闭环 main flow explicitly includes the branch "dsh tool 不可用 → 会话内降级提示" — absent here with no declared handoff to the session-native-ops journey; (c) the artifact-warning cancel branch (2b "或取消") has no outcome; (d) per-change source marking absent from happy path (see Completeness). -10. |

---

## Phase 3 — Blindspot Hunt

**[blindspot] Step granularity vs downstream contract model — Step 4 bundles three heterogeneous verifications into one user action.** Quote: "查看任务卡片/编排条目的预合成要素标识,并经测试通道断言 subagent 系统提示词" plus "subagent 启动后的调用日志无 `forge prompt` 类自跑合成调用". One Step = one Contract with mutually-exclusive Outcomes in the downstream model; this step spans a browser-DOM observation (badge), a host-side artifact read (prompt content), and a process/log assertion (no self-run calls) — three different verification surfaces with no preconditions distinguishing them as *outcomes*. gen-contracts will either fuse them into one untestable mega-outcome or must split the step itself. The journey should decompose Step 4 (or annotate the three assertions as separate outcome dimensions). Reasoning audit flagged this independently of dimension scoring; only its purity/fitness symptoms were scored above.

---

## Attack List (for reviser)

1. **Semantic Purity**: test-infrastructure mechanics inside a User Action — "并经测试通道断言 subagent 系统提示词" — move the assertion channel to Setup/contract metadata; keep User Actions user-level only.
2. **Semantic Purity**: verification-method directives inside Expected Results — "(确定性代码,断言无模型参与)" / "调用日志无 `forge prompt` 类自跑合成调用" — restate as observable system properties ("阶段检查为纯代码执行,无模型调用参与" as a stated fact, with assertion phrasing removed from the outcome text).
3. **Precondition Exclusivity**: Step 5c/7b dual-match under one host outage — "审批链依赖的宿主会话通道不可用(宿主异常/凭据失效)" vs "某 subagent 执行失败" — scope 5c to channel-only failure (subagents otherwise alive) and state how the board distinguishes the two presentations.
4. **Precondition Exclusivity**: Step 7 vs 7c near-equivalent conditions — "agent 经 dsh tool 完成 claim/submit…各任务独立回流互不串扰" vs "多个并行 subagent 先后完成提交" — differentiate (e.g., 7 = first completion; 7c = staggered burst after first) or merge into one step with two outcomes.
5. **Fact Alignment**: unverified inheritance claim — "沿用 M1/M2 错误呈现模式" — name the concrete pattern (e.g., M2 wizard ERR_* presentation) or mark UNKNOWN; address the tension with BIZ-resilience-001 (非致命失败静默降级) by scoping to active-workflow errors.
6. **Fact Alignment**: unannotated inferred fragments — "既有已派发 subagent 不受影响"、"不残留半状态编排条目"、"blocker 指向可辨" — annotate `source: inferred` with basis, and add the literal annotation to the two mapping comments (1b/5c).
7. **Surface Fitness**: undefined "测试通道" — "subagent 系统提示词三要素断言经测试通道直读注入记录/宿主侧产物" — specify the channel concretely (artifact path/IPC/debug surface) so gen-test-scripts can operationalize it.
8. **Surface Fitness**: timing SLAs as hard assertions — "派发 → subagent 可交互 ≤3 秒"、"任务状态 ≤5 秒回流" — add wait-strategy/CI-tolerance guidance (BIZ-workbench-005: "CI 计时用宽松阈值防抖动"; surface-web: "not fixed timeouts").
9. **Surface Fitness**: validation-error mapping drops the retry element — "阻止派发并提示依赖关系…不启动任何 subagent" — add "user can correct the selection and re-dispatch" per surface-web rule.
10. **Workflow Coverage**: single-task dispatch boundary absent — UF1 "单任务/多选并行派发" vs journey-only "勾选 3 个无依赖的可执行任务" — add n=1 (and empty-selection) variants.
11. **Workflow Coverage**: PRD 执行闭环 branch "dsh tool 不可用 → 会话内降级提示" not covered and no handoff declared to the session-native-ops journey — add a scoping note or an edge case.
12. **Completeness**: warning-dialog cancel branch without an outcome — "用户确认后可继续派发,或取消" — describe the cancel result (no subagent started, board/selection state).
13. **Completeness**: per-change source marking missing from happy path — BIZ-task-ops-001 "每笔变更在看板逐笔标记来源[会话/终端]" vs Step 7 asserting it only in edge 7c — assert source/actor marking in Step 7's expected result.
14. **[blindspot]**: Step 4 bundles UI-badge + test-channel prompt + call-log verifications in one step — quote in blindspot section — decompose into separately verifiable steps/outcomes for the contract model.

---

## Eval-Journey Complete (iteration 1)

**Score**: 1015/1150 (target: 975) — PASS
**Iterations Used**: 1/3
**Threshold table**: all 7 dimensions above minimum (see Verdict).
**eval-skipped**: no (document parsed successfully).
