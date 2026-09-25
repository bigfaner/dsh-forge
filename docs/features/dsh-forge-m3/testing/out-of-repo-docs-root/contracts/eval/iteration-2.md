# Contract Eval Report — iteration 2

- **Journey**: out-of-repo-docs-root
- **DOC_DIR**: docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/contracts/
- **Files scored**: step-1-wizard-doc-location.md, step-2-complete-external-registration.md, step-3-assets-land-doc-root.md, step-4-in-repo-compat.md
- **Surface**: web (rubric Dimension 5 parameterized by rules/surface-web.md)
- **Handbook**: design/page-map.md exists → Anchor Integrity scored normally
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Result**: **1076 / 1100 — PASS** (target 935; every dimension above its min threshold; iteration-1 veto cleared)

| # | Dimension | Score | Min | Verdict |
|---|-----------|-------|-----|---------|
| 1 | Completeness | 150/150 | 90 | PASS |
| 2 | Semantic Purity | 192/200 | 120 | PASS |
| 3 | Precondition Exclusivity | 150/150 | 90 | PASS |
| 4 | Fact Alignment | 148/150 | 90 | PASS |
| 5 | Surface Fitness | 98/100 | 60 | PASS |
| 6 | Internal Consistency | 148/150 | 90 | PASS |
| 7 | Anchor Integrity | 100/100 | 60 | PASS |
| 8 | Fixture Specification | 90/100 | 60 | PASS |
| | **Total** | **1076/1100** | 935 | **PASS** |

## Iteration-1 issue disposition (verification, not credit)

Every revision was re-verified against the page, not credited for effort:

1. **Dim 8 veto (StageAsset/SessionLink)** — fixed and verified: step-4 `external-change-backflow` now declares `Feature` (docKinds 非空) + `StageAsset` (belongs_to Feature, docFilePresent) as external-modification carriers; step-3 `remove-registration` now declares `SessionLink` (status active) + `Snapshot`. Veto condition no longer holds.
2. **Dim 8 relationship gaps** — `same_normalized_path_as` + parent_entity added to step-2 `duplicate-registration`; `CodeRootDirectory` unified to `ForgeProjectCodeRoot` in step-1.
3. **Dim 4 citations** — FT-### citations now on all four `success` outcomes plus boundary outcomes; the wizard-interception-timing claim is now inline-marked UNKNOWN ("向导步骤序的拦截时点无事实表来源:UNKNOWN"); the 3b "除用户自有改动外" carve-out carries `source: inferred`.
4. **Dim 7 anchors** — page values rewritten to exact handbook page titles (verified character-by-character, see Dimension 7).
5. **Dim 2/5 vocabulary** — watcher/index/event internals relocated to `<!-- impl -->` metadata comments; State/Side-effect now system-level.
6. **Dim 3** — authorization-completed state promoted into step-2 `success` Preconditions with explicit mutual-exclusion annotation.
7. **Blindspots 1-3** — harness channels relocated to fixture `state_requirements` (验证通道 blocks); deterministic production channel declared (产出通道 state_requirement + `<!-- production channel -->` note); writable-path leg explicitly declared out-of-scope with rationale.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Coverage chain intact.** All 4 happy-path steps and all 9 journey edge cases still map to Outcomes (1b→`explicit-in-repo`, 1c→`forge-not-detected`, 2b→`authorization-incomplete`, 2c→`path-validation-failed`, 2d→`duplicate-registration`, 2e→step-3 `legacy-in-repo-docs-invisible` with bidirectional placement notes, 3b→density-merged into step-3 `success` with merge note + inferred marker, 3c→`remove-registration`, 4b→`external-change-backflow`). No scenario dropped; the inter-journey pointer "(行为见 explicit-sot-migration Step 4b)" resolves on disk (sibling journey line 122: "Step 4b: 注册向导内的同一迁移确认").
2. **Anchor A (iter-1 choice-point overlap) resolved by state promotion.** Step-2 `success` Preconditions now carry "仓外路径授权确认已完成——授权登记在场(提交时点状态,与 authorization-incomplete 的登记为空互斥)" — the outcome pair is now selectable on registry state alone, not on substep framing.
3. **Anchor B (fixture sufficiency) resolved; residual parent-chain drift found.** The veto entities are seeded, but StageAsset's declared parent flips between outcomes (`Project` in step-3 `success` and step-4 `success` vs `Feature` in step-4 `external-change-backflow`), and `remove-registration`'s SessionLink hangs off Project with no Task despite links being task-keyed (FT-035). Channeled into Dimension 8.
4. **Anchor C — deterministic production channel creates an Input/fixture tension.** Step-3 `success` Input narrates live agent production while its fixture state_requirements substitute a harness write channel ("替代模型依赖的实时 agent 生产"); the reconciliation comment exists, but the Input dimension itself still asserts the substituted narrative. Channeled into Dimension 6 (−2).
5. **Anchor D — "同构形态" is undefined.** The deterministic channel writes files "以 agent 产出同构形态" without specifying the file classes/shapes a fixture writer must produce. Not covered by any rubric criterion (entity/relationship/min_count do not capture write-target shapes) → Phase 3 blindspot.

Outcome-pair satisfiability scan (contract analogue of the SC clustering check): no mutual-exclusion contradictions. Error outcomes within each step partition on disjoint axes (forge-data presence / registry state / path validity / registration presence / external-modification presence); the revised step-2 pair passes bidirectional derivation (registry present ⇒ not authorization-incomplete; registry empty at confirmation ⇒ not success).

---

## Dimension 1 — Completeness: 150/150

- **Four mandatory dimensions per Outcome (0-50): 50.** All 12 Outcomes across 4 files carry non-empty Preconditions, Input, Output, State; every Outcome carries an explicit Side-effect (including "none") and scoped Invariants. Verified block-by-block.
- **Journey Invariants section (0-50): 50.** All 4 files contain `## Journey Invariants` with the full 5-entry list verbatim from journey.md.
- **Happy path + surface-mandated derived scenarios (0-50): 50.** Web mandatory pair handled inline and greppable: step-2 `path-validation-failed` carries "<!-- surface-web required_outcomes 映射:validation-error → 文档位置步骤仓外路径输入校验失败的阻止 + 成因可辨错误 + 修正后可继续… -->" and the session-expired N/A mapping with rationale. The validation-error family is reinforced at step-1 (`forge-not-detected`: blocked + guidance + correctable). Journey Step 2's conditional migration insertion correctly deferred via the sibling-journey pointer.

## Dimension 2 — Semantic Purity: 192/200

- **Natural language, not code/regex (0-80): 80.** No regex tokens, selectors, or framework assertion calls. ERR_* codes appear as domain identifiers; `docLocationType = external` is domain-model field vocabulary (design/FT-036), not code.
- **Preconditions declarative, not procedural (0-60): 60.** Iter-1's procedural case is fixed: `path-validation-failed` Preconditions now read "表单中的仓外路径字段为非法值(不存在/不可读的路径,或与代码根相同的路径)" — pure state; the rewrite action lives in Input/fixture. Step-2 `success`'s temporal arc is explicitly pinned to a point in time ("提交时点状态").
- **No implementation coupling (0-60): 52.** Internals were largely relocated to `<!-- impl -->` comments (correct placement), but residual internal vocabulary remains in dimension values:
  - step-2 `success` State: "项目行落库(docLocationType = external,路径 = 仓外应用管理路径)" — DB-row write mechanics; the behavioral fact is "项目注册完成,文档根 = 仓外应用管理路径". −2
  - step-2 `success` Side-effect: "授权登记持久化(app_state;校验链只读登记,入参无旗标绕过通道)" — `app_state` is the internal state-store identifier; the parenthetical is business-rule language but the store name is an internal. −2
  - step-4 `external-change-backflow` State: "(派生索引随感知重建,内容唯一来源 = 文档根文件)" — derived-index cache mechanics; the file's own convention places this in impl comments (and largely does). −2
  - step-3 `legacy-in-repo-docs-invisible` State: "仓内既有过程文档不被索引(不在文档根下)" — indexing internals (Output already carries the user-facing "不出现在视图"); plus step-3 `success` State's "(文档根三分模型)" misnames BIZ-workbench-001's 项目三分模型. −2

## Dimension 3 — Precondition Exclusivity: 150/150

- **Distinct across Outcomes (0-60): 60.** Step 1 partitions on forge-data presence plus explicit selection; Step 3 on registration state (registered-external / unregistered fixture-3 / registered-with-docs); Step 4 on external-modification presence. The iter-1 overlap is closed: step-2 `success` ("授权登记在场(提交时点状态,与 authorization-incomplete 的登记为空互斥)") vs `authorization-incomplete` ("授权登记为空") are now mutually exclusive on registry state — the exclusivity is even self-annotated.
- **Sufficient to uniquely select (0-50): 50.** Each (Preconditions, Input) pair selects exactly one Outcome: step-2's four outcomes partition on registry state × path validity × registration presence; inputs are additionally disjoint (接受并提交 / 拒绝或跳过 / 改写后提交 / 重复发起). No ambiguous scenario remains.
- **Error/boundary triggers explicit (0-40): 40.** Every non-happy outcome names its trigger: "目录不含 .forge/ 且文档位置无 forge 数据"; "授权确认呈现中(授权登记为空)"; "表单中的仓外路径字段为非法值(不存在/不可读的路径,或与代码根相同的路径)"; "该代码根(规范化路径)已在注册表中"; "未注册、仓内已有过程文档但无 tasks/index.json"; "仓外注册项目已注册且文档根含过程文档"; "文档被外部(终端 CLI/编辑器)修改". No orphan error outcomes.

## Dimension 4 — Fact Alignment: 148/150

- **Factual claims traceable or UNKNOWN (0-60): 58.** All 12 Outcomes now carry source annotations, and I verified each citation against the Fact Table — accurate: FT-095 (wizard default external, in-repo explicit option), FT-036 (in_repo path NULL / external required; UNIQUE → ERR_PROJECT_EXISTS; CASCADE removal), FT-038 (detection rule + missing-probe message), FT-037 (chain order: conflict = pure registry comparison; duplicate = chain-final), FT-051 (authorization record checked before any fs probe; sole persistence channel), FT-084/FT-082/FT-086 (stage-asset files in doc root + rebuildable index; same-collector immediate update; proposal snapshots sync per scan), FT-047 (only registered+authorized roots watched), FT-094 (≤500ms batched push), FT-093 (direct push sqlite-only). The iter-1 unbacked wizard-ordering claim is now inline-marked UNKNOWN. Residual: step-2 `success` State asserts "若项目检出 index.json,向导插入迁移确认步骤(行为见 explicit-sot-migration Step 4b)" — this specific behavior is backed by the design handbook ("检出 index.json 时插入「迁移预检」步骤") and journey text, not by any fact_id, and carries no inferred/UNKNOWN marker on the outcome. −2
- **Inferred claims have rule support + source: inferred (0-50): 50.** The surface-derived pair carries required_outcomes mapping comments; all four journey-inherited inferences carry `source: inferred` with reasoning basis: `legacy-in-repo-docs-invisible` (UF3 Placement + INV3 推演), `remove-registration` doc-root fate (explicit non-assertion), `external-change-backflow` (≤5s sourced only for task/proposal boards; stage panel = 推演), and the newly added 3b carve-out marker ("排除项 PRD 未显式定义…随 3b 并档带入,非事实表断言").
- **No hallucinated unclassified claims (0-40): 40.** Nothing contradicts the Fact Table or the injected business rules; the ≤5s claim is properly scoped ("任务/提案有源口径"); BIZ-workbench-005 citation matches the rule text.

## Dimension 5 — Surface Fitness: 98/100

- **Mandatory derived Outcomes present (0-40): 40.** Both web-mandatory outcomes handled with inline rule-name-keyed mapping comments (validation-error realized as `path-validation-failed`; session-expired N/A with offline-desktop rationale consistent with page-map Auth: none).
- **Surface-appropriate language (0-35): 33.** Input/Output are user-facing web language throughout ("用户经项目切换器「添加项目」发起注册", "免手动刷新", "各看板/面板呈现的内容与产出一致"); the browser-face vs harness-channel split is now cleanly declared in fixture state_requirements ("浏览器面不自证"). Deduction: State values still carry storage/index vocabulary rather than surface state — "项目行落库(docLocationType = external…)", "(派生索引随感知重建…)". −2
- **TUI timeout criterion (0-25): 25.** Non-TUI surface — full marks per rubric.

## Dimension 6 — Internal Consistency: 148/150

- **Invariants hold in every Step Contract (0-60): 60.** The 5 invariants are replicated verbatim ×4 and no Outcome violates them (INV1 step-1 default; INV2 step-2/step-3 zero-write assertions; INV3 doc-root addressing; INV4 step-4 "默认值翻转不回溯"; INV5 every error outcome enforces the no-bypass chain). Verified pairwise.
- **Cross-Contract state references consistent (0-50): 48.** Chain verified: step-1 success Output = step-2 success Preconditions ("承接 Step 1" explicit); step-2 success = step-3 Preconditions ("授权已完成"); the 2e relocation now has bidirectional placement notes (step-2 "<!-- journey placement: 边界 2e…落位于 Step 3 Contract Outcome…按步骤号检索 2e 请经此指路 -->" ↔ step-3 "<!-- journey placement: 本 Outcome 承载 journey 边界 2e…Step 2 Contract 设有指路注释 -->"); step-3 `remove-registration` Output "再次注册同一代码根可行" is consistent with step-2 `duplicate-registration`; fixture 2 anchored in both Setup and step-4. Deduction: step-3 `success` Input asserts live agent production ("用户在该注册项目上经 agent 会话产出多类过程资产(任务派发 subagent 执行并留执行记录;阶段总结会话生成阶段资产;管线会话产出提案)") while its own fixture replaces that leg with a deterministic harness channel ("由测试通道以 agent 产出同构形态写入仓外文档根,替代模型依赖的实时 agent 生产") — the `<!-- production channel -->` comment reconciles them, but the Input dimension as written contradicts the executed channel, leaving a downstream writer to decide which text governs. −2
- **Preconditions achievable from preceding State changes (0-40): 40.** All preconditions constructible (step-2's authorization-completed state is achievable in-test via the wizard flow it describes; error preconditions independently constructible).

## Dimension 7 — Anchor Integrity: 100/100

Handbook `design/page-map.md` exists → scored normally.

- **Anchor field completeness (0-40): 40.** All 4 contracts carry `anchors.web.page` (+ route/requires_auth/layout). No missing fields.
- **Anchor values match handbook (0-30): 30.** Page values now match handbook page headings exactly (verified character-by-character): "工作台 · 项目概览(UF3 迁移 + UF4 偏好扩展)" (step-1/2); "工作台 · 任务看板(UF1 编排扩展) / 工作台 · 提案看板(UF5,新增页) / 工作台 · Feature 看板(UF2 阶段化扩展)" (step-3, permuted order in step-4). The former non-page "阶段资产面板" segment is replaced by the Feature 看板 page with the tab carried in layout ("FeatureDetail(「阶段资产」tab = StageAssetsTab)") — correct page/section separation. Routes resolve to handbook view keys (`workbench/tasks`, `workbench/proposals`, `workbench/features(+ :slug)`); `workbench/dialog/register-wizard` is a valid instance of the `workbench/dialog/*` family with WizardDialog a handbook Shared Component.
- **Handbook internal consistency (0-30): 30.** No conflicting page/route definitions; view keys disjoint; tab order 概览/提案/Feature/任务 consistent (FT-092); dialog-family close-guard treatment consistent with Route Guard Configuration.

**Missing Anchor Fields** — none. **Anchor value mismatches** — none. **Handbook Conflicts** — none.

## Dimension 8 — Fixture Specification: 90/100

`fixture_spec` present on all 12 Outcomes → mandatory scoring. **Veto not triggered**: every entity type named in Preconditions/Input/State is declared (verified per-outcome; the authorization registry appears only as absence/submit-time state produced in-test, correctly not a seed).

- **Entity completeness (0-40): 40.** Declared types (ForgeProjectCodeRoot, Project, Task, StageAsset, Proposal, ExecutionRecord, SessionLink, Snapshot, Feature) all match domain-model entities; step-4 `external-change-backflow` now seeds the full modification-carrier set (Task/Proposal/Feature/StageAsset) its Output asserts.
- **Relationship and constraint coverage (0-35): 25.** `belongs_to` + `parent_entity` correct wherever multi-entity; `same_normalized_path_as` added to `duplicate-registration` (iter-1 fix verified). Two defects:
  - **StageAsset parent drift across outcomes**: step-3 `success` and step-4 `success` declare `StageAsset` → `parent_entity: "Project"` while step-4 `external-change-backflow` declares the same entity → `parent_entity: "Feature"`. FT-084 keys stage_asset by (project_id, feature_slug, stage) — the Feature parent is the correct chain, so two outcomes under-declare, and the cross-outcome drift yields inconsistent fixtures for the same entity type. −5
  - **SessionLink parent skips Task**: step-3 `remove-registration` declares `SessionLink` → `belongs_to Project`, but session links are task-keyed (FT-035: UNIQUE(project_id, task_key, session_id)); no Task entity is declared in that fixture, so the seeded link has no declared parent task. −5
- **Minimum data quantity (0-25): 25.** step-3 `success` mirrors journey 3b's 各 ≥1 笔 (Task/StageAsset/Proposal/ExecutionRecord min_count 1); step-4 `external-change-backflow` seeds one carrier per externally-modified leg matching "各 ≥1 处"; step-4 `success` seeds all three browsed asset types; no under-declared min_count found.

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **The deterministic production channel's "isomorphic shape" is unspecified, leaving the fixture writer to guess file layouts.** Step-3 `success` state_requirements: "多类过程文档(任务/执行记录/阶段资产/proposals)由测试通道以 agent 产出同构形态写入仓外文档根,替代模型依赖的实时 agent 生产" — nothing defines what 同构 means for each entity class (tasks/*.md vs tasks/records/*.md vs stages/<stage>.md vs proposals/<slug>/*.md, frontmatter expectations), and the fixture entities carry no field_constraints describing write targets. A gen-test-scripts agent must invent the layout; if it diverges from the perception collector's expectations, the board-rendering assertion fails for fixture reasons, not SUT reasons. Must improve: enumerate the file class/path convention per entity in the fixture (or cite the collector's layout as the isomorphism definition).
2. `[blindspot]` **The stage-asset/doc-view freshness leg has no wait bound — an unbounded await in a Web E2E.** Step-4 `external-change-backflow` Output: "阶段资产/文档视图呈现最新内容" while the ≤5s budget is explicitly scoped away ("任务与提案变更 ≤5 秒回流…阶段资产/文档视图呈现最新内容"; inferred comment: "阶段资产面板的回流呈现为 M2 DF003 感知机制延续的推演,PRD 未对其单列时效断言"). Task/proposal legs get a 5s assertion window; the stage/doc legs get none, so a test writer will either poll forever or pick an arbitrary timeout that flakes. Must improve: declare an explicit (even if generous, harness-chosen) wait ceiling for the un-sourced legs, or scope them as eventual-consistency checks with a stated budget.

---

## Verdict

**PASS — 1076/1100.** All eight dimensions above threshold; the iteration-1 entity-completeness veto is resolved and verified. Remaining deductions are polish-grade: residual storage/index vocabulary in State values, one uncited design-backed claim, StageAsset/SessionLink parent-chain precision, and the Input-vs-deterministic-channel tension in step-3. The two blindspots (isomorphic-shape spec, unbounded stage-panel wait) are recommended but not blocking.
