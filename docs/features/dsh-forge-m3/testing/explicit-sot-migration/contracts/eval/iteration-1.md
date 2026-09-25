# Contract Eval Report — iteration 1

- **Journey**: explicit-sot-migration
- **DOC_DIR**: docs/features/dsh-forge-m3/testing/explicit-sot-migration/contracts/
- **Files scored**: step-1-migration-entry-discovery.md, step-2-migration-confirm.md, step-3-atomic-migration-execution.md, step-4-post-migration-terminal-state.md
- **Surface**: web (rubric Dimension 5 parameterized by rules/surface-web.md)
- **Handbook**: design/page-map.md exists → Anchor Integrity scored normally
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Result**: **971 / 1100 — PASS** (target 935; every dimension ≥ min threshold)

| # | Dimension | Score | Min | Verdict |
|---|-----------|-------|-----|---------|
| 1 | Completeness | 150/150 | 90 | PASS |
| 2 | Semantic Purity | 173/200 | 120 | PASS |
| 3 | Precondition Exclusivity | 135/150 | 90 | PASS |
| 4 | Fact Alignment | 120/150 | 90 | PASS |
| 5 | Surface Fitness | 93/100 | 60 | PASS |
| 6 | Internal Consistency | 135/150 | 90 | PASS |
| 7 | Anchor Integrity | 96/100 | 60 | PASS |
| 8 | Fixture Specification | 69/100 | 60 | PASS |
| | **Total** | **971/1100** | 935 | **PASS** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Coverage chain sound.** All 4 happy-path steps and all 7 journey edge cases (2b/2c/3b/3c/3d/4b/4c) map to Contract Outcomes; Step 3b is correctly decomposed into `interrupted-pre-commit-rollback` + `interrupted-post-commit-success` with an explicit mutual-exclusion note ("外部写入冲突所致失败不属本分支,二者成因互斥"). No journey scenario dropped.
2. **Anchor A — guard reachability tension.** Step-1 `not-migratable-hidden` states migrated projects render no entry ("已迁移项目呈现已迁移 success Pill"), while Step-2 `already-migrated-guard` Input is "用户尝试再次发起迁移" — the already-migrated leg of that guard has no reachable web input. Channeled into Dimension 6.
3. **Anchor B — post-commit injection feasibility.** The pre-commit interrupt outcome declares a deterministic injection point ("测试通道在摄入/归档相位注入中断"); the post-commit outcome ("COMMIT 完成)后、终态呈现前应用被杀/崩溃") declares none. Channeled into blindspot.
4. **Anchor C — traceability thinness.** Kernel-behavior assertions across Step 3/4 match FT-061/063/064/065 verbatim in substance, but the only explicit fact citation in all four files is FT-062 (Step-2 guard). Channeled into Dimension 4.

SC/InScope clustering check: N/A for contract-type documents (no SC/In Scope sections); the analogous full-pair Outcome satisfiability scan found no mutual-exclusion contradictions beyond Anchor A (which is a reachability gap, not a logical contradiction).

---

## Dimension 1 — Completeness: 150/150

- **Four mandatory dimensions per Outcome (0-50): 50.** All 14 Outcomes across 4 files carry non-empty Preconditions, Input, Output, State; every Outcome also carries an explicit Side-effect (including "none"); Invariants supplied where meaningful (e.g. Step-1 `not-migratable-hidden`: "迁移入口的存在性 = index.json 检出状态(一次性语义:已迁移不再呈现)"). Verified block-by-block — zero missing dimensions.
- **Journey Invariants section (0-50): 50.** All 4 files contain `## Journey Invariants` with the full 5-entry invariant list replicated verbatim from the journey.
- **Happy path + surface-mandated derived scenarios (0-50): 50.** Web mandatory derived outcomes are present as documented analogues with explicit mapping rationale: validation-error → `corrupt-source-validation` ("surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面,映射为迁移校验阶段源数据校验失败…"); session-expired → `kernel-unavailable` ("离线桌面壳无登录会话语义(N/A);类比承载 = 数据内核通道不可用 → failed-rolled-back 呈现…"). `concurrent-edit` is additionally covered via `external-write-conflict`.

## Dimension 2 — Semantic Purity: 173/200

- **Natural language, not code/regex (0-80): 72.** No regex tokens, CSS/XPath selectors, or framework assertion calls anywhere. Minor deductions: glob/path-pattern tokens inside dimension values — Step-4 State "tasks/*.md 与 tasks/records/*.md 原样留存原位置" and Step-3 Side-effect "备份工件落 <userData>/workbench/backups/<projectId>-<时间戳>/(库文件 + 文档树 tasks/ 拷贝…)". These are borderline (they name real user-relevant artifacts, per the journey's harness-level assertion口径) but pattern tokens belong in test scripts, not dimension semantics. −8.
- **Preconditions declarative, not procedural (0-60): 56.** Preconditions are state descriptions throughout ("迁移确认对话框呈现(自概览页迁移入口发起);数据内核可用…"). Deduction: several preconditions embed the fixture-injection mechanism — Step-2 `kernel-unavailable`: "发起迁移时数据内核不可用(库文件打开失败/损坏,经测试通道注入)"; Step-3 `external-write-conflict`: "注入机制为 harness 级确定性命中:于摄入完成后、提交前经测试通道对 tasks/index.json 注入一次外部写" — "经测试通道注入" is setup instruction, not the state itself; the state ("内核不可用" / "index.json 被外部改写") should stand alone with mechanics in fixture_spec. −4.
- **No implementation coupling (0-60): 45.** Concrete couplings in dimension values: Step-1 State "纯读取面(getMigrationStatus:authority=files/deviated/migratedAt/lastEvent)" (IPC verb + DTO field list); Step-2 Preconditions "项目无在跑编排(dispatch.ended_at 为空的行数为 0)" (DB column); Step-3 State "projects.data_authority 置 sqlite(与全量摄入同事务)" (schema column); Step-3 `interrupted-pre-commit` State "失败相 + rollback 审计行于事务外补记". Transaction semantics are arguably system-level behavior for an atomicity contract, but IPC verb names, DTO shapes and schema columns are implementation detail. −15.

## Dimension 3 — Precondition Exclusivity: 135/150

- **Distinct across Outcomes (0-60): 50.** Step 1: clean partition on index.json presence. Step 3: exemplary — pre/post-commit split ("中断时点在事务提交之前" vs "事务已提交(COMMIT 完成)后") plus explicit成因互斥 notes; `corrupt-source-validation` (validation phase, pre-ingest) vs `external-write-conflict` (post-ingest window) disjoint. Deductions: two strict-subset pairs. Step-2 `cancel-confirm` Preconditions ("迁移确认对话框呈现中(尚未确认)") ⊂ `success` Preconditions ("迁移确认对话框呈现…;数据内核可用;项目无在跑编排"); Step-4 `migration-events-reviewable` Preconditions ("迁移已完成(或已失败回滚)") ⊃ `success` Preconditions ("迁移已完成(data_authority=sqlite)"). Precondition sets alone do not separate these pairs. −10.
- **Sufficient to uniquely select (0-50): 45.** The two subset pairs are only disambiguated by Input (点击确认 vs 点击取消; 察看看板 vs 回查日志). Since Inputs are disjoint, no same-input ambiguity arises in execution — hence moderate, not severe, deduction — but the rubric's standard is selection via Preconditions + state. −5.
- **Error/boundary triggers explicit (0-40): 40.** Every non-happy outcome names its trigger condition precisely: kernel unavailable ("库文件打开失败/损坏"), guard triple ("已迁移(data_authority 为 sqlite)或存在在跑编排(ended_at 为空的派发行)或同项目迁移正在进行中"), interrupt timing windows, injection window ("于摄入完成后、提交前"), corrupt source ("JSON 解析失败/结构缺失,检出发生于校验阶段"). No orphan error outcomes.

## Dimension 4 — Fact Alignment: 120/150

- **Factual claims traceable or UNKNOWN (0-60): 45.** Substantively the claims are accurate — I verified against the Fact Table: Step-3 phase order/transaction matches FT-061 exactly; backup location/content matches FT-063; archive rename matches FT-064; audit phases match FT-065; guard conditions match FT-062; board-load and Pill semantics match FT-086-adjacent read-verb discipline. But the document itself cites exactly one fact_id (Step-2 guard: "Fact Table FT-062(pipeline.ts:257-283)"). All other specific behavioral assertions (phase order, single-transaction commit, rename rollback with backup fallback, post-rollback audit-outside-transaction, index.json.migrated-<ts> naming) are carried without fact references and without UNKNOWN marking. −15.
- **Inferred claims have rule support + source: inferred (0-50): 40.** Exemplary for the two surface-derived outcomes: `kernel-unavailable` and `corrupt-source-validation` each carry the required_outcomes mapping comment + `source: inferred` + reasoning chain. `cancel-confirm` and `already-migrated-guard` carry `source: inferred` + reasoning (journey/UF3/FT-062 lineage). Deduction: Step-3's `interrupted-pre-commit-rollback`, `interrupted-post-commit-success`, `external-write-conflict` are journey-derived boundary outcomes whose journey sources (prd-spec SC2, Story 1 AC2, proposal 错误路径) are not carried into the contract as source annotations — they read as uncited factual assertions. −10.
- **No hallucinated unclassified claims (0-40): 35.** Nothing contradicts the Fact Table; the rollback/equivalence semantics are faithful to FT-061. One claim with no fact backing at all: Step-1 State "getMigrationStatus:authority=files/deviated/migratedAt/lastEvent" — FT-087 confirms the verb exists, but no fact defines this DTO payload shape; it is neither cited nor marked UNKNOWN. −5. (Note: Step-4 fixture omits `reingest` from the FT-065 phase vocabulary enumeration — incomplete, not false; noted under Dimension 8.)

## Dimension 5 — Surface Fitness: 93/100

- **Mandatory derived Outcomes present (0-40): 38.** Both web-mandatory outcomes present as reasoned analogues with the mapping rationale inline (see Dimension 1 quotes). The session-expired N/A justification ("离线桌面壳无登录会话语义(N/A);类比承载 = 数据内核通道不可用") is exactly the right discipline. Minor: the analogues are named for their domain cause rather than the rule name, so a grep for "validation-error"/"session-expired" finds only the mapping comments — keep the mapping comments intact through regeneration. −2.
- **Surface-appropriate language (0-35): 30.** Input/Output are proper web-UI language (Pill, 入口, 对话框, 进度浮层, 看板, Esc/关闭守卫). Deduction: State dimensions mix in kernel/DB/harness language ("摄入+切读+归档于单事务内提交", "migration_progress 事件逐相位推送;migration_event 审计行随事务落档"). The journey's dual assertion口径 (browser face + harness level) legitimizes some of this, but the kernel internals exceed what the口径 requires. −5.
- **TUI timeout criterion (0-25): 25.** Non-TUI surface — full marks per rubric.

## Dimension 6 — Internal Consistency: 135/150

- **Invariants hold in every Step Contract (0-60): 55.** The 5 invariants are replicated verbatim ×4 and no Outcome violates them: explicit-trigger (wizard variant also confirm-gated), md non-mutation, backup-before-ingest, atomicity. One mild tension: invariant "完成态必呈对拍结论" vs `interrupted-post-commit-success` Output "事件与对拍结果经日志可回查(见 4c);不出现回滚/重试呈现" — the post-crash terminal presentation defers parity display to log review rather than presenting it on the completion surface. This stance is inherited verbatim from journey 3b, so it is a journey-level posture, not a contract fabrication — small deduction. −5.
- **Cross-Contract references consistent (0-50): 40.** "确认后进入迁移管线(Step 3)" resolves; "(见 4c)" resolves to Step-4 `migration-events-reviewable`; "任务全集与 Setup 基线一致" is declared as a recorded baseline in Step-3 Preconditions. Deduction — the reachability gap flagged in Phase 1: Step-1 `not-migratable-hidden` ("已迁移项目呈现已迁移 success Pill" + no entry) vs Step-2 `already-migrated-guard` Input "用户尝试再次发起迁移" — the already-migrated leg of the guard has no web entry to attempt from; only the running-dispatch/in-progress legs are UI-reachable (entry shown for files-authority projects). The Outcome should scope its Input to the reachable legs or declare the already-migrated leg as API-level defense-in-depth. −10.
- **Preconditions achievable from preceding State changes (0-40): 40.** Chain verified: Step-2 requires dialog presented (Step-1 entry) → Step-3 requires "迁移确认已通过" (Step-2 success) → Step-4 requires data_authority=sqlite + migrated_at 非空 (Step-3 success / post-commit outcome fixture declares exactly this). `wizard-same-confirm` is a declared alternate entry consistent with journey 4b.

## Dimension 7 — Anchor Integrity: 96/100

Handbook `design/page-map.md` exists → scored normally. Web anchor field = `page`; contracts additionally carry `route`/`requires_auth`/`layout`, which is richer than required.

- **Anchor field completeness (0-40): 40.** All 4 contracts carry `anchors.web.page` (+ route). No missing fields.
- **Anchor values match handbook (0-30): 26.** Routes match handbook view keys exactly: `workbench/overview` (×2), `workbench/dialog/migrate-confirm`, `workbench/dialog/migrate-progress` (valid instances of the handbook's `workbench/dialog/*` family, whose components MigrateConfirm/Progress are named in the overview page section "迁移对话框族(UF3)"), and Step-4's compound overview+board page resolves both handbook pages. Deduction: page-name forms drift from handbook headings — "工作台 · 概览(迁移确认对话框)" / "工作台 · 概览(迁移进度浮层)" vs handbook heading "工作台 · 项目概览…"; the identifier resolves via route, but exact-match discipline says use the handbook's page title verbatim. −4.
- **Handbook internal consistency (0-30): 30.** No conflicting page/route definitions: view keys are disjoint (overview/proposals/features(+ :slug)/tasks/dialog/*/panel/*/session); tab order 概览/提案/Feature/任务 consistent between header and Pages section and matches FT-092; dialog/panel overlay family consistent with Route Guard Configuration ("迁移进度中 close-guard 不可关" ↔ 迁移对话框族 row "进度中 data-close-guard 不可关"). The proposals page's "Route Parameters" table is explicitly framed as 视图键段, coherent with the no-URL-routing header.

**Missing Anchor Fields** — none.

| File | Field | Issue |
|------|-------|-------|
| (none) | — | — |

**Anchor value notes** (minor, non-desyncing):

| File | Field | Contract value | Handbook value | Note |
|------|-------|----------------|----------------|------|
| step-2 | page | 工作台 · 概览(迁移确认对话框) | 工作台 · 项目概览(UF3 迁移 + UF4 偏好扩展)+ 迁移对话框族 section | abbreviated title; route resolves |
| step-3 | page | 工作台 · 概览(迁移进度浮层) | same as above | abbreviated title; route resolves |

**Handbook Conflicts** — none found.

## Dimension 8 — Fixture Specification: 100 → 69

`fixture_spec` present on all 14 Outcomes → mandatory scoring (no legacy exemption). Veto NOT triggered: every entity referenced as a *prerequisite* is declared; kernel rows produced by the SUT during migration are outputs, not seeded fixtures.

- **Entity completeness (0-40): 35.** Declared entity types map to the design domain: Project (projects), Dispatch (FT-067), MigrationEvent (FT-065), Task, plus doc-tree artifacts TaskIndexFile/TaskMarkdownFile/TaskRecordFile/ArchivedIndexFile (forge files = SoT per BIZ-coexistence-002), ForgeProjectCodeRoot (registration input). Deductions: Step-4 `success` State asserts "内核 task 权威行 = 迁移前任务全集" with no Task entity declared (only TaskMarkdownFile) — the verified entity set is incomplete even if seeding is the SUT's job; Step-2 `already-migrated-guard` precondition "同项目迁移正在进行中" has no corresponding entity/state declaration. −5.
- **Relationship and constraint coverage (0-35): 25.** `belongs_to` + `parent_entity` declared consistently for multi-entity fixtures. Deductions: compound OR-logic stuffed into single field values — Step-1: `data_authority: "sqlite 或 files 且文档树无 index.json"`; Step-2: `value: "sqlite(或 files 但存在在跑派发行)"` — a field constraint should carry one predicate; Step-1 parents `Task` to `TaskIndexFile`, but tasks belong to the project/feature with the index as their *carrier* (also inconsistent with Step-4, where TaskMarkdownFile is parented to Project). −10.
- **Minimum data quantity (0-25): 9.** Step-1 `Task` min_count 10 ✓ matches "含 ≥10 任务"; Step-4 `MigrationEvent` min_count 2 ✓ (backup + archive minimum). Deductions: Step-1 `not-migratable-hidden` Output asserts BOTH "不呈现迁移入口" AND "已迁移项目呈现已迁移 success Pill" with Project min_count 1 — one project cannot demonstrate both sub-cases (needs ≥2: one migrated, one never-indexed); Step-4 `success` asserts "看板承载全部任务(与迁移前任务全集一致)" against a ≥10-task baseline while TaskMarkdownFile min_count is 1 — under-declared for the retention/consistency assertions. −8 −8.

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **Post-commit interrupt has no deterministic injection mechanism.** The pre-commit outcome specifies one ("测试通道在摄入/归档相位注入中断"), but `interrupted-post-commit-success` only states the window: "迁移事务已提交(COMMIT 完成)后、终态呈现前应用被杀/崩溃" — a downstream agent cannot deterministically arrange a crash inside that window without a declared test-channel injection point; as written the test would be racy or unimplementable. Must improve: declare the injection point (e.g. post-COMMIT pre-render hook) in the outcome's state_requirements.
2. `[blindspot]` **Baseline capture mechanism is unspecified.** Step-3 success Preconditions: "迁移前任务全集基线已记录(ID/状态/依赖/标题,用于对拍)" and Step-4 repeats "迁移前任务全集基线已记录" — who records the baseline, when, and where it is stored is never declared (not in fixture_spec, not in state_requirements). Downstream gen-test-scripts needs the baseline's capture channel and storage to implement the 对拍 assertion. Must improve: declare baseline capture as an explicit harness step/entity in the fixture spec.

(Reasoning-audit Anchor A was scored under Dimension 6; Anchor C under Dimension 4, per protocol channeling rules.)

---

## Revision Priorities (for reviser)

1. **Dimension 4 (largest gap, 120/150)**: add per-claim fact citations (FT-061/063/064/065) or UNKNOWN marks to Step-3/4 success and failure outcomes; carry journey source annotations into the three Step-3 boundary outcomes; mark the `getMigrationStatus` DTO payload UNKNOWN or cite its fact.
2. **Dimension 8 (69/100)**: split compound OR field constraints into distinct entities/constraints; raise min_count for `not-migratable-hidden` (≥2 projects) and Step-4 md-file entities (align with ≥10-task baseline); declare Task entity for Step-4 success assertions.
3. **Dimension 6**: scope `already-migrated-guard` Input to UI-reachable legs (running-dispatch / migration-in-progress) or explicitly mark the already-migrated leg as API-level defense.
4. **Dimension 2**: move IPC verb/DTO/schema column references out of dimension values into metadata/fixture blocks.
5. **Blindspots**: declare post-commit injection point and baseline capture mechanism.
