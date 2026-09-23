---
feature: "dsh-forge-m2"
reviewed: "2026-09-23"
---

# Review Choices

> Non-interactive mode (run-tasks pipeline): all [CROSS] items auto-approved; overlaps default [skip] (keep both).

## Approved for Integration

- BIZ-001 -> docs/business-rules/workbench.md (BIZ-workbench-001)
- BIZ-002 -> docs/business-rules/workbench.md (BIZ-workbench-002)
- BIZ-003 -> docs/business-rules/workbench.md (BIZ-workbench-003)
- BIZ-004 -> docs/business-rules/workbench.md (BIZ-workbench-004)
- BIZ-005 -> docs/business-rules/workbench.md (BIZ-workbench-005)
- BIZ-006 -> docs/business-rules/coexistence.md (BIZ-coexistence-002, appended)
- BIZ-008 -> docs/business-rules/task-operations.md (BIZ-task-ops-002, appended)
- TECH-001 -> docs/conventions/electron-ipc-security.md (TECH-electron-ipc-002, appended)
- TECH-002 -> docs/conventions/data-kernel.md (TECH-data-kernel-002, appended)
- TECH-003 -> docs/conventions/data-kernel.md (TECH-data-kernel-003, appended)
- TECH-004 -> docs/conventions/host-integration.md (TECH-host-001, new file)
- TECH-005 -> docs/conventions/host-integration.md (TECH-host-002, new file)
- TECH-006 -> docs/conventions/ui-reuse.md (TECH-ui-reuse-002, appended)
- TECH-007 -> docs/conventions/markdown-rendering.md (TECH-markdown-001, new file)
- TECH-008 -> docs/conventions/product-architecture.md (TECH-product-arch-006, appended)
- TECH-009 -> docs/conventions/product-architecture.md (TECH-product-arch-007, appended)

## Skipped

- BIZ-007 (操作主体模型): already covered by docs/business-rules/task-operations.md BIZ-task-ops-001 (its Source already cites this feature's PRD §操作主体模型) — keep both, no duplicate entry.
- BIZ-009 (两级插件启停语义): already covered by docs/conventions/product-architecture.md TECH-product-arch-001 (incl. SC6 acceptance bullet) — keep both, no duplicate entry.
- BIZ-010 (中英双语): already covered by docs/conventions/ui-reuse.md TECH-ui-reuse-001 bullet — keep both, no duplicate entry.
- TECH-010 (watcher 感知降级链): [LOCAL] — implementation detail stays in feature docs.

## Related Existing Entries

- None matched for replacement: decisions/architecture.md 2026-09-22 rows (双层防护 / 数据面分工 / DF003 感知) document the same adjudications this consolidation promotes to specs — kept as decision log rows (complementary provenance, not replaced; spec entries carry the durable rule text with source traceability).
- No docs/lessons/ directory exists — lessons overlap check skipped.

## Domain Overlap Warnings

- None >50%: new files workbench.md / host-integration.md / markdown-rendering.md share no domain keywords with existing files at >50% ratio (max shared = 0 keywords per pair).
