// loop · 宿主派发循环驱动器（S1b——run-tasks-host-command proposal S1 + SC2 +
// implementation-blueprint §3 runRound 状态机，v1 严格串行）。
//
// 全链宿主代码驱动、零模型参与：每轮 = 领取（dispatch-core 阶段一，identity.loopSourced=true、
// guardKey = LoopInstanceId）→ 领取通知（S4 notify·send(nextStep, false) 写入不唤醒）→ in-process
// spawn（dispatch-core 阶段二——SpawnWorkerHandle 直持不经 jobs，decisions #14）→ 结算（阶段三，
// killSignal = 循环控制器）→ 结果通知 → 判定 → 下一轮，直到任务源 settled 收口（结算单点
// send(nextStep, true) 一次唤醒）。
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
//    叙述（⑰）+ 循环终态注销；
// ⑨ 机械③（forge-verification-hardening）：no-task done 分流处 first-pass-complete 标记
//    （首次无可派任务，幂等）+ 代码 review 收口后 doc 复盘任务派生（注入飞轮硬指标 + 越阈
//    判定规则，阈值取机械⑦ settings 键，越阈 AC 硬门要求已注册改进提案）+ merged 漏标记
//    lazy 兜底（下个容器循环启动时校验补标记）。术语纪律：first-pass = 首次无可派任务；
//    收口 = merged 终态，不混用。
//
// 依赖方向：loop → dispatch-core / notify / contracts 单向；零工具壳 import（可拆卸壳纪律）。
import { FIX_CHAIN_DEPTH_LIMIT, FLYWHEEL_REVIEW_WAVE_THRESHOLD_DEFAULT } from '@dsh-forge/contracts'
import type { ContainerRef, ForgeSettingsService, ForgeTasksService, TaskSnapshot, TaskStats, TaskType } from '@dsh-forge/contracts'
import { HALT_THRESHOLD, HALTED_REASON } from '../dispatch-core/index.js'
// S1c 循环独占守卫面（登记/注销——守卫消费在 dispatch-core claim 面）
import { claimForDispatch, classifyPool, computeWaveSnapshot, findLiveSuccessor, gitHeadCommit, poolOf, settleClaimed, spawnClaimed } from '../dispatch-core/index.js'
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
import type { ForgeProgressCounts, ForgeProgressEventData, ForgeProgressScenario, ProgressAppendFace } from '../progress/index.js'
import { FORGE_PROGRESS_SCENARIOS } from '../progress/index.js'
import { createLoopRegistry } from './registry.js'
import type { LoopInFlight, LoopInstanceId, LoopRecord, LoopRegistry, LoopSourceRef, SuspendedPayload } from './registry.js'
import { attributionTaskInput, baselineForHead, loadPersistedBaseline, persistBaseline, type E2eBaselineCache } from './e2e-baseline.js'

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

/** 终局叙述的「下一步动作」指示文本（notification-samples ⑬⑮ 逐字口径的 slug 参数化） */
export function loopInstructionOf(kind: 'halted' | 'timeout', slug: string): string {
  if (kind === 'halted') return `环境排查后重新开始 /run-dag-tasks ${slug}`
  return `稍后重新执行 /run-dag-tasks ${slug}`
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
    | {
        /** 流控挂起（bug 63112ab2——限流零重试，返回主会话择时重派） */
        readonly kind: 'rate-limit'
        readonly ownerSessionId: string
        readonly source: LoopSourceRef
        readonly taskKey: string
        /** 流控原因全文（worker 输出/spawn 拒绝判词——问询 detail） */
        readonly reason: string
      }
    | {
        /** 单任务暂停挂起（task-pause-primitive——pauseTask 面写点①的挂起投影载荷） */
        readonly kind: 'task-paused'
        readonly ownerSessionId: string
        readonly source: LoopSourceRef
        readonly taskKey: string
        /** 暂停原因全文（pauseTask 必带——载荷全文承载） */
        readonly reason: string
      }

export interface LoopEscalationHook {
  escalate(escalation: LoopEscalation): Promise<void>
}

// ─────────────────────────── 机械③ · first-pass 标记 / 复盘派生 / merged lazy 兜底 ───────────────────────────

/** 计数快照（标记时刻累计值——机械①检查点四列，口径 = settle.computeWaveSnapshot） */
export interface LoopCheckpointSnapshot {
  readonly tasksTotal: number
  readonly commitsTotal: number
  readonly fixesTotal: number
  readonly evidenceDebtsTotal: number
}

/** 检查点行读影（飞轮指标计算面——mark 词汇宽松读，字段=机械①快照四列） */
export interface LoopCheckpointRowLite {
  readonly mark: string
  readonly tasksTotal: number
  readonly commitsTotal: number
  readonly fixesTotal: number
  readonly evidenceDebtsTotal: number
}

/**
 * checkpoints 域服务的循环侧结构化消费面（结构兼容 core createCheckpointsService——插件禁
 * import core）。ensureCheckpoint 幂等语义 = 域侧既有（标记在场 no-op appended=false）。
 */
export interface LoopCheckpointsFace {
  ensureCheckpoint(input: {
    readonly projectId: string
    readonly proposalId: string
    readonly mark: 'first-pass-complete' | 'merged'
    readonly baseCommitHash: string
    readonly snapshots: LoopCheckpointSnapshot
  }): Promise<{ readonly appended: boolean }>
  /**
   * review-wave-N 追加（机械④结算侧透传——loop.core 结构投影 SettleCheckpointsFace 消费；
   * wave_seq 缺省域侧自动递增）
   */
  appendCheckpoint(input: {
    readonly projectId: string
    readonly proposalId: string
    readonly mark: 'review-wave-N'
    readonly baseCommitHash: string
    readonly snapshots: LoopCheckpointSnapshot
  }): Promise<unknown>
  listCheckpoints(q: {
    readonly projectId: string
    readonly proposalId: string
    readonly marks?: readonly string[]
  }): Promise<readonly LoopCheckpointRowLite[]>
}

/** 越阈硬门 AC（复盘任务 acceptance_criteria——未注册改进提案不得 success，提案 M7 口径） */
export const RETRO_PROPOSAL_AC =
  '已注册改进提案（parent_proposal_id 指向本提案）并在结算记录 ac_evidence 登记派生提案 id 清单——未注册不得 success'

/** 复盘任务终态集（幂等在场判定口径——终态复盘任务不再拦派生，非终态 = 窄窗口现场） */
const RETRO_TERMINAL_TASK_STATUSES: ReadonlySet<string> = new Set(['completed', 'skipped', 'rejected'])

/** 复盘任务标题模板（单一常量，派生与在场判定两处消费——字面分叉会静默失配使幂等防护失效） */
const RETRO_TASK_TITLE_PREFIX = 'first-pass 复盘：'

/** 飞轮硬指标（标记快照直算——提案「派生硬指标」节口径） */
export interface FlywheelMetrics {
  /** 一次通过率 = first-pass 时任务数 / merged（缺席 = 当前帧）时任务数 */
  readonly passRate: number
  /** 返工增量比 = first-pass 后 commit 增量 / 全量 commit（无 merged 帧 = 0） */
  readonly reworkRatio: number
  /** 修正波次 = review-wave-N 标记计数 */
  readonly waveCount: number
  /** fix 密度 = fix 任务数 / 任务总数（当前帧） */
  readonly fixDensity: number
  /** 越阈判定：修正波次 ≥ 阈值（机械⑦ settings flywheel.reviewWaveThreshold，缺席默认 6） */
  readonly overThreshold: boolean
}

/** 飞轮硬指标计算（纯函数——快照直算，单测锚） */
export function flywheelMetricsOf(rows: readonly LoopCheckpointRowLite[], threshold: number): FlywheelMetrics {
  const first = rows.find((r) => r.mark === 'first-pass-complete')
  const merged = rows.find((r) => r.mark === 'merged')
  const current = merged ?? first
  const firstPassTasks = first?.tasksTotal ?? 0
  const currentTasks = current?.tasksTotal ?? firstPassTasks
  const commitsTotal = current?.commitsTotal ?? 0
  const baselineCommits = first?.commitsTotal ?? commitsTotal
  return {
    passRate: currentTasks > 0 ? firstPassTasks / currentTasks : 1,
    reworkRatio: commitsTotal > 0 ? (commitsTotal - baselineCommits) / commitsTotal : 0,
    waveCount: rows.filter((r) => r.mark === 'review-wave-N').length,
    fixDensity: currentTasks > 0 ? (current?.fixesTotal ?? 0) / currentTasks : 0,
    overThreshold: rows.filter((r) => r.mark === 'review-wave-N').length >= threshold,
  }
}

/** 复盘任务简报（指标计算值 + 越阈判定规则 + 多 agent 交叉核验 + learn 技能要求——机械注入面） */
export function renderRetroBrief(slug: string, m: FlywheelMetrics, threshold: number): string {
  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
  return [
    `【first-pass 复盘】容器 ${slug} 首次无可派任务（first-pass），代码 review 已收口——对本次特性做经验复盘并沉淀。`,
    '术语纪律：first-pass = 首次无可派任务；收口 = merged 终态；两者不混用。',
    '',
    '一、飞轮硬指标（检查点标记快照直算）：',
    `- 一次通过率：${m.passRate === 1 ? '1（尚无 merged 帧，基线即当前）' : pct(m.passRate)}`,
    `- 返工增量比：${pct(m.reworkRatio)}`,
    `- 修正波次：${String(m.waveCount)}`,
    `- fix 密度：${pct(m.fixDensity)}`,
    '',
    '二、越阈判定规则：修正波次 ≥ 阈值即越阈（阈值 = settings flywheel.reviewWaveThreshold，' +
      `当前生效值 ${String(threshold)}；settings 键缺席 = 默认值 ${String(FLYWHEEL_REVIEW_WAVE_THRESHOLD_DEFAULT)}）。` +
      `当前判定：修正波次 ${String(m.waveCount)} ${m.overThreshold ? '≥' : '<'} ${String(threshold)} → ` +
      (m.overThreshold ? '已越阈——本任务 AC 含硬门「已注册改进提案」，未注册不得 success。' : '未越阈——无注册硬门，仍须完成复盘沉淀。'),
    '',
    '三、多 agent 交叉核验：各 agent 独立提取本特性验收经验/判例/翻车点，交叉比对后取共识入沉淀，' +
      '分歧记录待裁决——单视角结论不直接入库。',
    '',
    '四、learn 技能调用：三类沉淀（conventions/lessons/examples）全量经 learn 技能提取，落 .knowledge/ 对应目录' +
      '（markdown 同构字段 title/summary/keywords/domainPath + 溯源字段：来源容器 slug / 来源任务 / bug id）；' +
      '提炼态 conventions 晋升 docs/conventions 正本仍走提案管线裁决，不直改技能检查项。',
  ].join('\n')
}

/** 越阈判定阈值（机械⑦——settings flywheel.reviewWaveThreshold，键缺席/读故障 = 默认值生效） */
async function reviewWaveThresholdOf(loop: ActiveLoop): Promise<number> {
  try {
    const settings = await loop.deps.settings?.get()
    return settings?.flywheel?.reviewWaveThreshold ?? FLYWHEEL_REVIEW_WAVE_THRESHOLD_DEFAULT
  } catch {
    return FLYWHEEL_REVIEW_WAVE_THRESHOLD_DEFAULT
  }
}

/** 标记时点容器分支 HEAD（git rev-parse 优先，回落最近一次结算 commit hash——标记锚不可得 = undefined） */
async function headHashOf(loop: ActiveLoop): Promise<string | undefined> {
  if (loop.record.worktree !== undefined) {
    const head = await (loop.deps.resolveHeadCommit ?? gitHeadCommit)(loop.record.worktree)
    if (head !== undefined) return head
  }
  return loop.lastCommitHash
}

/**
 * first-pass 收口（机械③——no-task done 分流处调用，评审建议1派生锚收口）：标记缺席时先派生
 * 复盘任务、addTask 成功才落 first-pass-complete 标记（append-only 域，标记先行曾致派生
 * fail-soft 失败即复盘任务永久丢失）；addTask 失败不落标记，幂等窗口留给下一轮 no-task done
 * 重试。标记已在校（list 前置判读）= 已锚定 → 不重派不重落，零行为变化。落标记失败窗口由
 * 在场判定兜底（hasOpenRetroTask——非终态同源复盘任务在场即跳过派生只补标记，addTask 无幂等键，
 * 重派将致复盘任务重复入池）。
 * 返回 true = 本轮新落标记且复盘任务已入池（续领下一轮）。
 */
async function ensureFirstPassClosure(loop: ActiveLoop): Promise<boolean> {
  const checkpoints = loop.deps.checkpoints
  if (checkpoints === undefined || loop.proposalId === undefined) return false
  try {
    const rows = await checkpoints.listCheckpoints({
      projectId: loop.scope.projectId,
      proposalId: loop.proposalId,
      marks: ['first-pass-complete'],
    })
    if (rows.some((r) => r.mark === 'first-pass-complete')) return false // 已锚定——照旧收口
    // Root cause（bug 9c350e5f）：先派生后落标记序下，deriveRetroTask 执行时 first-pass-complete
    // 行尚未落库——直接 list 读不到 first 帧致 flywheelMetricsOf 恒兜底。派生时点独立取当前池
    // 快照合成 first 帧（与标记快照同口径），不依赖标记行先行。
    const pendingSnapshots = await computeWaveSnapshot(loop.deps.tasks, loop.scope.projectId, loop.record.source)
    if (!(await hasOpenRetroTask(loop))) {
      // 幂等防护（评审建议2）：addTask 成功后落标记失败的窄窗口——同源 doc 复盘任务已在池
      // （非终态）即不重派，仅补落标记；读面故障 = fail-soft 视为缺席，退化回派生重试现状。
      if (!(await deriveRetroTask(loop, pendingSnapshots))) return false // 派生失败不落标记——下轮重试
    }
    return await ensureFirstPassMark(loop)
  } catch (cause) {
    console.warn(
      `forge loop first-pass closure failed (${loop.record.source.slug}): ${cause instanceof Error ? cause.message : String(cause)}`,
    )
    return false
  }
}

/**
 * 同源 doc 复盘任务在场判定（幂等防护——first-pass 派生前调用）：容器池内已有同 slug、
 * 同源、同标题、type=doc 的非终态复盘任务（completed/skipped/rejected 之外）= 曾派生且
 * 标记落库失败的窄窗口现场，重派将致复盘任务重复入池（addTask 无幂等键）。读面故障 =
 * fail-soft 返回 false（视为缺席，保持派生重试现状）。
 */
async function hasOpenRetroTask(loop: ActiveLoop): Promise<boolean> {
  const title = `${RETRO_TASK_TITLE_PREFIX}${loop.record.source.slug}`
  try {
    const cards = await loop.deps.tasks.listTasks({
      projectId: loop.scope.projectId,
      source: { kind: loop.record.source.kind, slug: loop.record.source.slug },
    })
    return cards.some((c) => c.taskType === 'doc' && c.title === title && !RETRO_TERMINAL_TASK_STATUSES.has(c.taskStatus))
  } catch {
    return false
  }
}

/**
 * first-pass-complete 标记（机械③——no-task done 分流处调用）：首次无可派任务时经检查点域
 * 幂等落标记（域侧 ensure 幂等——已在场 no-op appended=false）。标记锚（HEAD/快照）不可得
 * 或依赖缺席 = fail-soft 跳过，循环收口零受阻。返回 appended=true 表示本次首次落标记。
 */
async function ensureFirstPassMark(loop: ActiveLoop): Promise<boolean> {
  const checkpoints = loop.deps.checkpoints
  if (checkpoints === undefined || loop.proposalId === undefined) return false
  try {
    const head = await headHashOf(loop)
    if (head === undefined) {
      console.warn(`forge loop first-pass mark skipped (no base commit) for ${loop.record.source.slug}`)
      return false
    }
    const snapshots = await computeWaveSnapshot(loop.deps.tasks, loop.scope.projectId, loop.record.source)
    const result = await checkpoints.ensureCheckpoint({
      projectId: loop.scope.projectId,
      proposalId: loop.proposalId,
      mark: 'first-pass-complete',
      baseCommitHash: head,
      snapshots,
    })
    return result.appended
  } catch (cause) {
    console.warn(
      `forge loop first-pass mark failed (${loop.record.source.slug}): ${cause instanceof Error ? cause.message : String(cause)}`,
    )
    return false
  }
}

/**
 * doc 复盘任务派生（机械③——first-pass 首次落标记后调用，即「代码 review 结束后」的机械
 * 承接：first-pass = 全部任务完成，review 任务含于其中已收口）：注入飞轮硬指标计算值与越阈
 * 判定规则（阈值取机械⑦ settings 键）、多 agent 交叉核验要求、learn 技能调用要求；越阈时
 * AC 硬门要求已注册改进提案（未注册不得 success）。fail-soft：派生失败 warn 留痕不阻收口。
 */
async function deriveRetroTask(loop: ActiveLoop, pendingFirstPass?: LoopCheckpointSnapshot): Promise<boolean> {
  const { deps, record } = loop
  const checkpoints = deps.checkpoints
  if (checkpoints === undefined || loop.proposalId === undefined) return false
  try {
    const rows = await checkpoints.listCheckpoints({ projectId: loop.scope.projectId, proposalId: loop.proposalId })
    // 标记行缺席（先派生后落标记序）+ 快照在场 = 以派生时点池快照合成 first 帧补位（bug 9c350e5f）
    const effectiveRows =
      pendingFirstPass === undefined || rows.some((r) => r.mark === 'first-pass-complete')
        ? rows
        : [...rows, { mark: 'first-pass-complete' as const, ...pendingFirstPass }]
    const threshold = await reviewWaveThresholdOf(loop)
    const metrics = flywheelMetricsOf(effectiveRows, threshold)
    await deps.tasks.addTask({
      projectId: loop.scope.projectId,
      source: record.source,
      title: `${RETRO_TASK_TITLE_PREFIX}${record.source.slug}`,
      type: 'doc',
      priority: 'P1',
      estimatedTime: '1-2h',
      taskDesc: renderRetroBrief(record.source.slug, metrics, threshold),
      ...(metrics.overThreshold ? { acceptanceCriteria: [RETRO_PROPOSAL_AC] } : {}),
    })
    return true
  } catch (cause) {
    console.warn(
      `forge loop retro task derivation failed (${record.source.slug}): ${cause instanceof Error ? cause.message : String(cause)}`,
    )
    return false
  }
}

/**
 * merged 漏标记 lazy 兜底（机械③——下个容器循环启动时校验补标记，与 stabilized lazy 判定
 * 同构）：收口判据 = first-pass-complete 与 retro-done 标记在场、merged 缺席（收口前置 =
 * 复盘已结算，提案 M5 口径）且容器池全终态（done 快照）——四条件齐才 ensureCheckpoint 补
 * merged（域侧幂等）。fail-soft：任何失败 warn 留痕，循环启动零受阻。
 */
async function ensureMergedBackfill(loop: ActiveLoop): Promise<void> {
  const checkpoints = loop.deps.checkpoints
  if (checkpoints === undefined || loop.proposalId === undefined) return
  try {
    const rows = await checkpoints.listCheckpoints({
      projectId: loop.scope.projectId,
      proposalId: loop.proposalId,
      marks: ['first-pass-complete', 'retro-done', 'merged'],
    })
    const has = (mark: string): boolean => rows.some((r) => r.mark === mark)
    if (!has('first-pass-complete') || !has('retro-done') || has('merged')) return
    // 评审建议2（bug 548ea94b 附带收口）：suspended/interrupted 同为非终态——挂起/中断容器
    // 不得被 lazy 兜底提前补 merged（原 poolOf 四键判定漏此二态，挂起容器可被提前收口标记）
    const by = (await statsFailSoft(loop)).byStatus
    if (by.pending !== 0 || by.in_progress !== 0 || by.blocked !== 0 || by.suspended !== 0 || by.interrupted !== 0)
      return // 容器未收口——不补
    const head = await headHashOf(loop)
    if (head === undefined) {
      console.warn(`forge loop merged backfill skipped (no base commit) for ${loop.record.source.slug}`)
      return
    }
    const snapshots = await computeWaveSnapshot(loop.deps.tasks, loop.scope.projectId, loop.record.source)
    await checkpoints.ensureCheckpoint({
      projectId: loop.scope.projectId,
      proposalId: loop.proposalId,
      mark: 'merged',
      baseCommitHash: head,
      snapshots,
    })
  } catch (cause) {
    console.warn(
      `forge loop merged backfill failed (${loop.record.source.slug}): ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
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
  /**
   * 本项目文档根绝对路径（<工作区根>/.forge/docs——装配面按 projectId 解析工作区根派生）：
   * 登记进 LoopRecord.docsRoot——纯文档跨分支特例的归属判据锚（结算核 resolve 绝对路径
   * 核验包含，他项目 .forge/docs 不命中）。缺席 = 特例回落前缀判据（fail-soft）。
   */
  readonly docsRoot?: string
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

/**
 * 单任务暂停返回（task-pause-primitive pauseTask——typed 拒绝四径：no-active-loop 无活循环 /
 * forbidden 运行中越权（挂起态接管放行）/ reason-required 暂停原因必带 / no-in-progress-task
 * 无在途任务——挂起态接管径无在途对象也归此码）；suspended/ownerSessionId 随行供自解释文案。
 */
export type LoopPauseResult =
  | { readonly ok: true; readonly paused: true; readonly taskKey: string }
  | {
      readonly ok: false
      readonly code: 'no-active-loop' | 'forbidden' | 'reason-required' | 'no-in-progress-task'
      readonly suspended: boolean
      readonly ownerSessionId: string
    }

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
   * checkpoints 域服务消费面（机械③——first-pass-complete 标记 / merged 漏标记 lazy 补；
   * 结构兼容 core createCheckpointsService。缺席 = 机制惰性不判，行为零变化）
   */
  readonly checkpoints?: LoopCheckpointsFace
  /**
   * 容器 → 提案 id 解析（机械③——检查点 proposal_id 归属锚，装配面经提案谱系注入；
   * 缺席/未命中 = 机制惰性不判，行为零变化）
   */
  readonly resolveProposalId?: (projectId: string, source: ContainerRef) => Promise<string | undefined>
  /**
   * 容器分支 HEAD 解析器（机械③标记时点 base_commit_hash——缺省回落 gitHeadCommit 真解析；
   * 单测注入桩。worktree 缺席或解析故障 = 回落最近一次结算 commit hash，双缺席 = 标记跳过）
   */
  readonly resolveHeadCommit?: (worktree: string) => Promise<string | undefined>
  /**
   * 已知容器集读面（改进 6⑤——wait-external.externalSlug 存在性校验的宿主数据源；
   * 返回该 projectId 下全部已知容器 slug（feature + proposal 双轨并集）。缺席 = 校验
   * 缺席退化现状（fail-soft——装配面未接线时不阻塞处置阶梯）。
   */
  readonly knownContainers?: (projectId: string) => Promise<readonly string[]>
  /**
   * e2e 红灯基线门（改进7——可选；缺席 = 机制关闭，简报零 E2E_BASELINE_RED 行）。
   * runSuite = e2e 套件全量执行命令（返回 reporter 输出——`FAIL <spec>` 行被解析为红灯
   * 清单；worktree 入参与 readHead 同源锚定——多 worktree 并行循环基线取数点与缓存键
   * 不错位）。disc-2：基线按 HEAD 键控缓存——readHead 读循环 worktree 当前 HEAD，claim 时
   * 比对：一致复用缓存、漂移重算（简报不烤死于循环启动时点）；readHead/HEAD 缺席 = 无漂移
   * 可判，回落启动时一次性基线。启动跑一次 + 逐一生成归因卡（三分流）；套件执行故障
   * fail-soft（空清单 + warn），循环不阻。
   */
  readonly e2eBaseline?: {
    readonly runSuite: (worktree?: string) => Promise<string>
    /** worktree → 当前 HEAD（装配面注入 git rev-parse 缝；缺席/返回 undefined = 键不可得） */
    readonly readHead?: (worktree: string) => Promise<string | undefined>
    /**
     * 基线缓存文件路径提供器（bug 006d8bfe 后续——HEAD 键控持久化，跨实例/重启复用，
     * 同 HEAD 套件零重跑）。用户裁决 2026-10-18：落 `{worktree}/.forge/caches/{slug}/
     * e2e-baseline/`（随检出走、容器隔离）。缺席 = 无持久化（实例域缓存现状）。
     * error 形态（基线不可得）不落缓存。
     */
    readonly cacheFile?: (input: {
      readonly slug: string
      readonly worktree?: string
    }) => string | undefined
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
  /**
   * 单任务暂停（task-pause-primitive——pauseTask 工具消费面）：硬中断在飞 worker（先摘
   * record.inFlight 再 abort——stop 面已实证的竞态收口序，kill 信号合成 stop ∪ pause、
   * 结算按 killed 分类零 bump）→ 任务真化 suspended（reason 必带，1.4 转移服务审计）→
   * 循环置 LoopRecord.suspended 挂起（登记保留，dispatchTask re-entry resume 续跑）。
   * 归属守卫与 stopLoop 同权限面：运行中仅 owner 会话可 pause；挂起态任意会话可接管。
   */
  pause(input: { readonly loopId: LoopInstanceId; readonly requesterSessionId: string; readonly reason: string }): Promise<LoopPauseResult>
  /** 本会话活循环（S2「跑动中再触发」的查询面；无 = undefined） */
  activeOf(ownerSessionId: string): LoopRecord | undefined
  /** 进程内全量活循环读数（2026-10-12 多会话并行——指令层同源占用判定/候选过滤观察面） */
  activeAll(): readonly LoopRecord[]
   /**
    * 处置回流（3b re-entry）：清 `record.suspended` 回落 active 并从留存点续跑（ActiveLoop
    * 运行时状态——处置簿/计数——挂起期保留）。
    *
    * 返回（re-entry）：无活登记 = no-active-loop；未挂起 = not-suspended；
    * 已叫停（terminateRecord 异步窗口内 re-entry——控制器已 abort）= aborted（拒绝，不误报 ok:true）。
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
  /**
   * pause 控制器（task-pause-primitive——单任务暂停的独立 kill 信号：abort 只中断在飞
   * worker、不杀循环本体；runRound 经 killSignalOf 合成 stop ∪ pause 作结算 killSignal。
   * resume 时换新——上轮暂停信号不再影响续跑轮）
   */
  pause: AbortController
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
  /** 基线在飞去重（bug 006d8bfe 后台化——start fire-and-forget 与 runRound 首 claim 并发同跑套件的 dedup 缝） */
  e2eBaselineInflight?: Promise<E2eBaselineCache | undefined>
  /** 基线链（基线跑批 + 归因卡生成——后台化后的有序收口锚：终局径 await 防归因卡晚于终局） */
  baselineChain?: Promise<void>
  /** e2e 归因卡已发集（spec 键——HEAD 漂移重算径对新增红灯补发，已发不重发；启动时点同源） */
  readonly e2eAttributed: Set<string>
  /** 3c 轮数总量计数（生命周期总量——resume 续用不清零；达 maxRounds 即 ⑮ 终局） */
  rounds: number
  /** 机械③：容器 → 提案 id（start 时解析一次的检查点归属锚；缺席 = 机制惰性不判） */
  proposalId?: string
  /** 机械③：最近一次 success 结算 commit hash（标记时点 HEAD 的回落锚——worktree 缺席径） */
  lastCommitHash?: string
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
 * fix 链深上限（改进 6④——常量单源消费别名：contracts `FIX_CHAIN_DEPTH_LIMIT` 是 core
 * addTask C6 与宿主 triage 的唯一事实源，task-pause-primitive §2.2-3 消除双常量漂移面）：
 * 余量 = 上限 − 当前任务链深；余量 < 1 时 add-fix 结构性被拒（创建必 ERR_CHAIN_DEPTH_EXCEEDED）。
 */
export const TRIAGE_FIX_CHAIN_DEPTH_LIMIT = FIX_CHAIN_DEPTH_LIMIT

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

/**
 * 流控类失败判别（bug 63112ab2 分流键）：限流窗口内立即重试必再撞限流——三次拉起全败
 * 只加剧限流。识别后零重试，循环挂起返回主会话（附流控原因），择时重派由主会话决定。
 */
const RATE_LIMIT_PATTERN = /\b429\b|rate[ -]?limit|throttl|too many requests|流控|限流/i
export function isRateLimitFailure(text: string): boolean {
  return RATE_LIMIT_PATTERN.test(text)
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

/** 静默挂起径 minor（loop-event-delivery ⑱-㉑——四径各自独立不合并；场景码经 progress 单源表取值） */
const SUSPEND_MINORS = ['spawn-rate-limited', 'worker-rate-limited', 'abort-over-limit', 'landing-rejected'] as const
type SuspendMinor = (typeof SUSPEND_MINORS)[number]
const suspendScenarioOf = (minor: SuspendMinor): ForgeProgressScenario =>
  FORGE_PROGRESS_SCENARIOS.find((code): code is `suspend/${SuspendMinor}` => code === `suspend/${minor}`)!

/**
 * 静默挂起径补录收口（loop-event-delivery 1.4——⑱-㉑）：现状挂起时人类与模型均无感知，
 * 三面一次补齐——① event 子文件夹落盘（原因全文，行为与既有 recordIncident 同径）；
 * ② forge/progress suspend 事件（scenario 场景码 + note 原因全文，fail-soft 同 1.17）；
 * ③ send(nextStep, true) 唤醒一条（原因摘要 + 子文件夹路径进消息，即时唤醒主会话）。
 * 收尾仍走 suspendForVerdict（挂起投影语义零变更）。
 */
async function suspendWithWakeup(
  loop: ActiveLoop,
  escalation: LoopEscalation,
  input: {
    readonly minor: SuspendMinor
    readonly eventType: string
    /** 原因全文（落盘 + note 原样；叙述只带摘要 + 子文件夹路径） */
    readonly reason: string
    /** incident 落盘任务键（localId 口径——既有 incident-log 行为不回归） */
    readonly incidentTaskKey: string
    /** 进度事件任务键（`slug/localId` 口径——既有 forge/progress 行为同源） */
    readonly progressTaskKey: string
    /** 任务标题（progress 事件 taskTitle 段） */
    readonly taskTitle?: string
    /** worker 子会话 id（progress 事件 workerSessionId 段——spawn 成功径在列） */
    readonly workerSessionId?: string
    /** 唤醒消息单行摘要（用户视角原因——无机制词） */
    readonly headline: string
  },
): Promise<RoundOutcome> {
  const incidentPath = loop.deps.narrator.recordIncident({
    projectId: loop.record.projectId,
    sourceSlug: loop.record.source.slug,
    taskKey: input.incidentTaskKey,
    eventType: input.eventType,
    error: input.reason,
  })
  emitProgress(loop, {
    verb: 'suspend',
    status: 'blocked',
    scenario: suspendScenarioOf(input.minor),
    note: input.reason,
    taskKey: input.progressTaskKey,
    ...(input.taskTitle !== undefined ? { taskTitle: input.taskTitle } : {}),
    ...(input.workerSessionId !== undefined ? { workerSessionId: input.workerSessionId } : {}),
  })
  const detail = incidentPath !== undefined ? `原因全文：${incidentPath}` : '原因全文落盘降级（事件子文件夹不可用）'
  await loop.deps.narrator.followup(
    loop.record.ownerSessionId,
    `${input.headline}。\n原因摘要：${summarizeReason(input.reason)}\n${detail}`,
  )
  return suspendForVerdict(loop, escalation)
}

/** 处置回流返回（re-entry——无活登记 / 非挂起态拒绝） */
export type LoopResumeResult =
  | { readonly ok: true; readonly loopId: LoopInstanceId }
  | { readonly ok: false; readonly code: 'no-active-loop' | 'not-suspended' | 'aborted' }

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
  event: {
    readonly verb: ForgeProgressEventData['verb']
    readonly status: ForgeProgressEventData['status']
    readonly taskKey?: string
    readonly taskTitle?: string
    readonly workerSessionId?: string
    readonly scenario?: ForgeProgressScenario
    readonly note?: string
    readonly counts?: ForgeProgressCounts
  },
): void {
  try {
    loop.deps.progress?.append(loop.record.ownerSessionId, {
      sourceSlug: loop.record.source.slug,
      verb: event.verb,
      status: event.status,
      ...(event.taskKey !== undefined ? { taskKey: event.taskKey } : {}),
      ...(event.taskTitle !== undefined ? { taskTitle: event.taskTitle } : {}),
      ...(event.workerSessionId !== undefined ? { workerSessionId: event.workerSessionId } : {}),
      ...(event.scenario !== undefined ? { scenario: event.scenario } : {}),
      ...(event.note !== undefined ? { note: event.note } : {}),
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
      // ⑰ 进度事件（1.17——状态迁移点：停止真化 in-flight → interrupted；载 inFlightTaskKey）
      if (loop !== undefined) emitProgress(loop, { verb: 'stop', status: 'interrupted', scenario: 'loop/stopped', taskKey: captured.taskKey, taskTitle: captured.title })
    }
    const stats = await statsFailSoft(loop)
    // ⑰ 停止收口 = settlement 形态（3b④——结算单点 send(nextStep, true) 唤醒；与 in-flight
  // 真化的 forge/progress stopped 事件双面落会话日志，均载 inFlightTaskKey）
    await deps.narrator.settle(
      record.ownerSessionId,
      renderNarrative('stopped-by-command', {
        sourceSlug: record.source.slug,
        completed: stats.byStatus.completed,
        inFlightTaskKey: captured?.taskKey ?? '无',
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
        ...(input.docsRoot !== undefined ? { docsRoot: input.docsRoot } : {}),
        takeoverSessions: new Set<string>(), // 3b 接管集（登记绑定——remove 随之蒸发）
      }
      const controller = new AbortController()
      const loop: ActiveLoop = {
        deps,
        record,
        registry,
        live,
        controller,
        pause: new AbortController(), // 单任务暂停独立 kill 信号（task-pause-primitive）
        source,
        core: {
          tasks: deps.tasks,
          spawn: deps.spawn,
          ...(deps.commitLanding !== undefined ? { commitLanding: deps.commitLanding } : {}),
          ...(deps.events !== undefined ? { events: deps.events } : {}),
          ...(deps.settings !== undefined ? { settings: deps.settings } : {}),
          ...(deps.resolveModelReasoning !== undefined ? { resolveModelReasoning: deps.resolveModelReasoning } : {}),
          // 机械③/④（bug 548ea94b 装配断链修复）：checkpoints/HEAD 解析器随 loop.core 透传
          // 结算核——settleClaimed → settleWorkerRun → recordWaveCheckpoint 的 review-wave-N
          // 落行依赖此二依赖（缺席 = 机制惰性不判，行为零变化）
          ...(deps.checkpoints !== undefined ? { checkpoints: deps.checkpoints } : {}),
          ...(deps.resolveHeadCommit !== undefined ? { resolveHeadCommit: deps.resolveHeadCommit } : {}),
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
        rounds: 0, // 3c 轮数总量计数（生命周期总量——resume 续用不清零）
        e2eAttributed: new Set<string>(),
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
      // 机械③：容器 → 提案 id 解析（检查点归属锚——fail-soft，缺席 = 机制惰性不判）
      if (deps.resolveProposalId !== undefined) {
        try {
          loop.proposalId = await deps.resolveProposalId(projectId, source)
        } catch (cause) {
          console.warn(
            `forge loop proposal id resolve failed (${source.slug}): ${cause instanceof Error ? cause.message : String(cause)}`,
          )
        }
      }
      // e2e 红灯基线门（改进7/disc-2/bug 006d8bfe 后台化）：基线跑批移入循环 fiber——
      // start 立即返回启动回执（工具调用面零阻塞——长跑/挂死套件曾把 start 卡满全量窗）。
      // runRound 首领任务前 await ensureE2eBaseline（in-flight 去重 + 实例缓存同源——挂起/
      // claim 漂移重算语义不变），简报红灯行语义不破；归因卡随基线结果在 fiber 内生成。
      loop.baselineChain = ensureE2eBaseline(loop)
        .then(async (baseline) => {
          if (baseline !== undefined) await issueAttributionCards(loop, baseline.redCases)
        })
        .catch(() => {})
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

    async pause(input: { readonly loopId: LoopInstanceId; readonly requesterSessionId: string; readonly reason: string }): Promise<LoopPauseResult> {
      // 单任务暂停（task-pause-primitive）：归属守卫与 stopLoop 同权限面——运行中仅 owner
      // 可 pause；挂起态任意会话可接管；无活循环/空 reason/无 in_progress 任务均 typed 拒绝。
      const loop = live.get(input.loopId)
      if (loop === undefined) {
        return { ok: false, code: 'no-active-loop', suspended: false, ownerSessionId: '' }
      }
      const record = loop.record
      const suspended = record.suspended !== undefined
      if (!suspended && record.ownerSessionId !== input.requesterSessionId) {
        return { ok: false, code: 'forbidden', suspended, ownerSessionId: record.ownerSessionId }
      }
      const reason = input.reason.trim()
      if (reason === '') {
        return { ok: false, code: 'reason-required', suspended, ownerSessionId: record.ownerSessionId }
      }
      const captured = record.inFlight
      if (captured === undefined) {
        return { ok: false, code: 'no-in-progress-task', suspended, ownerSessionId: record.ownerSessionId }
      }
      // 竞态收口序（stop 面 terminateRecord 同款实证序）：先摘 inFlight 再 abort——runRound
      // 各 await 恢复点见 kill 信号 aborted 即按 unwindOutcome 让渡（pause 径返回 suspend
      // 保留登记，不触终局注销）。挂起投影先行（写点①同源：suspendForVerdict「挂起即投影」
      // ——unwind 判定据此分流，与 abort 效果落地时序解耦）。
      record.inFlight = undefined
      record.suspended = {
        escalation: {
          kind: 'task-paused',
          ownerSessionId: record.ownerSessionId,
          source: record.source,
          taskKey: captured.taskKey,
          reason,
        },
        since: Date.now(),
      }
      loop.pause.abort(`task paused by command: ${reason}`) // worker 硬中断（kill 信号合成——结算按 killed 分类零 bump）
      // 任务真化 suspended（1.4 转移服务事务闭包——reason 必带落执行时间线；in_progress→suspended
      // human 面闭包 + actor='core' 自动化归因，先例 = interruptedize）。fail-soft：转移故障
      // 只告警（挂起投影已落，re-entry 恢复序会按容器实际状态收口）。
      try {
        await loop.deps.tasks.transitionTask({
          projectId: record.projectId,
          taskId: captured.taskId,
          toStatus: 'suspended',
          reason,
          actor: 'core',
        })
      } catch (cause) {
        console.warn(
          `forge loop pause transition failed (${captured.taskId}): ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
      // 进度事件（1.17 同族——状态迁移点：暂停真化 in-flight → suspended；场景码缺席 =
      // 旧载荷兼容形态，词值域零改动）
      emitProgress(loop, {
        verb: 'suspend',
        status: 'blocked',
        taskKey: captured.taskKey,
        taskTitle: captured.title,
        note: reason,
      })
      try {
        await deps.narrator.notice(
          record.ownerSessionId,
          `[forge·暂停] 任务源: ${record.source.slug} — 任务 ${captured.taskKey} ${captured.title} 已挂起\n原因: ${summarizeReason(reason)}\n改写简报后执行 dispatchTask re-entry 恢复循环`,
          '任务已暂停——循环挂起待恢复',
        )
      } catch {
        // 叙述故障 fail-soft（挂起事实已落登记与任务时间线）
      }
      return { ok: true, paused: true, taskKey: captured.taskKey }
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
      // terminateRecord 异步窗口拒绝（竞态收口）：控制器已 abort = 循环在途终态注销——
      // 此时清挂起续跑会与终局清理双写竞态且响应误导（ok:true 实际未续跑）
      if (loop.controller.signal.aborted) return { ok: false, code: 'aborted' }
      loop.record.suspended = undefined // 写点②：处置回流——清挂起回落 active
      loop.pause = new AbortController() // pause 信号换新（上轮单任务暂停不再影响续跑轮）
      // resume 序批量恢复（task-pause-primitive 唯一装配位——runRound 前）：容器内 suspended
      // paused 卡以 'core' actor 批量恢复 pending（AGENT 矩阵新边 suspended→pending），随后
      // 正常 claim。fail-soft：恢复面故障零阻塞续跑（卡留 suspended——claim 不领取，下轮
      // re-entry 可再恢复）。
      void restorePausedCards(loop).then(
        () => {
          void runLoop(loop) // 从留存点续跑（ActiveLoop 运行时状态挂起期保留）
        },
        () => {},
      )
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
    // ② 启动·接续（上次未完成）
    emitProgress(loop, {
      verb: 'startup',
      status: 'running',
      scenario: 'startup/resume-stopped',
      taskKey: `${first.slug}/${first.localId}`,
      taskTitle: first.title,
    })
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
      // ③ 启动·接续（在飞任务）
      emitProgress(loop, {
        verb: 'startup',
        status: 'running',
        scenario: 'startup/resume-inflight',
        taskKey: `${inFlightCard.slug}/${inFlightCard.localId}`,
        taskTitle: inFlightCard.title,
      })
      return
    }
  }
  const scratchPayload = { sourceSlug: slug, sourceKind: kind, pending: stats.byStatus.pending }
  await deps.narrator.notice(
    record.ownerSessionId,
    renderNarrative('startup-from-scratch', scratchPayload),
    renderHeadline('startup-from-scratch', scratchPayload),
  )
  // ① 启动·从头执行
  emitProgress(loop, { verb: 'startup', status: 'running', scenario: 'startup/from-scratch' })
}

/** 循环体（启动后 fire-and-forget——异常兜底告警 + 终局登记注销双保证；3b 挂起退出 =
 *  保留登记与运行时状态，终局收口（登记注销）仅在非挂起退出时执行） */
async function runLoop(loop: ActiveLoop): Promise<void> {
  const { record } = loop
  let suspended = false
  try {
    // 机械③：merged 漏标记 lazy 兜底——下个容器循环启动时校验补标记（收口判据见函数注；
    // 机制未装配时零 await 零行为变化——不扰动循环启动时序）
    if (loop.deps.checkpoints !== undefined && loop.proposalId !== undefined) await ensureMergedBackfill(loop)
    while (!loop.controller.signal.aborted) {
      // 3c 最大轮次封顶（终止条件全集之一）：达上限按 ⑮ 结束叙述收口（建议重派），不再续领。
      // 计数在 ActiveLoop（生命周期总量——resume 续用不清零，反复挂起/回流不绕过封顶）
      if (loop.rounds >= loop.maxRounds) {
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
        // ⑮ 结束（等待超时）——循环级进度事件（轮次封顶径与耐心耗尽径同码）
        emitProgress(loop, { verb: 'timeout', status: 'blocked', scenario: 'loop/timeout', note: '达到最大轮次上限' })
        break
      }
      loop.rounds += 1
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
      // 基线链收口（bug 006d8bfe 后台化——归因卡链随基线在 fiber 内异步）：终局前等待，
      // 归因卡落库不得晚于登记注销（否则终局后宿主重启丢卡；测试面 untilSettled 同序）
      if (loop.baselineChain !== undefined) await loop.baselineChain
      loop.registry.remove(record.id) // 终态即登记表删除（settled/halted/stopped/异常同径）
      clearExclusiveLoopSource(record.source, record.id) // S1c 独占注销（终态同径——幂等）
      loop.live.delete(record.id)
    }
  }
}

/**
 * e2e 归因卡补发（改进7 · R2-minor⑥）：红灯 spec 逐一生成归因卡——启动时点与 HEAD 漂移
 * 重算径同源消费；e2eAttributed 已发不重发（漂移后仍在场的旧红灯零重复卡）。落库失败
 * fail-soft（warn——红灯清单仍在简报面承担机械判定）。
 */
async function issueAttributionCards(loop: ActiveLoop, specs: readonly string[]): Promise<void> {
  for (const spec of specs) {
    if (loop.e2eAttributed.has(spec)) continue
    loop.e2eAttributed.add(spec)
    try {
      await loop.deps.tasks.addTask(attributionTaskInput(loop.source, spec, { projectId: loop.scope.projectId }))
    } catch (cause) {
      console.warn(
        `forge loop e2e baseline attribution card failed (${spec}): ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }
  }
}

/**
 * e2e 基线取数（disc-2 · HEAD 键控刷新）：读循环 worktree 当前 HEAD → baselineForHead
 * （一致复用缓存 / 漂移重算）。readHead 故障（git 不可用）= 漂移不可判，复用现有缓存
 * fail-soft（不重跑昂贵套件）；重算故障 = 空清单 + warn（机制静默关闭，循环不阻）。
 */
async function ensureE2eBaseline(loop: ActiveLoop): Promise<E2eBaselineCache | undefined> {
  // in-flight 去重（bug 006d8bfe 后台化——start fire-and-forget 与 runRound 首领并发触达时
  // 套件只跑一次；settle 后清位，后续调用走磁盘持久层 + 每轮 HEAD 键控重验语义）
  if (loop.e2eBaselineInflight !== undefined) return loop.e2eBaselineInflight
  const inflight = ensureE2eBaselineUncached(loop)
  loop.e2eBaselineInflight = inflight
  try {
    return await inflight
  } finally {
    if (loop.e2eBaselineInflight === inflight) loop.e2eBaselineInflight = undefined
  }
}

async function ensureE2eBaselineUncached(loop: ActiveLoop): Promise<E2eBaselineCache | undefined> {
  const cfg = loop.deps.e2eBaseline
  if (cfg === undefined) return undefined
  const slug = loop.record.source.slug
  let head: string | undefined
  if (cfg.readHead !== undefined && loop.record.worktree !== undefined) {
    try {
      head = await cfg.readHead(loop.record.worktree)
    } catch (cause) {
      // HEAD 读失败（git 故障）——键不可得：基线跳过（简报零红灯行），循环不阻。
      console.warn(
        `forge loop e2e baseline head read failed (${slug}): ${cause instanceof Error ? cause.message : String(cause)}`,
      )
      return undefined
    }
  }
  // 磁盘即唯一缓存层（用户裁决 2026-10-18：不缓存到内存）：每次取基线 = 现算 HEAD →
  // 查持久层（head 键匹配才命中）→ miss 才跑套件 → 落盘。runSuite 传同一 worktree——
  // 基线取数点与 readHead 缓存键同源（多 worktree 并行不错位）。
  const cachePath = cfg.cacheFile?.({ slug, worktree: loop.record.worktree })
  if (head !== undefined && cachePath !== undefined) {
    const persisted = loadPersistedBaseline(cachePath, head)
    if (persisted !== undefined) return persisted
  }
  const entry = await baselineForHead(head, undefined, () => cfg.runSuite(loop.record.worktree))
  if (entry.error !== undefined) {
    console.warn(`forge loop e2e baseline failed (${slug}): ${entry.error}`)
  }
  // 成功解析结果落持久化缓存（error 形态不落——不可得 ≠ 全绿，下轮重算）；IO 故障 fail-soft
  if (head !== undefined && cachePath !== undefined && entry.error === undefined) {
    try {
      persistBaseline(cachePath, head, entry.redCases)
    } catch (cause) {
      console.warn(
        `forge loop e2e baseline cache persist failed (${slug}): ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }
  }
  return entry
}

/**
 * 每轮（implementation-blueprint §3 runRound）：① 逐个恢复优先（任务源内最早 interrupted →
 * adopt 定向领取径）→ ② 领取（dispatch-core 阶段一）→ ③ 领取通知（S4 notice）→ ④ spawn
 * （阶段二，句柄直持）→ ⑤ 结算（阶段三）→ ⑥ 结果通知 + 三层阶梯判定 → 续派/终局。
 */
async function runRound(loop: ActiveLoop): Promise<RoundOutcome> {
  const { deps, record, exec, scope, source } = loop
  const signal = killSignalOf(loop) // stop ∪ pause 合成——单任务暂停只中断在飞 worker，不杀循环
  if (signal.aborted) return unwindOutcome(loop)
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
  // 简报不再烤死于循环启动时点；稳定 HEAD = 缓存复用，零额外套件执行）；
  // R2-minor⑥：漂移重算的新增红灯同启动时点行为——补生成归因卡（已发不重发）。
  const baseline = await ensureE2eBaseline(loop)
  if (baseline !== undefined) await issueAttributionCards(loop, baseline.redCases)
  const claim = await claimForDispatch(loop.core, exec, {
    identity: { sessionId: owner, loopSourced: true },
    guardKey: record.id,
    projectId: scope.projectId,
    source,
    ...(adoptRef !== undefined ? { adopt: adoptRef } : {}),
    ...(baseline !== undefined && baseline.redCases.length > 0
      ? { e2eBaselineRedCases: baseline.redCases }
      : {}),
    // disc 效度戳：效度比对检出根 = 发起循环的检出（1.14 cwd 钉定同源锚——重领证据机械
    // 比对此效度域，漂移 = stale 强制重跑）
    ...(record.worktree !== undefined ? { checkoutRoot: record.worktree } : {}),
  })
  // 停止竞态收口（claim 已落而循环被叫停）：本实例未接管的孤儿 in_progress → 真化 interrupted
  if (await bailIfAborted(loop, claim.kind === 'claimed' ? claim : undefined)) return 'terminal'
  // pause 竞态收口（task-pause-primitive）：挂起暂停已接管本任务（pause 面摘牌 + abort +
  // 真化 suspended）——本轮让渡，返回 suspend 保留登记（resume 序恢复续跑）
  if (loop.pause.signal.aborted) return 'suspend'
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
  // 进度事件（1.17——领取点：常规 = ④ claim/new / 恢复 = ⑤ claim/interrupted；零模型面零回合唤醒）
  emitProgress(loop, {
    verb: adoptRef !== undefined ? 'claim-resume' : 'claim',
    status: 'running',
    scenario: adoptRef !== undefined ? 'claim/interrupted' : 'claim/new',
    taskKey,
    taskTitle: task.title,
    counts: progressCountsOf(stats),
  })
  // 池级 pending 快照（1.16 用户裁决②——统计条「待执行」计数承载：池级事件 + counts，
  // fold unit 提取为 pending 字段，web/mobile 统计条消费；无任务键 = 不进任务时间线）
  emitProgress(loop, {
    verb: 'loop',
    status: 'running',
    scenario: 'pool/pending',
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
    // pause 竞态收口（task-pause-primitive）：暂停接管本任务（已真化 suspended）——让渡，
    // 不入重试叙述/防线阶梯
    if (loop.pause.signal.aborted) return 'suspend'
    if ('kind' in spawned.failure) return haltLoop(loop) // HaltedOutcome——唯一 kind 承载成员（guard 粘住）
    const failure = spawned.failure // ERR_SPAWN_FAILED DTO（防线计数已按 guardKey 落面）
    // 流控分流（bug 63112ab2）：限流窗口内退避重试必再撞限流——零重试直接挂起返回主会话
    // （附流控原因），择时重派由主会话决定；非流控照旧走退避阶梯。
    if (isRateLimitFailure(failure.message)) {
      // ⑱ 静默挂起径补录：incident 落盘 + forge/progress suspend + send(nextStep, true) 唤醒
      return await suspendWithWakeup(loop, { kind: 'rate-limit', ownerSessionId: owner, source: record.source, taskKey, reason: failure.message }, {
        minor: 'spawn-rate-limited',
        eventType: 'spawn-rate-limited',
        reason: failure.message,
        incidentTaskKey: task.localId,
        progressTaskKey: taskKey,
        taskTitle: task.title,
        headline: '任务启动被限流——循环已挂起，择时重派由你决定',
      })
    }
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
    // ⑪ 启动子代理失败（自动重试）——任务留在源内等幂等重入
    emitProgress(loop, {
      verb: 'retry',
      status: 'blocked',
      scenario: 'retry/spawn-failed',
      taskKey,
      taskTitle: task.title,
      note: failure.message,
    })
    if (signal.aborted) return unwindOutcome(loop) // 退避途中被叫停/暂停——让渡（pause 保留登记）
    return (await sleepOrAbort(signal, delayMs)) ? 'continue' : unwindOutcome(loop)
  }
  inFlight.workerSessionId = spawned.handle.workerSessionId // 对账锚回填（登记表 worker 子会话位）
  const workerSessionId = spawned.handle.workerSessionId // 结算/挂起径进度事件 workerSessionId 段同源
  // 领取确认事件（bug 3bd8b829——claim 原事件先于 spawn 发出、载荷缺 workerSessionId，
  // 执行中行两路跳转皆断；spawn 成功回填后补发本枚，面板按任务键聚合取最新态即得直跳锚）
  emitProgress(loop, {
    verb: 'claim',
    status: 'running',
    scenario: 'claim/spawned',
    taskKey,
    taskTitle: task.title,
    workerSessionId,
  })

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
    ...(record.docsRoot !== undefined ? { docsRoot: record.docsRoot } : {}),
    // 改进7（bug ca061ef6）：欠账卡文案与简报行真实存在性一致——本轮 claim 简报红灯清单
    // 在场时欠账卡才指示「比对 E2E_BASELINE_RED 行」；无红灯/基线未接线 = 兜底文案
    // （不指示真机不存在的简报行）
    ...(baseline !== undefined && baseline.redCases.length > 0 ? { e2eBaselineRedCases: baseline.redCases } : {}),
    // 机械④（bug 548ea94b 装配断链修复）：提案 id 归属锚随结算输入透传——recordWaveCheckpoint
    // 的 proposalId 缺席短路恒不触发，此映射是修正波标记的真实结算路径开关
    ...(loop.proposalId !== undefined ? { proposalId: loop.proposalId } : {}),
  })
  record.inFlight = undefined // 结算已定（success/blocked/killed/失败同径）——在飞清位
  if (signal.aborted) return unwindOutcome(loop) // stop 径终态注销 / pause 径挂起保留登记

  // 落点核验失败径（1.18 bug d8029b20——显式处置收口，不走 worker-abort 失败阶梯）：
  // 结算核已把任务 completed → interrupted 真化（可恢复态）；此处事件留痕 + 挂起升级
  // 问询——重入 claim 对 completed 任务结构性不可达（旧径静默 finished-all 的根因）。
  if ('kind' in settled && settled.kind === 'landing-rejected') {
    // ㉑ 静默挂起径补录：incident 落盘 + forge/progress suspend + send(nextStep, true) 唤醒
    return await suspendWithWakeup(loop, {
      kind: 'settle-landing-rejected',
      ownerSessionId: owner,
      source: record.source,
      taskKey,
      reason: settled.reason,
    }, {
      minor: 'landing-rejected',
      eventType: 'settle-landing-rejected',
      reason: settled.reason,
      incidentTaskKey: task.localId,
      progressTaskKey: taskKey,
      taskTitle: task.title,
      workerSessionId,
      headline: '任务结算落点核验未通过——任务已转中断、循环挂起待处置',
    })
  }
  if ('ok' in settled) {
    // 失败 DTO（结算核 failed 径——killSignal 在场时 killed 已先行返回）：
    // worker 异常终止属执行受阻非 spawn 机制故障（guardOnFailure=false 零防线计数零 tool-error）——
    // ⑫ bounded 立即重入（claim 面按 links 幂等重入同任务，不退避）→ 超限第三层（decisions #16）
    // 流控分流（bug 63112ab2）：限流终态（输出原文随判词在场）零重入——挂起返回主会话择时重派
    if (isRateLimitFailure(settled.message)) {
      // ⑲ 静默挂起径补录：incident 落盘 + forge/progress suspend + send(nextStep, true) 唤醒
      return await suspendWithWakeup(loop, { kind: 'rate-limit', ownerSessionId: owner, source: record.source, taskKey, reason: settled.message }, {
        minor: 'worker-rate-limited',
        eventType: 'worker-rate-limited',
        reason: settled.message,
        incidentTaskKey: task.localId,
        progressTaskKey: taskKey,
        taskTitle: task.title,
        workerSessionId,
        headline: '子代理执行被限流——循环已挂起，择时重派由你决定',
      })
    }
    loop.workerAborts += 1
    const attempt = loop.workerAborts
    loop.deps.narrator.recordIncident({ projectId: scope.projectId, sourceSlug: slug, taskKey: task.localId, eventType: 'worker-aborted', error: settled.message })
    if (attempt > LOOP_WORKER_ABORT_MAX_RETRIES) {
      // 3b 裁决①：worker-abort-over-limit → 挂起待裁决（执行面反复崩溃需人裁决——非终局）
      // ⑳ 静默挂起径补录：incident 落盘 + forge/progress suspend + send(nextStep, true) 唤醒
      return await suspendWithWakeup(loop, {
        kind: 'worker-abort-over-limit',
        ownerSessionId: owner,
        source: record.source,
        taskKey,
        attempts: attempt,
      }, {
        minor: 'abort-over-limit',
        eventType: 'worker-abort-over-limit',
        reason: settled.message,
        incidentTaskKey: task.localId,
        progressTaskKey: taskKey,
        taskTitle: task.title,
        workerSessionId,
        headline: `子代理反复异常退出（第 ${attempt} 次，超过重试上限）——循环已挂起待处置`,
      })
    }
    const abortedPayload = { sourceSlug: slug, taskKey: task.localId, attempt, maxAttempts: LOOP_WORKER_ABORT_MAX_RETRIES }
    await loop.deps.narrator.notice(
      owner,
      renderNarrative('worker-aborted-retry', abortedPayload),
      renderHeadline('worker-aborted-retry', abortedPayload),
    )
    // ⑫ 子代理异常退出（自动重试）——claim 面幂等重入同任务
    emitProgress(loop, {
      verb: 'retry',
      status: 'blocked',
      scenario: 'retry/worker-aborted',
      taskKey,
      taskTitle: task.title,
      workerSessionId,
      note: settled.message,
    })
    return 'continue'
  }

  // kind 承载成员：killed = 停止/暂停径（stop 收口归停止面；pause 收口归暂停面——挂起保留
  // 登记）；halted = guard 粘住终局；dispatched/no-task 结构性不出自结算核——防御终局（不可达分支）
  if (settled.kind === 'killed') return unwindOutcome(loop)
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
    loop.lastCommitHash = settlement.commitHash ?? loop.lastCommitHash // 机械③ 标记 HEAD 回落锚
    const donePayload = { sourceSlug: slug, taskLabel: label, summary: settlement.summary ?? '已完成' }
    await deps.narrator.notice(owner, renderNarrative('completed', donePayload), renderHeadline('completed', donePayload))
    // 进度事件（1.17——结算成功点：⑥ task/complete）
    emitProgress(loop, { verb: 'settle', status: 'completed', scenario: 'task/complete', taskKey, taskTitle: settlement.title, workerSessionId })
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
    // ⑦ 阻塞（已带修复任务——循环自续 fix 链）
    emitProgress(loop, { verb: 'settle', status: 'blocked', scenario: 'blocked/with-fix', taskKey, taskTitle: task.title, workerSessionId, note: reason })
    return 'continue'
  }

  // 无进展硬停门（提案 blocked-salvage-split · C，用户裁决 2026-10-13「没有进展则直接停止问人」）：
  // blocked 结算零 commit hash 且零 files 增量 = 无进展信号 → 跳过处置阶梯（triage 零调用、
  // 零 fix 链），直达 ⑩ blocked-ask-user 升级（followup 唤醒主 agent + 问询 + 答案回执）。
  // 有打捞提交（commit hash 在场）或带 files = 有进展，照常入阶梯。
  if (settlement.commitHash === undefined && (settlement.files === undefined || settlement.files.length === 0)) {
    await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
    // ⑩ 阻塞（循环无法自行处理——无进展硬停）
    emitProgress(loop, { verb: 'settle', status: 'blocked', scenario: 'blocked/ask-user', taskKey, taskTitle: task.title, workerSessionId, note: reason })
    // 3b 裁决②：无进展硬停 → 挂起待裁决（原因全文在挂起载荷——owner 对话面处置）
    return suspendForVerdict(loop, {
      kind: 'blocked-ask-user',
      ownerSessionId: owner,
      source: record.source,
      task,
      reason,
      history: ['本次阻塞没有任何进展信号（无提交、无文件改动）——按规则不再自动重试，直接向你询问'],
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
    // ⑩ 阻塞（处置重试超限）
    emitProgress(loop, { verb: 'settle', status: 'blocked', scenario: 'blocked/ask-user', taskKey, taskTitle: task.title, workerSessionId, note: reason })
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
      // ⑧ 阻塞（已自动分析建修复任务——循环自续 fix 链）
      emitProgress(loop, { verb: 'settle', status: 'blocked', scenario: 'blocked/auto-fixed', taskKey, taskTitle: task.title, workerSessionId, note: reason })
    } catch (cause) {
      if ((cause as { code?: unknown }).code === 'ERR_CHAIN_DEPTH_EXCEEDED') {
        // fix 链深 ≤6 到顶（C6/addTask 权威校验）→ ⑩ 叙述 + 3b 裁决④：挂起待裁决
        book.decision = undefined
        const depthData = (cause as { data?: { depth?: number; limit?: number } }).data
        book.history.push(`第${book.attempts}次处置——修复任务创建被拒（修复链已达上限）`)
        await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
        // ⑩ 阻塞（fix 链深到顶——add-fix 结构性被拒）
        emitProgress(loop, { verb: 'settle', status: 'blocked', scenario: 'blocked/ask-user', taskKey, taskTitle: task.title, workerSessionId, note: reason })
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
        // ⑩ 阻塞（add-fix 重放再败——缓存清账交人工裁决）
        emitProgress(loop, { verb: 'settle', status: 'blocked', scenario: 'blocked/ask-user', taskKey, taskTitle: task.title, workerSessionId, note: reason })
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
      // ⑧b 阻塞（已分割剩余范围——继任任务承接）
      emitProgress(loop, { verb: 'settle', status: 'blocked', scenario: 'blocked/split', taskKey, taskTitle: task.title, workerSessionId, note: reason })
    } catch (cause) {
      // split 落库失败 fail-soft（改进 6③ 缓存语义同 add-fix：首次保缓存待重放、重放再败清账升级）
      if (replayed) {
        book.decision = undefined
        book.history.push('重放执行再次失败——缓存清账，交人工裁决')
        console.warn(`forge loop triage split-remainder replay failed (${taskKey}): ${cause instanceof Error ? cause.message : String(cause)}`)
        await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
        // ⑩ 阻塞（split 重放再败——缓存清账交人工裁决）
        emitProgress(loop, { verb: 'settle', status: 'blocked', scenario: 'blocked/ask-user', taskKey, taskTitle: task.title, workerSessionId, note: reason })
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
    // ⑨ 阻塞（原因在其它任务源——记录等待续领其它）
    emitProgress(loop, { verb: 'settle', status: 'blocked', scenario: 'blocked/wait-external', taskKey, taskTitle: task.title, workerSessionId, note: `等待 ${decision.externalSlug} 先完成` })
    return 'continue' // 记录等待 → 续领其它（若整源无可领，池态判词收口）
  }
  // ask-user → ⑩ 叙述 + 3b 裁决⑦：挂起待裁决（处置历史已由阶梯循环记录本决策行）
  await deps.narrator.blocked(owner, 'blocked-ask-user', { sourceSlug: slug, taskLabel: label }, meta)
  // ⑩ 阻塞（循环无法自行处理——处置阶梯 ask-user）
  emitProgress(loop, { verb: 'settle', status: 'blocked', scenario: 'blocked/ask-user', taskKey, taskTitle: task.title, workerSessionId, note: reason })
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
    // 机械③：first-pass 收口（评审建议1——addTask 成功为派生锚）：标记缺席时先派生复盘任务、
    // 成功才落标记；任一步失败不落标记，幂等窗口留给下一轮 no-task done 重试。复盘任务已入池
    // → 续领下一轮（本轮跳过静默窗）；标记已在校 = 已锚定 → 照旧 quiescence 收口，零行为变化。
    // 机制未装配 = 零 await。
    if (loop.deps.checkpoints !== undefined && loop.proposalId !== undefined) {
      if (await ensureFirstPassClosure(loop)) return 'continue'
    }
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
      sourceKind: loop.record.source.kind,
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
    // ⑯ 结束（全部完成）——循环级进度事件
    emitProgress(loop, { verb: 'finish-all', status: 'completed', scenario: 'loop/finish-all' })
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
    // ⑭ 无可执行任务且有阻塞——循环级进度事件（阻塞清单入 note，唤醒主 agent 分析可解除性）
    emitProgress(loop, {
      verb: 'loop',
      status: 'blocked',
      scenario: 'loop/blocked-pool',
      note: blockedItems.map((item) => `${item.taskKey} ${item.note}`).join('、'),
    })
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
    // ⑮ 结束（等待超时）——循环级进度事件（耐心耗尽径）
    emitProgress(loop, { verb: 'timeout', status: 'blocked', scenario: 'loop/timeout', note: '等待超时' })
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
  // ⑬ 循环终局（连续失败已停止）——循环级进度事件
  emitProgress(loop, { verb: 'halt', status: 'blocked', scenario: 'loop/halt', note: HALTED_REASON })
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
      actor: 'core', // 循环自动化纠偏——审计归因不再误记人类通道 'ui'
    })
  } catch (cause) {
    console.warn(
      `forge loop stop transition failed (${taskId}): ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
}

/** 暂停挂起径的恢复恢复 reason（resume 序批量恢复的转移审计列） */
export const LOOP_RESUME_RESTORE_REASON = '派发循环恢复——挂起任务批量恢复待执行'

/**
 * resume 序批量恢复（task-pause-primitive——唯一装配位，runRound 前调用）：容器内全部
 * suspended paused 卡逐张以 'core' actor 转移 pending（AGENT 矩阵新边 suspended→pending，
 * 「仅 resume 时点触发」守卫由本装配位承担），随后 runRound 正常 claim。
 */
async function restorePausedCards(loop: ActiveLoop): Promise<void> {
  try {
    const cards = await loop.deps.tasks.listTasks({
      projectId: loop.scope.projectId,
      source: { kind: loop.source.kind, slug: loop.source.slug },
      statusFilter: ['suspended'],
    })
    for (const card of cards) {
      try {
        await loop.deps.tasks.transitionTask({
          projectId: loop.scope.projectId,
          taskId: card.taskId,
          toStatus: 'pending',
          reason: LOOP_RESUME_RESTORE_REASON,
          actor: 'core',
        })
      } catch (cause) {
        console.warn(
          `forge loop resume restore failed (${card.slug}/${card.localId}): ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
    }
  } catch (cause) {
    console.warn(
      `forge loop resume restore list failed (${loop.record.source.slug}): ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
}

/**
 * kill 信号合成（stop ∪ pause——task-pause-primitive）：任一 abort 即中断在飞 worker；
 * 结算核见 aborted 按 killed 分类（零防线计数零 tool-error）。stop 信号已 abort 时原样
 * 返回（stop 径语义零变化），否则合成即时信号（每轮一次，随轮生命周期）。
 */
function killSignalOf(loop: ActiveLoop): AbortSignal {
  const stop = loop.controller.signal
  const pause = loop.pause.signal
  if (stop.aborted) return stop
  if (pause.aborted) return pause
  const combined = new AbortController()
  const onAbort = (): void => {
    combined.abort()
    stop.removeEventListener('abort', onAbort)
    pause.removeEventListener('abort', onAbort)
  }
  stop.addEventListener('abort', onAbort, { once: true })
  pause.addEventListener('abort', onAbort, { once: true })
  return combined.signal
}

/**
 * runRound unwind 判定（stop/pause 双径分流）：stop 径（循环控制器 abort）维持现状终态
 * 注销；pause 径（单任务暂停信号 abort、控制器存活）返回 suspend——runLoop 保留登记与
 * 运行时状态退出，等 resume 序恢复续跑。
 */
function unwindOutcome(loop: ActiveLoop): RoundOutcome {
  if (loop.controller.signal.aborted) return 'terminal'
  return loop.pause.signal.aborted ? 'suspend' : 'terminal'
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
