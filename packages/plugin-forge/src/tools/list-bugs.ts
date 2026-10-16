// listBugs tool 定义（bug-recurrence-chain——主 agent 专属台账查询面：关键词/状态/offset/limit）。
// 四参直透 core ListBugsQuery（search 六字段命中 / status 三态 chips / sort active|created /
// offset+limit 服务端排序后切片——core small-domains/bugs.ts listBugs 承载，本壳零 core 改动）。
// 面分治：仅主 agent——worker 面 deny（assemble.ts FORGE_DENY_IN_WORKER 承载）。
// 参照 list-tasks.ts 薄壳模式：参数执行点防御收窄 / callToolFace 路由（typed 错误 → 失败
// DTO formatErr + tool-error 事件发射）/ formatOk 成功渲染（✓ 计数 + 逐行键值）。
import type { BugCard, BugStatus, ListBugsQuery } from '@dsh-forge/contracts'
import { BUG_STATUSES } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalEnum, optionalNonNegativeInteger, optionalPositiveInteger, optionalString, optionalStringArray, requireArgsObject } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

const TOOL = 'listBugs'

const BUG_SORTS = ['active', 'created'] as const

/** agent 面参数（四参全可选——全缺省 = 全库全量） */
export interface ListBugsToolArgs {
  readonly search?: string
  readonly status?: readonly BugStatus[]
  readonly sort?: (typeof BUG_SORTS)[number]
  readonly offset?: number
  readonly limit?: number
}

/** status 元素词表收窄（三态词表外即拒——含 tool 可读上下文） */
function optionalBugStatusArray(a: Record<string, unknown>, key: string, tool: string): BugStatus[] | undefined {
  const raw = optionalStringArray(a, key, tool)
  if (raw === undefined) return undefined
  return raw.map((e) => {
    if (!(BUG_STATUSES as readonly string[]).includes(e)) {
      throw new Error(`${tool}: ${key} must only contain [${BUG_STATUSES.join(', ')}]`)
    }
    return e as BugStatus
  })
}

/** 参数防御性收窄 */
export function parseListBugsArgs(args: unknown): ListBugsToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: {
    search?: string
    status?: BugStatus[]
    sort?: (typeof BUG_SORTS)[number]
    offset?: number
    limit?: number
  } = {}
  const search = optionalString(a, 'search', TOOL)
  if (search !== undefined) out.search = search
  const status = optionalBugStatusArray(a, 'status', TOOL)
  if (status !== undefined) out.status = status
  const sort = optionalEnum(a, 'sort', BUG_SORTS, TOOL)
  if (sort !== undefined) out.sort = sort
  const offset = optionalNonNegativeInteger(a, 'offset', TOOL)
  if (offset !== undefined) out.offset = offset
  const limit = optionalPositiveInteger(a, 'limit', TOOL)
  if (limit !== undefined) out.limit = limit
  return out
}

/**
 * listBugs 返回体注册面输出 schema（{bugs: BugCard[]} 轻镜像 + 失败支——items 不设
 * additionalProperties:false，行级投影宽容；链列 recurrenceOf 可选）。
 */
export const LIST_BUGS_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  properties: {
    bugs: {
      type: 'array',
      description: 'Matching bug cards in service order (core BugCard shape).',
      items: {
        type: 'object',
        properties: {
          bugId: { type: 'string' },
          summary: { type: 'string' },
          bugStatus: { type: 'string', description: "'open' | 'fixed' | 'unresolved'." },
          errorType: { type: 'string' },
          reporter: { type: 'string' },
          createdAt: { type: 'string' },
          commitHash: { type: 'string', description: 'fixed evidence (absent until backfilled).' },
          recurrenceOf: { type: 'string', description: 'Recurrence-chain predecessor bug_id (absent on chain roots).' },
        },
        required: ['bugId', 'summary', 'bugStatus', 'reporter', 'createdAt'],
      },
    },
  },
  required: ['bugs'],
})

/** BugCard 行 → 模型可见文本（formatOk 双友好：✓ 计数 + 逐行状态/摘要/链位） */
function renderListBugsResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const { bugs } = value as { bugs: readonly BugCard[] }
  const lines =
    bugs.length === 0
      ? ['(no matching bugs)']
      : bugs.map((b) => {
          const bits = [`- ${b.bugId} [${b.bugStatus}] ${b.summary}`]
          if (b.errorType !== undefined) bits.push(`  errorType: ${b.errorType}`)
          if (b.commitHash !== undefined) bits.push(`  commit: ${b.commitHash}`)
          if (b.recurrenceOf !== undefined) bits.push(`  recurrence of: ${b.recurrenceOf}`)
          bits.push(`  reported: ${b.createdAt} by ${b.reporter}`)
          return bits.join('\n')
        })
  return formatOk(`${bugs.length} bug(s) matched`, lines)
}

/** tool 定义工厂（deps.bugs 注入 core bug 域服务——装配必给） */
export function createListBugsTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'List bug ledger cards (main agent only). Filters pass straight through to the core service: search (substring hit on any of the six text fields — summary / bugDesc / triggerDesc / expected / actual / errorType), status (subset of open/fixed/unresolved), sort (active = active-first, created = newest first), and offset/limit pagination (server slices after sorting; omit limit = full result). Use to survey the ledger, to find recurrence-chain candidates before recordBug (pass the found bug_id as recurrenceOf), and to answer "which bugs exist".',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Free-text filter — matched server-side against any of the six text fields (summary / bugDesc / triggerDesc / expected / actual / errorType).' },
        status: { type: 'array', items: { type: 'string' }, description: "Status chips filter (subset of 'open'/'fixed'/'unresolved'); empty or omitted = all." },
        sort: { type: 'string', description: 'active = active-first / created = newest first.' },
        offset: { type: 'number', description: 'Pagination offset after server-side sort (default 0; non-negative integer).' },
        limit: { type: 'number', description: 'Page size (positive integer; default = full result).' },
      },
    },
    output: { schema: LIST_BUGS_OUTPUT_SCHEMA, render: renderListBugsResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<unknown | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseListBugsArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const query: ListBugsQuery = {
          projectId,
          ...(parsed.search !== undefined ? { search: parsed.search } : {}),
          ...(parsed.status !== undefined ? { status: [...parsed.status] } : {}),
          ...(parsed.sort !== undefined ? { sort: parsed.sort } : {}),
          ...(parsed.offset !== undefined ? { offset: parsed.offset } : {}),
          ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
        }
        const bugs = await deps.bugs.listBugs(query)
        return { bugs }
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
