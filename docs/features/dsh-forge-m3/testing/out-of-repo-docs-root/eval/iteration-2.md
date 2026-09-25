# Eval Report — Journey: out-of-repo-docs-root (Iteration 2)

- **Rubric**: journey (1150 pts, 7 dimensions, target 975, per-dimension min thresholds)
- **Surface**: web (per `surface-web.md` rule)
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Document**: `docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/journey.md` (revised since iteration 1)
- **Sources verified against**: `prd-user-stories.md` (Story 7), `prd-spec.md` (SC9/G7/阶段资产与文档根数据模型 L215/Security L269/阶段线/Business Flow/归宿表 init 行/DF005), `prd-ui-functions.md` (Secondary Pages 注册向导/UF3 Placement「步骤 ② 后插入;仅检出 index.json 时」/UF2 asset-empty/UF5 empty), `docs/proposals/dsh-forge-m3/proposal.md` (L73 Key Scenario「新注册默认仓外」, 决策日志⑨), business-rules (`BIZ-workbench-001/002/003/005`, `BIZ-task-ops-001` M3 修订), sibling journeys `explicit-sot-migration/journey.md` (Step 4b cross-ref) and `task-dispatch-execution-loop/journey.md` (`golden_path: true` confirmed; required_outcomes mapping convention)
- **Date**: 2026-09-25

## Verdict

**PASS — Total 1058/1150 (target ≥ 975); all dimensions above their min thresholds (lowest: Surface Fitness 134/150 vs 90).**

The revision substantively addressed all ten iteration-1 attacks: Step 2c now carries both mandatory Web derived-outcome mappings (`validation-error` → path-validation failure with per-cause error codes; `session-expired` → reasoned N/A), the authorization fork is conditioned (Setup「起始环境授权登记为空」+ Step 2 in-path「完成仓外路径授权确认」+ 2b refusal), Step 3's asset production is now in-step via agent sessions, Step 3b is quantified, ERR_FORGE_NOT_DETECTED (1c) and ERR_PROJECT_EXISTS (2d) edges exist, the harness-vs-browser assertion split is declared in Setup, `golden_path` semantics are documented, and both iteration-1 blindspots received dedicated steps (2e in-repo-md edge, 3c removal edge). Remaining deductions are second-order: Step 3's bootstrap from empty project is still implicit for features/dispatchable tasks, fixture 2's migration/content state is unspecified, web-observable presentation depth (control rendering, empty states) is thin, and Step 3c asserts re-registration feasibility while leaving the post-re-registration observable state undefined.

---

## Iteration-1 Attack Disposition (verification of revision, no credit for improvement itself)

| # | Iteration-1 attack | Disposition in current document |
|---|---|---|
| 1 | Mandatory Web outcomes absent | **Fixed**: Step 2c + two `<!-- surface-web required_outcomes 映射: ... -->` comments (validation-error mapped with ERR_EXTERNAL_PATH_UNREADABLE / ERR_DOC_PATH_CONFLICT; session-expired N/A with reasoning) |
| 2 | Step 3 unexecutable from empty fixture | **Mostly fixed**: action now produces assets in-step ("经 agent 会话产出多类过程资产…"); residual bootstrap gap for features/dispatchable tasks (see Dim 1B) |
| 3 | Authorization state never fixed | **Fixed**: Setup「起始环境授权登记为空」; Step 2「完成仓外路径授权确认,提交注册」; 2b precondition「(授权登记为空)」 |
| 4 | Inferred claims lack `source: inferred` | **Fixed**: inferred annotations with reasoning basis on Steps 2e, 3b, 3c, 4b |
| 5 | Missing registration boundaries + `.forge/` unspecified | **Fixed**: Step 1c (ERR_FORGE_NOT_DETECTED), Step 2d (ERR_PROJECT_EXISTS); fixture 1 now states「含 .git、代码文件与 `.forge/`,…forge 数据检出经代码根 `.forge/` 通过,BIZ-workbench-003 检出链」 |
| 6 | Implementation/meta leakage | **Largely fixed**: "indexer" removed; Setup「断言口径」declares browser-vs-harness split; residual channel annotations inside Expected Results (small Dim 2 deduction) |
| 7 | Cross-step dangling state (Step 3) | **Mostly fixed**: production moved in-step; residual feature/task bootstrap (Dim 6B) |
| 8 | `golden_path: false` unexplained | **Fixed**: header comment defines per-feature designation semantics and asserts sibling `task-dispatch-execution-loop` is the designated main journey (verified: its frontmatter has `golden_path: true`) |
| 9 | [blindspot] in-repo-md + default out-of-repo | **Fixed**: Step 2e with fixture 3, inferred annotation, explicit minimal-derivation scoping |
| 10 | [blindspot] doc-root fate on removal | **Fixed**: Step 3c asserts removal scope per BIZ-workbench-001 and explicitly suspends assertion on the undecided fate; new blindspot found on the re-registration interaction (Phase 3) |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Problem → Solution: sound.** The journey operationalizes Story 7 / SC9 / proposal Key Scenario「新注册默认仓外」(proposal L73 verified: "注册向导默认过程文档根在代码仓外(应用管理);仓内选项保留;既有仓内项目不受影响"). Steps 1–4 map to AC1/AC2/AC3 respectively; the traceability blockquote is accurate.
2. **Solution → Evidence: strong after revision.** Step 3's population path is now in-step (agent-session production, sourcing "任务写 = agent 域" via BIZ-task-ops-001 M3 修订 — verified); Step 4b's ≤5s claim is now per-surface decomposed with an inferred annotation that matches the actual source landscape (BIZ-workbench-005 task board; SC6/Story 6 proposals; stage assets left to DF003-continuation perception without a stated bound — annotation says exactly this). Residual: Step 3's three production vehicles include "任务派发 subagent 执行" and "阶段总结会话生成阶段资产", both of which presuppose a feature (with tasks / at a stage) that no step, precondition, or Setup line establishes on the empty fixture-1 project — only proposals get an explicit vehicle ("管线会话产出提案"). A downstream agent must infer the feature/task bootstrap.
3. **Evidence → Success Criteria: adequate.** The Setup「断言口径」line cleanly separates browser-facing assertions (wizard/board/panel presentation) from harness-level filesystem assertions, resolving iteration-1's non-observability complaint. Residual: fixture 2 ("既有仓内文档根的已注册项目(fixture 2,兼容性承载)") never states its migration state (index.json present vs migrated) or content inventory — load-bearing for Step 4's "执行 M3 读写" semantics in M3's SQLite-authoritative world (an unmigrated M2 project presents a migration entry, not a plain readable board) and for Step 4b's flow-back observability (≥1 doc per view needed).
4. **Self-contradiction check: clean.** The Step 2 / 2b fork is now conditioned by an explicitly fixed initial state (授权登记为空) and in-path authorization completion. All five declared invariants hold across all 13 steps (2e exercises INV3; 3c does not breach INV2/INV4; 1b is INV1's sanctioned explicit path). No step reintroduces what the journey eliminates. SC/InScope clustering not applicable (journey-type document); invariant-vs-step full scan found zero breaches.
5. **New-content fact spot-checks all pass**: ERR_EXTERNAL_PATH_UNREADABLE / ERR_DOC_PATH_CONFLICT / ERR_FORGE_NOT_DETECTED / ERR_PROJECT_EXISTS semantics match BIZ-workbench-003/002 verbatim intent; "仅检出 index.json 时插入迁移确认" matches UF3 Placement; "授权登记持久化" matches BIZ-workbench-001; "移除注册仅级联清除…自有数据,不触碰项目仓内文件与 forge 数据" matches BIZ-workbench-001; doc-root addressing matches prd-spec L215.

---

## Phase 2 — Rubric Scoring

### Dimension 1: Completeness — 184/200 (threshold 120, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Metadata complete | 50/50 | `journey: "out-of-repo-docs-root"` kebab-case ✓; `risk_level: "Medium"` valid and fits the documented criteria (multi-step interaction; registration removable, doc-root writes additive — no irreversible operation); sources (3 PRD files), `generated`, `surface_types/keys` present; `golden_path: false` now carries documented semantics with a verified factual claim (sibling `task-dispatch-execution-loop` frontmatter confirmed `golden_path: true`). |
| Steps complete (name/action/outcome) | 70/80 | All 13 steps (4 happy + 9 edge) have User Action + Expected Result; every edge step carries a Precondition; numbering (1, 1b, 1c, 2, 2b–2e, 3, 3b, 3c, 4, 4b) yields a coherent anchored order. −10: (a) −6 Step 3's compound production chain leaves the feature/task bootstrap implicit — "任务派发 subagent 执行并留执行记录" and "阶段总结会话生成阶段资产" presuppose a feature with dispatchable tasks at a stage, yet no step/Setup line establishes how the empty fixture-1 project (「无过程文档」) acquires one; only proposals have an explicit vehicle ("管线会话产出提案"). A downstream agent must guess the bootstrapping (pipeline skills? dsh tool task add?). (b) −4 fixture 2 is specified only as "既有仓内文档根的已注册项目(fixture 2,兼容性承载)" — neither its SoT-migration state (index.json present vs migrated) nor its content inventory (≥1 task/stage asset/proposal for Steps 4/4b observability) is stated; under M3's SQLite-authoritative task board this determines what "执行 M3 读写" even presents. |
| Happy + required derived outcomes | 64/70 | Happy path covers Story 7's three ACs; edge set now comprehensive: validation-error (2c, with error-code causes), unauthorized path (2b), forge-not-detected (1c), duplicate registration (2d), in-repo-md project under default out-of-repo (2e), long-run zero-pollution boundary quantified (3b: "各 ≥1 笔"), removal + re-registration (3c), external flow-back (4b), explicit in-repo choice (1b). −6: web-facing boundary presentations untested — no outcome covers the fresh project's board empty states (UF5 "「暂无提案」+ 路径说明", UF2 "asset-empty") which Step 3's browsing leg necessarily traverses before assets exist, nor any loading-state consideration (surface-web "additional common" list). |

### Dimension 2: Semantic Purity — 186/200 (threshold 120, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Natural-language outcomes | 74/80 | No regex, selectors, XPath, or framework assertion calls anywhere; outcomes describe what the user/system observes ("注册被阻止并按成因呈现可辨错误", "各看板/面板呈现的内容与产出一致"). −6: verification-channel meta still embedded inside Expected Results — "代码仓工作区无应用新增的过程文档(harness 级:测试通道检查仓工作区)" (Step 3), "文件零改动、零搬迁(harness 级)" (2e), "全部过程资产仅存在于仓外文档根" relies on the same channel. The Setup「断言口径」convention legitimizes the channel, but the inline parentheticals remain method-language inside outcome statements rather than a separate assertion block. |
| Declarative preconditions | 56/60 | Twelve of thirteen preconditions are declarative states ("该代码根(规范化路径)已在注册表中", "仓外注册项目已完成 Step 3 的多类过程资产产出与读写(…各 ≥1 笔)", "文档位置步骤的仓外路径授权确认呈现中(授权登记为空)"). −4: Step 2c's precondition narrates a user action instead of a state — "用户在文档位置步骤将仓外路径改写为非法值(不存在/不可读的路径,或与代码根相同的路径)" should be "文档位置步骤的仓外路径为非法值(…)". |
| No implementation coupling in steps | 56/60 | Steps are user/system-level (选择/提交/浏览/移除/检查); "tasks/index.json" and ".forge/" are domain-level forge terminology the PRD itself uses (tolerated). −4: Step 3b's User Action embeds terminal mechanics as the action — "检查代码仓工作区是否保持干净(经测试通道检查 git 状态与未跟踪文件,harness 级)" — the intent (verify repo cleanliness) is present but the command-level channel is the action's core; the Setup convention would let this live outside the action. |

### Dimension 3: Precondition Exclusivity — 142/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Preconditions distinct across outcomes | 56/60 | Every edge outcome anchors to a distinct trigger: 1c (no `.forge/` + no doc-location forge data), 2b (authorization confirmation pending, registry empty), 2c (path value invalid, causes enumerated), 2d (normalized code root already registered), 2e (fixture-3 shape), 3b (Step 3 completed, ≥1 per class), 3c (registered + populated doc root), 4b (fixture-2 docs externally modified). −4: 1b's precondition ("文档位置步骤呈现中") is the bare wizard-point state shared with 2b/2c's location — its distinguishing dimension (explicit in-repo selection bypassing the authorization chain, which its Expected Result does state: "不经仓外授权链") is not carried in the precondition itself. |
| Preconditions sufficient to uniquely select | 48/50 | The iteration-1 ambiguity is resolved: Setup fixes「起始环境授权登记为空」, Step 2's action includes「完成仓外路径授权确认」, 2b is「拒绝或跳过授权确认」, 2c is invalid-path — the fork at the doc-location step is fully conditioned. 1c fires at code-root selection ("不进入文档位置步骤"), disjoint from 2b/2c/1b. −2: Step 2e runs after Step 2's grant on the same app-managed default path, but the authorization registry's scope (per-path global vs per-project) is nowhere fixed — a downstream agent cannot determine whether 2e's registration re-presents an authorization confirmation; its Expected Result ("注册成功且文档根 = 仓外") holds either way but the interactable flow differs. |
| No missing preconditions for error/boundary outcomes | 38/40 | All nine boundary outcomes state their trigger, and 3b is now quantified ("任务/执行记录/阶段资产/proposals 各 ≥1 笔"). −2: 1c does not state where the user is in the wizard when the check fires (its Expected Result's "不进入文档位置步骤" implies code-root selection, but the precondition does not anchor the step position). |

### Dimension 4: Fact Alignment — 140/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Factual claims traceable | 56/60 | Every load-bearing behavioral claim verified against sources: default flip (Story 7 AC1); zero repo pollution (SC9/AC2); doc-root addressing (prd-spec L215 "indexer/看板/提案板/阶段资产全部按文档根寻址"); authorization persistence + no-bypass (prd-spec Security "文档根路径授权沿用 M2" + BIZ-workbench-001 "校验链只读登记,无入参旗标绕过通道"); wizard migration insertion gating (UF3 "仅检出 index.json 时"); detection chain (BIZ-workbench-003, cited in Setup for fixture 1); duplicate registration (BIZ-workbench-002 UNIQUE → ERR_PROJECT_EXISTS); removal scope (BIZ-workbench-001); stage assets to doc root (prd-spec 阶段线); agent-domain writes (BIZ-task-ops-001 M3 修订); ≤5s bounds (BIZ-workbench-005 task board; SC6/Story 6 proposals). Per-step `source:` comments on 8 of 13 steps; cross-journey reference "行为见 explicit-sot-migration Step 4b" verified to exist and match; `golden_path` comment's designation claim verified against sibling frontmatter. −4: Setup's fixture-2 line ("兼容性承载") implicitly claims an M2 in-repo project's M3 read/write works as-is without stating its migration state — an unverified setup sufficiency presented as given (an unmigrated project surfaces the UF3 migration entry, changing Step 4's observable). |
| Inferred claims have rule support + `source: inferred` | 46/50 | Four inferred annotations with explicit reasoning basis, each checked: 2e (UF3 Placement + INV3 derivation, honest scoping "本步骤仅断言最小推演、不定界警告行为"); 3b (SC9 user-changes carve-out, PRD-silence noted); 3c (PRD-未定界 non-assertion); 4b (per-surface ≤5s source decomposition — accurate against BIZ-workbench-005/SC6/DF005). −4: two light inferences remain unannotated — 3c's "再次注册同一代码根可行" (derivable from UNIQUE-after-removal but not traced) and happy Steps 1/2/4 carry no per-step anchoring, relying on the Overview blockquote to cover four bundled claims in Step 2's Expected Result. |
| No hallucinated claims | 38/40 | Zero claims contradicted by or fabricated against the corpus — both new error-code mappings (ERR_EXTERNAL_PATH_UNREADABLE for unreadable out-of-repo path; ERR_DOC_PATH_CONFLICT for path == codeRoot) match BIZ-workbench-003's semantics; the session-expired N/A reasoning ("离线桌面壳无登录会话语义") is consistent with the offline-desktop reality (BIZ-privacy-001 zero-network baseline). −2: Setup's "forge 数据检出经代码根 `.forge/` 通过" asserts the detection outcome for fixture 1 as a settled fact of the M3 chain — reasonable per BIZ-workbench-003, but the M3 default-flip interaction (detection via an empty default doc root) is an applied reading of an M2-era rule presented without an inference marker. |

### Dimension 5: Surface Fitness — 134/150 (threshold 90, **PASS** — was 62/150 FAIL at iteration 1)

| Criterion | Score | Justification |
|---|---|---|
| Mandatory derived Outcomes present | 56/60 | Both surface-web mandatory outcomes are now considered with the pipeline's mapping convention: Step 2c carries `<!-- surface-web required_outcomes 映射:validation-error → 文档位置步骤仓外路径输入校验失败的阻止 + 成因可辨错误 + 修正后可继续(不可读路径 → ERR_EXTERNAL_PATH_UNREADABLE;路径与代码根相同 → ERR_DOC_PATH_CONFLICT;BIZ-workbench-003 注册校验链沿用) -->` and a second mapping comment reasoning session-expired to N/A ("离线桌面壳无登录会话语义(N/A);注册向导为本地流程,无会话过期分支"). The outcome satisfies the rule's assert pattern: block ("注册被阻止"), cause-distinguishable error, correct-and-retry ("修正为合法仓外路径或回退默认应用管理路径后可继续完成注册"). −4: the rule's field-proximity expectation ("error message displayed near the relevant field") is not asserted — "按成因呈现可辨错误" does not locate the error presentation relative to the path input. |
| Test strategy proportions (Web 50/50) | 42/50 | Contract-level depth: default-value assertion (Step 1), option retention (1b), two-cause validation (2c), duplicate detection (2d), detection error (1c), authorization gating (2b). Journey-level depth: register → produce → browse → compat with timing assertions (4b ≤5s) and lifecycle (3c). Balance now credible. −8: web-observable presentation detail remains thin — no outcome describes what the doc-location control actually presents (options, path preview, the default value's visible form), and the fresh project's empty-state renderings (UF5 "「暂无提案」+ 路径说明"; UF2 "asset-empty | 无阶段资产占位说明") that Step 3's browsing necessarily encounters before production are never asserted, despite being defined in the UI spec. |
| Realistic execution assumptions | 36/40 | The Setup「断言口径」line ("浏览器面断言 = 向导/看板/面板呈现;代码仓工作区与文档根目录内容断言 = harness 级(测试通道直读文件系统,浏览器面不自证)") is exactly the right execution model for an Electron web e2e with filesystem guarantees — every out-of-browser assertion in the document is labeled to its channel; async handling is realistic (≤5s expectations, no fixed timeouts implied); fixtures 1 and 3 are registrability-complete. −4: Step 3's production chain (dispatch subagent execution, stage-summary session, pipeline session) is realistic under the M3 model but the journey gives no hint how a web e2e drives agent-session production (via the session interface? seeded subagent runs?), and fixture 2's unspecified state leaves Step 4's execution surface undetermined. |

### Dimension 6: Internal Consistency — 140/150 (threshold 90, PASS)

| Criterion | Score | Justification |
|---|---|---|
| Invariants hold in every step | 58/60 | All five invariants hold across all 13 steps: 1b is INV1's sanctioned explicit path ("仓内仅为显式选项"); 2e demonstrates INV3 (views address the out-of-repo root, in-repo docs invisible); Steps 2/3/3b uphold INV2; Steps 4/4b uphold INV4; INV5's four blocking conditions map 1:1 to steps 1c/2d/2c/2b ("注册期校验链沿用 M2:forge 数据未检出、重复注册、仓外路径非法或未授权均阻止落注册"). −2: INV2/INV3's demonstration vehicle (Step 3) still depends on the unshown feature/task bootstrap — the invariants hold in letter, and the step proving them is now executable in outline but not end-to-end determined. |
| Cross-step references consistent | 42/50 | Clean: "该注册项目" (Step 3) resolves to Step 2's project; 3b's "已完成 Step 3 的多类过程资产产出与读写" is quantified and resolvable; 3c operates on the Step 2 project; 2e/4 use named fixtures; the cross-journey reference "行为见 explicit-sot-migration Step 4b" verified exact. −8: (a) Step 2 leaves an empty project ("无过程文档" fixture) and Step 3 produces tasks/stage assets whose prerequisites (feature with dispatchable task, feature at a stage) no prior state establishes — the state chain is now in-step but its opening link is missing; (b) fixture 2's migration/content state is unspecified, so Steps 4/4b run on an underdetermined state. |
| Risk level consistent with content | 40/40 | Medium is exactly right and matches the document's own criteria comment: multi-step wizard + persistent writes, yet no irreversible operation — registration is removable (3c asserts re-registration viability), doc-root writes are additive, and removal touches only app-owned data (BIZ-workbench-001). No security/data-loss path exists in any step. |

### Dimension 7: Workflow Coverage — 132/150 (threshold 90, PASS; veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| Golden Path existence (veto) | 56/60 | Semantic verification performed: Steps 1→2→3 form a contiguous domain-level user sequence (发起注册到文档位置步骤 → 接受默认仓外并完成授权注册 → 产出多类过程资产并在看板浏览) matching Story 7 AC1/AC2 and the proposal Key Scenario「新注册默认仓外」verbatim in intent; no bare API/HTTP-level steps. Veto NOT triggered. −4: Step 4 switches fixtures and projects (compatibility leg = AC3) while sitting inside the same "Happy Path" section — the contiguous primary-story run is 1–3, with 4 a separate leg on fixture 2; the document does not mark the boundary. (The `golden_path: false` flag is no longer an issue — its per-feature designation semantics are documented and factually verified.) |
| Multi-step coverage depth | 44/50 | Deep: registration-entity lifecycle create → use → remove → re-register (2 → 3 → 3c); validation state machine across four distinct rejection causes (1c/2b/2c/2d) with recovery paths (2c correct-and-retry, 2b complete-then-proceed); multi-entity interaction (project × tasks × records × stage assets × proposals, each ≥1 in 3b); external-perception leg (4b); legacy-state coexistence (2e). −6: no process-asset lifecycle operation beyond creation is exercised in-journey (task create→update→delete belongs to siblings — acceptable division, but stage-asset or proposal update/delete under the out-of-repo root is untouched), and the authorization lifecycle after the initial grant (revocation, re-authorization, per-project vs per-path scope) is never exercised despite "后续读写免再次授权" making it load-bearing. |
| Workflow completeness against PRD scope | 32/40 | Story 7's three ACs covered (AC1→Steps 1–2/1b; AC2→Steps 3/3b/2e; AC3→Steps 4/4b); SC9's three clauses covered (向导默认值断言 / 零新增 / 兼容); proposal risk-mitigation line ("看板/提案板成为过程资产主视图") exercised via Step 3's browsing. −8: In Scope's "文档根管理" beyond the registration-time flip remains uncovered — where the doc root is surfaced post-registration (project card/settings), whether it can be inspected or changed, and how authorization state is managed/revoked are untested; this was flagged at iteration 1 and is the one primary-workflow gap the revision did not touch. |

---

## Score Summary

| Dimension | Score | Threshold | Status |
|---|---|---|---|
| 1. Completeness | 184/200 | 120 | PASS |
| 2. Semantic Purity | 186/200 | 120 | PASS |
| 3. Precondition Exclusivity | 142/150 | 90 | PASS |
| 4. Fact Alignment | 140/150 | 90 | PASS |
| 5. Surface Fitness | 134/150 | 90 | **PASS** (was 62/150 FAIL) |
| 6. Internal Consistency | 140/150 | 90 | PASS |
| 7. Workflow Coverage | 132/150 | 90 | PASS |
| **Total** | **1058/1150** | **975** | **PASS** |

## Deduction Ledger

| Rule | Instances | Applied |
|---|---|---|
| Mandatory outcomes absent → Surface criterion 1 = 0 | 0 (both present/mapped in Step 2c) | — |
| Hallucinated unclassified claim −30 | 0 | — |
| Precondition overlap −20/pair | 0 hard pairs (1b's shared wizard-point state scored as soft, −4) | — |
| Invariant violation −40 | 0 | — |
| Surface-type violation −25 | 0 | — |
| Golden Path veto | not triggered | — |
| Golden Path API-level step −15/step | 0 (all steps domain-level) | — |

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **Step 3c asserts re-registration feasibility while jointly suspending the doc-root fate — leaving the post-re-registration observable state undefined.** Quote: "再次注册同一代码根可行;仓外文档根内容的清除/保留归宿不作断言(PRD 未定界)". The non-assertion is honest for the removal moment, but the step then invites the test agent to actually re-register (the assertion is "可行"). At that instant the app-managed default path may still contain the removed project's process docs: does the re-registered project's task/proposal board then show the old out-of-repo assets (adopting the surviving root) or start empty? Either answer is defensible; the journey defines neither, and no dimension covers "an asserted action whose aftermath is observably undefined" — a downstream e2e author must invent expected state for a step the document itself told them to execute. Resolution: either scope the assertion to "re-registration is accepted (registration completes)" without executing it, or add one sentence defining the expected board state after re-registration (or explicitly marking it 未定界 like the removal-fate clause).

2. `[blindspot]` **The authorization-registry scope (per-path vs per-project) is an execution ambiguity no dimension scores directly.** Quote: Setup "起始环境授权登记为空,应用管理路径可写" + Step 2 "授权登记持久化(后续读写免再次授权)" + Step 2e "走注册向导,保持默认仓外文档根完成注册". BIZ-workbench-001 says only "授权登记持久化于自有状态" — scope unstated. Steps 2 and 2e both register projects onto the same default app-managed path in one session: whether 2e re-presents the authorization confirmation (per-project grant) or silently reuses Step 2's grant (per-path grant) changes what the test agent must drive and assert in 2e, yet 2e's Expected Result is silent on any authorization interaction. Scored where it fits (Precondition Exclusivity −2, Completeness −partial), raised here because the QA failure pattern — "a step whose interactable flow cannot be determined by the downstream agent" — spans Setup/step boundaries rather than any single criterion. Resolution: one Setup or 2e sentence fixing the scope ("授权登记按路径全局,fixture 1 授权后 fixture 3 注册不再呈现授权确认" or the per-project alternative).

---

## Attack List (for reviser, should an iteration 3 be run)

1. **[Completeness]** Step 3 feature/task bootstrap implicit — "任务派发 subagent 执行并留执行记录;阶段总结会话生成阶段资产" presupposes a feature with dispatchable tasks at a stage on the empty fixture-1 project ("无过程文档") — add the bootstrap (one clause naming the production vehicle, e.g., "管线会话依次产出提案与 feature 任务集" or a fixture/precondition seeding a feature), so steps 3/3b are executable end-to-end without inference.
2. **[Completeness]** Fixture 2 under-specified — "备一个既有仓内文档根的已注册项目(fixture 2,兼容性承载)" — state its SoT-migration state (index.json present vs migrated) and minimum content (≥1 task / stage asset / proposal) so Steps 4/4b have a determined, observable surface.
3. **[Surface Fitness]** Web presentation depth thin — "各看板/面板呈现的内容与产出一致" — add assertions for the doc-location control's visible presentation (default value form, options) and the fresh project's empty-state renderings (UF5 "「暂无提案」", UF2 asset-empty), which the UI spec defines and Step 3's browsing necessarily traverses.
4. **[Semantic Purity]** Step 2c precondition is procedural — "用户在文档位置步骤将仓外路径改写为非法值(不存在/不可读的路径,或与代码根相同的路径)" — restate as a state ("文档位置步骤的仓外路径为非法值(…)") so all preconditions are declarative.
5. **[Workflow Coverage]** Post-registration "文档根管理" and authorization lifecycle uncovered — "授权登记持久化(后续读写免再次授权)" — add an edge or clause covering where the doc root is surfaced post-registration and what happens on authorization revocation/re-prompt, closing the one In Scope phrase no step touches.
6. **[blindspot]** Re-registration aftermath undefined — "再次注册同一代码根可行;仓外文档根内容的清除/保留归宿不作断言(PRD 未定界)" — define or explicitly suspend the post-re-registration board state (old out-of-repo assets visible vs empty), since the step asserts the re-registration action itself.
7. **[blindspot]** Authorization-registry scope ambiguity across fixtures — "起始环境授权登记为空" + Step 2e "保持默认仓外文档根完成注册" — fix per-path vs per-project grant scope in one sentence so 2e's interactable flow (authorization confirmation re-presented or not) is determined.
