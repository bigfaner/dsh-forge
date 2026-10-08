---
feature: "dsh-forge-m3-bootstrap-presets"
reviewed: "2026-10-08"
---

# Review Choices

> 非交互模式（/run-tasks 派发）：全部 [CROSS] 项自动批准集成；重叠项默认 [skip]（保留双方）。

## Approved for Integration

- BIZ-001 -> docs/business-rules/mode-containers.md (BIZ-mode-001)
- BIZ-002 -> docs/business-rules/mode-containers.md (BIZ-mode-002)
- BIZ-003 -> docs/business-rules/mode-containers.md (BIZ-mode-003)
- BIZ-004 -> docs/business-rules/mode-containers.md (BIZ-mode-004)
- BIZ-005 -> docs/business-rules/mode-containers.md (BIZ-mode-005)
- BIZ-006 -> docs/business-rules/mode-containers.md (BIZ-mode-006)
- BIZ-007 -> docs/business-rules/task-pipeline.md (BIZ-task-012)
- BIZ-008 -> docs/business-rules/task-pipeline.md (BIZ-task-013)
- BIZ-009 -> docs/business-rules/task-pipeline.md (BIZ-task-014)
- BIZ-010 -> docs/business-rules/task-pipeline.md (BIZ-task-015)
- BIZ-011 -> docs/business-rules/product-discipline.md (BIZ-product-010)
- TECH-001 -> docs/conventions/task-domain.md (TECH-task-005)
- TECH-002 -> docs/conventions/task-domain.md (TECH-task-006)
- TECH-003 -> docs/conventions/task-domain.md (TECH-task-007)
- TECH-004 -> docs/conventions/preset-assembly.md (TECH-preset-001，新文件)
- TECH-005 -> docs/conventions/event-logging.md (TECH-event-001，新文件)
- TECH-006 -> docs/conventions/error-handling.md (TECH-error-004)
- TECH-007 -> docs/conventions/rpc-and-contracts.md (TECH-rpc-009)
- TECH-008 -> docs/conventions/monorepo-structure.md（drift 修订承载：TECH-monorepo-001/003/004 更新，不新增条目）

## Skipped

- （无——全部 CROSS 项批准；LOCAL 项见 biz-specs/tech-specs 尾节，留在 feature 内）

## Related Existing Entries

- decisions/interface.md row "dispatchTask 复合派发动词（claimTask+spawnWorker 合并…）" 与 TECH-001 重叠 -> [skip] 保留双方（决策行留档，约定条目承载可执行规格）
- decisions/interface.md row "tool 返回面 = formatOk/formatErr 双友好格式化文本" 与 TECH-006 重叠 -> [skip] 保留双方
- decisions/architecture.md row "tasks 源头双列 source_kind+source_id + main_session 砍除 + schema v1 直改" 与 TECH-003/BIZ-001 重叠 -> [skip] 保留双方
- decisions/architecture.md row "远征成链 = transitionProposal 服务内聚 + features 恒远征无 mode 列" 与 BIZ-002/BIZ-003 重叠 -> [skip] 保留双方
- decisions/architecture.md row "业务日志 = 事件驱动容器维度 logs/{slug}.jsonl（自建总线）" 与 TECH-005 重叠 -> [skip] 保留双方

## Domain Overlap Warnings

- （无 >50% 告警：新文件 mode-containers/preset-assembly/event-logging 与既有文件 domains 交集最大 = {event}（vs rpc-and-contracts，1/6 ≈ 17%），均低于阈值）
