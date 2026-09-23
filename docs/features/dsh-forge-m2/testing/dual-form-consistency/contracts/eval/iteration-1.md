# Contract Eval Report — dual-form-consistency / iteration 1

- **Rubric**: `skills/eval/rubrics/contract.md`(1100 pts,8 维,target 935,逐维阈值)
- **Evaluated documents**:`docs/features/dsh-forge-m2/testing/dual-form-consistency/contracts/step-{1..5}-*.md`(5 份,共 13 个 Outcome)
- **Cross-reference inputs**:journey.md(同目录)/ design/page-map.md / .forge/fact-table.json / design/tech-design.md(域模型与数据映射)/ gen-journeys rules/surface-web.md / docs/business-rules/{task-operations,coexistence,privacy,resilience}.md / 家族先例 task-board-browsing contracts(修订后约定)
- **Iteration**: 1(无上一轮报告)
- **Scorer stance**: Senior QA adversarial;每一条扣分附文档原文引用;只按页面内容评分

## Verdict

| Dimension | Score | Threshold | Pass |
|---|---|---|---|
| 1. Completeness | 140/150 | 90 | ✓ |
| 2. Semantic Purity | 184/200 | 120 | ✓ |
| 3. Precondition Exclusivity | 132/150 | 90 | ✓ |
| 4. Fact Alignment | 120/150 | 90 | ✓ |
| 5. Surface Fitness | 60/100 | 60 | ✓(压线) |
| 6. Internal Consistency | 150/150 | 90 | ✓ |
| 7. Anchor Integrity | 100/100 | 60 | ✓ |
| 8. Fixture Specification | **0/100(veto)** | 60 | ✗ |
| **Total** | **886/1100** | 935 | ✗ |

**Overall: FAIL** — 双失败面:(a) Fixture Specification 触发 entity-completeness veto 得 0 分;(b) 总分 886 < 935。Surface Fitness 60 恰在阈值线(Web 强制派生 outcome 零考虑)。三个失败面均单一根因、可修(见 Attacks #1/#2/#3)。

---

## Phase 1 — Reasoning Audit(评分前独立判断)

Journey 结构:5 个 happy-path step + 5 个 edge case(1b 看板已打开、2b 高频变更、3b 同时操作、4b 离线变更、5b 冻结插件)。逐条对照:

- Step 1 → 2 Outcomes(success / board-open-change)= 覆盖 1、1b ✓
- Step 2 → 2 Outcomes(success / high-frequency-terminal-changes)= 覆盖 2、2b ✓
- Step 3 → 4 Outcomes(success / simultaneous-late-op-rejected / simultaneous-late-op-accepted / structural-change-flowback)= 覆盖 3、3b 双分支 + 结构性推断腿 ✓
- Step 4 → 2 Outcomes(success / offline-terminal-changes)= 覆盖 4、4b ✓
- Step 5 → 3 Outcomes(success / frozen-plugin-compat / ended-link-history-retained)= 覆盖 5、5b + ended 保留推断腿 ✓

步骤/结果映射完整(5/5 happy + 5/5 edge + 3 条 inferred 补充腿),无遗漏、无虚构。独立核验推断注释的代码引用**全部真实**:step-3 structural 注引 `apps/desktop/src/main/workbench/indexer/diff.ts:82-98` 经核对正是 `diffTasks`(structural changeKind,行 82-98);step-5 ended 注引 `repos/session-links.ts:48-95` 正是 endSessionLink 不删行 + 新→旧含 ended 查询。事实主张实质核对(来源判定序 = FT-045、事件批推通道 = FT-046、ended 保留/排序 = FT-035)零错位。

预判锚点(评分前记录):(a) 5 份文件零 FT-xxx 引用(grep 证实);(b) validation-error / session-expired / required_outcomes 三词零命中——家族先例(task-board-browsing 修订版)对这两项均有显式处理约定,本旅程全部缺席;(c) step-1 前置引用「挂接会话」(SessionLink 实体面)而 fixture_spec 无 SessionLink 声明;(d) step-2b「每笔变更产生独立事件」与 FT-047 防抖(400ms trailing)设计存在口径张力,需查证。

---

## Phase 2 — 逐维评分(verification stance)

### 1. Completeness — 140/150

- **四维非空(50/50)**:13 个 Outcome 的 Preconditions/Input/Output/State 全部非空,Preconditions 均带结构化 fixture_spec;Side-effect 全部显式(如 step-1 `"forge 文件被终端侧变更(工作台只读感知,零写回)"`、`"none(工作台只读感知终端变更)"`)。无任何缺失维度。
- **Journey Invariants(50/50)**:5 份文件均有 `## Journey Invariants`,各 3 条,与 journey.md 的 3 条不变量逐字一致。
- **派生场景覆盖(40/50,−10)**:journey 侧覆盖完整(happy + 全部 5 条边 + 3 条 inferred 腿,超出 journey 文本)。但 **Web surface 强制派生 outcome(validation-error + session-expired)零考虑**:grep 全 5 份文件,`validation-error` / `session-expired` / `required_outcomes` 零命中——既无映射注释,也无 N/A 声明,更无对应腿。本旅程感知链失败(FT-056:sync-error 工具栏指示 + 静默重试 + 保留 last-good 看板)是 session-expired 的天然类比面(家族先例 task-board-browsing step-1 正是如此映射),step-1 success 前置只假设 `"感知链健康"` 而全旅程无一 Outcome 触发感知链失败。surface-web.md 明文「must be considered for every Web Journey」。−10(journey 覆盖满分、surface 强制项缺席)。

### 2. Semantic Purity — 184/200

- **c1 自然语言、无 code/regex(74/80,−6)**:全文无 regex/CSS 选择器/XPath/框架断言。但 **Output 维度值内嵌「如何校验」的 oracle 机制**,违背「describe *what* the system produces, not *how* to verify it」与家族约定(驱动/断言通道只入 state_requirements):
  - step-3 structural Output:`任务集与 forge 数据一致(测试进程直读对拍)`
  - step-5 success Output:`(注册落库/挂接 = 工作台状态读数对拍)`

  −6(同类缺陷 2 处,按类计;家族先例同类 4 处计 −8)。
- **c2 Preconditions 为声明式状态(56/60,−4)**:主体是声明式(`同一 forge 项目同时被应用(已注册激活、看板可进入)与终端(冻结插件/forge CLI)操作`),但两处前置值混入测试装配指令:
  - step-2 success:`(e2e 以 fixture 任务文件变更 + FORGE_ACTOR 标记模拟会话侧操作)`——harness 模拟方式,应移入 state_requirements(该 Outcome 其实已有对应 state_requirement,前置值系重复回灌)
  - step-4 success:`SC7 验收脚本可运行(测试进程执行往返断言)`——脚本可用性属测试基础设施声明

  −4(与家族先例同口径)。
- **c3 无实现耦合(54/60,−6)**:State 值使用存储层词表(表名/行级操作),属实现词法而非系统级行为(家族先例已把 DTO 类型名 TaskBoardData/TaskDetail 清出 State 值,同classes):
  - step-1 State:`task_snapshot 行更新(状态/时间)…`、`task_updated 事件(属性级)经 dsh-forge:workbench-events 批推送`(内部推送通道名)
  - step-3 structural State:`task_snapshot 集合与 forge 文件任务集一致(新增行 upsert / 消失行删除)`(表名 + DB 行话)
  - step-5 success State:`session_links 完整保留(交替操作不触碰挂接表);挂接与 forge 数据分属两库`(表名 + 存储拓扑)

  行为化写法如「看板快照逐笔更新;变更事件推送至看板订阅方」即可保留全部信息。−6(3 处跨 3 文件,较先例 2 处 −5 略重)。

### 3. Precondition Exclusivity — 132/150

- **c1 各 Outcome 前置互斥(50/60,−10)**:step-1 双腿显式互斥(`变更发生时任务看板未处于已打开状态…已打开看板的到达变更腿见 board-open-change` vs `任务看板处于打开状态(非首次加载;与 success 的进入时序互斥…)`);step-3 success 以 `无同时同任务操作、无任务集结构性增删` 排除两条推断腿,干净。**但 step-5 两腿之间未互斥**:frozen-plugin-compat(`终端侧使用冻结插件(3.x)形态操作同一项目(与常规 forge CLI 形态互斥的终端形态腿)`)只与 success 的终端形态互斥,ended-link-history-retained(`参与交替操作的挂接会话已结束(status = ended…)`)只约束挂接态——「冻结插件终端 + 已结束挂接」的 fixture 同时满足两腿前置。Input 不同(看板查看 vs 详情挂接历史)部分缓解,但按前置层互斥口径属潜伏重叠。−10。
- **c2 前置足以唯一定位 Outcome(42/50,−8)**:step-3 simultaneous-late-op-rejected 的 fixture 给了可构造配方(`处于仅一笔操作可满足前置的状态` + 例 `对已完成转移的任务再次 claim`),而 **simultaneous-late-op-accepted 无对应配方**:前置 `后到操作按 forge 状态语义仍合法(状态机允许顺序执行)` 是结果性描述,其 Task fixture 无任何 status field_constraints——执行者无从确定从哪个状态出发、选哪一对操作可保证「两笔按到达序均合法」。判定输入悬空,该腿不可确定性构造。−8。
- **c3 边界 Outcome 显式给出触发条件(40/40)**:board-open-change(看板已打开)、high-frequency(`短时间内连续执行多笔任务状态变更`)、simultaneous(几乎同时 + 合法性分支)、structural(`任务集发生结构性变化`)、offline(`应用未启动时,终端侧已执行任务状态变更`)、frozen(`使用冻结插件(3.x)形态`)、ended(`status = ended`)。全部显式。

### 4. Fact Alignment — 120/150

- **c1 事实主张可溯源或标 UNKNOWN(30/60,−30)**:三组问题:
  1. **零 fact_id 引用**(grep 证实,5 份文件无一处 FT-xxx)——大量具体行为主张实为事实表内容却未溯源:`source = terminal(判定序:无 active 挂接且无 actor 标记 → terminal)`(= FT-045 路径 2,未引)、`task_updated 事件(属性级)经 dsh-forge:workbench-events 批推送`(= FT-046,未引)、`事件 changeKind = structural`(= FT-046,未引)、`ended 行保留不删除(ended_at 已写入);排序新→旧`(= FT-035,未引)。核验后实质零错位,属可溯源未溯源的形式缺口。−15(与家族先例 iteration-1 同类同额)。
  2. **事件粒度主张与防抖设计冲突(step-2b)**:`每笔变更产生独立 task_updated 事件与快照 upsert(防抖/批推合并不吞并不同笔变更)` ——FT-047 明文 `change batches debounced 400ms trailing` + `event batcher merges pushes within 500ms`:同任务两笔变更间隔若落在防抖窗内,重扫只见终态、只产一笔事件(状态级不丢、事件级「逐笔」不成立);fixture 仅 `min_count: 1` 单任务(`未完成,可供连续多笔变更`),未钉变更间距。该 State 断言按当前写法在真实实现下可证伪,且未标 UNKNOWN、未引事实。−10。
  3. **「来源口径」对拍维度不可验证(step-2 success)**:`终端输出与看板展示一致(任务状态/依赖/来源口径双侧对拍一致)` ——source(session/terminal)是工作台侧判定(FT-045/FT-032 `source = session|terminal|null` 为 TaskSummary 字段),事实表无任何一条表明 `forge task status` 的终端输出携带来源维度;契约把「来源」加进双侧对拍维度表,属无依据且大概率对不上的强主张。−5。
- **c2 inferred 主张带依据 + source: inferred(50/50)**:3 处推断腿全部成对给出 `source: inferred` + 推理依据,且依据可核验:step-3 simultaneous-late-op-accepted(`后到操作合法分支与被拒分支同源——journey Step 3b…隐含合法分支顺序生效;forge 状态机为唯一裁决者`)、step-3 structural-change-flowback(indexer diff 分类,代码行号经核验属实)、step-5 ended-link-history-retained(session_links 仓储契约 + journey Step 5,代码行号经核验属实)。三处均属 journey 继承/代码推断而非 required_outcomes 强制项,处理方式与家族先例认可的写法一致。
- **c3 无未分类幻觉(40/40)**:全部行为主张对照 FT-045/046/047/035/053/056、page-map、journey、business-rules(人侧只读 BIZ-task-ops-001、SoT 纪律、静默降级 BIZ-resilience-001——本旅程无感知链失败腿,不涉及降级面)核验:除 c1 第 2/3 项的过度主张已计扣外,未发现凭空主张。推断注释的代码引用逐行核对真实。

### 5. Surface Fitness — 60/100

- **强制派生 Outcome(0/40)**:`validation-error` + `session-expired` 完全缺席——无 Outcome、无映射注释、无 N/A 声明(grep 零命中)。surface-web.md 明文两者为每个 Web 旅程的 mandatory derived outcomes;rubric 明文「Score 0 if mandatory Outcomes are completely absent」。家族先例证明本产品面有既定处理法(task-board-browsing step-1 以 `<!-- surface-web required_outcomes 映射:session-expired → 本旅程为离线桌面应用…映射为 UF2 error(读取失败)态 = 本边 -->` 落地、step-3 以 validation-error→明确空态映射落地)。本旅程最自然的映射对象是感知链失败(FT-056 sync-error 工具栏 + 静默重试 + last-good 保留)——恰是双形态回流的主角通道,step-1 却只以 `"感知链健康"` 前置把它假设掉。**0/40**。
- **Web 语言(35/35)**:用户交互(`人在终端执行一次任务状态变更,随后回到应用看板查看`)、页面元素(`看板`/`任务详情挂接区`/`来源[终端]` 标记)、异步语义(`5 秒内免手动刷新可见`/`回流`/`增量更新(订阅通道批推送);不重建整板`)。维度值无 DOM 选择器、无框架断言。Output 中的测试进程语言已在 Semantic Purity c1 计扣,此处不重复计扣。
- **TUI 超时项(25/25)**:非 TUI surface,满分。

### 6. Internal Consistency — 150/150

- **不变量在每份 Contract 成立(60/60)**:唯一事实源——全部工作台侧 Side-effect 为只读感知(`工作台只读感知,零写回`/`none(拒绝操作不落部分变更)`/`none(校验只读)`),唯一写 forge 文件的是终端/会话操作本身,与 BIZ-task-ops-001(看板仅呈现、不写回)一致;≤5 秒免刷新——step-1/1b/structural 均断言 5 秒;自有状态独立存放——step-4(`校验含混写检测`)、step-5(`挂接与 forge 数据分属两库`)显式断言。无违反。
- **跨 Contract 状态引用一致(50/50)**:step-4 `Step 3 交替操作已完成(双侧多笔读写向变更已发生)` 与 step-3 success(交替操作)吻合;step-5 `交替操作完成(终端侧以常规 forge CLI 形态操作…)` 与 step-3 的终端操作口径及 frozen 腿的互斥声明吻合;step-1 fixture `未完成(可 claim/transition)` 与 journey Setup 逐字同源。无悬空引用。
- **前置与前步 State 变化一致(40/40)**:step-2 需挂接会话已完成操作(journey Setup 供给)、step-4 需 step-3 完成、step-5 需交替完成——链路可达;step-4 offline 腿独立场景(`应用未启动`)自带 state_requirement(`测试进程先变更后启动应用`),无矛盾。

### 7. Anchor Integrity — 100/100

- **锚点字段完整(40/40)**:5 份文件 frontmatter 均含 `anchors.web.page` + route/requires_auth/layout(本旅程仅触达 workbench/tasks 一个页面 + 详情侧板,handbook 其余页面归属其他旅程)。
- **锚点值与 handbook 一致(30/30)**:`page: "workbench/tasks"` ×5 与 page-map View Key 逐字一致;`route: ""` 为 FT-053 视图键寻址既定设计,非缺陷;`requires_auth: false` = handbook `Auth: none`;layout 串可在 page-map 找到同源定义(step-5 `WorkbenchShell → TaskBoardPage → TaskDetailPanel(挂接历史)` 对应 Page Sections 行 `任务详情侧板(UF3)| TaskDetailPanel | …| 描述/依赖链/执行记录/挂接历史`)。step-4 layout 括注携带执行说明(`SC7 验收脚本由测试进程执行`)属冗余但不构成锚点值错配。
- **handbook 内部一致(30/30)**:page-map 无重复视图键、无路由冲突(全视图键寻址),dialog 浮层 `workbench/dialog/*` 与 feature 子视图 `workbench/features/:slug` 声明无歧义,与 FT-053 一致。

### 8. Fixture Specification — 0/100(**entity-completeness veto**)

- **实体完整性(0/40,触发 veto)**:step-1 两个 Outcome 的 Preconditions 均引用挂接实体面,而该文件 fixture_spec(逐 Outcome 与底部并集)只声明 Project/Task,**无 SessionLink**:
  - success Preconditions:`被变更任务当前无进行中(active)挂接会话(来源判定主路径据此标记[终端])`
  - board-open-change Preconditions:`被变更任务无 active 挂接`

  关键甄别(同家族先例的判准):SessionLink 是**工作台自有 SoT**(tech-design `interface SessionLink`;session_links 表),**不能从 forge 文件推导**;来源判定(FT-045 路径 2:`task has an active session link -> session, otherwise terminal`)在运行时**读取** session_links 行——即被测行为以 SessionLink 状态为判定输入。前置文本虽然写了「无 active 挂接」,但 fixture 层零声明(无 `SessionLink min_count: 0`、无 absence state_requirement):共享项目 fixture 一旦为变更任务留有 active 挂接(步骤 2/3/5 的 fixture 正是如此造 SessionLink 的),来源判定翻转为 session,[终端] 标记断言静默失效——这正是实体完整性 veto 要防的「测试数据不充分」类。按 rubric「Score 0 if any entity type referenced in the Contract's Preconditions… is missing from fixture_spec.entities」→ 实体完整性 0 分 → **整维 0 分(veto)**。

  修复路径(二选一,家族既有写法):(a) step-1 两腿 fixture 增加 `SessionLink min_count: 0`(实体缺席表达,对照 task-board-browsing empty-state 的 `Task min_count: 0` 先例)+ state_requirement 钉「变更任务零 active 挂接(隔离 userData)」;(b) 显式声明「挂接存在于他任务、变更任务无挂接」的 SessionLink 约束腿。
- **关系与约束覆盖(名义 20/35,被 veto 归零;仍列给修订者)**:Task belongs_to Project、SessionLink belongs_to Task 声明正确(与 ER/仓储语义一致)。两处 field_constraints 为**不可种子的伪约束**——值是场景结果而非字段取值:step-4 success `value: "已经历双形态交替变更"`、step-5 success `value: "已经历交替变更"`(种子器无法构造「已经历交替变更」的状态;起始态应钉具体值如 pending,交替事实由 Preconditions 引 Step 3 表达)→ −8;step-1「无 active 挂接」absence 未入 fixture(见上)→ −7。
- **min_count 充分性(名义 25/25,被 veto 归零)**:各腿 min_count=1 与场景匹配:单笔变更(step-1)、交替多笔靠 claim/transition/reopen 循环于单任务(BIZ-task-operations 词表含 reopen,可行)、结构性增删一任务可测(`新增(或移除)任务文件`)、离线一任务、挂接一(active/ended)。

---

## Phase 3 — Blindspot Hunt(rubric 之外)

1. **[blindspot] 感知链失败腿全旅程缺席,主角通道只有正例**。step-1 success Preconditions:`感知链健康` ——本旅程的被测主角就是回流通道(watcher→indexer→事件推送),其失败行为(FT-056:`sync-error toolbar indication with silent retry and retains the last-good board`)是双形态一致性最可能翻车的真实面(如 watch 目标被释放、扫描异常)。前置把通道健康假设掉,5 份契约无一处驱动它失败。rubric 不罚「旅程未列的边」,但 Senior QA 视角这是本旅程最大的漏测面,且与 Surface Fitness 修复(映射腿)可一并解决。
2. **[blindspot] frozen-plugin(3.x)腿不可执行**。step-5 frozen-plugin-compat state_requirement:`冻结插件(3.x)终端形态可对该项目执行任务变更(同格式共享)` ——没有给出 e2e 如何产出「3.x 冻结插件方言」的写:测试进程代改 fixture 文件与其他腿的「常规 CLI 形态」写法无差别,Output `双形态共享 forge 数据格式,互不破坏` 就无从与常规腿区分验证。需要 3.x 方言 fixture 文件配方或真实冻结插件驱动方式,否则该腿退化为又一笔普通终端变更。
3. **[blindspot] 「删除不留孤儿」孤儿对象未定义**。step-3 structural Output:`结构性变更 5 秒内回流呈现(结构性增量/移除;新任务出现或消失任务移出,删除不留孤儿)` ——「孤儿」指快照行还是挂接行?该腿 fixture 无 SessionLink,删除「带 active 挂接的任务文件」时 session_links 行为(保留为历史?级联?)在本旅程(挂接完整性是 Step 5 主题)完全未定义,而 FT-036 的级联只在 removeProject 层。语义应显式收敛(如「孤儿 = task_snapshot 残留行;挂接行按 Step 5 语义保留为历史」)。
4. **[blindspot] 「已打开看板」时序腿缺收尾对拍**。step-1 board-open-change Output:`变更 5 秒内可见,无需关闭重开看板、无需手动刷新或重启应用` ——但未断言**变更前看板内容仍完整保留**(增量更新不重建整板只在 State 里说 `已打开看板的快照经变更事件增量更新…不重建整板`,Output 无「其余任务不丢失/不闪整板重载」的用户可见断言)。增量腿最常见的 bug(整板重建导致的滚动位置/选中态丢失)无对应用户级断言。

---

## Attacks(修订优先级序)

1. **[Fixture Specification/veto]** step-1 引用挂接实体面却未声明 SessionLink —— `被变更任务当前无进行中(active)挂接会话(来源判定主路径据此标记[终端])` / `被变更任务无 active 挂接` 两腿 fixture 与并集均只有 Project/Task —— 按 `SessionLink min_count: 0` + absence state_requirement 钉死(家族 empty-state 先例写法),否则 [终端] 标记断言的判定输入悬空。
2. **[Surface Fitness/0 分项 + Completeness]** Web 强制派生(validation-error + session-expired)零考虑(全 5 份 grep 零命中)—— step-1 `"感知链健康"` 只有假设无失败腿 —— 补 `surface-web required_outcomes 映射` 注释(家族先例写法),最优解是落一条感知链失败腿(FT-056 sync-error + 静默重试 + last-good 保留)同时消掉盲区 1。
3. **[Fact Alignment]** 事件粒度主张与 FT-047 防抖冲突 —— `每笔变更产生独立 task_updated 事件与快照 upsert(防抖/批推合并不吞并不同笔变更)`(单任务 min_count 1、无变更间距约束)—— 钉「每笔间隔 ≥ 防抖窗」或降级为状态级断言(每笔变更的最终效果不丢失、不与它笔错误合并)。
4. **[Fact Alignment]** 「来源口径」列入终端对拍维度无依据 —— `终端输出与看板展示一致(任务状态/依赖/来源口径双侧对拍一致)` —— source 是工作台侧判定(FT-045/FT-032),终端输出是否携带该维度未知;收敛对拍维度到终端实际可输出项或标 UNKNOWN。
5. **[Fact Alignment]** 全部 5 份零 fact_id 引用 —— `source = terminal(判定序:…)`(FT-045)、`经 dsh-forge:workbench-events 批推送`(FT-046)、`事件 changeKind = structural`(FT-046)、`ended 行保留不删除…排序新→旧`(FT-035)—— 为具体行为主张补 FT-xxx 溯源标注。
6. **[Precondition Exclusivity]** step-3 accepted 腿不可确定性构造 —— `后到操作按 forge 状态语义仍合法(状态机允许顺序执行)` 而 Task fixture 无 status 约束、无操作对配方 —— 补「起始状态 + 两笔操作」的具体构造(对照 rejected 腿的配方写法)。
7. **[Precondition Exclusivity]** step-5 frozen 与 ended 两腿前置可同时成立(互斥声明只指向 success)—— `与常规 forge CLI 形态互斥的终端形态腿` 与 `status = ended` 无交叉排除 —— 显式声明两腿正交或互斥。
8. **[Semantic Purity]** Output 值内嵌 oracle 机制 —— `任务集与 forge 数据一致(测试进程直读对拍)`(step-3)、`(注册落库/挂接 = 工作台状态读数对拍)`(step-5)—— 通道声明移入 state_requirements,Output 保持纯行为断言。
9. **[Semantic Purity]** State 值使用存储层词表 —— `task_snapshot 行更新`、`session_links 完整保留…分属两库`、`新增行 upsert / 消失行删除`、`dsh-forge:workbench-events` —— 改行为语言(看板快照逐笔更新/挂接记录完整保留/变更事件推送至看板订阅方)。
10. **[Semantic Purity]** Preconditions 混入装配指令 —— `(e2e 以 fixture 任务文件变更 + FORGE_ACTOR 标记模拟会话侧操作)`(step-2)、`SC7 验收脚本可运行(测试进程执行往返断言)`(step-4)—— 移入 state_requirements。
11. **[Fixture Specification/名义]** 不可种子伪约束 —— `value: "已经历双形态交替变更"`(step-4)、`value: "已经历交替变更"`(step-5)—— 钉具体起始状态(如 pending),「已经历」由 Preconditions 引 Step 3 表达。
12. **[blindspot]** frozen-plugin 腿缺 3.x 方言驱动配方 —— `冻结插件(3.x)终端形态可对该项目执行任务变更(同格式共享)` —— 给出可执行的 3.x 格式 fixture 产出方式,否则该腿不可与常规腿区分验证。
13. **[blindspot]** 「删除不留孤儿」孤儿对象未定义 —— `新任务出现或消失任务移出,删除不留孤儿` —— 显式收敛为快照行语义,并声明带挂接任务的删除行为归 Step 5 口径。
14. **[blindspot]** board-open-change 缺「既有内容保留」的用户级断言 —— `变更 5 秒内可见,无需关闭重开看板…` —— 增补「变更前看板其余内容不丢失/不整板重载」断言。

---

## 结论

文档在结构完整性、互斥性主体、跨文档一致性、锚点与 journey 忠实度上质量很高(13 个 Outcome 覆盖全部 5 步 + 5 边 + 3 条可核验的推断腿,推断注释的代码引用逐行属实,事实实质零错位),明显优于家族初版。失败面三个且全部单一根因可修:(1) **Fixture veto** —— step-1 的 [终端] 来源断言以「无 active 挂接」为判定输入,SessionLink 却未入 fixture 声明(修复 = min_count 0 实体缺席表达,家族已有先例写法);(2) **Web 强制派生零考虑**(修复 = 两条映射注释,最优解为感知链失败腿,兼消最大漏测盲区);(3) **事实溯源与过度主张**(零 FT 引用 + 高频事件粒度与防抖设计冲突 + 终端对拍维度不可验证)。**总分 886/1100 < 935 且 Fixture Specification 0 < 60 → FAIL,进入 iteration 2 修订。**
