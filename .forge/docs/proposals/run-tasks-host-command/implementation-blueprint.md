# 实现蓝图——run-tasks-host-command

> 本文档从 [proposal.md](proposal.md) §8 抽离（2026-10-11 精简裁决），是 blitz 直挂
> （无 tech-design）的机械锚点：包范围 / 受影响 API / 核心代码形状 / 流程图。
> 决策依据与修订轨迹见 [decisions.md](decisions.md)。

## 1. 改动的包范围

| 包 | 改动 | 对应交付 |
|---|---|---|
| `packages/contracts` | `TaskStatus` 词汇 + `interrupted`；`TASK_STATUS_LABELS`（zh:已中断/en:Interrupted）；迁移矩阵常量（`in_progress→interrupted`、`interrupted→in_progress`）；claim 记录**循环来源标记**字段常量；处置代理决策 DTO（三动作枚举） | S3 |
| `packages/core` | 状态机迁移扩展（interrupted）；claim 扩展——adopt 定向领取参数 + 循环独占守卫检查；新读面 `listTasks` 支持 interrupted 过滤与中断序；新动词 `reconcileInterrupted({projectId})`（启动对账） | S1/S3 |
| `packages/plugin-forge` | 新模块 `src/dispatch-core/`（共享派发核心面+guard 机械+spawn 契约——可拆卸壳分层，工具下线零波及）；`src/loop/`（循环驱动器状态机 + 运行时登记表）；`src/commands/`（两指令 handler）；`src/triage/`（处置代理面板与结构化决策消费）；`src/notify/`（叙述模板 + 分流通道——常规 inject·notice / 终局 followup）；`src/projection/`（`forge-dispatch-loop` 会话投影 unit——S7）；`dispatch-task.ts` 薄壳化；`ForgeContextFace` 扩展（`commands`/`userQuestions` 可选消费面——reflect.get 配方） | S1/S2/S4/S7 |
| `apps/web` | 派发按钮 new 路径=构造 `/run-dag-tasks <slug>` 指令单行（既有 openSessionWithPreset+autosend 管道——上游 slash 仲裁路由 known command 至 command plane，零新增 RPC）；jump 路径天然工作；`DISPATCH_COMMAND_PREFIX` 换值；chips/筛选/`hasNonTerminalTask` 适配 interrupted | S5 |
| `packages/plugin-forge/skills` | README 缓切注记（skill 保留、指令并存说明） | S5 |
| 各包测试 + e2e | S6 清单 | S6 |

## 2. 受影响的 API

| API | 面 | 变更 |
|---|---|---|
| `dispatchTask` 工具 | 模型/RPC | **schema 零变化**；行为例外：活循环任务源独占拒绝（claim 面附带指引文本） |
| `dispatch-task.ts` 内部 | plugin-forge | 单体 execute 裂变：导出 `dispatchCore`（身份/guard 键/adopt 参数化），工具壳与循环驱动器双消费 |
| `ForgeTasksService.claimTask` | core 服务 | 扩展参数：`adopt?: TaskRef`（定向领取 in_progress/interrupted）；内部加循环独占守卫检查 |
| `ForgeTasksService`（新） | core 服务 | `reconcileInterrupted({projectId})`——对账动词（in_progress ∧ claim 记录带循环来源标记 ∧ 登记表空 → interrupted，事件 reason=进程重启）；`listTasks` 过滤/排序扩展 |
| `TaskStatus` / `TASK_STATUS_LABELS` | contracts | 新枚举值 `interrupted`（非终态） |
| GUI RPC `tasks.list/detail` | apps/web ↔ host | 返回体携带新态（chips/筛选消费） |
| `ctx.commands.register`（上游面） | plugin-forge 消费 | 新注册 `run-dag-tasks` / `stop-dag-tasks` 两枚 |
| `userQuestions.ask`（上游面） | plugin-forge 消费 | 任务源选择问询 + 三层阶梯第三层裁决问询 |
| `agent.inject` / `agent.followup`（上游面） | plugin-forge 消费 | 叙述通道分流（#28）——常规事件 inject() notice（零模型回合）、终局（每循环 1–2 条）followup() 完整消息 |
| `SessionProjectionMap`（上游面） | plugin-forge 扩展 | 新键 `forge-dispatch-loop`（declare module 合并——`plan` 键先例）：折叠 command/run 日志派生 {sourceSlug, status}，GUI 徽标数据源 |

## 3. 核心代码形状（提案级伪码——接口骨架 + 关键分支，非实现）

> **进程拓扑事实**：Desktop 主进程以 child 形态拉起**唯一**的 dsh 宿主进程
> （boot/child.ts）；主会话、worker 子代理、处置代理全是该进程内的 Agent 对象
> （cordis 子作用域，非 OS 子进程——in-process driver 经宿主 agent factory 创建、发布进
> ctx.agents）；宿主循环=plugin-forge 的 async 代码，与所有 agent 同进程。推论：进程
> 重启=循环与全部 worker 一起消失（interrupted 对账的根基）；await handle.result=
> 进程内 Promise 零跨进程开销。

```ts
// ── contracts：状态词汇扩展 ──
export const TASK_STATUSES = [
  'pending', 'in_progress', 'blocked', 'suspended',
  'interrupted',            // ← 新增（非终态——中断待恢复）
  'completed', 'rejected',
] as const
// 迁移：in_progress → interrupted（对账/循环主动终态）；interrupted → in_progress（循环定向恢复领取）

// ── plugin-forge：两枚指令注册 ──
ctx.inject(['commands'], (commandCtx) => {
  commandCtx.commands.register({
    name: 'run-dag-tasks',
    description: '启动宿主派发循环（枚举任务源→问询→全托管执行）',
    input: { hint: '[<source-slug>]' },
    handler: ({ agent, rawInput, signal }) => {
      const slug = rawInput.trim()
      return slug !== ''
        ? loopDriver.start(agent, resolveSource(slug))      // 带参直通
        : loopDriver.pickAndStart(agent, signal)               // 枚举 + userQuestions.ask
    },
  })
  commandCtx.commands.register({
    name: 'stop-dag-tasks',
    description: '停止运行中的宿主派发循环',
    handler: ({ agent }) => loopDriver.stop(agent),            // 直停；无活循环=no-op 提示
  })
})

// ── loop 驱动器（状态机骨架） ──
interface LoopRecord {
  readonly source: { kind: 'feature' | 'proposal'; slug: string }
  readonly ownerSessionId: string            // 主会话（叙述目的地）
  inFlight?: { taskKey: string; workerSessionId: string }   // v1 恒 ≤1（集合建模留并行缝）
}
const registry = new Map<LoopInstanceId, LoopRecord>()       // 进程内登记表（重启即空=对账判据）
// LoopInstanceId：启动时 crypto.randomUUID() 生成（每次 /run-dag-tasks 启动=新实例）；
// 作用=登记表键 + guard 粘性载体（spawn 失败计数挂循环实例，与主会话工具调用互不污染）
// + stop/替换定位。终态（settled/halted/stopped）即登记表删除——新实例=guard 计数复位
// （对齐原 skill"halted 无自解锁、新会话复位"语义）。进程内不持久化；持久痕迹=claim
// 记录循环来源标记（标记可含实例 id 便于审计）。

async function runRound(id: LoopInstanceId): Promise<void> {
  const loop = registry.get(id)!
  // ① 逐个恢复：任务源内有 interrupted → 定向领最早中断的一个（adopt 径，不经 pending 池）
  const stale = await core.listTasks({ source: loop.source, status: ['interrupted'], order: 'interrupted-at-asc' })
  // ② 领取（独占守卫在此面拒绝外部 dispatchTask；adopt 优先于就绪盲选）
  const claim = await dispatchCore.claim({
    identity: { sessionId: loop.ownerSessionId, loopSourced: true },  // 主会话真实 id + 循环来源标记（记 claim records）
    guardKey: id,                                              // guard 键=循环实例（非会话）
    source: loop.source,
    adopt: stale[0]?.taskRef,
  })
  if (claim === null) return onNoTask(id)                     // 三态判词：收工 / 等待 / 死锁→问询
  notify.notice(loop.ownerSessionId, CLAIM_TEMPLATE(claim)) // 领取通知①（inject·notice——零模型回合；模板见 notification-samples）
  const handle = await dispatchCore.spawn(claim)              // SpawnWorkerHandle 直持（不经 jobs）
  registry.mutate(id, { inFlight: { taskKey: claim.taskKey, workerSessionId: handle.workerSessionId } })
  const settlement = await handle.result                      // 结算消费（stop = signal/dispose）
  registry.mutate(id, { inFlight: undefined })
  notify.notice(loop.ownerSessionId, SETTLE_TEMPLATE(settlement))  // 结果通知②（inject·notice；终局类走 notify.followup——onNoTask/stop 面）
  await onSettlement(id, settlement)                          // 三层阶梯判定 → runRound(id) 续
}

// ── 叙述消息样例全谱：十七种场景渲染例（常规/异常/收口停止）独立成文档 ──
// 见 notification-samples.md（统一骨架+规则+全谱样例——notify 模块实现规格与测试锚）

// ── 三层阶梯判定（onSettlement 关键分支） ──
async function onSettlement(id, s: Settlement) {
  if (s.kind === 'success') return runRound(id)                   // 续领
  if (s.kind === 'blocked' && s.followUpFix) return runRound(id)  // worker 侧已 spawn fix → 续领
  if (s.kind === 'blocked') {                                 // 第二层：处置代理
    const decision = await triage.run(s)                      // 一次性 subagent（协议提示词+收窄工具面）
    // decision: { action: 'add-fix', ... } | { action: 'wait-external', slug } | { action: 'ask-user', note }
    if (decision.action === 'add-fix') { await addFix(decision); return runRound(id) }
    if (decision.action === 'wait-external') { await markWaiting(id, decision.slug); return runRound(id) }
    return askUser(id, decision.note)                            // → userQuestions
  }
  if (s.kind === 'spawn-failed') {                            // 第一层：退避重入（不立即）×3 → halted
    return guard.backoffAndRetry(id, s) ?? halt(id)           // 间隔递增；退避期间循环挂起（stop 可打断）
  }
  return adoptOrAskUser(id, s)                                 // worker 异常终止：adopt 重入（bounded）→ 超限问询
}

// ── 启动对账（core 新动词；插件装配时执行） ──
await core.reconcileInterrupted({ projectId })
// SQL 语义：status='in_progress' ∧ 最新 claim 记录（task_records）带循环来源标记
//         ∧ 进程内登记表为空（重启后恒真）→ status='interrupted' + 事件（reason=进程重启）
// 缓切隔离：skill 会话路线 claim 记录无标记 → 谓词不命中 → 幂等重入语义不变
//           （links 两路线同形——均挂真实会话 id，GUI jump 天然工作）

// ── dispatchCore：dispatch-task.ts 内部分层后的共享面 ──
interface DispatchCoreArgs {
  identity: { sessionId: string; loopSourced: boolean }  // 两消费者均传真实会话 id；循环另携带来源标记（记 claim records）
  guardKey: string                                       // 工具壳=会话 id；循环=LoopInstanceId
  source?: { kind: 'feature' | 'proposal'; slug: string }
  adopt?: { slug: string; localId: string }              // 定向领取（in_progress/interrupted）
}
// 工具壳（现状薄壳）：identity/guardKey 取 exec 会话——外部 schema 零变化
// 依赖方向硬约束：工具壳→核心面单向，核心面零 import 工具壳（可拆卸壳设计——
// 未来随 skill 退役卸壳时核心面/循环/核心单测零改动，文件边界即下线边界）

// ── dispatchCore.spawn 细节（异步启动 subagent——全部既有机械分层复用） ──
// ① 组装 SpawnWorkerRequest：prompt=claimTask 合成的 dispatchPrompt 全文（worker 首条
//    用户消息——人格段+三标签块；全文不入库、零进主会话上下文）；parent=主会话 Agent
//    （透传真 Agent——派生 lineage/工作目录/深度，agentOptions 缺省回退父继承）；
//    toolFilter=deriveWorkerToolFilter(taskType)（收窄矩阵 deny）；agentOptions=
//    forgeSettings.worker（缺席不携带键）；label=任务键·任务名（worker 子会话标题）；
//    signal=循环停止信号
// ② startInProcessRun（上游 dsh-subagent-in-process-driver，同进程）：创建 worker
//    子会话（裸 UUID，Agent 注册表在场——transcript 可见）；descriptor {version:3,
//    mode:'one-shot', provider:'forge-dispatch'}——绕过 ctx.subagents 服务直驱共享
//    驱动器（既有机械：per-spawn toolFilter 服务面无参数通道[async-dispatch 提案
//    负结论]、childCtx.tools.restrict 仅 child 进程内可达、自定义 provider 描述符
//    标记 forge 派发子会话；代价=SUBAGENT_DESCRIPTOR_VERSION 精确 pin 上游版本、
//    in-process-driver.ts 为全包唯一 @deepseek-ai import 面）；
//    toolFilter→childCtx.tools.restrict（child 创建窗口施加——可见性与执行同拒）
// ③ 发布即回（毫秒级）——SpawnWorkerHandle 两段式：workerSessionId=run.id（对账锚）；
//    result=run.result.then(终态投影)；dispose=幂等收尾
// 异步本质：spawn() resolve 时 worker 已开跑（模型回合/工具/自行 submitTask——AC gate），
// 循环 await handle.result = 事件循环挂起零线程占用；result 拒绝=基建故障（spawn 失败径：
// 任务留 in_progress 走幂等重入/adopt，计数进 guard）
// 人面观察（官方面板零建设）：dsh-client-ui-subagent——父会话头部后代计数触发器 → 目录树
// （任意深度：运行状态/token 用量/活动 turn 时长）→ 右侧 Sidebar 打开任意后代会话；
// one-shot worker 完成后=只读执行记录（descriptor mode:'one-shot' 天然契合）；
// composer 不被阻塞：inject()/followup() 均同步 void（notice 不唤醒零回合；followup 唤醒开新回合），await result 挂起的
// 是循环自身 async 函数——用户随时可在主会话输入（用户消息与叙述各占独立 next-turn FIFO）
```

## 4. 流程图

### 图 A · 总链路（指令入口 → 循环全托管 → 收口）

```
用户（任意会话=主会话）                     宿主进程                          状态层/用户
─────────────────────                    ────────────────                  ─────────────
  /run-dag-tasks [slug]
       │ command plane 执行（零模型 token）
       ▼
  ┌ 指令 handler ─────────────────────────────────────────────┐
  │ 无参: forgeTasks.listTasks 单查询派生候选任务源               │
  │       → userQuestions.ask 选 slug ◄────────────────────────────────── 用户点选
  │ 带参: kind 解析直通                                        │
  └──────────┬────────────────────────────────────────────────┘
             ▼ start（登记表注册：任务源/主会话 id）
  ┌ 宿主循环（v1 严格串行 · 结算驱动续派）────────────────────────────────────┐
  │  每轮: 领取 ──► 主会话通知①领取 ◄────────────────────────────────────────│──► 主会话
  │            │          (notice·不唤醒·终局才 followup)                        │   （仅感知）
  │            ▼                                                             │
  │  dispatchCore.spawn（worker 子会话）─► result 结算 ──► 主会话通知②结果     │
  │            │                                            │                │
  │            ▼                                            ▼                │
  │  三层阶梯判定（图 C）──► 续派下一轮 … 直到 no-task                        │
  └──────────┬────────────────────────────────────────────────────────────── ┘
             ▼ 任务源 settled
  收口叙述（主会话）+ 登记表注销 ── 或 ── /stop-dag-tasks 直停 / 裁决问询停止
```

### 图 B · 每轮领取优先级与结算分支

```
                    ┌──────────── 每轮开始(循环实例) ────────┐
                    ▼                                        │
     任务源内有 interrupted？                                  │
      ├─ 有 ─► 定向领最早中断的一个（adopt 径·不经 pending 池）│
      └─ 无 ─► DAG 就绪领取 pending（就绪选择 Hard Rule 不变）│
                    │                                        │
                    ▼                                        │
          dispatchCore.claim（独占守卫面）                    │
            ├─ null ─► no-task 三态：收工│等待(bounded)│死锁──┘（问询）
            └─ claim ─► 通知① → spawn → 结算 → 通知②
                                │
                                ▼
                     settlement 分派（图 C）
```

### 图 C · 异常处置三层阶梯

```
 settlement
   ├─ success ─────────────────────────────────► 续派下一轮
   ├─ blocked ∧ worker 侧已 spawn fix ──────────► 续派下一轮（fix ready 自然被领）
   ├─ blocked ∧ 无 follow-up ──► 【第二层】spawn 处置代理（一次性 subagent）
   │        输入: 任务简报/blocked reason/池快照/最近记录
   │        输出: 三动作枚举 ─┬─ add-fix(参数) ─► addTask → 续派下一轮
   │                          ├─ wait-external ─► 记录等待 → 续派下一轮
   │                          └─ ask-user ─────────────────┐
   ├─ spawn-failed ──► 【第一层】退避后同任务幂等重入 ─┐      │
   │                    （不立即重试·间隔递增·×3→halted）│      │
   └─ worker 异常终止 ──► 【第一层】adopt 重入(bounded) ─┤      │
                        （重试超限）                  ▼      ▼
                                            【第三层】userQuestions
                                            （附 reason 原文+处置历史→用户裁决）
```

### 图 D · 进程重启对账与逐个恢复（状态真化）

```
 进程重启 ──► 插件装配 ──► 启动对账 core.reconcileInterrupted({projectId})
                           │ 谓词: in_progress
                           │     ∧ 最新 claim 记录（task_records）带循环来源标记
                           │     ∧ 进程内登记表空（重启恒真）
                           │ 隔离: skill 会话路线记录无标记 → 不命中（重入语义不变）
                           ▼
              状态层: in_progress → interrupted（事件 reason=进程重启）
                           │  GUI: chips"已中断"/筛选/派发按钮亮起（非终态）
                           ▼
         用户 /run-dag-tasks 选该任务源 ──► 循环启动（"继续"模板）
                           │
                           ▼
              图 B 每轮优先级：逐个领取逐个恢复 interrupted
              （定向领最早中断的一个 → in_progress 重派 → settle
                → 下轮再领下一个；不经 pending 池批量重排）
```
