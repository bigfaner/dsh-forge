# Eval Report: journey `project-registration` — Iteration 1

- **Document**: `docs/features/dsh-forge-p1-mvp/testing/project-registration/journey.md`
- **Surface**: web (`rules/surface-web.md`)
- **Rubric**: journey.md (1150 pts, target 975, 7 dimensions)
- **Scorer stance**: Senior QA Engineer, adversarial, verification-first
- **Iteration**: 1 (no previous report)
- **Verdict**: **PASS** — 993/1150 (≥ 975), all dimensions above min thresholds

## Document Identity

| Field | Value | Check |
|---|---|---|
| journey | `project-registration` | kebab-case OK |
| risk_level | High | Valid; justified (external `dsh create` mutation + DB writes) |
| golden_path | false | Feature-level designation; `knowledge-recall-flywheel` holds `golden_path: true` — coherent at feature level |
| surface_types / surface_keys | `["web"]` / `["web"]` | Present, valid |
| sources | 4 PRD/proposal files | All exist and were cross-checked by this eval |
| Structure | Overview + PRD 溯源 + Setup + 5 Happy steps + 6 Edge cases + 4 Invariants | Meets gen-journeys HARD-RULE shape |

High-risk density rule: 6 edge cases ≥ 5 happy steps — satisfied.

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Primary workflow coverage**: Yes. Steps 1–5 trace Story 1 / 流程一 / UF-3 / SC13 faithfully: hero CTA → two-stage modal (browser → form) → confirm → success mount in left rail. Every factual claim I checked against the four source files is accurate (defaults `<工作区>/.forge` / `<工作区>/.knowledge`, derived task path `{dsh-forge-home}/{canonical-path 扁平化}`, 仓内/仓外 auto-derivation, no「默认召回域」field, cancel points before `dsh create`, idempotent attach branch, hero retirement). Zero hallucinations found.
2. **Executable sequence**: Mostly. Two executability hazards: (a) Step 4 asserts internal pipeline stages a browser test cannot observe; (b) Step 1's Expected Result requires a「已注册」mark to be rendered while Setup guarantees zero registered workspaces (see D6).
3. **Observable outcomes**: Mixed. Modal open, breadcrumb, read-only backfill, left-rail mount, hero retirement are UI-observable. "注册记录落应用数据库（含 workspace 外键）", "实时读 dsh 账本，零副本", and the internal chain stages are not browser-observable.
4. **Self-contradiction**: No invariant violations. Cross-step references (3c ↔ Step 3 fields; 5b ↔ Step 5 state) resolve. Two soft inconsistencies found: the Setup↔Step 1 mark contradiction (D6) and the "四步链" three-item enumeration (D6).
5. **Delegation soundness**: Compensation paths are genuinely covered by `project-registration-compensation/journey.md` (verified: AC3 ownership protection, AC4 compensation, ④ chain step, reconciliation). The Overview's delegation claim is true, not a dodge.

## Phase 2 — Rubric Scoring

### Dimension 1: Completeness — 178/200 (min 120)

| Criterion | Score | Justification |
|---|---|---|
| Metadata | 50/50 | Name kebab-case; `risk_level: High` valid and content-justified (state mutation via `dsh create`, irreversible registration); surface fields and sources complete. |
| Steps complete | 76/80 | Every step (5 happy + 6 edge) has User Action + Expected Result; edge cases add explicit Precondition blocks; sequence is coherent and ordered. −4: Step 3's action is conditional and observational — "查看表单字段（必要时直接输入或点「浏览…」改选目录）" leaves the actual executed action ambiguous for a downstream agent. |
| Happy + required derived scenarios | 52/70 | Rich edge coverage (cancel ×2, idempotent attach, field linkage, invalid path, repeat add). −18: surface-web mandates `validation-error` AND `session-expired` "must be considered for every Web Journey". `validation-error` is present (Step 3d, and in fact PRD-grounded in UF-3 Validation Rules); `session-expired` is silently absent — no outcome, no N/A disposition. The PRD 溯源 line enumerates the full scope ("happy path / 两段取消干净退出 / 幂等挂接 / 补偿路径") with no session-related item, so the omission is undocumented rather than argued. |

### Dimension 2: Semantic Purity — 174/200 (min 120)

| Criterion | Score | Justification |
|---|---|---|
| Natural language, no code/regex | 76/80 | No regex, selectors, or `expect(...)`-style assertions anywhere. −4: formula-style notation "任务清单与记录 = `{dsh-forge-home}/{canonical-path 扁平化}`" is PRD-verbatim but reads as a derivation formula rather than an observable; a journey-level phrasing ("自动派生自工作区路径，只读展示") would be cleaner. |
| Preconditions declarative | 58/60 | All six edge-case preconditions are pure state descriptions ("流程处于第一段·文件浏览器，尚未进入注册表单"; "已有至少一个项目，工作台处于项目态"). No procedural setup code. −2: Step 3d's precondition "表单态下 forge 目录或知识库目录输入框可编辑" describes UI capability, not the triggering state (invalid input provided) — the trigger lives in the User Action. |
| No implementation coupling in steps | 40/60 | User actions themselves are clean (clicks, double-clicks, form input). But Expected Results couple to internals three times: (a) "注册记录落应用数据库（含 workspace 外键）" — DB write with FK constraint; (b) "实时读 dsh 账本，零副本" / invariant "零缓存零副本（无投影同步）" — data-architecture internals; (c) "四步链启动：ownership 预检 → dsh create → 应用库写入" — internal pipeline stages (only "进度指示呈现" is user-observable). A web test generator can neither assert nor skip these cleanly. |

### Dimension 3: Precondition Exclusivity — 138/150 (min 90)

| Criterion | Score | Justification |
|---|---|---|
| Preconditions distinct | 56/60 | All six edge preconditions are pairwise distinct: stage-1 cancel vs stage-2 cancel are separated by stage; 3c (modified fields + reselect) vs 3d (invalid input) separated by trigger; 2b and 5b by registry hit / project mode. −4: 3b and 3c can co-occur (a user who modified fields may also cancel) — the doc treats them as independent branches without noting combined applicability; for outcome selection this is benign since each edge case is a separate step, but a contract generator deriving one Step's outcome set must disambiguate. |
| Sufficient to uniquely select | 46/50 | Given precondition + action, exactly one outcome applies per edge case. −4: Step 2b spans two stages in one flow ("选中该已注册目录，点「下一步」进入表单后「确认」") — the precondition anchors at stage 1 but the outcome materializes at execution, leaving the intermediate form state (does the form indicate attach-vs-create?) unspecified. |
| No missing preconditions for error/boundary | 36/40 | All boundary outcomes state their trigger via precondition or action. −4: Step 5b's precondition "已有至少一个项目" does not state the new candidate directory is unregistered — combined with 2b this leaves the second-registration branch (app-level duplicate, see blindspot 4) unreachable/unspecified. |

### Dimension 4: Fact Alignment — 124/150 (min 90)

The document carries no Fact Table, no `fact_id` references, no `UNKNOWN` markings, and no `source: inferred` annotations. It declares document-level traceability only: "**PRD 溯源**: Story 1（全部 AC…）；流程一…；UF-2…、UF-3…；提案 Key Scenario「首用」、SC13 happy path".

| Criterion | Score | Justification |
|---|---|---|
| Factual claims traceable | 50/60 | I independently verified essentially every behavioral claim against the four sources — all accurate (defaults, linkage rules, FK/join-key, zero-copy ledger, hero rules, attach branch, cancel semantics). −10: traceability is document-level, not claim-level; a claim that did NOT exist in the PRD would be indistinguishable from one that does, because no per-claim anchors exist. The 溯源 block cites six anchors for the whole document. |
| Inferred claims annotated | 34/50 | No `source: inferred` annotation appears anywhere, and no derived outcome cites the surface `required_outcomes` rule that mandated it. Mitigation: most boundary outcomes turn out to be PRD-grounded (3d ← UF-3 Validation Rules; 2b ← Story 1 AC3; 5b ← Secondary Pages table "hero 空态 CTA（UF-2）/ 项目树「＋」"; 3c ← UF-3 flow 3), so the annotation gap is formal rather than substantive for those. But genuinely inferred content (e.g., "多项目并存", "hero 不再出现" persistence across later sessions) carries no classification at all. |
| No hallucinated unclassified claims | 40/40 | Zero hallucinations found. Every checkable assertion matched a source. The one distortion — "四步链" naming a three-item enumeration — is an omission relative to PRD (which lists ④ 补偿), not an invented claim. |

### Dimension 5: Surface Fitness — 112/150 (min 90, web-parameterized)

| Criterion | Score | Justification |
|---|---|---|
| Mandatory derived outcomes | 40/60 | `validation-error`: present (Step 3d — intercepted at form state, correctable prompt, not submitted). `session-expired`: completely unconsidered — no outcome and no recorded inapplicability. Not "completely absent" as a pair, so the 0-rule does not fire. Note: the app is a single-user local product with no auth session in the PRD, so a documented N/A disposition would likely suffice — but surface-web.md says "must be considered", and silence is not consideration. −20. |
| Test strategy proportions (50/50) | 44/50 | The document serves both levels well: per-step outcomes with distinct preconditions (6 edge cases) are contract-grade material; the 5-step contiguous flow is journey-smoke-grade. −6: happy-path Expected Results skew toward system-internal chain description (Step 4/5), which pulls contract extraction toward unassertable internals rather than UI behavior. |
| Realistic web execution assumptions | 28/40 | Browser interaction, modal, double-click/breadcrumb navigation, async wait ("等待注册执行完成" + progress indicator) are realistic and align with surface-web's async-handling guidance. −12: three expected results are not verifiable by browser automation: "注册记录落应用数据库（含 workspace 外键）", "实时读 dsh 账本，零副本", and the internal "四步链" stages. surface-web's principle is "User-centric assertions: test from the user's perspective… Avoid asserting internal component state or implementation details." These need user-observable proxies (e.g., project persists across app restart; session list reflects ledger changes without reload) or an explicit system-level assertion channel. Deduction deliberately apportioned here vs. Dimension 2 (coupling) to avoid double-counting full magnitude. |

### Dimension 6: Internal Consistency — 130/150 (min 90)

| Criterion | Score | Justification |
|---|---|---|
| Invariants hold in every step | 56/60 | All four invariants hold across all 11 steps: cancels only before `dsh create` (1b, 3b); FK-carrying projects row (5, 2b); ledger-read session list (5); hero-only-at-zero (5, 5b). −4: invariant "任何取消后 dsh 侧与应用侧零残留" is asserted but the journey provides no observable means to check "dsh 侧零残留" from the web surface — the invariant is unfalsifiable as written for this surface. |
| Cross-Step / Setup references consistent | 34/50 | Two real defects. (1) **Setup ↔ Step 1 contradiction (−8)**: Setup pins "应用以零项目状态首用启动" and "本地文件系统存在一个尚未注册的工作区候选目录" — under these preconditions no registered workspace exists, so no browser row can carry the mark; yet Step 1's Expected Result demands "「已注册」标记（ownership 预检可视化）呈现". A downstream agent executing from Setup can never satisfy this assertion. (Charitably "the marking mechanism is present", but as written it demands a visible mark.) (2) **"四步链" three-item enumeration (−8)**: Step 4 says "四步链启动：ownership 预检 → dsh create → 应用库写入" — the PRD's four-step chain is ① 预检 ② create ③ 写入 ④ 补偿. The ④ omission is explained by delegation (Overview), but not at Step 4 itself; an agent reading Step 4 in isolation derives a wrong chain shape. Remaining references (3c↔Step 3, 5b↔Step 5, 2b↔Step 1 mark) resolve cleanly (+34). |
| Risk level consistent | 40/40 | High matches state mutation (external registry create, DB transactional write, hero-phase transition); edge density 6 ≥ 5 satisfies the High-risk rule. |

### Dimension 7: Workflow Coverage — 137/150 (min 90; Golden Path veto NOT triggered)

| Criterion | Score | Justification |
|---|---|---|
| Golden Path existence (veto) | 58/60 | Steps 1–5 form a contiguous 5-step sequence semantically matching Story 1 and SC13 ("hero 空态 → 文件浏览器…→ 注册表单…→「确认」→ 注册成功后左栏出现项目"), all in domain terms (no HTTP/API descriptions). Veto check passes. −2: Step 3's action ("查看表单字段") is verification-flavored; it is saved from the golden-path anti-pattern only because Story 1's own narrative includes confirming defaults ("在注册表单确认 forge 目录与知识库目录（默认值或改选）") — the doc would be more robust if the action were phrased as the story's confirm-or-adjust operation. |
| Multi-step coverage depth | 44/50 | Beyond the golden path: two cancel points, idempotent attach to existing entity, field-relinkage on workspace reselect, invalid-input interception, second-entry-point add (project tree「＋」), and entity-lifecycle transition (zero-project → project mode, hero retirement). Error recovery delegated and actually covered by the compensation journey (verified). −6: no cross-entity negative interaction in-document (e.g., second registration colliding with app-level project record — see blindspot 4). |
| Workflow completeness vs PRD scope | 35/40 | Story 1 AC1/AC2 fully covered; AC3/AC4 delegated with a sibling journey that exists and covers them; UF-3 states (浏览器态/表单态/执行中/成功) covered, 失败 state delegated. −5: UF-1 defines the observable for a newly registered project's session list — "会话列表空 | 项目下「暂无会话」占位 | 新注册项目" — but the journey's Step 5 ("左栏出现该项目及其 dsh 会话列表") never states the list is empty for a fresh workspace, leaving the most common first-registration UI state unasserted. |

### Cross-Dimension Coherence Check

- **Web-observability** of DB/ledger/chain assertions manifests in D2 (coupling language) and D5 (surface testability); deducted in both with apportioned magnitude, overlap noted.
- **session-expired** omission manifests in D1 (missing derived scenario) and D5 (mandatory outcome absent); both docked, magnitudes split.
- **Setup↔Step 1 mark contradiction** is scored once, in D6, where it most clearly manifests; it also feeds a blindspot (below).
- No dimension was double-charged for the same full magnitude.

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. `[blindspot]` **Zero-project Setup makes Step 1's「已注册」mark assertion unfalsifiable** — Setup: "应用以零项目状态首用启动…本地文件系统存在一个尚未注册的工作区候选目录" vs Step 1: "「已注册」标记（ownership 预检可视化）呈现". In first-use state no registered directory exists, so no mark can render. Fix: either add a registered workspace to Setup (breaking the hero-first-use premise requires a second journey run) or re-scope Step 1's result to the marking mechanism's presence plus a dedicated edge case with a pre-registered dir.
2. `[blindspot]` **`session-expired` has no disposition** — the full scope enumeration "Story 1（全部 AC：happy path / 两段取消干净退出 / 幂等挂接 / 补偿路径归 project-registration-compensation Journey）" contains no session boundary. For a single-user local app an explicit "N/A — no auth session in P1" note would close it; silence leaves the downstream generator to guess.
3. `[blindspot]` **Invalid-path equivalence classes unenumerated** — "在文档位置（forge 目录）或知识库目录直接输入非法路径" and "非法路径被拦截于表单态…给出可修正提示" name no boundary values or classes (nonexistent dir? illegal characters? empty? relative path? forge dir outside any drive? knowledge dir nested inside forge dir?). Likewise "工作区目录必选且必须为存在的本地目录" is asserted only as a tail of 3d — the stage-1 boundary (clicking「下一步」with no directory selected) has no outcome at all. A contract generator cannot produce concrete validation tests from this.
4. `[blindspot]` **App-level duplicate registration is unreachable/unspecified** — Step 2b: "注册执行走「挂接既有」分支…应用库写入 projects 行成功". If the selected directory is already an app-registered project (both dsh registry and projects table hit), does the app write a second `projects` row for the same workspace? Neither this journey nor the PRD 溯源 line addresses duplicate project entries; the precondition of 5b ("已有至少一个项目") gets close but picks a fresh directory. QA gap: the "already a project" negative test is missing.
5. `[blindspot]` **New-project session list expectation unstated** — "左栏出现该项目及其 dsh 会话列表（实时读 dsh 账本，零副本）" gives no expected content for a brand-new workspace, where UF-1 defines the "暂无会话" placeholder. A test agent may wrongly assert session rows exist or omit the empty-state assertion entirely.
6. `[blindspot]` **Unobservable assertions have no proxy or channel declared** — "注册记录落应用数据库（含 workspace 外键）" cannot be checked by browser automation; without a user-observable proxy (e.g., survives app restart) or an explicitly sanctioned system-level check, the downstream agent must either skip it (untested claim) or improvise DB access (implementation-coupled test).

## Score Summary

| Dimension | Score | Min | Status |
|---|---|---|---|
| 1. Completeness | 178/200 | 120 | PASS |
| 2. Semantic Purity | 174/200 | 120 | PASS |
| 3. Precondition Exclusivity | 138/150 | 90 | PASS |
| 4. Fact Alignment | 124/150 | 90 | PASS |
| 5. Surface Fitness | 112/150 | 90 | PASS |
| 6. Internal Consistency | 130/150 | 90 | PASS |
| 7. Workflow Coverage | 137/150 | 90 | PASS (veto not triggered) |
| **Total** | **993/1150** | **975** | **PASS** |

**Priority fixes for revision (highest value first)**:
1. Resolve the Setup ↔ Step 1「已注册」mark contradiction (D6, blindspot 1).
2. Add `session-expired` outcome or explicit N/A disposition (D1/D5, blindspot 2).
3. Replace/qualify unassertable internals with user-observable proxies (D2/D5, blindspot 6).
4. Enumerate invalid-path equivalence classes + stage-1 no-selection boundary (blindspot 3).
5. Fix "四步链" enumeration to name ④ or scope it as "③ 前三步" (D6).
6. Add claim-level 溯源 anchors or `source: inferred` markers for non-PRD-derived statements (D4).
7. State the empty session-list expectation for new projects (D7, blindspot 5); consider an app-level duplicate-registration edge case (blindspot 4).
