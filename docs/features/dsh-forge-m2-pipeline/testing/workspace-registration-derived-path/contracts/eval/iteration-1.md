# Contract Evaluation Report — iteration 1

- **Journey**: workspace-registration-derived-path (High risk, golden_path=false, surface=web)
- **Target**: `docs/features/dsh-forge-m2-pipeline/testing/workspace-registration-derived-path/contracts/` (step-1-select-workspace-dir.md, step-2-view-derived-store-row.md, step-3-confirm-registration.md)
- **Eval type**: contract | **Surface**: web | **Handbook**: `design/page-map.md` (exists — anchor checks ran)
- **Scorer**: adversarial 3-phase protocol, rubric scale 1100, target 935
- **Ground-truth verification performed**: fact table (`.forge/fact-table.json`), source code (`apps/web/src/flows/add-project/RegisterForm.tsx`, `derived-store-row.tsx`, `derive-source.ts`, `dir-picker.ts`), `design/tech-design.md` (交互三/Data Models/Error Handling), `prd/prd-user-stories.md` Story 7, `design/er-diagram.md`

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Journey decomposition is faithful.** Happy path Steps 1–3 map 1:1 to the three contracts; edge cases 1b/2b/3b/3c map to outcomes `reselect-updates-derive-row` / `same-flatten-subject-disambiguation` / `suspected-move-rejected` / `reselect-recheck-passes`. All four Journey Invariants are replicated verbatim in every contract file.
2. **Beyond-journey derivations are grounded and mostly well-annotated**: `picker-cancel-unchanged` (FLOW_PHASES), `picker-failure-error-shown` (np-error face), `derive-in-flight-loading` (M2_DERIVED_ROW_PHASE + explicit surface-web loading-state rule citation), `derive-rpc-error-state` (M2_DERIVED_ROW_PHASE), `already-registered-idempotent-reuse` (M2_SUSPECTED_MOVE_TRISTATE(b) + M2_REGISTER_IDEMPOTENT_HINT). The idempotent-reuse outcome closes the tri-state's branch (b), which the journey itself omits — good adversarial coverage.
3. **Verified against code**: confirm gating `disabled={issues.length > 0 || taskStorePhase.state === 'suspected-move'}` (RegisterForm.tsx:231) — the error phase is explicitly non-blocking ("非阻断确认位", derived-store-row.tsx / derive-source.ts). This contradicts one contract precondition (see Fact Alignment). np-error rendering with `role="alert"` (RegisterForm.tsx:218-222), StateChip 已注册 + idempotent hint (185-190), native picker cancel → null (dir-picker.ts), derive phase machine loading|ready|suspected-move|error (derived-store-row.tsx:26-30) all verified accurate.
4. **Pre-score anchor of concern**: Step 3 `suspected-move-rejected` Input says "确认注册" while its own State says "确认钮因 suspected-move 态禁用" — in the shipped code the suspected-move surface (error bar + guidance) manifests at the derive-row precheck upon directory selection, before any confirm click; with the button disabled, the stated Input cannot be performed as written.

## Phase 2 — Rubric Scoring

### 1. Completeness — 150/150

- **Four mandatory dimensions per Outcome (50/50)**: all 13 outcomes across 3 files carry non-empty Preconditions, Input, Output, State; Side-effect present on all; Invariants present on 2. `picker-cancel-unchanged` State "零变更（取消点在注册执行之前，零副作用）" is a valid state description.
- **Journey Invariants section (50/50)**: present in all three files, 4 entries each, verbatim from journey.
- **Happy path + required derived scenarios (50/50)**: web mandatory outcomes adjudicated in every file with written rationale ("session-expired N/A — 本地单人工作台无服务端会话凭据"); `validation-error-confirm-gated` realizes the mandatory validation-error face in Step 3 with `<!-- surface-required: web validation-error（表单提交步骤必派生） -->`. Boundary coverage exceeds the journey (cancel, picker failure, loading, rpc error, idempotent reuse).

### 2. Semantic Purity — 184/200

- **Natural language, no regex/selectors/assertions (80/80)**: no regex, CSS/XPath, or framework assertion calls anywhere in dimension values. `{tasksHome}/{flatten}@{hash8}` is a value-format descriptor; `role=alert` is web-surface accessibility vocabulary (sanctioned by surface-web.md's accessibility principle).
- **Declarative preconditions (60/60)**: all preconditions describe holding state ("hero CTA / 侧栏 ＋ 入口可达注册表单；…候选工作区目录在盘上存在", "曾因疑似移动被拒绝（表单处于错误态）"), not setup procedures.
- **No implementation coupling (44/60)** — two deductions:
  - Step 2 `derive-in-flight-loading` state_requirements: "派生 RPC 在途（**fetchDerivePhase 未决**）" — `fetchDerivePhase` is a web-internal function name (derive-source.ts), not an observable. The behavior-level statement "派生 RPC 在途" already suffices. (-8)
  - Step 1 `picker-failure-error-shown` Preconditions: "OS 目录选择器调用失败（桥错误或系统对话框不可用，**nativePickError 非 null**）" — internal component state variable; the observable is "选择器返回失败" (which the Input already states). (-8)

### 3. Precondition Exclusivity — 122/150

- **Distinctness across Outcomes (40/60)**: one ambiguous pair. `validation-error-confirm-gated` Preconditions: "表单存在字段校验问题（…），**或派生行处于非 ready 态**" — the phase machine is loading|ready|suspected-move|error, so "非 ready" subsumes suspected-move, which is exactly the triggering state of `suspected-move-rejected` ("目标存储目录不存在，但发现同扁平化主体、异 hash8 的既有目录（疑似移动）"). A form in suspected-move phase with clean fields matches both outcomes' preconditions. -20 per ambiguous pair.
- **Sufficient to uniquely select (42/50)**: Step 2 `success` ("注册表单已选定工作区目录；forge:projects/deriveTaskStoreDir RPC 可达；tasksHome 已定") does not exclude the same-flatten-subject world, so it is simultaneously satisfiable with `same-flatten-subject-disambiguation` ("存在扁平化后主体相同的多个工作区路径…"). Step 3's `success` was written carefully ("无同扁平化主体异 hash8 的既有目录（正常新建态）") — the same care was not applied in Step 2. (-8)
- **Error/boundary triggers explicit (40/40)**: every non-happy outcome names its trigger (picker cancel, picker failure, RPC in-flight, RPC failure, collision, prior rejection, already-registered).

### 4. Fact Alignment — 114/150

- **Factual claims traceable (36/60)**:
  - **Misaligned claim (-15)**: `validation-error-confirm-gated` precondition "或派生行处于非 ready 态" contradicts M2_DERIVED_ROW_PHASE: "Confirm button disabled when field issues present **OR phase = suspected-move**" — loading and error phases do NOT gate (error is explicitly "非阻断确认位" per derived-store-row.tsx/derive-source.ts; verified RegisterForm.tsx:231). The same outcome's Output states the code-correct condition ("disabled = issues 非空 或 suspected-move 态"), so the precondition text is the sole carrier of the error. A downstream test keying on the precondition would assert a non-existent gate for loading/error phases.
  - **No fact_id citations on factual outcomes (-9)**: the five non-inferred outcomes (success ×3, disambiguation, suspected-move-rejected, reselect-recheck) assert specific state changes and error surfaces with zero fact references; only inferred outcomes carry reasoning comments. Claims were verified accurate by this scorer against M2_DERIVE_DIR_RULE, M2_SUSPECTED_MOVE_TRISTATE, M2_REGISTER_IDEMPOTENT_HINT, FORM_DEFAULTS, FORM_VALIDATION, M2_DB_SEVEN_TABLES, FLOW_OUTCOME_COPY — so no hallucination, but traceability is implicit, not documented.
- **Inferred claims rule support (38/50)**: all five inferred outcomes carry `source: inferred` with reasoning. Only `derive-in-flight-loading` cites the surface rule as required ("surface-web 规则 additional outcome「loading-state」的承载面"). The other four cite facts/code rather than a required_outcomes rule: `picker-failure-error-shown`'s reasoning says "Fact Table 前端侦察（RegisterForm.tsx:218-222）" but the fact table contains no entry describing np-error rendering (nearest is M2_E2E_ANCHOR_SET's anchor-family listing "np-error") — the claim is true per source code, but the stated provenance ("Fact Table") does not contain it, and no network-error-class rule citation is given. (-12)
- **No hallucinated unclassified claims (40/40)**: none found; every checked claim resolved to a fact, the design, or verified source behavior.

### 5. Surface Fitness — 95/100

- **Mandatory derived outcomes (40/40)**: validation-error realized as an outcome in Step 3; session-expired adjudicated N/A with consistent journey-level rationale in all three files.
- **Surface-appropriate language (30/35)**: interactions ("从 hero CTA 或侧栏 ＋ 打开 OS 目录选择器", "点击「确认」"), page elements (派生行, 错误条, StateChip, FieldIssue), async semantics (loading 态, RPC 在途) — proper web vocabulary throughout. Deduction: internal state variable names leak into preconditions ("nativePickError 非 null"), which is component-state language, not user-observable surface language. (-5)
- **TUI timeout outcomes (25/25)**: N/A for web — full marks.

### 6. Internal Consistency — 130/150

- **Invariants hold in every contract (50/60)**: no behavioral invariant violation (no web self-computation, no side effects on suspected-move, single core write gate respected). Deduction: token drift between the invariant blocks ("建库位置恒为 **{dsh-forge-home}**/{扁平化}@{hash8}") and the contracts' own state/precondition text ("任务库目录 **{tasksHome}**/{flatten}@{hash8} 创建", "tasksHome 已定（env DSH_FORGE_TASKS_HOME 覆盖 > {userData}/forge-workspaces 默认）"). M2_DERIVE_DIR_RULE names the root {tasksHome}; nothing in the contracts reconciles the two tokens, and a test implementer must guess they denote the same root. (-10; inherited from the journey, but the contracts propagate it into both invariant and state text without a note.)
- **Cross-Contract state references (40/50)**: Step 2 presumes Step 1's selection; Step 3 presumes Step 2's ready phase; reselect-recheck's history reference is unambiguous. Deduction: `suspected-move-rejected` is internally incoherent between Input and State — Input: "确认注册" vs State: "表单留场（**确认钮因 suspected-move 态禁用**）". If the button is disabled, the Input cannot be performed; in the shipped code the error bar + guidance appear at the derive-row precheck (upon directory selection), not as a response to a confirm click. (-10)
- **Preconditions achievable from preceding States (40/40)**: all Step 2/3 preconditions are reachable from Step 1/2 states or declared fixtures; no unreachable ordering found.

### 7. Anchor Integrity — 80/100

Handbook `design/page-map.md` exists; web anchor field = `page`. Handbook page inventory: dswf-overview, dswf-doc, 任务详情抽屉, 转移状态对话框, 会话头挂接 pill 行, **注册表单派生行**.

#### Missing Anchor Fields

| Contract | Required field | Status |
|---|---|---|
| step-1-select-workspace-dir.md | `page` | present |
| step-2-view-derived-store-row.md | `page` | present |
| step-3-confirm-registration.md | `page` | present |

No missing fields (route empty is correct — page-map: "不适用——M2 无新路由"; `requires_auth: false` consistent with the session-expired N/A adjudication).

#### Handbook Conflicts

None — page-map.md has 6 distinct pages, no duplicate or conflicting definitions (30/30).

- **Anchor field completeness (40/40)**: `page` present in all three contracts.
- **Anchor values match handbook (10/30)**: two mismatches.
  - Step 1: `page: "注册表单（hero CTA / 侧栏 ＋ 入口）"` — not a handbook page identifier. The handbook entry is "注册表单派生行" (whose 入口 column already covers "hero CTA / 侧栏 ＋ → OS 选择器 → 表单"). (-10)
  - Step 3: `page: "注册表单（确认门）"` — likewise not a handbook identifier; the confirm gate is part of the same RegisterForm face. (-10)
  - Step 2: `page: "注册表单派生行（升级）"` matches the handbook section heading "注册表单派生行(升级)" modulo full/half-width parentheses — accepted as matching.
  - The stage-qualifier style is human-resolvable (only one form face exists in the handbook), but it defeats literal anchor lookup, which is the point of the field.

### 8. Fixture Specification — 69/100

Semantic entity verification: `Project` matches the central projects table (ER/model); `WorkspaceDir` and `TaskStoreDir` are not ER tables but are the file-system domain concepts this journey operates on (Cross-Layer Data Map "派生目录 | 文件系统"; registry/ws_path domain) — accepted as domain entities. Per-outcome fixture_specs plus consolidated file-level blocks present in all files.

- **Entity completeness (24/40)**: operated-on entities are all declared (WorkspaceDir everywhere; TaskStoreDir where relevant; Project for already-registered). Gap: Step 3 `success` Output asserts "注册成功 + 建库（**含发现面只读扫描建行——docs/features 与 docs/proposals 目录约定扫描**）" and State enumerates "发现面行：features / feature_documents / proposals" — yet no fixture declares the source documents being discovered (no constraint on WorkspaceDir such as "contains docs/features/<slug>/ manifest + docs/proposals/<slug>/proposal.md"). With an empty workspace the discovery scan creates zero rows and the asserted row creation is unverifiable/vacuous. The entity types named in the State change are absent from fixture_spec.entities; the veto was considered and not applied because they are created-by-step rows nested in the declared TaskStoreDir (the pipeline's own fixture-spec.md defines fixture_spec as *pre-existing* data), and every pre-existing operated entity is declared — but the missing discovery-source fixtures are a real test-sufficiency hole. (-16)
- **Relationship and constraint coverage (28/35)**: relationships consistently declared (`relationship_type`/`parent_entity` on TaskStoreDir and Project); strong constraints where it matters ("hash8Suffix: 互不相同", "canonicalWsPath: 与表单选定目录 canonical 相等", "hash8Consistent: true"). Defects: `validation-error-confirm-gated` models form state as a WorkspaceDir field ("field: formFieldIssues") — form issues are not a field of the directory entity; `picker-failure-error-shown` constraints the WorkspaceDir with "selectable: false", misattributing a picker-bridge failure to the directory entity. (-7)
- **Minimum data quantity (17/25)**: counts are right where they matter (reselect WorkspaceDir=2; disambiguation WorkspaceDir=2 + TaskStoreDir=2). Defect: Step 3 `success` declares TaskStoreDir with `min_count: 1` alongside field constraint "exists: 将由本步骤创建（注册前不存在）" — the schema says min_count is the number of instances that must exist *before* the step (>=1), so the two signals instruct opposite fixture actions; a generator keying on min_count would pre-create the store dir and silently weaken the "任务库目录…创建" assertion (scenario fortunately does not flip out of the normal-new branch since a same-hash pre-created dir triggers no collision). The same absence-vs-min_count pattern recurs in `reselect-recheck-passes` ("collisionFree: true" on a pre-existing TaskStoreDir whose referent is undefined — the orphan was disposed or a different dir selected). (-8, one defect class, two instances)

### Cross-Dimension Coherence Check

One root flaw propagates across three dimensions and is penalized where it most clearly manifests: the imprecise gating language "或派生行处于非 ready 态" — Fact Alignment (contradicts M2_DERIVED_ROW_PHASE; loading/error do not gate), Precondition Exclusivity (overlaps suspected-move-rejected), noted in Internal Consistency without additional deduction (the same outcome's Output carries the correct condition). Secondary theme: identifier discipline (handbook page anchors, internal variable names, {dsh-forge-home}/{tasksHome} tokens) — each docked in its home dimension only.

## Phase 3 — Blindspot Hunt

1. **[blindspot] BrowsePanel fallback face has no outcome** — Step 1 state_requirements: "OS 原生目录选择对话框可用（桥在场；缺席时回退内嵌浏览器面板）" — the fallback is named as state but never exercised as an outcome. Per E2E_INFRA, bridge-absent contexts are a real e2e configuration; the journey assumes picker availability, but the contract explicitly acknowledges the fallback exists and then leaves it untested. Improve: add a fallback-path outcome or scope the step to bridge-present runs.
2. **[blindspot] Step 2 covers 3 of the 4 derive-row phases** — M2_DERIVED_ROW_PHASE defines loading|ready|suspected-move|error; Step 2 covers loading/ready/error and `derive-rpc-error-state` explicitly carves out the business code ("非 ERR_SUSPECTED_MOVE 业务码"), yet the suspected-move *phase display* (error bar + manual guidance rendered at the derive row upon selection, before any confirm) has no Step 2 outcome. It is only represented in Step 3 behind Input "确认注册" — an action that is disabled in that very state ("确认钮因 suspected-move 态禁用"). Improve: either a Step 2 suspected-move-phase outcome (guidance appears on selection, confirm disabled) or reframe Step 3's Input as "attempt confirm on a suspected-move form".
3. **[blindspot] Registration execution-failure face untested** — Step 3 success Side-effect: "文件系统建目录 + 建库；注册闭包尾部不发射任务事件" — the confirm step can also fail mid-execution (ERR_WORKSPACE_CREATE / ERR_PROJECT_WRITE compensated / ERR_COMPENSATION; BIZ-workspace-001..004 compensation chain; FLOW_OUTCOME_COPY failure branches). Journey scope legitimately excludes it, but the contracts' Step 3 covers every other non-happy branch; a scoping note would prevent a test author from assuming confirm is binary (gate-pass → success).
4. **[blindspot] SC2 single-source assertion lacks a fixture-side pin** — Step 3 success Output: "实际建库位置与展示串逐字一致（SC2 单源断言）" — the journey's core guarantee, yet no fixture constraint pins the expected derivation (e.g., hash8 = sha-256(fixture path) first 8 hex) so a test can assert the literal string against a computed expectation. The disambiguation outcome gets "互不相同"; the primary SC2 anchor gets nothing. Improve: field_constraint carrying the expected derived dir (or its derivation inputs) for the fixture WorkspaceDir.
5. **[blindspot] min_count cannot express pre-state absence** — the schema's `min_count >= 1` vs the success scenario's "注册前不存在" forces authors into self-contradictory declarations (see Fixture scoring). Tooling-level fix: allow min_count: 0 or a dedicated `must_absent` declaration; reviser should at least move the absence note into state_requirements where it cannot collide with min_count semantics.

## Final Score Summary

| Dimension | Score | Min | |
|---|---|---|---|
| Completeness | 150/150 | 90 | pass |
| Semantic Purity | 184/200 | 120 | pass |
| Precondition Exclusivity | 122/150 | 90 | pass |
| Fact Alignment | 114/150 | 90 | pass |
| Surface Fitness | 95/100 | 60 | pass |
| Internal Consistency | 130/150 | 90 | pass |
| Anchor Integrity | 80/100 | 60 | pass |
| Fixture Specification | 69/100 | 60 | pass |
| **Total** | **944/1100** | **935** | **PASS** (barely — 9 margin) |

**Priority fixes for reviser (highest leverage first)**:
1. Rewrite `validation-error-confirm-gated` precondition: replace "或派生行处于非 ready 态" with "或派生行处于 suspected-move 态" (aligns with M2_DERIVED_ROW_PHASE and removes the overlap with `suspected-move-rejected`).
2. Align Step 1/Step 3 `page` anchor values to the handbook identifier "注册表单派生行" (keep stage context in `layout` or body text, not the anchor).
3. Seed discovery-face fixtures: WorkspaceDir constraint for docs/features + docs/proposals content, so "发现面只读扫描建行" is assertable; resolve the TaskStoreDir min_count-vs-absence contradiction (state_requirements instead of entities for the must-not-exist target).
4. Purge internal identifiers from dimension values (`fetchDerivePhase`, `nativePickError`).
5. Reconcile {dsh-forge-home} vs {tasksHome} with a one-line equivalence note; reframe suspected-move Input vs disabled-button tension.
