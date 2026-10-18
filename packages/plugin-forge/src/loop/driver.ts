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
import { claimForDispatch, classifyPool, findLiveSuccessor, poolOf, settleClaimed, spawnClaimed } from '../dispatch-core/index.js'
import type {
  ClaimedDispatch,
  DispatchChainScope,
  DispatchCoreDeps,
  DispatchCoreExec,
  DispatchSpawnedResult,
  PoolSnapshot,
  SpawnWorker,
} from '../dispatch-core/index.js'
import { clearExclusiveLoopSource, ownerSingleActiveRejection, setExclusiveLoopSource } from '../dispatch-core/index.js'
import { renderHeadline, renderNarrative, summarizeReason } from '../notify/index.js'
import type { Narrator } from '../notify/index.js'
import { renderEndOfLoop } from './injection.js'
import type { InjectionPayload } from './injection.js'
import type { ForgeProgressCounts, ProgressAppendFace } from '../progress/index.js'
import { createLoopRegistry } from './registry.js'
import type { LoopInFlight, LoopInstanceId, LoopRecord, LoopRegistry, LoopSourceRef, SuspendedPayload } from './registry.js'
import { attributionTaskInput, baselineForHead, type E2eBaselineCache } from './e2e-baseline.js'

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

/**
 * 3c 续派静默窗基长（毫秒——done 判词收口前的 wait-for-quiescence 宽限窗：窗内编排层
 * 新派任务（pending 出现）即自动续派，窗满静默才 ⑯ 收口；与 bounded patience 是两个
 * 机制——前者 = 结束前等新任务的静默宽限，后者 = 池无任务可领的重试上限）。
 */
export const LOOP_QUIESCENCE_WINDOW_MS = 30_000

/** 3c 宽限窗内池态轮询间隔（毫秒——窗内分段睡眠逐次现读池快照，新任务即到即续） */
export const LOOP_QUIESCENCE_POLL_MS = 5_000

/**
 * 3c 最大轮次封顶（runRound 连续轮数上限——超限按 ⑮ 结束叙述收口，防异常驱动下无限
 * 空转；结算成功复位不适用——轮数是生命周期总量而非连击）。
 */
export const LOOP_MAX_ROUNDS = 200

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
  /** 改进 6① 重试回灌——上次处置失败的输出/错误摘要（首次处置缺席） */
  readonly lastFailure?: string
  /** 改进 6④ fix 链深余量（driver 沿 sourceTask 链现算；缺席 = 链数据不可得） */
  readonly fixChain?: LoopTriageFixChain
}

/** fix 链深余量（改进 6④——remaining = limit - depth；remaining < 1 = add-fix 结构性被拒） */
export interface LoopTriageFixChain {
  readonly depth: number
  readonly limit: number
  readonly remaining: number
}

/**
 * 处置决策四动作枚举（S1c 三动作 + split-remainder 第四态，proposal blocked-salvage-split B；
 * 宿主忠实执行）：
 * add-fix = 宿主经 addTask 建 fix 链（blockSource 置源 blocked，fix 完成自动恢复）；
 * wait-external = 原因在其它任务源（记录等待 → 续领其它）；ask-user = 直达第三层；
 * split-remainder = 宿主经 addTask(blockSource:false) 建继任任务承接剩余范围——源任务保持
 * blocked 不恢复（不重头开始的结构保证；pending 继任路径在场，deadlock 判词不误报）。
 */
export type LoopTriageDecision =
  | {
      readonly action: 'add-fix'
      /** fix 任务标题（缺省 = `Fix: <任务名>`） */
      readonly title?: string
      /** fix 任务类型（缺省 = coding-fix——fix 链协议缺省族，正本 = task-pipeline.md BIZ-task-003 / triage 注入模板） */
      readonly type?: TaskType
      readonly taskDesc?: string
      /** ⑧ 叙述的修复内容摘要（系统动作行括注） */
      readonly note?: string
    }
  | { readonly action: 'wait-external'; readonly externalSlug: string }
  | { readonly action: 'ask-user' }
  | {
      readonly action: 'split-remainder'
      /** 继任任务标题（缺省 = `Split: <任务名>`） */
      readonly title?: string
      /** 继任任务类型（缺省 = 源任务同型——剩余范围是源任务的结构性子集） */
      readonly type?: TaskType
      readonly taskDesc?: string
      /** 分割内容摘要（叙述系统行动作行括注） */
      readonly note?: string
    }

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
    | {
        /** 1.18 落点核验失败强制处置（bug d8029b20——错分支提交不得静默接受） */
        readonly kind: 'settle-landing-rejected'
        readonly ownerSessionId: string
        readonly source: LoopSourceRef
        readonly taskKey: string
        /** 核验结论/故障全文（结算核判词——问询 detail；含 interrupted 真化结果） */
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
  /**
   * 发起循环的检出路径（1.14 判例修复——owner 会话 cwd，worktree 分支检出）：登记进
   * LoopRecord.worktree——worker 会话 cwd 钉定源 + 结算提交落点核验的容器检出锚。
   * 缺席 = 未携带（spawn/结算零核销）。
   */
  readonly worktree?: string
}

/** 启动返回（3b 两拒绝码：loop-active = 该容器已有活循环（他源他会话并行不受限）；
 *  owner-active = 会话级单活门控（用户裁决 2026-10-17）——本会话已有活循环（含挂起中），
 *  循环间串行；suspended 标记挂起占用形态） */
export type LoopStartResult =
  | { readonly ok: true; readonly loopId: LoopInstanceId }
  | {
      readonly ok: false
      readonly code: 'loop-active' | 'owner-active'
      readonly activeSource: LoopSourceRef
      readonly activeOwnerSessionId: string
      /** owner-active 径专用——命中会话的活循环是否挂起中（挂起也占会话名额） */
      readonly suspended: boolean
      /** 自解释人话 + 指引行（工具/指令渲染面直接投影——零二次拼装） */
      readonly message: string
      readonly guidance: readonly string[]
    }

/** 停止返回（本会话无活循环 = no-active-loop——S2 据此提示「本会话没有派发任务」，decisions #20） */
export type LoopStopResult =
  | { readonly ok: true; readonly stopped: true; readonly hadInFlight: boolean }
  | { readonly ok: false; readonly code: 'no-active-loop' }

/**
 * 定向停止返回（3b stopTaskLoop——作用域裁决 2026-10-17：运行中仅 owner 可停（decisions #20
 * 隔离纪律）；挂起态（awaiting-verdict）任意会话可停——支撑其它会话接管。越权/无活循环拒绝，
 * suspended/ownerSessionId 随行供自解释文案。
 */
export type LoopStopLoopResult =
  | { readonly ok: true; readonly stopped: true; readonly hadInFlight: boolean }
  | { readonly ok: false; readonly code: 'no-active-loop' | 'forbidden'; readonly suspended: boolean; readonly ownerSessionId: string }

/** 驱动器依赖（装配方注入——registry 缺省自建，多驱动器共享时由装配传入单例） */
export interface LoopDriverDeps {
  /**
   * 项目缺省（可选——S2 起指令面按敲指令会话 cwd 逐会话解析并经 LoopStartInput.projectId
   * 覆盖；装配面无固定项目时缺席，双缺席 = start 拒绝 fail-loud）
   */
  readonly projectId?: string
  readonly tasks: ForgeTasksService
  readonly spawn: SpawnWorker
  /** 提交落点核验器（可选——透传 dispatch-core 结算核；缺席回落 gitCommitLanding 真核验） */
  readonly commitLanding?: DispatchCoreDeps['commitLanding']
  /** 叙述面（notify createNarrator 产物——notice/followup/blocked 三出口 + 落盘委派） */
  readonly narrator: Narrator
  /** 事件发射面（可选——透传 dispatch-core 事件闭包，logs/<slug>.jsonl 里程碑不断流） */
  readonly events?: DispatchCoreDeps['events']
  /**
   * 循环进度 append 面（可选——1.17 'forge/progress' 会话事件流内交错；缺席/链断 =
   * 零发射 fail-soft，循环正确性零依赖。非模型面：不进模型上下文、零回合唤醒。）
   */
  readonly progress?: ProgressAppendFace
  /** forgeSettings 服务面（可选——worker agentOptions 组装同工具壳） */
  readonly settings?: Pick<ForgeSettingsService, 'get'>
  readonly resolveModelReasoning?: DispatchCoreDeps['resolveModelReasoning']
  readonly registry?: LoopRegistry
  readonly triage?: LoopTriageHook
  readonly escalation?: LoopEscalationHook
  /**
   * 已知容器集读面（改进 6⑤——wait-external.externalSlug 存在性校验的宿主数据源；
   * 返回该 projectId 下全部已知容器 slug（feature + proposal 双轨并集）。缺席 = 校验
   * 缺席退化现状（fail-soft——装配面未接线时不阻塞处置阶梯）。
   */
  readonly knownContainers?: (projectId: string) => Promise<readonly string[]>
  /**
   * e2e 红灯基线门（改进7——可选；缺席 = 机制关闭，简报零 E2E_BASELINE_RED 行）。
   * runSuite = e2e 套件全量执行命令（返回 reporter 输出——`FAIL <spec>` 行被解析为红灯
   * 清单）。disc-2：基线按 HEAD 键控缓存——readHead 读循环 worktree 当前 HEAD，claim 时
   * 比对：一致复用缓存、漂移重算（简报不烤死于循环启动时点）；readHead/HEAD 缺席 = 无漂移
   * 可判，回落启动时一次性基线。启动跑一次 + 逐一生成归因卡（三分流）；套件执行故障
   * fail-soft（空清单 + warn），循环不阻。
   */
  readonly e2eBaseline?: {
    readonly runSuite: () => Promise<string>
    /** worktree → 当前 HEAD（装配面注入 git rev-parse 缝；缺席/返回 undefined = 键不可得） */
    readonly readHead?: (worktree: string) => Promise<string | undefined>
  }
  /** 机械时延注入（测试缝——缺省生产值；quiescence = 3c 宽限窗基长/轮询间隔） */
  readonly delays?: {
    readonly backoffBaseMs?: number
    readonly patiencePauseMs?: number
    readonly quiescenceWindowMs?: number
    readonly quiescencePollMs?: number
  }
  /** 机械上限注入（测试缝——缺省生产值；maxRounds = 3c 最大轮次封顶） */
  readonly limits?: { readonly maxRounds?: number }
}

/** 驱动器公开面（S2 消费：启动/停止/本会话活循环查询/全量活循环读数） */
export interface LoopDriver {
  start(input: LoopStartInput): Promise<LoopStartResult>
  stop(input: { readonly ownerSessionId: string }): Promise<LoopStopResult>
  /**
   * 定向停止（3b stopTaskLoop 消费面——与 /stop-dag-tasks 双入口同 registry 判活）：按
   * LoopInstanceId 定位，统一结束处理（在途 worker 取消、孤儿任务真化 interrupted、收口
   * 叙述、终态注销）与 stop() 同径单源。作用域见 LoopStopLoopResult 注。
   */
  stopLoop(input: { readonly loopId: LoopInstanceId; readonly requesterSessionId: string }): Promise<LoopStopLoopResult>
  /** 本会话活循环（S2「跑动中再触发」的查询面；无 = undefined） */
  activeOf(ownerSessionId: string): LoopRecord | undefined
  /** 进程内全量活循环读数（2026-10-12 多会话并行——指令层同源占用判定/候选过滤观察面） */
  activeAll(): readonly LoopRecord[]
  /**
   * 处置回流（3b re-entry）：清 `record.suspended` 回落 active 并从留存点续跑（ActiveLoop
   * 运行时状态——处置簿/计数——挂起期保留）。无活登记 = no-active-loop；未挂起 = not-suspended。
   */
  resume(input: { readonly loopId: LoopInstanceId }): LoopResumeResult

  /**
   * fiber 卸载收口（装配 disposer 消费）：全部活循环同步终态注销——控制器 abort（在飞回合
   * 于下一个 bail 点让渡）+ 登记表/S1c 独占注销。静默径：不真化 in-flight、零叙述（通道随
   * fiber 消亡；遗留 in_progress 由下次装配 reconcileInterrupted 对账——S3 既有语义，同
   * 进程重启形态）。缺此收口时循环存活越过分家卸载，DB 句柄关闭后循环异常终止
   * （「The database connection is not open」——fix-bug ea86ea00）。
   */
  dispose(): void
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
  readonly delays: { readonly backoffBaseMs: number; readonly patiencePauseMs: number; readonly quiescenceWindowMs: number; readonly quiescencePollMs: number }
  /** 3c 最大轮次封顶（runRound 轮数上限——limits.maxRounds ?? LOOP_MAX_ROUNDS） */
  readonly maxRounds: number
  /** spawn 失败连败计数（⑪ 次数——×3 粘住由 dispatch-core guard 按 LoopInstanceId 兑现） */
  spawnFailures: number
  /** worker 异常终止连败计数（⑫ 次数——bounded 重入，超限第三层；结算成功复位） */
  workerAborts: number
  /** no-task 等待判词连击（bounded patience——claim 成功即复位） */
  waitRounds: number
  /** 同任务处置簿（S1c 第二层——taskKey → { 处置次数, 处置历史 }；封顶强制升级，结算成功清账） */
  readonly dispositions: Map<string, DispositionBook>
  /** e2e 红灯基线缓存（disc-2 · HEAD 键控 {commit, reds}——缺席/空 = 基线全绿或机制关闭，简报零行） */
  e2eBaseline?: E2eBaselineCache
}

/** 同任务处置簿（S1c——attempts 计数封顶 LOOP_TRIAGE_MAX_ATTEMPTS；history 行进裁决问询） */
interface DispositionBook {
  attempts: number
  history: string[]
  /** 改进 6① 上次处置失败摘要（回灌——下一轮 triage 输入 lastFailure） */
  lastFailure?: string
  /**
   * 改进 6③ 决策缓存（决策与执行分离）：通过解析与宿主校验的决策在此缓存——落库失败后
   * 再遇同任务 blocked 时重放执行不重跑分析；执行成功/重放再败即清账。
   */
  decision?: LoopTriageDecision
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
  if (decision.action === 'split-remainder') return `决定分割剩余范围为继任任务${decision.note !== undefined ? `（${decision.note}）` : ''}`
  return '决定请求人工裁决'
}

// ─────────────────────────── 改进 6 · triage 错误处理信息闭环 ───────────────────────────

/**
 * fix 链深上限（改进 6④——core addTask C6 `FIX_CHAIN_DEPTH_LIMIT` 的宿主镜像值）：
 * 余量 = 上限 − 当前任务链深；余量 < 1 时 add-fix 结构性被拒（创建必 ERR_CHAIN_DEPTH_EXCEEDED）。
 */
export const TRIAGE_FIX_CHAIN_DEPTH_LIMIT = 6

/** 处置失败摘要（回灌/历史行用）：TriageDecisionInvalidError 携 rawSummary（模型原始输出摘要），
 *  其余取 error message——结构化识别不 import triage 面（依赖方向：triage → loop 单向） */
export function triageFailureSummary(cause: unknown): string {
  const raw = (cause as { rawSummary?: unknown } | null)?.rawSummary
  if (typeof raw === 'string' && raw.length > 0) return raw
  return cause instanceof Error ? cause.message : String(cause)
}

/** 模型输出无效判别（改进 6② 分流键——结构性识别 TriageDecisionInvalidError，不 import triage 面） */
export function isTriageInvalidOutput(cause: unknown): boolean {
  return (cause as { name?: unknown } | null)?.name === 'TriageDecisionInvalidError'
}

/** 宿主执行前置校验拒绝（改进 6④⑤——结构同 TriageDecisionInvalidError：立即重试 + 回灌摘要） */
function hostRejection(message: string, rawSummary: string): Error {
  return Object.assign(new Error(`处置决策无效——${message}`), {
    name: 'TriageDecisionInvalidError',
    rawSummary: `${message}；原始决策: ${rawSummary}`,
  })
}

/**
 * fix 链深余量现算（改进 6④——沿 sourceTask 自然键链上溯计数；fail-soft：读面故障/任务
 * 不在列表 = undefined，提示词省略该节、宿主余量守卫缺席，退化为现状）。
 */
async function fixChainOf(
  tasks: ForgeTasksService,
  projectId: string,
  source: LoopSourceRef,
  task: TaskSnapshot,
): Promise<LoopTriageFixChain | undefined> {
  try {
    const cards = await tasks.listTasks({ projectId, source: { kind: source.kind, slug: source.slug } })
    const byKey = new Map(cards.map((c) => [`${c.slug}/${c.localId}`, c] as const))
    let depth = 0
    let ref: { slug: string; localId: string } = { slug: task.slug, localId: task.localId }
    for (;;) {
      const card = byKey.get(`${ref.slug}/${ref.localId}`)
      if (card === undefined) break
      depth += 1
      if (card.sourceTask === undefined) break
      ref = { slug: card.sourceTask.slug, localId: card.sourceTask.localId }
    }
    if (depth === 0) return undefined
    return { depth, limit: TRIAGE_FIX_CHAIN_DEPTH_LIMIT, remaining: TRIAGE_FIX_CHAIN_DEPTH_LIMIT - depth }
  } catch {
    return undefined
  }
}

/** 每轮判定返回（continue = 续派下一轮；suspend = 升级点挂起待裁决（3b）；terminal = 终局收口出循环） */
type RoundOutcome = 'continue' | 'suspend' | 'terminal'

/**
 * 3c 宽限窗判词（done 收口前的 wait-for-quiescence）：continue = 窗内编排层新派任务
 * （池 pending/in_progress 出现——自动续派）；settle = 窗满静默（照常收口）；
 * terminal = 窗内循环被叫停（用户终止——收口归停止径，零结束叙述）。
 */
type QuiescenceOutcome = 'continue' | 'settle' | 'terminal'

/** 3c 续派静默窗（分段睡眠 + 池快照现读——新任务窗内即到即续；窗内叫停立即让渡终止收口） */
async function waitForQuiescence(loop: ActiveLoop): Promise<QuiescenceOutcome> {
  const signal = loop.controller.signal
  const windowMs = loop.delays.quiescenceWindowMs
  const pollMs = loop.delays.quiescencePollMs
  let waited = 0
  for (;;) {
    const pool = poolOf(await statsFailSoft(loop))
    if (pool.pending > 0 || pool.inProgress > 0) return 'continue'
    if (waited >= windowMs) return 'settle'
    const slice = Math.min(pollMs, windowMs - waited)
    if (!(await sleepOrAbort(signal, slice))) return 'terminal'
    waited += slice
  }
}

/**
 * 升级点挂起（3b——原 escalate→terminal 的语义反转处）：写 `record.suspended`（在场即挂起
 * 投影）并返回 suspend 判词——runLoop 保留登记与运行时状态退出，等待处置回流 re-entry
 * （driver.resume 清 suspended 从留存点续跑）。升级事件全文承载在挂起载荷内，裁决改经
 * owner 对话面（P3），不再走 userQuestions 问询径（halted 除外——保持结束 + P6 问询）。
 */
function suspendForVerdict(loop: ActiveLoop, escalation: LoopEscalation): RoundOutcome {
  const payload: SuspendedPayload = { escalation, since: Date.now() }
  loop.record.suspended = payload // 写点①：挂起即投影挂起
  return 'suspend'
}

/** 处置回流返回（re-entry——无活登记 / 非挂起态拒绝） */
export type LoopResumeResult =
  | { readonly ok: true; readonly loopId: LoopInstanceId }
  | { readonly ok: false; readonly code: 'no-active-loop' | 'not-suspended' }

/** 呈现任务行（「localId 任务名」——notification-samples ④「2.8 诊断弹窗装配（Apps web）」口径） */
function taskLabelOf(task: TaskSnapshot): string {
  return `${task.localId} ${task.title}`
}

/**
 * 循环进度事件发射（1.17——'forge/progress' 会话事件流内交错）：领取/结算/状态迁移点
 * 各一枚，append 进 owner 会话日志（客户端 DisclosureRow 同族折叠行渲染，seq 时序天然
 * 交错）。fail-soft：面缺席/append 链断 = 零发射不外溢（进度非循环正确性依赖）；既有
 * notice 双通道零回归（本发射与叙述面完全并行，不改 notice/followup 分流）。
 */
function emitProgress(
  loop: ActiveLoop,
  event: { readonly verb: 'claim' | 'claim-resume' | 'settle' | 'stop'; readonly status: 'running' | 'completed' | 'blocked' | 'interrupted'; readonly taskKey?: string; readonly counts?: ForgeProgressCounts },
): void {
  try {
    loop.deps.progress?.append(loop.record.ownerSessionId, {
      sourceSlug: loop.record.source.slug,
      verb: event.verb,
      status: event.status,
      ...(event.taskKey !== undefined ? { taskKey: event.taskKey } : {}),
      ...(event.counts !== undefined ? { counts: event.counts } : {}),
      at: Date.now(),
    })
  } catch {
    // 进度发射零循环正确性依赖——异常吞并（append 面内部已另有告警）
  }
}

/** 池计数快照（claim 时点——'forge/progress' counts 段单源） */
function progressCountsOf(stats: TaskStats): ForgeProgressCounts {
  return { pending: stats.byStatus.pending, running: stats.byStatus.in_progress, done: stats.byStatus.completed }
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

  /** 统一结束处理（stop/stopLoop 双入口同径单源）：在途取消 + 孤儿真化 + 收口叙述 + 终态注销 */
  async function terminateRecord(record: LoopRecord): Promise<boolean> {
    const loop = live.get(record.id)
    // 先摘牌再 abort——停止竞态收口：runRound 各 await 恢复点见 inFlight 已清即让渡接管权
    const captured: LoopInFlight | undefined = record.inFlight
    record.inFlight = undefined
    loop?.controller.abort('loop stopped by command')
    if (captured !== undefined) {
      await interruptedize(loop, captured.taskId) // in-flight 真化 interrupted（S3 transitionTask 面）
      // 进度事件（1.17——状态迁移点：停止真化 in-flight → interrupted）
      if (loop !== undefined) emitProgress(loop, { verb: 'stop', status: 'interrupted', taskKey: captured.taskKey })
    }
    const stats = await statsFailSoft(loop)
    // ⑰ 停止收口 = settlement 形态（3b④——dispatch-loop-settled source + 三径投递）
    await deps.narrator.settle(
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
    return captured !== undefined
  }

  return {
    async start(input: LoopStartInput): Promise<LoopStartResult> {
      // S2 projectId 解析（会话工作区覆盖 > 装配缺省；双缺席 fail-loud——不落不可归属的循环）
      const projectId = input.projectId ?? deps.projectId
      if (projectId === undefined) throw new Error('派发循环启动缺少 projectId（input.projectId 与 deps.projectId 双缺席）')
      // 会话级单活门控（3b——用户裁决 2026-10-17：一个会话同一时间段只允许一个任务循环，
      // 循环间串行）：start 前查 byOwner(caller)——已有活循环（含挂起中）即拒绝并自解释指引
      // （exclusivity.ts 身份缝合单点；指令与工具双入口同源兑现）。
      const ownerRejection = ownerSingleActiveRejection((id) => registry.byOwner(id), input.ownerSessionId)
      if (ownerRejection !== undefined) {
        return {
          ok: false,
          code: 'owner-active',
          activeSource: { kind: ownerRejection.data.sourceKind, slug: ownerRejection.data.slug },
          activeOwnerSessionId: ownerRejection.data.ownerSessionId,
          suspended: ownerRejection.data.suspended,
          message: ownerRejection.message,
          guidance: ownerRejection.data.guidance,
        }
      }
      // ② 同源独占（2026-10-12 多会话并行裁决——取代 v1 全局单活）：同一任务源进程内至多
      // 一个活循环（他源他会话并行不受限）；同源再 start → loop-active 拒绝
      const active = registry.bySource({ kind: input.source.kind, slug: input.source.slug })
      if (active !== undefined) {
        return {
          ok: false,
          code: 'loop-active',
          activeSource: active.source,
          activeOwnerSessionId: active.ownerSessionId,
          suspended: active.suspended !== undefined,
          message: `start rejected: task source ${active.source.slug} already has an active dispatch loop (owner session ${active.ownerSessionId})`,
          guidance: [],
        }
      }
      // ⑥ LoopInstanceId（decisions #18）：crypto.randomUUID()——登记表键 + guard 粘性载体
      const id = crypto.randomUUID()
      const source: LoopSourceRef = { kind: input.source.kind, slug: input.source.slug }
      const record: LoopRecord = {
        id,
        source,
        ownerSessionId: input.ownerSessionId,
        projectId,
        ...(input.worktree !== undefined ? { worktree: input.worktree } : {}),
        takeoverSessions: new Set<string>(), // 3b 接管集（登记绑定——remove 随之蒸发）
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
          ...(deps.commitLanding !== undefined ? { commitLanding: deps.commitLanding } : {}),
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
          quiescenceWindowMs: deps.delays?.quiescenceWindowMs ?? LOOP_QUIESCENCE_WINDOW_MS,
          quiescencePollMs: deps.delays?.quiescencePollMs ?? LOOP_QUIESCENCE_POLL_MS,
        },
        maxRounds: deps.limits?.maxRounds ?? LOOP_MAX_ROUNDS,
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
      // e2e 红灯基线门（改进7——入场前跑批，fail-soft）：红灯清单挂本循环实例（逐简报
      // 递达 worker——机械判定「基线红灯 ≠ 本任务回归」），并逐一生成归因卡（三分流）。
      // disc-2：基线按 HEAD 键控缓存（ensureE2eBaseline——claim 时漂移重算，不烤死于此时点）；
      // 套件执行故障 = 空清单 + warn（机制静默关闭，循环派发不受阻）；归因卡落库失败
      // fail-soft（warn——红灯清单仍在简报面承担机械判定）。
      const baseline = await ensureE2eBaseline(loop)
      if (baseline !== undefined) {
        for (const spec of baseline.redSpecs) {
          try {
            await deps.tasks.addTask(attributionTaskInput(source, spec, { projectId }))
          } catch (cause) {
            console.warn(
              `forge loop e2e baseline attribution card failed (${spec}): ${cause instanceof Error ? cause.message : String(cause)}`,
            )
          }
        }
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
      const hadInFlight = await terminateRecord(record)
      return { ok: true, stopped: true, hadInFlight }
    },

    async stopLoop(input: { readonly loopId: LoopInstanceId; readonly requesterSessionId: string }): Promise<LoopStopLoopResult> {
      // 3b 定向停止（stopTaskLoop——双入口同 registry 判活；统一结束处理与 stop() 同径单源）。
      // 作用域裁决（2026-10-17）：运行中仅 owner 可停；挂起态任意会话可停（其它会话接管支撑）。
      const record = registry.get(input.loopId)
      if (record === undefined) {
        return { ok: false, code: 'no-active-loop', suspended: false, ownerSessionId: '' }
      }
      const suspended = record.suspended !== undefined
      if (!suspended && record.ownerSessionId !== input.requesterSessionId) {
        return { ok: false, code: 'forbidden', suspended, ownerSessionId: record.ownerSessionId }
      }
      const hadInFlight = await terminateRecord(record)
      return { ok: true, stopped: true, hadInFlight }
    },

    activeOf(ownerSessionId: string): LoopRecord | undefined {
      return registry.byOwner(ownerSessionId)
    },

    activeAll(): readonly LoopRecord[] {
      return registry.all()
    },

    resume(input: { readonly loopId: LoopInstanceId }): LoopResumeResult {
      const loop = live.get(input.loopId)
      if (loop === undefined) return { ok: false, code: 'no-active-loop' }
      if (loop.record.suspended === undefined) return { ok: false, code: 'not-suspended' }
      loop.record.suspended = undefined // 写点②：处置回流——清挂起回落 active
      void runLoop(loop) // 从留存点续跑（ActiveLoop 运行时状态挂起期保留）
      return { ok: true, loopId: loop.record.id }
    },

    dispose(): void {
      // Root cause: 循环生命周期此前长于 fiber/DB 句柄生命周期——fiber 卸载后下一轮 DB 访问
      // 撞已关句柄异常终态；卸载即同步终态收口（静默——对账归 reconcileInterrupted）。
      for (const [id, loop] of live) { // Map 迭代中删当前条目安全——无需快照
        loop.controller.abort('loop disposed with fiber')
        registry.remove(id)
        clearExclusiveLoopSource(loop.source, id)
        live.delete(id)
      }
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
    const payload = { sourceSlug: slug, sourceKind: kind, taskKey: first.localId }
    await deps.narrator.notice(
      record.ownerSessionId,
      renderNarrative('startup-resume-stopped', payload),
      renderHeadline('startup-resume-stopped', payload),
    )
    return
  }
  if (stats.byStatus.in_progress > 0) {
    const cards = await deps.tasks.listTasks({ projectId: scope.projectId, source, statusFilter: ['in_progress'] })
    const inFlightCard = cards[0]
    if (inFlightCard !== undefined) {
      const payload = { sourceSlug: slug, sourceKind: kind, taskKey: inFlightCard.localId }
      await deps.narrator.notice(
        record.ownerSessionId,
        renderNarrative('startup-resume-inflight', payload),
        renderHeadline('startup-resume-inflight', payload),
      )
      return
    }
  }
  const scratchPayload = { sourceSlug: slug, sourceKind: kind, pending: stats.byStatus.pending }
  await deps.narrator.notice(
    record.ownerSessionId,
    renderNarrative('startup-from-scratch', scratchPayload),
    renderHeadline('startup-from-scratch', scratchPayload),
  )
}

/** 循环体（启动后 fire-and-forget——异常兜底告警 + 终局登记注销双保证；3b 挂起退出 =
 *  保留登记与运行时状态，终局收口（登记注销）仅在非挂起退出时执行） */
async function runLoop(loop: ActiveLoop): Promise<void> {
  const { record } = loop
  let suspended = false
  let rounds = 0 // 3c 轮数总量计数（生命周期总量——非连击，无复位）
  try {
    while (!loop.controller.signal.aborted) {
      // 3c 最大轮次封顶（终止条件全集之一）：达上限按 ⑮ 结束叙述收口（建议重派），不再续领
      if (rounds >= loop.maxRounds) {
        const stats = await statsFailSoft(loop)
        await loop.deps.narrator.settle(
          record.ownerSessionId,
          renderNarrative('finished-timeout', {
            sourceSlug: record.source.slug,
            reason: '达到最大轮次上限',
            completed: stats.byStatus.completed,
            blocked: stats.byStatus.blocked,
            pending: stats.byStatus.pending,
            instruction: loopInstructionOf('timeout', record.source.slug),
          }),
        )
        break
      }
      rounds += 1
      const outcome = await runRound(loop)
      if (outcome === 'suspend') {
        suspended = true // 挂起待裁决——登记在场、投影挂起、等 re-entry
        break
      }
      if (outcome !== 'continue') break
    }
  } catch (cause) {
    console.warn(
      `forge dispatch loop terminated abnormally (${record.source.slug}): ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  } finally {
    if (!suspended) {
      loop.registry.remove(record.id) // 终态即登记表删除（settled/halted/stopped/异常同径）
      clearExclusiveLoopSource(record.source, record.id) // S1c 独占注销（终态同径——幂等）
      loop.live.delete(record.id)
    }
  }
}

/**
 * e2e 基线取数（disc-2 · HEAD 键控刷新）：读循环 worktree 当前 HEAD → baselineForHead
 * （一致复用缓存 / 漂移重算）。readHead 故障（git 不可用）= 漂移不可判，复用现有缓存
 * fail-soft（不重跑昂贵套件）；重算故障 = 空清单 + warn（机制静默关闭，循环不阻）。
 */
async function ensureE2eBaseline(loop: ActiveLoop): Promise<E2eBaselineCache | undefined> {
  const cfg = loop.deps.e2eBaseline
  if (cfg === undefined) return undefined
  const slug = loop.record.source.slug
  let head: string | undefined
  if (cfg.readHead !== undefined && loop.record.worktree !== undefined) {
    try {
      head = await cfg.readHead(loop.record.worktree)
    } catch (cause) {
      // HEAD 读失败（git 故障）——漂移不可判，复用现有缓存 fail-soft（不重跑昂贵套件）
      console.warn(
        `forge loop e2e baseline head read failed (${slug}): ${cause instanceof Error ? cause.message : String(cause)}`,
      )
      return loop.e2eBaseline
    }
  }
  // head undefined（readHead/worktree 缺席或不可得）= 键不可得：首算一次后恒复用（现状语义）
  const before = loop.e2eBaseline
  const entry = await baselineForHead(head, before, cfg.runSuite)
  loop.e2eBaseline = entry
  if (entry !== before && entry.error !== undefined) {
    console.warn(`forge loop e2e baseline failed (${slug}): ${entry.error}`)
  }
  return entry
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
  // 改进7 disc-2：基线红灯清单按 HEAD 键控刷新后随 claim 简报递达（commit 落地漂移 → 重算，
  // 简报不再烤死于循环启动时点；稳定 HEAD = 缓存复用，零额外套件执行）
  const baseline = await ensureE2eBaseline(loop)
  const claim = await claimForDispatch(loop.core, exec, {
    identity: { sessionId: owner, loopSourced: true },
    guardKey: record.id,
    projectId: scope.projectId,
    source,
    ...(adoptRef !== undefined ? { adopt: adoptRef } : {}),
    ...(baseline !== undefined && baseline.redSpecs.length > 0
      ? { e2eBaselineRed: baseline.redSpecs }
      : {}),
    // disc 效度戳：效度比对检出根 = 发起循环的检出（1.14 cwd 钉定同源锚——重领证据机械
    // 比对此效度域，漂移 = stale 强制重跑）
    ...(record.worktree !== undefined ? { checkoutRoot: record.worktree } : {}),
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
    // 2026-10-12「去掉状态计数」——剩余行移除，载荷只剩任务源/任务行
    const payload = {
      sourceSlug: slug,
      taskLabel: `${taskLabelOf(task)}（恢复自中断 — 重新执行）`,
    }
    await deps.narrator.notice(owner, renderNarrative('claim-interrupted', payload), renderHeadline('claim-interrupted', payload))
  } else {
    const payload = {
      sourceSlug: slug,
      taskLabel: taskLabelOf(task),
    }
    await deps.narrator.notice(owner, renderNarrative('claim', payload), renderHeadline('claim', payload))
  }
  // 进度事件（1.17——领取点：常规 = claim / 恢复 = claim-resume；零模型面零回合唤醒）
  emitProgress(loop, {
    verb: adoptRef !== undefined ? 'claim-resume' : 'claim',
    status: 'running',
    taskKey,
    counts: progressCountsOf(stats),
  })
  // 通知 await 窗口的停止竞态收口（同上——stop 已接管则让渡）
  if (await bailIfAborted(loop, claim)) return 'terminal'

  // ③ spawn（dispatch-core 阶段二）：SpawnWorkerHandle 直持不经 jobs（decisions #14）；
  //    信号 = 循环控制器——stop 经 abort 取消 worker 剩余回合
  const spawned = await spawnClaimed(loop.core, exec, claim, {
    scope,
    signal,
    // cwd 钉定（1.14 判例修复）：worker 会话 cwd 机械钉定 = 发起循环的检出
    ...(record.worktree !== undefined ? { workspaceCwd: record.worktree } : {}),
  })
  if (!spawned.ok) {
    record.inFlight = undefined // spawn 未成——任务留 in_progress 走幂等重入径（不走 submit-blocked）
    if ('kind' in spawned.failure) return haltLoop(loop) // HaltedOutcome——唯一 kind 承载成员（guard 粘住）
    const failure = spawned.failure // ERR_SPAWN_FAILED DTO（防线计数已按 guardKey 落面）
    // 第一层机械守卫：退避后幂等重入（不立即重试——间隔递增 base×N；×3 halted 由 guard 兑现，decisions #11）
    loop.spawnFailures += 1
    const attempt = loop.spawnFailures
    const delayMs = backoffDelayMs(loop.delays.backoffBaseMs, attempt)
    const retryPayload = {
      sourceSlug: slug,
      attempt,
      errorSummary: summarizeReason(failure.message),
      delaySeconds: Math.round(delayMs / 1000),
      maxAttempts: HALT_THRESHOLD,
    }
    await deps.narrator.notice(
      owner,
      renderNarrative('spawn-failed-retry', retryPayload),
      renderHeadline('spawn-failed-retry', retryPayload),
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
    // 提交落点核验（1.14——cwd 钉定收口）：容器检出 = 发起循环 worktree
    ...(record.worktree !== undefined ? { worktreeCwd: record.worktree } : {}),
  })
  record.inFlight = undefined // 结算已定（success/blocked/killed/失败同径）——在飞清位
  if (signal.aborted) return 'terminal'

  // 落点核验失败径（1.18 bug d8029b20——显式处置收口，不走 worker-abort 失败阶梯）：
  // 结算核已把任务 completed → interrupted 真化（可恢复态）；此处事件留痕 + 挂起升级
  // 问询——重入 claim 对 completed 任务结构性不可达（旧径静默 finished-all 的根因）。
  if ('kind' in settled && settled.kind === 'landing-rejected') {
    loop.deps.narrator.recordIncident({ projectId: scope.projectId, sourceSlug: slug, taskKey: task.localId, eventType: 'settle-landing-rejected', error: settled.reason })
    emitProgress(loop, { verb: 'settle', status: 'interrupted', taskKey })
    return suspendForVerdict(loop, {
      kind: 'settle-landing-rejected',
      ownerSessionId: owner,
      source: record.source,
      taskKey,
      reason: settled.reason,
    })
  }
  if ('ok' in settled) {
    // 失败 DTO（结算核 failed 径——killSignal 在场时 killed 已先行返回）：
    // worker 异常终止属执行受阻非 spawn 机制故障（guardOnFailure=false 零防线计数零 tool-error）——
    // ⑫ bounded 立即重入（claim 面按 links 幂等重入同任务，不退避）→ 超限第三层（decisions #16）
    loop.workerAborts += 1
    const attempt = loop.workerAborts
    loop.deps.narrator.recordIncident({ projectId: scope.projectId, sourceSlug: slug, taskKey: task.localId, eventType: 'worker-aborted', error: settled.message })
    if (attempt > LOOP_WORKER_ABORT_MAX_RETRIES) {
      // 3b 裁决①：worker-abort-over-limit → 挂起待裁决（执行面反复崩溃需人裁决——非终局）
      return suspendForVerdict(loop, {
        kind: 'worker-abort-over-limit',
        ownerSessionId: owner,
        source: record.source,
        taskKey,
        attempts: attempt,
      })
    }
    const abortedPayload = { sourceSlug: slug, taskKey: task.localId, attempt, maxAttempts: LOOP_WORKER_ABORT_MAX_RETRIES }
    await loop.deps.narrator.notice(
      owner,
      renderNarrative('worker-aborted-retry', abortedPayload),
      renderHeadline('worker-aborted-retry', abortedPayload),
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
    const donePayload = { sourceSlug: slug, taskLabel: label, summary: settlement.summary ?? '已完成' }
    await deps.narrator.notice(owner, renderNarrative('completed', donePayload), renderHeadline('completed', donePayload))
    // 进度事件（1.17——结算成功点）
    emitProgress(loop, { verb: 'settle', status: 'completed', taskKey })
    return 'continue' // 续领下一轮
  }

  // blocked 静默边界（dispatch-loop-hardening 改进 1）：静默条件收窄为「存在活的后继任务」
  //（blockSource 挂接本任务的派生 fix/继任处于 pending/in_progress；blocked 后继须自有活后继；
  // rejected/skipped/completed = 断链）。活后继在场 → 非阻塞 notify（notice 径——reason 摘要 +
  // 后继任务键进叙述与折叠位）+ 事件子文件夹留痕，不上浮问询、续领后继。
  // 后继死了（自身 blocked 无再下级活后继 / rejected / skipped）或无后继 → 不静默，照旧落
  // 下方无进展硬停门与 triage 阶梯（问询恢复上浮；活性查询漏判/故障退化为现状问询）。
  const meta = { projectId: scope.projectId, taskKey: task.localId, reason: settlement.reason ?? '', settlement }
  const reason = settlement.reason ?? ''
  const liveSuccessor = await findLiveSuccessor(deps.tasks, scope.projectId, source, { slug: task.slug, localId: task.localId })
  if (liveSuccessor !== undefined) {
    await deps.narrator.blocked(owner, 'blocked-with-fix', { sourceSlug: slug, taskLabel: label, fixId: liveSuccessor.localId }, meta)
    emitProgress(loop, { verb: 'settle', status: 'blocked', taskKey })
    return 'continue'
  }

  // 无进展硬停门（提案 blocked-salvage-split · C，用户裁决 2026-10-13「没有进展则直接停止问人」）：
  // blocked 结算零 commit hash 且零 files 增量 = 无进展信号 → 跳过处置阶梯（triage 零调用、
  // 零 fix 链），直达 ⑩ blocked-ask-user 升级（followup 唤醒主 agent + 问询 + 答案回执）。
  // 有打捞提交（commit hash 在场）或带 files = 有进展，照常入阶梯。
  if (settlement.commitHash === undefined && (settlement.files === undefined || settlement.files.length === 0)) {
    await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
    emitProgress(loop, { verb: 'settle', status: 'blocked', taskKey })
    // 3b 裁决②：无进展硬停 → 挂起待裁决（原因全文在挂起载荷——owner 对话面处置）
    return suspendForVerdict(loop, {
      kind: 'blocked-ask-user',
      ownerSessionId: owner,
      source: record.source,
      task,
      reason,
      history: ['无进展硬停——结算零 commit hash 且零 files 增量，跳过处置阶梯直达问人'],
    })
  }

  // blocked 无 follow-up（修复路径缺位）→ 第二层处置代理（S1c 实装；钩子缺席 = 装配降级：
  // 仅落盘事件子文件夹、循环续领，池态判词机械接管后续叙述）
  if (deps.triage === undefined) {
    deps.narrator.recordIncident({ projectId: scope.projectId, sourceSlug: slug, taskKey: task.localId, eventType: 'blocked', error: settlement.reason ?? '', settlement })
    return 'continue'
  }

  // 处置阶梯（decisions #16/#22 + R2 + 改进 6）：同任务处置计数封顶强制升级；无效/越权输出
  // 计处置失败入重试上限（有界重试轮次——模型失误爆炸半径 = LOOP_TRIAGE_MAX_ATTEMPTS）。
  // 改进 6①②④⑤：失败摘要回灌重试、无效输出立即重试 vs 基建故障 spawn 同款 backoff、
  // fix 链深余量入参 + 余量不足拒 add-fix、externalSlug 存在性校验（无效计失败并回灌）。
  // 改进 6③：缓存决策直接重放执行（落库失败后的再遇 blocked——不重跑分析）。
  const book = dispositionBookOf(loop, taskKey)
  const fixChain = await fixChainOf(deps.tasks, scope.projectId, source, task)
  let decision: LoopTriageDecision | undefined
  let replayed = false
  if (book.decision !== undefined) {
    decision = book.decision
    replayed = true
    book.history.push('重放已缓存处置决策（不重跑分析）——执行')
  } else {
    while (decision === undefined && book.attempts < LOOP_TRIAGE_MAX_ATTEMPTS) {
      book.attempts += 1
      try {
        const candidate = await deps.triage.run({
          projectId: scope.projectId,
          source: record.source,
          ownerSessionId: owner,
          parent: exec.parent,
          signal,
          task,
          reason,
          settlement,
          ...(book.lastFailure !== undefined ? { lastFailure: book.lastFailure } : {}),
          ...(fixChain !== undefined ? { fixChain } : {}),
        })
        // 宿主执行前置校验（拒绝 = 计处置失败并回灌，同无效输出径）
        if (candidate.action === 'add-fix' && fixChain !== undefined && fixChain.remaining < 1) {
          throw hostRejection(
            `add-fix 被拒——fix 链余量不足（链深 ${fixChain.depth}/上限 ${fixChain.limit}，余量 ${fixChain.remaining}）；应选 split-remainder 或 ask-user`,
            JSON.stringify(candidate),
          )
        }
        if (candidate.action === 'wait-external' && deps.knownContainers !== undefined) {
          const known = await deps.knownContainers(scope.projectId)
          if (!known.includes(candidate.externalSlug)) {
            throw hostRejection(
              `wait-external.externalSlug 无效——${candidate.externalSlug} 不在已知容器集（feature/proposal 双轨）`,
              JSON.stringify(candidate),
            )
          }
        }
        decision = candidate
        book.lastFailure = undefined // 决策通过——回灌摘要清账
        book.history.push(`第${book.attempts}次处置——${triageDecisionNote(decision)}`)
      } catch (cause) {
        // 处置失败——入重试上限；改进 6① 失败摘要回灌（下一轮 prompt lastFailure）；
        // 改进 6② 分流：模型输出无效 → 立即重试；基建故障 → spawn 同款 backoff 退避
        const summary = triageFailureSummary(cause)
        book.lastFailure = summary
        const invalid = isTriageInvalidOutput(cause)
        book.history.push(`第${book.attempts}次处置——分析未得出结论${invalid ? `（输出摘要: ${summary}）` : ''}`)
        console.warn(
          `forge loop triage failed (${taskKey} attempt ${book.attempts}/${LOOP_TRIAGE_MAX_ATTEMPTS}): ${summary}`,
        )
        if (!invalid) {
          const paused = await sleepOrAbort(signal, backoffDelayMs(loop.delays.backoffBaseMs, book.attempts))
          if (!paused) return 'terminal' // 退避途中被叫停——让渡终止收口
        }
      }
    }
  }
  if (decision === undefined) {
    // 处置重试超限（同任务计数封顶）→ ⑩ 叙述 + 3b 裁决③：挂起待裁决（reason 全文与处置历史进挂起载荷）
    await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
    emitProgress(loop, { verb: 'settle', status: 'blocked', taskKey })
    return suspendForVerdict(loop, {
      kind: 'disposition-over-limit',
      ownerSessionId: owner,
      source: record.source,
      task,
      reason,
      attempts: book.attempts,
      history: [...book.history],
    })
  }
  book.decision = decision // 改进 6③ 决策缓存（执行成功/重放再败即清账）

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
      book.decision = undefined // 执行成功——缓存清账（防陈旧决策跨结算重放）
      await deps.narrator.blocked(
        owner,
        'blocked-auto-fixed',
        { sourceSlug: slug, taskLabel: label, fixId: added.localId, fixNote: decision.note ?? '待修复项' },
        meta,
      )
      emitProgress(loop, { verb: 'settle', status: 'blocked', taskKey })
    } catch (cause) {
      if ((cause as { code?: unknown }).code === 'ERR_CHAIN_DEPTH_EXCEEDED') {
        // fix 链深 ≤6 到顶（C6/addTask 权威校验）→ ⑩ 叙述 + 3b 裁决④：挂起待裁决
        book.decision = undefined
        const depthData = (cause as { data?: { depth?: number; limit?: number } }).data
        book.history.push(`第${book.attempts}次处置——修复任务创建被拒（修复链已达上限）`)
        await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
        return suspendForVerdict(loop, {
          kind: 'fix-chain-over-limit',
          ownerSessionId: owner,
          source: record.source,
          task,
          reason,
          ...(depthData?.depth !== undefined ? { depth: depthData.depth } : {}),
          ...(depthData?.limit !== undefined ? { limit: depthData.limit } : {}),
          history: [...book.history],
        })
      }
      // 改进 6③ 落库失败 fail-soft：首次失败保留决策缓存（再遇 blocked 重放执行不重跑分析）；
      // 重放再败 → 清缓存升级第三层（有界——防无限重放同失败径）
      if (replayed) {
        book.decision = undefined
        book.history.push('重放执行再次失败——缓存清账，交人工裁决')
        console.warn(`forge loop triage add-fix replay failed (${taskKey}): ${cause instanceof Error ? cause.message : String(cause)}`)
        await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
        emitProgress(loop, { verb: 'settle', status: 'blocked', taskKey })
        // 3b 裁决⑤⑥（重放再败径 ×2）：挂起待裁决（缓存清账后交 owner 对话面）
        return suspendForVerdict(loop, {
          kind: 'blocked-ask-user',
          ownerSessionId: owner,
          source: record.source,
          task,
          reason,
          history: [...book.history],
        })
      }
      console.warn(`forge loop triage add-fix failed (${taskKey}): ${cause instanceof Error ? cause.message : String(cause)}`)
      deps.narrator.recordIncident({ projectId: scope.projectId, sourceSlug: slug, taskKey: task.localId, eventType: 'blocked', error: settlement.reason ?? '', settlement })
    }
    return 'continue'
  }
  if (decision.action === 'split-remainder') {
    try {
      // disc-N 机械（blockSource:false）：继任任务承接剩余范围，源任务保持 blocked 不恢复
      // ——不重头开始的结构保证（继任活跃期源不重跑全简报；pending 继任在场，池态判词不误报）
      const added = await deps.tasks.addTask({
        projectId: scope.projectId,
        source,
        title: decision.title ?? `Split: ${task.title}`,
        type: decision.type ?? task.taskType,
        ...(decision.taskDesc !== undefined ? { taskDesc: decision.taskDesc } : {}),
        sourceTask: { slug: task.slug, localId: task.localId },
        blockSource: false,
      })
      book.decision = undefined // 执行成功——缓存清账（防陈旧决策跨结算重放）
      await deps.narrator.blocked(
        owner,
        'blocked-split',
        { sourceSlug: slug, taskLabel: label, successorId: added.localId, ...(decision.note !== undefined ? { splitNote: decision.note } : {}) },
        meta,
      )
      emitProgress(loop, { verb: 'settle', status: 'blocked', taskKey })
    } catch (cause) {
      // split 落库失败 fail-soft（改进 6③ 缓存语义同 add-fix：首次保缓存待重放、重放再败清账升级）
      if (replayed) {
        book.decision = undefined
        book.history.push('重放执行再次失败——缓存清账，交人工裁决')
        console.warn(`forge loop triage split-remainder replay failed (${taskKey}): ${cause instanceof Error ? cause.message : String(cause)}`)
        await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
        emitProgress(loop, { verb: 'settle', status: 'blocked', taskKey })
        // 3b 裁决⑤⑥（重放再败径 ×2）：挂起待裁决（缓存清账后交 owner 对话面）
        return suspendForVerdict(loop, {
          kind: 'blocked-ask-user',
          ownerSessionId: owner,
          source: record.source,
          task,
          reason,
          history: [...book.history],
        })
      }
      console.warn(`forge loop triage split-remainder failed (${taskKey}): ${cause instanceof Error ? cause.message : String(cause)}`)
      deps.narrator.recordIncident({ projectId: scope.projectId, sourceSlug: slug, taskKey: task.localId, eventType: 'blocked', error: settlement.reason ?? '', settlement })
    }
    return 'continue'
  }
  if (decision.action === 'wait-external') {
    book.decision = undefined // 执行（记录等待）即清账——后续 blocked 再入阶梯重跑分析
    await deps.narrator.blocked(owner, 'blocked-wait-external', { sourceSlug: slug, taskLabel: label, externalSlug: decision.externalSlug }, meta)
    emitProgress(loop, { verb: 'settle', status: 'blocked', taskKey })
    return 'continue' // 记录等待 → 续领其它（若整源无可领，池态判词收口）
  }
  // ask-user → ⑩ 叙述 + 3b 裁决⑦：挂起待裁决（处置历史已由阶梯循环记录本决策行）
  await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
  emitProgress(loop, { verb: 'settle', status: 'blocked', taskKey })
  return suspendForVerdict(loop, {
    kind: 'blocked-ask-user',
    ownerSessionId: owner,
    source: record.source,
    task,
    reason,
    history: [...book.history],
  })
}

// ─────────────────────────── no-task 三态判词与终局收口 ───────────────────────────

/** no-task 三态判词（AC：settled 收口 / 等待 in-flight / halted-受阻）：classifyPool 纯函数裁决 */
async function onNoTask(loop: ActiveLoop, pool: PoolSnapshot): Promise<RoundOutcome> {
  const verdict = classifyPool(pool)
  if (verdict === 'done') {
    // 3c 续派静默窗：⑯ 收口前 wait-for-quiescence——编排层窗内新派任务即自动续派；
    // 窗满静默才收口；窗内叫停 = 用户终止径（收口归停止径，零结束叙述）。
    const quiescence = await waitForQuiescence(loop)
    if (quiescence === 'continue') return 'continue'
    if (quiescence === 'terminal') return 'terminal'
    // 任务源 settled → settlement 收口（3b④：⑯ 骨架文 + P8 评审指示段追加——四重点逐字在文，
    // source {kind:'dispatch-loop-settled'} 持久 user message 三径投递）
    const stats = await statsFailSoft(loop)
    const settledPayload: InjectionPayload = {
      slug: loop.record.source.slug,
      ownerSessionId: loop.record.ownerSessionId,
      taskKey: '',
      reason: '',
      history: '',
      completed: stats.byStatus.completed,
      blocked: stats.byStatus.blocked,
    }
    await loop.deps.narrator.settle(
      loop.record.ownerSessionId,
      [
        renderNarrative('finished-all', {
          sourceSlug: loop.record.source.slug,
          completed: stats.byStatus.completed,
          blocked: stats.byStatus.blocked,
          instruction: LOOP_INSTRUCTION_ALL_DONE,
        }),
        renderEndOfLoop('finished-all', settledPayload),
      ].join('\n\n'),
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
    // 3b 裁决⑧：deadlock-suspected → 挂起待裁决（阻塞清单在挂起载荷——处置后 re-entry 续跑）
    return suspendForVerdict(loop, {
      kind: 'deadlock',
      ownerSessionId: loop.record.ownerSessionId,
      source: loop.record.source,
      blockedItems,
    })
  }
  // wait：在飞未结 / 前置未满足 → bounded patience（轮间停顿后重试；连续 wait 封顶收口建议重派）
  loop.waitRounds += 1
  if (loop.waitRounds >= LOOP_PATIENCE_MAX_WAIT_ROUNDS) {
    const stats = await statsFailSoft(loop)
    // ⑮ 等待超时收口 = settlement 形态（3b④）
    await loop.deps.narrator.settle(
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
  // ⑬ 终局叙述先行（问询另行发起——与 ⑩ 同序：叙述在前、问询随后）；settlement 形态（3b④）
  await deps.narrator.settle(
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
