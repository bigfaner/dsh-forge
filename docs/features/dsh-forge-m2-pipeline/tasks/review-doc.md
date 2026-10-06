---
id: "T-review-doc"
title: "Review Documentation Quality"
priority: "P1"
estimated_time: "30min"
dependencies: ["3.3"]
type: "doc.review"
surface-key: ""
surface-type: ""
---

Review documentation quality for the dsh-forge-m2-pipeline feature (breakdown mode).

## Acceptance Criteria Summary

The following acceptance criteria are pre-extracted from doc tasks. Use these as the review baseline.

### 3.3-plugin-forge-skills

- [ ] run-tasks：Z1 出口判据（claimTask 返回 task:null → 循环等待或收工）+ fix 链协议（blocked → addTask{sourceTask, blockSource} → 前置满足自动恢复）+ fix-record-missed 降级静态文本内聚
- [ ] submit-task：result=success/blocked 双径 + reason/summary 必带纪律 + 质量门序列（compile/fmt/lint/test/coverage）+ git 缺席走 blocked 承接
- [ ] git-commit：Conventional Commits 纪律 + C9 降级标注（skill 文本承载，非机械拦截）
- [ ] run-tests：执行编排面（禁结果伪造；失败即 blocked）
- [ ] 四技能目录结构兼容 customSkillDirs 物理挂载约定（与 3.4 装配对齐）


## Discovery Strategy

Scan ONLY the following allowlist of directories for target documents:
- docs/features/dsh-forge-m2-pipeline/ (prd/, design/, testing/, and any subdirectories)
- docs/proposals/dsh-forge-m2-pipeline/

EXCLUDE the following from scanning — do NOT read or process these:
- tasks/ directory (task definitions are not deliverables)
- tasks/records/ directory (execution records are not deliverables)
- manifest.md (build artifact)
- index.json (build artifact)

Only .md files under the allowlist directories are target deliverables.

## Acceptance Criteria

- [ ] All acceptance criteria met
