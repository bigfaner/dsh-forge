---
feature: "dsh-forge-m1"
reviewed: "2026-09-20"
---

# Review Choices

> Non-interactive mode (task T-specs-consolidate): all [CROSS] items auto-approved; overlaps default [skip] (keep both).

## Approved for Integration

- BIZ-001 -> docs/business-rules/coexistence.md (BIZ-coexistence-001)
- BIZ-002 -> docs/business-rules/resilience.md (BIZ-resilience-001)
- TECH-001 -> docs/conventions/upstream-vendor.md (TECH-upstream-vendor-001)
- TECH-002 -> docs/conventions/electron-ipc-security.md (TECH-electron-ipc-001)

## Skipped

- BIZ-003 (SC3 进程足迹,LOCAL)
- BIZ-004 (通知触发口径,LOCAL)
- TECH-003 (崩溃恢复状态机细节,LOCAL)
- TECH-004 (通知去重/LRU,LOCAL)

## Related Existing Entries

- docs/decisions/dependencies.md row "desktop-host 以 vendor 源码投影获取,按上游 commit SHA 精确锁定" -> [skip] keep both (decision records rationale; TECH-upstream-vendor-001 records the convention)
- docs/decisions/dependencies.md row "vendor 闭包获取定稿:源码投影+闭包解析,弃整树产物拷贝" -> [skip] keep both

## Domain Overlap Warnings

- None(新文件 domains 与既有 privacy.md / ui-reuse.md 无 >50% 重叠)
