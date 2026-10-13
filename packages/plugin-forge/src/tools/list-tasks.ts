// listTasks tool 定义（定位：业务——主 agent 任务域读面扩员，main-agent-task-tools ③）。
// core 服务已有（forge/tasks list.ts listTasks——search 中英双语标签常量匹配 / statusFilter
// 八态 chips / sort active|created|interrupted / source 容器作用域），本壳零 core 改动，
// 四参直透 ListTasksQuery。返回 = TaskCard 轻卡流——渲染层前置投影：每卡前置摘要（core
// TaskPrerequisiteSummary 三字段对象）投影为前置任务 localId 数组（同容器 slug 恒等 +
// localId 即足定位；core TaskCard 形状不动，GUI 无波及）。
// 参照 query-task.ts 薄壳模式：参数执行点防御收窄 / callToolFace 路由（typed 错误 → 失败
// DTO formatErr + tool-error 事件发射）/ formatOk 成功渲染。
import type { ContainerKind, ListTasksQuery, TaskCard, TaskStatus } from '@dsh-forge/contracts'
import { TASK_STATUSES } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalEnum, optionalPair, optionalString, optionalStringArray, requireArgsObject } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

const TOOL = 'listTasks'

const SORTS = ['active', 'created', 'interrupted'] as const

/** agent 面参数（四参全可选——全缺省 = 全库活跃序） */
export interface ListTasksToolArgs {
  readonly search?: string
  readonly statusFilter?: readonly TaskStatus[]
  readonly sort?: (typeof SORTS)[number]
  readonly source_kind?: string
  readonly source_slug?: string
}

/** statusFilter 元素词表收窄（八态词表外即拒——含 tool 可读上下文） */
function optionalStatusArray(a: Record<string, unknown>, key: string, tool: string): TaskStatus[] | undefined {
  const raw = optionalStringArray(a, key, tool)
  if (raw === undefined) return undefined
  return raw.map((e) => {
    if (!(TASK_STATUSES as readonly string[]).includes(e)) {
      throw new Error(`${tool}: ${key} must only contain [${TASK_STATUSES.join(', ')}]`)
    }
    return e as TaskStatus
  })
}

/** 参数防御性收窄 */
export function parseListTasksArgs(args: unknown): ListTasksToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: {
    search?: string
    statusFilter?: TaskStatus[]
    sort?: (typeof SORTS)[number]
    source_kind?: string
    source_slug?: string
  } = {}
  const search = optionalString(a, 'search', TOOL)
  if (search !== undefined) out.search = search
  const statusFilter = optionalStatusArray(a, 'statusFilter', TOOL)
  if (statusFilter !== undefined) out.statusFilter = statusFilter
  const sort = optionalEnum(a, 'sort', SORTS, TOOL)
  if (sort !== undefined) out.sort = sort
  const source = optionalPair(a, 'source_kind', 'source_slug', TOOL)
  if (source !== undefined) {
    out.source_kind = source.first
    out.source_slug = source.second
  }
  return out
}

/**
 * ListTasks 返回体的注册面输出 schema（TaskCard[] 宽松镜像——prerequisites 保持 core
 * 三字段摘要原样；localId 数组投影只落渲染层 + 失败支）。
 */
export const LIST_TASKS_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      description: 'Matching task cards in service order (core TaskCard shape).',
      items: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          slug: { type: 'string' },
          localId: { type: 'string' },
          title: { type: 'string' },
          taskType: { type: 'string' },
          taskStatus: { type: 'string' },
          priority: { type: 'string' },
          estimatedTime: { type: 'string' },
          prerequisites: {
            type: 'array',
            description: 'Prerequisite summaries (natural key + current status).',
            items: {
              type: 'object',
              properties: {
                slug: { type: 'string' },
                localId: { type: 'string' },
                taskStatus: { type: 'string' },
              },
              required: ['slug', 'localId', 'taskStatus'],
            },
          },
          sessionCount: { type: 'number' },
          sourceTask: { type: 'object', description: 'Fix-chain source task ref (absent for non-fix tasks).' },
          source: { type: 'object', description: 'Owning container ref (kind + slug).' },
        },
        required: ['taskId', 'slug', 'localId', 'title', 'taskType', 'taskStatus', 'prerequisites', 'sessionCount'],
      },
    },
  },
  required: ['cards'],
})

/**
 * TaskCard[] → 渲染投影值（工具面形状——前置投影为 localId 数组，不含 slug/taskStatus
 * 对象；schema 校验值即此形，渲染文本同源自投影值）。
 */
export function projectCards(cards: readonly TaskCard[]): { cards: unknown[] } {
  return {
    cards: cards.map((c) => ({
      taskId: c.taskId,
      slug: c.slug,
      localId: c.localId,
      title: c.title,
      taskType: c.taskType,
      taskStatus: c.taskStatus,
      ...(c.priority !== undefined ? { priority: c.priority } : {}),
      ...(c.estimatedTime !== undefined ? { estimatedTime: c.estimatedTime } : {}),
      prerequisites: c.prerequisites.map((p) => p.localId),
      sessionCount: c.sessionCount,
      ...(c.sourceTask !== undefined ? { sourceTask: c.sourceTask } : {}),
      ...(c.source !== undefined ? { source: c.source } : {}),
    })),
  }
}

/** 投影值 → 模型可见文本（formatOk：✓ 首行计数 + 逐卡键值行） */
function renderListResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const { cards } = value as ReturnType<typeof projectCards>
  const entries =
    cards.length === 0
      ? ['(no matching tasks)']
      : cards.map((c) => {
          const card = c as {
            slug: string
            localId: string
            taskStatus: string
            title: string
            priority?: string
            prerequisites: string[]
            sessionCount: number
            sourceTask?: { slug: string; localId: string }
          }
          const bits = [
            `- ${card.slug}/${card.localId} [${card.taskStatus}]${card.priority !== undefined ? ` (${card.priority})` : ''} ${card.title}`,
          ]
          bits.push(
            `  prerequisites: ${card.prerequisites.length === 0 ? '(none)' : card.prerequisites.join(', ')}`,
          )
          bits.push(`  sessions: ${card.sessionCount}`)
          if (card.sourceTask !== undefined) bits.push(`  fix from: ${card.sourceTask.slug}/${card.sourceTask.localId}`)
          return bits.join('\n')
        })
  return formatOk(`${cards.length} task(s) matched`, entries)
}

/** tool 定义工厂 */
export function createListTasksTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'List task cards (lightweight: natural key, title, status, priority, prerequisite local ids, session count, fix-source tag — no task descriptions or acceptance criteria). Filters pass straight through to the core service: search (bilingual zh/en label matching), statusFilter (subset of the eight statuses), sort (active|created|interrupted), and an optional container scope via source_kind + source_slug (given together; omitted = whole project).',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Free-text filter, matched server-side against bilingual (zh/en) label constants.' },
        statusFilter: { type: 'array', items: { type: 'string' }, description: 'Status chips filter (subset of pending/in_progress/completed/blocked/suspended/interrupted/skipped/rejected); empty or omitted = all.' },
        sort: { type: 'string', description: 'active =活跃优先 / created = newest first / interrupted = oldest interruption first.' },
        source_kind: { type: 'string', description: 'Container kind of the scope (feature or proposal); give together with source_slug.' },
        source_slug: { type: 'string', description: 'Container slug of the scope (feature directory name or proposal slug); give together with source_kind.' },
      },
    },
    output: { schema: LIST_TASKS_OUTPUT_SCHEMA, render: renderListResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<unknown | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseListTasksArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const query: ListTasksQuery = {
          projectId,
          ...(parsed.search !== undefined ? { search: parsed.search } : {}),
          ...(parsed.statusFilter !== undefined ? { statusFilter: [...parsed.statusFilter] } : {}),
          ...(parsed.sort !== undefined ? { sort: parsed.sort } : {}),
          ...(parsed.source_kind !== undefined && parsed.source_slug !== undefined
            ? { source: { kind: parsed.source_kind as ContainerKind, slug: parsed.source_slug } }
            : {}),
        }
        const cards = await deps.tasks.listTasks(query)
        return projectCards(cards)
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
