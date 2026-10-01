---
feature: "dsh-forge-m4"
journey: "task-session-roundtrip"
rubric: "contract (1100pt / 8 dimensions)"
iteration: 2
date: "2026-09-30"
verdict: "PASS (1067/1100; all dimensions above threshold; entity-completeness veto cleared)"
scorer_stance: "adversarial verification; every deduction carries file + quote"
---

# Contract Set Evaluation — iteration 2

**Scope**: 7 Contract files (`step-1` … `step-7`) in `docs/features/dsh-forge-m4/testing/task-session-roundtrip/contracts/`, 17 Outcomes total (was 13; revision added 4 boundary Outcomes).

**Evidence base consulted**: rubric `skills/eval/rubrics/contract.md`; surface rule `skills/gen-journeys/rules/surface-web.md`; handbook `design/page-map.md`; `.forge/fact-table.json` (FT-035, FT-052, FT-106..FT-112 verified verbatim); `docs/business-rules/workbench.md` (BIZ-workbench-007/008); `design/tech-design.md` Interface 3/6/7; `design/er-diagram.md`; `prd/prd-ui-functions.md` (UF5/UF6); `journey.md`.

---

## Iteration-1 fix verification (re-verified, not taken on trust)

| # | Iteration-1 issue | Verdict | Evidence |
|---|-------------------|---------|----------|
| 1 | **VETO**: step-3 `inference-degraded` fixture declared only Project/Task (+ `state_requirements` escape hatch) while Input/State referenced 挂接 (SessionLink) and 后代 (SubagentSession) | **FIXED** | fixture now declares all five entities: `SessionLink … "active(挂接保持,不因降级撤销)"`, `Session … field: "snapshot"`, `SubagentSession … "「任务 id + title」命名(在场;降级期暂不呈现)"`; `state_requirements` block removed from the entire set |
| 2 | Entity-graph drift: SubagentSession→Task / Task→Feature in step-6 | **FIXED** | normalized everywhere: Task→Project (all 17 outcomes), SessionLink→Task, Session→SessionLink, SubagentSession→Session (every occurrence). step-6 success no longer declares Feature; 所属 feature is carried as Task `feature_slug` constraint |
| 3 | step-5 open-target-missing staged absent entity as `SubagentSession min_count: 1` | **FIXED as directed** | now `SessionLink … "active(行展开持有陈旧 subagent 地址引用…)"`, no SubagentSession; residual nuance → new deduction 8.1 below |
| 4 | step-7 success not exclusive vs rename; step-3 success missing budget clause | **FIXED** | step-7 success precondition adds "subagent 会话命名遵循「任务 id + title」约定(未被手工改名)"; step-3 success adds "推断在预算内(≤100ms)完成" and "数量在上限内(≤20)" |
| 5 | "(e2e 断言)" / "Interface 6" / M1 session-focus framing in dimension values | **FIXED** | step-4 Output now "该顶层会话经会话打开通道打开(与 subagent 打开同一通道,顶层入参 = 会话 id)"; write-path correction confined to header comment ("openSessionTarget(sessionId) 唯一写路径…M1 sessionFocus 主进程通道 = 冻结 fallback 保留,不参与 M4 链路") |
| 6 | Missing literal `source: inferred`; step-1 cited FT-108 for a BIZ-workbench-008 behavior | **FIXED** | all 6 inferred Outcomes carry `<!-- source: inferred -->`; step-1 reasoning now cites "BIZ-workbench-008「执行中」判定:状态 × 挂接正交" |
| 7 | step-5 anchor dropped canonical section name | **FIXED** | "项目工作台·中间会话面板(C2,subagent 会话定位)" — canonical "中间会话面板(C2)" matches page-map and step-4 |
| 8 | Blindspots 1–4 unbounded/uncovered | **FIXED** | new Outcomes: step-1 `launch-disabled-terminal`, step-2 `ended-lineage-unavailable`, step-3 `descendant-cap-fold`, step-6 `unbound-no-metadata` — all fact-grounded, exclusive, and well-formed |

No regression detected: journey invariants remain verbatim from `journey.md:137-142` in all 7 files; all 6 journey edge cases (1b/3b/3c/5b/6b/7b) still mapped; chain of state references intact.

---

## Phase 1 — Reasoning Audit (cross-Contract state chain)

| Step | Outcomes | Precondition source | Chain verdict |
|------|----------|--------------------|---------------|
| 1 | success / no-session-link / launch-disabled-terminal | board availability; status × link orthogonality (BIZ-workbench-008) | the three preconditions partition {in_progress∧active, in_progress∧¬active, terminal∧¬active} — mutually exclusive; dock-open state produced for step 2 |
| 2 | success / ended-lineage-unavailable | dock open (step 1 State) | ended-only staging consistent with step-1 world; trigger source explicitly distinguished from step-3c ("触发源 = 会话 disposed(非计算超时,区别于 inference-degraded)") |
| 3 | success / no-subagent-hit / inference-degraded / descendant-cap-fold | active link row expansion (steps 1–2 world) | count axis (≤20 vs >20) and budget axis (≤100ms vs >100ms/失败) partition success/cap/degraded; one residual overlap → deduction 3.1 |
| 4 | success | 挂接历史行条目呈现 (step-3 world) | consistent |
| 5 | success / open-target-missing | lineage hit (step-3 success) | consistent; failure state isolated ("工作台状态不受损") |
| 6 | success / multi-task-ambiguity / unbound-no-metadata | "subagent 会话视图在屏" (bound to step-5 State) | hit-count axis (1 / ≥2 / 0) partitions the three C6 states per FT-110 |
| 7 | success / rename-vs-lineage-conflict | naming-convention axis added | now mutually exclusive |

Narrative chain coherent, no dangling references. Fixture worlds are now a single consistent entity graph across all 7 files.

---

## Phase 2 — Dimension Scores

### 1. Completeness — 150/150 (threshold 90)

- All 17 Outcomes carry non-empty Preconditions/Input/Output/State; Side-effect explicitly "none". 50/50.
- `## Journey Invariants` present in all 7 files, 6 entries each, verbatim from journey.md. 50/50.
- Happy path per step; both surface-mandated derived outcomes present with mapping comments (step-1 no-session-link ← validation-error; step-5 open-target-missing ← session-expired); all 6 journey edge cases mapped; 4 additional fact-backed boundary outcomes added. 50/50.

### 2. Semantic Purity — 192/200 (threshold 120)

- Natural language / no regex, selectors, XPath, assertion calls: `min(440px, 45vw)` is geometry (product-dimension language, FT-111-verbatim), not a selector. −2 for a log-line identifier carried inside a State value: step-3 inference-degraded State "单行结构化降级日志(**[forge-lineage] degraded**)" — an implementation artifact name; the user-visible fact (silent degrade + one structured log) stands without the tag. 78/80.
- Preconditions declarative: −2 (carried from iteration-1, now load-bearing): step-3 success/degraded preconditions embed a compute-budget condition ("推断在预算内(≤100ms)完成" / "计算 >100ms 或失败") — an environmental/performance state rather than a data state; mandated by the exclusivity fix, honestly expressed. 58/60.
- Implementation coupling: −4 for API-parameter semantics as behavior carriers in Outputs: step-4 "顶层**入参 = 会话 id**"; step-5 "(**地址三元组入参**,与顶层同一通道)". The dual-channel parameterization is Interface-6 vocabulary; a user-level phrasing ("以会话号定位" / "以 subagent 地址定位") would keep the fact without the param grammar. All heavy coupling (SubagentAddress, Interface 6, openSessionTarget, M1 session-focus) now correctly confined to frontmatter/comments. 56/60.

### 3. Precondition Exclusivity — 140/150 (threshold 90)

- Preconditions distinct across Outcomes within each Step: all pairs partition on explicit axes (status × link-state in step 1; active-presence in step 2; count × budget in step 3; address-resolvability in step 5; lineage-hit-count in step 6; naming-convention in step 7). 60/60.
- Sufficient to uniquely select: −10. step-3 `no-subagent-hit` ("active 挂接顶层会话血缘树内无 origin=subagent 会话(如顶层会话自身执行)") lacks the inference-health clause that `success` and `descendant-cap-fold` received. A snapshot-absent state (快照缺席) matches BOTH no-subagent-hit (tree yields no subagent hits) and `inference-degraded` ("计算 >100ms 或失败(快照缺席/预算超时)"). The fixtures are disjoint (no-hit stages a clean Session and no SubagentSession; degraded stages snapshot-absent/malformed), so a selector staging from fixture_spec disambiguates — but the written preconditions alone do not. 40/50.
- Error/boundary triggers explicit: every boundary Outcome states its trigger (无 active 挂接 / 任务终态 / 无 subagent 命中 / >100ms 或快照缺席 / >20 上限 / 地址陈旧 / 零命中 / 手工改名). 40/40.

### 4. Fact Alignment — 150/150 (threshold 90)

- Factual claims traceable: FT-106 (degrade triggers, silent + one structured log, auto-recovery — including the fixture's two staged trigger sources "在场但血缘树规模使计算 >100ms,或缺席/畸形(FT-106 两类降级触发源)"); FT-107 (cap 20 + 「查看全部」 fold + "溢出不破坏 parent 会话树归拢折叠", SubagentSession `min_count: 21`); FT-108 (只读不落库; rename conflict lineage-wins); FT-109 (ERR_SESSION_OPEN_FAILED → open-failed, "不静默、不崩溃"); FT-110 (bound/ambiguous/unbound 三态, incl. unbound "渲染为空"); FT-111 (dock geometry/focus trap/aria-busy); FT-112 (active/ended 新→旧, ended expandable); FT-033 (terminal = completed/skipped/rejected); FT-035 (two active links from two tasks to one session is legal under UNIQUE(project_id, task_key, session_id) — step-6b staging is schema-valid); 所属 feature grounded (`prd/prd-ui-functions.md:244` UF6); "第四手风琴节" grounded (iteration-1 verified, unchanged). step-4's stale M1 session-focus framing corrected to the Interface-6 write path in the header comment. 60/60.
- Inferred claims: all 6 inferred Outcomes carry literal `source: inferred` + reasoning citing the triggering rule (page-map todo#30; tech-design Interface 3; FT-107 × BIZ-workbench-007; FT-110); both surface-mandated mappings retain explicit `surface-web required_outcomes 映射` comments. 50/50.
- No hallucinated/unclassified claims found. 40/40.

### 5. Surface Fitness — 98/100 (threshold 60)

- Mandatory web outcomes present and mapped (validation-error → step-1 no-session-link; session-expired → step-5 open-target-missing). 40/40.
- Surface-appropriate language: user interactions (点击/展开/察看), page elements (dock/徽标/手风琴节/行尾 ▾/composer 上方座位), async semantics (降级/自动恢复/aria-busy). −2 for residual API-param grammar in Output values ("顶层入参 = 会话 id", "地址三元组入参" — same instances as purity 2.3; anchors may keep `openSessionTarget(SubagentAddress)` since they are sync metadata, and they do). 33/35.
- TUI timeout criterion: N/A for web. 25/25.

### 6. Internal Consistency — 150/150 (threshold 90)

- All 6 invariants hold in every Outcome, including the four new ones (cap-fold explicitly asserts "溢出不破坏 parent 会话树归拢折叠"; unbound preserves 零侵入; launch-disabled creates no session; ended-lineage-unavailable is read-only). 60/60.
- Cross-Contract references consistent; the entity graph is now ONE graph: Task→Project in all 17 fixtures, SubagentSession→Session at every occurrence, Session declared wherever referenced (iteration-1 defect 6.1 eliminated). The step-4 Output's "同一通道、入参分工" is reconciled with the journey invariant's older "顶层走 session-focus" wording by the contract's own invariant annotation — no contradiction on the page. 50/50.
- Outcome Preconditions achievable from preceding States (step-4 条目呈现 ← step-3 world; step-6 "会话视图在屏" ← step-5 success State; step-6 unbound stages its own ended-only world). 40/40.

### 7. Anchor Integrity — 100/100 (threshold 60)

- All 7 Contracts carry `anchors.web.{page, route, requires_auth, layout}` + `last_anchor_sync`; requires_auth=false matches page-map "Auth: none(单用户桌面)". 40/40.
- Values match the handbook: step-1 "任务详情 dock(C5)" + TabKind='board' 双宿主 verbatim; steps 2/3 use element/state addressing permitted by page-map's own note; steps 4/5 use canonical "中间会话面板(C2)" (iteration-1 mismatch fixed); step-6 "C6 任务元数据条" grounded in page-map C2 row ("C6 元数据条注入(仅 subagent 实例)"); step-7 "左栏项目树(C3)". 30/30.
- Handbook internal consistency: no duplicate/conflicting page or route definitions. 30/30.

### 8. Fixture Specification — 87/100 (threshold 60) — veto NOT triggered

Entity semantic verification: Project→`projects`, Task→`task`, SessionLink→`session_links`, Session→upstream `SessionListState.byId`, SubagentSession→upstream `subagentsByParent`/`SubagentListEntry` (Interface 3). All design-backed; naming convention consistent.

**Entity completeness (veto item)**: every entity whose presence an Outcome's Preconditions/Input/State require is declared in `fixture_spec.entities` — verified outcome-by-outcome across all 17. Absent-by-design entities (Session in step-2 ended-lineage-unavailable; SubagentSession in step-3 no-subagent-hit and step-5 open-target-missing) are documented absences ("布景 = disposed 会话经不声明 Session 表达(缺位即上游 byId 缺席)"; "不声明缺席目标实体") — absence is the scenario, which a fixture cannot and should not seed. 40/40.

Relationship and constraint coverage: 22/35 after two deductions.

| # | Deduction | Evidence |
|---|-----------|----------|
| 8.1 | −10 | step-5 open-target-missing stages the stale address as a SessionLink field value: `field: "status" … "active(行展开持有陈旧 subagent 地址引用——所指目标已不存在或已清理)"`. `session_links` has no address column (FT-035: project_id/task_key/session_id/status/started_at/ended_at); addresses are click-time lineage derivations over the upstream snapshot (FT-108). As staged, the clickable stale entry has no declared data source — lineage over {Session top-only} yields no subagent row to click, and no SubagentSession-in-snapshot (or channel-absent trigger per the mapping comment "宿主/会话通道不可用使打开动作失败") is expressed. The scenario needs either a declared stale subagent listing or an explicit channel-unavailable staging note; a SessionLink status constraint cannot carry it. |
| 8.2 | −3 | `Session belongs_to SessionLink` inverts the real reference direction (FT-035: the link row carries session_id; one Session may have many links). Uniform across the set (so no drift), but it loses expressiveness exactly where the journey needs it: step-6 multi-task-ambiguity stages `SessionLink min_count: 2` + `Session min_count: 1 (belongs_to SessionLink)` — one child under a two-parent ambiguity, disambiguated only by prose constraints ("两条 active(分属两任务,指向同一顶层会话)" / "两任务共用"). Also `Session."snapshot"` (step-3 degraded) is a presence/shape descriptor, not a Session field. |

Minimum data quantity: SessionLink/Session min 2 (step-2 active+ended), SubagentSession min 21 (step-3 cap), Task/SessionLink min 2 (step-6 一话多任务) — all sufficient; single-entity outcomes min 1 appropriate. 25/25.

---

## Threshold Table

| Dimension | Score | Threshold | Pass |
|-----------|-------|-----------|------|
| Completeness | 150 | 90 | ✓ |
| Semantic Purity | 192 | 120 | ✓ |
| Precondition Exclusivity | 140 | 90 | ✓ |
| Fact Alignment | 150 | 90 | ✓ |
| Surface Fitness | 98 | 60 | ✓ |
| Internal Consistency | 150 | 90 | ✓ |
| Anchor Integrity | 100 | 60 | ✓ |
| Fixture Specification | 87 | 60 | ✓ |
| **Total** | **1067/1100** | 935 | **PASS** |

---

## Phase 3 — Blindspot Hunt

1. **Step-4 top-path open failure still uncovered** (iteration-1 blindspot 6, unaddressed): FT-109 rejections (ERR_SESSION_OPEN_FAILED → open-failed toast) apply to the TOP session id path too; only the subagent path (step-5b) covers open failure. One mirrored Outcome on step-4 would close it.
2. **Zero-links-ever unstaged**: step-1 no-session-link requires `SessionLink min_count: 1 (ended)`; the never-linked rendering (FT-052 `detail.links.empty = 该任务尚未挂接会话` with zero rows) is adjacent but never staged as its own fixture.
3. **计数徽标 unasserted**: BIZ-workbench-007 mandates the running/total count badge on the collapsed parent row; step-7 Output says "会话树徽标…(反查互证)" generically without asserting the 运行中/总数 counts.
4. **Terminal ∧ active-link state matches no Outcome** in step-1 (terminal task with an unconverged active link) — not ambiguous, but uncovered; the 执行中判定 (BIZ-workbench-008) would present it as executing.
5. **Aside path uncovered**: FT-109's `openSessionTargetAside` (right-pane, no view switch) has no Outcome — out of journey scope, note only.

These are coverage refinements, not rubric failures.
