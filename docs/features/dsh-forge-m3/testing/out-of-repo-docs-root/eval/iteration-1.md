# Eval Report — Journey: out-of-repo-docs-root (Iteration 1)

- **Rubric**: journey (1150 pts, 7 dimensions, target 975, per-dimension min thresholds)
- **Surface**: web (per `surface-web.md` rule)
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Document**: `docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/journey.md`
- **Sources verified against**: `prd-user-stories.md` (Story 7), `prd-spec.md` (SC9/G7/阶段资产与文档根数据模型/Security/Business Flow 迁移线/归宿表 init 行), `prd-ui-functions.md` (Secondary Pages 注册向导/UF2/UF5), `docs/proposals/dsh-forge-m3/proposal.md` (Key Scenarios L73「新注册默认仓外」, 决策日志⑨), business-rules (`BIZ-workbench-001/002/003/005`, `BIZ-coexistence-002`), sibling journey `testing/explicit-sot-migration/journey.md` (Step 4b cross-reference target)
- **Date**: 2026-09-24

## Verdict

**FAIL — Total 842/1150 (target ≥ 975); Surface Fitness 62/150 below its 90-pt threshold.**

Root cause of failure: the journey completely omits the Web surface's mandatory derived Outcomes (`validation-error`, `session-expired`) — neither included as outcomes nor reasoned away with a mapping/N/A annotation (sibling journeys `task-dispatch-execution-loop` and `preferences-tiered-override` demonstrate the required `<!-- surface-web required_outcomes 映射: ... -->` convention; this document is silent). Per the rubric this zeroes the 60-pt Surface Fitness criterion. Secondary issues: Step 3 presumes a populated project that no prior step or Setup item produces from the empty fixture; the Setup never establishes the authorization state the Step 2 / Step 2b pair branches on; the fixture's `.forge/` presence (registration's forge-data detection, still in force per `BIZ-workbench-003`) is unspecified; and zero `source: inferred` annotations appear while inferred composite claims exist (Step 4b).

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Problem → Solution: sound.** The journey operationalizes Story 7 / SC9 / proposal Key Scenario「新注册默认仓外」faithfully. Verified: Story 7's three ACs (default flip at doc-location step; assets land in doc root with zero repo pollution; in-repo compatibility) all exist and map to Steps 1–4; the traceability blockquote is accurate (proposal L73 confirmed). The doc-root addressing claim is verbatim from prd-spec 阶段资产与文档根数据模型 ("indexer/看板/提案板/阶段资产全部按文档根寻址").
2. **Solution → Evidence: two gaps.** (a) Step 3's action ("执行任务/记录/阶段资产/proposals 的读写") presumes the freshly-registered EMPTY project (Setup: "无过程文档") somehow possesses multi-class process assets — the population path (pipeline creation or agent sessions creating features/tasks first) is never established by any step, Setup item, or precondition. (b) Step 4b's "感知回流照常(≤5s 口径)" generalizes the ≤5s bound to all three surfaces including 阶段资产面板, for which no source states a freshness bound (only 任务看板 via `BIZ-workbench-005` and proposals via SC6/Story 6).
3. **Evidence → Success Criteria: partially weak.** Several Expected Results assert non-observable or out-of-browser properties ("indexer...按文档根寻址", "代码仓内零新增过程文档(断言)", Step 3b's `git status` check) with no UI-proxy or harness-assertion channel specified.
4. **Self-contradiction check: one soft contradiction.** Setup states "应用管理路径可写" but never states the app-managed path is **authorized**; Step 2b establishes that authorization gates the default path ("默认仓外路径尚未经用户授权" → guidance). On a fresh environment (no persistent authorization grant per `BIZ-workbench-001`), the first registration necessarily passes through 2b's flow — happy Step 2's "接受默认仓外文档根并完成注册 → 注册成功" is only reachable under an unstated precondition. The happy path and 2b are distinguishable only via a state the document never fixes.
5. **SC/InScope-style clustering**: not applicable (journey-type document, no SC/In Scope sections); the analogous invariant-vs-step scan found no invariant breaches (see Dim 6).
6. **Mandatory surface derivations absent**: grep-confirmed — `validation-error` / `session-expired` (and any mapping-comment equivalents) appear nowhere in the journey; no N/A consideration is stated.
7. **Fixture registrability assumption unverified**: Setup's "新 forge 项目代码仓(fixture:含 .git 与代码文件,无过程文档)" does not say whether `.forge/` exists. `BIZ-workbench-003` (M2 chain, not lifted by M3 PRD): "检出 forge 数据(`.forge/` 与文档位置均无 → ERR_FORGE_NOT_DETECTED)". With a default out-of-repo doc root (empty), detection must succeed via `.forge/` in the code root — or the wizard-init path (归宿表: "init | 注册向导 + 内核 API") applies. The journey picks neither, leaving Step 2's executability undetermined.

---

## Phase 2 — Rubric Scoring

### Dimension 1: Completeness — 150/200 (threshold 120, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Metadata complete | 50/50 | `journey: "out-of-repo-docs-root"` kebab-case ✓; `risk_level: "Medium"` valid and justified — multi-step wizard + asset writes with no irreversible operations (registration is removable, doc-root writes are additive), matching the doc's own criteria comment. Sources (3 PRD files), generated date, surface_types/keys all present. |
| Steps complete (name/action/outcome) | 60/80 | All 8 steps (4 happy + 4 edge) have User Action + Expected Result; edge steps all carry Preconditions; numbering yields a coherent order. −20: (a) Step 3's compound action "在该注册项目上执行任务/记录/阶段资产/proposals 的读写(看板浏览 + agent 会话产出过程资产)" is not executable from the Setup state — the fixture is an empty new project, so no tasks/records/stage assets/proposals exist to read or write, and no step or precondition establishes them (sibling `explicit-sot-migration` solved this by seeding its fixture with ≥10 tasks); (b) the Setup fixture never states whether `.forge/` is present — under `BIZ-workbench-003` this determines whether Step 2 can succeed at all; (c) happy Step 2 does not state whether the authorization grant happens in-path (2b proves it gates), leaving the happy path's entry state implicit. |
| Happy + required derived outcomes | 40/70 | Happy path fully covers Story 7's ACs; edge set covers explicit-in-repo (1b), unauthorized path (2b), long-run zero-pollution boundary (3b), in-repo flow-back (4b). Missing: Web mandatory derived Outcomes entirely absent — `validation-error` is genuinely applicable (the doc-location step is a form; M2 error codes ERR_EXTERNAL_PATH_UNREADABLE / ERR_DOC_PATH_CONFLICT from `BIZ-workbench-003` are natural invalid-input boundaries) and `session-expired` is at minimum owed an N/A annotation; also missing duplicate-registration boundary (ERR_PROJECT_EXISTS, `BIZ-workbench-002`) and forge-not-detected (ERR_FORGE_NOT_DETECTED) for the "new project" fixture. |

### Dimension 2: Semantic Purity — 180/200 (threshold 120, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Natural-language outcomes | 72/80 | No regex, selectors, or framework assertion calls anywhere ✓. −8: "代码仓内零新增过程文档(断言)" embeds test-meta language (verification method) inside an Expected Result rather than an observation; "indexer/看板/提案板/阶段资产全部按文档根寻址" asserts internal addressing, not what the user/system observes. |
| Declarative preconditions | 56/60 | All four edge preconditions are declarative states ("文档位置步骤呈现中", "默认仓外路径尚未经用户授权", "仓外注册项目已运行一段时间...", "既有仓内项目的文档被外部...修改") ✓. −4: Setup item "文档根路径授权机制沿用 M2;应用管理路径可写" narrates a mechanism + writability but never declares the actual required state (authorized or not) — the load-bearing precondition is missing in declarative form. |
| No implementation coupling in steps | 52/60 | Steps are user-level (发起注册/接受默认/浏览/检查) ✓. −8: "indexer" names an internal module (apps/desktop/src/main/workbench/indexer/) in Step 3's Expected Result; Step 3b's User Action embeds a terminal command "(git status)" — legitimate as a developer action but presented as the action itself rather than the intent (verify repo cleanliness); "index.json" in Step 2 is domain-level forge terminology (tolerated, PRD uses it). |

### Dimension 3: Precondition Exclusivity — 116/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Preconditions distinct across outcomes | 55/60 | No two edge outcomes share a precondition; each anchors to a distinct happy step (1b/2b/3b/4b) ✓. −5: 1b ("文档位置步骤呈现中") and 2b ("走注册向导到达文档位置步骤") occupy the same wizard point; the distinguishing dimension is authorization state, which only 2b states — 1b's outcome silently assumes the authorized world. |
| Preconditions sufficient to uniquely select | 32/50 | The Step 2 / Step 2b pair cannot be resolved from the document: Setup grants only "应用管理路径可写" (writable ≠ authorized under `BIZ-workbench-001`'s persistent authorization registry), happy Step 2 shows registration succeeding with no authorization interaction, and 2b shows authorization gating the same step. A downstream agent cannot determine which outcome applies on a fresh environment — the happy path lacks its required precondition ("应用管理路径已授权" or "授权引导在 Step 2 内完成并接受"). |
| No missing preconditions for error/boundary outcomes | 34/40 | All four boundary outcomes state their trigger ✓. −6: 3b's "已运行一段时间(任务/记录/阶段资产/proposals 多类读写)" is unquantified — no minimal activity set or window defines the boundary (QA: boundary conditions at limits untested); 2b does not state whether registration is blocked, deferred, or continues during the unauthorized state ("授权后注册与后续读写正常" presumes the user completes guidance but the in-between state is unstated). |

### Dimension 4: Fact Alignment — 100/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Factual claims traceable | 46/60 | Journey-level traceability block verified accurate: Story 7, SC9, proposal Key Scenario「新注册默认仓外」(proposal L73) all exist and match. Every load-bearing claim verifies: default flip (Story 7 AC1), zero repo pollution (SC9), doc-root addressing (prd-spec 数据模型 verbatim), in-repo option retained (proposal L73 "仓内选项保留"), authorization mechanism (prd-spec Security "文档根路径授权沿用 M2"), wizard migration delegation (Story 1 AC4 + 迁移线; cross-journey target `explicit-sot-migration` Step 4b verified to exist and match: "注册向导内的同一迁移确认"). −14: per-outcome anchoring exists in exactly one place (Step 2b's source comment); Step 4b's "≤5s 口径" is generalized to 阶段资产面板 where no source states a freshness bound (task board via `BIZ-workbench-005`, proposals via SC6 only); "兼容性含完整回流链路,非仅静态读取" is a derived completeness assertion presented as fact. |
| Inferred claims have rule support + `source: inferred` | 22/50 | Zero `source: inferred` annotations and zero `required_outcomes` citations in the document, while inferred composite claims exist: Step 4b (≤5s across three surfaces incl. stage assets; "非仅静态读取"), Step 3b's carve-out "除用户自有改动外" (SC9 states "零新增过程文档" without the user-changes exclusion). The pipeline's convention (sibling journeys carry `<!-- source: inferred: ... -->` and `<!-- surface-web required_outcomes 映射: ... -->`) is entirely unused here. |
| No unclassified (hallucinated) claims | 32/40 | No claim is contradicted by or fabricated against the source corpus — the strongest QA compliment available: every behavioral assertion maps to PRD/proposal/business-rule text. −8: the Setup's implicit registrability claim ("新 forge 项目代码仓...无过程文档" → Step 2 注册成功) glosses over `BIZ-workbench-003`'s detection chain without stating which side of ERR_FORGE_NOT_DETECTED the fixture sits on — an unverified setup fact presented as sufficient. |

### Dimension 5: Surface Fitness — 62/150 (threshold 90, **FAIL**)

| Criterion | Score | Justification |
|---|---|---|
| Mandatory derived Outcomes present | **0/60** | `surface-web.md` mandates `validation-error` + `session-expired` "must be considered for every Web Journey". Grep-confirmed: neither string nor any mapped equivalent appears, and no N/A consideration is stated. Rubric instruction: "Score 0 if mandatory Outcomes are completely absent." The omission is substantive, not pedantic: the doc-location step is a form with path semantics — invalid/unreadable path (ERR_EXTERNAL_PATH_UNREADABLE) and path==codeRoot conflict (ERR_DOC_PATH_CONFLICT) are real `validation-error` derivations with M2 rule support; session-expired is arguably N/A for an offline desktop shell, but the journey never says so (a one-line annotation would have constituted consideration, as siblings demonstrate). |
| Test strategy proportions (Web 50/50) | 30/50 | 8 outcomes with moderate contract-level detail (default-value assertion, option retention, authorization guidance, boundary inspection). Depth leans system/file-level (addressing, zero-new-docs, git-status) over web interaction detail: no outcome describes what the doc-location control presents (options, path preview), and no empty-state rendering is addressed even though Step 3's "看板浏览" on a fresh project necessarily hits UF5's "暂无提案" and UF2's asset-empty states. |
| Realistic web execution assumptions | 32/40 | Setup is realistic for Electron e2e (app started; two fixtures: new repo + legacy in-repo registered project); wizard/kanban/panel interactions are browser-automatable; Step 4b's time-bounded expectation (≤5s) shows async awareness. −8: Step 3's assertion set (doc-root addressing, zero-new-docs) and Step 3b's `git status` require out-of-browser file/repo assertions with no UI proxy or harness-assertion channel specified; the population leap (empty project → multi-class assets) makes Step 3's web-observable surface undefined. |

### Dimension 6: Internal Consistency — 122/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Invariants hold in every step | 54/60 | All four invariants hold: Step 1b's explicit in-repo choice is INV1's sanctioned explicit path, not a breach; no step writes process docs into a default-registered project's repo; Steps 4/4b uphold INV4. −6: INV2 ("仓外注册项目:代码仓内零新增过程文档") is asserted in Step 3 whose demonstration vehicle (multi-class asset writes) is never instantiated — the invariant holds in letter while the step meant to prove it is underdetermined. |
| Cross-step references consistent | 33/50 | Clean: "该注册项目" (Step 3) resolves to Step 2's project; edge numbering (1b–4b) anchors to happy steps; Setup's second fixture supports Steps 4/4b; the cross-journey reference "行为见 explicit-sot-migration Step 4b" was verified against that file and matches exactly. −17: (a) Step 3 presumes state no prior step or Setup item produces — the fixture is registered empty in Step 2, yet Step 3 reads/writes tasks/records/stage assets/proposals on it (dangling state dependency); (b) the Setup→Step 2/2b authorization-state gap (Phase 1 item 4) — the setup line does not establish which world the happy path runs in, so Steps 2 and 2b describe two branches of an unconditioned fork. |
| Risk level consistent with content | 35/40 | Medium is correct: multi-step interaction, no irreversible operations (registration removable per `BIZ-workbench-001`; doc-root writes additive), no data-loss path. −5: the workflow does write persistent state outside the user's repo and its core guarantee is a negative-space invariant (zero repo pollution) whose violation is a data-placement defect — Medium holds, but the journey never argues it (the criteria comment is boilerplate). |

### Dimension 7: Workflow Coverage — 112/150 (threshold 90, PASS; veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| Golden Path existence (veto) | 52/60 | Semantic verification performed: Happy Path Steps 1→3 (到达文档位置步骤 → 默认仓外完成注册 → 过程资产读写落于文档根) form a contiguous 3-step sequence matching Story 7 AC1/AC2 and the proposal Key Scenario「新注册默认仓外」word-for-word in intent; steps are domain-level user operations (发起注册/接受默认/浏览与执行读写), not API calls. Veto NOT triggered. −8: Step 4 shifts to a different project/context (compatibility leg = AC3), so the true golden path is Steps 1–3 with Step 4 bundled into the same happy path; −3 of that for the unexplained `golden_path: false` frontmatter vs qualifying content (sibling `task-dispatch-execution-loop` carries `golden_path: true`, suggesting a per-feature designation, but the document never states the flag's semantics). |
| Multi-step coverage depth | 30/50 | Covers registration-state variation (default / explicit in-repo / unauthorized), boundary inspection (3b), external-change perception (4b), cross-project compatibility (4). Shallow on entity lifecycle: no removal/re-registration interplay with the out-of-repo doc root (`BIZ-workbench-001`: 移除注册仅级联清除自有数据 — the out-of-repo doc root's fate is never exercised); no create→update→delete cycle on any process asset; error recovery limited to the authorization leg. |
| Completeness vs PRD scope | 30/40 | Story 7's three ACs all covered (AC1→Steps 1–2, AC2→Step 3, AC3→Step 4); SC9's three clauses all covered (向导默认值断言 / 零新增 / 兼容). −10: In Scope's "文档根管理" beyond the default flip is untested (where the doc root is surfaced or managed post-registration); registration-time boundaries still in force from M2 (duplicate registration ERR_PROJECT_EXISTS; ERR_FORGE_NOT_DETECTED for a repo with no forge data) have no outcome; the default-out-of-repo registration of an *existing* forge project with in-repo process docs (not index.json) is uncovered (see blindspot 1). |

---

## Score Summary

| Dimension | Score | Threshold | Status |
|---|---|---|---|
| 1. Completeness | 150/200 | 120 | PASS |
| 2. Semantic Purity | 180/200 | 120 | PASS |
| 3. Precondition Exclusivity | 116/150 | 90 | PASS |
| 4. Fact Alignment | 100/150 | 90 | PASS |
| 5. Surface Fitness | **62/150** | **90** | **FAIL** |
| 6. Internal Consistency | 122/150 | 90 | PASS |
| 7. Workflow Coverage | 112/150 | 90 | PASS |
| **Total** | **842/1150** | **975** | **FAIL** |

## Deduction Ledger

| Rule | Instances | Applied |
|---|---|---|
| Mandatory outcomes absent → Surface criterion 1 = 0 | 1 (both validation-error and session-expired) | −60 effective (Surface Fitness) |
| Unclassified claim −30 | 0 (all claims map to sources; inferred-without-annotation handled in Fact Alignment B) | — |
| Precondition overlap −20/pair | 0 hard pairs (1b/2b same-wizard-point overlap scored as soft, −5) | — |
| Invariant violation −40 | 0 | — |
| Surface-type violation −25 | 0 (no CLI-style assertions in outcomes) | — |
| Golden Path veto | not triggered | — |

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **Default-out-of-repo registration of an existing forge project with in-repo process docs is a semantic hole.** The journey tests (a) a NEW empty project + default out-of-repo, and (b) an already-REGISTERED in-repo project's compatibility. It never tests an existing-but-unregistered forge project that already has in-repo process docs (features/tasks/proposals md, no index.json) registering while ACCEPTING the default out-of-repo root. Step 2 special-cases only SoT data: "若项目检出 `index.json`,向导插入迁移确认步骤,行为见 explicit-sot-migration Step 4b" — in-repo markdown process docs are never addressed for this path, yet INV3 ("全部过程资产读写按文档根寻址") would imply the app addresses ONLY the fresh out-of-repo root, orphaning or ignoring the in-repo docs. Does the wizard warn? Relocate? Read both? Neither the journey nor a downstream test agent can answer. *Reasoning audit flagged this independently of dimension scoring.*
2. `[blindspot]` **Doc-root lifecycle end never defined or tested.** `BIZ-workbench-001` scopes removal: "移除注册仅级联清除快照/挂接等自有数据,不触碰项目仓内文件与 forge 数据" — written for the M2 world where process docs lived in-repo. For an M3 default-registered project, the process docs live in the app-managed out-of-repo root: is that root "自有数据" (deleted on removal) or "不触碰" (orphaned)? The journey's invariants ("仓外注册项目:代码仓内零新增过程文档" etc.) say nothing about end of life, so a downstream e2e cannot know the expected post-removal state — for the very workflow whose promise is "文档根由工作台统一管理" (Story 7 So-that clause), the management half of the promise is untested.

## Attack List (for reviser)

1. **[Surface Fitness]** Mandatory Web derived Outcomes completely absent — the document contains only Steps 1b/2b/3b/4b under "## Edge Cases"; grep for `validation-error`/`session-expired` returns nothing — add both: a `validation-error` outcome for the doc-location form (invalid/unreadable path → ERR_EXTERNAL_PATH_UNREADABLE; path==codeRoot → ERR_DOC_PATH_CONFLICT, both M2-rule-grounded via `BIZ-workbench-003`) with a `<!-- surface-web required_outcomes 映射: ... -->` comment, and an explicit N/A annotation for `session-expired` (离线桌面壳,无登录会话语义) or a mapped equivalent (sibling `task-dispatch-execution-loop` lines 86/128 show the pattern).
2. **[Completeness]** Step 3 unexecutable from Setup state — "在该注册项目上执行任务/记录/阶段资产/proposals 的读写(看板浏览 + agent 会话产出过程资产)" while the fixture is "无过程文档" — either seed the fixture with initial forge content (sibling `explicit-sot-migration` Setup pattern: "含 ≥10 任务..."), or add intermediate steps/preconditions establishing how the empty project acquires features/tasks/stage assets/proposals before the read/write assertion.
3. **[Precondition Exclusivity]** Authorization state never fixed — Setup "文档根路径授权机制沿用 M2;应用管理路径可写" vs Step 2 "接受默认仓外文档根并完成注册 → 注册成功" vs Step 2b "默认仓外路径尚未经用户授权" — declare the happy-path precondition ("应用管理路径已获授权(登记持久化)") or fold the authorization grant acceptance into Step 2, so the Step 2 / 2b fork is conditioned.
4. **[Fact Alignment]** Inferred composite claims lack `source: inferred` — Step 4b "感知回流照常(≤5s 口径)" (generalized to 阶段资产面板, which has no stated freshness bound; only 任务看板 via BIZ-workbench-005 and proposals via SC6) and "兼容性含完整回流链路,非仅静态读取"; Step 3b "除用户自有改动外零新增过程文档" (SC9 states no such carve-out) — annotate with `source: inferred` + reasoning basis, or narrow the claims to the sourced surfaces.
5. **[Completeness]** Missing registration-time boundaries still in force — duplicate registration (ERR_PROJECT_EXISTS per `BIZ-workbench-002`) and forge-not-detected (ERR_FORGE_NOT_DETECTED per `BIZ-workbench-003`) have no outcomes; also specify in Setup whether the fixture contains `.forge/` (detection must pass via code root when the default doc root is empty) or whether the wizard-init path (归宿表 init 行) is exercised.
6. **[Semantic Purity]** Implementation/meta leakage in outcomes and actions — "indexer/看板/提案板/阶段资产全部按文档根寻址" (internal module + addressing), "代码仓内零新增过程文档(断言)" (verification-method marker inside an Expected Result), "检查代码仓工作区(git status)" (terminal command as the action) — rewrite as user/system observations ("文档资产仅出现在应用管理的文档根下,代码仓工作区无新增未跟踪过程文档") or mark as harness-level assertions.
7. **[Internal Consistency]** Cross-step dangling state — Step 3 reads/writes task/record/stage-asset/proposal classes on "该注册项目" that Step 2 left empty — make the state chain explicit (population step or fixture precondition) so the INV2 demonstration is actually reachable.
8. **[Workflow Coverage]** `golden_path: false` frontmatter vs qualifying 3+ step Happy Path content covering Story 7 — document the flag's per-feature designation semantics or align it, so downstream consumers filtering on the flag do not mis-classify this journey.
9. **[blindspot]** Existing in-repo-docs project + default out-of-repo registration untested — "若项目检出 `index.json`,向导插入迁移确认步骤" special-cases only SoT data — add an edge case defining expected behavior for in-repo markdown process docs under default-out-of-repo registration (warn/relocate/dual-read), or cite the PRD/design decision that scopes this out.
10. **[blindspot]** Out-of-repo doc root's fate on registration removal undefined — `BIZ-workbench-001`'s removal scope ("仅级联清除快照/挂接等自有数据,不触碰项目仓内文件") predates out-of-repo default docs — add an edge case or invariant stating whether removal deletes, retains, or orphans the app-managed doc root.
