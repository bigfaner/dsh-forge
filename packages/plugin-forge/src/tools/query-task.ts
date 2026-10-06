// queryTask tool 定义（定位：业务——Interface 8 六动词之一）。
// 任务定位 = slug + local_id 两显式参（必填）；include 嵌套负载平铺为四布尔
//（全缺省 = 仅任务快照——轻查；按需开节）。返回 = contracts QueryTaskResult
// 透传（未命中 ERR_TASK_NOT_FOUND——core 侧拒绝面）。
import type { QueryTaskInput, QueryTaskResult, TaskRecordEntry, TaskSnapshot } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalBoolean, requireArgsObject, requiredString } from './args.js'
import { requireProjectId, sessionContextOf } from './session.js'

const TOOL = 'queryTask'

/** agent 面参数（include 平铺四布尔） */
export interface QueryTaskToolArgs {
  readonly slug: string
  readonly local_id: string
  readonly include_prerequisites?: boolean
  readonly include_waiting_on_me?: boolean
  readonly include_records?: boolean
  readonly include_sessions?: boolean
}

/** 参数防御性收窄 */
export function parseQueryTaskArgs(args: unknown): QueryTaskToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: {
    slug: string
    local_id: string
    include_prerequisites?: boolean
    include_waiting_on_me?: boolean
    include_records?: boolean
    include_sessions?: boolean
  } = {
    slug: requiredString(a, 'slug', TOOL),
    local_id: requiredString(a, 'local_id', TOOL),
  }
  for (const [key, field] of [
    ['include_prerequisites', 'include_prerequisites'],
    ['include_waiting_on_me', 'include_waiting_on_me'],
    ['include_records', 'include_records'],
    ['include_sessions', 'include_sessions'],
  ] as const) {
    const v = optionalBoolean(a, key, TOOL)
    if (v !== undefined) out[field] = v
  }
  return out
}

/** QueryTaskResult 的注册面输出 schema（四节按 include 门控——宽松镜像） */
const QUERY_TASK_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    task: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        slug: { type: 'string' },
        localId: { type: 'string' },
        title: { type: 'string' },
        taskType: { type: 'string' },
        taskStatus: { type: 'string' },
        blockedReason: { type: 'string' },
      },
      required: ['taskId', 'slug', 'localId', 'title', 'taskType', 'taskStatus'],
      description: 'Current task snapshot.',
    },
    prerequisites: { type: 'array', items: { type: 'string' }, description: 'slug/localId of each prerequisite (when included).' },
    waitingOnMe: { type: 'array', items: { type: 'string' }, description: 'slug/localId of each successor waiting on this task (when included).' },
    records: { type: 'array', items: { type: 'string' }, description: 'Execution timeline entries (when included).' },
    sessions: { type: 'array', items: { type: 'string' }, description: 'Attached sessions, link/record typed (when included).' },
  },
  required: ['task'],
} as const

/** 快照行（claim render 同形——自然键呈现） */
function snapshotSummary(t: TaskSnapshot): string[] {
  const lines = [
    `${t.slug}/${t.localId} [${t.taskStatus}] ${t.title}`,
    `- type: ${t.taskType}${t.priority !== undefined ? `, priority ${t.priority}` : ''}, complexity ${t.complexity}`,
  ]
  if (t.blockedReason !== undefined) lines.push(`- blocked: ${t.blockedReason}`)
  if (t.taskDesc !== undefined) lines.push(`- desc: ${t.taskDesc}`)
  return lines
}

/** record 时间线行 */
function recordLine(r: TaskRecordEntry): string {
  const transition = r.fromStatus !== undefined || r.toStatus !== undefined ? ` ${r.fromStatus ?? ''}→${r.toStatus ?? ''}` : ''
  const detail =
    r.reason !== undefined
      ? ` — ${r.reason}`
      : r.summary !== undefined
        ? ` — ${r.summary}`
        : r.digest !== undefined
          ? ` — digest ${r.digest}`
          : ''
  return `  - ${r.verb}${transition} (${r.actor}${r.sessionId !== undefined ? `, session ${r.sessionId}` : ''})${detail}`
}

/** QueryTaskResult → 模型可见文本（四节按在场投影） */
function renderQueryResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  const v = value as QueryTaskResult
  const lines = [...snapshotSummary(v.task)]
  if (v.prerequisites !== undefined) {
    lines.push(
      v.prerequisites.length === 0
        ? 'prerequisites: (none)'
        : `prerequisites: ${v.prerequisites.map((p) => `${p.slug}/${p.localId} [${p.taskStatus}]`).join(', ')}`,
    )
  }
  if (v.waitingOnMe !== undefined) {
    lines.push(
      v.waitingOnMe.length === 0
        ? 'waiting on me: (none)'
        : `waiting on me: ${v.waitingOnMe.map((p) => `${p.slug}/${p.localId} [${p.taskStatus}]`).join(', ')}`,
    )
  }
  if (v.records !== undefined) {
    lines.push(`records (${v.records.length}):`)
    lines.push(...v.records.map(recordLine))
  }
  if (v.sessions !== undefined) {
    lines.push(
      v.sessions.length === 0
        ? 'sessions: (none)'
        : `sessions: ${v.sessions.map((s) => `${s.sessionId} (${s.source})`).join(', ')}`,
    )
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

/** tool 定义工厂 */
export function createQueryTaskTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Query one task by its slug + local_id: current status, plus optional sections (prerequisites, tasks waiting on it, execution records, attached sessions). Use it to check readiness or diagnose blockers before claiming or submitting.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Feature slug of the task.' },
        local_id: { type: 'string', description: 'Local id of the task.' },
        include_prerequisites: { type: 'boolean', description: 'Also return prerequisite tasks with their statuses.' },
        include_waiting_on_me: { type: 'boolean', description: 'Also return successor tasks waiting on this one.' },
        include_records: { type: 'boolean', description: 'Also return the execution timeline (verb/actor/reason/gate).' },
        include_sessions: { type: 'boolean', description: 'Also return attached sessions (dispatch vs execution).' },
      },
      required: ['slug', 'local_id'],
    },
    output: { schema: QUERY_TASK_OUTPUT_SCHEMA, render: renderQueryResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<QueryTaskResult> {
      const parsed = parseQueryTaskArgs(args)
      const session = sessionContextOf(exec)
      const projectId = requireProjectId(deps.resolveProjectId, session)
      const include =
        parsed.include_prerequisites === true ||
        parsed.include_waiting_on_me === true ||
        parsed.include_records === true ||
        parsed.include_sessions === true
          ? {
              ...(parsed.include_prerequisites === true ? { prerequisites: true } : {}),
              ...(parsed.include_waiting_on_me === true ? { waitingOnMe: true } : {}),
              ...(parsed.include_records === true ? { records: true } : {}),
              ...(parsed.include_sessions === true ? { sessions: true } : {}),
            }
          : undefined
      const input: QueryTaskInput = {
        projectId,
        taskRef: { slug: parsed.slug, localId: parsed.local_id },
        ...(include !== undefined ? { include } : {}),
      }
      return deps.tasks.queryTask(input)
    },
  }
}
