---
feature: "dsh-forge-m4"
journey: "project-lifecycle-projection"
rubric: "contract (1100pt / 8 dimensions)"
iteration: 3
date: "2026-09-30"
verdict: "PASS (1061/1100 ≥ 935; all 8 dimensions ≥ threshold; entity-completeness veto lifted — all 16 outcomes cross-checked clean)"
scorer_stance: "adversarial verification; every deduction carries file + quote"
---

# Contract Set Evaluation — iteration 3

**Scope**: 5 Contract files (`step-1` … `step-5`) in `docs/features/dsh-forge-m4/testing/project-lifecycle-projection/contracts/`, **16 Outcomes** total (step-1 ×5, step-2 ×3, step-3 ×2, step-4 ×1, step-5 ×5). Scored only what is on the page now (revision delta vs HEAD confirmed: 187 insertions / 67 deletions across the 5 files, applied after iteration-2).

**Evidence base consulted**: rubric `skills/eval/rubrics/contract.md`; surface rule `skills/gen-journeys/rules/surface-web.md`; handbook `design/page-map.md`; fact table `.forge/fact-table.json` (FT-117/119/123/124/125/126/127/133/134/135 re-verified verbatim); `docs/business-rules/workbench.md` (BIZ-workbench-001/002/005/006); `design/er-diagram.md`; `design/tech-design.md` Interface 1/2; fixture schema `skills/gen-contracts/rules/fixture-spec.md`; journey `journey.md`; PRD `prd-spec.md` 必答④⑤, `prd-ui-functions.md` (lines 160/294/340 re-checked).

---

## Phase 1 — Reasoning Audit

### 1a. Iteration-2 issue re-verification (all against current page)

| Iter-2 issue | Revision evidence | Verdict |
|---|---|---|
| **VETO 8.1** step-4 `success` Session absent from entities | step-4 entities now: Project(archived=true) / Workspace(title+orderIdx, "归档期间从未移除/保持") / **Session(min_count 1, belongs_to Project, `cwd` = "canonical 落在该项目 workspace 投影路径下(分组经宿主 workspace 派生,非 Session 直挂 project 字段;归档期间分组保持,恢复后不破)")** — exactly iteration-2 directive #1's prescribed shape | **FIXED — VETO LIFTED** |
| **8.2** step-1 `archived-sessions-zone` Session no cwd + no Workspace | Workspace entity added (`path` = "该项目 workspace 投影路径(会话分组的宿主锚点…)") + Session `cwd` constraint added ("canonical 落在该项目 workspace 投影路径下…") — "回左栏项目树,仍按该项目 workspace 分组" now seedable | **FIXED** |
| **8.3** step-3b Session cwd references undeclared Workspace | Workspace entity added (`path` = "= 归档项目的 workspace 投影路径(归档不移除、dsh 侧保留;Session cwd 分组所引的宿主)") | **FIXED** |
| **8.4** step-2 `rename-blank-input` no dsh-side comparison face | Workspace added (`title` = "与 forge 期望名一致(dsh 侧零变更对照面)") — "forge 与 dsh 两侧零变更" now has both faces | **FIXED** |
| **8.5** deviation-deleted-reordered branch semantics comment-only; min_count 2 dual meaning | Unchanged (same comment block "分支布景(两支路各自满足其一)…", `min_count: 2` covering host instances in one branch / expectation rows in the other) | **CARRIED** (residual deduction) |
| **2.1** residual "(断言)" markers (step-1e / step-3b Outputs) | step-1e Output now "会话行即时回左栏项目树,仍按该项目 workspace 分组" with UF3/UF8 note moved to HTML comment; step-3b Output now "…该项目会话不在当前工作台呈现" — grep confirms zero "断言)" markers remain in any dimension value | **FIXED** |
| **2.2** event-narrative second clause (step-2b/5e preconditions) | Rephrased to "投影通道处于不可写态(workspace 不可写或宿主通道不可达;**改名/删除投影写入必经此通道**)" — static channel property, declarative | **FIXED** |
| **2.3** impl coupling: "rename plan 保留" / "project_ui_state 行" / "projects 全部 FK 关系" / archived=1/0 literals | First three all fixed ("待重试投影期望保留" / "布局记忆原样保持" / "快照/挂接等自有数据随删除清除(…级联全集见注释)" with 11-table set in comment). **archived=1/0 literals remain** in step-3 State ("archived=1;workspace 不移除…") and step-4 State ("archived=0;dsh 侧零变更…"); 5e State still says "forge **行**" | **MOSTLY FIXED** (−residual) |
| **2.4** step-1e State "实现归宿…M4 零代码" + Output "两个归档面互不混淆" | State now "会话归档态解除,回树呈现"; both provenance clauses moved to comments | **FIXED** |
| **3.1** step-3 pair overlap with procedural clause | Clause "本步骤为只读巡检,不执行归档动作" **dropped entirely** (iteration-2 directive #6 preferred option); residual = structural co-occurrence only (same symmetry class as iter-2's 3.3) | **IMPROVED** (−4 → −2) |
| **3.2** step-5 confirm-cancel co-satisfiable with success | Unchanged (accepted UI-choice semantics per iteration-2 directive #6 alternative) | **CARRIED** (−3) |
| **3.3** step-1 success vs archived-sessions-zone symmetry | Unchanged situation | **CARRIED** (−2) |
| **4.x** Fact alignment | All previously verified alignments re-hold (see dimension 4) | **HELD** |
| **6.1** step-1e branch structurally un-anchored | anchor-note still comment-only; frontmatter anchor remains "右栏概览·投影状态行" | **CARRIED** (−2) |
| **7.1** step-3 page "+ 生命周期动作·归档" suffix | page now "项目工作台·左栏项目树(C3)归档分区" — suffix dropped; "生命周期动作(改名/归档/恢复/删除)" survives only in step-1 layout (where it is a presented element per ui-functions line 340, page-map-conformant usage) | **FIXED** |
| blindspot-8 step-2 route IPC vocabulary | step-2 route rewritten to UF7 vocabulary ("project(改名入口 = 项目行 ⋯ 菜单,UF7「随时可改:左栏 ⋯ / 设置」)"); step-3/4/5 routes still carry IPC verbs (see attacks) | **PARTIAL** (cosmetic, unscored) |

### 1b. Entity-completeness cross-check — ALL 16 outcomes (iteration-3 mandate)

Every domain-noun entity referenced in Preconditions / Input / Output / State checked against `fixture_spec.entities`:

| Outcome | Entities declared | Nouns referenced in values | Verdict |
|---|---|---|---|
| 1 success | Project(2) Workspace(2) | 项目/投影(healthy)/workspace | ✓ |
| 1 degraded-retry | Project(1) Workspace(1) + state_req | 投影降级/workspace/期望 | ✓ |
| 1 deviation-renamed | Project(1) Workspace(1) | workspace 名/期望名 | ✓ |
| 1 deviation-deleted-reordered | Project(2) Workspace(2) + state_req | workspace 删除/乱序/期望序 | ✓ |
| 1 archived-sessions-zone | Project(1) Workspace(1) Session(1, archived+cwd) | 会话/workspace 分组/项目树 | ✓ (8.2 fixed) |
| 2 success | Project(1) Workspace(1) Session(1, cwd) | 项目名/workspace/会话分组 | ✓ |
| 2 rename-projection-failure | Project(1) Workspace(1) + state_req | 通道/workspace/displayName | ✓ |
| 2 rename-blank-input | Project(1) Workspace(1) | forge 与 dsh 两侧(对照面 = Workspace) | ✓ (8.4 fixed) |
| 3 success | Project(2) Session(1, cwd) Workspace(1) | 归档分区/workspace/会话分组 | ✓ |
| 3 archived-partition-cross-project | Project(2) Session(1, cwd) Workspace(1, path) | 归档项目/活跃项目/workspace/会话 | ✓ (8.3 fixed) |
| **4 success** | Project(1) **Workspace(1)** **Session(1, cwd)** | 归档态/**会话分组保持**(Preconditions+Output)/workspace | **✓ VETO LIFTED** |
| 5 success | Project(2) Workspace(1) Session(1) LayoutMemory(2) | 条目/workspace/会话/布局记忆/其余项目/期望快照(→Workspace semantic map)/激活指针(→Project referent, system pointer) | ✓ (see 8. residual notes) |
| 5 archived-delete-branch | Project(1) Workspace(1) Session(1) LayoutMemory(1) | 归档分区条目/workspace/会话/布局记忆 | ✓ |
| 5 layout-isolation-others | Project(1) LayoutMemory(1, layoutJson) | 其余项目/布局记忆/被删项目(必须不存在 — correctly absent) | ✓ |
| 5 confirm-cancel-zero-change | Project(1) Workspace(1) Session(1) LayoutMemory(1) | 条目/workspace/会话分组/布局记忆 — all four seeded | ✓ |
| 5 delete-projection-failure | Project(1) Workspace(1) Session(1) LayoutMemory(1) + state_req | 条目/布局记忆/workspace/会话 + Output "快照/挂接等自有数据" (see below) | ✓ with residual |

**The one borderline reference**: step-5e Output "本地删除生效:forge 条目删除、布局记忆清除,**快照/挂接等自有数据随删除清除**(BIZ-workbench-001 移除语义,级联全集见注释)". 快照/挂接 (task_snapshot/feature_snapshot/session_links) are not in `fixture_spec.entities`. **Not a veto**, for three reasons: (1) the rubric veto sentence covers "Preconditions, Input, or State changes" — the Preconditions/Input/State of 5e reference only 通道/条目/布局记忆/workspace/会话 (all seeded; State's "级联数据" is a generic noun, not an entity type); (2) the phrase is an open-class ("等") restatement of BIZ-workbench-001's removal rule, whose closed 11-table enumeration is deliberately comment-confined — **this exact wording was prescribed by iteration-2's own revision directive #5** ("rephrase …'级联范围 = projects 全部 FK 关系'→'快照/挂接等自有数据随删除清除(FK 级联全集见注释)'"), and re-vetoing prescribed wording would be a moving-goalposts failure; (3) every *distinguishing* assertion of 5e (条目删除/布局记忆清除/workspace 移除待重试/会话退未分组) has a seeded face. Scored instead as a fixture-coverage deduction (see dimension 8) — the clause remains assertion-vs-fixture unverifiable without representative cascade rows.

### 1c. New-issue sweep on revision delta

- New constraint prose references real columns only (`cwd` via Interface 2 "上游按 header.cwd canonical 匹配 workspace path"; `orderIdx`/`title`/`path` = workspace_projection columns per er-diagram; `anchor canonical` = documented semantics of workspace_projection.path). ✓
- step-3 Session constraint value "…**非 Session 直挂 project 字段**" negates a field that does not exist — informative guard against the pre-revision pseudo-field model, mild prose oddity, not scored.
- No regex/selectors/assertion-framework content in any dimension value (grep clean; the two frontmatter `route` hits are page-map-verbatim "[重试投影]" button label and step-5 IPC vocabulary — frontmatter, not dimension values).
- Journey Invariants blocks byte-identical across all 5 files and verbatim vs journey.md. ✓
- Cross-Contract chain re-verified intact: Step 1 State → Step 2 ("项目已注册,投影通道就绪(healthy)") → Step 3 (活跃态; produces archived=1) → Step 4 (binds archived=1; produces archived=0) → Step 5 success ("Step 4 恢复后") / 5b ("不经 Step 4 恢复" diverges from Step 3) / 5c ("承载项目删除已完成" binds Step 5). No dangling references.

---

## Phase 2 — Dimension Scores

### 1. Completeness — 150/150 (threshold 90)

- All 16 Outcomes: non-empty Preconditions / Input / Output / State; Side-effect explicit everywhere ("none" or concrete). 50/50.
- `## Journey Invariants` in all 5 files, 6 entries each, verbatim from journey.md. 50/50.
- Happy path per step; web-mandatory derived outcomes present with rule-mapping comments (validation-error → step-2 `rename-blank-input` + step-5 `confirm-cancel-zero-change`; session-expired → step-2 `rename-projection-failure`); all 11 journey edges (1b/1c/1d/1e/2b/2c/3b/5b/5c/5d/5e) covered 1:1. 50/50.

### 2. Semantic Purity — 186/200 (threshold 120)

| # | Deduction | Evidence |
|---|---|---|
| 2.1 | −7 | Residual implementation vocabulary in dimension values: step-3 State "**archived=1**;workspace 不移除(无投影推送);会话分组保持"; step-4 State "**archived=0**;dsh 侧零变更(无投影推送)" (column literals; system-level = 归档态/恢复为活跃); step-5e State "forge **行**与级联数据已清" (row vocabulary; step-5 success itself uses the better "项目条目"). |
| 2.2 | −2 | Input-property fact inside a precondition: step-2 success "…且**提交的新名为合法名(非空且非纯空白)**" — accepted as the outcome discriminator (makes success ∩ blank-input = ∅), but it describes the pending submission, not system state. |
| 2.3 | −5 | Meta-text / citation parentheticals inside values: step-5e Output "…随删除清除(**BIZ-workbench-001 移除语义,级联全集见注释**)" — "see comment" is document navigation, belongs in the comment itself; step-3 success Side-effect "项目列表变更通知;无投影推送(**必答⑤**)" — rule citation inline (mild; traceability welcome but value should state the behavior alone). |

80−7 = 73; 60−2 = 58; 60−5 = 55. Total **186**. (Iteration-2: 182; all four iter-2 deduction classes improved or fixed.)

### 3. Precondition Exclusivity — 141/150 (threshold 90)

| # | Deduction | Evidence |
|---|---|---|
| 3.1 | −2 | step-3: success ("项目已注册且处于活跃态…投影 healthy") vs archived-partition-cross-project ("存在归档项目,且当前工作台活跃项目为另一项目") — procedural clause dropped (iteration-2 directive followed), but the two states still co-occur in any ≥2-project world (1 active + 1 archived); selection rests on Input (执行归档并确认 vs 定位归档分区,展开归档行菜单). Reduced from iteration-2's −4 to the symmetry-class −2. |
| 3.2 | −3 | step-5: confirm-cancel precondition ("删除确认对话已弹出且处于未决状态") co-satisfies success's precondition set; the confirm/cancel discriminator lives only in Input. Carried (UI-choice semantics, accepted per iteration-2 directive #6 alternative). |
| 3.3 | −2 | step-1: success ("已注册 ≥2 个项目,投影健康") vs archived-sessions-zone ("存在经 UF3 …归档的会话") co-occur in any healthy world with one archived session; different interaction surfaces disambiguate in practice. Carried symmetry note. |
| 3.4 | −2 | **New finding**: step-5 success Preconditions ("承载项目处于活跃态(Step 4 恢复后),含会话、布局记忆与归档前数据;其余 ≥1 项目存有布局记忆;dsh 侧 workspace 在位") are **silent on channel state**, while delete-projection-failure asserts "投影通道处于不可写态…" — with the channel down, both outcomes' preconditions hold and both Inputs begin "经确认对话删除". Step-2's success by contrast explicitly binds "投影通道就绪(healthy)"; step-5 success should carry the same clause. (Iteration-2 asserted channel-axis exclusivity here without a quote; the current precondition text does not support it.) |

Error/boundary triggers all explicit (通道不可写 ×3 variants; dsh 手改 ×2 kinds; 空输入; 归档态; 对话未决; 合法名) — 40/40. step-1's four projection outcomes remain mutually exclusive on the FT-123 single-valued axis (deviation-renamed vs deviation-deleted-reordered discriminated by drift kind); step-2's three outcomes now mutually exclusive on the name-validity axis (合法名 vs 空名/纯空白) × channel axis (就绪 vs 不可写); step-5 success vs archived-branch exclusive on the archived axis. 60−2 + 50−7 + 40 = **141**.

### 4. Fact Alignment — 150/150 (threshold 90)

Re-verified against fact table / PRD / BIZ / er-diagram / ui-functions / Interface 1-2:

- FT-123 (4-state machine, present-only deviation) ✅; FT-124 (match/drift bridge) ✅; FT-125 (rename op 经 relay; execution order confined to comment) ✅; FT-126 (degraded 期望不丢失 / 重试收敛 / "重试重新推送该项目全部投影期望,直至两侧一致") ✅; FT-127 (fire-and-forget → 终态 no-op, cited in 5e reasoning) ✅; FT-133 (four lifecycle verbs; "无投影推送" wording for archive/restore; listProjects columns) ✅; FT-134 + BIZ-workbench-002 (指针同事务清空、不自动激活, inline `source: inferred` marker on the 调和 claim) ✅; FT-135 (project_list_changed confined to comments; values say "项目列表变更通知") ✅; FT-117 (forget 前置, comment) ✅; FT-119 (ProjectLayout v1 in 5c layoutJson constraint) ✅.
- 必答⑤ table row-by-row (归档保留+分组 / 删除移除+退未分组+不删除 / 改名同步+分组保持) ✅; 必答④ (单向/偏差/降级/不破坏) ✅; BIZ-workbench-001 removal cascade (11-table comment set verified 1:1 against er-diagram mermaid: workspace_projection / project_ui_state / session_links / task / dispatch / task_snapshot / feature_snapshot / prefs / stage_asset / proposal_snapshot / migration_event) ✅; BIZ-workbench-006 M4 (单向投影 + 归档≠删除 + 降级承诺) ✅.
- ui-functions: step-2 route UF7 gloss matches line 294 content (「随时可改(左栏 ⋯ / 设置)」— contract renders it as "随时可改:左栏 ⋯ / 设置", punctuation cosmetic drift, same claim); step-1e anchor-note matches line 160「已归档会话…设置页恢复入口(UF8)」 ✅; step-1 layout "生命周期动作(改名/归档/恢复/删除)与归档语义说明" = lines 340/342 ✅.
- All four derived outcomes (2c / 5c / 5d / 5e) carry `source: inferred` + reasoning basis + surface-web rule mapping; the two PRD-gap inferences (空名行为、删除×降级) still honestly flagged "记 open question 待 PRD 对账". Zero hallucinated/unclassified claims found.

**150**.

### 5. Surface Fitness — 98/100 (threshold 60)

- Mandatory web outcomes present with mapping comments (validation-error ×2, session-expired ×1). 40/40.
- Web language throughout: interactions (打开/确认/点击/取消/重进/搜索/逐条解除归档/展开偏差明细/定位归档分区/展开归档行菜单), page elements (右栏概览/投影状态行/左栏项目树(C3)/归档分区/⋯ 菜单/行菜单/确认对话/降透明只读), async semantics (降级提示/待重试/恢复后重试/即时校验). Iteration-2's three value-level leaks ("rename plan 保留" / "project_ui_state 行" / "projects 全部 FK 关系") all gone. Residual leaks: "archived=1/0" literals (steps 3/4 State), "forge 行" (5e State). −2. 33/35.
- TUI timeout criterion: N/A for web → 25/25.

**98**.

### 6. Internal Consistency — 148/150 (threshold 90)

- All 6 Journey Invariants hold in every Contract (归档≠删除 / 单向投影 / 确认对话 / 降级承诺含 5e 补全口径 / 不破坏 / ≤2s). No violations. 60/60.
- Cross-Contract references: full chain re-verified (Phase 1c) — none dangling. 48/50 after carried deduction:

| # | Deduction | Evidence |
|---|---|---|
| 6.1 | −2 | step-1 `archived-sessions-zone`: the outcome's interaction surface (上游原生设置面「已归档会话」区) is still not carried by any structural anchor — the file-level anchor stays "右栏概览·投影状态行" and the reconciliation lives in the `<!-- anchor-note -->` comment ("该支路 anchor = N/A(上游原生,无 handbook 条目,不造页);接续断言面 = 左栏项目树(C3)会话行回树"). gen-test-scripts consumes frontmatter anchors, so the branch remains structurally un-anchored. Documented, honestly, but structural. |

- Precondition achievability from preceding States ✓ (linear chain; 2b/5e channel-down states achievable at their positions; 5b diverges before Step 4; 5c after Step 5). 40/40.

**148**.

### 7. Anchor Integrity — 100/100 (threshold 60)

Handbook exists → active. All 5 files carry `anchors.web.{page, route, requires_auth, layout}` + `last_anchor_sync`; requires_auth=false matches page-map "Auth: none(单用户桌面)"; all routes root at view key `project`. 40/40.

Value verification vs page-map — all five now match a canonical base:

- step-1 "项目工作台·右栏概览·投影状态行(UF8 投影与生命周期)" ↔ Shared Components「投影状态行 | 右栏概览」(parenthetical = PRD gloss; base canonical) ✅.
- step-2 "左栏项目树(C3)项目行 ⋯ 菜单·改名" ↔ 左栏项目树(C3) row language "项目行(归档分区/⋯ 菜单)" ✅.
- step-3 "项目工作台·左栏项目树(C3)归档分区" ↔ same section's 归档分区 vocabulary ✅ (iteration-2 7.1 suffix dropped — FIXED).
- step-4 "左栏项目树(C3)归档行菜单·恢复" ✅; step-5 "删除确认对话(C8 浮层)+ 左栏归档行菜单" ↔ 浮层 "C8 归档/删除确认" ✅.

Handbook internal consistency: page-map has no conflicting definitions. 30/30. **100**. (Frontmatter route fields still carry IPC-verb vocabulary on steps 3/4/5 — e.g. step-5 route "removeProject:buildRemovalPlan 先于行删除 + FK cascade + 拆出窗关闭" — cosmetic drift toward implementation docs; the web anchor field per rubric is `page`, which matches; listed in attacks, unscored.)

### 8. Fixture Specification — 88/100 (threshold 60) — **VETO LIFTED**

`fixture_spec` present in all 16 Outcomes, schema-conformant (entities / relationship_type+parent_entity / field_constraints / state_requirements with prerequisite_entity). Entity semantic verification: Project→`projects`, Workspace→dsh workspace + `workspace_projection` (logical 1:1, established mapping), Session→upstream session domain (Interface 2/3 cwd-canonical grouping), LayoutMemory→`project_ui_state` — all design-backed.

- **Entity completeness (veto item): 40/40.** All 16 outcomes pass the Preconditions/Input/State cross-check (Phase 1b table). The step-4 veto is lifted (Session seeded with cwd canonical constraint); iteration-2's 8.2/8.3/8.4 gaps all closed with correctly-shaped constraints.
- **Relationship and constraint coverage: 23/35.** Three residuals:

| # | Deduction | Evidence |
|---|---|---|
| 8.1 | −5 | step-5e Output asserts "快照/挂接等自有数据随删除清除(…级联全集见注释)" but the fixture seeds no cascade face (no session_links / task_snapshot / feature_snapshot for the deleted project) — the clause is assertion-vs-fixture unverifiable; a generator consuming fixture_spec alone cannot make it fail. Not a veto (rule restatement, open class, enumeration comment-confined per iteration-2 directive #5) but a genuine coverage gap. |
| 8.2 | −4 | step-1 `deviation-deleted-reordered`: branch disambiguation (删除 = 陈旧期望快照不物化宿主 vs 乱序 = ≥2 在位) lives entirely in YAML comments; `min_count: 2` counts host instances in one branch and expectation rows in the other — mechanically ambiguous for a fixture generator (honestly documented; carried from iteration-2 8.5). |
| 8.3 | −3 | step-5 success asserts "工作台落到其余项目或空态,不指向已删 id" and State "激活指针随删除清空" — but the pointer's precondition state (激活指针 = 承载项目) is nowhere expressed (neither entity nor state_requirements); only Input's "当前活跃的承载项目" implies it, so the distinguishing assertion cannot be seeded to fail. A `state_requirements` entry ("激活指针指向承载项目", prerequisite_entity: Project) would close it. |

- **Minimum data quantity: 25/25.** All min_counts sufficient: step-5 success Project 2 + LayoutMemory 2 (delete-one-of-many + isolation); step-3 ×2 Project 2; step-1 success Project/Workspace 2; deviation-deleted-reordered Workspace 2 (乱序需 ≥2); singles at 1 where the scenario is single-entity; 5c correctly requires the deleted project to be absent rather than seeded.

**40 + 23 + 25 = 88.**

---

## Threshold Table

| Dimension | Score | Threshold | Pass |
|-----------|-------|-----------|------|
| Completeness | 150 | 90 | ✓ |
| Semantic Purity | 186 | 120 | ✓ |
| Precondition Exclusivity | 141 | 90 | ✓ |
| Fact Alignment | 150 | 90 | ✓ |
| Surface Fitness | 98 | 60 | ✓ |
| Internal Consistency | 148 | 90 | ✓ |
| Anchor Integrity | 100 | 60 | ✓ |
| Fixture Specification | 88 | 60 | ✓ (veto lifted) |
| **Total** | **1061/1100** | 935 | **PASS** |

The iteration-2 veto (step-4 Session) is lifted and the entity-completeness cross-check passes for all 16 outcomes; iteration-2's four secondary fixture defects are all closed except the branch-disambiguation ambiguity. Remaining deductions are quality residuals (column literals, one co-satisfiable pair per step-1/3/5, comment-carried structural anchor for step-1e, cascade/pointer fixture faces) — none below threshold.

---

## Phase 3 — Blindspot Hunt

1. **FT-127 op-level error codes still uncovered** (carried since iter-1): workspace/invalid-path | name-conflict | move-invalid → ERR_PROJECTION_OP_FAILED has no Outcome exercising an op failure class (e.g., rename to a dsh-side conflicting name).
2. **Rename duplicate-name boundary still uncovered** (carried): display_name 可重复 (er-diagram D8 note) + rename locates by workspaceId (FT-125) — same-name rename not drifting groups is a derivable assertion with no Outcome.
3. **Step-4 remains single-Outcome** (carried): restore-after-host-side-deletion-during-archive (deviation × restore; FT-124 "archived → no transition window") has no boundary Outcome.
4. **degraded × deviation coexistence priority undefined** (carried): FT-123 single-valued machine with two simultaneous triggers.
5. **loading-state still absent** (carried): async projection writes (≤2s budget) with no intermediate-state Outcome — non-mandatory, e2e wait-strategy gap.
6. **≤2s hard value in Invariants without CI slack** (carried): BIZ-workbench-005 loose-threshold discipline not reflected; direct transcription risks flaky timing assertions.
7. **Workspace entity semantics still conflate host instance and forge expectation snapshot** (carried): constraint values alternate between dsh-side facts and workspace_projection columns; the deleted-branch comment leans on the conflation. A naming note would make fixture generation deterministic.
8. **Frontmatter route fields drifting toward IPC documentation** on steps 3/4/5 ("archiveProject:archived=1", "restoreProject:archived=0", "removeProject:buildRemovalPlan 先于行删除 + FK cascade + 拆出窗关闭") — step-2's UF7 rewrite shows the better pattern; cosmetic today (web anchor = page), but a sync hazard if route is ever consumed verbatim.

---

## Residual Directives (optional polish; pass already achieved)

1. step-5 success: add "投影通道就绪" to Preconditions (closes 3.4; mirrors step-2 success).
2. step-5e: seed one representative cascade face (e.g., session_links min_count 1 belongs_to Project) or narrow the Output clause to seeded entities.
3. step-5 success: add state_requirement "激活指针指向承载项目" (prerequisite_entity: Project).
4. steps 3/4 State: "archived=1/0" → "项目处于归档态"/"项目恢复为活跃"; 5e State "forge 行" → "forge 侧条目".
5. step-5e Output / step-3 Side-effect: strip "(BIZ-workbench-001 移除语义,级联全集见注释)"/"(必答⑤)" parentheticals into adjacent comments.
6. deviation-deleted-reordered: split into per-branch entity blocks or add an explicit branch-discriminator field.
