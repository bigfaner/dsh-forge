# Eval Report: journey/multi-project-management — Iteration 1

- **Evaluator**: Scorer (adversarial), Senior QA Engineer persona
- **Date**: 2026-09-23
- **Document**: `docs/features/dsh-forge-m2/testing/multi-project-management/journey.md`
- **Rubric**: `eval/rubrics/journey.md` (1150 pts, target 975, per-dimension thresholds)
- **Surface**: web (`gen-journeys/rules/surface-web.md`)
- **Iteration**: 1 (no previous report)
- **Verdict**: **FAIL** — Total 855/1150 (< 975) AND Fact Alignment 62/150 (< 90 threshold)

| Dimension | Score | Threshold | Status |
|-----------|-------|-----------|--------|
| 1. Completeness | 160/200 | 120 | PASS |
| 2. Semantic Purity | 183/200 | 120 | PASS |
| 3. Precondition Exclusivity | 105/150 | 90 | PASS |
| 4. Fact Alignment | 62/150 | 90 | **FAIL** |
| 5. Surface Fitness | 97/150 | 90 | PASS (barely) |
| 6. Internal Consistency | 128/150 | 90 | PASS |
| 7. Workflow Coverage | 120/150 | 90 | PASS |
| **Total** | **855/1150** | **975** | **FAIL** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Chain check (problem → solution → evidence → success criteria)**: The journey claims to cover Story 5 (多项目管理). The chain holds on the happy path: problem (multi-project owner managing registrations) → solution (register wizard → switch → remove) → evidence (PRD Traceability header citing Story 5/G5/UF1/SC5 — all four verified to exist) → success criteria (Steps 3/4/5 expected results map one-to-one onto Story 5's three Given/When/Then ACs). The journey does exercise the user story it claims.

**Pre-score anchors recorded before rubric scoring**:

1. **Zero annotation discipline.** Neither sibling baseline (`task-board-browsing`, `task-session-execution-loop`) is matched: this document contains no `surface-web required_outcomes 映射` comments and no `source: inferred` annotations anywhere, despite containing at least three inferred boundary outcomes (4b auto-switch branch, 5b, 6b). Siblings demonstrate the expected practice; this doc omits it entirely.
2. **"或"-forked outcomes.** At least three spots bundle two divergent system behaviors as acceptable: Step 3b User Action, Step 4b Expected Result, Step 6b Expected Result. A test cannot assert a disjunction of distinct observable behaviors.
3. **Safety-critical assertions have no verification channel.** The most dangerous claims in the family ("项目仓内文件与 forge 数据不被改动") are asserted with no out-of-browser assertion path specified, and Setup has no fixture isolation (siblings specify "一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理" and "跨面断言口径").
4. **Edge numbering drift.** `Step 5b`/`Step 6b` do not correspond to happy Steps 5/6 under the `Nb = variant of Step N` convention.
5. **No self-contradictions found** in the state chain (1 project active → register 2nd + activate → switch back to 1st → remove 2nd); invariants are never violated by any step. Risk High is justified (destructive removal, registry mutation); edge count 6 ≥ happy steps 5 (High-risk density rule satisfied).

---

## Phase 2 — Rubric Scoring (verification stance)

All assertions treated as unverified until grounded. PRD facts were checked against `prd-user-stories.md` (Story 5), `prd-spec.md` (G5, In Scope, 异常流, SC5, Performance), and `prd-ui-functions.md` (UF1 flow/states/validation rules).

### 1. Completeness — 160/200

**Metadata (50/50)**: `journey: "multi-project-management"` is kebab-case; `risk_level: "High"` is valid and justified by content (irreversible registration deletion: "移除一个注册项目"). Frontmatter complete (feature/journey/risk/surfaces/keys/sources/generated). `golden_path: false` is consistent labeling — `task-session-execution-loop` holds the feature's `golden_path: true` designation.

**Steps complete with required fields (62/80)**: Every happy step and every edge case has User Action + Expected Result; the sequence is coherent. Deductions:
- Step 3b's action is not a single executable action: "查看授权提示并确认(或不选择仓外)" — the parenthetical alternative forks the step into two behaviors. (-8)
- Step 3's Expected Result bundles an untestable-by-UI internal claim with no observation method: "项目三分信息持久化为工作台自有状态" — a downstream agent cannot execute a verification of persistence from the web surface without a restart/reload leg or an out-of-band channel, neither specified. (-6)
- Step 4b and Step 6b expected results are each a disjunction of two distinct behaviors (see Precondition Exclusivity) — as "expected outcomes" they are not single assertions. (-4)

**Outcomes cover happy path + required derived scenarios (48/70)**: Happy path complete for Story 5; edge coverage 6 cases with good spread (validation ×2, authorization, destructive boundary, inaccessible path, duplicate). Deductions:
- `session-expired` (web mandatory derived outcome): neither an analogous edge nor a disposition comment exists — sibling `task-session-execution-loop` explicitly maps it ("session-expired → 宿主不可用/凭据失效使会话通道不可用"); this journey's closest state (re-activation of registry across app restarts) is not even touched. (-10)
- Wizard abandonment / step-back (①↔②) has no edge case despite the wizard being a multi-step form surface; partial-registration leakage is untested. (-6)
- No restart leg verifying the persistence claim made in Step 3. (-6)

### 2. Semantic Purity — 183/200

**Natural language, no code/regex (68/80)**: No regex, selectors, or assertion calls anywhere. Deductions: "注册信息删除后激活态正确处理" — "正确处理" is non-observable system-speak, not an outcome a user/system observes; "系统明确处理" in 6b is the same pattern ("the system handles it" is not an observable). (-12)

**Declarative preconditions (58/60)**: All preconditions are state descriptions, not setup procedures ("所选代码根目录下未检出 forge 数据(无 `.forge`/`docs/features`)", "该代码根目录已被注册为项目"). Minor: Step 2b's precondition phrases user history rather than pure state ("用户在步骤 ② 切换'仓外路径'并选择了…") — still declarative enough. (-2)

**No implementation coupling (57/60)**: Steps are user-level (点"添加项目", 二次确认弹层). `.forge`/`docs/features` are domain terms used by the PRD itself. Minor: "项目三分信息持久化为工作台自有状态" leaks storage-model terminology into an expected result without a user-observable manifestation. (-3)

### 3. Precondition Exclusivity — 105/150

**Distinct across outcomes (40/60)**: One genuine overlap pair. Step 3b's precondition "用户在步骤 ② 选择仓外本地路径作为文档位置" is literally satisfied in Step 2b's state ("切换'仓外路径'并选择了与代码根目录相同的目录" is a 仓外 selection). In the same-dir state, both 2b ("校验失败并拒绝") and 3b ("必须显式选择并确认授权") would match — contradictory expected behaviors. Applying the -20 mechanical deduction for one ambiguous pair. (-20)

**Sufficient to uniquely select (35/50)**: Step 4b's single precondition ("待移除项目是当前激活项目") cannot select between its two expected behaviors — "切换到剩余项目" requires ≥1 remaining project, "全部移除后自动进入注册向导空态" requires exactly 0; the distinguishing state (是否还有其他注册项目) is absent. In the journey's own canonical state (2 projects), the second branch is unreachable. (-15)

**Missing preconditions for error/boundary outcomes (30/40)**: All six edge cases state triggers — good baseline. Deductions: 3b lacks the "≠ 代码根目录" exclusion (root cause of the overlap above); 4b lacks the remaining-project-count condition. (-10)

### 4. Fact Alignment — 62/150 — **BELOW THRESHOLD (90)**

**Factual claims traceable / UNKNOWN (40/60)**: Strong core — verified exact matches:
- Step 1 ← UF1 flow 1 ("用户从项目切换器点'添加项目' → 进入注册向导")
- Step 2 ← UF1 flow 2 (检出 `.forge`/`docs/features`;未检出 → 错误引导,停在步骤 ①)
- Step 3 ← Story 5 AC1 ("≤3 步完成(选代码根目录 → 选文档位置 → 完成)")
- Step 5 ← UF1 validation rule (二次确认 + "仅删除工作台注册信息,不动项目文件" — near-verbatim)
- Step 1b ← prd-spec 异常流 ("注册路径无 forge 数据 → 错误引导(修正路径或先初始化项目)")
- Step 2b ← UF1 validation ("仓外文档路径必须与代码根目录不同且显式授权确认")
- Step 3b ← UF1 description ("仓外需显式选择并授权") + Story 6 AC3 ("未显式选择仓外路径,Then 默认文档位置为仓内(外置默认关闭)")
- Invariants ← prd-spec In Scope ("项目三分模型落地(工作台自有状态独立存放,不与 forge 数据混放)")

Unverified-and-unmarked: 4b's "切换到剩余项目" (no PRD fact about activation behavior when the active project is removed; only the empty-state branch "全部移除后自动进入注册向导空态" is factual via UF1 States "empty(无项目)|注册向导自动进入|首次使用/全部移除"); 5b's post-registration inaccessibility behavior at the switcher (UF1's "路径不可访问" error state is scoped to "步骤 ① 校验失败", not to selecting a registered project); 6b entirely. (-20)

**Inferred claims annotated with rule support + `source: inferred` (12/50)**: Zero annotations in the document. At least three outcomes are reasonable inferences with no PRD basis and no annotation: 4b auto-switch branch, 5b ("明确的不可访问/错误提示,应用不崩溃;项目数据不被误改"), 6b. The sibling documents annotate exactly this class of claim ("source: inferred:「不残留半初始化的挂接记录」推自 Interface 5 成功链序…"). The family baseline makes the omission objective, not stylistic. (-38)

**No unclassified claims (10/40)**: Step 6b asserts specific system behavior with no fact, no rule citation, no annotation — and as a disjunction ("提示已注册或复用既有注册项") it even leaves the mechanism undetermined. Applying the -30 hallucinated-unclassified-claim deduction once (the clearest instance; 4b/5b penalized above as unannotated inferences rather than double-charged here). (-30)

### 5. Surface Fitness — 97/150

**Mandatory derived outcomes from surface rules (35/60)**: `validation-error` is substantively covered by 1b (invalid path → "显示错误引导…停留在步骤 ①") and 2b ("校验失败并拒绝") — present in substance but never identified/mapped as the surface-mandated outcome. `session-expired` is completely absent and completely undispositioned — no analogue edge, no mapping comment. Sibling `task-board-browsing` demonstrates the required practice even when literal session-expiry is inapplicable ("session-expired → 本旅程为离线桌面应用…无字面会话过期面;通道失效类比 = forge 数据读取失败"). Score is not 0 (outcomes not "completely absent") but well below half. (-25)

**Test strategy proportions 50/50 Contract/Journey (42/50)**: 11 scenarios (5 happy + 6 edge) with per-step granularity suitable for Contract extraction and a coherent end-to-end Journey spine; depth is balanced. Minor deduction: several edges are one-line assertions where siblings specify testable detail (e.g., 6b vs. sibling's supersede-semantics detail). (-8)

**Environment realism (20/40)**: Two material gaps for a web-execution model:
- **No assertion channel for filesystem claims.** "仅工作台注册信息被删除,项目仓内文件与 forge 数据不被改动" cannot be verified from the browser surface; the journey never says how (filesystem snapshot/hash before-after? test-process direct read?), while siblings define exactly this ("跨面断言口径:…校验通道 = 测试进程直读 fixture forge 文件或 stub CLI stdout"). (-12)
- **No fixture isolation.** Setup relies on real app state ("应用已启动且已有 1 个注册项目并处于激活状态"; "存在第二个可注册的 forge 项目路径") with no isolated userData/temporary projects/cleanup — this journey mutates the project registry, the most state-polluting of the family, yet is the only one without the fixture discipline both siblings mandate ("不得以生产仓为承载"). Directory pickers in browser automation (native dialogs) are also unaddressed. (-8)

### 6. Internal Consistency — 128/150

**Invariants hold in every step (55/60)**: Verified per step — 单激活 holds through Step 3 activation and Step 4 switch; removal steps do not contradict invariant 2; 三分模型 referenced consistently. No violations. Minor: invariant 2's verifiability is assumed but never operationalized (no step observes the project dir after removal). (-5)

**Cross-step references consistent (35/50)**: "切换回第一个项目" (Step 4) and "对第二个项目执行移除" (Step 5) resolve unambiguously against Setup/Step 3. However, the edge-numbering convention breaks: `Step 5b` (selecting an inaccessible registered project from the switcher) is semantically a variant of Step 4 (switching), not Step 5 (removal); `Step 6b` (re-registering) varies Steps 1–3, and there is no Step 6. The `Nb ↔ Step N` mapping that the template mandates ("Edge cases referencing happy path steps") is broken for two of six edges. (-15)

**Risk level consistent with content (38/40)**: High matches destructive removal + registry mutation. (-2 for removal being recoverable by re-registration — mitigating, but "registration deletion" still risks data-loss-adjacent behavior; classification acceptable.)

### 7. Workflow Coverage — 120/150

**Golden Path existence — veto item (52/60)**: NOT triggered. The Happy Path is a contiguous 5-step sequence — 进入注册向导 → 选择代码根目录并检出 forge 数据 → 选择文档位置并完成注册 → 切换激活项目 → 移除一个注册项目 — semantically matching Story 5's acceptance criteria one-to-one, in domain terminology (no API/technical steps). Deductions: the wizard's 3-step registration is compressed into Steps 1–3 where Step 1 (enter wizard) is borderline "navigation-only", and the frontmatter `golden_path: false` leaves the qualifying sequence unlabeled (the feature's designation lives in `task-session-execution-loop` — acceptable at feature level, but this journey's own qualifying sequence goes unmarked). (-8)

**Multi-step coverage depth (38/50)**: Registration lifecycle create → use → delete ✓; activation state handling ✓; cross-entity (project ↔ workbench-own-state ↔ doc location) ✓; error-recovery (1b 修正引导) ✓. Missing depth: re-register after removal (would prove registry cleanup), cancel-mid-wizard, and modify/re-point doc location post-registration. (-12)

**Workflow completeness against PRD/Design scope (30/40)**: Story 5 fully covered. Gaps against UF1: 项目显示名 (UF1 Data Requirements: "项目显示名 | string | 目录名(可改) | 列表展示") has no step or edge exercising default naming or editing; the populated-state switcher display (project cards + activation mark) is only implicitly touched. PRD scale boundary "≤20 注册项目" (prd-spec Performance) has no boundary leg. (-10)

### Cross-dimension coherence check

One systemic defect propagates coherently and explains the score shape: **missing classification/disposition discipline** — it simultaneously produces the Fact Alignment failure (no `source: inferred`, one unclassified claim), the Surface Fitness mandatory-outcome gap (session-expired undispositioned), and the "或"-forked outcomes (Completeness/Precondition Exclusivity). No dimension scores contradict each other; the happy-path narrative scores high (Semantics, Workflow) while boundary/verification discipline scores low — consistent with the text. No double-counted deductions were found across dimensions (the 6b instance is charged once under Fact Alignment c3; the "或"-fork of 6b once under Completeness; 2b/3b overlap once under Exclusivity).

---

## Phase 3 — Blindspot Hunt ([blindspot] — outside all rubric dimensions)

1. **[blindspot] Test reproducibility: registry-mutating journey has no isolation contract.** Quote: "应用已启动且已有 1 个注册项目并处于激活状态" + "存在第二个可注册的 forge 项目路径(含 `.forge`/`docs/features` 等 forge 数据)". Neither sibling baseline is matched (both specify "一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理"). An e2e run of this journey against a developer's real shell state pollutes the actual project registry; repeated runs collide with pre-existing registrations (Step 6b becomes nondeterministic against real state). The rubric has no fixture-isolation criterion for journeys, so this cannot be scored — but it will bite gen-test-scripts. The Setup must specify a disposable profile/registry and cleanup.

2. **[blindspot] Wizard cancel/step-back behavior is untested and unspecified.** Quote: "停留在步骤 ①,不得进入步骤 ②" — the wizard demonstrably has step gating, yet no edge covers user abandoning the wizard after a validated step ① (does a half-finished registration leak into the switcher? does returning to the wizard resume at ① or ②?). Outside rubric dimensions because the PRD does not mention cancel, so Workflow Coverage's PRD-completeness check cannot flag it — but it is a classic partial-state bug for a multi-step form surface.

3. **[blindspot] "完整" is unquantified in the switch assertion.** Quote: "看板/feature/挂接数据完整切换到目标项目(单激活)". "完整" (complete) has no enumerated set — a downstream test-writer cannot derive the checklist (which boards, which hookup lists, which cached views?). Semantic Purity only bans code/regex, so no rubric dimension captures unquantified completeness adjectives. Should list the observable surfaces that must reflect the target project.

4. **[blindspot] Scale boundary from PRD performance assumptions is untested.** Quote: "从项目切换器切换回第一个项目" — exercised only with 2 projects. prd-spec Performance declares "≤20 注册项目" as the supported scale; no boundary leg (switcher list at 20 entries, switching at the scale limit) exists anywhere in the journey family. Boundary-value coverage is a QA-rubric blind spot for journeys.

5. **[blindspot] Cross-journey seam declared but never operationalized.** Quote: "SC5 涉及仓外路径注册(与 feature-board-docs-browsing journey 衔接)". This journey never completes a 仓外-path registration (Step 3 keeps 仓内: "保持默认仓内文档位置"; Step 3b only checks the authorization prompt), deferring the full 仓外 leg to another journey by a one-line note. Neither journey document defines the handoff (which one owns the 仓外 registration completion leg?). The seam assertion creates an ownership gap the per-journey rubric cannot see.

---

## Attacks Summary (for reviser)

1. **[Fact Alignment]** Inferred boundary outcomes carry zero annotations — "系统明确处理(提示已注册或复用既有注册项),不产生重复或损坏的注册记录" (6b); also 4b's "切换到剩余项目" branch and all of 5b. Must add `source: inferred` + reasoning basis per outcome (family convention, see siblings).
2. **[Fact Alignment]** Unclassified behavior assertion with no PRD basis — "系统明确处理(提示已注册或复用既有注册项)" — mark UNKNOWN or commit to one deterministic behavior with inference basis. (-30 applied)
3. **[Precondition Exclusivity]** 2b/3b precondition overlap — 3b "用户在步骤 ② 选择仓外本地路径作为文档位置" is satisfied by 2b's same-directory state; add "≠ 代码根目录" to 3b. (-20 applied)
4. **[Precondition Exclusivity/Completeness]** 4b forks on unstated state — "注册信息删除后激活态正确处理(切换到剩余项目,或全部移除后自动进入注册向导空态)" — split into two edges with distinct preconditions (剩余 ≥1 / 剩余 = 0).
5. **[Surface Fitness]** `session-expired` neither covered nor dispositioned — no mapping comment exists anywhere in the document (contrast both siblings). Add a `surface-web required_outcomes 映射` comment for both `validation-error` (naming 1b/2b) and `session-expired` (mapping to an analogue or stating inapplicability with reasoning).
6. **[Surface Fitness]** Filesystem-safety assertions lack an out-of-browser verification channel — "仅工作台注册信息被删除,项目仓内文件与 forge 数据不被改动" — specify the assertion channel (before/after filesystem snapshot or test-process direct read) and add fixture isolation to Setup per family convention.
7. **[Internal Consistency]** Edge numbering drift — "Step 5b: 注册路径不可访问" is a Step-4 variant and "Step 6b: 重复注册同一项目" has no Step 6; renumber or restructure so each edge references its actual base step.
8. **[Completeness]** Bundled/ambiguous action and outcome — "查看授权提示并确认(或不选择仓外)" (3b) — split into a single deterministic action with a single observable result.
9. **[Workflow Coverage]** UF1 项目显示名 ("目录名(可改)") unexercised by any step — no leg covers display-name default or editing; add a step or note explicit deferral to another journey.

---

## Pass/Fail

**FAIL** — Total 855/1150 < 975; Fact Alignment 62/150 < 90 (dimension threshold breach). Priority fixes for iteration 2: (1) annotation discipline (attacks 1–2), (2) split all "或"-forked outcomes (attacks 3, 4, 8), (3) surface-outcome disposition + verification channels + fixture isolation (attacks 5–6). Happy-path narrative itself is sound and needs no structural rework.
