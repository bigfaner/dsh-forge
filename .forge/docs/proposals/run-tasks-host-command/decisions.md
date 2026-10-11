# 过程裁决记录——run-tasks-host-command

> 本文档从 [proposal.md](proposal.md) §7 抽离（2026-10-11 精简裁决），是 brainstorm
> 过程中全部用户裁决/澄清/修订（二十七项）的完整轨迹。提案正文只保留结论，此处保留
> 推理与修订链。

## 一、裁决与澄清（时序）

1. **Challenge Override（用户 chose to proceed）**：Need Gate 曾建议"指令入口+agent 跑
   循环"（改动更小、保留语言判断力）；用户裁决宿主事件驱动全托管。Reason: dispatcher
   会话 token 成本与循环可靠性依赖 agent 解释是根本痛点，中间态不解决。

2. **呈现面裁决**：双通道（看板+发起会话叙述+问询裁决）。

3. **范围裁决（后修订）**：原"一揽子切换"（skill 同步退役）修订为**缓切**——指令定名
   `/run-dag-tasks`（与 run-tasks skill 刻意不同名），skill 过渡保留、fix 链文本不搬家，
   宿主循环验收后另起小提案退役；GUI 按钮仍本次切换至宿主循环。

4. **并发裁决**：v1 严格串行（一次派发一个 worker 执行一个任务）；单任务源多任务并行
   派发为后续方向（状态机 in-flight 集合建模留缝）。

5. **停止入口裁决**：**独立指令 `/stop-dag-tasks`** 直停活循环（初稿的 `off` 子语法
   否决）；GUI 中断按钮**暂不做**（后续方向，v1 停止入口=指令）。

6. **身份裁决（修订既有"dispatcher 会话退役"）**：**dispatcher 会话不退役**——
   `/run-dag-tasks` 在会话中执行，该会话保留 dispatcher 身份锚（claim/links/worker
   parent 全挂主会话真实 id）；循环逻辑仍由宿主代码承载（模型不解释协议——此点不变）。
   连锁简化：合成会话身份概念退役（R1 涟漪消除、GUI jump 天然工作零适配）；对账判据由
   "合成身份 link"改为"claim 记录循环来源标记"（links 两路线同形无法区分，持久痕迹落
   records）；worker spawn parent=主会话，agentOptions 继承链不变。

7. **会话徽标裁决**：dispatcher 会话加特殊标记便于会话列表快速识别——落
   `forge-dispatch-loop` 会话投影键（/plan 同构，折叠既有 command/run 日志零新增记录）；
   上游 sidebar 徽标缝任务内核实，兜底=概览/任务 tab 挂接会话行渲染。

8. **处置动作命名裁决**（质询直观性后改定）：spawn-fix→**add-fix**（spawn 在本项目
   专指启动子会话，建任务经 addTask——消歧义）；escalate→**ask-user**（动作名=执行机制
   userQuestions.ask——去黑话）；wait-external 保留（external=本任务源之外，与 DAG 依赖
   depends_on 区分）。

9. **worker 观察面裁决**：**采用官方 dsh-client-ui-subagent**——父会话头部后代目录树
   （运行状态/token/活动 turn 时长，Sidebar 打开任意后代），one-shot worker 完成后只读
   执行记录；dsh-forge 零自建观察面（连带坐实"不经 jobs"——jobs 面板流不再是观察缺口）。

10. **可拆卸壳裁决**：dispatchTask 工具未来可能随 run-tasks skill 下线——分层按此设计：
    核心面 `src/dispatch-core/` 与薄壳 `src/tools/dispatch-task.ts` 单向依赖（壳→核，
    核零反依赖），文件边界即下线边界，核心面/循环/核心单测在下线时零改动。

11. **退避裁决**：spawn 失败**不立即重试**——退避后（间隔递增）再幂等重入，退避 ×3
    仍失败 → halted；退避期间循环挂起（/stop-dag-tasks 可打断）。

12. **状态真化裁决**：进程内**运行时登记表**（活循环/in-flight 任务/主会话/worker
    子会话）+ 进程重启**启动对账**——宿主遗留 in_progress 标记 `interrupted`（新状态），
    杜绝"进行中而实际没执行"的失真；恢复=**逐个领取逐个恢复**（同日修订：否决启动时
    批量重排——循环每轮优先定向领最早中断的一个，不经 pending 池）；skill 会话路线
    既有重入语义不受对账影响。

13. **lineage 裁决**：**blitz 直挂**（S1-S7 批准后直接转任务清单，不走
    PRD/tech-design/breakdown 全链——机械缝在任务执行中即席决策，S6 测试纪律兜底；
    注册 mode=blitz，proposalId e0cb7483-6e9a-4ec3-b794-56ad798d4471）。

14. **jobs 裁决**（质询后撤回复用）：循环不经 jobs 包装——jobs 为模型面调用者设计
    （回执/job_output 结算交付），宿主循环非该消费者、并发上限对 v1 串行无用（当时
    理由含"owner 在合成身份悬空"——该理由随身份修订失效，裁决本体不变：结算交付
    协议仍非循环消费者）；循环直接持有 SpawnWorkerHandle（result promise 结算 +
    dispose/signal 停止）。

15. **预期行为澄清**：循环=程序循环领取任务→委托 subagent（= dispatchTask spawn 的
    worker）异步执行→**领取时+结果时**向主会话（=发起会话）双通知→持续到没有任务
    可领取为止；叙述节点据此由"每轮结算摘要"扩展为每任务两条。

16. **主会话职责澄清**：主会话**仅感知**（等所有任务结束或外力中断循环，不参与异常
    处理与循环控制）——异常处置走**三层阶梯**（修订：先由模型智能处置——专用处置
    subagent 承载（与 worker 同款形态：类型化提示词+收窄工具面+结构化决策输出），
    处理不了/重试多次仍无法解决才升级 userQuestions；第一层机械守卫与第三层人工裁决
    不变），裁决直达 userQuestions、不经主会话；**循环独占守卫**防主会话/他者成为第二
    dispatcher（外部 dispatchTask 触达活循环任务源被拒）。"恢复派发循环"不存在也不需要：
    异常中循环从未死（halted/死锁是主动停下等裁决），外力中断唯一入口=指令再触发问询
    或裁决停止项。

17. **叙述通道选型（steer vs followup）**：选 `agent.followup()`——叙述=进展通知而非
    中途纠偏：followup 独立成 turn（claim 一次弹 1 条，sole ordinary message of its
    own turn）、不打扰主会话进行中的 turn；steer 会注入当前 turn 下一个 step 边界并
    **延长**该 turn（agent-loop：`turnEnds && nextStep.length===0` 才 break）——仅适用
    于指令式介入（/plan 先例即此类），本项目不用。composer 不被阻塞：followup() 为
    同步 void（inbox splice+唤醒即返），await handle.result 挂起的是循环自身 async
    函数——用户随时可在主会话输入（用户消息与叙述各占独立 next-turn FIFO）。
    **（#28 修订，2026-10-11）**：本条的 followup 选型收缩至**终局叙述**（每循环
    1–2 条）；常规进行事件改 inject() notice（零模型回合，对话流 context 行可见，
    模型于下次自然回合消化）——steer 仍然不用。

18. **LoopInstanceId 语义确认**：启动时 crypto.randomUUID() 生成（每次启动=新实例）；
    作用=登记表键 + guard 粘性载体（spawn 失败计数挂循环实例，与主会话工具调用互不
    污染）+ stop/替换定位；终态即登记表删除——新实例=guard 计数复位（对齐原 skill
    "halted 无自解锁、新会话复位"语义）；进程内不持久化。guardKey=参数槽（dispatchCore
    接口字段），LoopInstanceId=循环填入的值（工具壳填会话 id）——值与参数槽的关系。

19. **派发按钮形态修订（用户，2026-10-11）**：GUI 派发按钮 new 路径=**构造
    `/run-dag-tasks <slug>` 指令单行**（既有 openSessionWithPreset+autosend 管道原样，
    上游 slash 仲裁将 known command 路由至 command plane 执行，新会话即主会话）——
    否决初稿"新薄 RPC `dispatch.startLoop`"方案，零新增 RPC；`DISPATCH_COMMAND_PREFIX`
    换值为新指令名。

20. **stop 作用域修订（用户，2026-10-11）**：`/stop-dag-tasks` **无参**——直接停止
    **同一会话**（ownerSessionId=敲指令会话）启动的活循环；本会话无活循环=no-op 提示
    **"本会话没有派发任务"**（不附活循环归属——不暴露他会被话信息），不误停他会被话
    启动的循环。

21. **用词修订（用户，2026-10-11）**：forge 没有"容器"概念——正式概念=**任务源
    （source：feature 目录 | 提案 slug，dispatchTask 参数即 source_kind+source_slug）**；
    三文档全文"枚举容器 / 容器 / `<container-slug>`"统一改为"枚举任务源 / 任务源 /
    `<source-slug>`"（代码内 ContainerRef 等既有标识符不改——仅提案叙述面）。

22. **follow-up 概念澄清（用户质询，2026-10-11）**：follow-up fix = 阻塞结算的跟进
    任务——状态层普通任务行（fix-N 前缀 local id，非特殊类型），挂接源任务
    （source_task_slug/local_id 引用 + block_source=true 同事务置源任务 blocked），
    fix 完成 submitTask 时自动恢复源任务（结果列 restored tasks）。创建者三源：worker
    提交 blocked 时 submitTask 自动派生（典型——"typically spawns"非必然）/ 处置代理
    add-fix 决策（第二层补路径）/ 缓切期旧 skill dispatcher 手动 spawn（宿主循环上线后
    由前两者取代）。**"blocked ∧ 无 follow-up"=修复路径缺位**，三类典型成因：
    ① 真的修不了——等外部（同文件冲突等另一任务源的活先落地，fix 无意义 → 处置代理
    判 wait-external）；② 该修但 worker 没留路径（如报"构建环境缺失"却没建修构建
    脚本的 fix → 处置代理判 add-fix 补上）；③ 任务本身矛盾（AC 与 hard rule 冲突，
    fix 解决不了 → 处置代理判 ask-user 直达第三层）。对照"blocked 有 follow-up"=池内
    已有修复路径，fix ready 自然被循环领取——机械续领零智能介入。有/无 follow-up 的
    分界把"机械能处理的"与"需要判断的"精确切开，即第二层存在理由。

23. **进程拓扑澄清（用户质询，2026-10-11）**："宿主"=dsh 宿主进程（Desktop 主进程以
    child 形态拉起的唯一 Node 进程——boot/child.ts，承载 cordis 插件树/全部 agent
    会话/六服务）；宿主循环=plugin-forge 内普通 async 代码（事件循环上挂起，非进程
    非线程非模型回合）。全部 subagent（worker/处置代理）与循环**同进程**——in-process
    driver 经宿主 agent factory 创建 child agent（cordis 子作用域，非 OS 子进程）、发布
    进 ctx.agents、dispose 即移除。推论：进程重启=循环与全部 worker 一起消失
    （interrupted 对账的根基）；await handle.result=进程内 Promise 零跨进程开销。

24. **叙述模板结构化裁决（用户，2026-10-11）**：返回主会话的内容要清晰且结构化、
    **能够明确指示 agent 的行动**——模板统一骨架（类型行/任务源/任务键/状态事实/
    余量/行动指示行）；行动指示为**封闭枚举**且全部"无需处理"族轻动作（默认
    "无需处理，仅知悉"；受阻="无需处理——处置已由宿主循环接管"；收口="无需处理；
    如需执行其它任务源可用 /run-dag-tasks"）——agent 零猜测/不闲聊/不自作主张，与
    "控制权不经叙述传递"（第 16 条）不矛盾：指示只界定 agent 当下的轻动作，不含
    循环控制动词。渲染例见 implementation-blueprint §3 模板骨架段。
    **补充强调（同日）：异常路径叙述尤其要结构化**——骨架=事件类型/任务键/异常事实
    （reason 摘要截断）/处置状态（三层阶梯当前层与动作）/指示；**reason 全文只进
    裁决问询**（叙述面摘要——分级呈现，防长文本污染主会话）；处置代理决策内容
    （动作+参数摘要+下一步）必须入叙述，处置链路对主会话可追溯。
    **再补充（同日）：内容要简要，长内容落盘——"一个任务一个文件夹，一次问题事件
    一个子文件夹"**——`logs/<slug>/<taskKey>/<序号>-<事件类型>/`（如
    001-blocked/、002-worker-aborted/：自增序号+事件类型后缀自明；同一事件的
    error.log/settlement.json/triage.md 内聚，**一个任务多次问题互不混档**；多模态
    可扩展），叙述**仅带本次事件子文件夹路径**行；分级呈现三档=叙述摘要 / 事件
    子文件夹（多模态，人/agent 可按需读）/ 裁决问询全文。

25. **消息文案全面排查裁决（用户，2026-10-11）**：消息要**简要、直观、明确——不
    增加用户和 agent 的心智负担**，全面排查并改定——① 机制词零出现：**"处置代理
    决策"→"已自动分析原因并创建修复任务"**；**"处置已由宿主循环接管"→"无需处理
    ——系统会自动继续"**；"adopt/退避/follow-up/收口"等一并退场（机制细节留
    blueprint/decisions）；② 类型行简化 `[forge 派发循环·X]`→`[forge·X]`；③ 字段名
    用户化：余量→剩余、状态事实→事实、"处置状态"行→"系统"动作行；④ 文案原则=
    用户视角动词，用户只需知道三件事：发生了什么/系统做了什么/要不要我管。全谱
    渲染例见 notification-samples.md（十七场景）。

26. **落盘路径修正（用户质询，2026-10-11）**：原设计 `logs/dispatch/<slug>/...` 的
    dispatch 中间层无既有惯例依据（设计时引入的冗余分层）；修正为与既有事件日志
    同根同维度——`logs/<slug>/<taskKey>/<序号>-<事件类型>/`（既有 `logs/<slug>.jsonl`
    容器事件流不变，任务详情目录 `logs/<slug>/` 与之并存——同 slug 维度，零新增
    中间层）。

27. **消息收件人防混淆裁决（用户，2026-10-11）**：结束/停止类消息含指令文本
    （"/run-dag-tasks …"）是给用户的提示，但 agent 同样读到——若 agent 自动执行
    （如调 dispatchTask 起循环）会造成消息→执行→消息**无限循环**。两步改定：
    ① 提示/指示分离（初稿）——被 ② 修订：**"提示/指示"是近义词对，agent 无法从
    词面辨析面向对象**——改**收件人行**：`key: val` 统一格式（与其它行一致），`Agent 指令:` 行=行动指示（每条必有、位于前），`用户提示:` 行=指令提示（仅结束/停止类、位于 agent 行下方）；agent 行文案自释（"下一行仅供用户，勿自动执行"）。
    软防线（v1）；若 dogfood 发现 agent 仍自动执行，升级路径：指令提示撤出消息正文
    仅入问询 UI，或 dispatchTask 对刚收循环结束叙述的会话短期拒绝（后续提案评估）。
    ③ 格式统一（同日续）：收件人行与其它行一致用 **key: val 单冒号**（`Agent 指令:` /
    `用户提示:`），**值内零冒号**（用逗号/破折号）；**用户行置于 agent 行下方**（agent
    先读到自己的指令，文案自释相应为"下一行"）。
    ④ **单行合并定稿（同日，取代 ②③ 的两行方案）**：两行仍嫌繁——合并为**一行
    `下一步动作:`**，封闭两值：`无`（不需要任何处理）或 `提示用户"<指令文本>"`
    （需要转达时，如 `下一步动作: 提示用户"执行 /run-dag-tasks 派发其它任务源"`）；
    **动作语义自定向**——动作宾语在用户侧（agent 执行的是"提示"这一转达，指令由
    用户决定是否执行），agent 不会把指令据为己有，防无限循环；一次消息一个动作
    字段，用户与 agent 零歧义。

28. **叙述通道分流裁决（用户质询，2026-10-11）**：质询"除调度 worker 外发送 user
    消息给主会话合理吗"——成立。事实：followup()=user 消息=主会话新回合=一次模型
    调用；全谱 followup 则 10 任务容器 ≈20+ 模型回合消化"知道了"级内容（原问题 1
    换形态留存），且 #27 防循环工程本身即症状——需防御收件方行动的通道，说明内容
    本非对话回合。根因=用户可见性（显示面）与模型感知（输入面）混用同一条通道。
    **改定：按事件级分流**——① 常规进行事件（启动/领取/完成/自动处理/自动重试，
    样例 ①-⑫）经 inject() notice 形态：不唤醒 driver（**零模型回合**）、对话流渲染
    ContextMessageNode 行（producer 归因、折叠 ≤120 字符摘要、展开全块、详情落盘
    带路径）、模型于下次自然回合作为前置上下文消化（用户中途问进度恰好命中）；
    ② 终局叙述（收口/受阻停止/连续失败停止/停止，样例 ⑬-⑰，每循环 1–2 条）经
    followup() 完整骨架消息（#24/#27 全套规则保留，防循环面收缩至此）；③ 人工裁决
    一律 userQuestions 不经主会话（既定）。文案规格（骨架/封闭值/机制词禁令/落盘）
    通道无关全保留；SC7 加严"常规事件零模型回合"。上游缝已核实：ui-conversation
    records.ts ContextMessageNode（kind 'context'，form 'notice'，producer 归因）
    ——notice 行在对话流立即可见。

29. **S6 e2e 三旅程失败根因定罪（fix-1，2026-10-11）**：uf3-dispatch-entry / sc5-expedition-chain /
    dogfood-sc-m3 三旅程全数折在派发入口断言（uf3 :153 会话头预设投影标签、sc5 :88 远征模式标签、
    dogfood :375 会话 A 派发指令单行）。定罪 = **第三机制**，S7 投影注册与 S2/S5 消息提交时机均排除：
    ① S7 排除——forge-dispatch-loop 投影是纯 fold（只读 command/run+done 派生 {sourceSlug,status}），
    仅喂 sidebar 徽标，零转录面零相位面接触；② 提交时机排除——S5 autosend 提交本身成功送达，无竞态。
    真因：**known command 经上游 slash 仲裁路由 command plane 后注册表零转录**（上游 dsh-commands
    实证："The registry itself submits nothing"、"the composer never echoes it"；GenericCommandCard
    只渲染名不渲 args）——`/run-dag-tasks <slug>` 永不落会话转录；且命令执行零 turn/start，上游
    sessionListMetadata 投影 `blank = state.blank && event.type !== 'turn/start'` 恒 true → 会话恒
    blank/hero 相位 → 会话头预设投影标签（非 blank 面，hideChrome=blank）永不挂载、hero 座位永不退场。
    第三层裁决问询卡在 blank 视图内挂载即成转录面唯一内容（"接管会话视图"表象）。修复 = S2 producer
    显式提交（/plan 先例 `agent.steer(createUserMessage)`——上游契约 "An idle driver starts a turn"）：
    启动成功后经 agent.steer 提交 `/run-dag-tasks <slug>` user 消息——转录承载与非 blank 化同径兑现，
    fail-soft（steer 面缺席/抛错只告警）。SC4 裁决问询路径零触碰。**残留风险在案（另案裁决）**：dogfood
    halt 注入前提「不存在 provider → spawn 组装恒拒」与当前栈不符（in-process driver 经
    resolveChildAgentOptions 透传 agentOptions，provider 解析在子代理模型调用时点——实证
    worker-abort-over-limit ×4 问询卡）——dogfood ① 分支 `logs tool-error ERR_SPAWN_FAILED ×3` 断言
    预期走 worker-abort 阶梯路径，需真实模型走查复验后定夺（恢复 spawn 装配校验 or 重定基线）。

30. **循环视觉标记裁决（用户，2026-10-11）**：sidebar 徽标**弃文字改图形**——经三方案
    （环轨/流光边框/沉浸光环，预览页 v1）+ 排除光环（"会话行本身就有徽标"）+ 收敛
    三变体（v2）后定 **R2·左缘流光**：1.8 文字徽标（启动中/派发循环中/停止中）**整体
    退役**，会话行左缘 2-3px 流光即标记（running=蓝色连续流动；starting/stopping=
    琥珀静态左缘；终态=无标记，同 1.8 活循环族语义）。设计原则=**扫视层归图形，
    语义层归文字**——三态词与 slug 不消失，退至 hover 卡与 aria-label（D30 纪律
    延续）。附注：预览示意的完成计数（2/9）超出投影数据面（{sourceSlug,status}），
    不在本任务范围；token 纪律（禁裸值）、reduced-motion 静态降级、仅活循环行
    有动画、树/平铺双视图随行、终态渐隐 2s 均为实施约束。预览工件=
    walkthrough/loop-visual-marker-preview{,-v2}.html（过程文件留盘不进 git）。

31. **notice 展开体上界核实（用户质询"确定可以展开吗"，2026-10-11）**：展开链路三段
    全部查实——①普通 notice 行（不唤醒）=ContextInjectionRow（DisclosureRow
    expandOnRowClick）→ NoticeBody → ModelFacingContent `<pre>` 逐字渲染（真实换行
    保留）；②唤醒型（turn-trigger 变体，终局 followup 等开回合的非人类消息）有专用
    渲染器 TurnTriggerNodeView（生产者图标+归因标题+时间，展开同 NoticeBody），不落
    UnknownNodeView JSON 兜底；③展开体文本上界=ui-chat ContextBody.tsx
    `MAX_CHARS=20_000`（"bounded at the disclosure, not at the producer"）——17 场景
    骨架最长数百字符，余量两个数量级，无截断风险。结论：展开态零工作量，`1.15`
    只需做折叠摘要丰富（专用单行摘要替代整段截断）。

32. **循环进度可见化裁决（用户，2026-10-11）**：期望"循环进度展示在对话面板中，跟
    思考块、工具执行结果等一样"。机械边界=流内逐条交错是上游渲染架构所有物（对话流
    =会话日志，notice 领取才落日志——实证 #31），不动 dsh 源码（用户约束）即不可得。
    **改定：`1.16` 常驻活动条为载体**（保留此前误注册任务并重定义）——落点①会话视图
    对话区顶部细条，用 `dsh-client-ui-primitives` 的 DisclosureRow **同族原语**渲染
    （与工具执行结果行视觉同款），数据=既有 RPC（queryTask records+listTasks）+S7
    投影门控，**不经过 inbox 所以比 notice 更实时**（无"等领取"延迟）。三属性取舍：
    视觉同款 ✓ / 面板内 ✓ / 气泡间交错 ✗（dsh 领地，明示放弃）。notice 通道不动
    （#28 模型上下文职责不变），`1.15` 摘要丰富照旧。

33. **实现机制升级：客户端插件槽位组件（用户点破"一切皆插件"，2026-10-11）**：用户
    质询"能否在 ChatView 插槽中添加自定义控件"——**能，#32 的"气泡间交错 ✗"之外
    全部升级**。实证先例：ui-user-questions 纯客户端插件 declare-module 注册
    'conversation.plan-review.actions' session 作用域槽；inbox 投影可被客户端插件
    订阅（client/index.ts:312 faceOf('inbox').subscribe）；uiConversation.events
    可注册节点定义。**`1.16` 实现机制据此升级**：apps/web 客户端插件贡献 session
    视图槽位组件，数据面三层——①inbox 投影订阅（**未领取 notice 实时可见**，突破
    #32"等领取"限制）；②forge-dispatch-loop 投影（门控）；③既有 RPC（时间线/计数）。
    渲染=DisclosureRow 同族折叠行。边界不变处：槽位位置固定（消息列表顶部等），
    **历史气泡间严格时序交错仍为上游领地**（本裁决不再要求）。上游缝的精确形状
    （哪个槽位/挂接点）执行时按 S7 先例核实并记录。

34. **流内交错定案：会话事件词汇扩展（用户否决 1.16 槽位条后定案，2026-10-11）**：
    用户连续追问"不进消息流吗/能否插进消息流"后否决槽位条（1.16 rejected），要求真·
    流内交错。可行性实锤=上游 SessionEventMap **merge-extensible**（session/src/index.ts:189
    "SessionEventMap is merge-extensible; plugin-owned events carry no core message" +
    types.ts:430 "plugin-merged extensions included"）——**插件可拥有自己的会话事件
    类型**。改定：宿主 plugin-forge declare-module 扩展 `'forge/progress'` 事件类型，
    循环 driver 每次领取/结算/迁移向 owner 会话 append；apps/web 客户端注册节点定义
    渲染为 DisclosureRow 同族折叠行（seq 时序、真·流内交错、append 即时、零回合
    唤醒、持久可重放）。notice 通道（#28）保留=模型面；forge/progress=用户面，
    非模型面（surface 关系为执行时待核实三缝之一）。三缝：①append 权限链；②
    surface/`@messageProjection` 关系（预期声明为非模型面=零回合加分项）；③typert
    协议同步。1.16 已 rejected（用户 UI），本条取代其规格。

## 二、上游编排面调研盘点（2026-10-11）

**dsh-dag-orchestrator（npm/GooDAnDReaDY）已废弃**——0.1.5 起编排内置进 DSH，其替代
映射：workflow 工具（JS 编排脚本 fan-out）/ subagent(agentPreset) / ralph 工具
（fresh-agent 循环）/ Agent Teams（0.1.7 实验面）。

**上游无任何内置面同时覆盖"DAG 就绪选择 + 状态层结算 + 后台长活循环"三件套**：

| 上游面 | 形态 | 与本提案的关系 |
|---|---|---|
| workflow 工具 | 模型写 JS 脚本 fan-out subagent；前台阻塞整个 run；插件可 `ctx.workflowEngine.start()` 程序化起跑 | 不适配承载：`agent()` hook=裸 subagent prompt 不承载 forge worker 组装面（dispatchPrompt 零进上下文/toolFilter/submitTask gate）；run 为前台 await 型（ralph 局限明示无后台收集）与指令即回冲突 |
| ralph 工具 | 固定前台 fresh-agent 循环（不可变 objective + bounded handoff + 轮上限） | 无 DAG、前台阻塞、completion=worker 自报（forge 有状态层 gate 更严）；其"前台无后台收集"局限正是本提案补的位 |
| subagent(agentPreset) | 有界单次委托 | forge worker spawn 已有等价物（in-process driver） |
| Agent Teams（实验） | 团队/共享看板/信箱 | 远期参考（多任务源多活阶段） |
| ~~dsh-dag-orchestrator~~ | 已废弃 | 其"DAG+看板+恢复"诉求已被上游内置面分食；本提案 DAG 事实源是 forge 状态层（claim/gate/幂等重入/事件日志） |

**机械借鉴**（不承载）：workflow 引擎的事件对纪律（agent-start/end 配对）、observe-only
事件载荷（监听者拿不到取消权）、dispose 生命周期（cancel+await cleanup）、fatal-error
纪律（hook 误用炸整个脚本而非静默 null）——循环状态机实现的参照系。

**官方 subagent 观察面板（dsh-client-ui-subagent）**：父会话头部后代计数触发器 →
目录树（任意深度：运行状态/token 用量/活动 turn 时长，键盘可导航）→ 右侧 Sidebar
打开任意后代会话；one-shot worker 完成后=只读执行记录（descriptor mode:'one-shot'
天然契合）；普通会话列表刻意不混入子会话。
