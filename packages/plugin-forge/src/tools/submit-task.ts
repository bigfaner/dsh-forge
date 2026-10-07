// submitTask tool 定义（定位：业务——M3 终态六动词之一）。
// 任务定位 = slug + local_id 两显式参（必填；slug = 容器 slug——feature 目录名 /
// proposal slug，tasks.slug ≡ 容器 slug 服务不变量，M3 容器化口径）；result =
// success|blocked 双径（success 必带 summary、blocked 必带 reason——core 侧
// ERR_SUMMARY/REASON_REQUIRED 先证，此处仅形状收窄；AC 任务另经 2.6 双门
// ERR_TEST_EVIDENCE_REQUIRED / ERR_GATE_SUMMARY_REQUIRED——失败面 formatErr 带
// 违规清单逐行）；gate 嵌套负载平铺为布尔四项 + coverage 小数（all-or-none：半门 =
// 歧义报告，拒）；commit_hash 平移。
// sessionId 由 exec ctx 提取（执行会话——与派发会话相异可判）。
// 返回面双友好（裁决⑨）：成功 formatOk；typed 服务错误 → 失败 DTO formatErr。
import type { SubmitTaskInput, SubmitTaskResult, TaskGateReport, TaskRef } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import {
  optionalBoolean,
  optionalFraction,
  optionalString,
  optionalStringArray,
  requireArgsObject,
  requiredEnum,
  requiredString,
} from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, requireSessionId, sessionContextOf } from './session.js'

const TOOL = 'submitTask'

/** agent 面参数（gate 平铺四布尔 + coverage） */
export interface SubmitTaskToolArgs {
  /** 容器 slug（feature 目录名 / proposal slug——任务自然键第一段） */
  readonly slug: string
  readonly local_id: string
  readonly result: 'success' | 'blocked'
  readonly reason?: string
  readonly summary?: string
  /** 正斜杠路径清单 */
  readonly files?: readonly string[]
  readonly gate_compile?: boolean
  readonly gate_fmt?: boolean
  readonly gate_lint?: boolean
  readonly gate_test?: boolean
  readonly gate_coverage?: number
  readonly commit_hash?: string
}

/** gate 平铺四参 → TaskGateReport（all-or-none + coverage 依赖门在场） */
export function gateOf(parsed: SubmitTaskToolArgs): TaskGateReport | undefined {
  const compile = parsed.gate_compile
  const fmt = parsed.gate_fmt
  const lint = parsed.gate_lint
  const test = parsed.gate_test
  const present = [compile, fmt, lint, test].filter((v) => v !== undefined)
  if (present.length === 0) {
    if (parsed.gate_coverage !== undefined) {
      throw new Error(`${TOOL}: gate_coverage requires the four gate results (gate_compile/fmt/lint/test)`)
    }
    return undefined
  }
  if (present.length !== 4) {
    throw new Error(`${TOOL}: gate results are all-or-none — give gate_compile, gate_fmt, gate_lint and gate_test together`)
  }
  return {
    compile: compile === true,
    fmt: fmt === true,
    lint: lint === true,
    test: test === true,
    ...(parsed.gate_coverage !== undefined ? { coverage: parsed.gate_coverage } : {}),
  }
}

/** 参数防御性收窄 */
export function parseSubmitTaskArgs(args: unknown): SubmitTaskToolArgs {
  const a = requireArgsObject(args, TOOL)
  const out: {
    slug: string
    local_id: string
    result: 'success' | 'blocked'
    reason?: string
    summary?: string
    files?: string[]
    gate_compile?: boolean
    gate_fmt?: boolean
    gate_lint?: boolean
    gate_test?: boolean
    gate_coverage?: number
    commit_hash?: string
  } = {
    slug: requiredString(a, 'slug', TOOL),
    local_id: requiredString(a, 'local_id', TOOL),
    result: requiredEnum(a, 'result', ['success', 'blocked'] as const, TOOL),
  }
  const reason = optionalString(a, 'reason', TOOL)
  if (reason !== undefined) out.reason = reason
  const summary = optionalString(a, 'summary', TOOL)
  if (summary !== undefined) out.summary = summary
  const files = optionalStringArray(a, 'files', TOOL)
  if (files !== undefined) out.files = files
  for (const key of ['gate_compile', 'gate_fmt', 'gate_lint', 'gate_test'] as const) {
    const v = optionalBoolean(a, key, TOOL)
    if (v !== undefined) out[key] = v
  }
  const coverage = optionalFraction(a, 'gate_coverage', TOOL)
  if (coverage !== undefined) out.gate_coverage = coverage
  const commitHash = optionalString(a, 'commit_hash', TOOL)
  if (commitHash !== undefined) out.commit_hash = commitHash
  gateOf(out) // 组合形状先证（all-or-none / coverage 依赖）
  return out
}

/** SubmitTaskResult 的注册面输出 schema（+ 失败支） */
const SUBMIT_TASK_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    taskId: { type: 'string' },
    status: { type: 'string', description: 'Task status after the submit (completed or blocked).' },
    restored: {
      type: 'array',
      items: { type: 'string' },
      description: 'slug/localId natural keys auto-restored by the recovery hook (source tasks whose fix completed).',
    },
  },
  required: ['taskId', 'status', 'restored'],
})

/** SubmitTaskResult → 模型可见文本（formatOk：✓ 首行 + 键值行 + 恢复钩子回报行） */
function renderSubmitResult(args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as SubmitTaskResult
  const a = args as { slug?: string; local_id?: string }
  const where = a.slug !== undefined && a.local_id !== undefined ? `${a.slug}/${a.local_id} ` : ''
  const lines = [
    `- taskId: ${v.taskId}`,
    ...v.restored.map((r) => `- restored: ${r.slug}/${r.localId} (source unblocked)`),
  ]
  return formatOk(`Task ${where}submitted — ${v.status}`, lines)
}

/** tool 定义工厂 */
export function createSubmitTaskTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Submit the outcome of a claimed task (located by its container slug + local_id): result=success requires a summary and the quality-gate results (compile/fmt/lint/test booleans, optional coverage fraction); tasks created with acceptance_criteria also need gate.test passing (evidence gate); result=blocked requires the blocking reason and typically spawns a fix task via addTask with the blocked task as its source. Completing a fix auto-restores its blocked source.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Container slug of the task being submitted (feature directory name or proposal slug).' },
        local_id: { type: 'string', description: 'Local id of the task being submitted.' },
        result: { type: 'string', description: "'success' or 'blocked'." },
        reason: { type: 'string', description: 'Why the task is blocked (required for result=blocked).' },
        summary: { type: 'string', description: 'Execution summary, key decisions (required for result=success).' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Actually changed files, forward-slash paths.',
        },
        gate_compile: { type: 'boolean', description: 'Quality gate: compile passed (give all four together).' },
        gate_fmt: { type: 'boolean', description: 'Quality gate: formatting passed.' },
        gate_lint: { type: 'boolean', description: 'Quality gate: lint passed.' },
        gate_test: { type: 'boolean', description: 'Quality gate: tests passed.' },
        gate_coverage: { type: 'number', description: 'Coverage fraction 0-1 (optional, with the gate booleans).' },
        commit_hash: { type: 'string', description: 'Commit hash containing the change.' },
      },
      required: ['slug', 'local_id', 'result'],
    },
    output: { schema: SUBMIT_TASK_OUTPUT_SCHEMA, render: renderSubmitResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<SubmitTaskResult | ForgeToolFailure> {
      return callToolFace(async () => {
        const parsed = parseSubmitTaskArgs(args)
        const session = sessionContextOf(exec)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const sessionId = requireSessionId(session)
        const taskRef: TaskRef = { slug: parsed.slug, localId: parsed.local_id }
        const gate = gateOf(parsed)
        const input: SubmitTaskInput = {
          projectId,
          taskRef,
          result: parsed.result,
          sessionId,
          ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
          ...(parsed.summary !== undefined ? { summary: parsed.summary } : {}),
          ...(parsed.files !== undefined ? { files: [...parsed.files] } : {}),
          ...(gate !== undefined ? { gate } : {}),
          ...(parsed.commit_hash !== undefined ? { commitHash: parsed.commit_hash } : {}),
        }
        return deps.tasks.submitTask(input)
      })
    },
  }
}
