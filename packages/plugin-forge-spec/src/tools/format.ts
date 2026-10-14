// tool 返回面双友好模板（plugin-forge tools/format.ts 的局部镜像——3.5 统一收口对齐
// 既定方向前的 spec 侧局部实现）。裁剪面：无 tool-error 事件钩子（本插件无事件缝）、
// 无违规载荷派生（spec 三动词 typed error 无结构化 violations 载荷——恒空数组）。
// 双面分治不破：typed 服务错误（code ∈ contracts ERROR_CODES，含插件侧
// WorkspaceNotRegisteredError）→ 失败 DTO 经 output.render 投影为「✗ <code> — 人话」
// 文本；无 code 的意外错误（装配 bug/参数形状防御收窄抛出的普通 Error）不吞——
// 原样重抛保持 fail-loud。
import { ERROR_CODES, type ErrorCode } from '@dsh-forge/contracts'
import type { TextContentBlock } from '../faces.js'

/** tool 失败 DTO（typed 服务错误的返回面形态——render 判别分支） */
export interface ForgeToolFailure {
  readonly ok: false
  readonly code: ErrorCode
  /** 人话原因（首行承重；多段消息整段保留） */
  readonly message: string
  /** 违规清单（spec 动词无结构化载荷——恒空数组；字段在位保持与 forge 失败支同形） */
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

/** typed error → 失败 DTO（调用方先经 errorCodeOf 判别） */
export function forgeToolFailureOf(e: unknown): ForgeToolFailure {
  const code = errorCodeOf(e)
  if (code === undefined) throw new TypeError('forge tool face: forgeToolFailureOf called on a non-typed error')
  return {
    ok: false,
    code,
    message: e instanceof Error ? e.message : String(e),
    violations: [],
  }
}

/**
 * 执行体包装（三 tool 共用）：typed 服务错误 → 失败 DTO（tool 返回面 ✗ 分支）；
 * 无 code 的意外错误原样重抛（fail-loud——装配 bug 不静默转写）。
 */
export async function callToolFace<T>(op: () => Promise<T>): Promise<T | ForgeToolFailure> {
  try {
    return await op()
  } catch (e) {
    if (errorCodeOf(e) === undefined) throw e
    return forgeToolFailureOf(e)
  }
}

/** 成功渲染（formatOk）：首行 `✓ <动词结果>` + 键值行 */
export function formatOk(headline: string, entries: readonly string[]): readonly TextContentBlock[] {
  return [{ type: 'text', text: [`✓ ${headline}`, ...entries].join('\n') }]
}

/** 失败渲染（formatErr）：首行 `✗ <code> — 人话`（多段消息整段保留） */
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
    code: { type: 'string', description: 'One of the forge ERROR_CODES (e.g. ERR_WORKSPACE_NOT_REGISTERED).' },
    message: { type: 'string', description: 'Human-readable cause of the failure.' },
    violations: {
      type: 'array',
      items: { type: 'string' },
      description: 'Offending items, one entry per line; empty when the error carries no structured payload.',
    },
  },
  required: ['ok', 'code', 'message', 'violations'],
} as const

/** 成功 schema → 双支 schema（成功 DTO | 失败 DTO——registry 对两态值均可校验） */
export function withFailureVariant<S extends object>(success: S): { oneOf: [S, typeof FORGE_TOOL_FAILURE_SCHEMA] } {
  return { oneOf: [success, FORGE_TOOL_FAILURE_SCHEMA] }
}
