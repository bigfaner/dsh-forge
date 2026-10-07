// tool 返回面双友好模板（定位：业务——tech-design Interfaces「tool 返回面规范」+
// 裁决⑨：所有 forge tool 返回 formatOk/formatErr 格式化文本——agent 友好 + 人类可读，
// 老 forge 先例）。双面分治不破：RPC/桥 typed error 信封照旧（错误码/结构化 data 经
// RpcErrorPayload 序列化——本模块零涉及）；tool 面把 typed 服务错误转写为失败 DTO，
// 经 output.render 投影为「✗ <code> — 人话 + 违规清单逐行」文本。
// 判别口径：code ∈ contracts ERROR_CODES（跨 IPC/序列化附载后仍可识别——与
// isWorkspaceNotRegisteredError 同以 code 承载）；无 code 的意外错误（装配 bug/
// 参数形状防御收窄抛出的普通 Error）不吞——原样重抛保持 fail-loud。
import { ERROR_CODES, type ErrorCode } from '@dsh-forge/contracts'
import type { TextContentBlock } from '../faces.js'

/** tool 失败 DTO（typed 服务错误的返回面形态——render 判别分支） */
export interface ForgeToolFailure {
  readonly ok: false
  readonly code: ErrorCode
  /** 人话原因（首行承重；多段消息整段保留） */
  readonly message: string
  /** 违规清单（自然键/AC 条目/环路径——逐行投影；无结构化载荷 = 空数组） */
  readonly violations: readonly string[]
}

/** 失败 DTO 判别（render 分支口——code 承载，结构面宽松自证） */
export function isForgeToolFailure(v: unknown): v is ForgeToolFailure {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { ok?: unknown }).ok === false &&
    typeof (v as { code?: unknown }).code === 'string' &&
    typeof (v as { message?: unknown }).message === 'string'
  )
}

/** typed error 判别（code ∈ ERROR_CODES；插件侧 WorkspaceNotRegisteredError 同径） */
export function errorCodeOf(e: unknown): ErrorCode | undefined {
  if (typeof e !== 'object' || e === null) return undefined
  const code = (e as { code?: unknown }).code
  return typeof code === 'string' && (ERROR_CODES as readonly string[]).includes(code) ? (code as ErrorCode) : undefined
}

/** 结构化 data 载荷 → 违规清单行（contracts 各 *Data 接口逐码派生；缺席 = 空清单） */
function violationLinesOf(code: ErrorCode, data: unknown): readonly string[] {
  if (typeof data !== 'object' || data === null) return []
  const d = data as Record<string, unknown>
  switch (code) {
    case 'ERR_DEPENDENCIES_UNMET': {
      const unmet = Array.isArray(d.unmet) ? d.unmet : []
      return unmet.map((u) => {
        const r = u as { slug?: unknown; localId?: unknown; taskStatus?: unknown }
        return `unmet prerequisite: ${String(r.slug)}/${String(r.localId)} [${String(r.taskStatus)}]`
      })
    }
    case 'ERR_CYCLE_DETECTED': {
      const cycle = Array.isArray(d.cycle) ? (d.cycle as unknown[]) : []
      return cycle.length > 0 ? [`cycle: ${cycle.map((n) => String(n)).join(' → ')}`] : []
    }
    case 'ERR_TEST_EVIDENCE_REQUIRED': {
      const ac = Array.isArray(d.acceptanceCriteria) ? d.acceptanceCriteria : []
      return ac.map((item) => `missing evidence for AC: ${String(item)}`)
    }
    case 'ERR_SUSPECTED_MOVE': {
      const lines: string[] = []
      if (typeof d.existingDir === 'string') lines.push(`existing orphan dir: ${d.existingDir}`)
      if (typeof d.derivedDir === 'string') lines.push(`derived dir: ${d.derivedDir}`)
      if (typeof d.guidance === 'string') lines.push(`guidance: ${d.guidance}`)
      return lines
    }
    default:
      return []
  }
}

/** typed error → 失败 DTO（调用方先经 errorCodeOf 判别；violations 从 data 载荷派生） */
export function forgeToolFailureOf(e: unknown): ForgeToolFailure {
  const code = errorCodeOf(e)
  if (code === undefined) throw new TypeError('forge tool face: forgeToolFailureOf called on a non-typed error')
  const message = e instanceof Error ? e.message : String(e)
  return {
    ok: false,
    code,
    message,
    violations: violationLinesOf(code, (e as { data?: unknown }).data),
  }
}

/**
 * 执行体包装（六 tool 共用）：typed 服务错误 → 失败 DTO（tool 返回面 formatErr 分支）；
 * 无 code 的意外错误原样重抛（fail-loud——装配 bug 不静默转写）。
 * onTypedError（3.4 事件缝）：捕获 typed 错误后、返回失败 DTO 前回调一次——
 * tool-error 事件发射（→ 总线）唯一挂点（emitToolError；回调自身异常不影响返回面）。
 */
export async function callToolFace<T>(
  op: () => Promise<T>,
  onTypedError?: (failure: ForgeToolFailure) => void,
): Promise<T | ForgeToolFailure> {
  try {
    return await op()
  } catch (e) {
    if (errorCodeOf(e) === undefined) throw e
    const failure = forgeToolFailureOf(e)
    if (onTypedError !== undefined) {
      try {
        onTypedError(failure)
      } catch {
        // 事件发射异常不吞失败面（emit 面自身 fail-loud 由调用方守卫兜底）
      }
    }
    return failure
  }
}

/** 成功渲染（formatOk）：首行 `✓ <动词结果>` + 键值行 */
export function formatOk(headline: string, entries: readonly string[]): readonly TextContentBlock[] {
  return [{ type: 'text', text: [`✓ ${headline}`, ...entries].join('\n') }]
}

/** 失败渲染（formatErr）：首行 `✗ <code> — 人话`（多段消息整段保留）+ 违规清单逐行 */
export function formatFailure(f: ForgeToolFailure): readonly TextContentBlock[] {
  const [head, ...rest] = f.message.split('\n')
  const lines = [`✗ ${f.code} — ${head}`, ...rest, ...f.violations]
  return [{ type: 'text', text: lines.join('\n') }]
}

/** 失败 DTO 的注册面输出 schema 片段（各 tool output.schema 的 oneOf 第二支） */
export const FORGE_TOOL_FAILURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', description: 'false = typed service error captured as the tool failure face.' },
    code: { type: 'string', description: 'One of the forge ERROR_CODES (e.g. ERR_TASK_NOT_FOUND).' },
    message: { type: 'string', description: 'Human-readable cause of the failure.' },
    violations: {
      type: 'array',
      items: { type: 'string' },
      description: 'Offending items, one entry per line (unmet prerequisites, AC checklist, cycle path); empty when the error carries no structured payload.',
    },
  },
  required: ['ok', 'code', 'message', 'violations'],
} as const

/** 成功 schema → 双支 schema（成功 DTO | 失败 DTO——registry 对两态值均可校验） */
export function withFailureVariant<S extends object>(success: S): { oneOf: [S, typeof FORGE_TOOL_FAILURE_SCHEMA] } {
  return { oneOf: [success, FORGE_TOOL_FAILURE_SCHEMA] }
}
