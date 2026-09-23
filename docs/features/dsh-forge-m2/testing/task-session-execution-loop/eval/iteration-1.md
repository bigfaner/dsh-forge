# Journey Eval Report — iteration 1

- **Document**: `docs/features/dsh-forge-m2/testing/task-session-execution-loop/journey.md`
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, target 975, every dimension ≥ threshold)
- **Surface**: web (`rules/surface-web.md`); test strategy Web = balanced 50/50; mandatory derived outcomes: `validation-error` + `session-expired`
- **Scorer persona**: Senior QA Engineer (adversarial)
- **Verdict**: **FAIL** — Total 949/1150 (< 975) AND Fact Alignment 85/150 (< 90 threshold)

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 170/200 | 120 | ✓ |
| 2. Semantic Purity | 193/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 146/150 | 90 | ✓ |
| 4. Fact Alignment | **85/150** | 90 | **✗** |
| 5. Surface Fitness | 107/150 | 90 | ✓ |
| 6. Internal Consistency | 113/150 | 90 | ✓ |
| 7. Workflow Coverage | 135/150 | 90 | ✓ |
| **Total** | **949/1150** | 975 | **✗** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Chain check (problem → solution → evidence → success criteria)**: The journey claims the M2 Golden Path: board browse → detail → one-click session launch with prompt injection → agent task op → status reflow → restart-time hooking traceability. This maps 1:1 onto prd-spec §Business Flow "会话线" and SC2/SC3, and onto Stories 1–3 acceptance criteria (step-level near-verbatim tracing: Step 3 "≤1 次点击" ← Story 2 AC1; Step 4 ← Story 2 AC2; Step 5 ← SC3; Step 6 ← Story 2 AC3). The chain is sound and the journey genuinely exercises the story it claims.

**Pre-score anchors recorded before rubric scoring**:

1. **Anchor A (fact contradiction)**: Step 3b asserts a timeout-triggered `updating` indicator. PRD UF2 states define `updating` trigger as "外部变更到达(≤5s 时效)"; ui-design.md line 235 confirms trigger "外部变更到达"; task record 5.15 confirms "the updating highlight lights at EVENT ARRIVAL (pre-fetch)". No project source defines a stale/timeout indicator. → hallucination-class claim.
2. **Anchor B (reference misalignment)**: edge cases are numbered 1b–6b implying base-step variants, but 5 of 6 are variants of *different* happy steps (verified mapping: 1b→Step 2/3, 2b→Step 3, 3b→Step 5, 4b→Step 5, 5b→Step 3; only 6b→Step 6 correct). Template requires "Each edge case references a happy path step (variant)".
3. **Anchor C (annotation discipline absent)**: zero `source: inferred` annotations and zero `required_outcomes` citations anywhere, while the document clearly contains LLM-derived boundary outcomes (3b, 5b, "不残留半初始化的挂接记录").
4. **Anchor D (risk/structure sound)**: High risk justified (task state mutation via claim, persistent 挂接索引 writes); 6 edges ≥ 6 happy steps (High-risk density rule satisfied); golden path exists with domain-level steps.
5. **Anchor E (actor blur)**: Step 5's "User Action" field carries an agent-autonomous action; the user-controllable action (approval in existing session UI) is parenthetical.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 170/200

**1a. Journey metadata (50/50)** — Name `task-session-execution-loop` kebab-case ✓; `risk_level: High` valid and justified by content (claim mutates task state; 挂接索引 persistent writes) ✓; `golden_path: true` consistent with Overview claim ✓; `surface_types`/`surface_keys` populated ✓; sources list all three PRD files ✓; `generated` date present ✓. Full marks — no manufactured deductions.

**1b. Steps complete with required fields (72/80)** — All 6 happy steps have User Action + Expected Result and form a coherent ordered sequence. Deduction −8: Step 5's "User Action" field does not describe a user action:
> "**User Action**: agent 在会话中经 forge CLI 执行一次任务 claim(审批走主窗口现有会话 UI)"

The actor is the agent; the user's actual action in this workflow (approving in the session UI — a PRD-defined user-facing interaction: "agent 在会话中执行(审批走主窗口现有会话 UI)") is relegated to a parenthetical. A downstream agent consuming this step cannot tell what the *user* does.

**1c. Outcomes cover happy path + required derived scenarios (48/70)** — Boundary/error outcomes are rich (disabled entry, launch failure, reflow timeout, multi-change reflow, duplicate session, multi-session history). Deduction −22: the surface-web mandatory derived outcomes are present only as *unlabeled functional analogs*, with no evidence they were considered as such:
- `validation-error` analog — Step 1b "按钮禁用并说明原因;不发起任何会话、不写入挂接索引" (eligibility precondition, not a form-validation outcome; the workflow has no forms, but "considered" must be demonstrable, not implicit);
- `session-expired` analog — Step 2b "dsh 宿主不可用或凭据异常" (credential failure with recovery guidance).

Neither is derived from, cited to, or reconciled with the web `required_outcomes` rules.

### 2. Semantic Purity — 193/200

**2a. Natural language outcomes (78/80)** — No regex, CSS/XPath selectors, or framework assertion calls anywhere. Outcomes describe what the user observes. Small dock −2: Step 1's expected result embeds a CLI-output oracle comparison ("任务数/状态/依赖与 `forge task list` 输出一致") — acceptable narrative (PRD-verbatim) but phrased as a verification mechanism rather than an observation.

**2b. Preconditions declarative (60/60)** — Setup items and all six edge Precondition fields are declarative environment states ("所选任务不存在执行 prompt(不满足发起条件)", "dsh 宿主不可用或凭据异常"). No procedural code. Full marks.

**2c. No implementation coupling in steps (55/60)** — `forge prompt get-by-task-id`, "经 forge CLI", and "挂接索引" are all PRD-quoted domain terms (G2 and 操作主体模型 use them verbatim), so they pass as domain language. Dock −5: Step 5's "经 forge CLI 执行一次任务 claim" describes the internal execution channel of a mutation the web surface cannot itself perform — the step couples the web observation to an out-of-surface execution mechanism without framing the user-observable event.

### 3. Precondition Exclusivity — 146/150

**3a. Distinct across outcomes (60/60)** — All six edge preconditions are mutually distinct and specific: no-prompt (1b), host/credential failure (2b), claim-done-but-stale >5s (3b), multi-change stream (4b), one active session exists (5b), multiple historical sessions (6b). 3b vs 4b are separated cleanly by the timing condition (stale >5s vs ≤5s per change). No overlapping pair found.

**3b. Sufficient to uniquely select (50/50)** — Given Setup + an edge precondition, exactly one outcome applies. 5b (进行中 concurrent) vs 6b (先后 historical) are distinguishable states; even when both facts hold, the differing user actions disambiguate. No ambiguous scenario found.

**3c. No missing preconditions for error/boundary outcomes (36/40)** — Every edge case states its trigger. Dock −4: happy-path steps carry enabling conditions *inside the action text* instead of as preconditions — Step 2 "点击一个处于可执行状态的任务卡片/节点", Step 5 presupposes the live挂接会话 from Step 3 without stating it. The implicit chain works but is not declared.

### 4. Fact Alignment — 85/150 (BELOW THRESHOLD)

**4a. Factual claims traceable (50/60)** — Traceability is generally strong: most expected results are near-verbatim PRD traces (≤2s 首屏 ← G1; ≤3s 交互/`initiating` ← UF5 states + Performance Req; ≤5s 回流 + [会话] ← G3/SC3; "沿用 M1 崩溃恢复/配置引导模式" ← prd-spec 异常流 verbatim; worktree 标识 ← Story 1 AC2; 挂接索引 ← UF5/DF005). Deductions:
- −6: "任务数据最终不丢失" (Step 3b) — vague and untestable as written. The board is read-only and forge files are SoT (invariant 2), so the board cannot "lose" task data; no source defines what observation would establish non-loss, and no eventual-arrival guarantee exists for the premise state.
- −4: minor unannotated assertions at the factual boundary ("挂接索引记录多条挂接,任务详情可区分多个挂接条目" — the *list* model is traceable to UF3/UF5, but concurrent-second-session behavior is not in any source).

**4b. Inferred claims have rule support + `source: inferred` (25/50)** — The document contains clearly derived boundary outcomes, and *none* carries a `required_outcomes` rule citation or a `source: inferred` annotation:
- Step 3b (timing boundary — closest rule basis would be web `loading-state`, uncited);
- Step 5b "同一任务重复发起第二个会话" (concurrency derivation — no PRD statement on concurrent sessions);
- Step 2b "不残留半初始化的挂接记录" (atomicity/rollback derivation — appears in no PRD source).

Half credit: the derivations are mostly sensible in content; the annotation discipline required by the rubric is entirely absent.

**4c. No hallucinated unclassified claims (10/40)** — One hallucination-class claim identified, −30 per deduction rule:
> "**Expected Result**: 看板显示回流中(updating)轻量变更提示而非静默停滞"

Step 3b's precondition is "看板超过 5 秒仍未显示该更新" — i.e., *no change has arrived*. But the documented `updating` state triggers on change *arrival*: prd-ui-functions UF2 ("updating(回流中)|轻量变更提示|外部变更到达(≤5s 时效)"), ui-design.md ("外部变更到达(≤5s 时效,免手动刷新)"), and task record 5.15 ("the updating highlight lights at EVENT ARRIVAL (pre-fetch)"). The journey inverts the documented trigger to invent a timeout indicator that no source defines (the actual designed failure surface per task record 5.5 is a sync-error toolbar light, not `updating`). This is neither factual (it contradicts a traceable fact) nor inferable from any web `required_outcomes` rule, and it is unannotated → hallucinated unclassified claim. A downstream contract/test generated from this would assert behavior the product does not have — exactly the class of bug this eval exists to catch.

### 5. Surface Fitness — 107/150

**5a. Mandatory derived outcomes present (35/60)** — `validation-error` and `session-expired` are the two mandatory web outcomes. Functional analogs exist (Step 1b disabled-entry-with-reason; Step 2b credential failure with recovery + retry) but: (i) neither is labeled, derived from, or reconciled with the web rules; (ii) the workflow contains no form, so a literal `validation-error` is impossible — the journey nowhere demonstrates it *considered* the rule and mapped or excluded it. Partial credit only. (Not scored 0 — the outcomes are not "completely absent".)

**5b. Test strategy proportions (42/50)** — Web balanced 50/50: 6 journey-level happy steps + 6 per-step boundary outcomes with edge variants is a density/depth profile consistent with balanced Contract/Journey emphasis. Small dock: edge outcomes are single-scenario (one Expected Result each) where a couple of contract-grade alternates per hot step (Step 3, Step 5) would better serve the 50% contract side.

**5c. Realistic web environment/execution assumptions (30/40)** — Async handling is well represented (initiating indicator, ≤3s interactivity, ≤5s reflow windows, app restart). Dock −10: Step 5's trigger is not drivable from the web surface — "agent 在会话中经 forge CLI 执行一次任务 claim" is an autonomous agent action a browser-level test cannot invoke or control (the implementation's SC2/SC3 e2e leg has to stub the host and *simulate* the claim per tech-design line 345). The journey gives the downstream generator no hint of a controllable trigger or fixture seam.

### 6. Internal Consistency — 113/150

**6a. Invariants hold in every step (45/60)** — Invariants 1–3 (read-only board, forge SoT, source marking) hold across all steps and edges; no step grants a human write path. Dock −15 on invariant 4:
> "状态回流时效:每笔会话侧变更 ≤5 秒内免手动刷新可见"

Stated absolutely, yet Step 3b's declared premise ("看板超过 5 秒仍未显示该更新") violates it by construction. This is *not* charged at the full −40 invariant-violation rate: boundary probing is the legitimate purpose of edge cases, and 3b defines fallback behavior. The real defect is self-contradiction in the document's own terms: the invariant set lacks the degradation clause 3b assumes (nor does any source define one — see 4c), so the reader cannot tell what the guarantee actually is when the 5s SLA is breached.

**6b. Cross-step references consistent (28/50)** — The edge-case numbering implies base-step mapping ("Step Nb" = variant of Step N per the journey template: "Each edge case references a happy path step (variant)"), but 5 of 6 are misanchored:
- "Step 1b: 任务无执行 prompt 时发起入口禁用" → actually a variant of Step 3 (发起会话) / Step 2 (详情入口), not Step 1 (浏览依赖树);
- "Step 2b: 会话发起失败" → variant of Step 3, not Step 2 (打开任务详情);
- "Step 3b: 状态回流超时" → variant of Step 5, not Step 3 (一键发起会话);
- "Step 4b: agent 连续多笔变更逐笔回流" → variant of Step 5, not Step 4 (prompt 注入确认);
- "Step 5b: 同一任务重复发起第二个会话" → variant of Step 3, not Step 5 (claim 回流);
- only "Step 6b" correctly anchors to Step 6.

A downstream consumer (gen-contracts indexes contracts as `step-N-*.md`) that reads "3b" as a Step 3 variant gets the wrong contract home for a Step 5 boundary. Dangling/misleading cross-references.

**6c. Risk level consistent (40/40)** — High is correct: the workflow mutates task state (claim), creates persistent 挂接索引 records, and spans process restarts. Matches the template's High criteria (state mutation) and the rubric's expectation.

### 7. Workflow Coverage — 135/150

**7a. Golden Path existence (60/60, veto not triggered)** — Six contiguous domain-level steps semantically matching prd-spec §Business Flow 会话线 and SC2/SC3: "浏览任务看板 → 查看任务详情 → 一键发起…会话 → …执行任务操作 → 状态回流看板 → 重启后回溯挂接". Steps reference domain operations, not API/HTTP mechanics. Constraint A (3+ steps) and Constraint B (semantic completeness, PRD terminology) both satisfied; verified against Stories 1–3, not merely step-counted.

**7b. Multi-step coverage depth (45/50)** — Strong: state transition (claim), entity lifecycle (session: initiating → active → history), cross-entity interaction (task↔session hooking), persistence across restart, concurrency (5b), batch reflow (4b), failure recovery with retry (2b). Dock −5: the approval interaction — the one moment the *user* acts inside the session line — is never exercised (see 7c).

**7c. Workflow completeness against PRD scope (30/40)** — Gaps within the journey's own claimed loop (UF2/UF3/UF5):
- UF5 interaction flow 4 "用户可从挂接条目'进入会话'或查看历史挂接" — only the second half (查看历史) is covered by Step 6; the "进入会话" jump-back action is exercised by no step or edge, and no sibling journey covers it either (task-board-browsing is read-only browsing; plugin/dual-form/multi-project/feature-board cover other stories);
- approval flow: "(审批走主窗口现有会话 UI)" appears only as a parenthetical in Step 5 — never a user action, though prd-spec's 会话线 makes it part of the primary flow ("agent 在会话中执行(审批走主窗口现有会话 UI)");
- terminal-source marking ([终端], Story 3 AC2) is absent here — acceptable, since dual-form-consistency owns it (decomposition, not a gap).

### Cross-dimension coherence check

- Step 3b is scored in three dimensions for three *distinct* defects, not stacked for one: Fact Alignment scores the ungrounded claim origin (hallucination); Internal Consistency 6a scores the invariant-4 self-contradiction; Surface Fitness is NOT docked for 3b. Verified no double-charging of the same defect within a dimension.
- The derived-outcomes gap legitimately spans Completeness 1c (coverage), Surface Fitness 5a (surface-rule compliance), and Fact Alignment 4b (classification discipline) — three rubric-defined facets of one omission; each sub-score reflects its own facet only.
- Semantic Purity vs Fact Alignment cross-check: the CLI terms (`forge prompt get-by-task-id`) are PRD-verbatim, so they are pure (domain language) while their claims remain traceable — no dimension conflict.
- Workflow Coverage 7a (golden path 60/60) is consistent with Completeness 1b's actor-blur dock: the path exists and is semantic; Step 5's *field semantics* are the defect, not the path.

---

## Phase 3 — Blindspot Hunt ([blindspot] = outside all rubric dimensions)

1. **[blindspot] Setup/result scale mismatch makes the performance outcome unverifiable.** Setup establishes "已注册并激活一个含 ≥10 个任务、含依赖关系的 forge 项目" but Step 1 asserts "首屏 ≤2 秒(500 任务规模)" — the asserted 500-task scale is never established as a precondition, so the ≤2s bound cannot be executed as written. No rubric dimension covers precondition-vs-assertion scale consistency (the claim itself traces to G1, so Fact Alignment sees it as grounded). *Fix: either add a ≥500-task fixture precondition or scope the timing claim to the setup's actual scale.*

2. **[blindspot] Test-data safety: the journey mutates the author's live repo.** Setup nominates the production repository as fixture — "如本仓 dsh-forge" — while Step 5 performs a real mutation ("agent 在会话中经 forge CLI 执行一次任务 claim"). There is no isolation, fixture-project, or rollback statement anywhere in the document. A downstream runner executing this literally would claim (and transition) tasks in the project that builds the tool itself. No rubric dimension evaluates test-data isolation/cleanup (journey template has no such section either). *Fix: prescribe a disposable/fixture forge project or an explicit state-restore contract in Setup.*

3. **[blindspot] Cross-surface oracle dependence is unspecified.** Expected results require non-web oracles a browser-level test cannot observe on its own: "任务数/状态/依赖与 `forge task list` 输出一致" (Step 1), "最终状态与 forge 数据一致" (Step 4b), "消息包含 `forge prompt get-by-task-id` 的完整输出" (Step 4 — the session's first user message must be inspected from outside the board). The journey never acknowledges how these oracles are checked from the web surface. Adjacent to, but not covered by, Surface Fitness 5c (which concerns environment realism, not assertion observability). *Fix: state the verification channel (e.g., forge CLI read as oracle) per cross-surface assertion.*

4. **[blindspot] Crash/kill during initiation is untested despite the M1-recovery framing the journey itself invokes.** Step 2b's "不残留半初始化的挂接记录" asserts atomicity only for host/credential failure; the obvious adjacent scenario — app killed/crashed mid-initiation (the exact territory of the M1 crash-recovery mode the expected result leans on: "沿用 M1 崩溃恢复/配置引导模式") — has no step or edge, and no invariant guarantees 挂接索引 atomicity. Resilience-rule territory (BIZ-resilience-001) that no rubric dimension reaches. *Fix: add a mid-initiation crash edge or an atomicity invariant for the挂接索引.*

5. **[blindspot] Step-trigger controllability is not a rubric concept.** Step 5's trigger ("agent 在会话中经 forge CLI 执行一次任务 claim") is autonomous — neither the user nor the test controls when the claim happens. The rubric evaluates step *field completeness* and *semantic level*, never whether each step's trigger is actor-controllable. Related dock was taken in Completeness 1b/Surface Fitness 5c for field semantics and environment realism respectively; the general criterion (every step must name a controllable trigger) is itself a rubric gap the reviser should honor even though it costs no points here.

---

## Revision Priorities (for reviser)

1. **Step 3b expected result** — remove or rewrite the timeout-triggered `updating` claim; align with the documented arrival-triggered semantics or explicitly mark the degradation behavior UNKNOWN for product decision (also resolves the invariant-4 contradiction by forcing an explicit degradation clause or invariant scoping).
2. **Re-anchor edge cases** to their true base steps (renumber or add explicit "variant of Step N" fields).
3. **Annotate derived outcomes** (`source: inferred` + web rule basis for 3b/5b/2b-atomicity) and explicitly consider/derive `validation-error` and `session-expired` per surface-web rules.
4. **Add coverage** for "从挂接条目进入会话" and elevate approval to a real user action in Step 5.
5. **Setup** — establish the 500-task scale for the ≤2s claim, and replace the live-repo fixture with an isolated fixture project (blindspots 1–2).

**Final: 949/1150 — FAIL (total < 975; Fact Alignment 85 < 90). Revision required.**
