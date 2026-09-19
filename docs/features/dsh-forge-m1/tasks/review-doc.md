---
id: "T-review-doc"
title: "Review Documentation Quality"
priority: "P1"
estimated_time: "30min"
dependencies: ["1.3", "6.4"]
type: "doc.review"
surface-key: ""
surface-type: ""
---

Review documentation quality for the dsh-forge-m1 feature (breakdown mode).

## Acceptance Criteria Summary

The following acceptance criteria are pre-extracted from doc tasks. Use these as the review baseline.

### 1.3-spike-session-focus
1. 通道侦察结论:三候选逐一核查上游源码(引用符号/文件),选定或全部否决
2. fallback 判定明确
3. locale 读取方式二选一结论
4. 结论写入 docs/features/dsh-forge-m1/design/spike-3-findings.md


### 6.4-manual-checklist
1. 六项 SC 各含三平台逐条步骤与预期
2. 录屏归档流程(位置/命名)明确
3. 含干净机器准备说明(无 Node/git/pnpm)


## Discovery Strategy

Scan ONLY the following allowlist of directories for target documents:
- docs/features/dsh-forge-m1/ (prd/, design/, testing/, and any subdirectories)
- docs/proposals/dsh-forge-m1/

EXCLUDE the following from scanning — do NOT read or process these:
- tasks/ directory (task definitions are not deliverables)
- tasks/records/ directory (execution records are not deliverables)
- manifest.md (build artifact)
- index.json (build artifact)

Only .md files under the allowlist directories are target deliverables.

## Acceptance Criteria

- [ ] All acceptance criteria met
