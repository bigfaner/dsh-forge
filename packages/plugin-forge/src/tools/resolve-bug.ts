// resolveBug tool 定义（fix-bug 两写径之二——终态回填 fixed｜unresolved）。
// 语义字段薄面：agent 只提交 bug_id + commit_hash（fixed——原子提交后 git rev-parse HEAD
// 捕获，并发安全锚）+ 终态选择（outcome）+ unresolved_reason（unresolved——HARD-GATE 停机
// 原因）；其余服务端解析——worktree/branch 以 commit_hash 为锚反查、fixer 走 git 身份、
// fix_session_id = 执行会话（ToolSessionContext）。会话/工作区绑定同 addTask 径。
// 返回面双友好（裁决⑨）：成功 formatOk（✓ + 终态/证据键值行）；typed 服务错误 → 失败 DTO
// formatErr（✗ code + 人话——format.ts 单源）。
import type { BugCard } from '@dsh-forge/contracts'
import { stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalString, requireArgsObject, requiredEnum, requiredString } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { BUG_CARD_SUCCESS_SCHEMA } from './record-bug.js'
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
  /** fixed：修复方案总结（采用了什么修法、为何此修法——一段话，台账审查面） */
  readonly fix_approach?: string
}

/** 参数防御性收窄（执行点自证） */
export function parseResolveBugArgs(args: unknown): ResolveBugToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: {
    bug_id: string
    outcome: (typeof BUG_OUTCOMES)[number]
    commit_hash?: string
    unresolved_reason?: string
    fix_approach?: string
  } = {
    bug_id: requiredString(a, 'bug_id', TOOL),
    outcome: requiredEnum(a, 'outcome', BUG_OUTCOMES, TOOL),
  }
  const commitHash = optionalString(a, 'commit_hash', TOOL)
  if (commitHash !== undefined) out.commit_hash = commitHash
  const reason = optionalString(a, 'unresolved_reason', TOOL)
  if (reason !== undefined) out.unresolved_reason = reason
  const approach = optionalString(a, 'fix_approach', TOOL)
  if (approach !== undefined) out.fix_approach = approach
  return out
}

/** resolveBug 返回（BugCard）的注册面输出 schema（recordBug 共用全卡镜像 + 失败支） */
const RESOLVE_BUG_OUTPUT_SCHEMA = withFailureVariant(BUG_CARD_SUCCESS_SCHEMA)

/** BugCard → 模型可见文本（formatOk 双友好：✓ + 终态/证据键值行） */
function renderResolveBugResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as BugCard
  const lines = [`Bug ${v.bugId} resolved — ${v.bugStatus}`]
  if (v.bugStatus === 'fixed') {
    lines.push(`- commit: ${v.commitHash ?? '(not recorded)'}`)
    if (v.worktree !== undefined) lines.push(`- worktree: ${v.worktree}`)
    if (v.branch !== undefined) lines.push(`- branch: ${v.branch}`)
    if (v.fixApproach !== undefined) lines.push(`- approach: ${v.fixApproach}`)
  } else if (v.unresolvedReason !== undefined) {
    lines.push(`- reason: ${v.unresolvedReason}`)
  }
  return formatOk(lines[0]!, lines.slice(1))
}

/** 报告锚行提取（协议单源 = core bugs.ts T4 注释——本面只取锚值，声明段/锚 presence 门归 core） */
export function coverageAnchorLineOf(fixApproach: string): string | undefined {
  for (const line of fixApproach.split(/\r?\n/)) {
    const t = line.trim()
    if (t.toLowerCase().startsWith('anchor:')) {
      const v = t.slice('anchor:'.length).trim()
      if (v !== '') return v
    }
  }
  return undefined
}

/**
 * T4 锚有效性预检（plugin-forge 旁挂侧文件 IO——core 零文件 IO）：复发家族（recurrenceOf
 * 在场）fixed 搥报告锚行时，锚指向的卷宗正本必须以文件在场（相对锚经项目根 wsPath 解析，
 * 1.4 resolveDir 同源 projects face）。fail-soft：锚行缺席 = core presence 门拒（本面不重复）；
 * 台账读故障/项目面缺席/路径解析失败 = 预检惰性跳过（数据源不洁不阻断——core 门仍在）；
 * 失效 = 拒绝路径退回失败 DTO（ERR_BUG_COVERAGE_ANCHOR_INVALID，resolveBug 写径零触达）。
 */
async function precheckCoverageAnchor(
  deps: ForgeToolDeps,
  projectId: string,
  bugId: string,
  fixApproach: string,
): Promise<ForgeToolFailure | undefined> {
  const anchor = coverageAnchorLineOf(fixApproach)
  if (anchor === undefined) return undefined
  let recurrenceOf: string | undefined
  try {
    const resp = await deps.bugs.getBug({ projectId, bugId })
    recurrenceOf = resp.card.recurrenceOf
  } catch {
    return undefined // fail-soft：台账读故障预检惰性跳过（core presence 门仍在）
  }
  if (recurrenceOf === undefined || deps.projects === undefined) return undefined // 非复发家族零闸门 / 机制惰性
  let wsPath: string | undefined
  try {
    const project = await deps.projects.getProject(projectId)
    wsPath = project !== null && project.wsPath.trim() !== '' ? project.wsPath : undefined
  } catch {
    return undefined
  }
  if (wsPath === undefined) return undefined
  const resolved = isAbsolute(anchor) ? anchor : join(wsPath, anchor)
  const present = await stat(resolved).then((s) => s.isFile(), () => false)
  if (present) return undefined
  return {
    ok: false,
    code: 'ERR_BUG_COVERAGE_ANCHOR_INVALID',
    message:
      `报告锚失效：锚 ${anchor} 指向的卷宗正本不在场（解析 ${resolved}）——resolveBug(fixed) 拒绝退回补证；` +
      `排查报告落卷（提案 issues/<localId>/ 卷宗正本）后携同一锚行重新回填`,
    violations: [`anchor: ${anchor}`, `resolved: ${resolved}`, `bug: ${bugId}`],
  }
}

/** tool 定义工厂（deps.bugs 注入 core bug 域服务——装配必给） */
export function createResolveBugTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      "Backfill the terminal state of a registered bug (open → fixed | unresolved, one-way — history is immutable). Agent submits bug_id + the outcome + one semantic field: for 'fixed' the commit_hash captured right after the fix+tests atomic commit (git rev-parse HEAD — the concurrency-safe anchor; the server reverse-looks-up worktree/branch from it) and the fix_approach summary (what was fixed and why this approach — the ledger review surface), for 'unresolved' the reason the bug could not be reproduced (HARD-GATE stop). fixer identity and fix session are resolved server-side. Use after the fix lands per the fix-bug flow, referencing the bug_id returned by recordBug.",
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
        fix_approach: {
          type: 'string',
          description:
            "For outcome='fixed': one-paragraph summary of the adopted fix approach (what was changed and why this approach over alternatives) — the ledger review surface. " +
            'For recurrence-family bugs (a recurrenceOf chain exists) the fixed backfill additionally requires two protocol lines inside fix_approach: `coverage: <why this fix covers the whole recurrence chain>` and `anchor: <file path of the archived verification report>` — a missing section or an anchor whose file is absent rejects the fixed backfill.',
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
        // T4 锚有效性预检（旁挂侧文件 IO——core 零文件 IO）：复发家族 fixed 携锚行时
        // 卷宗正本必须文件在场；失效经拒绝路径退回（emitToolError 同缝），写径零触达
        if (parsed.outcome === 'fixed' && parsed.fix_approach !== undefined) {
          const anchorFailure = await precheckCoverageAnchor(deps, projectId, parsed.bug_id, parsed.fix_approach)
          if (anchorFailure !== undefined) {
            emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, anchorFailure)
            return anchorFailure
          }
        }
        // fix_session_id = 执行会话（ToolSessionContext 注入）；worktree/branch/fixer 服务端解析
        return deps.bugs.resolveBug({
          projectId,
          bugId: parsed.bug_id,
          outcome: parsed.outcome,
          ...(parsed.commit_hash !== undefined ? { commitHash: parsed.commit_hash } : {}),
          ...(parsed.unresolved_reason !== undefined ? { unresolvedReason: parsed.unresolved_reason } : {}),
          ...(parsed.fix_approach !== undefined ? { fixApproach: parsed.fix_approach } : {}),
          fixSessionId: sessionId,
        })
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
