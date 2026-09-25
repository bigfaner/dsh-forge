# Contract Eval Report — iteration 1

- **Journey**: preferences-tiered-override
- **DOC_DIR**: docs/features/dsh-forge-m3/testing/preferences-tiered-override/contracts/
- **Files scored**: step-1-open-prefs-panel.md, step-2-view-tiered-values.md, step-3-modify-feature-value.md, step-4-clear-override.md, step-5-dispatch-consumes-prefs.md, step-6-global-fallback.md
- **Surface**: web (rubric Dimension 5 parameterized by rules/surface-web.md)
- **Handbook**: design/page-map.md exists → Anchor Integrity scored normally
- **Scorer persona**: Senior QA Engineer (verification stance)
- **Result**: **926 / 1100 — FAIL** (target 935; every dimension ≥ min threshold, total 9 points short)

| # | Dimension | Score | Min | Verdict |
|---|-----------|-------|-----|---------|
| 1 | Completeness | 150/150 | 90 | PASS |
| 2 | Semantic Purity | 173/200 | 120 | PASS |
| 3 | Precondition Exclusivity | 115/150 | 90 | PASS |
| 4 | Fact Alignment | 115/150 | 90 | PASS |
| 5 | Surface Fitness | 93/100 | 60 | PASS |
| 6 | Internal Consistency | 115/150 | 90 | PASS |
| 7 | Anchor Integrity | 96/100 | 60 | PASS |
| 8 | Fixture Specification | 69/100 | 60 | PASS |
| | **Total** | **926/1100** | 935 | **FAIL** |

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Coverage chain sound.** All 6 happy-path steps and all 5 journey edge cases (1b/3b/3c/4b/5b) map to Contract Outcomes 1:1; both web-mandatory derived outcomes are present with mapping rationale. No journey scenario dropped.
2. **Anchor A — key-set enumeration drift (contradiction).** Step-1 Output renders a four-prefix key set — "键集固定呈现(auto.\*/worktree.\*/eval.\*/coverage.\* 分组折叠)" — and its fixture constraint agrees ("注册键集内(auto.\*/worktree.\*/coverage.\*/eval.\* 之一)"), while the `## Journey Invariants` block replicated in the *same file* (and all 6 files) declares "键集固定(auto.\*/worktree.\*/eval.\*,surfaces 除外)". Per FT-076 the closed registry DOES include `coverage.<task-type>` strategies, so the Output side is factually right and the inherited invariant is stale — but as written the corpus self-contradicts on whether `coverage.*` keys must appear in the panel. Channeled into Dimension 6.
3. **Anchor B — step-6 vacuous action path.** Step-6 fixture `state_requirements`: "同键的 project 级与 feature 级行均不存在(已清除)" while the Input is "用户依次清除项目级与 feature 级覆盖后查看生效值" — the fixture pre-consumes the Input's operations, making both clears idempotent no-ops (FT-079) and the Side-effect "prefs_updated 事件仅在实删除时发" untestable as fixtured. Channeled into Dimensions 8/6.
4. **Anchor C — zero traceability.** Across all 6 files not a single `fact_id` citation or `UNKNOWN` mark appears, despite dozens of specific kernel assertions that map cleanly onto FT-076/077/078/079/071/067/093 (I verified each is substantively accurate). Channeled into Dimension 4.
5. **Anchor D — dangling second dispatch.** Step-5 `no-retroactive-rewrite` Input compares "修改前后派发的两个 subagent 系统提示词" but only the pre-modification Dispatch is declared (min_count 1); the creation of the post-modification dispatch is in neither Input nor fixture. Channeled into Dimensions 3/8.
6. **Anchor E — unreachable precondition leg.** Step-1 `no-feature-tier-disabled` includes "(或无激活项目)" — per FT-053, no active project → overview empty state auto-enters wizard, so the preference panel (and thus the Input "打开偏好面板") is unreachable on that leg. Channeled into Dimension 6.

SC/InScope clustering check: N/A for contract-type documents (no SC/In Scope sections); the analogous full-pair Outcome satisfiability scan found no logical mutual-exclusion contradictions — two precondition *overlap ambiguities* (step-3 error pair, step-5 pair) are scored under Dimension 3.

---

## Dimension 1 — Completeness: 150/150

- **Four mandatory dimensions per Outcome (0-50): 50.** All 10 Outcomes across 6 files carry non-empty Preconditions, Input, Output, State; every Outcome also carries an explicit Side-effect (including "none"); per-Outcome Invariants supplied where meaningful (e.g. Step-4 `success`: "清除仅经偏好 API;幂等 no-op 不产事件"). Verified block-by-block — zero missing dimensions.
- **Journey Invariants section (0-50): 50.** All 6 files contain `## Journey Invariants` with the full 4-entry invariant list replicated from the journey.
- **Happy path + surface-mandated derived scenarios (0-50): 50.** Both web-mandatory derived outcomes present as reasoned analogues with inline mapping rationale: validation-error → `type-validation-error` ("surface-web required_outcomes 映射:validation-error → 偏好值为固定类型(布尔/数值/枚举),非法输入就近报错不保存"); session-expired → `save-channel-error` ("surface-web required_outcomes 映射:session-expired → 内核偏好 API 通道异常时错误呈现,不落半写状态"). All five journey edge cases have corresponding Outcomes (1b→step-1, 3b/3c→step-3, 4b→step-4, 5b→step-5).

## Dimension 2 — Semantic Purity: 173/200

- **Natural language, not code/regex (0-80): 72.** No CSS/XPath selectors or framework assertion calls anywhere. Deduction: glob-pattern tokens inside dimension values — Step-1 Output "键集固定呈现(auto.\*/worktree.\*/eval.\*/coverage.\* 分组折叠)" (repeated in Invariants of every file) and Step-5 fixture "coverage.<task-type> 或其他生效键". The prefix notation is the domain's own registry vocabulary (journey/page-map use it too), but pattern tokens belong in test scripts, not dimension semantics. −8.
- **Preconditions declarative, not procedural (0-60): 56.** Preconditions are state descriptions throughout ("目标键存在 feature 级覆盖行,且项目级有显式值(回落目标在场)"). Deduction: fixture-injection mechanism embedded in preconditions — Step-3 `save-channel-error`: "保存时内核偏好 API 通道异常(经测试通道注入)"; Step-5 `success`: "预合成系统提示词经测试通道可直读" — "经测试通道…" is setup/harness instruction; the state should stand alone with mechanics in fixture_spec. −4.
- **No implementation coupling (0-60): 45.** Concrete couplings in dimension values: Step-1 State "纯读(getPrefs 返回全键投影:值/来源/覆盖位 + 类型元数据)" (IPC verb); Step-3 State "prefs 表 feature 级行 upsert(事务原子)" (DB table); Step-3 `type-validation-error` State "prefs 表零变更"; Step-3 `save-channel-error` State "prefs 表保持修改前值"; Step-5 State "既有派发行 prompt_hash 不变" (DB column, FT-067); Step-6 State "注册表权威默认 source=default" (resolver DTO value). Transaction semantics are arguably system-level for an atomicity contract, but IPC verb names and schema columns are implementation detail. −15.

## Dimension 3 — Precondition Exclusivity: 115/150

- **Distinct across Outcomes (0-60): 40.** Clean partitions: Step-1 (feature present vs "当前项目不存在 feature"); Step-4 ("目标键存在 feature 级覆盖行,且项目级有显式值" vs "feature 级覆盖已清除(回落至项目级)"). Deductions — two overlap pairs: (a) Step-3 `type-validation-error` ("修改布尔键时输入非法值(类型不匹配)") × `save-channel-error` ("保存时内核偏好 API 通道异常") are orthogonal triggers — the combined scenario (invalid input AND broken channel) matches both preconditions; the contract only implies validation-first ordering via State ("校验全部前置…失败零写入"), not in the Preconditions. −10. (b) Step-5 `success` ("任一层级偏好已修改并保存;存在可派发任务…") × `no-retroactive-rewrite` ("存在偏好修改前已派发的 subagent") — both can hold simultaneously; the discriminator is only the Input (dispatch+assert vs compare two prompts). −10.
- **Sufficient to uniquely select (0-50): 40.** Both overlap pairs are resolvable only via Input, not via Preconditions + state as the rubric requires. −10.
- **Error/boundary triggers explicit (0-40): 35.** Every non-happy outcome names its trigger: no-feature ("当前项目不存在 feature(或无激活项目)"), invalid input ("类型不匹配"), channel failure ("内核偏好 API 通道异常"), roundtrip ("feature 级覆盖已清除(回落至项目级)"), no-retroactive ("存在偏好修改前已派发的 subagent"). Deduction: `no-retroactive-rewrite`'s comparison scenario requires a second, post-modification dispatch that is declared nowhere (Input presupposes "修改前后派发的两个 subagent" both exist; fixture seeds only the pre-modification one). −5.

## Dimension 4 — Fact Alignment: 115/150

- **Factual claims traceable or UNKNOWN (0-60): 40.** Substantively the claims are accurate — I verified against the Fact Table: tiered registry/type metadata (FT-076), first-explicit-row resolution + value/source/override/localValue projection (FT-077), validate-then-single-transaction + prefs_updated (FT-078), idempotent clear + no-event-on-no-change (FT-079), presynth third element + dispatch-time consumption (FT-071/FT-093), prompt_hash immutability (FT-067), worktree.* no default / source=default (FT-077). But the corpus contains **zero** `fact_id` citations and zero `UNKNOWN` marks — every one of these specific behavioral assertions is carried unattributed. −20.
- **Inferred claims have rule support + source: inferred (0-50): 35.** Exemplary for two of the derived outcomes: `save-channel-error` carries both the required_outcomes mapping comment and "<!-- source: inferred:偏好修改仅经偏好 API(与 dsh tool 写路径同源,无第二写者)——通道失败必不产生部分持久化 -->"; `no-retroactive-rewrite` carries "<!-- source: inferred:预合成发生于派发时点,已启动 subagent 的系统提示词不再改写 -->". Deductions: `type-validation-error` carries the mapping comment but **no** `source: inferred` annotation; journey-derived boundary outcomes `no-feature-tier-disabled` (1b) and `roundtrip-consistency` (4b) carry no source lineage at all and read as uncited factual assertions. −5 −10.
- **No hallucinated unclassified claims (0-40): 40.** Nothing contradicts the Fact Table; the atomicity/idempotence/resolution semantics are faithful to FT-076–079. The UI copy 「本级覆盖」/「继承自上级」 (Step-2 Output) has no fact backing but is inherited verbatim from the journey (declared source) and page-map's "继承/覆盖 Pill". Unclassified-but-accurate claims were penalized under criterion 1; no fabrications found.

## Dimension 5 — Surface Fitness: 93/100

- **Mandatory derived Outcomes present (0-40): 38.** Both web-mandatory outcomes present with mapping rationale inline (see Dimension 1 quotes); the session-expired N/A reasoning (offline desktop shell, no login session; analog = kernel prefs channel unavailable) is the correct discipline. Minor: analogues are named for domain cause (`type-validation-error`, `save-channel-error`) so a grep for the rule names finds only the mapping comments — keep those comments intact through regeneration. −2.
- **Surface-appropriate language (0-35): 30.** Input/Output are proper web-UI language (面板, 层级 segmented, Pill, 清除入口, 禁用 + 说明, 就近呈现, 脏保存条). Deduction: State dimensions mix kernel/DB/harness language ("prefs 表 feature 级行 upsert(事务原子)", "既有派发行 prompt_hash 不变", "prefs_updated 事件批推"). The journey's dual assertion口径 (browser face + test-channel direct read, declared in Setup) legitimizes some of this, but the DB internals exceed what the口径 requires. −5.
- **TUI timeout criterion (0-25): 25.** Non-TUI surface — full marks per rubric.

## Dimension 6 — Internal Consistency: 115/150

- **Invariants hold in every Step Contract (0-60): 40.** Three of four invariants hold everywhere (resolution chain, single write path + same-source, dispatch-time consumption). Critical exception — the key-set invariant is contradicted inside Step-1 itself: Output "键集固定呈现(auto.\*/worktree.\*/eval.\*/coverage.\* 分组折叠)" and fixture "注册键集内(auto.\*/worktree.\*/coverage.\*/eval.\* 之一)" vs the same file's `## Journey Invariants` "键集固定(auto.\*/worktree.\*/eval.\*,surfaces 除外)". FT-076 settles it on the Output's side (registry includes coverage.<task-type>), but a downstream test-script generator implementing the invariant would directly contradict one implementing the Output — the test fails under either reading. Moderated from the −40 violation rule because the behavior described is factually correct and the stale side is the inherited invariant text, not the specified behavior. −20.
- **Cross-Contract state references consistent (0-50): 45.** Step-4 `roundtrip-consistency`'s "与此前状态一致" resolves to the `success` post-clear state; Step-5's "任一层级偏好已修改并保存" resolves to Step-3. Deduction: Step-1 `no-feature-tier-disabled` precondition leg "(或无激活项目)" is unreachable — FT-053: no active project → overview empty state auto-enters the wizard, so the preference panel required by the Input cannot be opened; the Outcome should scope to the no-feature leg (or declare the no-active-project leg API-level). −5.
- **Preconditions achievable from preceding State changes (0-40): 30.** Chain verified for Steps 2–5 (Step-3 requires feature editable ← Step-1 success; Step-4 requires feature override row + project explicit value ← Step-3 success + Step-2 fixture; Step-5 requires modified prefs ← Step-3/4). Break at Step-6: the journey sequence up to Step-5 leaves the project-level row in place (Step-2 fixture seeds it; Step-4 clears only feature level), yet Step-6's precondition/state_requirement demands "同键的 project 级与 feature 级行均不存在(已清除)" — achievable only via an undocumented clearing operation, after which the Input re-performs both clears as no-ops. −10.

## Dimension 7 — Anchor Integrity: 96/100

Handbook `design/page-map.md` exists → scored normally. Web anchor field = `page`; contracts additionally carry `route`/`requires_auth`/`layout`, richer than required.

- **Anchor field completeness (0-40): 40.** All 6 contracts carry `anchors.web.page` (+ route). No missing fields.
- **Anchor values match handbook (0-30): 26.** Routes match handbook view keys exactly: `workbench/overview` (×5) and `workbench/tasks` (Step-5, whose compound layout "TaskBoardPage(派发链)+ OverviewPage PreferenceSection(对照面)" resolves both handbook pages). Step-3's layout names PrefSaveErrorDialog, which exists in the handbook's 浮层与侧板 section ("偏好保存失败 | PrefSaveErrorDialog | setPrefs 错误 | 整体回滚说明 + 重试"). Deduction: page-name forms drift from handbook headings — "工作台 · 项目概览(偏好面 PreferenceSection)" / "(偏好面·层级 segmented + 键行)" / "(偏好面·编辑 + 脏保存条)" etc. vs handbook heading "工作台 · 项目概览(UF3 迁移 + UF4 偏好扩展)"; the prefix resolves via route, but exact-match discipline says use the handbook's page title verbatim. −4.
- **Handbook internal consistency (0-30): 30.** No conflicting page/route definitions: view keys disjoint (overview/proposals/features(+ :slug)/tasks/dialog/\*/panel/\*/session); tab order 概览/提案/Feature/任务 consistent between header and Pages section and matches FT-092; the proposals page's Route Parameters table is explicitly framed as 视图键段, coherent with the no-URL-routing header; Route Guard Configuration ("迁移进行中 → 进度对话框不可关") consistent with the 迁移对话框族 row. (Note, non-conflict: the handbook's PreferenceSection row "键分组(auto.\*/worktree.\*/eval.\*)" omits `coverage.*` — same stale enumeration as the journey invariant, see Dimension 6; a handbook fix belongs to the page-map owner, recorded here as an observation, not scored as a conflict.)

**Missing Anchor Fields** — none.

| File | Field | Issue |
|------|-------|-------|
| (none) | — | — |

**Anchor value notes** (minor, non-desyncing):

| File | Field | Contract value | Handbook value | Note |
|------|-------|----------------|----------------|------|
| step-1..4, step-6 | page | 工作台 · 项目概览(偏好面…) | 工作台 · 项目概览(UF3 迁移 + UF4 偏好扩展) | augmented title; route resolves |
| step-5 | page | 工作台 · 任务看板(派发)→ 偏好面(生效值对照) | 工作台 · 任务看板(UF1 编排扩展) | compound title; route resolves |

**Handbook Conflicts** — none found.

## Dimension 8 — Fixture Specification: 69/100

`fixture_spec` present on all 10 Outcomes → mandatory scoring (no legacy exemption). Veto NOT triggered: every entity type referenced in Preconditions/Input/State is declared, and all declared types (Project, Feature, Task, PrefEntry, Dispatch) map to the design domain (FT-097 v2 tables: projects, feature_snapshot, task, prefs, dispatch).

- **Entity completeness (0-40): 40.** Verified per-Outcome: Step-5 `success` correctly requires Task + PrefEntry + Project(data_authority=sqlite, matching FT-059's dispatch authority gate); `no-retroactive-rewrite` declares Dispatch; Step-2 declares the three tier rows as separate PrefEntry entities. No referenced entity type missing.
- **Relationship and constraint coverage (0-35): 20.** `belongs_to` + `parent_entity` declared consistently for multi-entity fixtures, and scope/key constraints are present. Deductions: (a) Step-2 parents the **global**-scope PrefEntry to Project — per FT-076 the prefs table's global scope is not project-scoped (`feature scope_id = '<projectId>/<featureSlug>'` implies global rows carry no project); wrong parent for that row. −5. (b) Step-2 does not capture the distinct-values constraint — the Preconditions say "在三级各设不同值" but no field_constraint enforces global ≠ project ≠ feature values; with equal values the Output assertion "生效值 = feature 级值" cannot distinguish which tier won. −5. (c) Placeholder constraint values that a seeder cannot execute as-is: "布尔键(如 auto.test.quick)" (step-3), "已设覆盖的键" / "同键(项目级显式值)" (step-4), "可测类型键(coding.\* 之类)" / "coverage.<task-type> 或其他生效键" / "已修改后的最新值" (step-5), "目标键" (step-6) — cross-row referential constraints expressed as prose placeholders. −5.
- **Minimum data quantity (0-25): 9.** Step-1 (1 project + 1 feature) and Step-2 (three tier rows) adequate. Deductions: (a) Step-6 Input performs two clear operations, but the fixture declares both target rows absent ("同键的 project 级与 feature 级行均不存在(已清除)") — under-declared for the scenario; the clears are no-ops and the Side-effect "prefs_updated 事件仅在实删除时发" is vacuous. −8. (b) Step-5 `no-retroactive-rewrite` compares two subagents but Dispatch min_count is 1 (pre-modification only); the post-modification dispatch needed for the comparison is not sequenced in Input or fixture. −8.

---

## Phase 3 — Blindspot Hunt

1. `[blindspot]` **Assertion without driving action (untestable Output claim).** Step-1 `no-feature-tier-disabled` Output asserts "全局/项目级查看与修改照常可用" while the Input only performs "用户打开偏好面板尝试选择 feature 层级" — no action exercises global/project-tier viewing or modification, so the availability claim is asserted but never driven; a downstream test cannot verify it as written. Must improve: add driving actions (select global tier, read a value, edit + save at project level) or scope the Output to the feature-tier disable check.
2. `[blindspot]` **Undefined term in a State dimension.** Step-2 State: "生效解析沿链下探,首个显式行即生效值;查询级覆盖位与本地值同面呈现" — "查询级" (query tier?) is used nowhere else in the journey, handbook, or Fact Table; a downstream agent cannot determine which element "查询级覆盖位" refers to (presumably the currently selected tier's override bit, cf. FT-077's override/localValue row fields). Must improve: replace with the established vocabulary (当前选中层级的覆盖位 / override + localValue semantics) or define the term.

(Reasoning-audit Anchors A–E were scored under Dimensions 6, 8, 4, 3/8, and 6 respectively, per protocol channeling rules.)

---

## Revision Priorities (for reviser)

1. **Dimension 6 (key-set contradiction, top priority)**: reconcile the key-set enumeration — either lift the Journey Invariants line to "auto.\*/worktree.\*/eval.\*/coverage.\*,surfaces 除外" (FT-076-accurate, matching Step-1 Output and fixture) or annotate the deviation from the journey explicitly. Also scope Step-1 `no-feature-tier-disabled` to the reachable no-feature leg (drop or API-scope "(或无激活项目)", FT-053).
2. **Dimension 4 (traceability)**: add fact citations (FT-076/077/078/079 to Step-1/3/4/6; FT-071/093/067 to Step-5) or UNKNOWN marks to specific kernel assertions; add `source: inferred` to `type-validation-error`; add source lineage to `no-feature-tier-disabled` and `roundtrip-consistency`.
3. **Dimension 8 (fixture feasibility)**: Step-6 — seed project/feature PrefEntry rows (min_count ≥1 each) so the Input's clears are real operations, or rewrite Input to view-only with clears as declared pre-state; Step-5 `no-retroactive-rewrite` — sequence the post-modification dispatch (Input or fixture). Fix Step-2 global-row parent (not Project), add distinct-values constraint, replace placeholder constraint values with concrete seeds.
4. **Dimension 3 (exclusivity)**: add "内核偏好 API 可用" (or explicit validation-first precedence) to `type-validation-error` Preconditions to separate it from `save-channel-error`; sharpen Step-5 `no-retroactive-rewrite` Preconditions (e.g. "存在修改前已派发 subagent 且本次对比需新派发一个").
5. **Dimension 2**: move "经测试通道注入/可直读" mechanics from Preconditions into fixture/state_requirements; move `prefs 表`/`prompt_hash`/`getPrefs` references out of dimension values into metadata.
6. **Blindspots**: drive the global/project availability claim in Step-1b; replace the undefined term "查询级".
