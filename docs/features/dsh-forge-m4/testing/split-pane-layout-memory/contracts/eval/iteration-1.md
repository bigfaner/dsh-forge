# Contract Eval Report — split-pane-layout-memory / iteration 1

- **Scorer**: contract-set adversarial scorer (forge:eval-contract rubric, 1100-pt / 8 dimensions)
- **Date**: 2026-09-30
- **DOC_DIR**: `docs/features/dsh-forge-m4/testing/split-pane-layout-memory/contracts/`
- **Scope**: 6 Contract files (step-1..step-6), 12 Outcomes total. Scored as found.
- **Context verified against**: `design/page-map.md` (handbook), `.forge/fact-table.json` (FT-001..FT-135, all cited FTs re-read verbatim), `docs/business-rules/workbench.md` + `resilience.md`, `design/er-diagram.md` + `design/tech-design.md` (Interface 4 / Data Models), `gen-journeys/rules/surface-web.md`, source `journey.md`.

## Verdict

**PASS** — Total **1016/1100** (≥935) and every dimension above threshold.

## Phase 1 — Reasoning Audit (cross-Contract state chain)

| Link | Step N precondition | Achievable from Step N−1 State? |
|------|--------------------|-------------------------------|
| 1→2 | "项目处于单视图默认态" | Yes — Step 1 State "默认布局(无重放)" |
| 2→2c | "已处于两 pane 分屏态" | Yes — Step 2 success State "右栏进入两 pane 分屏态" |
| 2→3 | "工作台处于两 pane 分屏态" | Yes — carried from Step 2 (Step 2c variant returns to multi-pane via 重加) |
| 3→3b | "两 pane 比例已处于钳制极限一侧" | Yes — reachable by dragging past Step 3's success ratio |
| 3→4 | "项目左栏存在带 subagent 后代的 parent 会话" | Yes — left-tree block independent of rightbar panes; self-seeded fixture (SubagentSession ×3) |
| 4→5 | "项目已摆出分屏布局(…subagent 收起状态/溢出折叠状态)并离开(写盘落库)" | Yes in structure — Steps 2/3/4 produce panes/ratio/tree states; leave triggers write-on-leave flush (FT-116). **But** the 溢出折叠 component presupposes ≥6 sessions per group, which no fixture in the set seeds (scored in Phase 2, Fixture/Completeness) |
| 5→6 | "工作台处于两 pane 分屏态" | Yes — Step 5 success restores exactly that |
| 6→6b | "已关闭全部分屏至单视图并离开(记忆已更新为单视图)" | Yes — Step 6 success State "记忆与实际一致(单 pane 结构)" |

No dangling cross-Contract references; all edge variants (2b/2c/3b/4b/5b/5c/6b) bind to their happy steps. The chain is sound; the one structural soft spot is the overflow-fold premise (see D1/D11).

## Phase 2 — Dimension Scores

### 1. Completeness — 144/150 (threshold 90, PASS)

- **Four mandatory dimensions per Outcome (50/50)**: all 12 Outcomes carry non-empty Preconditions / Input / Output / State; Side-effect explicit everywhere ("none" where absent); Invariants present on happy Outcomes (steps 2/3/4).
- **Journey Invariants section (50/50)**: every file has `## Journey Invariants` with the full 5-invariant set, verbatim-consistent with `journey.md`.
- **Happy + mandatory derived coverage (44/50)**: all 7 journey edge cases have Outcomes (2b, 2c, 3b, 4b, 5b, 5c, 6b); both mandatory web outcomes mapped (step 5c). Deductions: −4 the invariant "每组会话 >5 条溢出折叠为「展开其余 N 个会话」" (FT-115) is declared in **every** file and asserted in Step 5's restore Output, yet **no Outcome anywhere exercises the overflow fold** — the trigger state (>5 sessions in a group, staged by journey Setup) is never created by any Input/fixture in the set; −2 `session-expired` exists only as a mapping comment on step 5c with no exercisable boundary Outcome (inherited from the journey, per journey eval iteration-2 item d).

### 2. Semantic Purity — 188/200 (threshold 120, PASS)

- **Natural language, no code/regex (80/80)**: zero regex constructs, selectors, XPath, or assert calls in any dimension value across all 6 files.
- **Declarative preconditions (60/60)**: all Preconditions are state descriptions ("已注册项目含会话数据与任务看板/面板数据;该项目此前无布局记忆"), never setup procedures.
- **No implementation coupling (48/60)**: three leaks of internal register into dimension values:
  - −4 step-1 State: `"默认布局(无重放);首次 seam 报告后将写入首行布局记忆"` — "seam 报告" is the internal layout-collection seam (project jargon: "面层 seam"/"行 seam" per tasks/records), not user-observable language (same class the task-session-roundtrip contract eval booked −8 for "上游公共 seam").
  - −4 step-4 State: `"展开集入 tree.expandedSessions;状态随项目记忆"` — `tree.expandedSessions` is a ProjectLayout blob field (FT-119), an internal storage structure name; belongs in the state-verification comment.
  - −4 step-5c State: `"坏 op 计入 degraded(仅日志),序列继续"` — replay-engine op/degraded bookkeeping vocabulary inside a State value.
  All function/verb names (`openTab(preferNewPane)`, `getProjectUiState`, `planLayoutReplay`, `clampSplitRatio`, `SplitControls`) are correctly quarantined in frontmatter anchors and HTML verification comments.

### 3. Precondition Exclusivity — 134/150 (threshold 90, PASS)

- **Distinct across Outcomes (60/60)**: no two Outcomes in any Step share identical or semantically equivalent Preconditions; all pairs textually and semantically distinguishable.
- **Sufficient to uniquely select (34/50)**: three deductions.
  - −5 step-2: `view-enum-boundary`'s Precondition "项目存在未启用的扩展位视图类型(知识区为扩展位、未启用)" describes a **universal M4 state** (UF2: 知识区 = 扩展位 for every project) — it co-holds with `success`'s Precondition, so the generator cannot decide when 2b applies vs Step 2's own enumeration assertion. Assertions converge rather than contradict, so partial weight (same finding as journey eval iteration-2, now at Contract level).
  - −8 step-4: `descendants-over-limit`'s Precondition "某 parent 会话血缘后代数超上限(默认 20)" is strictly **contained in** `success`'s "项目左栏存在带 subagent 后代的 parent 会话" (a 21-descendant parent satisfies both); the fixture's `min_count: 3` is a floor, not an exact count, so it does not exclude the >20 case — the pair is not partitioned on either side.
  - −3 step-5c: Precondition carries **two selectors into one Outcome** — "某 pane 视图的目标数据已删除;另一同类不可达 = 目标会话已归档(行消失但可经恢复入口找回——归档 ≠ 删除)" — without stating whether the observable result differs (deleted → 空态/可替换 vs archived → recoverable target); the Output addresses only the deleted branch (inherited from journey 5c).
  - Steps 3 and 5 pairs ARE discriminated via their fixture_specs (`rightbar.widthPct 已达 30 或 70` vs generic two-pane; `其一 pane 指向已删除的目标` vs intact `rightbar` constraint) — counted as satisfied.
- **Error/boundary triggers explicit (40/40)**: every boundary Outcome names its trigger — "扩展位视图类型未启用", "两 pane 比例已处于钳制极限一侧", "血缘后代数超上限(默认 20)", "两个项目各自摆过不同布局", "目标数据已删除", "已关闭全部分屏至单视图".

### 4. Fact Alignment — 134/150 (threshold 90, PASS)

- **Factual claims traceable (44/60)**: FT citations are present and accurate where given — verified verbatim against `.forge/fact-table.json`: FT-118 (stored:false → zero replay) step 1; FT-113/FT-119 (five kinds / blob shape) step 2; FT-116 (800ms trailing debounce) step 2; FT-114 (0.3/0.7 clamp incl. keyboard) + FT-120 (widthPct [30,70]) step 3; FT-107 (LINEAGE_DESCENDANT_LIMIT=20 + 「查看全部」) + FT-119 (tree three sets) step 4; FT-122 (per-op guarded, split-ratio only ≥2 panes) steps 5/6. Deductions:
  - −6 step-5 success Side-effect: `"恢复重放的回声上报不触发写回(避免写回抖动)"` — **no fact, business rule, design section, or journey line supports echo-suppression-on-replay** (grep of fact table + tech-design for 回声/echo/write-back returns nothing); FT-116 (debounce) and FT-122 (replay sequence) do not cover it. A specific write-path behavior asserted with no traceability and no UNKNOWN marking.
  - −4 step-5b: reasoning cites "project_ui_state 行按 projectId 域(FT-117/FT-119)" — **FT-117 is forget-before-remove ordering and says nothing about projectId domain**; the claim's real basis is er-diagram.md (`project_ui_state.project_id` PK, FK cascade). Worse, 5b's State "切换时旧项目即时落盘(write-on-leave)" is FT-116 verbatim ("project switch flushes the OLD project immediately (write-on-leave)") yet FT-116 is not cited in that Outcome — right fact uncited, cited fact wrong.
  - −3 step-5c: "归档 ≠ 删除" claim is traceable to BIZ-workbench-006 (workbench.md line 94: "归档≠删除保历史分组可找回") but the citation present in journey 5c's precondition ("BIZ-workbench-006/必答⑤") was dropped in the Contract.
  - −3 step-1 State: "首次 seam 报告后将写入首行布局记忆" — first-write timing has no fact (FT-116/FT-118 cover debounce and no-row semantics only); unverified claim, unmarked.
- **Inferred claims have rule support + annotation (50/50)**: all 5 derived Outcomes carry source annotations — journey-edge ones cite `<!-- source: journey Step Nb -->` with reasoning (2b/2c/3b/4b/6b); step-5b/5c are marked `<!-- source: inferred -->` with reasoning bases (必答⑨/UF2; BIZ-resilience-001 × layout semantics). Surface-mandated derivations explicitly map the rule: step 3b "surface-web required_outcomes 映射:responsive-layout → …"; step 5c maps BOTH mandatory outcomes (`validation-error` and `session-expired`) with rule citation.
- **No unclassified hallucinations (40/40)**: beyond the booked unverified claims above, no claim contradicts or fabricates beyond the fact/journey/design corpus; the 30%–70% clamp, 20-cap, five-kind whitelist, and blob section names all match their facts exactly.

### 5. Surface Fitness — 97/100 (threshold 60, PASS)

- **Mandatory derived Outcomes present (40/40)**: surface-web `required_outcomes` = validation-error + session-expired; both explicitly mapped with justification on step 5c (invalid/damaged pane target → 降级空态; host/session-channel loss during pane ops → 明确错误 + 恢复引导). Neither silently dropped.
- **Surface-appropriate language (32/35)**: proper web vocabulary throughout — user interactions (拖拽 pane 分隔条、经「分屏」添加 pane、行尾 ▾ 展开/收起、切换项目、重进), page elements (工作台头部、左栏 parent 会话行、分隔条、pane), async semantics (去抖写、重放恢复、落盘). −3: the three internal-register leaks counted in Semantic Purity ("seam 报告", "坏 op 计入 degraded", "tree.expandedSessions") are also wrong register for a web Contract dimension value.
- **TUI timeout criterion (25/25)**: non-TUI surface — full marks by rule.

### 6. Internal Consistency — 150/150 (threshold 90, PASS)

- **Invariants hold in every Contract (60/60)**: no Contract violates any of the 5 journey invariants — steps 2/3 explicitly affirm "各 pane 复用同一视图组件,功能面不变"; step 4 affirms 归拢/默认收起; step 5b affirms per-project isolation; step 5c's degradation stays inside the resilience carve-out; no Contract touches M1 壳行为.
- **Cross-Contract references consistent (50/50)**: every state reference resolves through the Phase 1 chain ("已处于两 pane 分屏态" ← step 2 success State; "已关闭全部分屏至单视图并离开" ← step 6 success State); no dangling references; blob sections written per step (rightbar by 2/3, tree by 4) are disjoint per FT-119.
- **Preconditions achievable from preceding States (40/40)**: verified link-by-link in Phase 1; leave-flush (write-on-leave, FT-116) makes step 5's "写盘落库" achievable; step 6's two-pane precondition is exactly step 5's restored state.

### 7. Anchor Integrity — 100/100 (threshold 60, PASS)

Handbook `design/page-map.md` exists for web → dimension active.

- **Anchor field completeness (40/40)**: all 6 Contracts carry `anchors.web.page` (plus route/requires_auth/layout extras); the required `page` field missing nowhere.
- **Anchor values match handbook (30/30)**: all 6 page anchors resolve to the handbook's "项目工作台" entry with qualifier suffixes that match handbook vocabulary — "右栏 dockkit" (C2), "分屏控制(C9)"/"C9 分隔条" (page-map: "pane 分割 = C9 分屏"), "左栏项目树(C3)" (verbatim section name); routes all root at `project(...)` matching View Key `project`; `requires_auth: false` matches handbook "Auth: none(单用户桌面)". Paraphrased qualifiers (e.g., "重进恢复(布局记忆重放)") judged resolvable, not mismatched.
- **Handbook internal consistency (30/30)**: no page in page-map carries conflicting view keys, routes, or navigation paths.

### 8. Fixture Specification — 69/100 (threshold 60, PASS)

Veto considered, **not** triggered: every Outcome's primary operated-on entity is declared and all declared entity types pass semantic verification against design entities — Project→`projects`, Task→`task` (er-diagram.md), LayoutMemory→`project_ui_state`(布局记忆, 1:1 FK cascade), Session/SubagentSession→upstream `ctx.sessions` domain entities (tech-design Interface 3). Deductions graded, per the "seedability of the core scenario survives" precedent.

- **Entity completeness (24/40)**: −4 ×2 and −8:
  - −4 step-1: Preconditions assert "已注册项目含会话数据**与任务看板/面板数据**" but `fixture_spec.entities` declares only Project + Session — the Task entity referenced in the Preconditions is undeclared (step 2 does declare Task ×3 for the same corpus; step 1 breaks the convention).
  - −4 step-2 `view-enum-boundary`: Output asserts "仅呈现当前项目可用视图(会话/**feature 任务面板/看板类**)" — board/panel view availability presupposes Task/Session data, yet the fixture declares Project only; a seeder cannot make 看板类 "available".
  - −8 step-5 success: Output asserts restoration of "subagent 收起状态与**每组会话溢出折叠状态**" but the fixture declares only Project + LayoutMemory — neither Session (≥6 per group) nor SubagentSession is seeded, so both restore assertions are unobservable from the declared data.
- **Relationship and constraint coverage (28/35)**: all child entities declare `relationship_type: belongs_to` + `parent_entity`, consistent with design (Session/SubagentSession under Project/Session; LayoutMemory under Project = `project_ui_state` FK). −3 step-4 success constrains `field: "role"` on Session — no such field exists on the upstream session entity (parentness is relational, already conveyed by the SubagentSession relationship; same class as the sibling eval's `field: "status"` finding). −4 step-4 success Output asserts "多级同规则递归收起" but SubagentSession ×3 carries no depth constraint — three flat siblings satisfy the fixture while the assertion requires a ≥2-level nested chain.
- **Minimum data quantity (17/25)**: −8 the overflow-fold premise needs ≥6 sessions in one group somewhere in the set (journey Setup: "其中一会话组 >5 条会话,可触发溢出折叠"; step-5 Output asserts its restoration; the invariant is declared in all 6 files) — **zero fixtures declare a >5 session group** (max anywhere: Session min_count 1). All others sufficient: Task ×3 for board/panel split views; Project ×2 + LayoutMemory ×2 for isolation; SubagentSession ×21 = exactly the 20-cap + 1 needed to trigger 「查看全部」.

## Deduction Log

| # | Dimension | Δ | Evidence |
|---|-----------|---|---|
| D1 | Completeness | −4 | Overflow-fold invariant (FT-115) declared in every file, asserted by step-5 Output, never exercised by any Outcome/fixture |
| D2 | Completeness | −2 | session-expired mapped comment-level only on step 5c; no exercisable boundary Outcome |
| D3 | Semantic Purity | −4 | step-1 State "首次 seam 报告后将写入首行布局记忆" — internal seam jargon |
| D4 | Semantic Purity | −4 | step-4 State "展开集入 tree.expandedSessions" — blob field name in dimension value |
| D5 | Semantic Purity | −4 | step-5c State "坏 op 计入 degraded(仅日志)" — replay-engine internals |
| D6 | Precondition Exclusivity | −5 | step-2 view-enum-boundary precondition is a universal M4 state; co-holds with success |
| D7 | Precondition Exclusivity | −8 | step-4 over-limit ⊂ success containment; min_count 3 does not exclude 21 |
| D8 | Precondition Exclusivity | −3 | step-5c two selectors (deleted vs archived target) merged into one Outcome, Output addresses only deleted branch |
| D9 | Fact Alignment | −6 | step-5 success "恢复重放的回声上报不触发写回" — no FT/BIZ/design/journey support, no UNKNOWN |
| D10 | Fact Alignment | −4 | step-5b cites FT-117 for "projectId 域" (unsupported); actual basis FT-116/er-diagram uncited |
| D11 | Fact Alignment | −3 | step-5c "归档 ≠ 删除" — BIZ-workbench-006 citation dropped from journey text |
| D12 | Fact Alignment | −3 | step-1 first-write timing claim uncited/unmarked |
| D13 | Surface Fitness | −3 | internal-register leakage (seam/op-degraded/blob field) in web dimension values |
| D14 | Fixture Specification | −4 | step-1 Task referenced in Preconditions, undeclared |
| D15 | Fixture Specification | −4 | step-2 view-enum asserts board/panel availability, seeds no Task/Session |
| D16 | Fixture Specification | −8 | step-5 success restore assertions (subagent/overflow) lack Session/SubagentSession entities |
| D17 | Fixture Specification | −3 | Session `field: "role"` — non-existent field |
| D18 | Fixture Specification | −4 | multi-level recursion asserted, no depth constraint on SubagentSession |
| D19 | Fixture Specification | −8 | no fixture anywhere declares a >5 session group (overflow fold unseedable) |

## Threshold Table

| Dimension | Score | Threshold | Result |
|-----------|-------|-----------|--------|
| Completeness | 144/150 | 90 | PASS |
| Semantic Purity | 188/200 | 120 | PASS |
| Precondition Exclusivity | 134/150 | 90 | PASS |
| Fact Alignment | 134/150 | 90 | PASS |
| Surface Fitness | 97/100 | 60 | PASS |
| Internal Consistency | 150/150 | 90 | PASS |
| Anchor Integrity | 100/100 | 60 | PASS |
| Fixture Specification | 69/100 | 60 | PASS |
| **Total** | **1016/1100** | **935** | **PASS** |

## Phase 3 — Attack List (blindspots)

1. **[blindspot][Fixture Specification/Completeness] 溢出折叠不变量全链路无落地** — FT-115 (TREE_OVERFLOW_LIMIT=5) 撑起一条全文件级不变量与 step-5 恢复断言,但整套 12 个 Outcome 无一触发 >5 折叠,也无任何 fixture 声明 ≥6 条同组会话。gen-test-scripts 依据现 fixture 生成的种子无法复现「展开其余 N 个会话」,step-5 的四维恢复断言将有一维永远空洞。需在某一步(最自然 = step-5 前置或专设 Outcome)补 Session ≥6/组 + overflowOpen 状态。
2. **[blindspot][Fact Alignment] 回声抑制 Side-effect 无事实支撑** — step-5 "恢复重放的回声上报不触发写回(避免写回抖动)":事实表/设计/旅程均无此行为。要么补 FT(若实现属实),要么标 UNKNOWN,否则是测试层无法核验的空头断言。
3. **[blindspot][Precondition Exclusivity] step-4 成功/超限未分区** — "存在带 subagent 后代的 parent 会话" ⊇ "后代数超上限(默认 20)",且 fixture min_count:3 为下界不含上界;应将 success 约束为「后代数 ≤20」或在 fixture 加精确计数约束。
4. **[blindspot][Fixture Specification] Session `field: "role"` 虚构字段** — 上游会话实体无 role 字段;parent 性已由 SubagentSession belongs_to 表达。约束应改为关系性描述(存在 ≥N 个 subagent 后代),seeder 不会踩空字段。
5. **[blindspot][Precondition Exclusivity/Fact Alignment] step-5c 双选择器单结果** — "目标数据已删除" 与 "目标会话已归档" 合并进一个 Outcome,输出只覆盖删除分支;归档目标的 pane 行为(可找回提示 vs 空态)无事实定义亦无区分,需拆分或补事实。
6. **[blindspot][Precondition Exclusivity] step-2b 全称前件** — "知识区为扩展位、未启用" 是所有 M4 项目的常态(UF2),与 success 恒共持;该 Outcome 本质是 success 枚举断言的细化,建议并入 success Output 或改写为可分叉前件(如"项目含已启用的扩展位视图类型"的反例构造)。
7. **[blindspot][Semantic Purity] State 维度内语漏出** — "seam 报告"(step-1)、"tree.expandedSessions"(step-4)、"坏 op 计入 degraded"(step-5c)应下沉到 state-verification 注释,State 值保持系统级语言。
8. **[blindspot][Fixture Specification] step-5 恢复断言缺底座实体** — 恢复"subagent 收起状态/溢出折叠状态"需 Session+SubagentSession 数据在场,fixture 只有 Project+LayoutMemory;记忆 blob 里有展开集而树里没有对应行,断言不可观察。
9. **[blindspot][Fact Alignment] FT-117 误引 + write-on-leave 漏引** — step-5b 引 FT-117 支撑 "projectId 域"(FT-117 实为 forget-before-remove 排序),而其 State 的 "write-on-leave" 恰是 FT-116 原词却未引;引用需换正。
10. **[context, not scored] session-expired 无可执行腿** — 桌面壳无登录会话,映射到"宿主/会话通道失联"仅存在于注释;若 gen-test-scripts 需要可执行边界,应在某步构造通道失联(如 fault-injection 缝,FT-128 同族)或显式声明 deferral。
