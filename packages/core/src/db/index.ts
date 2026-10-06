// db/ barrel（定位：基础）——SQLite 句柄唯一落点、schema 迁移、事务助手，零域语义。
// 边界：禁 import ../forge/、../knowledge/（依赖铁律①，oxlint no-restricted-imports）。
export { MIGRATIONS, SCHEMA_VERSION, type Migration } from './schema.js'
export { UnsupportedSchemaVersionError, isUnsupportedSchemaVersionError } from './errors.js'
export { openDatabase, type OpenDatabaseOptions } from './open.js'
export { withTransaction } from './transaction.js'
