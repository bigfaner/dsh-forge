// host/forge-tools/stage — forge 阶段资产写工具族(任务 4.1)。
//
// tech-design §Interface 2「forge.stage.summarize」的落地形态:单下划线
// 扁平名工具 forge_stage_summarize(spike-1 §1.2 偏差回填:点号名被
// provider 字符集拒绝)。「文档根直写」= 知识系同款语义:桥 → IPC
// stageSummarize 动词 → 内核写 `features/<slug>/stages/<stage>.md`
// (frontmatter { stage, generated, goal } + 摘要正文;generated = 内核
// 铸造),不经 forge CLI。同阶段重写 = 覆盖更新(T4 单一规范文件裁决)。
//
// 门联动:当前阶段的总结资产存在 = 推进门开(advanceStage 是人侧 UF2
// 动词,不经 tool 面);返回体携带写后门态(gateOpen),agent 可据此
// 引导用户在工作台推进。
//
// 结果语义与任务/知识系族一致(executeVia):内核值/业务拒绝 = canonical
// JSON 值返回(ERR_STAGE_ASSET_INVALID / ERR_FEATURE_NOT_FOUND /
// ERR_PROJECT_NOT_FOUND);桥 transport 失败 = throw 上抛会话(Story 9
// 降级链,禁静默)。actor 随帧走审计位(资产文件无作者槽,内核不落盘
// —— 知识系 add 同口径)。

import { defineTool, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ForgeToolBridgeVerb } from './bridge-core'
import { executeVia, TOOL_OUTPUT_SCHEMA, type ForgeTaskToolCallFn } from './task-tools'

/** forge 阶段管线词表(内核 stage CHECK / STAGE_PIPELINE 镜像)。 */
const STAGE_ENUM = ['prd', 'design', 'tasks', 'in-progress', 'completed'] as const

/** 注入面(桥调用直通 + 测试 seam)。 */
export interface ForgeStageToolDeps {
  readonly call: ForgeTaskToolCallFn
}

/** 地址段判定(镜像内核 registry isSegment / task 族 isSegment)。 */
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

/** stage 工具族(1 个扁平名写工具;经 2.1 基座追加注册,不另设通道)。 */
export function createForgeStageTools(deps: ForgeStageToolDeps): ToolDefinition[] {
  const { call } = deps
  const via = (verb: ForgeToolBridgeVerb, args: Record<string, unknown>, exec: ToolRunContext) =>
    executeVia(call, verb, args, exec)

  return [
    defineTool({
      name: 'forge_stage_summarize',
      description: 'Write (or overwrite) the stage summary asset `features/<featureSlug>/stages/<stage>.md` in the project\'s document root — frontmatter { stage, generated, goal } plus the summary body you provide; the file is the single canonical asset for that stage (a rewrite is an overwrite). Generate it for the feature\'s CURRENT stage once its work is done: the asset\'s existence is the stage-advance gate (the human advances the stage in the workbench UI), and the next stage\'s dispatched sessions inject this asset\'s goal + summary as their phase context. The result reports the written path and the live gate verdict (gateOpen).',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Registered workbench project id.' },
        featureSlug: { type: 'string', required: true, description: 'Feature slug (single address segment, no "/").' },
        stage: { type: 'string', required: true, enum: [...STAGE_ENUM], description: 'Stage the asset belongs to (forge pipeline vocabulary).' },
        goal: { type: 'string', required: true, description: 'The stage\'s goal (frontmatter goal) — one non-empty sentence of what this stage set out to deliver.' },
        summary: { type: 'string', required: true, description: 'The stage summary body (markdown, non-empty): what was decided, built, and what the next stage should know.' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        // 白名单断言(T1 镜像,内核复验):slug 段形态 + 阶段词表 —— 形态/
        // 词表错 = 业务拒绝载荷(ERR_STAGE_ASSET_INVALID 同码口径),零桥跳。
        if (!isSegment(args.featureSlug)) {
          return JSON.stringify({
            ok: false,
            code: 'ERR_STAGE_ASSET_INVALID',
            message: `feature slug ${JSON.stringify(args.featureSlug)} must be a single non-empty path segment (no '/', no path separators or control characters)`,
          })
        }
        if (!(STAGE_ENUM as readonly string[]).includes(args.stage)) {
          return JSON.stringify({
            ok: false,
            code: 'ERR_STAGE_ASSET_INVALID',
            message: `stage ${JSON.stringify(args.stage)} is outside the forge stage vocabulary ${STAGE_ENUM.join('/')}`,
          })
        }
        return via('stage_summarize', {
          projectId: args.projectId,
          featureSlug: args.featureSlug,
          stage: args.stage,
          goal: args.goal,
          summary: args.summary,
        }, exec)
      },
    }),
  ]
}
