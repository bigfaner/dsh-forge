// aggregateBugs tool 定义（recurrence-signal-tiering 聚合统计——errorType 分组计数表，
// 主 agent 工具面 + triage 只读 face 双暴露）。只读薄壳：core aggregateByErrorType 承载
// 分组/计数/排序（total 降序、同频词面升序），本壳仅做可选 errorType 子串过滤（组级
// case-insensitive——聚合表小，工具层过滤即够，core 读法零改动）。面分治：主 agent +
// 处置代理（triage 量化判据 SOP 消费）；worker 面 deny（assemble.ts FORGE_DENY_IN_WORKER）。
import type { BugErrorTypeAggregate } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalString, requireArgsObject } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

const TOOL = 'aggregateBugs'

/** agent 面参数（errorType 可选——组级子串过滤；全缺省 = 全部分组计数表） */
export interface AggregateBugsToolArgs {
  readonly errorType?: string
}

/** 参数防御性收窄 */
export function parseAggregateBugsArgs(args: unknown): AggregateBugsToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: { errorType?: string } = {}
  const errorType = optionalString(a, 'errorType', TOOL)
  if (errorType !== undefined) out.errorType = errorType
  return out
}

/**
 * aggregateBugs 返回体注册面输出 schema（{groups: BugErrorTypeAggregate[]} 轻镜像 +
 * 失败支——items 行级投影宽容）。
 */
export const AGGREGATE_BUGS_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      description: 'errorType groups in service order (total desc, then label asc).',
      items: {
        type: 'object',
        properties: {
          errorType: { type: 'string' },
          total: { type: 'number', description: 'All-time count (unresolved included).' },
          open: { type: 'number' },
          fixed: { type: 'number' },
          lastSeenAt: { type: 'string', description: 'Latest updated_at within the group.' },
        },
        required: ['errorType', 'total', 'open', 'fixed', 'lastSeenAt'],
      },
    },
  },
  required: ['groups'],
})

/** 聚合行 → 模型可见文本（formatOk：✓ 组数 + 逐行计数表） */
function renderAggregateBugsResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const { groups } = value as { groups: readonly BugErrorTypeAggregate[] }
  const lines =
    groups.length === 0
      ? ['(no errorType groups)']
      : groups.map((g) => `- ${g.errorType}: total ${g.total} / open ${g.open} / fixed ${g.fixed} (last seen ${g.lastSeenAt})`)
  return formatOk(`${groups.length} errorType group(s)`, lines)
}

/** tool 定义工厂（deps.bugs 注入 core bug 域服务——装配必给） */
export function createAggregateBugsTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      "Aggregate the bug ledger by errorType (main agent and the read-only triage agent). Returns a grouped count table — one row per errorType with {total, open, fixed, lastSeenAt} over the full history (unresolved counts toward total only; empty/blank errorType rows never group). Optional errorType substring filter (case-insensitive) narrows the table. Quantitative heuristic: total>=3 AND open>=1 = a recurring family past fixes have not rooted out (strong evidence for escalation or investigation before another blind fix); total>=3 AND open=0 = family converged. Pair with listBugs (search also hits the suspected location field) and getBug for per-bug detail.",
    parameters: {
      type: 'object',
      properties: {
        errorType: { type: 'string', description: 'Optional substring filter on group errorType labels (case-insensitive); omitted = all groups.' },
      },
    },
    output: { schema: AGGREGATE_BUGS_OUTPUT_SCHEMA, render: renderAggregateBugsResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<unknown | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseAggregateBugsArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        let groups = await deps.bugs.aggregateByErrorType(projectId)
        if (parsed.errorType !== undefined) {
          const needle = parsed.errorType.toLowerCase()
          groups = groups.filter((g) => g.errorType.toLowerCase().includes(needle))
        }
        return { groups }
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
