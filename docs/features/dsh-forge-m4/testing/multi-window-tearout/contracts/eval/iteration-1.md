---
feature: "dsh-forge-m4"
journey: "multi-window-tearout"
rubric: "contract (1100pt / 8 dimensions)"
iteration: 1
date: "2026-09-30"
verdict: "FAIL (869/1100; Fixture Specification below threshold — entity-completeness veto triggered)"
scorer_stance: "adversarial verification; every deduction carries file + quote"
---

# Contract Set Evaluation — iteration 1

**Scope**: 6 Contract files (`step-1` … `step-6`) in `docs/features/dsh-forge-m4/testing/multi-window-tearout/contracts/`, 13 Outcomes total.

**Evidence base consulted**:
- Rubric: `skills/eval/rubrics/contract.md` (1100pt, pass = total ≥935 AND every dimension ≥ threshold)
- Surface rule: `skills/gen-journeys/rules/surface-web.md` (required_outcomes: validation-error + session-expired)
- Handbook: `docs/features/dsh-forge-m4/design/page-map.md` (incl. 拆出窗口(C10) section)
- Fact Table: `.forge/fact-table.json` (FT-100/101/102/103/104/105/109/122/133 verified verbatim)
- Business rules: `docs/business-rules/workbench.md` (BIZ-workbench-002/005), `resilience.md` (BIZ-resilience-001), `coexistence.md` (单实例锁 ERR_SINGLE_INSTANCE)
- Design: `design/tech-design.md` (Interface 4 ProjectLayout / Interface 5 WindowRole), `design/er-diagram.md` (projects / project_ui_state), `ui/ui-design.md` (C10)
- Code cross-checks: `apps/desktop/src/main/windows/channels.ts:18` (`dsh-forge:window-recall`), `packages/plugins/forge-workbench/src/client/layout/replay.ts:136-146` (per-op guarded degraded, "a failed window open keeps the main-window pane"), `RightbarTabs.tsx:355` (conversation-origin tab-menu tearout row)

---

## Phase 1 — Reasoning Audit (cross-Contract state chain)

State chain walkthrough:

| Step | Precondition source | State produced | Chain verdict |
|------|--------------------|----------------|---------------|
| 1 success | 分屏态 fixture (Project.layout + Task) | 纯菜单呈现;窗口集未变 | OK |
| 1b single-instance | forward-references a torn-out window (created at Step 2/5 in the linear path) — self-contained via fixture DetachedWindow min 1 | 进程数不变;窗口集保持 | OK (fixture-staged, not chain-staged) |
| 2 success / 2b / 2c | ← Step 1 菜单可用 | 窗口集 +1;主窗 pane −1;记忆 + detached 条目 | OK |
| 3 success / 3b / 3c | ← Step 2 (主窗 + 1 独立窗) | 两侧独立演进;主窗 active_project_id=B(3c 支路) | OK; 3c 支路不复位 active_project_id — 支路独立成立 |
| 4 success | ← Step 3 (存在一个拆出窗) | 窗口集 −1;pane 回主窗原位;记忆同步 | OK — 为主窗重新可选中 pane 铺垫 Step 5 |
| 4b close-main-quit | multi-window 态(任意前步) | 进程退出;记忆保持 | terminal 支路,不入线性链 — OK |
| 5 success | ← Step 4 (pane 已回主窗,可再拆) | 窗口集 = 2;记忆记 view/target/rect | OK |
| 5b lifecycle | multi-window 态 | 归档:窗在位;删除:窗集清空 + 记忆级联清除 | OK |
| 6 success / 6b | ← Step 5 (双拆出态 + 记忆) | 重进恢复 = 2;坏 op 降级 | narrative OK — **fixture-level break** (below) |

Narrative chain is coherent; no dangling step references; both Step-4 branches are properly disjoint (recall path continues the chain, quit path is terminal). **The audit defect is at the fixture level**: the same world state (双拆出态: 看板 + 会话两独立窗) is staged with different entity graphs in Step 5 vs Step 6 — Step 5 success declares `Session` + `Task` for exactly this state, Step 6 success drops both while its own Preconditions still reference the 会话独立窗 (see Fixture Specification veto). Layout memory is also modeled two ways across the set: a `Project.layout` field constraint (Steps 1/2) vs a `LayoutMemory` entity with Interface-4 blob fields (Steps 4/5/6).

---

## Phase 2 — Dimension Scores

### 1. Completeness — 130/150 (threshold 90)

- All 13 Outcomes carry non-empty Preconditions / Input / Output / State; Side-effect explicit ("none" or stated); no missing mandatory dimension. 50/50.
- `## Journey Invariants` present in all 6 files, 6 entries each, verbatim from journey.md. 50/50.
- Happy path in every step; all 8 journey edge cases (1b/2b/2c/3b/3c/4b/5b/6b) have corresponding Outcomes. **But** only one of the two surface-mandated derived outcomes is embodied: validation-error → step-2 `tearout-target-invalid` ✓; **session-expired is mapped only as a comment, never as an Outcome**. 30/50:

| # | Deduction | Evidence |
|---|-----------|----------|
| 1.1 | −20 | step-3 carries the mapping comment `<!-- surface-web required_outcomes 映射:session-expired → 并行观察期间 detached 会话视图所依 dsh 会话通道不可用,拆出窗口内呈现明确错误 + 恢复引导(重试/重连),不静默空白、不丢已呈现内容 -->` — yet none of step-3's three Outcomes (`success` / `same-data-parallel` / `main-switch-no-drag`) has a precondition of session-channel unavailability or an output of error + recovery guidance. `same-data-parallel` tests a *different* scenario (mirrored same-data consistency). The mandatory derived scenario is claimed but never specified as a testable Outcome. |

### 2. Semantic Purity — 172/200 (threshold 120)

No regex, CSS selectors, XPath, or framework assertion calls anywhere. Deductions:

| # | Deduction | Evidence |
|---|-----------|----------|
| 2.1 | −6 | Verification-instruction language inside State values (rubric: describe *what* the system produces, not *how* to verify): step-6 success State "恢复为异步面**(断言前等待窗口集稳定)**" — a test-wait instruction, not system state. |
| 2.2 | −2 | Precondition axis mixing: step-6 success precondition "…并**离开**(窗口集合已记入记忆)" mixes a history event with the data state; the state ("双拆出态已记入记忆") would be declarative on its own. |
| 2.3 | −20 | Pervasive implementation coupling inside dimension values (rubric: "not internal function calls, database queries, API endpoint paths"): step-2 Side-effect "windowOpenDetached 单向开窗;拆出窗安全接线同主窗(**window-open 拒、will-navigate 锁 dsh-app:**)"; step-2 State "拆出集合入 **blob detached 块**"; step-4b Side-effect "**recallAll** 编排"; step-5 State "**blob detached 块**记录各窗 view/target/rect"; step-5b State "**project_ui_state** 级联清除" + Side-effect "删除 = **recallAllForProject** + 布局记忆 **forget** 前置". Six files leak IPC-verb / Electron-event / storage-schema vocabulary into State/Side-effect values. |

74 + 58 + 40 = 172.

### 3. Precondition Exclusivity — 130/150 (threshold 90)

| # | Deduction | Evidence |
|---|-----------|----------|
| 3.1 | −20 (ambiguous pair) | step-2: success "分屏工作台内选中某 pane(如看板视图), pane 菜单「拆出为窗口」可用" vs main-pane-rearrange "被拆出视图原占主窗口唯一内容 pane". Both share the *same Input* ("点击「拆出为窗口」" / "编排者拆出该视图") and success's precondition does not exclude the sole-pane case (step-1 defines 分屏态 as "≥1 个 pane", so a single-pane workbench satisfies both). A state with exactly one content pane matches two Outcomes with no discriminator on either side. |

Error/boundary triggers all stated explicitly (single-instance: 第二进程启动; tearout-target-invalid: 目标已失效; close-main-quit: multi-window 态 + 关闭主窗; lifecycle: 归档/删除; restore-target-missing: 条目指向已删除目标). Step-4's success/close-main-quit precondition overlap is cleanly resolved by disjoint Inputs (点击[收回] vs 关闭主窗口) — no deduction. 40 + 50 + 40 = 130.

### 4. Fact Alignment — 145/150 (threshold 90)

Verified facts (all accurate against fact-table.json / business rules / design):
- FT-100 → step-3c State "拆出窗绑定 projectId=A 不变" (WindowRole carries projectId).
- FT-101 → step-2 Output title "「<项目名> · <视图名>」"; step-5b archived title suffix (「已归档」rides only the title, window stays usable).
- FT-102 → step-2/step-5 anchors "首窗 960×640 居中主窗" / "几何 = 重放 rect > 进程内记忆 > 缺省 960×640" (verbatim priority chain).
- FT-103 → step-4 success "窗口集 −1(detached-closed 恰好一次)" + Side-effect "close 时记忆窗口几何".
- FT-105/FT-133 → step-4b "recallAll…全部 detached-closed 事件各恰好一次"; step-5b archive/delete branches (recallAllForProject on removal; setProjectArchived live title refresh; FK cascade of project_ui_state).
- FT-109 → step-2c reasoning "打开通道拒绝携带 ERR_SESSION_OPEN_FAILED 不静默".
- FT-122 → step-6 "重放 open-detached ops;rect 随行" + per-op guarded degraded (code-confirmed in replay.ts: "openDetached rejections count degraded…keeps the main-window pane, never a lost view" — step-6 success Side-effect "失败开窗静默降级(保持主窗 pane 不丢视图)" is verbatim behavior-grounded).
- coexistence.md:17 "单实例锁保证本壳二实例冲突时聚焦既有窗口并退出(ERR_SINGLE_INSTANCE)" → step-1b Output/Side-effect.
- BIZ-workbench-002, BIZ-resilience-001, TECH-product-arch-003, Interface 5 (OS close ≡ recall; 主窗关闭 = 退出) — all honored (see Internal Consistency).
- All four inferred Outcomes carry the literal `<!-- source: inferred -->` marker plus a reasoning-basis comment including the surface-web rule mapping — the annotation form the rubric mandates. ✓

Deductions:

| # | Deduction | Evidence |
|---|-----------|----------|
| 4.1 | −5 | Loose citation: step-3 `same-data-parallel` reasoning cites "推自数据内核单一事实源 × **BIZ-workbench-005 派生面失效-重建传播**" — BIZ-workbench-005 (workbench.md:82-87) is a *timing baseline* ("会话/终端侧任务变更 → 看板免手动刷新可见 ≤5 秒…"); it contains no "派生面失效-重建" clause. The propagation-behavior inference is plausible but anchored to a rule that doesn't state it. |

No hallucinated unclassified claims found — every behavioral claim maps to an FT fact, business rule, design interface, or is marked `source: inferred` with stated basis. 55 + 48 + 40 ≈ 145.

### 5. Surface Fitness — 77/100 (threshold 60)

- Mandatory web outcomes: validation-error embodied (step-2 `tearout-target-invalid`: 失效目标 → 明确提示、不静默建空窗) with explicit mapping comment ✓. **session-expired: mapping comment present, Outcome absent** (see 1.1) — the mapped behavior (detached 会话视图通道不可用 → 明确错误 + 恢复引导) is never specified. 20/40.
- Web language: user interactions (点击/切换/关闭/重进), page elements (pane 头/菜单/窗口标题/OS 标题栏/toast), async semantics (重进恢复/等待窗口集稳定/降级). Minor IPC-verb leakage counted under 2.3; −3 here for the same vocabulary reaching Output/Side-effect surfaces. 32/35.
- TUI timeout criterion: N/A for web → full marks. 25/25.

### 6. Internal Consistency — 135/150 (threshold 90)

- All 6 Journey Invariants hold in every Contract (单实例/主窗关闭=退出 ✓ steps 1b/4b; 记忆=pane 结构+窗口集、随项目存储、删除清除 ✓ steps 2/4/5b; 关闭≡收回·记忆与实际恒一致 ✓ step 4; 互不干扰·内核事实源 ✓ step 3; 绑定来源项目·不随激活指针 ✓ step 3c; M1 壳行为不变 ✓ step 1b). No violations. 60/60.
- Cross-Contract state references: narrative chain verified in Phase 1, no dangling references. 35/50 after deductions:

| # | Deduction | Evidence |
|---|-----------|----------|
| 6.1 | −8 | Dual modeling of the same concern: Steps 1/2 stage layout as `Project` field constraint (`field: "layout", value: "分屏态…"`) — `projects` has **no layout column** (er-diagram.md: layout lives in `project_ui_state.layout_json`), while Steps 4/5/6 model it as a `LayoutMemory` entity whose field_constraints (`detached`, `rightbar.panes`) are the real Interface-4 blob fields. Two different fixture shapes for one design concept across one set. |
| 6.2 | −7 | Entity-graph drift between adjacent steps staging the *same* state: step-5 success (双拆出态 setup) declares `Project + Session + Task`; step-6 success (that same 双拆出态 as precondition) declares only `Project + LayoutMemory` — the 会话窗's backing entity present in the producer step is dropped in the consumer step. |

- Outcome preconditions achievable from preceding States: verified ✓ (step-3 ← step-2 窗口集+1; step-5 ← step-4 pane 回主窗可再选中; step-6 ← step-5 窗口集=2). 40/40.

### 7. Anchor Integrity — 80/100 (threshold 60)

Handbook `design/page-map.md` exists → dimension active. All 6 Contracts carry `anchors.web.{page, route, requires_auth, layout}` + `last_anchor_sync`; `requires_auth: false` matches page-map "Auth: none(单用户桌面)". 40/40.

Anchor value verification vs page-map (拆出窗口(C10) section + View Keys):
- step-1 "项目工作台·pane 头菜单([拆出为窗口]入口)" ↔ page "项目工作台" + Navigation "pane 头 [拆出为窗口]" ✓; route `project` = canonical View Key ✓.
- step-2 "拆出窗口(C10)" ↔ handbook heading **verbatim** ✓; route "WindowRole={kind:'detached'}(主进程供给,不走 URL)" = View Key verbatim ✓; layout 首窗 960×640 = FT-102 ✓.
- step-3 "主窗口 + 拆出窗口并行(board / conversation 视图)" ↔ canonical pages 项目工作台 + 拆出窗口, sections "board 视图"/"conversation 视图" verbatim — acceptable as layout-state addressing per page-map's own note ("本图供 gen-contracts/gen-test-scripts 以**元素与状态**(非 URL)定位页面"). ✓
- step-4 "拆出窗口(C10)·[收回] / OS 标题栏关闭" ↔ verbatim page + Navigation "OS 关闭 ≡ [收回]" ✓; route `windowRecall(dsh-forge:window-recall)` code-verified (channels.ts:18) ✓.

Deductions:

| # | Deduction | Evidence |
|---|-----------|----------|
| 7.1 | −10 | step-5 page "**拆出窗口集合**(C10,复数窗并行)" — inserts 集合 into the handbook identifier "拆出窗口(C10)" used verbatim by steps 2/4 of this same set; same page, second identifier form. |
| 7.2 | −10 | step-6 page "**拆出窗口集合·重进恢复**(UF10 States restored)" — drops "(C10)" entirely; third identifier form for the same handbook page. |

Handbook internal consistency: no duplicate/conflicting page or route definitions in page-map (board double-hosting stated once; 拆出窗口 section consistent with Page Overview 壳层窗口 line). 30/30. 40 + 10 + 30 = 80.

### 8. Fixture Specification — 0/100 (threshold 60) — **VETO TRIGGERED**

`fixture_spec` present in all 13 Outcomes (newly generated → scored normally).

**Entity semantic verification (against design entities)**: Project→`projects`, Task→`task`, Session→upstream session state (tech-design Interface 3 input; accepted design-backed), DetachedWindow→窗口注册表 detached 集 / `project_ui_state.detached`(Interface 5 + Interface 4), LayoutMemory→`project_ui_state`(布局记忆). All five entity types are design-backed.

**VETO — entity completeness (step-6 `success`)**:

> Preconditions: "项目已处于双拆出态(**看板 + 会话两独立窗**)并离开(窗口集合已记入记忆)"
> fixture_spec.entities: **only** `Project` (min 1), `LayoutMemory` (min 1)

The Outcome's own Preconditions reference a 会话独立窗 whose restore must *succeed* — per this set's own step-6b, a detached entry whose target cannot resolve is the degraded path ("缺失目标的窗口降级呈现…其余窗口正常恢复"), and step-2c establishes the family rule that an invalid session target must not silently succeed. For "恢复态与离开时一致(UF10 States restored)" to hold, the conversation window's target Session must exist — **`Session` is missing from `fixture_spec.entities`**. Per rubric ("Score 0 if any entity type referenced in the Contract's Preconditions, Input, or State changes is missing from fixture_spec.entities — triggers the veto") the dimension scores 0. The gap is substantive: the success scenario as staged would deterministically fall into the step-6b degradation path, making the two Outcomes indistinguishable at execution time. (Task for the board window is a weaker corollary — a board renders empty — noted but not the veto basis.)

Corroborating fixture defects (for the revision; would independently cost points if the veto were lifted):

| # | Defect | Evidence |
|---|--------|----------|
| 8.2 | Derived pseudo-fields used as `field_constraints` instead of entity fields: Task."usage" (step-1 success), Task."mirrored" (step-3b), DetachedWindow."origin" (step-4 success), DetachedWindow."sourceProject" (step-3c — design field is `projectId` per WindowRole), LayoutMemory."stored" (step-6). None of these are fields of the declared design entities; fixtures cannot seed them as field values. | respective fixture blocks |
| 8.3 | step-2 `main-pane-rearrange` stages only `Project` + layout constraint — the pane being torn out hosts a view whose backing data (Task for board / Session for conversation) is undeclared, while sibling outcomes (step-2 success, step-5 success) declare it for the same action. | step-2 fixture block |
| 8.4 | Layout dual-modeling (see 6.1): `Project.layout` field constraint in steps 1/2 vs `LayoutMemory` entity in steps 4/5/6 — one design concept, two fixture shapes. | steps 1/2 vs 4/5/6 |

min_count declarations otherwise adequate (step-3c Project min 2 for A+B; step-5 Session/Task min 1 each for board+conversation pair; step-6 LayoutMemory detached = 2 entries as one row).

---

## Threshold Table

| Dimension | Score | Threshold | Pass |
|-----------|-------|-----------|------|
| Completeness | 130 | 90 | ✓ |
| Semantic Purity | 172 | 120 | ✓ |
| Precondition Exclusivity | 130 | 90 | ✓ |
| Fact Alignment | 145 | 90 | ✓ |
| Surface Fitness | 77 | 60 | ✓ |
| Internal Consistency | 135 | 90 | ✓ |
| Anchor Integrity | 80 | 60 | ✓ |
| Fixture Specification | **0** | 60 | **✗ (veto)** |
| **Total** | **869/1100** | 935 | **FAIL** |

---

## Phase 3 — Blindspot Hunt

1. **session-expired embodied nowhere** — the mapping comment (step-3) describes a fact-adjacent scenario (detached conversation view's dsh session channel unavailable → explicit error + retry/reconnect guidance, no silent blank, no lost content) that never became an Outcome. This is also the scored Surface Fitness gap; the fix is an Outcome, not a comment.
2. **ERR_WINDOW_NOT_FOUND cited but untested** — step-4's header comment cites "windowId 失效 → ERR_WINDOW_NOT_FOUND FT-104", yet no Outcome covers recall against an invalid/stale windowId (log + 窗口关闭事件兜底 per tech-design 窗口面 propagation). The comment advertises a fact the Outcomes never exercise.
3. **User-initiated open failure untested** — FT-104's other half (ERR_WINDOW_OPEN_FAILED: construction throw / document load failure → toast, window recalled) has no Outcome; step-2c covers invalid *target*, not failed *construction*.
4. **Remembered-geometry reuse unasserted** — step-4 success records geometry "供后续拆出/重放" and step-5's route states the FT-102 priority "重放 rect > 进程内记忆 > 缺省 960×640", but no Outcome asserts a *re-tearout after recall* (the step-4 → step-5 sequence!) reopening at the remembered rect rather than the default. The chain's own geometry loop is unverified.
5. **Restore-clears-suffix half of FT-105 untested** — step-5b covers archive (suffix added) and delete (windows closed), but not 恢复(restore) clearing the「已归档」suffix ("setProjectArchived refreshes live window titles immediately (**restore clears**)").
6. **Two distinct tearout entry seams flattened** — code has a pane-header action for board panes (`PaneControls.tsx`) *and* a tab actions-menu row for conversation-origin panes (`RightbarTabs.tsx:355` "the aside tab-menu [拆出为窗口] row (the conversation origin)"); the Contracts uniformly say "pane 菜单/pane 操作菜单". The conversation-origin seam (the one step-2c depends on!) is never named in any anchor or Input.

---

## Revision Directives (for gen-contracts revise pass)

1. step-6 success: add `Session` (live target for the conversation window, belongs_to Project) — and `Task` for board content parity with step-5 — to `fixture_spec.entities`. Unblocks the veto.
2. Add a real session-expired Outcome to step-3 (detached conversation view's session channel unavailable → explicit error + recovery guidance, no silent blank, no content loss), keeping `source: inferred` + the surface-web mapping comment; stop letting the comment carry the coverage claim alone.
3. Normalize the fixture vocabulary: replace pseudo-fields (Task.usage/mirrored, DetachedWindow.origin, sourceProject→projectId, LayoutMemory.stored) with real design fields or scenario-level `state_requirements`; model layout memory one way (LayoutMemory entity with Interface-4 fields `rightbar.panes`/`detached`) across all six files.
4. step-2 success: add discriminator "主窗尚有其余内容 pane"(and main-pane-rearrange keeps 唯一内容 pane)so the pair is mutually exclusive; or state success as ≥2 panes.
5. Purge implementation verbs from dimension values (windowOpenDetached/recallAll/recallAllForProject/dsh-app:/blob 块/project_ui_state → move to anchors or state-verification comments); replace step-6 State "断言前等待窗口集稳定" with the system-side async fact.
6. step-3b reasoning: re-anchor "派生面失效-重建传播" to TECH-product-arch-003 (数据内核单一事实源 + 派生视图) or BIZ-workbench-005's actual ≤5s propagation clause, not a nonexistent clause.
7. Unify the 拆出窗口 page identifier: steps 5/6 use the verbatim "拆出窗口(C10)" with state suffixes outside the identifier.
8. Consider Outcomes for blindspots 2/4/5 (ERR_WINDOW_NOT_FOUND recall; re-tearout remembered rect; restore clears archived suffix) — all fact-backed and cheap to specify.
