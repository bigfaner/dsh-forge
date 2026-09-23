# Journey Eval Report — iteration 1

- **Document**: `docs/features/dsh-forge-m2/testing/plugin-management/journey.md`
- **Rubric**: `skills/eval/rubrics/journey.md` (1150 pts, target 975, every dimension ≥ threshold)
- **Surface**: web (`rules/surface-web.md`); test strategy Web = balanced 50/50; mandatory derived outcomes: `validation-error` + `session-expired`
- **Scorer persona**: Senior QA Engineer (adversarial)
- **Verdict**: **FAIL** — Total 935/1150 (< 975) AND Surface Fitness 68/150 < 90 threshold. Both pass conditions fail independently.

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 170/200 | 120 | ✓ |
| 2. Semantic Purity | 192/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 132/150 | 90 | ✓ |
| 4. Fact Alignment | 93/150 | 90 | ✓ |
| 5. Surface Fitness | **68/150** | 90 | **✗** |
| 6. Internal Consistency | 148/150 | 90 | ✓ |
| 7. Workflow Coverage | 132/150 | 90 | ✓ |
| **Total** | **935/1150** | 975 | **✗ (total miss + dimension threshold miss)** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

**Chain check (problem → solution → evidence → success criteria)**: The journey addresses Story 7 (插件管理·两级模型) and SC6/G6/UF6. Step-level tracing is near-verbatim PRD extraction: Step 1 ← Story 7 AC1 + UF6 flow 1; Steps 2–3 ← Story 7 AC2 + UF6 flow 2 + UF6 validation rules; Step 4 ← Story 7 AC3 + UF6 flow 3; Step 5 ← Story 7 AC4; 1b ← SC6 ("必备插件无可用禁用通道"); 2b ← UF6 validation rule ("禁用第三方插件时若有其注入内容在线,提示影响"); 3b ← UF6 `transitioning` state; 5b ← Story 7 AC2 + UF5 `third-party-disabled` state. The journey genuinely exercises the user story it claims — the chain is sound. The weaknesses are all in execution discipline, not in narrative fidelity.

**Pre-score anchors recorded before rubric scoring**:

1. **Anchor A (surface discipline entirely absent)**: Zero engagement with the web surface's mandatory `required_outcomes` (`validation-error`, `session-expired`) — no mapping comment, no exclusion note, no `source: inferred` annotation anywhere (grep of the document for `required_outcomes|source: inferred` returns zero matches). Both revised siblings (`task-board-browsing`, `task-session-execution-loop`) carry the `surface-web required_outcomes 映射` convention; this document predates/ignores it entirely.
2. **Anchor B (Step 5 is not a user action)**: "**User Action**: 检查产品级配置/产品清单条目" — the workbench UI exposes the *derived plugin list* (UF6 Data Requirements: "必备身份派生自产品清单,只读"), not the product-level config object. No user can perform this step in a browser; the expected result "产品清单条目未被改写" is a test-process file assertion wearing a user-action label, with no assertion channel specified. Its trailing claim "升级/重装不冲突" has no corresponding upgrade/reinstall leg anywhere in the journey.
3. **Anchor C (Setup thin vs family convention)**: No fixture isolation ("一次性 fixture 项目:临时目录 + 隔离 userData、测试后清理" in siblings), no provisioning statement for the third-party fixture plugin, no cross-surface oracle channel ("跨面断言口径" in siblings), and no harness assumption for the restart leg (4b) — a real hazard in this repo's e2e suite (single-instance lock → ERR_SINGLE_INSTANCE).
4. **Anchor D (cancel path missing)**: The workflow's only user decision input — the disable confirmation dialog (Step 2: "出现二次确认") — has no cancel/abort edge. The most basic dialog boundary in UI testing is absent while five other edges exist.
5. **Anchor E (unclassified inferences)**: 3b "防重复执行" and 4b "禁用状态保持" (restart persistence) have no PRD statement and no `source: inferred`/UNKNOWN marking.
6. **Anchor F (structure otherwise sound)**: `risk_level: High` correct (mutates plugin load state; SC6 data-integrity stakes); High-risk density rule satisfied (5 edges ≥ 5 happy steps); all five edges anchor correctly under the `Nb = variant of Step N` convention (no numbering drift, unlike multi-project i1); `golden_path: false` correct feature-level delegation to `task-session-execution-loop`; no "或"-forked expected results; headline facts are PRD-verbatim.

---

## Phase 2 — Rubric Scoring

### 1. Completeness — 170/200

**1a. Journey metadata (50/50)** — Name `plugin-management` kebab-case ✓; `risk_level: High` valid and justified by content (enable/disable mutates plugin load state; every step asserts data-integrity outcomes; SC6 is a milestone gate) ✓; `golden_path: false` consistent with feature-level delegation ✓; `surface_types: ["web"]`/`surface_keys: ["web"]` populated ✓; sources list all three PRD files ✓; `generated` present ✓. Full marks.

**1b. Steps complete with required fields (74/80)** — All 5 happy steps carry User Action + Expected Result; all 5 edges carry Precondition + User Action + Expected Result; sequence is coherent and ordered. Deduction −6: Step 5's "action" is not a user operation —
> "**User Action**: 检查产品级配置/产品清单条目"

The workbench surface presents the plugin list, not the config; this is a verification-only step that `rules/golden-path.md` explicitly names as an anti-pattern ("Inserting verification-only steps … that do not advance the user's goal"). A downstream agent cannot execute it as a browser interaction.

**1c. Outcomes cover happy path + required derived scenarios (46/70)** — Domain edge coverage is good and genuinely PRD-grounded: forbidden-action negative test (1b), online-content disable (2b), concurrent double-submit (3b), restart persistence (4b), blast-radius verification (5b). Deductions:
- −12: the surface-web **mandatory** derived outcomes are unconsidered — no `validation-error` disposition (no form face is acknowledged, no analog labeled, no inapplicability reasoning) and no `session-expired` disposition (no analog, no exclusion note; the offline-desktop mapping both siblings use is never invoked). Zero evidence of consideration on the page.
- −8: confirmation-dialog **cancel path** missing — Step 2 introduces "出现二次确认" and Step 3 confirms, but no edge cancels and asserts no state change with injection content intact. For a High-risk journey whose core action is gated by a confirmation, this is the single most expected boundary.
- −4: Step 5's expected result includes "升级/重装不冲突" — an assertion with no covering workflow: no upgrade or reinstall step exists in this journey, so the clause is untestable as written (dangling scope, charged here for scenario presence; see 7c for the scope facet).

### 2. Semantic Purity — 192/200

**2a. Natural language outcomes (80/80)** — No regex, selectors, XPath, or framework assertions anywhere; outcomes describe what the user/system observes. "(transitioning)" is UF6's own state vocabulary; "(行为结果由 SC6 验收)" is a traceability note. Full marks.

**2b. Preconditions declarative (60/60)** — Setup bullets and all five edge Precondition fields are declarative states ("插件管理区已展示必备(核心)插件", "一次启停操作正在执行(操作中指示状态)", "第三方插件已被禁用"). No setup procedures disguised as preconditions. Full marks.

**2c. No implementation coupling in Step descriptions (52/60)** — Steps 1–4 are user-level operations (open area / click disable / confirm / click enable). Dock −8: Step 5 couples the step to configuration internals — "检查产品级配置/产品清单条目" targets an implementation artifact (基座产品级配置文件), not a UI object; the UI-level expression of this check is the rendered plugin list. The step as phrased forces contract/test generation below the UI abstraction layer.

### 3. Precondition Exclusivity — 132/150

**3a. Preconditions distinct across outcomes (50/60)** — 1b/3b/4b/5b preconditions are mutually distinct and specific. Dock −10 on the Step 2 family: Step 2b's divergent precondition —
> "**Precondition**: 待禁用第三方插件的注入内容当前在线(工作台内可见)"

— does not actually diverge from the happy-path state. Setup establishes "第三方插件处于启用状态"; an enabled third-party plugin's injected content is online/visible by default. Step 2 and Step 2b therefore have non-mutually-exclusive preconditions (both hold simultaneously in the default state), violating distinctness for the pair.

**3b. Preconditions sufficient to uniquely select (42/50)** — Consequence of the same pair: in state "third-party plugin enabled, content visible", both Step 2's outcome ("出现二次确认,说明影响(仅该插件注入内容退出;forge 数据与工作台核心能力不受影响)") and Step 2b's outcome ("提示影响(会话本体与核心挂接能力不受影响);确认后仅该插件注入内容退出") apply, and they prescribe nearly identical observables — the variant adds no distinguishable assertion. A runner cannot tell which contract to bind. Combined −18 across 3a/3b ≈ the rubric's −20 ambiguous-pair rule, applied once for the pair.

**3c. No missing preconditions for error/boundary outcomes (40/40)** — All five edges state their triggers, including the boundary ones (mid-operation state for 3b, disabled state for 4b/5b). Full marks.

### 4. Fact Alignment — 93/150

**4a. Factual claims traceable or marked UNKNOWN (48/60)** — Traceability is the document's strength: virtually every headline expected result is verbatim or near-verbatim PRD text (two-tier rendering + no disable entry ← Story 7 AC1/UF6 flow 1/SC6; second confirmation copy ← UF6 flow 2; only-that-plugin exit + core unaffected + zero damage ← Story 7 AC2/SC6/UF6 validation rules; re-enable restore ← Story 7 AC3; manifest read-only + "升级/重装不冲突" ← Story 7 AC4; 2b copy ← UF6 validation rule verbatim; transitioning ← UF6 States; third-party-disabled 说明 ← UF5 States; invariants ← UF6 validation rules + In Scope). Journey-level traceability block cites Story 7/SC6/G6/UF6. Dock −12: two claims assert behavior no PRD statement establishes and neither is marked UNKNOWN —
- 3b: "防重复执行" (re-submit protection — UF6 defines a `transitioning` indicator, not double-submit suppression);
- 4b: "禁用状态保持" across restart (UF6's "运行时启停状态(同一配置)" implies persistence but no PRD text states restart persistence; SC6 does not mention restart).

**4b. Inferred claims have rule support + `source: inferred` (20/50)** — The document contains derived boundary content and *none* of it carries a `source: inferred` annotation or a `required_outcomes` citation (zero matches, grep-verified): 3b double-submit protection, 4b restart persistence, 2b's re-stated confirmation semantics. Additionally, no boundary outcome in the document is derived from or reconciled with the web `required_outcomes` rules, so the criterion's intended machinery (rule-cited derivations) is entirely absent. Partial credit only because the underlying inferences are individually sensible.

**4c. No hallucinated unclassified claims (25/40)** — No inverted or invented behavior contradicting the PRD; most assertions trace. One unclassified behavior assertion charged: "防重复执行,不产生中间损坏状态" — the second half traces to the zero-damage invariant, but "防重复执行" is neither factual (no source) nor inferred-with-annotation (no basis cited). It is a plausible single behavior (unlike multi-project i1's forked assertion that drew the full −30), so −15 rather than −30. 4b's restart persistence is weakly grounded via "同一配置" semantics and is charged once (in 4a), not double-charged here.

### 5. Surface Fitness — 68/150 (BELOW THRESHOLD)

**5a. Mandatory derived outcomes present (15/60)** — `validation-error` and `session-expired` are the two mandatory web outcomes. On the page:
- `validation-error`: no form/input face exists in this workflow and the document never says so; the closest functional analog is 1b (attempted forbidden action → no entry, refusal behavior), which is neither labeled nor derived from the web rule;
- `session-expired`: no analog, no exclusion note, no consideration evidence of any kind — the offline-desktop rationale both siblings use to map or exclude it is never invoked.

Calibration against family precedent: `task-board-browsing` i1 scored 20/60 with one unlabeled analog (a UF2-verbatim validation rule) and nothing for the second; `task-session-execution-loop` i1 scored 35/60 with two unlabeled analogs. This journey's single analog is weaker (forbidden-action refusal ≠ invalid input) and the second outcome has nothing. HARD-RULE applied: score only what is on the page.

**5b. Test strategy proportions 50/50 Contract/Journey (35/50)** — Shape is balanced: 5 contiguous journey-smoke steps + 5 edge scenarios, per-step granularity suitable for contract extraction. Dock −15 on contract-side depth: several expected results are single-phrase oracles that cannot anchor a contract assertion at the web surface — "该插件注入内容恢复且数据完整" (Step 4), "核心能力全部正常" (5b), "forge 数据零损坏" (Steps 3/5b) — with no observable specified (what does "核心能力全部正常" render as?); no failure/recovery boundary exists for the toggle operation itself (only in-progress and success are modeled); no state-rendering assertion for the disabled state (UF6 "disabled | 状态 + '启用'动作" is implied by Step 4's action but never asserted).

**5c. Realistic web environment/execution assumptions (18/40)** — Three charges:
- −10: out-of-browser assertions with no verification channel — "产品清单条目未被改写" (Step 5) and "forge 数据零损坏" (Steps 3/5b/4b) require test-process config/forge-file snapshot diffs; the document specifies no oracle channel (family convention: "跨面断言口径" Setup bullet). A browser-level runner cannot observe these as written.
- −8: Setup carries no fixture isolation/provisioning ("临时目录 + 隔离 userData、测试后清理") and no statement of how the third-party fixture (基座 hello-world) is built/installed for the run; the restart leg (4b) additionally needs a relaunch/lock assumption (see Phase 3 B4).
- −4: Step 1b's universal negative — "任何交互路径都无法禁用 forge 核心能力" — spans an unbounded interaction space; browser automation can assert "无禁用入口" on rendered views, not "any interaction path". The honest SC6 annotation softens but does not make the clause executable.

### 6. Internal Consistency — 148/150

**6a. Invariants hold in every step (58/60)** — All four invariants hold across every step and edge; 1b verifies invariant 1, 4b reasserts it, Steps 3/4/4b/5b exercise invariant 2, Step 5 exercises invariant 3, Steps 3/5b exercise invariant 4. No violation, no −40 event. Dock −2: invariant 2 ("启停仅触碰插件装载状态") is reconcilable with UF6's "读写产品级配置(同一配置)" only by leaving the document — the page never states that the disable state persists in the config's runtime portion, which is precisely the ambiguity that makes Step 5's channel problem acute.

**6b. Cross-step references consistent (50/50)** — "该第三方插件"/"该插件" references are unambiguous; all five edges anchor correctly (`1b`→Step 1 list rendering, `2b`→Step 2 initiate disable, `3b`→Step 3 toggle execution, `4b`→Step 4 alternative continuation from the shared disabled start state, `5b`→Step 5 with declared divergent precondition). Edge 4b/5b's disabled-state entry vs the happy path's re-enabled end state is a legitimate divergent-precondition variant, not a contradiction. No dangling references.

**6c. Risk level consistent (40/40)** — High is exactly right: the workflow mutates plugin load state (enable→disable→enable), sits under SC6's milestone-gate data-integrity claims, and carries restart/concurrency boundaries — matching the rubric's High criteria (state mutation + data loss risk).

### 7. Workflow Coverage — 132/150

**7a. Golden Path existence, veto item (58/60 — NOT triggered)** — Semantic verification performed: the 5 contiguous domain-level steps map one-to-one onto Story 7's acceptance criteria (AC1 view two-tier list → AC2 disable+confirm → AC3 re-enable → AC4 config intact), and every step uses domain terminology (打开插件管理区 / 发起禁用 / 确认禁用 / 重新启用), zero API-level descriptions. Verified against Story 7, not merely step-counted; both golden-path constraints satisfied. Dock −2: the qualifying spine's terminal step is verification-only ("检查产品级配置完整性") — the exact anti-pattern `rules/golden-path.md` prohibits for spines; the domain progression genuinely ends at Step 4. (`golden_path: false` frontmatter is correct feature-level delegation; the veto tests content, which qualifies.)

**7b. Multi-step coverage depth (38/50)** — Real depth present: full enable→disable→enable lifecycle, forbidden-action negative test, concurrency (3b), restart persistence (4b), cross-entity blast radius into task board / task detail / session hooking (5b). Dock −12:
- −7: confirmation-dialog cancel branch absent (see 1c) — the workflow's only user-decision fork is untested;
- −5: no operation-failure/recovery edge — the toggle operation is modeled only as in-progress→success; a High-risk journey whose rubric rewards "error recovery paths" has none, and the failure semantics that do exist repo-wide (BIZ-resilience-001 silent degradation) are never reconciled (see Phase 3 B5).

**7c. Workflow completeness against PRD scope (36/40)** — Story 7 AC1–AC4 all covered; UF6 interaction flow 1–3 all covered; all three UF6 validation rules covered (启停不触碰 forge 数据 → invariant 2 + Steps 3/5b; 必备无禁用入口 → 1b; 在线内容提示 → 2b); UF5 `third-party-disabled` state → 5b. Dock −4: Step 5 asserts "升级/重装不冲突" — a PRD-verbatim parenthetical from Story 7 AC4 — but no journey in the set exercises upgrade or reinstall; the clause is asserted into an expected result with no covering workflow and no scoping note delegating it elsewhere (e.g., to an installer/upgrade leg).

### Cross-dimension coherence check

- **Mandatory-outcomes omission** spans 1c (−12), 4b (annotation machinery absent), and 5a (surface-rule compliance) — the same three-facet split the sibling reports used; each sub-score reflects its own facet only, single root cause acknowledged.
- **Step 5 defect** has several facets, each charged once under its own criterion: 1b (not an executable user action), 2c (implementation coupling in the step description), 5c (no assertion channel), 7a (verification-only spine step), 7c (dangling upgrade/reinstall scope). The heaviest weight sits in 5c/1b; no facet is double-charged.
- **Cancel path** charged in 1c (scenario presence) and 7b (workflow variation depth) — precedent: task-board i1 charged loading-state in both 1c and 7c.
- **2/2b ambiguity** charged once as a pair (−10 + −8 ≈ the rubric's −20 per ambiguous pair), not per criterion instance.
- **3b "防重复执行"** charged in 4a (untraceable) and 4c (unclassified) — two rubric-defined facets of the same annotation failure (traceability vs classification), mirroring the 4a/4b split for other inferred clauses; no −30 hallucination rate applied since the claim is plausible, single-behavior, and PRD-consistent.
- Fact Alignment (93) sits just above threshold — driven by genuinely strong verbatim tracing; Surface Fitness (68) carries the structural failure. No dimension rewards or penalizes the same text twice across these two.

---

## Phase 3 — Blindspot Hunt ([blindspot] = outside all rubric dimensions)

1. **[blindspot] The plugin-management surface has no load/error state anywhere — and neither does UF6.** Every UF with data (UF1–UF5) defines loading/error states; UF6's States table has only mandatory/enabled/disabled/transitioning. The journey inherits the silence: Step 1's expected result — "插件列表两级呈现:forge 核心插件标记"必备"且仅状态展示(无禁用入口)" — assumes the list always renders. If the product-level config (the SoT the list derives from) is unreadable or corrupt, no expected behavior is defined in the journey *or the PRD*. This is also the natural landing spot for the web `session-expired` analog (channel-invalidation → surface error). No rubric dimension evaluates PRD state-model completeness. *Fix: add a plugin-list load-failure edge (error + retry or silent-degradation per BIZ-resilience-001) and raise the UF6 state-model gap to the PRD owner.*

2. **[blindspot] A single third-party fixture makes "仅该插件" unfalsifiable.** Setup establishes "已装配 forge 核心插件与 ≥1 个第三方插件(测试 fixture,如基座 hello-world)" — with N=1 third-party plugins, invariant 4 ("禁用第三方只收敛该插件注入内容") is trivially satisfied: there is no *other* plugin whose content could wrongly exit. The invariant's discriminating power requires ≥2 third-party plugins (disable one, assert the other unaffected). Fixture-specification adequacy is not a rubric dimension (consistent with prior reports treating fixture provisioning as blindspot territory). *Fix: provision ≥2 third-party fixtures and assert cross-plugin isolation in Step 3/5b.*

3. **[blindspot] Bilingual copy is required by the PRD and never asserted.** UF6 Data Requirements: "影响说明文案 | text | 静态 | 中英双语"; PRD Compatibility: "工作台 UI 文案中英双语(继承 M1 壳级决定)". Steps 2/2b assert the confirmation copy's *content* — "出现二次确认,说明影响(仅该插件注入内容退出;forge 数据与工作台核心能力不受影响)" — but no step, edge, or invariant touches its language. No rubric dimension covers locale/i18n. *Fix: add a copy-language assertion (or invariant) for the confirmation and third-party-disabled 说明文案.*

4. **[blindspot] The restart leg carries a repo-specific execution hazard the journey never acknowledges.** "**User Action**: 重启应用并打开插件管理区与工作台" (4b) — this project's e2e suite has a documented pitfall: an instance holding the single-instance lock yields ERR_SINGLE_INSTANCE across specs, and restart legs are exactly where it bites. With no isolated userData declared in Setup and no lock-release/relaunch-wait assumption, the leg can fail for environmental rather than behavioral reasons — a flaky test waiting to happen. 5c scores assertion-model realism; this operational hazard is rubric-external. *Fix: state the relaunch assumption (wait for process exit + lock release before relaunch) alongside the isolated-userData fixture.*

5. **[blindspot] Disable/enable failure semantics are silent where a business rule speaks.** If the toggle operation fails non-fatally (e.g., config write fails), the journey's only model is "显示操作中(transitioning)指示;防重复执行,不产生中间损坏状态" — i.e., completion. BIZ-resilience-001 mandates silent degradation + ERR_* structured log (no error dialogs, no blocking) for non-fatal failures. The journey neither covers the failure nor reconciles its absence with that rule — a downstream test author would have to guess between "error toast" (blocked by the rule) and "silent stuck transitioning". Business-rule reconciliation is not a rubric dimension. *Fix: add an operation-failure edge whose expected behavior cites BIZ-resilience-001 (silent degradation + log, no modal error).*

---

## Revision Priorities (for reviser)

1. **Surface-web required_outcomes engagement** (fixes 5a/1c/4b — the threshold-failing dimension): add `surface-web required_outcomes 映射` comments (mirror `task-board-browsing`'s convention) for `validation-error` (no form face → map to confirmation-cancel / forbidden-action analog or state inapplicability with reasoning) and `session-expired` (offline desktop → map to plugin-config read failure or state inapplicability).
2. **Make Step 5 executable**: re-anchor as a user action (view the rendered plugin list in the workbench) with the config-integrity assertion moved to an explicit test-process oracle (before/after config snapshot diff — add the "跨面断言口径" Setup bullet); remove "升级/重装不冲突" or scope it to a dedicated upgrade/reinstall leg.
3. **Annotate inferences**: add `source: inferred` with basis for 3b "防重复执行" (UF6 `transitioning` semantics) and 4b "禁用状态保持" (UF6 "运行时启停状态(同一配置)" persistence); mark anything unverifiable as UNKNOWN.
4. **Fix the 2/2b pair**: give 2b a genuinely divergent precondition (e.g., injected content visible inside an active session view at disable time) and a distinct observable (UF5 `third-party-disabled` 说明文案), so the pair becomes mutually exclusive.
5. **Add the cancel edge** for the disable confirmation (cancel → no state change, injection content remains, config untouched).
6. **Bring Setup to family convention**: disposable fixture + isolated userData + cleanup, ≥2 third-party fixture plugins (blindspot 2), provisioning note for the fixture plugin build, oracle channel, restart/lock assumption (blindspot 4).
7. **Optional depth**: plugin-list load-failure edge (blindspot 1), toggle-failure edge citing BIZ-resilience-001 (blindspot 5), bilingual copy assertion (blindspot 3), disabled-state rendering assertion (UF6 `disabled` row).

**Final: 935/1150 — FAIL (total 935 < 975; Surface Fitness 68 < 90). Revision required.**
