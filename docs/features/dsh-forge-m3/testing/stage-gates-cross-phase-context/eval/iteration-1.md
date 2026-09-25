# Eval-Journey Report — Iteration 1

- **Document**: `docs/features/dsh-forge-m3/testing/stage-gates-cross-phase-context/journey.md`
- **Rubric**: journey (1150 pts, target 975, per-dimension thresholds)
- **Surface**: web (`rules/surface-web.md`)
- **Scorer persona**: Senior QA Engineer
- **Iteration**: 1 (no previous report)
- **Reality-check inputs**: `docs/business-rules/{coexistence,privacy,resilience,task-operations,workbench}.md`, `docs/features/dsh-forge-m3/prd/{prd-user-stories,prd-spec,prd-ui-functions}.md`

## Verdict

**Total: 977 / 1150 — PASS** (target 975 met; all dimension thresholds met — but Surface Fitness and Fact Alignment are weak; margin is 2 points, one revision should consolidate)

| Dimension | Score | Min | Pass |
|-----------|-------|-----|------|
| 1. Completeness | 178/200 | 120 | PASS |
| 2. Semantic Purity | 177/200 | 120 | PASS |
| 3. Precondition Exclusivity | 131/150 | 90 | PASS |
| 4. Fact Alignment | 117/150 | 90 | PASS |
| 5. Surface Fitness | 103/150 | 90 | PASS |
| 6. Internal Consistency | 141/150 | 90 | PASS |
| 7. Workflow Coverage | 130/150 | 90 | PASS |
| **Total** | **977/1150** | **975** | **PASS** |

---

## Phase 1 — Reasoning Audit

**Problem → Solution**: The journey claims Story 4 (阶段门与上下文跨阶段传递), SC4, UF2. Its 7-step Happy Path (view stepper/gate → advance rejected → generate summary → advance succeeds → read-only asset panel → new-phase prompt injection → external deviation display) maps one-to-one onto prd-spec's 阶段线 flow ("阶段总结在 agent 会话生成 → 阶段资产文件落文档根 → 阶段推进请求经门校验 → 推进 → 新阶段会话注入;外部会话不阻断") and UF2. Story 4 AC1 (产物齐全性检查) is explicitly delegated with a verified cross-reference: "派发前产物齐全性检查的看板侧交互见 task-dispatch-execution-loop Step 2b(同一确定性检查机制)" — the sibling journey indeed contains Step 2b. The solution addresses the stated problem, not a proxy.

**Solution → Evidence**: Story 4 ACs 2–5 each have a dedicated step (AC2→Step 2, AC3→Steps 3/4/5, AC4→Step 6, AC5→Steps 7/7b). All four UF2 states (normal/deviated/gate-pending/asset-empty) are exercised. Evidence is not cherry-picked.

**Evidence → Success Criteria**: Outcomes are mostly behavioral (visible states, observable guidance, file existence, prompt content). Traceability blockquote present: "PRD Traceability: Story 4(阶段门与上下文跨阶段传递);SC4;UF2(阶段化呈现与阶段资产)".

**Self-contradiction check (cluster by affected area, bidirectional derivation)**:
- Step 2 (reject) ↔ Step 4 (advance OK): distinguished by summary-generated state; both directions derivable — no contradiction (differentiator lives in step titles, not Precondition fields — scored in D3).
- Step 3 (in-app summary) ↔ Step 3b (external summary): channel-exclusive; both satisfy invariant 1 (gate checks artifact existence, channel-agnostic) — consistent.
- Step 1b (empty asset panel) ↔ Step 5 (populated panel): state-exclusive — consistent, but the Setup fixture does not provision 1b's required state (see D6).
- Invariant "外部会话永不硬阻断" ↔ Step 7/7b: mutually reinforcing.
- Invariant "工作台呈现恒只读" ↔ Steps 5/5b: consistent.
- `ambiguous — requires author clarification`: Step 1b precondition "feature 尚无推进记录(早期阶段)" vs Setup's single fixture "处于中间阶段(如 tasks 阶段)的 feature" — a tasks-stage feature reaches 1b's state only if it advanced outside the app (dual-form reality), yet the parenthetical "(早期阶段)" narrows it to a different feature stage that the Setup never provisions.

**Pre-score anchors (channeled into dimensions/blindspot below)**:
1. The journey's spine operation — "请求将该 feature 推进到下一阶段" (Steps 2/4) — has no entry in any UI function: UF2 is display-only ("feature 状态机 stepper(阶段/偏离标识)+ 详情区新增「阶段资产」只读面板") and the 操作主体模型 human verb list is "派发/审批/迁移/偏好". Feeds Fact Alignment + blindspot.
2. Web-mandatory session-expired outcome family entirely absent (no case, no mapping comment, no N/A justification) while the workflow depends on agent sessions (Steps 3, 6). Feeds Surface Fitness.
3. Gate state is per-stage by construction (each advance needs a new summary), but no step states the post-advance gate reset. Feeds blindspot.
4. Step 3's in-app summary generation is not operationalized for deterministic e2e (no simulation channel declared; only 3b's external file-drop implies one). Feeds Surface Fitness/Completeness.
5. No `source: inferred` / required_outcomes annotations anywhere (only one factual source comment on 5b). Feeds Fact Alignment.

---

## Phase 2 — Rubric Scoring (verification stance)

### 1. Completeness — 178/200

| Criterion | Score | Notes |
|-----------|-------|-------|
| Metadata complete | 50/50 | `journey: "stage-gates-cross-phase-context"` kebab-case; `risk_level: "Medium"` valid; `golden_path: false` appropriate (feature golden path lives in task-dispatch-execution-loop); `surface_types/surface_keys = ["web"]`; sources list all three PRD files; `generated` present. No gaps. |
| Steps complete (name/action/outcome) | 69/80 | All 7 happy + 5 edge steps have name, User Action, Expected Result; coherent ordered sequence (view → reject → generate → advance → browse → inject → deviate). Deductions: (a) Steps 2/4's action trigger surface unspecified — "请求将该 feature 推进到下一阶段" names no UI entry (no UF defines one); (b) Step 3 is a composite non-UI action — "在 agent 会话完成阶段总结(经 dsh 通道/技能产出),回到 feature 看板查看" spans an out-of-board agent workflow with no operationalization for a downstream test agent; (c) Step 6 fuses two flows in a disjunctive action — "在新阶段启动会话/派发任务,经测试通道断言会话系统提示词" (also mixes test infrastructure into the action); (d) Step 7's operation is vague — "做跨阶段操作" (which operation? forward set? backward?) leaves the test to invent the trigger. -11. |
| Outcomes cover happy + required derived | 59/70 | Boundary richness is good: all four UF2 states covered (gate-pending Step 2, asset-empty 1b, deviated 7/7b, normal Step 1), channel parity (3b), accumulation (4b), injection defense (5b), non-blocking deviation (7b). Deductions: (a) the web-mandatory session-expired family is entirely absent — no host/session-unavailable case despite Steps 3/6 depending on agent sessions (mapped deduction in D5, coverage gap here); (b) no boundary for asset-write failure (Setup asserts "文档根可写" as assumption; what the user sees when the write fails — gate stays 未生成? error presentation? — is untested despite being this feature's characteristic failure). -12. |

### 2. Semantic Purity — 177/200

| Criterion | Score | Notes |
|-----------|-------|-------|
| Outcomes natural language, no code/regex | 70/80 | No regex, no CSS/XPath, no `expect()`/`assertEqual` — clean on hard prohibitions. Leaks of verification-method phrasing into outcomes: Step 6 "新阶段会话系统提示词强制包含目标 + 摘要(注入内容断言)" (assertion directive as outcome); invariant 1 "(断言无模型参与)"; Step 3 "元数据(路径/阶段/生成时间)入内核快照" is a storage-state assertion (PRD-verbatim but not an observation, similar to the sibling's penalized data-kernel equivalence check). -10. |
| Preconditions declarative, not procedural | 55/60 | All five edge Precondition fields are declarative states ("feature 尚无推进记录(早期阶段)", "阶段总结由外部会话/终端产出资产文件(非应用内通道)", "阶段资产文件内含恶意 markdown 结构…"). One impurity: the Setup bullet "断言通道:门校验与产物检查的确定性(无模型调用)经测试日志断言;新阶段会话系统提示词注入内容经测试通道直读" is test policy, not an environment state. -5. |
| No implementation coupling in Step descriptions | 52/60 | Actions are mostly user-level ("打开详情区「阶段资产」面板浏览"). Coupling leaks: Step 6 "经测试通道断言会话系统提示词" (test infrastructure inside a User Action); Step 3 "(经 dsh 通道/技能产出)" (channel detail inside the action); Step 5's outcome "只读渲染(经 MarkdownView 白名单)" names a component mechanism (PRD vocabulary, but still how-not-what). -8. |

### 3. Precondition Exclusivity — 131/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Preconditions distinct across Outcomes | 57/60 | Every step carries exactly one Expected Result (no multi-outcome steps), and edge preconditions are pairwise distinct (no-advance-record vs external-channel vs multi-advance vs malicious-content vs deviation-present). Deduction: the Step 2/Step 4 pair (same action "请求推进", divergent outcomes) carries its differentiator only in step titles, not in Precondition fields — the template allows this for happy steps, but a downstream contract generator must infer the split from narrative. -3. |
| Preconditions sufficient to uniquely select | 39/50 | Two real selection ambiguities: (a) Step 6's disjunction "在新阶段启动会话/派发任务" — the outcome clause "可派发集只为当前(新)阶段任务" applies only to the dispatch branch; under the "启动会话" branch it is undefined, so outcome applicability is not determinable; (b) Step 7's trigger "对该 feature 做跨阶段操作" is underspecified — forward jump, backward move, and out-of-stage task write may all (or only some) produce 偏离标识; the document does not say which operations satisfy the outcome, so the deviation outcome cannot be reliably selected or reproduced. -11. |
| No missing Preconditions for error/boundary Outcomes | 35/40 | All edge cases state their trigger — good. Deductions: Step 2 (a rejection outcome) has no Precondition field; its trigger (总结未生成) lives in the title only. Step 4's success silently depends on Step 3's completion (cross-step dependency unstated as a condition). -5. |

### 4. Fact Alignment — 117/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Factual claims traceable or marked UNKNOWN | 47/60 | Journey-level traceability present; spot-checks verify exactly: stepper "prd→design→tasks→in-progress→completed" (UF2 Data Requirements verbatim), gate states 总结已生成/未生成 (UF2 gate-pending), "元数据(路径/阶段/生成时间)入内核快照" (prd-spec 阶段资产 model verbatim), asset-empty (UF2 States), MarkdownView 白名单 (UF2 Validation), forced injection (SC4), "可派发集只为当前(新)阶段任务" (prd-spec In Scope 只为当前阶段派发), external non-blocking + deviation flag (SC4), ≤5s 感知 (G-series/Performance baseline, BIZ-workbench-005). Deductions: (a) the advance-request surface — "请求将该 feature 推进到下一阶段" — is asserted as a user action with no grounding: UF2 defines display only, and the 操作主体模型 human verb list is "派发/审批/迁移/偏好"; the 归宿表 routes "feature set / complete | 内核 API(编排与 hook 消费)". This is the journey's spine and is unverified (no UNKNOWN marking); (b) Step 3's "(经 dsh 通道/技能产出)" — no PRD source names a stage-summary skill or dsh channel for it; (c) traceability is journey-level only (no per-step source refs; Step 5b is the sole annotated step). -13. |
| Inferred claims have rule support + source: inferred | 35/50 | Step 5b carries a factual source comment ("source: prd-spec Security(markdown 防注入:阶段资产渲染经白名单)") — good. But: no derived outcome carries a surface `required_outcomes` mapping comment (contrast sibling journey's explicit validation-error/session-expired mapping comments), and no `source: inferred` annotation exists anywhere. Unannotated inferred fragments: 3b "与内部通道结果一致" (parity claim — inferred), 3b "≤5s 口径沿用感知链" (DF005 states 文件写入+感知 without an explicit ≤5s; the number is generalized from the task/proposal baselines), 4b "面板内容与文档根文件一致" (consistency invariant — inferred). -15. |
| No hallucinated unclassified claims | 35/40 | No claim contradicts PRD or business rules; external cross-phase ops on a registered project are consistent with the 操作主体模型's 过渡期兼容 and the 归宿分解决议 ("CLI 留机器"). One unclassified capability assertion: Steps 2/4 present a user-issuable advance request whose surface no PRD document defines — an asserted-but-unspecified behavior rather than a fabrication, but it is presented as fact without classification. -5. |

### 5. Surface Fitness — 103/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Mandatory derived Outcomes present | 35/60 | validation-error: functionally covered by the Step 2→3→4 arc and semantically faithful to the rule's triad — "拒绝文案可观察并引导缺失动作(生成阶段总结);feature 阶段不变" (message + not-submitted) plus Step 4 retry (correct-and-retry) — but with no mapping annotation (contrast the sibling's explicit "surface-web required_outcomes 映射" comments). session-expired: entirely absent — no host/session-unavailable case, no mapping comment, no N/A justification, despite the workflow's pivotal steps depending on agent sessions ("在 agent 会话完成阶段总结", "在新阶段启动会话/派发任务"). Surface-web says these are "must be considered for every Web Journey". Not scored 0 because the validation-error arc exists. -25. |
| Test strategy proportions match surface guidance | 44/50 | Web = balanced 50/50. The journey supports both levels: 12 discrete steps with isolatable outcomes (contract-friendly: 1b empty state, 5b injection defense, 7b non-blocking interactions) plus a contiguous staged workflow for smoke. Minor skew: two steps (3, 6) assert host-side artifacts rather than browser behavior, compressing what could be separate contract units. -6. |
| Realistic web environment/execution assumptions | 24/40 | Honest surface-limits handling exists ("门校验与产物检查的确定性(无模型调用)经测试日志断言;新阶段会话系统提示词注入内容经测试通道直读" — acknowledging the browser cannot self-test prompts/logs). Four real gaps: (a) "测试通道" is never concretely defined — no channel, path, or mechanism named; the single most load-bearing unverifiable assumption in the document; (b) Step 3's in-app summary generation is driven by a real agent session — nondeterministic — and the journey never declares a simulation channel (3b proves file-drop works as the external variant; the internal variant needs the same operationalization); (c) "≤5s 口径沿用感知链" carries no wait-strategy/CI-tolerance guidance — surface-web mandates "appropriate wait strategies, not fixed timeouts" and BIZ-workbench-005 mandates "CI 计时用宽松阈值防抖动"; (d) fixture discipline is thinner than the sibling's: "fixture 承载" with no isolated-userData/cleanup statement for a journey whose steps mutate feature state and write files. -16. |

### 6. Internal Consistency — 141/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Invariants hold in every Step | 58/60 | All 4 invariants verified against all 12 steps: hard gate (Step 2 rejects, Step 4 advances only post-summary, 3b channel-agnostic — consistent); content-in-file/metadata-in-SQLite/read-only (Steps 3/5/4b/5b); external never hard-blocked (7/7b); cross-phase context unbroken (Step 6). Minor: invariant 1 asserts "门校验与产物检查均为确定性代码" but 产物检查 is exercised only in the sibling journey — unverifiable within this journey's own steps (declared handoff, so mild). -2. |
| Cross-Step references consistent | 45/50 | Step 4 "再次请求推进" correctly chains Step 2's request through Step 3's summary; Step 6's "新阶段" traces to Step 4's advance; Step 7b presupposes Step 7's flag; the cross-journey reference to task-dispatch-execution-loop Step 2b verifies. Deduction: Step 1b's precondition "feature 尚无推进记录(早期阶段)" does not match the provisioned fixture — Setup creates exactly one feature "处于中间阶段(如 tasks 阶段)"; a tasks-stage feature has prior advances (or was externally advanced, in which case "(早期阶段)" is wrong). The state 1b needs is never provisioned; either a second early-stage feature or dropping the parenthetical is required. -5. |
| Risk level consistent with content | 38/40 | Medium is defensible: multi-step interaction, non-destructive mutations (asset files accumulate; nothing is lost). Not zero-ambiguity: stage advancement does mutate feature state (stepper 前移 + manifest status), which the stated High criterion ("state mutation") arguably covers — the saving distinction is no data-loss/irreversibility, unlike the sibling's task claim/submit + spawn workflow (High). -2. |

### 7. Workflow Coverage — 130/150

| Criterion | Score | Notes |
|-----------|-------|-------|
| Golden Path existence (veto) | 55/60 | Veto NOT triggered. Although `golden_path: false` (correctly delegated to task-dispatch-execution-loop), the journey contains a contiguous 4-step golden sequence — Step 1 查看 stepper/门状态 → Step 2 推进被拒 → Step 3 生成总结 → Step 4 推进成功 — that semantically matches Story 4's core (阶段门 workflow, ACs 2–3) and prd-spec's 阶段线 flow, in domain-level operations (no API-level steps). Deductions: Step 6 is a verification-centric step inside the sequence ("经测试通道断言会话系统提示词" advances assurance, not the user goal — justified by SC4 being a core deliverable, hence light); the advance action's surface vagueness (see D1/D4) blurs the domain-operation concreteness of the sequence's central verb. -5. |
| Multi-step coverage depth | 41/50 | Good depth: gate state machine (未生成→已生成→advance), asset lifecycle (empty→first→accumulated→browsed), channel parity (internal/external generation), security boundary (5b), deviation handling (7/7b); cross-entity interactions (feature ↔ stage assets ↔ sessions ↔ dispatchable set). Weaker: no error-recovery path anywhere (advance failure, write failure, perception-chain failure), and no interaction with concurrent orchestration (deviation arriving while a dispatch is in flight — the boundary this journey shares with the sibling loop). -9. |
| Workflow completeness against PRD/Design scope | 34/40 | Against claimed scope (Story 4 + UF2 + 阶段线): primary workflows covered; AC1 delegated with verified cross-reference; all four UF2 states and all three UF2 interaction-flow steps covered. Gaps: (a) last-stage boundary — a feature at `completed` advancing "to the next stage" is undefined and untested (4b's multi-advance can reach completed; the terminal behavior is silent); (b) deviation lifecycle — no case for whether/how the flag clears (next legitimate advance? ever?); (c) post-advance gate-state outcome absent from Step 4 (see blindspot). -6. |

---

## Phase 3 — Blindspot Hunt

**[blindspot] Per-stage gate semantics: the post-advance gate reset is never stated, and a generated test could assert the wrong thing.** Quote: Step 3 asserts "门状态更新为「总结已生成」(感知回流,免手动刷新)" and Step 4's outcome is only "推进成功;阶段 stepper 前移;项目文档根存在对应阶段资产文件(目标 + 摘要)". By the journey's own invariant ("阶段推进门为编排层硬门:总结未生成必拒绝推进") the gate is satisfied per-stage — after advancing, the new stage's summary is NOT generated and the gate must return to 未生成. No step or edge states this; a downstream contract generator sequencing Steps 3→4 will naturally carry "总结已生成" forward and encode a wrong assertion. Add an explicit outcome (or edge case) that after Step 4 the gate re-presents 未生成 for the new stage. Reasoning audit flagged this independently of dimension scoring.

**[blindspot] The golden-path spine tests an action whose owner is undefined in the actor model — a test-target existence risk, beyond claim traceability.** Quote: "User Action: 请求将该 feature 推进到下一阶段" (Steps 2/4) plus Step 2's "拒绝文案可观察并引导缺失动作(生成阶段总结)". D4 deducts the unverified claim; the structural risk scored nowhere is this: per the 归宿表 ("feature set / complete | 内核 API(编排与 hook 消费) | complete = 阶段推进门内化"), the advance trigger may be a hook/orchestration event rather than a human board action — in which case the "可观察引导文案" has no defined receiving surface (board toast? session message? hook result?), and tests written against a human-clickable advance control would exercise a UI that no UI function specifies. The journey must either ground the advance entry (which surface, which actor) or re-frame Steps 2/4 around the actual trigger so SC4's observable-guidance assertion has a defined home.

---

## Attack List (for reviser)

1. **Surface Fitness**: session-expired mandatory outcome absent — no case or mapping comment covers host/session unavailability despite "在 agent 会话完成阶段总结" and "在新阶段启动会话/派发任务" depending on it — add a channel/session-unavailable edge (sibling maps it to host/credential failure) or an explicit N/A mapping comment.
2. **Fact Alignment**: advance-request surface ungrounded — "请求将该 feature 推进到下一阶段" — UF2 is display-only and the human verb list is "派发/审批/迁移/偏好"; ground the trigger (UI entry or agent/hook channel) or mark UNKNOWN.
3. **Fact Alignment**: no `source: inferred` / required_outcomes annotations — only Step 5b's "source: prd-spec Security(…)" exists; annotate inferred fragments ("与内部通道结果一致"、"面板内容与文档根文件一致"、"≤5s 口径沿用感知链") and add the validation-error mapping comment for the Step 2→4 arc.
4. **Precondition Exclusivity**: Step 6 disjunctive action — "在新阶段启动会话/派发任务" with outcome "可派发集只为当前(新)阶段任务" that fits only the dispatch branch — split the branch or state per-branch outcomes.
5. **Precondition Exclusivity**: Step 7 trigger underspecified — "以外部会话(终端/冻结 CC 插件)对该 feature 做跨阶段操作" — concretize which operation (e.g., external feature set to a later stage) deterministically produces the deviation flag.
6. **Surface Fitness**: undefined "测试通道" — "新阶段会话系统提示词注入内容经测试通道直读" — name the channel concretely (artifact path/IPC/debug surface) so gen-test-scripts can operationalize it.
7. **Surface Fitness**: Step 3 not operationalizable deterministically — "在 agent 会话完成阶段总结(经 dsh 通道/技能产出)" — declare a simulation channel (3b's file-drop proves the pattern) or test-channel equivalent.
8. **Surface Fitness**: timing without tolerance — "门状态经感知更新(≤5s 口径沿用感知链)" — add wait-strategy/CI-tolerance guidance (BIZ-workbench-005: "CI 计时用宽松阈值防抖动").
9. **Internal Consistency**: 1b fixture mismatch — "feature 尚无推进记录(早期阶段)" vs Setup's single "处于中间阶段(如 tasks 阶段)的 feature" — provision a second early-stage feature or drop "(早期阶段)".
10. **Completeness**: asset-write failure boundary absent — Setup assumes "文档根可写(阶段资产文件落文档根)" — add the failure outcome (gate stays 未生成, observable degradation) for this feature's characteristic error path.
11. **Workflow Coverage**: last-stage boundary undefined — Step 4b "feature 先后完成多次阶段推进" can reach `completed` — define/assert the terminal advance behavior (no next stage? gate retires?).
12. **[blindspot]**: per-stage gate reset unstated — Step 4 silent after "门状态更新为「总结已生成」" — assert the gate re-presents 未生成 for the new stage post-advance.
13. **[blindspot]**: advance trigger owner undefined — "拒绝文案可观察并引导缺失动作" has no defined receiving surface if advance is hook/orchestration-triggered per the 归宿表 — re-frame or ground the trigger so SC4's guidance assertion is testable.

---

## Eval-Journey Complete (iteration 1)

**Score**: 977/1150 (target: 975) — PASS (margin 2 pts; Surface Fitness and Fact Alignment are the weak dimensions)
**Iterations Used**: 1/3
**Threshold table**: all 7 dimensions above minimum (see Verdict).
**eval-skipped**: no (document parsed successfully).
