---
status: "completed"
started: "2026-10-08 18:40"
completed: "2026-10-08 19:01"
time_spent: "~21m"
---

# Task Record: T-specs-consolidate Consolidate Specs

## Summary
M3 规格收口（非交互 [auto-specs] 模式）：从 PRD/tech-design 提取 11 条业务规则 + 7 条技术约定入项目级知识库——新建 business-rules/mode-containers.md（BIZ-mode-001..006：容器双轨/成链分叉/mode 快照不回溯/绑定三律/L1 物理边界/提案五态谱系）与 conventions/{preset-assembly,event-logging}.md 两新文件；追加 task-pipeline（BIZ-task-012..015）/product-discipline（BIZ-product-010）/task-domain（TECH-task-005..007）/error-handling（TECH-error-004）/rpc-and-contracts（TECH-rpc-009）；同步修复 12 项 M3 引发的既有规格 drift（面分治枚举/通道八族/七服务/24 错误码/八工件/G1 池 17-22/数据追踪四类等——ID 全保留仅改描述）；全部条目先对当前代码核实（8 工件/24 码/worker-matrix 八实名/feature_records 八域表/pin-10..14 在场）；决策重叠五行 [skip] 保留双方、域重叠无 >50% 告警；词汇表全量再生；集成清单见 specs/.integrated

## Changes

### Files Created
- docs/features/dsh-forge-m3-bootstrap-presets/specs/biz-specs.md
- docs/features/dsh-forge-m3-bootstrap-presets/specs/tech-specs.md
- docs/features/dsh-forge-m3-bootstrap-presets/specs/review-choices.md
- docs/features/dsh-forge-m3-bootstrap-presets/specs/.integrated
- docs/business-rules/mode-containers.md
- docs/conventions/preset-assembly.md
- docs/conventions/event-logging.md

### Files Modified
- docs/business-rules/task-pipeline.md
- docs/business-rules/product-discipline.md
- docs/conventions/task-domain.md
- docs/conventions/error-handling.md
- docs/conventions/rpc-and-contracts.md
- docs/conventions/monorepo-structure.md
- docs/conventions/quality-gates.md
- docs/.vocabulary.md
- docs/features/dsh-forge-m3-bootstrap-presets/manifest.md

### Key Decisions
无

## Document Metrics
extracted: 18 (11 biz + 7 tech, 全 CROSS 自动集成); drift_fixed: 12 (ID 保留); new_files: 3; knowledge_totals: 10 decisions / 2 lessons / 36 conventions (10 files) / 40 business-rules (5 files); overlap_warnings: 0

## Referenced Documents
- docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-spec.md
- docs/features/dsh-forge-m3-bootstrap-presets/prd/prd-user-stories.md
- docs/features/dsh-forge-m3-bootstrap-presets/design/tech-design.md
- docs/features/dsh-forge-m3-bootstrap-presets/manifest.md
- packages/contracts/src/worker-matrix.ts
- packages/contracts/src/errors.ts
- packages/contracts/src/channels.ts
- packages/core/src/forge/workspace/migrations.ts
- packages/plugin-forge/src/tools/dispatch-task.ts
- packages/plugin-forge/src/tools/format.ts
- packages/core/src/forge/settings/service.ts
- apps/host/src/profile/presets/expedition.patch.yml

## Review Status
final

## Acceptance Criteria
- [x] Business rules extracted to docs/business-rules/ with correct domains frontmatter
- [x] Tech specs extracted to docs/conventions/ with correct domains frontmatter
- [x] All CROSS items auto-integrated and committed with [auto-specs] tag

## Notes
提交 cd56802（[auto-specs] 独立提交，与任务记录提交分离）；LOCAL 项（派发入口 v22 UI 语义/预填不自动发送/Forge设置表单/诊断 toast）按分类留在 feature 文档；tasks/index.json 的在制品状态翻转由本次 submit CLI 自身落账
