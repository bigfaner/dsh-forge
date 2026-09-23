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

### TECH-data-kernel-002: node:sqlite 内核实现纪律(内建零重编译 · WAL · 启动探针)

**Requirement**: SQLite 经主进程内嵌 `node:sqlite`(Electron 44/Node ≥22.20 内建,零原生重编译;弃 better-sqlite3 等原生模块);每次 opening 应用 `PRAGMA journal_mode = WAL` + `foreign_keys = ON`;库文件落 `<userData>/workbench/` 独立目录,与 `$DSH_HOME`、host-profile 目录分立;启动探针(可用性检查 + 试开库)失败 = 显式启动错误路径,禁止静默降级为无库运行;库损坏 → 旧库(含 -wal/-shm 伴生文件)改名备份后重建空库并明确告知。
**Context**: 离线自足/三平台打包零额外成本与进程足迹纪律的共同约束;M2 D1 裁决(SQLite 全落)的实现基座。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-002(design/tech-design.md §Overview/§Dependencies/§Error Handling;apps/desktop/src/main/workbench/store/db.ts)

### TECH-data-kernel-003: taskKey 看板地址方言(`<featureSlug>/<localId>`)

**Requirement**: task_snapshot 主键采用看板地址形态 `<featureSlug>/<localId>`(非裸 forge ID);blockers 原样存上游本地 key(同 feature 命名空间);树视图按 feature_slug 分组展开传递链;后续消费面(watcher 感知、IPC、会话挂接、e2e)统一沿用该地址形态。
**Context**: M2 任务 2.5 方言适配裁决(forge task_key 存在 slug id 形态,裸 `N.N` 假设不成立);schema PK 与跨层字段图的一致性依赖。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-003(apps/desktop/src/main/workbench/indexer/scan.ts;records/2.5)
