---
feature: "dsh-forge-m4"
journey: "project-lifecycle-projection"
rubric: "contract (1100pt / 8 dimensions)"
iteration: 1
date: "2026-09-30"
verdict: "FAIL (930/1100 < 935; Fixture Specification 0/100 — entity-completeness veto triggered)"
scorer_stance: "adversarial verification; every deduction carries file + quote"
---

# Contract Set Evaluation — iteration 1

**Scope**: 5 Contract files (`step-1` … `step-5`) in `docs/features/dsh-forge-m4/testing/project-lifecycle-projection/contracts/`, 13 Outcomes total. (Pipeline brief said "16 Contract files"; actual target DOC_DIR contents = 5 files — the other 30 contracts of the feature belong to the five sister journey sets and are out of scope here.)

**Evidence base consulted**:
- Rubric: `skills/eval/rubrics/contract.md` (1100pt, pass = total ≥935 AND every dimension ≥ threshold)
- Surface rule: `skills/gen-journeys/rules/surface-web.md` (required_outcomes: validation-error + session-expired)
- Handbook: `docs/features/dsh-forge-m4/design/page-map.md`
- Fact Table: `.forge/fact-table.json` — FT-117/FT-119/FT-123/FT-124/FT-125/FT-126/FT-127/FT-133/FT-134 verified verbatim
- Business rules: `docs/business-rules/workbench.md` — BIZ-workbench-006 (workspaceRegistry 单向投影), BIZ-workbench-001/002
- Design: `design/er-diagram.md` (projects v3 / workspace_projection / project_ui_state FK CASCADE), `design/tech-design.md` Interface 1 (投影四操作 verbs) / Interface 2 (relay 通道)
- Fixture schema: `skills/gen-contracts/rules/fixture-spec.md`
- Journey: `testing/project-lifecycle-projection/journey.md` (post-iteration-2 revision: Step 4→5 contradiction fixed)

---

## Phase 1 — Reasoning Audit (cross-Contract state chain)

| Step / Outcome | Precondition source | State produced | Chain verdict |
|---|---|---|---|
| 1 success | Setup: ≥2 项目, healthy | 纯读 | OK |
| 1 degraded-retry / deviation-renamed / deviation-deleted-reordered | edge preconditions (workspace 不可写 / dsh 手改) | degraded→healthy / deviation(只读) | OK — orthogonal axes, same fixture world |
| 1 archived-sessions-zone | UF3 归档会话存在 | 会话解除归档回树 | OK(表面归宿见 Anchor) |
| 2 success | "项目已注册,投影通道就绪(healthy)" ← Step 1 | displayName 两侧更新,分组保持 | OK |
| 2 rename-projection-failure | 通道失败 | degraded, plan 保留 | OK(FT-126) |
| 2 rename-blank-input | 空输入 | 两侧零变更 | OK |
| 3 success | 活跃态 + 会话 + healthy ← Step 2 后仍活跃 | archived=1, workspace 保留 | OK |
| 3 archived-partition-cross-project | 归档项目存在 + 另一活跃 | 纯读巡检 | OK(与 success 可同置,见维度 3) |
| 4 success | "项目处于归档态(archived=1)" ← **Step 3 State** | archived=0, 零投影 op | OK — 显式衔接 |
| 5 success | "承载项目处于活跃态**(Step 4 恢复后)**" ← **Step 4 State** | 行删除 + workspace 移除 + 布局清除 | OK — journey iteration-1 的状态矛盾已修复且契约显式绑定 |
| 5 archived-delete-branch | "归档态(**不经 Step 4 恢复**)" | 与显式支路同一终态 | OK — 显式发散 |
| 5 layout-isolation-others | "承载项目删除已完成" ← Step 5 | 其余项目布局原样 | OK |
| 5 confirm-cancel / delete-projection-failure | 对话取消 / 通道失败 | 零变更 / 本地删生效+待重试 | OK |

Narrative chain is fully coherent — the journey-level Step 4→5 defect from the journey eval was repaired in the journey revision and the contracts bind the cross-step references explicitly ("Step 4 恢复后" / "不经 Step 4 恢复"). **The audit defect is again at the fixture level**: entity declarations do not cover the entities the Outcomes' own Preconditions/Input/State operate on (see dimension 8, veto).

---

## Phase 2 — Dimension Scores

### 1. Completeness — 150/150 (threshold 90)

- All 13 Outcomes carry non-empty Preconditions / Input / Output / State; Side-effect explicit everywhere ("none" or concrete). 50/50.
- `## Journey Invariants` present in all 5 files, 6 entries each, verbatim from journey.md (including the Step 5d/5e extended clauses). 50/50.
- Happy path in every step; both web-mandatory derived outcomes present with rule-mapping comments (validation-error → step-2 `rename-blank-input` + step-5 `confirm-cancel-zero-change`; session-expired → step-2 `rename-projection-failure`). All 11 journey edges (1b/1c/1d/1e/2b/2c/3b/5b/5c/5d/5e) have corresponding Outcomes — 1:1 coverage, the strongest of the three evaluated sets. 50/50.

### 2. Semantic Purity — 178/200 (threshold 120)

| # | Deduction | Evidence |
|---|-----------|----------|
| 2.1 | −8 | Verification-instruction markers inside Output values (rubric: describe *what* the system produces, not *how* to verify): step-2 success "dsh 侧 workspace 同名**(断言)**"; step-3 success "项目会话列表不再展示**(断言)**…仍按该项目 workspace 分组**(断言…)**"; step-5 success "(断言)" ×2; step-5b "(断言:两支路收敛同一终态)". Same class the task-session-roundtrip scorer docked (its "(e2e 断言)" −8). |
| 2.2 | −2 | Precondition as confirm-time event narrative rather than pure state: step-2 rename-projection-failure "改名确认时投影写入失败(…)"; step-5 delete-projection-failure "删除确认时投影写入失败(…)" — acceptable but not exemplary. |
| 2.3 | −6 | Implementation coupling in dimension values: step-5 success State "forge 行删除(**删除 plan 先于行删除组装**);期望集 **FK cascade**;布局记忆 **forget 前置清除**;**active_project_id 同事务清空**" — DB/事务/plan 组装序为实现细节(FT-133/FT-117 事实正确,但维度值应述系统级结果);step-3/4 State "workspace 不移除(**零投影 op**)"(op = ProjectionOp 实现词)。 |
| 2.4 | −4 | Internal event-channel names as Side-effect values ×4: "project_list_changed 事件" (steps 2/3/4/5 success) — FT-135 的 IPC 载荷名,属内部通道词汇。 |
| 2.5 | −2 | Enum/design-state shorthand embedded in values: "degraded →(幂等全量重推成功)→ healthy"(state-machine 运算式);"幂等全量重推"为 FT-126 实现语义。 |

72 + 58 + 48 = 178.

### 3. Precondition Exclusivity — 130/150 (threshold 90)

| # | Deduction | Evidence |
|---|-----------|----------|
| 3.1 | −10 | step-2: success precondition "项目已注册,投影通道就绪(healthy)" vs rename-blank-input "改名输入为空名或纯空白" — orthogonal axes; a blank submission with channel ready satisfies **both** preconditions. The true discriminator (input validity) is stated only on the blank side; success never states 名字非空. Same class as task-session 3.2 (−10): "success does not carry 且推断在预算内完成". Input dimension partially rescues ("提交空/纯空白新名"), Output spaces cleanly separated — hence −10 not −20. |
| 3.2 | −5 | step-3: success ("项目已注册且处于活跃态…") vs archived-partition-cross-project ("存在归档项目,且当前工作台活跃项目为另一项目") — both states co-occur in a ≥2-project world with one archived + one active; only the Input/action (执行归档 vs 定位分区巡检) differentiates. Preconditions alone do not uniquely select. |
| 3.3 | −5 | step-5: confirm-cancel-zero-change precondition "删除确认对话已弹出,**操作者选择取消**" — the discriminator is the operator's future choice, baked into the precondition; success's precondition never states "操作者选择确认". Distinguishable ex post, but the selection key is procedural, not a state fact. |

Error/boundary triggers all stated explicitly (workspace 不可写/宿主通道不可达; dsh 手改; 空输入; 归档态; 对话弹出; 通道失败) — 40/40 on criterion 3. State-machine axes (healthy/degraded/deviation single-valued per FT-123) keep the four step-1 outcomes mutually exclusive. 55 + 35 + 40 = 130.

### 4. Fact Alignment — 141/150 (threshold 90)

Verified facts (all accurate against `.forge/fact-table.json`, checked verbatim):
- FT-123 → step-1 state-verification comment "状态机 4 态全矩阵"; degraded-retry "push_succeeded → healthy"; deviation "reconcile_drift → deviation(仅呈现)" ✅.
- FT-124 → deviation outcomes' 对账桥; "偏差明细不落表,对账重算物化" = er-diagram projects.projection_state 注记 ✅.
- FT-125 → step-2 "rename op 经 relay 执行"(执行序 ensure→rename→reorder→delete)✅.
- FT-126 → degraded-retry "期望状态在库期间不丢失"(plan retained); retryProjection = 幂等全量重推 ✅.
- FT-127 → step-2b/5e error mapping; 5e "relay fire-and-forget 回填竞态 → 终态 no-op" ✅.
- FT-133 → all four lifecycle verbs: renameProject 纯 DB + rename plan(本地不阻断)、archiveProject archived=1 零 op、restoreProject archived=0、removeProject buildRemovalPlan 先于行删除 + FK cascade + 拆出窗关闭 — contract State 值逐条对应 ✅.
- FT-134 → step-5 success "active_project_id 同事务清空(不自动激活下一项目)" ✅; "不指向已删 id" ✅.
- FT-117/FT-119 → layout-isolation "project_ui_state 行按 projectId" ✅.
- BIZ-workbench-006(M4) → 全部不变量与偏差/降级措辞逐字可溯;"任何入口禁止反向写" ✅. 必答④⑤表逐行核对(steps 2/3/4/5 主干)✅.

Deductions:

| # | Deduction | Evidence |
|---|-----------|----------|
| 4.1 | −5 | step-5 success Output "工作台落到其余项目或空态,不指向已删 id" — the journey marks this exact sentence `source: inferred`(UF1 × BIZ-workbench-002 调和);the contract restates it as unqualified fact, dropping the inferred annotation, while its own State asserts the FT-134 resolution ("不自动激活下一项目") — "落到其余项目" 与 no-auto-activate 的张力由 journey 显式调和、契约内未标注。 |
| 4.2 | −2 | session-expired mapping on step-2 rename-projection-failure carries the rule mapping comment but the outcome's own annotation is `source: journey Step 2b` — the `source: inferred` marker lives one hop away (in the journey), unlike the three outcomes that carry it inline (rename-blank-input / confirm-cancel / delete-projection-failure / layout-isolation, all exemplary with rule + basis + open-question markings). |
| 4.3 | −2 | step-5e Output "快照/挂接等自有数据级联随清" cites BIZ-workbench-001 — cascade breadth (task_snapshot/feature_snapshot/session_links) is er-diagram-inferable but the specific enumerated set is not verbatim in any single fact; borderline traceable, unmarked as derived. |

55 + 48 + 38 = 141. No hallucinated claims found — every behavioral claim maps to FT/BIZ/必答④⑤/UF1/UF8/journey; the two PRD-gap inferences (空名行为、删除×降级) are honestly marked "PRD 未明文,记 open question 待 PRD 对账" — best-practice annotation discipline in this set.

### 5. Surface Fitness — 96/100 (threshold 60)

- Mandatory web outcomes: validation-error mapped twice (step-2 rename-blank-input; step-5 confirm-cancel-zero-change — 删除确认取消同族) and session-expired mapped once (step-2 rename-projection-failure), each with explicit `surface-web required_outcomes 映射` comment. 40/40.
- Web language: user interactions (打开/确认/点击/取消/重进/搜索/逐条解除归档)、page elements (左栏/归档分区/行菜单/确认对话/状态行/降透明只读)、async semantics (降级提示/待重试/恢复后重试). Leaks: "幂等全量重推"(step-1 State)、"FK cascade"/"同事务"(step-5)、"project_list_changed 事件"×4 — implementation vocabulary inside dimension values. −4. 31/35.
- TUI timeout criterion: N/A for web → full marks. 25/25.

### 6. Internal Consistency — 145/150 (threshold 90)

- All 6 Journey Invariants hold in every Contract (归档≠删除 ✓ step-3 保留 vs step-5 移除; 单向投影 ✓ deviation outcomes 断言不回流; 确认对话 ✓ 5/5b 经对话、5d 取消; 降级承诺 ✓ 1b/2b/5e,且 5e 的 open-question 标注与不变量第 4 条的补全口径互相印证; 不破坏 ✓; ≤2s 无矛盾). No violations. 60/60.
- Cross-Contract state references: every inter-step reference ("Step 4 恢复后" / "不经 Step 4 恢复" / "承载项目删除已完成" / Step 3→4 archived 链) verified against the referenced Contract's State — all bind, none dangling. 45/50 after deduction:

| # | Deduction | Evidence |
|---|-----------|----------|
| 6.1 | −5 | step-1 dual surface identity: anchor places the interaction at "项目工作台·**右栏概览**·投影状态行" (page-map truth) while the Outcome Input operates "编排者打开**项目设置「投影与生命周期」节**" (UF8 wording) — a surface page-map does not define. Test author cannot tell whether the assertions target the overview-pane status row or a settings section. |

- Outcome preconditions achievable from preceding States: verified ✓ (chain repaired; 5b explicitly diverges before Step 4). 40/40.

### 7. Anchor Integrity — 90/100 (threshold 60)

Handbook `design/page-map.md` exists → dimension active. All 5 Contracts carry `anchors.web.{page, route, requires_auth, layout}` + `last_anchor_sync`. requires_auth=false matches page-map "Auth: none(单用户桌面)" ✓. All routes root at view key `project` ✓ (page-map View Key: `project` = `selectPanel(null)`).

Anchor value verification vs page-map:
- step-1 "项目工作台·右栏概览·投影状态行(UF8 投影与生命周期)" ↔ Shared Components "投影状态行 | 右栏概览 | healthy/degraded/deviation + [重试投影] + 偏差明细折叠" ✓ (route 字段补充的状态行内容与 page-map 逐字一致).
- step-3/4 "项目工作台·左栏项目树(C3)归档分区/归档行菜单" ↔ section "左栏项目树(C3)" + 行语言 "项目行(归档分区/⋯ 菜单)" ✓ canonical.
- step-5 "项目工作台·删除确认对话(C8 浮层)" ↔ 浮层 "C8 归档/删除确认" ✓.
- step-2 "项目工作台·**生命周期动作·改名**" — 见扣分。

Deductions:

| # | Deduction | Evidence |
|---|-----------|----------|
| 7.1 | −10 | step-2 page "项目工作台·生命周期动作·改名" — "生命周期动作" 不是 page-map 的任何 Page Section(项目工作台 sections = 左栏项目树(C3)/中间会话面板(C2)/右栏 dockkit(C2)/添加项目确认卡(C7));改名真实入口 = UF7 左栏 ⋯ / 设置。该锚点为自造区域名而非 handbook 可定位条目(Route Guard 段的 "C8 生命周期动作带确认 Dialog" 是入口纪律表述,非页面位置)。 |
| 7.2 | −0(记录,计入 6.1) | step-1 `archived-sessions-zone` 的交互面 = "上游原生设置面「已归档会话」区",page-map 仅以 "sidebar.settings(上游原生,M4 不动)" 记座位、无条目;该 Outcome 的实际表面无 handbook 覆盖,契约锚点(右栏概览)不覆盖它。跨文档缺口记入 blindspot 3。 |

Anchor field completeness 40/40; value match 20/30; handbook internal consistency 30/30 (page-map 无冲突定义). 40 + 20 + 30 = 90.

### 8. Fixture Specification — 0/100 (threshold 60) — **VETO TRIGGERED**

`fixture_spec` present in all 13 Outcomes (newly generated → scored normally, no backward-compatible clause).

**Entity semantic verification (against design entities)**: Project→`projects`(er-diagram), Workspace→dsh 侧 workspace 宿主实体 + `workspace_projection`(er-diagram Relationships "forge projects | dsh workspaces | 逻辑 1:1"), Session→upstream session 域实体(tech-design Interface 3 `ctx.sessions`), LayoutMemory→`project_ui_state`. All four entity types are design-backed; no "not a design entity" finding.

**VETO — entity completeness (step-5 `archived-delete-branch`)**:

> State: "与显式删除同一终态(条目删除 + workspace 移除 + **布局记忆清除**)"
> fixture_spec.entities: Project / Workspace / Session — **LayoutMemory 完全缺席**(连 state_requirements 也未提及)

The Outcome's own State changes reference LayoutMemory(布局记忆清除)而 fixture 未声明该实体 —— 无法为「清除」断言布种一行被删项目的 project_ui_state。Per rubric("Score 0 if any entity type referenced in the Contract's Preconditions, Input, or State changes is missing from fixture_spec.entities — triggers the veto")与姊妹判例(task-session-roundtrip step-3 同款 veto),整维 0 分。

**同条款的次级触发(独立成立亦足)**:

| # | 缺陷 | 证据 |
|---|------|------|
| 8.2 | Workspace 仅经 `state_requirements.prerequisite_entity` 声明,未入 `entities` ×3 —— schema 明文 state_requirements 用于**非实体**前置(如 "authentication enabled"),不作实体布种;三处的 Precondition/Input 直接点名 workspace("投影处于降级态(workspace 不可写…)"/"在 workspace 恢复可写后点击「重试投影」") | step-1 degraded-retry entities 仅 [Project];step-2 rename-projection-failure entities 仅 [Project];step-5 delete-projection-failure entities [Project, LayoutMemory] |
| 8.3 | step-5 delete-projection-failure: Output "恢复后重试成功 → workspace 移除、**会话退未分组**" — Session 实体完全未声明(重试终态断言不可布种) | 同上 fixture 块 |
| 8.4 | step-1 deviation-deleted-reordered: Workspace `min_count: 1` + 伪字段 `shape: "被 dsh 侧删除或乱序"` —— 「删除」支路为不存在的实体物化计数(姊妹 8.3 同款);「乱序」支路 min_count 1 不足(乱序断言需 ≥2 个 workspace 才有可比序,under-declared −8 类) | 该 Outcome fixture 块 |
| 8.5 | 派生伪字段成批充当 `field_constraints`,非实体可布种字段:Workspace.`alignment`(workspace_projection 实际列 = path/title/order_idx/…)/Workspace.`status`(step-4)/Project.`status`(step-5 ×3;projects 无 status 列,应为 archived)/Session.`project`(steps 3/5;分组经 workspace 派生)/LayoutMemory.`scope`(project_ui_state 实际列 = project_id/layout_json/updated_at)/LayoutMemory.`content`(layout_json 松散别名) | 各 fixture 块 |
| 8.6 | step-5 confirm-cancel-zero-change: Output 断言 "项目条目/**workspace/会话分组**/布局记忆全部保持" 而 fixture 仅 [Project, LayoutMemory] —— 两侧零变更断言的对照实体未布种(按 rubric 字面 Output 不触发 veto,记 corroborating) | 该 fixture 块 |

min_count 声明其余合格(step-5 success Project 2 + LayoutMemory 2 支撑隔离断言;step-3 Project 2;step-1 success Project/Workspace 2)。

---

## Threshold Table

| Dimension | Score | Threshold | Pass |
|-----------|-------|-----------|------|
| Completeness | 150 | 90 | ✓ |
| Semantic Purity | 178 | 120 | ✓ |
| Precondition Exclusivity | 130 | 90 | ✓ |
| Fact Alignment | 141 | 90 | ✓ |
| Surface Fitness | 96 | 60 | ✓ |
| Internal Consistency | 145 | 90 | ✓ |
| Anchor Integrity | 90 | 60 | ✓ |
| Fixture Specification | **0** | 60 | **✗ (veto)** |
| **Total** | **930/1100** | 935 | **FAIL** |

7/8 dimensions at or above the sister sets' passing levels; the single fixture veto (−74 vs the weakest passing sister's 74) sinks the total below 935.

---

## Phase 3 — Blindspot Hunt

1. **FT-127 op 级错误码无 Outcome** — rename-projection-failure 只覆盖通道缺席/不可写(FT-126 族);FT-127 的上游错误码映射(workspace/invalid-path | name-conflict | move-invalid → ERR_PROJECTION_OP_FAILED)在 step-2 的 reasoning 注释中被引用却无任何 Outcome 演练 op 失败类(如 dsh 侧 name-conflict)。事实在案的边界,零覆盖。
2. **改名重复名边界未覆盖** — D8/裁决 §5.1「display_name 自由改、可重复」;FT-125 rename op 按 workspaceId 定位而非按名 —— 改为与既有项目同名后分组/投影不串位是可事实推导的断言,无 Outcome。
3. **Step 1e 的表面无 handbook 条目** — archived-sessions-zone 的操作面 = 上游原生设置面「已归档会话」区,page-map 仅记 "sidebar.settings(上游原生,M4 不动)" 座位而无元素条目;gen-test-scripts 对该 Outcome 无元素/状态寻址依据。且 fixture 未约束项目活跃态:若所属项目已归档,UF1「不挂会话」与「会话行即时回左栏项目树」断言冲突 —— 归档项目下的解除归档会话回树到哪,契约未定义。
4. **restore 零边界** — Step 4 是全设置唯一单 Outcome 步骤;归档期间 dsh 侧 workspace 被手删(1d 偏差 × Step 4 组合)后恢复的行为(deviation 是否延续、FT-124 archived→no transition 的窗口)无 Outcome。
5. **degraded × deviation 并存优先序未定义** — workspace 不可写期间 dsh 侧又被手改:FT-123 单值状态机两触发并存,契约未声明优先序(承自 journey eval blindspot,修订未吸收)。
6. **loading-state 全程缺席** — 投影写为异步(≤2s 预算),13 个 Outcome 无中间态断言;web 规则将 loading-state 列为常见边界(非强制,故未扣 Surface Fitness,但 e2e 化时会产生等待策略空白)。
7. **「≤2s」硬断言无松弛口径进 Invariants** — BIZ-workbench-005 既有纪律「CI 计时用宽松阈值防抖动」;契约不变量照抄硬值,gen-test-scripts 直译将产出 flaky 计时断言(姊妹报告同款盲点)。

---

## Revision Directives (for gen-contracts revise pass)

1. step-5 archived-delete-branch: 补 `LayoutMemory`(min_count 1, belongs_to Project, 应清除)到 entities —— 解除 veto 的最小修复。
2. 三处通道失败 Outcome(degraded-retry / rename-projection-failure / delete-projection-failure): 将 Workspace 从 state_requirements 移入 `entities`(min_count 1 + path/title 约束),state_requirements 仅留纯系统态描述;delete-projection-failure 补 Session(退未分组断言)与级联对照实体(挂接/快照)。
3. 伪字段归一:Project.status→archived;Workspace.alignment/status/shape→path/title/orderIdx 或改述为对账事实;Session.project→经 workspace 分组约束;LayoutMemory.scope→project_id;content→layout_json。deviation-deleted-reordered 拆「已删除」(期望集声明 + 实况缺席,不物化计数)与「乱序」(Workspace min_count ≥2)两支或加 count 约束。
4. step-5 confirm-cancel 补 Workspace/Session 布种以支撑「全部保持」断言。
5. 语义纯度:step-5 success State 的 FK cascade/同事务/plan 组装序移入注释,State 改述系统级结果;Side-effect 中 "project_list_changed 事件" 改为「项目列表变更通知」并在注释保留通道名;剥离 "(断言)" 标记。
6. 互斥性:step-2 success 前置补「新名非空且非纯空白」;step-3 3b 前置补「本步骤不执行归档动作」或改述为巡检态;step-5 confirm-cancel 前置改述为状态事实(「确认对话呈现且未被确认」)。
7. 锚点:step-2 page 改为真实入口(左栏项目树(C3)⋯ 菜单 / 设置面);与设计对齐 UF8「项目设置」节的 page-map 归宿(或声明其=右栏概览状态行的承载位),消除 step-1 锚点与 Input 的双表面。
8. step-5 success Output「工作台落到其余项目或空态」补 `source: inferred`(UF1 × BIZ-workbench-002/FT-134 调和)或收敛为「不指向已删 id、指针清空不自动激活」。
