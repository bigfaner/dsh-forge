---
feature: "dsh-forge-m4"
journey: "multi-window-tearout"
rubric: "contract (1100pt / 8 dimensions)"
iteration: 2
date: "2026-09-30"
verdict: "PASS (1066/1100; all dimensions above threshold; iteration-1 veto lifted)"
scorer_stance: "adversarial verification; every deduction carries file + quote"
---

# Contract Set Evaluation — iteration 2

**Scope**: 6 Contract files (`step-1` … `step-6`) in `docs/features/dsh-forge-m4/testing/multi-window-tearout/contracts/`, 18 Outcomes total (13 → 18 after revision).

**Evidence base consulted**:
- Rubric: `skills/eval/rubrics/contract.md` (1100pt, pass = total ≥935 AND every dimension ≥ threshold)
- Surface rule: `skills/gen-journeys/rules/surface-web.md` (required_outcomes: validation-error + session-expired)
- Handbook: `docs/features/dsh-forge-m4/design/page-map.md` (拆出窗口(C10) section, View Keys, 壳层窗口 line)
- Fact Table: `.forge/fact-table.json` (FT-100/101/102/103/104/105/109/122/133 verified verbatim)
- Business rules: `docs/business-rules/workbench.md` (BIZ-workbench-002/005), `resilience.md` (BIZ-resilience-001), `coexistence.md:17` (ERR_SINGLE_INSTANCE); convention `docs/conventions/product-architecture.md` (TECH-product-arch-003)
- Design: `design/tech-design.md` (Interface 4 ProjectLayout `rightbar.panes`/`detached`; Interface 5 WindowRole; §Error Propagation L258/L268 "开窗失败 toast;收回失败 log + 窗口关闭事件兜底"), `design/er-diagram.md` (projects / project_ui_state.layout_json)
- Revision diff: `git diff HEAD` over the 6 files (fix-by-fix verification below)

---

## Iteration-1 Fix Verification (re-verified, not taken on faith)

| # | Iteration-1 issue | Verdict | Evidence (current file + quote) |
|---|-------------------|---------|-------------------------------|
| 1 | **Step-6 Fixture veto** (Session/Task missing) | **FIXED** | step-6 success fixture now declares `Project + Session(belongs_to Project) + Task(belongs_to Project) + LayoutMemory` with `detached: "两个拆出窗条目(看板/会话,view/target/rect 各自记录)"` + `rightbar.panes: "主窗 pane 结构(离开前)"`; precondition adds "各窗目标数据健全(会话与任务可解析)" — success and 6b degradation are now deterministically distinguishable. Veto lifted. |
| 2 | **session-expired never embodied as Outcome** | **FIXED** | step-3 new Outcome `detached-session-expired` with full P/I/O/S ("拆出窗口内呈现明确错误与恢复引导(重试/重连入口),不静默空白、不丢已呈现内容"), `source: inferred`, reasoning (surface-web session-expired × TECH-product-arch-003) + verbatim mapping comment. |
| 3 | **Anchor unification** (集合/无 C10 variants) | **FIXED** | step-5 page `拆出窗口(C10)·复数窗并行`; step-6 page `拆出窗口(C10)·重进恢复(UF10 States restored)` — verbatim handbook identifier, state suffixes outside the identifier. |
| 4 | **LayoutMemory dual modeling** | **FIXED** | steps 1/2 converted from `Project.layout` field constraint to `LayoutMemory` entity with real Interface-4 field `rightbar.panes`; all six files now model layout memory one way. |
| 5 | **Pseudo-fields** (usage/mirrored/origin/sourceProject/stored) | **FIXED** | all removed (diff-verified); replaced by `state_requirements` or real fields (`sourceProject` → `projectId`, WindowRole verbatim). |
| 6 | **step-2 success/rearrange ambiguity** | **FIXED** | success precondition adds "且主窗尚有其余内容 pane" vs rearrange "原占主窗口唯一内容 pane" — mutually exclusive; also aligns with journey's own "其余 pane 按布局规则重排". |
| 7 | **Implementation verbs in dimension values** | **FIXED** | windowOpenDetached/recallAll/recallAllForProject/dsh-app:/blob/project_ui_state purged from State/Side-effect values (grep-verified zero hits outside anchors/routes/comments); step-6 State now declarative "恢复为异步过程,窗口集最终收敛为离开时集合". |
| 8 | **step-3b mis-anchored to nonexistent BIZ-workbench-005 clause** | **FIXED** | reasoning re-anchored to "TECH-product-arch-003 数据内核单一事实源、窗口内容为派生视图" (real convention, verified). |
| 9 | **Blindspots 2/4/5** (ERR_WINDOW_NOT_FOUND recall; remembered-rect re-tearout; restore clears suffix) | **FIXED** | new Outcomes `recall-window-not-found` (step-4), `retearout-remembered-rect` (step-5), and restore 支路二 in step-5b Output "恢复 → 后缀「已归档」即时清除、窗保持可用" — all fact-backed (FT-104/FT-102/FT-103/FT-105). |

New facts verified this iteration: `tech-design.md:258` "ERR_WINDOW_OPEN_FAILED / ERR_WINDOW_NOT_FOUND | 开窗失败 / windowId 失效 | toast / log + 事件兜底" and `:268` "窗口面:开窗失败 toast;收回失败 log + 窗口关闭事件兜底" — both new FT-104 Outcomes are design-grounded verbatim.

---

## Phase 1 — Reasoning Audit (cross-Contract state chain)

Chain walkthrough (18 Outcomes):

| Step | Precondition source | State produced | Chain verdict |
|------|--------------------|----------------|---------------|
| 1 success | 分屏态 fixture (Project + Task + LayoutMemory.rightbar.panes) | 纯菜单呈现 | OK |
| 1b single-instance | self-contained (DetachedWindow min 1 + 无活跃实例 state_requirement) | 进程数不变 | OK |
| 2 success / rearrange / target-invalid / open-failed | ← Step 1 菜单可用;four-way disjoint on 其余 pane / 唯一 pane / 目标失效 / 构造失败 | 窗口集 +1 或不变;记忆同步或不变 | OK |
| 3 success / same-data / main-switch / session-expired | ← Step 2 (主窗 + 1 独立窗) | 独立演进;A/B 并行;错误呈现不打断 | OK |
| 4 success / close-main-quit / recall-not-found | ← Step 3 (存在拆出窗);quit 支路 terminal | 窗口集 −1 / 进程退出 / 无第二关闭效果 | OK |
| 5 success / retearout-rect / lifecycle | ← Step 4 (pane 回主窗;**几何已记忆** — chains directly off step-4 success Side-effect "关闭时记忆该窗几何(供后续拆出/重放复用)") | 窗口集 = 2;记忆逐窗记录 | OK — geometry loop now closed |
| 6 success / restore-target-missing | ← Step 5 (双拆出态 + 记忆);entity graphs now aligned (Session/Task/LayoutMemory in both) | 恢复 = 2 / 单窗降级 | OK |

No dangling references; both terminal branches (1b second-process exit, 4b app quit) properly off-chain; the step-4 → step-5 geometry chain (blindspot #4) is now an asserted Outcome. **No new chain defects introduced by the revision.**

---

## Phase 2 — Dimension Scores

### 1. Completeness — 150/150 (threshold 90)

- All 18 Outcomes carry non-empty Preconditions / Input / Output / State; Side-effect explicit ("none" or stated). 50/50.
- `## Journey Invariants` present in all 6 files, 6 entries each, verbatim from journey.md. 50/50.
- Happy path in every step; all 8 journey edge cases mapped (1b/2b/2c/3b/3c/4b/5b/6b); **both surface-mandated derived Outcomes now embodied**: validation-error → step-2 `tearout-target-invalid` (mapping comment retained), session-expired → step-3 `detached-session-expired` (mapping comment + full Outcome). 50/50.

### 2. Semantic Purity — 195/200 (threshold 120)

No regex, CSS selectors, XPath, or framework assertion calls (grep-verified). Dimension values are declarative; step-6's test-wait instruction and history-event mixing are gone. Residuals:

| # | Deduction | Evidence |
|---|-----------|----------|
| 2.1 | −3 | step-6 `restore-target-missing` State: "坏 **op** 降级计数(仅日志);其余**恢复腿**完整落地" — replay-pipeline jargon ("op" from FT-122's open-ops sequence; "恢复腿" internal choreography term) leaking into a State value instead of system-level description. |
| 2.2 | −2 | step-4 `recall-window-not-found` Output: "收回失败仅记录日志并以**窗口关闭事件**兜底" — event-plumbing vocabulary (tech-design mechanism) in an Output; the user/system-visible behavior ("窗口集与布局记忆保持一致,不崩溃、不打扰") suffices. |

80 + 58 + 57 = 195.

### 3. Precondition Exclusivity — 140/150 (threshold 90)

All previously-flagged pairs resolved (step-2 four-way now disjoint; step-6 pair disjoint on target health "各窗目标数据健全" vs "目标数据已删除"). New outcomes' triggers explicit (构造失败 / windowId 失效 / 通道不可用 / 几何已记忆). One residual weakness:

| # | Deduction | Evidence |
|---|-----------|----------|
| 3.1 | −10 | step-5: `success` precondition "看板与会话两类视图均在 pane 内可选中" vs `retearout-remembered-rect` precondition "某视图(如看板)曾拆出后被收回,收回时其窗口几何(位置/尺寸)已被记忆" — a state with a recalled board (remembered geometry) AND both view types selectable satisfies **both** preconditions; the only discriminator is Input cardinality ("重复拆出两次…再拆出" vs "将该视图再次拆出"), and both Inputs share the "再拆出/再次拆出" phrasing. Not the iteration-1 defect grade (Inputs differ, outputs don't contradict), but the pair leans on action cardinality alone. |

55 + 42 + 40 ≈ 140. (Error/boundary triggers all explicit — full 40.)

### 4. Fact Alignment — 146/150 (threshold 90)

Verified this iteration (spot list): FT-101 title/suffix (step-2 Output, step-5b archive+restore branches); FT-102 geometry priority verbatim in step-5 route + retearout Output; FT-103 close-remembers-geometry chaining step-4 → step-5; FT-104 both halves now embodied and matching tech-design L258/L268 ("toast / log + 事件兜底"); FT-105 restore-clears embodied (支路二); FT-109 non-silent rejection (step-2c reasoning); FT-122 per-op guarded degradation (step-6 both Outcomes); FT-133 lifecycle; coexistence:17 single instance; TECH-product-arch-003 re-anchor correct; all 8 inferred Outcomes carry `source: inferred` + reasoning basis including surface-web mapping. Deductions:

| # | Deduction | Evidence |
|---|-----------|----------|
| 4.1 | −2 | step-5b is marked `<!-- source: journey Step 5b -->` but its restore branch (支路二 "已归档待恢复") does not exist in journey Step 5b (journey.md 5b covers 归档/删除 only). The branch is fact-grounded (FT-105 "restore clears"; FT-133 restoreProject) and the reasoning comment cites it — but the source marker overstates journey coverage; a hybrid `journey 5b + inferred (FT-105)` attribution would be honest. |
| 4.2 | −2 | step-2 `tearout-open-failed` Output "该视图保留在主窗 pane 不丢失" — neither FT-104 ("construction throw or document load failure -> recall the window") nor tech-design L268 ("开窗失败 toast") states main-pane retention for the interactive path; the retention half is extrapolated from the replay-path behavior (FT-122 family). Classified and basis-cited (not hallucination), but the cited basis covers only the recall+toast half. |

55 + 47 + 44 ≈ 146. No unclassified claims found.

### 5. Surface Fitness — 100/100 (threshold 60)

- Mandatory web outcomes: **both embodied** — validation-error (step-2 `tearout-target-invalid`) and session-expired (step-3 `detached-session-expired`), each with explicit `surface-web required_outcomes 映射` comment. 40/40.
- Web language throughout: user interactions (点击/切换/关闭/重进/观察), page elements (pane 菜单/窗口标题/OS 标题栏/toast/重试-重连入口), async semantics stated declaratively ("恢复为异步过程,窗口集最终收敛为离开时集合"). 35/35.
- TUI timeout criterion: N/A for web → 25/25.

### 6. Internal Consistency — 150/150 (threshold 90)

- All 6 Journey Invariants hold in all 18 Outcomes — including the new ones: 单实例 (1b), 主窗关闭=退出 (4b), 记忆恒一致 (recall-window-not-found's "失效窗口条目已移除" keeps memory≡actual; tearout-open-failed's "失败窗不计入"), 互不干扰/内核事实源 (session-expired State "数据内核状态不受影响"), 绑定来源项目 (3c projectId), M1 壳不变 (1b). 60/60.
- Cross-Contract references: chain verified in Phase 1; layout memory single-modeled (LayoutMemory entity, Interface-4 fields) across all six files; step-5/step-6 entity graphs aligned; step-4's geometry Side-effect now has a consumer Outcome. 50/50.
- Outcome preconditions achievable from preceding States: verified (step-2 success's new "主窗尚有其余内容 pane" matches journey's own "其余 pane…重排" semantics; retearout ← step-4 几何记忆; step-6 ← step-5 双拆出态). 40/40.

### 7. Anchor Integrity — 100/100 (threshold 60)

Handbook exists → dimension active. All 6 Contracts carry `anchors.web.{page, route, requires_auth, layout}` + `last_anchor_sync`; `requires_auth: false` matches page-map "Auth: none(单用户桌面)". 40/40.

- Page identifiers now unified: steps 2/4/5/6 all use verbatim handbook heading "拆出窗口(C10)" with state suffixes outside the identifier ("·复数窗并行" / "·重进恢复(UF10 States restored)" / "·[收回] / OS 标题栏关闭"); step-1 = 项目工作台 + Navigation "pane 头 [拆出为窗口]" verbatim; step-3 = canonical two-page addressing with verbatim sections (board/conversation 视图) per page-map's element-and-state note. 30/30.
- Routes use page-map vocabulary throughout (`project` View Key; `WindowRole={kind:'detached'}(主进程供给,不走 URL)` verbatim; `windowOpenDetached`/`windowRecall` from the 壳层窗口 line); FT-102 priority chain verbatim in step-5 route. Handbook internal consistency: no duplicate/conflicting page or route definitions. 30/30.

### 8. Fixture Specification — 85/100 (threshold 60) — **veto lifted**

`fixture_spec` present in all 18 Outcomes. Entity semantic verification: Project→`projects`, Task→`task`, Session→upstream session state (Interface 3/SessionTarget), DetachedWindow→window-registry detached set / `project_ui_state.detached`, LayoutMemory→`project_ui_state`(Interface-4 blob). All design-backed.

**Entity completeness (veto item): 40/40.** The iteration-1 veto (step-6 success missing Session/Task) is genuinely fixed. Re-audited all 18 Outcomes at the same operative standard (must-resolve backing data for scenario elements that must succeed): step-6 `restore-target-missing` remains stageable as declared — per Interface 4 `detached: {view, target?}`, a board entry is target-less, so "其余条目健全" is seedable with the conversation entry as the deleted-target one; no outcome deterministically falls into another's path. (Residual staging ambiguity noted in Blindspot 3.)

**Relationship and constraint coverage: 20/35.**

| # | Deduction | Evidence |
|---|-----------|----------|
| 8.1 | −10 | LayoutMemory systematically undeclared in four Outcomes whose Preconditions/State reference it, while sibling Outcomes declare it for the identical shape: step-4 success (Output "布局记忆更新为收回后结构", State "记忆同步" — and by the set's own invariant a live DetachedWindow implies a memory entry, so it is a prerequisite, not just a write target); step-5 success (State "布局记忆逐窗记录视图类型/目标与几何"; precondition "两类视图均在 pane 内可选中" requires seeded `rightbar.panes` — compare step-2 success which declares exactly this); step-2 `tearout-open-failed` (State "布局记忆不变"); step-5 `retearout-remembered-rect` (state_requirement "主窗该 pane 可再选中"). |
| 8.2 | −5 | step-5b Project `field_constraints` field `"status"` is not a `projects` column (er-diagram: `archived` INTEGER / `projection_state`; no status); values "将归档(支路一)/ 已归档待恢复(支路二)/ 经确认删除(支路三)" are operation-intent states, not column values — the last surviving member of iteration-1's pseudo-field class (8.2), extended rather than normalized by this revision. |

**Minimum data quantity: 25/25.** Project min 2 (3c A+B), Session/Task min 1 each (steps 5/6 pairs), LayoutMemory single row carrying detached = 2 entries (step-6) — all sufficient for their scenarios.

40 + 20 + 25 = 85.

---

## Threshold Table

| Dimension | Score | Threshold | Pass |
|-----------|-------|-----------|------|
| Completeness | 150 | 90 | ✓ |
| Semantic Purity | 195 | 120 | ✓ |
| Precondition Exclusivity | 140 | 90 | ✓ |
| Fact Alignment | 146 | 90 | ✓ |
| Surface Fitness | 100 | 60 | ✓ |
| Internal Consistency | 150 | 90 | ✓ |
| Anchor Integrity | 100 | 60 | ✓ |
| Fixture Specification | 85 | 60 | ✓ |
| **Total** | **1066/1100** | 935 | **PASS** |

---

## Phase 3 — Blindspot Hunt

1. **In-process geometry memory has no process-continuity constraint** — FT-102's chain is "replay rect > **in-process** remembered geometry > default". `retearout-remembered-rect`'s precondition "曾拆出后被收回,收回时其窗口几何已被记忆" never states the re-tearout happens in the **same process run**; after an app restart the in-process memory is gone and the window deterministically opens at 960×640 default, failing the Output. A one-clause precondition fix ("同一进程会话内未重启") makes the Outcome deterministic.
2. **LayoutMemory prerequisite asymmetry (scored 8.1)** — a test generator seeding step-5 success from its fixture (Project/Session/Task only) cannot stage "两类视图均在 pane 内可选中" without rightbar.panes; the scenario is infeasible as declared, only survivable because sibling fixtures show the intended shape.
3. **restore-target-missing healthy-entry identity unpinned** — "其余条目健全" is only seedable if the healthy entry is the (target-less) board window; if a generator stages the healthy entry as conversation, its Session is undeclared and "其余窗口…正常恢复" silently degrades. Pin "其余条目 = 看板窗(target-less)" or declare Session.
4. **session-expired has no fixture lever for the transition** — the Outcome's trigger arrives mid-observation ("期间该会话通道变为不可用"), but the fixture stages only the post-hoc Session.status state; nothing describes how the test induces channel unavailability (fault injection point). Testable, but the staging seam is unspecified.
5. **active_project_id (app_state) never fixture-backed** — step-3c's State change "主窗 active_project_id = B" and precondition "主窗口当前在项目 A(活跃)" reference the M2 `app_state` activation pointer (BIZ-workbench-002: activation is an explicit verb, registration does not auto-activate); no Outcome declares or state-requirement-seeds it. Same declaration-class gap as 8.1, lower severity.
6. **Conversation-origin tearout seam still unnamed (iteration-1 blindspot 6, unaddressed)** — code exposes two tearout entries (pane-header action for board panes; aside tab-menu row for conversation-origin panes, `RightbarTabs.tsx`); all 18 Outcomes say "pane 菜单" uniformly. The seam step-2c/step-3 depend on is never named in any anchor or Input. Not scored (page-map itself documents only "pane 头 [拆出为窗口]"), but a revision could name the tab-menu row in the conversation-touching Outcomes.

---

## Residual Revision Directives (non-blocking; set already passes)

1. Add `LayoutMemory` (rightbar.panes constraint) to step-4 success, step-5 success, step-2 tearout-open-failed, step-5 retearout fixtures (8.1).
2. Replace step-5b `Project.status` pseudo-field with `archived` column values + a state_requirement for the delete-confirmation intent (8.2).
3. Qualify retearout-remembered-rect with same-process continuity; pin restore-target-missing's healthy entry as the board window (Blindspots 1/3).
4. Reword step-6b State ("坏 op/恢复腿") and step-4c Output ("窗口关闭事件兜底") to system-level phrasing (2.1/2.2); split step-5b's source marker into journey-5b (archive/delete) + inferred-FT-105 (restore) (4.1).
