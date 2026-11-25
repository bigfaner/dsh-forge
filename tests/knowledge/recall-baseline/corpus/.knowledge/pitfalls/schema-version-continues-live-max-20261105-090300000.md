---
title: DB 版本号接续现网最高位
summary: 新迁移线版本号必须接续现网 schema 已占用的最高位（照文档序号写会被版本门拒开）——动工前先读 schema.ts 现值而非提案草稿序号。
keywords: [schema, 版本号, 迁移]
type: pitfalls
status: unconfirmed
id: schema-version-continues-live-max
version_ts: 2026-11-05T09:03:00.000Z
来源容器: knowledge-stage2-write-gateway
来源任务: 1.3
bug id: 无
---

# DB 版本号接续现网最高位

提案草稿写「DDL v3」时现网已被 fix-2 的 project_id 列占掉 v3——照抄即冲突。design-reviewer 评审抓出后改 v4 落地。

坑：**提案文档的版本号是写作时快照，实现时点现网可能已前进**。动工前读 schema.ts 的 SCHEMA_VERSION 现值，新迁移线 = 现值 + 1；同理 review 时核对「提案序号 vs 现网实值」。
