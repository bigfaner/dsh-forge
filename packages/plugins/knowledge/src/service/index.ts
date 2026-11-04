// service/ barrel（1.7 A2 服务切换）：Interface 2 七法 + browse 第八法（类型随迁
// contracts → 本包）+ 自持库供数实现 + typed errors——插件 provide 'knowledge' 服务面单入口。
export {
  createKnowledgeService,
  type KnowledgeServiceDeps,
} from './service.js'
export type {
  BrowseKnowledgeService,
  EntryAbstract,
  IndexReport,
  KnowledgeService,
  ReadAbstractQuery,
  SearchHit,
  SearchQuery,
} from './types.js'
export { EntryNotFoundError, IndexStaleError, InvalidKnowledgeDirError, type KnowledgeErrorData } from './errors.js'
export {
  aggregateDomainTree,
  groupRecallRows,
  rankEntries,
  type RecallRow,
} from './internal.js'
