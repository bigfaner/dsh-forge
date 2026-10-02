// 知识域 typed errors（tech-design §Error Handling 表知识域行——code 归 @dsh-forge/contracts
// ERROR_CODES，类名 = ERROR_NAMES 映射）。3.1 落地 InvalidKnowledgeDirError（rebuildIndex
// 消费：知识目录不可达/非法）；ERR_INDEX_STALE / ERR_ENTRY_NOT_FOUND 随 3.2 检索面定义。
// RPC 边界序列化为 RpcErrorPayload { code, message, data }，UI 按 code 映射状态。
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
