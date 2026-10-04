---
status: "completed"
started: "2026-10-04 19:54"
completed: "2026-10-04 20:04"
time_spent: "~10m"
---

# Task Record: fix-31 Fix(P1): 知识「索引缺失」误判——域过滤零行即触发整库重建（entryId 全换 + recall 热度链清空 + 日志刷屏）：改项目级存在性判定

## Summary
知识「索引缺失」误判修复：search（recall-service.ts）与 listEntries（browse-service.ts）的索引存在性判定从「域过滤查询零行」改为「项目级无过滤 COUNT(*) === 0」——域前缀零命中（agent 探索常态）不再触发 rebuildIndex 整库重建（entryId 全换 / clearRecallEntryRefs 清热度链 / app_key_logs 刷屏），域零行 = 合法空结果直接返回；真缺失径（项目级零行→静默重建）零变化。新增 5 条定向测试（空域零重建 / 首建后二次调用零重建 / search→read_abstract 链与热度链稳定，两服务面各覆盖）。

## Changes

### Files Created
无

### Files Modified
- packages/core/src/knowledge/recall-service.ts
- packages/core/src/knowledge/browse-service.ts
- packages/core/src/knowledge/recall-service.test.ts
- packages/core/src/knowledge/browse-service.test.ts

### Key Decisions
- 执行裁决取 COUNT 口径（任务倾向「COUNT 最简」）：bullet 3 要求「库清空」仍触发重建——durable indexed_at 标记会抑制该触发（行被清而标记在 → 永不重建）；且 schema.ts 迁移纪律明文「全 CREATE 无 ALTER」+ 蓝本 pin，加列不成比例
- COUNT prepared 语句落各服务本地（沿用两服务已并置的 selectProject/escapeLike 重复模式），不放宽 indexService Pick<'rebuildIndex'> 注入缝——既有测试替身零破坏
- 「空目录二次调用零重建」按「首建后（COUNT>0）二次空域查询零重建」口径落地（任务括注「COUNT>0 即短路」即 COUNT 语义）；真知识空目录的重复重建为 COUNT 口径结构性残留（扫描零文件 + 三语句事务，无害），换取库清空可恢复性

## Test Results
- **Tests Executed**: Yes
- **Passed**: 114
- **Failed**: 0
- **Coverage**: 95.0%

## Acceptance Criteria
- [x] 对已有索引项目搜不存在的域 → 空结果，无 warn 日志、无 entryId 变动
- [x] search → read_abstract(entryId) 链不再被无关域查询打断
- [x] recall 热度链（entry_id 引用）稳定
- [x] 现有 knowledge 测试池全绿

## Notes
验证：tsc -b 零错；pnpm lint（ox/imports/tokens/selftest/types）全绿；知识池 6 文件 93 用例 + 外部知识面（channels 契约 / knowledge-rpc / 插件 integration-core）3 文件 21 用例全过；知识模块 coverage v8 实测 95.02% stmts。fmt 无对应工具（仓库无 prettier/biome，风格走 oxlint）。未改 rebuildIndex 本体语义、未触 schema/迁移。e2e 未跑（fix 任务纪律不启 dev server）。
