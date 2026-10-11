// loop · 宿主派发循环驱动器（S1b——run-tasks-host-command proposal S1 + SC2 +
// implementation-blueprint §3 runRound 状态机，v1 严格串行）。
//
// 全链宿主代码驱动、零模型参与：每轮 = 领取（dispatch-core 阶段一，identity.loopSourced=true、
// guardKey = LoopInstanceId）→ 领取通知（S4 notify·notice 零模型回合）→ in-process spawn
// （dispatch-core 阶段二——SpawnWorkerHandle 直持不经 jobs，decisions #14）→ 结算（阶段三，
// killSignal = 循环控制器）→ 结果通知 → 判定 → 下一轮，直到任务源 settled 收口。
//
// 状态机要点（任务 1.4 验收面）：
// ① in-flight 集合建模（LoopRecord.inFlight——v1 恒 ≤1，串行结构保证：结算返回后才续领）；
// ② v1 严格单活循环（registry.active() 全局唯一——活跃实例再 start 拒绝 loop-active）；
// ③ no-task 三态判词（classifyPool）：done → 收口叙述+循环终态 / wait → bounded patience
//    （连续 wait 轮封顶 → 结束建议重派）/ deadlock-suspected → 受阻叙述+裁决钩子+终局；
// ④ fix 链：blocked 且结算携带 followUp → 机械续领不升级；blocked 无 follow-up → 处置钩子
//    接口（LoopTriageHook，桩可注入——阶梯实现 = 任务 S1c）；
// ⑤ bounded patience（LOOP_PATIENCE_MAX_WAIT_ROUNDS——耗尽收口建议重派）；
// ⑥ halted guard 循环实例粘性（spawn 连败 ×3 由 dispatch-core guard 按 LoopInstanceId 粘住
//    → ⑬ 终局；同实例不自动复活——登记表终态即删，复活 = 新实例新计数，decisions #18）；
// ⑦ 运行时登记表（registry.ts——进程内、重启即空 = S3 对账判据）；
// ⑧ 循环生命周期入口（start/stop，供 S2 指令层调用）：停止 = 取消 in-flight（控制器 abort →
//    驱动器取消 worker 剩余回合）+ in-flight 真化 interrupted（S3 transitionTask 面）+ 收口
//    叙述（⑰）+ 循环终态注销。
//
// 依赖方向：loop → dispatch-core / notify / contracts 单向；零工具壳 import（可拆卸壳纪律）。
import type { ContainerRef, ForgeSettingsService, ForgeTasksService, TaskSnapshot, TaskStats, TaskType } from '@dsh-forge/contracts'
import { HALT_THRESHOLD, HALTED_REASON } from '../dispatch-core/index.js'
// S1c 循环独占守卫面（登记/注销——守卫消费在 dispatch-core claim 面）
import { claimForDispatch, classifyPool, settleClaimed, spawnClaimed } from '../dispatch-core/index.js'
import type {
  ClaimedDispatch,
  DispatchChainScope,
  DispatchCoreDeps,
  DispatchCoreExec,
  DispatchSpawnedResult,
  PoolSnapshot,
  SpawnWorker,
} from '../dispatch-core/index.js'
import { clearExclusiveLoopSource, setExclusiveLoopSource } from '../dispatch-core/index.js'
import { renderNarrative, summarizeReason } from '../notify/index.js'
import type { Narrator } from '../notify/index.js'
import { createLoopRegistry } from './registry.js'
import type { LoopInFlight, LoopInstanceId, LoopRecord, LoopRegistry, LoopSourceRef } from './registry.js'

// ─────────────────────────── 机械常量（第一层守卫/耐心参数） ───────────────────────────

/** spawn 失败退避基长（毫秒——第 N 次失败后退避 base×N 再幂等重入；间隔递增，decisions #11） */
export const LOOP_BACKOFF_BASE_MS = 10_000

/**
 * 退避间隔（纯函数——S1c 单测锚「间隔递增可测」）：第 N 次失败后退避 base×N
 * （1×base → 2×base → 3×base——序列递增，不立即重试，decisions #11）。
 */
export function backoffDelayMs(baseMs: number, attempt: number): number {
  return baseMs * attempt
}

/** no-task 等待判词的轮间停顿（毫秒——bounded patience 的 patience） */
export const LOOP_PATIENCE_PAUSE_MS = 30_000

/** bounded patience 封顶（连续 wait 判词轮数——耗尽收口建议重派，不无限空转） */
export const LOOP_PATIENCE_MAX_WAIT_ROUNDS = 3

/** worker 异常终止的 bounded 重入上限（⑫「第 N/3 次」；超限 → 第三层裁决钩子，decisions #16） */
export const LOOP_WORKER_ABORT_MAX_RETRIES = 3

/**
 * 同任务处置计数封顶（S1c 第二层——处置代理对同一任务的运行次数上限，成功失败均计数）。
 * 到顶强制升级第三层（R2：模型失误爆炸半径 = 有界处置轮次——不再给模型下一次机会）。
 */
export const LOOP_TRIAGE_MAX_ATTEMPTS = 3

/** 停止/启动竞态收口的 in-flight 真化 reason（S3 transitionTask 面审计列） */
export const LOOP_STOP_TRANSITION_REASON = '派发循环停止'

/** ⑯ 结束（全部完成）的「下一步动作」指示（notification-samples 逐字口径——无 slug 参数位） */
export const LOOP_INSTRUCTION_ALL_DONE = '若想派发其它提案或feature的任务，执行 /run-dag-tasks'

/** 终局叙述的「下一步动作」指示文本（notification-samples ⑬⑮⑰ 逐字口径的 slug 参数化） */
export function loopInstructionOf(kind: 'halted' | 'timeout' | 'resume', slug: string): string {
  if (kind === 'halted') return `环境排查后重新开始 /run-dag-tasks ${slug}`
  if (kind === 'timeout') return `稍后重新执行 /run-dag-tasks ${slug}`
  return `继续执行 /run-dag-tasks ${slug}`
}

// ─────────────────────────── 处置钩子接口（S1b 桩位——阶梯实现 = 任务 S1c） ───────────────────────────

/**
 * 第二层处置代理的输入（任务简报行/reason 全文/结算载荷——reason 全文只进钩子与落盘，
 * decisions #24）。每循环身份载体（S1c/S4 装配接线收口）：钩子为装配单例，循环身份
 * （主会话/parent/信号）只在 start 时点存在——经输入面逐调用绑定，装配期烘焙无效。
 */
export interface LoopTriageInput {
  readonly projectId: string
  readonly source: LoopSourceRef
  /** 主会话真实 id（处置径归属锚——decisions #6） */
  readonly ownerSessionId: string
  /** 主会话 Agent（处置代理 spawn parent——与 worker 同 parent，lineage/工作目录同源） */
  readonly parent: unknown
  /** 取消信号（循环控制器——stop 即取消在途处置） */
  readonly signal: AbortSignal
  readonly task: TaskSnapshot
  /** blocked 原因全文 */
  readonly reason: string
  /** 结算载荷（落盘 settlement.json 同源） */
  readonly settlement: unknown
}

/**
 * 处置决策三动作枚举（proposal §1.4 第二层——无第四种；宿主忠实执行）：
 * add-fix = 宿主经 addTask 建 fix 链（blockSource 置源 blocked，fix 完成自动恢复）；
 * wait-external = 原因在其它任务源（记录等待 → 续领其它）；ask-user = 直达第三层。
 */
export type LoopTriageDecision =
  | {
      readonly action: 'add-fix'
      /** fix 任务标题（缺省 = `Fix: <任务名>`） */
      readonly title?: string
      /** fix 任务类型（缺省 = coding-fix——run-tasks SKILL.md fix-chain 映射的缺省族） */
      readonly type?: TaskType
      readonly taskDesc?: string
      /** ⑧ 叙述的修复内容摘要（系统动作行括注） */
      readonly note?: string
    }
  | { readonly action: 'wait-external'; readonly externalSlug: string }
  | { readonly action: 'ask-user' }

/** 第二层处置钩子（blocked 且结算无 followUp 时触发；缺省缺席 = 仅落盘续领——S1c 注入实现） */
export interface LoopTriageHook {
  run(input: LoopTriageInput): Promise<LoopTriageDecision>
}

/**
 * 第三层裁决升级事件（问询不经主会话——userQuestions 面，S1c 实装 = escalation.ts）。
 * 载荷纪律（AC）：reason 原文与处置历史全文在载荷内（叙述面仅摘要）；ownerSessionId =
 * 主会话 id（userQuestions agent 解析与问询归属锚）。处置历史行 = 处置阶梯的逐次记录
 * （「第 N 次处置——动作/失败」），由驱动器 per-task 簿记。
 */
export type LoopEscalation =
  | {
      readonly kind: 'deadlock'
      readonly ownerSessionId: string
      readonly source: LoopSourceRef
      /** 阻塞清单（taskKey + 任务名注记——⑭ 叙述同源） */
      readonly blockedItems: readonly { readonly taskKey: string; readonly note: string }[]
    }
    | {
        readonly kind: 'blocked-ask-user'
        readonly ownerSessionId: string
        readonly source: LoopSourceRef
        readonly task: TaskSnapshot
        /** blocked 原因全文（叙述面摘要的全文落点——问询 detail） */
        readonly reason: string
        /** 处置历史（处置阶梯逐次记录——含本次决策行） */
        readonly history: readonly string[]
      }
    | {
        readonly kind: 'worker-abort-over-limit'
        readonly ownerSessionId: string
        readonly source: LoopSourceRef
        readonly taskKey: string
        readonly attempts: number
      }
    | {
        readonly kind: 'disposition-over-limit'
        readonly ownerSessionId: string
        readonly source: LoopSourceRef
        readonly task: TaskSnapshot
        /** blocked 原因全文（问询 detail——裁决全文档） */
        readonly reason: string
        /** 处置计数（LOOP_TRIAGE_MAX_ATTEMPTS 到顶） */
        readonly attempts: number
        /** 处置历史（逐次记录——无效/越权输出行在其中） */
        readonly history: readonly string[]
      }
    | {
        readonly kind: 'fix-chain-over-limit'
        readonly ownerSessionId: string
        readonly source: LoopSourceRef
        readonly task: TaskSnapshot
        /** blocked 原因全文（问询 detail——裁决全文档） */
        readonly reason: string
        /** 到顶深度（addTask ERR_CHAIN_DEPTH_EXCEEDED data 派生——缺席 = 数据不可得） */
        readonly depth?: number
        readonly limit?: number
        /** 处置历史（含本次「修复任务创建被拒」行） */
        readonly history: readonly string[]
      }
    | {
        readonly kind: 'halted'
        readonly ownerSessionId: string
        readonly source: LoopSourceRef
        /** spawn 连败次数（HALT_THRESHOLD） */
        readonly attempts: number
        /** halted 原因全文（HALTED_REASON——问询 detail） */
        readonly reason: string
      }

export interface LoopEscalationHook {
  escalate(escalation: LoopEscalation): Promise<void>
}

// ─────────────────────────── 生命周期入口（供 S2 指令层调用） ───────────────────────────

/** 启动入参（S2 指令 handler 透传：agent = 主会话 Agent——worker spawn parent 与叙述目的地） */
export interface LoopStartInput {
  readonly source: ContainerRef
  /** 主会话真实 id（claim/links 身份锚 + 叙述目的地 + stop 作用域键——decisions #6/#20） */
  readonly ownerSessionId: string
  /** 主会话 Agent（结构兼容透传——in-process driver 派生 lineage/工作目录/深度） */
  readonly parent: unknown
  /**
   * 项目覆盖（S2——指令面按敲指令会话 cwd 经绑定表解析；缺席回退 deps.projectId。
   * 双缺席 = start 拒绝——不落不可归属的循环。多工作区宿主逐会话路由的判别缝。）
   */
  readonly projectId?: string
}

/** 启动返回（v1 单活：进程内已有活循环 → loop-active 拒绝——S2 据此问询查看/停止/替换） */
export type LoopStartResult =
  | { readonly ok: true; readonly loopId: LoopInstanceId }
  | { readonly ok: false; readonly code: 'loop-active'; readonly activeSource: LoopSourceRef; readonly activeOwnerSessionId: string }

/** 停止返回（本会话无活循环 = no-active-loop——S2 据此提示「本会话没有派发任务」，decisions #20） */
export type LoopStopResult =
  | { readonly ok: true; readonly stopped: true; readonly hadInFlight: boolean }
  | { readonly ok: false; readonly code: 'no-active-loop' }

/** 驱动器依赖（装配方注入——registry 缺省自建，多驱动器共享时由装配传入单例） */
export interface LoopDriverDeps {
  /**
   * 项目缺省（可选——S2 起指令面按敲指令会话 cwd 逐会话解析并经 LoopStartInput.projectId
   * 覆盖；装配面无固定项目时缺席，双缺席 = start 拒绝 fail-loud）
   */
  readonly projectId?: string
  readonly tasks: ForgeTasksService
  readonly spawn: SpawnWorker
  /** 叙述面（notify createNarrator 产物——notice/followup/blocked 三出口 + 落盘委派） */
  readonly narrator: Narrator
  /** 事件发射面（可选——透传 dispatch-core 事件闭包，logs/<slug>.jsonl 里程碑不断流） */
  readonly events?: DispatchCoreDeps['events']
  /** forgeSettings 服务面（可选——worker agentOptions 组装同工具壳） */
  readonly settings?: Pick<ForgeSettingsService, 'get'>
  readonly resolveModelReasoning?: DispatchCoreDeps['resolveModelReasoning']
  readonly registry?: LoopRegistry
  readonly triage?: LoopTriageHook
  readonly escalation?: LoopEscalationHook
  /** 机械时延注入（测试缝——缺省生产值） */
  readonly delays?: { readonly backoffBaseMs?: number; readonly patiencePauseMs?: number }
}

/** 驱动器公开面（S2 消费：启动/停止/本会话活循环查询/单活读数） */
export interface LoopDriver {
  start(input: LoopStartInput): Promise<LoopStartResult>
  stop(input: { readonly ownerSessionId: string }): Promise<LoopStopResult>
  /** 本会话活循环（S2「跑动中再触发」的查询面；无 = undefined） */
  activeOf(ownerSessionId: string): LoopRecord | undefined
  /** 进程内活循环读数（S2「跑动中再触发」的任意归属查询面——v1 单活；无 = undefined） */
  active(): LoopRecord | undefined
}

// ─────────────────────────── 活循环内部状态（登记表行 + 运行时计数） ───────────────────────────

interface ActiveLoop {
  readonly deps: LoopDriverDeps
  readonly record: LoopRecord
  readonly registry: LoopRegistry
  readonly live: Map<LoopInstanceId, ActiveLoop>
  readonly controller: AbortController
  /** 任务源（必形——DispatchChainScope.source 为壳侧可选形，循环侧恒在场） */
  readonly source: LoopSourceRef
  /** dispatch-core 三段阶段面的共享 deps 投影（identity/guardKey/source 每轮组装） */
  readonly core: DispatchCoreDeps
  readonly exec: DispatchCoreExec
  readonly scope: DispatchChainScope
  readonly delays: { readonly backoffBaseMs: number; readonly patiencePauseMs: number }
  /** spawn 失败连败计数（⑪ 次数——×3 粘住由 dispatch-core guard 按 LoopInstanceId 兑现） */
  spawnFailures: number
  /** worker 异常终止连败计数（⑫ 次数——bounded 重入，超限第三层；结算成功复位） */
  workerAborts: number
  /** no-task 等待判词连击（bounded patience——claim 成功即复位） */
  waitRounds: number
  /** 同任务处置簿（S1c 第二层——taskKey → { 处置次数, 处置历史 }；封顶强制升级，结算成功清账） */
  readonly dispositions: Map<string, DispositionBook>
}

/** 同任务处置簿（S1c——attempts 计数封顶 LOOP_TRIAGE_MAX_ATTEMPTS；history 行进裁决问询） */
interface DispositionBook {
  attempts: number
  history: string[]
}

/** 处置簿取账（get-or-create——per-task 生命周期 = 循环实例存活期，结算成功清账） */
function dispositionBookOf(loop: ActiveLoop, taskKey: string): DispositionBook {
  let book = loop.dispositions.get(taskKey)
  if (book === undefined) {
    book = { attempts: 0, history: [] }
    loop.dispositions.set(taskKey, book)
  }
  return book
}

/** 处置决策的历史行注记（问询处置历史用——用户视角动词） */
function triageDecisionNote(decision: LoopTriageDecision): string {
  if (decision.action === 'add-fix') return `决定创建修复任务${decision.note !== undefined ? `（${decision.note}）` : ''}`
  if (decision.action === 'wait-external') return `决定等待 ${decision.externalSlug} 先完成`
  return '决定请求人工裁决'
}

/** 每轮判定返回（continue = 续派下一轮；terminal = 终局收口出循环） */
type RoundOutcome = 'continue' | 'terminal'

/** 呈现任务行（「localId 任务名」——notification-samples ④「2.8 诊断弹窗装配（Apps web）」口径） */
function taskLabelOf(task: TaskSnapshot): string {
  return `${task.localId} ${task.title}`
}

/** 可中断停顿（true = 时延到点 / false = 循环已叫停——停止立即打断退避与耐心等待） */
function sleepOrAbort(signal: AbortSignal, ms: number): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve(true)
    }, ms)
    const onAbort = (): void => {
      cleanup()
      resolve(false)
    }
    const cleanup = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** 建宿主派发循环驱动器（装配单例——S2 指令层 start/stop 的唯一入口） */
export function createLoopDriver(deps: LoopDriverDeps): LoopDriver {
  const registry = deps.registry ?? createLoopRegistry()
  const live = new Map<LoopInstanceId, ActiveLoop>()

  return {
    async start(input: LoopStartInput): Promise<LoopStartResult> {
      // S2 projectId 解析（会话工作区覆盖 > 装配缺省；双缺席 fail-loud——不落不可归属的循环）
      const projectId = input.projectId ?? deps.projectId
      if (projectId === undefined) throw new Error('派发循环启动缺少 projectId（input.projectId 与 deps.projectId 双缺席）')
      // ② v1 单活：进程内已有活循环 → 拒绝（S2 问询查看/停止/替换——停止后可再启新实例）
      const active = registry.active()
      if (active !== undefined) {
        return { ok: false, code: 'loop-active', activeSource: active.source, activeOwnerSessionId: active.ownerSessionId }
      }
      // ⑥ LoopInstanceId（decisions #18）：crypto.randomUUID()——登记表键 + guard 粘性载体
      const id = crypto.randomUUID()
      const source: LoopSourceRef = { kind: input.source.kind, slug: input.source.slug }
      const record: LoopRecord = {
        id,
        source,
        ownerSessionId: input.ownerSessionId,
        projectId,
      }
      const controller = new AbortController()
      const loop: ActiveLoop = {
        deps,
        record,
        registry,
        live,
        controller,
        source,
        core: {
          tasks: deps.tasks,
          spawn: deps.spawn,
          ...(deps.events !== undefined ? { events: deps.events } : {}),
          ...(deps.settings !== undefined ? { settings: deps.settings } : {}),
          ...(deps.resolveModelReasoning !== undefined ? { resolveModelReasoning: deps.resolveModelReasoning } : {}),
        },
        exec: {
          attribution: {},
          parent: input.parent,
          signal: controller.signal, // spawn 信号 = 循环控制器——stop 取消 in-flight 的机械通道
          verb: 'run-dag-tasks',
        },
        scope: { sessionId: input.ownerSessionId, projectId, guardKey: id, source },
        delays: {
          backoffBaseMs: deps.delays?.backoffBaseMs ?? LOOP_BACKOFF_BASE_MS,
          patiencePauseMs: deps.delays?.patiencePauseMs ?? LOOP_PATIENCE_PAUSE_MS,
        },
        spawnFailures: 0,
        workerAborts: 0,
        waitRounds: 0,
        dispositions: new Map<string, DispositionBook>(),
      }
      registry.register(record) // ⑦ 登记表注册（活循环 → 任务源/主会话/in-flight/worker 子会话）
      // S1c 循环独占守卫：登记即独占（活循环任务源拒绝外部 dispatchTask——显式 slug 与盲选
      // 两径由 claim 面消费独占表；终态/停止注销见 runLoop finally 与 stop 面）
      setExclusiveLoopSource(source, id)
      live.set(id, loop)
      try {
        await announceStartup(loop) // 启动模板叙述（①从头/②接续未完成/③接续在飞）
      } catch (cause) {
        clearExclusiveLoopSource(source, id)
        live.delete(id)
        registry.remove(id)
        throw cause
      }
      if (loop.controller.signal.aborted) {
        // 启动与停止竞态（announce 期间被叫停）——循环不启动，登记即注销
        clearExclusiveLoopSource(source, id)
        live.delete(id)
        registry.remove(id)
        return { ok: true, loopId: id }
      }
      void runLoop(loop) // 循环自身 async 挂起（零线程占用——await handle.result 即事件循环挂起）
      return { ok: true, loopId: id }
    },

    async stop(input: { readonly ownerSessionId: string }): Promise<LoopStopResult> {
      // ⑧ stop 作用域（decisions #20）：仅停同一会话启动的活循环；无 = no-op 拒绝
      const record = registry.byOwner(input.ownerSessionId)
      if (record === undefined) {
        return { ok: false, code: 'no-active-loop' }
      }
      const loop = live.get(record.id)
      // 先摘牌再 abort——停止竞态收口：runRound 各 await 恢复点见 inFlight 已清即让渡接管权
      const captured: LoopInFlight | undefined = record.inFlight
      record.inFlight = undefined
      loop?.controller.abort('loop stopped by command')
      let hadInFlight = false
      if (captured !== undefined) {
        hadInFlight = true
        await interruptedize(loop, captured.taskId) // in-flight 真化 interrupted（S3 transitionTask 面）
      }
      const stats = await statsFailSoft(loop)
      await deps.narrator.followup(
        record.ownerSessionId,
        renderNarrative('stopped-by-command', {
          sourceSlug: record.source.slug,
          completed: stats.byStatus.completed,
          inFlightTaskKey: captured?.taskKey ?? '无',
          instruction: loopInstructionOf('resume', record.source.slug),
        }),
      )
      registry.remove(record.id) // 终态即登记表删除（新实例 = guard 计数复位）
      clearExclusiveLoopSource(record.source, record.id) // S1c 独占注销（归属校验——幂等）
      live.delete(record.id)
      return { ok: true, stopped: true, hadInFlight }
    },

    activeOf(ownerSessionId: string): LoopRecord | undefined {
      return registry.byOwner(ownerSessionId)
    },

    active(): LoopRecord | undefined {
      return registry.active()
    },
  }
}

// ─────────────────────────── 循环体（runRound 状态机） ───────────────────────────

/**
 * 启动分类与启动模板叙述（proposal §1.3——① 从头执行 / ② 接续执行（上次未完成 = interrupted
 * 在场，本轮 adopt 径将定向领最早中断的一个） / ③ 接续执行（有任务正在执行 = in_progress
 * 在场——本轮 claim 无可领则走 wait 判词等待其结算/耐心收口））。
 */
async function announceStartup(loop: ActiveLoop): Promise<void> {
  const { deps, record, scope, source } = loop
  const [stale, stats] = await Promise.all([
    deps.tasks.listTasks({ projectId: scope.projectId, source, statusFilter: ['interrupted'], sort: 'interrupted' }),
    deps.tasks.taskStats({ projectId: scope.projectId, source }),
  ])
  if (loop.controller.signal.aborted) return
  const slug = record.source.slug
  const kind = record.source.kind
  const first = stale[0]
  if (first !== undefined) {
    await deps.narrator.notice(
      record.ownerSessionId,
      renderNarrative('startup-resume-stopped', { sourceSlug: slug, sourceKind: kind, taskKey: first.localId }),
    )
    return
  }
  if (stats.byStatus.in_progress > 0) {
    const cards = await deps.tasks.listTasks({ projectId: scope.projectId, source, statusFilter: ['in_progress'] })
    const inFlightCard = cards[0]
    if (inFlightCard !== undefined) {
      await deps.narrator.notice(
        record.ownerSessionId,
        renderNarrative('startup-resume-inflight', { sourceSlug: slug, sourceKind: kind, taskKey: inFlightCard.localId }),
      )
      return
    }
  }
  await deps.narrator.notice(
    record.ownerSessionId,
    renderNarrative('startup-from-scratch', { sourceSlug: slug, sourceKind: kind, pending: stats.byStatus.pending }),
  )
}

/** 循环体（启动后 fire-and-forget——异常兜底告警 + 终局登记注销双保证） */
async function runLoop(loop: ActiveLoop): Promise<void> {
  const { record } = loop
  try {
    while (!loop.controller.signal.aborted) {
      const outcome = await runRound(loop)
      if (outcome !== 'continue') break
    }
  } catch (cause) {
    console.warn(
      `forge dispatch loop terminated abnormally (${record.source.slug}): ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  } finally {
    loop.registry.remove(record.id) // 终态即登记表删除（settled/halted/stopped/异常同径）
    clearExclusiveLoopSource(record.source, record.id) // S1c 独占注销（终态同径——幂等）
    loop.live.delete(record.id)
  }
}

/**
 * 每轮（implementation-blueprint §3 runRound）：① 逐个恢复优先（任务源内最早 interrupted →
 * adopt 定向领取径）→ ② 领取（dispatch-core 阶段一）→ ③ 领取通知（S4 notice）→ ④ spawn
 * （阶段二，句柄直持）→ ⑤ 结算（阶段三）→ ⑥ 结果通知 + 三层阶梯判定 → 续派/终局。
 */
async function runRound(loop: ActiveLoop): Promise<RoundOutcome> {
  const { deps, record, controller, exec, scope, source } = loop
  const signal = controller.signal
  if (signal.aborted) return 'terminal'
  const owner = record.ownerSessionId
  const slug = record.source.slug

  // ① 逐个恢复：任务源内有 interrupted → 定向领最早中断的一个（adopt 径·不经 pending 池——
  //    claim 就绪选择零改动，decisions #12）
  const stale = await deps.tasks.listTasks({
    projectId: scope.projectId,
    source,
    statusFilter: ['interrupted'],
    sort: 'interrupted',
  })
  const first = stale[0]
  const adoptRef = first !== undefined ? { slug: first.slug, localId: first.localId } : undefined

  // ② 领取（dispatch-core 阶段一）：主会话真实 id + loopSourced=true（claim 记录循环来源
  //    标记——S3 对账判据）+ guardKey = LoopInstanceId（spawn 防线粘性载体）
  const claim = await claimForDispatch(loop.core, exec, {
    identity: { sessionId: owner, loopSourced: true },
    guardKey: record.id,
    projectId: scope.projectId,
    source,
    ...(adoptRef !== undefined ? { adopt: adoptRef } : {}),
  })
  // 停止竞态收口（claim 已落而循环被叫停）：本实例未接管的孤儿 in_progress → 真化 interrupted
  if (await bailIfAborted(loop, claim.kind === 'claimed' ? claim : undefined)) return 'terminal'
  if (claim.kind === 'halted') return haltLoop(loop) // spawn 连败 ×3 粘住（guard 入口检查兑现）
  if (claim.kind === 'no-task') return onNoTask(loop, claim.pool) // ③ no-task 三态判词

  const task = claim.task
  const taskKey = `${task.slug}/${task.localId}`
  // in-flight 立即登记（claim↔spawn 窗口的停止竞态归属锚——stop 面见此行即接管真化）
  const inFlight: LoopInFlight = {
    taskRef: { slug: task.slug, localId: task.localId },
    taskKey,
    taskId: task.taskId,
    title: task.title,
  }
  record.inFlight = inFlight

  // 领取通知（S4——notice·零模型回合；恢复径 = ⑤ claim-interrupted，常规 = ④ claim；
  // 剩余行 = claim 后池读——本任务已入执行中口径，与样例逐字一致）
  const stats = await statsFailSoft(loop)
  if (adoptRef !== undefined) {
    await deps.narrator.notice(
      owner,
      renderNarrative('claim-interrupted', {
        sourceSlug: slug,
        taskLabel: `${taskLabelOf(task)}（恢复自中断 — 重新执行）`,
        remaining: { pending: stats.byStatus.pending, interrupted: stats.byStatus.interrupted, blocked: stats.byStatus.blocked },
      }),
    )
  } else {
    await deps.narrator.notice(
      owner,
      renderNarrative('claim', {
        sourceSlug: slug,
        taskLabel: taskLabelOf(task),
        remaining: { pending: stats.byStatus.pending, inProgress: stats.byStatus.in_progress, blocked: stats.byStatus.blocked },
      }),
    )
  }
  // 通知 await 窗口的停止竞态收口（同上——stop 已接管则让渡）
  if (await bailIfAborted(loop, claim)) return 'terminal'

  // ③ spawn（dispatch-core 阶段二）：SpawnWorkerHandle 直持不经 jobs（decisions #14）；
  //    信号 = 循环控制器——stop 经 abort 取消 worker 剩余回合
  const spawned = await spawnClaimed(loop.core, exec, claim, { scope, signal })
  if (!spawned.ok) {
    record.inFlight = undefined // spawn 未成——任务留 in_progress 走幂等重入径（不走 submit-blocked）
    if ('kind' in spawned.failure) return haltLoop(loop) // HaltedOutcome——唯一 kind 承载成员（guard 粘住）
    const failure = spawned.failure // ERR_SPAWN_FAILED DTO（防线计数已按 guardKey 落面）
    // 第一层机械守卫：退避后幂等重入（不立即重试——间隔递增 base×N；×3 halted 由 guard 兑现，decisions #11）
    loop.spawnFailures += 1
    const attempt = loop.spawnFailures
    const delayMs = backoffDelayMs(loop.delays.backoffBaseMs, attempt)
    await deps.narrator.notice(
      owner,
      renderNarrative('spawn-failed-retry', {
        sourceSlug: slug,
        attempt,
        errorSummary: summarizeReason(failure.message),
        delaySeconds: Math.round(delayMs / 1000),
        maxAttempts: HALT_THRESHOLD,
      }),
    )
    if (signal.aborted) return 'terminal'
    return (await sleepOrAbort(signal, delayMs)) ? 'continue' : 'terminal'
  }
  inFlight.workerSessionId = spawned.handle.workerSessionId // 对账锚回填（登记表 worker 子会话位）

  // ④ 结算（dispatch-core 阶段三）：await handle.result（事件循环挂起零线程占用）；
  //    killSignal = 循环控制器（stop 主动终态按 killed 分类——零 bump 零 tool-error）；
  //    guardOnFailure = false——worker 异常终止属执行受阻，bounded 阶梯归循环自有计数
  const settled = await settleClaimed(loop.core, exec, {
    scope,
    claimed: claim,
    handle: spawned.handle,
    spawnStartedAt: spawned.spawnStartedAt,
    killSignal: signal,
    guardOnFailure: false,
  })
  record.inFlight = undefined // 结算已定（success/blocked/killed/失败同径）——在飞清位
  if (signal.aborted) return 'terminal'

  if ('ok' in settled) {
    // 失败 DTO（结算核 failed 径——killSignal 在场时 killed 已先行返回）：
    // worker 异常终止属执行受阻非 spawn 机制故障（guardOnFailure=false 零防线计数零 tool-error）——
    // ⑫ bounded 立即重入（claim 面按 links 幂等重入同任务，不退避）→ 超限第三层（decisions #16）
    loop.workerAborts += 1
    const attempt = loop.workerAborts
    loop.deps.narrator.recordIncident({ projectId: scope.projectId, sourceSlug: slug, taskKey: task.localId, eventType: 'worker-aborted', error: settled.message })
    if (attempt > LOOP_WORKER_ABORT_MAX_RETRIES) {
      await loop.deps.escalation?.escalate({
        kind: 'worker-abort-over-limit',
        ownerSessionId: owner,
        source: record.source,
        taskKey,
        attempts: attempt,
      })
      return 'terminal'
    }
    await loop.deps.narrator.notice(
      owner,
      renderNarrative('worker-aborted-retry', { sourceSlug: slug, taskKey: task.localId, attempt, maxAttempts: LOOP_WORKER_ABORT_MAX_RETRIES }),
    )
    return 'continue'
  }

  // kind 承载成员：killed = 停止径（收口叙述与真化归 stop 面）；halted = guard 粘住终局；
  // dispatched/no-task 结构性不出自结算核——防御终局（不可达分支）
  if (settled.kind === 'killed') return 'terminal'
  if (settled.kind === 'halted') return haltLoop(loop)
  if (settled.kind !== 'spawned') return 'terminal'

  // ⑤ 结果通知 + 三层阶梯判定（图 C）：结算成功——重试/耐心计数复位（结算序 streak）
  loop.spawnFailures = 0
  loop.workerAborts = 0
  loop.waitRounds = 0
  const settlement: DispatchSpawnedResult = settled
  const label = `${settlement.taskRef.localId} ${settlement.title}`
  if (settlement.outcome === 'success') {
    loop.dispositions.delete(taskKey) // S1c 处置簿清账（任务成功——同任务处置计数归零）
    await deps.narrator.notice(
      owner,
      renderNarrative('completed', { sourceSlug: slug, taskLabel: label, summary: settlement.summary ?? '已完成' }),
    )
    return 'continue' // 续领下一轮
  }

  // blocked：worker 侧已 spawn fix → 机械续领不升级（fix ready 自然被领——decisions #22）
  const meta = { projectId: scope.projectId, taskKey: task.localId, reason: settlement.reason ?? '', settlement }
  if (settlement.followUp !== undefined) {
    await deps.narrator.blocked(owner, 'blocked-with-fix', { sourceSlug: slug, taskLabel: label, fixId: settlement.followUp.localId }, meta)
    return 'continue'
  }

  // blocked 无 follow-up（修复路径缺位）→ 第二层处置代理（S1c 实装；钩子缺席 = 装配降级：
  // 仅落盘事件子文件夹、循环续领，池态判词机械接管后续叙述）
  if (deps.triage === undefined) {
    deps.narrator.recordIncident({ projectId: scope.projectId, sourceSlug: slug, taskKey: task.localId, eventType: 'blocked', error: settlement.reason ?? '', settlement })
    return 'continue'
  }

  // 处置阶梯（decisions #16/#22 + R2）：同任务处置计数封顶强制升级；无效/越权输出计处置
  // 失败入重试上限（有界重试轮次——模型失误爆炸半径 = LOOP_TRIAGE_MAX_ATTEMPTS）。
  const reason = settlement.reason ?? ''
  const book = dispositionBookOf(loop, taskKey)
  let decision: LoopTriageDecision | undefined
  while (decision === undefined && book.attempts < LOOP_TRIAGE_MAX_ATTEMPTS) {
    book.attempts += 1
    try {
      decision = await deps.triage.run({
        projectId: scope.projectId,
        source: record.source,
        ownerSessionId: owner,
        parent: exec.parent,
        signal,
        task,
        reason,
        settlement,
      })
      book.history.push(`第${book.attempts}次处置——${triageDecisionNote(decision)}`)
    } catch (cause) {
      // 处置失败（无效/越权结构化输出、代理基建故障）——入重试上限，立即同结算重试
      book.history.push(`第${book.attempts}次处置——分析未得出结论`)
      console.warn(
        `forge loop triage failed (${taskKey} attempt ${book.attempts}/${LOOP_TRIAGE_MAX_ATTEMPTS}): ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }
  }
  if (decision === undefined) {
    // 处置重试超限（同任务计数封顶）→ 第三层（⑩ 叙述 + 问询附 reason 全文与处置历史）——终局
    await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
    await deps.escalation?.escalate({
      kind: 'disposition-over-limit',
      ownerSessionId: owner,
      source: record.source,
      task,
      reason,
      attempts: book.attempts,
      history: [...book.history],
    })
    return 'terminal'
  }

  if (decision.action === 'add-fix') {
    try {
      const added = await deps.tasks.addTask({
        projectId: scope.projectId,
        source,
        title: decision.title ?? `Fix: ${task.title}`,
        type: decision.type ?? 'coding-fix',
        ...(decision.taskDesc !== undefined ? { taskDesc: decision.taskDesc } : {}),
        sourceTask: { slug: task.slug, localId: task.localId },
        blockSource: true, // 单事务同置源 blocked + fix 完成自动恢复（addTask 机械面）
      })
      await deps.narrator.blocked(
        owner,
        'blocked-auto-fixed',
        { sourceSlug: slug, taskLabel: label, fixId: added.localId, fixNote: decision.note ?? '待修复项' },
        meta,
      )
    } catch (cause) {
      if ((cause as { code?: unknown }).code === 'ERR_CHAIN_DEPTH_EXCEEDED') {
        // fix 链深 ≤6 到顶（C6/addTask 权威校验）→ 第三层升级（⑩ 叙述 + 问询）——终局
        const depthData = (cause as { data?: { depth?: number; limit?: number } }).data
        book.history.push(`第${book.attempts}次处置——修复任务创建被拒（修复链已达上限）`)
        await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
        await deps.escalation?.escalate({
          kind: 'fix-chain-over-limit',
          ownerSessionId: owner,
          source: record.source,
          task,
          reason,
          ...(depthData?.depth !== undefined ? { depth: depthData.depth } : {}),
          ...(depthData?.limit !== undefined ? { limit: depthData.limit } : {}),
          history: [...book.history],
        })
        return 'terminal'
      }
      // add-fix 落库失败 fail-soft：落盘留证、循环续领（不因处置径故障弃循环）
      console.warn(`forge loop triage add-fix failed (${taskKey}): ${cause instanceof Error ? cause.message : String(cause)}`)
      deps.narrator.recordIncident({ projectId: scope.projectId, sourceSlug: slug, taskKey: task.localId, eventType: 'blocked', error: settlement.reason ?? '', settlement })
    }
    return 'continue'
  }
  if (decision.action === 'wait-external') {
    await deps.narrator.blocked(owner, 'blocked-wait-external', { sourceSlug: slug, taskLabel: label, externalSlug: decision.externalSlug }, meta)
    return 'continue' // 记录等待 → 续领其它（若整源无可领，池态判词收口）
  }
  // ask-user → 第三层（⑩ 叙述已告知问询另行发起；裁决不经主会话，decisions #16）——终局
  // （处置历史已由阶梯循环记录本决策行——不重复追加）
  await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
  await deps.escalation?.escalate({
    kind: 'blocked-ask-user',
    ownerSessionId: owner,
    source: record.source,
    task,
    reason,
    history: [...book.history],
  })
  return 'terminal'
}

// ─────────────────────────── no-task 三态判词与终局收口 ───────────────────────────

/** no-task 三态判词（AC：settled 收口 / 等待 in-flight / halted-受阻）：classifyPool 纯函数裁决 */
async function onNoTask(loop: ActiveLoop, pool: PoolSnapshot): Promise<RoundOutcome> {
  const verdict = classifyPool(pool)
  if (verdict === 'done') {
    // 任务源 settled → 收口叙述（⑯ 结束·全部完成）+ 循环终态
    const stats = await statsFailSoft(loop)
    await loop.deps.narrator.followup(
      loop.record.ownerSessionId,
      renderNarrative('finished-all', {
        sourceSlug: loop.record.source.slug,
        completed: stats.byStatus.completed,
        blocked: stats.byStatus.blocked,
        instruction: LOOP_INSTRUCTION_ALL_DONE,
      }),
    )
    return 'terminal'
  }
  if (verdict === 'deadlock-suspected') {
    // blocked 有、通路无 → 受阻终局：⑭ 叙述 + 第三层裁决钩子（decisions #16——主动停下等裁决）
    const cards = await loop.deps.tasks
      .listTasks({ projectId: loop.scope.projectId, source: { kind: loop.source.kind, slug: loop.source.slug }, statusFilter: ['blocked'] })
      .catch(() => [])
    const blockedItems = cards.map((card) => ({ taskKey: card.localId, note: card.title }))
    await loop.deps.narrator.followup(
      loop.record.ownerSessionId,
      renderNarrative('blocked-pool', { sourceSlug: loop.record.source.slug, blockedItems }),
    )
    await loop.deps.escalation?.escalate({
      kind: 'deadlock',
      ownerSessionId: loop.record.ownerSessionId,
      source: loop.record.source,
      blockedItems,
    })
    return 'terminal'
  }
  // wait：在飞未结 / 前置未满足 → bounded patience（轮间停顿后重试；连续 wait 封顶收口建议重派）
  loop.waitRounds += 1
  if (loop.waitRounds >= LOOP_PATIENCE_MAX_WAIT_ROUNDS) {
    const stats = await statsFailSoft(loop)
    await loop.deps.narrator.followup(
      loop.record.ownerSessionId,
      renderNarrative('finished-timeout', {
        sourceSlug: loop.record.source.slug,
        reason: '等待超时',
        completed: stats.byStatus.completed,
        blocked: stats.byStatus.blocked,
        pending: stats.byStatus.pending,
        instruction: loopInstructionOf('timeout', loop.record.source.slug),
      }),
    )
    return 'terminal'
  }
  const done = await sleepOrAbort(loop.controller.signal, loop.delays.patiencePauseMs)
  return done ? 'continue' : 'terminal'
}

/** spawn 连败粘住的循环终态（⑬ 终局叙述 + 第三层问询——AC「×3 仍败循环 halted 并触发
 *  第三层问询」；同实例不自动复活：登记表即删，复活 = 新实例新 guard 计数，decisions #18） */
async function haltLoop(loop: ActiveLoop): Promise<RoundOutcome> {
  const { deps, record } = loop
  // ⑬ 终局叙述先行（问询另行发起——与 ⑩ 同序：叙述在前、问询随后）
  await deps.narrator.followup(
    record.ownerSessionId,
    renderNarrative('spawn-failed-halted', {
      sourceSlug: record.source.slug,
      attempts: HALT_THRESHOLD,
      instruction: loopInstructionOf('halted', record.source.slug),
    }),
  )
  // 第三层问询（reason 原文 = HALTED_REASON——不经主会话叙述，escalation.ts 投递 userQuestions）
  await deps.escalation?.escalate({
    kind: 'halted',
    ownerSessionId: record.ownerSessionId,
    source: record.source,
    attempts: HALT_THRESHOLD,
    reason: HALTED_REASON,
  })
  return 'terminal'
}

/** 停止/启动竞态收口：循环已叫停时，检查本实例是否仍持有刚登记的孤儿 in-flight——
 *  stop 面未接管（其读数早于本登记）则由本径真化 interrupted（S3 transitionTask 面） */
async function bailIfAborted(loop: ActiveLoop, claim: ClaimedDispatch | undefined): Promise<boolean> {
  if (!loop.controller.signal.aborted) return false
  const orphan = loop.record.inFlight
  if (claim !== undefined && orphan !== undefined && orphan.taskKey === `${claim.task.slug}/${claim.task.localId}`) {
    loop.record.inFlight = undefined
    await interruptedize(loop, claim.task.taskId)
  }
  return true
}

/** in-flight 真化 interrupted（S3 面——人类转移通道；fail-soft：终止路径的转移故障只告警） */
async function interruptedize(loop: ActiveLoop | undefined, taskId: string): Promise<void> {
  if (loop === undefined) return
  try {
    await loop.deps.tasks.transitionTask({
      projectId: loop.record.projectId,
      taskId,
      toStatus: 'interrupted',
      reason: LOOP_STOP_TRANSITION_REASON,
    })
  } catch (cause) {
    console.warn(
      `forge loop stop transition failed (${taskId}): ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
}

/** 池快照 fail-soft 现读（叙述行数据源——读面故障零拖垮叙述/收口，缺省零值；loop 缺席 =
 *  登记已注销的 stop 竞态——同样零值兜底） */
async function statsFailSoft(loop: ActiveLoop | undefined): Promise<TaskStats> {
  if (loop === undefined) return ZERO_STATS
  try {
    return await loop.deps.tasks.taskStats({
      projectId: loop.scope.projectId,
      source: { kind: loop.source.kind, slug: loop.source.slug },
    })
  } catch {
    return ZERO_STATS
  }
}

/** 池快照零值（fail-soft 兜底——八态键全量） */
const ZERO_STATS: TaskStats = {
  total: 0,
  byStatus: {
    pending: 0,
    in_progress: 0,
    completed: 0,
    blocked: 0,
    suspended: 0,
    interrupted: 0,
    skipped: 0,
    rejected: 0,
  },
  unmetPending: 0,
}
