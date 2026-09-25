// workbench/dispatch/presynth/assemble — 预合成引擎:三要素组装(任务 3.4)。
//
// Interface 3 预合成(tech-design §Interface 3;spike-3 契约形态 + spike-4
// 模板映射)的确定性内核实现:dispatch 服务组装三要素 ——
//   ① 任务类型协议:PROMPT_TEMPLATES 路由(task.task_type;surface 后缀回退
//      规则 = forge-cli IsValidType/autogenTemplatePath 移植)+ 包装协议
//      前导段(spike-4 §5.2,task-executor agent 协议并入);
//   ② feature 目标/摘要:stage_asset 最近资产(载体翻转:Go PhaseDetect/
//      records/<n-1>-summary.md → stages/<stage>.md;注入位点同为模板头部
//      PhaseSummary 块,值为资产绝对路径,G7 文档根寻址);
//   ③ 生效偏好:prefs 三级解析(resolveEffectiveValues,键 coverage.<task-type>;
//      Go resolveCoverage 移植:cleanup/refactor 强制 maintain、仅可测类型注入)。
//
// 口径与纪律:
//   - 组装产物 = EXECUTOR_PREAMBLE + 渲染后类型协议 = 预合成内容;组合首条
//     消息 = 预合成内容 + "\n\n" + 追加行(spike-3 §3/§4);prompt_hash =
//     sha256(组合消息)由 dispatch-service 随行落库(hash.ts 提供 oracle)。
//   - dispatch 预铸 sessionId(spike-3 §4 落库时机):compose 一次铸造
//     `session-<uuid>`(M2 caller-minted 同形,create({sessionId}) 幂等 adopt),
//     组合消息确定 → hash 与 launch 解耦,重派发不因会话重建漂移。
//   - Hard Rules:三要素均为文档数据,模板常量 + 确定性微型渲染器组装
//     (dot 记法替换 + if 块;**禁 eval、禁拼接指令语义、禁模型调用**,T2);
//     注入内容对内核不透明(仅保证字符串完整交付)。
//
// 移植基准(forge-cli Go 源,逐符号):
//   - prompt.go Synthesize/renderTemplate/collapseBlankLines/resolveCoverage;
//   - task/types.go IsValidType/SystemTypes + task/category.go CategoryForType
//     + task/build.go IsTestableType;
//   - metadata.go parseMetadataFrontmatter/validateMetadataVariables →
//     validateTemplateLibrary(模板库完整性,spike-4 缺口 7 校验契约)。
//
// spike-4 缺口 2 裁定(3.4):task 级 coverage/complexity frontmatter 覆盖的
// SoT = 派发时读 desc_path(v2 task 表无 coverage/complexity/surface 列;
// desc 文件 frontmatter 仍是文档数据的原载体;不可读 → 退缺省,不阻断)。
// SurfaceKey/SurfaceType/TestTypeArg 保留为数据字段但 M3 恒空(v2 无 surface
// 列;surface 摄入演进时的接线点)——模板与 Go 源保持逐字节同构。

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FeatureStatus, RepoDb } from '../../repos/types.ts'
import { parseFrontmatterObject, splitFrontmatter } from '../../knowledge/frontmatter.ts'
import { resolveEffectiveValues } from '../../prefs/resolve.ts'
import { listStageAssetRows, type StageAssetRow } from '../../stages/stage-asset-index.ts'
import { getFeatureSnapshot } from '../../repos/feature-snapshots.ts'
import type { AuthoritativeTask } from '../../tasks/task-repo.ts'
import { localIdOfTaskKey } from '../../tasks/task-repo.ts'
import {
  DISPATCH_RESTRICTED_TYPES,
  EXECUTOR_PREAMBLE,
  MECHANISM_REPLACED_TYPES,
  PROMPT_TEMPLATES,
  SYSTEM_TYPES,
  attributionLine,
} from './templates.ts'

// ---------------------------------------------------------------------------
// 域错误(路由拒绝;code 经 IPC 错误封装原码透传)
// ---------------------------------------------------------------------------

/** 预合成域错误码:类型面拒绝(派发前,零落行)。 */
export type PresynthErrorCode = 'ERR_TASK_TYPE_UNKNOWN' | 'ERR_TASK_TYPE_NOT_DISPATCHABLE'

/** 预合成域错误。 */
export class PresynthError extends Error {
  constructor(
    readonly code: PresynthErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'PresynthError'
  }
}

// ---------------------------------------------------------------------------
// 类型/类别映射(forge-cli pkg/task 同型移植)
// ---------------------------------------------------------------------------

/** categoryForType 移植(category.go):submit 路由 + Pause Protocol fix-type 推导消费。 */
export function categoryForType(typ: string): string {
  if (typ === 'gate') return 'gate'
  if (typ === 'code-quality.simplify') return 'coding'
  if (typ.startsWith('coding.')) return 'coding'
  if (typ.startsWith('doc')) return 'doc'
  if (typ.startsWith('test.')) return 'test'
  if (typ.startsWith('validation.')) return 'validation'
  if (typ.startsWith('eval.')) return 'eval'
  return 'coding'
}

/** IsTestableType 移植(build.go):coding.* 前缀 + code-quality.simplify。 */
export function isTestableType(typ: string): boolean {
  return typ.startsWith('coding.') || typ === 'code-quality.simplify'
}

// ---------------------------------------------------------------------------
// 模板路由(IsValidType + autogenTemplatePath 后缀回退规则移植)
// ---------------------------------------------------------------------------

/**
 * 任务类型 → 模板。规则:
 *   - fixRecordMissed 旗标优先(Go Synthesize 同序:覆盖一切类型路由);
 *   - 空类型 → ERR_TASK_TYPE_UNKNOWN(Go "type field missing");
 *   - 受限 5 类型 / 被机制取代 2 类型 → ERR_TASK_TYPE_NOT_DISPATCHABLE
 *     (派发面封闭,看板呈现 + 引导;模板入库不等于可派发);
 *   - 精确命中;否则剥最后一个 `.` 段回退基型(仅系统类型可带 surface
 *     后缀;`test.gen-scripts.cli` → `test.gen-scripts`);回退后受限检查
 *     按基型执行(suffixed 变体共享基型协议及其派发约束);
 *   - 无模板 → ERR_TASK_TYPE_UNKNOWN(Go read template 失败同类)。
 */
export function routeTemplate(
  taskType: string | null,
  opts?: { readonly fixRecordMissed?: boolean },
): string {
  if (opts?.fixRecordMissed === true) return PROMPT_TEMPLATES['fix-record-missed'] as string
  if (taskType === null || taskType === '') {
    throw new PresynthError(
      'ERR_TASK_TYPE_UNKNOWN',
      'task carries no task_type — presynthesis needs a type protocol key to route (set task_type on the task, or use a type-carrying task)',
    )
  }
  // 候选解析:精确命中;未命中时按序考量「被机制取代(无模板,含 suffixed
  // 变体的基型)→ 剥尾段回退系统基型」。受限检查按最终候选执行(suffixed
  // 变体共享基型协议及其派发约束)。
  let candidate = taskType
  if (PROMPT_TEMPLATES[taskType] === undefined) {
    if (MECHANISM_REPLACED_TYPES.has(taskType)) throw mechanismReplaced(taskType)
    const idx = taskType.lastIndexOf('.')
    if (idx <= 0) {
      throw unknownType(taskType, 'no exact template and no strippable surface suffix')
    }
    const base = taskType.slice(0, idx)
    if (!SYSTEM_TYPES.has(base)) {
      throw unknownType(taskType, `base type '${base}' is not a system type (surface suffixes are only valid on system types)`)
    }
    candidate = base
    if (MECHANISM_REPLACED_TYPES.has(candidate)) throw mechanismReplaced(candidate)
    if (PROMPT_TEMPLATES[candidate] === undefined) {
      throw unknownType(taskType, `base type '${base}' has no template in the library`)
    }
  }
  if (DISPATCH_RESTRICTED_TYPES.has(candidate)) {
    throw new PresynthError(
      'ERR_TASK_TYPE_NOT_DISPATCHABLE',
      `task type '${candidate}' is dispatch-restricted in M3: its protocol depends on a skill that is not carried yet (M4) — the template is in the library, but dispatch is closed for this type; run it in an external session or wait for the skill migration`,
    )
  }
  return PROMPT_TEMPLATES[candidate] as string
}

function mechanismReplaced(candidate: string): PresynthError {
  return new PresynthError(
    'ERR_TASK_TYPE_NOT_DISPATCHABLE',
    `task type '${candidate}' is replaced by a deterministic kernel mechanism (stage gate / stage summary — checkStageArtifacts + forge.stage.summarize); there is no executor protocol to dispatch — remove the task or keep it as a migration record`,
  )
}

function unknownType(taskType: string, reason: string): PresynthError {
  return new PresynthError(
    'ERR_TASK_TYPE_UNKNOWN',
    `unknown task type '${taskType}' (${reason}); the dispatchable type set is closed over the presynthesis template library`,
  )
}

// ---------------------------------------------------------------------------
// 确定性微型渲染器(Go text/template 所用构造的最小子集;禁 eval)
// ---------------------------------------------------------------------------

/** 模板数据(11 字段;prompt.go promptTemplateData 同形,值全为 string)。 */
export interface PromptTemplateData {
  readonly TaskID: string
  readonly TaskFile: string
  readonly TaskCategory: string
  readonly FeatureSlug: string
  readonly PhaseSummary: string
  readonly CoverageStrategy: string
  readonly CoverageTarget: string
  readonly TestTypeArg: string
  readonly SurfaceKey: string
  readonly SurfaceType: string
  readonly Complexity: string
}

/** 全字段清单(模板库完整性校验的元数据交叉验证面)。 */
export const PROMPT_TEMPLATE_FIELDS: readonly string[] = Object.keys({
  TaskID: '',
  TaskFile: '',
  TaskCategory: '',
  FeatureSlug: '',
  PhaseSummary: '',
  CoverageStrategy: '',
  CoverageTarget: '',
  TestTypeArg: '',
  SurfaceKey: '',
  SurfaceType: '',
  Complexity: '',
})

type Condition = { readonly op: 'truthy' | 'ne' | 'eq'; readonly field: string; readonly literal?: string }
type IfNode = { readonly kind: 'if'; readonly cond: Condition; readonly then: Node[]; readonly else: Node[] }
type Node = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'field'; readonly field: string } | IfNode

/** 模板文本 → AST(`{{.Field}}` / `{{if .F}}…{{else}}…{{end}}` / `{{if ne .F "x"}}`)。 */
function parseTemplate(source: string, origin: string): readonly Node[] {
  const root: Node[] = []
  type Frame = { nodes: Node[]; ifNode?: IfNode }
  const stack: Frame[] = [{ nodes: root }]
  let rest = source
  while (rest !== '') {
    const open = rest.indexOf('{{')
    if (open === -1) {
      push(stack, { kind: 'text', text: rest })
      break
    }
    if (open > 0) push(stack, { kind: 'text', text: rest.slice(0, open) })
    const close = rest.indexOf('}}', open + 2)
    if (close === -1) {
      throw new Error(`presynth template ${origin}: unterminated action at ${rest.slice(open, open + 24)}…`)
    }
    const action = rest.slice(open + 2, close).trim()
    rest = rest.slice(close + 2)
    if (action.startsWith('if ')) {
      const cond = parseCondition(action.slice(3), origin)
      const ifNode: IfNode = { kind: 'if', cond, then: [], else: [] }
      push(stack, ifNode)
      stack.push({ nodes: ifNode.then, ifNode })
    } else if (action === 'else') {
      const frame = stack[stack.length - 1]
      if (frame?.ifNode === undefined) {
        throw new Error(`presynth template ${origin}: {{else}} outside an if block`)
      }
      frame.nodes = frame.ifNode.else
    } else if (action === 'end') {
      const frame = stack.pop()
      if (frame?.ifNode === undefined) {
        throw new Error(`presynth template ${origin}: {{end}} outside an if block`)
      }
    } else if (action.startsWith('.')) {
      push(stack, { kind: 'field', field: action.slice(1) })
    } else {
      throw new Error(`presynth template ${origin}: unsupported action '{{${action}}}' (allowed: .Field / if .Field [ne|eq "lit"] / else / end)`)
    }
  }
  if (stack.length !== 1) {
    throw new Error(`presynth template ${origin}: unclosed if block(s) — ${String(stack.length - 1)} missing {{end}}`)
  }
  return root
}

function push(stack: { nodes: Node[] }[], node: Node): void {
  const frame = stack[stack.length - 1]
  if (frame === undefined) throw new Error('presynth template parser: stack underflow')
  frame.nodes.push(node)
}

function parseCondition(raw: string, origin: string): Condition {
  const neq = raw.match(/^ne\s+(\.[A-Za-z]+)\s+"([^"]*)"$/)
  if (neq !== null) return { op: 'ne', field: neq[1].slice(1), literal: neq[2] }
  const eq = raw.match(/^eq\s+(\.[A-Za-z]+)\s+"([^"]*)"$/)
  if (eq !== null) return { op: 'eq', field: eq[1].slice(1), literal: eq[2] }
  if (/^\.[A-Za-z]+$/.test(raw)) return { op: 'truthy', field: raw.slice(1) }
  throw new Error(`presynth template ${origin}: unsupported if condition '${raw}'`)
}

function fieldValue(data: Readonly<Record<string, string>>, field: string, origin: string): string {
  const value = data[field]
  if (value === undefined) {
    // missingkey=error 同义:模板字段名拼错在渲染期显式暴露(零值渲染校验兜底)。
    throw new Error(`presynth template ${origin}: unknown template field {{.${field}}} (missingkey=error discipline)`)
  }
  return value
}

function renderNodes(nodes: readonly Node[], data: Readonly<Record<string, string>>, origin: string, out: string[]): void {
  for (const node of nodes) {
    if (node.kind === 'text') {
      out.push(node.text)
    } else if (node.kind === 'field') {
      out.push(fieldValue(data, node.field, origin))
    } else {
      const value = fieldValue(data, node.cond.field, origin)
      let take = value !== ''
      if (node.cond.op === 'ne') take = value !== node.cond.literal
      if (node.cond.op === 'eq') take = value === node.cond.literal
      renderNodes(take ? node.then : node.else, data, origin, out)
    }
  }
}

/** collapseBlankLines 移植(prompt.go):3+ 连续换行收敛为 2。 */
export function collapseBlankLines(text: string): string {
  let s = text
  while (s.includes('\n\n\n')) s = s.replaceAll('\n\n\n', '\n\n')
  return s
}

/**
 * 渲染一份模板常量:剥离元数据 frontmatter(Go parseMetadataFrontmatter
 * 同义切分 + 闭合界后单换行跳过)→ AST 渲染 → collapseBlankLines。
 */
export function renderPromptTemplate(template: string, data: PromptTemplateData, origin = 'library'): string {
  const { body } = splitFrontmatter(template)
  const normalized = body.startsWith('\n') ? body.slice(1) : body
  const nodes = parseTemplate(normalized, origin)
  const out: string[] = []
  renderNodes(nodes, data as Readonly<Record<string, string>>, origin, out)
  return collapseBlankLines(out.join(''))
}

// ---------------------------------------------------------------------------
// 三要素数据装配(spike-4 §4 映射表)
// ---------------------------------------------------------------------------

/** 引擎上下文输入(纯数据;loadPresynthContext 从 db/fs 组装,测试可直给)。 */
export interface PresynthContextInput {
  readonly task: AuthoritativeTask
  /** 文档根绝对路径(features/;G7)。 */
  readonly featuresRoot: string
  /** 管线序 stage_asset 行集(3.2 listStageAssetRows 形态)。 */
  readonly stageAssets: readonly StageAssetRow[]
  /** feature 当前阶段(feature_snapshot.status;无快照 = null)。 */
  readonly featureStatus: FeatureStatus | null
  /** 三级生效偏好(3.1 resolveEffectiveValues feature 语境产物)。 */
  readonly effectivePrefs: Readonly<Record<string, unknown>>
  /** 任务 md frontmatter 派生(缺口 2 裁定:派发时读 desc_path)。 */
  readonly taskFrontmatter: { readonly coverage: number | null; readonly complexity: string }
}

/** TaskFile 寻址:desc_path join 文档根;未落 → 文档树规范位兜底。 */
export function taskFileOf(featuresRoot: string, task: AuthoritativeTask): string {
  if (task.descPath !== null && task.descPath !== '') return join(featuresRoot, task.descPath)
  return join(featuresRoot, task.featureSlug, 'tasks', `${localIdOfTaskKey(task.taskKey)}.md`)
}

/**
 * 要素②:stage_asset 最近资产路径(Go PhaseDetect 的载体翻转)。
 * 候选 = 排除 feature 当前阶段后的资产集(当前阶段自身的阶段总结不是
 * 「上一阶段」语料;无快照行 = 感知缺口,不构成语义排除,取全集);
 * 取管线序最后一位(最近阶段);空集 → ''(PhaseSummary 块整体省略 ——
 * 「无 stage_asset」的显式定义行为)。
 */
export function resolveStageSummaryPath(
  featuresRoot: string,
  stageAssets: readonly StageAssetRow[],
  featureStatus: FeatureStatus | null,
): string {
  const candidates = featureStatus === null ? stageAssets : stageAssets.filter(asset => asset.stage !== featureStatus)
  const latest = candidates[candidates.length - 1]
  return latest === undefined ? '' : join(featuresRoot, latest.path)
}

/**
 * 要素③:覆盖策略解析(Go resolveCoverage 移植;优先级 = task frontmatter
 * coverage > prefs coverage.<task-type>(三级,注册表默认承 config 默认)> 无)。
 * cleanup/refactor 恒 maintain(模板禁新测试,百分比目标与指令矛盾)。
 * 仅由可测类型调用(build.go IsTestableType 同型门)。
 */
export function resolveCoverageForType(
  taskType: string,
  taskCoverage: number | null,
  effectivePrefs: Readonly<Record<string, unknown>>,
): { strategy: string; target: string } {
  if (taskType === 'coding.cleanup' || taskType === 'coding.refactor') {
    return { strategy: 'maintain', target: 'Maintain existing coverage, no more than 2% decrease' }
  }
  if (taskCoverage !== null) {
    return { strategy: 'percentage', target: `Achieve ${String(taskCoverage)}% test coverage` }
  }
  const pref = effectivePrefs[`coverage.${taskType}`]
  // 键集封闭(3.1 注册表):封闭集外类型无覆盖指令(Go ByType 缺键同义)。
  if (pref === undefined) return { strategy: '', target: '' }
  if (typeof pref === 'object' && pref !== null && !Array.isArray(pref)) {
    const strategy = pref as { readonly type?: unknown; readonly percentage?: unknown }
    if (strategy.type === 'maintain') {
      return { strategy: 'maintain', target: 'Maintain existing coverage, no more than 2% decrease' }
    }
    if (strategy.type === 'percentage' && typeof strategy.percentage === 'number') {
      return { strategy: 'percentage', target: `Achieve ${String(strategy.percentage)}% test coverage` }
    }
  }
  return { strategy: '', target: '' }
}

/** 任务 md frontmatter 读取(coverage/complexity;不可读 → 缺省,不阻断)。 */
export function readTaskFrontmatter(featuresRoot: string, task: AuthoritativeTask): { coverage: number | null; complexity: string } {
  try {
    const fields = parseFrontmatterObject(readFileSync(taskFileOf(featuresRoot, task), 'utf8'))
    if (fields === null) return { coverage: null, complexity: '' }
    const coverage = fields.coverage
    return {
      coverage: typeof coverage === 'number' && Number.isInteger(coverage) && coverage >= 0 ? coverage : null,
      complexity: typeof fields.complexity === 'string' ? fields.complexity : '',
    }
  } catch {
    return { coverage: null, complexity: '' }
  }
}

/** 三要素 → 模板数据(promptTemplateData 11 字段;surface 三字段 M3 恒空,见模块注)。 */
export function buildPromptTemplateData(input: PresynthContextInput): PromptTemplateData {
  const type = input.task.taskType ?? ''
  const coverage = isTestableType(type)
    ? resolveCoverageForType(type, input.taskFrontmatter.coverage, input.effectivePrefs)
    : { strategy: '', target: '' }
  return {
    TaskID: input.task.taskKey,
    TaskFile: taskFileOf(input.featuresRoot, input.task),
    TaskCategory: categoryForType(type),
    FeatureSlug: input.task.featureSlug,
    PhaseSummary: resolveStageSummaryPath(input.featuresRoot, input.stageAssets, input.featureStatus),
    CoverageStrategy: coverage.strategy,
    CoverageTarget: coverage.target,
    TestTypeArg: '',
    SurfaceKey: '',
    SurfaceType: '',
    Complexity: input.taskFrontmatter.complexity === '' ? 'medium' : input.taskFrontmatter.complexity,
  }
}

// ---------------------------------------------------------------------------
// 组合(spike-3 §3/§4:前导段 + 类型协议 → 预合成内容 → 组合首条消息)
// ---------------------------------------------------------------------------

/**
 * 预合成内容 = EXECUTOR_PREAMBLE(包装协议前导段)+ 渲染后类型协议。
 * fixRecordMissed = 恢复派发路由(记录缺失 recover,Go --fix-record-missed
 * 旗标同义;M3 恢复派发由 dispatch 回流检测触发)。
 */
export function composePresynthContent(input: PresynthContextInput, opts?: { readonly fixRecordMissed?: boolean }): string {
  const template = routeTemplate(input.task.taskType, opts)
  const data = buildPromptTemplateData(input)
  const body = renderPromptTemplate(template, data, input.task.taskType ?? 'fix-record-missed')
  return `${EXECUTOR_PREAMBLE}${body}`
}

/** 组合首条消息 = 预合成内容原文 + "\n\n" + 追加行(原文不改写,仅尾部追加)。 */
export function composeFirstUserMessage(presynthContent: string, sessionId: string): string {
  return `${presynthContent}\n\n${attributionLine(sessionId)}`
}

/**
 * dispatch 预铸 sessionId(spike-3 §4):caller-minted `session-<uuid>`(M2
 * session-launch mintSessionId 同形;create({sessionId}) 幂等 adopt)。组合
 * 消息 = 其函数 → hash 随 dispatch 行落库后与 launch 解耦。
 */
export function mintDispatchSessionId(): string {
  return `session-${randomUUID()}`
}

/** 预合成引擎产物:预铸 sessionId + 组合首条消息(prompt_hash = sha256(message))。 */
export interface PresynthInjection {
  readonly sessionId: string
  readonly message: string
}

/** 引擎依赖缝(db + 文档根解析;services.ts 装配,stages 服务同源注入)。 */
export interface PresynthEngineDeps {
  readonly db: RepoDb
  readonly resolveFeaturesRoot: (projectId: string) => string | null
}

/** 从 db/fs 组装三要素上下文(确定性读;单次派发单次组装,零缓存 = 动态性)。 */
export function loadPresynthContext(deps: PresynthEngineDeps, featuresRoot: string, task: AuthoritativeTask): PresynthContextInput {
  return {
    task,
    featuresRoot,
    stageAssets: listStageAssetRows(deps.db, task.projectId, task.featureSlug),
    featureStatus: getFeatureSnapshot(deps.db, task.projectId, task.featureSlug)?.status ?? null,
    effectivePrefs: resolveEffectiveValues(deps.db, { feature: `${task.projectId}/${task.featureSlug}` }),
    taskFrontmatter: readTaskFrontmatter(featuresRoot, task),
  }
}

export interface PresynthEngine {
  /** 组合产物(seam 消费形态:dispatch-service composePrompt 接线)。 */
  compose(task: AuthoritativeTask, opts?: { readonly fixRecordMissed?: boolean }): PresynthInjection
  /** 预合成内容单读(I5 新阶段会话注入/断言面同源)。 */
  composePresynth(task: AuthoritativeTask, opts?: { readonly fixRecordMissed?: boolean }): string
}

/** 引擎铸造(compose 每调用一次新预铸 sessionId + 现读三要素,反映最新值)。 */
export function createPresynthEngine(deps: PresynthEngineDeps): PresynthEngine {
  const build = (
    task: AuthoritativeTask,
    opts?: { readonly fixRecordMissed?: boolean },
  ): { content: string; injection: PresynthInjection } => {
    const featuresRoot = deps.resolveFeaturesRoot(task.projectId)
    if (featuresRoot === null) {
      throw new Error(`presynth: no features root resolves for project ${task.projectId} (project not registered)`)
    }
    const content = composePresynthContent(loadPresynthContext(deps, featuresRoot, task), opts)
    const sessionId = mintDispatchSessionId()
    return { content, injection: { sessionId, message: composeFirstUserMessage(content, sessionId) } }
  }
  return {
    compose(task, opts) {
      return build(task, opts).injection
    },
    composePresynth(task, opts) {
      return build(task, opts).content
    },
  }
}

// ---------------------------------------------------------------------------
// 模板库完整性校验(spike-4 缺口 7:ValidatePromptTemplates 契约移植)
// ---------------------------------------------------------------------------

/**
 * 库完整性(Go ValidatePromptTemplates 形态;测试/启动期消费):
 *   - 每模板非空 + 元数据 frontmatter 可解析,声明的 identity/context/
 *     conditional 变量 ⊆ PROMPT_TEMPLATE_FIELDS(reflect 交叉验证移植);
 *   - 零值数据可渲染(全字段空串;missingkey=error → 字段拼错即抛)。
 */
export function validateTemplateLibrary(): void {
  const zeroData = Object.fromEntries(PROMPT_TEMPLATE_FIELDS.map(field => [field, ''])) as unknown as PromptTemplateData
  for (const [key, template] of Object.entries(PROMPT_TEMPLATES)) {
    if (template === '') throw new Error(`presynth template library: entry '${key}' is empty`)
    const fields = parseFrontmatterObject(template)
    if (fields === null) {
      throw new Error(`presynth template library: entry '${key}' carries no metadata frontmatter`)
    }
    for (const group of ['identity', 'context', 'conditional'] as const) {
      const declared = fields[group]
      if (declared === undefined) continue
      if (!Array.isArray(declared)) {
        throw new Error(`presynth template library: entry '${key}' metadata '${group}' must be a list`)
      }
      for (const name of declared) {
        if (typeof name !== 'string' || !PROMPT_TEMPLATE_FIELDS.includes(name)) {
          throw new Error(`presynth template library: entry '${key}' declares variable '${String(name)}' which is not a template data field`)
        }
      }
    }
    renderPromptTemplate(template, zeroData, key)
  }
}
