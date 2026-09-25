// host/forge-tools/proposal — forge 提案读工具族(任务 5.3)。
//
// tech-design §Interface 2「forge.proposal.list / show」的落地形态:扁平名
// 两只读工具(spike-① 下划线命名,归宿表「proposal list / show → 提案看板
// GUI + dsh tool 只读」行),经 2.1 基座路由到内核提案读动词(UF5 数据面,
// DF007):list → getProposalBoard(全量列表 + created 降序排序基线 +
// hasEval);show → readProposalDoc(markdown 原文,kind = proposal|eval,
// 缺省 proposal)。读写语义 = forge CLI `proposal list` / `proposal show`
// 数据面(移植基准 pkg/proposal/proposal.go + pkg/infocmd Discover)。
//
// 只读硬约束(Hard Rule):本族零写动词 —— 提案状态流转归终端/agent 会话;
// 桥动词 proposal_list/proposal_show 在 client dispatch 面 = 只读腿(不携带
// actor 透传写审计,与 feature 读族同口径)。
//
// 结果语义与任务/知识系族一致(executeVia):内核值/业务拒绝 = canonical
// JSON 值返回;桥 transport 失败 = throw 上抛会话(Story 9 降级链)。slug
// 段形态在桥前白名单断言(镜像内核 isSegment 同规则,双闸);kind 词表
// (proposal|eval)同为桥前断言。

import { defineTool, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ForgeToolBridgeVerb } from './bridge-core'
import { executeVia, TOOL_OUTPUT_SCHEMA, type ForgeTaskToolCallFn } from './task-tools'

/** 注入面(桥调用直通 + 测试 seam)。 */
export interface ForgeProposalToolDeps {
  readonly call: ForgeTaskToolCallFn
}

/** 地址段判定(镜像内核 proposals-service isSegment / task 族同规则)。 */
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

const OUTPUT = {
  schema: TOOL_OUTPUT_SCHEMA,
  render: (_args: unknown, value: string): Array<{ type: 'text'; text: string }> => [{ type: 'text', text: value }],
}

/** 段形态拒绝载荷(镜像内核 ERR_PROPOSAL_PATH_INVALID;ok 由调用方补)。 */
function pathInvalid(slug: string): { code: 'ERR_PROPOSAL_PATH_INVALID'; message: string } {
  return {
    code: 'ERR_PROPOSAL_PATH_INVALID',
    message: `proposal slug ${JSON.stringify(slug)} must be a single non-empty path segment (no '/', no path separators or control characters)`,
  }
}

/** kind 词表拒绝载荷(镜像内核 handler 浅校验)。 */
function kindInvalid(kind: string): { code: 'ERR_PROPOSAL_DOC_INVALID'; message: string } {
  return {
    code: 'ERR_PROPOSAL_DOC_INVALID',
    message: `kind ${JSON.stringify(kind)} must be one of proposal/eval`,
  }
}

/** 提案读工具族(2 个扁平名只读工具;经 2.1 基座追加注册,不另设通道)。 */
export function createForgeProposalTools(deps: ForgeProposalToolDeps): ToolDefinition[] {
  const { call } = deps
  const via = (verb: ForgeToolBridgeVerb, args: Record<string, unknown>, exec: ToolRunContext) =>
    executeVia(call, verb, args, exec)

  return [
    defineTool({
      name: 'forge_proposal_list',
      description: 'List every proposal of a registered project (the forge CLI `proposal list` data plane over docs/proposals/*/proposal.md): slug, frontmatter status (draft/accepted/rejected/superseded, case-normalized), author, created date (mtime fallback), the associated feature slug when features/<slug>/manifest.md exists (null = early pipeline), and whether an eval report exists under eval/. Sorted created-descending; unregistered projects answer ERR_PROJECT_NOT_FOUND. Read-only — proposal status transitions belong to the terminal/agent sessions.',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        return via('proposal_list', { projectId: args.projectId }, exec)
      },
    }),
    defineTool({
      name: 'forge_proposal_show',
      description: 'Read one proposal\'s raw markdown (the forge CLI `proposal show` data plane, read-only): kind proposal returns proposals/<slug>/proposal.md verbatim; kind eval returns the deterministic eval-report pick under proposals/<slug>/eval/ (final-report.md preferred, lexicographic first otherwise). Unknown slugs answer ERR_PROPOSAL_NOT_FOUND; unregistered projects answer ERR_PROJECT_NOT_FOUND.',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        slug: { type: 'string', required: true, description: 'Proposal slug (single address segment, no "/").' },
        kind: { type: 'string', description: 'Document kind: proposal (default) or eval.' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        if (!isSegment(args.slug)) {
          return JSON.stringify({ ok: false, ...pathInvalid(args.slug) })
        }
        const kind = args.kind === undefined ? 'proposal' : args.kind
        if (kind !== 'proposal' && kind !== 'eval') {
          return JSON.stringify({ ok: false, ...kindInvalid(kind) })
        }
        return via('proposal_show', { projectId: args.projectId, slug: args.slug, kind }, exec)
      },
    }),
  ]
}
