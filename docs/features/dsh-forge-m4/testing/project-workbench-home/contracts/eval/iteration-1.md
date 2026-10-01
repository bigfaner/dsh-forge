# Contract Eval Report — project-workbench-home / iteration 1

- **Scorer**: contract-set adversarial scorer (forge:eval-contract rubric, 1100-pt / 8 dimensions)
- **Date**: 2026-09-30
- **DOC_DIR**: `docs/features/dsh-forge-m4/testing/project-workbench-home/contracts/`
- **Scope note**: orchestrator brief said "10 Contract files"; the directory contains **6 Contract files** (step-1..step-6) carrying **10 Outcomes** total. Scored as found.
- **Context verified against**: `design/page-map.md` (handbook), `.forge/fact-table.json` (FT-001..FT-135), `docs/business-rules/*` (all six), `design/er-diagram.md` + `design/tech-design.md` Data Models, `gen-journeys/rules/surface-web.md`, source `journey.md`.

## Verdict

**PASS** — Total **1018/1100** (≥935) and every dimension above threshold.

## Phase 1 — Reasoning Audit (cross-Contract state chain)

| Link | Step N precondition | Achievable from Step N−1 State? |
|------|--------------------|-------------------------------|
| 1→2 | "应用处于项目工作台;≥2 注册项目(活跃+归档)" | Yes — Step 1 State "active_project_id 恢复指向;首屏路由形态 = project 工作台" |
| 2→3 | "应用处于项目 A 工作台;项目 B 已注册且含数据" | Yes — Steps 1–2 leave 2 projects registered, pointer on A; B's data declared in Step 3's own fixture |
| 3→4 | "应用处于某活跃项目工作台;该项目含提案/feature/任务/阶段资产数据" | Yes — Step 3 State "active_project_id 由 A 改写为 B"; asset entities declared in Step 4 fixture |
| 4→5 | "…含提案/feature/任务/阶段资产与看板数据(发起链可用)" | Yes — Step 4 fixture seeds the same asset set |
| 5→6 | "此前已将活跃项目切到目标项目(Step 3)" | Yes — explicit, resolvable reference; Step 3's success Outcome sets exactly this state |

No dangling cross-Contract references; no unreachable preconditions. The chain is sound.

## Phase 2 — Dimension Scores

### 1. Completeness — 144/150 (threshold 90, PASS)

- **Four mandatory dimensions per Outcome (50/50)**: all 10 Outcomes across 6 files carry non-empty Preconditions / Input / Output / State; Side-effect explicit everywhere ("none" where absent); Invariants present on happy Outcomes.
- **Journey Invariants section (50/50)**: every file has `## Journey Invariants` with the full 5-invariant set, verbatim-consistent with `journey.md` "Journey Invariants".
- **Happy + mandatory derived coverage (44/50)**: happy Outcome in all 6 files; derived/boundary Outcomes on steps 1 (empty-first-boot), 3 (path-degraded-switch), 4 (workbench-load-error), 6 (last-active-deleted). Deduction −6: steps 2 and 5 are happy-only despite being IPC-fed read faces (Step 2 data = "ctx.workspaces/ctx.sessions + listProjects IPC" per its own anchor; Step 5 opens four views). The same load-failure scenario that produced Step 4's `workbench-load-error` is applicable but unaddressed there; coverage is uneven rather than absent.

### 2. Semantic Purity — 192/200 (threshold 120, PASS)

- **Natural language, no code/regex (80/80)**: zero regex constructs, CSS selectors, XPath, or assert calls in any dimension value across all 6 files. Values describe what the system presents ("左栏项目树、中间会话面板、右栏 dockkit 三区容器整台呈现").
- **Declarative preconditions (60/60)**: all Preconditions are state descriptions ("应用处于项目 A 工作台;项目 B 亦已注册且含会话/worktree 状态/任务数据"), not setup procedures.
- **No implementation coupling (52/60)**: −8. Step 1 State embeds an internal verb call: `"active_project_id 恢复指向(getState.activeProjectId = 上次活跃项目)"` — `getState.activeProjectId` is an IPC verb/DTO accessor, exactly the "internal function call" class the rubric excludes from dimension values. All other occurrences of this kind (`selectPanel(null)`, `ctx.workspaces`, `listProjects IPC`, `TabKind` whitelist) are confined to frontmatter anchors or HTML verification comments, where they belong. Event names in Side-effect ("project_list_changed 事件族") are treated as observable domain behavior, not coupling.

### 3. Precondition Exclusivity — 132/150 (threshold 90, PASS)

- **Distinct across Outcomes (60/60)**: no two Outcomes in any Step share identical or equivalent Preconditions (Step 1: ≥2 projects vs zero; Step 3: healthy B vs degraded B; Step 4: loads vs fail-injected; Step 6: valid pointer vs dangling).
- **Sufficient to uniquely select (32/50)**: two deductions.
  - −10 Step 3: `success` Precondition "项目 B 亦已注册且含会话/worktree 状态/任务数据" does not exclude the degraded state — a project whose directory is unreadable can still satisfy it (session/task data live in host/DB). The discriminator ("路径探测失败") exists only on the `path-degraded-switch` side, so the pair is excluded one-sidedly; `success` should state "B 路径探测正常".
  - −8 Step 6 `last-active-deleted`: Precondition "其余项目或零项目存在" spans two sub-states while the Output hedges to match ("首屏落到其余项目或空态"); given the precondition alone, the expected landing is not uniquely determinable.
- **Error triggers explicit (40/40)**: every boundary Outcome names its trigger — "无任何注册项目(…注册表零行)", "路径探测失败(路径健康 degraded,如目录已不可读)", "数据加载出错(通道异常/数据缺失…加载必失败)", "上次活跃项目已被删除(指针悬挂)".

### 4. Fact Alignment — 139/150 (threshold 90, PASS)

- **Factual claims traceable (49/60)**: FT citations are present and **accurately cited** (verified against `.forge/fact-table.json`): FT-134 (active pointer, single app_state row) on steps 1/3/6; FT-133 (listProjects v3 archived/sortOrder) on step 2; FT-113 (TabKind five kinds) on steps 4/5; FT-131 (DetectReport readable/gitRoot) on step 3. BIZ-resilience-001 and BIZ-workbench-002 cited on steps 3b/6b match `docs/business-rules/resilience.md` / `workbench.md` verbatim semantics. Deductions: −5 threshold facts asserted without citation — Step 6 Output/Invariants "首屏呈现 ≤2s(500 任务规模计测)" (BIZ-workbench-005) and Step 3 Side-effect "project_list_changed 事件族" (FT-135) are load-bearing numbers/event names left uncited in their files; −6 Step 6b Output disjunct "首屏落到其余项目" has **no supporting fact**: FT-134/BIZ-workbench-002 establish removal clears the pointer *with no auto-activate of the next project*, and no fact defines boot behavior for a null/dangling pointer with surviving projects — this branch is an unverified claim inside an inferred block.
- **Inferred claims have rule support + annotation (50/50)**: all four derived Outcomes carry `<!-- source: inferred -->` plus a reasoning basis. Surface-mandated derivations explicitly map the rule: Step 1 "surface-web required_outcomes 映射:validation-error → …添加项目确认卡路径输入…(操作细节由注册旅程承载)"; Step 4 maps both "network-error → …error 态明确错误 + 重试入口" and "session-expired → 桌面壳无独立登录会话,最近似面 = 宿主/数据通道失联". Journey-edge-derived Outcomes (3b/6b) cite journey Step 3b/6b + BIZ rules — correctly classified as reasonable inference.
- **No unclassified hallucinations (40/40)**: no claim found that is neither traceable (fact table / business rules / page-map / journey) nor inferred-with-basis. The stage-asset sub-tab claim (see Anchor Integrity) is journey/PRD-sourced, not hallucinated.

### 5. Surface Fitness — 97/100 (threshold 60, PASS)

- **Mandatory derived Outcomes present (40/40)**: surface-web `required_outcomes` = validation-error + session-expired; both are explicitly considered with justification (Step 1 validation-error mapping incl. deferral of operational detail to the registration journey; Step 4 session-expired mapping to host/data-channel loss, since the desktop shell has no login session). Neither is silently dropped.
- **Surface-appropriate language (32/35)**: user interactions (点击项目行/查看左栏/展开右栏子 tab), page elements (hero 引导/角标/骨架屏/重试按钮), async semantics (重启恢复/loading 不永久滞留) — proper web-appropriate vocabulary throughout; no CLI/exit-code or API/status-code leakage. −3: Step 1's State uses a desktop IPC verb (`getState.activeProjectId`) where a user/page-state phrasing belongs (same instance as Semantic Purity −8, counted lightly here for surface register).
- **TUI timeout criterion (25/25)**: non-TUI surface — full marks by rule.

### 6. Internal Consistency — 150/150 (threshold 90, PASS)

- **Invariants hold in every Contract (60/60)**: no Contract violates any of the 5 journey invariants. Notable checks: Step 4b error state and Step 3b degraded state are explicitly inside the invariants' carve-outs ("除 error/降级态外,三区容器为常驻结构"); Step 1 empty-first-boot's "不渲染空项目树、不渲染空三区骨架" is outside the invariant's scope (same-page visibility is guaranteed "在项目切换与重启之间", i.e., the with-projects journey); Step 6b landing still satisfies "项目工作台恒为启动首屏" (empty state is the workbench's empty representation per page-map "无项目 → 空态引导").
- **Cross-Contract references consistent (50/50)**: Step 6's "(Step 3)" / "指向 Step 3 切换后的目标项目" resolves unambiguously to Step 3's success State ("active_project_id 由 A 改写为 B"); no dangling references.
- **Preconditions achievable from preceding State (40/40)**: verified link-by-link in Phase 1; per-step fixtures self-declare any data not produced by earlier steps (e.g., Step 4/5's Proposal/Feature/Task/StageAsset, Step 6's Task ×500).

### 7. Anchor Integrity — 90/100 (threshold 60, PASS)

Handbook `design/page-map.md` exists for web → dimension active.

- **Anchor field completeness (40/40)**: all 6 Contracts carry `anchors.web.page` (plus route/requires_auth/layout extras). Required `page` field missing nowhere.
- **Anchor values match handbook (20/30)**: −10 for one root mismatch. Step 4's layout anchor and Output assert the overview has **four** sub-tabs — `"右栏概览子 tab:提案/feature/任务/阶段资产"` / Input "依次点开提案/feature/任务/阶段资产子 tab" — while the handbook defines **three**: page-map "项目概览(提案·feature·任务三子 tab)" (line 33), corroborated by SC2 ("右栏概览子 tab:提案/feature/任务") and prd-ui-functions ("概览(三子 tab)"). Step 5's page qualifier "阶段资产面板" repeats the same unsupported view. Root cause is a genuine upstream conflict: PRD 必答② migration table (prd-spec.md line 153: "M3 阶段资产面板 → 项目页 forge 文件区(右栏概览子 tab)") vs SC2/page-map/ui-functions — but the Contract's obligation is to match the handbook, and it does not. Counted once (one design fact, two anchor locations). All other anchors resolve cleanly: "项目工作台·左栏项目树(C3)" and "右栏 dockkit(C2)" match page-map section names; step 1/6 page anchors resolve to the "项目工作台" entry (paraphrased parentheticals — "原生 conversation 面板 + forge 注入层" vs handbook "conversation 面板 + 注入层" — judged resolvable, not mismatched); board dual-homing on Step 5 matches "任务看板(右栏 pane / 拆出窗口双宿主)".
- **Handbook internal consistency (30/30)**: no page in page-map carries conflicting view keys, routes, or navigation paths; board's dual homing is a single declared intent, not a conflict. (The page-map↔PRD-必答② conflict above is a cross-document drift, not a handbook-internal one; handbook-internal criterion unaffected — flagged below as a design-sync blindspot.)

### 8. Fixture Specification — 74/100 (threshold 60, PASS)

No veto triggered: every entity *type* named or semantically required by Preconditions/Input is declared, and all declared entity types pass semantic verification against design entities — Project→`projects`, AppState→`app_state`, Task→`task`, Proposal→`proposal_snapshot`, Feature→`feature_snapshot`, StageAsset→`stage_asset` (er-diagram.md), Session→upstream `ctx.sessions` domain entity (tech-design Interface 3 / Cross-Layer Data Map). The activation pointer's *data* is conveyed even where its entity is misplaced (see below), so seedability is preserved — graded, not vetoed.

- **Entity completeness (24/40)**: −8 ×2. Step 3 `success` and Step 6 `success` both mutate/read `active_project_id` in State ("active_project_id 由 A 改写为 B"; "active_project_id 跨重启持久并恢复指向") yet omit the `AppState` entity from `fixture_spec.entities`, encoding the pointer instead as **columns that do not exist on `projects`** in the design: Step 3 `field: "active"`, Step 6 `field: "active_project_id"` (er-diagram places `active_project_id` in `app_state`; `projects` has no such columns). Steps 1 and 6b show the generator knows the correct convention (AppState declared) — steps 3/6-success deviate from it.
- **Relationship & constraint coverage (25/35)**: all child entities declare `relationship_type: belongs_to` + `parent_entity`; archived split and project attribution constraints are correct. −5 Step 6b `last-active-deleted` constrains a non-existent column `field: "status"` (should reference `archived`/existence); −5 StageAsset (and Task) fixture entities declare only `parent_entity: Project`, eliding the feature-scoped keying (`stage_asset` PK = project_id+feature_slug+stage; task_key = `<featureSlug>/<localId>`) even though `Feature` is in the same fixture — the feature parent link a seeder needs is implicit.
- **Minimum data quantity (25/25)**: all sufficient — Project ×2 splits for active/archived and A/B switching; Task ×500 on Step 6 matching the SC6 500-task scale assertion; ≥1 per overview sub-tab data class on Step 4; Proposal ×2 / Task ×3 / StageAsset ×2 on Step 5 for multi-item inspection views; zero-row Project state for empty-first-boot.

## Deduction Log

| # | Dimension | Δ | Evidence |
|---|-----------|---|----------|
| D1 | Completeness | −6 | Steps 2/5 happy-only despite IPC-fed read faces (step-2 anchor "ctx.workspaces/ctx.sessions + listProjects IPC"); load-error scenario covered only at Step 4 |
| D2 | Semantic Purity | −8 | step-1 State "(getState.activeProjectId = 上次活跃项目)" — IPC verb in dimension value |
| D3 | Precondition Exclusivity | −10 | step-3 `success` lacks "B 路径健康" discriminator vs `path-degraded-switch` (one-sided exclusion) |
| D4 | Precondition Exclusivity | −8 | step-6b "其余项目或零项目存在" precondition spans sub-states; Output "落到其余项目或空态" not uniquely determinable |
| D5 | Fact Alignment | −5 | Uncited threshold facts: ≤2s (BIZ-workbench-005) step-6; `project_list_changed` (FT-135) step-3 |
| D6 | Fact Alignment | −6 | step-6b "首屏落到其余项目" — no fact defines null/dangling-pointer boot landing; contradicts no-auto-activate drift (FT-134/BIZ-workbench-002) |
| D7 | Surface Fitness | −3 | step-1 State uses desktop IPC register (`getState.activeProjectId`) in web Contract dimension |
| D8 | Anchor Integrity | −10 | step-4 anchor/Output assert 阶段资产 as 4th overview sub-tab vs page-map "提案·feature·任务三子 tab" (also in step-5 qualifier) |
| D9 | Fixture Specification | −16 | AppState entity omitted in step-3-success/step-6-success; pointer encoded as non-existent `projects` columns ("active", "active_project_id") |
| D10 | Fixture Specification | −5 | step-6b `field: "status"` — not a `projects` column |
| D11 | Fixture Specification | −5 | StageAsset/Task feature-parent relationship elided (parent_entity Project only) |

## Threshold Table

| Dimension | Score | Threshold | Result |
|-----------|-------|-----------|--------|
| Completeness | 144/150 | 90 | PASS |
| Semantic Purity | 192/200 | 120 | PASS |
| Precondition Exclusivity | 132/150 | 90 | PASS |
| Fact Alignment | 139/150 | 90 | PASS |
| Surface Fitness | 97/100 | 60 | PASS |
| Internal Consistency | 150/150 | 90 | PASS |
| Anchor Integrity | 90/100 | 60 | PASS |
| Fixture Specification | 74/100 | 60 | PASS |
| **Total** | **1018/1100** | **935** | **PASS** |

## Phase 3 — Attack List (blindspots)

1. **[blindspot][Anchor Integrity/Internal Consistency] 阶段资产 sub-tab四元 vs 三元冲突** — step-4 Output: "依次点开提案/feature/任务/阶段资产子 tab" vs page-map line 33: "项目概览(提案·feature·任务三子 tab)". Root conflict lives upstream (PRD 必答② line 153 "M3 阶段资产面板 → 右栏概览子 tab" vs SC2/page-map/ui-functions "三子 tab"); a gen-test-scripts run against a handbook-conformant build fails here. Requires design reconciliation (page-map or PRD), then Contract regen.
2. **[blindspot][Fixture Specification] AppState 指针实体错挂** — step-6 success: `entity_type: "Project" … field: "active_project_id"` (and step-3 `field: "active"`); er-diagram: active_project_id ∈ app_state. Same set declares AppState correctly in step-1/step-6b — internal convention drift a seeder will trip on.
3. **[blindspot][Fact Alignment] 悬挂/空指针启动落点无事实支撑** — step-6b Output "首屏落到其余项目或空态(hero 引导)": FT-134 只定义"移除事务内清空且不自动激活下一项目"; 空指针+存活项目时的启动落点无任何 FT/page-map 定义,"落到其余项目"分支要么补事实要么标 UNKNOWN。
4. **[blindspot][Precondition Exclusivity] step-3 成功/降级单向互斥** — success 未声明 "B 路径探测正常",降级 B 的 fixture 可同时满足两者;补一句路径健康前置即可闭合。
5. **[blindspot][Completeness] 读面边界结果不均衡** — step-2 项目树(listProjects/ctx 数据面)与 step-5 四视图巡检均无加载失败/降级 Outcome;step-4 的 network-error 映射未外推到同构数据面。
6. **[blindspot][Semantic Purity] State 维度携带 IPC 动词** — step-1 "(getState.activeProjectId = 上次活跃项目)";应改为纯状态描述并下沉到 state-verification 注释。
7. **[context, not scored] journey.md 路由口径滞后** — journey Step 1 Expected Result: "首屏 = 项目工作台(/p/:projectId,2026-09-27 裁决)" vs page-map T1 (2026-09-28): "上游 SPA 无 URL 路由…selectPanel(null)"。Contracts correctly follow the newer handbook; the journey doc should be synced to avoid regen drift.
8. **[scope note] 文件数与编排者简报不符** — DOC_DIR 含 6 个 Contract 文件(10 个 Outcome),非简报所述 "10 Contract files";按实际存在评分。
