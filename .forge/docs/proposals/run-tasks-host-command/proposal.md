---
created: 2026-10-11
author: faner <huifengpanda@gmail.com>
status: Draft
intent: enhancement
---

# 提案：/run-dag-tasks 指令——run-tasks 宿主化重构（宿主事件驱动派发循环）

> **文档结构**：本提案=核心逻辑（问题/方案/备选/范围/风险/判据）；[decisions.md](decisions.md)
> =二十八项过程裁决与上游调研盘点；[implementation-blueprint.md](implementation-blueprint.md)
> =实现蓝图（包范围/API 影响/核心伪码/四流程图）；[notification-samples.md](notification-samples.md)
> =叙述消息样例全谱（十七场景——notify 模块实现规格与测试锚）。

> **术语定名**：**宿主派发循环**（每轮=领取→派发→结算→判定续派；dispatcher 会话不退役
> ——`/run-dag-tasks` 在会话中执行，该会话保留身份锚 claim/links/worker parent，循环
> 逻辑由宿主代码承载、模型不解释协议）· **主会话**（发起会话=dispatcher 会话；身份锚
> 与叙述目的地）· **worker**（dispatchTask 经 in-process driver spawn 的一次性子会话）
> · **处置代理**（异常处置专用的一次性 subagent，与 worker 同款形态，结构化决策输出
> 由宿主执行）· **循环来源标记**（宿主循环领取时在 claim 记录留的持久痕迹——重启后
> 对账 interrupted 的判据；links 挂主会话真实 id）· **follow-up fix**（阻塞结算的跟进
> 任务=状态层普通任务行（fix-N 前缀 local id），挂接源任务（source_task 引用+
> block_source 同事务置源 blocked），fix 完成自动恢复源任务；创建者=worker 提交
> blocked 时自动派生（典型）/ 处置代理 add-fix 决策（第二层）。"blocked 无 follow-up"
> =修复路径缺位、任务卡死，第二层触发条件）· **adopt**（接管——scoped 循环领取任务源
> 内既有 in_progress，区别于按会话 links 的幂等重入）· **interrupted**（中断——进程
> 重启真化的非终态）。
>
> 本提案是 run-tasks skill（dispatcher agent 会话承载循环）的平台化重构，非就地增强。

---

## 0. 问题（具体陈述 + 证据 + 紧迫性）

**现状**：派发循环由 dispatcher agent 会话承载——`/run-tasks <slug>` 触发 run-tasks
skill（`packages/plugin-forge/skills/run-tasks/SKILL.md`，168 行），agent 逐轮解释执行：
每轮调一次 `dispatchTask`（后台）→ `job_output` drain → 再派发，直到 no-task。

三个具体问题：

1. **dispatcher 会话成本**：循环全程驻留 agent 上下文——168 行协议文本 + 每轮回执/结算
   消化；循环越长 token 越大，且叙述占用户会话。SKILL.md 需要以 `<EXTREMELY-IMPORTANT>`
   四条 Iron Laws 防守 agent 行为——"靠文本约束智能体"的脆弱信号。
2. **循环可靠性依赖 agent 解释**：四出口处置、bounded patience、fix 链派生时机全靠
   agent 遵循文本；漏一步即协议破坏（无机械保证）。
3. **入口割裂**：会话内指令必须带参（slug 要人记）；GUI 派发按钮只在任务 tab 内。

**紧迫性**：循环机械（DAG 就绪选择/原子 claim/后台派发毫秒回执/结算后置交付/事件总线）
在 forge 状态层与 dispatchTask 后台模式中**已全部存在**（`dsh-forge-async-dispatch`
落地）——缺的只是"结算后续派下一轮"的驱动者。上游 dsh-commands / user-questions /
`agent.inject()`/`agent.followup()` 叙述面已核实可用（/plan 先例+ui-conversation context 行）。宿主化此刻是增量最小窗口。

## 1. 方案（用户可观察行为）

**选定**：宿主事件驱动全托管（Challenge Override 记录见 decisions.md §一.1）。

用户在任意会话输入 `/run-dag-tasks`：

1. **枚举**：宿主经 `forgeTasks.listTasks` 单查询派生"尚有非终态任务的任务源"清单
   （feature + blitz 提案双轨）；
2. **选择**：`userQuestions.ask` 弹选项列表（与 ask_user_question 同一渲染面）；带参
   `<slug>` 直通；
3. **启动**：判定**派发**（无 in_progress）或**继续**（worker 在飞→订阅结算；已终止→
   adopt 重入），向主会话经叙述通道注入启动模板（通道分流见
   decisions.md #17/#28——启动类=inject·notice 零模型回合，终局类才 followup）；
4. **循环（v1 严格串行）**：领取→**领取通知**→委托 subagent 异步执行→结算→**结果
   通知**→判定（fix 链已在 worker 侧自动 spawn→续领；blocked 无 follow-up→处置代理；
   no-task 三态判词工具已附载）→下一轮，直到任务源 settled 收口。状态机按 in-flight
   集合建模（v1 恒 ≤1，为并行留缝不实现）。

   **异常处置三层阶梯**（先模型智能处置，处理不了/重试多次才升级）：
   - **第一层·机械守卫**：spawn 失败→**退避后**幂等重入（不立即重试，间隔递增，×3
     halted）；worker 异常终止→adopt 重入（bounded 重试上限）；
   - **第二层·处置代理**：blocked 无 follow-up → spawn 一次性处置代理（输入=任务简报/
     blocked reason/池快照/最近记录），输出三动作枚举由宿主执行——`add-fix`（fix 参数
     由模型定，经 addTask）/ `wait-external`（外部任务源键，记录等待续领其它）/
     `ask-user`（直达第三层）；
   - **第三层·人工裁决**：处置重试超限、fix 链深 ≤6 到顶、死锁、halted → userQuestions
     附 reason 原文与处置历史，不经主会话；
5. **停止**：`/stop-dag-tasks` 独立指令直停（取消 in-flight+收口叙述+循环终态；无活
   循环=no-op 提示）。

GUI 任务 tab「派发」按钮改调同一宿主循环入口；run-tasks skill 缓切保留（`/run-tasks
<slug>` 手动入口与指令不同名并存，退役另案收口）。

**指令协议性事实**（已核实）：dsh-commands 指令在 UI command plane 执行、不产生模型
消息（"The registry itself submits nothing"）；producer 可显式提交模型可见消息（/plan
先例）。

## 2. 备选方案（诚实权衡）

| 方案 | 描述 | 权衡 | 结论 |
|---|---|---|---|
| A. 无所作为 | 现状：GUI 按钮 + 带参 skill 指令 | 零改动；三问题全部保留 | 否 |
| B. skill 无参交互分支 | `/run-tasks` 无参→agent 查任务源→问询选 slug | 改动最小；循环仍由 dispatcher 会话承载，问题 1/2 原样 | 否 |
| C. 指令入口 + agent 跑循环 | 指令做枚举+选择+steer，循环协议留 skill | 中间态；dispatcher 依赖保留，双载体同维护 | 否 |
| **D. 宿主事件驱动全托管** | 本提案：指令=入口编排，循环=宿主结算驱动续派 | 循环协议卸载宿主代码（会话保留身份锚）、机械保证、叙述零协议负担；代价=协议翻译+呈现面新增 | **选定** |
| E. workflow 引擎固定脚本 | 循环写成 ctx.workflowEngine 脚本 | `agent()` hook 不承载 forge worker 组装面；前台 await 型与指令即回冲突 | 否（机械不适配） |
| F. 复用 ralph | 单 objective fresh-agent 迭代 | 无 DAG、前台阻塞、completion=自报；形态错位 | 否 |

上游编排面生态位盘点与机械借鉴清单见 decisions.md §二。

## 3. 范围

**In-scope（交付级；机械细节见 implementation-blueprint.md）**：

| # | 交付物 | 落点 |
|---|---|---|
| S1 | **宿主派发循环驱动器**：派发循环状态机（v1 严格串行，in-flight 集合建模留并行缝）、no-task 三态处置、halted guard（循环实例粘性）、bounded patience、fix 链机械规则（深度 ≤6）、异常处置三层阶梯（如 §1.4）、**循环独占守卫**（活循环任务源拒绝外部 dispatchTask——含盲选路径）、循环生命周期（v1 单活；停止入口=/stop-dag-tasks 或裁决问询）。**实现前提——dispatchTask 可拆卸壳分层**：共享核心面 `src/dispatch-core/`（claim→组装→spawn→事件发射+guard 机械+spawn 契约，身份/guardKey 参数化）与薄工具壳单向依赖（壳→核），文件边界即下线边界（工具未来随 skill 退役零波及核心面/循环/核心单测）；循环直持 SpawnWorkerHandle（不经 jobs），人面观察=官方 subagent 面板+主会话双通知 | plugin-forge 新模块 + dispatch-task.ts 薄壳化 |
| S2 | **指令两枚**：`/run-dag-tasks`（无参→枚举+问询；带参直通；跑动中再触发→问询查看/停止/替换）与 `/stop-dag-tasks`（**无参**——直接停止**同一会话**（ownerSessionId=敲指令会话）启动的活循环：取消 in-flight+收口叙述+循环终态；本会话无活循环=no-op 提示**"本会话没有派发任务"**，不附归属、不误停他会被话的循环） | plugin-forge ctx.inject(['commands'])（或 reflect.get 防御读取） |
| S3 | **adopt 与状态真化**：adopt 定向领取（忽略 links）；身份=主会话真实 id（GUI jump 天然零适配）；**运行时登记表**（进程内：活循环→任务源/主会话/in-flight/worker 子会话，重启即空=对账判据）；**循环来源标记 + 启动对账**（claim 记录留标记；in_progress ∧ 带标记 ∧ 登记表空 → `interrupted` 新状态；skill 路线不命中不波及）；**逐个领取逐个恢复**（每轮优先定向领最早中断的一个，不经 pending 池——claim 就绪选择零改动）；循环主动终态的 in-flight 同真化 interrupted；contracts 状态词汇/迁移+GUI chips/筛选/终态判定适配 | core claim/状态机 + contracts + plugin-forge + GUI |
| S4 | **双通道呈现·通道分流（#28）**：每任务两条叙述（领取+完成）——常规进行事件（启动/领取/完成/自动处理/自动重试）经 inject() notice 注入主会话，**零模型回合**（不唤醒会话；对话流渲染 context 行带 producer 归因，折叠行 ≤120 字符摘要、展开全块；模型于下次自然回合作为前置上下文消化）；终局叙述（收口/受阻停止/连续失败停止/停止，每循环 1–2 条）经 followup() 完整骨架消息。**消息简要、直观、明确——不增加用户与 agent 心智负担**（用户裁决 2026-10-11 全面排查）：统一骨架=类型行/任务源/任务键/事实（摘要）/剩余/**系统动作**（异常时）/**agent:** 行（每条必有、位于前）/**用户:** 行（仅结束/停止类、位于 agent 行下方）；**文案原则=用户视角动词、机制词退场**（"处置代理""宿主循环""adopt""退避""follow-up"不进消息——用户只需知道：发生了什么/系统做了什么/要不要我管；机制细节留 blueprint/decisions）；指示为**封闭枚举**且全部"无需处理"族；**下一步动作行**（单行合并，封闭两值）——`无`（无需任何处理）或 `提示用户"<指令文本>"`（需转达时）；**动作语义自定向**——宾语在用户侧（agent 只做转达，指令由用户决定执行），防 agent 自动执行导致消息→执行→消息无限循环（用户裁决 2026-10-11）；reason **全文只进裁决问询**（叙述面摘要）；处置决策以用户视角呈现（如"已自动分析原因并创建修复任务 fix-3"）。**长内容落盘**：**一个任务一个文件夹，一次问题事件一个子文件夹**——`logs/<slug>/<taskKey>/<序号>-<事件类型>/`（自增序号+事件类型后缀；同一事件的 error.log/settlement.json/triage.md 内聚，多轮问题不混档；多模态可扩展），叙述**仅带本次事件子文件夹路径**；**主会话仅感知**；叙述通道 fail-soft（全谱渲染例见 notification-samples.md） | plugin-forge |
| S5 | **GUI 缓切切换**：派发按钮 new 路径=**构造 `/run-dag-tasks <slug>` 指令单行**（既有 openSessionWithPreset+autosend 管道原样——上游 slash 仲裁将 known command 路由至 command plane 执行，新会话即主会话；**零新增 RPC**）；jump 天然工作零适配；`DISPATCH_COMMAND_PREFIX` 换值为新指令名（`/run-dag-tasks `）；受牵测试锚迁移；skill 本次不退役（README 注记并存说明） | apps/web + skills/README + 测试 |
| S6 | **测试**：循环状态机单测（每轮流转/adopt/halted/fix 规则/耐心耗尽/退避间隔递增）、指令 handler 单测、claim adopt 与对账隔离单测、核心面独立单测（不依赖工具面）、GUI 路由测试更新、e2e 冒烟 | 各包 |
| S7 | **dispatcher 会话徽标**：会话投影键 `forge-dispatch-loop`（/plan 同构——折叠既有 command/run 日志派生 {sourceSlug, status}，零新增记录）；GUI 渲染——上游 sidebar 徽标缝任务内核实，兜底=概览/任务 tab 挂接会话行 | plugin-forge（投影 unit）+ apps/web |

**Out-of-scope（明确不做）**：

- run-tasks skill 退役与 fix 链文本搬家（缓切——验收后另起小提案）；
- 多任务源并行循环实例（v1 单活）；单任务源多任务并行派发（v1 串行，建模留缝）；
- worker 配置面扩展（forgeSettings 之外）；
- CLI / headless 入口（command 面依赖交互 UI，上游既定）；
- 概览页循环状态卡片；worker 观察面自建（采用官方 dsh-client-ui-subagent）；
- GUI 中断循环按钮（v1 停止入口=指令；按钮为后续方向）；
- dsh-dag-orchestrator / 看板等外部集成；
- dispatchTask 工具 schema 与常规语义变更（内部分层除外；例外：活循环任务源独占拒绝守卫
  落 claim 面）。

## 4. 风险与缓解

| # | 风险 | 缓解 |
|---|---|---|
| R1 | ~~合成会话身份涟漪~~ 已随身份修订消除（links/records 挂主会话真实 id，GUI/审计零漂移）；残余小面=claim 记录循环来源标记字段 | 标记落 contracts 单点定义；仅对账消费，其余读面零感知 |
| R2 | **处置代理决策质量**：误 fix/误等待；结构化输出无效或越权 | 三动作枚举收窄（无第四种）；无效/越权计处置失败（入重试上限）；fix 经 worker 侧 AC gate+测试门兜底；同任务处置计数封顶强制升级——模型失误爆炸半径=有界重试轮次 |
| R3 | **上游服务装配可达性**：commands/userQuestions 注入（cordis 4.0.4 无 `?` 可选 inject 后缀） | reflect.get 防御读取配方（forgeSettings 先例）；缺席=指令不注册 fail-soft；预设装配测试 pin |
| R4 | **叙述通道的会话存活依赖**：主会话删除/关闭后叙述注入（inject/followup）失败 | fail-soft 静默降级（仅看板+问询）；循环正确性只依赖宿主事件（SC7 验收项） |
| R5 | **GUI 测试锚迁移**：`/run-tasks <slug>` 模板锚随 `DISPATCH_COMMAND_PREFIX` 换值牵动（skill 面不动——缓切收窄爆炸半径） | S5 单任务整体收口；迁移清单 breakdown 阶段逐文件列出 |
| R6 | **interrupted 新状态牵动面**：contracts/迁移矩阵/GUI 判定；对账边界误伤 skill 路线 in_progress 会破坏其幂等重入 | 对账判据三重收敛单测 pin；与 skill 路线（记录无标记）隔离测试先行；GUI 终态判定表驱动覆盖新态 |

## 5. 成功判据（可测）

| # | 判据 | 对应交付 |
|---|---|---|
| SC1 | 指令族成立：`/run-dag-tasks` 无参可发现可执行——列出且仅列出尚有非终态任务的任务源，选中即启动循环，主会话收到派发或继续模板叙述；`/stop-dag-tasks` 直停生效（**仅停同一会话启动的循环**——in-flight 取消、结束叙述、循环终态；本会话无活循环=no-op 提示"本会话没有派发任务"，不附归属） | S2/S4 |
| SC2 | 宿主循环全托管：按 DAG 就绪顺序逐任务派发（claim→spawn→settle→续），**循环全程零模型参与**（dispatcher 会话仅身份锚+叙述感知）；任意时刻 in-flight ≤1（串行可测）；任务源 settled 后收口并终止 | S1 |
| SC3 | 继续语义与状态真化：worker 已终止→adopt 重派；在飞→订阅不重复派发；**重启对账**——带循环来源标记的遗留 in_progress 标记 interrupted（skill 路线不受影响）；**恢复=逐个领取**（优先定向领最早中断一个，不经 pending 池批量重排）；循环主动终态 in-flight 真化 interrupted；links/records 挂主会话真实 id（GUI jump 天然工作） | S3 |
| SC4 | 三层阶梯成立：spawn 失败→退避后幂等重入（间隔递增可测，×3 仍败 halted 问询）；worker 异常终止→adopt 重派（超限问询）；blocked 无 follow-up→**处置代理被 spawn 且产出结构化决策**（add-fix/wait-external/ask-user），宿主忠实执行；处置重试超限/fix 到顶→userQuestions 附 reason 与处置历史；裁决不经主会话；**异常叙述=用户视角文案**（系统动作行呈现"已自动分析并创建修复任务"等，机制词零出现）、reason 为摘要、长内容落盘仅带事件子文件夹路径（全文仅进问询） | S1 |
| SC5 | 守卫宿主化：死锁问询（blocked 键清单）；spawn 连败 ×3 循环停+问询；耐心耗尽收口建议重派；**循环独占——活循环期间外部（含主会话）dispatchTask 触达该任务源被拒并附指引** | S1 |
| SC6 | 缓切切换完成：GUI 派发按钮构造 `/run-dag-tasks <slug>` 单行（新会话 autosend——command plane 执行，零 `/run-tasks <slug>` 旧模板残留，`DISPATCH_COMMAND_PREFIX` 换值）；skill 与指令不同名并存（手动入口照常）；全量测试绿 | S5 |
| SC7 | 双通道成立：每任务领取+完成两条主会话叙述（notice·零模型回合，不唤醒可测），终局 followup 1–2 条不漏；**每条叙述=固定骨架（key: val 单冒号、值内零冒号）+用户视角文案（机制词零出现）+`下一步动作:` 行取自封闭两值（无 / 提示用户"<指令>"）**（用户与 agent 零心智负担；提示值宾语定向用户侧——防 agent 自动执行无限循环，可测）；裁决一律问询 UI；叙述通道注入失败循环照常结束 | S4 |
| SC8 | dispatcher 会话可识别：`forge-dispatch-loop` 投影键携带 {sourceSlug, status}，GUI 至少在兜底面渲染徽标；折叠自既有 command/run 日志（零新增记录） | S7 |

## 6. 一致性检查（强制项·已执行）

- 逐对：SC1↔S2/S4、SC2↔S1、SC3↔S3、SC4↔S1、SC5↔S1、SC6↔S5、SC7↔S4、SC8↔S7 ✓
- 反向：S1↔SC2/4/5、S2↔SC1、S3↔SC3、S4↔SC1/7、S5↔SC6、S7↔SC8、S6 支撑全部 ✓
- 矛盾扫描：SC2"零模型参与"与 SC7"叙述进主会话"不冲突——主会话是呈现面，不承载循环 ✓

**检查结论：通过，无未解冲突。**

## 7. 伴生文档

- **[decisions.md](decisions.md)** —— 二十八项过程裁决（含修订轨迹：身份/缓切/退避/
  三层阶梯/按钮形态/stop 作用域等）与上游编排面调研盘点（dsh-dag-orchestrator 废弃、
  workflow/ralph 生态位、官方 subagent 面板）。
- **[implementation-blueprint.md](implementation-blueprint.md)** —— 实现蓝图：包范围、
  受影响 API 清单、核心代码形状（指令注册/循环状态机/三层阶梯判定/启动对账/
  dispatchCore 分层与 spawn 细节）、四幅流程图（总链路/每轮分支/三层阶梯/重启对账）。
- **[notification-samples.md](notification-samples.md)** —— 叙述消息样例全谱：统一骨架
  与规则（指示封闭枚举/长内容落盘/分级呈现）+ 十七场景渲染例（常规 6 + 异常 8 +
  收口停止 3）。
