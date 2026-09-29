---
feature: "dsh-forge-m4"
journey: "task-session-roundtrip"
rubric: "contract (1100pt / 8 dimensions)"
iteration: 1
date: "2026-09-30"
verdict: "FAIL (909/1100; Fixture Specification below threshold — entity-completeness veto triggered)"
scorer_stance: "adversarial verification; every deduction carries file + quote"
---

# Contract Set Evaluation — iteration 1

**Scope**: 7 Contract files (`step-1` … `step-7`) in `docs/features/dsh-forge-m4/testing/task-session-roundtrip/contracts/`, 13 Outcomes total.

**Evidence base consulted**:
- Rubric: `skills/eval/rubrics/contract.md` (1100pt, pass = total ≥935 AND every dimension ≥ threshold)
- Surface rule: `skills/gen-journeys/rules/surface-web.md` (required_outcomes: validation-error + session-expired)
- Handbook: `docs/features/dsh-forge-m4/design/page-map.md`
- Fact Table: `.forge/fact-table.json` (FT-106..FT-112 verified verbatim)
- Business rules: `docs/business-rules/workbench.md` (BIZ-workbench-006/007/008), `resilience.md` (BIZ-resilience-001)
- Design: `design/tech-design.md` (Interface 3 lineage / Interface 6 open channel), `design/er-diagram.md`
- PRD: `prd/prd-spec.md` §必答⑥, `prd-user-stories.md` Story 2/7, `prd-ui-functions.md` UF5/UF6

---

## Phase 1 — Reasoning Audit (cross-Contract state chain)

State chain walkthrough:

| Step | Precondition source | State produced | Chain verdict |
|------|--------------------|----------------|---------------|
| 1 success | in_progress + active 挂接 (BIZ-workbench-008 判定) | dock 打开、任务详情在屏 | OK |
| 2 | "任务详情 dock 已打开" | 纯读、零变更 | consistent with step 1 State |
| 3 | active 挂接 + 血缘树内 subagent | 只读推断、不落库 | consistent with step 1/2 fixture world |
| 4 | "挂接历史行呈现顶层会话条目" | 工作台定位到目标会话 | consistent with step 3 展开后呈现 |
| 5 | "血缘推断命中 origin=subagent" | 会话视图定位 subagent | consistent with step 3 success |
| 6 | "subagent 会话视图在屏" (bound) | 双向互达 | consistent with step 5 State |
| 7 | "项目会话树含带 subagent 后代的 parent 会话" | 归拢只读呈现 | consistent (same fixture world) |

Narrative chain is coherent; no dangling step references. **The audit defect is at the fixture level, not the narrative level**: the entity graphs diverge across Contracts for the same entities (see Fixture Specification and Internal Consistency), and boundary outcomes involving *absent* sessions systematically drop the entities that stage them.

---

## Phase 2 — Dimension Scores

### 1. Completeness — 150/150 (threshold 90)

- All 13 Outcomes carry non-empty Preconditions / Input / Output / State; Side-effect explicitly "none" throughout. 50/50.
- `## Journey Invariants` present in all 7 files, 6 entries each, verbatim from journey.md. 50/50.
- Happy path in every step; both surface-mandated derived outcomes present with explicit mapping comments (step-1 no-session-link ← validation-error; step-5 open-target-missing ← session-expired). All 6 journey edge cases (1b/3b/3c/5b/6b/7b) have corresponding Outcomes. 50/50.

### 2. Semantic Purity — 182/200 (threshold 120)

Deductions:

| # | Deduction | Evidence |
|---|-----------|----------|
| 2.1 | −8 | Verification-instruction language inside Output values (rubric: describe *what* the system produces, not *how* to verify): step-4 Output "…打开该顶层会话并定位到会话视图**(e2e 断言)**"; step-5 Output "…≤1 次点击**(e2e 断言)**". |
| 2.2 | −2 | Precondition axis mixing: step-3 inference-degraded precondition "血缘推断计算 >100ms 或失败" is an environmental/compute condition, not a declarative data state; acceptable but not exemplary. |
| 2.3 | −8 | Design-interface coupling inside dimension values: step-4 Output "经 M1 session-focus 语义的会话打开通道**(Interface 6 顶层路径)**"; step-5 State "零侵入(**上游公共 seam**)"; step-5 Output "经 dsh 原生 **SubagentAddress** 打开" (API type name as behavior carrier). Borderline — the names double as product vocabulary — but the rubric asks for system-level behavior language. |

No regex, CSS selectors, XPath, or framework assertion calls anywhere. 72 + 58 + 52 = 182.

### 3. Precondition Exclusivity — 120/150 (threshold 90)

Deductions:

| # | Deduction | Evidence |
|---|-----------|----------|
| 3.1 | −20 (ambiguous pair) | step-7: success precondition "项目会话树含带 subagent 后代的 parent 会话;该任务的任务详情 dock 可对照" vs rename-vs-lineage-conflict "subagent 会话被手工改名(命名约定被破坏)". A renamed subagent satisfies BOTH preconditions (a renamed subagent is still a subagent descendant); success never states 命名约定保持. The true discriminator (naming-convention status) is stated only on one side. Inputs partially differentiate ("察看左栏" vs "两侧反查") but success's own Output "会话树徽标与任务详情 dock 两侧均能识别该任务归属(反查互证)" overlaps the rename outcome's input space. |
| 3.2 | −10 (insufficient selection) | step-3: success ("血缘树内存在 origin=subagent 会话") and inference-degraded ("计算 >100ms 或失败") are orthogonal axes. A state with subagent present AND budget exceeded matches both; success does not carry "且推断在预算内完成". |

Error/boundary triggers all stated explicitly (no-link: 无 active 挂接; no-subagent-hit: 血缘树内无 subagent; degraded: >100ms/快照缺席; open-target-missing: 已不存在或已清理; ambiguity: 一话多任务; rename: 手工改名). 40/40 on criterion 3. Total 40 + 40 + 40 = 120.

### 4. Fact Alignment — 130/150 (threshold 90)

Verified facts (all accurate against fact-table.json):
- FT-106 → step-3 inference-degraded ("单行结构化降级日志([forge-lineage] degraded);纯重算使下次调用自动恢复" — verbatim semantics of budget.ts fact).
- FT-108 → step-3 success State "只读计算,不落库、可随时重算"; step-7 rename outcome.
- FT-109 → step-4/step-5 open channel + ERR_SESSION_OPEN_FAILED → open-failed toast, never silent (step-5 open-target-missing).
- FT-110 → step-6 bound/ambiguous states (task key/title/status Pill + 查看任务 ghost; 「该会话执行中」无任务号无跳转).
- FT-111 → step-1 success dock geometry/focus trap/aria-busy.
- FT-112 → step-2 active/ended 新→旧, ended expandable.
- BIZ-workbench-007/008, BIZ-resilience-001 — all honored (see Internal Consistency).

Deductions:

| # | Deduction | Evidence |
|---|-----------|----------|
| 4.1 | −7 | Terminology tension reproduced unresolved: step-4 Output "经 **M1 session-focus 语义**的会话打开通道" — PRD (`prd-spec.md` §必答⑥ "顶层走 M1 session-focus") vs tech-design Interface 6: "M1 sessionFocus 主进程通道 = **冻结 fallback 保留,不参与 M4 链路**"(实际写路径 = ctx.uiWorkspace.openSession). The contract hedges ("语义" + "Interface 6 顶层路径") and its own state-verification comment states the correct path ("openSessionTarget(sessionId) 同一写路径"), but the dimension value carries the stale framing. |
| 4.2 | −3 | Loose citation: step-1 no-session-link reasoning cites "执行中判定矩阵;**FT-108 族**" — the 未挂接会话/常规展示 behavior is BIZ-workbench-008 (workbench.md), not FT-108 (lineage purity). Right behavior, wrong anchor. |
| 4.3 | −10 | Missing literal `source: inferred` markers. The two surface-mandated derived outcomes carry explicit rule-mapping comments ("surface-web required_outcomes 映射:validation-error →…", "…session-expired →…") which satisfies the *reasoning basis* requirement, but the rubric-mandated annotation form `source: inferred` appears nowhere; all boundary outcomes use `source: journey Step Nb`. |

"第四手风琴节" (step-2 route) verified grounded: `prd-ui-functions.md:196` / `ui-design.md:346` "现有四手风琴节(描述/依赖链/执行记录/挂接历史)". No hallucinated claims found — every claim maps to FT/BIZ/journey/PRD/page-map. 53 + 38 + 39 = 130.

### 5. Surface Fitness — 97/100 (threshold 60)

- Mandatory web outcomes: validation-error mapped (step-1 no-session-link) and session-expired mapped (step-5 open-target-missing), both with journey-echoed mapping rationale (no form surface in this journey → error-state presentation mapping). 40/40.
- Web language: user interactions (点击/展开/察看), page elements (dock/徽标/手风琴节/pane/行尾 ▾), async semantics (降级/自动恢复). Minor API vocabulary leakage (SubagentAddress, Interface 6) — −3. 32/35.
- TUI timeout criterion: N/A for web → full marks. 25/25.

### 6. Internal Consistency — 140/150 (threshold 90)

- All 6 Journey Invariants hold in every Contract (只读不落库 ✓ step-3; 归拢不顶层 ✓ step-7; ≤1 次点击 ✓ steps 4/5; dock 同构 ✓ step-1; 零侵入 ✓ steps 5/6; 100ms 降级 ✓ step-3c). No violations. 60/60.
- Cross-Contract state references: narrative chain verified in Phase 1, no dangling references. 40/50 after deduction:

| # | Deduction | Evidence |
|---|-----------|----------|
| 6.1 | −10 | Entity-graph drift for the same entities across Contracts: SubagentSession `belongs_to Session` (steps 3/5/7) vs `belongs_to Task` (step-6 success: `parent_entity: "Task"`, field "binding"); Task `belongs_to Project` (steps 1/2/3/4/5/7 and step-6 multi-task) vs `belongs_to Feature` (step-6 success) — **within the same file**, step-6 success has Task→Feature while step-6 multi-task-ambiguity has Task→Project. Lineage binding is a derived runtime join (tech-design Interface 3; er-diagram 血缘不落库), so modeling it as a `belongs_to` FK in step-6 contradicts the design's purity stance the other five files honor. |

- Outcome preconditions achievable from preceding States: verified ✓ (step-6 "会话视图在屏" ← step-5 State; step-4 条目呈现 ← step-3 展开). 40/40.

### 7. Anchor Integrity — 90/100 (threshold 60)

Handbook `design/page-map.md` exists → dimension active. All 7 Contracts carry `anchors.web.{page, route, requires_auth, layout}` + `last_anchor_sync`. requires_auth=false matches page-map "Auth: none(单用户桌面)".

Anchor value verification vs page-map:
- step-1 "任务看板(右栏 pane)·任务详情 dock(C5)" ↔ page "任务看板(右栏 pane / 拆出窗口双宿主)" + section "任务详情 dock(C5)" ✓; route TabKind='board' matches View Key ✓.
- step-2/3 page·section derivations ("挂接历史节", "active 行展开") — acceptable under page-map's own addressing note ("本图供 gen-contracts/gen-test-scripts 以元素与状态(非 URL)定位页面").
- step-4 "项目工作台·中间会话面板(C2,会话定位)" ↔ section "中间会话面板(C2)" ✓.
- step-7 "项目工作台·左栏项目树(C3)" ↔ section "左栏项目树(C3)" ✓.

Deductions:

| # | Deduction | Evidence |
|---|-----------|----------|
| 7.1 | −10 | step-5 page "项目工作台·**会话面板(subagent 定位)**" drops the canonical section name "中间会话面板(C2)" used verbatim by page-map and by step-4 of this same set — same target section, two different identifiers in one Contract set. |

Handbook internal consistency: no duplicate/conflicting page or route definitions in page-map (board double-hosting is stated once, consistently). 30/30. Full page-map coverage (C7 确认卡/概览逃生门/拆出窗口) belongs to the other 5 journey contract sets — out of scope for this single-journey eval. 40 + 20 + 30 = 90.

### 8. Fixture Specification — 0/100 (threshold 60) — **VETO TRIGGERED**

`fixture_spec` present in all 13 Outcomes (newly generated → scored normally, no backward-compatible clause).

**Entity semantic verification (against design entities)**: Project→`projects`, Task→`task`, SessionLink→`session_links`, Feature→`feature_snapshot`(M2)+docs/features domain, Session→upstream `SessionListState.byId`, SubagentSession→upstream `subagentsByParent`/`SubagentListEntry` (tech-design Interface 3). All six entity types are design-backed; naming convention (PascalCase domain name vs snake_case table) is consistent.

**VETO — entity completeness (step-3 `inference-degraded`)**:

> Input: "编排者察看**挂接历史节**/会话树" ; State: "**挂接保持**、**后代**暂不呈现;单行结构化降级日志"
> fixture_spec.entities: **only** `Project`, `Task` (+ nonstandard `state_requirements.prerequisite_entity: "Session"`)

The Outcome's own Input and State reference SessionLink (挂接 = session_links rows retained on screen) and SubagentSession (后代 = lineage descendants suppressed) — **both missing from `fixture_spec.entities`**. Per rubric ("Score 0 if any entity type referenced in the Contract's Preconditions, Input, or State changes is missing from fixture_spec.entities — triggers the veto") the dimension scores 0. The gap is substantive, not pedantic: 挂接历史节 cannot render and lineage cannot compute over a fixture of only Project+Task; the `state_requirements` block is an escape hatch that acknowledges the missing `Session` while leaving `SessionLink`/`SubagentSession` entirely undeclared. FT-106's degrade triggers (snapshot-absent / budget-expired) presuppose a computation target that this fixture cannot stage.

Corroborating fixture defects (for the revision; would independently cost points if the veto were lifted):

| # | Defect | Evidence |
|---|--------|----------|
| 8.2 | Steps 5/6/7 fixtures never declare `Session` (top-level) or `SessionLink` although every SubagentSession declares `parent_entity: "Session"` and the lineage/binding chain (BIZ-workbench-007: 任务 → session_links active → 血缘树) requires both. The parent entity exists in the graph only as a dangling reference. | step-5 success entities: Project/Task/SessionLink/SubagentSession (no Session); step-6 success: Project/Feature/Task/SubagentSession (no Session, no SessionLink); step-7 rename: Project/Task/SubagentSession (no Session, no SessionLink). |
| 8.3 | Semantic contradiction: step-5 open-target-missing declares `SubagentSession, min_count: 1` with constraint "已不存在或已清理(目标缺失)" — materializing a count for a non-existent entity. The fixture should declare the *reference* (SessionLink + stale address) not the absent session. | step-5 open-target-missing fixture. |
| 8.4 | Derived pseudo-fields used as `field_constraints` instead of entity fields: Session."descendants" (step-3 no-subagent-hit), Task."sessions" (step-6 multi-task), SubagentSession."binding" (step-6 success). These are runtime lineage joins, not fields of the declared entities — fixtures cannot seed them as field values. | respective fixture blocks. |

min_count declarations otherwise adequate (step-2 SessionLink/Session min 2 for active+ended; step-6 Task min 2 for 一话多任务).

---

## Threshold Table

| Dimension | Score | Threshold | Pass |
|-----------|-------|-----------|------|
| Completeness | 150 | 90 | ✓ |
| Semantic Purity | 182 | 120 | ✓ |
| Precondition Exclusivity | 120 | 90 | ✓ |
| Fact Alignment | 130 | 90 | ✓ |
| Surface Fitness | 97 | 60 | ✓ |
| Internal Consistency | 140 | 90 | ✓ |
| Anchor Integrity | 90 | 60 | ✓ |
| Fixture Specification | **0** | 60 | **✗ (veto)** |
| **Total** | **909/1100** | 935 | **FAIL** |

---

## Phase 3 — Blindspot Hunt

1. **C6 `unbound` 态 uncovered** — FT-110 defines three C6 states (bound/ambiguous/**unbound — renders nothing**); contracts cover bound (step-6 success) and ambiguous (step-6b) only. A no-lineage-hit subagent session rendering no metadata bar is a fact-backed boundary with no Outcome.
2. **Descendant display cap unasserted** — FT-107 (`LINEAGE_DESCENDANT_LIMIT=20` + 「查看全部」 fold) is cited in step-3's header comment but no Outcome asserts cap/fold behavior; BIZ-workbench-007 also mandates 计数徽标(运行中/总数). The comment cites a fact the Outcomes never test.
3. **No-link [发起] terminal-state disabling unasserted** — page-map C5 row: "No-link 态 [发起] 按任务终态禁用(todo#30)"; step-1 mentions it only in a comment; no Outcome covers the disabled entry on a terminal-state task.
4. **Ended-link lineage-unavailable display** — tech-design Interface 3: "ended 挂接:会话已 disposed → byId 缺席 → 行可展开但血缘位「不可用」". Step-2 asserts ended rows expandable 查看历史 but the 血缘位不可用 sub-state has no Outcome (distinct trigger from inference-degraded).
5. **Step-2 zero-boundary** — only journey step with a single Outcome; zero-links-ever 挂接历史节 empty rendering is never asserted (step-1b covers dock-open state, not the section's empty content).
6. **Step-4 has no failure Outcome of its own** — FT-109 rejections apply to the top path too (openSessionTarget rejections carry ERR_SESSION_OPEN_FAILED regardless of target kind); only the subagent path (step-5b) covers open failure.

---

## Revision Directives (for gen-contracts revise pass)

1. step-3 inference-degraded: add SessionLink (active, retained), Session (top-level, snapshot-absent-or-present), SubagentSession to `fixture_spec.entities`; fold `state_requirements` into proper entity constraints. Unblocks the veto.
2. Normalize the entity graph: pick one canonical parent per entity across all 7 files (Task→Project or Task→Feature consistently; SubagentSession→Session always; binding/ambiguity expressed via field_constraints on the *link/lineage* inputs, not by re-parenting). Declare `Session` wherever it appears as `parent_entity`.
3. step-5 open-target-missing: restate the fixture as SessionLink + stale address reference (target absent), not SubagentSession min_count 1.
4. step-7 success precondition: add "subagent 会话命名遵循「任务 id + title」约定" to be mutually exclusive vs rename-vs-lineage-conflict. step-3 success: add "且血缘推断在预算内完成".
5. Replace "(e2e 断言)" in Output values with user-visible assertions; strip "Interface 6" from Output text (keep it in anchors/comments); resolve session-focus wording to the Interface 6 write path.
6. Add literal `source: inferred` annotations on the two surface-mandated outcomes; fix step-1's citation to BIZ-workbench-008.
7. step-5 page anchor: use canonical section name "中间会话面板(C2)".
8. Consider adding Outcomes for blindspots 1/2/3/4 (fact-backed boundaries currently uncovered).
