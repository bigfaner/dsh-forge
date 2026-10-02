// knowledge/ barrel（定位：业务）——frontmatter 契约解析、目录扫描、索引重建（3.1）；
// search/readAbstract、recall_logs、热度聚合（3.2）；浏览查询面 listEntries/getEntryDetail/
// sessionRecall + Interface 2 全七法收口（3.3）。
// 边界：禁 import ../forge/（依赖铁律③ 同级业务互禁，oxlint no-restricted-imports）。
export {
  EntryNotFoundError,
  IndexStaleError,
  InvalidKnowledgeDirError,
  type KnowledgeErrorData,
} from './errors.js'
export {
  defaultTitleFromRelPath,
  digestOf,
  parseKnowledgeFile,
  type ParseKnowledgeFileInput,
  type ParseOutcome,
  type ParseRejectReason,
  type ParsedEntry,
} from './parser.js'
export {
  deriveDomainPath,
  isSafeRelPath,
  scanKnowledgeDir,
  type ScannedKnowledgeFile,
} from './scan.js'
export { createKnowledgeIndexService, type KnowledgeIndexService, type KnowledgeIndexServiceDeps } from './index-service.js'
export {
  createKnowledgeRecallService,
  rankEntries,
  type KnowledgeRecallService,
  type KnowledgeRecallServiceDeps,
  type RankableEntry,
  type RankedEntry,
} from './recall-service.js'
export {
  aggregateDomainTree,
  createKnowledgeBrowseService,
  recallStats,
  type BrowseQuery,
  type KnowledgeBrowseFace,
  type KnowledgeBrowseService,
  type KnowledgeBrowseServiceDeps,
} from './browse-service.js'
export { createKnowledgeService, type KnowledgeServiceDeps } from './knowledge-service.js'
