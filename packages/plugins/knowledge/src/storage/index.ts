// 自持存储 barrel（A2 前两弹）：库初始化/schema 版本线/路径解析/注册表/并发纪律单入口。
export {
  STORAGE_MIGRATIONS,
  STORAGE_SCHEMA_VERSION,
  type StorageMigration,
} from './schema.js'
export {
  autoStartDbFile,
  KNOWLEDGE_DATA_DIR_SEGMENT,
  KNOWLEDGE_DB_FILE_NAME,
  resolveKnowledgeDataRoot,
  resolveKnowledgeDbFile,
  type KnowledgeStorageConfig,
  type KnowledgeStorageEnv,
} from './paths.js'
export { ensureKnowledgeDbDir, KNOWLEDGE_DB_DIR_MODE, openKnowledgeDatabase } from './open.js'
export {
  canonicalWsPath,
  createKnowledgeRegistry,
  type KnowledgeRegistry,
  type RegistryRow,
} from './registry.js'
export {
  BUSY_TIMEOUT_MS,
  createSingleFlightMutex,
  withImmediateTransaction,
  type SingleFlightMutex,
} from './concurrency.js'
export { startSelfHostedStorage, type SelfHostedStorage } from './start.js'
