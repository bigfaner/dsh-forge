---
status: "completed"
started: "2026-10-03 21:28"
completed: "2026-10-03 21:39"
time_spent: "~11m"
---

# Task Record: T-specs-consolidate Consolidate Specs

## Summary
Non-interactive specs consolidation for dsh-forge-p1-mvp: extracted 15 business rules (14 CROSS + 1 LOCAL) and 15 tech specs (all CROSS) from PRD/user-stories/proposal/tech-design, validated every rule against the current codebase before integration (caught and folded in two design-doc drifts: fix-1 child-form host boot, forge:fs/* channel family), integrated 29 CROSS entries into 8 new project-level spec files (docs/business-rules/ x3, docs/conventions/ x5) with domains frontmatter and project-global IDs, wrote preview files + review-choices + .integrated marker, updated feature manifest, regenerated docs/.vocabulary.md, committed as cfa0631 with [auto-specs] tag. Drift check 29/29 current.

## Changes

### Files Created
- docs/features/dsh-forge-p1-mvp/specs/biz-specs.md
- docs/features/dsh-forge-p1-mvp/specs/tech-specs.md
- docs/features/dsh-forge-p1-mvp/specs/review-choices.md
- docs/features/dsh-forge-p1-mvp/specs/.integrated
- docs/business-rules/workspace-consistency.md
- docs/business-rules/product-discipline.md
- docs/business-rules/knowledge-flywheel.md
- docs/conventions/monorepo-structure.md
- docs/conventions/rpc-and-contracts.md
- docs/conventions/error-handling.md
- docs/conventions/styling.md
- docs/conventions/quality-gates.md
- docs/.vocabulary.md

### Files Modified
- docs/features/dsh-forge-p1-mvp/manifest.md

### Key Decisions
无

## Document Metrics
29 entries integrated (14 business rules + 15 tech specs) across 8 project-level files; domains 3-7 per file; zero domain overlap between files; drift 29/29 current

## Referenced Documents
- docs/features/dsh-forge-p1-mvp/prd/prd-spec.md
- docs/features/dsh-forge-p1-mvp/prd/prd-user-stories.md
- docs/features/dsh-forge-p1-mvp/design/tech-design.md
- docs/features/dsh-forge-p1-mvp/manifest.md
- docs/proposals/dsh-forge-p1-mvp/proposal.md
- docs/architecture/web-ui-composition.md

## Review Status
final

## Acceptance Criteria
- [x] Business rules extracted to docs/business-rules/ with correct domains frontmatter
- [x] Tech specs extracted to docs/conventions/ with correct domains frontmatter
- [x] All CROSS items auto-integrated and committed with [auto-specs] tag

## Notes
Non-interactive mode per task prompt. Extraction validated against live code (not just design docs): fix-1 child-form boot and forge:fs/* channel family were design-doc drifts folded into specs as current state; dsw-raw/raw-import lint exemption annotations captured in styling/rpc conventions. BIZ-006 (cancel-point clean exit) classified LOCAL, stayed in feature preview. No docs/decisions or docs/lessons exist yet, so no overlap resolution. manifest.md staged selectively via index plumbing to avoid sweeping another session's 2 pending report rows into the [auto-specs] commit (their rows remain unstaged in working tree).
