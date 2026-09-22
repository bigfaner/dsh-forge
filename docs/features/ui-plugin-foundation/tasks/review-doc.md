---
id: "T-review-doc"
title: "Review Documentation Quality"
priority: "P1"
estimated_time: "30min"
dependencies: ["5"]
type: "doc.review"
surface-key: ""
surface-type: ""
---

Review documentation quality for the ui-plugin-foundation feature (quick mode).

## Acceptance Criteria Summary

The following acceptance criteria are pre-extracted from doc tasks. Use these as the review baseline.

### 5-assembly-spike-report
- [ ] ① `plugin add` 对壳 profile 目录行为:源码级或实测结论 + 独立退路(退路 = 内置 bundle 清单路线,独立于 `plugin add`)
- [ ] ② out-of-tree 物化解析(dev `link:` 与 prod tarball 两形态分述):结论 + 独立退路(退路 = npm 发布或 tarball 随包内置;显式注明两锚解析属 inject 目标解析锚、不构成 ② 的退路)
- [ ] ③ inject 非官方声明方语义:含最小稳定子集 vs ui-goal 全集(上游实测 7 边)两组 inject 声明对照,子集合法/等价性随结论落档(子集不合法则退回全集,不误读为「非官方声明方不可行」)
- [ ] hello-world 到达打包态/离线壳的分发形态结论(候选:npm 物化 / tarball 内置 / 预播种,以证据定夺不预判)+ 与离线自足 NFR 的兼容性声明
- [ ] 报告内联所依赖的源码级事实(锚定 checkout SHA `c36ba648`),不传递依赖技术方向文档现状;任一项被推翻时给出修正路线并门控 M2 设计


## Discovery Strategy

Scan ONLY the following allowlist of directories for target documents:
- docs/features/ui-plugin-foundation/ (prd/, design/, testing/, and any subdirectories)
- docs/proposals/ui-plugin-foundation/

EXCLUDE the following from scanning — do NOT read or process these:
- tasks/ directory (task definitions are not deliverables)
- tasks/records/ directory (execution records are not deliverables)
- manifest.md (build artifact)
- index.json (build artifact)

Only .md files under the allowlist directories are target deliverables.

## Acceptance Criteria

- [ ] All acceptance criteria met
