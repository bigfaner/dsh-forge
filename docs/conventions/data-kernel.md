---
title: "数据内核工程约束(schema 演进 · 单写者)"
domains: [data-kernel, sqlite, schema, migration, workbench, kernel, snapshot]
---

# 数据内核工程约束(schema 演进 · 单写者)

## Data Kernel

### TECH-data-kernel-001: workbench.db schema 演进 = 版本化增量迁移,只增不删

**Requirement**: 数据内核 schema 变更一律以版本化增量迁移交付(v1→v2→…);每个版本**只增不删**——既有表与列全保留,新能力经 ALTER 增列/新表承载;迁移脚本 = feature 设计产物 `design/schema.sql`,由内核启动时按 `schema_version` 在单事务内顺序执行,失败即启动失败(显式错误路径,不降级静默);快照/索引类表(`task_snapshot`/`stage_asset`/`proposal_snapshot`)定位为派生可重建,不承载权威语义。
**Context**: M2 v1 → M3 v2 首次实践(2026-09-23);双载体下 SQLite 单写者 = Electron 主进程内核,schema 演进须与「零半迁移/可对拍」纪律同构。
**Scope**: [CROSS]
**Source**: features/dsh-forge-m3/design/schema.sql;features/dsh-forge-m3/design/er-diagram.md;features/dsh-forge-m2/design/tech-design.md §Data Models

- 读路由可按列开关(如 `projects.data_authority`)渐进切换权威通道;旧通道(文件)保留至终态淘汰,禁止一刀切。
- 归档类文件操作(如 `index.json` → `*.migrated-<ts>`)与库内状态变更同批失败时必须整体回滚(备份恢复),不留半迁移态。
- CHECK 约束表达静态词表(状态机/相位);动态键集(偏好键注册表)用应用层校验,不硬编码进 SQL。
