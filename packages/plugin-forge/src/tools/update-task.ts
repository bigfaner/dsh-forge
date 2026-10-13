// updateTask tool 定义（定位：业务——main-agent-task-tools 1.3 tool 壳，名 = 动词透传；
// 消费 1.1 core updateTask 动词）。任务定位同 submitTask/queryTask 口径：slug + local_id
// 两显式参（必填）；宽字段全部可选（partial 语义——给定的字段改写、未给字段不动）：
// title/type/priority/estimated_time/complexity/task_desc/acceptance_criteria（ac_json 整体
// 覆写）/vars（KEY=VALUE 条目数组 → vars_json 整体覆写）/surface_key/surface_type/
// depends_on（manual 边整体置换——core 侧增量环校验 + 派生边护栏）。projectId 由 exec ctx
// cwd 解析（session.ts）。返回 = 更新后任务快照（UpdateTaskResult = TaskSnapshot）。
// tool 面零业务逻辑（Hard Rule）：参数映射 + 路由到 core 动词（单一写入门）。
// 返回面双友好（裁决⑨）：成功 formatOk（✓ 首行 + 快照键值行——更新字段可见）；typed
// 服务错误（状态门 ERR_TASK_LOCKED / 环 ERR_CYCLE_DETECTED / 边护栏
// ERR_TASK_EDGE_ORIGIN_LOCKED）→ 失败 DTO formatErr + tool-error 事件
//（emitToolError，verb=updateTask；deps.events 缺席 = 零事件降级）。
import {
  TASK_TYPES,
  type TaskComplexity,
  type TaskPriority,
  type TaskSnapshot,
  type TaskType,
  type UpdateTaskInput,
  type UpdateTaskResult,
} from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalEnum, optionalString, optionalStringArray, requireArgsObject, requiredString } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'
import { varsEntriesToRecord } from './add-task.js'

const TOOL = 'updateTask'

/** tasks.priority CHECK 三值（contracts TaskPriority 词表——schema 面无 enum，执行点收窄） */
const PRIORITIES: readonly TaskPriority[] = ['P0', 'P1', 'P2']

/** tasks.complexity CHECK 三值（contracts TaskComplexity 词表） */
const COMPLEXITIES: readonly TaskComplexity[] = ['low', 'medium', 'high']

/** agent 面参数（映射 UpdateTaskInput 去 projectId/taskRef——vars = KEY=VALUE 条目数组） */
export interface UpdateTaskToolArgs {
  /** 容器 slug（feature 目录名 / proposal slug——任务自然键第一段） */
  readonly slug: string
  readonly local_id: string
  readonly title?: string
  /** 20 值词表（contracts TASK_TYPES） */
  readonly type?: TaskType
  readonly priority?: TaskPriority
  readonly estimated_time?: string
  readonly complexity?: TaskComplexity
  readonly task_desc?: string
  /** 验收清单（→ ac_json 整体覆写——submitTask AC 证据门判据随之更新） */
  readonly acceptance_criteria?: readonly string[]
  /** KEY=VALUE 条目数组（→ vars_json 整体覆写；重复键/畸形条目拒） */
  readonly vars?: readonly string[]
  readonly surface_key?: string
  readonly surface_type?: string
  /** 依赖改写（manual 边整体置换：删旧 → 增量环校验 → 插新；派生边拒） */
  readonly depends_on?: readonly string[]
}

/** 参数防御性收窄（执行点自证，addTask 形制） */
export function parseUpdateTaskArgs(args: unknown): UpdateTaskToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: {
    slug: string
    local_id: string
    title?: string
    type?: TaskType
    priority?: TaskPriority
    estimated_time?: string
    complexity?: TaskComplexity
    task_desc?: string
    acceptance_criteria?: string[]
    vars?: string[]
    surface_key?: string
    surface_type?: string
    depends_on?: string[]
  } = {
    slug: requiredString(a, 'slug', TOOL),
    local_id: requiredString(a, 'local_id', TOOL),
  }
  for (const key of ['title', 'task_desc', 'estimated_time', 'surface_key', 'surface_type'] as const) {
    const v = optionalString(a, key, TOOL)
    if (v !== undefined) out[key] = v
  }
  const type = optionalEnum(a, 'type', TASK_TYPES, TOOL)
  if (type !== undefined) out.type = type
  const priority = optionalEnum(a, 'priority', PRIORITIES, TOOL)
  if (priority !== undefined) out.priority = priority
  const complexity = optionalEnum(a, 'complexity', COMPLEXITIES, TOOL)
  if (complexity !== undefined) out.complexity = complexity
  for (const key of ['acceptance_criteria', 'vars', 'depends_on'] as const) {
    const v = optionalStringArray(a, key, TOOL)
    if (v !== undefined) out[key] = v
  }
  if (out.vars !== undefined) varsEntriesToRecord(out.vars) // 形状先证（重复键/畸形条目在此拒）
  return out
}

/** UpdateTaskResult（= TaskSnapshot）的注册面输出 schema（宽松镜像 + 失败支） */
export const UPDATE_TASK_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    taskId: { type: 'string', description: 'uuid proxy key (stable FK/RPC anchor).' },
    slug: { type: 'string', description: 'Container slug of the task (natural key part 1).' },
    localId: { type: 'string', description: 'Local id (natural key part 2).' },
    source: { type: 'object', description: 'Owning container ref {kind, slug}.' },
    title: { type: 'string' },
    taskType: { type: 'string' },
    taskStatus: { type: 'string' },
    taskDesc: { type: 'string' },
    priority: { type: 'string' },
    estimatedTime: { type: 'string' },
    vars: { type: 'object', description: 'Injection variables (vars_json decoded).' },
    sourceTaskId: { type: 'string' },
    blockedReason: { type: 'string' },
    mode: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    breaking: { type: 'boolean' },
    coverage: { type: 'number' },
    complexity: { type: 'string' },
    surfaceKey: { type: 'string' },
    surfaceType: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string', description: 'Last write timestamp (bumped by this update).' },
  },
  required: ['taskId', 'slug', 'localId', 'source', 'title', 'taskType', 'taskStatus', 'breaking', 'complexity', 'createdAt', 'updatedAt'],
})

/** UpdateTaskResult → 模型可见文本（formatOk：✓ 首行 + 快照键值行——更新字段可见） */
function renderUpdateResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as TaskSnapshot
  const entries = [
    `- taskId: ${v.taskId}`,
    `- type: ${v.taskType}${v.priority !== undefined ? `, priority ${v.priority}` : ''}, complexity ${v.complexity}`,
  ]
  if (v.estimatedTime !== undefined) entries.push(`- estimatedTime: ${v.estimatedTime}`)
  if (v.taskDesc !== undefined) entries.push(`- desc: ${v.taskDesc}`)
  if (v.acceptanceCriteria !== undefined) entries.push(`- acceptanceCriteria: ${v.acceptanceCriteria.length} items`)
  if (v.vars !== undefined) entries.push(`- vars: ${Object.keys(v.vars).length} entries`)
  if (v.surfaceKey !== undefined || v.surfaceType !== undefined) {
    entries.push(`- surface: ${v.surfaceKey ?? '-'} (${v.surfaceType ?? '-'})`)
  }
  entries.push(`- updatedAt: ${v.updatedAt}`)
  return formatOk(`Task ${v.slug}/${v.localId} updated — [${v.taskStatus}] ${v.title}`, entries)
}

/** tool 定义工厂（deps 注入服务与解析器——纯函数体，无插件级状态） */
export function createUpdateTaskTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Update an existing task (located by its container slug + local_id): wide-field partial semantics — given fields are rewritten, absent fields stay untouched. Rewritable: title, type, priority, estimated_time, complexity, task_desc, acceptance_criteria (ac_json overwritten as a whole), vars (KEY=VALUE entries, vars_json overwritten as a whole), surface_key/surface_type, depends_on (manual edges replaced as a whole; cycle-checked incrementally; fix-chain/autoconfig derived edges are rejected). Blocked by status gates (locked statuses reject) — read the updated task snapshot back.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Container slug of the task being updated (feature directory name or proposal slug).' },
        local_id: { type: 'string', description: 'Local id of the task being updated.' },
        title: { type: 'string', description: 'New short title.' },
        type: { type: 'string', description: `New task type, one of: ${TASK_TYPES.join(', ')}.` },
        priority: { type: 'string', description: 'New priority, one of: P0, P1, P2.' },
        estimated_time: { type: 'string', description: "Rough estimate such as '1-2h'." },
        complexity: { type: 'string', description: 'One of: low, medium, high.' },
        task_desc: { type: 'string', description: 'New content payload (hard rules, reference list, free text).' },
        acceptance_criteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replacement acceptance criteria checklist (overwrites ac_json as a whole).',
        },
        vars: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replacement injection variables as KEY=VALUE entries (overwrites vars_json as a whole; duplicate keys rejected).',
        },
        surface_key: { type: 'string', description: 'Surface key the task targets.' },
        surface_type: { type: 'string', description: 'Surface type the task targets (web/api/cli/tui/mobile).' },
        depends_on: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replacement depends_on as local ids of prerequisite tasks in the same container (manual edges only; cycles rejected).',
        },
      },
      required: ['slug', 'local_id'],
    },
    output: { schema: UPDATE_TASK_OUTPUT_SCHEMA, render: renderUpdateResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<UpdateTaskResult | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseUpdateTaskArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const input: UpdateTaskInput = {
          projectId,
          taskRef: { slug: parsed.slug, localId: parsed.local_id },
          ...(parsed.title !== undefined ? { title: parsed.title } : {}),
          ...(parsed.type !== undefined ? { type: parsed.type } : {}),
          ...(parsed.priority !== undefined ? { priority: parsed.priority } : {}),
          ...(parsed.estimated_time !== undefined ? { estimatedTime: parsed.estimated_time } : {}),
          ...(parsed.complexity !== undefined ? { complexity: parsed.complexity } : {}),
          ...(parsed.task_desc !== undefined ? { taskDesc: parsed.task_desc } : {}),
          ...(parsed.acceptance_criteria !== undefined ? { acceptanceCriteria: [...parsed.acceptance_criteria] } : {}),
          ...(parsed.vars !== undefined ? { vars: varsEntriesToRecord(parsed.vars) } : {}),
          ...(parsed.surface_key !== undefined ? { surfaceKey: parsed.surface_key } : {}),
          ...(parsed.surface_type !== undefined ? { surfaceType: parsed.surface_type } : {}),
          ...(parsed.depends_on !== undefined ? { dependsOn: [...parsed.depends_on] } : {}),
        }
        return deps.tasks.updateTask(input)
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
