// dispatch-core · 派发核心（S1a 可拆卸壳分层——implementation-blueprint §3「dispatchCore」：
// dispatch-task.ts 单体 execute 裂变的共享面）。主链 = claim → 组装 → spawn → 事件发射
// （+ guard 机械 + spawn 契约 + 结算核；后台径 = jobs 包装的结算后置交付）。
//
// 可拆卸壳设计（decisions #10/#18）：identity {sessionId, loopSourced} 与 guardKey 参数化——
// 工具壳填 exec 会话 id（guardKey = sessionId，行为与分层前逐字节等价）；循环驱动器（后续
// 任务）填主会话真实 id + loopSourced=true（claim 记录循环来源标记——S3 已落地：标记列
// loop_sourced 随 claim 写入）+ LoopInstanceId。adopt 定向领取同属 S3 落地面（忽略 links，
// 循环逐个恢复 earliest interrupted 的径）。
//
// 依赖方向硬约束：工具壳 → 核心面单向；核心面零 import 工具壳（tools/**）——文件边界即
// 未来 run-tasks skill 退役时的下线边界（工具面整体移除而核心面/循环/核心单测零波及）。
// 核心面对插件内共享基础设施的合法依赖：contracts / events/sink（事件发射面——非工具壳）/
// faces（结构化最小面类型——非工具壳）。
import type {
  ContainerRef,
  ForgePluginEvent,
  ForgeSettings,
  ForgeSettingsService,
  ForgeTasksService,
  Mode,
  TaskProgressPhase,
  TaskRef,
  TaskType,
} from '@dsh-forge/contracts'
import { emitToolError } from '../events/sink.js'
import type { ForgeEventSink } from '../events/sink.js'
import type { DispatchJobOutcome, DispatchJobsFace } from '../faces.js'
import { deriveWorkerToolFilter, reconcileWorkerReasoning, workerAgentOptionsOf } from './assemble.js'
import { bumpSpawnFailures, clearSpawnFailures, HALTED_REASON, spawnFailureStuck } from './guard.js'
import { poolOf, type PoolSnapshot } from './pool.js'
import type { DispatchCoreFailure, DispatchTaskResult } from './result.js'
import { disposeQuietly, settleWorkerRun } from './settle.js'
import type { SpawnWorker, SpawnWorkerHandle } from './spawn.js'

// ─────────────────────────── 核心面入参/依赖（参数化点） ───────────────────────────

/**
 * 派发核心入参（implementation-blueprint §3 DispatchCoreArgs——身份/guardKey 参数化点）。
 * 两消费者：工具壳（exec 会话 id + 工具参数直映射）与循环驱动器（主会话 id + loopSourced
 * + LoopInstanceId——后续任务接线）。
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
  /** tool-error 留档动词名（工具壳 = 'dispatchTask'） */
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

// ─────────────────────────── 主链（claim → 组装 → spawn → 事件发射 → 结算） ───────────────────────────

/**
 * 派发核心主链（原 dispatch-task.ts 单体 execute 的共享面裂变——外部行为零变更）：
 * halted 入口检查（guard）→ run_in_background 降级守卫 → claimTask（守卫 + 就绪选择 +
 * 幂等重入 + dispatchPrompt 合成）→ 组装（矩阵 toolFilter + settings agentOptions）→
 * spawn（start 拒绝 = 防线计数）→ 事件发射（claimed/spawned/progress/worker-done）→
 * 结算（前台阻塞 / 后台 job done continuation）→ 返回五态结果。
 * 1.10 增补：池快照口径分流（scoped 调用 = source 容器四计数，非 scoped = 全池）+
 * dispatched 回执幂等重入标识（claim reclaimed → reEntered——防 scoped 循环重复 spawn）。
 */
export async function dispatchCore(deps: DispatchCoreDeps, exec: DispatchCoreExec, args: DispatchCoreArgs): Promise<DispatchTaskResult> {
  const { identity, guardKey, projectId } = args
  const sessionId = identity.sessionId

  // 归属随流程推进（claim 前 = source 对容器语境/_pool 兜底；claim 后 = 任务容器）——
  // 共享槽写入，工具壳失败回调（emitToolError）消费
  const attributionSlug = args.source?.slug ?? '_pool'
  exec.attribution.slug = attributionSlug

  /** 池快照现读（口径分流——run-tasks-host-command/1.10：scoped 调用 = source 容器四计数，
   *  no-task 判词与快照消费同口径；非 scoped = 全池，缺省行为零变化） */
  const poolRead = async (): Promise<PoolSnapshot> =>
    poolOf(
      await deps.tasks.taskStats({
        projectId,
        ...(args.source !== undefined ? { source: args.source } : {}),
      }),
    )

  /** 事件发射局部闭包（信封四件 + ts 单源；sink 缺席 = 零事件降级） */
  const emit = <K extends keyof DispatchEventPayloads>(
    type: K,
    slug: string,
    payload: DispatchEventPayloads[K],
  ): void => {
    if (deps.events === undefined) return
    deps.events.emit({ ts: Date.now(), sessionId, slug, type, payload } as ForgePluginEvent)
  }

  /** spawn 失败防线：guard 计数 +1（guardKey 键）→ ≥3 halted 粘住；否则 ERR_SPAWN_FAILED 失败 DTO（人话 + 指引） */
  const spawnFailed = (slug: string, taskKey: string, cause: unknown): DispatchTaskResult => {
    const { message, stuck } = bumpSpawnFailures(guardKey, taskKey, cause)
    emitToolError(deps.events, sessionId, slug, exec.verb, { ok: false, code: 'ERR_SPAWN_FAILED', message, violations: [] })
    if (stuck) return { kind: 'halted', reason: HALTED_REASON }
    return {
      ok: false,
      code: 'ERR_SPAWN_FAILED',
      message,
      violations: [
        `retry: call dispatchTask again to re-enter ${taskKey} (in_progress idempotent re-claim, briefing re-synthesized)`,
        'or move the task manually via the human transition channel if the environment is broken',
      ],
    }
  }

  // halted 粘住（入口检查——粘住键不再 claim：防再领任务弃置 in_progress）
  if (spawnFailureStuck(guardKey)) {
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
    emitToolError(deps.events, sessionId, attributionSlug, exec.verb, failure)
    return failure
  }

  // 1. claimTask（API）：守卫 + 就绪选择 + 幂等重入 + dispatchPrompt 合成
  //    （source 对在场 = 任务源限定盲选；缺席 = 全库——缺省行为零变化。
  //    S3 落地：identity.loopSourced → claim 记录循环来源标记；adopt → 定向领取（忽略
  //    links——工具壳两参数均不携带，schema 与外部语义零变化）。）
  const claimed = await deps.tasks.claimTask({
    projectId,
    sessionId,
    ...(args.source !== undefined ? { source: args.source } : {}),
    ...(args.adopt !== undefined ? { adopt: args.adopt } : {}),
    ...(identity.loopSourced ? { loopSourced: true } : {}),
  })
  const task = claimed.task
  if (task === null) {
    // Z1 出口：no-ready-task 事件（source 对任务源归属——载荷 contextSlug = source_slug；
    // 缺席回落 _pool 兜底）+ 池快照现读（scoped = 容器口径）
    const pool = await poolRead()
    emit(
      'no-ready-task',
      attributionSlug,
      args.source !== undefined ? { contextSlug: args.source.slug } : {},
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

  // 2. 组装：taskType → 收窄矩阵 → toolFilter；forgeSettings → agentOptions
  //    （档位兼容收口：目录已知且配置档位不支持 → 剥离 effort 回落默认档）
  const toolFilter = deriveWorkerToolFilter(task.taskType)
  const settings: ForgeSettings | undefined =
    deps.settings !== undefined ? await deps.settings.get() : undefined
  const agentOptions = await reconcileWorkerReasoning(
    workerAgentOptionsOf(settings),
    deps.resolveModelReasoning,
  )

  // 3. driver in-process spawn（阻塞）——start 拒绝 = 基建故障（防线计数）
  //    后台径：spawn 即绑定 job 专属 AbortController（§4.1 F6 适配——工具调用返回后
  //    exec.signal 失效，job 存活期内必须自有信号；job_kill → cancel → abort → 驱动器
  //    取消 worker 剩余回合工作；run() hooks 与本 controller 同闭包），前台径
  //    exec.signal 原样零变化（SC-C 前台逐字节等价）
  const spawnStartedAt = Date.now()
  const background =
    args.runInBackground === true && deps.jobs !== undefined
      ? { jobs: deps.jobs, controller: new AbortController() }
      : undefined
  let handle: SpawnWorkerHandle
  try {
    handle = await deps.spawn({
      prompt: claimed.dispatchPrompt, // 全文直达 worker——零进本会话上下文
      parent: exec.parent,
      signal:
        background !== undefined ? background.controller.signal : (exec.signal ?? new AbortController().signal),
      toolFilter,
      ...(agentOptions !== undefined ? { agentOptions } : {}),
      label: `${taskKey} · ${task.title}`,
    })
  } catch (cause) {
    return spawnFailed(task.slug, taskKey, cause)
  }
  emit('task-spawned', task.slug, {
    taskKey,
    workerSessionId: handle.workerSessionId,
    toolFilter: toolFilter.deny,
    model: agentOptions?.model ?? 'inherit', // 未配置 = 父会话继承（无显式值可记）
  })

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
                projectId,
                task,
                digest: claimed.digest,
                handle,
                spawnStartedAt,
                ...(args.source !== undefined ? { poolSource: args.source } : {}),
                onReading: () => progress('settled:reading', 'worker ended — reading settlement'),
              })
              if (settlement.case === 'settled') {
                clearSpawnFailures(guardKey) // 成功结算即清零（结算序 streak）
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
              const { message, stuck } = bumpSpawnFailures(guardKey, taskKey, settlement.cause)
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
      ...(claimed.reclaimed ? { reEntered: true } : {}), // 幂等重入标识（1.10——渲染面附等待指引防重复 spawn）
      pool,
    }
  }

  // 4~5. 前台径（SC-C 逐字节等价）：worker 执行（阻塞至终态）→ 结算核（同后台共用体）
  const settlement = await settleWorkerRun(deps, {
    projectId,
    task,
    digest: claimed.digest,
    handle,
    spawnStartedAt,
    ...(args.source !== undefined ? { poolSource: args.source } : {}),
  })
  if (settlement.case === 'settled') {
    // 成功即清零 + worker-done 事件 + spawned 分支（池快照附载）
    clearSpawnFailures(guardKey)
    emit('task-worker-done', task.slug, {
      taskKey,
      workerSessionId: handle.workerSessionId,
      outcome: settlement.result.outcome,
      durationMs: settlement.durationMs,
    })
    return { kind: 'spawned', ...settlement.result }
  }
  return spawnFailed(task.slug, taskKey, settlement.cause)
}
