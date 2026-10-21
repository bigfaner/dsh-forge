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
// 3.4 事件缝：结算成功 → task-submitted（worker 自身会话 id——串联读法执行会话位）；
// typed 错误 → tool-error（emitToolError；deps.events 缺席 = 零事件降级）。
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
import { emitToolError, slugOfToolArgs } from '../events/sink.js'
import { requireProjectId, requireSessionId, sessionContextOf } from './session.js'

const TOOL = 'submitTask'

/** agent 面参数（gate 平铺四布尔 + coverage；S3 结构化记录面：AC 平行数组 + files 分组 + record fields） */
export interface SubmitTaskToolArgs {
  /** 容器 slug（feature 目录名 / proposal slug——任务自然键第一段） */
  readonly slug: string
  readonly local_id: string
  readonly result: 'success' | 'blocked'
  readonly reason?: string
  readonly summary?: string
  /** 正斜杠路径清单（与 files_created/files_modified 并存时须 = 并集——core ERR_FILES_UNION_MISMATCH） */
  readonly files?: readonly string[]
  /** 新建文件分组（→ files_json v2 {created, modified}） */
  readonly files_created?: readonly string[]
  /** 修改文件分组（→ files_json v2 {created, modified}） */
  readonly files_modified?: readonly string[]
  /** AC 逐项核验结果（ac_criteria/ac_met/ac_evidence 三平行数组——同位成项；criterion 与任务定义侧逐项对应——交叉校验不符/met=false 即拒） */
  readonly ac_criteria?: readonly string[]
  readonly ac_met?: readonly boolean[]
  /** 一行简要证明（用例/命令 + 结果；长输出落盘只带路径）——与 ac_criteria 同长或整体缺席 */
  readonly ac_evidence?: readonly string[]
  /** 关键决策（≤3 条） */
  readonly key_decisions?: readonly string[]
  readonly tests_passed?: number
  readonly tests_failed?: number
  /** 记录侧覆盖率小数（与 gate_coverage 互补） */
  readonly coverage?: number
  readonly notes?: string
  readonly gate_compile?: boolean
  readonly gate_fmt?: boolean
  readonly gate_lint?: boolean
  readonly gate_test?: boolean
  readonly gate_coverage?: number
  readonly commit_hash?: string
  /** e2e 取证债（改进7——success 专用：真机 e2e 断言欠账声明 → 实现态部分结算 + 欠账 test-run 任务自动生成） */
  readonly evidence_debt_suite?: string
  readonly evidence_debt_specs?: readonly string[]
  readonly evidence_debt_note?: string
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
    files_created?: string[]
    files_modified?: string[]
    ac_criteria?: string[]
    ac_met?: boolean[]
    ac_evidence?: string[]
    key_decisions?: string[]
    tests_passed?: number
    tests_failed?: number
    coverage?: number
    notes?: string
    gate_compile?: boolean
    gate_fmt?: boolean
    gate_lint?: boolean
    gate_test?: boolean
    gate_coverage?: number
    commit_hash?: string
    evidence_debt_suite?: string
    evidence_debt_specs?: string[]
    evidence_debt_note?: string
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
  const filesCreated = optionalStringArray(a, 'files_created', TOOL)
  if (filesCreated !== undefined) out.files_created = filesCreated
  const filesModified = optionalStringArray(a, 'files_modified', TOOL)
  if (filesModified !== undefined) out.files_modified = filesModified
  const acCriteria = optionalStringArray(a, 'ac_criteria', TOOL)
  const acMetRaw = a['ac_met']
  let acMet: boolean[] | undefined
  if (acMetRaw !== undefined) {
    if (!Array.isArray(acMetRaw) || acMetRaw.some((v) => typeof v !== 'boolean')) {
      throw new Error(`${TOOL}: ac_met must be an array of booleans`)
    }
    acMet = acMetRaw as boolean[]
  }
  const acEvidence = optionalStringArray(a, 'ac_evidence', TOOL)
  if (acCriteria !== undefined || acMet !== undefined) {
    if (acCriteria === undefined || acMet === undefined) {
      throw new Error(`${TOOL}: ac_criteria and ac_met must be given together (both or neither)`)
    }
    if (acCriteria.length !== acMet.length) {
      throw new Error(`${TOOL}: ac_criteria and ac_met must have the same length (paired per criterion)`)
    }
    if (acEvidence !== undefined && acEvidence.length !== acCriteria.length) {
      throw new Error(`${TOOL}: ac_evidence must match ac_criteria length (paired per criterion)`)
    }
    out.ac_criteria = acCriteria
    out.ac_met = acMet
    if (acEvidence !== undefined) out.ac_evidence = acEvidence
  } else if (acEvidence !== undefined) {
    throw new Error(`${TOOL}: ac_evidence requires ac_criteria and ac_met`)
  }
  const keyDecisions = optionalStringArray(a, 'key_decisions', TOOL)
  if (keyDecisions !== undefined) out.key_decisions = keyDecisions
  for (const key of ['tests_passed', 'tests_failed'] as const) {
    const v = a[key]
    if (v !== undefined) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        throw new Error(`${TOOL}: ${key} must be a non-negative integer`)
      }
      out[key] = v
    }
  }
  const coverage = optionalFraction(a, 'coverage', TOOL)
  if (coverage !== undefined) out.coverage = coverage
  const notes = optionalString(a, 'notes', TOOL)
  if (notes !== undefined) out.notes = notes
  for (const key of ['gate_compile', 'gate_fmt', 'gate_lint', 'gate_test'] as const) {
    const v = optionalBoolean(a, key, TOOL)
    if (v !== undefined) out[key] = v
  }
  const gateCoverage = optionalFraction(a, 'gate_coverage', TOOL)
  if (gateCoverage !== undefined) out.gate_coverage = gateCoverage
  const commitHash = optionalString(a, 'commit_hash', TOOL)
  if (commitHash !== undefined) out.commit_hash = commitHash
  // e2e 取证债（改进7——三参成组：suite 必带、specs 必带非空、note 可选）
  const debtSuite = optionalString(a, 'evidence_debt_suite', TOOL)
  const debtSpecs = optionalStringArray(a, 'evidence_debt_specs', TOOL)
  if (debtSuite !== undefined || debtSpecs !== undefined) {
    if (debtSuite === undefined || debtSpecs === undefined || debtSpecs.length === 0) {
      throw new Error(`${TOOL}: evidence_debt_suite and a non-empty evidence_debt_specs must be given together`)
    }
    out.evidence_debt_suite = debtSuite
    out.evidence_debt_specs = debtSpecs
    const debtNote = optionalString(a, 'evidence_debt_note', TOOL)
    if (debtNote !== undefined) out.evidence_debt_note = debtNote
  } else if (a['evidence_debt_note'] !== undefined) {
    throw new Error(`${TOOL}: evidence_debt_note requires evidence_debt_suite and evidence_debt_specs`)
  }
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
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          localId: { type: 'string' },
        },
        required: ['slug', 'localId'],
        description: 'TaskRef natural key.',
      },
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
      'Submit the outcome of a claimed task (located by its container slug + local_id): result=success requires a one-line summary and the quality-gate results (compile/fmt/lint/test booleans, optional coverage fraction); tasks created with acceptance_criteria also need gate.test passing (evidence gate), and structured ac_criteria/ac_met/ac_evidence parallel arrays verify each criterion one-for-one (same count and order as the task definition; any met=false rejects). Structured record fields: files_created/files_modified (grouped; plain files must equal their union), key_decisions, tests_passed/tests_failed, coverage, notes. result=blocked requires the blocking reason and typically spawns a fix task via addTask with the blocked task as its source. Completing a fix auto-restores its blocked source. evidence_debt_suite+evidence_debt_specs (success only) declare owed real-machine e2e assertion evidence when implementation + unit tests are green: the card settles in the implementation phase and the loop auto-creates a dependent test-run debt task — never stay blocked on missing e2e evidence.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Container slug of the task being submitted (feature directory name or proposal slug).' },
        local_id: { type: 'string', description: 'Local id of the task being submitted.' },
        result: { type: 'string', description: "'success' or 'blocked'." },
        reason: { type: 'string', description: 'Why the task is blocked (required for result=blocked).' },
        summary: { type: 'string', description: 'One-line result sentence (required for result=success).' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Actually changed files (flat union), forward-slash paths; when files_created/files_modified are given this must equal their union.',
        },
        files_created: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files created by this task (grouped; stored as files_json {created, modified}).',
        },
        files_modified: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files modified by this task (grouped; stored as files_json {created, modified}).',
        },
        ac_criteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Acceptance criteria under verification — criterion texts, identical to the task definition entries, same count and order (cross-check rejects otherwise). Give together with ac_met.',
        },
        ac_met: {
          type: 'array',
          items: { type: 'boolean' },
          description: 'Per-criterion verification result, paired with ac_criteria by index; any false on result=success rejects.',
        },
        ac_evidence: {
          type: 'array',
          items: { type: 'string' },
          description: 'One-line proof per criterion (test/command + result; long output goes to disk, pass only the path), paired with ac_criteria by index.',
        },
        key_decisions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key decisions (up to 3), split out of the summary.',
        },
        tests_passed: { type: 'number', description: 'Number of tests passed.' },
        tests_failed: { type: 'number', description: 'Number of tests failed.' },
        coverage: { type: 'number', description: 'Record-side coverage fraction 0-1 (complements gate_coverage).' },
        notes: { type: 'string', description: 'Free-form notes.' },
        gate_compile: { type: 'boolean', description: 'Quality gate: compile passed (give all four together).' },
        gate_fmt: { type: 'boolean', description: 'Quality gate: formatting passed.' },
        gate_lint: { type: 'boolean', description: 'Quality gate: lint passed.' },
        gate_test: { type: 'boolean', description: 'Quality gate: tests passed.' },
        gate_coverage: { type: 'number', description: 'Coverage fraction 0-1 (optional, with the gate booleans).' },
        commit_hash: { type: 'string', description: 'Commit hash containing the change.' },
        evidence_debt_suite: {
          type: 'string',
          description: "e2e evidence-debt suite name (e.g. 'e2e') — declare when implementation + unit tests are green but real-machine e2e assertion evidence is still owed. Settlement records the implementation phase and the loop auto-creates a dependent test-run debt task (the card is no longer blocked on missing e2e evidence).",
        },
        evidence_debt_specs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Spec paths the owed e2e assertions cover (forward slashes) — required with evidence_debt_suite.',
        },
        evidence_debt_note: { type: 'string', description: 'What evidence is owed and why (optional, with the debt pair).' },
      },
      required: ['slug', 'local_id', 'result'],
    },
    output: { schema: SUBMIT_TASK_OUTPUT_SCHEMA, render: renderSubmitResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<SubmitTaskResult | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseSubmitTaskArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const sessionId = requireSessionId(session)
        await deps.events?.prepare(session) // 会话目录记忆（事件日志落位——worker 会话语境）
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
          ...(parsed.files_created !== undefined ? { filesCreated: [...parsed.files_created] } : {}),
          ...(parsed.files_modified !== undefined ? { filesModified: [...parsed.files_modified] } : {}),
          ...(parsed.ac_criteria !== undefined && parsed.ac_met !== undefined
            ? {
                acceptanceCriteria: parsed.ac_criteria.map((criterion, i) => ({
                  criterion,
                  met: parsed.ac_met?.[i] === true,
                  ...(parsed.ac_evidence?.[i] !== undefined ? { evidence: parsed.ac_evidence[i] } : {}),
                })),
              }
            : {}),
          ...(parsed.key_decisions !== undefined ? { keyDecisions: [...parsed.key_decisions] } : {}),
          ...(parsed.tests_passed !== undefined ? { testsPassed: parsed.tests_passed } : {}),
          ...(parsed.tests_failed !== undefined ? { testsFailed: parsed.tests_failed } : {}),
          ...(parsed.coverage !== undefined ? { coverage: parsed.coverage } : {}),
          ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
          ...(gate !== undefined ? { gate } : {}),
          ...(parsed.commit_hash !== undefined ? { commitHash: parsed.commit_hash } : {}),
          ...(parsed.evidence_debt_suite !== undefined && parsed.evidence_debt_specs !== undefined
            ? {
                evidenceDebt: {
                  suite: parsed.evidence_debt_suite,
                  specs: [...parsed.evidence_debt_specs],
                  ...(parsed.evidence_debt_note !== undefined ? { note: parsed.evidence_debt_note } : {}),
                },
              }
            : {}),
        }
        const result = await deps.tasks.submitTask(input)
        // disc 效度戳写侧：结算时点机械落戳（任务证据位 resume.md 在盘才写 sidecar——
        // (HEAD commit, 基线签名) 取自结算会话检出 = worker 工作区根；重领时与当前效度域
        // 机械比对，漂移 = 证据 stale 强制重跑。core 侧 fail-soft 零抛；缺席 = 机制关闭）
        if (session.cwd !== undefined) {
          try {
            deps.tasks.stampEvidenceValidity?.({
              projectId,
              slug: parsed.slug,
              localId: parsed.local_id,
              checkoutRoot: session.cwd,
            })
          } catch {
            // fail-soft：落戳故障不阻断结算
          }
        }
        // task-submitted 事件（worker 自身会话 id——串联读法「submit = 执行会话」；AC gate 已过）
        deps.events?.emit({
          ts: Date.now(),
          sessionId,
          slug: parsed.slug,
          type: 'task-submitted',
          payload: {
            taskKey: `${parsed.slug}/${parsed.local_id}`,
            outcome: parsed.result,
            ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
            ...(parsed.commit_hash !== undefined ? { commitHash: parsed.commit_hash } : {}),
          },
        })
        return result
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
