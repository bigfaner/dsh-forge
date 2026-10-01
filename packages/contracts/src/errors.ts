// 六错误码 typed 定义（tech-design §Error Handling「Error Types & Codes」表逐行对照）。
// 能力面/服务层抛 typed error（类名 = ERROR_NAMES 映射），RPC 边界序列化为 RpcErrorPayload，
// UI 按 code 映射状态（空态/错误条/横幅）。定位铁律：纯常量与类型，零逻辑零依赖。

/** 错误码全集（行序 = Error Handling 表行序） */
export const ERROR_CODES = [
  'ERR_WORKSPACE_CREATE', // dsh create 失败（注册中止，无补偿需要）
  'ERR_PROJECT_WRITE', // ③ 应用库写入失败（触发 ④ 补偿）
  'ERR_COMPENSATION', // 补偿调用失败——app_key_logs 记账 + 启动对账提示（不自动删）
  'ERR_ENTRY_NOT_FOUND', // entryId 未命中（索引重建后 ID 漂移）
  'ERR_INDEX_STALE', // 索引缺失/过期提示（触发静默重建）
  'ERR_INVALID_KNOWLEDGE_DIR', // 知识目录不可达/非法
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** 错误码 → typed error 类名（表 Name 列；core 侧据此定义错误类） */
export interface ErrorCodeNameMap {
  ERR_WORKSPACE_CREATE: 'WorkspaceCreateError'
  ERR_PROJECT_WRITE: 'ProjectWriteError'
  ERR_COMPENSATION: 'CompensationError'
  ERR_ENTRY_NOT_FOUND: 'EntryNotFoundError'
  ERR_INDEX_STALE: 'IndexStaleError'
  ERR_INVALID_KNOWLEDGE_DIR: 'InvalidKnowledgeDirError'
}

export const ERROR_NAMES: Readonly<ErrorCodeNameMap> = {
  ERR_WORKSPACE_CREATE: 'WorkspaceCreateError',
  ERR_PROJECT_WRITE: 'ProjectWriteError',
  ERR_COMPENSATION: 'CompensationError',
  ERR_ENTRY_NOT_FOUND: 'EntryNotFoundError',
  ERR_INDEX_STALE: 'IndexStaleError',
  ERR_INVALID_KNOWLEDGE_DIR: 'InvalidKnowledgeDirError',
}

/** RPC 边界错误序列化形状（Propagation Strategy：`{ code, message, data }`）。
 *  data = 结构化附载（workspaceId / projectId / 失败原因 / 处置结果等）；UI 按 code 映射状态。 */
export interface RpcErrorPayload {
  code: ErrorCode
  message: string
  data?: unknown
}
