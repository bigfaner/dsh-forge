// dispatchTask tool——薄工具壳（S1a 可拆卸壳分层；decisions #10/#18 + implementation-blueprint
// §3）。单体 execute 已裂变为共享核心面 src/dispatch-core/（claim→组装→spawn→事件发射 +
// guard 机械 + spawn 契约 + 结算核）：本壳仅保留工具面职责——参数防御收窄（解析 source 对/
// run_in_background）、exec 会话上下文 → DispatchCoreArgs 身份/guardKey 组装（guard 键 =
// 会话 id；循环消费者 = LoopInstanceId）、callToolFace 失败信封与五态渲染，其余全数委托
// dispatchCore。schema 与外部语义零变化（纯内部分层重构——既有契约测试不修改即通过）。
//
// 依赖方向硬约束：壳 → 核单向（核心面零 import 本文件/tools 面）——文件边界即未来
// run-tasks skill 退役时的下线边界（工具面整体移除而核心面/循环/核心单测零波及）。
// 兼容再导出面：分层前的公共符号（池快照/组装纯函数/spawn 契约/结果类型）经本壳继续
// 可达（tools/index.ts barrel 与 e2e worker-face 单测的既有 import 面零波及）。
import { CONTAINER_KINDS } from '@dsh-forge/contracts'
import type { ContainerRef } from '@dsh-forge/contracts'
import { classifyPool, dispatchCore } from '../dispatch-core/index.js'
import type { DispatchTaskResult, PoolSnapshot, PoolVerdict, SpawnWorker } from '../dispatch-core/index.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'
import type { ForgeToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalBoolean, optionalEnum, optionalString, requireArgsObject } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, requireSessionId, sessionContextOf } from './session.js'

// 兼容再导出（分层前本文件持有、现居核心面的公共符号——消费面 import 路径零变化）
export { classifyPool, deriveWorkerToolFilter, poolOf, reconcileWorkerReasoning, workerAgentOptionsOf } from '../dispatch-core/index.js'
export type {
  DispatchSpawnedResult,
  DispatchTaskResult,
  PoolSnapshot,
  PoolVerdict,
  SpawnWorker,
  SpawnWorkerHandle,
  SpawnWorkerRequest,
} from '../dispatch-core/index.js'

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
      // dispatched 分支（async-dispatch §4.4 四键回执——§4.5 oneOf 增支；reEntered = 幂等重入
      // 标识（1.10——可选键，新领取零此键），渲染面据此附「等待结算再续派」指引）
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
        reEntered: { type: 'boolean' },
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
 *  dispatched ▸ 派发回执 + job_output/job_kill 指引（重入回执 ▸ re-entered 标识 + 「等待
 *  结算再续派」指引——1.10 防 scoped 循环对在飞任务重复 spawn）；halted ✗ 粘住；spawn
 *  失败 = 失败 DTO formatFailure（✗ ERR_SPAWN_FAILED + 指引行） */
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
    const lines = [
      v.reEntered === true
        ? `▸ re-entered dispatched ${key} — job ${v.jobId}`
        : `▸ dispatched ${key} — job ${v.jobId}`,
    ]
    if (v.reEntered === true) {
      lines.push(
        '- re-entry: a dispatch for this task was already in flight — wait for that job\'s settlement before dispatching again (do NOT dispatchTask while a worker for this task is live); the settlement notice is the next-dispatch signal',
      )
    }
    lines.push(
      `- collect the settlement when the worker settles: job_output ${v.jobId}`,
      `- abort the run: job_kill ${v.jobId}`,
      `- pool: ${poolLine(v.pool)}`,
    )
    return [{ type: 'text', text: lines.join('\n') }]
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

// ─────────────────────────── tool 定义（薄壳：参数组装 + 委托） ───────────────────────────

/** dispatchTask 专用 deps（ForgeToolDeps 扩展面——装配必给 spawn；events/settings 可选降级） */
export type DispatchTaskToolDeps = ForgeToolDeps & {
  /** in-process driver spawn 真绑定（缺席 = 装配 bug：执行 fail-loud 拒） */
  readonly spawn: SpawnWorker
}

/** tool 定义工厂（薄壳——领取/结算/循环逻辑零保留，主链全在 dispatch-core） */
export function createDispatchTaskTool(deps: DispatchTaskToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Dispatch the next ready task: claims it (ready selection, idempotent re-entry), assembles the worker tool filter from the task type, and spawns an in-process worker that executes the dispatch briefing and submits the outcome itself. Call repeatedly in a dispatch loop until no-task; the pool snapshot tells wrap-up / waiting / suspected-deadlock. Default (foreground) the call blocks until the worker settles and returns the settlement with a live pool snapshot; with run_in_background it returns a dispatched receipt immediately (taskRef/workerSessionId/jobId/pool): collect the settlement later via job_output (the settlement block arrives once the worker settles) and abort the run via job_kill. Settlement semantics are identical in both modes: failures settle inside the background job, the spawn-failure guard counts them in settlement order, and 3 consecutive failures halt the session at the next dispatch entry (a new session resets the guard; job kills do not count); a failed spawn leaves the task in_progress for idempotent re-entry. Optional source_kind+source_slug pair (both or neither) scopes the claim to that single container: only its ready tasks are selected, session re-entry only resumes same-container in_progress tasks, and the pool snapshot four counts cover just that container (its no-task verdict judges that container); absent = pool-wide readiness selection and pool-wide snapshot. A dispatched receipt marked re-entered means a prior dispatch for that task is unresolved — wait for its settlement instead of dispatching again.',
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
      /** tool-error 归属共享槽（核心面随流程写入——claim 前 = source 对/_pool；claim 后 = 任务容器） */
      const attribution: { slug?: string } = {}
      return callToolFace(
        async (): Promise<DispatchTaskResult> => {
          // 薄壳职责：参数组装（工具参数 → 核心入参；exec 会话上下文 → 身份/guardKey）+ 委托
          const parsed = parseDispatchTaskArgs(args)
          const projectId = requireProjectId(deps.resolveProjectId, session)
          const sessionId = requireSessionId(session)
          await deps.events?.prepare(session)
          return dispatchCore(
            deps,
            {
              attribution,
              parent: exec.agent,
              signal: exec.signal,
              verb: TOOL,
            },
            {
              // 身份/guardKey 参数化点（decisions #18）：工具壳 = exec 会话 id——行为与
              // 分层前逐字节等价；循环驱动器（后续任务）= 主会话 id + loopSourced:true +
              // guardKey = LoopInstanceId
              identity: { sessionId, loopSourced: false },
              guardKey: sessionId,
              projectId,
              ...(parsed.source !== undefined ? { source: parsed.source } : {}),
              ...(parsed.run_in_background !== undefined ? { runInBackground: parsed.run_in_background } : {}),
            },
          )
        },
        (failure) =>
          emitToolError(deps.events, session.sessionId, attribution.slug ?? slugOfToolArgs(args), TOOL, failure),
      )
    },
  }
}
