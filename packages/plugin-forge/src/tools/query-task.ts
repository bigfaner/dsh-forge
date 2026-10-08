// queryTask tool 定义（定位：业务——M3 终态六动词之一）。
// 任务定位 = slug + local_id 两显式参（必填；slug = 容器 slug——feature 目录名 /
// proposal slug，M3 容器化口径）；include 嵌套负载平铺为四布尔（全缺省 = 仅任务
// 快照——轻查；按需开节）。返回 = contracts QueryTaskResult 透传（含 container
// 容器水化——诊断消息数据源，render 键值行投影；未命中 ERR_TASK_NOT_FOUND 走
// 失败面 formatErr）。
// 返回面双友好（裁决⑨）：成功 formatOk；typed 服务错误 → 失败 DTO formatErr。
import type { QueryTaskInput, QueryTaskResult, TaskContainerSummary, TaskRecordEntry, TaskSnapshot } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalBoolean, requireArgsObject, requiredString } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

const TOOL = 'queryTask'

/** agent 面参数（include 平铺四布尔） */
export interface QueryTaskToolArgs {
  /** 容器 slug（feature 目录名 / proposal slug——任务自然键第一段） */
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

/** TaskPrerequisiteSummary 的 schema 面（prerequisites/waitingOnMe 两节共用——contracts 镜像） */
const PREREQUISITE_SUMMARY_ITEM = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    localId: { type: 'string' },
    taskStatus: { type: 'string' },
  },
  required: ['slug', 'localId', 'taskStatus'],
} as const

/** TaskRecordEntry 的 schema 面（records 节——contracts 镜像：可选字段键缺席式） */
const RECORD_ENTRY_ITEM = {
  type: 'object',
  properties: {
    verb: { type: 'string' },
    fromStatus: { type: 'string' },
    toStatus: { type: 'string' },
    reason: { type: 'string' },
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    gate: { type: 'object', description: 'TaskGateReport (four booleans + optional coverage).' },
    commitHash: { type: 'string' },
    digest: { type: 'string' },
    actor: { type: 'string' },
    sessionId: { type: 'string' },
    createdAt: { type: 'string' },
  },
  required: ['verb', 'actor', 'createdAt'],
} as const

/** SessionTaskLinkCard 的 schema 面（sessions 节——contracts 镜像） */
const SESSION_LINK_ITEM = {
  type: 'object',
  properties: {
    taskId: { type: 'string' },
    slug: { type: 'string' },
    localId: { type: 'string' },
    title: { type: 'string' },
    taskStatus: { type: 'string' },
    sessionId: { type: 'string' },
    source: { type: 'string', description: 'link (dispatch session) or record (execution session).' },
  },
  required: ['taskId', 'slug', 'localId', 'title', 'taskStatus', 'sessionId', 'source'],
} as const

/**
 * QueryTaskResult 的注册面输出 schema（四节按 include 门控——宽松镜像 + 失败支）。
 * 四节 items = 对象 DTO 镜像（TaskPrerequisiteSummary/TaskRecordEntry/SessionTaskLinkCard
 * ——提案 tool-row-lossless-json-fix：原 items:{type:'string'} 与实际对象数组不符，include
 * 开启的调用 100% 炸 oneOf 校验；对象层不收紧 additionalProperties——宽容投影）。
 */
export const QUERY_TASK_OUTPUT_SCHEMA = withFailureVariant({
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
        mode: { type: 'string' },
      },
      required: ['taskId', 'slug', 'localId', 'title', 'taskType', 'taskStatus'],
      description: 'Current task snapshot.',
    },
    container: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        slug: { type: 'string' },
        title: { type: 'string' },
        summary: { type: 'string' },
        mode: { type: 'string' },
        phase: { type: 'string' },
      },
      required: ['kind', 'slug', 'title'],
      description: 'Owning container hydration (feature or proposal).',
    },
    prerequisites: { type: 'array', items: PREREQUISITE_SUMMARY_ITEM, description: 'Prerequisite task summaries (when included).' },
    waitingOnMe: { type: 'array', items: PREREQUISITE_SUMMARY_ITEM, description: 'Successor task summaries waiting on this one (when included).' },
    records: { type: 'array', items: RECORD_ENTRY_ITEM, description: 'Execution timeline entries (when included).' },
    sessions: { type: 'array', items: SESSION_LINK_ITEM, description: 'Attached sessions, link/record typed (when included).' },
  },
  required: ['task', 'container'],
})

/** 快照键值行（type/priority/complexity + 模式快照 + blocked/desc） */
function snapshotEntries(t: TaskSnapshot): string[] {
  const entries = [
    `- type: ${t.taskType}${t.priority !== undefined ? `, priority ${t.priority}` : ''}, complexity ${t.complexity}`,
  ]
  if (t.mode !== undefined) entries.push(`- mode: ${t.mode} (creation-time snapshot)`)
  if (t.blockedReason !== undefined) entries.push(`- blocked: ${t.blockedReason}`)
  if (t.taskDesc !== undefined) entries.push(`- desc: ${t.taskDesc}`)
  return entries
}

/** 容器水化键值行（kind/slug 判别 + 相位仅 feature 容器） */
function containerLine(c: TaskContainerSummary): string {
  const phase = c.phase !== undefined ? ` (phase ${c.phase})` : ''
  const mode = c.mode !== undefined ? ` [${c.mode}]` : ''
  return `- container: ${c.kind} ${c.slug}${phase}${mode} — ${c.title}`
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

/** QueryTaskResult → 模型可见文本（formatOk：✓ 首行 + 键值行；四节按在场投影） */
function renderQueryResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as QueryTaskResult
  const t = v.task
  const entries = [...snapshotEntries(t), containerLine(v.container)]
  if (v.prerequisites !== undefined) {
    entries.push(
      v.prerequisites.length === 0
        ? 'prerequisites: (none)'
        : `prerequisites: ${v.prerequisites.map((p) => `${p.slug}/${p.localId} [${p.taskStatus}]`).join(', ')}`,
    )
  }
  if (v.waitingOnMe !== undefined) {
    entries.push(
      v.waitingOnMe.length === 0
        ? 'waiting on me: (none)'
        : `waiting on me: ${v.waitingOnMe.map((p) => `${p.slug}/${p.localId} [${p.taskStatus}]`).join(', ')}`,
    )
  }
  if (v.records !== undefined) {
    entries.push(`records (${v.records.length}):`)
    entries.push(...v.records.map(recordLine))
  }
  if (v.sessions !== undefined) {
    entries.push(
      v.sessions.length === 0
        ? 'sessions: (none)'
        : `sessions: ${v.sessions.map((s) => `${s.sessionId} (${s.source})`).join(', ')}`,
    )
  }
  return formatOk(`${t.slug}/${t.localId} [${t.taskStatus}] ${t.title}`, entries)
}

/** tool 定义工厂 */
export function createQueryTaskTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Query one task by its container slug + local_id: current status, owning container (feature or proposal, with phase and mode), plus optional sections (prerequisites, tasks waiting on it, execution records, attached sessions). Use it to check readiness or diagnose blockers before submitting or spawning fix tasks.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Container slug of the task (feature directory name or proposal slug).' },
        local_id: { type: 'string', description: 'Local id of the task.' },
        include_prerequisites: { type: 'boolean', description: 'Also return prerequisite tasks with their statuses.' },
        include_waiting_on_me: { type: 'boolean', description: 'Also return successor tasks waiting on this one.' },
        include_records: { type: 'boolean', description: 'Also return the execution timeline (verb/actor/reason/gate).' },
        include_sessions: { type: 'boolean', description: 'Also return attached sessions (dispatch vs execution).' },
      },
      required: ['slug', 'local_id'],
    },
    output: { schema: QUERY_TASK_OUTPUT_SCHEMA, render: renderQueryResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<QueryTaskResult | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseQueryTaskArgs(args)
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
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
