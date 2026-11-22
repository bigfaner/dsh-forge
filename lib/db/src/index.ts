// db/ barrel（定位：基础）——SQLite 句柄唯一落点、schema 迁移、事务助手，零域语义。
// 归并锚（plugin-project 1.7）：整套装件自 packages/core/src/db git mv 迁入（零语义改动），
// core 旧位留 re-export 兼容面（退役收口另有任务）。
// 边界：禁 import 业务域（依赖铁律①；迁移纪律正本 docs/conventions/db-migrations.md）。
export { MIGRATIONS, SCHEMA_VERSION, type Migration } from './schema.js'
export {
  ForeignKeysUnavailableError,
  UnsupportedSchemaVersionError,
  isForeignKeysUnavailableError,
  isUnsupportedSchemaVersionError,
} from './errors.js'
export { BUSY_TIMEOUT_MS, openDatabase, openReadonlyDatabase, type OpenDatabaseOptions } from './open.js'
export { withTransaction } from './transaction.js'
export { Database, default, type RunResult, type Statement } from './sqlite.js'
