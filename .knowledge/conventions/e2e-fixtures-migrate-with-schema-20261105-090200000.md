---
title: e2e 支撑夹具随 schema 迁移同批对齐
summary: DB schema 改名/退役时，e2e/support 夹具是高频漏改面——症状常以「不相关失败族」出现（no such table × 一族 + 空供数 × 一族），同根因双表现。
keywords: [e2e, 夹具, schema 迁移, 漏改]
type: conventions
status: unconfirmed
id: e2e-fixtures-migrate-with-schema
version_ts: 2026-11-05T09:02:00.000Z
来源容器: knowledge-stage2-write-gateway
来源任务: fix-1（66a9a2be）
bug id: 无
---

# e2e 支撑夹具随 schema 迁移同批对齐

stage② v4 将 `projects` 改名 `knowledge_registry` 后，e2e/support/knowledge-db.ts 夹具仍写旧表——7 例失败呈两族（SqliteError ×1 + listEntries 空供数 ×6），实为同根因（夹具落库失败 → 注册行未落）。

约定：**schema 迁移任务的 scope 必须包含 e2e/support 的夹具对齐**（grep 旧表名清单逐个核销）；e2e 收口遇「多失败族」时先查支撑夹具漂移再查实现装配。
