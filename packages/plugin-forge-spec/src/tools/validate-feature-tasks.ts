// validateFeatureTasks tool 定义（定位：业务——M3 Interface「forgeFeatures 域动词族」
// 的只读校验面（Interface 1 钉在任务域服务——签名不变 { projectId, featureSlug }）：
// 单 feature 容器五类检查 + M3 扩展项（2.1 容器校验域扩展——漂移连容器表可抓），
// 突击容器无入口（proposal 直挂无相位域）。渲染 = formatOk/formatErr 逐项双友好文本
// （裁决⑨：全绿首行 ✓ + 覆盖面行；有违规首行 ✗ + 违规逐行——含任务键 slug/localId，
// agent 可直达修复）。只读零写入——诊断两路（UF-3「发送给 agent」）的消息数据源同族。
import type { TaskRef, ValidateFeatureTasksInput, ValidateReport, Violation } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import type { ForgeSpecToolDeps } from './index.js'
import { requireArgsObject, requiredString } from './args.js'
import { requireProjectId, sessionContextOf } from './session.js'

const TOOL = 'validateFeatureTasks'

/** agent 面参数 */
export interface ValidateFeatureTasksToolArgs {
  /** feature 容器自然键（恒单 feature——批量语义归流程层） */
  readonly feature_slug: string
}

/** 参数防御性收窄 */
export function parseValidateFeatureTasksArgs(args: unknown): ValidateFeatureTasksToolArgs {
  const a = requireArgsObject(args, TOOL)
  return { feature_slug: requiredString(a, 'feature_slug', TOOL) }
}

/** ValidateReport 的注册面输出 schema（violations 可空数组；checked 恒在场） */
const VALIDATE_FEATURE_TASKS_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    violations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          message: { type: 'string' },
          taskRef: { type: 'object' },
        },
        required: ['kind', 'message'],
      },
    },
    checked: {
      type: 'object',
      properties: { featureSlug: { type: 'string' }, tasks: { type: 'integer' } },
      required: ['featureSlug', 'tasks'],
    },
  },
  required: ['violations', 'checked'],
} as const

/** 任务自然键呈现（slug/localId——agent 面识别键，修复直达锚） */
function taskKeyOf(taskRef: TaskRef): string {
  return `${taskRef.slug}/${taskRef.localId}`
}

/** 单条违规 → 双友好行（✗ 含任务键——任务级违规必带，feature 级缺省） */
function violationLine(v: Violation): string {
  return v.taskRef === undefined ? `✗ [${v.kind}] ${v.message}` : `✗ [${v.kind}] ${v.message} (${taskKeyOf(v.taskRef)})`
}

/** ValidateReport → 模型可见文本（formatOk/formatErr 双友好逐项） */
export function renderValidateReport(v: ValidateReport): readonly TextContentBlock[] {
  const head =
    v.violations.length === 0
      ? `✓ Feature ${v.checked.featureSlug} task graph healthy — ${v.checked.tasks} tasks checked, no violations`
      : `✗ Feature ${v.checked.featureSlug} has ${v.violations.length} violation(s) across ${v.checked.tasks} tasks`
  const lines = [head, ...v.violations.map(violationLine)]
  return [{ type: 'text', text: lines.join('\n') }]
}

/** tool 定义工厂 */
export function createValidateFeatureTasksTool(deps: ForgeSpecToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Validate one feature container’s task graph: the five structural checks (phase invariant, cycles, liveness, record chain, topology) plus container drift extensions. Read-only — call it after task breakdown or when a dispatch loop seems stuck; every reported violation names the offending task by slug/local-id so fixes can go straight to it.',
    parameters: {
      type: 'object',
      properties: {
        feature_slug: { type: 'string', description: 'Feature slug to validate (one feature at a time).' },
      },
      required: ['feature_slug'],
    },
    output: { schema: VALIDATE_FEATURE_TASKS_OUTPUT_SCHEMA, render: (_a, value) => renderValidateReport(value as ValidateReport) },
    async execute(args: unknown, exec: ToolExecFace): Promise<ValidateReport> {
      const parsed = parseValidateFeatureTasksArgs(args)
      const session = sessionContextOf(exec)
      const projectId = requireProjectId(deps.resolveProjectId, session)
      const input: ValidateFeatureTasksInput = {
        projectId,
        featureSlug: parsed.feature_slug,
      }
      return deps.tasks.validateFeatureTasks(input)
    },
  }
}
