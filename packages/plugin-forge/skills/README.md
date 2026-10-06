# skills/

定位：**业务** —— plugin-forge 技能半身（markdown 产物，无代码）。四技能 = 老 forge 对应技能/命令文本平移 + M2 双轨身份（`slug` + `local_id` 自然键）与 tool 面对齐（工具名与 `src/tools/` FORGE_TOOL_NAMES 逐字一致；wire 参数 snake_case）。

3.3 已填充（四技能 + fix 链协议内聚）：
- `run-tasks/SKILL.md` —— 派发循环（claimTask → 派发 executor 子代理[简报原文] → queryTask 验证 → 续环）；Z1 出口判据（`task: null` → 循环等待[有界]或收工，禁造工作）；**fix 链协议单一入口内聚于此**（blocked → `addTask{source_slug, source_local_id, block_source: true}` → fix-N 前缀/fix-chain 边/源同事务置 blocked → fix 完成恢复钩子自动还原，边不删；链深 ≤6；disc-N 差异随访变体）；fix-record-missed 降级内置恢复简报（静态文本，不占 TaskType 词汇——20 值定稿）
- `submit-task/SKILL.md` —— 结算协议：result=success/blocked 双径（summary/reason 必带）、质量门序列（compile/fmt/lint/unit-test + coverage）、files/commit_hash 采集、git 缺席走 blocked 承接（禁伪造）
- `git-commit/SKILL.md` —— Conventional Commits 纪律 + 显式路径暂存铁律 + **C9 降级标注**（0.2.0-rc.2 无 tool-use hook 面，纪律纯文本承载，升级窗口重估机械拦截）
- `run-tests/SKILL.md` —— 面级测试执行编排（surface 探测 → just 配方序列 dev/probe/逐 journey test/teardown）；禁结果伪造；任务形态下失败即 blocked（fix 链承接）

## 物理挂载（3.4 接线）

本目录 = customSkillDirs 挂载根：profile `customSkillDirs` 行指向 `packages/plugin-forge/skills`（dsh-skill-filesystem 发现约定 = 根下**一层** `<name>/SKILL.md`；frontmatter 必填 `name`[kebab-case，与目录名一致] + `description`，可选 `user-invocable`——submit-task 置 false（executor 专用面））。dogfood（5.4）经此链路验证。

> 装配缝注记：core test-run 类型模板（2.2）中技能引用为 `Skill(skill="forge:run-tests")`（老 forge 前缀形制）；dsh 挂载后技能名 = `run-tests`（无前缀）。5.4 dogfood 首跑对齐此口径。
