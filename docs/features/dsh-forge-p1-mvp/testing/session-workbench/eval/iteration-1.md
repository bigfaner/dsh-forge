# Eval Report: session-workbench (Journey) — Iteration 1

- **Document**: `docs/features/dsh-forge-p1-mvp/testing/session-workbench/journey.md`
- **Feature**: dsh-forge-p1-mvp
- **Surface**: web (SURFACE_RULE: gen-journeys `rules/surface-web.md`)
- **Scorer persona**: Senior QA Engineer (adversarial)
- **Rubric**: journey.md (1150 pts, 7 dimensions, target 975, per-dimension min thresholds)
- **Iteration**: 1 (no previous report)
- **Verified against**: prd-user-stories.md (Story 2), prd-spec.md (流程二, DF002), prd-ui-functions.md (UF-1/2/4/5/7), proposal.md (Key Scenario 日常会话, SC1, SC6①②), sibling journeys (project-registration-compensation 等) for convention comparison.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Core workflow coverage**: Happy Path Steps 1–6 do cover the claimed scope — first-screen 3-zone layout (Step 1), new session + real round trip (Step 2), trajectory tab (Step 3), resume with full transcript (Step 4), view swap with dock retention (Step 5), project switch with tab-follow (Step 6). Maps 1:1 onto Story 2's three ACs and 流程二. This is genuinely the primary workflow — not a stub.
2. **Executability for a downstream test-gen agent**: mostly executable, with three concrete blockers:
   - Step 6 asserts per-project dock tab sets, but **no step or setup ever creates/pins a project-scoped dock tab** (P1 dock content is placeholder per UF-7). If neither project has project-scoped tabs, the visible set is identical for 甲 and 乙 and the assertion "页签集切换" is vacuous.
   - Step 3 asserts "本轮消息与**工具调用**的时序列表" but Step 2 never specifies a message content; an arbitrary fixture message may produce zero tool calls, making the expected result non-deterministic.
   - Step 4b's "新注册项目" is unresolvable: Setup never states which of 甲/乙 is new or sessionless (乙's session state is undefined).
3. **Observable behavior vs implementation assertions**: mostly observable UI states; exceptions — "实时读 dsh 账本" / "零缓存零副本" (data-provenance/code-audit channel, not browser-observable) and "（恢复链路）" (implementation-path label) inside Expected Results.
4. **Self-contradiction check**: no invariant is violated by any step; but Step 1c's precondition ("应用零项目记录") contradicts the journey Setup ("已注册两个项目") with no scenario-isolation statement (the sibling journey declares 隔离 explicitly), and Invariant 1 declares three tabs while only two are ever exercised.

Anchors channeled into Dimensions 1/3/5/6/7 and blindspots below.

---

## Phase 2 — Rubric Scoring (verification stance)

### Dimension 1: Completeness (完整性) — 156/200 (min 120: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 1.1 Metadata | 48/50 | `journey: "session-workbench"` kebab-case ✓; `risk_level: "Medium"` valid and justified (multi-step interaction, no irreversible ops) ✓; sources + generated + surface fields populated ✓. −2: frontmatter `golden_path: false` while the document substantively contains a 6-step golden path — set-level flag semantics are undocumented in-doc and ambiguous for downstream consumers (only knowledge-recall-flywheel carries `true` in this set). |
| 1.2 Steps complete | 68/80 | All 11 steps (6 happy + 5 edge) carry User Action + Expected Result and form a coherent ordered sequence ✓. −12 total: (a) Step 2 "点品牌行（整块 = 新会话快捷）**或**「新会话」按钮" — two entry points, undefined whether one or both require coverage; (b) Step 5 "再点「新会话」/ 会话行 / 品牌行切回会话视图" — three distinct code paths collapsed into one action, coverage scope undefined; (c) Step 3's expected result presupposes tool calls whose occurrence depends on an unspecified Step 2 message. |
| 1.3 Outcomes: happy + required derived | 40/70 | Happy path outcomes present ✓; state/empty coverage good (1c hero, 2b empty session, 4b placeholder, 4c skeleton, 1b collapse) ✓. −30: the web surface's mandatory derived outcomes (`validation-error`, `session-expired`) are **completely absent** — no step, no N/A classification (see D5.1 for the primary hit; this criterion deducts for the missing negative/boundary outcome layer as a completeness gap: no empty-message submission case, no runtime-unavailable/failed-round-trip branch). |

### Dimension 2: Semantic Purity (语义纯度) — 180/200 (min 120: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 2.1 Natural language, not code/regex | 70/80 | No regex, CSS/XPath selectors, or framework assertion calls anywhere ✓; outcomes describe user-visible states ✓. −10: data-provenance and implementation-path phrasing inside Expected Results — Step 1: "会话列表**实时读 dsh 账本**（标题 / 状态点 / 相对时间）"; Step 4: "转录完整呈现**（恢复链路）**". These are audit-channel labels, not observations. |
| 2.2 Preconditions declarative | 54/60 | All five edge preconditions are state declarations ✓ ("左栏处于展开态（~240px）", "应用零项目记录（首用状态）", "新建会话尚未发送任何消息"). −6: Step 4c "**dsh 账本查询进行时**" names an internal operation as trigger — the declarative, surface-visible form is "会话列表尚未就位". |
| 2.3 No implementation coupling in Steps | 56/60 | Actions are clean UI operations (click rail entries, switch tabs, send message) ✓. −4: Invariant 2 "会话列表实时读 dsh 账本，**零缓存零副本**" is SC2 architecture-audit language carried inside a web journey's invariant set, implying a browser-side verification channel that does not exist. |

### Dimension 3: Precondition Exclusivity (前置条件互斥性) — 126/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 3.1 Preconditions distinct across Outcomes | 55/60 | Every step has exactly one Expected Result (no within-step branching), and the five edge-case preconditions are mutually distinct (expanded rail / zero projects / unsent message / sessionless project / query in flight) — no two outcomes share a precondition. −5: the document never exercises the within-step outcome-selection mechanism the criterion exists to protect (format limitation, not an error). |
| 3.2 Sufficient to uniquely select an Outcome | 38/50 | −12: Step 5 binds **one** Expected Result to **three alternative actions** ("再点「新会话」/ 会话行 / 品牌行切回会话视图") — a downstream agent cannot determine whether the retention/restore outcome must hold for all three paths or any one (the three entries are distinct UI paths in UF-1); Step 4c's transient precondition cannot be deterministically produced (nothing controls ledger-query timing). |
| 3.3 No missing Preconditions for error/boundary Outcomes | 33/40 | All five edge cases do state preconditions ✓ — better than typical. −7: Step 4c's precondition has no setup lever (how does a test make the in-flight query observable before it completes?); Step 6 lacks a precondition establishing that 甲 and 乙 have **distinguishable** dock tab sets (see blindspot B1). |

### Dimension 4: Fact Alignment (事实依据) — 97/150 (min 90: PASS, barely)

Independent verification performed: every PRD-cited claim was checked against prd-ui-functions.md (UF-1/2/4/5/7), prd-spec.md (流程二, DF002, SC2), prd-user-stories.md (Story 2) and proposal.md (SC1, SC6①②, Key Scenario 日常会话). Rail contents, 56px/240px collapse, 轨道归零 default, three-tab no-reset rule, skeleton states, 「暂无会话」placeholder, knowledge-mode dock hiding with restore, tab-set = current project + global — all match sources verbatim. No counterfactual claim found.

| Criterion | Score | Justification |
|---|---|---|
| 4.1 Factual claims traceable / UNKNOWN | 44/60 | Document-level traceability exists ("**PRD 溯源**: Story 2…UF-1/UF-4/UF-5/UF-7…SC1、SC6①②") and holds up under verification. −16: zero per-claim `fact_id` or `UNKNOWN` mechanism anywhere; assertions that go beyond source text are unmarked — Step 4b: "项目下呈现「暂无会话」占位（**不报错、无空列表抖动**）" (UF-1 States defines only the placeholder, not the no-error/no-jitter guarantees). |
| 4.2 Inferred claims with rule support + `source: inferred` | 20/50 | Zero `source: inferred` annotations in the entire document. The surface-mandated derived outcomes — the very place where inferred claims belong — do not exist (root cause shared with D5.1). The sibling project-registration-compensation demonstrates the convention in this exact doc set ("validation-error — N/A … (source: inferred——必察项 × UF-3 校验时时序)"); this journey applies it nowhere. |
| 4.3 No hallucinated unclassified claims | 33/40 | No fabricated system behavior found — all load-bearing claims match PRD/proposal text. −7: minor unclassified quality embellishments ("不报错、无空列表抖动") asserting behavior no source defines. |

### Dimension 5: Surface Fitness (Surface 适配, web-parameterized) — 71/150 (min 90: **FAIL**)

| Criterion | Score | Justification |
|---|---|---|
| 5.1 Mandatory derived Outcomes present | **0/60** | surface-web.md: "Mandatory derived Outcomes (**must be considered for every Web Journey**): validation-error … session-expired". Both are **completely absent**: no step exercises invalid input (e.g., empty-message send in the chat tab — the journey's only input surface), and session-expired is neither covered nor classified N/A (the single-machine-product N/A justification pattern exists in the sibling). Rubric: "Score 0 if mandatory Outcomes are completely absent." Applied as written. |
| 5.2 Test strategy proportions (Web: balanced 50/50) | 41/50 | 11 scenarios with composite outcomes provide material for both contract-level extraction (component state rules: collapse, placeholder, skeleton, tab-switch no-reset) and journey smoke (view swap, project switch, round trip) — proportions respected. −9: granularity uneven — Steps 5/6 pack multi-branch assertions into single Expected Results, splitting poorly into contract units. |
| 5.3 Environment/execution assumptions realistic | 30/40 | Browser interaction model ✓; async handling present for two operations (Step 4 "恢复期间呈加载骨架"; Step 4c "呈现行级骨架") ✓; dsh runtime availability declared in Setup ✓. −10: the flow's longest async operation — the real agent round trip — carries no wait/stability consideration ("完成一次真实 agent 往返，回答呈现于对话 tab" gives no latency or stability anchor), and "零缓存零副本" is asserted as if browser-verifiable when it is an SC2 code-audit channel. |

### Dimension 6: Internal Consistency (一致性) — 130/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 6.1 Invariants hold in every Step | 54/60 | No step violates any of the five invariants; Step 5 upholds Invariant 3, Step 6 upholds Invariant 4, Steps 3–5 uphold Invariant 5. −6: Invariant 1 declares "会话面板**三页签**（对话 / 轨迹 / 知识召回）切换不重置会话状态" but no step ever touches the 知识召回 tab — the invariant holds vacuously for one-third of its declared scope (untested, not violated; coverage gap counted once here, once in D7.3). |
| 6.2 Cross-Step references consistent | 38/50 | Step 3 "本轮消息" → Step 2 ✓; Step 4 "项目甲" → Setup ✓. −12: (a) Step 1c precondition "应用零项目记录（首用状态）" directly contradicts Setup "已注册两个项目（甲、乙）…" with **no scenario-isolation statement** — the sibling journey declares one explicitly ("场景隔离：各场景用专属新建路径…从基线启动"); (b) Step 4b "打开的是新注册项目（无任何会话）" — Setup never defines 乙's session state, so "新注册项目" resolves to nothing; (c) Step 6 "切回项目甲时**原**页签集（含展开状态）恢复" implicitly depends on Step 5's end state (dock expanded) without saying so. |
| 6.3 Risk level consistent | 38/40 | Medium = "multi-step interaction without irreversible side effects" — accurate: sessions are created (additive), nothing is deleted or mutated irreversibly. −2: Step 2 does create persistent dsh-side session state, but Medium remains the correct bucket. |

### Dimension 7: Workflow Coverage (工作流覆盖度) — 122/150 (min 90: PASS; veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| 7.1 Golden Path existence (veto) | 56/60 | Veto not triggered: Happy Path Steps 1→6 form a contiguous domain-level sequence semantically matching Story 2 (AC1 → Step 2 "完成一次真实 agent 往返"; AC2 → Step 4 "转录完整呈现"; AC3 → Steps 5–6 retention/follow), 流程二, and Key Scenario 日常会话. Steps reference user operations (发起会话、切页签、恢复会话、切项目), not API calls. −4: frontmatter `golden_path: false` contradicts the document's substantive golden path for any consumer trusting metadata over content. |
| 7.2 Multi-step coverage depth | 36/50 | Beyond the golden path: cross-entity state interactions (projects × sessions × dock tabs × view states), retention/restore semantics across view and project switches, empty/loading states — good depth. −14: no error-recovery path anywhere (failed round trip, runtime unavailable), and the third UF-4 tab (知识召回) is never exercised. |
| 7.3 Completeness against PRD scope | 30/40 | Story 2's three ACs fully covered; 流程二 items 1 and 3 covered. −10: 流程二 item 2 also names "「知识召回」tab 看本会话召回记录" — no step and **no stated deferral** to the sibling knowledge-recall-flywheel journey (the cross-journey deferral pattern exists in this doc set: "由兄弟 Journey project-registration Step 3d 承载"); UF-1's search-filter rule ("项目/会话搜索过滤…不改变选中态") uncovered (minor/auxiliary, small part of the deduction). |

### Cross-dimension coherence check

- The single root cause "web mandatory derived outcomes absent" manifests in D1.3 (−30), D4.2 (−30), D5.1 (−60). The heaviest hit is deliberately in D5 where the rubric locates the rule; D1.3/D4.2 carry the secondary manifestations per their own criterion text ("as required by the surface type's required_outcomes rules" / "Derived boundary Outcomes must cite the required_outcomes rule").
- The dock-tab fixture gap (B1) manifests most cleanly in D3.3; the Setup-vs-1c contradiction manifests in D6.2; both reappear as blindspots because they are downstream-executability issues beyond the rubric's letter.

---

## Phase 3 — Blindspot Hunt (QA-domain patterns outside rubric dimensions)

- **[blindspot] B1 — unverifiable core assertion (missing fixture)**: Step 6 "dock 可见页签集切换为「当前项目（乙）页签 + 全局页签」" — no step or setup ever opens/pins a project-scoped dock tab, and UF-7 says P1 dock content "以占位为主". If both projects expose only global tabs, the visible sets are identical and the assertion is vacuous. Must improve: setup fixture opens at least one project-scoped tab per project (or defines the placeholder tab source) so 甲/乙 sets are distinguishable.
- **[blindspot] B2 — non-deterministic expected result**: Step 3 "呈现最简台账——本轮消息与工具调用的时序列表" — Step 2 never specifies message content; a plain greeting may produce no tool calls, failing this outcome. Must improve: specify a fixture message guaranteed to trigger a tool call, or weaken to "本轮已发生的消息与（若有）工具调用".
- **[blindspot] B3 — untested error path on the journey's riskiest operation**: Setup "dsh 会话运行时可用，工作台处于会话视图" — runtime unavailable / send failure is the most probable real-world failure of this workflow and has no branch; surface-web lists network-error as a common web boundary. Must improve: add an edge case (send failure → error surfaced, no data loss, retry possible) or classify N/A with reason.
- **[blindspot] B4 — missing negative test on the only input surface**: Step 2 "在对话 tab 输入消息并发送" — empty/whitespace message submission is never tested (this is also the absent mandatory validation-error outcome). Must improve: add empty-input outcome (no send, guidance intact).
- **[blindspot] B5 — state-preservation assertions lack an observable probe**: Step 3 "切回对话 tab 会话状态不重置" and Step 5 "两侧状态（会话上下文 / 浏览上下文）均不丢失" — nothing defines what observable content proves preservation (e.g., the Step 2 transcript still present after the switches; a typed draft still intact). A downstream agent could "verify" with a no-op. Must improve: bind each retention claim to concrete observable evidence seeded in an earlier step.
- **[blindspot] B6 — scenario isolation undeclared**: Setup "已注册两个项目（甲、乙）" vs Step 1c "应用零项目记录（首用状态）" — sequential execution contradicts; the sibling set's isolation-declaration convention is missing here. Must improve: add a 场景隔离 statement (1c runs from a fresh-profile baseline).

---

## Deduction Rule Applications

| Rule | Applied | Detail |
|---|---|---|
| Missing required field/section → 0 for dimension | Not applied | All required sections present (Overview/Setup/Happy Path/Edge Cases/Invariants). |
| Hallucinated unclassified claim −30 | Not applied | No counterfactual claims found (verified against PRD sources). |
| Surface type violation −25 | Not applied as per-instance rule | No wrong-surface assertions (no CLI/API constructs). The ledger-read/zero-copy channel mismatch is scored under D2/D5.3 instead. |
| Invariant violation −40 | Not applied | No invariant violated by any step. |
| Precondition overlap −20/pair | Not applied | No overlapping precondition pair exists. |
| Golden Path veto | Not triggered | Golden path present and PRD-semantically verified (D7.1). |
| API-level golden path steps −15/step | Not applied | All steps are domain-level user operations. |

---

## Final Summary

```
SCORE: 882/1150
DIMENSIONS:
  Completeness: 156/200
  Semantic Purity: 180/200
  Precondition Exclusivity: 126/150
  Fact Alignment: 97/150
  Surface Fitness: 71/150   (min 90 — FAIL)
  Internal Consistency: 130/150
  Workflow Coverage: 122/150
```

**Verdict: FAIL** (total 882 < 975; Surface Fitness 71 < 90 min threshold).

**Priority fixes for revision (highest leverage first)**:
1. Add a "Derived Outcomes（Web Surface 必察项）" section classifying `validation-error` (empty-message send in chat tab — add a real step 2c) and `session-expired` (N/A: 单机无登录会话， nearest-neighbor mapping) with `source: inferred` annotations — restores up to ~90 pts across D1.3/D4.2/D5.1.
2. Fix executability: dock tab fixture for Step 6 (B1), deterministic message/tool-call spec for Steps 2–3 (B2), resolve 4b's project identity in Setup, declare scenario isolation for 1c (B5/B6 + D6.2).
3. Purify outcomes: move "实时读账本/零缓存零副本" to an audit-channel note; make retention claims observable-probe-bound (D2.1, B5).
4. State the 知识召回-tab deferral to knowledge-recall-flywheel (D7.3) and disambiguate Step 5's triple-alternative action (D1.2/D3.2).
