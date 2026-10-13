// dispatchPrompt 合成（任务 2.2 起源；S2b 收窄重定义——worker-lean-execution 提案）。
// 分层承载（S2/S2a/S2b）：agent 级内容（人格、门禁、Coding Strategy、工作流、Record
// Fields）全部迁 persona（本目录 persona.ts 单源，经 spawn 链 persona 通道落子会话
// system 面）；dispatchPrompt 收窄为纯任务级——单块简报（TITLE 裸值首行 + GOAL 键 + SURFACE 行 +
// ACCEPTANCE_CRITERIA + 结算出口一句），digest 语义不变（对全文取指纹，对账锚不受迁移影响）。
// 定位铁律：纯函数禁 IO（BLOCKERS/PHASE_SUMMARY 等动态值由调用方领取瞬间取数注入——
// 2.4 claimTask 接线；「快照取领取瞬间而非渲染时」）。
import {
  TASK_TYPES,
  type ContainerRef,
  type TaskPriority,
  type TaskPrerequisiteSummary,
  type TaskRef,
  type TaskType,
} from '@dsh-forge/contracts'

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

// ─────────────────────────── 合成输入（动态块键的注入面） ───────────────────────────

/** 合成入参（任务级载荷——恒在场键：TASK_ID/TYPE/CATEGORY；其余条件键缺席省行） */
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
   * 任务目标（任务规格内嵌：GOAL 段——S2b 原 DESCRIPTION 键更名，以结果为导向表述
   * 「要达成什么」；实现路径由 persona 工作流承载。task_desc 原文逐字；db-only 任务
   * （quick-tasks/addTask 建）无定义文件可读，本段 = worker 的规格正文）。
   */
  goal?: string
  /** 验收清单（任务规格内嵌：ACCEPTANCE_CRITERIA 段——ac_json 数组逐行；条目单行化
   *  （换行折叠空格——机械提取无歧义，与 S3 criterion 交叉校验同源）；空数组省段） */
  acceptanceCriteria?: readonly string[]
  /**
   * 注入变量（vars_json 解码的 KEY=VALUE 面——VARS 行；SKIP_EVAL_GATE / fix 链
   * SOURCE_FILES 等技能契约经此送达 worker。db-only 任务简报 = 定义唯一到达面，本行
   * 缺席 = vars 断流。缺席/空对象省行；键序字母序确定性渲染——digest 幂等）。
   */
  vars?: Readonly<Record<string, string>>
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
  /** 目标 surface 键（S2b/SC3：`SURFACE: <key> (<type>)` 单行双值；缺席省行——R6 填写率缓解） */
  surfaceKey?: string
  /** surface 类型（web/api/cli/tui/mobile；仅 surfaceKey 在场时随行呈现） */
  surfaceType?: string
}

// ─────────────────────────── 统一证据路径约束块（worker-exec-evidence-replay Solution①） ───────────────────────────

/**
 * 证据路径约束块（worker 系统提示词硬约定——全 worker 生效，不靠任务书/技能各自携带）：
 * 单行路径模板（容量风险 #4 缓解），细则外链到证据目录内 README。
 * 落盘侧对应实现：plugin-forge notify/incident-log（NNN 前缀 max+1 自增，永不覆盖）。
 */
export const CONSTRAINTS_BLOCK =
  '证据落盘约束：一切跑批/证据产物统一写入 `logs/{slug}/{task-local-id}/{NNN-issue-key}/`（工作区派生目录下；NNN 三位序号按轮追加命名、永不覆盖——失败轮日志在盘可考；细则见该证据目录内 README）。'

// ─────────────────────────── 动态块渲染（键值行；键级零标签） ───────────────────────────

/** BLOCKERS 快照行值：`2.1 completed; 1.gate skipped`（前置自然键 + 当前状态——同 feature 故 localId 即识别） */
function renderBlockers(blockers: readonly TaskPrerequisiteSummary[]): string {
  return blockers.map((b) => `${b.localId} ${b.taskStatus}`).join('; ')
}

/** 标记行值：`fix-of <slug>/<localId>, breaking`（在场者按序拼接。M3 裁决⑦：main_session
 *  砍除——标记行不再有 main-session 分支） */
function renderMarkers(input: DispatchPromptInput): string | undefined {
  const markers: string[] = []
  if (input.sourceTask) markers.push(`fix-of ${input.sourceTask.slug}/${input.sourceTask.localId}`)
  if (input.breaking) markers.push('breaking')
  return markers.length > 0 ? markers.join(', ') : undefined
}

/** VARS 行值：`K1=V1; K2=V2`（键序字母序——同 vars_json 恒同简报，digest 幂等；空对象 → 省行） */
function renderVars(vars: Readonly<Record<string, string>> | undefined): string | undefined {
  if (vars === undefined) return undefined
  const keys = Object.keys(vars).sort()
  if (keys.length === 0) return undefined
  return keys.map((k) => `${k}=${vars[k]}`).join('; ')
}

/** SURFACE 行值（SC3 单行双值）：`web (web)`；type 缺席单值 `web`；key 缺席 → 省行 */
function renderSurface(input: DispatchPromptInput): string | undefined {
  if (input.surfaceKey === undefined) return undefined
  return input.surfaceType === undefined ? input.surfaceKey : `${input.surfaceKey} (${input.surfaceType})`
}

/** AC 条目单行化（S2b：换行折叠空格——机械提取无歧义，criterion 交叉校验同源） */
function singleLine(criterion: string): string {
  return criterion.replace(/\s*\r?\n\s*/g, ' ')
}

/** 结算出口一句（S2b：submitTask 路径指称——纪律细节在 persona；简报尾行） */
export const SETTLEMENT_EXIT_LINE =
  'Settlement exit: close out via the submit-task skill (submitTask) using the TASK_ID above.'

/** 简报正文（行序 = S2b 序 + 提案再收窄：TITLE 裸值首行（无键前缀）/TASK_ID/SOURCE/FILE/TYPE/CATEGORY/
 *  SURFACE/BLOCKERS/PHASE_SUMMARY/COVERAGE/PRIORITY/标记/VARS——SOURCE = M3 2.4 增键紧随 TASK_ID；
 *  SURFACE = S2b 增键紧随 CATEGORY；VARS = vars 注入面（SKIP_EVAL_GATE/fix 链上下文——尾行承载体）；
 *  GOAL = `<goal>` 包围的任务体段落（目标 + ACCEPTANCE_CRITERIA 同段——worker 面无
 *  queryTask 时的定义唯一到达面）+ 结算出口一句收尾。TITLE 缺席时首行为 TASK_ID。 */
export function renderTaskContext(input: DispatchPromptInput): string {
  const coverage = resolveCoverage(input.taskType, input.coverage)
  const markers = renderMarkers(input)
  const vars = renderVars(input.vars)
  const surface = renderSurface(input)
  const lines: (string | undefined)[] = [
    input.title !== undefined ? input.title : undefined,
    `TASK_ID: ${input.slug}/${input.localId}`,
    input.source !== undefined ? `SOURCE: ${input.source.kind} ${input.source.slug}` : undefined,
    input.taskFile !== undefined ? `FILE: ${input.taskFile}` : undefined,
    `TYPE: ${input.taskType}`,
    `CATEGORY: ${TASK_CATEGORY_FOR_TYPE[input.taskType]}`,
    surface !== undefined ? `SURFACE: ${surface}` : undefined,
    input.blockers !== undefined && input.blockers.length > 0
      ? `BLOCKERS: ${renderBlockers(input.blockers)}`
      : undefined,
    input.phaseSummary !== undefined ? `PHASE_SUMMARY: ${input.phaseSummary}` : undefined,
    coverage !== undefined
      ? `COVERAGE: ${coverage.strategy === 'maintain' ? 'maintain' : `percentage ${coverage.target}%`}`
      : undefined,
    input.priority !== undefined ? `PRIORITY: ${input.priority}` : undefined,
    markers !== undefined ? `MARKERS: ${markers}` : undefined,
    vars !== undefined ? `VARS: ${vars}` : undefined,
  ]
  let context = lines.filter((line): line is string => line !== undefined).join('\n')
  if (input.goal !== undefined || (input.acceptanceCriteria !== undefined && input.acceptanceCriteria.length > 0)) {
    context += '\n<goal>'
    if (input.goal !== undefined) context += `\n${input.goal}`
    if (input.acceptanceCriteria !== undefined && input.acceptanceCriteria.length > 0) {
      context += `\nACCEPTANCE_CRITERIA:\n${input.acceptanceCriteria.map((ac) => `- ${singleLine(ac)}`).join('\n')}`
    }
    context += '\n</goal>'
  }
  return `${context}\n${SETTLEMENT_EXIT_LINE}`
}

// ─────────────────────────── 组成序合成（S2b：任务级单块） ───────────────────────────

/**
 * dispatchPrompt 合成（纯函数零 IO；S2b 收窄形 + 无包裹再收窄）：任务级简报正文直出——
 * 无 `<task-context>` 外包裹（TITLE 裸值首行 + GOAL 键 + SURFACE 行 + `<goal>` 包围目标 +
 * ACCEPTANCE_CRITERIA + 结算出口一句）。无人格段/约束块/类型策略工作流段（agent 级内容
 * 由 persona 承载——prompt/persona.ts 单源，经 spawn 链 persona 通道落子会话 system 面）。
 * digest 由调用方经 dispatchDigest(全文) 取值（2.4 claimTask 落 claim record）。
 * `<forge-pipeline>` 属 plugin-forge 系统提示段，不进本合成。
 */
export function composeDispatchPrompt(input: DispatchPromptInput): string {
  if (!TASK_TYPES.includes(input.taskType)) {
    // 运行期防御面（词汇外值——TS 类型已封）
    throw new Error(`dispatchPrompt: unknown task type: ${String(input.taskType)}`)
  }
  return renderTaskContext(input)
}
