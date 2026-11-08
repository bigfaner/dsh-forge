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
  DomainBrowseRow,
  EntryAbstract,
  IndexReport,
  KnowledgeConfirmBatchQuery,
  KnowledgeConfirmOutcome,
  KnowledgeConfirmQuery,
  KnowledgeCreateDomainOutcome,
  KnowledgeCreateDomainQuery,
  KnowledgeMergeOutcome,
  KnowledgeMergeQuery,
  KnowledgeMoveEntryQuery,
  KnowledgeReadOutcome,
  KnowledgeReadQuery,
  KnowledgeRejectBatchQuery,
  KnowledgeRegistryWriter,
  KnowledgeRevertOutcome,
  KnowledgeRevertQuery,
  KnowledgeService,
  KnowledgeType,
  KnowledgeUpdateEntryQuery,
  KnowledgeWriteOutcome,
  KnowledgeWriteQuery,
  MergeSuggestion,
  NecessityAnswers,
  ReadAbstractQuery,
  RecallFeedbackFailureCode,
  RecallFeedbackOutcome,
  RecallFeedbackRequest,
  RecallFeedbackResult,
  RegisterProjectWrite,
  SearchHit,
  SearchQuery,
  SetDomainDescriptionQuery,
} from './types.js'
export { createRecallFeedbackGateway, type RecallFeedbackDeps } from './feedback.js'
export { KNOWLEDGE_TYPES } from './types.js'
export { EntryNotFoundError, IndexStaleError, InvalidKnowledgeDirError, type KnowledgeErrorData } from './errors.js'
export {
  aggregateDomainTree,
  applyStatusFilter,
  bm25Norm,
  buildSearchFtsMatch,
  composeSearchScore,
  groupRecallRows,
  heatBonusOf,
  rankEntries,
  rankFactorOf,
  textSubstringHit,
  unionEntryIds,
  domainTreeIndexOf,
  validateDomainPath,
  type DomainIndexRow,
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
