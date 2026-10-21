// recordBug tool 定义（fix-bug 两写径之一——登记 → open，返回 bug_id）。
// 语义字段薄面：agent 只提交 summary（≤50 字，超长服务端拒写）/五字段
//（bug_desc/trigger_desc/expected/actual 必填 + suspected/error_type 可选）；
// 身份/会话/仓库态解析下沉服务端——report_session_id（ToolSessionContext 执行会话）与
// reporter（服务端 git config user.name 缺席回退 user.email）由服务端注入；source_task_id
// 由派发上下文注入（worker 来源任务注册表——dispatch-core spawnClaimed 登记；standalone
// 路径缺席）。会话/工作区绑定同 addTask 径（requireProjectId + requireSessionId）。
// 返回面双友好（裁决⑨）：成功 formatOk（✓ + bugId 键值行）；typed 服务错误 → 失败 DTO
// formatErr（✗ code + 人话——format.ts 单源）。
import type { BugCard } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import { workerSourceTaskOf } from '../dispatch-core/index.js'
import type { ForgeToolDeps } from './index.js'
import { optionalString, requireArgsObject, requiredString } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, requireSessionId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

const TOOL = 'recordBug'

/** agent 面参数（纯语义字段——身份/会话/来源任务 agent 不可提交，工具面注入） */
export interface RecordBugToolArgs {
  /** 一句话摘要（≤50 字——超长服务端 ERR_BUG_SUMMARY_TOO_LONG 拒写） */
  readonly summary: string
  /** Bug：完整描述 */
  readonly bug_desc: string
  /** Trigger：复现步骤/输入 */
  readonly trigger_desc: string
  /** Expected：正确行为 */
  readonly expected: string
  /** Actual：观察到的行为 */
  readonly actual: string
  /** Suspected location（file:line——可空） */
  readonly suspected?: string
  /** 错误类型（自由标注——可空） */
  readonly error_type?: string
  /** 复发链前驱 bug_id（bug-recurrence-chain——首次发生不填；悬空引用拒写） */
  readonly recurrence_of?: string
}

/** 参数防御性收窄（执行点自证——五必填 + 两可选） */
export function parseRecordBugArgs(args: unknown): RecordBugToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: {
    summary: string
    bug_desc: string
    trigger_desc: string
    expected: string
    actual: string
    suspected?: string
    error_type?: string
    recurrence_of?: string
  } = {
    summary: requiredString(a, 'summary', TOOL),
    bug_desc: requiredString(a, 'bug_desc', TOOL),
    trigger_desc: requiredString(a, 'trigger_desc', TOOL),
    expected: requiredString(a, 'expected', TOOL),
    actual: requiredString(a, 'actual', TOOL),
  }
  const suspected = optionalString(a, 'suspected', TOOL)
  if (suspected !== undefined) out.suspected = suspected
  const errorType = optionalString(a, 'error_type', TOOL)
  if (errorType !== undefined) out.error_type = errorType
  const recurrenceOf = optionalString(a, 'recurrence_of', TOOL)
  if (recurrenceOf !== undefined) out.recurrence_of = recurrenceOf
  return out
}

/**
 * BugCard 成功支 schema（recordBug/resolveBug 共用——全字段镜像 contracts BugCard，
 * 值 = core 返回的全卡；顶层 additionalProperties:false 白名单必须覆盖全部 20 键）。
 */
export const BUG_CARD_SUCCESS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bugId: { type: 'string', description: 'uuid proxy key (resolveBug 回填引用锚).' },
    summary: { type: 'string', description: 'One-line summary (max 50 chars).' },
    bugDesc: { type: 'string', description: 'Bug: full description of the defect.' },
    triggerDesc: { type: 'string', description: 'Trigger: reproduction steps / input.' },
    expected: { type: 'string', description: 'Expected: correct behavior.' },
    actual: { type: 'string', description: 'Actual: observed behavior.' },
    suspected: { type: 'string', description: 'Suspected location (file:line) — repair lead for open records.' },
    errorType: { type: 'string', description: 'Free-form error type label (stats dimension).' },
    bugStatus: { type: 'string', description: "'open' (recordBug) | 'fixed' | 'unresolved' (resolveBug)." },
    commitHash: { type: 'string', description: 'fixed evidence (atomic commit hash anchor).' },
    worktree: { type: 'string', description: 'fixed evidence (hash-anchored reverse lookup).' },
    branch: { type: 'string', description: 'fixed evidence (hash-anchored reverse lookup).' },
    unresolvedReason: { type: 'string', description: 'unresolved backfill cause (HARD-GATE stop).' },
    fixApproach: { type: 'string', description: 'Adopted fix approach summary (fixed backfill — ledger review surface).' },
    sourceTaskId: { type: 'string', description: 'coding-fix delegating source task (absent on standalone paths).' },
    reportSessionId: { type: 'string', description: 'Registering (executing) session.' },
    fixSessionId: { type: 'string', description: 'Fixing session (written on fixed backfill).' },
    reporter: { type: 'string', description: 'Server-resolved git identity (user.name, fallback user.email).' },
    // Root cause: bug-recurrence-chain 给 BugCard 新增 recurrenceOf 后未回写本白名单（additionalProperties:false），
    // 挂链登记的返回卡被 oneOf 输出校验整体拒绝。
    recurrenceOf: { type: 'string', description: 'Recurrence-chain predecessor bug_id (absent on chain roots).' },
    fixer: { type: 'string', description: 'Server-resolved fixer git identity (fixed backfill).' },
    createdAt: { type: 'string', description: 'Registration time (ISO-8601).' },
    updatedAt: { type: 'string', description: 'Backfill time (ISO-8601; equals createdAt until backfilled).' },
  },
  required: ['bugId', 'summary', 'bugDesc', 'triggerDesc', 'expected', 'actual', 'bugStatus', 'reporter', 'createdAt', 'updatedAt'],
}

/** registerBug 返回（BugCard）的注册面输出 schema（+ 失败支） */
const RECORD_BUG_OUTPUT_SCHEMA = withFailureVariant(BUG_CARD_SUCCESS_SCHEMA)

/** BugCard → 模型可见文本（formatOk 双友好：✓ + bugId 键值行） */
function renderRecordBugResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as BugCard
  return formatOk(`Bug registered (open) — ${v.summary}`, [
    `- bugId: ${v.bugId}`,
    `- reporter: ${v.reporter}`,
  ])
}

/** tool 定义工厂（deps.bugs 注入 core bug 域服务——装配必给） */
export function createRecordBugTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Register a bug in the forge bug ledger (lands an open record and returns its bug_id). Agent submits semantic fields only: a one-line summary (max 50 chars — longer is rejected), the five Bug Summary fields (bug_desc / trigger_desc / expected / actual; suspected location and error_type optional), and an optional recurrence_of predecessor bug_id when this is a recurrence of a known problem (omit on first occurrence; use listBugs to find candidates). Identity, session and repo state are resolved server-side: report_session_id comes from the executing session, reporter from git config, and source_task_id from the dispatch context (absent on standalone paths). Use at diagnosis time per the fix-bug flow; backfill the outcome later via resolveBug.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One-line summary, max 50 chars (list primary row + search face); longer summaries are rejected.' },
        bug_desc: { type: 'string', description: 'Bug: full description of the defect.' },
        trigger_desc: { type: 'string', description: 'Trigger: reproduction steps / input.' },
        expected: { type: 'string', description: 'Expected: correct behavior.' },
        actual: { type: 'string', description: 'Actual: observed behavior.' },
        suspected: { type: 'string', description: 'Suspected location (file:line) — optional repair lead for open records.' },
        error_type: { type: 'string', description: 'Free-form error type label — optional, stats dimension.' },
        recurrence_of: {
          type: 'string',
          description:
            'Recurrence-chain predecessor: the bug_id of the most recent prior record of the SAME problem (this new record reads as "a recurrence of X"). Omit on first occurrence of a problem. To find candidate predecessors, use the main agent listBugs query tool (keyword search over the six text fields) — agent judgment + explicit reference, no auto-matching. Written once at registration and immutable after; must reference an existing bug (dangling reference is rejected).',
        },
      },
      required: ['summary', 'bug_desc', 'trigger_desc', 'expected', 'actual'],
    },
    output: { schema: RECORD_BUG_OUTPUT_SCHEMA, render: renderRecordBugResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<BugCard | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseRecordBugArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const sessionId = requireSessionId(session)
        // report_session_id = 执行会话（ToolSessionContext 注入）；source_task_id = 派发上下文
        //（worker 来源任务注册表——standalone 未登记 = undefined，键缺席）
        const sourceTaskId = workerSourceTaskOf(sessionId)
        return deps.bugs.registerBug({
          projectId,
          summary: parsed.summary,
          bugDesc: parsed.bug_desc,
          triggerDesc: parsed.trigger_desc,
          expected: parsed.expected,
          actual: parsed.actual,
          ...(parsed.suspected !== undefined ? { suspected: parsed.suspected } : {}),
          ...(parsed.error_type !== undefined ? { errorType: parsed.error_type } : {}),
          ...(parsed.recurrence_of !== undefined ? { recurrenceOf: parsed.recurrence_of } : {}),
          reportSessionId: sessionId,
          ...(sourceTaskId !== undefined ? { sourceTaskId } : {}),
        })
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
