---
id: "fix-31"
title: "Fix(P1): 知识「索引缺失」误判——域过滤零行即触发整库重建（entryId 全换 + recall 热度链清空 + 日志刷屏）：改项目级存在性判定"
priority: "P1"
estimated_time: "2h"
complexity: "low"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P1): 索引缺失误判（评审 fix 来源）

> 来源：四路 subagent 架构评审之 core/knowledge 路（2026-10-04）P1 发现。

## 根因（评审实证）

[recall-service.ts:268-272](../../../packages/core/src/knowledge/recall-service.ts) 与 [browse-service.ts:254-258](../../../packages/core/src/knowledge/browse-service.ts) 的「索引缺失」判定用 `selectRows`——**域过滤查询**。搜索/列出一个零条目的域前缀（agent 探索常态）即触发 `rebuildIndex` 整库重建：

- 全量扫描 + 重解析 + 事务删旧插新（AUTOINCREMENT **全换 entryId**）；
- `clearRecallEntryRefs` 把 recall_logs.entry_id 全置 NULL——**上一次 search 返回的 entryId 立即作废**（后续 read_abstract 报 ERR_ENTRY_NOT_FOUND）、热度链退化为 frontmatter_id 兜底；
- 每次调用刷一条 app_key_logs warn；热路径无谓全量 IO；
- 合法空知识目录同样每次 search/listEntries 重建+记账（无「索引已存在」标记）。

## Description

1. **存在性判定改口径**：索引缺失 = 项目级**无过滤** `COUNT(*) === 0`（或 projects 表加 indexed_at 标记——执行裁决，倾向 COUNT 最简）；域零行 = 合法空结果，直接返回空列表，不触发重建；
2. 空目录首建后不再重复重建（COUNT>0 即短路）；
3. 重建仅剩真缺失触发（换目录/库清空/显式 rebuildIndex 通道）；
4. 测试：空域前缀 search/listEntries → 空结果零重建（rebuild 计数器/mtime 断言）；空目录二次调用零重建；真缺失径保持。

## 验收

1. 对已有索引项目搜不存在的域 → 空结果，无 warn 日志、无 entryId 变动；
2. search → read_abstract(entryId) 链不再被无关域查询打断；
3. recall 热度链（entry_id 引用）稳定；现有 knowledge 测试池全绿。

## Reference Files

- packages/core/src/knowledge/recall-service.ts:268-272、browse-service.ts:254-258（判定点）、index-service（rebuildIndex 面）、clearRecallEntryRefs（副作用面）；评审记录：本会话 2026-10-04 四路评审 core 路报告

## 边界与不做

- 不改 rebuildIndex 本体语义（真缺失径零变化）；
- indexed_at 标记若选做，迁移单事务（open.ts 纪律）。
