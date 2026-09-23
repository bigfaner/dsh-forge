# Contract Eval Report — task-board-browsing / iteration 1

- **Rubric**: `skills/eval/rubrics/contract.md`(1100 pts,8 维,target 935,逐维阈值)
- **Evaluated documents**:`docs/features/dsh-forge-m2/testing/task-board-browsing/contracts/step-{1..5}-*.md`(5 份,共 9 个 Outcome)
- **Cross-reference inputs**:journey.md(同目录)/ design/page-map.md / .forge/fact-table.json / design/er-diagram.md / design/tech-design.md / gen-journeys rules/surface-web.md / docs/business-rules/{task-operations,coexistence,privacy,resilience}.md
- **Iteration**: 1(无上一轮报告)
- **Scorer stance**: Senior QA adversarial;每一条扣分附文档原文引用;只按页面内容评分

## Verdict

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 150/150 | 90 | ✓ |
| 2. Semantic Purity | 183/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 145/150 | 90 | ✓ |
| 4. Fact Alignment | 135/150 | 90 | ✓ |
| 5. Surface Fitness | 100/100 | 60 | ✓ |
| 6. Internal Consistency | 150/150 | 90 | ✓ |
| 7. Anchor Integrity | 100/100 | 60 | ✓ |
| 8. Fixture Specification | **0/100(veto)** | 60 | ✗ |
| **Total** | **963/1100** | 935 | ✓(总分) |

**Overall: FAIL** — 总分 963 ≥ 935,但 Fixture Specification 触发 entity-completeness veto 得 0 分,低于 60 阈值。失败面单一且可修(见 Attack #1)。

---

## Phase 1 — Reasoning Audit(评分前独立判断)

Journey 结构:5 个 happy-path step + 5 个 edge case(1b 读取失败、1c 空态、1d loading、3b 筛选无结果、5b 单任务异常)。逐条对照:

- Step 1 → 4 Outcomes(success / read-error / empty-state / loading-state)= 覆盖 1、1b、1c、1d ✓
- Step 2 → 1 Outcome(journey 无边路)✓
- Step 3 → 2 Outcomes(success / no-match-empty)= 覆盖 3、3b ✓
- Step 4 → 1 Outcome(journey 无边路)✓
- Step 5 → 2 Outcomes(success / single-task-error)= 覆盖 5、5b ✓

步骤/结果映射完整,无遗漏、无虚构步骤。inferred 注释(3 处)与 journey 的注释逐字一致。独立复核事实主张(7 态、TaskDetail 组成、空态文案、视图键寻址)与 FT-033/FT-055/FT-052/FT-053/FT-056 及 page-map 全部吻合,未发现幻觉。

预判锚点:(a) fixture_spec 实体词表 = Project/Task/TaskRecord,而 ER 实体还有 session_links / sync_state / feature_snapshot 等 —— 需要甄别哪些是「派生缓存(可不入 fixture)」哪些是「工作台自有 SoT(必须声明)」;(b) 5 份文件零 FT-xxx 引用;(c) 500 任务计时腿与 10 任务功能腿共存于 Step 1 success 一个 Outcome。

---

## Phase 2 — 逐维评分(verification stance)

### 1. Completeness — 150/150

- **四维非空(50/50)**:9 个 Outcome 的 Preconditions/Input/Output/State 全部非-empty,且全部显式给出 Side-effect(如 step-1 `"Side-effect: \"none(只读浏览)\""`、step-5 `"none(失败面收敛于被读对象)"`)。无任何缺失维度。
- **Journey Invariants(50/50)**:5 份文件均有 `## Journey Invariants`,各 4 条,与 journey.md 的 4 条不变量逐字一致。
- **派生场景覆盖(50/50)**:Web 强制派生(validation-error + session-expired)均以显式映射注释处理:step-1 `<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用(继承 M1 无端口/无服务端会话模型)...映射为 UF2 error(读取失败)态 -->`;step-3 `<!-- surface-web required_outcomes 映射:validation-error → ...按 UF2 校验规则映射为明确空态(非错误)-->`。另覆盖 loading-state、empty-state、read-error、single-task-error,超出最低要求。

### 2. Semantic Purity — 183/200

- **c1 自然语言、无 code/regex(72/80,−8)**:全文无 regex/CSS 选择器/XPath/框架断言。但 **Output 维度值内嵌「如何校验」的通道说明**,违背「dimension values describe *what* the system produces, not *how* to verify it」:
  - step-2 Output:`任务集合与 forge 数据一致(校验通道 = 测试进程直读 fixture forge 文件)`
  - step-3 Output:`筛选/排序结果与 forge 任务数据一致(校验通道 = 测试进程直读 fixture forge 文件)`
  - step-1 success/read-error Output:`(校验通道见 Preconditions)` ×2

  校验通道属于 fixture/state_requirements 层的测试基础设施声明,不应回灌进行为维度值。−8(同类缺陷 4 处,按类计)。
- **c2 Preconditions 为声明式状态(56/60,−4)**:主体是声明式(`任务看板已加载`、`注册激活的项目没有任何任务数据`),但 Preconditions 值串内混入测试生命周期/测量协议指令:step-1 success `(一次性 fixture:临时目录 + 隔离 userData、测试后清理)`;state_requirement `预热一次不计、连续 3 次取中位数(已落地 sc1 e2e 口径)`。−4。
- **c3 无实现耦合(55/60,−5)**:无内部函数调用/DB 查询/端点路径/文件系统路径。但 State 值使用设计接口 DTO 类型名:step-1 `任务看板快照(TaskBoardData)载入`;step-5 `TaskDetail 载入(summary + 描述原文 + 依赖链 + 执行记录 + 挂接历史)`。类型名属实现词表,应改为行为语言(「看板快照载入」即可)。−5。

### 3. Precondition Exclusivity — 145/150

- **c1 各 Outcome 前置互斥(60/60)**:Step 1 的 4 个 Outcome 精确映射 UF2 States 四象限(ready/error/empty/loading),按可观测 UI 状态选择,任意时刻恰一成立;step-5 success(数据可读)vs single-task-error(`所选任务的单任务数据读取异常`)以读取有效性区分;step-3 有匹配 vs 无匹配。无共享或语义等价前置。
- **c2 前置足以唯一定位 Outcome(45/50,−5)**:step-3 no-match-empty 的触发示例可能不可达:`筛选组合选取使匹配集为空(如不存在的 feature × 状态组合)` —— Web 筛选器的选项由数据填充,「不存在的 feature」在 UI 上大概率选不到;执行者需要一个保证可选的空组合配方(如 feature A × 该 feature 无某状态任务的交叉)。前置本身(匹配集为空)成立,扣示例不可执行性。−5。
- **c3 边界 Outcome 显式给出触发条件(40/40)**:read-error(`forge 任务数据读取失败——fixture 副本上注入文件损坏/权限异常`)、empty-state(`没有任何任务数据`)、loading(`数据尚未就绪`)、no-match(`无匹配任务`)、single-task-error(`该任务记录文件损坏`)。全部显式。

### 4. Fact Alignment — 135/150

- **c1 事实主张可溯源或标 UNKNOWN(45/60,−15)**:独立核验后**实质内容零错位**(见 c3),但 5 份文件**没有任何一处 FT-xxx fact_id 引用**,而大量主张是具体系统行为:
  - `展示状态与 forge 7 态一致`(= FT-033 词表,未引)
  - `无挂接历史时该区显示空态说明(该任务尚未挂接会话)`(= FT-052 `detail.links.empty`,未引)
  - `sync 状态 idle`(= FT-056 SyncStatusPayload,未引)
  - `列表视图含执行分支名列...空占位(不虚构 forge 未写的字段)`(= FT-032 `branch nullable`,未引)

  按「must be traceable to a specific fact_id」的字面要求,属可溯源但未溯源;按验证立场,审计者须自行重建溯源链。−15(形式缺口,非错位)。
- **c2 inferred 主张带规则依据 + source: inferred(50/50)**:step-1 read-error 与 step-3 no-match 均成对给出 required_outcomes 映射注释 + `source: inferred` 及推理依据;step-5 single-task-error 给 `<!-- source: inferred:「其余任务不受影响」= Step 1b 原子性的单任务粒度推广 -->`,其 Output 引 `UF3 error 行` 为依据(非 required_outcomes 强制项,系 journey 继承推断,处理得当)。session-expired 映射理由「无端口/无服务端会话模型」与 FT-011 吻合。
- **c3 无未分类幻觉(40/40)**:全部行为主张对照 FT-032/033/052/055/056/053、page-map、PRD UF2/UF3、journey 逐一核验通过,未发现幻觉或未分类主张。

### 5. Surface Fitness — 100/100

- **强制派生 Outcome(40/40)**:validation-error/session-expired 均以映射 + 推理注释显式处理(引文见 Completeness);映射理由与离线桌面现实(FT-011)一致。
- **Web 语言(35/35)**:交互(`用户点击该任务卡片/节点`)、页面元素(`卡片角标`/`segmented 三视图控件`/`详情面板`)、异步(`loading 态(骨架/进度)`/`重试入口`)。维度值无 DOM 选择器、无框架断言。invariants 中 `aria-label` 为 surface-web 可达性原则认可词表。
- **TUI 超时项(25/25)**:非 TUI surface,满分。

注:Output 中「测试进程直读 fixture forge 文件」属测试进程语言而非 Web 用户语言,已在 Semantic Purity c1 扣分,此处不重复计扣。

### 6. Internal Consistency — 150/150

- **不变量在每份 Contract 成立(60/60)**:人侧只读 —— 全部 9 个 Outcome Side-effect 为 none(含 `none(重试为只读重扫)`、`none(失败面收敛于被读对象)`),无任何写入口;无 forge 数据变更、无注册表/挂接索引写入(挂接历史仅读取);7 态一致主张贯穿。step-2 `视图切换为会话期内存态(不持久化)` 与 page-map Query Parameters 口径一致,且不违反 DF005 豁免条款(不变量只豁免、不强制持久化)。
- **跨 Contract 状态引用一致(50/50)**:step-2/3/4/5 前置 `任务看板已加载`/`看板正常加载` 均可由 step-1 State `任务看板快照(TaskBoardData)载入` 达成;step-5 single-task-error 的 `看板正常加载,但...` 与 step-1 success 态无矛盾。无悬空引用。
- **前置与前步 State 变化一致(40/40)**:全链只读、状态单调,无可达性矛盾。

### 7. Anchor Integrity — 100/100

- **锚点字段完整(40/40)**:5 份文件 frontmatter 均含 `anchors.web.page`(本旅程仅触达 workbench/tasks 一个页面,handbook 其余页面归属其他旅程)。
- **锚点值与 handbook 一致(30/30)**:`page: "workbench/tasks"` ×5 与 page-map View Key 逐字一致;`route: ""` 为本项目设计既定(FT-053 视图键寻址,非缺陷);`requires_auth: false` = handbook `Auth: none`;layout 串(`WorkbenchShell → TaskBoardPage → TaskDagView(默认视图)`、`BoardToolbar(筛选/排序/计数)`、`TaskDetailPanel(描述/依赖链/执行记录/挂接历史)`)均可在 page-map Layout/Page Sections 找到同源定义。
- **handbook 内部一致(30/30)**:page-map 无重复视图键、无路由冲突(全视图键寻址),与 FT-053 一致。

### 8. Fixture Specification — 0/100(**entity-completeness veto**)

- **实体完整性(0/40,触发 veto)**:step-5 的 State 与 Output 引用挂接历史(SessionLink 实体的数据面),但 `fixture_spec.entities` 仅声明 Project/Task/TaskRecord:
  - State:`TaskDetail 载入(summary + 描述原文 + 依赖链 + 执行记录 + 挂接历史)`
  - Output:`无挂接历史时该区显示空态说明(该任务尚未挂接会话)`

  关键甄别:session_links 是**工作台自有 SoT**(er-diagram:`projects ||--o{ session_links : "注册项目拥有挂接索引(SoT)"`;PRD UF3 数据源:`挂接历史 | list | 工作台自有状态(挂接索引)`),**不能从 forge 文件推导** —— 不同于 task_snapshot/sync_state(派生缓存,系统自动物化,不入 fixture 属正确取舍)。会话来源的执行记录也不隐含挂接行(记录在 forge 文件侧,挂接行仅由本应用 recordSessionLink 写入)。因此「该任务有无挂接历史」完全未声明,Output 的空态分支悬空,执行者无法判定该区应渲染历史列表还是空态文案。按 rubric「Score 0 if any entity type referenced in the Contract's Preconditions, Input, or State changes is missing from fixture_spec.entities」→ 实体完整性 0 分 → **整维 0 分(veto)**。

  修复路径(二选一):(a) success Outcome 增加 state_requirement 钉死「该任务无挂接历史(隔离 userData、零 recordSessionLink 足迹)」,使空态分支成为确定期望;(b) 增加 SessionLink 实体腿(min_count ≥1, belongs_to Task)并把 Output 拆出挂接历史非空断言。
- **关系与约束覆盖(名义 25/35,被 veto 归零;仍列给修订者)**:step-3 前置文本 `任务集含多 feature、多状态、含 worktree 痕迹与不含的任务`,但 fixture_spec 只约束 `featureSlug: 至少 2 个 feature` 与 `worktree: true 与 false 并存`,**状态多样性无 field_constraints**(状态是筛选三维度之一,全 pending fixture 会使状态筛选不可测)→ −10;另 step-1 前置文本 `与无记录任务` 在 fixture_spec 无对应约束(次要,并入本项)。
- **min_count 充分性(名义 17/25,被 veto 归零)**:step-5 success `TaskRecord min_count: 1` 与其自身约束 `会话与终端来源各至少一笔(fixture 内)` 矛盾 —— 各至少一笔 ⇒ ≥2。step-1 同口径声明的是 `min_count: 2`(正确),step-5 漏升。→ −8。

---

## Phase 3 — Blindspot Hunt(rubric 之外)

1. **[blindspot] 排序语义未定义,Outcome 不可判定**。step-3 Output:`筛选/排序结果与 forge 任务数据一致(校验通道 = 测试进程直读 fixture forge 文件)` —— 全文(含 journey/PRD)未给出排序键与方向(更新时间?ID?升降序?)。「与 forge 数据一致」只能验集合,不能验**顺序**;排序控件的正确性实际不可断言。Contract 是注入确定性的最后一层,应显式声明排序键/方向词表。
2. **[blindspot] 可达性不变量在 Contract 中是死文本**。每份文件都携带 `可达性:看板交互件(视图切换/筛选/排序/任务卡片/详情开关)可经键盘到达与操作`,但所有 Input 均为点击式(`用户点击该任务卡片/节点`),没有任何 Outcome 断言键盘可操作性或可读名称 —— 不变量被复制而从未被执行。rubric 只罚「违反」不罚「未验证」,属盲区。
3. **[blindspot] Step 4 仅正例覆盖**。step-4 Output:`worktree 标识可见(卡片角标);任务详情内标识可见` —— worktree-less 任务在树/分组视图的卡片上**角标不出现**这一负向断言无处覆盖(step-2 只覆盖列表视图列空占位 `无执行痕迹的任务显示空占位`)。负向视觉断言缺失是典型漏测模式。
4. **[blindspot] fixture 约束引用了设计不存在的字段名**。step-1 empty-state fixture:`field: "taskCount", value: 0` —— er-diagram 的 projects 表无此字段,零任务是 Task 实体缺席属性而非 Project 字段(对照:同文件其他约束用的 `docLocationType`、`blockers`、`source` 均为真实字段)。下游按字段名生成数据时会落空。
5. **[blindspot] 条件式 Output 破坏期望确定性(veto 的用户可见面)**。step-5 success Output:`无挂接历史时该区显示空态说明(该任务尚未挂接会话)` —— 期望结果写成条件分支而前置不裁决分支,单一 Outcome 内嵌两个合法期望,违反 Contract「给定前置 ⇒ 确定期望」的执行模型(与 Attack #1 同根,修复亦同)。

---

## Attacks(修订优先级序)

1. **[Fixture Specification/veto]** SessionLink(挂接历史)实体被 State/Output 引用却未入 fixture_spec —— `TaskDetail 载入(summary + 描述原文 + 依赖链 + 执行记录 + 挂接历史)` / `无挂接历史时该区显示空态说明` —— 必须声明挂接历史状态(state_requirement 钉零挂接,或增加 SessionLink 实体腿并拆分断言)。
2. **[Fixture Specification]** step-5 TaskRecord min_count 与约束矛盾 —— `min_count: 1` vs `会话与终端来源各至少一笔(fixture 内)` —— 升为 ≥2(对照 step-1 的正确写法 `min_count: 2`)。
3. **[Fixture Specification]** step-3 缺状态多样性约束 —— 前置文本 `任务集含多 feature、多状态、含 worktree 痕迹与不含的任务` 而 fixture_spec 仅有 featureSlug/worktree 约束 —— 补 status field_constraints(≥2 态并存)。
4. **[Semantic Purity]** Output 值内嵌校验通道说明 —— `任务集合与 forge 数据一致(校验通道 = 测试进程直读 fixture forge 文件)`(step-1/2/3 共 4 处)—— 通道声明只留在 fixture/state_requirements,Output 保持纯行为断言。
5. **[Fact Alignment]** 全部 5 份文件零 fact_id 引用 —— 如 `展示状态与 forge 7 态一致`(FT-033)、`该任务尚未挂接会话`(FT-052)、`sync 状态 idle`(FT-056)—— 为具体行为主张补 FT-xxx 溯源标注。
6. **[Semantic Purity]** State 值使用 DTO 类型名 —— `任务看板快照(TaskBoardData)载入`、`TaskDetail 载入(...)` —— 改为行为语言。
7. **[Precondition Exclusivity]** no-match 触发示例可能不可选 —— `(如不存在的 feature × 状态组合)` —— 换为保证可选的组合(某 feature × 该 feature 无某状态任务)。
8. **[blindspot]** 排序键/方向未定义(Attack 见盲区 1)—— 补排序语义或显式声明「排序断言仅集合级」。
9. **[blindspot]** `field: "taskCount"` 非设计字段(盲区 4)—— 改为 Task 缺席表达。

---

## 结论

文档在结构、互斥性、surface 适配、锚点与跨文档一致性上质量很高(7/8 维达或近满分),事实实质零错位;唯一但致命的失败面是 Fixture Specification 的实体完整性 veto —— 挂接历史(SessionLink,工作台自有 SoT)在 Step 5 被读取与分支断言,却完全未进 fixture 声明,导致该 Output 期望悬空。**总分 963/1100 ≥ 935,但 Fixture Specification 0 < 60 → FAIL,进入 iteration 2 修订。**
