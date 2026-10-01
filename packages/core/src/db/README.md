# db/

定位：**基础** —— SQLite 句柄唯一落点、schema 迁移、事务助手——无域语义。填充：2.1。
边界：禁 import `../forge/`、`../knowledge/`（依赖铁律① 基础↛业务，oxlint no-restricted-imports 机械执行）。

## API（index.ts barrel）

- `openDatabase(file)` — 唯一句柄创建口：建目录 → better-sqlite3 打开 → WAL + foreign_keys → 版本门（超上限抛 `UnsupportedSchemaVersionError` 并关句柄）→ 补齐待应用迁移（前向单向，全 CREATE 无 ALTER）→ 返回句柄。一切 SQL 走 prepared statements。
- `withTransaction(db, fn)` — 事务助手：成功整体提交 / 抛错整体回滚。
- `SCHEMA_VERSION` / `MIGRATIONS` — 迁移注册表（v1 = 五表 + 七索引，蓝本 `design/schema.sql`，schema.test.ts pin 逐条对齐防漂移）。
- `UnsupportedSchemaVersionError` / `isUnsupportedSchemaVersionError` — 版本门 typed error（机制错误，非业务错误码——业务错误面归 contracts）。

域表消费方（forge/knowledge 子模块）不在本模块：db/ 只提供句柄与迁移，不含任何表的读写逻辑。
