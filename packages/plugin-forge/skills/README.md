# skills/

定位：**业务** —— plugin-forge 技能半身（markdown 产物，无代码）。本目录技能已全数迁出：grilling / fix-bug / investigate-bug 迁 `plugins/spec/skills/`（plugin-spec 1.9——grilling 按五段成文章节随 Spec 文档契约改写，收尾注册动词改指 `create_spec`；fix-bug / investigate-bug 逐字迁入）；brainstorm 退役不迁（共识工作流保留 grilling 单入口——Spec 域唯一提案探索面）；`skills-blitz/grilling` 随迁清理（blitz 预设不再携带突击专属技能目录）。本目录现仅存本 README（保持 `skills/` 约定目录占位——物化声明面消费）。

迁出后技能面归属：

- `plugins/spec/skills/`——grilling（Spec 共识探索）/ fix-bug（TDD 修缺陷）/ investigate-bug（bug 深挖）。
- `plugins/task-loop/skills/`——to-tasks 拆解 / submit-task 结算 / rescue-task-loop 循环救援。
- `plugins/expert-squad/skills/`——roundtable 专家圆桌。
- `packages/plugin-forge-spec/skills/`——旧规格技能六份（write-prd 等——随 core 解散批退役，不在本批）。

已移除（历史）：`git-commit/`、`run-tasks/`、`review-proposal/`、`run-tests/`、`submit-task/`（迁 task-loop）、`quick-tasks/`（to-tasks 替代退役）、循环阻塞 SOP（1.25 迁 task-loop 为 rescue-task-loop；1.9 loop-blocking 新建落 spec，后随 rescue-task-loop 成熟退役收敛单入口）、`brainstorm/`（1.9 退役）、`grilling/`（1.9 迁 spec 改写）、`fix-bug/`、`investigate-bug/`（1.9 迁 spec）。

## 物理挂载

本目录曾为 customSkillDirs 挂载根（dsh-skill-filesystem 发现约定 = 根下一层 `<name>/SKILL.md`；frontmatter 必填 `name`[kebab-case，与目录名一致] + `description`）。1.9 迁移后挂载锚随迁：spec 技能面 = `@dsh-forge/spec` 包 `skills/` 目录（customSkillDirs[spec]）；plugin-forge 包不再携带可挂载技能。
