# Contract Eval Report — task-board-browsing / iteration 2

- **Rubric**: `skills/eval/rubrics/contract.md`(1100 pts,8 维,target 935,逐维阈值)
- **Evaluated documents**: `docs/features/dsh-forge-m2/testing/task-board-browsing/contracts/step-{1..5}-*.md`(5 份,共 9 个 Outcome;iteration 1 后已修订)
- **Cross-reference inputs**: journey.md(同目录)/ design/page-map.md / design/er-diagram.md / .forge/fact-table.json / gen-journeys rules/surface-web.md / docs/business-rules/{task-operations,coexistence,privacy,resilience}.md
- **Iteration**: 2(上一轮报告:eval/iteration-1.md,963/1100,Fixture Specification 触发 entity-completeness veto 判 FAIL)
- **Scorer stance**: Senior QA adversarial;每一条扣分附文档原文引用;只按页面内容评分;不重新审理已解决项,声称解决但未解决者按 Internal Consistency 追加扣分

## Verdict

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 150/150 | 90 | ✓ |
| 2. Semantic Purity | 196/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 150/150 | 90 | ✓ |
| 4. Fact Alignment | 150/150 | 90 | ✓ |
| 5. Surface Fitness | 100/100 | 60 | ✓ |
| 6. Internal Consistency | 150/150 | 90 | ✓ |
| 7. Anchor Integrity | 100/100 | 60 | ✓ |
| 8. Fixture Specification | 100/100 | 60 | ✓ |
| **Total** | **1046/1100** | 935 | ✓ |

**Overall: PASS** — 总分 1046 ≥ 935 且全部 8 维高于阈值。iteration 1 的 9 项攻击全部核实为真实修复(无一「声称已修但未修」);唯一遗留扣分为 Semantic Purity c2 的测试生命周期括注(该点在上轮已扣分但未列入攻击清单,本轮文字原样保留,按同类口径续扣)。

---

## Phase 1 — Reasoning Audit(评分前独立判断)

### 1. 步骤/结果映射复核(与 journey.md 对照)

- Step 1 → 4 Outcomes(success / read-error / empty-state / loading-state)= 覆盖 Step 1、1b、1c、1d ✓
- Step 2 → 1 Outcome(journey 无边路)✓
- Step 3 → 2 Outcomes(success / no-match-empty)= 覆盖 Step 3、3b ✓
- Step 4 → 1 Outcome(journey 无边路)✓
- Step 5 → 2 Outcomes(success / single-task-error)= 覆盖 Step 5、5b ✓

无遗漏步骤、无虚构步骤;inferred 注释 3 处与 journey 逐字一致。独立复核本轮全部行为主张(7 态、branch 可空、TaskDetail 组成、detail.links.empty 文案、sync idle、视图态不持久化)与 FT-032/033/052/055/056、page-map、journey 逐一吻合,未发现幻觉。

### 2. iteration-1 攻击项修复核验(9/9 已解决)

| # | 上轮攻击 | 修复证据(修订版原文) | 判定 |
|---|---|---|---|
| 1 | SessionLink 未入 fixture_spec(veto) | step-5 success `- entity_type: "SessionLink" min_count: 0 ... parent_entity: "Task"` + state_requirement「所选任务挂接历史为空:session_links 无该任务的行——挂接索引为工作台自有 SoT、不可从 forge 文件推导,fixture 须显式钉零」 | 已解决 |
| 2 | step-5 TaskRecord min_count 1 与「各至少一笔」矛盾 | `min_count: 2`(Outcome 内与文末并集均改为 2) | 已解决 |
| 3 | step-3 缺状态多样性约束 | `- field: "status" value: "至少 2 个状态并存(7 态词表,FT-033)——状态筛选腿的前提"`(上轮次要项「与无记录任务」亦已由 step-1 source 约束 `null 与非 null 并存` 覆盖) | 已解决 |
| 4 | Output 值内嵌校验通道 | step-2 Output 现为 `任务集合与 forge 数据一致`(通道移入 state_requirements `跨面断言通道:...测试进程直读 fixture forge 文件`);step-1 的 `(校验通道见 Preconditions)` 已删除 | 已解决 |
| 5 | 全部 5 份零 fact_id 引用 | FT-056(step-1 State)、FT-033(step-2 Output、step-3)、FT-032(step-2 Output、step-4 State)、FT-055(step-5 Output/State)、FT-052(step-5 Output)——逐条与 fact-table.json 核对全部准确 | 已解决 |
| 6 | State 值用 DTO 类型名 | 改为 `任务看板快照载入`、`任务详情载入(摘要 + 描述原文 + ...)` | 已解决 |
| 7 | no-match 触发示例不可选 | `保证可选配方:...选取 fixture 内真实存在的 feature,交叉该 feature 任务集中不存在的状态——如仅含 pending 任务的 feature × 状态筛选选 completed;两选项均可选而交集为空` | 已解决 |
| 8 | 排序键/方向未定义 | step-3 Output 显式声明 `集合等价断言:...排序键/方向在设计词表定约前不作全序断言,仅断言排序操作不改变任务集合` | 已解决 |
| 9 | `field: "taskCount"` 非设计字段 | 改为 Task 实体缺席:`零任务以 Task 实体缺席表达(min_count 0):projects 表无任务计数字段,不虚构字段` | 已解决 |

上轮盲区:#1(排序)已解决;#4(taskCount)已解决;#5(条件式 Output)已随 veto 修复一并解决(step-5 Output 现为确定性断言 `挂接历史区显示空态说明「该任务尚未挂接会话」`,前置钉零裁决分支);#2(键盘不变量死文本)、#3(step-4 负向断言)未处理——二者本就在 rubric 之外,续列本轮盲区,不计分。

### 3. 预判锚点

(a) step-5 三层闭环:前置「该任务无挂接历史」/ fixture SessionLink min 0 + 钉零 / Output 确定性空态断言——三层互洽,需验证不引入新矛盾;(b) 文末「fixture 实体并集」段与逐 Outcome 明细的口径关系(并集取 max 还是求和,empty-state 另备项目是否使 Project 并集应为 2);(c) 新增 FT 引用是否全部准确;(d) 校验通道移入 state_requirements 后是否还有残留混入行为维度。

---

## Phase 2 — 逐维评分(verification stance)

### 1. Completeness — 150/150

- **四维非空(50/50)**:9 个 Outcome 的 Preconditions/Input/Output/State 全部非空,Side-effect 全部显式(`"none(只读浏览)"`、`"none(失败面收敛于被读对象)"` 等)。无缺失维度。
- **Journey Invariants(50/50)**:5 份文件均有 `## Journey Invariants`,各 4 条,与 journey.md 逐字一致。
- **派生场景覆盖(50/50)**:Web 强制派生(validation-error + session-expired)以显式映射注释处理并保留:step-1 `<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口/无服务端会话模型)...映射为 UF2 error(读取失败)态 = 本边 -->`;step-3 `<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面;唯一输入面 = 筛选器组合,按 UF2 校验规则映射为明确空态(非错误)= 本边 -->`。另覆盖 loading-state、empty-state、read-error、single-task-error,超出最低要求。

### 2. Semantic Purity — 196/200

- **c1 自然语言、无 code/regex(80/80)**:全文无 regex/CSS 选择器/XPath/框架断言。上轮 4 处「校验通道」Output 内嵌已全部清除;排序确定性声明(`集合等价断言...`)属期望语义界定(定义「一致」= 集合等价而非全序),系上轮盲区 1 的指定修复形态,不计违规;`首屏 2 秒内可交互(计时口径 = 500 任务 fixture 腿:进入任务页到依赖树 500 节点首屏可交互)` 为期望值的量测口径界定(去掉则 2 秒主张不可判定),中位数/预热协议已正确留在 state_requirements。
- **c2 Preconditions 为声明式状态(56/60,−4)**:主体声明式,但 Preconditions 值串内仍混入测试生命周期/Setup 指令括注(上轮已扣分项,未列入攻击清单故未修,按同类口径续扣):
  - step-1:`(一次性 fixture:临时目录 + 隔离 userData、测试后清理)`
  - step-1 read-error:`(错误腿供给随 fixture 清理)`
  - step-1 empty-state:`(Setup 另备零任务 fixture 项目)`
  - step-2:`(Setup 预置:真实 git worktree + 执行痕迹写入,生成器方言恒不虚构 branch/worktree 字段)`
  - step-4:`(Setup 预置:真实 git worktree + 执行痕迹写入 + 执行分支名)`;step-5:`(Setup 预置:来源 = 会话/终端各至少 1)`

  「测试后清理」「Setup 预置」属测试编排指令,应下沉到 fixture_spec/state_requirements(本轮已为多数内容建立了正确居所,括注仅剩冗余回声)。−4(同类缺陷,按类计)。
- **c3 无实现耦合(60/60)**:上轮 DTO 类型名(TaskBoardData/TaskDetail)已移除;无内部函数调用、DB 查询、端点路径、文件系统路径。`forge task list 输出一致` 为数据一致性 oracle 引用(承自 journey/SC1 原文),非内部实现耦合;`worktree/branch 字段如实投影自快照(FT-032...)` 为数据级行为描述。

### 3. Precondition Exclusivity — 150/150

- **c1 各 Outcome 前置互斥(60/60)**:step-1 四 Outcome 精确映射可观测看板态四象限(可读且有任务 / 读取失败 / 可读且零任务 / 未就绪);step-3 有匹配 vs `当前筛选条件组合下无匹配任务`;step-5 success(数据可读且钉零挂接)vs single-task-error(`所选任务的单任务数据读取异常`)。无共享或语义等价前置;step-5 新增「且该任务无挂接历史」进一步锐化互斥面。
- **c2 前置足以唯一定位 Outcome(50/50)**:上轮 no-match 示例不可选问题已修复(真实存在 feature × 该 feature 缺失状态,两选项均可选而交集为空);single-task-error 的 Task `min_count: 2` 与「其余任务不受影响」断言匹配。
- **c3 边界 Outcome 显式触发条件(40/40)**:read-error(`fixture 副本上注入文件损坏/权限异常`)、empty(`没有任何任务数据`)、loading(`数据尚未就绪`)、no-match(`各筛选维度交叉后结果为空` + 可选配方)、single-task-error(`如该任务记录文件损坏;fixture 副本注入`)全部显式。

### 4. Fact Alignment — 150/150

- **c1 事实主张可溯源或标 UNKNOWN(60/60)**:上轮 4 类未溯源主张全部补齐且逐条核对准确:`sync 状态 idle(FT-056)`(= SyncStatusPayload idle);`(7 态,FT-033)`(= status CHECK 词表);`branch 可空、不虚构 forge 未写的字段,FT-032` / `FT-032:worktree 布尔、branch 可空执行分支`(= branch nullable/worktree boolean);`依赖链(上游 blocker 传递链,FT-055)` 与 `组成见 FT-055`(= TaskDetail composition);`「该任务尚未挂接会话」(FT-052 detail.links.empty)`(与 fact value 逐字一致)。其余行为主张均溯源至声明来源 journey.md(frontmatter `sources`)或 handbook(`任务计数随筛选更新` = page-map Query Parameters 原文;`视图切换为会话期内存态(不持久化)` 与 page-map 口径一致)。
- **c2 inferred 主张带规则依据 + source: inferred(50/50)**:step-1 read-error(session-expired 映射注释 + source: inferred + UF2 error 语义与 SoT 纪律推理)、step-3 no-match(validation-error 映射注释 + source: inferred + 视图态对称推理)、step-5 single-task-error(source: inferred + Step 1b 原子性单任务粒度推广)三处成对完整;session-expired 映射理由与 FT-011(dsh-app:// 无监听端口)吻合。
- **c3 无未分类幻觉(40/40)**:全部主张对照 FT-032/033/035/052/055/056、page-map、er-diagram、journey、business-rules(人侧只读 BIZ-task-ops-001、SoT 纪律)核验通过,未发现幻觉或错引。

### 5. Surface Fitness — 100/100

- **强制派生 Outcome(40/40)**:validation-error/session-expired 均以映射 + 推理注释显式处理(引文见 Completeness)。
- **Web 语言(35/35)**:交互(`用户点击该任务卡片/节点`、`用户切换「状态分组」视图...segmented 三视图控件`)、页面元素(`卡片角标`、`详情面板`、`骨架/进度`)、异步(`loading 态`、`重试入口`)。维度值无 DOM 选择器、无框架断言;`aria-label` 仅出现在 invariants 的 surface-web 可达性词表内(合规)。
- **TUI 超时项(25/25)**:非 TUI surface,满分。

### 6. Internal Consistency — 150/150

- **不变量在每份 Contract 成立(60/60)**:9 个 Outcome Side-effect 全为 none(只读),无写入口;「不写入注册表/挂接索引等工作台自有事实数据」与 step-5 仅读取挂接历史一致;DF005 豁免条款与 step-2/3 Side-effect 注(`视图态本地记忆属 DF005 视图状态`)同口径;7 态一致主张贯穿且 FT-033 溯源。
- **跨 Contract 状态引用一致(50/50)**:step-2/3 前置 `任务看板已加载`、step-4/5 前置 `看板正常加载` 均可由 step-1 State `任务看板快照载入` 达成;step-5 success「该任务无挂接历史」在全链只读(零 recordSessionLink)前提下可达,与 journey 不变量无矛盾。无悬空引用。
- **前置与前步 State 一致(40/40)**:全链只读、状态单调。step-1 success 提供的记录供给(会话/终端各 ≥1)满足 step-5 前置。
- **上轮攻击项「声称已修但未修」排查**:9/9 均有对应修订文本,无一虚假修复,不追加扣分。

### 7. Anchor Integrity — 100/100

- **锚点字段完整(40/40)**:5 份 frontmatter 均含 `anchors.web.page`(本旅程仅触达 workbench/tasks 一个页面,handbook 其余页面属其他旅程)。
- **锚点值与 handbook 一致(30/30)**:`page: "workbench/tasks"` ×5 与 page-map View Key 逐字一致;`route: ""` 为 FT-053 视图键寻址既定设计,非缺陷;`requires_auth: false` = handbook `Auth: none`;layout 串均可在 page-map 找到同源定义(`TaskDagView...默认视图`、`BoardToolbar(筛选/排序/计数)`、`TaskDetailPanel(描述/依赖链/执行记录/挂接历史)` 与 Page Sections 行逐字对应)。
- **handbook 内部一致(30/30)**:page-map 无重复视图键、无路由冲突(全视图键寻址),与 FT-053 一致。

### 8. Fixture Specification — 100/100(veto 解除)

- **实体完整性(40/40,veto 未触发)**:逐份核验 Preconditions/Input/State 引用的实体类型均入 `fixture_spec.entities`:
  - step-1/2/3/4:Project/Task(+TaskRecord 于 step-1)全覆盖;
  - step-5(上轮 veto 点):success 引用 Task/TaskRecord/SessionLink,三者齐备——SessionLink 以 `min_count: 0` + state_requirement 钉零(`session_links 无该任务的行...隔离 userData、零挂接写入足迹`),使空态断言成为确定期望;single-task-error 引用 Project/Task(2,目标 + 旁观者),其示例触发词「该任务记录文件」对应的 TaskRecord 由文末并集段(`TaskRecord min_count: 2`)覆盖。
  - 甄别口径(承上轮,复核无误):sync_state/task_snapshot 为派生缓存(er-diagram「可整体重建,事实源 = forge 文件」),由系统自动物化,不入 fixture 属正确取舍;app_state 单激活指针为「已注册并激活」动作的产物且所有 Outcome 同口径,无 Output 依其内容分支,不需 fixture 腿。
  - `SessionLink ... parent_entity: "Task"`:ER 层 FK 指向 projects,但域关联按任务(task_key,UNIQUE(project_id, task_key, session_id),FT-035「per-task link history」)成立,符合本测试语义(按任务钉零),判定正确。
- **关系与约束覆盖(35/35)**:step-1 blockers(链/菱形/悬空)、source(null 与非 null 并存 = 无记录/带记录)、TaskRecord source(会话/终端各 ≥1)、Project docLocationType;step-2 branch(非空与空并存);step-3 featureSlug ≥2 / status ≥2(上轮缺失项已补)/ worktree true|false 并存;step-4 worktree true + branch 非空;step-5 SessionLink 钉零。多实体关系(belongs_to + parent_entity)全部声明。
- **min_count 充分性(25/25)**:step-1 Task 10(≥10 要求)且 500 任务计时腿在 state_requirements 单独声明供给(`同一生成器 500 任务/50 feature 固定种子 preset`);step-5 TaskRecord 2(=「各至少一笔」下限,上轮矛盾已修);single-task-error Task 2(「其余任务不受影响」需旁观者);no-match Task 10 配合真实 feature × 缺失状态配方可行;empty-state Task 0 为零钉表达本身。

  备注(不计分):文末「fixture 实体并集」段(如 step-1 Project min_count 1)在「同刻全腿共存」读法下低于实际所需(主 fixture 项目 + 另备零任务项目 = 2),但该段自注 `逐 Outcome 明细见各 Preconditions 内 fixture_spec` 明示以逐 Outcome 规格为准,且「另备零任务 fixture 项目」「错误腿供给随 fixture 清理」等生命周期信息在 Preconditions 文本在页,逐 Outcome 口径下各腿均可行,不构成场景不可行。

### 跨维一致性检查

FT 引用(Fact Alignment)与 fixture 约束(Fixture)、Output 断言(Completeness/Semantic)、layout 串(Anchor)四层同源:如 7 态在 step-2 Output、step-3 fixture 约束、invariants 三处以同一 FT-033 口径出现;step-5 的前置钉零 / SessionLink min 0 / Output 确定性空态三层闭环无矛盾;DF005 豁免在 invariants 与 step-2/3 Side-effect 注同口径。未发现跨维矛盾。

---

## Phase 3 — Blindspot Hunt(rubric 之外)

1. **[blindspot] 键盘可达性不变量仍是死文本(上轮盲区 2,未修)**。每份文件携带 `可达性:看板交互件(视图切换/筛选/排序/任务卡片/详情开关)可经键盘到达与操作`,但全部 Input 为点击式(`用户点击该任务卡片/节点`),无任何 Outcome 断言键盘操作或可读名称——不变量被复制而从未被执行。rubric 只罚「违反」不罚「未验证」。建议:至少在一个 Outcome 的 Input/Output 中加入键盘操作腿(如「经键盘聚焦并展开任务详情」)。
2. **[blindspot] step-4 负向视觉断言缺失(上轮盲区 3,未修)**。`worktree 标识可见(卡片角标);任务详情内标识可见` ——worktree-less 任务在树/分组视图卡片上「角标不出现」无处断言(仅 step-2 列表视图有空占位负例)。典型漏测模式:角标渲染条件过宽(恒显)不会被本组 Contract 抓住。
3. **[blindspot] step-4 详情面板挂接历史区未钉状态(新)**。同上引用打开的 TaskDetailPanel 按 FT-055 组成必含挂接历史区,但 step-4 fixture 无 SessionLink 声明、Preconditions 亦未复述隔离 userData(step-1 的隔离口径未显式传递到 step-4),该区渲染内容(历史列表 vs 空态文案)对执行者不确定——虽无断言依其分支(不触发 veto),截图对比/视觉回归会抖动。
4. **[blindspot] loading-state 窗口可达性未工程化(新)**。`任务看板数据尚未就绪(首次加载大任务集;切换项目同口径)` + Task `min_count: 10` ——本地 10 任务 fixture 的加载窗口可能毫秒级,无可控延迟/节流注入声明,该 Outcome 的观察窗口在实践中难以稳定命中(易 flaky 或恒跳过)。
5. **[blindspot] 计时腿与功能腿共存于同一 Outcome(新,轻)**。step-1 success 同时断言 10 任务功能口径与 `首屏 2 秒内可交互(计时口径 = 500 任务 fixture 腿...)`,Outcome 横跨两种 fixture 规模(实体 min_count 10 vs state_requirement 500 preset);信息在页但执行者需自行拆腿,建议拆为独立计时 Outcome。
6. **[blindspot] read-error 内嵌恢复子流程需带外排障(承自 journey,轻)**。`排除读取障碍后点击重试,看板恢复渲染且与 forge 数据一致` ——「排除障碍」是测试中途的带外 fixture 变更,Outcome 横跨错误态 + 修复态;契约忠实于 journey 1b 原文,根治需上游 journey 拆分,此处仅记录。

---

## Attacks(残留问题,按优先级序;本轮已 PASS,供后续迭代/上游参考)

1. **[Semantic Purity]** Preconditions 值串内测试生命周期/Setup 括注残留 —— `(一次性 fixture:临时目录 + 隔离 userData、测试后清理)`、`(Setup 预置:真实 git worktree + 执行痕迹写入...)`、`(错误腿供给随 fixture 清理)` —— 内容已有 fixture_spec/state_requirements 正确居所,括注应删除或改为纯状态描述(如「承载 = 一次性隔离 fixture」)。
2. **[blindspot]** 键盘可达性不变量无执行腿 —— `可经键盘到达与操作` vs 全部点击式 Input —— 增加键盘操作 Outcome 或在既有 Outcome 加键盘腿。
3. **[blindspot]** step-4 缺 worktree-less 角标负向断言 —— `worktree 标识可见(卡片角标)` —— 增加负例(无执行痕迹任务不显示角标)。
4. **[blindspot]** step-4 详情面板挂接历史区未钉 —— `任务详情内标识可见` —— fixture 补 SessionLink 钉零或 Preconditions 复述隔离 userData。
5. **[blindspot]** loading 窗口可达性未工程化 —— `数据未就绪窗口期内观察` 无延迟注入声明 —— fixture/state_requirement 补可控延迟或明确以大 fixture(500 腿)承载本 Outcome。

---

## 结论

iteration 1 的全部 9 项攻击在本轮修订中得到真实、可核验的修复:veto 根因(SessionLink)以「实体声明 min 0 + state_requirement 钉零 + Output 确定性断言」三层闭环解除;fact_id 溯源补齐且逐条准确;排序语义、no-match 可选配方、状态多样性约束、min_count 矛盾、DTO 词表、虚构字段全部修正。唯一遗留扣分为 Semantic Purity c2(−4,测试编排括注,上轮同类口径续扣)。残留问题均为 rubric 之外的盲区级改进项。**总分 1046/1100 ≥ 935,8 维全部过阈 → PASS。**
