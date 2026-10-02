# Journey Eval Report — iteration 2

- **Document**: `docs/features/dsh-forge-p1-mvp/testing/project-registration-compensation/journey.md`
- **Journey**: project-registration-compensation (feature: dsh-forge-p1-mvp)
- **Surface**: web (SURFACE_RULE: `gen-journeys/rules/surface-web.md`)
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, target 975, min per-dimension thresholds)
- **Iteration**: 2 (previous: `eval/iteration-1.md`, score 762/1150 — FAIL)
- **Scorer stance**: adversarial, scored only on what is on the page now. All factual claims re-verified independently against the four declared sources (prd-user-stories.md Story 1 AC3/AC4; prd-spec.md 流程一 items 5–8 + 创建补偿流 Mermaid + Goal table line「全流程后 dsh 侧孤儿注册 = 0」+ SC12; prd-ui-functions.md UF-3 States「失败」/ Validation Rules / Data Requirements「已注册标记」「workspaceId uuid = 应用库外键」; proposal Key Scenario 失败路径 + SC12), plus the sibling journey `project-registration` (Step 3d exists as claimed) and the family-wide `golden_path` frontmatter convention.

## Step 1 — Verification of iteration-1 attack points

| # | Iteration-1 attack | Status | Evidence in current document |
|---|---|---|---|
| 1 | Step 3 fault-injection mechanism unnamed (D1/D5, blindspot 1) | **Addressed** | Setup: 「故障注入 = 宿主测试开关（env 或调试 RPC，如 `test.setFault("appdb.write"|"registry.delete","fail")`，仅测试构建生效…）（source: inferred，测试基建契约——PRD 未定义）」 |
| 2 | No observation channel for dsh-side/ledger assertions (D5, blindspot 2) | **Addressed** | Setup: 「非 UI 断言的观察通道：dsh 注册态 =「已注册」标记…或 registry 探针；应用侧记录 = 左栏项目树或应用库直读；记账日志 = 测试侧日志探针…；workspaceId = registry 按 path 反查」 |
| 3 | Mandatory web outcomes validation-error / session-expired absent (D1/D4/D5) | **Addressed** | New section 「Derived Outcomes（Web Surface 必察项）」: both considered, justified N/A, `source: inferred` annotations, mapping to sibling Step 3d (verified to exist) and Step 3b |
| 4 | Zero `source: inferred` annotations (D4) | **Addressed** | Five annotations now present (Setup injection contract; Step 5b; both Derived Outcomes entries) |
| 5 | Step 5b hallucinated/unclassified claim (−30, D4) | **Addressed** | Step 5b now carries full derivation: 「source: inferred——重试成功非 PRD 原文，派生自①按 canonical path 匹配 + ②幂权…；「孤儿=0」为 SC12/PRD Goal 原文」(verified: 「孤儿=0」 is prd-spec Goal table + SC12 wording) |
| 6 | Step 4 「应用侧无残留 projects 行」 DB-row language unobservable (D2/D5) | **Addressed** | Now 「应用侧无残留——观察通道断言（registry 探针；左栏项目树无该项目）」 |
| 7 | Invariant 「孤儿=0」 contradicted by Step 4b (−40, D6) | **Addressed** | Invariant now scoped: 「补偿成功路径（Step 3/3b/3c/5/5b/5c 终态）…唯一例外 = Step 4b：孤儿按设计保留…不计入「孤儿=0」口径」 |
| 8 | Step 3b cancel vs non-interruptibility invariant unreconciled (D6, blindspot 3) | **Partially addressed** | Mechanism now named and reconciled semantically: 「关闭应用窗口/终止宿主进程…宿主级中断（不违「不可交互中断」：该约束限定 UI 交互面）」+ invariant 「宿主级中断（Step 3b 形态）不属交互中断」. **But the two named forms are conflated into one expected result — new residual issue, see D6.** |
| 9 | Scenario isolation/reset undefined (blindspot 4) | **Addressed** | Setup: 「场景隔离：各场景用专属新建路径（互不重叠）从基线启动；唯 Step 5b 衔接 Step 3–4 同场景终态…；4b 孤儿因路径不重叠不外溢」 |
| 10 | Step 5 「再次触发补偿调用」 internal call (D1/D7) | **Addressed** | Routed through declared test switch: 「系统级重放——经测试开关对同一 workspaceId（②后经 registry 探针捕获）再触发一次补偿」 |
| 11 | Step 2 non-action 「注册执行继续」 (D1) | **Partially addressed** | Unchanged action text; wait-until condition now inferable from Expected Result + observation channels. Residual minor. |
| 12 | Golden-path steps API-level (−15×2, D7) | **Addressed** | No API-call descriptions remain in step actions (RPC name confined to Setup); Step 3/5 actions are now system/fault-level domain triggers, matching SC12's own 「模拟第③步失败」 framing. Residual small deduction for zero-agency/harness-flavored actions. |
| 13 | `golden_path: false` frontmatter vs body Happy Path (D7 note) | **Resolved as convention** | Verified: 5 of 6 family journeys carry `golden_path: false` while having Happy Path sections (only knowledge-recall-flywheel is `true`) — family semantics = "is the feature's designated golden path". Not a defect; scored on body content. |
| 14 | Foreign/nonexistent workspaceId compensation boundary missing (blindspot 5) | **Not addressed** | No scenario for compensating an id that has no registration. Carried forward. |
| 15 | 100/0 Journey-vs-Contract proportion (D5 c2) | **Partially addressed** | UI-level observables woven in (已注册标记、左栏项目树、失败反馈、启动对账提示); no standalone Contract-level outcomes added. |
| 16 | Happy-path steps lack per-step Precondition fields (D1/D3) | **Not addressed** | Unchanged; carried as minor. |
| 17 | ①–④ chain numerals shadow journey Step numerals (D6) | **Partially addressed** | Consistent 「②步/③步」 suffix usage mitigates; collision persists as minor. |

**No regressions introduced**: all revision additions (Setup contracts, Derived Outcomes section, invariant scoping) were checked per-dimension; the new residuals are (a) the 3b two-mechanism conflation the revision surfaced, and (b) the injection-vocabulary gap vs 5c drift preset (below).

## Step 2 — Phase 1: Reasoning Audit

1. **Domain coverage remains 1:1 with PRD.** Four-step chain, 保目录保会话日志, ownership protection, compensation idempotency, ledger + startup prompt (no auto-delete), single-direction reference repair, UF-3 失败 feedback content — all verified against sources. The journey correctly follows the *guarded* spec text (item 5 「且属本次新建」) rather than the PRD Mermaid's unguarded H→I edge (which routes the attach branch F1 into ④ as well) — the journey's Step 3c + Invariant 3 match the normative text and AC3, not the diagram's flaw. Correct choice, no issue.
2. **Executability is now largely established.** The Setup test-control contract (injection switch, per-assertion observation channels, scenario isolation, workspaceId capture method, restart capability) converts the previously un-executable scenarios into a derivable test plan. Two residual executability concerns: the Step 5 workspaceId capture window (post-②, pre-④, inside a fast non-interruptible chain — after ④ the path reverse-lookup returns nothing), and the 3b hard-kill form (nothing left running to execute ④).
3. **Outcomes are observable behaviors** for the most part; chain-stage mechanism vocabulary (①–④, registry.* names) is retained as spec-echo but now paired with named observation channels.
4. **Coherence finding (new).** Step 3b names two interruption forms — 「关闭应用窗口/终止宿主进程」 — and asserts a single end state 「④补偿执行删除该注册；重启后…该路径无孤儿注册」. For a graceful window close (host process survives), this is the spec's 流程窗口内取消 → compensation semantics. For a hard process kill, no in-process code can run ④, and the document's own Invariant 4 + spec item 6 forbid startup auto-delete — so the kill form must terminate in a 4b-style orphan + prompt, contradicting the asserted 「该路径无孤儿注册」. The step is conditionally inconsistent with the document's own mechanics depending on which form is executed.

## Step 3 — Phase 2: Rubric Scoring

### Dimension 1: Completeness — 184/200 (threshold 120, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Metadata | 50/50 | Kebab-case name; `risk_level: "High"` justified (registry deletion, orphan/data-consistency stakes); all frontmatter fields populated; sources verifiable. |
| Steps complete | 72/80 | All 10 steps (5 happy + 5 edge) have name + User Action + Expected Result in coherent order. Deductions (−8): Step 2's action 「注册执行继续（等待②步完成）」 is a passive wait with no agency and no named completion signal in the action itself; happy-path steps still carry no Precondition fields, relying on implicit carry-over from Setup. |
| Outcomes coverage | 62/70 | Web mandatory derived outcomes now present as considered-and-justified N/A (verified against UF-3 Validation Rules line 166 and PRD Security 单机边界); boundary richness high (3b/3c/4b/5b/5c). Deduction (−8): Step 4b omits the immediate failure-feedback outcome — Expected Result jumps from injection to 「补偿失败记入记账日志…；下次启动呈现启动对账提示」, never asserting the UF-3 失败-state feedback (失败原因 + 补偿结果说明, where the compensation result = failed) at failure time, despite the PRD Mermaid routing K → L(失败反馈呈现) and the journey's own Invariant 5. |

### Dimension 2: Semantic Purity — 174/200 (threshold 120, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Natural-language outcomes | 72/80 | No regex/CSS/XPath/assert idioms in any outcome. Outcomes now land on observable end states with named channels (「该路径无注册、应用侧无残留」「左栏项目树无该项目」). Deduction (−8): outcomes still lead with mechanism and append the observable state — e.g. Step 3 「④ 补偿自动执行，终态：…（④=registry.delete 补偿）」 puts the internal operation first. |
| Preconditions declarative | 56/60 | Edge-case preconditions are declarative state descriptions (「②步已执行、③应用库写入尚未完成」「应用库 projects 记录的 workspace_id 与 registry 实际 canonical path 失配」). Minor (−4): 4b's 「④补偿调用本身失败（经注入开关触发）」 and 5c's 「漂移态经注入契约预置」 mix state with setup-mechanism references. |
| No implementation coupling in steps | 46/60 | Step texts and expected results retain internal call names and schema detail: Step 1 「① ownership 预检（registry.list 按 canonical path 匹配）」, Step 2 「（workspaceId，uuid，即应用库外键）」. Mitigations (why above iteration-1's 30): the ①–④ vocabulary is prd-spec 流程一 item 5's own (SC12 itself asserts dsh-side state), the test-control contract is now isolated in Setup rather than spread through steps, and every mechanism mention is paired with a user-observable assertion. |

### Dimension 3: Precondition Exclusivity — 137/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Preconditions distinct | 57/60 | Single-outcome-per-step structure; edge-case preconditions pairwise exclusive (3b in-window new-build / 3c precheck-hit attach / 4b delete-call failure / 5b fully compensated same-scenario / 5c id drift). Minor (−3): Step 5's enabling condition 「②后经 registry 探针捕获」 is buried in the action parenthesis instead of a Precondition field. |
| Sufficient to uniquely select | 46/50 | Each scenario's precondition + trigger uniquely determines its outcome (Step 3 injects ③ failure vs 3b host interrupt vs 4b ④ failure — distinct fault points). Deduction (−4): 4b's precondition states only the trigger 「④补偿调用本身失败」, omitting the enabling state — ④ is invoked only on a new-build path where ③ already failed or the window was cancelled; a downstream agent cannot set up 4b (needs both fault points + new-build path) from the precondition as written. |
| Error/boundary triggers stated | 34/40 | All edge cases state triggers. Deductions (−6): 4b enabling-state gap (above); Step 3's trigger still lives only in the action 「系统级触发故障——经注入开关令③步应用库写入失败」 with no precondition expression (Setup contract partially compensates). |

### Dimension 4: Fact Alignment — 129/150 (threshold 90, PASS)

Judged against the document's declared apparatus (sources frontmatter + PRD 溯源 section; project has no fact_id convention).

| Criterion | Score | Justification |
|---|---|---|
| Factual claims traceable | 52/60 | Independently verified accurate: four-step chain + 保目录保会话日志 (spec item 5), ownership protection (AC3 + item 5), 幂等 no-op (AC4 + SC12), ledger + prompt 不自动删 (item 6 + SC12), 单向修引用 (item 8), 失败反馈内容 (UF-3 States 失败), 不可交互中断 + 取消点 (UF-3 Validation Rules), 已注册标记 (UF-3 Data Requirements), workspaceId uuid 外键 (UF-3 Data Requirements), sibling Step 3d delegation (verified exists), 「孤儿=0」原文 (prd-spec Goal table). Deductions (−8): unannotated interpretive/infra claims — Step 3b's 「流程窗口内取消」唯一形态 = 宿主级中断」 (PRD names no cancellation mechanism; this interpretation is presented as settled without `source: inferred`), and the observation-channel bullet's 「P1 无对账 UI」/「测试侧日志探针」 (test infrastructure absent from PRD, unannotated — unlike the adjacent injection bullet which is properly annotated). |
| Inferred claims annotated | 45/50 | Required-outcomes derivations properly annotated: validation-error 「source: inferred——必察项 × UF-3 校验时序」, session-expired 「source: inferred——必察项 × PRD 安全边界，映射至 Step 3b」; Step 5b carries an exemplary full derivation basis; Setup injection contract annotated 「source: inferred，测试基建契约——PRD 未定义」. Deduction (−5): annotation discipline stops at those bullets — the equally-inferred observation-channel contract and the 3b mechanism interpretation carry none. |
| No hallucinated unclassified claims | 32/40 | The iteration-1 −30 instance (Step 5b) is now classified with derivation. No new full hallucinations found. Deduction (−8): Step 3b's expected result 「④补偿执行删除该注册；重启后…该路径无孤儿注册」 asserts concrete system behavior for the 终止宿主进程 form that is traceable only for the graceful-close reading; the kill-form behavior is asserted without PRD basis or inference annotation and is mechanically doubtful under the document's own Invariant 4. Classified as partial-traceability weakness rather than a −30 hallucination (the outcome text itself is spec-verbatim for 流程窗口内取消). |

### Dimension 5: Surface Fitness — 121/150 (threshold 90, PASS) — web-parameterized

| Criterion | Score | Justification |
|---|---|---|
| Mandatory derived outcomes | 58/60 | Both `validation-error` and `session-expired` (surface-web.md 「must be considered for every Web Journey」) are considered in a dedicated section with sound, verified dispositions: invalid paths intercepted at form state per UF-3 Validation Rules (verified line 166) so they cannot enter the post-确认 failure window; session concept absent per PRD Security 单机边界 (verified — no login/session anywhere in prd-spec), nearest analog mapped to Step 3b. Deduction (−2): validation-error coverage rests entirely on cross-document delegation (sibling Step 3d), leaving zero in-document assertion even at the journey's own form-state entry (Step 1 passes through the form). |
| Test strategy proportions (web 50/50) | 32/50 | All outcomes remain workflow-level; no standalone Contract-level interaction outcomes (failure-feedback component states, startup-prompt element behavior, 执行中 progress indicator) that the balanced split expects. Improvement over iteration 1: UI-level observables are now woven into workflow outcomes (已注册标记, 左栏项目树, 失败反馈内容, 启动对账提示), giving contract-testable touchpoints. |
| Environment/execution assumptions realistic | 31/40 | Now realistic for browser automation + host-level control: injection switch (test build only), per-assertion observation channels, restart capability, scenario isolation via dedicated paths, workspaceId capture method. Deductions (−9): injection mechanism left as a two-way choice 「env 或调试 RPC，如…」 (agent must discover which exists); the exemplified `test.setFault(<op>,"fail")` vocabulary cannot express 「5c 漂移预置同经此」 (a fail-fault is not a drift preset — contract loose end); Step 5's mid-flight capture window (see blindspots) unspecified. |

### Dimension 6: Internal Consistency — 132/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Invariants hold in every step | 46/60 | Iteration-1 violation resolved: orphan=0 invariant explicitly scoped with the 4b exception; 3b reconciled with the non-interruptibility invariant via the UI-interaction-face scoping. Verified Inv2 (directory/logs preserved — asserted in 3/3b/5), Inv3 (attach never enlisted/deleted — 3c, matching the guarded spec text rather than the PRD Mermaid's unguarded edge), Inv4 (4b). Deduction (−14): Step 3b names two interruption forms — 「关闭应用窗口/终止宿主进程」 — with one expected result 「重启后经观察通道断言：目录与会话日志保留、该路径无孤儿注册」. A hard process kill leaves nothing running to execute ④, and the document's own Invariant 4 / spec item 6 (启动不自动删) mean the kill form must end in a persisted orphan + prompt — contradicting the asserted orphan-free end state and Invariant 1's claim for 3b. Charged as a conditional step-level inconsistency (not the formal −40 invariant violation, since the graceful-close form plausibly satisfies it and 「终止」 admits a graceful reading — the ambiguity itself is the defect). |
| Cross-Step references consistent | 46/50 | 「①预检」→Step 1; 「同一 workspaceId（②后…捕获）」→Step 2 output; 5b 「衔接 Step 3–4 同场景终态：dsh 侧无孤儿」 matches Steps 3–4 end state; Setup isolation note ↔ 5b precondition consistent; Setup 「已注册的既有工作区」 ↔ 3c precondition. Minor (−4): ①–④ chain numerals still shadow journey Step numerals (mitigated by 「②步/③步」 suffixes); Setup's 「唯 Step 5b 衔接 Step 3–4 同场景终态」 overlooks that Happy-Path Step 5 also continues the Steps 1–4 scenario (defensible if 「场景」 means edge-case scenarios only, but a downstream agent sequencing tests must infer that). |
| Risk level consistent | 40/40 | High is correct: irreversible registry deletion, orphan/data-consistency stakes. |

### Dimension 7: Workflow Coverage — 138/150 (threshold 90, PASS; Golden Path veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| Golden Path existence (veto) | 52/60 | Happy Path Steps 1–5 form a contiguous sequence semantically matching Story 1 AC4 / SC12's four assertions (register → create + enlist compensation → failure triggers compensation → feedback → idempotent re-compensation). No API-level step descriptions remain (the −15 rule's trigger no longer met: RPC names are confined to Setup; Step 3/5 actions are system/fault-level domain triggers, consistent with SC12's own 「模拟」 framing). `golden_path: false` verified as family convention (5 of 6 journeys false) — not a defect. Deduction (−8): Step 2's zero-agency action 「注册执行继续（等待②步完成）」 and Step 5's harness-replay framing 「系统级重放——经测试开关…」 dilute user-story correspondence within the sequence. |
| Multi-step coverage depth | 48/50 | Deep: full lifecycle (register → compensate-delete → re-register), failure-of-failure (4b), drift repair (5c), idempotency (5), cross-entity consistency (registry × projects × session logs × 左栏). |
| Completeness vs PRD scope | 38/40 | All declared-scope workflows covered (Story 1 AC3/AC4, spec items 5–8, proposal 失败路径 all three elements: ③-failure compensation / clean-exit cancel delegated to sibling / ownership protection). Startup-prompt resolution after 4b correctly stops at 「只提示」 (P1 defines no resolution action). Deduction (−2): the 执行中 progress state (UF-3: 「进度指示（不可中断）」) that visually evidences the non-interruptibility this journey leans on is never asserted in any step. |

## Cross-dimension coherence check

- The **3b two-mechanism conflation** is the largest remaining cross-cutting defect (D6 −14, echoed in D4 partial-traceability and D5 executability). One root fix: split Step 3b into graceful-close (compensation completes → orphan-free) and hard-kill (compensation cannot run → orphan persists → 4b-style prompt), or pin the single supported mechanism.
- The **test-control contract** (Setup) resolved the iteration-1 executability cluster across D1/D5; its remaining loose ends (two-way mechanism choice, drift-preset vocabulary, Step 5 capture window) are charged once each where the rubric locates them.
- D4/D5's shared iteration-1 root cause (web required_outcomes never consulted) is resolved: derivations present, annotated, and verified.

## Step 4 — Phase 3: Blindspot Hunt

1. `[blindspot]` **Step 4b never asserts the failure-time feedback content.** Quote: 「**Expected Result**: 补偿失败记入记账日志（测试侧日志探针）；下次启动呈现启动对账提示——孤儿工作区只提示不自动删」. The PRD Mermaid routes 补偿失败 → 记账+提示 → 失败反馈呈现, and the journey's own Invariant 5 demands 「失败反馈必须同时说明补偿结果」 — yet the one scenario whose compensation result is *failure* asserts no feedback at all. The derived test suite will skip verifying the most information-rich feedback variant (compensation-failed messaging). Add the immediate UF-3 失败-state assertion to 4b.
2. `[blindspot]` **workspaceId capture race in Step 5.** Quotes: 「对同一 workspaceId（②后经 registry 探针捕获）再触发一次补偿」 + Setup 「workspaceId = registry 按 path 反查」. After ④ deletes the registration, a path reverse-lookup returns nothing — the id is obtainable only inside the ②→④ window of a fast, non-interruptible chain. No durable capture channel is specified (ledger entry? injection-RPC echo? pre-registered probe poll?). A downstream agent will either race or fail to capture. Specify the durable capture mechanism.
3. `[blindspot]` **Injection vocabulary cannot express the 5c drift preset.** Quote: 「如 `test.setFault("appdb.write"|"registry.delete","fail")`，仅测试构建生效；5c 漂移预置同经此」. A fail-fault on two named operations is not a state-preset primitive (mutating a projects row's workspace_id). The claim 「同经此」 extends the contract beyond what the example defines; the agent must invent a preset operation. Pin the preset operation in the contract.
4. `[blindspot]` **Foreign/never-created workspaceId compensation boundary still absent** (iteration-1 blindspot 5, unaddressed). Quote: 「重复补偿为 no-op——不产生二次删除、不报错、不波及目录与会话日志」 (scope: 同一 workspaceId only). The adversarial complement — compensating an id that has no registration (expected: no-op? error? directory untouched?) — is unspecified and unannotated, though it is the natural `source: inferred` boundary for a delete-based compensator.

## Deduction-rule ledger

| Rule | Instances | Applied |
|---|---|---|
| Hallucinated/unclassified claim −30 (D4) | 0 (iteration-1 instance now annotated; 3b kill-form charged as partial traceability −8, not hallucination) | — |
| Invariant violation −40 (D6) | 0 formal (orphan=0 violation resolved by scoping; 3b kill-form charged as conditional step-level inconsistency −14) | — |
| API-level golden-path step −15 (D7) | 0 (no API-call descriptions remain in step actions) | — |
| Precondition overlap −20 (D3) | 0 | — |
| Surface violation −25 (D5) | 0 | — |
| Golden Path veto | Not triggered | — |

## Summary block

```
SCORE: 1015/1150
DIMENSIONS:
  Completeness: 184/200
  Semantic Purity: 174/200
  Precondition Exclusivity: 137/150
  Fact Alignment: 129/150
  Surface Fitness: 121/150
  Internal Consistency: 132/150
  Workflow Coverage: 138/150
VERDICT: PASS — total 1015 ≥ 975 and every dimension above its min threshold.
```

Remaining fixes by impact: (1) split or pin Step 3b's two interruption forms — the hard-kill form's orphan-free expected result contradicts the document's own no-auto-delete mechanics; (2) assert the failure-time feedback (失败原因 + 补偿结果=失败) in Step 4b per Invariant 5; (3) close the test-contract loose ends: single injection mechanism, drift-preset operation, durable workspaceId capture channel; (4) annotate the observation-channel bullet and 3b mechanism interpretation as `source: inferred`.
