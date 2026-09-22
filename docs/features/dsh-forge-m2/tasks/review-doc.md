---
id: "T-review-doc"
title: "Review Documentation Quality"
priority: "P1"
estimated_time: "30min"
dependencies: ["1.1"]
type: "doc.review"
surface-key: ""
surface-type: ""
---

Review documentation quality for the dsh-forge-m2 feature (breakdown mode).

## Acceptance Criteria Summary

The following acceptance criteria are pre-extracted from doc tasks. Use these as the review baseline.

### 1.1-spike-semantic-equivalence

1. spike-1-findings.md 覆盖四个问题，每项含：侦察路径(具体文件/符号)、证据、结论(等价/降级/不可行)。
2. DF004 通道以「可用性矩阵」定形：候选序每行给出可用/不可用判定与依据，最终明确 M2 采用的通道及降级链。
3. 导航槽位结论明确：存在则给出槽位注册契约(name/id/order/children)，不存在则确认降级 rail 为首选并说明理由。
4. 语义等价性逐要素结论覆盖 skill 指令流/hook/subagent/manifest 四类，无「待定」项。
5. tech-design §Open Questions 四项全部回填结论，无遗留悬空。


## Discovery Strategy

Scan ONLY the following allowlist of directories for target documents:
- docs/features/dsh-forge-m2/ (prd/, design/, testing/, and any subdirectories)
- docs/proposals/dsh-forge-m2/

EXCLUDE the following from scanning — do NOT read or process these:
- tasks/ directory (task definitions are not deliverables)
- tasks/records/ directory (execution records are not deliverables)
- manifest.md (build artifact)
- index.json (build artifact)

Only .md files under the allowlist directories are target deliverables.

## Acceptance Criteria

- [ ] All acceptance criteria met
