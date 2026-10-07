// addTask tool 定义（定位：业务——M3 终态六动词之一，名 = 动词透传）。
// 参数 snake_case（Interface 8）；容器直传（M3 3.5：source_kind + source_slug 平铺
// 两显式参——2.4/2.5 的 feature_slug 垫片退役；嵌套 object 禁入 schema 面，ContainerRef
// 平铺为标量对）；任务定位 = slug + local_id 两显式参口径延伸到 fix 链源
//（source_task_slug + source_task_local_id 成对显式）；嵌套负载平铺：vars = ['KEY=VALUE'] 条目
// 数组（老 forge `--var KEY=VALUE` 形制平移）；acceptance_criteria = AC 清单（→ ac_json，
// submitTask 证据门判据）。projectId 由 exec ctx cwd 解析（session.ts——cwd 缺席/未命中
// = ERR_WORKSPACE_NOT_REGISTERED）；返回 = contracts AddTaskResult 透传。
// tool 面零业务逻辑（Hard Rule）：参数映射 + 路由到 core 动词（单一写入门）。
// 返回面双友好（裁决⑨）：成功 formatOk（✓ + 键值行）；typed 服务错误 → 失败 DTO
// formatErr（✗ code + 人话 + 违规清单逐行——format.ts 单源）。
import {
  CONTAINER_KINDS,
  TASK_TYPES,
  type AddTaskInput,
  type AddTaskResult,
  type ContainerKind,
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
import {
  callToolFace,
  formatFailure,
  formatOk,
  isForgeToolFailure,
  withFailureVariant,
  type ForgeToolFailure,
} from './format.js'
import { requireProjectId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

const TOOL = 'addTask'

/** tasks.priority CHECK 三值（contracts TaskPriority 词表——schema 面无 enum，执行点收窄） */
const PRIORITIES: readonly TaskPriority[] = ['P0', 'P1', 'P2']

/** tasks.complexity CHECK 三值（contracts TaskComplexity 词表） */
const COMPLEXITIES: readonly TaskComplexity[] = ['low', 'medium', 'high']

/** agent 面参数（映射 AddTaskInput 去 projectId——vars = KEY=VALUE 条目数组；容器直传双参） */
export interface AddTaskToolArgs {
  /** 任务容器判别（feature = 远征链分解 / proposal = 突击直挂） */
  readonly source_kind: ContainerKind
  /** 容器 slug（feature 目录名 / proposal slug——任务 slug 恒等值，服务不变量） */
  readonly source_slug: string
  readonly title: string
  /** 20 值词表（contracts TASK_TYPES） */
  readonly type: TaskType
  readonly task_desc?: string
  /** 验收清单（→ ac_json；submitTask AC 证据门判据） */
  readonly acceptance_criteria?: readonly string[]
  readonly priority?: TaskPriority
  readonly estimated_time?: string
  /** KEY=VALUE 条目数组（老 forge --var 形制；重复键拒——显式消歧） */
  readonly vars?: readonly string[]
  /** 依赖的自然键 localId 清单（同容器前置声明——同容器边约束） */
  readonly depends_on?: readonly string[]
  /** fix/disc 链源（TaskRef 两显式参 = sourceTask 平铺——与 source_slug 同 slug；成对给） */
  readonly source_task_slug?: string
  readonly source_task_local_id?: string
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
    out[key] = entry.slice(1 + eq)
  }
  return out
}

/** 参数防御性收窄（执行点自证，knowledge 形制） */
export function parseAddTaskArgs(args: unknown): AddTaskToolArgs {
  const a = requireArgsObject(args, TOOL)
  const source = optionalPair(a, 'source_task_slug', 'source_task_local_id', TOOL)
  const blockSource = optionalBoolean(a, 'block_source', TOOL)
  if (blockSource === true && source === undefined) {
    throw new Error(`${TOOL}: block_source requires source_task_slug and source_task_local_id (fix-chain data face)`)
  }
  const out: {
    source_kind: ContainerKind
    source_slug: string
    title: string
    type: TaskType
    task_desc?: string
    acceptance_criteria?: string[]
    priority?: TaskPriority
    estimated_time?: string
    vars?: string[]
    depends_on?: string[]
    source_task_slug?: string
    source_task_local_id?: string
    block_source?: boolean
    breaking?: boolean
    coverage?: number
    complexity?: TaskComplexity
    surface_key?: string
    surface_type?: string
  } = {
    source_kind: requiredEnum(a, 'source_kind', CONTAINER_KINDS, TOOL),
    source_slug: requiredString(a, 'source_slug', TOOL),
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
  const acceptanceCriteria = optionalStringArray(a, 'acceptance_criteria', TOOL)
  if (acceptanceCriteria !== undefined) out.acceptance_criteria = acceptanceCriteria
  if (source !== undefined) {
    out.source_task_slug = source.first
    out.source_task_local_id = source.second
  }
  if (blockSource !== undefined) out.block_source = blockSource
  const breaking = optionalBoolean(a, 'breaking', TOOL)
  if (breaking !== undefined) out.breaking = breaking
  const coverage = optionalFraction(a, 'coverage', TOOL)
  if (coverage !== undefined) out.coverage = coverage
  return out
}

/** AddTaskResult 的注册面输出 schema（contracts DTO 字段镜像 + 失败支） */
const ADD_TASK_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    taskId: { type: 'string', description: 'uuid proxy key (stable FK/RPC anchor)' },
    slug: { type: 'string', description: 'container slug of the task (natural key part 1)' },
    localId: { type: 'string', description: 'per-container local key (natural key part 2; fix-N/disc-N for chained tasks)' },
    reused: { type: 'boolean', description: 'true = dedup hit on an existing fix task (no new row)' },
  },
  required: ['taskId', 'slug', 'localId', 'reused'],
})

/** AddTaskResult → 模型可见文本（formatOk 双友好：首行 ✓ + 键值行） */
function renderAddTaskResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as AddTaskResult
  return formatOk(
    v.reused ? `Task ${v.slug}/${v.localId} already exists (fix dedup) — reused, no new row` : `Task ${v.slug}/${v.localId} added`,
    [`- taskId: ${v.taskId}`],
  )
}

/** tool 定义工厂（deps 注入服务与解析器——纯函数体，无插件级状态） */
export function createAddTaskTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Add a task to a container in the forge pipeline state layer (source_kind: feature for expedition breakdowns, proposal for blitz direct-attached tasks). Use source_task_slug + source_task_local_id (with block_source) to spawn a fix task that pauses its blocked source until the fix completes; depends_on lists local ids of prerequisites within the same container; acceptance_criteria become the submit-time evidence gate. Prefer dispatching existing ready tasks before adding new ones.',
    parameters: {
      type: 'object',
      properties: {
        source_kind: {
          type: 'string',
          description: `Container kind, one of: ${CONTAINER_KINDS.join(', ')} (feature = expedition chain / proposal = blitz direct-attach).`,
        },
        source_slug: {
          type: 'string',
          description: 'Container slug (feature directory name or proposal slug; must exist — the task slug equals it).',
        },
        title: { type: 'string', description: 'Short task title.' },
        type: {
          type: 'string',
          description: `Task type, one of: ${TASK_TYPES.join(', ')}.`,
        },
        task_desc: { type: 'string', description: 'Content payload (hard rules, reference list, free text).' },
        acceptance_criteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Acceptance criteria checklist (submit with result=success later requires gate.test passing when this is non-empty).',
        },
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
          description: 'Local ids of prerequisite tasks in the same container.',
        },
        source_task_slug: {
          type: 'string',
          description: 'Slug of the chain source task (pair with source_task_local_id; same value as source_slug).',
        },
        source_task_local_id: { type: 'string', description: 'Local id of the chain source task (pair with source_task_slug).' },
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
      required: ['source_kind', 'source_slug', 'title', 'type'],
    },
    output: { schema: ADD_TASK_OUTPUT_SCHEMA, render: renderAddTaskResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<AddTaskResult | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseAddTaskArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const input: AddTaskInput = {
          projectId,
          source: { kind: parsed.source_kind, slug: parsed.source_slug },
          title: parsed.title,
          type: parsed.type,
          ...(parsed.task_desc !== undefined ? { taskDesc: parsed.task_desc } : {}),
          ...(parsed.acceptance_criteria !== undefined ? { acceptanceCriteria: [...parsed.acceptance_criteria] } : {}),
          ...(parsed.priority !== undefined ? { priority: parsed.priority } : {}),
          ...(parsed.estimated_time !== undefined ? { estimatedTime: parsed.estimated_time } : {}),
          ...(parsed.vars !== undefined ? { vars: varsEntriesToRecord(parsed.vars) } : {}),
          ...(parsed.depends_on !== undefined ? { dependsOn: [...parsed.depends_on] } : {}),
          ...(parsed.source_task_slug !== undefined && parsed.source_task_local_id !== undefined
            ? { sourceTask: { slug: parsed.source_task_slug, localId: parsed.source_task_local_id } }
            : {}),
          ...(parsed.block_source !== undefined ? { blockSource: parsed.block_source } : {}),
          ...(parsed.breaking !== undefined ? { breaking: parsed.breaking } : {}),
          ...(parsed.coverage !== undefined ? { coverage: parsed.coverage } : {}),
          ...(parsed.complexity !== undefined ? { complexity: parsed.complexity } : {}),
          ...(parsed.surface_key !== undefined ? { surfaceKey: parsed.surface_key } : {}),
          ...(parsed.surface_type !== undefined ? { surfaceType: parsed.surface_type } : {}),
        }
        return deps.tasks.addTask(input)
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
