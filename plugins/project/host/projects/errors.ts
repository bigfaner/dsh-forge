// 注册域 typed error 面（plugin-project 1.10）——code 字面量锚定 @dsh-forge/lib-api
// ERROR_CODES 单源（禁本地词表复制）；RPC 边界经宿主序列化为 RpcErrorPayload（code/message/data）。
import { DIAG_EVENT, emitDiagOrFallback } from '@dsh-forge/lib-diag'
import type { DiagEmitFace, DiagEventPayload } from '@dsh-forge/lib-diag'
import type { ErrorCode, SuspectedMoveData } from '@dsh-forge/lib-api/errors'

type DiagPayload = Omit<DiagEventPayload, 'process'>

/** 注册域 typed error 基类（code ∈ ERROR_CODES 字面量池；data 结构化附载原样透传）。 */
export class ProjectDomainError extends Error {
  readonly code: ErrorCode
  readonly data?: unknown

  constructor(code: ErrorCode, message: string, data?: unknown) {
    super(message)
    this.name = code
    this.code = code
    this.data = data
  }
}

/** ERR_SUSPECTED_MOVE：注册碰撞三态非 normal（present 未确认 / suspected-move）——零副作用拒绝。 */
export class SuspectedMoveError extends ProjectDomainError {
  constructor(data: SuspectedMoveData) {
    super('ERR_SUSPECTED_MOVE', data.guidance, data)
  }
}

/** ERR_WORKSPACE_CREATE：步 3 registry.create 失败（注册中止，无补偿需要——dsh 侧零副作用）。 */
export class WorkspaceCreateError extends ProjectDomainError {
  constructor(message: string, data?: unknown) {
    super('ERR_WORKSPACE_CREATE', message, data)
  }
}

/** ERR_PROJECT_WRITE：步 4 双表事务写失败（触发补偿链；data.compensated = CompensatedInfo）。 */
export class ProjectWriteError extends ProjectDomainError {
  constructor(message: string, data?: unknown) {
    super('ERR_PROJECT_WRITE', message, data)
  }
}

/** ERR_COMPENSATION：补偿删除失败——emitDiag error 留痕交启动对账（不自动删，可重入）。 */
export class CompensationError extends ProjectDomainError {
  constructor(message: string, data?: unknown) {
    super('ERR_COMPENSATION', message, data)
  }
}

/**
 * 诊断缝发射（fire-and-forget）——onDiag 缺席走 console 兜底（诊断不静默，lib-diag 单源）。
 * DiagEmitFace 形状的 ctx 直接透传 emitDiag；测试注入收集闭包。
 */
export function diag(ctx: DiagEmitFace | ((payload: DiagPayload) => void) | undefined, payload: DiagPayload): void {
  if (ctx === undefined) {
    emitDiagOrFallback(undefined, payload)
    return
  }
  if (typeof ctx === 'function') {
    emitDiagOrFallback(ctx, payload)
    return
  }
  emitDiagOrFallback(
    (p) => ctx.emit(DIAG_EVENT, { ...p, process: 'main' }) /* 进程位由装配侧单面补齐——插件域恒 main 进程 */,
    payload,
  )
}
