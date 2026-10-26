// pauseTask tool（task-pause-primitive 1.8——提案 §二）：主 agent 单任务暂停调度原语。
// 语义 = 请求暂停目标容器循环的当前在飞任务：driver.pause 硬中断在飞 worker（先摘
// record.inFlight 再 abort——竞态收口序）、任务真化 suspended、循环进挂起态（堵死旧简报
// 重领窗口）；改写走 updateTask（suspended 在门内）、恢复走 dispatchTask re-entry（resume
// 序批量恢复 paused 卡 pending）。归属守卫最终裁决在 driver 层（与 stopTaskLoop 同权限面：
// 运行中仅 owner 可 pause、挂起态任意会话可接管）——工具面做参数校验与错误呈现
// （formatOk/formatFailure 双友好：错误码 + 具体原因 + 下一步建议）。
// 面分治：仅主 agent 会话可用——WORKER_FORGE_TOOLS 不含本工具，deriveWorkerToolFilter
// 同步守护（FORGE_TOOL_NAMES − WORKER_FORGE_TOOLS 全集中 deny）令 worker 面不注入、调用被拒。
import type { ContainerRef } from '@dsh-forge/contracts'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'
import type { ForgeToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { requireArgsObject, requiredString } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireSessionId, sessionContextOf } from './session.js'
import type { LoopToolDeps } from './dispatch-task.js'

const TOOL = 'pauseTask'

/** 拒绝（typed 错误抛出形——callToolFace 统一转失败 DTO + tool-error 留档；承载码同
 *  stopTaskLoop 先例 ERR_SPAWN_FAILED + data.guidance——格式面 guidance 行逐行投影） */
function pauseRejection(message: string, guidance: readonly string[] = []): never {
  throw Object.assign(new Error(message), { code: 'ERR_SPAWN_FAILED', data: { guidance } })
}

// ─────────────────────────── 参数面（slug/localId/reason 三参必带） ───────────────────────────

export interface PauseTaskToolArgs {
  /** 目标容器（成对必带——与 addTask/submitTask 的 source 对同形） */
  readonly source: ContainerRef
  /** 目标任务 localId（与循环当前在飞任务一致性校验——工具面预检防误暂停他任务） */
  readonly localId: string
  /** 暂停原因全文（必带——落任务执行时间线审计，与 transitionTask 审计风格一致） */
  readonly reason: string
}

/** 参数防御性收窄（三参必带——缺失给可读原因：哪个参、怎么补） */
export function parsePauseTaskArgs(args: unknown): PauseTaskToolArgs {
  const a = requireArgsObject(args, TOOL)
  const kind = requiredString(a, 'source_kind', TOOL)
  if (kind !== 'feature' && kind !== 'proposal') {
    throw new Error(`${TOOL}: source_kind must be one of ['feature', 'proposal']`)
  }
  const slug = requiredString(a, 'source_slug', TOOL)
  const localId = requiredString(a, 'local_id', TOOL)
  const reason = requiredString(a, 'reason', TOOL)
  if (reason.trim() === '') throw new Error(`${TOOL}: reason must be a non-empty string (it is recorded on the task timeline for audit)`)
  return { source: { kind, slug }, localId, reason }
}

// ─────────────────────────── 结果与渲染（paused + 失败 DTO） ───────────────────────────

export type PauseTaskResult =
  | { readonly kind: 'paused'; readonly source: ContainerRef; readonly taskKey: string }

const PAUSE_TASK_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['paused'] },
    source: {
      type: 'object',
      additionalProperties: false,
      properties: { kind: { type: 'string', enum: ['feature', 'proposal'] }, slug: { type: 'string' } },
      required: ['kind', 'slug'],
    },
    taskKey: { type: 'string' },
  },
  required: ['kind', 'source', 'taskKey'],
})

function renderPauseTaskResult(_args: unknown, value: unknown): readonly TextContentBlock[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as PauseTaskResult
  return formatOk(`task ${v.taskKey} paused (${v.source.slug})`, [
    '- the worker was hard-aborted and the task is now suspended (its spec is writable again)',
    '- rewrite the brief/AC/dependencies with updateTask(taskRef, ...) — suspended tasks accept rewrites',
    '- resume with dispatchTask(source_kind, source_slug): re-entry restores the loop and the paused card returns to pending (unrewritten cards rerun per the old brief)',
  ])
}

// ─────────────────────────── tool 定义（判活定位 + localId 预检 + 委托 driver.pause） ───────────────────────────

/** pauseTask 专用 deps（ForgeToolDeps 扩展面——loop 必给，同 stopTaskLoop） */
export type PauseTaskToolDeps = ForgeToolDeps & {
  readonly loop: LoopToolDeps
}

export function createPauseTaskTool(deps: PauseTaskToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Pause the currently in-flight task of a dispatch loop: hard-aborts the worker (partial output discarded), transitions the task to suspended (spec becomes writable again) and suspends the loop so the old brief cannot be re-claimed. Args: source_kind + source_slug (container), local_id (the in-flight task — must match what the loop is running), reason (required; recorded on the task timeline). Scope: a RUNNING loop may only be paused by its owner session; a SUSPENDED loop may be paused/taken over by ANY session. After pausing: rewrite the suspended task with updateTask, then resume with dispatchTask re-entry (the paused card returns to pending and is re-dispatched). With no active loop or no in-flight task the call is rejected with guidance.',
    parameters: {
      type: 'object',
      properties: {
        source_kind: {
          type: 'string',
          description: "Container kind — 'feature' | 'proposal'. Required.",
        },
        source_slug: {
          type: 'string',
          description: 'Container slug (feature directory name or proposal slug). Required.',
        },
        local_id: {
          type: 'string',
          description: 'Local id of the task to pause — must be the loop\'s current in-flight task. Required.',
        },
        reason: {
          type: 'string',
          description: 'Why the task is being paused (recorded on the task execution timeline for audit). Required.',
        },
      },
      required: ['source_kind', 'source_slug', 'local_id', 'reason'],
    },
    output: { schema: PAUSE_TASK_OUTPUT_SCHEMA, render: renderPauseTaskResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<PauseTaskResult | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      const attribution: { slug?: string } = {}
      return callToolFace(
        async (): Promise<PauseTaskResult> => {
          const parsed = parsePauseTaskArgs(args)
          const sessionId = requireSessionId(session)
          await deps.events?.prepare(session)
          const { driver, registry } = deps.loop
          const record = registry.bySource(parsed.source)
          attribution.slug = record?.source.slug ?? parsed.source.slug
          if (record === undefined) {
            // 无活循环：自解释拒绝（无可暂停对象 + 启动入口）
            pauseRejection(
              `pause rejected: there is no active dispatch loop for ${parsed.source.slug} — with no loop there is nothing to pause`,
              [
                'start a loop first with dispatchTask(source_kind, source_slug) or /run-dag-tasks <slug>, then pause its in-flight task',
                'inspect task states with queryTask/listTasks if unsure where the task lives',
              ],
            )
          }
          const inFlight = record.inFlight
          if (inFlight === undefined || inFlight.taskRef.localId !== parsed.localId) {
            // 无在途任务 / localId 失配：明确指认当前可暂停对象（无可暂停对象错误径）
            const running = inFlight === undefined ? 'nothing is in flight right now' : `the loop is currently running ${inFlight.taskKey}`
            pauseRejection(
              `pause rejected: no in-flight task ${parsed.source.slug}/${parsed.localId} — ${running}`,
              inFlight === undefined
                ? [
                    'the loop is between tasks (claim/backoff) or suspended — check the loop state with queryTask/taskStats and retry when a worker is running',
                    'tasks not yet started can be rewritten in place with updateTask instead of pausing',
                  ]
                : [
                    `pauseTask only targets the CURRENT in-flight task — to pause ${inFlight.taskKey} call pauseTask(source_kind='${parsed.source.kind}', source_slug='${parsed.source.slug}', local_id='${inFlight.taskRef.localId}', reason=...)`,
                    'tasks not in flight cannot be paused: pending/blocked tasks are rewritable with updateTask',
                  ],
            )
          }
          const paused = await driver.pause({ loopId: record.id, requesterSessionId: sessionId, reason: parsed.reason })
          if (!paused.ok) {
            if (paused.code === 'forbidden') {
              // 越权拒绝（运行中非 owner）：driver 层最终裁决——自解释（归属会话 + 接管规则）
              pauseRejection(
                `pause rejected: the dispatch loop for ${parsed.source.slug} is RUNNING and owned by session ${paused.ownerSessionId} — only the owner session may pause a running loop`,
                [
                  'a SUSPENDED loop may be paused/taken over by any session — this one is running; observe it with queryTask/taskStats instead',
                  'have the owner session pause it, or wait for the loop to suspend/settle',
                ],
              )
            }
            if (paused.code === 'reason-required') {
              pauseRejection('pause rejected: a non-empty reason is required (it is recorded on the task timeline for audit)', [
                'retry with a reason describing why the task brief is being superseded',
              ])
            }
            if (paused.code === 'no-in-progress-task') {
              pauseRejection(
                `pause rejected: no in-progress task to pause for ${parsed.source.slug} (suspended loop, nothing in flight) — ${parsed.source.slug}/${parsed.localId} is already suspended or the loop is between tasks`,
                [
                  'if the task is already suspended, rewrite it with updateTask and resume the loop with dispatchTask re-entry',
                  'check the container state with queryTask/taskStats',
                ],
              )
            }
            // no-active-loop：注册判活与 driver 守卫之间的终态竞态
            pauseRejection('pause rejected: the loop already reached a final state (concurrent settle/stop) — no action taken')
          }
          const source: ContainerRef = { kind: record.source.kind, slug: record.source.slug }
          return { kind: 'paused', source, taskKey: paused.taskKey }
        },
        (failure) =>
          emitToolError(deps.events, session.sessionId, attribution.slug ?? slugOfToolArgs(args), TOOL, failure),
      )
    },
  }
}
