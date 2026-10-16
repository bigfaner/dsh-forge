// getBug tool 定义（bug-recurrence-chain——按 bug_id 查全卡 + 链上下文）。
// 面分治：主 + worker——worker forge 面第五动词（contracts WORKER_FORGE_TOOLS；fix-bug
// coding-fix worker 挂链深查，与派发简报注入的链候选发现两径互补）。
// core getBug 承载（small-domains/bugs.ts——GetBugQuery/GetBugResponse，孤条 chain 缺席），
// 本壳零 core 改动。参照 resolve-bug.ts 薄壳模式：参数执行点防御收窄（空 bug_id 拒）/
// callToolFace 路由 / formatOk 成功渲染（全卡键值 + 链时间线）。
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { GetBugResponse } from '@dsh-forge/contracts'
import type { ForgeToolDeps } from './index.js'
import { requireArgsObject, requiredString } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { BUG_CARD_SUCCESS_SCHEMA } from './record-bug.js'
import { requireProjectId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

const TOOL = 'getBug'

/** agent 面参数（单参薄面——bug_id 必填非空） */
export interface GetBugToolArgs {
  readonly bug_id: string
}

/** 参数防御性收窄（执行点自证——空 bug_id 拒绝） */
export function parseGetBugArgs(args: unknown): GetBugToolArgs {
  const a = requireArgsObject(args, TOOL)
  return { bug_id: requiredString(a, 'bug_id', TOOL) }
}

/**
 * getBug 返回体注册面输出 schema（全卡 + 链上下文；孤条 chain 键缺席——
 * 单条 bug 弹框语言不变；失败支）。
 */
export const GET_BUG_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  properties: {
    card: {
      type: 'object',
      description: 'Full BugCard (all fields mirrored from the ledger row).',
      properties: BUG_CARD_SUCCESS_SCHEMA.properties,
      required: [...BUG_CARD_SUCCESS_SCHEMA.required],
    },
    chain: {
      type: 'object',
      description: 'Recurrence-chain context (absent for lone bugs — no predecessor and no successors).',
      properties: {
        entries: {
          type: 'array',
          description: 'All chain entries in chronological order (chain root first).',
          items: { type: 'object', properties: { bugId: { type: 'string' }, summary: { type: 'string' }, bugStatus: { type: 'string' }, fixApproach: { type: 'string' }, commitHash: { type: 'string' }, createdAt: { type: 'string' } } },
        },
        currentIndex: { type: 'number', description: '0-based position of the requested bug on the chain.' },
        length: { type: 'number', description: 'Chain length (recurrence count = length - 1).' },
        rootBugId: { type: 'string', description: 'Chain root bug_id (= entries[0].bugId).' },
      },
      required: ['entries', 'currentIndex', 'length', 'rootBugId'],
    },
  },
  required: ['card'],
})

/** GetBugResponse → 模型可见文本（formatOk 双友好：✓ 摘要行 + 全卡键值 + 链时间线） */
function renderGetBugResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as GetBugResponse
  const c = v.card
  const lines = [`Bug ${c.bugId} [${c.bugStatus}] — ${c.summary}`]
  if (c.errorType !== undefined) lines.push(`- errorType: ${c.errorType}`)
  if (c.suspected !== undefined) lines.push(`- suspected: ${c.suspected}`)
  if (c.bugStatus === 'fixed') {
    if (c.commitHash !== undefined) lines.push(`- commit: ${c.commitHash}`)
    if (c.fixApproach !== undefined) lines.push(`- approach: ${c.fixApproach}`)
  } else if (c.unresolvedReason !== undefined) {
    lines.push(`- reason: ${c.unresolvedReason}`)
  }
  if (c.recurrenceOf !== undefined) lines.push(`- recurrence of: ${c.recurrenceOf}`)
  if (v.chain !== undefined) {
    lines.push(`- chain: ${v.chain.length} record(s), recurrence count ${v.chain.length - 1}, root ${v.chain.rootBugId}, this = #${v.chain.currentIndex}`)
    v.chain.entries.forEach((e, i) => {
      const mark = i === v.chain!.currentIndex ? ' <-- this' : ''
      lines.push(`  #${i} ${e.bugId} [${e.bugStatus}] ${e.summary}${mark}`)
      if (e.fixApproach !== undefined) lines.push(`     approach: ${e.fixApproach}`)
    })
  }
  return formatOk(`Bug ${c.bugId} [${c.bugStatus}]`, lines)
}

/** tool 定义工厂（deps.bugs 注入 core bug 域服务——装配必给） */
export function createGetBugTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Fetch one bug by bug_id: the full BugCard plus its recurrence-chain context (when the bug sits on a chain — chronological entries, this bug position, chain length, root bug_id). Available to main agent and workers: coding-fix workers use it for deep chain inspection before recordBug (to pick the correct recurrenceOf predecessor) and to read prior fix approaches. Unknown bug_id is rejected server-side.',
    parameters: {
      type: 'object',
      properties: {
        bug_id: { type: 'string', description: 'Bug id (uuid proxy key — from listBugs rows, recordBug results, or dispatch brief chain candidates).' },
      },
      required: ['bug_id'],
    },
    output: { schema: GET_BUG_OUTPUT_SCHEMA, render: renderGetBugResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<GetBugResponse | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseGetBugArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        return deps.bugs.getBug({ projectId, bugId: parsed.bug_id })
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
