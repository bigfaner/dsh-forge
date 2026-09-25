// host/forge-tools/feature-read — forge feature 读工具族(任务 2.2)。
//
// tech-design §Interface 2「forge.feature.list / status」的落地形态:扁平名
// 两工具(归宿表「看板 GUI + dsh tool 只读」行),经 2.1 基座路由到内核
// feature 读动词;读写语义 = forge CLI `feature list` / `feature status`
// 数据面(internal/cmd/feature/feature.go 移植基准:manifest frontmatter
// status/created + tasks/index.json 进度 + prd/design/ui/testing 评分;
// created 降序 → mtime 降级)。
//
// 结果语义与任务/知识系族一致(executeVia);featureSlug 段形态在桥前
// 白名单断言(镜像内核同规则,双闸);未注册项目 → ERR_PROJECT_NOT_FOUND。

import { defineTool, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ForgeToolBridgeVerb } from './bridge-core'
import { executeVia, TOOL_OUTPUT_SCHEMA, type ForgeTaskToolCallFn } from './task-tools'

/** 注入面(桥调用直通 + 测试 seam)。 */
export interface ForgeFeatureReadToolDeps {
  readonly call: ForgeTaskToolCallFn
}

/** 地址段判定(镜像内核 knowledge-error.isKnowledgeSegment / task 族 isSegment)。 */
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

/** feature 读工具族(2 个扁平名工具;经 2.1 基座追加注册,不另设通道)。 */
export function createForgeFeatureReadTools(deps: ForgeFeatureReadToolDeps): ToolDefinition[] {
  const { call } = deps
  const via = (verb: ForgeToolBridgeVerb, args: Record<string, unknown>, exec: ToolRunContext) =>
    executeVia(call, verb, args, exec)

  return [
    defineTool({
      name: 'forge_feature_list',
      description: 'List every feature of a registered project with status, progress and artifact scores (the forge CLI `feature list` data plane over docs/features/*/manifest.md): slug, manifest status, created date, completed/total task counts from tasks/index.json, and prd/design/ui/tests scores from each artifact\'s frontmatter. Sorted created-descending with manifest mtime fallback; an unregistered project answers ERR_PROJECT_NOT_FOUND.',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        return via('feature_list', { projectId: args.projectId }, exec)
      },
    }),
    defineTool({
      name: 'forge_feature_status',
      description: 'Show one feature\'s detailed status (the forge CLI `feature status` data plane): manifest status, per-status task counts from tasks/index.json (display order pending/in_progress/completed/blocked/skipped/rejected, total, indexPresent), and prd/design/ui artifact scores. Unknown slugs answer ERR_FEATURE_NOT_FOUND; unregistered projects answer ERR_PROJECT_NOT_FOUND.',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        featureSlug: { type: 'string', required: true, description: 'Feature slug (single address segment, no "/").' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        if (!isSegment(args.featureSlug)) {
          return JSON.stringify({
            ok: false,
            code: 'ERR_KNOWLEDGE_PATH_INVALID',
            message: `feature slug ${JSON.stringify(args.featureSlug)} must be a single non-empty path segment (no '/', no path separators or control characters)`,
          })
        }
        return via('feature_status', { projectId: args.projectId, featureSlug: args.featureSlug }, exec)
      },
    }),
  ]
}
