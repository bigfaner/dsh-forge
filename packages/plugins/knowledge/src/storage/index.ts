// 自持存储 barrel：库初始化/schema 版本线/路径解析/注册表/并发纪律/轻量种子迁移/
// 首用 rebuild/诊断发射面——单入口。
export {
  STORAGE_MIGRATIONS,
  STORAGE_SCHEMA_VERSION,
  downgradeKnowledgeSchema,
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
  globalKnowledgeDir,
  KNOWLEDGE_GLOBAL_DIR_SEGMENT,
  type GlobalRegisterOutcome,
  type KnowledgeRegistry,
  type RegistryRow,
} from './registry.js'
export {
  BUSY_TIMEOUT_MS,
  createSingleFlightMutex,
  withImmediateTransaction,
  type SingleFlightMutex,
} from './concurrency.js'
export { startSelfHostedStorage, type SelfHostedStorage, type StartSelfHostedStorageOptions } from './start.js'
export {
  runSeedMigration,
  type SeedMigrationOptions,
  type SeedMigrationResult,
  type SeedMigrationStatus,
} from './migrate.js'
export {
  rebuildKnowledgeIndex,
  deriveEffectiveRank,
  normalizeEntryStatus,
  normalizeTitleNorm,
  ENTRY_STATUS_VALUES,
  type EffectiveRank,
  type EntryStatus,
  type RebuildOptions,
  type RebuildReport,
} from './rebuild.js'
export {
  scanKnowledgeDir,
  isSafeRelPath,
  deriveDomainPath,
  InvalidKnowledgeDirError,
  type ScannedKnowledgeFile,
} from './scan.js'
export {
  parseKnowledgeFile,
  type KnowledgeEntryMetadata,
  type ParseOutcome,
  type ParsedEntry,
  type ParseKnowledgeFileInput,
  type ParseRejectReason,
} from './parser.js'
export {
  KNOWLEDGE_MIGRATE_EVENT,
  KNOWLEDGE_PURGE_EVENT,
  KNOWLEDGE_REBUILD_EVENT,
  KNOWLEDGE_REGISTER_EVENT,
  KNOWLEDGE_WRITE_EVENT,
  KNOWLEDGE_WRITE_REJECT_EVENT,
  KNOWLEDGE_CONFIRM_EVENT,
  KNOWLEDGE_BACKFLOW_EVENT,
  emitStorageDiag,
  storageDiag,
  type DiagEmitter,
} from './diag.js'
