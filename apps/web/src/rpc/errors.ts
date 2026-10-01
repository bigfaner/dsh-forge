// RPC 客户端错误（定位：基础——信封 RpcErr 的反序列化面，AC2 边界保真的 renderer 侧半边）。
// main 侧 serializeRpcError 序列化 { code, message, data } → 本类还原为可捕获 typed error：
// UI 消费约定 = catch RpcClientError → rpcUiState(code) 选状态组件（见 ui-state.ts 与 README）。
import type { ErrorCode, RpcErrorPayload } from '@dsh-forge/contracts'

/** typed error 的 renderer 侧形态（code ∈ contracts 六码；data = 结构化附载原样保真） */
export class RpcClientError extends Error {
  readonly code: ErrorCode
  readonly data: unknown

  constructor(payload: RpcErrorPayload) {
    super(payload.message)
    this.name = 'RpcClientError'
    this.code = payload.code
    this.data = payload.data
  }
}
