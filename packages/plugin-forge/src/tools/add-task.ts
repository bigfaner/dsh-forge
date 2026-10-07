// addTask tool 定义（定位：业务——Interface 8 六动词之一，名 = 动词透传）。
// 参数 snake_case（Interface 8）；任务定位 = slug + local_id 两显式参口径延伸到
// fix 链源（source_slug + source_local_id 成对显式）；嵌套负载平铺：
//   vars = ['KEY=VALUE'] 条目数组（老 forge `--var KEY=VALUE` 形制平移）。
// projectId 由 exec ctx cwd 解析（session.ts——cwd 缺席/未命中 =
// ERR_WORKSPACE_NOT_REGISTERED）；返回 = contracts AddTaskResult 透传。
// tool 面零业务逻辑（Hard Rule）：参数映射 + 路由到 core 动词（单一写入门）。
import {
  TASK_TYPES,
  type AddTaskInput,
  type AddTaskResult,
  type TaskComplexity,
  type TaskPriority,
  type TaskType,
} from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import {
  optionalBoolean,
  optionalEnum,
  optionalFraction,
  optionalPair,
  optionalString,
  optionalStringArray,
  requireArgsObject,
  requiredEnum,
  requiredString,
} from './args.js'
import { requireProjectId, sessionContextOf } from './session.js'

const TOOL = 'addTask'

/** tasks.priority CHECK 三值（contracts TaskPriority 词表——schema 面无 enum，执行点收窄） */
const PRIORITIES: readonly TaskPriority[] = ['P0', 'P1', 'P2']

/** tasks.complexity CHECK 三值（contracts TaskComplexity 词表） */
const COMPLEXITIES: readonly TaskComplexity[] = ['low', 'medium', 'high']

/** agent 面参数（映射 AddTaskInput 去 projectId——vars = KEY=VALUE 条目数组） */
export interface AddTaskToolArgs {
  readonly feature_slug: string
  readonly title: string
  /** 20 值词表（contracts TASK_TYPES） */
  readonly type: TaskType
  readonly task_desc?: string
  readonly priority?: TaskPriority
  readonly estimated_time?: string
  /** KEY=VALUE 条目数组（老 forge --var 形制；重复键拒——显式消歧） */
  readonly vars?: readonly string[]
  /** 依赖的自然键 localId 清单（同 feature 前置声明） */
  readonly depends_on?: readonly string[]
  /** fix/disc 链源（TaskRef 两显式参——与 feature_slug 同 slug；成对给） */
  readonly source_slug?: string
  readonly source_local_id?: string
  /** true = 源任务同事务置 blocked（fix 链协议——block_source 蕴含源对在场） */
  readonly block_source?: boolean
  readonly breaking?: boolean
  /** 覆盖率阈值小数（0–1） */
  readonly coverage?: number
  readonly complexity?: TaskComplexity
  readonly surface_key?: string
  readonly surface_type?: string
}

/** KEY=VALUE 条目数组 → Record（重复键/畸形条目拒——防御收窄） */
export function varsEntriesToRecord(entries: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of entries) {
    const eq = entry.indexOf('=')
    if (eq <= 0) throw new Error(`${TOOL}: vars entries must look like KEY=VALUE (got: ${JSON.stringify(entry)})`)
    const key = entry.slice(0, eq)
    if (key in out) throw new Error(`${TOOL}: duplicate vars key ${JSON.stringify(key)}`)
    out[key] = entry.slice(eq + 1)
  }
  return out
}

/** 参数防御性收窄（执行点自证，knowledge 形制） */
export function parseAddTaskArgs(args: unknown): AddTaskToolArgs {
  const a = requireArgsObject(args, TOOL)
  const source = optionalPair(a, 'source_slug', 'source_local_id', TOOL)
  const blockSource = optionalBoolean(a, 'block_source', TOOL)
  if (blockSource === true && source === undefined) {
    throw new Error(`${TOOL}: block_source requires source_slug and source_local_id (fix-chain data face)`)
  }
  const out: {
    feature_slug: string
    title: string
    type: TaskType
    task_desc?: string
    priority?: TaskPriority
    estimated_time?: string
    vars?: string[]
    depends_on?: string[]
    source_slug?: string
    source_local_id?: string
    block_source?: boolean
    breaking?: boolean
    coverage?: number
    complexity?: TaskComplexity
    surface_key?: string
    surface_type?: string
  } = {
    feature_slug: requiredString(a, 'feature_slug', TOOL),
    title: requiredString(a, 'title', TOOL),
    type: requiredEnum(a, 'type', TASK_TYPES, TOOL),
  }
  const set = <K extends 'task_desc' | 'estimated_time' | 'surface_key' | 'surface_type'>(
    key: K,
    value: string | undefined,
  ): void => {
    if (value !== undefined) out[key] = value
  }
  set('task_desc', optionalString(a, 'task_desc', TOOL))
  set('estimated_time', optionalString(a, 'estimated_time', TOOL))
  set('surface_key', optionalString(a, 'surface_key', TOOL))
  set('surface_type', optionalString(a, 'surface_type', TOOL))
  const priority = optionalEnum(a, 'priority', PRIORITIES, TOOL)
  if (priority !== undefined) out.priority = priority
  const complexity = optionalEnum(a, 'complexity', COMPLEXITIES, TOOL)
  if (complexity !== undefined) out.complexity = complexity
  const vars = optionalStringArray(a, 'vars', TOOL)
  if (vars !== undefined) {
    varsEntriesToRecord(vars) // 形状先证（重复键/畸形条目在此拒）
    out.vars = vars
  }
  const dependsOn = optionalStringArray(a, 'depends_on', TOOL)
  if (dependsOn !== undefined) out.depends_on = dependsOn
  if (source !== undefined) {
    out.source_slug = source.first
    out.source_local_id = source.second
  }
  if (blockSource !== undefined) out.block_source = blockSource
  const breaking = optionalBoolean(a, 'breaking', TOOL)
  if (breaking !== undefined) out.breaking = breaking
  const coverage = optionalFraction(a, 'coverage', TOOL)
  if (coverage !== undefined) out.coverage = coverage
  return out
}

/** AddTaskResult 的注册面输出 schema（contracts DTO 字段镜像） */
const ADD_TASK_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    taskId: { type: 'string', description: 'uuid proxy key (stable FK/RPC anchor)' },
    slug: { type: 'string', description: 'feature slug of the task (natural key part 1)' },
    localId: { type: 'string', description: 'per-feature local key (natural key part 2; fix-N/disc-N for chained tasks)' },
    reused: { type: 'boolean', description: 'true = dedup hit on an existing fix task (no new row)' },
  },
  required: ['taskId', 'slug', 'localId', 'reused'],
} as const

/** AddTaskResult → 模型可见文本 */
function renderAddTaskResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  const v = value as AddTaskResult
  const head = v.reused
    ? `Task ${v.slug}/${v.localId} already existed (fix dedup) — reused taskId ${v.taskId}`
    : `Task ${v.slug}/${v.localId} added (taskId ${v.taskId})`
  return [{ type: 'text', text: head }]
}

/** tool 定义工厂（deps 注入服务与解析器——纯函数体，无插件级状态） */
export function createAddTaskTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Add a task to a feature in the forge pipeline state layer. Use source_slug + source_local_id (with block_source) to spawn a fix task that pauses its blocked source until the fix completes; depends_on lists local ids of prerequisites within the same feature. Prefer claiming existing ready tasks before adding new ones.',
    parameters: {
      type: 'object',
      properties: {
        feature_slug: {
          type: 'string',
          description: 'Feature slug that owns the task (= the feature directory name; must be registered).',
        },
        title: { type: 'string', description: 'Short task title.' },
        type: {
          type: 'string',
          description: `Task type, one of: ${TASK_TYPES.join(', ')}.`,
        },
        task_desc: { type: 'string', description: 'Content payload (hard rules, reference list, free text).' },
        priority: { type: 'string', description: 'Priority, one of: P0, P1, P2.' },
        estimated_time: { type: 'string', description: "Rough estimate such as '1-2h'." },
        vars: {
          type: 'array',
          items: { type: 'string' },
          description: 'Injection variables as KEY=VALUE entries (duplicate keys are rejected).',
        },
        depends_on: {
          type: 'array',
          items: { type: 'string' },
          description: 'Local ids of prerequisite tasks in the same feature.',
        },
        source_slug: { type: 'string', description: 'Slug of the chain source task (pair with source_local_id).' },
        source_local_id: { type: 'string', description: 'Local id of the chain source task (pair with source_slug).' },
        block_source: {
          type: 'boolean',
          description: 'true = block the source task in the same transaction until this fix completes (fix chain).',
        },
        breaking: { type: 'boolean', description: 'Breaking-change flag (default false).' },
        coverage: { type: 'number', description: 'Coverage threshold as a 0-1 fraction (omit for global default).' },
        complexity: { type: 'string', description: 'One of: low, medium, high.' },
        surface_key: { type: 'string', description: 'Surface key the task targets.' },
        surface_type: { type: 'string', description: 'Surface type the task targets (web/api/cli/tui/mobile).' },
      },
      required: ['feature_slug', 'title', 'type'],
    },
    output: { schema: ADD_TASK_OUTPUT_SCHEMA, render: renderAddTaskResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<AddTaskResult> {
      const parsed = parseAddTaskArgs(args)
      const session = sessionContextOf(exec)
      const projectId = requireProjectId(deps.resolveProjectId, session)
      const input: AddTaskInput = {
        projectId,
        // M3 容器化垫片（3.5 工具面适配前）：feature_slug 参数 → feature 容器引用（M2 语义等价）
        source: { kind: 'feature', slug: parsed.feature_slug },
        title: parsed.title,
        type: parsed.type,
        ...(parsed.task_desc !== undefined ? { taskDesc: parsed.task_desc } : {}),
        ...(parsed.priority !== undefined ? { priority: parsed.priority } : {}),
        ...(parsed.estimated_time !== undefined ? { estimatedTime: parsed.estimated_time } : {}),
        ...(parsed.vars !== undefined ? { vars: varsEntriesToRecord(parsed.vars) } : {}),
        ...(parsed.depends_on !== undefined ? { dependsOn: [...parsed.depends_on] } : {}),
        ...(parsed.source_slug !== undefined && parsed.source_local_id !== undefined
          ? { sourceTask: { slug: parsed.source_slug, localId: parsed.source_local_id } }
          : {}),
        ...(parsed.block_source !== undefined ? { blockSource: parsed.block_source } : {}),
        ...(parsed.breaking !== undefined ? { breaking: parsed.breaking } : {}),
        ...(parsed.coverage !== undefined ? { coverage: parsed.coverage } : {}),
        ...(parsed.complexity !== undefined ? { complexity: parsed.complexity } : {}),
        ...(parsed.surface_key !== undefined ? { surfaceKey: parsed.surface_key } : {}),
        ...(parsed.surface_type !== undefined ? { surfaceType: parsed.surface_type } : {}),
      }
      return deps.tasks.addTask(input)
    },
  }
}
