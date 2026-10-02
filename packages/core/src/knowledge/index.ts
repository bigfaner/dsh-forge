// knowledge/ barrel（定位：业务）——frontmatter 契约解析、目录扫描、索引重建（3.1）；
// search/readAbstract、recall_logs、热度聚合归 3.2，浏览查询面归 3.3。
// 边界：禁 import ../forge/（依赖铁律③ 同级业务互禁，oxlint no-restricted-imports）。
export { InvalidKnowledgeDirError, type KnowledgeErrorData } from './errors.js'
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
