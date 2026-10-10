// dispatchTask tool（任务 3.4；tech-design Interface 2 + 图 2/3/4——裁决①⑪落面）。
// dispatcher 专用复合派发动词（worker 面不含——Hard Rule）：插件代码内执行序 =
// claimTask(API·守卫+就绪选择+幂等重入) → taskType 查收窄矩阵（contracts 常量）得
// toolFilter + forgeSettings.get() 得 agentOptions（未配置 = 不携带——回退父会话继承）
// → in-process driver spawn（阻塞）→ worker 自行 submitTask（AC gate）→ 此处只读终态
// 结算 → 事件发射（→ 3.3 总线，dispatch_digest 双记联动 task_records.claim 行）→
// 返回结算 + 池快照（taskStats 现读·无状态——任意会话可接管）。
// dispatchPrompt 零进模型上下文（裁决①）：全文只经 spawn 面送达 worker（模型不可转述）。
// 五态返回（formatOk/formatErr 五态渲染）：spawned（success/blocked）/ no-task（池态
// 三分：收工/等待/疑似死锁可判）/ halted（连续 spawn 失败 ×3 粘住·本会话）/ spawn 失败
// （ERR_SPAWN_FAILED + 人话指引：带 taskRef 重入重试/人工转移——任务留 in_progress 走
// 幂等重入径，不走 submit-blocked：执行受阻语义）/ dispatched（后台派发回执——任务 1.3
// async-dispatch §4.1/4.2/4.4：run_in_background=true 时同步段 claim→组装→spawn→jobs.start
// 后毫秒级返回四键回执，结算经 job 内 done continuation 后置交付 job_output 终读；
// 防线搬迁 = SPAWN_FAILURES 自 job 内按结算序回灌、halt 入口检查保持同步、kill 不进计数）。
import type {
  ContainerRef,
  ForgePluginEvent,
  ForgeSettings,
  Mode,
  ReasoningEffortLevel,
  TaskProgressPhase,
  TaskRecordEntry,
  TaskSnapshot,
  TaskStats,
  TaskRef,
  TaskType,
  WorkerToolFamily,
} from '@dsh-forge/contracts'
import {
  CONTAINER_KINDS,
  WORKER_GLOBAL_DENY_TOOLS,
  WORKER_TASK_FAMILY_BY_TYPE,
  WORKER_TOOL_FAMILIES,
  WORKER_TOOL_MATRIX,
  WORKER_TOOL_NAME_FAMILY,
} from '@dsh-forge/contracts'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'
import type { DispatchJobOutcome, ForgeToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalBoolean, optionalEnum, optionalString, requireArgsObject } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, requireSessionId, sessionContextOf } from './session.js'

const TOOL = 'dispatchTask'

// ─────────────────────────── 参数面（source 对 = 容器限定认领 + 无任务事件归属；无独立归属参数） ───────────────────────────

/**
 * agent 面参数：source_kind+source_slug（M3 2.4 容器限定盲选接线——/run-tasks <slug> 绑定容器语义）
 * 同进同退，在场时 claim 就绪选择限定该容器、会话重入仅回领同容器 in_progress；
 * 缺席 = 全库 DAG 就绪盲选（缺省行为，既有调用面零变化）。
 * 无任务事件归属由 source 对兼任（context_slug 入参已退役）：source 在场 → no-ready-task
 * 载荷 contextSlug = source_slug（事件落 logs/<source_slug>.jsonl）；缺席 → _pool 兜底。
 */
export interface DispatchTaskToolArgs {
  /** 容器限定认领引用（source_kind+source_slug 成对解析产物） */
  readonly source?: ContainerRef
  /** 后台派发请求（缺省 false——前台阻塞至结算；true 且 jobs 面缺席 = 拒绝并提示） */
  readonly run_in_background?: boolean
}

/** 参数防御性收窄（source 对半对即拒——拼接歧义防护） */
export function parseDispatchTaskArgs(args: unknown): DispatchTaskToolArgs {
  const a = requireArgsObject(args, TOOL)
  const kind = optionalEnum(a, 'source_kind', CONTAINER_KINDS, TOOL)
  const slug = optionalString(a, 'source_slug', TOOL)
  const runInBackground = optionalBoolean(a, 'run_in_background', TOOL)
  if (kind === undefined && slug === undefined) {
    // 退役参数 context_slug 落未知键零效应径（不再解析——事件归属由 source 对兼任）
    return runInBackground === undefined ? {} : { run_in_background: runInBackground }
  }
  if (kind === undefined || slug === undefined) {
    throw new Error(`${TOOL}: source_kind and source_slug must be given together (both or neither)`)
  }
  return {
    source: { kind, slug },
    ...(runInBackground !== undefined ? { run_in_background: runInBackground } : {}),
  }
}

// ─────────────────────────── 池快照（裁决⑪：现状感知·无状态） ───────────────────────────

/** 池快照（taskStats 现读——附载 spawned/no-task 每次返回） */
export interface PoolSnapshot {
  readonly pending: number
  readonly inProgress: number
  readonly blocked: number
  /** pending ∧ 前置未全满足计数（等待判据成分——2.5 单查询派生） */
  readonly unmetPending: number
}

/** taskStats → 池快照（byStatus 取四键） */
export function poolOf(stats: TaskStats): PoolSnapshot {
  return {
    pending: stats.byStatus.pending,
    inProgress: stats.byStatus.in_progress,
    blocked: stats.byStatus.blocked,
    unmetPending: stats.unmetPending,
  }
}

/** 池态三分（图 3 节点 C——no-task 分支的收工/等待/疑似死锁可判） */
export type PoolVerdict = 'done' | 'wait' | 'deadlock-suspected'

/** 池态三分判定（纯函数）：全终态收工 / blocked>0 且无通路疑似死锁 / 其余等待 */
export function classifyPool(pool: PoolSnapshot): PoolVerdict {
  if (pool.pending === 0 && pool.blocked === 0 && pool.inProgress === 0) return 'done'
  if (pool.blocked > 0 && pool.pending === 0 && pool.unmetPending === 0 && pool.inProgress === 0) return 'deadlock-suspected'
  return 'wait'
}

// ─────────────────────────── 收窄矩阵 → toolFilter（图 4） ───────────────────────────

/**
 * worker 面禁入的 forge 动词（矩阵 forge 族 = submitTask + addTask 恰两员——Hard Rule
 * 「矩阵只给 submitTask + addTask」）。名单 = 本包 FORGE_TOOL_NAMES ∪ dispatchTask −
 * WORKER_FORGE_TOOLS（单测同步守护）。plugin-forge-spec 三动词不入本 deny：其注册面
 * 预设相依（突击组合物理缺席），driver 的 toolFilter 对未知名 loud 校验会拆 spawn——
 * spec 面收口归 5.1 工具名映射 pin（OQ#2）。
 */
const FORGE_DENY_IN_WORKER: readonly string[] = ['queryTask', 'createProposal', 'transitionProposal', 'dispatchTask']

/**
 * taskType → 收窄矩阵 → toolFilter（deny 面）。矩阵 = contracts WORKER_TOOL_MATRIX
 * （族 × 工具族 ✓ 表）：族内拒绝的工具族名下已知工具名入 deny + 全局拒绝集 + forge 闭环。
 * nameFamily 参数化（缺省 = WORKER_TOOL_NAME_FAMILY——5.1 OQ#2 兑现后 = 上游 standard
 * 组合实面全表 17 名，上游族收窄即激活；参数缝保留 = 名表核对 pin 独立可测）。
 */
export function deriveWorkerToolFilter(
  taskType: TaskType,
  nameFamily: Readonly<Record<string, WorkerToolFamily>> = WORKER_TOOL_NAME_FAMILY,
): { deny: string[] } {
  const family = WORKER_TASK_FAMILY_BY_TYPE[taskType]
  const deniedFamilies = new Set<WorkerToolFamily>(WORKER_TOOL_FAMILIES.filter((f) => !WORKER_TOOL_MATRIX[family][f]))
  const deny = new Set<string>(WORKER_GLOBAL_DENY_TOOLS)
  for (const [name, f] of Object.entries(nameFamily)) {
    if (deniedFamilies.has(f)) deny.add(name)
  }
  for (const name of FORGE_DENY_IN_WORKER) deny.add(name)
  return { deny: [...deny] }
}

// ─────────────────────────── spawn 面（driver 结构化最小面——测试桩缝） ───────────────────────────

/** worker spawn 请求（dispatchPrompt 全文 = worker 首条用户消息——零进本会话上下文） */
export interface SpawnWorkerRequest {
  /** 派发简报全文（人格段 + 三标签块——worker 角色唯一来源） */
  readonly prompt: string
  /** 派发 agent（exec.agent 透传——真 Agent 结构兼容；驱动面派生 lineage/depth） */
  readonly parent: unknown
  /** 取消信号（exec.signal 透传；缺省 = 新建——驱动面要求必填） */
  readonly signal: AbortSignal
  /** 收窄面（矩阵派生 deny——childCtx.tools.restrict 同义） */
  readonly toolFilter: { readonly deny: readonly string[] }
  /** 默认 LLM（forgeSettings 已配置才携带；缺省 = 回退父会话继承；effort 缺席 = default 档/兼容剥离） */
  readonly agentOptions?: {
    readonly provider: string
    readonly model: string
    readonly reasoningEffort?: ReasoningEffortLevel
  }
  /** 子会话标签（任务键 · 任务名——worker 子会话标题；用户裁决 2026-10-10：编号+名称） */
  readonly label?: string
}

/** spawn 句柄（两段：start 发布即回——task-spawned 事件先于 worker 执行；result 阻塞至终态） */
export interface SpawnWorkerHandle {
  /** worker 子会话 id（对账锚——追溯三键闭环） */
  readonly workerSessionId: string
  /** 终态（stopReason 非必要——结算以任务终态为准）；拒绝 = 基建故障（spawn 失败径） */
  readonly result: Promise<{ readonly stopReason: string; readonly output: string }>
  /** 收尾（幂等——取消剩余工作 + 静默） */
  dispose(): Promise<void>
}

/** spawn 面（真绑定 = spawn/in-process-driver.ts；单测注入桩） */
export type SpawnWorker = (request: SpawnWorkerRequest) => Promise<SpawnWorkerHandle>

// ─────────────────────────── halted 机械防线（裁决⑪） ───────────────────────────

/** 连续 spawn 失败粘住阈值（第 3 次失败起本会话 halted） */
const HALT_THRESHOLD = 3

const HALTED_REASON =
  '3 consecutive worker spawn failures in this dispatch session — the guard is sticky with no self-unlock; check the environment and start a new dispatch session to reset'

/**
 * 会话作用域连续失败计数器（插件模块级·易失——冷启动重置；无重置参数：复位 = 新会话）。
 * 成功结算即清零（spawn 机制面恢复）；spawn 失败任务留 in_progress 走幂等重入径。
 */
const SPAWN_FAILURES = new Map<string, number>()

// ─────────────────────────── forgeSettings → agentOptions（图 4 节点 S→AO/NC） ───────────────────────────

/** 设置 → agentOptions（未配置/服务缺席 = undefined——不携带，回退父会话继承；
 * reasoning='default' = 不下发 effort——落 provider/模型默认档；其余 → reasoningEffort 直映射） */
export function workerAgentOptionsOf(
  settings: ForgeSettings | undefined,
): { provider: string; model: string; reasoningEffort?: ReasoningEffortLevel } | undefined {
  if (settings === undefined || settings.worker === undefined) return undefined
  const { provider, model, reasoning } = settings.worker
  if (reasoning === 'default') return { provider, model }
  return { provider, model, reasoningEffort: reasoning }
}

/**
 * 档位兼容收口（不同 provider/model 支持集不同——「无法兼容就不设置」）：
 * 目录已知（efforts 非 undefined）且配置档位不在支持集 → 剥离 reasoningEffort（回落
 * provider/模型默认档），杜绝 UNSUPPORTED_REASONING_EFFORT 级 worker 启动即崩；
 * 目录不可知（解析器缺席/模型不可解析）= 不判，原样携带。
 */
export async function reconcileWorkerReasoning(
  options: { provider: string; model: string; reasoningEffort?: ReasoningEffortLevel } | undefined,
  resolveModelReasoning: ((provider: string, model: string) => Promise<readonly string[] | undefined>) | undefined,
): Promise<{ provider: string; model: string; reasoningEffort?: ReasoningEffortLevel } | undefined> {
  if (options === undefined || options.reasoningEffort === undefined) return options
  if (resolveModelReasoning === undefined) return options
  let efforts: readonly string[] | undefined
  try {
    efforts = await resolveModelReasoning(options.provider, options.model)
  } catch {
    return options // 解析失败 = 目录不可知——不判
  }
  if (efforts === undefined) return options
  if (efforts.includes(options.reasoningEffort)) return options
  return { provider: options.provider, model: options.model } // 不支持 → 不设置
}

// ─────────────────────────── 返回面（Interface 2 四分支） ───────────────────────────

/** spawned 分支（结算 + 池快照；blocked 增 reason——Interface 2 渲染模板「原因行」承载） */
export interface DispatchSpawnedResult {
  readonly kind: 'spawned'
  readonly outcome: 'success' | 'blocked'
  readonly taskRef: TaskRef
  readonly title: string
  readonly type: TaskType
  /** 容器模式快照（NULL = 键缺席） */
  readonly mode?: Mode
  /** claim 简报指纹（task_records.claim 行双记同值） */
  readonly digest: string
  readonly summary?: string
  /** blocked 原因行（blocked submit 必带 reason——core 侧先证） */
  readonly reason?: string
  readonly commitHash?: string
  /** 已建修复任务（blocked 径 worker 经 addTask blockSource 派生链——可继续派发） */
  readonly followUp?: TaskRef
  readonly pool: PoolSnapshot
}

/** dispatchTask 返回面（五分支：四成功形态 + 失败 DTO——ERR_SPAWN_FAILED） */
export type DispatchTaskResult =
  | DispatchSpawnedResult
  | {
      /** dispatched 分支（后台派发回执——async-dispatch §4.4：taskRef/workerSessionId/jobId/pool 四键） */
      kind: 'dispatched'
      taskRef: TaskRef
      title: string
      type: TaskType
      workerSessionId: string
      jobId: string
      pool: PoolSnapshot
    }
  | { kind: 'no-task'; pool: PoolSnapshot }
  | { kind: 'halted'; reason: string }
  | ForgeToolFailure

/** 末条 submit record（结算摘要/commit 来源） */
function lastSubmitRecordOf(records: readonly TaskRecordEntry[] | undefined): TaskRecordEntry | undefined {
  if (records === undefined) return undefined
  for (let i = records.length - 1; i >= 0; i -= 1) {
    if (records[i]?.verb === 'submit') return records[i]
  }
  return undefined
}

/** blocked 任务的新建修复任务（listTasks created 降序——首个 sourceTask 命中 = 最新 fix） */
async function findFixTaskRef(
  tasks: ForgeToolDeps['tasks'],
  projectId: string,
  task: TaskSnapshot,
): Promise<TaskRef | undefined> {
  const cards = await tasks.listTasks({ projectId, source: task.source, sort: 'created' })
  for (const card of cards) {
    if (card.sourceTask !== undefined && card.sourceTask.slug === task.slug && card.sourceTask.localId === task.localId) {
      return { slug: card.slug, localId: card.localId }
    }
  }
  return undefined
}

/** dispose 静默收尾（result 已定后的资源释放——异常不并进失败面） */
async function disposeQuietly(handle: SpawnWorkerHandle): Promise<void> {
  try {
    await handle.dispose()
  } catch {
    // 收尾异常吞没：结算/失败面已定
  }
}

/** worker 终态结算判定（settleWorkerRun 产物——失败支合并 run 拒绝与无结算，kill 由调用方 taxonomy 判定） */
type WorkerSettlement =
  | { readonly case: 'settled'; readonly result: Omit<DispatchSpawnedResult, 'kind'>; readonly durationMs: number }
  | { readonly case: 'failed'; readonly cause: unknown }

/**
 * worker 终态结算核（async-dispatch §4.2 ②③——前台 execute 第 4~5 步原样搬迁的共用体，
 * 前台阻塞径与后台 done continuation 同源消费，保证「结算块 = spawned 分支原样投影」）：
 * await handle.result（传递性含 worker submitTask + 落账——F10 无竞态）→ disposeQuietly →
 * queryTask 只读结算读 → 三_case 判定（settled：spawned 分支字段面全量构建；failed：
 * run 拒绝/无结算同归防线径）。
 */
async function settleWorkerRun(
  deps: DispatchTaskToolDeps,
  ctx: {
    readonly projectId: string
    readonly task: TaskSnapshot
    /** claim 简报指纹（spawned 分支 digest 字段同源——task_records.claim 行双记同值） */
    readonly digest: string
    readonly handle: SpawnWorkerHandle
    /** spawn 起点（durationMs 基准） */
    readonly spawnStartedAt: number
    /** worker 终态落定后、结算读前的回调（后台径 settled:reading 里程碑投影点；前台径缺席零发射） */
    readonly onReading?: () => void
  },
): Promise<WorkerSettlement> {
  let run: Awaited<SpawnWorkerHandle['result']>
  try {
    run = await ctx.handle.result
  } catch (cause) {
    await disposeQuietly(ctx.handle)
    return { case: 'failed', cause }
  }
  const durationMs = Date.now() - ctx.spawnStartedAt
  await disposeQuietly(ctx.handle)
  ctx.onReading?.()

  // 结算读：worker 自行 submitTask 落账（AC gate 在服务侧）；此处只读终态
  const settled = await deps.tasks.queryTask({
    projectId: ctx.projectId,
    taskRef: { slug: ctx.task.slug, localId: ctx.task.localId },
    include: { records: true },
  })
  const status = settled.task.taskStatus
  if (status !== 'completed' && status !== 'blocked') {
    // worker 未产出（完成但无结算——refusal/max-tokens/漏提交同径）：执行受阻语义，
    // 任务留 in_progress 走幂等重入径（不走 submit-blocked）
    return { case: 'failed', cause: new Error(`worker run ended without a settlement (stopReason: ${run.stopReason})`) }
  }

  const outcome: 'success' | 'blocked' = status === 'completed' ? 'success' : 'blocked'
  const submitRecord = lastSubmitRecordOf(settled.records)
  const followUp = outcome === 'blocked' ? await findFixTaskRef(deps.tasks, ctx.projectId, ctx.task) : undefined
  const pool = poolOf(await deps.tasks.taskStats({ projectId: ctx.projectId }))
  return {
    case: 'settled',
    durationMs,
    result: {
      outcome,
      taskRef: { slug: ctx.task.slug, localId: ctx.task.localId },
      title: ctx.task.title,
      type: ctx.task.taskType,
      ...(ctx.task.mode !== undefined ? { mode: ctx.task.mode } : {}),
      digest: ctx.digest,
      ...(outcome === 'success' && submitRecord?.summary !== undefined ? { summary: submitRecord.summary } : {}),
      ...(outcome === 'blocked'
        ? { reason: settled.task.blockedReason ?? submitRecord?.reason ?? 'blocking reason not recorded' }
        : {}),
      ...(submitRecord?.commitHash !== undefined ? { commitHash: submitRecord.commitHash } : {}),
      ...(followUp !== undefined ? { followUp } : {}),
      pool,
    },
  }
}

// ─────────────────────────── 渲染（formatOk/formatErr 四态——Interface 2 场景渲染） ───────────────────────────

/** 池行（无状态快照——dispatcher 继续/收工/fix 链观察判据） */
function poolLine(pool: PoolSnapshot): string {
  return `pending ${pool.pending} · in_progress ${pool.inProgress} · blocked ${pool.blocked} · unmet-pending ${pool.unmetPending}`
}

const POOL_VERDICT_TEXT: Readonly<Record<PoolVerdict, string>> = {
  done: 'pool all settled — wrap up',
  wait: 'work in flight or prerequisites unmet — retry later',
  'deadlock-suspected': 'suspected deadlock (blocked with no pending path) — needs human or diagnostic attention',
}

/** 池快照 schema（spawned/no-task 共用） */
const POOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pending: { type: 'integer' },
    inProgress: { type: 'integer' },
    blocked: { type: 'integer' },
    unmetPending: { type: 'integer' },
  },
  required: ['pending', 'inProgress', 'blocked', 'unmetPending'],
} as const

/** 任务自然键 schema（taskRef/followUp 共用） */
const TASK_REF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { slug: { type: 'string' }, localId: { type: 'string' } },
  required: ['slug', 'localId'],
} as const

/** 注册面输出 schema（四成功分支 oneOf + 失败 DTO——registry 双态可校验） */
const DISPATCH_TASK_OUTPUT_SCHEMA = withFailureVariant({
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['spawned'] },
        outcome: { type: 'string', enum: ['success', 'blocked'] },
        taskRef: TASK_REF_SCHEMA,
        title: { type: 'string' },
        type: { type: 'string' },
        mode: { type: 'string', enum: ['expedition', 'blitz'] },
        digest: { type: 'string' },
        summary: { type: 'string' },
        reason: { type: 'string' },
        commitHash: { type: 'string' },
        followUp: TASK_REF_SCHEMA,
        pool: POOL_SCHEMA,
      },
      required: ['kind', 'outcome', 'taskRef', 'title', 'type', 'digest', 'pool'],
    },
    {
      // dispatched 分支（async-dispatch §4.4 四键回执——§4.5 oneOf 增支）
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['dispatched'] },
        taskRef: TASK_REF_SCHEMA,
        title: { type: 'string' },
        type: { type: 'string' },
        workerSessionId: { type: 'string' },
        jobId: { type: 'string' },
        pool: POOL_SCHEMA,
      },
      required: ['kind', 'taskRef', 'title', 'type', 'workerSessionId', 'jobId', 'pool'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { kind: { type: 'string', enum: ['no-task'] }, pool: POOL_SCHEMA },
      required: ['kind', 'pool'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { kind: { type: 'string', enum: ['halted'] }, reason: { type: 'string' } },
      required: ['kind', 'reason'],
    },
  ],
})

/** 五态渲染（Interface 2 场景渲染）：spawned ✓/⚑ + 池行；no-task · + 池态三分判词；
 *  dispatched ▸ 派发回执 + job_output/job_kill 指引；halted ✗ 粘住；spawn 失败 = 失败
 *  DTO formatFailure（✗ ERR_SPAWN_FAILED + 指引行） */
function renderDispatchResult(_args: unknown, value: unknown): readonly TextContentBlock[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as Exclude<DispatchTaskResult, ForgeToolFailure>
  if (v.kind === 'halted') {
    return [{ type: 'text', text: `✗ dispatch halted — ${v.reason}` }]
  }
  if (v.kind === 'no-task') {
    return [{ type: 'text', text: `· no ready task (pool: ${poolLine(v.pool)}) — ${POOL_VERDICT_TEXT[classifyPool(v.pool)]}` }]
  }
  if (v.kind === 'dispatched') {
    const key = `${v.taskRef.slug}/${v.taskRef.localId}`
    return [
      {
        type: 'text',
        text: [
          `▸ dispatched ${key} — job ${v.jobId}`,
          `- collect the settlement when the worker settles: job_output ${v.jobId}`,
          `- abort the run: job_kill ${v.jobId}`,
          `- pool: ${poolLine(v.pool)}`,
        ].join('\n'),
      },
    ]
  }
  const key = `${v.taskRef.slug}/${v.taskRef.localId}`
  if (v.outcome === 'success') {
    const head = [`✓ ${key} completed — ${v.type}`]
    if (v.summary !== undefined) head.push(v.summary)
    if (v.commitHash !== undefined) head.push(`commit ${v.commitHash}`)
    return formatOk(head.join(' · '), [`- pool: ${poolLine(v.pool)}`])
  }
  const lines = [`⚑ ${key} blocked — ${v.reason ?? 'blocking reason not recorded'}`]
  if (v.followUp !== undefined) lines.push(`- follow-up fix task: ${v.followUp.slug}/${v.followUp.localId} (dispatchable)`)
  lines.push(`- pool: ${poolLine(v.pool)}`)
  return [{ type: 'text', text: lines.join('\n') }]
}

/** dispatchTask 事件载荷面（emit 局部闭包的类型索引——contracts ForgePluginEvent 判别联合的本动词子集） */
interface DispatchEventPayloads {
  'task-claimed': { taskKey: string; taskType: TaskType; mode?: Mode; dispatchDigest: string }
  'task-spawned': { taskKey: string; workerSessionId: string; toolFilter: readonly string[]; model: string }
  'task-progress': { taskKey: string; phase: TaskProgressPhase; ts: number }
  'task-worker-done': { taskKey: string; workerSessionId: string; outcome: 'success' | 'blocked'; durationMs: number }
  'no-ready-task': { contextSlug?: string }
}

// ─────────────────────────── tool 定义 ───────────────────────────

/** dispatchTask 专用 deps（ForgeToolDeps 扩展面——装配必给 spawn；events/settings 可选降级） */
export type DispatchTaskToolDeps = ForgeToolDeps & {
  /** in-process driver spawn 真绑定（缺席 = 装配 bug：执行 fail-loud 拒） */
  readonly spawn: SpawnWorker
}

/** tool 定义工厂 */
export function createDispatchTaskTool(deps: DispatchTaskToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Dispatch the next ready task: claims it (ready selection, idempotent re-entry), assembles the worker tool filter from the task type, and spawns an in-process worker that executes the dispatch briefing and submits the outcome itself. Call repeatedly in a dispatch loop until no-task; the pool snapshot tells wrap-up / waiting / suspected-deadlock. Default (foreground) the call blocks until the worker settles and returns the settlement with a live pool snapshot; with run_in_background it returns a dispatched receipt immediately (taskRef/workerSessionId/jobId/pool): collect the settlement later via job_output (the settlement block arrives once the worker settles) and abort the run via job_kill. Settlement semantics are identical in both modes: failures settle inside the background job, the spawn-failure guard counts them in settlement order, and 3 consecutive failures halt the session at the next dispatch entry (a new session resets the guard; job kills do not count); a failed spawn leaves the task in_progress for idempotent re-entry. Optional source_kind+source_slug pair (both or neither) scopes the claim to that single container: only its ready tasks are selected and session re-entry only resumes same-container in_progress tasks; absent = pool-wide readiness selection.',
    parameters: {
      type: 'object',
      properties: {
        source_kind: {
          type: 'string',
          description:
            "Container kind ('feature' | 'proposal') scoping the claim to one container — must be given together with source_slug; absent = pool-wide readiness selection.",
        },
        source_slug: {
          type: 'string',
          description:
            'Container slug scoping the claim to one container (feature directory name or proposal slug) — must be given together with source_kind; absent = pool-wide readiness selection.',
        },
        run_in_background: {
          type: 'boolean',
          description:
            'Request background dispatch: the call returns a dispatched receipt immediately (taskRef/workerSessionId/jobId/pool) and the settlement is collected later via job_output. Requires the dsh jobs service — when absent the call is rejected with guidance. Default false (foreground: blocks until the worker settles and returns the settlement inline).',
        },
      },
    },
    output: { schema: DISPATCH_TASK_OUTPUT_SCHEMA, render: renderDispatchResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<DispatchTaskResult | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      // tool-error 归属 slug 随流程推进（claim 前 = source 对容器语境；claim 后 = 任务容器）
      let attributionSlug: string | undefined

      /** 事件发射局部闭包（信封四件 + ts 单源；sink 缺席 = 零事件降级） */
      const emit = <K extends keyof DispatchEventPayloads>(
        type: K,
        slug: string,
        payload: DispatchEventPayloads[K],
      ): void => {
        if (deps.events === undefined) return
        deps.events.emit({ ts: Date.now(), sessionId: session.sessionId, slug, type, payload } as ForgePluginEvent)
      }

      /** 防线计数共享核（前台 spawnFailed / 后台 job 回灌共用——「连续」= 结算序 streak） */
      const bumpSpawnFailures = (sessionId: string, taskKey: string, cause: unknown): { message: string; stuck: boolean } => {
        const count = (SPAWN_FAILURES.get(sessionId) ?? 0) + 1
        SPAWN_FAILURES.set(sessionId, count)
        return {
          message: `worker spawn failed for ${taskKey}: ${cause instanceof Error ? cause.message : String(cause)}`,
          stuck: count >= HALT_THRESHOLD,
        }
      }

      /** spawn 失败防线：计数 +1 → ≥3 halted 粘住；否则 ERR_SPAWN_FAILED 失败 DTO（人话 + 指引） */
      const spawnFailed = (sessionId: string, slug: string, taskKey: string, cause: unknown): DispatchTaskResult => {
        const { message, stuck } = bumpSpawnFailures(sessionId, taskKey, cause)
        emitToolError(deps.events, sessionId, slug, TOOL, { ok: false, code: 'ERR_SPAWN_FAILED', message, violations: [] })
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

      return callToolFace(
        async (): Promise<DispatchTaskResult> => {
          const parsed = parseDispatchTaskArgs(args)
          const projectId = requireProjectId(deps.resolveProjectId, session)
          const sessionId = requireSessionId(session)
          attributionSlug = parsed.source?.slug ?? '_pool'
          await deps.events?.prepare(session)

          // halted 粘住（入口检查——粘住会话不再 claim：防再领任务弃置 in_progress）
          if ((SPAWN_FAILURES.get(sessionId) ?? 0) >= HALT_THRESHOLD) {
            return { kind: 'halted', reason: HALTED_REASON }
          }

          // run_in_background 降级守卫（async-dispatch §7——jobs 面可选，缺席 = 后台调用
          // 拒绝并提示，events/settings 同型可选降级模式）：拒绝在 claim 前落面——零任务
          // 被领置 in_progress；不入 spawnFailed 防线计数（装配降级非 spawn 失败，halt
          // 粘住语义不适用）。code 沿用 ERR_SPAWN_FAILED（闭合 ERROR_CODES 联合内本动词
          // 的「本次派发未发生」承载码），message/violations 承载精确原因与指引。
          if (parsed.run_in_background === true && deps.jobs === undefined) {
            const failure: ForgeToolFailure = {
              ok: false,
              code: 'ERR_SPAWN_FAILED',
              message:
                'run_in_background is unavailable: the dsh jobs service is not part of this host assembly (background dispatch degraded off)',
              violations: [
                'retry: call dispatchTask without run_in_background — foreground dispatch blocks until the worker settles and returns the settlement inline',
                'or enable the jobs service in the host assembly to unlock background dispatch',
              ],
            }
            emitToolError(deps.events, sessionId, attributionSlug, TOOL, failure)
            return failure
          }

          // 1. claimTask（API）：守卫 + 就绪选择 + 幂等重入 + dispatchPrompt 合成
          //    （source 对在场 = 容器限定盲选；缺席 = 全库——缺省行为零变化）
          const claimed = await deps.tasks.claimTask({
            projectId,
            sessionId,
            ...(parsed.source !== undefined ? { source: parsed.source } : {}),
          })
          const task = claimed.task
          if (task === null) {
            // Z1 出口：no-ready-task 事件（source 对容器归属——载荷 contextSlug = source_slug；
            // 缺席回落 _pool 兜底）+ 池快照现读
            const pool = poolOf(await deps.tasks.taskStats({ projectId }))
            emit(
              'no-ready-task',
              attributionSlug,
              parsed.source !== undefined ? { contextSlug: parsed.source.slug } : {},
            )
            return { kind: 'no-task', pool }
          }
          const taskKey = `${task.slug}/${task.localId}`
          attributionSlug = task.slug
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
            parsed.run_in_background === true && deps.jobs !== undefined
              ? { jobs: deps.jobs, controller: new AbortController() }
              : undefined
          let handle: SpawnWorkerHandle
          try {
            handle = await deps.spawn({
              prompt: claimed.dispatchPrompt, // 全文直达 worker——零进本会话上下文
              parent: exec.agent,
              signal:
                background !== undefined ? background.controller.signal : (exec.signal ?? new AbortController().signal),
              toolFilter,
              ...(agentOptions !== undefined ? { agentOptions } : {}),
              label: `${taskKey} · ${task.title}`,
            })
          } catch (cause) {
            return spawnFailed(sessionId, task.slug, taskKey, cause)
          }
          emit('task-spawned', task.slug, {
            taskKey,
            workerSessionId: handle.workerSessionId,
            toolFilter: toolFilter.deny,
            model: agentOptions?.model ?? 'inherit', // 未配置 = 父会话继承（无显式值可记）
          })

          // ── 后台径（async-dispatch §4.1/4.2/4.4——任务 1.3）：同步段到此为止，立即返回
          // dispatched 四键回执；job 异步段 = done continuation（结算核 settleWorkerRun 原样
          // 搬迁）——结算块经 JobOutcome.result 交付（job_output 终读，字段面 = spawned 分支
          // 原样投影），无结算径 failed + 诊断进 detail，kill = killed 不进防线计数。
          if (background !== undefined) {
            const { jobs, controller } = background
            const pool = poolOf(await deps.tasks.taskStats({ projectId }))
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
                        onReading: () => progress('settled:reading', 'worker ended — reading settlement'),
                      })
                      if (settlement.case === 'settled') {
                        SPAWN_FAILURES.delete(sessionId) // 成功结算即清零（结算序 streak）
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
                      // 失败回灌（§4.2 ④）：SPAWN_FAILURES 自 job 内计数（「连续」= 结算序
                      // streak）+ tool-error 留档；≥3 粘住由下一次派发的同步入口检查兑现
                      const { message, stuck } = bumpSpawnFailures(sessionId, taskKey, settlement.cause)
                      emitToolError(deps.events, sessionId, task.slug, TOOL, {
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
              return spawnFailed(sessionId, task.slug, taskKey, cause)
            }
            return {
              kind: 'dispatched',
              taskRef: { slug: task.slug, localId: task.localId },
              title: task.title,
              type: task.taskType,
              workerSessionId: handle.workerSessionId,
              jobId,
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
          })
          if (settlement.case === 'settled') {
            // 成功即清零 + worker-done 事件 + spawned 分支（池快照附载）
            SPAWN_FAILURES.delete(sessionId)
            emit('task-worker-done', task.slug, {
              taskKey,
              workerSessionId: handle.workerSessionId,
              outcome: settlement.result.outcome,
              durationMs: settlement.durationMs,
            })
            return { kind: 'spawned', ...settlement.result }
          }
          return spawnFailed(sessionId, task.slug, taskKey, settlement.cause)
        },
        (failure) =>
          emitToolError(deps.events, session.sessionId, attributionSlug ?? slugOfToolArgs(args), TOOL, failure),
      )
    },
  }
}
