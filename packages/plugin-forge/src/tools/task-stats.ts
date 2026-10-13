// taskStats tool 定义（定位：业务——主 agent 任务域读面扩员，main-agent-task-tools ②）。
// core 服务已有（forge/tasks list.ts taskStats——GUI chips 同源同口径），本壳零 core 改动，
// 直透：source 可选作用域（source_kind/source_slug 成对——optionalPair 禁半对，同 addTask
// 口径；缺省 = 全库）→ TaskStatsQuery。返回 = total + 八态分布 + unmetPending。
// 参照 query-task.ts 薄壳模式：参数执行点防御收窄 / callToolFace 路由（typed 错误 → 失败
// DTO formatErr + tool-error 事件发射）/ formatOk 成功渲染。
import type { ContainerKind, TaskStats, TaskStatsQuery } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalPair, requireArgsObject } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

const TOOL = 'taskStats'

/** agent 面参数（source 成对可选） */
export interface TaskStatsToolArgs {
  /** 任务源容器 kind（与 source_slug 成对给；缺省 = 全库） */
  readonly source_kind?: string
  readonly source_slug?: string
}

/** 参数防御性收窄 */
export function parseTaskStatsArgs(args: unknown): TaskStatsToolArgs {
  const a = requireArgsObject(args, TOOL)
  const source = optionalPair(a, 'source_kind', 'source_slug', TOOL)
  return source === undefined ? {} : { source_kind: source.first, source_slug: source.second }
}

/** TaskStats 的注册面输出 schema（宽松镜像 + 失败支） */
export const TASK_STATS_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    total: { type: 'number', description: 'Total task count under the scope (whole pool when no source given).' },
    byStatus: {
      type: 'object',
      additionalProperties: { type: 'number' },
      description: 'Per-status distribution across the eight task statuses (zero counts included).',
    },
    unmetPending: {
      type: 'number',
      description: 'Pending tasks whose prerequisites are not all completed/skipped.',
    },
  },
  required: ['total', 'byStatus', 'unmetPending'],
})

/** TaskStats → 模型可见文本（formatOk：✓ 首行 + total/八态/unmetPending 键值行） */
function renderStatsResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as TaskStats
  const byStatus = Object.entries(v.byStatus)
    .map(([status, count]) => `${status} ${count}`)
    .join(', ')
  return formatOk(`${v.total} task(s) in scope`, [`- total: ${v.total}`, `- byStatus: ${byStatus}`, `- unmetPending: ${v.unmetPending}`])
}

/** tool 定义工厂 */
export function createTaskStatsTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Read task-pool statistics: total count, distribution across the eight task statuses, and unmetPending (pending tasks whose prerequisites are not yet completed/skipped). Optionally scope to one container via source_kind + source_slug (given together); omitted = whole project. Same data source as the GUI status chips.',
    parameters: {
      type: 'object',
      properties: {
        source_kind: { type: 'string', description: 'Container kind of the scope (feature or proposal); give together with source_slug.' },
        source_slug: { type: 'string', description: 'Container slug of the scope (feature directory name or proposal slug); give together with source_kind.' },
      },
    },
    output: { schema: TASK_STATS_OUTPUT_SCHEMA, render: renderStatsResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<TaskStats | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseTaskStatsArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const input: TaskStatsQuery = {
          projectId,
          ...(parsed.source_kind !== undefined && parsed.source_slug !== undefined
            ? { source: { kind: parsed.source_kind as ContainerKind, slug: parsed.source_slug } }
            : {}),
        }
        return deps.tasks.taskStats(input)
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
