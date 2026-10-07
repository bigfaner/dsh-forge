---
status: "completed"
started: "2026-10-07 08:02"
completed: "2026-10-07 08:12"
time_spent: "~10m"
---

# Task Record: T-specs-consolidate Consolidate Specs

## Summary
Non-interactive specs consolidation for dsh-forge-m2-pipeline: extracted 15 CROSS business rules + 12 CROSS tech specs from PRD/tech-design into preview files (specs/biz-specs.md, specs/tech-specs.md), auto-integrated all CROSS items to project-level dirs with [auto-specs] commit (7505a76) — new files docs/business-rules/task-pipeline.md (BIZ-task-001..011), docs/conventions/task-domain.md (TECH-task-001..004), docs/conventions/doc-surface.md (TECH-doc-001..002); appends to product-discipline (BIZ-product-007..009), workspace-consistency (BIZ-workspace-006), rpc-and-contracts (TECH-rpc-005..008), error-handling (TECH-error-003), quality-gates (TECH-quality-005). Drift detection against current code fixed 10 stale P1-era entries in place (ID preserved): BIZ-product-004, TECH-error-001/002, TECH-monorepo-001/003/004, TECH-quality-001, TECH-rpc-001/003/004 (error pool 6->21 codes, channel families 3->7+events, services 2->6, artifacts 5->7, app_key_logs central+workspace scope duality, G1 pin pool +9-16). Vocabulary index docs/.vocabulary.md regenerated (decision 5 / lesson 1 / convention 28 / business-rule 29). No orphaned rules; TECH-013 (record-replay) skipped as already covered by TECH-quality-004.

## Changes

### Files Created
- docs/features/dsh-forge-m2-pipeline/specs/biz-specs.md
- docs/features/dsh-forge-m2-pipeline/specs/tech-specs.md
- docs/features/dsh-forge-m2-pipeline/specs/review-choices.md
- docs/features/dsh-forge-m2-pipeline/specs/.integrated
- docs/business-rules/task-pipeline.md
- docs/conventions/task-domain.md
- docs/conventions/doc-surface.md

### Files Modified
- docs/business-rules/product-discipline.md
- docs/business-rules/workspace-consistency.md
- docs/conventions/rpc-and-contracts.md
- docs/conventions/error-handling.md
- docs/conventions/monorepo-structure.md
- docs/conventions/quality-gates.md
- docs/features/dsh-forge-m2-pipeline/manifest.md
- docs/.vocabulary.md

### Key Decisions
无

## Document Metrics
CROSS integrated: 27 (biz 15 / tech 12); drift: 10 updated, 0 orphaned, 0 removed; vocabulary: 29 biz-rules / 28 conventions across 11 files; domains overlap warnings: 0

## Referenced Documents
- docs/features/dsh-forge-m2-pipeline/prd/prd-spec.md
- docs/features/dsh-forge-m2-pipeline/prd/prd-user-stories.md
- docs/features/dsh-forge-m2-pipeline/design/tech-design.md
- docs/features/dsh-forge-m2-pipeline/manifest.md
- docs/proposals/dsh-forge-m2-pipeline/proposal.md
- packages/contracts/src/errors.ts
- packages/contracts/src/channels.ts
- packages/core/src/forge/key-logs.ts
- packages/core/src/forge/workspace/app-key-logs.ts
- packages/core/src/index.ts
- packages/plugin-forge/src/faces.ts

## Review Status
final

## Acceptance Criteria
- [x] Business rules extracted to docs/business-rules/ with correct domains frontmatter
- [x] Tech specs extracted to docs/conventions/ with correct domains frontmatter
- [x] All CROSS items auto-integrated and committed with [auto-specs] tag

## Notes
Non-interactive mode per task definition (auto-integrate all CROSS, [auto-specs] commit 7505a76, separate from code commits; only spec files staged — other sessions' worktree changes untouched). Domain frontmatter derived from spec IDs + source keywords per rules/domain-frontmatter.md; re-derived on all substantially-changed files. Overlap resolution: decisions rows (architecture x2, interface x1) related to TECH-001/002/003 kept in place ([skip] keep both); TECH-013 record-replay skipped (already TECH-quality-004). LOCAL items (UI view forms, drawer sections, SC-M2 gate details, G1 pin enumeration 9-16, Integration Specs) stay in feature docs.
