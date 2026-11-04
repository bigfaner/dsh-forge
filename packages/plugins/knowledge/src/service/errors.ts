// 知识服务域 typed errors（1.7 随迁自 core——RPC 边界序列化为 RpcErrorPayload
// { code, message, data }，UI 按 code 映射状态；code 字面量锚定 @dsh-forge/contracts
// ERROR_CODES）。InvalidKnowledgeDirError 已在 storage/scan.ts（1.5 自持拷单源）。
/** 知识域错误附载（RpcErrorPayload.data 的形状：标识 + 失败原因） */
export interface KnowledgeErrorData {
  projectId?: string
  knowledgeDir?: string
  [key: string]: unknown
}

/** 知识目录存在但非法/不可达（RPC typed 面——storage/scan 同名类的六码包装：
 *  storage 侧为 rebuild 域内部错误（无 code/data），服务边界统一转 code 承载，core 先例同形） */
export class InvalidKnowledgeDirError extends Error {
  readonly code = 'ERR_INVALID_KNOWLEDGE_DIR' as const
  readonly data: KnowledgeErrorData

  constructor(data: KnowledgeErrorData, cause?: unknown) {
    super(`知识目录不可达或非法：${String(data.knowledgeDir ?? '')}`, cause === undefined ? undefined : { cause })
    this.name = 'InvalidKnowledgeDirError'
    this.data = data
  }
}

/** entryId 未命中（索引重建后 ID 漂移；readAbstract 查无此行） */
export class EntryNotFoundError extends Error {
  readonly code = 'ERR_ENTRY_NOT_FOUND' as const
  readonly data: KnowledgeErrorData

  constructor(data: KnowledgeErrorData & { entryId?: number }, cause?: unknown) {
    super(`知识条目未命中：projectId=${String(data.projectId ?? '')} entryId=${String(data.entryId ?? '')}`, cause === undefined ? undefined : { cause })
    this.name = 'EntryNotFoundError'
    this.data = data
  }
}

/** 索引缺失/过期且静默重建未能恢复（检索中止——Error Handling 表 409 行） */
export class IndexStaleError extends Error {
  readonly code = 'ERR_INDEX_STALE' as const
  readonly data: KnowledgeErrorData

  constructor(data: KnowledgeErrorData, cause?: unknown) {
    super(`知识索引缺失或过期且重建未恢复：${String(data.reason ?? data.projectId ?? '')}`, cause === undefined ? undefined : { cause })
    this.name = 'IndexStaleError'
    this.data = data
  }
}
