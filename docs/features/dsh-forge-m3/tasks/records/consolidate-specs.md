---
status: "completed"
started: "2026-09-25 18:48"
completed: "2026-09-25 18:59"
time_spent: "~11m"
---

# Task Record: T-specs-consolidate Consolidate Specs

## Summary
Consolidated dsh-forge-m3 specs (non-interactive auto-integrate, [auto-specs] commits 0d4ed24 + 72931c4). Extracted from PRD/tech-design/spike 1-4/task records 1-6.summary: 7 business rules integrated (BIZ-workbench-006..009 stage-gate warn-not-block + summary-gate/stage-assets/forced-injection/deviation + prefs 3-tier inheritance + proposal board read-only; BIZ-coexistence-003 SoT split; new docs/business-rules/sot-migration.md with BIZ-migration-001 explicit atomic migration + BIZ-migration-002 external-write reingest) and 9 tech conventions (TECH-host-003..006 tool registration underscore-flat-names / renderer bridge stream-Remote+answer+backlog / approval waterfall prepend / presynthesis contract ④+sha256 prompt_hash; TECH-data-kernel-004 taskKey shape whitelist / 005 forge-cli Go parity discipline / 006 implicit kernel domain module pattern repo+service+perception-seam; TECH-product-arch-008 customSkillDirs hosting; new docs/conventions/testing.md TECH-testing-001 e2e discipline). Drift auto-fix 7 entries with IDs preserved: BIZ-coexistence-002 (sole-SoT wording narrowed by SoT split), BIZ-workbench-001 (doc-root default flipped out-of-repo), BIZ-workbench-004 (presynthesis supersedes forge prompt injection), TECH-electron-ipc-002 (16->51 channels, verified in channel-allowlist.ts), TECH-data-kernel-001 (schema carrier 4-piece mechanism), TECH-host-002 (forge CLI spawn chain retired, kept as general external-process discipline; cli-resolve.ts deletion verified), TECH-product-arch-003/004 (M3 landed status notes). Orphaned = 0. Overlaps with decisions/architecture|data-model|testing kept [skip] both; BIZ-008 operator-model skipped as already integrated in BIZ-task-ops-001 M3 revision. Domains frontmatter re-derived on 5 changed files, all same-dir overlaps <50%. Vocabulary index fully regenerated (conventions 18->27, business-rules 11->18).

## Changes

### Files Created
- docs/features/dsh-forge-m3/specs/biz-specs.md
- docs/features/dsh-forge-m3/specs/tech-specs.md
- docs/features/dsh-forge-m3/specs/review-choices.md
- docs/features/dsh-forge-m3/specs/.integrated
- docs/business-rules/sot-migration.md
- docs/conventions/testing.md

### Files Modified
- docs/business-rules/coexistence.md
- docs/business-rules/workbench.md
- docs/conventions/data-kernel.md
- docs/conventions/electron-ipc-security.md
- docs/conventions/host-integration.md
- docs/conventions/product-architecture.md
- docs/features/dsh-forge-m3/manifest.md
- docs/.vocabulary.md

### Key Decisions
无

## Document Metrics
extracted 26 CROSS + 8 LOCAL items; integrated 16 new project-global entries (7 BIZ + 9 TECH incl. 1 implicit); drift-fix 7 (0 orphaned); domains re-derived 5 files; vocabulary 86 domain keywords

## Referenced Documents
- docs/features/dsh-forge-m3/prd/prd-spec.md
- docs/features/dsh-forge-m3/design/tech-design.md
- docs/features/dsh-forge-m3/design/spike-1-tool-registration.md
- docs/features/dsh-forge-m3/design/spike-2-subagent-approval.md
- docs/features/dsh-forge-m3/design/spike-3-systemprompt-contract.md
- docs/features/dsh-forge-m3/design/spike-4-prompt-templates-port.md
- docs/features/dsh-forge-m3/tasks/records/1.summary.md
- docs/features/dsh-forge-m3/tasks/records/2.summary.md
- docs/features/dsh-forge-m3/tasks/records/3.summary.md
- docs/features/dsh-forge-m3/tasks/records/4.summary.md
- docs/features/dsh-forge-m3/tasks/records/5.summary.md
- docs/features/dsh-forge-m3/tasks/records/6.summary.md
- docs/proposals/dsh-forge-m3/proposal.md

## Review Status
final

## Acceptance Criteria
- [x] Business rules extracted to docs/business-rules/ with correct domains frontmatter
- [x] Tech specs extracted to docs/conventions/ with correct domains frontmatter
- [x] All CROSS items auto-integrated and committed with [auto-specs] tag

## Notes
Non-interactive mode per task file instruction. New knowledge files created per no-empty-docs policy (each has real entries). Preview files retained under specs/ for traceability; .integrated marker written for idempotency.
