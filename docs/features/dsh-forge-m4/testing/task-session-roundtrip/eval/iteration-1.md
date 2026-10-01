# Journey Eval Report — task-session-roundtrip (Iteration 1)

- **Target**: `docs/features/dsh-forge-m4/testing/task-session-roundtrip/journey.md`
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, 7 dimensions, target ≥975)
- **Surface**: web (`rules/surface-web.md`; required_outcomes = validation-error + session-expired; strategy 50/50)
- **Scorer context**: business rules (coexistence/privacy/resilience/sot-migration/task-operations/workbench), PRD (`prd-user-stories.md`, `prd-spec.md`, `prd-ui-functions.md`), proposal Key Scenarios
- **Date**: 2026-09-30
- **Result**: **1078 / 1150 — PASS** (target 975; all dimension thresholds met)

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Story workflow trace (任务→会话→subagent→返回)**. The internal argument is sound and complete against the declared ground truth (Story 2 + Story 7):

| Journey element | Story 2 AC | Story 7 AC | Anchor verified in |
|---|---|---|---|
| Setup fixture (dispatched task, naming stub, ≥1 ended link) | AC1 Given | AC1 (「约定遵循率在 e2e 以固定桩验证」 near-verbatim) | prd-user-stories.md Story 7 AC1 |
| Step 1 dock open (in_progress 且 active 挂接) | — | — | UF5 #27 形态裁决; BIZ-workbench-008 |
| Step 2 挂接历史 (active/ended, 新→旧, ended 可展开, 运行中徽标) | AC1 | — | UF5 Data/Flow; Story 2 AC1 |
| Step 3 subagent 识别 (origin=subagent, 任务 id+title 双重校验, 只读不落库) | AC2 | — | PRD 必答⑥; BIZ-workbench-007 |
| Step 4 顶层打开 (M1 session-focus) | AC3 | — | PRD 必答⑥; Related Changes #7 |
| Step 5 subagent 打开 (SubagentAddress, ≤1 点击) | AC3 | — | SC7; UF5 Validation |
| Step 6 元数据条 (任务号/标题/状态/feature, bound 态, 双向跳回) | AC4 | — | UF6 Data/States/Flow |
| Step 7 会话树归拢 + 反查互证 | — | AC2 | UF3; 必答⑥; Story 7 AC2 |
| Edge 7b 命名/血缘冲突 | — | AC3 | Story 7 AC3; UF6 Validation |

**Cross-step reference soundness**. Step 3 expands the "active 挂接行" established by Step 2; Steps 4/5 click entries established by Step 3; Step 6 "点击它" has an unambiguous antecedent (元数据条); Step 7 introduces the 代码区左栏 as a fresh observation point (persistent left column per UF2/UF3, plausible after Step 5/6 navigation). Edge numbering (1b/3b/3c/5b/6b/7b) correctly binds each variant to its happy step.

**Precision spot-checks (all pass)**:
- Inference correctly scoped to **active** links only ("任务 → session_links active 行的顶层会话" per 必答⑥): Step 3 and Edge 1b ("不误呈执行 subagent 标识") both respect this — no drift to ended-link inference.
- UF6 state vocabulary reused exactly: `bound` (Step 6), `ambiguous` (Edge 6b) — matches UF6 States table.
- UF5 state vocabulary reused exactly: `no-link` (1b), `inference-degraded` (3c), `open-failed` (5b) — matches UF5 States table.
- Traceability block claims verified: Story 2/7, SC7, UF5/UF6/UF3, PRD 必答⑥, proposal Key Scenarios「任务↔会话反查」(proposal.md L67) and「快速识别(人与 agent)」(L66) all exist as cited.

**Pre-score anchor conclusion**: no hallucinated core behavior found; every load-bearing assertion traces to PRD/UF/BIZ text. Deductions concentrate in annotation discipline (inferred-claim marking), one precondition-pair overlap, two coverage gaps (UF6 unbound; Step 4 failure path), and minor purity tokens.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 194/200 (threshold 120 ✅)

| Sub-criterion | Score | Evidence / Deduction |
|---|---|---|
| Metadata complete | 49/50 | `journey: "task-session-roundtrip"` (kebab-case), `risk_level: "Medium"` (valid; justified by content — multi-step interaction, no irreversible ops), `surface_types/keys: ["web"]`, 3 sources, `generated: 2026-09-30`, `golden_path: false` consistent with feature-level assignment to `project-workbench-home`. −1: no `quality` field needed (PRD mode, Key Scenarios present) — nothing missing; the point is ceded only for the redundant `golden_path: false` vs qualifying content (see Blindspot 4). |
| Steps complete | 79/80 | All 7 happy steps have `**User Action**` + `**Expected Result**`; sequence is a coherent ordered workflow (open dock → inspect history → identify → open ×2 → metadata round-trip → tree reverse-ID). −1: Step 7 and Step 2 User Actions are 察看-class (observational), acceptable for a read-mostly round-trip but weaker as *actions*. |
| Derived scenarios coverage | 66/70 | 6 edge cases; both web `required_outcomes` addressed via disclosed mapping comments (「surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,映射为未挂接/目标缺失的错误态呈现(no-link / open-failed)」 and 「session-expired → 宿主/会话通道不可用使打开动作失败,呈现为 open-failed 明确错误…不静默」). UF5's four states (populated/no-link/inference-degraded/open-failed) all present. −2: UF6 third state **unbound** (普通 subagent 会话,血缘无任务归属 → 不呈现元数据条) has no edge case. −2: open-failure asserted only as Step 5 variant (5b); Step 4's top-level open has no explicit failure variant (5b's "点击会话条目" only implicitly covers it). |

### 2. Semantic Purity — 189/200 (threshold 120 ✅)

| Sub-criterion | Score | Evidence / Deduction |
|---|---|---|
| Natural-language outcomes | 76/80 | No regex, no CSS/XPath selectors, no `expect(...)`/assert calls anywhere. −2: 「min(440px, 45vw)」 is a CSS `min()` expression embedded verbatim in Step 1 Expected Result — a layout implementation token where natural language (「dock 宽度取 440px 与视口 45% 中较小者」) would purify. −2: `(e2e 断言)` markers inside Expected Results (Steps 4/5) name the verification channel inside the outcome (inherited from PRD's own convention, hence only −2). |
| Declarative preconditions | 58/60 | All 6 edge preconditions are state descriptions (e.g., 「任务 in_progress 但无 active 挂接(或全部挂接已 ended)」「待打开会话已不存在或已清理」) — no setup procedures leaked into Preconditions. −2: Setup fixture clause 「执行体按派发 prompt 注入的命名约定…spawn subagent(约定遵循率在 e2e 以固定桩验证,不依赖真实模型自由命名)」 mixes fixture-state with test-machinery narrative (stub strategy) — belongs in a test-strategy note, not the narrative Setup. |
| No implementation coupling in steps | 55/60 | Steps operate at domain level (点击任务行/展开挂接行/点击会话条目/点击元数据条). −2: `origin=subagent` data-field token in Step 3/3b (defensible as PRD 必答⑥ domain vocabulary, hence light). −2: 「M1 session-focus」「dsh 原生 SubagentAddress」 are channel names — grounded domain terms of this feature, retained almost verbatim from PRD/UF5; −1: 「固定桩」 stub reference (Setup) is implementation-of-tests detail. |

### 3. Precondition Exclusivity — 138/150 (threshold 90 ✅)

| Sub-criterion | Score | Evidence / Deduction |
|---|---|---|
| Distinct across outcomes | 53/60 | Happy-vs-edge pairs are clean: Step 1 (in_progress + active 挂接) vs 1b (in_progress, no active); Step 3 (lineage has subagent) vs 3b; Step 6 (unique binding) vs 6b (多任务共会话); Step 7 (约定命名) vs 7b (手工改名). −7: **3b vs 3c overlap** — 3b 「active 挂接顶层会话血缘树内无 origin=subagent 会话」 is a data condition; 3c 「血缘推断计算 >100ms 或失败」 is a computation condition. Both can hold simultaneously (no descendants + slow inference), so preconditions do not partition the state space. Outcome convergence (both fall back to top-level presentation) keeps the ambiguity benign — hence partial, not full, −20. |
| Sufficient to uniquely select | 46/50 | Same 3b/3c pair (−2): in the overlap region, 3b's "打开动作落到顶层派发会话" and 3c's "仅呈现顶层会话 + 降级说明" differ in whether the degraded annotation appears — a contract generator cannot decide. −2: 5b is numbered as a Step-5 variant but its trigger (「待打开会话已不存在」) equally applies to Step 4's top-level entry; scoping is implicit. |
| No missing preconditions for error/boundary | 39/40 | Every edge case carries an explicit Precondition; triggers for no-link / no-match / degraded / open-failed / ambiguous / rename-conflict all stated. −1: 6b's precondition presupposes the reader knows 元数据条 resolution is per-血缘分母; "同一顶层会话连续执行多个任务" is stated but the resulting inference multiplicity (which task's lineage is queried) is not disambiguated. |

### 4. Fact Alignment — 136/150 (threshold 90 ✅)

| Sub-criterion | Score | Evidence / Deduction |
|---|---|---|
| Factual claims traceable | 56/60 | Verified traceability (sample): 「min(440px, 45vw)、无遮罩…焦点陷阱 Esc/✕/外点关闭并归还焦点」 → UF5 #27 裁决 verbatim; 「新→旧排序」「ended 行可展开查看历史」「会话运行中徽标呈现(active 挂接存在)」 → UF5 Data/Flow; 「计算 ≤100ms,超时降级为仅顶层会话」 → prd-spec Performance Requirements verbatim; 「明确错误提示「会话不存在或已清理」」 → UF5 States verbatim; 「呈「该会话执行中」会话级标注(ambiguous 态)」 → UF6/BIZ-workbench-007; 「不落库、可随时重算」 → 必答⑥/BIZ-007. −2: 3c 「不阻塞 dock 其余节」 asserts dock-scope resilience found nowhere in PRD/UF — unclassified inference. −2: 5b's mapping comment claims 「+ 恢复引导」 which is in neither UF5 nor the step body — an unsupported enhancement. |
| Inferred claims have rule support + `source: inferred` | 42/50 | The two required_outcomes derivations DO cite their triggering rule in-comment (validation-error after 1b, session-expired after 5b) with reasoning — good. −4: no literal `source: inferred` annotation anywhere (rubric-explicit format); the mapping comments cover only the two rule-derived families. −4: free inferences left unmarked: 3b parenthetical 「(如顶层会话自身执行)」, 3c 「不阻塞 dock 其余节」, 7b 「归拢/标识/打开均不受改名影响」 (a composite extension beyond UF6's 命名/血缘 clause — 归拢不受影响 is derivable from UF3's 血缘索引 source, but the triple assertion is the journey's own synthesis). |
| No hallucinated unclassified claims | 38/40 | Nothing rises to hallucination: every behavior-level assertion either traces to PRD/UF/BIZ or is a conservative composition of traced facts (verified line-by-line in Phase 1). −2 reserved for the two unmarked behavior additions above (3c dock-scope, 5b 恢复引导) which read as factual without classification. |

### 5. Surface Fitness — 139/150 (threshold 90 ✅)

| Sub-criterion | Score | Evidence / Deduction |
|---|---|---|
| Mandatory derived outcomes present | 54/60 | Both web-mandatory outcomes addressed, not absent (no zero). The adaptation is disclosed and reasoned: no form surface exists in this workflow, so validation-error maps to input-absence error states (no-link / open-failed), session-expired maps to host/channel unavailability → open-failed. This is the correct reading of "must be considered". −3: session-expired analog never manifests a distinct observable — it collapses into 5b, so the surface-mandated family is present only by annotation, not by a distinguishable outcome. −3: mapping comment's 「恢复引导」 over-promises vs step body (see Fact Alignment). |
| Test strategy proportions (50/50) | 46/50 | 13 outcomes total: 7 journey-level flow outcomes + 6 boundary/outcome-state cases — granularity is balanced between contract-assertable state displays (Step 2/3/6/7, UF state names) and end-to-end traversal (Steps 1→6 round-trip). −2: no loading/async-observation outcome at all (dock slide-in, inference compute are async surfaces; `loading-state` is listed as a common web boundary) — a 50/50-balanced plan would typically reserve one. −2: performance dimension (≤100ms) appears only as degradation trigger, never as a timing observation in its own right. |
| Realistic environment assumptions | 39/40 | 「dsh 宿主可用(凭据就绪),subagent 会话通道就绪」 is a realistic Electron-host precondition; stubbing the naming convention (「不依赖真实模型自由命名」) is exactly the right e2e determinism choice and mirrors Story 7 AC1's own stipulation; click-time computation model matches prd-spec's 实现约束. −1: no workspace/project fixture dimension is named (the code-area left column in Step 7 presupposes a project workbench context that Setup never establishes — Setup covers M3 base + task fixture but not the M4 project-home shell state). |

### 6. Internal Consistency — 144/150 (threshold 90 ✅)

| Sub-criterion | Score | Evidence / Deduction |
|---|---|---|
| Invariants hold in every step | 57/60 | All 6 invariants verified against all 13 steps: no step places a subagent in the top-level list (inv 2); open channels never crossed (inv 3: Step 4 session-focus only, Step 5 SubagentAddress only); no step persists inference output (inv 1); dock form factor asserted once and never contradicted (inv 4); injection non-destructibility never violated (inv 5); ≤100ms/降级 consistent between Setup, 3c and inv 6. −3: **inv 3 「任务→会话打开路径 ≤1 次点击」 vs the journey's own narrated path** — Step 3 (「展开 active 挂接行」) + Step 5 (「点击执行 subagent 会话条目」) is ≥2 interactions after dock open; the journey never states the measurement baseline (per-entry click from an expanded history section vs whole journey), leaving the invariant formally unfalsifiable against its own steps. Tension is inherited from PRD (SC7 vs UF5 flow both hold both statements) — hence −3 not −10. |
| Cross-step references consistent | 47/50 | No dangling references (Phase 1 audit). −2: terminological drift — Edge 3b acts on 「绑定会话入口」 while Steps 4/5 act on 「挂接行的顶层会话条目 / 执行 subagent 会话条目」; both are PRD vocabulary (必答⑥ uses 绑定会话) but the journey never equates them, leaving 3b's target control slightly ambiguous. −1: Step 7's 「会话树徽标」 (task-attribution badge, per Story 7 AC2) is commendably phrased to avoid the PRD-spec 必答⑥/⑧ count-badge vs UF3 「无计数徽标,计数入 hover 卡」 conflict — but the journey does not flag that it is deliberately sidestepping a live PRD/UF discrepancy; a contract generator hitting 必答⑧ would contradict UF3. |
| Risk level consistent | 40/40 | Medium fits: multi-step interaction (dock → open → navigate → jump back) with zero irreversible side effects (all reads/navigation; the only write-adjacent thing, 「发起入口」, is presented not exercised). Matches the rubric's Medium definition verbatim. |

### 7. Workflow Coverage — 138/150 (threshold 90 ✅; Golden Path veto NOT triggered)

| Sub-criterion | Score | Evidence / Deduction |
|---|---|---|
| **Golden Path existence (veto)** | 57/60 | **Semantic verification performed**: Steps 1→6 form a contiguous 6-step sequence that covers Story 2 (「从任务直达执行会话(含 subagent)」) acceptance criteria AC1→AC4 in order (挂接历史 → subagent 标识 → 双通道打开 → 会话视图元数据), with Step 7 extending into Story 7 AC2. Step language is domain-level throughout (任务详情 dock / 挂接历史 / 血缘推断 / 执行 subagent 会话 / 任务元数据条) — zero API/HTTP-level steps, so no −15/step penalty applies. Veto not triggered. −3: frontmatter `golden_path: false` while the content fully qualifies — the flag is a feature-level assignment (project-workbench-home holds it), but a qualifying primary-story sequence unlabeled invites downstream mis-prioritization. |
| Multi-step coverage depth | 47/50 | Cross-entity workflow (任务 ↔ 顶层会话 ↔ subagent 会话) with state matrix: active/ended 挂接, bound/ambiguous 元数据, degraded inference, open-failed recovery, naming-vs-lineage conflict, no-link annotation — well beyond single-entity CRUD. −3: the **multi-descendant** variation is absent: 必答⑥ inference returns all `origin=subagent` descendants, and prd-spec Test Pipeline explicitly lists 「血缘推断(命中/未命中/多后代/上限)」 — the journey only ever exercises the single-subagent shape (which subagent(s) get the executing-session identity when a parent spawns several is unaddressed). |
| Workflow completeness vs PRD scope | 34/40 | Story 2: 4/4 ACs covered. Story 7: 3/3 ACs covered (AC1 Setup, AC2 Step 7, AC3 Edge 7b). UF5: 4/4 states. UF6: 2/3 states. −3: UF6 `unbound` (「血缘无任务归属」→ 不呈现元数据条) missing — this journey is the natural home for it since Step 6 opens arbitrary subagent sessions. −2: 必答⑥ 归拢 overflow (「后代数超上限(默认 20)时尾部呈现「查看全部」」) untouched in Step 7 — arguably owned by the session-list journey, but Step 7 claims the 归拢 assertion surface. −1: ended-挂接 open path (expand an ended row, open its historical session) asserted only implicitly via 5b. |

---

## Deduction Log (consolidated)

| # | Dimension | Deduction | Trigger (quote) |
|---|---|---|---|
| D1 | Precondition Exclusivity | −12 | 3b/3c precondition non-partition: 「血缘树内无 origin=subagent 会话」 × 「计算 >100ms 或失败」 co-occur |
| D2 | Fact Alignment | −8 | Unmarked behavior inferences: 「不阻塞 dock 其余节」(3c)、「+ 恢复引导」(5b comment) |
| D3 | Fact Alignment | −8 | No literal `source: inferred` annotations; free inferences (3b/3c/7b) unmarked |
| D4 | Workflow Coverage | −3 | UF6 unbound state absent (「unbound \| 不呈现(普通 subagent 会话)\| 血缘无任务归属」 uncovered) |
| D5 | Workflow Coverage | −3 | Multi-descendant inference variation absent (「多后代/上限」 in PRD test pipeline) |
| D6 | Semantic Purity | −4 | 「min(440px, 45vw)」 CSS expression + `(e2e 断言)` markers inside Expected Results |
| D7 | Semantic Purity | −2 | Stub machinery in Setup narrative (「以固定桩验证,不依赖真实模型自由命名」) |
| D8 | Internal Consistency | −3 | Inv 3 「≤1 次点击」 vs narrated Step 3 expand + Step 5 click — measurement baseline unstated |
| D9 | Surface Fitness | −6 | session-expired present only by annotation (collapses into 5b); 恢复引导 over-promise |
| D10 | Completeness | −4 | Step 4 open-failure variant missing (5b scoped to Step 5) |
| D11 | Surface Fitness | −1 | Project-workbench shell state (Step 7's left column) not in Setup |

No deduction rules of the catastrophic classes fired: no hallucinated unclassified claim (−30), no surface-type violation (−25), no invariant violation (−40), no Golden Path veto.

---

## Threshold Table

| Dimension | Score | Min | Status |
|---|---|---|---|
| Completeness | 194/200 | 120 | ✅ PASS |
| Semantic Purity | 189/200 | 120 | ✅ PASS |
| Precondition Exclusivity | 138/150 | 90 | ✅ PASS |
| Fact Alignment | 136/150 | 90 | ✅ PASS |
| Surface Fitness | 139/150 | 90 | ✅ PASS |
| Internal Consistency | 144/150 | 90 | ✅ PASS |
| Workflow Coverage | 138/150 | 90 | ✅ PASS (veto not triggered) |
| **Total** | **1078/1150** | **≥975** | ✅ **PASS** |

---

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. **[blindspot] PRD/UF badge conflict silently inherited** — Story 7 AC2 / 必答⑥⑧ speak of parent-row 「计数徽标(运行中数/总数)」 while UF3 (2026-09-25 原型验收定形) says 「**无计数徽标**,计数入 hover 卡」. The journey's 「会话树徽标与任务详情 dock 两侧均能识别该任务归属」 picks the task-attribution reading and survives, but a downstream gen-contracts pass reading 必答⑧ will emit a contradictory assertion. The journey should note the discrepancy or cite UF3 as the later authority.
2. **[blindspot] Multi-subagent identity ambiguity** — 「血缘推断命中的 origin=subagent 会话被标识」 is silent on plurality: when one parent spawns N subagents for the task, are all N marked as executing sessions? Step 6's bound state (UF6: 「血缘命中唯一任务」) resolves session→task, but task→sessions cardinality is nowhere bounded; prd-spec's own unit-test list (「多后代」) confirms this is a recognized variation the journey omits.
3. **[blindspot] Ended-link lineage never exercised as a trap** — Setup deliberately builds 「≥1 条 ended 挂接」 and inference is active-only; no edge case proves an ended top-level session's subagent descendants are **not** offered as executing sessions from the ended row (1b covers the all-ended aggregate, not the mixed-history partial display where ended rows render next to the active row inside Step 2's expanded view).
4. **[blindspot] `golden_path: false` on a qualifying sequence** — Steps 1–7 fully cover a primary story (Story 2/SC7, the P2 core deliverable); the false flag is legal (one golden path per feature, held by project-workbench-home) but loses the strong guarantee that this journey's contracts get golden-path promotion priority in downstream gen-contracts/gen-test-scripts.
5. **[blindspot] Focus-return assertion missing from the journey body** — UF5 requires 「焦点归还触发元素」; Step 1 carries it (「归还焦点」), but no edge case exercises close-then-reopen or dock-switch focus behavior (「切换任务原地换内容,无闪烁」 is asserted only on the happy path; the Esc/✕/外点三通道 close are listed but never stepped).
6. **[blindspot] 6b leaves the round-trip broken with no forward path** — ambiguous state shows 「该会话执行中」 but the journey never says whether the metadata-bar click is disabled or redirects to the session (UF6 only defines the annotation). For a round-trip journey, the ambiguous-state interaction outcome (click does what?) is a real contract hole.

---

## Attack List (top weaknesses, revise-first order)

1. **[Precondition Exclusivity]** 3b/3c overlap — 「active 挂接顶层会话血缘树内无 origin=subagent 会话」 vs 「血缘推断计算 >100ms 或失败」 can both hold; bound 3b with 「推断在时限内完成且」 or scope 3c to 「血缘内存在后代时计算超时」.
2. **[Fact Alignment]** Inferred claims unannotated — 「不阻塞 dock 其余节」「(如顶层会话自身执行)」「归拢/标识/打开均不受改名影响」 and the required_outcomes mappings lack the rubric's `source: inferred` marking; add per-claim annotations.
3. **[Workflow Coverage]** UF6 unbound state uncovered — add an edge (Step 6c) asserting 「血缘无任务归属的 subagent 会话不呈现元数据条」 per UF6 States.
4. **[Internal Consistency]** Inv 3 baseline unstated — 「任务→会话打开路径 ≤1 次点击」 vs Step 3 expand + Step 5 click; declare the measurement baseline (dock 内条目点击) or reconcile with the narrated path.
5. **[Surface Fitness]** session-expired analog is annotation-only and over-promises — 「呈现为 open-failed 明确错误 + 恢复引导,不静默」 promises 恢复引导 that Step 5b's body (「明确错误提示「会话不存在或已清理」(open-failed 态);不静默、不崩溃」) never delivers; align body and comment.
6. **[Semantic Purity]** Implementation tokens in outcomes — 「min(440px, 45vw)」 CSS expression, `(e2e 断言)` markers, 「固定桩」 stub note; move verification-channel/test-machinery notes out of Expected Results and naturalize dimensional specs.
7. **[Completeness]** Step 4 failure variant missing — open-failed asserted only under Step 5; add explicit top-level-open failure or generalize 5b's scope wording to both entries.
