// dispatchPrompt 合成（任务 2.2；tech-design §Interface 9 组成序 + 提示词资产归属——
// prompt/ 在 core，plugin 侧仅 forge:pipeline 系统提示段（3.2，不进本合成））。
//
// 组成序（AC1）：人格段(task-executor，无标签) → <constraints> → <task-context> →
// <type-policy>；digest 见 digest.ts（全文含人格段与标签）。约束块 = 单一 TS 源（本文件
// CONSTRAINTS_BLOCK：失败分诊/质量门序列/提交纪律/不越权——老 forge executor 模板共享段
// 平移，伪标签 <CRITICAL>/<IMPORTANT> 清剿为 markdown 强调，标签集封闭于四枚）。
// 定位铁律：纯函数禁 IO（BLOCKERS/PHASE_SUMMARY 等动态值由调用方领取瞬间取数注入——
// 2.4 claimTask 接线；「快照取领取瞬间而非渲染时」）。
import {
  TASK_TYPES,
  XML_TAGS,
  type ContainerRef,
  type TaskPriority,
  type TaskPrerequisiteSummary,
  type TaskRef,
  type TaskType,
} from '@dsh-forge/contracts'
import { TYPE_POLICY_TEMPLATES } from './templates/index.js'

// ─────────────────────────── 人格段（无标签；组成序第一段） ───────────────────────────

/** 人格段文本（老 forge「You are a focused task executor」+ CODING_PRINCIPLES 平移） */
export const PERSONA_BLOCK = `You are a focused task executor.

Execution principles:
- Think Before Coding: restate the task goal before coding; identify assumptions. If unclear, stop and ask.
- Simplicity First: implement only what is required. Trivial tasks (one-liners, config) skip full analysis.
- Surgical Changes: modify only code and documents directly relevant to the task.
- Goal-Driven Execution: define a verifiable success condition before starting; confirm after implementation.`

// ─────────────────────────── 约束块（单一 TS 源；四节封闭） ───────────────────────────

/** 约束块文本（失败分诊/质量门序列/提交纪律/不越权——老 forge 各类型模板共享约束段收敛单源） */
export const CONSTRAINTS_BLOCK = `Failure triage:
- Simple/transient failures (network timeout, missing dependency, single command failure, formatting lint): fix inline or retry, at most ~3 attempts, then stop.
- Complex/recurring failures (persist after ~3 attempts, large compilation failure, cross-file refactor): stop and submit result=blocked with the failure classified in the reason — do not loop.

Quality gate sequence (strict sequential order, stop at the first unresolved failure):
1. just compile
2. just fmt — non-blocking warning: fix fmt issues only in files you modified; pre-existing drift is not your responsibility
3. just lint — self-fix, max 1 retry
4. Targeted tests on the changed packages/modules only (framework-native command); full project-wide tests run at submit, not here.

Commit discipline:
- Submit via the submit-task skill only after the quality gate sequence passes; populate the record fields (testsPassed/testsFailed/coverage, or the type-specific fields listed in the type-policy block).
- Commit only files related to this task; never commit unrelated pre-existing changes.

Scope discipline (no authority escalation):
- Modify only code and documents directly relevant to the task; note out-of-scope issues instead of fixing them.
- Never modify task definitions or execution records (docs/**/tasks/**) — they are audit artifacts, not deliverables.
- Task Hard Rules override your judgment for any step they address; do not rationalize bypassing a Hard Rule based on "I know a better way".`

// ─────────────────────────── CATEGORY 映射（老 forge CategoryForType 平移） ───────────────────────────

/** 任务类别（submit-task 路由面；老 forge 六类） */
export type TaskCategory = 'coding' | 'doc' | 'test' | 'validation' | 'gate' | 'eval'

/** TaskType → 类别（Record<TaskType,…> = 编译期穷尽——加类型即编译红，逼映射裁决） */
export const TASK_CATEGORY_FOR_TYPE: Readonly<Record<TaskType, TaskCategory>> = {
  'coding-feature': 'coding',
  'coding-enhancement': 'coding',
  'coding-cleanup': 'coding',
  'coding-refactor': 'coding',
  'code-quality-simplify': 'coding',
  'coding-fix': 'coding',
  gate: 'gate',
  doc: 'doc',
  'doc-consolidate': 'doc',
  'doc-drift': 'doc',
  'doc-review': 'doc',
  'doc-summary': 'doc',
  'test-run': 'test',
  'test-gen-contracts': 'test',
  'test-gen-journeys': 'test',
  'test-gen-scripts': 'test',
  'validation-code': 'validation',
  'validation-ux': 'validation',
  'eval-contract': 'eval',
  'eval-journey': 'eval',
}

// ─────────────────────────── COVERAGE 解析（老 forge resolveCoverage 平移） ───────────────────────────

/** COVERAGE 行指令（percentage = 阈值百分比；maintain = 维持现状不新增测试） */
export type CoverageDirective = { strategy: 'percentage'; target: number } | { strategy: 'maintain' }

/**
 * 覆盖率指令解析（纯函数）：
 * - 仅 coding 系（老 forge IsTestableType 面 = coding.* + code-quality.simplify）产生指令；
 *   其余类型（doc/test/eval/validation/gate）无 COVERAGE 行；
 * - coding-cleanup / coding-refactor 恒 maintain——两模板明令「不写新测试」，百分比目标自相矛盾；
 * - 阈值三级优先（task.coverage > 全局默认）的取数归调用方（2.4 claimTask 读行注入），本函数
 *   只做「值 + 类型 → 行文本指令」的纯映射；缺席阈值 = 无指令（省行）。
 */
export function resolveCoverage(taskType: TaskType, coverage?: number): CoverageDirective | undefined {
  if (TASK_CATEGORY_FOR_TYPE[taskType] !== 'coding') return undefined
  if (taskType === 'coding-cleanup' || taskType === 'coding-refactor') return { strategy: 'maintain' }
  if (coverage === undefined) return undefined
  return { strategy: 'percentage', target: Math.round(coverage * 100) }
}

// ─────────────────────────── 合成输入（动态块九键的注入面） ───────────────────────────

/** 合成入参（动态块载荷——恒在场键：TASK_ID/TYPE/CATEGORY；其余条件键缺席省行） */
export interface DispatchPromptInput {
  /** feature slug（slug 列 ≡ feature slug） */
  slug: string
  /** feature 内局部键（数值顺延 / fix-N·disc-N） */
  localId: string
  /**
   * 任务容器引用（M3 2.4：SOURCE 容器语境行——任务带容器出厂；claim 恒注入
   * {kind: row.source_kind, slug: row.slug}；缺席省行 = M2 形态兼容）。
   */
  source?: ContainerRef
  /**
   * 任务标题（5.3 任务规格内嵌：TITLE 键值行——worker 面无 queryTask（收窄矩阵 forge 族
   * 恰 submitTask+addTask）且 M3 task_file 列砍除，dispatchPrompt = 任务定义唯一到达面；
   * 缺席省行 = M2 形态兼容）。
   */
  title?: string
  /**
   * 任务描述（任务规格内嵌：DESCRIPTION 段——task_desc 原文逐字；db-only 任务
   * （quick-tasks/addTask 建）无定义文件可读，本段 = worker 的规格正文）。
   */
  taskDesc?: string
  /** 验收清单（任务规格内嵌：ACCEPTANCE_CRITERIA 段——ac_json 数组逐行；空数组省段） */
  acceptanceCriteria?: readonly string[]
  taskType: TaskType
  /** 任务定义载体路径（M2 task_file 列砍除——由调用方按需注入；缺席省 FILE 行） */
  taskFile?: string
  priority?: TaskPriority
  /** 覆盖率阈值小数（0–1；解析见 resolveCoverage） */
  coverage?: number
  /** 相位摘要路径（2.4 经 2.1 相位机注入；缺席省行） */
  phaseSummary?: string
  /** BLOCKERS 快照（前置依赖现状——领取瞬间取数注入；空数组省行） */
  blockers?: readonly TaskPrerequisiteSummary[]
  breaking?: boolean
  /** fix 链源（标记行 fix-of 呈现；非 fix 任务缺省） */
  sourceTask?: TaskRef
}

// ─────────────────────────── 动态块渲染（键值行；键级零标签） ───────────────────────────

/** BLOCKERS 快照行值：`2.1 completed; 1.gate skipped`（前置自然键 + 当前状态——同 feature 故 localId 即识别） */
function renderBlockers(blockers: readonly TaskPrerequisiteSummary[]): string {
  return blockers.map((b) => `${b.localId} ${b.taskStatus}`).join('; ')
}

/** 标记行值：fix-of <slug>/<localId>, breaking（在场者按序拼接。M3 裁决⑦：main_session
 *  砍除——标记行不再有 main-session 分支） */
function renderMarkers(input: DispatchPromptInput): string | undefined {
  const markers: string[] = []
  if (input.sourceTask) markers.push(`fix-of ${input.sourceTask.slug}/${input.sourceTask.localId}`)
  if (input.breaking) markers.push('breaking')
  return markers.length > 0 ? markers.join(', ') : undefined
}

/** `<task-context>` 内文（九键行序 = AC2 序：TASK_ID/SOURCE/TITLE/FILE/TYPE/CATEGORY/BLOCKERS/PHASE_SUMMARY/COVERAGE/PRIORITY/标记——
 *  SOURCE = M3 2.4 增键紧随 TASK_ID；TITLE = 5.3 任务规格内嵌增键；DESCRIPTION/ACCEPTANCE_CRITERIA
 *  = 键值行后的任务体段落（多行值——worker 面无 queryTask 时的定义唯一到达面） */
export function renderTaskContext(input: DispatchPromptInput): string {
  const coverage = resolveCoverage(input.taskType, input.coverage)
  const markers = renderMarkers(input)
  const lines: (string | undefined)[] = [
    `TASK_ID: ${input.slug}/${input.localId}`,
    input.source !== undefined ? `SOURCE: ${input.source.kind} ${input.source.slug}` : undefined,
    input.title !== undefined ? `TITLE: ${input.title}` : undefined,
    input.taskFile !== undefined ? `FILE: ${input.taskFile}` : undefined,
    `TYPE: ${input.taskType}`,
    `CATEGORY: ${TASK_CATEGORY_FOR_TYPE[input.taskType]}`,
    input.blockers !== undefined && input.blockers.length > 0
      ? `BLOCKERS: ${renderBlockers(input.blockers)}`
      : undefined,
    input.phaseSummary !== undefined ? `PHASE_SUMMARY: ${input.phaseSummary}` : undefined,
    coverage !== undefined
      ? `COVERAGE: ${coverage.strategy === 'maintain' ? 'maintain' : `percentage ${coverage.target}%`}`
      : undefined,
    input.priority !== undefined ? `PRIORITY: ${input.priority}` : undefined,
    markers !== undefined ? `MARKERS: ${markers}` : undefined,
  ]
  let context = lines.filter((line): line is string => line !== undefined).join('\n')
  if (input.taskDesc !== undefined) context += `\nDESCRIPTION:\n${input.taskDesc}`
  if (input.acceptanceCriteria !== undefined && input.acceptanceCriteria.length > 0) {
    context += `\nACCEPTANCE_CRITERIA:\n${input.acceptanceCriteria.map((ac) => `- ${ac}`).join('\n')}`
  }
  return context
}

// ─────────────────────────── 组成序合成（AC1） ───────────────────────────

/** 块包裹（裸标签名 → `<tag>\n内文\n</tag>`——包裹属 core 合成逻辑，契约层只出常量） */
function wrapBlock(tag: string, body: string): string {
  return `<${tag}>\n${body}\n</${tag}>`
}

/**
 * dispatchPrompt 合成（纯函数零 IO）：人格段(无标签) → <constraints> → <task-context> →
 * <type-policy>（模板族 exhaustive 路由）。digest 由调用方经 dispatchDigest(全文) 取值
 * （2.4 claimTask 落 claim record）。`<forge-pipeline>` 属 plugin-forge 系统提示段，不进本合成。
 */
export function composeDispatchPrompt(input: DispatchPromptInput): string {
  if (!TASK_TYPES.includes(input.taskType)) {
    // 运行期防御面（词汇外值——TS 类型已封；快照测试锚定 20 值路由）
    throw new Error(`dispatchPrompt: unknown task type: ${String(input.taskType)}`)
  }
  return [
    PERSONA_BLOCK,
    wrapBlock(XML_TAGS.constraints, CONSTRAINTS_BLOCK),
    wrapBlock(XML_TAGS.taskContext, renderTaskContext(input)),
    wrapBlock(XML_TAGS.typePolicy, TYPE_POLICY_TEMPLATES[input.taskType](input)),
  ].join('\n\n')
}
