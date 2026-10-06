// forge/workspace 域 typed error（tech-design §Error Handling：ERR_WORKSPACE_DB_UNAVAILABLE——
// 惰性开库/迁移失败 → 工作区隔离态，503）。code 字面量锚定 @dsh-forge/contracts ERROR_CODES，
// 类名/name 手写字面量（contracts 不持运行期名映射——fix-34 后表 Name 列为文档性对照）；
// RPC 边界序列化为 RpcErrorPayload { code, message, data }，UI 按 code 映射工作区隔离态。

/** 工作区库不可用附载（RpcErrorPayload.data 形状：标识 + 失败原因 + 处置结果；
 *  type 别名非 interface——对象字面量形状可隐式索引签名，直入 WorkspaceKeyLogEntry.data） */
export type WorkspaceDbUnavailableData = {
  /** 中央 projects.id */
  projectId: string
  /** 工作区库派生目录（{tasksHome}/{flatten}@{hash8}——resolveDir 产物） */
  dir: string
  /** 失败原因（errMessage 收编） */
  error: string
  /** 处置结果（工作区隔离——其余工作区照常） */
  disposition: string
}

/** 惰性开库/迁移/结构健全性检查失败（工作区隔离态：本进程内该工作区任务域不可用，不抛断用户流程） */
export class WorkspaceDbUnavailableError extends Error {
  readonly code = 'ERR_WORKSPACE_DB_UNAVAILABLE' as const
  readonly data: WorkspaceDbUnavailableData

  constructor(data: WorkspaceDbUnavailableData, cause: unknown) {
    super(
      `工作区任务库不可用（已隔离，其余工作区照常）：${data.projectId} @ ${data.dir}——${data.error}（${data.disposition}）`,
      { cause },
    )
    this.name = 'WorkspaceDbUnavailableError'
    this.data = data
  }
}

/** 运行期判别（跨 IPC / 日志附载后仍可识别）。 */
export function isWorkspaceDbUnavailableError(e: unknown): e is WorkspaceDbUnavailableError {
  return e instanceof WorkspaceDbUnavailableError
}
