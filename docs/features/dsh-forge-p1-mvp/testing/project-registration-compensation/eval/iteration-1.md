# Journey Eval Report — iteration 1

- **Document**: `docs/features/dsh-forge-p1-mvp/testing/project-registration-compensation/journey.md`
- **Journey**: project-registration-compensation (feature: dsh-forge-p1-mvp)
- **Surface**: web (SURFACE_RULE: `gen-journeys/rules/surface-web.md`)
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, target 975, min per-dimension thresholds)
- **Iteration**: 1 (no previous report)
- **Scorer stance**: adversarial; every deduction cited to document text. All factual claims were independently re-verified against the journey's four declared sources (prd-user-stories.md, prd-spec.md, prd-ui-functions.md, proposals/dsh-forge-p1-mvp/proposal.md) plus tech-design.md cross-checks.

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Domain coverage is genuinely good.** The journey models Story 1 AC3/AC4 (ownership protection, compensation + idempotency), prd-spec 流程一 items 5–8, the 创建补偿流 Mermaid, UF-3 「失败」state, and SC12's four assertions. Verified 1:1: four-step chain (①`registry.list` ②`registry.create` ③app-DB write ④`registry.delete`), 保目录保会话日志, 幂等命中不登记补偿, 补偿失败→记账日志+启动对账提示(不自动删), 启动对账按 path 单向修引用, failure feedback = 失败原因+补偿结果说明. No fabricated PRD mechanics.
2. **Executability is the core weakness.** Four steps require establishing or observing state for which no mechanism is given anywhere in the document (nor in PRD/design): failure injection (Step 3), cancel-within-non-interruptible-window (Step 3b), ledger viewing + app restart (Step 4b), workspace_id drift setup (Step 5c), and re-triggering a compensation call by internal workspaceId (Step 5). A downstream web-E2E agent cannot execute these without inventing infrastructure. Verified: tech-design's "injections" refer to Cordis plugin injection, not test fault injection — the journey's "测试注入口就位" is an undefined assumption presented as settled.
3. **Observable-behavior discipline is mixed.** Step 1 and Step 4 anchor to UI-observable behavior; Steps 2/3/5 and 5c assert registry/DB-internal state (`projects 行`, `workspaceId（uuid）`, `workspace_id 与 canonical path 失配`) with no observation channel named for a browser test.
4. **Self-contradiction found (pre-score anchor).** Invariant "全流程后 dsh 侧孤儿注册 = 0" is contradicted by Step 4b's designed end state "孤儿工作区只提示不自动删" (orphan persists by design). Secondary tension: invariant "「确认」后的注册执行不可交互中断" vs Step 3b "在注册执行窗口内取消流程" — never reconciled in-document.

## Phase 2 — Rubric Scoring

### Dimension 1: Completeness — 148/200 (threshold 120, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Metadata | 50/50 | Name kebab-case (`project-registration-compensation`); `risk_level: "High"` valid and justified (registry deletion / orphan-data consistency = state mutation with loss risk). |
| Steps complete | 60/80 | Every step has name + User Action + Expected Result, ordered and coherent. Deductions: Step 2's action "注册执行继续（等待②步完成）" is a non-action (no user agency, no operation); Step 5's action "对同一 workspaceId 再次触发补偿调用" is an internal call, not a performable action; Step 3's action "模拟注入使应用库事务写入 projects 行失败" names no injection mechanism. Happy-path steps carry no Precondition fields (edge cases do); initial state is only in Setup. |
| Outcomes cover happy + required derived | 38/70 | Compensation-domain boundary coverage is rich (cancel-in-window, ownership protection, compensation failure, retry, drift repair). But the web surface's **mandatory** derived outcomes (`validation-error`, `session-expired` per surface-web.md "must be considered for every Web Journey") are completely absent — neither present nor recorded as considered-and-N/A. |

### Dimension 2: Semantic Purity — 145/200 (threshold 120, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Natural language outcomes | 60/80 | No regex/CSS/XPath/assert calls. But Expected Results repeatedly state the *mechanism* as the outcome: "④ 补偿自动执行——`registry.delete(workspaceId)` 删除本次新建的工作区注册"; "应用侧无残留 projects 行" (DB-row language); "② `registry.create(path)` 幂等执行成功". Outcomes describe internal operations where user/system-observable end states were available (e.g., per UF-3: failure feedback content; per spec: startup prompt visible). |
| Preconditions declarative | 55/60 | Edge-case preconditions are properly declarative state descriptions ("dsh create 已执行、应用库写入尚未完成（流程窗口内，取消点已过确认）"; "应用库 projects 记录的 workspace_id 与 registry 实际 canonical path 失配"). Minor: "取消点已过确认" is ambiguous phrasing (see D6). |
| No implementation coupling in steps | 30/60 | Direct rubric violation: steps embed internal function calls and DB details — "① ownership 预检（registry.list 按 canonical path 匹配）", "② `registry.create(path)` 幂等执行成功，产出 workspaceId（uuid）", "模拟注入使应用库事务写入 projects 行失败". Mitigation noted (not full credit): the ①–④ chain with these exact call names is the PRD spec's own vocabulary (prd-spec 流程一 item 5), so this is spec-echo rather than invented coupling. |

### Dimension 3: Precondition Exclusivity — 133/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Preconditions distinct | 55/60 | Single-outcome-per-step structure makes within-step overlap structurally impossible. Edge-case preconditions are pairwise exclusive: 3b (new-build, in window) vs 3c (precheck hit / attach) vs 4b (delete call itself fails) vs 5b (fully compensated) vs 5c (id drift). No ambiguous pair found; no -20 overlaps applied. Minor loss: happy-path steps rely on implicit carry-over state with no per-step preconditions. |
| Sufficient to uniquely select | 45/50 | Each scenario's precondition + trigger uniquely determines its outcome; Step 3 (③ write fails) vs Step 3b (user cancels in window) are distinguishable by trigger. |
| Error/boundary triggers stated | 33/40 | All edge cases state triggers. Deduction: Step 3's trigger (injected failure) lives only in the action and in Setup's "测试注入口就位" — the actual trigger condition (what failure, induced how) is never a precondition. |

### Dimension 4: Fact Alignment — 75/150 (threshold 90, **FAIL**)

Judged against the document's own declared apparatus: `sources` frontmatter + "PRD 溯源" section (this project's journeys use document-level citations; no fact_id/Fact Table convention exists).

| Criterion | Score | Justification |
|---|---|---|
| Factual claims traceable | 50/60 | Independently verified against cited sources — accurate and traceable: four-step chain (prd-spec 流程一 item 5 + Mermaid), uuid workspaceId (DF001 "工作区实体（uuid + canonical path）"), ownership protection (Story 1 AC3, spec "命中既有工作区则本次为「挂接」，不登记补偿"), compensation semantics + no-op idempotency (AC4), ledger + startup prompt non-deletion (spec item 6 / SC12), single-direction reference repair (spec item 8), failure-feedback content (UF-3 States 失败 = "失败原因 + 补偿结果说明"). Deductions: traceability is section-level only; Step 4's "应用侧无残留 projects 行" is an unmarked transactional-rollback inference; no UNKNOWN marking apparatus at all. |
| Inferred claims have rule support + `source: inferred` | 15/50 | Zero `source: inferred` annotations exist; zero citations of surface `required_outcomes` rules. The genuinely derived outcome — Step 5b "补偿后重试注册同一路径 … 注册成功，dsh 侧与应用侧记录一致" — has no derivation note. (Verified: "重试/重新注册" appears nowhere in the PRD directory.) Most other boundary outcomes are PRD-specified (SC12/spec), which is the only reason this is not lower. |
| No hallucinated unclassified claims | 10/40 | **Deduction rule applied: -30 per hallucinated/unclassified instance.** One instance: Step 5b asserts concrete system behavior ("注册成功，dsh 侧与应用侧记录一致；全流程后孤儿注册 = 0") that is in no cited source, is neither fact-traceable nor inferred-annotated. It is plausible (derivable from create-idempotency + Step 1 precondition logic) but unclassified — exactly the rubric's zero-tolerance case. 40 − 30 = 10. |

### Dimension 5: Surface Fitness — 43/150 (threshold 90, **FAIL**) — web-parameterized

| Criterion | Score | Justification |
|---|---|---|
| Mandatory derived outcomes present | 0/60 | surface-web.md: "Mandatory derived Outcomes (must be considered for every Web Journey): validation-error … session-expired." Neither appears in any form — no outcome, no derivation, no considered-and-inapplicable note. Rubric instruction: "Score 0 if mandatory Outcomes are completely absent." (Family context noted for the reviser, not scored: the sibling journey `project-registration` Step 3d covers 非法路径拦截 ≈ validation-error, but this document shows zero consideration, and session-expired — meaningful here: app restart mid-flow, Step 4b — is unconsidered everywhere.) |
| Test strategy proportions (Web: balanced 50/50) | 25/50 | All 10 outcomes are end-to-end workflow assertions (Journey-smoke orientation, 100/0). No Contract-level interaction outcomes (e.g., failure-feedback component behavior, startup-prompt element behavior, progress/feedback states) that the web 50/50 split expects. |
| Environment/execution assumptions realistic | 18/40 | Realistic web elements: two-stage modal interaction (Step 1), waiting through async execution ("等待②步完成"), app restart (Setup "应用可重启"). Unrealistic/unstated for browser automation: how the browser test induces "模拟注入使应用库事务写入 projects 行失败" (no hook named — verified absent from tech-design); how it observes "dsh 侧无孤儿注册，应用侧无残留 projects 行" or the "记账日志" (no UI/RPC/DB probe named); how it learns the internal `workspaceId（uuid）` to "再次触发补偿调用"; how it establishes the Step 5c drift state. |

(Deliberately NOT stacking the -25 "surface type violation" on top: the registry/DB assertions are spec-mandated content (SC12 is an e2e scenario asserting dsh-side state), and the observability gap is already deducted in criterion 3; the violation rule targets wrong-surface idioms like DOM assertions in a CLI journey.)

### Dimension 6: Internal Consistency — 105/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Invariants hold in every step | 20/60 | **Deduction rule applied: -40 per invariant violation.** Invariant 1 "全流程后 dsh 侧孤儿注册 = 0" is violated by Step 4b's designed end state "补偿失败记入记账日志；下次启动呈现启动对账提示——孤儿工作区只提示不自动删": after the 4b flow the orphan registration *persists by design* (prompt-only, never auto-deleted), and the document itself names it "孤儿工作区". The invariant is never scoped to compensation-successful flows. (Charitable reading noted: the invariant's gloss "四断言零失败" and PRD SC12 share this conflation — the journey inherited spec wording — but the document must reconcile 4b with the invariant it declares.) A second unresolved tension, not double-charged: invariant "「确认」后的注册执行不可交互中断" (also re-asserted in Step 3: "流程不可交互中断的约束仍然成立") vs Step 3b "在注册执行窗口内取消流程" — the document never explains how a cancel can occur inside a non-interactively-interruptible execution (process kill? window close? UI control?), leaving the pair unreconciled. 60 − 40 = 20. |
| Cross-Step references consistent | 45/50 | "①预检" → Step 1; "同一 workspaceId" → Step 2's "产出 workspaceId（uuid）"; 5b's "上一次注册已完整补偿" → Steps 3–4. No dangling references. Minor: ①②③④ chain-stage numerals shadow journey Step numerals (chain ② executes in journey Step 2, chain ③ fails in journey Step 3) — consistent but collision-prone for a downstream agent. |
| Risk level consistent | 40/40 | High is correct: irreversible registry deletion, orphan/data-consistency stakes. |

### Dimension 7: Workflow Coverage — 113/150 (threshold 90, PASS; Golden Path veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| Golden Path existence (veto) | 30/60 | Veto not triggered: Happy Path Steps 1–5 form a contiguous 5-step sequence semantically matching Story 1 AC4 / SC12 (registration → create+compensation enlistment → failure triggers compensation → feedback → idempotent re-compensation) — domain-level user operations. **Deduction rule applied: -15 per golden-path step using API-level description.** Two instances: Step 5 "对同一 workspaceId 再次触发补偿调用" (internal call, not a user operation) and Step 3 "模拟注入使应用库事务写入 projects 行失败" (harness/DB-internal operation). 60 − 30 = 30. Also noted: frontmatter `golden_path: false` contradicts the document's own Happy Path section — metadata says no golden path while the body contains one (scored on body content; the flag itself is a defect to fix). |
| Multi-step coverage depth | 45/50 | Deep: full lifecycle (create → compensate-delete → re-register), state repair (reconciliation), cross-entity consistency (registry × projects × session logs), failure-of-failure (4b), idempotency (5). |
| Completeness vs PRD scope | 38/40 | Within its declared scope (Story 1 AC3/AC4 + compensation branches), coverage is essentially complete; registration happy path properly delegated to the sibling journey. Only gap: spec item 8's reconciliation is covered (5c) but the *prompt-resolution* path after 4b's orphan (what the user does with the startup prompt) stops at "只提示" — no outcome for acting on it. |

## Cross-dimension coherence check

- The single largest cross-cutting defect — **no mechanism specified to induce failures, establish drift, or observe registry/DB state from the web surface** — manifests in D1 (steps), D5 (environment realism), and the blindspots below. It is charged once per dimension where the rubric locates it; the reviser should treat it as one root fix (add an explicit test-observability/injection contract per scenario).
- D4 and D5 share a root cause: the web required_outcomes rules were never consulted — no derivations, no annotations, no N/A records.

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. `[blindspot]` **Un-executable failure injection.** "dsh workspace registry 可用；应用状态库写入步骤可被模拟失败（测试注入口就位）" — presents an injection port as existing when no PRD/design artifact defines one (tech-design's "injections" = Cordis plugin injection). Downstream agent must invent the fault mechanism. Must define the injection interface (env flag / RPC fault toggle / forced constraint) as part of the journey's setup contract.
2. `[blindspot]` **No observation channel for dsh-side assertions.** "dsh 侧无孤儿注册，应用侧无残留 projects 行" and "补偿失败记入记账日志" — a web E2E cannot see registry entries, DB rows, or a ledger file through the DOM. No probe is named (UI project list? host RPC? direct SQLite read?). Every dsh-side outcome needs a stated observable channel.
3. `[blindspot]` **Step 3b cancel mechanism contradicts the UI contract.** "在注册执行窗口内取消流程" occurs in a window UF-3 defines as "不可交互中断的注册执行（取消点已过）" — the journey must state the concrete cancellation act (app window close / process termination), otherwise the step is impossible via the browser and reads as violating its own invariant.
4. `[blindspot]` **Scenario isolation/reset undefined.** Step 4b deliberately leaves an orphan ("孤儿工作区只提示不自动删") while Step 5b requires "上一次注册已完整补偿（dsh 侧无孤儿）" — with 10 scenarios mutating shared registry/DB state and no reset/branching strategy stated, a downstream agent cannot order or isolate scenarios. Needs per-scenario state reset or explicit sequencing preconditions.
5. `[blindspot]` **Missing negative boundary: non-uuid/foreign workspaceId.** Step 5 asserts re-compensation of "同一 workspaceId" is a no-op, but there is no boundary case for compensating a *nonexistent/foreign* workspaceId (registry.delete of an id that was never created this session) — the obvious adversarial complement to compensation idempotency, absent from PRD too (a legitimate `source: inferred` derivation the journey should add).

## Deduction-rule ledger

| Rule | Instances | Applied |
|---|---|---|
| Hallucinated/unclassified claim −30 (D4) | 1 (Step 5b retry-after-compensation behavior) | D4 c3: 40→10 |
| Invariant violation −40 (D6) | 1 (orphan=0 invariant vs 4b prompt-only orphan) | D6 c1: 60→20 |
| API-level golden-path step −15 (D7) | 2 (Step 3 injection action; Step 5 compensation-call action) | D7 c1: 60→30 |
| Precondition overlap −20 (D3) | 0 | — |
| Surface violation −25 (D5) | 0 charged (see D5 note) | — |
| Golden Path veto | Not triggered | — |

## Summary block

```
SCORE: 762/1150
DIMENSIONS:
  Completeness: 148/200
  Semantic Purity: 145/200
  Precondition Exclusivity: 133/150
  Fact Alignment: 75/150   (FAIL, min 90)
  Surface Fitness: 43/150  (FAIL, min 90)
  Internal Consistency: 105/150
  Workflow Coverage: 113/150
VERDICT: FAIL — total 762 < 975 and Fact Alignment + Surface Fitness below min thresholds.
```

Top fixes by score impact: (1) consider/derive the web mandatory outcomes `validation-error` + `session-expired` (or record justified N/A) with `source: inferred` annotations; (2) specify, per scenario, the injection/observation mechanisms that make registry/DB states executable and assertable from the web surface; (3) scope or reword the orphan=0 invariant so Step 4b does not violate it, and reconcile Step 3b's cancel with the non-interruptibility invariant; (4) ground or annotate Step 5b as inferred.
