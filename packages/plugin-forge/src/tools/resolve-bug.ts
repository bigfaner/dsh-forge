// resolveBug tool 定义（fix-bug 两写径之二——终态回填 fixed｜unresolved）。
// 语义字段薄面：agent 只提交 bug_id + commit_hash（fixed——原子提交后 git rev-parse HEAD
// 捕获，并发安全锚）+ 终态选择（outcome）+ unresolved_reason（unresolved——HARD-GATE 停机
// 原因）；其余服务端解析——worktree/branch 以 commit_hash 为锚反查、fixer 走 git 身份、
// fix_session_id = 执行会话（ToolSessionContext）。会话/工作区绑定同 addTask 径。
// 返回面双友好（裁决⑨）：成功 formatOk（✓ + 终态/证据键值行）；typed 服务错误 → 失败 DTO
// formatErr（✗ code + 人话——format.ts 单源）。
import type { BugCard } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalString, requireArgsObject, requiredEnum, requiredString } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, requireSessionId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

const TOOL = 'resolveBug'

/** bug 终态词表（open→fixed｜unresolved 单向——不可改史） */
const BUG_OUTCOMES = ['fixed', 'unresolved'] as const

/** agent 面参数（纯语义字段——证据反查/身份/会话 agent 不可提交） */
export interface ResolveBugToolArgs {
  readonly bug_id: string
  /** 终态选择：fixed（携 commit_hash）｜ unresolved（携 unresolved_reason） */
  readonly outcome: (typeof BUG_OUTCOMES)[number]
  /** fixed：agent 原子提交后捕获（服务端 hash 锚定反查 worktree/branch） */
  readonly commit_hash?: string
  /** unresolved：HARD-GATE 停机原因 */
  readonly unresolved_reason?: string
}

/** 参数防御性收窄（执行点自证） */
export function parseResolveBugArgs(args: unknown): ResolveBugToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: {
    bug_id: string
    outcome: (typeof BUG_OUTCOMES)[number]
    commit_hash?: string
    unresolved_reason?: string
  } = {
    bug_id: requiredString(a, 'bug_id', TOOL),
    outcome: requiredEnum(a, 'outcome', BUG_OUTCOMES, TOOL),
  }
  const commitHash = optionalString(a, 'commit_hash', TOOL)
  if (commitHash !== undefined) out.commit_hash = commitHash
  const reason = optionalString(a, 'unresolved_reason', TOOL)
  if (reason !== undefined) out.unresolved_reason = reason
  return out
}

/** resolveBug 返回（BugCard）的注册面输出 schema（+ 失败支） */
const RESOLVE_BUG_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    bugId: { type: 'string' },
    bugStatus: { type: 'string', description: "'fixed' | 'unresolved' — the chosen terminal state." },
    commitHash: { type: 'string', description: 'fixed evidence (agent-captured atomic commit hash).' },
    worktree: { type: 'string', description: 'fixed evidence (hash-anchored worktree reverse lookup; absent when unresolved).' },
    branch: { type: 'string', description: 'fixed evidence (hash-anchored branch reverse lookup; absent when unresolved).' },
    unresolvedReason: { type: 'string', description: 'unresolved backfill cause (absent when fixed).' },
    fixer: { type: 'string', description: 'Server-resolved git identity (user.name, fallback user.email).' },
  },
  required: ['bugId', 'bugStatus'],
})

/** BugCard → 模型可见文本（formatOk 双友好：✓ + 终态/证据键值行） */
function renderResolveBugResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as BugCard
  const lines = [`Bug ${v.bugId} resolved — ${v.bugStatus}`]
  if (v.bugStatus === 'fixed') {
    lines.push(`- commit: ${v.commitHash ?? '(not recorded)'}`)
    if (v.worktree !== undefined) lines.push(`- worktree: ${v.worktree}`)
    if (v.branch !== undefined) lines.push(`- branch: ${v.branch}`)
  } else if (v.unresolvedReason !== undefined) {
    lines.push(`- reason: ${v.unresolvedReason}`)
  }
  return formatOk(lines[0]!, lines.slice(1))
}

/** tool 定义工厂（deps.bugs 注入 core bug 域服务——装配必给） */
export function createResolveBugTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      "Backfill the terminal state of a registered bug (open → fixed | unresolved, one-way — history is immutable). Agent submits bug_id + the outcome + one semantic field: for 'fixed' the commit_hash captured right after the fix+tests atomic commit (git rev-parse HEAD — the concurrency-safe anchor; the server reverse-looks-up worktree/branch from it), for 'unresolved' the reason the bug could not be reproduced (HARD-GATE stop). fixer identity and fix session are resolved server-side. Use after the fix lands per the fix-bug flow, referencing the bug_id returned by recordBug.",
    parameters: {
      type: 'object',
      properties: {
        bug_id: { type: 'string', description: 'Bug id returned by recordBug.' },
        outcome: { type: 'string', description: "'fixed' | 'unresolved' — the terminal state choice." },
        commit_hash: {
          type: 'string',
          description: "For outcome='fixed': the commit hash captured immediately after the fix+tests atomic commit (concurrency-safe anchor for evidence reverse lookup).",
        },
        unresolved_reason: {
          type: 'string',
          description: "For outcome='unresolved': why the bug could not be reproduced/fixed (HARD-GATE stop cause).",
        },
      },
      required: ['bug_id', 'outcome'],
    },
    output: { schema: RESOLVE_BUG_OUTPUT_SCHEMA, render: renderResolveBugResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<BugCard | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseResolveBugArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const sessionId = requireSessionId(session)
        // fix_session_id = 执行会话（ToolSessionContext 注入）；worktree/branch/fixer 服务端解析
        return deps.bugs.resolveBug({
          projectId,
          bugId: parsed.bug_id,
          outcome: parsed.outcome,
          ...(parsed.commit_hash !== undefined ? { commitHash: parsed.commit_hash } : {}),
          ...(parsed.unresolved_reason !== undefined ? { unresolvedReason: parsed.unresolved_reason } : {}),
          fixSessionId: sessionId,
        })
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
