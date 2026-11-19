// core db/ 兼容面（plugin-project 1.7 归并锚）：整套装件（openDatabase/transaction/db errors/
// schema 迁移）git mv 迁入 @dsh-forge/lib-db，本体在新包 src/ 维护。
// 本文件为 re-export 兼容面——core 既有 './db/index.js' 内部 import 面零改动；
// 导出面 = 原六符号全集（零域语义 pin 不变），退役收口另有任务。
export {
  MIGRATIONS,
  SCHEMA_VERSION,
  UnsupportedSchemaVersionError,
  isUnsupportedSchemaVersionError,
  openDatabase,
  type OpenDatabaseOptions,
  withTransaction,
  type Migration,
} from '@dsh-forge/lib-db'
