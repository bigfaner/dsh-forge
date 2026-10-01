---
feature: dsh-forge-m4
journey: split-pane-layout-memory
iteration: 2
rubric: eval/rubrics/journey.md (1150pt, 7 dimensions)
surface: web (rules/surface-web.md)
score: 1071
target: 975
status: pass (total ≥ 975; all dimensions ≥ min threshold)
generated: 2026-09-30
---

# Eval-Journey Iteration 2 — split-pane-layout-memory

**Final Score**: 1071/1150 (target 975) — **REACHED**
**Threshold**: all 7 dimensions above min (lowest = Surface Fitness 132/150 vs 90). PASS.
**Golden Path veto**: NOT triggered (semantic verification passed; see Workflow Coverage).

Scorer context loaded: `rules/surface-web.md` (mandatory `validation-error` + `session-expired`, strategy 50/50), all 6 files in `docs/business-rules/` (esp. workbench.md BIZ-workbench-002/006/007, resilience.md BIZ-resilience-001), `prd/prd-user-stories.md` (Story 6 = ground truth), `prd/prd-spec.md` (必答⑨ 分屏/多窗口, 必答⑧ 收起交互, 必答⑥ 后代上限 默认 20, 必答⑤ 归档≠删除, Data Requirements 布局记忆), `prd/prd-ui-functions.md` (UF9/UF3/UF2), `ui/ui-design.md` C9 (钳制 30%–70%, 水平双 pane, separator 键盘模型) / C3 (无计数徽标、▾ 展开、溢出折叠), proposal.md L71 「分屏/多窗口」 (re-verified verbatim), sibling journeys (multi-window-tearout delegation confirmed; task-session-roundtrip house discharge pattern), iteration-1 report, and `git diff HEAD` of the revision.

---

## Revision Verification (iteration-1 issues → fixed?)

| Iter-1 issue | Revision response | Verdict |
|---|---|---|
| D1 Surface Fitness floor: mandatory `validation-error`/`session-expired` absent | Both discharged as house-pattern mapping comments after Step 5c, each with rule citation + `source: inferred`; `validation-error` maps to the 5c family, which IS an exercisable in-journey edge (precondition + action + expected) | **FIXED** |
| D2 Completeness mirror of D1 | Same comments satisfy "considered" | **FIXED** |
| D3 Step 4 boundary missing (必答⑥ cap); Steps 1/4 no edge | Step 4b added (后代超上限 默认 20 → 「查看全部」); Step 1 still has no edge variant (its complement — prior memory exists → restored — is carried by Steps 5/6b) | **MOSTLY FIXED** |
| D4 Step 4 expected answers only collapsed half | "展开时内嵌后代列表呈现、多级同规则递归收起" added (UF3 States expanded verbatim) | **FIXED** |
| D5 No `source: inferred` markers; free unmarked inferences | 3 inline markers (Steps 1/5b/5c) + 3 comment markers (responsive-layout/validation-error/session-expired), each with reasoning basis; all cited bases verified to exist and support the claim | **FIXED** (residuals: 2c re-flow unmarked; 3b negative-UX trio unmarked) |
| D6 归档≠删除 misalignment in 5c example | Precondition now splits 已删除 vs 已归档不可达 with explicit "归档 ≠ 删除,BIZ-workbench-006/必答⑤" — verified against 必答⑤ table and BIZ-workbench-006 | **FIXED** |
| D7 Soft unmarked claims (1/3b/5c) | Steps 1 and 5c now marked; 3b's clamp bounds now traceable ("钳制 30%–70%,两侧 pane 最小宽 30%——ui-design C9"), but "不失能、不产生 0 宽死区;松手后布局可继续操作" remains unmarked | **MOSTLY FIXED** |
| D8 2b precondition does not partition from Step 2 | Restated as declarative state ("项目存在未启用的扩展位视图类型(知识区为扩展位、未启用)") — wording cured, but the state still holds for EVERY M4 project (knowledge zone is a structural extension slot per UF2), so the pair still co-applies | **PARTIAL** |
| D9 3b trigger state under-specified | "两 pane 比例已处于钳制极限一侧(达最小可读宽度边界)" — boundary state, declarative | **FIXED** |
| D10 2b trigger buried in outcome; 5c selector blurred | 2b trigger now in Precondition; 5c selector split deleted vs archived | **FIXED** |
| D11 "(e2e 断言)" tags inside Expected Results | Removed from Steps 2/5; quarantined into Setup 断言口径 block with "测试层,Expected Result 不重复携带" — exactly the prescribed move | **FIXED** |
| D12 Procedural preconditions (2b/3b) | Both restated as states; all 7 edges now declarative | **FIXED** |
| D13 origin=subagent / 复用同一视图组件 tokens | 词注 added in traceability block ("按上游原词保留") — the annotation route iteration-1 offered | **FIXED** (annotation accepted) |
| D14 Invariant 4 unexercisable + Step 5 restore narrows memory scope | Setup fixture extended (">5 条会话,可触发溢出折叠"); Step 5 restore enumeration extended to "每组会话溢出折叠状态" | **FIXED** |
| D15 Overview "多个 pane" vs two-pane-only steps | Step 2c added (3-pane + close/re-add) | **FIXED** (introduces C9 dual-pane tension, see D-new) |
| D16 golden_path: false on qualifying sequence | 资格注记 comment added explaining feature-level single-true assignment | **FIXED** (annotation-level; frontmatter unchanged, correct per convention) |
| D17 Two-pane-only depth; degraded-pane forward path unreachable | Depth fixed via 2c; the "可替换" affordance in 5c is STILL unreachable — no step or edge re-picks a view for a degraded pane | **PARTIAL** |
| D18 必答⑥ cap / 溢出恢复 / 动画不阻塞 unaddressed | Cap via 4b ✓; 溢出恢复 via Step 5 ✓; 动画不阻塞 still unaddressed | **MOSTLY FIXED** |
| D19 No loading observation / ratio caliber / keyboard-a11y | **NOT ADDRESSED** — no loading-state outcome, no determinism caliber for ratio assertions, C9 separator keyboard model (role=separator, ←/→ ±2%) untouched | **NOT FIXED** |

**New issues introduced by the revision?** Two, both booked:
1. Step 2c's "三 pane 同屏可操作…关闭后其余 pane 自动重排" is traceable to 必答⑨ "pane 数量" / UF9 States "split = 多 pane 同屏", but sits in unacknowledged tension with ui-design C9's "水平双 pane" / "split(双 pane,记忆比例)" — resolved silently toward the PRD reading, unmarked (same defect class as project-workbench-home iteration-2's four-sub-tab finding).
2. The session-expired discharge cites "BIZ-resilience-001 降级不打断呈现" as basis while asserting "不静默" explicit error — the rule actually prescribes 静默降级 for non-fatal failures, and ui-design's data-freshness section says derived faces prefer "静默保留上次内容 + 结构化 log"; the explicit-error rendering is better grounded in UF2 States error ("明确错误 + 重试按钮"), which the comment does not cite.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Story workflow trace**: unchanged macro structure, re-verified — Step 1 ↔ UF9 States `single` baseline; Step 2 ↔ Story 6 AC1 (两视图同屏可操作, near-verbatim minus the evacuated e2e tag); Step 3 ↔ UF9 flow 拖拽调比例; Step 4 ↔ AC2 收起 half (必答⑧/UF3, now answering both halves of its own action); Step 5 ↔ AC2 重进恢复 half (restore enumeration now four dimensions: 结构/比例/收起/溢出, all established upstream); Step 6 ↔ UF9 flow 关闭 pane → 布局自动记忆. New 2c ↔ 必答⑨ "pane 数量与比例随项目记忆"; new 4b ↔ 必答⑥ "后代数超上限(默认 20)时尾部呈现「查看全部」" verbatim. The step sequence covers Story 6's in-scope workflow; the macro argument is sound.
2. **Cross-step references**: Step 5's four-dimension restore presupposes exactly the artifacts of Steps 2/3/4 + Setup fixture (>5 group); 6b chains on 6; 2b/2c/3b/4b/5b/5c/6b numbering binds each variant to its happy step; Overview's "同屏操作多个 pane" is now carried by 2c. No dangling references.
3. **Fact anchor spot-checks (all pass)**: 工作台头部「分屏」(UF9 Placement); 可选视图 = 代码区/forge 文件区视图集 (UF9 Data); 会话/feature 任务面板/看板类 (UF9 Flow verbatim); 功能面不变/复用同一视图组件 (UF9 Validation, now 词注-annotated); 行尾 ▾ 递归展开 (UF3, the later authority over 必答⑥'s 徽标); 布局随项目、删除清除 (prd-spec Data Requirements verbatim); 钳制 30%–70% 最小宽 30% (ui-design C9 verbatim, now cited); 后代上限 20 → 「查看全部」 (必答⑥ verbatim); 溢出 >5「展开其余 N 个会话」(UF2/UF3); 归档≠删除 可找回 (BIZ-workbench-006/必答⑤); M1 壳不受影响 (必答⑨); proposal L71 「分屏/多窗口」 (re-verified). Traceability block checks out in full, now with 必答⑥ added.
4. **Inferred-claim basis verification** (all instances): UF9 States single 初始 ✓; 必答⑨/UF2 按项目存储 → 隔离 ✓; BIZ-resilience-001 非致命失败不崩溃 ✓; surface-web 常见项 × C9 ✓; surface-web 强制项 × 5c ✓; session-expired basis partially misaligned (see New issue 2).
5. **Pre-identified weak seams** (scored in Phase 2): (a) 2b's restated precondition is still a universal M4 state; (b) 3b/4b/5c Expected Results now carry spec-citation parentheticals (——ui-design C9 / 必答⑥ / BIZ-workbench-006) — grounded but bookkeeping-flavored; (c) 4b's >20-descendant fixture is not staged by Setup; (d) session-expired has no exercisable in-journey outcome; (e) loading/async, ratio-caliber, keyboard-a11y all still absent.

---

## Phase 2 — Dimension Breakdown

### 1. Completeness (完整性) — 192/200 (min 120, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Metadata complete | 49/50 | kebab-case ✓; `risk_level: "Medium"` valid and fits (multi-step interaction, reversible layout-memory writes); `surface_types/keys: ["web"]` ✓; sources = all three PRD files ✓; `generated` ✓. The former −1 (unlabeled qualifying sequence under `golden_path: false`) is discharged by the 资格注记 comment. New −1: risk classification carries no in-text justification line against the template criteria (same treatment as sibling project-workbench-home, there −2 split across two dimensions). |
| Steps complete with required fields | 78/80 | 6 happy steps each with User Action + Expected Result; verbs genuinely interactive (添加/拖拽/展开收起/重进/关闭) — better than sibling's observational pairs. Step 4 now answers both halves of its action. −2: Step 2c bundles three operations in one action ("追加一个 pane…,随后关闭一个 pane 并重加") with a three-part expected result — a compound variant where sibling steps stay single-action. |
| Happy path + required derived scenarios | 65/70 | 7 edges (2b/2c/3b/4b/5b/5c/6b) spanning enumeration boundary, multi-pane variant, ratio clamp, descendant cap, cross-project isolation, restore degradation, closure consistency — plus both mandatory web outcomes discharged with rule citation and `source: inferred`, `validation-error` attached to an exercisable edge (5c), and the responsive-layout common outcome retained. Deductions: `session-expired` remains comment-level with no exercisable in-journey outcome (−2); Step 1 has no edge variant (−1, low severity — complement carried by Steps 5/6b); 4b's >20-descendant precondition is not staged by the Setup fixture (Setup extends only to ">5 条会话" 溢出) (−2). |

### 2. Semantic Purity (语义纯度) — 187/200 (min 120, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Natural language, no code/regex | 75/80 | No regex/selectors/assert calls; "(e2e 断言)" tags fully evacuated from Expected Results into the Setup 断言口径 quarantine with explicit "Expected Result 不重复携带" discipline. Residual: 3 inline "(source: inferred,推自 …)" parentheticals (Steps 1/5b/5c) — permitted/required for inference marking but still interrupt the user-observable statement (−5, same class as sibling's D9). |
| Preconditions declarative | 58/60 | All 7 edge preconditions are now declarative states ("已处于两 pane 分屏态", "两 pane 比例已处于钳制极限一侧…", "某 parent 会话血缘后代数超上限(默认 20)", "已关闭全部分屏至单视图") — the procedural fragments iteration-1 booked are gone. Residual: 5c's precondition embeds rule bookkeeping "(行消失但可经恢复入口找回——归档 ≠ 删除,BIZ-workbench-006/必答⑤)" — declarative but citation-heavy for a state line (−2). |
| No implementation coupling in steps | 54/60 | Actions user-level throughout; `origin=subagent` and `复用同一视图组件` now carry the 词注 (upstream-verbatim acceptance) — most of iteration-1's −6 returned. Residual: spec-citation fragments inside Expected Results ("(钳制 30%–70%,两侧 pane 最小宽 30%——ui-design C9)", "(必答⑥)") — the bounds themselves are user-observable, the citation tags are spec bookkeeping (−3); "single 默认态"/"视图集" UI-state-table vocabulary unannotated (−2); annotated tokens remain tokens (−1). |

### 3. Precondition Exclusivity (前置条件互斥性) — 136/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Preconditions distinct across outcomes | 54/60 | 2c vs Step 2/3b cleanly exclusive (two-pane split state vs single / vs clamp boundary); 4b vs Step 4 distinct (后代 >20 vs 有后代); 5b/5c/6b distinct states. Residual −6: **Step 2 vs Step 2b still do not partition** — the restated precondition "项目存在未启用的扩展位视图类型(知识区为扩展位、未启用)" describes a structural constant of every M4 project (UF2: 知识区 = 扩展位, 不渲染, 后续里程碑), so it co-holds with every Step-2 execution and 2b remains an assertion refinement of Step 2's own enumeration outcome, not a divergent state. Wording cured (was procedural), overlap not — hence −6 (down from iteration-1's −14 spread), booked under the rubric's overlap rule at partial weight because the assertions converge rather than contradict. |
| Sufficient to uniquely select an outcome | 44/50 | The 2b convergence leaves a contract generator unable to decide when 2b applies vs Step 2's own assertion (−3, reduced from −6). −3: 5c's precondition carries TWO selectors ("目标数据已删除" vs "目标会话已归档…不可达") into ONE outcome without stating whether the observable result differs — for the archived case the target is recoverable via 设置页 (UF8), so "空态/可替换" vs a recoverable-target hint are materially different renderings a contract cannot distinguish. |
| No missing preconditions for boundary outcomes | 38/50→38/40 | Every edge carries a Precondition line ✓. −2: 4b's boundary (>20 descendants) is not reachable under the declared Setup fixture (only ">5 条会话" per group is staged), so the boundary outcome lacks fixture support. |

### 4. Fact Alignment (事实依据) — 140/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Factual claims traceable | 56/60 | Traceability block verifies in full incl. the added 必答⑥; every load-bearing assertion traces (spot-list in Phase 1 #3); the 归档≠删除 fix is now correctly grounded. Deductions: Step 2c's 3-pane/auto-reflow assertions resolve the 必答⑨/UF9-multi-pane vs C9-双-pane tension silently, unmarked (−2, mirroring sibling D14's tab-count treatment); Step 2's "当前项目可用的" qualifier remains an unmarked extension of UF9's plain enum (−1); 3b's "不失能、不产生 0 宽死区;松手后布局可继续操作" negative-UX residue unmarked though the clamp fact itself is now cited (−1). |
| Inferred claims: rule support + `source: inferred` | 45/50 | Six annotated instances, each with a reasoning basis that exists and (with one exception) supports the claim — the house pattern the rubric demands, executed. −2: the session-expired discharge's cited basis ("BIZ-resilience-001 降级不打断呈现") leans opposite to its assertion ("不静默" explicit error + guidance): the rule prescribes 静默降级 + log for non-fatal failures, and ui-design's freshness section routes derived faces to "静默保留上次内容 + 结构化 log"; the explicit-error rendering the journey asserts is grounded in UF2 States error, which the comment does not cite. −3: 2c's "关闭后其余 pane 自动重排、重加后 pane 集合与比例重新记忆" is a free inference from 布局自动记忆, unmarked. |
| No hallucinated claims without classification | 39/40 | Nothing rises to hallucination — no invented error codes, messages, or bounds; the clamp numerals are C9-verbatim. −1: 3b's residual negative-UX trio ("不失能、不产生 0 宽死区;松手后布局可继续操作") remains an unclassified failure-behavior assertion (below the −30 bar: conservative composition, and the numeric core now traceable). |

### 5. Surface Fitness (Surface 适配) — 132/150 (min 90, **PASS** — was 74/150 FAIL)

| Sub-criterion | Score | Notes |
|---|---|---|
| Mandatory derived Outcomes present | 56/60 | Both mandatory outcomes explicitly considered in the task-session-roundtrip house style with rule citation + `source: inferred`: `validation-error` → "恢复时 pane 视图目标非法/损坏(记忆布局指向已删除或不可用的视图实例,5c 族),呈现为降级空态可替换,不崩溃、不静默" — attached to Step 5c, an exercisable in-journey edge (stronger than sibling's fully-delegated discharge); `session-expired` → "pane 操作/恢复期间 dsh 宿主·会话通道失联,pane 内容呈现明确错误 + 恢复引导(重试),不静默". Floor rule lifted. −4: session-expired has no exercisable in-journey outcome (comment-level only), and its rendering assertion's basis is partially misaligned (see Fact Alignment). |
| Test strategy proportions (50/50) | 42/50 | 13 outcomes — 6 journey-level traversal steps (full rendering + re-entry persistence = Journey-smoke material) vs 7 tightly-preconditioned edges (enumeration/clamp/cap/isolation/degradation/multi-pane/closure = Contract material); the edge side strengthened by 2c/4b. Deductions: no loading/async observation anywhere although re-entry restore is the journey's core async surface (UF2 declares `loading` 分区骨架屏; `loading-state` is a listed common web boundary) (−4); 50/50 balance never stated or bracketed, edges uniform single-scenario (−4). |
| Realistic web/e2e assumptions | 34/40 | Genuinely e2e-realistic: drag-separator interaction, fixture combination caliber ("会话 + 看板(或任务面板)"), e2e tags quarantined with scope discipline. Unchanged from iteration 1: no determinism caliber for ratio assertions — Steps 3/5/3b assert 比例即时生效/恢复/钳制 with no measurement stance (proportion-of-width with tolerance), which a Playwright contract will need (−3); accessibility dimension wholly absent — surface-web General Principles #4 requires keyboard/ARIA consideration, and C9 defines a concrete separator keyboard model ("role=separator + aria-valuenow;←/→ ±2%、Shift ±10%、Home/End 复位 50/50") the journey never touches (−3). |

### 6. Internal Consistency (一致性) — 145/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Invariants hold in every Step | 59/60 | All five invariants verified across all 13 outcomes: no step places a subagent at top level (inv 3, actively reinforced by 4b's "超限不破坏归拢"), violates 功能面不变 (inv 1, re-asserted in 2c), or contradicts 布局随项目/删除清除 (inv 2, exercised by 6/6b) or M1 壳 (inv 5). Invariant 4's former defect (unexercisable + narrowed restore) is cured on both halves: Setup stages >5 group, Step 5 restores the 溢出 dimension. −1: the 溢出 dimension is restored only in its default-collapsed value — no step ever toggles "展开其余 N 个会话", so the "溢出…随项目记忆" promise is verified against the default state only. |
| Cross-step references consistent | 47/50 | Numbering and antecedents sound (Phase 1 #2); Step 5's four-dimension restore matches exactly what Steps 2/3/4 + fixture establish; Overview ↔ 2c now consistent on 多 pane. −3: 5c's dual-selector precondition vs single outcome — the archived case's recoverability (恢复入口在设置页, not the pane) never appears in any expected result, leaving the second declared selector observationally dangling. |
| Risk level consistent with content | 39/40 | Medium fits the rubric definition verbatim (multi-step interaction; writes are reversible layout-memory state). −1: no in-text justification line (calibrated with sibling's treatment). |

### 7. Workflow Coverage (工作流覆盖度) — 139/150 (min 90, PASS; veto NOT triggered)

| Sub-criterion | Score | Notes |
|---|---|---|
| **Golden Path existence (veto)** | 58/60 | **Semantic verification performed**: Steps 1→6 form a contiguous sequence mapping 1:1 onto Story 6's in-scope ACs — AC1 (Step 1 single baseline → Step 2 添加分屏, 两视图同屏可操作) and AC2 (Step 3 比例 + Step 4 收起 → Step 5 重进恢复), near-verbatim against AC text; every step uses domain-level operations (分屏/pane/比例/收起/重进恢复); zero API-level descriptions — no veto, no −15/step penalty. AC3 (多窗口) delegated to named sibling per 必答⑨ 交付顺序. The 资格注记 discharges iteration-1's mis-prioritization concern. −2 residual: `golden_path: false` remains the only machine-readable signal — frontmatter parsers still see false while the content qualifies; the annotation lives in a comment. |
| Multi-step coverage depth | 44/50 | A real layout state machine — single → split → adjusted → persisted → restored → closed-back-to-single — now plus 3-pane add/close/re-add (2c), cross-project isolation (5b), restore-time degradation (5c), closure consistency (6b), and the descendant cap (4b). Genuinely deeper than iteration 1. Deductions: the degraded pane's asserted "可替换" affordance is still unreachable — no step or edge re-picks a view for an existing degraded pane, leaving the recovery interaction a contract hole (−3); no view-swap/replace interaction beyond 2c's re-add (−3). |
| Completeness vs PRD scope | 37/40 | Story 6 AC1/AC2 fully covered, AC3 delegated; UF9 flow fully covered and all three UF9 states exercised; 必答⑥ cap and 溢出恢复 now covered. Remaining: 必答⑧ "展开动画不阻塞列表滚动" unaddressed (−1); the 溢出折叠's EXPANDED state is never manipulated before the restore assertion (restore verifies only the default-collapsed value) (−1); 必答⑧ 徽标计数 vs UF3 无计数徽标 latent conflict still not named (journey safely uses ▾ throughout, but a downstream contracts pass reading 必答⑧ will see an unflagged contradiction) (−1). |

---

## Deduction Log

| # | Dimension | Rule / ground | Deduction | Evidence quote |
|---|---|---|---|---|
| D1 | Surface Fitness | session-expired discharged comment-level only, no exercisable in-journey outcome; rendering basis partially misaligned | −4 (sub 56/60) | "session-expired → pane 操作/恢复期间 dsh 宿主·会话通道失联…不静默" (comment after 5c; no step/edge exercises it) |
| D2 | Surface Fitness | No loading/async observation on the re-entry restore surface (UF2 `loading` 骨架屏; surface-web `loading-state`) | −4 (sub 42/50) | "离开该项目后重进"(no loading-state outcome anywhere) |
| D3 | Surface Fitness | 50/50 not bracketed; edges uniform single-scenario | −4 (sub 42/50) | (structural; no balance statement in doc) |
| D4 | Surface Fitness | No ratio-measurement determinism caliber; keyboard/a11y model (C9 role=separator, ←/→ ±2%) untouched | −6 (sub 34/40) | "比例即时生效"(no tolerance stance); ui-design L44 separator keyboard model uncited |
| D5 | Completeness | Step 1 no edge variant; 4b fixture not staged; session-expired not exercisable | −5 (sub 65/70) | Setup "其中一会话组 >5 条会话"(no >20-descendant parent staged) vs 4b "后代数超上限(默认 20)" |
| D6 | Completeness | Step 2c compound action (three operations, three-part expected) | −2 (sub 78/80) | "追加一个 pane(如 feature 任务面板),随后关闭一个 pane 并重加" |
| D7 | Completeness | Risk classification unjustified in text | −1 (sub 49/50) | `risk_level: "Medium"`(no rationale line) |
| D8 | Semantic Purity | Inline inference meta-annotations interrupt Expected Results (3×) | −5 (sub 75/80) | "(source: inferred,推自必答⑨/UF2 布局记忆按项目存储——按项目隔离即不串扰)" |
| D9 | Semantic Purity | Citation bookkeeping inside precondition state line (5c) | −2 (sub 58/60) | "(行消失但可经恢复入口找回——归档 ≠ 删除,BIZ-workbench-006/必答⑤)" |
| D10 | Semantic Purity | Spec-citation tags + enum vocabulary inside outcomes | −6 (sub 54/60) | "(钳制 30%–70%,两侧 pane 最小宽 30%——ui-design C9)";"single 默认态" |
| D11 | Precondition Exclusivity | Step 2 / Step 2b overlap: restated precondition is a universal M4 state (knowledge zone always unenabled), pair still co-applies | −6 (sub 54/60) | "Precondition: 项目存在未启用的扩展位视图类型(知识区为扩展位、未启用)" vs UF2 "知识区 = 右栏面板注册制的扩展位(不渲染,后续里程碑)" |
| D12 | Precondition Exclusivity | 2b convergence leaves activation region undecided for contract generation | −3 (sub 44/50) | (same pair as D11) |
| D13 | Precondition Exclusivity | 5c dual selector (deleted / archived-unreachable) → one outcome, renderings not distinguished | −3 (sub 44/50) | "目标数据已删除;另一同类不可达 = 目标会话已归档" |
| D14 | Precondition Exclusivity | 4b boundary lacks fixture support in Setup | −2 (sub 38/40) | (as D5 second half) |
| D15 | Fact Alignment | 2c 3-pane/auto-reflow resolves 必答⑨-multi-pane vs C9-双-pane tension silently, unmarked | −2 (sub 56/60) | "三 pane 同屏可操作…关闭后其余 pane 自动重排" vs ui-design C9 "分屏态:水平双 pane" / "split(双 pane,记忆比例)" |
| D16 | Fact Alignment | Step 2 "当前项目可用的" qualifier unmarked; 3b negative-UX residue unmarked | −2 (sub 56/60) | "不失能、不产生 0 宽死区;松手后布局可继续操作" |
| D17 | Fact Alignment | session-expired basis cites BIZ-resilience-001 (静默 for non-fatal) while asserting 不静默 explicit error; UF2 States error not cited | −2 (sub 45/50) | "source: inferred(推自 surface-web 规则强制项 × BIZ-resilience-001 降级不打断呈现)" vs BIZ-resilience-001 "一律静默降级…不弹错" |
| D18 | Fact Alignment | 2c re-flow/re-memory inference unmarked | −3 (sub 45/50) | "重加后 pane 集合与比例重新记忆"(no source marker) |
| D19 | Fact Alignment | Unclassified negative-UX residue (3b) | −1 (sub 39/40) | (as D16) |
| D20 | Internal Consistency | 溢出 memory verified only in default-collapsed value (never toggled) | −1 (sub 59/60) | "每组会话 >5 条溢出折叠…随项目记忆" vs no step clicking "展开其余 N 个会话" |
| D21 | Internal Consistency | 5c archived selector observationally dangling (recoverability never in any expected result) | −3 (sub 47/50) | "可经恢复入口找回"(precondition only) |
| D22 | Internal Consistency | Risk Medium unjustified in text | −1 (sub 39/40) | (as D7) |
| D23 | Workflow Coverage | golden_path: false remains sole machine-readable signal on a qualifying sequence | −2 (sub 58/60) | frontmatter `golden_path: false` + comment 资格注记 |
| D24 | Workflow Coverage | Degraded-pane "可替换" affordance unreachable; no view-swap beyond 2c re-add | −6 (sub 44/50) | "缺失目标降级呈现(空态/可替换)"(no step reaches the replace action) |
| D25 | Workflow Coverage | 动画不阻塞 unaddressed; 溢出 expanded-state restore unexercised; 徽标-vs-▾ conflict unnamed | −3 (sub 37/40) | 必答⑧ "展开动画不阻塞列表滚动"(absent) |

No Golden Path veto. No −25 surface-type violations (assertions browser-appropriate throughout). No −40 invariant violations (D20 is default-value-only verification, not violation). No −30 hallucination instances (D15–D19 are tension/unmarking findings, conservative compositions, not fabrications). Risk level Medium: −1 for missing justification only.

---

## Threshold Pass/Fail Table

| Dimension | Score | Min | Status |
|---|---|---|---|
| 1. Completeness | 192/200 | 120 | PASS |
| 2. Semantic Purity | 187/200 | 120 | PASS |
| 3. Precondition Exclusivity | 136/150 | 90 | PASS |
| 4. Fact Alignment | 140/150 | 90 | PASS |
| 5. Surface Fitness | 132/150 | 90 | **PASS** (was 74/150 FAIL in iter 1) |
| 6. Internal Consistency | 145/150 | 90 | PASS |
| 7. Workflow Coverage | 139/150 | 90 | PASS (veto not triggered) |
| **Total** | **1071/1150** | **975** | **PASS** |

---

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. **[blindspot] PRD↔design pane-count tension resolved silently.** 必答⑨ says "pane 数量与比例随项目记忆" and UF9 States says split = "多 pane 同屏", but ui-design C9 concretizes "水平双 pane"/"split(双 pane,记忆比例)". Step 2c implements the multi-pane reading without flagging the tension — implementation will follow C9 (dual pane) or 必答⑨ (N panes), and a gen-contracts pass will freeze whichever it reads first. One parenthetical naming the two authorities closes it (booked as D15).
2. **[blindspot] session-expired rendering vs silent-degradation discipline.** ui-design's data-freshness section routes derived faces to "静默保留上次内容 + 结构化 log" on rebuild failure, reserving explicit error cards for C1/C2 load failures; the journey's session-expired mapping asserts explicit error + retry for pane content. Which discipline governs a 会话面板/看板 pane on channel loss is a real design question the mapping answers by citation mismatch (booked as D17).
3. **[blindspot] Layout-memory write timing still unspecified.** C9 says "拖分隔条→比例即时存"; the journey asserts "比例即时生效" (visual) and post-leave restore (Step 5) but never the write timing — whether a dragged ratio survives an ungraceful exit (app kill after drag, before leave) is undecidable from the document. Carried from iteration 1.
4. **[blindspot] 必答⑥/⑧ 徽标计数 vs UF3 无计数徽标 conflict still unnamed.** The journey safely uses 行尾 ▾ throughout (UF3 = later authority), and the new 词注 covers 「复用同一视图组件」/「origin=subagent」 but not this divergence; a downstream contracts pass reading 必答⑧ ("徽标计数 = 运行中数 + 历史总数") against 4b/Step 4 will emit contradictory badge assertions. Carried from iteration 1.
5. **[blindspot] Single-instance lock discipline absent from Setup.** Step 5's 离开后重进 pattern re-enters the real shell; repo testing memory requires checking active dsh-forge instances before full e2e (ERR_SINGLE_INSTANCE pitfall). Carried from iteration 1 (flagged identically in project-workbench-home).
6. **[blindspot] Restored-entry performance caliber absent.** BIZ-workbench-005 / SC6 bound the workbench 首屏 ≤2s @500 任务; layout replay adds restore work on top of first paint, and restore correctness is asserted with no timing stance against the inherited budget. Carried from iteration 1.
7. **[blindspot] Overflow-expanded state never exercised.** Setup stages the >5 group and Step 5 restores 溢出折叠状态, but only its default-collapsed value — no step expands "展开其余 N 个会话" before leaving, so the persistence of a user-modified overflow state (the meaningful half of UF3's "收起/展开与溢出状态随项目记忆") is never verified (booked lightly as D20/D25).
8. **[blindspot] Sibling overlap not cross-referenced at step level.** 5b (跨项目布局隔离) overlaps multi-window-tearout's memory-isolation surface and project-workbench-home's switch behavior; only the Overview carries cross-references, so memory-semantics revisions in either sibling can drift from 5b/6b silently. Carried from iteration 1.

---

## Revision Priorities (for reviser — non-blocking; score already ≥ target)

1. Give `session-expired` an exercisable in-journey outcome (or explicitly fold it into 5c's degradation family), and re-base its citation on UF2 States error rather than BIZ-resilience-001 (closes D1/D17).
2. Flag the 必答⑨ multi-pane vs C9 双-pane tension in one parenthetical at Step 2c; mark the re-flow inference `source: inferred` (closes D15/D18).
3. Stage a >20-descendant parent in the Setup fixture so 4b is executable as written (closes D5/D14).
4. Either narrow 5c to the deleted-target case and leave archived-unreachable to a named sibling edge, or state the archived case's expected rendering (closes D13/D21).
5. Non-blocking polish: one loading-state observation on re-entry; a tolerance caliber for ratio assertions; name UF3 as later authority for the ▾/徽标 divergence.
