---
status: "completed"
started: "2026-09-20 21:46"
completed: "2026-09-20 21:54"
time_spent: "~8m"
---

# Task Record: disc-1 Shell fallback document for blank-boot paths

## Summary
Blank-boot fix (disc-1): dsh-app://app/ now serves an embedded shell fallback document (no upstream assets, pre-resolved boot gate, #dsh-forge-shell-root, same shell-ui bundle) when the upstream web dist is missing or the host hit terminal failed, so the UF4 failed overlay renders instead of a white window; shell-ui mount adopts pre-existing root; normal path unchanged. e2e + unit tests added, all green.

## Changes

### Files Created
无

### Files Modified
无

### Key Decisions
无

## Test Results
- **Tests Executed**: Yes
- **Passed**: 294
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
无

## Notes
无
