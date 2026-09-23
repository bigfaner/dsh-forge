// host/forge-tools/task-tools — forge 任务工具族(任务 2.1;tech-design
// §Interface 2「dsh tool 面」+ spike-1 §1 注册契约)。
//
// 命名 = 下划线扁平名(spike-1 §1.2 偏差回填:`forge.task.add` 点号名会被
// provider 字符集 `^[a-zA-Z0-9_-]{1,128}$` 拒绝;上游全 snake_case)——
// `forge_task_add` 等 8 个(写集 5 + 读 3),动词面与 Interface 1 内核动词
// 一一对应。注册位 = host 半身 root context(全局工具,spike-1 §1.1「注册位」
// 先例 = base 行 ToolRuntime;插件 host 半身与宿主服务同一 cordis 应用)。
//
// 输入 schema 严格类型(T1 缓解):逐属性 ValueSchemaSpec + required 注解 +
// 状态词表 enum;taskKey 工具面白名单 = isBoardTaskKeyAddress(镜像内核
// task-repo 判定,双闸防御)。actor 自动携带:exec.agent 会话标识 →
// `session:<id>`(spike-2 §2:与 dispatch.session_id 同键直 join;缺失 =
// fail-closed 拒绝,绝不误记审计)。
//
// 结果语义(tech-design §Error Handling·Propagation——tool 面):
//   - 内核值 / 业务拒绝(ERR_TASK_NOT_AUTHORITATIVE 走 CLI 提示、
//     ERR_TASK_STATE_INVALID、ERR_TASK_DEPS_UNSATISFIED、ERR_PROJECT_NOT_FOUND
//     …)= canonical JSON 值返回(ok:false + code + message;业务提示非错误噪音);
//   - 桥 transport 失败(ERR_TOOL_BRIDGE_UNAVAILABLE)= **throw** 上抛会话
//     (明确降级提示,禁静默,Story 9);重试一次已在桥核内完成。

import { defineTool, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import {
  BRIDGE_TRANSPORT_CODE, isBoardTaskKeyAddress,
  type BridgeOutcome, type ForgeToolBridgeVerb,
} from './bridge-core'

/** 7 态任务状态词表(schema-v2 task.status CHECK 同源;transition/query enum)。 */
const TASK_STATUS_ENUM = [
  'pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected',
] as const

/** canonical 输出 schema:一切工具返回 JSON 串(plugin_manager 先例形态)。 */
export const TOOL_OUTPUT_SCHEMA = { type: 'string' } as const

/** 工具执行面依赖缝:桥调用(bridge-core.callWithRetry 的直通)。 */
export type ForgeTaskToolCallFn = (
  verb: ForgeToolBridgeVerb,
  args: Record<string, unknown>,
  actor: string,
) => Promise<BridgeOutcome>

/** createForgeTaskTools 注入面。 */
export interface ForgeTaskToolDeps {
  readonly call: ForgeTaskToolCallFn
}

/**
 * 从 exec 上下文导出审计主体(spike-1 §1.1 exec 契约:`exec.agent` = 所属
 * 会话)。运行时 Agent 形 = `agent.session.id`(spike-2 §2 主通道);类型面
 * 基础 Agent 的 `id` 与其为同一 SessionId —— 两形兼容读取。缺失/非字符串 →
 * throw(fail-closed:宁失败不误记,审计纪律)。
 */
export function actorOf(exec: ToolRunContext): string {
  const agent = (exec as { agent?: { id?: unknown; session?: { id?: unknown } } }).agent
  const sessionId = agent?.session !== undefined && typeof agent.session.id === 'string'
    ? agent.session.id
    : typeof agent?.id === 'string'
      ? agent.id
      : undefined
  if (sessionId === undefined || sessionId === '') {
    throw new Error('forge tools: tool call carried no agent session identity (audit discipline)')
  }
  return `session:${sessionId}`
}

/** taskKey 形态白名单拒绝载荷(与内核 ERR_TASK_KEY_INVALID 同码;ok 由调用方补)。 */
interface TaskKeyInvalidPayload {
  readonly code: 'ERR_TASK_KEY_INVALID'
  readonly message: string
}

function taskKeyInvalid(taskKey: string): TaskKeyInvalidPayload {
  return {
    code: 'ERR_TASK_KEY_INVALID',
    message: `task key ${JSON.stringify(taskKey)} is not a board address '<featureSlug>/<localId>' (exactly one '/', two non-empty segments, no path separators or control characters)`,
  }
}

/** 地址段判定(与 isBoardTaskKeyAddress 同规则;featureSlug/blockers 用)。 */
function isSegment(segment: string): boolean {
  if (segment === '') return false
  for (const ch of segment) {
    const code = ch.codePointAt(0)
    if (code === undefined) return false
    if (code <= 0x1f || code === 0x7f) return false
    if (ch === '/' || ch === '\\') return false
  }
  return true
}

/** 通用执行核:actor 导出 → 桥调用 → 值化(transport 失败 throw 上抛)。
 *
 * 任务 2.2 起导出:knowledge/feature 工具族共用同一执行核与结果语义
 * (内核值/业务拒绝 = canonical JSON 值;transport 失败 = throw 上抛,
 * Story 9 降级链禁静默)。 */
export async function executeVia(
  call: ForgeTaskToolCallFn,
  verb: ForgeToolBridgeVerb,
  args: Record<string, unknown>,
  exec: ToolRunContext,
): Promise<string> {
  const outcome = await call(verb, args, actorOf(exec))
  if (!outcome.ok && outcome.code === BRIDGE_TRANSPORT_CODE) {
    // 降级链终点:重试已尽,明确上抛(禁静默;reasonCode 进会话)。
    throw new Error(`${BRIDGE_TRANSPORT_CODE}: ${outcome.message}`)
  }
  return JSON.stringify(outcome.ok
    ? { ok: true, result: outcome.value }
    : { ok: false, code: outcome.code, message: outcome.message, ...(outcome.detail === undefined ? {} : { detail: outcome.detail }) })
}

/** 单引用工具的 taskKey 白名单断言(claim/transition/submit/reopen/get)。 */
function requireTaskKey(taskKey: string): TaskKeyInvalidPayload | undefined {
  return isBoardTaskKeyAddress(taskKey) ? undefined : taskKeyInvalid(taskKey)
}

const OUTPUT = {
  schema: TOOL_OUTPUT_SCHEMA,
  render: (_args: unknown, value: string): Array<{ type: 'text'; text: string }> => [{ type: 'text', text: value }],
}

/**
 * 任务工具族(8 个扁平名工具;后续 tool 族(pref/feature/proposal/stage/
 * knowledge)经同一基座追加注册,不另设通道 —— Implementation Notes)。
 */
export function createForgeTaskTools(deps: ForgeTaskToolDeps): ToolDefinition[] {
  const { call } = deps
  const via = (verb: ForgeToolBridgeVerb, args: Record<string, unknown>, exec: ToolRunContext) => executeVia(call, verb, args, exec)

  const writeHint = 'Writes require the project to be sqlite-authoritative (data_authority=sqlite); files-authoritative projects must use the forge CLI (dual-form discipline).'

  return [
    defineTool({
      name: 'forge_task_add',
      description: `Add a business task to a registered project's authoritative task table (kernel write verb taskAdd; default status pending; taskKey auto-mints <featureSlug>/disc-N when omitted). ${writeHint}`,
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        featureSlug: { type: 'string', required: true, description: 'Feature namespace slug (single address segment, no "/").' },
        title: { type: 'string', required: true, description: 'Task title (non-empty).' },
        taskKey: { type: 'string', description: 'Board address <featureSlug>/<localId>; omit to auto-mint disc-N.' },
        blockers: { type: 'array', items: { type: 'string' }, description: 'Direct upstream local keys in the same feature namespace.' },
        taskType: { type: 'string', description: 'Task-type protocol key (presynthesis routing).' },
        descPath: { type: 'string', description: 'Description markdown path relative to the features root.' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        if (args.taskKey !== undefined && !isBoardTaskKeyAddress(args.taskKey)) {
          return JSON.stringify({ ok: false, ...taskKeyInvalid(args.taskKey) })
        }
        if (!isSegment(args.featureSlug)) {
          return JSON.stringify({
            ok: false,
            code: 'ERR_TASK_KEY_INVALID',
            message: `feature slug ${JSON.stringify(args.featureSlug)} must be a non-empty single address segment (no '/', no path separators or control characters)`,
          })
        }
        for (const blocker of args.blockers ?? []) {
          if (!isSegment(blocker)) {
            return JSON.stringify({
              ok: false,
              code: 'ERR_TASK_KEY_INVALID',
              message: `blocker key ${JSON.stringify(blocker)} must be a non-empty local key in the feature namespace (no '/', no path separators or control characters)`,
            })
          }
        }
        return via('task_add', { ...args }, exec)
      },
    }),
    defineTool({
      name: 'forge_task_claim',
      description: `Claim a task: pending → in_progress (kernel write verb taskClaim, role=claim; resolved dependencies must be terminal). ${writeHint}`,
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        taskKey: { type: 'string', required: true, description: 'Board address <featureSlug>/<localId> (e.g. my-feature/1.3, phase keys like 5.gate allowed).' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        const invalid = requireTaskKey(args.taskKey)
        if (invalid !== undefined) return JSON.stringify({ ok: false, ...invalid })
        return via('task_claim', { projectId: args.projectId, taskKey: args.taskKey }, exec)
      },
    }),
    defineTool({
      name: 'forge_task_transition',
      description: `Transition a task to an explicit status (kernel write verb taskTransition, role=manual; illegal edges → ERR_TASK_STATE_INVALID). ${writeHint}`,
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        taskKey: { type: 'string', required: true, description: 'Board address <featureSlug>/<localId>.' },
        to: { type: 'string', required: true, enum: TASK_STATUS_ENUM, description: 'Target status (7-state vocabulary).' },
        reason: { type: 'string', description: 'Contextual reason string (accepted, not persisted by the v2 schema).' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        const invalid = requireTaskKey(args.taskKey)
        if (invalid !== undefined) return JSON.stringify({ ok: false, ...invalid })
        return via('task_transition', {
          projectId: args.projectId,
          taskKey: args.taskKey,
          to: args.to,
          ...(args.reason === undefined ? {} : { reason: args.reason }),
        }, exec)
      },
    }),
    defineTool({
      name: 'forge_task_submit',
      description: `Submit a task: in_progress → completed (kernel write verb taskSubmit, role=submit; the record .md itself stays in the doc tree). ${writeHint}`,
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        taskKey: { type: 'string', required: true, description: 'Board address <featureSlug>/<localId>.' },
        recordPath: { type: 'string', description: 'Record markdown contextual path (accepted, not persisted by the v2 schema).' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        const invalid = requireTaskKey(args.taskKey)
        if (invalid !== undefined) return JSON.stringify({ ok: false, ...invalid })
        return via('task_submit', {
          projectId: args.projectId,
          taskKey: args.taskKey,
          ...(args.recordPath === undefined ? {} : { recordPath: args.recordPath }),
        }, exec)
      },
    }),
    defineTool({
      name: 'forge_task_reopen',
      description: `Reopen a rejected/skipped task back to pending (kernel write verb taskReopen, role=reopen). ${writeHint}`,
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        taskKey: { type: 'string', required: true, description: 'Board address <featureSlug>/<localId>.' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        const invalid = requireTaskKey(args.taskKey)
        if (invalid !== undefined) return JSON.stringify({ ok: false, ...invalid })
        return via('task_reopen', { projectId: args.projectId, taskKey: args.taskKey }, exec)
      },
    }),
    defineTool({
      name: 'forge_task_get',
      description: 'Read one task\'s full detail (summary, description markdown, dependency chain, records, session links); routes by the project\'s data_authority (files → derived snapshot, sqlite → authoritative table).',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        taskKey: { type: 'string', required: true, description: 'Board address <featureSlug>/<localId>.' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        const invalid = requireTaskKey(args.taskKey)
        if (invalid !== undefined) return JSON.stringify({ ok: false, ...invalid })
        return via('task_get', { projectId: args.projectId, taskKey: args.taskKey }, exec)
      },
    }),
    defineTool({
      name: 'forge_task_query',
      description: 'Query task summaries with optional featureSlug/status filters (kernel read verb taskQuery; read routing by data_authority).',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        featureSlug: { type: 'string', description: 'Filter by feature namespace.' },
        status: { type: 'string', enum: TASK_STATUS_ENUM, description: 'Filter by status (7-state vocabulary).' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        return via('task_query', {
          projectId: args.projectId,
          ...(args.featureSlug === undefined ? {} : { featureSlug: args.featureSlug }),
          ...(args.status === undefined ? {} : { status: args.status }),
        }, exec)
      },
    }),
    defineTool({
      name: 'forge_task_list',
      description: 'List every task summary of a project, unfiltered (the query verb with no filters; read routing by data_authority).',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        return via('task_list', { projectId: args.projectId }, exec)
      },
    }),
  ]
}
