// workspace 守卫单源（F-2 DRY 收口——convertDocument / getOutline / validateMermaid
// 三 tool 共用的 session.cwd 锚解析 + 路径穿越守卫唯一事实源）。守卫逻辑只在本
// 文件一处：拒绝先于任何 IO，空串/绝对路径（盘符/UNC/POSIX）、「..」段、解析后
// 越出根一律 RelPathError（code = ERR_IO）；各 tool 壳以自家 typed error 包装转译
// （错误码口径统一：读盘/锚位失败 = IO 域，ERR_INVALID_ARGS 保留给参数形状）。
import { isAbsolute, resolve, sep } from 'node:path'
import type { ToolExecFace } from '../faces.js'

/** session.cwd 锚解析（knowledge sessionContextOf 同构裁剪——cwd 兼容位双读） */
export function sessionCwdOf(exec: ToolExecFace | undefined): string | undefined {
  const session = exec?.agent?.session
  if (session === undefined) return undefined
  return session.header?.cwd ?? session.cwd
}

/** 穿越守卫 typed error（code 承载——守卫单源判别锚，tool 壳转译为自家错误型） */
export class RelPathError extends Error {
  readonly code: 'ERR_IO'

  constructor(message: string) {
    super(message)
    this.name = 'RelPathError'
    this.code = 'ERR_IO'
  }
}

/** typed error 判别（结构面宽松自证——跨序列化附载后仍可识别） */
export function isRelPathError(e: unknown): e is RelPathError {
  return (
    e instanceof RelPathError ||
    (typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'RelPathError' && (e as { code?: unknown }).code === 'ERR_IO')
  )
}

const ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/

export interface RelPathGuardOptions {
  /** 错误消息 tool 前缀（可归因诊断面） */
  readonly tool: string
  /** 错误消息参数名（docRel / outRel） */
  readonly field: string
}

/**
 * 路径穿越守卫（唯一事实源——拒绝先于任何 IO）：空串/绝对路径/`..` 段/解析后
 * 越出根一律 RelPathError(ERR_IO)；合法相对路径返回 workspace 根下解析绝对路径
 * （= 读取锚，调用方直接喂 fs 缝）。
 */
export function assertRelUnderRoot(rootAbs: string, rel: string, opts: RelPathGuardOptions): string {
  const { tool, field } = opts
  if (typeof rel !== 'string' || rel.trim() === '') {
    throw new RelPathError(`${tool}: ${field} must be a non-empty relative path (workspace-root anchored)`)
  }
  if (isAbsolute(rel) || ABSOLUTE_PATH_PATTERN.test(rel)) {
    throw new RelPathError(`${tool}: ${field} must be relative to the workspace root — absolute paths are rejected: ${rel}`)
  }
  if (rel.split(/[\\/]+/).includes('..')) {
    throw new RelPathError(`${tool}: ${field} must stay inside the workspace root — ".." path traversal is rejected: ${rel}`)
  }
  const abs = resolve(rootAbs, rel)
  const normRoot = rootAbs.endsWith(sep) ? rootAbs.slice(0, -1) : rootAbs
  if (abs !== normRoot && !abs.startsWith(normRoot + sep)) {
    throw new RelPathError(`${tool}: ${field} resolves outside the workspace root: ${rel}`)
  }
  return abs
}
