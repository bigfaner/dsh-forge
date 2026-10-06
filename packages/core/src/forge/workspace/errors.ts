// forge/workspace 域 typed error（tech-design §Error Handling：ERR_WORKSPACE_DB_UNAVAILABLE——
// 惰性开库/迁移失败 → 工作区隔离态，503；任务 1.4 增 ERR_SUSPECTED_MOVE——注册碰撞三态拒绝面，
// 409）。code 字面量锚定 @dsh-forge/contracts ERROR_CODES，
// 类名/name 手写字面量（contracts 不持运行期名映射——fix-34 后表 Name 列为文档性对照）；
// RPC 边界序列化为 RpcErrorPayload { code, message, data }，UI 按 code 映射工作区隔离态。
import type { SuspectedMoveData } from '@dsh-forge/contracts'

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

// ── ERR_SUSPECTED_MOVE（任务 1.4：注册碰撞三态拒绝面——tech-design Error Handling 表 409 行） ──

/**
 * 注册碰撞拒绝（同扁平化主体异 hash8 = 疑似移动；目标目录在场而中央无注册 = §6-33 兜底）。
 * 拒绝注册零副作用：注册闭包复检位于中央行落库（与 ② registry.create/目录确保）之前抛出；
 * data 三元（existingDir/derivedDir/guidance）由 derive-dir.ts 分类器单源产出（表单预检位
 * 与注册闭包复检同文案）。UI = 错误条 + 手工指引留场（认领对话框 = M3）。
 */
export class SuspectedMoveError extends Error {
  readonly code = 'ERR_SUSPECTED_MOVE' as const
  readonly data: SuspectedMoveData

  constructor(data: SuspectedMoveData) {
    super(`注册碰撞拒绝（疑似移动）：推导 ${data.derivedDir}，既有 ${data.existingDir}——${data.guidance}`)
    this.name = 'SuspectedMoveError'
    this.data = data
  }
}
