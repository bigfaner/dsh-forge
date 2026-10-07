---
id: "T-review-doc"
title: "Review Documentation Quality"
priority: "P1"
estimated_time: "30min"
dependencies: ["3.2", "5.4", "3.6"]
type: "doc.review"
surface-key: ""
surface-type: ""
---

Review documentation quality for the dsh-forge-m3-bootstrap-presets feature (breakdown mode).

## Acceptance Criteria Summary

The following acceptance criteria are pre-extracted from doc tasks. Use these as the review baseline.

### 3.2-spec-skills-migration

- [ ] 8 技能迁入 `packages/plugin-forge-spec/skills/<name>/SKILL.md` 一层深：frontmatter name kebab-case 与目录一致 + dsh-skill-filesystem 发现约定兼容（customSkillDirs 挂载——3.7 装配）
- [ ] 状态层适配：全部产出指令经 tool 读写（upsertFeatureDoc / addTask + registerFeature / transitionProposal）——零「手写文件到 docs/」残留指令
- [ ] eval 幸存者按 M3 形态裁剪——清单记于技能头注（OQ#3 兑现）
- [ ] 技能描述行一句级（token 纪律）；迁移源零改动（冻结旧线只读）
- [ ] 目录枚举与 In Scope ① 清单一致（write-prd/ui-design/tech-design/gen-journeys/gen-contracts/gen-test-scripts/breakdown-tasks + 幸存者）


### 3.6-core-skills-rewrite

- [ ] run-tasks：dispatchTask 每轮单调用协议（spawned/no-task/halted/spawn 失败四出口 + 池快照三态判断）+ halt 处置 + contextSlug 容器语境 + 错配守卫提示行（可见性不阻断）
- [ ] submit-task：聚焦 LLM 判断面——summary 组织/测试证据引用/commit 规范两态；零工具已内聚的机械序列复述
- [ ] run-tests：判断面聚焦 + 按需加载语义自述；禁结果伪造纪律保留
- [ ] quick-tasks：提案（createProposal mode=blitz）+ 任务清单（addTask source=proposal）一次产出协议——突击语义（整数 ID/无 stage-gate/eval 豁免）显式
- [ ] brainstorm：结构化探索 → proposal.md 经 tool 读写 + mode=expedition 溯源
- [ ] git-commit 删除 + README 同步——核心包技能目录无 git-commit/git-checkout 条目（SC2 断言对象就位）


### 5.4-sc9-ledger-merge

- [ ] 总纲 M3 行收窄 + Out of Scope 顺延表 #1–#13 全量合入（含去向与兜底两列——与 M3 提案顺延节一致）
- [ ] 总纲回写四条款：brainstorm 条目修订 / M3.5 时序注记 / tech-research 偏离注记 / M3 行收窄
- [ ] 路书同步（M3 收尾态 + 走查证据引用）；SC9 文档断言口径落定（总纲文件 diff 审计面）


## Discovery Strategy

Scan ONLY the following allowlist of directories for target documents:
- docs/features/dsh-forge-m3-bootstrap-presets/ (prd/, design/, testing/, and any subdirectories)
- docs/proposals/dsh-forge-m3-bootstrap-presets/

EXCLUDE the following from scanning — do NOT read or process these:
- tasks/ directory (task definitions are not deliverables)
- tasks/records/ directory (execution records are not deliverables)
- manifest.md (build artifact)
- index.json (build artifact)

Only .md files under the allowlist directories are target deliverables.

## Acceptance Criteria

- [ ] All acceptance criteria met
