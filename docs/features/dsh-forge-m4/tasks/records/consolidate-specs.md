---
status: "completed"
started: "2026-10-01 02:01"
completed: "2026-10-01 02:19"
time_spent: "~18m"
---

# Task Record: T-specs-consolidate Consolidate Specs

## Summary
Consolidated dsh-forge-m4 specs (non-interactive auto-integrate, [auto-specs] commit ba8c775). Extracted from prd/prd-spec + proposal + tech-design + records 1-4.summary + fix-1..4 + run-test: biz 10 CROSS + 3 LOCAL, tech 11 CROSS + 2 LOCAL. Integrated 7 new project-global entries (BIZ-workbench-013 布局记忆项目域/014 拆出窗口语义; TECH-ui-reuse-004 上游 UI 槽位消费纪律/005 双宿主组件纪律, TECH-host-007 读写双缝 + relay 重试单源, TECH-data-kernel-007 项目域 UI 状态 blob 纪律, TECH-window-001 壳层多窗口工程 in new file docs/conventions/shell-windows.md). Repaired M4 planning-period ID collision: workbench.md 规划期 006/007/008(投影/subagent 归拢/执行中)renumbered to 010/011/012 (violated file-internal max+1 sequence rule against M3 Stage Gating/偏好 entries; M3 IDs unchanged; historical docs/source comments not rewritten — mapping note at workbench.md header). 15 M4 revision/amendment blocks with IDs preserved: BIZ-workbench-001 (docsPlacement 证据三档 + custom 收窄)/002 (D11 三层身份归一化 + code_root_key 折叠 UNIQUE + boot 恢复/原位换台)/003 (硬校验收窄, forge 检出门禁与 ERR_FORGE_NOT_DETECTED 废止为信息态, v1 冻结面例外 — verified against registry/validate.ts)/004 (追加行两行化)/005 (工作台首屏/投影四操作 ≤2s + SC6 实测基线)/010 (偏差物化零落表/归档不对账/收敛单源/复连语义)/011 (降级双因同型/ended 快照不可用座位/徽标覆盖判定), BIZ-resilience-001 (可操作降级呈现族), TECH-host-006 (追加行两行化 + oracle 两行前缀对拍 appendix-not-two-lines)/TECH-electron-ipc-002 (51→62 通道 + dsh-forge:window-* 壳层动词组, verified vs channel-allowlist.ts + windows/channels.ts)/TECH-ui-reuse-002 (视图键族收缩 + panellist null 寻址)/TECH-data-kernel-001 (v3 实践 + MigrationContext)/006 (三新域沿用确认)/TECH-testing-001 (M4 扩面: 实况 durable 断言/故障注入 env+控制文件缝/REAL persistence 种盘/多窗口 helper/构建新鲜度/fixme 台账/flake 双证)/TECH-product-arch-004 (CLI/CC 插件收口顺延 M6). Orphaned = 0. Overlaps with decisions(project-storage-and-knowledge §5 v2, architecture T1/T3, data-model) kept [skip] both; lessons 无域重叠. Domains re-derived on 6 changed files, all same-dir overlaps <50%. Vocabulary fully regenerated (decision 31/lesson 1/convention 33/business-rule 23, 101 domain keywords).

## Changes

### Files Created
- docs/features/dsh-forge-m4/specs/biz-specs.md
- docs/features/dsh-forge-m4/specs/tech-specs.md
- docs/features/dsh-forge-m4/specs/review-choices.md
- docs/features/dsh-forge-m4/specs/.integrated
- docs/conventions/shell-windows.md

### Files Modified
- docs/business-rules/workbench.md
- docs/business-rules/resilience.md
- docs/conventions/data-kernel.md
- docs/conventions/electron-ipc-security.md
- docs/conventions/host-integration.md
- docs/conventions/product-architecture.md
- docs/conventions/testing.md
- docs/conventions/ui-reuse.md
- docs/features/dsh-forge-m4/manifest.md
- docs/.vocabulary.md

### Key Decisions
无

## Document Metrics
extracted 23 CROSS + 5 LOCAL items; integrated 7 new project-global entries (2 BIZ + 5 TECH, incl. 1 new file); id-repair 3 (006/007/008 → 010/011/012, M3 IDs kept); revisions 15 (0 orphaned); domains re-derived 6 files; vocabulary 101 domain keywords

## Referenced Documents
- docs/features/dsh-forge-m4/prd/prd-spec.md
- docs/features/dsh-forge-m4/design/tech-design.md
- docs/features/dsh-forge-m4/regression-inventory.md
- docs/features/dsh-forge-m4/manifest.md
- docs/proposals/dsh-forge-m4/proposal.md
- docs/features/dsh-forge-m4/tasks/records/1.summary.md
- docs/features/dsh-forge-m4/tasks/records/2.summary.md
- docs/features/dsh-forge-m4/tasks/records/3.summary.md
- docs/features/dsh-forge-m4/tasks/records/4.summary.md
- docs/features/dsh-forge-m4/tasks/records/fix-1.md
- docs/features/dsh-forge-m4/tasks/records/fix-2.md
- docs/features/dsh-forge-m4/tasks/records/fix-3.md
- docs/features/dsh-forge-m4/tasks/records/fix-4.md
- docs/features/dsh-forge-m4/tasks/records/run-test.md
- docs/features/dsh-forge-m3/tasks/records/consolidate-specs.md
- docs/decisions/project-storage-and-knowledge.md

## Review Status
final

## Acceptance Criteria
- [x] Business rules extracted to docs/business-rules/ with correct domains frontmatter
- [x] Tech specs extracted to docs/conventions/ with correct domains frontmatter
- [x] All CROSS items auto-integrated and committed with [auto-specs] tag

## Notes
Non-interactive mode per task file instruction (auto-integrate all CROSS items). Dispatcher directive honored: only high-confidence non-overlapping increments integrated as new entries; M4 planning-period trio treated as already-integrated (renumber + execution-period amendment blocks, never deleted/rewritten). 撞号修复 blast radius: live source comments (tests/e2e/specs/m4/*, packages/plugins/forge-workbench/src/client/*) and M4 feature docs citing BIZ-workbench-006/007/008 for the M4 trio intentionally NOT rewritten (historical records verbatim; scope discipline: [auto-specs] commit is docs-only); disambiguation mapping recorded at workbench.md header + specs/review-choices.md. ERR_FORGE_NOT_DETECTED verified still present in code (registry/validate.ts) but scoped to the frozen v1 register face only — revision note states this precisely rather than claiming code removal. New knowledge file created per 不建空文档 policy (shell-windows.md has 1 real entry). Preview files retained under specs/ for traceability; .integrated marker written for idempotency.
