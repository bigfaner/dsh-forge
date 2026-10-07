---
feature: "dsh-forge-m2-pipeline"
reviewed: "2026-10-07"
---

# Review Choices

> Non-interactive mode（run-tasks 派发，无用户在场）：全部 [CROSS] 项自动批准集成；重叠默认 [skip] 保留双方。

## Approved for Integration

### Business Rules → docs/business-rules/

- BIZ-001 -> docs/business-rules/task-pipeline.md（新文件）
- BIZ-002 -> docs/business-rules/task-pipeline.md
- BIZ-003 -> docs/business-rules/task-pipeline.md
- BIZ-004 -> docs/business-rules/task-pipeline.md
- BIZ-005 -> docs/business-rules/task-pipeline.md
- BIZ-007 -> docs/business-rules/task-pipeline.md
- BIZ-008 -> docs/business-rules/task-pipeline.md
- BIZ-009 -> docs/business-rules/task-pipeline.md
- BIZ-010 -> docs/business-rules/task-pipeline.md
- BIZ-011 -> docs/business-rules/task-pipeline.md
- BIZ-012 -> docs/business-rules/task-pipeline.md
- BIZ-013 -> docs/business-rules/workspace-consistency.md
- BIZ-014 -> docs/business-rules/product-discipline.md
- BIZ-015 -> docs/business-rules/product-discipline.md
- BIZ-006 -> docs/business-rules/product-discipline.md

### Technical Specs → docs/conventions/

- TECH-001 -> docs/conventions/rpc-and-contracts.md
- TECH-002 -> docs/conventions/rpc-and-contracts.md
- TECH-003 -> docs/conventions/rpc-and-contracts.md
- TECH-004 -> docs/conventions/rpc-and-contracts.md
- TECH-005 -> docs/conventions/task-domain.md（新文件）
- TECH-006 -> docs/conventions/task-domain.md
- TECH-007 -> docs/conventions/task-domain.md
- TECH-008 -> docs/conventions/task-domain.md
- TECH-009 -> docs/conventions/error-handling.md
- TECH-010 -> docs/conventions/doc-surface.md（新文件）
- TECH-011 -> docs/conventions/doc-surface.md
- TECH-012 -> docs/conventions/quality-gates.md

## Skipped

- TECH-013（录制-回放主径）——重叠 [skip]：已由 docs/conventions/quality-gates.md TECH-quality-004 承载（保留双方，不重复入池）
- BIZ-016 / BIZ-017 / BIZ-018（三视图 UI 形态 / 抽屉分区 / SC-M2 门细则）——[LOCAL] 留 feature
- TECH-014 / TECH-015（G1 pin 枚举 9-16 / Integration Specs 五处）——[LOCAL] 留 feature

## Related Existing Entries

- decisions/architecture.md row「每工作区 forge.db 惰性首开 + 失败隔离 … 视图刷新 = 写推送事件」——与 TECH-002/TECH-003 主题重叠，[skip] 保留双方（决策表记裁决，规格文件记可执行纪律）
- decisions/architecture.md row「validateFeatureTasks 一次只校验一个 feature 的任务子图 …」——与 BIZ-008 重叠，[skip] 保留双方
- decisions/interface.md row「任务域服务面按领域划分（四服务）；废除视图聚合服务」——与 TECH-001 重叠，[skip] 保留双方

## Domain Overlap Warnings

- 无（business-rules 三文件与新增 task-pipeline.md、conventions 五文件与新增 task-domain.md / doc-surface.md 的 domains 交集均远低于 50% 阈值）
