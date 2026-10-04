// 知识域 typed errors（tech-design §Error Handling 表知识域行——code 字面量锚定 @dsh-forge/contracts
// ERROR_CODES，类名/name 手写字面量——contracts 不持运行期名映射，fix-34 后表 Name 列为文档性对照）。
// 3.1 落地 InvalidKnowledgeDirError；3.2 落地
// EntryNotFoundError / IndexStaleError（检索面消费）。RPC 边界序列化为
// RpcErrorPayload { code, message, data }，UI 按 code 映射状态。
/** 知识域错误附载（RpcErrorPayload.data 的形状：标识 + 失败原因） */
export interface KnowledgeErrorData {
  projectId?: string
  knowledgeDir?: string
  [key: string]: unknown
}

/** 知识目录不可达/非法（rebuildIndex 扫描前置门——目录缺失或非目录） */
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
