// submitTask tool 定义（定位：业务——Interface 8 六动词之一）。
// 任务定位 = slug + local_id 两显式参（必填）；result = success|blocked 双径
//（success 必带 summary、blocked 必带 reason——core 侧 ERR_SUMMARY/REASON_REQUIRED
// 先证，此处仅形状收窄）；gate 嵌套负载平铺为布尔四项 + coverage 小数
//（all-or-none：半门 = 歧义报告，拒）；commit_hash 平移。
// sessionId 由 exec ctx 提取（执行会话——与 claim 的派发会话相异可判）。
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
import { requireProjectId, requireSessionId, sessionContextOf } from './session.js'

const TOOL = 'submitTask'

/** agent 面参数（gate 平铺四布尔 + coverage） */
export interface SubmitTaskToolArgs {
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

/** SubmitTaskResult 的注册面输出 schema */
const SUBMIT_TASK_OUTPUT_SCHEMA = {
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
} as const

/** SubmitTaskResult → 模型可见文本 */
function renderSubmitResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  const v = value as SubmitTaskResult
  const lines = [`Task submitted: ${v.taskId} → ${v.status}`]
  if (v.restored.length > 0) {
    lines.push(`Auto-restored (fix completed, sources unblocked): ${v.restored.map((r) => `${r.slug}/${r.localId}`).join(', ')}`)
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

/** tool 定义工厂 */
export function createSubmitTaskTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Submit the outcome of a claimed task (located by slug + local_id): result=success requires a summary and the quality-gate results (compile/fmt/lint/test booleans, optional coverage fraction); result=blocked requires the blocking reason and typically spawns a fix task via addTask with the blocked task as source. Completing a fix auto-restores its blocked source.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Feature slug of the task being submitted.' },
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
    async execute(args: unknown, exec: ToolExecFace): Promise<SubmitTaskResult> {
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
    },
  }
}
