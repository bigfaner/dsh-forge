---
status: "completed"
started: "2026-09-22 04:09"
completed: "2026-09-22 04:14"
time_spent: "~5m"
---

# Task Record: T-quick-doc-drift Detect Spec Drift

## Summary
Drift-only consolidate-specs run for ui-plugin-foundation: narrowed scope via git diff main...HEAD (2668 files), verified all 10 project-level rules across docs/business-rules/ (3 files) and docs/conventions/ (4 files) against current code -- all current, 0 drifted, 0 orphaned. Key anchors re-verified: HOST_PROFILE_BUNDLES migrated to product config (apps/desktop/resources/plugin-bundles.json, zero plugin identity in shell code), desktopHostVersion 0.1.6-alpha.2 / vendored SHA c36ba648 match vendor/upstream.lock.json, CI version gate wired (scripts/verify-plugins.mjs + tests/verify-plugins.spec.ts), fetch() confined to update-checker (GitHub Releases) + loopback Host forwarding, IPC verb whitelist + sender validation intact, 2222 sha256 entries in UpstreamLock. One implicit cross-cutting convention auto-appended in non-interactive mode: TECH-product-arch-005 (plugin artifact vendor-free discipline, task 4/7 Hard Rule). Vocabulary index regenerated. Commit fcef9f6 with [auto-specs] tag.

## Changes

### Files Created
无

### Files Modified
- docs/conventions/product-architecture.md
- docs/.vocabulary.md

### Key Decisions
无

## Document Metrics
rules: 10 current / 0 drifted / 0 orphaned; implicit rules added: 1 (TECH-product-arch-005); vocabulary: 4 types, 47 domains (conventions 3->4, decisions 8->12)

## Referenced Documents
- docs/business-rules/coexistence.md
- docs/business-rules/privacy.md
- docs/business-rules/resilience.md
- docs/conventions/electron-ipc-security.md
- docs/conventions/product-architecture.md
- docs/conventions/ui-reuse.md
- docs/conventions/upstream-vendor.md
- apps/desktop/src/main/host-profile/index.ts
- apps/desktop/resources/plugin-bundles.json
- vendor/upstream.lock.json
- scripts/verify-plugins.mjs

## Review Status
final

## Acceptance Criteria
- [x] Spec drift detected between project specs and code with git-diff-narrowed scope (no blind scan)
- [x] Drifted specs auto-fixed and committed with [auto-specs] tag

## Notes
Drift-only mode (no prd/design/specs dirs for ui-plugin-foundation). Scan found no drift; the [auto-specs] commit fcef9f6 carries the implicit-rule append and vocabulary regeneration. docs/conventions/product-architecture.md was an untracked working-tree file from prior doc work; staged per Step 11 rule (stage all changed files under docs/conventions/) -- its pre-existing content is spec-only. BIZ-resilience-001 note: new fatal startup error paths (ERR_PLUGIN_BUNDLES_CONFIG / ERR_HOST_PROFILE) route through the UF4 crash-recovery surface, consistent with the rule's UF4 carve-out (they are fatal install-corruption errors, not non-fatal degradation cases).
