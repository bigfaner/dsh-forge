// triage · 结构化决策解析（S1c 第二层——处置代理输出契约的宿主侧收口）。
// 输出契约（封闭四动作枚举，proposal blocked-salvage-split B——split-remainder 为第四态；
// escalate = 上浮主会话，loop-recurrence-hardening §2.2.1——原 ask-user 改名，语义为上浮
// 非工具、不预设问用户；可选升级载荷四节向后兼容旧无载荷形态）：
//   {"action":"add-fix","title":"...","type":"coding-fix","taskDesc":"...","note":"..."}
//   {"action":"wait-external","externalSlug":"..."}
//   {"action":"escalate"}
//   {"action":"escalate","classification":"...","disposition":"...","delegateTarget":"...","evidencePointers":[...]}
//   {"action":"split-remainder","title":"...","type":"...","taskDesc":"...","note":"..."}
// 解析纪律（decisions #8/#16/R2）：无效输出（非 JSON/结构错/字段型错）与越权输出（action
// 越出封闭枚举）一律抛 TriageDecisionInvalidError——宿主计一次处置失败入重试上限，绝不
// 猜测兜底（忠实执行封闭枚举 = 模型失误爆炸半径有界的第一道闸）。
import { TASK_TYPES, type TaskType } from '@dsh-forge/contracts'
import type { LoopTriageDecision } from '../loop/index.js'

/** 无效/越权处置决策（宿主忠实执行纪律的拒绝面——计处置失败入重试上限，driver 消费） */
export class TriageDecisionInvalidError extends Error {
  /** 原始输出摘要（落盘/历史行用——非全文） */
  readonly rawSummary: string

  constructor(message: string, raw: string) {
    super(`处置决策无效——${message}`)
    this.name = 'TriageDecisionInvalidError'
    this.rawSummary = raw.length > 200 ? `${raw.slice(0, 200)}……` : raw
  }
}

/** 尾部截取窗口（决策行约定为输出末尾的 JSON 对象——扫描窗口有界防超长输出拖垮解析） */
const TAIL_WINDOW = 4000

/** escalate 升级载荷各文本节限长（提案 2.2.1 限长约定——指针化引用不搬运全文，超限即无效） */
export const TRIAGE_ESCALATION_SECTION_MAX = 2000

/** escalate 升级载荷证据指针条数上限（指针化纪律——数组刷量即无效） */
export const TRIAGE_ESCALATION_POINTER_MAX = 8

/** 平衡对象回溯尝试上限（防病态输出） */
const MAX_CANDIDATES = 64

/**
 * 决策 JSON 提取：① 代码围栏块（```json …```，自尾向前取首个以 { 开头的块）；
 * ② 裸对象——尾部窗口内自最后一个 } 向前逐 { 回溯，首个可解析者。均未命中 = undefined。
 */
export function extractDecisionJson(raw: string): string | undefined {
  const fences = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => (m[1] ?? '').trim())
  for (let i = fences.length - 1; i >= 0; i--) {
    const candidate = fences[i] ?? ''
    if (candidate.startsWith('{') || candidate.startsWith('[')) return candidate // 围栏即候选——对象性交解析面判
  }
  const tail = raw.length > TAIL_WINDOW ? raw.slice(-TAIL_WINDOW) : raw
  const close = tail.lastIndexOf('}')
  if (close < 0) return undefined
  let attempts = 0
  for (let open = tail.lastIndexOf('{', close); open >= 0 && attempts < MAX_CANDIDATES; open = tail.lastIndexOf('{', open - 1)) {
    attempts += 1
    const candidate = tail.slice(open, close + 1)
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      // 继续向前回溯（嵌套对象 → 外层对象）
    }
  }
  return undefined
}

/** 可选字符串字段（在场必须字符串——型错即无效，不静默转写） */
function optionalString(record: Record<string, unknown>, key: string, action: string): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new TriageDecisionInvalidError(`${action}.${key} 须为字符串`, JSON.stringify(record))
  return value
}

/** fix/继任任务类型字段（缺省 coding-fix；在场必须 ∈ TASK_TYPES——越权类型即无效） */
function optionalTaskType(record: Record<string, unknown>, action: string): TaskType | undefined {
  const value = record.type
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !(TASK_TYPES as readonly string[]).includes(value)) {
    throw new TriageDecisionInvalidError(`${action}.type 越出任务类型全集——${String(value)}`, JSON.stringify(record))
  }
  return value as TaskType
}

/** escalate 载荷文本节（在场必须限内字符串——型错/超限即无效，不静默截断） */
function escalationSection(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new TriageDecisionInvalidError(`escalate.${key} 须为字符串`, JSON.stringify(record))
  if (value.length > TRIAGE_ESCALATION_SECTION_MAX) {
    throw new TriageDecisionInvalidError(
      `escalate.${key} 超限（${value.length} > ${TRIAGE_ESCALATION_SECTION_MAX} 字符）——升级载荷须指针化引用，不整段搬运`,
      JSON.stringify(record),
    )
  }
  return value
}

/** escalate 载荷证据指针节（字符串数组，条数 ≤ 上限、逐条限长——指针化纪律） */
function escalationPointers(record: Record<string, unknown>): readonly string[] | undefined {
  const value = record.evidencePointers
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new TriageDecisionInvalidError('escalate.evidencePointers 须为字符串数组', JSON.stringify(record))
  }
  const pointers = value as string[]
  if (pointers.length > TRIAGE_ESCALATION_POINTER_MAX) {
    throw new TriageDecisionInvalidError(
      `escalate.evidencePointers 超限（${pointers.length} > ${TRIAGE_ESCALATION_POINTER_MAX} 条）`,
      JSON.stringify(record),
    )
  }
  for (const pointer of pointers) {
    if (pointer.length > TRIAGE_ESCALATION_SECTION_MAX) {
      throw new TriageDecisionInvalidError(
        `escalate.evidencePointers 单条超限（> ${TRIAGE_ESCALATION_SECTION_MAX} 字符）`,
        JSON.stringify(record),
      )
    }
  }
  return pointers
}

/**
 * 决策解析（triage 代理终态 output → 封闭四动作决策）：
 * - add-fix：宿主经 addTask 建 fix 链（title/type/taskDesc/note 全可选——缺省由宿主补，
 *   blockSource 挂接归宿主定，模型只定内容参数）；
 * - wait-external：externalSlug 必带非空（外部任务源键——记录等待续领其它）；
 * - escalate：上浮主会话（原 ask-user 改名——上浮非问询）；可选升级载荷四节
 *   （classification/disposition/delegateTarget 文本各 ≤ 限长 + evidencePointers 指针数组），
 *   旧无载荷形态解析零回归（载荷全缺省 = 纯动作）；
 * - split-remainder：宿主经 addTask(blockSource:false) 建继任任务承接剩余范围（字段形同
 *   add-fix——校验同款；源任务保持 blocked 不恢复）。
 * 越权动作（枚举外）/结构错/字段型错 → TriageDecisionInvalidError（计处置失败）。
 */
export function parseTriageDecision(raw: string): LoopTriageDecision {
  const jsonText = extractDecisionJson(raw)
  if (jsonText === undefined) {
    throw new TriageDecisionInvalidError('输出不含 JSON 决策（封闭四动作契约）', raw)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new TriageDecisionInvalidError('决策 JSON 解析失败', jsonText)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TriageDecisionInvalidError('决策不是 JSON 对象', jsonText)
  }
  const record = parsed as Record<string, unknown>
  switch (record.action) {
    case 'add-fix': {
      const title = optionalString(record, 'title', 'add-fix')
      const type = optionalTaskType(record, 'add-fix')
      const taskDesc = optionalString(record, 'taskDesc', 'add-fix')
      const note = optionalString(record, 'note', 'add-fix')
      return {
        action: 'add-fix',
        ...(title !== undefined ? { title } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(taskDesc !== undefined ? { taskDesc } : {}),
        ...(note !== undefined ? { note } : {}),
      }
    }
    case 'split-remainder': {
      const title = optionalString(record, 'title', 'split-remainder')
      const type = optionalTaskType(record, 'split-remainder')
      const taskDesc = optionalString(record, 'taskDesc', 'split-remainder')
      const note = optionalString(record, 'note', 'split-remainder')
      return {
        action: 'split-remainder',
        ...(title !== undefined ? { title } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(taskDesc !== undefined ? { taskDesc } : {}),
        ...(note !== undefined ? { note } : {}),
      }
    }
    case 'wait-external': {
      const externalSlug = optionalString(record, 'externalSlug', 'wait-external')
      if (externalSlug === undefined || externalSlug.trim() === '') {
        throw new TriageDecisionInvalidError('wait-external.externalSlug 必带非空（外部任务源键）', jsonText)
      }
      return { action: 'wait-external', externalSlug: externalSlug.trim() }
    }
    case 'escalate': {
      const classification = escalationSection(record, 'classification')
      const disposition = escalationSection(record, 'disposition')
      const delegateTarget = escalationSection(record, 'delegateTarget')
      const evidencePointers = escalationPointers(record)
      return {
        action: 'escalate',
        ...(classification !== undefined || disposition !== undefined || delegateTarget !== undefined || evidencePointers !== undefined
          ? {
              payload: {
                ...(classification !== undefined ? { classification } : {}),
                ...(disposition !== undefined ? { disposition } : {}),
                ...(delegateTarget !== undefined ? { delegateTarget } : {}),
                ...(evidencePointers !== undefined ? { evidencePointers } : {}),
              },
            }
          : {}),
      }
    }
    default:
      throw new TriageDecisionInvalidError(
        `越权动作——${String(record.action)}（封闭四动作枚举 add-fix/wait-external/escalate/split-remainder 之外）`,
        jsonText,
      )
  }
}
