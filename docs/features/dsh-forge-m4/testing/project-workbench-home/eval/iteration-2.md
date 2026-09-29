---
feature: dsh-forge-m4
journey: project-workbench-home
iteration: 2
rubric: eval/rubrics/journey.md (1150pt, 7 dimensions)
surface: web (rules/surface-web.md)
score: 1048
target: 975
status: pass (total ≥ 975; all dimensions ≥ min threshold)
generated: 2026-09-30
---

# Eval-Journey Iteration 2 — project-workbench-home

**Final Score**: 1048/1150 (target 975) — **REACHED**
**Threshold**: all 7 dimensions above min (lowest = Precondition Exclusivity 134/150 vs 90). PASS.
**Golden Path veto**: NOT triggered (semantic verification passed; see Workflow Coverage).

Scorer context loaded: `rules/surface-web.md` (mandatory `validation-error` + `session-expired`, strategy 50/50), all 6 files in `docs/business-rules/`, `prd/prd-user-stories.md` (Story 1 = ground truth), `prd/prd-spec.md`, `prd/prd-ui-functions.md`, `docs/proposals/dsh-forge-m4/proposal.md` (Key Scenarios verified), iteration-1 report, and `git diff HEAD` of the revision.

---

## Revision Verification (iteration-1 issues → fixed?)

| Iter-1 issue | Revision response | Verdict |
|---|---|---|
| D1 Surface Fitness floor: mandatory `validation-error`/`session-expired` absent | Both now discharged as house-pattern mapping comments with rule citation + `source: inferred` (after Step 1b and Step 4b); `network-error` comment also gained `source: inferred` | **FIXED** |
| D2 Completeness mirror of D1 | Same comments satisfy "considered" requirement | **FIXED** |
| D3 Fact Alignment: no `source: inferred` anywhere | 6 annotated instances, each with reasoning basis (UF1/BIZ-workbench-002/BIZ-resilience-001/Story 4 AC1/UF2 States × surface-web rule); all cited bases verified to exist and say what is claimed | **FIXED** |
| D4 soft claims unmarked (1b/3/3b) | All three now carry inline `source: inferred` with valid bases | **FIXED** (Step 6b "无报错残留" residue remains — pre-existing, was not in D4's quote list) |
| D5 invariant "三区容器为常驻结构" vs 4b error | Carve-out added: "(除 error/降级态外,三区容器为常驻结构)" | **FIXED** |
| D6 risk_level Low vs pointer write | Changed to Medium — matches "multi-step interaction without irreversible side effects" | **FIXED** |
| D7 test-caliber tags in Expected Results | "(e2e 断言)"/"(全量路由归属断言)"/"(性能断言口径)" all removed; quarantined into Setup "断言口径(测试层,Expected Result 不重复携带)" block — exactly the prescribed move | **FIXED** |
| D8 "测试后清理" procedural fragment | Unchanged | **NOT FIXED** (minor) |
| D9 storage vocabulary (app_state/指针/id) | All replaced with user-observable phrasing ("应用记住上次活跃项目"、"切换即时生效并被记住"、"不指向已删项目") | **FIXED** |
| D10 Step 4 verification-only action | Now a real interaction: "展开右栏项目概览,依次点开提案/feature/任务/阶段资产子 tab" | **FIXED** |
| D11 Overview↔Step 4 enumeration mismatch; Step 5 "等" hand-wave | Overview and Step 4 now both read "提案/feature/任务/阶段资产 + 管线入口导航占位"; Step 5 action explicitly opens 阶段资产面板, "等" dropped | **FIXED** |
| Blindspot 1 route-enumeration caliber | Setup now says "枚举口径下沉 Contract 层,旅程层语义形 = 任何 forge 视图入口均处于项目上下文" | **FIXED** |
| Blindspot 2 switch-timing baseline | Setup defines it: "以重构前构建在同 fixture 规模下同口径计测捕获的切换耗时为基线" | **FIXED** |
| Blindspots 3/5/6 (操作路径 clause, single-instance check, other BIZ-workbench-005 budgets) | Unaddressed | remain (blindspot layer) |

**New issues introduced by the revision?** None material. The expanded Step 4 enumeration ("提案/feature/任务/阶段资产" — 4 tabs) is traceable to prd-spec 必答① IA tree + 迁移清单 #4 ("M3 阶段资产面板 → 项目页 forge 文件区(右栏概览子 tab)") but sits in unacknowledged tension with UF2's "概览(三子 tab)" and SC2's "提案/feature/任务" — a PRD-internal ambiguity the journey resolves silently toward the IA tree (see blindspot 2). One pre-existing flaw iteration-1 missed is now booked (Step 3 target-row ambiguity, D-new below).

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Story coverage trace**: Step 1 ↔ AC1 (startup first-screen + restore); Step 2 ↔ AC1 (tree enumerates/switches all projects, no standalone list page); Step 3 ↔ AC1 (switch, 整台跟随); Step 4 ↔ AC2 (three zones same page, knowledge zone no empty placeholder); Step 5 ↔ AC3 (orphan views = 0) + SC5 (zero shrink); Step 6 ↔ AC1 restore semantics + SC6 performance. The step sequence covers Story 1's workflow 1:1 — sound at macro level.
2. **Cross-step references**: Step 3 now points forward ("重启恢复目标项目,见步骤 6") and Step 6 points back ("步骤 3 切换后的项目") — bidirectional, grounded, unambiguous. Edge numbering (1b/3b/4b/6b) hangs each variant on its happy step correctly.
3. **Fact anchor spot-checks** (all verified against sources): `/p/:projectId` + 2026-09-27 裁决 (Story 1 AC1); 归档分区降透明只读、不挂会话 (UF1 States/Validation, Story 5 AC2); 路径健康角标 degraded (UF1 States); 概览子 tab 含阶段资产 (迁移清单 #4 + 必答① IA tree); 管线入口导航占位 (IA tree, Out of Scope → M7); M2 看板独立不从属 feature (迁移清单 #2); 发起链原位保留 (迁移清单 #6); error 态「明确错误 + 重试按钮」 (UF2 States error); empty hero (UF1 States empty); 6b landing semantics (UF1 Validation "删除当前项目 → 工作台落到其余项目或空态"); 首屏 ≤2s@500 任务 (SC6, BIZ-workbench-005); proposal Key Scenarios 「项目工作台(happy)」「既有能力收纳」 both exist verbatim. All check out.
4. **Inferred-claim basis verification** (new in this iteration, all 6 instances): UF1「整台跟随」✓; BIZ-workbench-002 单激活 ✓; UF1 empty 态 ✓; UF1 path-degraded × BIZ-resilience-001 ✓ (badge = visible degradation, 不阻断 = rule's non-blocking baseline — no contradiction with the rule's "不弹错" since UF1's badge is the sanctioned visible channel); Story 4 AC1 + UF7 States (missing→禁用, registered→禁用) ✓; UF2 States error ✓; "桌面壳无独立登录会话" ✓ (offline app, BIZ-privacy-001, no auth surface).
5. **Pre-identified weak seams** (scored in Phase 2): (a) Step 3's "另一个项目行" is under-determined by the 2-project fixture (the only "another" row may be the archived project, whose rendering differs materially and is never specified); (b) Step 6b "无报错残留" unmarked; (c) invariant 5 carve-out covers error/降级 but not empty state; (d) UF2 "三子 tab" count tension; (e) mandatory-outcome discharges are comment-level and (for validation-error) fully delegated to a sibling journey; (f) "测试后清理" procedural residue.

---

## Phase 2 — Dimension Breakdown

### 1. Completeness (完整性) — 186/200 (min 120, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Metadata complete | 48/50 | kebab-case ✓; `risk_level: "Medium"` valid AND now matches content (persistent pointer write, no irreversible ops); `golden_path: true` unique across the 6 sibling journeys (re-verified by grep); `sources` lists all three PRD files. Deduction: Medium classification is correct but carries no in-text justification against the template's criteria comment. |
| Steps complete with required fields | 76/80 | 6 happy steps + 4 edge cases, every one with User Action + Expected Result (edges + Precondition). Step 4 is now a genuine interaction (expand overview, open 4 sub tabs) — the verification-only anti-pattern is gone. Deduction: Steps 2/5 remain observational verbs ("查看"/"巡检"), excusable only because Story 1's AC1/AC3 are themselves seeing-assertions. |
| Happy path + required derived scenarios | 62/70 | Boundary breadth good (empty, path-degraded, error+retry, stale-pointer) and both surface-web mandatory outcomes plus network-error are now explicitly considered with rule citation + `source: inferred`. Deductions: the two mandatory discharges live as HTML-comment mappings, not exercisable in-journey outcomes — validation-error's "操作细节由注册旅程承载" leaves zero in-scope exercisable outcome; and a genuine in-scope boundary (switch to the archived project, see D-new) is absent from the edge set. |

### 2. Semantic Purity (语义纯度) — 183/200 (min 120, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Natural language, no code/regex | 74/80 | No regex/selectors/assert calls. Test-caliber tags fully evacuated from Expected Results into the Setup 断言口径 quarantine with explicit "Expected Result 不重复携带" discipline. Residual: Expected Results carry meta-annotative parentheticals ("(source: inferred,推自 …)", PRD citations) — permitted/required for inference marking, but they still interrupt the user-observable statement. |
| Preconditions declarative | 55/60 | Edge preconditions clean states. Residual: Setup "fixture 项目集(临时目录 + 隔离 userData,测试后清理)" — "测试后清理" is a cleanup instruction, not a state (unchanged from iteration 1). |
| No implementation coupling in steps | 54/60 | Storage vocabulary eliminated everywhere (app_state → "应用记住上次活跃项目"; "活跃项目指针切换即写" → "切换即时生效并被记住"; "已删项目 id" → "已删项目"). Residual: Step 1's Expected Result embeds the route literal + adjudication date "(/p/:projectId,2026-09-27 裁决)" — PRD-traceable domain anchor, hence partial credit, but it is spec-bookkeeping vocabulary inside a user-observable outcome. |

### 3. Precondition Exclusivity (前置条件互斥性) — 134/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Preconditions distinct across outcomes | 56/60 | All four happy↔edge pairs cleanly exclusive: 1 vs 1b ("无任何注册项目"), 3 vs 3b ("路径探测失败(路径健康 degraded)"), 4 vs 4b ("工作台数据加载出错(通道异常/数据缺失)"), 6 vs 6b ("应用记住的上次活跃项目已被删除"). |
| Sufficient to uniquely select outcome | 42/50 | **New finding (pre-existing, missed in iteration 1)**: the Setup fixture "已注册 ≥2 个项目:其一为活跃项目…其一已归档" + Step 3's action "点击另一个项目行" do not uniquely determine the outcome. With the minimal (and implied) 2-project fixture, the only "another" row is the archived project — but switching to an archived project renders differently (UF2 archived state: 归档横幅 + 只读态; archived projects 不挂会话, so "左栏会话组…均切到目标项目" degenerates), and none of that is specified. Two materially different observable results can follow from Step 3 as written. |
| No missing preconditions for boundary outcomes | 36/40 | All edges state triggers. Residual: 4b still bundles two causes "(通道异常/数据缺失)" without distinguishing renderings; 3b still does not specify whether zones render degraded for the target or retain prior content. |

### 4. Fact Alignment (事实依据) — 143/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Factual claims traceable | 58/60 | Traceability block verified against all cited sources (Story 1, SC1/SC2/SC5/SC6, UF1-UF3, 必答①②, both proposal Key Scenarios exist verbatim). Step-level claims spot-checked (see Phase 1 #3) — no contradictions. Residual: Step 6b's "无报错残留" asserts failure-mode behavior with no trace or marking (its landing clause IS traceable to UF1 Validation). The 4-tab overview enumeration is traceable to 迁移清单 #4 + IA tree but silently resolves the UF2/SC2 "三子 tab" tension (blindspot 2). |
| Inferred claims: rule support + `source: inferred` | 48/50 | Six annotated instances, each with reasoning basis that verifiably exists and supports the claim (Phase 1 #4). This is the house pattern the rubric demands, executed. Residual: the validation-error discharge's exercising detail is delegated wholesale ("操作细节由注册旅程承载"), so its rule support is real but its in-journey verification surface is nil. |
| No hallucinated unclassified claims | 37/40 | No claim contradicted by PRD/design/business rules; no invented error codes/messages/routes; "桌面壳无独立登录会话" is factually correct. Residual: Step 6b "无报错残留" — weak unclassified negative-UX inference, same class iteration-1 booked at -6 for four instances; one instance remains (-3). |

### 5. Surface Fitness (Surface 适配) — 132/150 (min 90, **PASS** — was 72/150 FAIL)

| Sub-criterion | Score | Notes |
|---|---|---|
| Mandatory derived Outcomes present | 54/60 | Both mandatory outcomes now explicitly considered in the task-session-roundtrip house style: `validation-error` → "本旅程无常规表单输入面,最近似面 = 空态引导可达的添加项目确认卡路径输入,非法输入映射为即时校验提示、留在卡内可修正(Story 4 AC1/UF7…);source: inferred(推自 surface-web 规则强制项 × Story 4 AC1 即时提示不静默)"; `session-expired` → "桌面壳无独立登录会话,最近似面 = 宿主/数据通道失联,映射为本步 error 态呈现…;source: inferred(推自 surface-web 规则强制项 × UF2 States error)". Floor rule lifted. Residual: neither discharge is an exercisable in-journey outcome — validation-error is delegated to the sibling registration journey and session-expired collapses into 4b's existing error outcome; a dedicated edge exercising a nearest-analogue face would have earned full credit. |
| Test strategy proportions (50/50) | 40/50 | 6 journey-level steps (full rendering pipeline, restart persistence — Journey-smoke material) vs 4 tightly-preconditioned edges + per-step interaction-level expectations incl. the new sub-tab walk (Contract material). Defensible 50/50 reflection; Step 4's concretization improved the Contract side. Deduction: the balance is still not stated or bracketed anywhere, and edges remain uniform single-scenario. |
| Realistic web/e2e assumptions | 38/40 | Setup is e2e-realistic: fixture projects in temp dirs + isolated userData, timing at declared scale, element-count caliber for zero-placeholder, switch-timing baseline now defined ("以重构前构建在同 fixture 规模下同口径计测捕获的切换耗时为基线"), route-enumeration caliber explicitly sunk to Contract layer. Deduction: "测试后清理" procedural residue; single-instance lock check still absent from environment readiness (blindspot 6). |

### 6. Internal Consistency (一致性) — 140/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Invariants hold in every step | 55/60 | The 4b/3b contradiction is resolved by the carve-out "(除 error/降级态外,三区容器为常驻结构)"; invariants 1-4 hold across all steps and are actively reinforced by edges. Residual: the carve-out omits the empty state — Step 1b renders no zones at all ("不渲染空项目树/空三区骨架"), so the gloss "常驻结构" still fails literally there; it survives only via the main clause's scope qualifier "在项目切换与重启之间". |
| Cross-step references consistent | 47/50 | Step 3↔Step 6 references bidirectional and grounded; Overview↔Step 4 forge-文件区 enumerations now identical (提案/feature/任务/阶段资产 + 管线入口导航占位); Step 5's action now explicitly opens 阶段资产面板, matching its zero-shrink assertion. Residual: Step 3's "另一个项目行" vs the 2-role fixture (echo of the exclusivity finding). |
| Risk level consistent with content | 38/40 | Medium is now correct: multi-step interaction, persistent (reversible, non-destructive) pointer write, no data loss. Deduction: classification carries no in-text justification; a one-line rationale would make it audit-proof. |

### 7. Workflow Coverage (工作流覆盖度) — 130/150 (min 90, PASS; veto NOT triggered)

| Sub-criterion | Score | Notes |
|---|---|---|
| Golden Path existence (veto) | 58/60 | `golden_path: true`, 6 contiguous steps, semantic verification passes: the sequence maps 1:1 onto Story 1's ACs, every step uses domain-level operations (项目树枚举/项目行切换/概览子 tab 巡检/forge 视图归属巡检/重启恢复), zero API-level descriptions. Step 4's former verification-only character is cured. Minor: Steps 2/5 verbs are observational (legitimate for seeing-assertion ACs). |
| Multi-step coverage depth | 38/50 | State variation is real (switch + restart persistence + empty/degraded/error/stale-pointer), and delegation to siblings (registration/lifecycle/task-session/split-pane) keeps scope legitimate. Notable missing boundary within THIS journey's own step inventory: the archived-target switch (directly reachable from Step 2's tree enumeration of the archived partition the Setup itself stages). No lifecycle operations — delegated, mid-band. |
| Completeness vs PRD scope | 34/40 | Story 1 fully covered; no primary workflow inside stated scope missing. Auxiliary gaps: UF1's 区头「＋」添加项目入口 untouched even by reference in the populated state (only Step 1b's hero references UF7); UF1's 归档行恢复/删除菜单 untouched; proposal Key Scenario 「既有能力收纳」's companion clause "操作路径不长于现状" still unasserted — Step 5 claims only "功能面完整可用(零缩水)". |

---

## Deduction Log

| # | Dimension | Rule / ground | Deduction | Evidence quote |
|---|---|---|---|---|
| D1 | Surface Fitness | Mandatory outcomes discharged as comment-level nearest-analogue mappings, not exercisable in-journey outcomes; validation-error fully delegated | -6 (sub 54/60) | "操作细节由注册旅程承载" |
| D2 | Surface Fitness | 50/50 balance not stated/bracketed; edges uniform single-scenario | -10 (sub 40/50) | (structural; no bracketing text in doc) |
| D3 | Surface Fitness | Procedural/environment residue ("测试后清理"; no single-instance check) | -2 (sub 38/40) | "临时目录 + 隔离 userData,测试后清理" |
| D4 | Completeness | Archived-target switch boundary absent from edge set; mandatory discharges not exercisable in-journey | -8 (sub 62/70) | (absence; cf. Step 2 "含归档分区降透明只读呈现" vs Step 3 "点击另一个项目行") |
| D5 | Completeness | Metadata: risk classification unjustified in text | -2 (sub 48/50) | `risk_level: "Medium"` (no rationale line) |
| D6 | Completeness | Observational verbs flatten action distinctness (Steps 2/5) | -4 (sub 76/80) | "**User Action**: 查看左栏「项目」区全项目树" |
| D7 | Semantic Purity | Route literal + adjudication date inside Expected Result | -6 (sub 54/60) | "(/p/:projectId,2026-09-27 裁决)" |
| D8 | Semantic Purity | Procedural fragment in Setup | -5 (sub 55/60) | "测试后清理" |
| D9 | Semantic Purity | Meta-annotation parentheticals embedded in Expected Results (permitted for inference marking; still interrupt outcome text) | -6 (sub 74/80) | "(source: inferred,推自 UF1「整台跟随」切换语义 + BIZ-workbench-002 单激活模型)" |
| D10 | Precondition Exclusivity | Step 3 target row under-determined by 2-role fixture → two materially different outcomes possible | -8 (sub 42/50) | Setup "其一为活跃项目…其一已归档" × Step 3 "点击另一个项目行" |
| D11 | Precondition Exclusivity | 3b zone-content state unspecified after degraded switch | -4 (sub 36/40) | "切换完成且项目行路径健康角标提示异常"(no zone-content statement) |
| D12 | Precondition Exclusivity | 4b bundles two triggers undifferentiated | -4 (sub 56/60 distinctness spread) | "(通道异常/数据缺失)" |
| D13 | Fact Alignment | Step 6b "无报错残留" unmarked soft failure-mode claim | -3 (sub 37/40) | "不指向已删项目、无报错残留" |
| D14 | Fact Alignment | Traceable sub residual: 6b claim partly untraced; tab-count tension resolved silently | -2 (sub 58/60) | "概览子 tab:提案/feature/任务/阶段资产" vs UF2 "概览(三子 tab)" |
| D15 | Fact Alignment | validation-error discharge has nil in-journey verification surface | -2 (sub 48/50) | "最近似面 = 空态引导可达的添加项目确认卡路径输入" |
| D16 | Internal Consistency | Invariant carve-out omits empty state (1b renders no zones) | -5 (sub 55/60) | "(除 error/降级态外,三区容器为常驻结构)" vs 1b "不渲染空项目树/空三区骨架" |
| D17 | Internal Consistency | Step 3/fixture ambiguity echo in cross-step reading | -3 (sub 47/50) | "无前一项目内容残留"(target-dependent) |
| D18 | Internal Consistency | Risk Medium correct but unjustified in text | -2 (sub 38/40) | (as D5) |
| D19 | Workflow Coverage | 区头「＋」/归档行菜单 unexercised; "操作路径不长于现状" companion clause dropped | -6 (sub 34/40) | Step 5 "功能面完整可用(零缩水)" vs proposal "操作路径不长于现状" |
| D20 | Workflow Coverage | Depth: archived-target switch / lifecycle variants absent (delegated) | -12 (sub 38/50) | (absence) |
| D21 | Workflow Coverage | Golden path minor: observational verbs in 2 steps | -2 (sub 58/60) | (as D6) |

No Golden Path veto. No -25 surface-type violations. No -40 full invariant violations (D16 is a carve-out-scope gap, partial). No -30 hallucination instances (D13 kept below the bar: negative-UX expectation, not fabricated specific).

---

## Threshold Pass/Fail Table

| Dimension | Score | Min | Status |
|---|---|---|---|
| 1. Completeness | 186/200 | 120 | PASS |
| 2. Semantic Purity | 183/200 | 120 | PASS |
| 3. Precondition Exclusivity | 134/150 | 90 | PASS |
| 4. Fact Alignment | 143/150 | 90 | PASS |
| 5. Surface Fitness | 132/150 | 90 | **PASS** (was 72/150 FAIL in iter 1) |
| 6. Internal Consistency | 140/150 | 90 | PASS |
| 7. Workflow Coverage | 130/150 | 90 | PASS |
| **Total** | **1048/1150** | **975** | **PASS** |

---

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. **[blindspot] Archived-target switch is the journey's own uncovered boundary.** Setup stages "其一已归档" and Step 2 explicitly renders the archived partition, yet no step or edge switches to it. UF2 defines a distinct archived state ("archived | 归档横幅 + 只读态 | 项目已归档") and UF1/Story 5 say archived projects 不挂会话 — so the observable result of Step 3's action differs materially depending on which row is clicked, and the journey never says which. Both a scoring deduction (D10) and a downstream risk: gen-contracts will inherit an ambiguous Step 3.
2. **[blindspot] Tab-count tension inherited from the PRD, resolved silently.** Journey asserts "概览子 tab:提案/feature/任务/阶段资产"(4), traceable to 必答① IA tree + 迁移清单 #4, but UF2 says "概览(三子 tab)" and SC2 enumerates "提案/feature/任务"(3). The journey picked the IA-tree reading without flagging the conflict — correct per 迁移清单 #4, but the PRD should reconcile before contracts freeze the tab inventory.
3. **[blindspot] "操作路径不长于现状" companion clause still dropped.** proposal Key Scenario 「既有能力收纳」: "M2 看板、M3 提案板/阶段资产面板在项目页内完整可用;操作路径不长于现状". Step 5 asserts only functional zero-shrink; reachability non-regression remains unasserted anywhere in the journey.
4. **[blindspot] Single-instance lock discipline absent from Setup.** Steps 1 and 6 launch the real shell twice; repo testing memory requires checking active dsh-forge instances before full e2e (ERR_SINGLE_INSTANCE). Setup specifies userData isolation but not the instance check.
5. **[blindspot] Invariant "常驻结构" vs empty state.** The new carve-out "(除 error/降级态外)" still does not name the empty state, where Step 1b renders no zones at all; the invariant survives only via the main clause's "在项目切换与重启之间" scope. One word ("除 error/降级/空态外") closes it.
6. **[blindspot] Business-rule resonance still narrow.** BIZ-workbench-005 also bounds 看板免刷新可见 ≤5s and 一键发起 ≤3s on this same surface; Step 5's board-opening巡检 could carry the ≤5s budget. Journey cites only 首屏 ≤2s (and now the switch baseline).

---

## Revision Priorities (for reviser — non-blocking; score already ≥ target)

1. Disambiguate Step 3's target ("点击另一活跃项目行" + a third fixture project, or add Step 3c archived-target switch edge citing UF2 archived state). Closes D10/D17/D20 at once.
2. Mark or ground Step 6b "无报错残留" (one `source: inferred` line, house style).
3. Extend the invariant carve-out to "除 error/降级/空态外".
4. Flag (not silently resolve) the UF2 "三子 tab" vs 迁移清单 #4 tab-count tension — one parenthetical citing 迁移清单 #4 makes the 4-tab reading auditable.
5. Add "操作路径不长于现状" to Step 5's zero-shrink assertion to complete the cited Key Scenario.
