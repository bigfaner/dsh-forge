# Contract Eval Report — fix-chain-auto-recovery / iteration 1

- **Eval type**: contract | **Surface**: web | **Iteration**: 1
- **Scope**: `contracts/step-1-submit-blocked.md` … `step-5-views-reflect-fix-chain.md` (5 files)
- **Inputs**: journey.md（不变量对拍）、.forge/fact-table.json（事实对拍）、rules/surface-web.md、design/page-map.md（锚点手册）、tech-design.md（域模型 ER 交叉验证）
- **Scorer stance**: adversary；每条扣分附文档原句。

## Phase 1 — Reasoning Audit (pre-score anchors)

1. **分解忠实度**：5 个 happy step + 5 个 journey 边界（1b/2b/2c/4b/4c）全部映射为 Outcome，另有 3 个推断型 Outcome（from-mismatch-rejected / duplicate-fix-reuse / fix-itself-blocked-deepens-chain），均带 `source: inferred` + fact 依据。覆盖面优于 journey 最低要求。
2. **事实对拍抽检全绿**：ERR_REASON_REQUIRED（M2_SUBMIT_INPUT_VALIDATION）、ERR_CYCLE_DETECTED + 完整环路径 + 零部分写（M2_CYCLE_DETECTION）、ERR_CHAIN_DEPTH_EXCEEDED root 先序（M2_FIX_CHAIN_DEPTH_LIMIT 事实）、reused=true 纯读不重块（M2_ADD_TWO_LEVEL_DEDUP）、auto-block/auto-restore verb+actor（M2_ADD_ATOMIC_TRIPLE / M2_RESTORE_HOOK）、满足集 {completed, skipped}（M2_SATISFYING_STATUSES）、单次重取即见（M2_EVENT_PUSH_CHAIN）。
3. **预置疑点**（后续维度计分）：step-1 返回体含无事实支撑的 `restored` 字段；step-3 Output 引用数据库索引名；step-5 前置为析取式（pending 或 blocked）；step-1~4 锚点字段全空；step-2 内联 success fixture 缺 Feature 实体。
4. **不变量对拍**：5 条 journey 不变量在 5 份合约中逐字在场，未发现违反（详见维度 6）。

## Phase 2 — Rubric Scoring

### 1. Completeness — 147/150 (min 90)

| Criterion | Score | Notes |
|---|---|---|
| 四维非空 | 50/50 | 全部 14 个 Outcome 的 Preconditions/Input/Output/State 均非空；Side-effect 全部显式（含 "none"）；Invariants 按 Outcome 可选在场。 |
| Journey Invariants 段 | 50/50 | 5 份合约均有 `## Journey Invariants` 且各 5 条，与 journey.md 逐字一致。 |
| happy + 派生场景覆盖 | 47/50 | 见下。 |

扣分：
- **-3**：step-5（唯一真 web 交互步）只有单一 Outcome，且该 Outcome 将两条可观测终态合并——"源任务已恢复 pending 或保持 blocked——按 Step 4 结果"——「未恢复 blocked」分支（4c 之后果）在 web 面无专属断言承载；该步也无任何 web 边界 Outcome（如重取中的过渡态）。改进：按 Step 4 结果拆分为两个 Outcome，或钉死单一可断言终态。

### 2. Semantic Purity — 180/200 (min 120)

| Criterion | Score | Notes |
|---|---|---|
| 自然语言非代码/regex | 72/80 | 见下。 |
| Preconditions 声明式 | 60/60 | 全部前置为状态描述（"任务 X 已 blocked（Step 1 落账）"、"fix 任务 F 在场且就绪"），无过程式设置指令。 |
| 无实现耦合 | 48/60 | 见下。 |

扣分：
- **-8**（A）：响应体字面量。step-1 success Output："返回 { taskId, status='blocked', restored }"——rubric 明令的反模式（等价于 "API returns 201 with {slug: ...}"）；step-2 重复 Outcome "返回 reused=true 与既有 taskId" 同形制。应改为自然语言："返回携带任务标识、blocked 状态与恢复标志的确认"。
- **-12**（C）：实现内部标识渗入维度值。step-3 Output："恢复钩子被触发（blockers 反查后继——**经 idx_edges_prerequisite 反查**以 F 为前置的等待方）"——SQLite 索引名是实现细节（事实表可引，维度值不应引）；各合约 State 普遍采用列赋值记法（"tasks.task_status = blocked"、"task_records 新增 submit 行（verb='submit'…actor='plugin-tool'）"）——schema 耦合（有事实同源的可辩理由，故轻扣）；step-5 Output "DAG 视图呈现源→fix 依赖边（**SVG 贝塞尔连线**）"——渲染实现细节，用户可感知语言应为"DAG 视图以连线呈现源→fix 依赖边"。

### 3. Precondition Exclusivity — 130/150 (min 90)

| Criterion | Score | Notes |
|---|---|---|
| 同 Step 内前置互异 | 56/60 | 各 Step 的 Outcome 触发条件整体可辨。 |
| 前置足以唯一选定 Outcome | 36/50 | 见下。 |
| 边界 Outcome 显式陈述触发条件 | 38/40 | 边界 Outcome 均正面陈述触发（"reason 缺席"、"会成环的依赖"、"链深将超上限"、"同型未终态 fix 在场"、"F 执行中质量门未通过"、"另有未终态依赖"）。 |

扣分：
- **-4**（A）：step-2 success 与 duplicate-fix-reuse 潜在重叠——success 前置"任务 X 已 blocked（Step 1 落账）；executor 持源任务 TaskRef；fix 链深未超上限；无成环依赖构造"未排除"既有同型未终态 fix 在场"的世界，该世界里两组前置同时可满足，需靠 Output 语义（新增 vs 复用）反推。改进：success 前置补"无既有同源同型未终态 fix"。
- **-8**（B）：step-5 前置为析取式——"源任务已恢复 pending **或**保持 blocked——按 Step 4 结果"——同一 Outcome 容纳两个不同的世界状态，而 Output（"fix 链关系…单次重取即见"）未钉死列表中源任务应显示哪个状态，下游无法写出确定性断言。
- **-6**（B）：step-1 success 前置未正面钉住 reason 在场（"任务 X 处于 in_progress 且执行受阻（executor 即将提交 blocked）…"），与 blocked-reason-required 的区分依赖 Input 维度（"reason 必带" vs "无 reason"）而非前置本身；同类问题见上条 step-2。改进：happy 前置显式包含正向条件。
- **-2**（C）：step-4 skipped-source 触发源含混——Input："恢复钩子触发（**人工跳过结算或转移事务内聚**）"——"或"留下两条未裁决的触发机制。

### 4. Fact Alignment — 124/150 (min 90)

| Criterion | Score | Notes |
|---|---|---|
| 事实声明可溯源或标 UNKNOWN | 50/60 | 错误码/审计形状/去重语义抽检全部与 fact-table 精确吻合；但见下。 |
| 推断声明带规则支撑 + source: inferred | 38/50 | 3 个推断 Outcome 均有 `<!-- source: inferred -->` + reasoning 引用具体 fact_id（M2_SUBMIT_FROM_GATE、M2_ADD_TWO_LEVEL_DEDUP、M2_SUBMIT_INPUT_VALIDATION + M2_ADD_ATOMIC_TRIPLE）——推理依据充分；但**均未引用 surface required_outcomes 规则**（web 面规则为 validation-error/session-expired，与这三个派生无对应），rubric 要求注明"哪条 required_outcomes 规则触发了派生"。 |
| 无未分类幻觉 | 36/40 | 见下。 |

扣分：
- **-10**（A）：无事实支撑且未标 UNKNOWN 的响应格式声明——step-1 success Output："返回 { taskId, status='blocked', **restored** }"——fact-table 无任何 submitTask 返回形状事实，`restored` 字段无出处（且语义可疑：blocked 提交时刻恢复尚未发生）；另 step-3 State："**git 提交产生**"——执行器技能行为，非核心域事实，未分类。改进：删除或标注 UNKNOWN/环境性。
- **-12**（B）：如上，推断注记缺 required_outcomes 规则引用（推断实为域驱动而非规则驱动，注记应如实声明规则豁免依据）。
- **-4**（C）：`restored` 字段介于"未验证"与"未分类"之间，按零容忍原则从宽扣（部分字段有状态蕴含支撑）。

### 5. Surface Fitness — 82/100 (min 60)

| Criterion | Score | Notes |
|---|---|---|
| web 必派生 Outcome 在场 | 30/40 | 5 份合约均有 web-surface-required 裁决注记（validation-error N/A——工具调用面无表单；session-expired N/A——本地单人无服务端会话凭据），裁决合理且有据（ELECTRON_MAIN / RPC_ENVELOPE 本地事实）；且输入校验边界的实质等价物（blocked-reason-required）在场。扣分：唯一真 web 面 step-5 连一个 web 特有边界（重取过渡态/错误态）都没有，全靠 N/A 注记支撑。 |
| Surface 恰当语言 | 27/35 | step-5 使用标准 web 语言（概览 tab、三视图、DAG、泳道、重取）；step-1~4 使用 agent-tool/数据面语言（"executor 调 submitTask"、"addTask --block-source"）。这是旅程真实形态的诚实描述而非误配，且 step-1 Side-effect "写后事件发射（**概览即时见 blocked**）"做了 web 可见性桥接；但 4/5 步零 web 交互语言仍属适配弱化。 |
| TUI timeout（非 TUI） | 25/25 | 不适用，满分。 |

### 6. Internal Consistency — 146/150 (min 90)

| Criterion | Score | Notes |
|---|---|---|
| 不变量在每份合约成立 | 56/60 | 5 条不变量逐合约核对无违反（三件套原子、无环拒绝、满足集、恢复不删边、链深 ≤6 在 fix-itself-blocked 中"链深 +1 且仍受 ≤6 守卫约束"正确延续）。 |
| 跨合约状态引用一致 | 50/50 | Step2←Step1（X blocked）、Step3←Step2（fix pending + 边 origin=fix-chain）、Step4←Step3（F completed）、Step5←Step4（终态+恢复与否）链路完整无悬挂；step-3 还显式注记"同 task-dispatch-pipeline 旅程 Step 2-5 形制"。 |
| 前置可达性 | 40/40 | 各步前置均由前步 State 变化达成；from-mismatch 为独立初始世界（合法边界形态）。 |

扣分：
- **-4**（A）：blocked→blocked 语义未和解——step-1 State 已将 X 置 blocked（submit 行），step-2 Output 再"源任务置 blocked（审计 verb='auto-block'，actor='core'）"。事实上 auto-block 不过转移门（M2_AGENT_TRANSITION_MATRIX），幂等重置合法，但合约未声明"对已 blocked 源的幂等重置 + 追加 auto-block 行"语义，导致审计行数断言不确定——step-5 fixture 被迫对冲："含 auto-block 与 auto-restore（**或按实际路径**）"。改进：step-2 Output 明示幂等重置语义并钉死审计行计数。

### 7. Anchor Integrity — 76/100 (min 60)

手册 `design/page-map.md` 存在，本维度激活。Web 必填锚字段 = `page`。

| Criterion | Score | Notes |
|---|---|---|
| 锚字段完备 | 16/40 | 见 Missing Anchor Fields 表。 |
| 锚值与手册一致 | 30/30 | step-5：page "右栏「项目概览」tab（dswf-overview）任务子 tab 三视图" ↔ 手册条目"右栏「项目概览」tab（dswf-overview）"；route "dswf-overview" ↔ 注册缝 `sidebarRightTabs.register('dswf-overview')`；layout "sidebar.right.pane.tab" ↔ 手册 body 键。唯一非空锚完全吻合。 |
| 手册内部一致性 | 30/30 | 6 个条目无重复/冲突定义（无同页异路由、无同操作多入口冲突）。 |

扣分：
- **-24**（完备性）：step-1~4 frontmatter `page: ""` / `route: ""` / `layout: ""` 且 `last_anchor_sync: ""`。机械规则为 -10/字段（4 文件理论 -40）；酌情减免的依据：字段结构在场、每份合约带 N/A 裁决注记、这四步确无 web 交互面。但 step-1 Side-effect 明写"概览即时见 blocked"——写路径步的可观测面就是概览 tab，锚点留空与该声明自相矛盾。改进：为 step-1~4 填可观测面锚（page=dswf-overview，注明 observable-face），或将"工具面步骤无锚"固化为显式约定（如 `page: null` + anchor_note），消除空串歧义。

### Missing Anchor Fields

| Contract | Surface | Missing Field | Current Value | Handbook Entry |
|---|---|---|---|---|
| step-1-submit-blocked.md | web | page / route / layout | `""` | dswf-overview（可观测面候选） |
| step-2-create-fix-task.md | web | page / route / layout | `""` | dswf-overview（可观测面候选） |
| step-3-execute-fix-task.md | web | page / route / layout | `""` | dswf-overview（可观测面候选） |
| step-4-auto-restore-source.md | web | page / route / layout | `""` | dswf-overview（可观测面候选） |
| step-5-views-reflect-fix-chain.md | web | —（齐备） | dswf-overview 全填 | 匹配 |

### Handbook Conflicts

| Check | Result |
|---|---|
| 同页不同路由/导航冲突 | 无 |
| 重复/矛盾条目定义 | 无 |

## Phase 3 — Blindspot Hunt

1. **[blindspot] 列表/泳道断言未钉死** — step-5 Input "开发者查看概览任务列表 / DAG / 泳道"，但 Output 只钉了 DAG（"DAG 视图呈现源→fix 依赖边"）；列表视图应断言什么（源任务状态 tag、七态 chips 计数、卡片 sub-row 前置数——M2_STATUS_CHIPS_ZERO_DISABLED / M2_THREE_VIEWS 均有现成事实）与泳道视图应断言什么（源任务落入哪条泳道）完全未指定。测试生成器无法从"fix 链关系…即见"产出确定性断言。须为三视图分别钉可观测断言。
2. **[blindspot] 无 TaskRef 未命中边界** — 全链无 ERR_TASK_NOT_FOUND 形态 Outcome：step-2 Input "executor 调 addTask --block-source 创建修复任务（sourceTask = 任务 X 的 TaskRef…）"——sourceTask 指向不存在/已删任务的错误路径未测（错误码表在场：ERR_TASK_NOT_FOUND 404）。建议补推断 Outcome。
3. **[blindspot] 环境性副作用混入系统 State** — step-3 State "git 提交产生；features 相位重算"——git 提交属执行器技能行为，不属核心受测系统，与相位重算并置会诱导测试断言越界。应标注为环境前提或移出 State。
4. **[blindspot] 事件刷新语义二义** — step-5 Output 只钉"写入返回后单次重取即见"，State 又称"事件订阅 + 交互重取"——视图究竟无操作自动更新（事件链，500ms 界）还是需交互重取，两可。e2e 断言口径（等待策略）因此不确定。应钉死：事件到达后无交互即见，或明示以重取为断言口径。

## Score Summary

| Dimension | Score | Threshold |
|---|---|---|
| Completeness | 147/150 | 90 ✓ |
| Semantic Purity | 180/200 | 120 ✓ |
| Precondition Exclusivity | 130/150 | 90 ✓ |
| Fact Alignment | 124/150 | 90 ✓ |
| Surface Fitness | 82/100 | 60 ✓ |
| Internal Consistency | 146/150 | 90 ✓ |
| Anchor Integrity | 76/100 | 60 ✓ |
| Fixture Specification | 72/100 | 60 ✓ |
| **Total** | **957/1100** | 935 ✓ **PASS** |

### 8. Fixture Specification — 72/100 (min 60)

| Criterion | Score | Notes |
|---|---|---|
| 实体完备（veto 项） | 30/40 | 见裁决说明。 |
| 关系与约束覆盖 | 22/35 | 见扣分。 |
| 最低数据量 | 20/25 | 见扣分。 |

**veto 裁决说明**：实体类型 Project/Feature/Task/TaskEdge/TaskRecord 均与 tech-design 域模型（projects 中央表 + features/tasks/task_edges/task_records 每工作区表）语义吻合。steps 1-4 的 State 写 task_records 行（新建目标而非前置数据），按"测后断言创建"用途不需预置——不触发 veto；但 **step-1 success 前置明文"审计记录链在场"却在 fixture_spec.entities 中无 TaskRecord 声明**（step-5 反而正确声明了 TaskRecord min_count 3），前置引用与声明脱节，-10。若严格按"Preconditions 中引用的实体类型缺席即 veto"的字面执行此处可判 0 分，因引用为自然语言短语且实体为写入目标，裁定为不触发、从宽扣分。

扣分：
- **-13**（关系覆盖）：① step-2 success 内联 fixture 仅有 Project + Task(blocked)，**缺 Feature 实体**——addTask 需 featureSlug 归属（tech-design：slug 归属校验必须命中 feature），无 Feature 则任务无处安放；与同文件底部规范块（含 Feature）自相矛盾。② Task 的父关系在不同合约/Outcome 间漂移：step-1/2(底)/5 用 `belongs_to → Feature`，step-2(环/深/重复)、step-3、step-4 用 `has_many → Project`——真 FK 是 feature_id，应统一。③ 伪字段名 `formsPath`、`sourceChainDepth` 非 schema 字段，混入 field_constraints 造成语义不确定。
- **-5**（数据量）：step-2 底部"## Fixture Specification"声明 Task min_count 1，但同合约 chain-depth-exceeded 需 6、cycle/duplicate 需 2——底部规范块与内联 per-Outcome fixture 漂移，若测试生成以底部块为准将不可行。

## 修复优先级（供 reviser）

1. step-5 拆分/钉死终态 + 三视图分别断言（Completeness/Exclusivity/blindspot 1）。
2. step-1~4 锚点：填可观测面锚或固化 null 约定（Anchor Integrity -24）。
3. 清除响应体字面量与索引名/SVG 实现细节（Semantic Purity -20）。
4. `restored` 字段溯源或删除；git 提交移出 State（Fact Alignment）。
5. step-2 补"无既有同型 fix"正向前置；统一 Task 父关系；内联 fixture 补 Feature（Exclusivity/Fixture）。
6. step-2 明示 blocked→blocked 幂等重置 + 审计行计数，消除 step-5 fixture 的"或按实际路径"对冲（Internal Consistency）。
