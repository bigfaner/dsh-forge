// unblockTask tool（blocked-verdict-restore-primitive 1.4——blocked→pending 出口的工具层薄壳）。
// 定位：业务——submitTask 双出口直达的 pending 侧承载面：主会话判定阻塞原因消失，经本工具
// 解除阻塞回队列走正常 claim。参数 = slug/local_id/reason 三参（reason 必带——core 侧
// ERR_REASON_REQUIRED 先证，此处仅形状收窄）；零 gate/AC 结算负载——携带即拒（非结算语义，
// 名实相符：结算走 submitTask）。注册面：主 agent 专属（∉ WORKER_FORGE_TOOLS——worker deny
// 矩阵同步守护，deriveWorkerToolFilter 全集中 deny）。
// 返回面双友好（裁决⑨）：成功 formatOk（含审计要点行：taskId/status/reason）；typed 服务
// 错误 → 失败 DTO formatErr。3.4 事件缝：typed 错误 → tool-error（emitToolError；
// deps.events 缺席 = 零事件降级）；成功径零额外事件（core 侧 emitTasksChanged 单源）。
import type { UnblockTaskInput, UnblockTaskResult } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { requireArgsObject, requiredString } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'
import { requireProjectId, requireSessionId, sessionContextOf } from './session.js'

const TOOL = 'unblockTask'

/** 结算面负载键黑名单（schema 面不接受——非结算语义，命中即拒） */
const SETTLEMENT_LOAD_KEYS = [
  'result',
  'summary',
  'files',
  'files_created',
  'files_modified',
  'ac_criteria',
  'ac_met',
  'ac_evidence',
  'key_decisions',
  'tests_passed',
  'tests_failed',
  'coverage',
  'notes',
  'gate_compile',
  'gate_fmt',
  'gate_lint',
  'gate_test',
  'gate_coverage',
  'commit_hash',
  'evidence_debt_suite',
  'evidence_debt_specs',
  'evidence_debt_note',
  'runtime_surface',
  'runtime_evidence_face',
  'runtime_evidence_artifacts',
  'runtime_evidence_note',
] as const

/** agent 面参数（薄壳——仅 slug/local_id/reason 三参） */
export interface UnblockTaskToolArgs {
  /** 容器 slug（feature 目录名 / proposal slug——任务自然键第一段） */
  readonly slug: string
  readonly local_id: string
  /** 解除阻塞缘由（审计落任务记录 reason 列——必带） */
  readonly reason: string
}

/** 参数防御性收窄（三参必带 + 结算负载键黑名单拒绝） */
export function parseUnblockTaskArgs(args: unknown): UnblockTaskToolArgs {
  const a = requireArgsObject(args, TOOL)
  const hit = SETTLEMENT_LOAD_KEYS.filter((k) => a[k] !== undefined)
  if (hit.length > 0) {
    throw new Error(
      `${TOOL}: settlement/gate/AC loads are not accepted (${hit.join(', ')}) — unblockTask only restores the blocked task to pending; submit the outcome with submitTask instead`,
    )
  }
  const slug = requiredString(a, 'slug', TOOL)
  const localId = requiredString(a, 'local_id', TOOL)
  const reason = requiredString(a, 'reason', TOOL)
  if (reason.trim() === '') {
    throw new Error(`${TOOL}: reason must be a non-empty string (it is recorded on the task records as the unblock audit reason)`)
  }
  return { slug, local_id: localId, reason }
}

/** UnblockTaskResult 的注册面输出 schema（+ 失败支） */
const UNBLOCK_TASK_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    taskId: { type: 'string' },
    status: { type: 'string', description: "Task status after the unblock (always 'pending')." },
  },
  required: ['taskId', 'status'],
})

/** UnblockTaskResult → 模型可见文本（formatOk：✓ 首行 + 审计要点行） */
function renderUnblockResult(args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as UnblockTaskResult
  const a = args as { slug?: string; local_id?: string; reason?: string }
  const where = a.slug !== undefined && a.local_id !== undefined ? `${a.slug}/${a.local_id} ` : ''
  const lines = [
    `- taskId: ${v.taskId}`,
    `- status: ${v.status} (back in the claim queue)`,
    ...(a.reason !== undefined ? [`- reason: ${a.reason}`] : []),
  ]
  return formatOk(`Task ${where}unblocked — ${v.status}`, lines)
}

/** tool 定义工厂 */
export function createUnblockTaskTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Unblock a blocked task (located by its container slug + local_id): transitions it back to pending so it re-enters the normal claim queue — use when the blocking reason is resolved but the task is not itself settled. Requires reason (recorded on the task records as the unblock audit). Gate/AC settlement loads are not accepted; settle the task with submitTask instead.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Container slug of the task being unblocked (feature directory name or proposal slug).' },
        local_id: { type: 'string', description: 'Local id of the task being unblocked.' },
        reason: { type: 'string', description: 'Why the blocking reason is considered resolved (required; recorded as the unblock audit reason).' },
      },
      required: ['slug', 'local_id', 'reason'],
    },
    output: { schema: UNBLOCK_TASK_OUTPUT_SCHEMA, render: renderUnblockResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<UnblockTaskResult | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseUnblockTaskArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const sessionId = requireSessionId(session)
        await deps.events?.prepare(session) // 会话目录记忆（事件日志落位——主会话语境）
        const input: UnblockTaskInput = {
          projectId,
          taskRef: { slug: parsed.slug, localId: parsed.local_id },
          reason: parsed.reason,
          sessionId,
        }
        return deps.tasks.unblockTask(input)
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
