# Contract Eval Report — plugin-management / iteration 1

- **Rubric**: `skills/eval/rubrics/contract.md`(1100 pts,8 维,target 935,逐维阈值)
- **Evaluated documents**:`docs/features/dsh-forge-m2/testing/plugin-management/contracts/step-{1..5}-*.md`(5 份,共 12 个 Outcome)
- **Cross-reference inputs**:journey.md(同目录)/ design/page-map.md / .forge/fact-table.json / gen-journeys rules/surface-web.md;代码现实核对:apps/desktop/resources/plugin-bundles.json、apps/desktop/src/main/workbench/ipc/plugins.ts、packages/plugins/forge-workbench/src/client/views/overview/PluginSection.tsx、docs/features/dsh-forge-m2/tasks/records/{3.gate,6.5-sc67-plugin-model-dual-form}.md;家族口径参照 sibling 契约(multi-project-management / dual-form-consistency / task-board-browsing 均带内联 FT-xxx 锚)
- **Iteration**: 1(无上一轮报告)
- **Scorer stance**: Senior QA adversarial;每一条扣分附文档原文引用;只按页面内容评分,事实主张逐条对照代码/事实表核验

## Verdict

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 150/150 | 90 | ✓ |
| 2. Semantic Purity | 172/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 140/150 | 90 | ✓ |
| 4. Fact Alignment | 105/150 | 90 | ✓ |
| 5. Surface Fitness | 95/100 | 60 | ✓ |
| 6. Internal Consistency | 137/150 | 90 | ✓ |
| 7. Anchor Integrity | 90/100 | 60 | ✓ |
| 8. Fixture Specification | **0/100(veto)** | 60 | ✗ |
| **Total** | **889/1100** | 935 | ✗ |

**Overall: FAIL** — 双重不达标:总分 889 < 935,且 Fixture Specification 触发 entity-completeness veto 得 0 分(0 < 60)。失败面有二:①Step 2 in-session-disable 对会话/挂接关系下判断而 fixture 仅声明 Plugin(veto);②fixture 基数模型「forge 核心插件恰一个」与现行产品清单(3 条全 mandatory:true)直接矛盾。

---

## Phase 1 — Reasoning Audit(评分前独立判断)

旅程结构:5 个 happy-path step + 7 个 edge(1b 必备禁用、1c 覆盖文件失效、2b 会话内在线禁用、3b 重复点击、3c 取消、4b 重启保持、5b 核心能力波及面)。逐条对照契约:Step 1 → 3 Outcomes(success / mandatory-no-disable / overlay-invalid),Step 2 → 2(success / in-session-disable),Step 3 → 4(success / double-click-guard / cancel-no-op / first-write-creates-overlay,首写腿为契约新增且带 inferred 注释),Step 4 → 2(success / restart-persistence),Step 5 → 2(success / core-capability-unaffected)。**步骤/结果映射完整无遗漏**,两条 Web 强制派生(validation-error / session-expired)以类比映射注释到场。

独立核验事实主张(对照代码 + 事实表):

- overlay-invalid 处置口径与 FT-050 / plugins.ts 头注**逐字吻合**(坏 JSON → `<name>.corrupt-<ts>` 隔离 + 空覆盖重建;塞必备名 → 内存剔除 + ERR_PLUGIN_RUNTIME_STATE,清单态获胜;SC6-2 e2e 已落地两型)✓
- 必备守卫 ERR_PLUGIN_MANDATORY、渲染面无禁用入口两层防护 = FT-049 + PluginSection.tsx(`mandatory rows render no write control`)✓
- 「覆盖文件缺失 = 空覆盖 = 全启用」「overlay 结构上仅容第三方名」= FT-048 ✓
- ERR_SINGLE_INSTANCE 环境性失败 = FT-006 ✓;视图键 `workbench/overview` = FT-053/page-map ✓

但发现两处**实质性矛盾**(评分前锚点,后流入对应维度):

- **(a) fixture 基数模型与现行产品清单矛盾**:step-1 field_constraints 断言 `"forge 核心插件恰一个 = true"`,而现行 `apps/desktop/resources/plugin-bundles.json` 为 **3 条全 `mandatory: true`**(@deepseek-ai/dsh-base、@deepseek-ai/dsh-web-app、@dsh-forge/plugin-forge-workbench);commit 9ed862c 已将 hello-world 移出产品清单,df85f59 将 forge-workbench 以 mandatory 装配;phase-3 gate record 明言「plugin-bundles.json 3 entries all mandatory:true (hello-world absent = pre-phase-3 9ed862c demo-off decision)」;6.5 e2e 记录「renderer IPC 直调 setPluginEnabled **三个必备名**逐一 reject ERR_PLUGIN_MANDATORY」。「恰一个」在真实装置下不可满足。
- **(b) Step 2 in-session-disable 的判断面超出 fixture 声明面**:前置/输出/状态三处对「活跃挂接会话」「会话本体」「挂接关系」下判断,fixture_spec.entities 仅声明 Plugin——对照家族口径(判断 link 态必须声明 SessionLink)疑似 veto。

另记录:(c) 全家族 5 份文件**零 FT-xxx 内联锚**(sibling 家族如 multi-project step-2/3 带 7-9 处/文件);(d) Output/State 维值内嵌对拍通道文本(与 multi-project iteration-1 同款缺陷);(e) 旅程前提「基座 hello-world」相对 9ed862c 后的清单已过时,契约照抄未复核。

---

## Phase 2 — 逐维评分(verification stance)

### 1. Completeness — 150/150

- **四维非空(50/50)**:12 个 Outcome 的 Preconditions/Input/Output/State 全部非空,且全部显式给出 Side-effect(如 step-1 `"none(打开只读)"`、step-2 success `"none(发起阶段零写入)"`)。无任何缺失维度。
- **Journey Invariants(50/50)**:5 份文件均有 `## Journey Invariants`,各 4 条,与 journey.md 逐字一致。
- **派生场景覆盖(50/50)**:Web 强制派生双项均以显式映射注释处理:step-1 `<!-- surface-web required_outcomes 映射:validation-error → 本旅程无表单输入面...非法请求类比 = 对必备插件发起禁用(越权启停请求),映射为必备行不渲染禁用入口... -->`;step-1 overlay-invalid `<!-- surface-web required_outcomes 映射:session-expired → ...通道失效类比 = 运行时启停状态通道失效(plugin-runtime.json 被篡改塞必备名/坏 JSON 解析失败),按 ERR_PLUGIN_RUNTIME_STATE 处置 = 本边 -->`,与项目既定映射口径(离线桌面类比通道失效)一致。另覆盖取消腿、重复点击腿、首写创建覆盖文件腿(新增,带 inferred 注释)、重启持久腿、核心能力波及腿——超出最低要求。12 个 Outcome 对 journey 12 条腿全覆盖,无虚构步骤。

### 2. Semantic Purity — 172/200

- **c1 自然语言、无 code/regex(64/80,−16)**:全文无 regex/CSS 选择器/XPath/框架断言。但 **Output/State 维值内嵌「如何校验」的对拍通道说明**,违背「dimension values describe *what* the system produces, not *how* to verify it」与家族口径(oracle 通道只应存在于 fixture_spec.state_requirements):
  - step-3 success Output:`仅该插件注入内容退出...forge 数据零损坏(hash 对拍)`
  - step-3 double-click-guard Output:`不产生中间损坏状态(零损坏不变量,hash 对拍)`
  - step-3 cancel-no-op State:`启停覆盖文件未被写入(文件面对拍:内容不变)`
  - step-3 first-write Output:`覆盖文件被创建,内容恰为只含该插件名的 disabled 集(文件面直读断言);产品清单字节不变(sha256 对拍)`
  - step-4 success Output:`数据完整(hash 对拍)`;step-5 success Output:`文件面断言经 Setup 跨面口径`;step-5 core-capability Output:`forge 数据零损坏(hash 对拍)`

  同类缺陷 8 处、跨 3 份文件(对照 sibling 家族先例 3 处计 −8,按类翻倍 −16)。讽刺的是 step-1/3/4/5 已把同口径**正确**写进 state_requirements(`跨面断言口径:...测试进程直读 fixture 文件...不以「没报错」为据`),证明本可以写对——Output 泄漏是纯冗余。
- **c2 Preconditions 为声明式状态(52/60,−8)**:主体声明式(`第三方插件处于启用状态`、`隔离 userData 内 plugin-runtime.json 尚不存在`),但混入过程性/执行假设内容:step-4 restart-persistence Preconditions `重启腿执行假设成立(等待进程退出 + 单实例锁释放后再启动,每次启动前单实例探测)` ——「单实例锁探测」按家族口径属 state_requirements(该文件 state_requirements 已有同款 `重启前无活跃 dsh-forge 实例(单实例锁释放...)`,Preconditions 内为重复泄漏);step-1 overlay-invalid `(fixture 预置后启动)` 亦为装置时序指令片段。
- **c3 无实现耦合(56/60,−4)**:错误码(ERR_PLUGIN_MANDATORY / ERR_PLUGIN_RUNTIME_STATE / ERR_SINGLE_INSTANCE)与产品文件名(plugin-runtime.json)在 State 中可保留(FT-031 使 code 成为一等契约;SoT 纪律为产品行为)。扣分点:step-4 restart-persistence Input `重启应用并打开插件管理区与工作台(e2e 驱动面:测试进程等待进程退出与单实例锁释放后重新启动)` —— Input 值内嵌测试驱动机制(e2e 驱动面语义),应移 state_requirements。

### 3. Precondition Exclusivity — 140/150

- **c1 各 Outcome 前置互斥(55/60,−5)**:step-1 三腿以覆盖文件有效性显式分区(`plugin-runtime.json 为合法状态(缺失或无违规条目;失效形态腿见 overlay-invalid)`);step-2 两腿显式互斥(`与常规场景互斥`);step-3 四腿以「已确认/执行中/已打开未确认/文件缺失」四态分区且互相引名(`覆盖文件尚不存在时的首次写文件腿见 first-write-creates-overlay`);step-4 两腿显式互斥(`与 success 的启用腿互斥`)。扣分:step-5 两腿前置可同时成立——success `启停操作序列已完成(至少经历一次禁用与启用)` 与 core-capability `第三方插件处于禁用状态(启停序列后)` 在「禁 A→启 A→禁 B」序列下同时为真(非等价但重叠),仅靠 Input 区分。
- **c2 前置足以唯一定位 Outcome(45/50,−5)**:step-5 success `至少经历一次禁用与启用` 未钉死回看时目标插件的终态(启用/停用皆可满足字面),使两腿前置在回看时刻共真,选择依赖 Input 而非前置。另注(不另扣):step-3 success 前置 `禁用二次确认对话框已确认` 与其 Input `确认禁用` 对同一事件双重描述,时序表述冗余(前置宜写「对话框打开待确认」)。
- **c3 边界 Outcome 显式给出触发条件(40/40)**:全部边界腿显式:overlay-invalid(`plugin-runtime.json 失效(①被篡改塞入必备名;②坏 JSON 解析失败)`两型)、double-click-guard(`一次启停操作正在执行(行处于操作中 transitioning 指示)`)、cancel-no-op(`禁用二次确认对话框已打开(Step 2 发起后)`)、first-write(`plugin-runtime.json 尚不存在(全新装置,空覆盖 = 全启用)`)、mandatory-no-disable(`插件管理区已展示必备(核心)插件`)。✓

### 4. Fact Alignment — 105/150

- **c1 事实主张可溯源或标 UNKNOWN(32/60,−28)**:两层缺陷。其一(−18,与 multi-project iteration-1 同口径):**5 份文件零 FT-xxx fact_id 引用**,而主张高度具体且事实表全部有条目:`必备标识派生自产品级配置清单 mandatory 标注`(= FT-048/FT-016,未引)、`覆盖文件缺失或为空 = 全启用`(= FT-048,未引)、`ERR_PLUGIN_MANDATORY...守卫拒绝`(= FT-049,未引)、`坏 JSON:原文件隔离为带时间戳的损坏备份 + 空覆盖重建;塞必备名:违规条目内存剔除 + 结构化日志(ERR_PLUGIN_RUNTIME_STATE)`(= FT-050 逐字,未引)、`ERR_SINGLE_INSTANCE 环境性失败`(= FT-006,未引)、`结构上仅容第三方名`(= FT-048,未引)。其二(−10,**sibling 所无的实质错位**):fixture 断言 `forge 核心插件恰一个 = true`(step-1 success、step-1 overlay-invalid、step-5 success 三处同错)与现行 `plugin-bundles.json` 直接矛盾——现行清单 3 条全 mandatory:true(9ed862c 弃 hello-world、df85f59 增 forge-workbench mandatory;phase-3 gate record 与 SC6 e2e「三个必备名」佐证)。前置的 `基座 hello-world` 前提亦相对 9ed862c 后的清单过时(FT-016 事实条目本身已陈旧,契约未复核代码现实)。事实表 FT-048(2026-09-23T01:18:11Z 更新,与 last_anchor_sync 同刻)并不支持「恰一个」。
- **c2 inferred 主张有规则支撑 + source: inferred(45/50,−5)**:四条 inferred 注释均规范且依据具体:overlay-invalid(`处置口径...无 PRD 明文;依据 = tech-design Interface 4 双层防护(解析即校验)+ 已落地 sc6 e2e 两型篡改腿`)、double-click-guard(`依据 = UF6 transitioning 态语义`)、first-write(`推自覆盖文件读取契约...见 apps/desktop/src/main/workbench/ipc/plugins.ts:100-116 与 plugin-runtime/overlay.ts 头注;单写路径(setPluginEnabled 动词)为唯一写入者`——代码行号锚,核验属实)、restart-persistence(`依据 = UF6 Data Requirements`)。扣分:mandatory-no-disable 仅有映射注释、无 source 分类标注(其内容由 page-map「必备行无动作」/FT-049 支撑,应标事实锚或补注)。
- **c3 无未分类幻觉主张(28/40,−12)**:`forge 核心插件恰一个 = true`(×3 处)与 `基座 hello-world + fixture 内动态注册第二实例` 两类主张既无 FT 锚、又无 inferred 注释、亦无 UNKNOWN 标记,且前者与代码现实相悖——按「neither factual (with traceability) nor inferred」计未分类。其余行为主张经代码核验未发现编造。

### 5. Surface Fitness — 95/100

- **强制派生 Outcome(40/40)**:validation-error(→ mandatory-no-disable,必备行不渲染禁用入口 = 越权启停类比)与 session-expired(→ overlay-invalid,离线桌面无会话面,通道失效类比 = 运行时启停状态文件失效)均以显式映射注释到场,与项目映射口径一致且映射腿为真实可测行为。
- **Surface 语言适配(30/35,−5)**:通篇用户交互语言(`点击「禁用」`、`在确认对话框选择「取消」`)、页面元素(`行`、`徽标`、`确认对话框浮层`)、状态迁移(`transitioning → 已停用`)——Web 面适配良好。扣分:step-4 restart-persistence Input `重启应用并打开插件管理区与工作台(e2e 驱动面:测试进程等待进程退出与单实例锁释放后重新启动)` ——用户动作与测试驱动机制混写于一处,驱动面语义属 fixture_spec。
- **TUI 超时(25/25)**:Web 面,不适用,满分。

### 6. Internal Consistency — 137/150

- **不变量逐份成立(60/60)**:两级模型——mandatory-no-disable `必备插件行无禁用入口(不渲染,而非渲染后禁用)` + overlay-invalid `必备插件全数在位且必备徽标在`;只写覆盖文件——step-3 `启停仅写 userData 覆盖文件(产品清单字节不变)`、first-write `仅写覆盖文件(单一写路径)`;清单只读——step-1 State `插件行投影 = 产品清单(只读)× 运行时覆盖文件`;「仅该插件」收敛——step-3/4/5 均带对照第三方(`另一第三方插件启用中(对照)`)使断言可证伪。无违规。
- **跨 Contract 状态引用一致(45/50,−5)**:主链闭合:step-3 cancel `禁用二次确认对话框已打开(Step 2 发起后)` ← step-2 success State `确认对话框打开;启停尚未执行`;step-4 `目标第三方插件处于禁用状态(行呈现已停用 + 「启用」动作)` ← step-3 success `该插件行转为已停用态(状态 + 「启用」动作)`;step-5 ← step-3+4 序列。扣分:step-3 success 前置 `启停覆盖文件已存在(常规装置)` ——该「常规装置」(覆盖文件预先存在,含何种内容?)在 5 份文件任何 state_requirements 中均未声明(与 first-write 显式钉住 `plugin-runtime.json 缺失` 不对称);若预置覆盖已含对照插件名,「另一第三方插件...不受影响」前提即被装置破坏。装置内容欠钉使对照断言存在装置歧义。
- **前置与上游 State 变化相容(32/40,−8)**:step-5 core-capability 前置 `第三方插件处于禁用状态(启停序列后)` 与 step-4 终态(目标已重新启用)不相容——happy path 终点回看时目标为启用态,该腿需一次未声明的额外禁用(禁自身或禁对照);fixture_spec 以 `已停用` 约束直供终态,但 `(启停序列后)` 的派生表述与 step-4 State `覆盖文件写入(目标插件名移出 disabled 集)` 冲突未解。另注:step-3 success `对话框已确认` 与 Input `确认禁用` 时序冗余(见维度 3)。

### 7. Anchor Integrity — 90/100

Handbook(`design/page-map.md`)存在,按 Web 面 `page` 字段评分。`route: ""` 系 FT-053/page-map 明言的视图键寻址设计,非缺陷(评估口径明示)。

- **锚点字段完整(40/40)**:5 份文件均有 page/route/requires_auth/layout;浮层步骤(step-2/3 确认对话框)锚到父页 `workbench/overview` 并在 layout 标注浮层——与家族先例一致。
- **锚点值与 handbook 一致(20/30,−10)**:`workbench/overview` 精确匹配 page-map View Key,layout 串(`WorkbenchShell → OverviewPage → PluginSection`)逐项对上,step-1..4 无误。扣分:step-5 core-capability-unaffected 的断言面在**任务看板视图**执行——Input `依次使用任务看板、任务详情、一键发起会话等核心能力`,Output `任务看板正常渲染依赖树与状态分组、任务详情可读、发起会话入口可用`——按 page-map 这些 section 属 `workbench/tasks`(TaskBoardPage/TaskDetailPanel/UF5 入口),而该契约唯一 page 锚与 layout(`PluginSection(两级行态复核)`)均未覆盖 tasks 视图,契约一半断言面处于无锚状态。
- **Handbook 内部一致(30/30)**:page-map 视图键无重复/冲突(overview/tasks/features+:slug/dialog/*/session),无同键异径。

### 8. Fixture Specification — 0/100(entity-completeness veto)

- **实体完整性(0/40,veto 触发)**:step-2 in-session-disable 的判断面对会话/挂接实体下判断,fixture_spec 却只声明 Plugin:
  - Preconditions:`待禁用第三方插件的注入内容正在活跃挂接会话内在线使用(会话界面可见其注入内容;与常规场景互斥)`;Output:`会话本体不中断,挂接区显示第三方扩展内容退出说明`;State:`会话本体与挂接关系保持` —— **Session(活跃挂接会话)与 SessionLink(挂接关系)实体全部缺席**。零会话时「会话本体不中断」「挂接关系保持」断言不可执行;「在线使用中」状态无法由 Plugin-only 装置铺出(须经 UF5 发起链或 fixture 直排,均需 Task/Project/SessionLink 链)。
  - state_requirements 把该需要错记到 Plugin 头上:`目标插件注入内容在活跃挂接会话内在线使用` + `prerequisite_entity: "Plugin"` —— 会话在线状态不是 Plugin 实体的属性,归属错位暴露实体建模缺失。
  - 家族合规对照:dual-form-consistency ×5、task-session-execution-loop、task-board-browsing step-5、multi-project(修订后)凡判断 task/link 态均声明对应实体;家族口径明示「session_links 为工作台自有 SoT、不可由 forge 文件推导,link 态为判断输入时必须声明 SessionLink(min_count 0 + 缺席 state_requirement)」。本家族 step-2 是全项目唯一判断活跃挂接态而零 Session/SessionLink 声明的契约。
  - 依规则「Score 0 if any entity type referenced in the Contract's Preconditions, Input, or State changes is missing from fixture_spec.entities — this triggers the veto」→ 实体完整性 0 分 → **整维 0 分**。
- **关系与约束覆盖(名义 0/35,维内归零;修复时须一并处理)**:(i) step-5 Task 仅声明 `belongs_to Project`,而任务键为 feature 限定(FT-040 `<featureSlug>/<localId>`),Feature 实体(快照投影源)缺席;(ii) step-5 core-capability 断言 `发起会话入口可用`——按 FT-043 入口可用以 getTaskPrompt 探测成功为前提,Task 无任何 field_constraints 保证该任务有可发起 prompt,断言可因任意 Task 而不可达;(iii) step-3 success 的「覆盖文件已存在(常规装置)」无对应 state_requirement(见维度 6);(iv) step-1/step-5 的 `forge 核心插件恰一个 = true` 约束与现行清单(3 mandatory)矛盾,须改为「产品清单条目全部 mandatory = true(当前 3 条)」并重算 min_count(3 必备 + 2 第三方 = 5)。
- **最小数据量(名义 0/25,维内归零)**:Plugin min_count 3 的算术(1 必备 + 2 第三方)建立在错误基数模型上;「仅该插件收敛需第二实例对照方可证伪」的方向正确(≥2 第三方),但必备侧计数失实。veto 修复后应按 3 必备 + 2 第三方重新定量。

---

## Cross-Dimension Coherence Check

- Fixture veto(0)与 Fact Alignment 的「恰一个」矛盾同源异面:前者是实体声明缺失(会话链),后者是基数主张失实——修 veto 时若不同步修基数,Fixture 维仍留 c1 层错误;两者必须同批修。
- Semantic Purity c1 的对拍通道泄漏与各文件 state_requirements 的正确口径**同文件并存**(如 step-3 同时有 Output `(hash 对拍)` 与 state_requirement `跨面断言口径:...hash 前后对拍`)——纯冗余,删除维值内括注即可,无结构风险。
- Internal Consistency 137 与 Fixture 0 不矛盾:叙事/状态链自洽,但保证断言可执行的数据声明不足——一致性维不检查数据充分性,该责任归 Fixture 维。
- Anchor Integrity 的 step-5 扣分与 Fixture 的 step-5 Task 约束不足互为表里:core-capability 腿同时缺视图锚覆盖与任务可发起约束,修复时同文件处理。

## Phase 3 — Blindspot Hunt(维度外发现)

1. **[blindspot] 第三方插件的物化机制未声明,按现行清单不可构造**(Reasoning audit flagged this independently of dimension scoring.):step-1 Preconditions 断言 `第三方 fixture 插件至少 2 个且均启用(基座 hello-world + fixture 内动态注册第二实例,「仅该插件」收敛需第二实例对照方可证伪)` —— 现行产品清单**零第三方条目**(plugin-bundles.json 3 条全 mandatory;hello-world 已被 9ed862c 移出),要让第三方行出现在插件区,必须使用测试 profile 清单变体(任务 6.5 注记:`hello-world 升格为「第三方可启停」装置仅在测试 profile 下(不动生产清单语义);若需第三插件样例,fixture 内动态注册`),而 5 份文件的 state_requirements **无一处声明该清单变体机制**;且「动态注册」若指上游宿主槽位注册,则不会出现在 listPlugins 投影(plugins.ts `listRows()` 仅 `manifest.map`,行集唯一来源是清单文件)——机制表述含混。下游执行者无法按规格铺出 min_count 3(实为 5)的插件行世界。改法:state_requirements 显式声明「测试 profile 清单变体:产品 3 必备 + hello-world(非必备)+ 第二第三方样例(清单变体内落名)」并澄清第二实例的落面。
2. **[blindspot] cancel-no-op 的文件面断言在「覆盖文件不存在」装置下空洞无定义**:step-3 cancel-no-op State 断言 `启停覆盖文件未被写入(文件面对拍:内容不变)`,但其 Preconditions(`禁用二次确认对话框已打开(Step 2 发起后)`)未钉覆盖文件是否存在;同文件 first-write-creates-overlay 已确立「全新隔离 userData 无覆盖文件」为受支持装置,此时「内容不变」无字节可对拍(缺席→缺席),oracle 未定义。改法:前置钉死覆盖文件存在性(或拆两型),缺席型改断言「文件仍不存在」。
3. **[blindspot] 插件区已实现的加载失败/重载路径零覆盖**:step-1 Output 仅断言就绪态(`插件列表两级呈现:forge 核心插件标记「必备」...`),而 PluginSection 实际实现了首载失败错误卡 + 重试(`load-error retry card`)与失败重列保底行(rejection 不乐观翻转、guard 错误重 list)——一条已实现、用户可见的错误/重试路径在 5 份契约 12 个 Outcome 中无任何腿覆盖(surface-web 指引的 network-error/loading-state 常规边路;非强制项,故 Completeness 不扣,但属 QA 缺口)。改法:step-1 增补 load-error 边路 Outcome(触发条件:listPlugins 首载拒绝;断言:错误卡 + 重试可用 + 重试后恢复两级呈现)。

---

## Attacks(修订必改项,按优先级)

1. **[Fixture Specification] entity-completeness veto**:step-2 in-session-disable 判断会话/挂接态而 fixture 仅声明 Plugin —— `待禁用第三方插件的注入内容正在活跃挂接会话内在线使用(会话界面可见其注入内容;与常规场景互斥)` / State `会话本体与挂接关系保持` —— 须补 Session 场景装置与 SessionLink(min_count + belongs_to Task,家族口径)+ Task/Project 链声明,并把 `目标插件注入内容在活跃挂接会话内在线使用` 的 prerequisite_entity 归属从 Plugin 改正。
2. **[Fact Alignment] fixture 基数与现行清单矛盾**:`forge 核心插件恰一个 = true`(step-1 success / step-1 overlay-invalid / step-5 success 三处)对不上 plugin-bundles.json 现实(3 条全 mandatory:true;9ed862c 移出 hello-world、df85f59 增 forge-workbench;SC6 e2e「三个必备名」)—— 改为「产品清单条目全部 mandatory = true(当前 3 条:base / web-app / forge-workbench)」,min_count 相应重算(3+2=5),「基座 hello-world」表述改为「测试 profile 清单变体内第三方样例」。
3. **[Fact Alignment] 全家族零 FT-xxx 锚**:`必备标识派生自产品级配置清单 mandatory 标注`(FT-048)、`坏 JSON:原文件隔离为带时间戳的损坏备份 + 空覆盖重建;塞必备名:违规条目内存剔除 + 结构化日志(ERR_PLUGIN_RUNTIME_STATE)`(FT-050)、`ERR_PLUGIN_MANDATORY`(FT-049)、`ERR_SINGLE_INSTANCE`(FT-006)、`结构上仅容第三方名`(FT-048)等逐条补内联锚;sibling 家族已确立该口径。
4. **[Semantic Purity] Output/State 内嵌对拍通道(8 处)**:`forge 数据零损坏(hash 对拍)`×4、`(sha256 对拍)`、`(文件面直读断言)`、`(文件面对拍:内容不变)`、`文件面断言经 Setup 跨面口径` —— 移入 fixture_spec.state_requirements(多数文件已有同款 state_requirement,删维值括注即可)。
5. **[Internal Consistency] step-5 core-capability 前置不可由 step-4 终态达成**:`第三方插件处于禁用状态(启停序列后)` vs step-4 State `覆盖文件写入(目标插件名移出 disabled 集)` —— 显式声明额外一次禁用(或改前置表述为 fixture 直供),消除序列派生歧义;同时 step-3 success 的「覆盖文件已存在(常规装置)」补 state_requirement(含预置内容)。
6. **[Anchor Integrity] step-5 断言面缺 tasks 视图锚**:`依次使用任务看板、任务详情、一键发起会话等核心能力` 属 workbench/tasks 视图(page-map),而 anchors 仅 `workbench/overview` —— core-capability 腿补 tasks 视图锚(layout 或 outcome 级标注)。
7. **[Precondition Exclusivity] step-5 两腿前置可共真**:`启停操作序列已完成(至少经历一次禁用与启用)` 未钉终态 —— success 前置补「回看时目标第三方处于启用态」使两腿互斥。
8. **[Semantic Purity] step-4 前置/Input 混入执行假设与驱动机制**:`重启腿执行假设成立(等待进程退出 + 单实例锁释放后再启动,每次启动前单实例探测)` 与 `(e2e 驱动面:测试进程等待进程退出与单实例锁释放后重新启动)` —— 移入 state_requirements(已有同款,去重)。
9. **[blindspot ×3]**:测试 profile 清单变体机制声明(第三实例落面澄清)、cancel-no-op 覆盖文件存在性钉死(缺席型 oracle 定义)、插件区 load-error 重试边路 —— 建议随本轮同批补齐。

## Revision Guidance(给 Reviser)

最高杠杆双点 = Attack #1(解除 veto 即 +100 且唯一 0 分维消除)与 Attack #2(基数纠错,min_count/「恰一个」/hello-world 表述三处联动,防止修完 veto 仍留事实错位)。#3–#8 均为局部文本/注释级修改,不动 12 个 Outcome 骨架与互斥分区;#9 视预算取舍,其中清单变体声明(#9.1)与 #2 同根,建议必改。修复时保持 step-1 三腿/step-3 四腿的互斥分区、Journey Invariants 逐字一致与映射注释不动——Completeness 满分的结构不要为修 fixture/注释引入回归。本轮总分 889,解除 veto(+100)并完成 #2–#4 后预计 ~1010+,可达标。
