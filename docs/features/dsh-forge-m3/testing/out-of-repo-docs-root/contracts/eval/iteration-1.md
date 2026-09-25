# Contract Eval Report — iteration 1

- **Journey**: out-of-repo-docs-root
- **DOC_DIR**: docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/contracts/
- **Files scored**: step-1-wizard-doc-location.md, step-2-complete-external-registration.md, step-3-assets-land-doc-root.md, step-4-in-repo-compat.md
- **Surface**: web (rubric Dimension 5 parameterized by rules/surface-web.md)
- **Handbook**: design/page-map.md exists → Anchor Integrity scored normally
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Result**: **929 / 1100 — FAIL** (target 935; Fixture Specification 0/100 below min threshold 60 — entity-completeness veto triggered)

| # | Dimension | Score | Min | Verdict |
|---|-----------|-------|-----|---------|
| 1 | Completeness | 150/150 | 90 | PASS |
| 2 | Semantic Purity | 183/200 | 120 | PASS |
| 3 | Precondition Exclusivity | 135/150 | 90 | PASS |
| 4 | Fact Alignment | 128/150 | 90 | PASS |
| 5 | Surface Fitness | 95/100 | 60 | PASS |
| 6 | Internal Consistency | 148/150 | 90 | PASS |
| 7 | Anchor Integrity | 90/100 | 60 | PASS |
| 8 | Fixture Specification | 0/100 | 60 | **FAIL (veto)** |
| | **Total** | **929/1100** | 935 | **FAIL** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Coverage chain sound.** All 4 happy-path steps and all 9 journey edge cases map to Contract Outcomes: 1b → `explicit-in-repo`, 1c → `forge-not-detected`, 2b → `authorization-incomplete`, 2c → `path-validation-failed`, 2d → `duplicate-registration`, 2e → step-3 `legacy-in-repo-docs-invisible`, 3b → density-merged into step-3 `success` with an explicit merge note ("journey 3b…与本 Outcome 断言同一性质(仓工作区零应用新增过程文档),按 risk-density 合并规则并档"), 3c → `remove-registration`, 4b → `external-change-backflow`. No journey scenario dropped.
2. **Anchor A — choice-point state overlap.** Step-2 `success` and `authorization-incomplete` both anchor on "授权登记为空" inside the same wizard screen family, and the success flow *traverses* the authorization-confirmation state where `authorization-incomplete` triggers. Outcome selection there is by user action, not by precondition state. Channeled into Dimension 3.
3. **Anchor B — assertion/fixture mismatch (veto-grade).** Step-4 `external-change-backflow` asserts stage-asset/doc-view freshness ("阶段资产/文档视图呈现最新内容") but its fixture_spec seeds only Project/Task/Proposal — no StageAsset (and no FeatureDoc) entity. Step-3 `remove-registration` State references the 挂接 (session-link) cascade but declares no SessionLink entity. These are prerequisite-data gaps, not SUT-produced outputs — the SUT does not create the stage assets that the *external* actor must modify. Channeled into Dimension 8 (veto).
4. **Anchor C — traceability thinness.** Zero FT-### fact_id citations across all four files; boundary outcomes cite BIZ-*/PRD sources (accurate), but all four `success` outcomes carry no source annotation at all despite asserting specific state semantics that FT-036/FT-051/FT-095 back. Channeled into Dimension 4.
5. **Anchor D — implementation vocabulary in State/Side-effect** ("watcher 感知", "索引行集替换", "sync 事件批推", "UNIQUE 约束拒绝", "(docsRoot)"). Channeled into Dimensions 2 and 5.

SC/InScope clustering check: N/A for contract-type documents (no SC/In Scope sections); the analogous full-pair Outcome satisfiability scan found no mutual-exclusion contradictions — error paths within each step are disjoint by trigger, and the cross-journey pointer "(行为见 explicit-sot-migration Step 4b)" resolves to the sibling journey's actual Step 4b ("注册向导内的同一迁移确认"), verified on disk.

---

## Dimension 1 — Completeness: 150/150

- **Four mandatory dimensions per Outcome (0-50): 50.** All 12 Outcomes across 4 files carry non-empty Preconditions, Input, Output, State; every Outcome also carries an explicit Side-effect (including "none") and per-Outcome Invariants where meaningful (e.g. step-1 `explicit-in-repo`: "仓内选项保留;仓内无授权要求"). Verified block-by-block — zero missing dimensions.
- **Journey Invariants section (0-50): 50.** All 4 files contain `## Journey Invariants` with the full 5-entry invariant list replicated verbatim from journey.md.
- **Happy path + surface-mandated derived scenarios (0-50): 50.** Web mandatory derived outcomes are both handled with inline mapping rationale in step-2 `path-validation-failed`: "<!-- surface-web required_outcomes 映射:validation-error → 文档位置步骤仓外路径输入校验失败的阻止 + 成因可辨错误 + 修正后可继续… -->" and "<!-- surface-web required_outcomes 映射:session-expired → 离线桌面壳无登录会话语义(N/A);注册向导为本地流程,无会话过期分支 -->". The validation-error family is additionally covered at the code-root entry (step-1 `forge-not-detected`: blocked + guidance + correctable). Journey Step 2's conditional migration insertion is correctly deferred, not duplicated ("若项目检出 index.json,向导插入迁移确认步骤(行为见 explicit-sot-migration Step 4b)").

## Dimension 2 — Semantic Purity: 183/200

- **Natural language, not code/regex (0-80): 80.** No regex tokens, glob patterns, CSS/XPath selectors, or framework assertion calls anywhere. ERR_* codes appear as domain identifiers (sanctioned by the Fact Alignment dimension), e.g. "成因可辨(ERR_EXTERNAL_PATH_UNREADABLE / ERR_DOC_PATH_CONFLICT)".
- **Preconditions declarative, not procedural (0-60): 58.** Preconditions are state descriptions throughout ("该代码根(规范化路径)已在注册表中"; "仓外注册项目就绪(授权已完成);agent 会话通道可用;代码仓工作区基线已记录"). Deduction: step-2 `path-validation-failed` Preconditions embed the producing action — "用户在文档位置步骤将仓外路径改写为非法值(不存在/不可读的路径,或与代码根相同的路径)" — the state ("表单字段含非法路径") should stand alone, with the rewrite as Input. −2. (Injection mechanics properly live in fixture `state_requirements`, e.g. "测试通道在应用外改写文件" — correct placement.)
- **No implementation coupling (0-60): 45.** Concrete couplings in dimension values: step-4 `external-change-backflow` State "watcher 感知仓内文档根(codeRoot 下 .forge + docs/features);扫描后索引行集替换" (internal watcher component + fs paths + index-row mechanics) and Side-effect "sync 事件批推" (internal push channel); step-2 `duplicate-registration` State "注册表零新增(UNIQUE 约束拒绝)" (DB constraint mechanism — the behavioral fact "不产生第二条注册记录" is already in Output); step-1 `success` State "默认值翻转落点 = 内核管理位置(docsRoot)" (internal identifier); step-3 `success` Side-effect "内核索引随感知/直发更新" (kernel internals); step-2 `authorization-incomplete` State "先于任何 fs 探测被拒" (probe mechanics, albeit faithful to FT-051). System-level outcomes should be stated in user/system terms; internals belong in metadata. −15.

## Dimension 3 — Precondition Exclusivity: 135/150

- **Distinct across Outcomes (0-50): 50.** Step 1 partitions cleanly on forge-data presence (`.forge/` present vs "不含 .forge/ 且文档位置无 forge 数据") plus explicit selection ("用户主动选择仓内选项"). Step 3 partitions on registration state (registered-external / unregistered fixture-3 / registered-with-docs-for-removal). Step 4 partitions on external-modification presence. Deduction is concentrated in Step 2: `success` Preconditions "文档位置步骤默认仓外路径呈现;授权登记为空;…" vs `authorization-incomplete` Preconditions "文档位置步骤的仓外路径授权确认呈现中(授权登记为空)" — the two share the semantically equivalent core state (wizard active, 授权登记为空) and are separated only by substep framing; the success flow necessarily passes *through* the authorization-confirmation state that anchors `authorization-incomplete`. −10.
- **Sufficient to uniquely select (0-50): 45.** The Step-2 pair is disambiguated only by Input (授权确认接受 vs "拒绝或跳过授权确认"), and the genuine distinguishing condition for success ("授权确认完成后提交") is relegated to fixture `state_requirements` rather than Preconditions. Since Inputs are disjoint, no same-input execution ambiguity arises — moderate deduction. −5. All other steps select unambiguously.
- **Error/boundary triggers explicit (0-40): 40.** Every non-happy outcome names its trigger precisely: "目录不含 .forge/ 且文档位置无 forge 数据"; "授权登记为空"; "改写为非法值(不存在/不可读的路径,或与代码根相同的路径)"; "该代码根(规范化路径)已在注册表中"; "未注册、仓内已有过程文档但无 tasks/index.json"; "已注册且文档根含过程文档"; "文档被外部(终端 CLI/编辑器)修改". No orphan error outcomes.

## Dimension 4 — Fact Alignment: 128/150

- **Factual claims traceable or UNKNOWN (0-60): 45.** Substantively accurate — I verified against the Fact Table: default-flip and explicit option (FT-095), `docLocationType` in_repo/external with path NULL/required (FT-036), forge detection rule (FT-038), duplicate UNIQUE → ERR_PROJECT_EXISTS (FT-036), doc-path conflict and authorization-before-fs-probe ordering (FT-037/FT-051), external-doc watch targets (FT-047), direct-push index updates (FT-093), cascade removal semantics (FT-036). But **zero fact_id citations exist in any file** — boundary outcomes cite business-rule IDs (BIZ-workbench-001/002/003, prd-spec) rather than the FT-### fact base, and all four `success` outcomes carry no source annotation at all while asserting specific system behavior (e.g. step-2 Output "注册成功;授权登记持久化(后续读写免再次授权)" — exactly FT-051's content, uncited). −15.
- **Inferred claims have rule support + source: inferred (0-50): 45.** Exemplary on the surface-derived pair (validation-error and session-expired both carry required_outcomes mapping comments) and on the three journey-inherited inferences, each with `source: inferred` plus reasoning basis: step-3 `legacy-in-repo-docs-invisible` ("UF3 Placement「仅检出 index.json 时插入迁移确认」+ 本旅程 INV3…推演"), step-3 `remove-registration` (explicit non-assertion of doc-root fate), step-4 `external-change-backflow` ("≤5s 回流口径仅任务看板(BIZ-workbench-005)与提案看板(SC6/Story 6)有源;阶段资产面板…为推演"). Deduction: step-3 `success` inherits journey 3b's inferred carve-out "代码仓工作区**除用户自有改动外**无任何应用/agent 新增的过程文档" — that exclusion is a PRD-undefined inference in the journey ("PRD 未显式定义此排除项") but enters the contract without any inferred marker (the density merge note covers the merge, not the inference status). −5.
- **No hallucinated unclassified claims (0-40): 38.** Nothing contradicts the Fact Table; the ≤5s claim is properly scoped to task/proposal boards with the stage-asset panel marked as inference. One claim without fact backing: step-1 `forge-not-detected` State "校验链在文档位置步骤之前拦截" — FT-087 confirms a `probeCodeRoot` verb exists, but no fact states the wizard probes *before* the doc-location step (FT-037's chain is registration-time); the claim is journey-inherited ("不进入文档位置步骤") yet cited to BIZ-workbench-003, which does not cover wizard step ordering. Neither UNKNOWN-marked nor fact-cited. −2.

## Dimension 5 — Surface Fitness: 95/100

- **Mandatory derived Outcomes present (0-40): 40.** Both web-mandatory outcomes handled with the mapping comments inline and greppable by rule name (see Dimension 1 quotes) — better than naming-only discipline. validation-error additionally reinforced at step-1. 40/40.
- **Surface-appropriate language (0-35): 30.** Input/Output are proper web-UI language throughout: "用户经项目切换器「添加项目」发起注册", "呈现 forge 数据未检出的错误引导", "免手动刷新", "各看板/面板呈现的内容与产出一致". The journey's dual assertion口径 (browser face vs harness-level) is respected ("浏览器面断言 = 向导/看板/面板呈现…harness 级"). Deduction: State/Side-effect dimensions mix kernel/watcher language beyond either口径 — "watcher 感知仓内文档根…扫描后索引行集替换", "sync 事件批推", "内核索引随感知/直发更新". −5.
- **TUI timeout criterion (0-25): 25.** Non-TUI surface — full marks per rubric.

## Dimension 6 — Internal Consistency: 148/150

- **Invariants hold in every Step Contract (0-60): 60.** The 5 invariants are replicated verbatim ×4 and no Outcome violates them: explicit-in-repo is the sanctioned explicit option (INV1), registration writes zero process docs (INV2, step-2 State "注册过程不向代码仓写入任何过程文档"), doc-root addressing uniform across views (INV3), legacy in-repo untouched by the default flip (INV4), and every error outcome enforces the no-bypass chain (INV5, e.g. "未完成授权不以仓外路径落注册(无绕过通道)"). Verified pairwise — zero violations.
- **Cross-Contract state references consistent (0-50): 48.** Chain verified: step-1 success Output (doc-location step presented, default external) = step-2 success Preconditions verbatim ("文档位置步骤默认仓外路径呈现"); step-2 success (external project registered, authorization persisted) = step-3 Preconditions ("仓外注册项目就绪(授权已完成)"); step-4 and step-3 `legacy-in-repo-docs-invisible` anchor on Setup-declared fixtures (fixture 2 / fixture 3), both materialized in fixture_spec. The inter-journey pointer "(行为见 explicit-sot-migration Step 4b)" resolves — the sibling journey contains Step 4b "注册向导内的同一迁移确认". Step-3 `remove-registration` Output "再次注册同一代码根可行" is consistent with step-2 `duplicate-registration` (removal frees the UNIQUE). Deduction: journey edge 2e (a registration-flow variant) is relocated into step-3's contract without a placement note tying it to its journey step number — traceable only via the "fixture 3 形态" phrase; a step-number-keyed consumer will miss it in step-2. −2.
- **Preconditions achievable from preceding State changes (0-40): 40.** No unreachable preconditions; error outcomes' preconditions (invalid path present, duplicate registration, missing forge data) are all independently constructible.

## Dimension 7 — Anchor Integrity: 90/100

Handbook `design/page-map.md` exists → scored normally. Web anchor field = `page`; contracts additionally carry `route`/`requires_auth`/`layout`, richer than required.

- **Anchor field completeness (0-40): 40.** All 4 contracts carry `anchors.web.page` (+ route). No missing fields.
- **Anchor values match handbook (0-30): 20.** Routes resolve: `workbench/tasks` matches the handbook view key exactly (×2); `workbench/dialog/register-wizard` is a valid instance of the handbook's `workbench/dialog/*` overlay family (RegisterWizard is a handbook-named component). Deductions: (a) step-1 page "注册向导(文档位置步骤)" and step-2 page "注册向导(仓外路径授权确认 → 提交)" carry **no handbook page title at all** — the wizard exists in the handbook only as the section "注册向导(条件步骤)" under page "工作台 · 项目概览(UF3 迁移 + UF4 偏好扩展)", and the page field names a component-step with different qualifiers instead of a page heading (−3 each); (b) step-3 page "工作台 · 任务看板 / 提案看板 / 阶段资产面板" and step-4 page "工作台 · 任务看板 / 阶段资产 / 提案看板(仓内项目)" splice "阶段资产" into the page field, but the handbook defines 「阶段资产」tab (StageAssetsTab) as a *section* of page "工作台 · Feature 看板", not a page — exact-match resolution fails for that segment (−2 each).
- **Handbook internal consistency (0-30): 30.** No conflicting page/route definitions: view keys are disjoint (overview / proposals / features(+ :slug) / tasks / dialog/* / panel/* / session); tab order 概览/提案/Feature/任务 consistent between header and Pages section and matches FT-092; the dialog-family overlay treatment is consistent with Route Guard Configuration ("迁移进度中 close-guard 不可关" ↔ 迁移对话框族 row "进度中 data-close-guard 不可关"); the proposals page's Route Parameters table is explicitly framed as 视图键段, coherent with the no-URL-routing header.

**Missing Anchor Fields** — none.

| File | Field | Issue |
|------|-------|-------|
| (none) | — | — |

**Anchor value notes** (desyncing — fix required):

| File | Field | Contract value | Handbook value | Note |
|------|-------|----------------|----------------|------|
| step-1 | page | 注册向导(文档位置步骤) | 工作台 · 项目概览 + section 注册向导(条件步骤) | no page heading; component-step name; route resolves to dialog family only |
| step-2 | page | 注册向导(仓外路径授权确认 → 提交) | same as above | same defect class |
| step-3 | page | 工作台 · 任务看板 / 提案看板 / 阶段资产面板 | 「阶段资产」tab = section of 工作台 · Feature 看板 | compound value includes a non-page section |
| step-4 | page | 工作台 · 任务看板 / 阶段资产 / 提案看板(仓内项目) | same as above | same defect class |

**Handbook Conflicts** — none found.

## Dimension 8 — Fixture Specification: 0/100 (VETO TRIGGERED)

`fixture_spec` present on all 12 Outcomes → mandatory scoring (no legacy exemption).

**Veto decision.** The entity-completeness criterion scores 0 because a prerequisite entity type referenced in an Outcome's Input and State changes is missing from `fixture_spec.entities`, and — unlike SUT-produced rows (legitimately exempt as outputs, not seeds) — these are entities the test must **pre-seed** for the assertion to be executable:

1. **step-4 `external-change-backflow` — StageAsset (and FeatureDoc) missing.** Input: "用户回看应用内工作台(任务看板/提案看板/**阶段资产面板**)"; Output: "…**阶段资产/文档视图呈现最新内容**"; State: "watcher 感知仓内文档根…扫描后**索引行集替换**" (the stage_asset index per FT-084); state_requirements: "仓内文档被外部修改(测试通道在应用外**改写文件**)" — rewriting implies existing files. The fixture declares only Project, Task, Proposal. Without a pre-existing stage asset (and feature doc) to modify externally, the stage-asset-freshness assertion is infeasible or vacuously passes. This is exactly the "cannot guarantee test data sufficiency" failure the veto exists for. The asymmetry is telling: step-4 `success` **does** declare StageAsset (min_count 1) for the same in-repo project.
2. **step-3 `remove-registration` — SessionLink missing.** State: "级联清除自有数据(快照/**挂接**等)" references the session-link cascade, but no SessionLink entity is declared; verifying the cascade (or FT-035's link rows) requires a seeded link. (Weaker than #1 — Output does not assert link clearing — but the same entity-completeness rule applies.)

Criterion scores (recorded for the reviser; dimension total is 0 per veto):

- **Entity completeness (0-40): 0** — veto cases above.
- **Relationship and constraint coverage (0-35): 25** — `belongs_to` + `parent_entity` declared correctly wherever multi-entity (Task/StageAsset/Proposal → Project; ExecutionRecord → Task, matching the domain model). Deductions: step-2 `duplicate-registration` declares two entities (Project, ForgeProjectCodeRoot) with **no relationship_type** between them (the same-path linkage is only implicit in field constraints, −5); entity vocabulary drifts across outcomes of the same file — step-1 uses `ForgeProjectCodeRoot` in two outcomes but `CodeRootDirectory` in `forge-not-detected` for the same domain concept (−5).
- **Minimum data quantity (0-25): 22** — step-3 `success` correctly mirrors journey 3b's "各 ≥1 笔" with Task/StageAsset/Proposal/ExecutionRecord min_count 1 each; step-4 `success` seeds all three browsed asset types. Deduction: step-4 `external-change-backflow` seeds Task min_count 1 and Proposal min_count 1 — sufficient for one external change each, but the fixture gives no quantity for the stage-asset/doc leg it asserts (moot once StageAsset is added; −3 for the under-specified leg).

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **Harness-level assertion channel is embedded in the Input dimension.** Step-3 `success` Input: "用户在该注册项目上经 agent 会话产出多类过程资产…并在任务看板/提案看板/阶段资产面板浏览;**随后经测试通道检查代码仓工作区(git 状态与未跟踪文件)**" — the trailing clause is not a user action; Input should carry browser-face interactions only. A downstream gen-test-scripts agent must either insert git checks as a user step (wrong) or drop them (silent loss of SC9's core assertion channel). The same pattern appears in `legacy-in-repo-docs-invisible` Output ("文件零改动、零搬迁(**harness 级**)"). Must improve: move harness-channel assertions into a dedicated verification/state_requirements block, keeping Input purely user-facing.
2. `[blindspot]` **Seed-vs-produce ambiguity makes step-3's main test non-deterministic.** The Input narrative requires live agent production ("任务派发 subagent 执行并留执行记录;阶段总结会话生成阶段资产;管线会话产出提案") — model-dependent, long-running, non-deterministic — while the fixture simultaneously pre-declares the same asset types with min_count 1. The contract never states whether assets are pre-seeded (production step skipped/vacuous) or produced live (test unimplementable as a stable E2E). Compare step-4 `success`, which cleanly seeds and browses. Must improve: declare the production channel deterministically (e.g. test-channel seeding with the assertion "产出后落仓外文档根" via harness file checks), or explicitly scope the agent-production leg as a harness-orchestrated fixture step.
3. `[blindspot]` **Step-2's writable-path precondition has no failure outcome.** Preconditions require "应用管理路径可写", but no Outcome covers the not-writable case (error presentation, retry, or guidance). The journey does not define it either, so this is inherited scope — but a Contract set that *states* the precondition without a boundary outcome leaves the default-path registration's most plausible environmental failure untested. Must improve: add an outcome or mark the leg explicitly out of scope with rationale.

---

## Revision Priorities (for reviser)

1. **Dimension 8 (veto, mandatory fix)**: add `StageAsset` (+ the feature-doc entity backing "文档视图") to step-4 `external-change-backflow` fixture_spec with min_count 1; add `SessionLink` to step-3 `remove-registration` (or remove the 挂接 mention from State); add `relationship_type`/`parent_entity` for step-2 `duplicate-registration`'s Project ↔ ForgeProjectCodeRoot pair; unify `CodeRootDirectory` → `ForgeProjectCodeRoot` in step-1.
2. **Dimension 4**: add FT-### fact citations to the four `success` outcomes (FT-095/FT-036/FT-051/FT-047/FT-093) and to `forge-not-detected`'s pre-step interception claim (FT-087 probeCodeRoot, or mark UNKNOWN); carry an `source: inferred` marker onto step-3 `success`'s "除用户自有改动外" carve-out.
3. **Dimension 7**: rewrite page anchors to handbook page titles — wizard outcomes to "工作台 · 项目概览"(注册向导 section) or a handbook-added dialog entry; replace "阶段资产面板" page-segment with "工作台 · Feature 看板"(「阶段资产」tab).
4. **Dimension 2/5**: strip watcher/index/event vocabulary ("watcher 感知", "索引行集替换", "sync 事件批推", "UNIQUE 约束拒绝", "(docsRoot)") from State/Side-effect into system-level language.
5. **Dimension 3**: state the authorization-completed condition in step-2 `success` Preconditions proper (not only fixture state_requirements) to separate it from `authorization-incomplete`.
6. **Blindspots**: relocate harness-check clauses out of Input; resolve step-3 seed-vs-produce ambiguity; decide the writable-path failure leg.
