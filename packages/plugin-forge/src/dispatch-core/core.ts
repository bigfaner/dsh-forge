// dispatch-core · 派发核心（S1a 可拆卸壳分层——implementation-blueprint §3「dispatchCore」：
// dispatch-task.ts 单体 execute 裂变的共享面）。主链 = claim → 组装 → spawn → 事件发射
// （+ guard 机械 + spawn 契约 + 结算核；后台径 = jobs 包装的结算后置交付）。
//
// S1b（run-tasks-host-command/1.4）增补：主链裂分为三段可组合阶段面——claimForDispatch /
// spawnClaimed / settleClaimed（implementation-blueprint §3 runRound 伪码「dispatchCore.claim /
// dispatchCore.spawn」的消费形状）。动因：循环驱动器要在 claim 与 spawn 之间插入领取通知、
// 在 spawn 与结算之间登记 in-flight（SpawnWorkerHandle 直持不经 jobs——decisions #14）——
// 单体主链无这些交错点。dispatchCore 本体 = 三段的顺序组合（工具壳外部行为零变化）；循环
// 驱动器（src/loop/）逐段消费同一实现——guard 机械/组装/结算核单一来源零漂移（依赖方向
// 硬约束不变：核心面零 import 工具壳；循环面与工具壳同位于核之上）。
//
// 可拆卸壳设计（decisions #10/#18）：identity {sessionId, loopSourced} 与 guardKey 参数化——
// 工具壳填 exec 会话 id（guardKey = sessionId，行为与分层前逐字节等价）；循环驱动器填主会话
// 真实 id + loopSourced=true（claim 记录循环来源标记——S3 已落地：标记列 loop_sourced 随
// claim 写入）+ LoopInstanceId。adopt 定向领取同属 S3 落地面（忽略 links，循环逐个恢复
// earliest interrupted 的径）。
//
// 依赖方向硬约束：工具壳 → 核心面单向；核心面零 import 工具壳（tools/**）——文件边界即
// 工具壳下线边界（run-tasks skill 已退役——dispatch-loop-hardening 3a；工具面整体移除而
// 核心面/循环/核心单测零波及）。
// 核心面对插件内共享基础设施的合法依赖：contracts / events/sink（事件发射面——非工具壳）/
// faces（结构化最小面类型——非工具壳）。
import type {
  ContainerRef,
  ForgePluginEvent,
  ForgeSettings,
  ForgeSettingsService,
  ForgeTasksService,
  Mode,
  TaskCard,
  TaskProgressPhase,
  TaskRef,
  TaskSnapshot,
  TaskType,
} from '@dsh-forge/contracts'
import { emitToolError } from '../events/sink.js'
import type { ForgeEventSink } from '../events/sink.js'
import type { DispatchJobOutcome, DispatchJobsFace } from '../faces.js'
import { deriveWorkerToolFilter, reconcileWorkerReasoning, rememberWorkerSourceTask, workerAgentOptionsOf } from './assemble.js'
import { bumpSpawnFailures, clearSpawnFailures, HALTED_REASON, spawnFailureStuck } from './guard.js'
import {
  exclusiveScopedRejection,
  externalExclusivityGuard,
  hasExclusiveLoopSources,
} from './exclusivity.js'
import { poolOf, type PoolSnapshot } from './pool.js'
import type { DispatchCoreFailure, DispatchTaskResult } from './result.js'
import { disposeQuietly, settleWorkerRun } from './settle.js'
import type { HeadCommitResolver, SettleCheckpointsFace } from './settle.js'
import type { CommitLandingVerifier } from './settle.js'
import type { SpawnWorker, SpawnWorkerHandle } from './spawn.js'

// ─────────────────────────── 核心面入参/依赖（参数化点） ───────────────────────────

/**
 * 派发核心入参（implementation-blueprint §3 DispatchCoreArgs——身份/guardKey 参数化点）。
 * 两消费者：工具壳（exec 会话 id + 工具参数直映射）与循环驱动器（主会话 id + loopSourced
 * + LoopInstanceId——S1b 三段阶段面接线）。
 */
export interface DispatchCoreArgs {
  /** 身份（两消费者均传真实会话 id；loopSourced = 循环来源标记——claim 记录 loop_sourced 持久
   *  痕迹的 S3 落地面：工具壳不携带（缺省无标记），循环驱动器恒 true） */
  readonly identity: { readonly sessionId: string; readonly loopSourced: boolean }
  /** guard 键（工具壳 = 会话 id；循环 = LoopInstanceId——decisions #18 参数槽） */
  readonly guardKey: string
  /** 项目 id（claim/taskStats/queryTask/listTasks 路由键——壳侧 cwd 绑定解析产物） */
  readonly projectId: string
  /** 任务源限定认领（source 对 = 容器限定盲选 + 无任务事件归属；缺席 = 全库就绪盲选） */
  readonly source?: ContainerRef
  /** adopt 定向领取（S3——循环恢复径：接管既有 in_progress/interrupted，忽略 session links；
   *  工具壳不携带——dispatchTask schema 零变化，循环驱动器传 listTasks 中断序首项） */
  readonly adopt?: TaskRef
  /**
   * e2e 红灯基线清单（改进7——循环入场基线门产出；透传 claimTask → dispatchPrompt
   * E2E_BASELINE_RED 行递达 worker。缺席 = 机制关闭，行为零变化）。
   */
  readonly e2eBaselineRedCases?: readonly string[]
  /**
   * 效度比对检出根（disc 效度戳——claim 透传 claimTask.checkoutRoot：worker/循环检出
   * worktree = 当前效度域取数锚。缺席 = 机制惰性不判，行为零变化）。
   */
  readonly checkoutRoot?: string
  /** 后台派发（工具壳 run_in_background 参数直映射——jobs 包装结算后置；循环不携带） */
  readonly runInBackground?: boolean
}

/** 派发核心 deps（ForgeToolDeps 结构子面 + spawn 真绑定——结构兼容，装配零适配直传） */
export interface DispatchCoreDeps {
  /** core 任务域服务（contracts 单一来源） */
  readonly tasks: ForgeTasksService
  /** 事件发射面（可选——缺席 = 零事件降级；单测桩免配） */
  readonly events?: ForgeEventSink
  /** forgeSettings 服务面（可选——缺席/worker 未配置 = 不携带 agentOptions 回退父继承） */
  readonly settings?: Pick<ForgeSettingsService, 'get'>
  /** 模型推理档位目录解析（可选——目录不可知 = 不判；组装面兼容收口消费） */
  readonly resolveModelReasoning?: (provider: string, model: string) => Promise<readonly string[] | undefined>
  /** dsh jobs 注册表收窄面（可选——缺席 = runInBackground 拒绝并提示，前台路径零变化） */
  readonly jobs?: DispatchJobsFace
  /** in-process driver spawn 真绑定（缺席 = 装配 bug：执行 fail-loud 拒） */
  readonly spawn: SpawnWorker
  /** 提交落点核验器（可选——缺席回落 gitCommitLanding 真核验；循环装配注入，单测桩） */
  readonly commitLanding?: CommitLandingVerifier
  /**
   * checkpoints 域服务结算侧消费面（可选——机械④ review-wave-N 修正波标记；bug 548ea94b
   * 装配断链修复：经 loop.core 随驱动器 deps 透传结算核。缺席 = 机制惰性不判，行为零变化）
   */
  readonly checkpoints?: SettleCheckpointsFace
  /** 容器分支 HEAD 解析器（可选——机械④标记 base_commit_hash；缺席回落 gitHeadCommit 真解析） */
  readonly resolveHeadCommit?: HeadCommitResolver
}

/** 派发核心 per-call 执行上下文（工具壳 exec 面提取产物——核心面零触达 ToolExecFace） */
export interface DispatchCoreExec {
  /** tool-error 归属共享槽（壳失败回调读——claim 前 = source 对/_pool；claim 后 = 任务容器；
   *  核心面自持写入，壳零感知内部序） */
  readonly attribution: { slug?: string }
  /** worker spawn parent（exec.agent 透传——真 Agent 结构兼容；驱动面派生 lineage/depth） */
  readonly parent: unknown
  /** 取消信号（exec.signal 透传；undefined = 核心新建兜底——驱动面要求必填） */
  readonly signal: AbortSignal | undefined
  /** tool-error 留档动词名（工具壳 = 'dispatchTask'；循环 = 'run-dag-tasks'） */
  readonly verb: string
}

/** dispatchTask 事件载荷面（emit 局部闭包的类型索引——contracts ForgePluginEvent 判别联合的本动词子集） */
interface DispatchEventPayloads {
  'task-claimed': { taskKey: string; taskType: TaskType; mode?: Mode; dispatchDigest: string }
  'task-spawned': { taskKey: string; workerSessionId: string; toolFilter: readonly string[]; model: string }
  'task-progress': { taskKey: string; phase: TaskProgressPhase; ts: number }
  'task-worker-done': { taskKey: string; workerSessionId: string; outcome: 'success' | 'blocked'; durationMs: number }
  'no-ready-task': { contextSlug?: string }
}

// ─────────────────────────── 阶段面共享（作用域 + 闭包——三段与主链单一实现） ───────────────────────────

/** halted 结果形状（guard 粘住——DispatchTaskResult 同名分支的结构子集） */
export interface HaltedOutcome {
  readonly kind: 'halted'
  readonly reason: string
}

/**
 * 阶段作用域（三段阶段面的共享键组——主链 = args 投影；循环每轮组装一次逐段透传同一值：
 * sessionId = 主会话真实 id（事件信封/tool-error 归属）、guardKey = LoopInstanceId（防线
 * 粘性载体）、source = 任务源（池快照口径 + no-task 事件归属））。
 */
export interface DispatchChainScope {
  readonly sessionId: string
  readonly projectId: string
  readonly guardKey: string
  readonly source?: ContainerRef
}

/** DispatchCoreArgs → 阶段作用域（主链组合的投影点） */
function scopeOfArgs(args: DispatchCoreArgs): DispatchChainScope {
  return {
    sessionId: args.identity.sessionId,
    projectId: args.projectId,
    guardKey: args.guardKey,
    ...(args.source !== undefined ? { source: args.source } : {}),
  }
}

/** 阶段共享闭包（emit/poolRead/spawnFailed——主链与三段阶段面同源，零漂移） */
interface ChainClosures {
  readonly emit: <K extends keyof DispatchEventPayloads>(
    type: K,
    slug: string,
    payload: DispatchEventPayloads[K],
  ) => void
  readonly poolRead: () => Promise<PoolSnapshot>
  /**
   * spawn 失败防线：guard 计数 +1（guardKey 键）→ ≥3 halted 粘住 + tool-error 留档；否则
   * ERR_SPAWN_FAILED 失败 DTO（人话 + 指引）。guard:false = 仅组同形 DTO（S1b 循环结算失败
   * 径专用——worker 异常终止属执行受阻非 spawn 机制故障，bounded 重试阶梯归循环自有计数，
   * 不进防线不发射 tool-error；缺省 guard 计数 = 工具壳行为零变化）。
   */
  readonly spawnFailed: (
    slug: string,
    taskKey: string,
    cause: unknown,
    options?: { readonly guard?: boolean },
  ) => DispatchCoreFailure | HaltedOutcome
}

/** 池快照现读闭包（口径分流——run-tasks-host-command/1.10：scoped 调用 = source 容器四计数，
 *  no-task 判词与快照消费同口径；非 scoped = 全池，缺省行为零变化） */
function poolReadOf(deps: DispatchCoreDeps, scope: DispatchChainScope): () => Promise<PoolSnapshot> {
  return async () =>
    poolOf(
      await deps.tasks.taskStats({
        projectId: scope.projectId,
        ...(scope.source !== undefined ? { source: scope.source } : {}),
      }),
    )
}

/** 归属槽初始化（claim 前 = source 对/_pool——幂等重复写无害） */
function initAttribution(exec: DispatchCoreExec, source?: ContainerRef): void {
  exec.attribution.slug = source?.slug ?? '_pool'
}

/** 阶段共享闭包组装（sessionId = scope.sessionId——事件信封与 tool-error 归属键） */
function chainClosuresOf(deps: DispatchCoreDeps, exec: DispatchCoreExec, scope: DispatchChainScope): ChainClosures {
  const emit = <K extends keyof DispatchEventPayloads>(
    type: K,
    slug: string,
    payload: DispatchEventPayloads[K],
  ): void => {
    if (deps.events === undefined) return
    deps.events.emit({ ts: Date.now(), sessionId: scope.sessionId, slug, type, payload } as ForgePluginEvent)
  }
  const failureDto = (taskKey: string, message: string): DispatchCoreFailure => ({
    ok: false,
    code: 'ERR_SPAWN_FAILED',
    message,
    violations: [
      `retry: call dispatchTask again to re-enter ${taskKey} (in_progress idempotent re-claim, briefing re-synthesized)`,
      'or move the task manually via the human transition channel if the environment is broken',
    ],
  })
  return {
    emit,
    poolRead: poolReadOf(deps, scope),
    spawnFailed: (slug, taskKey, cause, options) => {
      const message = `worker spawn failed for ${taskKey}: ${cause instanceof Error ? cause.message : String(cause)}`
      if (options?.guard === false) {
        return failureDto(taskKey, message)
      }
      const { stuck } = bumpSpawnFailures(scope.guardKey, taskKey, cause)
      emitToolError(deps.events, scope.sessionId, slug, exec.verb, { ok: false, code: 'ERR_SPAWN_FAILED', message, violations: [] })
      if (stuck) return { kind: 'halted', reason: HALTED_REASON }
      return failureDto(taskKey, message)
    },
  }
}

// ─────────────────────────── 后继任务活性判定（dispatch-loop-hardening 改进 1） ───────────────────────────

/**
 * 活的后继任务判定（blocked 静默边界——循环 driver blocked 结算径消费）：后继 = sourceTask
 * 挂接该任务的派生 fix/继任卡；活 = pending/in_progress/interrupted（interrupted 在场 = 上轮
 * stop 真化的 fix 待 adopt 恢复——计入活后继，源任务不误入无进展硬停/triage 重复建 fix），
 * 或 blocked 且其自有后继递归存在活者。
 * rejected/skipped/completed = 断链（不展开）。容器内单次 listTasks 现读 + 内存遍历（visited
 * 防环——fix 链深 ≤6 结构性有界，visited 仅防御性兜底）。返回首个活后继卡（ref 键载体）；
 * 无活后继 = undefined（调用方退化为现状问询径）。
 */
export async function findLiveSuccessor(
  tasks: ForgeTasksService,
  projectId: string,
  source: ContainerRef,
  task: TaskRef,
): Promise<TaskCard | undefined> {
  const cards = await tasks.listTasks({ projectId, source })
  const successorsOf = (ref: TaskRef): TaskCard[] =>
    cards.filter((card) => card.sourceTask !== undefined && card.sourceTask.slug === ref.slug && card.sourceTask.localId === ref.localId)
  const seen = new Set([`${task.slug}/${task.localId}`])
  const stack = [...successorsOf(task)]
  while (stack.length > 0) {
    const card = stack.pop() as TaskCard
    const key = `${card.slug}/${card.localId}`
    if (seen.has(key)) continue
    seen.add(key)
    if (card.taskStatus === 'pending' || card.taskStatus === 'in_progress' || card.taskStatus === 'interrupted') return card
    if (card.taskStatus === 'blocked') stack.push(...successorsOf({ slug: card.slug, localId: card.localId }))
  }
  return undefined
}

// ─────────────────────────── 阶段一：claim（守卫 + 领取 + 事件） ───────────────────────────

/** claim 阶段产出（claimed——组装/spawn/结算所需全量：任务行 + 简报指纹 + 重入标识 + 全文） */
export interface ClaimedDispatch {
  readonly kind: 'claimed'
  readonly task: TaskSnapshot
  /** claim 简报指纹（task_records.claim 行双记同值） */
  readonly digest: string
  /** in_progress 幂等重入 = true */
  readonly reclaimed: boolean
  /** 派发简报全文（人格段 + 三标签块——worker 首条用户消息，零进调用方上下文） */
  readonly dispatchPrompt: string
  /** worker agent 级 persona（claim 合成——S2a 组成矩阵；spawn 链透传落子会话 system 面） */
  readonly persona: string
}

/** claim 阶段返回（claimed / no-task 附池快照 / halted 入口粘住） */
export type ClaimStageResult =
  | ClaimedDispatch
  | { readonly kind: 'no-task'; readonly pool: PoolSnapshot }
  | HaltedOutcome

/**
 * 阶段一·claim（主链第 1 步的共享面）：归属槽初始化 → halted 入口粘住检查（粘住键不再
 * claim：防再领任务弃置 in_progress）→ claimTask（守卫 + 就绪选择 + 幂等重入 + dispatchPrompt
 * 合成 + S3 adopt/loopSourced 透传）→ no-task 出口（池快照 + no-ready-task 事件）→
 * task-claimed 事件。组装/spawn 属阶段二（spawnClaimed）——循环在两段之间插入领取通知。
 */
export async function claimForDispatch(deps: DispatchCoreDeps, exec: DispatchCoreExec, args: DispatchCoreArgs): Promise<ClaimStageResult> {
  const scope = scopeOfArgs(args)
  initAttribution(exec, args.source)
  const { emit, poolRead } = chainClosuresOf(deps, exec, scope)

  // S1c 循环独占守卫（外部消费者专用——循环自身 loopSourced claim 豁免，decisions #18 身份
  // 参数化的豁免键）：① 显式 source 径 = claim 前即拒（源本身独占，与池态无关——不触池不领
  // 任务）；② 盲选径 = 守卫回调随 claimTask 进核（目标解析命中活循环任务源行即抛，单事务
  // 回滚零状态残留）。抛错跨面传导：本面零捕获 → 工具壳 callToolFace 按 code 转失败 DTO。
  const external = args.identity.loopSourced !== true
  if (external && args.source !== undefined) {
    const rejection = exclusiveScopedRejection(args.source)
    if (rejection !== undefined) throw rejection
  }
  const exclusivityGuard = external && hasExclusiveLoopSources() ? externalExclusivityGuard() : undefined

  // halted 粘住（入口检查——粘住键不再 claim：防再领任务弃置 in_progress）
  if (spawnFailureStuck(args.guardKey)) {
    return { kind: 'halted', reason: HALTED_REASON }
  }

  // claimTask（API）：守卫 + 就绪选择 + 幂等重入 + dispatchPrompt 合成
  // （source 对在场 = 任务源限定盲选；缺席 = 全库——缺省行为零变化。
  //   S3 落地：identity.loopSourced → claim 记录循环来源标记；adopt → 定向领取（忽略
  //   links——工具壳两参数均不携带，schema 与外部语义零变化）。S1c：exclusivityGuard →
  //   循环独占守卫（仅外部 claim 携带——盲选径拒绝面）。）
  const claimed = await deps.tasks.claimTask({
    projectId: scope.projectId,
    sessionId: scope.sessionId,
    ...(args.source !== undefined ? { source: args.source } : {}),
    ...(args.adopt !== undefined ? { adopt: args.adopt } : {}),
    ...(args.identity.loopSourced ? { loopSourced: true } : {}),
    ...(args.e2eBaselineRedCases !== undefined ? { e2eBaselineRedCases: args.e2eBaselineRedCases } : {}),
    ...(args.checkoutRoot !== undefined ? { checkoutRoot: args.checkoutRoot } : {}),
    ...(exclusivityGuard !== undefined ? { exclusivityGuard } : {}),
  })
  const task = claimed.task
  if (task === null) {
    // Z1 出口：no-ready-task 事件（source 对任务源归属——载荷 contextSlug = source_slug；
    // 缺席回落 _pool 兜底）+ 池快照现读（scoped = 容器口径）
    const pool = await poolRead()
    emit(
      'no-ready-task',
      scope.source?.slug ?? '_pool',
      scope.source !== undefined ? { contextSlug: scope.source.slug } : {},
    )
    return { kind: 'no-task', pool }
  }
  const taskKey = `${task.slug}/${task.localId}`
  exec.attribution.slug = task.slug
  emit('task-claimed', task.slug, {
    taskKey,
    taskType: task.taskType,
    ...(task.mode !== undefined ? { mode: task.mode } : {}),
    dispatchDigest: claimed.digest, // 双记：task_records.claim 行同值
  })
  return { kind: 'claimed', task, digest: claimed.digest, reclaimed: claimed.reclaimed, dispatchPrompt: claimed.dispatchPrompt, persona: claimed.persona }
}

// ─────────────────────────── 阶段二：spawn（组装 + spawn + 事件） ───────────────────────────

/** spawn 阶段返回（ok = 句柄直持——发布即回，result 阻塞至终态；失败 = 防线 DTO 或 halted） */
export type SpawnStageResult =
  | { readonly ok: true; readonly handle: SpawnWorkerHandle; readonly spawnStartedAt: number }
  | { readonly ok: false; readonly failure: DispatchCoreFailure | HaltedOutcome }

/**
 * 阶段二·spawn（主链第 2~3 步的共享面）：组装（taskType → 收窄矩阵 → toolFilter；
 * forgeSettings → agentOptions，档位兼容收口——组装面异常向上抛与主链同径）→ driver
 * in-process spawn（阻塞；start 拒绝 = 基建故障 → 防线计数）→ task-spawned 事件。
 * 循环消费形状：spawn 即回（毫秒级）——句柄直持登记 in-flight 后再 await 结算（阶段三）。
 * options.signal = 覆盖信号（主链后台径传 job 专属 controller.signal；缺席 =
 * exec.signal ?? 新建兜底——前台径 SC-C 行为零变化）。
 */
export async function spawnClaimed(
  deps: DispatchCoreDeps,
  exec: DispatchCoreExec,
  claimed: ClaimedDispatch,
  options: { readonly scope: DispatchChainScope; readonly signal?: AbortSignal; readonly workspaceCwd?: string },
): Promise<SpawnStageResult> {
  const task = claimed.task
  const taskKey = `${task.slug}/${task.localId}`
  const { emit, spawnFailed } = chainClosuresOf(deps, exec, options.scope)

  // 组装：taskType → 收窄矩阵 → toolFilter；forgeSettings → agentOptions；
  // taskType+complexity → worker persona（S2 分层承载——经 SubagentStartRequest.persona
  // 落子会话 deployment:persona-prefix scoped 段；不进 dispatchPrompt，分层保持）
  // （档位兼容收口：目录已知且配置档位不支持 → 剥离 effort 回落默认档）
  const toolFilter = deriveWorkerToolFilter(task.taskType)
  // persona 由 claim 阶段合成（S2a 组成矩阵）——此处仅透传
  const settings: ForgeSettings | undefined =
    deps.settings !== undefined ? await deps.settings.get() : undefined
  const agentOptions = await reconcileWorkerReasoning(
    workerAgentOptionsOf(settings),
    deps.resolveModelReasoning,
  )

  // driver in-process spawn（阻塞）——start 拒绝 = 基建故障（防线计数）
  const spawnStartedAt = Date.now()
  let handle: SpawnWorkerHandle
  try {
    handle = await deps.spawn({
      prompt: claimed.dispatchPrompt, // 全文直达 worker——零进本会话上下文
      parent: exec.parent,
      signal: options.signal ?? exec.signal ?? new AbortController().signal,
      toolFilter,
      ...(agentOptions !== undefined ? { agentOptions } : {}),
      persona: claimed.persona, // 人格面（agent 级，claim 合成）——与 prompt 任务面分层承载（S2）
      label: `${taskKey} · ${task.title}`,
      // cwd 钉定（1.14 判例修复）：loopSourced 径携带发起循环检出——spawn 实现侧机械核销
      ...(options.workspaceCwd !== undefined ? { workspaceCwd: options.workspaceCwd } : {}),
    })
  } catch (cause) {
    return { ok: false, failure: spawnFailed(task.slug, taskKey, cause) }
  }
  // 来源任务登记（fix-bug——recordBug 的 source_task_id 派发上下文注入源；结算核注销）
  rememberWorkerSourceTask(handle.workerSessionId, task.taskId)
  // spawn 审计（执行会话事实诞生即入库——verb='spawn'，session_id = worker 子会话；
  // UI ⟞ 打开链的库侧单源，进行中任务不再依赖账本父反查启发式）。fail-soft：审计行
  // 缺席仅损失库侧精确解析（UI 兜底径仍在），不阻派发主链。
  try {
    await deps.tasks.recordSpawn({ projectId: options.scope.projectId, taskId: task.taskId, sessionId: handle.workerSessionId })
  } catch {
    // fail-soft（同上——库写失败不外溢）
  }
  emit('task-spawned', task.slug, {
    taskKey,
    workerSessionId: handle.workerSessionId,
    toolFilter: toolFilter.deny,
    model: agentOptions?.model ?? 'inherit', // 未配置 = 父会话继承（无显式值可记）
  })
  return { ok: true, handle, spawnStartedAt }
}

// ─────────────────────────── 阶段三：settle（结算 + 防线清零 + 事件） ───────────────────────────

/** settle 阶段入参（claimed + 句柄 + 防线键 + 循环停止信号/自有阶梯开关——两可选位循环专用） */
export interface SettleStageInput {
  readonly scope: DispatchChainScope
  readonly claimed: ClaimedDispatch
  readonly handle: SpawnWorkerHandle
  /** spawn 起点（durationMs 基准——spawnClaimed 产物透传） */
  readonly spawnStartedAt: number
  /**
   * 循环停止信号（S1b——abort = 主动终态：结算失败按 killed 分类返回，零 bump 零
   * tool-error；停止叙事与 in-flight 真化 interrupted 归循环 stop 面。工具壳不携带——
   * 前台取消行为零变化）。
   */
  readonly killSignal?: AbortSignal
  /**
   * false = 结算失败不进防线计数、不发射 tool-error（S1b 循环径——worker 异常终止属执行
   * 受阻非 spawn 机制故障，bounded 重试阶梯归循环自有计数；缺省 true = 工具壳行为零变化。
   * 结算成功径恒清零防线 streak——两形态一致）。
   */
  readonly guardOnFailure?: boolean
  /**
   * 容器检出路径（1.14 cwd 钉定收口——循环径透传 LoopRecord.worktree）：success 结算核验
   * 提交落点；缺席（工具壳）= 不核验，行为零变化。
   */
  readonly worktreeCwd?: string
  /**
   * 本项目文档根绝对路径（<工作区根>/.forge/docs——循环径透传 LoopRecord.docsRoot）：纯文档
   * 跨分支特例的归属判据锚（resolve 绝对路径核验包含，他项目 .forge/docs 不命中）；缺席 =
   * 回落 '.forge/docs/' 前缀判据（fail-soft——工具壳行为零变化）。
   */
  readonly docsRoot?: string
  /**
   * 本轮 claim 简报红灯清单（改进7——欠账卡文案与简报行真实存在性一致的判据）：
   * 在场且非空 = 欠账卡指示「比对 E2E_BASELINE_RED 行」；缺席/空 = 兜底文案。
   */
  readonly e2eBaselineRedCases?: readonly string[]
  /**
   * 容器 → 提案 id 映射（机械④——review-wave-N 检查点 proposal_id 归属锚；循环径由
   * loop.proposalId 透传。缺席 = recordWaveCheckpoint 惰性不判，行为零变化）。
   */
  readonly proposalId?: string
}

/** settle 阶段返回（DispatchTaskResult 的 spawned/失败/halted 三分支 + killed——killed 仅
 *  killSignal 在场可达，主链无 killSignal 恒不出现；landing-rejected 仅落点核验失败可达——
 *  1.18 显式处置判词交循环挂起升级，零防线计数） */
export type SettleStageResult =
  | DispatchTaskResult
  | { readonly kind: 'killed' }
  | { readonly kind: 'landing-rejected'; readonly reason: string }

/**
 * 阶段三·settle（主链前台第 4~5 步的共享面）：结算核（await handle.result → dispose →
 * queryTask 只读结算读 → settled/failed 判定）→ 成功：防线清零 + worker-done 事件 +
 * spawned 分支；失败：killSignal.aborted → killed（停止径零 bump）；guardOnFailure=false →
 * 同形 DTO 零 bump（循环自有阶梯）；否则防线计数 + tool-error 留档（≥3 粘住由下一次
 * claim 入口检查兑现）。
 */
export async function settleClaimed(deps: DispatchCoreDeps, exec: DispatchCoreExec, input: SettleStageInput): Promise<SettleStageResult> {
  const { scope, claimed, handle, spawnStartedAt } = input
  const task = claimed.task
  const taskKey = `${task.slug}/${task.localId}`
  const { emit, spawnFailed } = chainClosuresOf(deps, exec, scope)

  const settlement = await settleWorkerRun(deps, {
    projectId: scope.projectId,
    task,
    digest: claimed.digest,
    handle,
    spawnStartedAt,
    ...(scope.source !== undefined ? { poolSource: scope.source } : {}),
    ...(input.worktreeCwd !== undefined ? { worktreeCwd: input.worktreeCwd } : {}),
    ...(input.docsRoot !== undefined ? { docsRoot: input.docsRoot } : {}),
    ...(input.e2eBaselineRedCases !== undefined ? { e2eBaselineRedCases: input.e2eBaselineRedCases } : {}),
    ...(input.proposalId !== undefined ? { proposalId: input.proposalId } : {}),
  })
  if (settlement.case === 'settled') {
    // 成功即清零 + worker-done 事件 + spawned 分支（池快照附载）
    clearSpawnFailures(scope.guardKey)
    emit('task-worker-done', task.slug, {
      taskKey,
      workerSessionId: handle.workerSessionId,
      outcome: settlement.result.outcome,
      durationMs: settlement.durationMs,
    })
    return { kind: 'spawned', ...settlement.result }
  }
  // 循环停止径（abort 中止——kill taxonomy：不进防线计数不发射 tool-error）
  if (input.killSignal?.aborted === true) {
    return { kind: 'killed' }
  }
  // 落点核验失败径（1.18——显式处置判词：任务已在结算核真化 interrupted，循环挂起升级）
  if (settlement.case === 'landing-rejected') {
    return { kind: 'landing-rejected', reason: settlement.cause.message }
  }
  const failure = spawnFailed(task.slug, taskKey, settlement.cause, input.guardOnFailure === false ? { guard: false } : undefined)
  return failure
}

// ─────────────────────────── 主链（claim → 组装 → spawn → 事件发射 → 结算） ───────────────────────────

/**
 * 派发核心主链（原 dispatch-task.ts 单体 execute 的共享面裂变——外部行为零变更）：
 * halted 入口检查（guard）→ run_in_background 降级守卫 → 阶段一 claim → 阶段二 spawn →
 * 事件发射（claimed/spawned/progress/worker-done）→ 后台径 job 包装结算后置交付 / 前台径
 * 阶段三 settle → 返回五态结果。三段阶段面 = 本函数各步的同一实现（循环驱动器逐段消费）。
 * 1.10 增补：池快照口径分流（scoped 调用 = source 容器四计数，非 scoped = 全池）+
 * dispatched 回执幂等重入标识（claim reclaimed → reEntered——防 scoped 循环重复 spawn）。
 */
export async function dispatchCore(deps: DispatchCoreDeps, exec: DispatchCoreExec, args: DispatchCoreArgs): Promise<DispatchTaskResult> {
  const scope = scopeOfArgs(args)
  const { emit, poolRead, spawnFailed } = chainClosuresOf(deps, exec, scope)
  const sessionId = scope.sessionId

  // 归属随流程推进（claim 前 = source 对容器语境/_pool 兜底；claim 后 = 任务容器）——
  // 共享槽写入，工具壳失败回调（emitToolError）消费
  initAttribution(exec, args.source)

  // halted 粘住（入口检查——粘住键不再 claim：防再领任务弃置 in_progress）
  if (spawnFailureStuck(args.guardKey)) {
    return { kind: 'halted', reason: HALTED_REASON }
  }

  // run_in_background 降级守卫（async-dispatch §7——jobs 面可选，缺席 = 后台调用
  // 拒绝并提示，events/settings 同型可选降级模式）：拒绝在 claim 前落面——零任务
  // 被领置 in_progress；不入 spawnFailed 防线计数（装配降级非 spawn 失败，halt
  // 粘住语义不适用）。code 沿用 ERR_SPAWN_FAILED（闭合 ERROR_CODES 联合内本动词
  // 的「本次派发未发生」承载码），message/violations 承载精确原因与指引。
  if (args.runInBackground === true && deps.jobs === undefined) {
    const failure: DispatchCoreFailure = {
      ok: false,
      code: 'ERR_SPAWN_FAILED',
      message:
        'run_in_background is unavailable: the dsh jobs service is not part of this host assembly (background dispatch degraded off)',
      violations: [
        'retry: call dispatchTask without run_in_background — foreground dispatch blocks until the worker settles and returns the settlement inline',
        'or enable the jobs service in the host assembly to unlock background dispatch',
      ],
    }
    emitToolError(deps.events, sessionId, scope.source?.slug ?? '_pool', exec.verb, failure)
    return failure
  }

  // 1. 阶段一：claimTask（API）——守卫 + 就绪选择 + 幂等重入 + dispatchPrompt 合成
  //    （S3 落地：identity.loopSourced → claim 记录循环来源标记；adopt → 定向领取）
  const claim = await claimForDispatch(deps, exec, args)
  if (claim.kind !== 'claimed') {
    return claim // no-task（池快照附载）| halted（入口粘住）
  }
  const task = claim.task
  const taskKey = `${task.slug}/${task.localId}`

  // 2~3. 阶段二：组装 + spawn——后台径 spawn 即绑定 job 专属 AbortController（§4.1 F6 适配
  //    ——工具调用返回后 exec.signal 失效，job 存活期内必须自有信号；job_kill → cancel →
  //    abort → 驱动器取消 worker 剩余回合工作），前台径 exec.signal 原样零变化（SC-C 前台
  //    逐字节等价）
  const background =
    args.runInBackground === true && deps.jobs !== undefined
      ? { jobs: deps.jobs, controller: new AbortController() }
      : undefined
  const spawned = await spawnClaimed(deps, exec, claim, {
    scope,
    ...(background !== undefined ? { signal: background.controller.signal } : {}),
  })
  if (!spawned.ok) {
    return spawned.failure
  }
  const { handle, spawnStartedAt } = spawned

  // ── 后台径（async-dispatch §4.1/4.2/4.4）：同步段到此为止，立即返回
  // dispatched 四键回执；job 异步段 = done continuation（结算核 settleWorkerRun 原样
  // 搬迁）——结算块经 JobOutcome.result 交付（job_output 终读，字段面 = spawned 分支
  // 原样投影），无结算径 failed + 诊断进 detail，kill = killed 不进防线计数。
  if (background !== undefined) {
    const { jobs, controller } = background
    const pool = await poolRead()
    let jobId: string
    try {
      ;({ jobId } = jobs.start({
        kind: 'forge-dispatch',
        label: `${taskKey} · ${task.title}`,
        owner: sessionId, // 派发会话 id——owner Agent 销毁自动取消其 job（F7 生命周期耦合）
        run: (job) => {
          // 进度投影（§4.3——数据同源双写：appendLog 进 jobs 面板 live 流 +
          // task-progress 事件经总线落 logs/<slug>.jsonl；模型消费读结构性滤除 log 块）。
          // claimed/spawned 为 job 启动前已过里程碑（后台径进度窗口自 job 启动始）。
          const progress = (phase: TaskProgressPhase, line: string): void => {
            job.appendLog(line)
            emit('task-progress', task.slug, { taskKey, phase, ts: Date.now() })
          }
          progress('claimed', `claimed ${taskKey} (${task.taskType})`)
          progress('spawned', `spawned worker ${handle.workerSessionId}`)
          progress('running', 'worker executing — settlement deferred to job_output')
          return {
            // kill → abort → 驱动器取消 worker 剩余回合工作（§4.1——spawn 即绑定本 controller）
            cancel: (reason?: string) => {
              controller.abort(reason ?? `background dispatch ${taskKey} killed`)
            },
            done: (async (): Promise<DispatchJobOutcome> => {
              const settlement = await settleWorkerRun(deps, {
                projectId: scope.projectId,
                task,
                digest: claim.digest,
                handle,
                spawnStartedAt,
                ...(scope.source !== undefined ? { poolSource: scope.source } : {}),
                onReading: () => progress('settled:reading', 'worker ended — reading settlement'),
              })
              if (settlement.case === 'settled') {
                clearSpawnFailures(args.guardKey) // 成功结算即清零（结算序 streak）
                progress(
                  settlement.result.outcome === 'success' ? 'done:success' : 'done:blocked',
                  `settlement ready — collect via job_output (${taskKey})`,
                )
                emit('task-worker-done', task.slug, {
                  taskKey,
                  workerSessionId: handle.workerSessionId,
                  outcome: settlement.result.outcome,
                  durationMs: settlement.durationMs,
                })
                return {
                  status: 'completed',
                  result: JSON.stringify({ kind: 'spawned', ...settlement.result }),
                }
              }
              // kill taxonomy（F6——§4.2 ⑤）：abort 中止 → killed（不进 halt 计数；
              // AggregateError 即使 aborted 也归 failed）。kill 时结算读不发生——任务留
              // in_progress 走幂等重入径（§5 结算读可能不发生窗口）
              if (controller.signal.aborted && !(settlement.cause instanceof AggregateError)) {
                return { status: 'killed' }
              }
              // 失败回灌（§4.2 ④）：guard 计数自 job 内按结算序回灌（guardKey 键——
              // 「连续」= 结算序 streak）+ tool-error 留档；≥3 粘住由下一次派发的同步入口检查兑现
              const { message, stuck } = bumpSpawnFailures(args.guardKey, taskKey, settlement.cause)
              emitToolError(deps.events, sessionId, task.slug, exec.verb, {
                ok: false,
                code: 'ERR_SPAWN_FAILED',
                message,
                violations: [],
              })
              return { status: 'failed', detail: stuck ? `${message} — ${HALTED_REASON}` : message }
            })(),
          }
        },
      }))
    } catch (cause) {
      // jobs.start 同步段故障 = 基建故障（同防线）：句柄收尾（worker 无 job 观测面——
      // 取消剩余工作）+ 计数 + DTO——job 未注册，无回执可交付（任务留 in_progress 幂等重入）
      await disposeQuietly(handle)
      return spawnFailed(task.slug, taskKey, cause)
    }
    return {
      kind: 'dispatched',
      taskRef: { slug: task.slug, localId: task.localId },
      title: task.title,
      type: task.taskType,
      workerSessionId: handle.workerSessionId,
      jobId,
      ...(claim.reclaimed ? { reEntered: true } : {}), // 幂等重入标识（1.10——渲染面附等待指引防重复 spawn）
      pool,
    }
  }

  // 4~5. 前台径（SC-C 逐字节等价）：阶段三结算核（worker 执行阻塞至终态 → 结算读）。
  // 工具壳无 killSignal——killed 分支结构性不可达，防御性归 halted。
  const settled = await settleClaimed(deps, exec, { scope, claimed: claim, handle, spawnStartedAt })
  if ('ok' in settled) return settled // 失败 DTO（防线计数 + tool-error 留档已在阶段三落面）
  if (settled.kind === 'killed') return { kind: 'halted', reason: HALTED_REASON } // 不可达防御
  if (settled.kind === 'landing-rejected') return { kind: 'halted', reason: settled.reason } // 不可达防御（工具壳零 worktreeCwd——核验不触发）
  return settled // spawned | halted
}
