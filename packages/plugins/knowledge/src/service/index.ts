// service/ barrel（1.7 A2 服务切换）：Interface 2 七法 + browse 第八法 + stage② 写门
// 三法（write/read/confirm）+ 自持库供数实现 + typed errors——插件 provide 'knowledge'
// 服务面单入口。
export {
  createKnowledgeService,
  type KnowledgeServiceDeps,
} from './service.js'
export type {
  BackflowConfig,
  BrowseKnowledgeService,
  EntryAbstract,
  IndexReport,
  KnowledgeConfirmOutcome,
  KnowledgeConfirmQuery,
  KnowledgeReadOutcome,
  KnowledgeReadQuery,
  KnowledgeRegistryWriter,
  KnowledgeService,
  KnowledgeType,
  KnowledgeWriteOutcome,
  KnowledgeWriteQuery,
  MergeSuggestion,
  NecessityAnswers,
  ReadAbstractQuery,
  RegisterProjectWrite,
  SearchHit,
  SearchQuery,
} from './types.js'
export { KNOWLEDGE_TYPES } from './types.js'
export { EntryNotFoundError, IndexStaleError, InvalidKnowledgeDirError, type KnowledgeErrorData } from './errors.js'
export {
  aggregateDomainTree,
  groupRecallRows,
  rankEntries,
  type RecallRow,
} from './internal.js'
export {
  findMergeSuggestions,
  ftsRankOf,
  generateSlugBase,
  isValidSlugId,
  jaccardOf,
  predictType,
  slugify,
} from './write.js'
