# Eval Report: knowledge-recall-flywheel (Journey) — Iteration 1

- **Document**: `docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/journey.md`
- **Feature**: dsh-forge-p1-mvp
- **Surface**: web (SURFACE_RULE: gen-journeys `rules/surface-web.md`)
- **Scorer persona**: Senior QA Engineer (adversarial)
- **Rubric**: journey.md (1150 pts, 7 dimensions, target 975, per-dimension min thresholds)
- **Iteration**: 1 (no previous report)
- **Verified against**: prd-user-stories.md (Stories 1/2/3/4), prd-spec.md (流程三, 召回飞轮流 Mermaid, DF003/DF004/DF006, Goals), prd-ui-functions.md (UF-2/3/4/6), proposal.md (Key Scenario 召回飞轮, SC10, SC-MVP, Assumptions Challenged 域前缀裁决), sibling journeys (knowledge-browsing, session-workbench, project-registration, project-registration-compensation) for convention comparison.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Core workflow coverage**: Happy Path Steps 1–7 do cover the claimed golden path — 注册（含知识库目录）→ 真实 dsh 会话（系统提示词知识段）→ 提问 → agent 自主 search → read-abstract 链 → 回答 → 知识召回 tab → 卡片热度 +1. This maps 1:1 onto SC-MVP's 6-step chain (注册 → 会话 → 召回 → 事件 → tab → 热度) and Story 4's three ACs. This is genuinely the SC-MVP golden path, not a stub.
2. **Executability for a downstream test-gen agent**: four concrete blockers:
   - Steps 4b/4c frame **direct tool invocation as User Action** ("以「前端」域前缀发起 search 查询" / "发起不带域前缀的 search 查询") — the product exposes no user channel to invoke the agent's search tool with a chosen domain prefix; Step 4c itself states "域选择是 agent 自主决策而非用户指定". No execution channel (question phrasing induction vs capability-API contract test) is declared.
   - Boundary fixtures are never planted: Step 4e requires a long-body knowledge entry ("命中知识的正文较长（超出 token 预算极简值）") and Step 4d requires "知识库中不存在与问题相关的知识" — both contradict Setup ("前端域存在与待问问题相关的知识条目") with **no scenario-isolation statement** (all four siblings declare 场景隔离 explicitly).
   - Step 7's "+1" comparison has **no baseline**: "卡片热度较召回前 +1" — Step 7 is the journey's first visit to the knowledge view; Setup never declares the fixture's initial heat/prior-event count (contrast knowledge-browsing: "K1 已被召回 3 次……供热度断言").
   - The golden path's pivotal outcome depends on **real-model nondeterminism** (agent autonomously deciding to search) with no fixture question and no wait/retry strategy ("等待 agent 完成回答").
3. **Observable behavior vs implementation assertions**: mostly observable UI states; exceptions — "项目知识目录被解析进应用侧索引（可重建缓存）" (Step 1), "条目与状态层使用事件数据一致" (Step 6), "全部数字与使用事件表保持一致" (Step 7b): equality with the app-internal event table is asserted with no declared browser observation channel (sibling conventions: seed the fixture and assert the visible number, or reclassify as audit channel).
4. **Self-contradiction check**: no invariant is violated by any step; but Invariant 1's unit — "每次召回……记一次使用事件" — is operationally ambiguous for a chain that executes two tool calls (search + read-abstract): per search-hit, per read-abstract, or per chain? The prd-spec mermaid feeds the event node from BOTH the search and read-abstract branches (W --> CC, Y --> CC), while Step 7 expects exactly +1 per chain. If the implementation logs per tool call, the golden path's own heat assertion fails with no diagnostic in the journey.

Anchors channeled into Dimensions 1/3/5/6/7 and blindspots below.

---

## Phase 2 — Rubric Scoring (verification stance)

### Dimension 1: Completeness (完整性) — 160/200 (min 120: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 1.1 Metadata | 50/50 | `journey: "knowledge-recall-flywheel"` kebab-case ✓; `risk_level: "High"` valid and justified — the workflow performs state mutation (project registration through the four-step compensation chain, real dsh session creation, usage-event writes), matching the High criterion "state mutation / irreversible operations" and sibling calibration (project-registration = High) ✓; `golden_path: true` consistent with content ✓; sources/surface/generated populated ✓. |
| 1.2 Steps complete | 70/80 | All 15 steps (7 happy + 8 edge) carry User Action + Expected Result and form a coherent ordered sequence ✓; edge cases carry Precondition ✓. −10: three edge-case "User Actions" are not performable actions on this surface — Step 4b "以「前端」域前缀发起 search 查询" and Step 4c "发起不带域前缀的 search 查询" (tool invocations no user can issue; Step 4c's own outcome says domain choice is the agent's), and Step 4d "agent 完成 search 后未获命中" (an outcome restated as an action). |
| 1.3 Outcomes: happy + required derived | 40/70 | Happy path outcomes complete ✓; boundary coverage otherwise good (no-knowledge-dir session 2b, domain filtering 4b/4c, no-hit fallback 4d, abstract-first 4e, empty tab 6b, stale entry 6c, accumulation 7b) ✓. −30: the web surface's mandatory derived outcomes (`validation-error`, `session-expired`) are **completely absent** — no step exercises invalid input on the journey's only input face (the chat question, Step 3 "以自然语言提出一个前端域的项目问题"), and session-expired is neither covered nor classified N/A (the sibling convention — "session-expired — N/A：单机产品无登录会话……" — exists and is unused here). Primary hit in D5.1; this criterion deducts the missing negative/boundary outcome layer as a completeness gap. |

### Dimension 2: Semantic Purity (语义纯度) — 180/200 (min 120: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 2.1 Natural language, not code/regex | 65/80 | No regex, CSS/XPath selectors, or framework assertion calls anywhere ✓; outcomes describe user-visible states in the main ✓. −15: recurring internal-state assertions inside Expected Results — Step 1 "项目知识目录被解析进应用侧索引（可重建缓存）", Step 6 "条目与状态层使用事件数据一致", Step 7 "数字与使用事件计数一致", Step 7b "全部数字与使用事件表保持一致". "Consistent with the event table/index" is a data-provenance property, not a browser observation; the document declares no observation channel (the sibling set's two treatments — seeded fixture with visible number, or explicit audit-channel reclassification — are both absent). |
| 2.2 Preconditions declarative | 60/60 | All eight edge preconditions are declarative state descriptions, not procedures — "项目知识目录未配置（或目录为空）", "知识库同时存在前端域与后端域知识条目", "命中知识的正文较长（超出 token 预算极简值）", "会话尚未发生任何知识召回" ✓. No setup-code phrasing anywhere. |
| 2.3 No implementation coupling in Steps | 55/60 | Actions are user/view-level operations (register, start session, ask, switch tab, browse) ✓; tool names (`search` / `read-abstract`) are domain vocabulary — the PRD's own user story uses them and the 轨迹 tab renders them, so no deduction for the names. −5: implementation-mechanism references — Step 4 User Action "（agent 经知识插件召回 tool 自主编排检索）" names the delivery plugin (invisible to the user); Step 1's index-cache phrasing is implementation state (already counted in 2.1, named here as step-level coupling once). |

### Dimension 3: Precondition Exclusivity (前置条件互斥性) — 125/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 3.1 Preconditions distinct across Outcomes | 60/60 | Every step has exactly one Expected Result; the eight edge preconditions are pairwise distinct and non-overlapping — knowledge dir absent/empty (2b) vs both domains present (4b) vs agent omits domain (4c) vs no relevant knowledge (4d) vs long body (4e) vs no recall yet (6b) vs entries exist (6c) vs prior recall exists (7b). No two outcomes share a precondition; no ambiguous pair (−20 rule not applied). |
| 3.2 Sufficient to uniquely select an Outcome | 40/50 | −10: Step 2b bundles two states into one precondition — "项目知识目录未配置（或目录为空）" — and asserts one outcome for both ("系统提示词不含知识段"). PRD Story 4 AC1 defines only the positive case; whether configured-but-empty and unconfigured behave identically (segment injection depends on dir existence or content?) is undefined, so the precondition may under-determine the outcome if the implementations diverge. |
| 3.3 No missing Preconditions for error/boundary Outcomes | 25/40 | All eight edge cases do state a trigger precondition ✓ — better than typical. −15: preconditions state the state but not its reachability — Steps 2b/4d/4e require knowledge-library states that **contradict the Setup baseline** ("前端域存在与待问问题相关的知识条目"; "应用处于零项目状态" for the baseline registration), with zero scenario-isolation or re-seeding declaration; Step 4e additionally needs a long-body entry that Setup never plants; Steps 4b/4c preconditions do not establish the execution channel (see D1.2). The sibling set's 场景隔离 convention ("……以独立知识目录状态启动，不与基线叠加") is absent. |

### Dimension 4: Fact Alignment (事实依据) — 95/150 (min 90: PASS, barely)

Independent verification performed: every PRD-cited claim was checked against prd-user-stories.md (Story 4 ACs 1–3, Story 1 happy, Story 2 AC1, Story 3 AC3), prd-spec.md (流程三, 召回飞轮流 mermaid, DF003/DF004/DF006), prd-ui-functions.md (UF-3/4/6) and proposal.md (SC10, SC-MVP, Key Scenario 召回飞轮, Assumptions Challenged). The knowledge-segment content, search → read-abstract chain, event-at-execution-point, tab composition (统计头/分组行/热度徽章), placeholder text, stale-row annotation, +1 heat and invariants all match sources — several verbatim (Step 4b ≙ SC10 "`search` 域前缀过滤正确（前端域查询不返回后端域条目）"; Step 4e ≙ SC10 "read-abstract 默认返回摘要（正文不整段注入）"; Step 4d ≙ mermaid no-hit branch "agent 转常规检索原语 grep / glob 等"; Step 4c ≙ proposal "`search` 显式带域前缀参数，可省略 = 全域"). **No counterfactual claim found.**

| Criterion | Score | Justification |
|---|---|---|
| 4.1 Factual claims traceable / UNKNOWN | 40/60 | Document-level traceability exists and is accurate ("**PRD 溯源**: Story 4（全部 3 条 AC）……SC10（召回核心子集）、SC-MVP 前半") — verified, not decorative. −20: zero per-claim `fact_id` / `UNKNOWN` mechanism anywhere; assertions on PRD-undecided specifics are unmarked — Step 4e references "超出 token 预算极简值" whose value the proposal explicitly defers ("token 预算极简值**设计期定**"); Steps 6/7/7b assert equality with an event table whose test-observation channel no source defines (knowledge-browsing marks the analogous seeding channel "预置通道 PRD 未定义——source: inferred"; this journey asserts it bare). |
| 4.2 Inferred claims with rule support + `source: inferred` | 20/50 | Zero `source: inferred` annotations in the entire document. The one genuinely unsourced derivation — Step 2b "系统提示词不含知识段（无知识库可召回），agent 直接走常规检索原语" (the negative of Story 4 AC1, present in no source) — is asserted without classification or reasoning basis. The surface-mandated derived outcomes (the primary home of inferred claims) do not exist at all (root cause shared with D5.1). Sibling convention (knowledge-browsing, session-workbench) applies `source: inferred` pervasively; this journey applies it nowhere. |
| 4.3 No hallucinated unclassified claims | 35/40 | No fabricated system behavior found — every load-bearing claim matches PRD/proposal/spec text (verified above). −5: Step 2b's merged negative-case behavior ("不报错"、"agent 直接走常规检索原语") extends beyond every defined source without classification — unclassified inference rather than fabrication, so the −30 hallucination rule is not triggered, but it is not clean either. |

### Dimension 5: Surface Fitness (Surface 适配, web-parameterized) — 65/150 (min 90: **FAIL**)

| Criterion | Score | Justification |
|---|---|---|
| 5.1 Mandatory derived Outcomes present | **0/60** | surface-web.md: "Mandatory derived Outcomes (**must be considered for every Web Journey**): validation-error … session-expired". Both are **completely absent**: no step exercises invalid input on the journey's only input face (Step 3 "在对话 tab 以自然语言提出一个前端域的项目问题" — no empty/whitespace submission case, unlike sibling session-workbench Step 2c which covers exactly this input face), and session-expired is neither covered nor classified N/A with the single-machine rationale (sibling convention exists and is unused). The document has no "Derived Outcomes（Web Surface 必察项）" section at all. Rubric: "Score 0 if mandatory Outcomes are completely absent." Applied as written — same application as sibling iteration-1 precedents in this doc set. |
| 5.2 Test strategy proportions (Web: balanced 50/50) | 40/50 | The 7-step deep golden chain (journey-smoke material) plus 8 granular boundary cases (contract material) is a reasonable balanced mix ✓. −10: Steps 4b/4c/4e are capability-API-shaped contract tests (SC10 assertions: domain filtering, domain-omission scope, abstract default) living inside a web journey with **no declared channel split** — the proposal explicitly defines the fallback channel ("召回能力面先以产品内部 API 直测承接"); the journey should state which level carries each, otherwise a test-gen agent must guess how to drive a domain-prefixed search from a browser. |
| 5.3 Environment/execution assumptions realistic | 25/40 | Browser interaction model ✓; real dsh runtime and credential domain declared in Setup ("dsh 会话运行时可用（模型 API 凭证归 dsh profile 域，产品不经手）") ✓; tab-switch and view-navigation interactions realistic ✓. −15: (a) the flow's longest, least deterministic async operation — the real agent round trip — carries no wait/stability anchor or retry policy ("等待 agent 完成回答"; "agent 依知识段指引决定检索路径" is model-dependent with no fixture question and no flakiness containment, despite the proposal's e2e-layering strategy); (b) event-table equality assertions assume an observation channel that is not declared; (c) Steps 4b/4c assume direct search-tool invocation that the web surface cannot perform. |

### Dimension 6: Internal Consistency (一致性) — 125/150 (min 90: PASS)

| Criterion | Score | Justification |
|---|---|---|
| 6.1 Invariants hold in every Step | 50/60 | No step violates any of the five invariants; Steps 4–7 uphold the event-consistency invariant, Step 4d upholds the no-event-on-no-recall side, no step writes to the repo/knowledge dir, Step 6 upholds the tab-no-reset invariant ✓. −10: Invariant 1's counting unit is operationally ambiguous — "每次召回于执行点记一次使用事件" — while the golden-path chain executes **two** tool calls (search + read-abstract) and the prd-spec mermaid routes BOTH into the event node (W --> CC, Y --> CC). The journey implicitly resolves "one chain = one event = +1" (Step 7) but never defines "一次召回"; UF-4's grouped rows carry "动词明细", yet the journey never states which verb(s) the golden path logs — if events are per tool call, Step 7 fails at +2 and the tab shows a different row shape, with no diagnostic expectation in the journey. |
| 6.2 Cross-Step references consistent | 35/50 | Step 7b "同一会话中已发生过一次召回（tab 已有条目）" → golden path ✓; Step 6c "召回 tab 存在分组行条目" → Step 6 ✓; Step 4's 命中知识 → Setup's front-end fixture ✓. −15: Step 7's central assertion "卡片热度较召回前 +1" dangles — **no prior step observes the card's heat and Setup declares no initial value** (contrast knowledge-browsing's seeded "K1 已被召回 3 次"). As sequenced, "召回前" is unknowable to the test; the comparison also silently presumes the fixture knowledge starts at a known count. Step 6's "统计头（召回次数 / 覆盖条数）" likewise names fields without instantiating the golden-path values (1 / 1), unlike the sibling's concrete "K1 徽章 = 3". |
| 6.3 Risk level consistent | 40/40 | High = "state mutation / data loss risk / irreversible operations" — accurate: the journey registers a project through the dsh-create compensation chain (irreversible external side effects possible on failure), creates real dsh sessions, and writes usage events. Consistent with sibling project-registration (High). |

### Dimension 7: Workflow Coverage (工作流覆盖度) — 130/150 (min 90: PASS; veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| 7.1 Golden Path existence (veto) | 60/60 | Veto not triggered: Happy Path Steps 1→7 form a contiguous domain-level sequence semantically matching SC-MVP's chain verbatim (注册项目 → 发起真实会话 → agent 经 tool 召回 → 使用事件落库 → 会话召回 tab 可见 → 卡片热度 +1) plus Story 4's three ACs and the 召回飞轮流 mermaid. Steps reference user/domain operations (注册、提问、切页签、看卡片), not bare API calls; `golden_path: true` metadata matches content. |
| 7.2 Multi-step coverage depth | 40/50 | Beyond the golden path: no-hit error recovery (4d → 常规检索原语), scope-variant retrievals (4b/4c), empty state (6b), cross-entity navigation (recall row → knowledge drawer, 6c), staleness on external deletion (6c), temporal accumulation (7b) — good depth. −10: the recall tab's **aggregation semantics are never stressed** — every scenario recalls a single knowledge item once, so 召回次数 and 覆盖条数 collapse to the same number and the grouped-row machinery ("按知识分组行" with 动词明细/最近时间) is never exercised with ≥2 distinct knowledge items. |
| 7.3 Completeness against PRD scope | 30/40 | Story 4's three ACs fully covered; Story 1 happy path, Story 2 AC1 and Story 3 AC3 prefixes covered as claimed in PRD 溯源 ✓. −10: (a) SC10 requires "`关键词细分`生效（e2e **各一条**）" as a distinct assertion — the journey mentions 关键词细分 only parenthetically inside Step 4's chain ("`search`（选前端域前缀 + 关键词细分）") with no step or edge case exercising it; (b) the flywheel mermaid's entry node is "会话发起 **/ 恢复**" — recall-tab and heat persistence across session restore or app restart (the durability behind "哪些知识在哪些会话被用了") is untested with no deferral note. |

### Cross-dimension coherence check

- The single root cause "web mandatory derived outcomes absent" manifests in D1.3 (−30), D4.2 (−30), D5.1 (−60). The heaviest hit is deliberately in D5 where the rubric locates the rule; D1.3/D4.2 carry secondary manifestations per their own criterion text.
- The "boundary fixtures/isolation missing" root cause manifests in D3.3 (−15) and D5.3; the "event-table observability" root cause manifests in D2.1 (−15) and D5.3; the "+1 without baseline" manifests in D6.2 — each counted once per dimension where its criterion text most directly applies, cross-referenced rather than double-penalized.

---

## Phase 3 — Blindspot Hunt (QA-domain patterns outside rubric dimensions)

- **[blindspot] B1 — asserted observation never exercised**: Step 4's Expected Result claims "检索链可在「轨迹」tab 观察为工具调用时序" — but no step ever switches to the 轨迹 tab: Step 6 jumps straight to 知识召回. The search/read-abstract entries in the trajectory ledger (the only direct UI evidence that the agentic chain executed) are never verified; sibling session-workbench verifies generic tool calls only. Must improve: add an explicit trajectory-tab step asserting the `search` → `read-abstract` entries and their order.
- **[blindspot] B2 — nondeterministic golden path without containment**: Setup guarantees only "前端域存在与待问问题相关的知识条目" — no fixture question text, no property ensuring the model chooses to search before answering (SC10 demands natural-language trigger, "agent 自主"). A single flaky model run fails Steps 4/6/7 wholesale with no retry/tolerance/degrade policy encoded. Must improve: specify the fixture question, declare the wait/observation window and a retry or contract-fallback policy.
- **[blindspot] B3 — aggregation untested with divergent numbers**: "统计头（召回次数 / 覆盖条数）" — with one knowledge item recalled once, both numbers equal 1 and cannot distinguish correct aggregation from echo. Must improve: a multi-recall / multi-knowledge scenario (e.g., 3 recalls across 2 items → 次数 3, 覆盖 2) to pin the aggregation semantics (also see D7.2).
- **[blindspot] B4 — event-unit ambiguity is a production-bug trap**: Invariant "每次召回于执行点记一次使用事件" vs a chain executing two tool calls (search + read-abstract) with the mermaid feeding the event node from both; Step 7 expects +1. If the implementation logs per tool call, heat = +2 and the tab shows two rows — the golden path fails with no diagnostic expectation in the journey. Must improve: define the event unit (per chain / per tool) and the expected 动词明细 for the golden path.
- **[blindspot] B5 — durability of the flywheel record never tested**: Overview sells "哪些知识在哪些会话被用了" 可见, and the mermaid starts from "会话发起 / 恢复" — yet no case verifies recall-tab entries or heat surviving app restart or session restore. Must improve: a restore/restart case or an explicit deferral note.
- **[blindspot] B6 — untested error path on the journey's riskiest dependency**: Setup "dsh 会话运行时可用（模型 API 凭证归 dsh profile 域，产品不经手）" — runtime/credential failure is the most probable real-world failure of this workflow (the proposal's own #2 Key Risk) and has no branch; surface-web lists network-error as a common web boundary. Must improve: an error-path case (send failure surfaced, no data loss, retry possible) or N/A classification with reason.

---

## Deduction Rule Applications

| Rule | Applied | Detail |
|---|---|---|
| Missing required field/section → 0 for dimension | Not applied | All required sections present (Overview/Setup/Happy Path/Edge Cases/Invariants); frontmatter complete. |
| Hallucinated unclassified claim −30 | Not applied | No counterfactual claims found (verified against PRD/spec/proposal sources). Step 2b's negative-case inference is unclassified but not fabricated; scored under D4.1/D4.2. |
| Surface type violation −25 | Not applied as per-instance rule | No cross-surface constructs (no CLI/API assertions). The tool-invocation-as-user-action problem (4b/4c) is an execution-assumption/channel failure, scored under D1.2/D5.2/D5.3. |
| Invariant violation −40 | Not applied | No invariant violated by any step. |
| Precondition overlap −20/pair | Not applied | No overlapping precondition pair exists. |
| Golden Path veto | Not triggered | Golden path present and PRD-semantically verified against SC-MVP / Story 4 (D7.1). |
| API-level golden path steps −15/step | Not applied | Golden-path steps are domain-level user operations; the tool-level framing occurs only in edge cases 4b/4c/4d (deducted in D1.2). |

---

## Final Summary

```
SCORE: 880/1150
DIMENSIONS:
  Completeness: 160/200
  Semantic Purity: 180/200
  Precondition Exclusivity: 125/150
  Fact Alignment: 95/150
  Surface Fitness: 65/150   (min 90 — FAIL)
  Internal Consistency: 125/150
  Workflow Coverage: 130/150
```

**Verdict: FAIL** (total 880 < 975; Surface Fitness 65 < 90 min threshold).

**Priority fixes for revision (highest leverage first)**:
1. Add a "Derived Outcomes（Web Surface 必察项）" section classifying `validation-error` (empty/whitespace question submission in the chat tab — add a real step 3b) and `session-expired` (N/A: 单机产品无登录会话, per sibling convention) with `source: inferred` annotations — restores up to ~120 pts across D1.3/D4.2/D5.1.
2. Fix executability: declare scenario isolation + plant the fixtures Steps 2b/4d/4e need (no/empty knowledge dir, irrelevant-only library, long-body entry); declare the execution channel for 4b/4c (question induction vs capability-API contract level) (D1.2, D3.3, D5.2/5.3).
3. Make consistency assertions observable: seed/declare initial heat (e.g., 0) or add a pre-recall observation step for Step 7's "+1"; instantiate Step 6's 统计头 values; define the event unit (per chain vs per tool call) and expected 动词明细 (D2.1, D6.1, D6.2, B3/B4).
4. Annotate unsourced inferences (Step 2b) with `source: inferred` and mark PRD-undecided specifics (token 预算极简值, event-table observation channel) `UNKNOWN` or inferred (D4.1/4.2).
5. Add a trajectory-tab verification step (B1), a fixture question + retry policy for the agent-dependent golden path (B2), and an error-path or N/A for dsh runtime unavailability (B6); cover SC10's 关键词细分 distinctly and note the restore-durability deferral (D7.3, B5).
