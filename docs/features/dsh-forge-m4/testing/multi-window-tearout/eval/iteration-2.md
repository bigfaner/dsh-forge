---
feature: dsh-forge-m4
journey: multi-window-tearout
iteration: 2
rubric: eval/rubrics/journey.md (1150pt, 7 dimensions)
surface: web (rules/surface-web.md)
score: 1064
target: 975
status: pass (all dimensions above min threshold; total above target)
generated: 2026-09-30
---

# Eval-Journey Iteration 2 — multi-window-tearout

**Final Score**: 1064/1150 (target 975) — **REACHED**
**Threshold**: every dimension ≥ its floor (lowest margin: Surface Fitness 127/150 ≥ 90). No Golden Path veto.
**Iteration-1 baseline**: 915/1150, Surface Fitness 70/150 FAIL. Delta +149.

Scorer context loaded: `rules/surface-web.md` (SURFACE_TYPE=web, mandatory `validation-error` + `session-expired`, strategy 50/50), all 6 files in `docs/business-rules/` (workbench.md BIZ-workbench-002/005, coexistence.md ERR_SINGLE_INSTANCE, resilience.md BIZ-resilience-001, privacy/sot-migration/task-operations), `prd/prd-user-stories.md` Story 6 (L71-80, AC3 = ground truth), `prd/prd-spec.md` 必答⑨ (L211-215) + Data Requirements 布局记忆 (L243), `prd/prd-ui-functions.md` UF10 (L398-432), `ui/ui-design.md` C9 (L540-565) / C10 (L569-595), `design/tech-design.md` Interface 5 (L195-208) + project_ui_state (L239), proposal.md Key Scenarios 「分屏/多窗口」 (verified), conventions `docs/conventions/product-architecture.md` TECH-product-arch-003 (verified). House-style reference: sibling `task-session-roundtrip/journey.md` required_outcomes discharge pattern; sibling risk levels (project-lifecycle/registration-projection = High).

---

## Phase 0 — Iteration-1 Issue Re-verification (fix audit)

Every iteration-1 deduction re-verified against the revised page:

| Iter-1 # | Issue | Status | Evidence in revision |
|---|---|---|---|
| D1 (0/60) | Mandatory web outcomes absent | **FIXED (partial)** | `validation-error` = full edge Step 2c + mapping comment; `session-expired` = mapping comment attached to 3b but **not** embodied in any outcome text (residual −12, see SF) |
| D2 | Derived-scenario shortfall | FIXED | 8 edges; residual only for session-expired embodiment + 5b fixture (61/70) |
| D3 | No lifecycle edges; 主窗关闭 unexercised | FIXED | Step 4b (main close → exit, detached closed) + Step 5b (归档/删除) |
| D4 | Step 4 compound action; recall quality absent | FIXED | "该视图 pane 即时回主窗口原位,不待重启" (原位 + 即时); [收回] affordance grounded in C10 Interactions |
| D5 (10/50) | Zero inferred markers | FIXED | `source: inferred` on 2b/2c/3b/6b + both mapping comments, each with stated basis (45/50) |
| D6 | 4b forecloses UF10 open branch, contradicts design | FIXED | New Step 4 models close ≡ 收回 per design AND notes the PRD branch: "PRD UF10 原留「或记忆保持拆出态」分支,设计裁决为关闭即收回" |
| D7 | "让位" ungrounded | FIXED | Token absent; replaced by "按布局规则重排" with C9 inference basis |
| D8 | 数据内核 uncited; "选择收回" invented | FIXED | 词注 cites TECH-product-arch-003; "选择收回" replaced by [收回] + OS-close 同语义 (residual: 派生视图 over-attribution, see FA) |
| D9 | Unmarked negative-UX assertions | FIXED | All four now marked `source: inferred` with bases |
| D10 | 3b precondition co-holds with Step 3 | FIXED | "同一数据面…两侧镜像呈现(区别于步骤 3 的两侧不同视图并行)" |
| D11 | Old-4b action-frame / unreachable state | FIXED | Old edge deleted; new 4b declarative: "应用处于 multi-window 态(主窗口 + ≥1 拆出窗口)" |
| D12 | "(e2e 断言)" tags in Expected Results | FIXED | Tags removed from Step 3/1b; consolidated into Setup "断言口径(测试层,Expected Result 不重复携带)" |
| D13 | Procedural precondition; Setup mixing | Mostly fixed | All edge preconditions now declarative; Setup retains light procedural framing (−2 kept) |
| D14 | 数据内核/让位 tokens | FIXED | 让位 gone; 数据内核 lexicon-noted (light purity residual −2) |
| D15 | Step 4 recall → Step 5 vacuous restore | FIXED | New Step 5 re-tearout (×2) inserted; Step 6 restore non-vacuous |
| D16 | 关闭主窗口 invariant declared-but-unwalked | FIXED | Step 4b walks it incl. detached-closure consequence (tray half residual −2) |
| D17 | `golden_path: false` on qualifying sequence | NOT FIXED | Unchanged; batch convention (project-workbench-home owns the flag) — −3 kept, same as iter 1 |
| D18 | Lifecycle absent; 集合 singular | FIXED | Step 5 exercises plural ("拆出窗口集合 = 2"); 3c/5b cover cross-entity |
| D19 | 归档标题追加/删除关闭/绑定来源项目/原位收回 | FIXED | All four present (Step 4, 3c, 5b — near-verbatim C10) |
| D20 | No async stance; no window identity caliber; no balance | Mostly fixed | "断言前等待窗口集稳定" + "窗口集合恢复以窗口计数/身份核验" in Setup; explicit 50/50 framing still absent |
| D21 | A11y absent; settle absent; 1b determinism | Partially fixed | Settle + 1b instance-lock determinism in Setup; **a11y still wholly absent** (−4 kept) |

Iteration-1 blindspots: #1 fixed (Step 4/4b redesign), #2 fixed (3c), #3 fixed (5b), #4 fixed (Step 5/6 assert 视图类型/尺寸/位置 distinctly), #5 fixed (Setup instance-check), #6 NOT addressed (restore timing stance), #7 NOT addressed (sibling cross-ref still Overview-only).

**New issues introduced by the revision** (booked below): N1 5b compound precondition packs two exclusive states; N2 5b destructive branches run against the shared primary fixture (no disposable-project declaration); N3 risk Medium vs added irreversible delete branch (sibling delete-owners are High); N4 session-expired comment-only; N5 词注 over-attributes 「派生视图」; N6 coverage meta inside Step 5 Expected Result; N7 Step 5 post-double-tearout main-window state unstated.

---

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **Story workflow trace**: Steps 1→6 cover Story 6 AC3's full arc — 拆出 (1→2, UF10 Placement/Flow) → 并行互不干扰 (3, AC3 near-verbatim "操作互不抢占、状态互不串扰") → 收回 (4, design-resolved close ≡ recall with the PRD-open branch explicitly noted) → 集合复数 (5, 必答⑨ "拆出窗口集合" exercised in plural) → 记忆恢复 (6, UF10 `restored`). The macro argument is sound and the iteration-1 sequence gap (recall emptying the set before restore) is closed by the inserted Step 5.
2. **Cross-step references**: Setup earmarks the second project for 3c ✓; 2c cites 6b (renumbering consistent) ✓; 3b self-distinguishes from Step 3 ✓; 4b walks invariant 1's exit clause ✓; 5b walks invariant 5 ✓. Real seams found: (a) 5b's delete/archive branches mutate **project A — the shared fixture every other step depends on** — Setup declares no disposable project for them; (b) 5b's Precondition states archived and deleted conditions side by side ("另一侧 ="), which cannot co-hold; (c) Step 5 tears out both remaining panes but never states what the main window renders afterward; (d) the session-expired discharge lives only in an HTML comment — no step's outcome text asserts it (asymmetric with 2c and with the sibling house pattern, where the mapped error state appears in an Expected Result, e.g. task-session-roundtrip "明确错误提示「会话不存在或已清理」(open-failed 态)").
3. **Fact anchor spot-checks (pass)**: 标准壳窗/标题「<项目名> · <视图名>」 (C10 L580-581 verbatim); 移除主窗 pane (C10 Interactions L594 verbatim); OS 关闭 ≡ 收回/原位/不待重启 (tech-design L205 + C10 L587 verbatim); "或记忆保持拆出态" (UF10 Flow verbatim); 视图类型/尺寸/位置 + 首次默认居中、此后记忆 (UF10 Data Requirements L418 + C10 L587); restored (UF10 States); 聚焦既有实例后退出 (coexistence.md ERR_SINGLE_INSTANCE); A 窗仍 A 上下文/派生快照显示面/非第二激活 (C10 L585 near-verbatim); detached 随之关闭 (tech-design L205); 归档标题追加/删除全部关闭 + toast/布局记忆随删除清除 (C10 L586 + prd-spec L243 verbatim); SC4 multi-window elements all covered. **One over-attribution found**: the 词注 declares "「数据内核/派生视图」= 约定 TECH-product-arch-003…产品架构词汇" — 数据内核 verifies in that doc, but 「派生视图」 appears in **no** non-testing doc in the repo (grep clean); it is the journey's own composition of the 派生缓存/派生面/派生快照 family (BIZ-coexistence-002, ui-design).
4. **Risk-level audit**: the revision added an irreversible operation (Step 5b 经确认删除项目). The journey's own criteria comment places irreversible operations in High, and both sibling journeys that own deletion (project-lifecycle-projection, project-registration-projection) are rated High. Medium is now in tension with the page's own content (booked in Internal Consistency).

---

## Phase 2 — Dimension Breakdown

### 1. Completeness (完整性) — 188/200 (min 120, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Metadata complete | 49/50 | |
| Steps complete with required fields | 78/80 | |
| Happy path + required derived scenarios | 61/70 | |

- **Metadata (49/50)**: kebab-case ✓; `risk_level: "Medium"` valid value (content fit booked in Internal Consistency); `surface_types/keys: ["web"]` ✓; `generated` ✓; sources list the 3 PRD files. −1: `golden_path: false` on a fully qualifying sequence (batch convention, project-workbench-home owns the flag; same −1 as iter 1). Note (not booked, rubric's metadata row covers name/risk only): `sources` omits ui-design/tech-design/business-rules/conventions although the body now cites all of them — provenance hygiene suggestion.
- **Steps (78/80)**: 6 happy steps, each with User Action + Expected Result, coherent ordering; Step 4's affordance and recall quality now fully grounded. −2: Step 5 tears out both remaining panes ("先后将看板与会话两个视图再拆出") yet its Expected Result never states the main window's content state afterward ("主窗口与两个独立窗口并行" presupposes residual content — cf. C9's "全部 pane 关闭→回活跃区" analog, uncited and unasserted).
- **Derived scenarios (61/70)**: breadth now real — instance boundary (1b), sole-pane rearrange (2b), invalid tearout target (2c), mirrored-surface concurrency (3b), main-window project switch (3c), main close = exit (4b), project lifecycle archive/delete (5b), restore-target-missing (6b). −6: session-expired is discharged as a mapping comment only — no edge or outcome exercises the mapped behavior (asymmetric with 2c); −3: 5b's destructive branches have no declared disposable fixture — the delete branch destroys the primary project the entire journey depends on, undeclared in Setup.

### 2. Semantic Purity (语义纯度) — 191/200 (min 120, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Natural language, no code/regex | 76/80 | |
| Preconditions declarative | 57/60 | |
| No implementation coupling | 58/60 | |

- **Natural language (76/80)**: no regex, selectors, or assertion calls; "(e2e 断言)" tags removed from all Expected Results (Step 3 and 1b verified clean), consolidated into an explicitly labeled Setup 测试层 note. −2: Step 5 "拆出窗口集合 = 2(窗口集合以复数行使)" — the parenthetical is coverage meta-commentary addressed to the evaluator, not user-observable behavior; −2: Setup's 断言口径 block carries verification-procedural caliber ("断言前等待窗口集稳定", "以窗口计数/身份核验") — tolerated as declared test-layer notes, lightly booked.
- **Preconditions declarative (57/60)**: 1b/2b/2c/3b/3c/4b/6b are clean state descriptions — iter-1's procedural 4b is gone. −2: 5b's "另一侧 = 经确认删除该项目" is action-path framing ("经确认删除") rather than the state "项目已被删除"; −1: Setup embeds a procedural instruction ("测试前确认本机无活跃实例") inside the environment precondition.
- **Implementation coupling (58/60)**: actions user-level throughout; [拆出为窗口]/[收回] are UI labels. −2: "两窗口呈现同一数据内核的派生视图" keeps architecture vocabulary inside a user-observable Expected Result — mitigated to residual by the traceability 词注 lexicon declaration.

### 3. Precondition Exclusivity (前置条件互斥性) — 135/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Preconditions distinct across outcomes | 55/60 | |
| Sufficient to uniquely select an outcome | 43/50 | |
| No missing preconditions for boundary outcomes | 37/40 | |

- **Distinct (55/60)**: the eight edges target disjoint surfaces; 3b now explicitly self-distinguishes from Step 3 ("区别于步骤 3 的两侧不同视图并行") — iter-1 D10 fixed. −5: **5b packs two mutually exclusive states into one Precondition** ("项目 A 处于 multi-window 态且来源项目被归档;另一侧 = 经确认删除该项目") — a project cannot be both archived and deleted; the archive/delete branches are distinguishable only via the Expected Result's arrow labels, not via the Precondition block.
- **Sufficient to uniquely select (43/50)**: −3: 5b's two branches are decidable only by parsing the Expected Result's 归档 →/删除 → partition, not the stated precondition; −4: the session-expired trigger state ("detached 会话视图所依 dsh 会话通道不可用") exists only in a comment — no step's precondition selects it, so a contract generator cannot emit it.
- **Missing preconditions (37/40)**: every edge carries a Precondition ✓. −3: 5b's delete branch lacks the state-isolation declaration (disposable project) — as written it destroys the fixture the remaining steps depend on; the true divergent state ("该项目已被删除(隔离夹具),其余项目不受影响") is never stated.

### 4. Fact Alignment (事实依据) — 141/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Factual claims traceable | 56/60 | |
| Inferred claims: rule support + `source: inferred` | 45/50 | |
| No hallucinated unclassified claims | 40/40 | |

- **Traceable (56/60)**: every load-bearing assertion verified against source (Phase 1 #3 list); Step 4's PRD-branch disclosure ("PRD UF10 原留「或记忆保持拆出态」分支,设计裁决为关闭即收回") is exactly the right treatment of the iter-1 D6 defect. −3: **词注 over-attribution** — "「数据内核/派生视图」= 约定 TECH-product-arch-003…产品架构词汇": 数据内核 verifies; 「派生视图」 exists in no non-testing doc (repo grep clean) — the term is a composition of the 派生缓存/派生面/派生快照 family and should be attributed as such or added to the conventions doc; −1: Step 2's "移除主窗 pane = UF10 Interactions 原词" — the verbatim phrase lives in ui-design C10's Interactions row, not in PRD UF10 (label conflates the PRD function with its UI component; content still verifies).
- **Inferred claims (45/50)**: all derived outcomes now marked with basis — 2b (UF10 移除主窗 pane × 布局重排规则), 2c (surface-web 强制项 × 6b 同族拆出侧), 3b (数据内核单一事实源 × BIZ-workbench-005 失效-重建传播), 6b (BIZ-resilience-001 × 布局记忆随项目), plus both mapping comments. −2: session-expired mapping's cited basis is partially mismatched — BIZ-resilience-001 is the **silent**-degradation rule (不弹错), while the mapped outcome asserts **explicit** error + recovery guidance; the explicit-error pattern actually comes from the C1/C2 错误卡/重试 convention — basis should cite that family (or reconcile why a dead detached view is user-facing data unavailability, not the silent class); −3: the mapping is comment-only with no outcome embodiment (booking shared with SF/PE, light here).
- **Unclassified hallucinations (40/40)**: zero — no invented codes, messages, or behaviors; every behavior-level assertion traces verbatim, near-verbatim, or is marked inferred with basis. Iter-1's D9 class fully cleared.

### 5. Surface Fitness (Surface 适配) — 127/150 (min 90, **PASS** — iter-1 FAIL cleared)

| Sub-criterion | Score | Notes |
|---|---|---|
| Mandatory derived Outcomes present | 48/60 | no longer floor-0 |
| Test strategy proportions (50/50) | 44/50 | |
| Realistic web/e2e assumptions | 35/40 | |

- **Mandatory outcomes (48/60)**: `validation-error` fully discharged — Step 2c is a real edge (invalid tearout target → explicit message, no silent empty window) with mapping comment and inferred basis; matches house style. `session-expired` discharged as a mapping comment with inferred basis but **not embodied**: 3b's Expected Result asserts concurrent-update consistency only; the mapped behavior (明确错误 + 恢复引导,不静默空白、不丢已呈现内容) exists in no outcome text, unlike the sibling pattern (task-session-roundtrip embeds the mapped error state in its Expected Result). −12 for the half-discharge.
- **Strategy proportions (44/50)**: 6 journey-level traversal steps (window orchestration incl. quit/restart persistence = Journey-smoke material) vs 8 preconditioned boundary edges (Contract material) ≈ 43/57 — within the balanced band; edges contract-assertable. Iter-1 D20 stances now present: window identity caliber ("窗口集合恢复以窗口计数/身份核验") and async settle ("拆出建窗与重进恢复为异步面,断言前等待窗口集稳定"). −4: a11y still wholly absent (surface-web General Principles #4 — keyboard reachability/ARIA on the pane menu and window controls never touched); −2: no statement bracketing the 50/50 balance.
- **Environment realism (35/40)**: 1b relaunch determinism now stated ("测试前确认本机无活跃实例,步骤 1b 的第二进程启动才可确定性命中实例锁") — iter-1 D21 instance-lock part fixed. −3: 5b's destructive branches lack e2e data hygiene — deleting/archiving the primary fixture project mid-journey with no disposable-project declaration breaks sequential or parallel execution of the remaining steps; −2: Step 6's two-window restore replay carries no timing stance against the inherited BIZ-workbench-005 budget (首屏 ≤2s) — with restore now asserted at plural scale, the absence is load-bearing (kept small; also a blindspot).

### 6. Internal Consistency (一致性) — 142/150 (min 90, PASS)

| Sub-criterion | Score | Notes |
|---|---|---|
| Invariants hold in every step | 58/60 | |
| Cross-step references consistent | 48/50 | |
| Risk level consistent with content | 36/40 | |

- **Invariants (58/60)**: all six invariants verified against all 14 outcomes — no violations; invariant 1's exit clause now walked by 4b (incl. detached closure + re-entry restore); invariant 5 walked by 3c/5b. −2: invariant 6's 托盘 half ("多窗口不改变 M1 壳行为(托盘/单实例)") remains declared-but-unwalked — only the 单实例 half is exercised (1b).
- **Cross-step references (48/50)**: numbering sound after the renumber (1b…6b all bind correctly); Setup's fixture earmarks resolve (second project → 3c); Step 4→5→6 restore chain now non-vacuous (iter-1 D15 fixed). −2: Step 5 leaves the main window's content state unstated after both panes are torn out (see Completeness).
- **Risk level (36/40)**: −4: Medium now under-represents content — the revision added an irreversible operation (5b 经确认删除项目 + 布局记忆清除); the journey's own criteria comment assigns irreversible operations to High, and both sibling delete-owning journeys are High. Either raise the tier or isolate the deletion to a disposable fixture and justify Medium.

### 7. Workflow Coverage (工作流覆盖度) — 140/150 (min 90, PASS; veto NOT triggered)

| Sub-criterion | Score | Notes |
|---|---|---|
| **Golden Path existence (veto)** | 57/60 | semantically verified |
| Multi-step coverage depth | 46/50 | |
| Completeness vs PRD scope | 37/40 | |

- **Golden Path (57/60)**: semantic verification performed — Steps 1→6 form a contiguous 6-step sequence covering Story 6 AC3 in order (拆出 → 并行互不干扰 → 收回) extended by 必答⑨ 多窗口 (拆出窗口集合随项目记忆 → 重进恢复) and UF10's full state set (single-window/multi-window/restored). Domain-level operations throughout; no API-level steps; no veto. −3: `golden_path: false` frontmatter (batch convention — project-workbench-home owns the flag; same −3 as iter 1).
- **Depth (46/50)**: real state machine (single → multi → recalled → multi×2 → restored → exit/restart), cross-entity interactions (3c project switch × window binding; 5b project lifecycle × windows), concurrency (3b), validation (2c), degradation (6b), instance boundary (1b). −3: no partial-recall variant — after Step 5 establishes 2 windows, no step recalls exactly one (set 2→1, memory shrink consistency), the natural complement of Step 5's set-growth; −1: 拖尺寸/位置→记忆 (C10 Interactions) is asserted as memory semantics but the drag interaction itself is never performed as a User Action.
- **PRD-scope completeness (37/40)**: 必答⑨ 多窗口's three elements ✓; UF10 states + both Data Requirements fields ✓; C10 semantics ✓ (title, default size/centering, per-window 视图类型/尺寸/位置 memory, close ≡ recall, 绑定来源项目, lifecycle); SC4 multi-window elements ✓. −2: 必答⑨'s "M1 壳行为(托盘/单实例)不受影响" — 托盘 half untested; −1: restore-replay timing stance absent (BIZ-workbench-005 inherited budget).

---

## Deduction Log

| # | Dimension | Rule / ground | Deduction | Evidence quote |
|---|---|---|---|---|
| D1 | Surface Fitness | session-expired discharged comment-only, no outcome embodiment (asymmetric with 2c and sibling house style) | −12 (sub 48/60) | 3b Expected Result: "状态以数据内核为事实源,两侧一致更新、互不覆盖互不丢失" — mapped behavior only in "<!-- …session-expired → …拆出窗口内呈现明确错误 + 恢复引导… -->" |
| D2 | Surface Fitness | A11y dimension wholly absent (surface-web principle #4) | −4 | no step touches keyboard/ARIA on pane menu or window controls |
| D3 | Surface Fitness | No 50/50 balance framing | −2 | (absence) |
| D4 | Surface Fitness | 5b destructive branches lack disposable-fixture declaration (e2e data hygiene) | −3 | "User Action: 归档(或删除)来源项目 A" vs Setup "已注册项目含会话与看板数据,另有一个可切换的第二项目(承载步骤 3c…)" |
| D5 | Surface Fitness | Restore replay timing stance absent vs inherited budget | −2 | Step 6 "拆出窗口集合随项目记忆恢复:两个独立窗口按各自视图类型/尺寸/位置重建" (no timing caliber) |
| D6 | Completeness | session-expired not exercised as edge/outcome (mirrors D1) | −6 (sub 61/70) | (as D1) |
| D7 | Completeness | 5b fixture isolation undeclared | −3 | (as D4) |
| D8 | Completeness | Step 5 post-double-tearout main-window state unstated | −2 | Expected Result "主窗口与两个独立窗口并行" — main window content after both panes removed never stated |
| D9 | Completeness | `golden_path: false` on qualifying sequence (batch convention) | −1 | frontmatter `golden_path: false` |
| D10 | Semantic Purity | Coverage meta inside Expected Result | −2 | "拆出窗口集合 = 2(窗口集合以复数行使)" |
| D11 | Semantic Purity | Verification-procedural caliber in Setup 断言口径 (declared test-layer, light) | −2 | "断言前等待窗口集稳定" |
| D12 | Semantic Purity | 5b action-path framing in Precondition; procedural instruction in Setup | −3 | "另一侧 = 经确认删除该项目";"测试前确认本机无活跃实例" |
| D13 | Semantic Purity | Architecture vocabulary residual in Expected Result (lexicon-noted) | −2 | "两窗口呈现同一数据内核的派生视图" |
| D14 | Precondition Exclusivity | 5b packs archive+delete — two exclusive states in one Precondition | −5 (sub 55/60) | "项目 A 处于 multi-window 态且来源项目被归档;另一侧 = 经确认删除该项目" |
| D15 | Precondition Exclusivity | 5b branches selectable only via Expected Result arrow labels | −3 (sub 43/50) | "归档 → …;删除 → …" carries the actual partition |
| D16 | Precondition Exclusivity | session-expired trigger state exists in no step precondition | −4 (sub 43/50) | trigger state only in comment: "并行观察期间 detached 会话视图所依 dsh 会话通道不可用" |
| D17 | Precondition Exclusivity | 5b delete branch missing state-isolation precondition | −3 (sub 37/40) | no "项目已被删除(隔离夹具)" state declared |
| D18 | Fact Alignment | 词注 over-attribution:「派生视图」 absent from TECH-product-arch-003 and all non-testing docs | −3 | "「数据内核/派生视图」= 约定 TECH-product-arch-003(docs/conventions/product-architecture.md)产品架构词汇" |
| D19 | Fact Alignment | "UF10 Interactions 原词" label conflates PRD UF10 with ui-design C10 (content verifies) | −1 | "移除主窗 pane = UF10 Interactions 原词" vs ui-design C10 Interactions "建窗并移除主窗 pane" |
| D20 | Fact Alignment | session-expired basis mismatch: BIZ-resilience-001 is silent-degradation rule, mapping asserts explicit error (C1/C2 family is the right basis) | −2 (sub 45/50) | "source: inferred(推自 surface-web 规则强制项 × BIZ-resilience-001 降级不打断呈现)" vs mapped "呈现明确错误 + 恢复引导" |
| D21 | Fact Alignment | Mapping comment-only (booking shared, light) | −3 (sub 45/50) | (as D1) |
| D22 | Internal Consistency | Invariant 6 托盘 half declared-but-unwalked | −2 | "多窗口不改变 M1 壳行为(托盘/单实例)" — only 单实例 walked (1b) |
| D23 | Internal Consistency | Step 5 main-window state unstated (cross-ref seam) | −2 | (as D8) |
| D24 | Internal Consistency | Risk Medium vs added irreversible delete branch (own criteria comment puts irreversible ops in High; sibling delete-owners are High) | −4 | Step 5b "删除 → 该项目全部拆出窗口关闭 + toast 通知,布局记忆随删除清除" vs risk comment "High = …irreversible operations" |
| D25 | Workflow Coverage | `golden_path: false` (kept, batch convention) | −3 | frontmatter |
| D26 | Workflow Coverage | No partial-recall variant (set 2→1) after plural Step 5 | −3 | no step recalls one of the two windows created in Step 5 |
| D27 | Workflow Coverage | Drag-resize/position interaction never performed as User Action (memory asserted only) | −1 | Step 5 "此后记忆用户调整——ui-design C10" |
| D28 | Workflow Coverage | 托盘 half of M1 壳对账 untested; restore timing stance absent | −3 (sub 37/40) | 必答⑨ "M1 壳行为(托盘/单实例)不受影响" |

No Golden Path veto. No −25 surface-type violations. No −40 invariant violations (D22 is declared-but-unwalked half-clause). No −30 hallucination instances (D18/D19/D20 kept as citation-precision defects with rationale). No −20 precondition-overlap pairs booked at full severity (D14 is intra-edge branch packing, partial).

---

## Threshold Pass/Fail Table

| Dimension | Score | Min | Status |
|---|---|---|---|
| 1. Completeness | 188/200 | 120 | PASS |
| 2. Semantic Purity | 191/200 | 120 | PASS |
| 3. Precondition Exclusivity | 135/150 | 90 | PASS |
| 4. Fact Alignment | 141/150 | 90 | PASS |
| 5. Surface Fitness | 127/150 | 90 | **PASS** (iter-1 FAIL cleared) |
| 6. Internal Consistency | 142/150 | 90 | PASS |
| 7. Workflow Coverage | 140/150 | 90 | PASS (veto not triggered) |
| **Total** | **1064/1150** | **975** | **PASS** |

---

## Phase 3 — Blindspot Hunt (outside rubric dimensions)

1. **[blindspot] session-expired is the last unexercised mandatory surface outcome.** The natural edge exists and is half-written already: a detached conversation window whose dsh session channel dies mid-parallel-observation (Step 3's world) → 明确错误 + 重试/重连引导,不静默空白、不丢已呈现内容. Promote the comment to a Step 3d edge with a declarative precondition ("detached 会话视图所依会话通道不可用(会话已结束/宿主不可达)") in the 2c house style.
2. **[blindspot] Destructive-edge fixture isolation.** Step 5b archives/deletes 来源项目 A — the same project Steps 1-6 and edges 1b/2b/3b/3c/6b depend on. Declare a disposable third project in Setup earmarked for 5b (mirroring how the second project is earmarked for 3c), or state 5b as terminal (runs last, fixture not reused). This also resolves the risk-tier tension (D24) if Medium is retained with justification.
3. **[blindspot] 「派生视图」 lexicon governance.** The term is used in Expected Results and the invariant block but exists in no authoritative doc (repo grep: only testing/ hits). Either add the term to docs/conventions/product-architecture.md (or data-kernel.md) as declared vocabulary, or re-attribute the 词注 to the 派生缓存/派生面/派生快照 family it actually composes.
4. **[blindspot] Partial recall (one of many) untested.** Step 5 grows the set to 2; no step shrinks it to 1 via [收回] — the memory-consistency complement ("拆出/收回均更新布局记忆,记忆与实际窗口集恒一致" invariant 3) is only ever observed at set sizes 1 and 2→exit.
5. **[blindspot] Tray half of the M1-shell invariant.** 必答⑨ explicitly pairs 托盘/单实例 in "M1 壳行为不受影响"; only 单实例 is walked (1b). A minimal tray-presence assertion in multi-window state (or an explicit N/A note citing surface limits) would close invariant 6.
6. **[blindspot] Restore replay timing.** Step 6 replays two window creations + full pane structure on re-entry; BIZ-workbench-005's inherited 首屏 ≤2s budget is never bracketed. One caliber line (e.g., "恢复完成不劣于首屏预算量级") would anchor the e2e performance gate.
7. **[blindspot] Step-level cross-reference to split-pane sibling on the shared 布局记忆 write path** (carried from iter 1 #7). Tearout mutates 主窗口 pane 结构 — the same layout_json the sibling's restore assertions depend on; delegation remains Overview-only.
8. **[blindspot] Step 5 main-window residual content.** With both split panes torn out, what does the main window render (C9 analog: "全部 pane 关闭→回活跃区")? One clause in Step 5's Expected Result would make the plural tearout fully assertable.

---

## Verdict

**PASS — 1064/1150 ≥ 975, all dimensions above threshold.** All 21 iteration-1 deductions verified fixed or convention-kept; the revision introduced seven new minor defects (D1/D6 session-expired embodiment, D4/D7/D17 fixture isolation, D14/D15 branch packing, D24 risk tier, D18 lexicon attribution), none threshold-threatening. Remaining revision priorities if another pass is taken: blindspots 1-3 (session-expired edge, disposable fixture, lexicon attribution) cover the highest-value residual fixes.
