---
status: "completed"
started: "2026-09-23 17:19"
completed: "2026-09-23 17:36"
time_spent: "~17m"
---

# Task Record: T-specs-consolidate Consolidate Specs

## Summary
Consolidated dsh-forge-m2 specs (non-interactive /consolidate-specs): extracted 8 business rules + 9 tech specs from PRD/tech-design/spike-1-findings/task records; auto-integrated 16 project-global entries (7 BIZ + 9 TECH) into docs/business-rules/ (workbench.md new; coexistence/task-operations appended) and docs/conventions/ (host-integration.md, markdown-rendering.md new; electron-ipc-security/data-kernel/product-architecture/ui-reuse appended); drift auto-fix on 3 existing entries (TECH-product-arch-001 open-question bullet resolved by D2 ruling, -002 HOST_PROFILE_BUNDLES mechanism reference updated to resources/plugin-bundles.json, -003 M2 D1 landing recorded); regenerated docs/.vocabulary.md. All CROSS items verified against code before wording (channel-allowlist 16 channels, FORGE_ACTOR session:<sessionId> value form, taskKey <featureSlug>/<localId> dialect, node:sqlite/WAL/probe, nav slots main+sidebar.panellist, sessionController.create+prompt, plugin-runtime.json third-party-only overlay, @xyflow plugin-bundle-only placement). Committed with [auto-specs] tag (dfec80c).

## Changes

### Files Created
- docs/business-rules/workbench.md
- docs/conventions/host-integration.md
- docs/conventions/markdown-rendering.md
- docs/features/dsh-forge-m2/specs/biz-specs.md
- docs/features/dsh-forge-m2/specs/tech-specs.md
- docs/features/dsh-forge-m2/specs/review-choices.md
- docs/features/dsh-forge-m2/specs/.integrated

### Files Modified
- docs/business-rules/coexistence.md
- docs/business-rules/task-operations.md
- docs/conventions/electron-ipc-security.md
- docs/conventions/data-kernel.md
- docs/conventions/product-architecture.md
- docs/conventions/ui-reuse.md
- docs/.vocabulary.md
- docs/features/dsh-forge-m2/manifest.md

### Key Decisions
无

## Document Metrics
20 items extracted (10 BIZ + 10 TECH); 16 integrated as new project-global IDs (7 BIZ + 9 TECH), 3 skipped as already-covered (BIZ-task-ops-001 / TECH-product-arch-001 / TECH-ui-reuse-001), 1 LOCAL (watcher degradation chain); drift scan of 24 existing entries: 3 drifted (fixed in place, IDs preserved), 0 orphaned, 21 current; vocabulary: 26 decisions / 18 conventions / 11 business-rules / 0 lessons

## Referenced Documents
- docs/features/dsh-forge-m2/prd/prd-spec.md
- docs/features/dsh-forge-m2/prd/prd-user-stories.md
- docs/features/dsh-forge-m2/design/tech-design.md
- docs/features/dsh-forge-m2/design/spike-1-findings.md
- docs/features/dsh-forge-m2/design/page-map.md
- docs/features/dsh-forge-m2/tasks/records/2.5-forge-indexer.md
- docs/features/dsh-forge-m2/tasks/records/4.2-session-launch-link.md
- docs/features/dsh-forge-m2/tasks/records/5.14-overview-page-assembly.md
- docs/features/dsh-forge-m2/tasks/records/5.gate.md

## Review Status
final

## Acceptance Criteria
- [x] All acceptance criteria met
- [x] Business rules extracted to docs/business-rules/ with correct domains frontmatter
- [x] Tech specs extracted to docs/conventions/ with correct domains frontmatter
- [x] All CROSS items auto-integrated and committed with [auto-specs] tag

## Notes
Residual-ledger dispositions: (1) 注册即激活 contradiction reconciled — BIZ-workbench-002 states register does NOT auto-activate per 5.14 adjudication (contract claim stays a feature-internal eval residual); (2) FORGE_ACTOR value form + determination precedence pinned to code in BIZ-task-ops-002 (session:<sessionId>; actor slot -> link-inference fallback, both read-only); (3) removeProject active-pointer divergence recorded inside BIZ-workbench-002 (pointer cleared in-transaction, ui-design auto-activate wording documented as superseded by landed verb per 5.14/5.gate); (4) Interface 1 channel-count drift neutralized at spec level — TECH-electron-ipc-002 states the pattern (one verb one channel) with the code-verified 16-channel count in context only; (5) remaining post-M2 open items (feature_updated mid-session freshness, approval browser seam, DF005 view-state reset, frontmatter provenance, ERR_SNAPSHOT_STALE main-side emission, boot auto-restore race, tech-design body-text drift, dual-form stub-CLI 对拍腿) are un-adjudicated open questions without explicit rule text in source documents — per HARD-GATE no-inference they were not promoted; they remain recorded in their eval/gate reports. Idempotency marker written (specs/.integrated). Doc-category task: no compile/test/e2e run per hard rule.
