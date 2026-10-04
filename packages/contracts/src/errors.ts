// 六错误码 typed 定义（tech-design §Error Handling「Error Types & Codes」表逐行对照）。
// 能力面/服务层抛 typed error（code 字面量锚定本 ERROR_CODES；类名/name 由 core 双域
// errors.ts 手写字面量——本文件不持运行期名映射，fix-34 删死常量 ERROR_NAMES 后注释如实），
// RPC 边界序列化为 RpcErrorPayload，UI 按 code 映射状态（空态/错误条/横幅）。
// 定位铁律：纯常量与类型，零逻辑零依赖。

/** 错误码全集（行序 = Error Handling 表行序；行尾 → 类名 = 表 Name 列的文档性映射，
 *  core 双域 errors.ts 手写字面量，不消费本注释——fix-34 删死常量后承诺如实） */
export const ERROR_CODES = [
  'ERR_WORKSPACE_CREATE', // → WorkspaceCreateError：dsh create 失败（注册中止，无补偿需要）
  'ERR_PROJECT_WRITE', // → ProjectWriteError：③ 应用库写入失败（触发 ④ 补偿）
  'ERR_COMPENSATION', // → CompensationError：补偿调用失败——app_key_logs 记账 + 启动对账提示（不自动删）
  'ERR_ENTRY_NOT_FOUND', // → EntryNotFoundError：entryId 未命中（索引重建后 ID 漂移）
  'ERR_INDEX_STALE', // → IndexStaleError：索引缺失/过期提示（触发静默重建）
  'ERR_INVALID_KNOWLEDGE_DIR', // → InvalidKnowledgeDirError：知识目录不可达/非法
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** RPC 边界错误序列化形状（Propagation Strategy：`{ code, message, data }`）。
 *  data = 结构化附载（workspaceId / projectId / 失败原因 / 处置结果等）；UI 按 code 映射状态。 */
export interface RpcErrorPayload {
  code: ErrorCode
  message: string
  data?: unknown
}
