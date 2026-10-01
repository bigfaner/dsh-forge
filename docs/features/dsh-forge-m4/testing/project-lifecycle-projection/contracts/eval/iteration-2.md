---
feature: "dsh-forge-m4"
journey: "project-lifecycle-projection"
rubric: "contract (1100pt / 8 dimensions)"
iteration: 2
date: "2026-09-30"
verdict: "FAIL (966/1100 ≥ 935 but Fixture Specification 0/100 — entity-completeness veto re-triggered on step-4 Session; dimension threshold 60 not met)"
scorer_stance: "adversarial verification; every deduction carries file + quote"
---

# Contract Set Evaluation — iteration 2

**Scope**: 5 Contract files (`step-1` … `step-5`) in `docs/features/dsh-forge-m4/testing/project-lifecycle-projection/contracts/`, **16 Outcomes** total (step-1 ×5, step-2 ×3, step-3 ×2, step-4 ×1, step-5 ×5 — iteration-1 header said "13"; actual count on page is 16).

**Evidence base consulted**: rubric `skills/eval/rubrics/contract.md`; surface rule `skills/gen-journeys/rules/surface-web.md`; handbook `design/page-map.md`; fact table `.forge/fact-table.json` (FT-117/119/123/124/125/126/127/133/134/135 re-verified verbatim); `docs/business-rules/workbench.md` (BIZ-workbench-001/002/006-M4); `design/er-diagram.md`; `design/tech-design.md` Interface 1/2/5; fixture schema `skills/gen-contracts/rules/fixture-spec.md`; journey `testing/project-lifecycle-projection/journey.md`; PRD `prd-spec.md` 必答④⑤ + `prd-ui-functions.md` UF1/UF3/UF7/UF8 (line 294「随时可改(左栏 ⋯ / 设置)」、line 340「生命周期动作」、line 160「已归档会话…设置页恢复入口(UF8)」). Revision delta confirmed via `git diff HEAD` (145 insertions / 62 deletions across the 5 files).

---

## Phase 1 — Reasoning Audit (re-verification of iteration-1 issues)

### 1a. Iteration-1 issue re-verification

| Iter-1 issue | Revision evidence | Verdict |
|---|---|---|
| **VETO 8.1** step-5b LayoutMemory absent | step-5 `archived-delete-branch` entities now: Project / Workspace / Session / **LayoutMemory** (min_count 1, belongs_to Project, `projectId = 待删归档项目(删除后级联清除)`) | **FIXED** |
| **8.2** Workspace only via state_requirements ×3 (1b/2b/5e) | step-1 degraded-retry, step-2 rename-projection-failure, step-5 delete-projection-failure all now carry `Workspace` in `entities` (min_count 1, belongs_to, path/title constraints); state_requirements retained only as supplementary channel-state (schema-conformant) | **FIXED** |
| **8.3** 5e Session absent | 5e entities now Project/Workspace/Session(cwd)/LayoutMemory | **FIXED** |
| **8.4** deviation-deleted-reordered: min_count 1 + pseudo `shape` | `shape` gone; Workspace min_count **2** + branch comments (删除分支 = 陈旧期望快照布景不物化宿主; 乱序分支 = ≥2 在位); fields = path/orderIdx (real columns) | **FIXED** (minor mechanical residual: min_count semantics per branch rely on comment prose) |
| **8.5** pseudo-fields batch | Normalized to real columns everywhere: `projectionState`/`displayName`/`archived` (Project), `path`/`title`/`orderIdx` (Workspace), `cwd`/`archived` (Session), `projectId`/`layoutJson` (LayoutMemory) — all match projects/workspace_projection/project_ui_state columns or IPC names (FT-133, Interface 1/2) | **FIXED** |
| **8.6** 5d comparison entities absent | confirm-cancel now seeds all four: Project/Workspace(title)/Session(cwd)/LayoutMemory | **FIXED** |
| **2.1** "(断言)" markers | All removed from step-2/3/5 Outputs. Residual lighter instances: step-1e "(UF3/UF8 接续断言)", step-3b "(UF1「不挂会话」断言)" | **MOSTLY FIXED** (−6 residual) |
| **2.3** impl coupling in State (FK cascade/同事务/plan 序/零投影 op) | Moved to comments; State now system-level ("期望快照与布局记忆等自有数据随项目删除一并清除;激活指针随删除清空,不自动激活下一项目"); "零投影 op"→"无投影推送" | **FIXED** (new smaller residuals, see 2.3 below) |
| **2.4** "project_list_changed 事件" in Side-effect ×4 | → "项目列表变更通知" with FT-135 channel detail in comment | **FIXED** |
| **2.5** state-machine arithmetic | → "投影自降级恢复为两侧一致(healthy)" + comment | **FIXED** |
| **3.1** step-2 success missing 新名非空 | success precondition now "…且提交的新名为合法名(非空且非纯空白)" | **FIXED** |
| **3.2** step-3 pair overlap | appended "本步骤为只读巡检,不执行归档动作" | **PARTIAL** (clause is step-nature, not a state discriminator; −4 residual) |
| **3.3** 5d procedural choice in precondition | → "删除确认对话已弹出且处于未决状态(尚未确认、尚未取消)" = state fact | **PARTIAL** (procedural phrasing gone; success∩cancel co-satisfiable, choice in Input; −3 residual) |
| **4.1** step-5 Output inferred unmarked | inline `<!-- source: inferred: UF1 × BIZ-workbench-002/FT-134 调和 -->` directly under Output | **FIXED** |
| **4.2** session-expired mapping marker one hop away | rule-mapping comment now on the contract outcome itself with rationale | **FIXED** (accepted: outcome provenance = journey Step 2b, correctly marked) |
| **4.3** 5e cascade set unmarked | Output cites BIZ-workbench-001 + comment enumerates the 11-table set; verified 1:1 against er-diagram Relationships | **FIXED** |
| **6.1** step-1 dual surface (设置节 vs 右栏概览) | Input now "编排者在右栏概览打开「投影与生命周期」投影状态行(UF8)" — single surface, matches anchor | **FIXED** |
| **7.1** step-2 anchor "生命周期动作·改名" | page now "项目工作台·左栏项目树(C3)项目行 ⋯ 菜单·改名" = canonical section + row language; route cites UF7 (verified: ui-functions line 294「随时可改(左栏 ⋯ / 设置)」) | **FIXED** |
| **7.2/blindspot-3** step-1e branch surface | anchor-note added: "该支路 anchor = N/A(上游原生,无 handbook 条目,不造页);接续断言面 = 左栏项目树(C3)会话行回树" | **DOCUMENTED** (residual: reconciliation lives in a comment, not in the anchor structure; fixture side still lacks grouping prerequisites — see dim 8) |

### 1b. Cross-Contract state chain (unchanged core, re-verified)

Step 1 (healthy read) → Step 2 ("项目已注册,投影通道就绪(healthy)" binds Step 1 State) → Step 3 ("活跃态" holds after rename; produces archived=1) → Step 4 (precondition "archived=1" binds Step 3 State; produces archived=0) → Step 5 success ("Step 4 恢复后" binds Step 4) / Step 5b ("不经 Step 4 恢复" explicit divergence from Step 3) / Step 5c ("承载项目删除已完成" binds Step 5). All references bind; no dangling. The narrative chain remains fully coherent.

**The residual audit defect is again at the fixture level — and it re-triggers the veto, this time on step-4** (pre-existing on page, unflagged by iteration-1, surfaced by applying iteration-1's own standard; see dimension 8).

---

## Phase 2 — Dimension Scores

### 1. Completeness — 150/150 (threshold 90)

- All 16 Outcomes: non-empty Preconditions / Input / Output / State; Side-effect explicit everywhere ("none" or concrete). 50/50.
- `## Journey Invariants` in all 5 files, 6 entries each, verbatim from journey.md. 50/50.
- Happy path per step; web-mandatory derived outcomes present with rule-mapping comments (validation-error → step-2 `rename-blank-input` + step-5 `confirm-cancel-zero-change`; session-expired → step-2 `rename-projection-failure`); all 11 journey edges (1b/1c/1d/1e/2b/2c/3b/5b/5c/5d/5e) covered 1:1. 50/50.

### 2. Semantic Purity — 182/200 (threshold 120)

| # | Deduction | Evidence |
|---|-----------|----------|
| 2.1 | −6 | Verification/traceability markers still inside Output values: step-1 `archived-sessions-zone` Output "会话行即时回左栏项目树**(UF3/UF8 接续断言)**"; step-3b Output "该项目会话不在当前工作台呈现**(UF1「不挂会话」断言)**" — Output should state what the system produces; the 断言/溯源 parenthetical belongs in a comment. |
| 2.2 | −2 | Residual event-narrative second clause in preconditions: step-2b "…;**确认改名时投影写入经此通道失败**"; step-5e "…;**删除确认时投影写入经此通道失败**" (leading clause is now declarative — improved from iteration-1). |
| 2.3 | −8 | Implementation coupling residual in dimension values: step-2b State "投影 degraded、**rename plan 保留**" (plan = ProjectionOp artifact); step-5c State "其余项目 **project_ui_state 行**原样保持" (table name; system-level = 布局记忆原样保持); step-5e Output "级联范围 = **projects 全部 FK 关系**" (DB vocabulary; detail already in comment); steps 3/4 State "**archived=1/0**" column literals (mild). |
| 2.4 | −2 | Non-state / design-commentary content in values: step-1e State "…;**实现归宿 = 上游原生设置面,M4 零代码**" (provenance, not a state); step-1e Output clause "会话归档…与项目归档…为两个归档面,互不混淆" (authoring caution, not system output). |

80−6 = 74; 60−2 = 58; 60−10 = 50. Total 74+58+50 = **182**.

### 3. Precondition Exclusivity — 141/150 (threshold 90)

| # | Deduction | Evidence |
|---|-----------|----------|
| 3.1 | −4 | step-3: success ("项目已注册且处于活跃态…投影 healthy") vs archived-partition-cross-project ("存在归档项目,且当前工作台活跃项目为另一项目**;本步骤为只读巡检,不执行归档动作**") — both states still co-occur in a ≥2-project world (1 archived + 1 active); the appended clause describes the step's own nature (procedural self-reference), not a system-state discriminator. Selection still rests on Input (执行归档 vs 巡检). Improved from iteration-1's −5 (clause added) but not a state fact. |
| 3.2 | −3 | step-5: confirm-cancel precondition is now a proper state fact ("删除确认对话已弹出且处于未决状态") — procedural phrasing fixed — but that state co-satisfies success's precondition (active restored project + dialog open); the confirm/cancel discriminator lives only in Input. Residual overlap. |
| 3.3 | −2 | step-1: success ("已注册 ≥2 个项目,投影健康(对账一致)") vs archived-sessions-zone ("存在经 UF3 …归档的会话") co-occur in any healthy world containing one archived session; different interaction surfaces make it unambiguous in practice (not deducted at iteration-1; recorded now for symmetry with 3.1/3.2 standard). |

Error/boundary triggers all explicit (workspace 不可写/宿主通道不可达; dsh 手改; 空输入; 归档态; 对话未决; 通道失败) — 40/40. step-1's four projection-state outcomes remain mutually exclusive on the FT-123 single-valued axis; step-5 success vs archived-branch exclusive on the archived axis; success vs delete-failure exclusive on the channel axis. 60−4 + 50−5 + 40 = **141**.

### 4. Fact Alignment — 150/150 (threshold 90)

Verified against fact table / PRD / BIZ / er-diagram / ui-functions (spot list):

- FT-123/124 (state machine, verdict bridge; deviation 仅呈现) ✅; FT-125 (rename op 经 relay) ✅; FT-126 (degraded 期望不丢失 / 重试收敛) ✅; FT-127 (fire-and-forget 竞态 → 终态 no-op) ✅; FT-133 (four lifecycle verbs, listProjects v3 columns) ✅; FT-134 (指针清空不自动激活) ✅; FT-135 (project_list_changed — now correctly confined to comments) ✅; FT-117/119 (forget 前置 / ProjectLayout v1) ✅.
- 必答⑤ table row-by-row (归档保留 workspace 仍分组 / 删除移除退未分组 / 改名同步) ✅; 必答④ 降级承诺 ✅; BIZ-workbench-001 移除级联范围(快照/挂接)✅; BIZ-workbench-002/FT-134 调和 — now inline-annotated `source: inferred` ✅.
- New verifications this iteration: step-2 route's UF7 quote「随时可改(左栏 ⋯ / 设置)」= ui-functions line 294 verbatim ✅; step-1e「已归档会话…设置页恢复入口(UF8)」= line 160 ✅; step-5e cascade comment's 11-table set = er-diagram Relationships 1:1 (workspace_projection / project_ui_state / session_links / task / dispatch / task_snapshot / feature_snapshot / prefs / stage_asset / proposal_snapshot / migration_event) ✅.
- All derived outcomes carry `source: inferred` + reasoning basis + rule mapping; the two PRD-gap inferences (空名行为、删除×降级) still honestly marked "记 open question 待 PRD 对账". Zero hallucinated/unclassified claims found.

Iteration-1's three deductions (4.1/4.2/4.3) each verified fixed. **150**.

### 5. Surface Fitness — 97/100 (threshold 60)

- Mandatory web outcomes present with mapping comments (validation-error ×2, session-expired ×1). 40/40.
- Web language: interactions (打开/确认/点击/取消/重进/搜索/逐条解除归档/展开偏差明细), page elements (左栏项目树/归档分区/行菜单/确认对话/状态行/降透明只读), async semantics (降级提示/待重试/恢复后重试). Iteration-1's leaks (幂等全量重推 / FK cascade / 同事务 / project_list_changed ×4) all moved out of values into comments. Residual leaks: "rename plan 保留" (step-2b State), "project_ui_state 行" (step-5c State), "projects 全部 FK 关系" (step-5e Output). −3. 32/35.
- TUI timeout criterion: N/A for web → 25/25.

**97**.

### 6. Internal Consistency — 148/150 (threshold 90)

- All 6 Journey Invariants hold in every Contract (归档≠删除 / 单向投影 / 确认对话 / 降级承诺含 5e 补全口径 / 不破坏 / ≤2s). No violations. 60/60.
- Cross-Contract references: every inter-step binding verified (Phase 1b) — none dangling; step-1's dual-surface defect fixed (Input now 右栏概览 = anchor). 48/50 after deduction:

| # | Deduction | Evidence |
|---|-----------|----------|
| 6.1 | −2 | step-1 `archived-sessions-zone`: the file-level anchor ("右栏概览·投影状态行") still does not cover the outcome's interaction surface (上游原生设置面「已归档会话」区); reconciliation is carried by an HTML comment ("该支路 anchor = N/A…接续断言面 = 左栏项目树(C3)") rather than structure — gen-test-scripts consumes frontmatter anchors, so the branch remains structurally un-anchored. Documented (improved from −5) but residual. |

- Precondition achievability from preceding States: verified ✓ (5b diverges before Step 4; 5c post-delete; 2/3/4 chain linear). 40/40.

**148**.

### 7. Anchor Integrity — 98/100 (threshold 60)

Handbook exists → active. All 5 files carry `anchors.web.{page, route, requires_auth, layout}` + `last_anchor_sync`; requires_auth=false matches "Auth: none(单用户桌面)"; all routes root at view key `project`. 40/40.

Value verification vs page-map:

- step-1 "右栏概览·投影状态行" ↔ Shared Components「投影状态行 | 右栏概览」✅ (iteration-1 dual-surface fixed).
- step-2 "左栏项目树(C3)项目行 ⋯ 菜单·改名" ↔ section 左栏项目树(C3) row language "项目行(归档分区/⋯ 菜单)" ✅ (iteration-1 7.1 fixed).
- step-4 "左栏项目树(C3)归档行菜单·恢复" ✅; step-5 "删除确认对话(C8 浮层)+ 左栏归档行菜单" ↔ 浮层 "C8 归档/删除确认" ✅.
- step-3 page "左栏项目树(C3)归档分区 **+ 生命周期动作·归档**" — 见扣分.

| # | Deduction | Evidence |
|---|-----------|----------|
| 7.1 | −2 | step-3 page composite: "生命周期动作·归档" is UF8/PRD vocabulary (ui-functions line 340「生命周期动作 | actions」) and a Route Guard discipline phrase ("C8 生命周期动作带确认 Dialog"), not a page-map Page Section or element; the canonical base (左栏项目树(C3)归档分区) carries the entry, but the appended term names an action, not a location. Lighter than iteration-1's 7.1 (which had no canonical base at all). |

Handbook internal consistency: page-map has no conflicting definitions. 30/30. **40 + 28 + 30 = 98**.

### 8. Fixture Specification — 0/100 (threshold 60) — **VETO RE-TRIGGERED (step-4)**

`fixture_spec` present in all 16 Outcomes. Entity semantic verification: Project→`projects`, Workspace→dsh workspace + `workspace_projection` (logical 1:1), Session→upstream session domain (Interface 3 `ctx.sessions`; Interface 2 cwd-canonical grouping), LayoutMemory→`project_ui_state` — all design-backed.

**VETO — entity completeness (step-4 `success`)**:

> Preconditions: "项目处于归档态(archived=1),**其 workspace 与会话分组在 dsh 侧保持**"
> Output: "项目移回活跃区;投影不变化(workspace 未移除,**会话分组保持**)"
> fixture_spec.entities: Project / Workspace — **Session 完全缺席**

The Outcome's own **Preconditions** assert the project's sessions remain grouped ("会话分组…保持" presupposes grouped sessions exist), and its distinguishing assertion ("会话分组保持" — the 归档≠删除 invariant this step exists to prove) cannot be seeded or verified without Session instances. Per the rubric ("Score 0 if any entity type referenced in the Contract's Preconditions, Input, or State changes is missing from `fixture_spec.entities` — triggers the veto") this is the exact same pattern iteration-1 vetoed on step-5b (State "布局记忆清除" → LayoutMemory absent): a domain-noun entity reference in a dimension value whose entity is absent from the fixture. The git diff confirms the step-4 revision touched only the Workspace pseudo-field (`status`→`title`/`orderIdx`) and State/Side-effect wording — Session was never added (pre-existing gap iteration-1 did not list; scored now, per "score only what is on the page").

**Secondary defects (would independently lower the dimension if the veto were lifted)**:

| # | Defect | Evidence |
|---|--------|----------|
| 8.2 | step-1 `archived-sessions-zone`: Output asserts "会话行即时回左栏项目树" but Session carries only `archived=true` — **no cwd constraint**, and no Workspace entity is declared. Grouping is workspace-cwd-mediated (Interface 2: "上游按 header.cwd canonical 匹配 workspace path"); without the prerequisite the seeded session lands 未分组 and the tree-re-entry assertion is infeasible. | step-1 fixture block |
| 8.3 | step-3 `archived-partition-cross-project`: Session cwd constraint references "**归档项目的 workspace 投影路径**下" — a Workspace the fixture nowhere declares as an entity; gen-test-scripts must infer it from constraint prose. | step-3 fixture block |
| 8.4 | step-2 `rename-blank-input`: State asserts "forge 与 **dsh 两侧**零变更" with entities = [Project] only — no Workspace comparison face for the zero-change assertion. | step-2 fixture block |
| 8.5 | step-1 `deviation-deleted-reordered`: branch disambiguation (删除 = 陈旧期望快照不物化宿主 vs 乱序 = ≥2 在位) lives entirely in YAML comments; `min_count: 2` for Workspace counts host instances in one branch and expectation rows in the other — mechanically ambiguous for a fixture generator, though honestly documented. | step-1 fixture block |

Everything else is clean: pseudo-fields fully normalized (iteration-1 8.5 fixed), Workspace promoted into entities at 1b/2b/5e (8.2 fixed), 5e Session + cascade comparison faces seeded (8.3 fixed), 5d four-entity comparison face (8.6 fixed), min_counts adequate everywhere checked (step-5 success Project 2 + LayoutMemory 2; step-3 Project 2; step-1 success Project/Workspace 2).

**Veto → dimension = 0.**

---

## Threshold Table

| Dimension | Score | Threshold | Pass |
|-----------|-------|-----------|------|
| Completeness | 150 | 90 | ✓ |
| Semantic Purity | 182 | 120 | ✓ |
| Precondition Exclusivity | 141 | 90 | ✓ |
| Fact Alignment | 150 | 90 | ✓ |
| Surface Fitness | 97 | 60 | ✓ |
| Internal Consistency | 148 | 90 | ✓ |
| Anchor Integrity | 98 | 60 | ✓ |
| Fixture Specification | **0** | 60 | **✗ (veto)** |
| **Total** | **966/1100** | 935 | **FAIL** (dimension threshold) |

7/8 dimensions now comfortably above threshold and total (966) exceeds 935 — but the pass condition requires every dimension ≥ threshold, and a single undeclared entity (step-4 Session) re-triggers the veto that iteration-1 applied to step-5b LayoutMemory. One-line fixture fix away from passing.

---

## Phase 3 — Blindspot Hunt

1. **FT-127 op-level error codes still uncovered** (carried, iter-1 #1): workspace/invalid-path | name-conflict | move-invalid → ERR_PROJECTION_OP_FAILED has no Outcome exercising an op failure class (e.g., rename to a dsh-side conflicting name).
2. **Rename duplicate-name boundary still uncovered** (carried, iter-1 #2): display_name 可重复 (D8) + rename locates by workspaceId (FT-125) — same-name rename not drifting groups is a derivable assertion with no Outcome.
3. **Step-4 is the only single-Outcome step** (carried, iter-1 #4): restore-after-host-side-deletion-during-archive (deviation × restore combination, FT-124 archived → no transition window) has no boundary Outcome.
4. **degraded × deviation coexistence priority still undefined** (carried, iter-1 #5): FT-123 single-valued machine with two simultaneous triggers.
5. **loading-state still absent** (carried, iter-1 #6): async projection writes (≤2s budget) with no intermediate-state Outcome — non-mandatory, e2e wait-strategy gap.
6. **≤2s hard value in Invariants without CI slack** (carried, iter-1 #7): BIZ-workbench-005 loose-threshold discipline not reflected; direct transcription will produce flaky timing assertions.
7. **Workspace entity semantics conflate host instance and forge expectation snapshot**: constraint values alternate between dsh-side facts (actual title drifted) and expectation-side columns (path/title/orderIdx of workspace_projection); the deleted-branch comment leans on this conflation. A note or a split naming would make fixture generation deterministic.
8. **step-2 route anchor carries IPC verb vocabulary** ("project(renameProject:纯 DB 改名 + 投影 rename op…)") — cosmetic (page value is canonical; route roots at view key `project`), but the route field is drifting toward implementation documentation.

---

## Revision Directives (for gen-contracts revise pass)

1. **step-4 success**: add `Session` to entities (min_count 1, belongs_to Project, cwd = canonical 落在该项目 workspace 投影路径下) — the one-line veto lift; matches the fixture shape already used by step-3 success.
2. step-1 `archived-sessions-zone`: add cwd constraint to Session (+ Workspace entity or explicit note that grouping rides the declared Project's workspace), so "回左栏项目树" is seedable.
3. step-3b: declare the archived project's Workspace entity (its path is referenced by the Session cwd constraint).
4. step-2 `rename-blank-input`: add Workspace comparison face (or narrow State wording to forge 侧零变更 + 不发起投影写).
5. Semantic purity residuals: move "(UF3/UF8 接续断言)" / "(UF1「不挂会话」断言)" to comments; rephrase "rename plan 保留"→"投影待重试期望保留"; "project_ui_state 行"→"布局记忆"; "级联范围 = projects 全部 FK 关系"→"快照/挂接等自有数据随删除清除(FK 级联全集见注释)"; strip step-1e State's "实现归宿 = 上游原生设置面,M4 零代码" into the existing anchor-note.
6. Exclusivity residuals: step-3b precondition restate as inspection state (e.g., "工作台当前活跃项目 ≠ 归档项目,且本 Outcome 全程无归档/恢复/删除写动作" is still procedural — prefer asserting the read-only selection in Input alone and dropping the clause); optionally have step-5 success precondition note "确认对话未决" is absent because success subsumes confirm (or accept the −3 as UI-choice semantics).
7. step-3 page: drop the "+ 生命周期动作·归档" suffix (action, not a page-map location); the layout field already describes the C8 confirm flow.
