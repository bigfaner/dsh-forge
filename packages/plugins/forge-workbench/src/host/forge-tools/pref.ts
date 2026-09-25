// host/forge-tools/pref — forge 偏好读工具族(任务 3.1)。
//
// tech-design §Interface 2「forge.pref.get」的落地形态:单扁平名只读工具
// forge_pref_get(读生效值,三级解析 feature > project > global > 注册表
// 默认)。tier 寻址 = 参数组合:两参缺省 = 全局;仅 projectId = 项目级;
// projectId + featureSlug = feature 级(限定地址 `<projectId>/<featureSlug>`
// 由 client dispatch 面组合 —— 工具面零地址方言知识,双闸只在段形态)。
//
// 结果语义与任务/知识系族一致(executeVia):内核值/业务拒绝 = canonical
// JSON 值返回;桥 transport 失败 = throw 上抛会话(Story 9 降级链)。返回
// = getPrefs 全键投影(键 + 类型元数据 + 生效值 + 来源层级;键集经 API
// 暴露,surfaces 不出现 —— PRD D3)。

import { defineTool, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ForgeToolBridgeVerb } from './bridge-core'
import { executeVia, TOOL_OUTPUT_SCHEMA, type ForgeTaskToolCallFn } from './task-tools'

/** 注入面(桥调用直通 + 测试 seam)。 */
export interface ForgePrefToolDeps {
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

/** pref 工具族(1 个扁平名只读工具;经 2.1 基座追加注册,不另设通道)。 */
export function createForgePrefTools(deps: ForgePrefToolDeps): ToolDefinition[] {
  const { call } = deps
  const via = (verb: ForgeToolBridgeVerb, args: Record<string, unknown>, exec: ToolRunContext) =>
    executeVia(call, verb, args, exec)

  return [
    defineTool({
      name: 'forge_pref_get',
      description: 'Read the effective three-tier forge preferences (resolve feature > project > global, falling back to the forge config defaults). Pass neither id for the global tier, projectId only for the project tier, or projectId + featureSlug for the feature tier. Returns every registered key (auto.*/worktree.*/coverage.*/eval.*, surfaces excluded) with its effective value, source tier, override flag and type metadata — read-only (edits belong to the workbench preference face).',
      parameters: {
        projectId: { type: 'string', description: 'Registered workbench project id; omit for the global tier.' },
        featureSlug: { type: 'string', description: 'Feature slug (single address segment, no "/"); requires projectId — selects the feature tier.' },
      },
      output: OUTPUT,
      async execute(args, exec) {
        // tier 组合白名单:featureSlug 必随 projectId(全局/项目两级不接受它);
        // 段形态断言镜像内核 registry.isSegment(双闸,T1)。组合错/形态错 =
        // 业务拒绝载荷(ERR_PREF_SCOPE_INVALID),非 transport 失败。
        if (args.featureSlug !== undefined) {
          if (typeof args.projectId !== 'string' || args.projectId === '') {
            return JSON.stringify({
              ok: false,
              code: 'ERR_PREF_SCOPE_INVALID',
              message: 'featureSlug requires projectId (feature tier = projectId + featureSlug; omit both ids for the global tier, projectId only for the project tier)',
            })
          }
          if (!isSegment(args.featureSlug)) {
            return JSON.stringify({
              ok: false,
              code: 'ERR_PREF_SCOPE_INVALID',
              message: `feature slug ${JSON.stringify(args.featureSlug)} must be a single non-empty path segment (no '/', no path separators or control characters)`,
            })
          }
        }
        return via('pref_get', {
          ...(args.projectId === undefined ? {} : { projectId: args.projectId }),
          ...(args.featureSlug === undefined ? {} : { featureSlug: args.featureSlug }),
        }, exec)
      },
    }),
  ]
}
