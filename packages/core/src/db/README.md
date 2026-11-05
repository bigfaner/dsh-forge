# db/

定位：**基础** —— SQLite 句柄唯一落点、schema 迁移、事务助手——无域语义。填充：2.1。
边界：禁 import `../forge/`（依赖铁律① 基础↛业务，oxlint no-restricted-imports 机械执行；knowledge 域已随 knowledge-stage1-foundation 1.8 退役移除）。

## API（index.ts barrel）

- `openDatabase(file)` — 唯一句柄创建口：建目录 → better-sqlite3 打开 → WAL + foreign_keys → 版本门（超上限抛 `UnsupportedSchemaVersionError` 并关句柄）→ 补齐待应用迁移（前向单向）→ 返回句柄。一切 SQL 走 prepared statements。
- `withTransaction(db, fn)` — 事务助手：成功整体提交 / 抛错整体回滚。
- `SCHEMA_VERSION` / `MIGRATIONS` — 迁移注册表（v1 = 五表 + 七索引蓝本 `design/schema.sql` 逐条 pin；v4 = 知识域两表结构退役——存量已由 knowledge 插件种子迁移消费；v5 = projects.knowledge_dir 列退役——注册链全线退役，目录真值归 knowledge 插件自持注册表）。
- `UnsupportedSchemaVersionError` / `isUnsupportedSchemaVersionError` — 版本门 typed error（机制错误，非业务错误码——业务错误面归 contracts）。

域表消费方（forge 子模块）不在本模块：db/ 只提供句柄与迁移，不含任何表的读写逻辑。
