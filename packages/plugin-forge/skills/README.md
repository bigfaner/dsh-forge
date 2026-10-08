# skills/

定位：**业务** —— plugin-forge 技能半身（markdown 产物，无代码）。五技能 = 双模式共用执行面（3.6 M3 终态；工具名与 `src/tools/` FORGE_TOOL_NAMES 六员逐字一致；wire 参数 snake_case——技能文本聚焦 LLM 判断面，机械校验一律在工具行为内，禁「请模型自觉」类纪律承载）：

- `run-tasks/SKILL.md` —— 派发循环（**dispatchTask 每轮单调用**——spawned/no-task/halted/spawn 失败四出口；简报零进派发会话上下文）；池快照三态判断（收工/等待/疑似死锁——工具附载判词，技能只做处置）；halt 处置 = 新会话复位（防线机械·无自解锁参数）；**容器绑定认领**（`/run-tasks <slug>` → source_kind+source_slug 成对携带——claim 限定该容器 + 会话重入仅同容器；no-task 事件归属随 source_slug 承载，context_slug 入参已退役；source 缺席 = 全库 DAG 就绪盲选缺省——M3 2.4 接线·用户裁决 2026-10-08 同日改判）+ 双模式指引（feature/proposal 容器同循环）；**错配守卫提示行**（Story 1 AC4：容器 mode 与会话预设错配 → 单行可见提示，不阻断）；fix 链协议单一入口内聚于此（fix-N 前缀/同事务置 blocked/恢复钩子/链深 ≤6 均工具机械承载）
- `submit-task/SKILL.md` —— 结算协议（executor 专用面）：聚焦 LLM 判断面——summary 组织（结果先行 + 决策及因由）/测试证据引用（AC 逐项对应用例）/commit 规范两态（AGENTS.md 约定在场从其约定，缺席回退模型常识级 Conventional Commits；显式路径暂存）/git 缺席走 blocked 承接（禁伪造）；机械面（必带校验/四门 all-or-none/AC 证据门）全部工具化零复述
- `run-tests/SKILL.md` —— 面级测试执行编排（surface 探测 → just 配方序列 dev/probe/逐 journey test/teardown）；**按需加载语义自述**（catalog 行常驻、内容仅 test-run 任务加载——SC2 断言语义）；禁结果伪造；任务形态下失败即 blocked（fix 链承接）
- `quick-tasks/SKILL.md` —— 突击直达入口：一句话 → 提案（`createProposal mode=blitz`——溯源由创建技能写入）+ 任务清单（`addTask source_kind=proposal`）一次产出；突击语义显式（整数 ID/无 stage-gate/eval 豁免/无 feature 行）；执行期 gate 纪律不折扣
- `brainstorm/SKILL.md` —— 远征结构化探索入口：挑战式对话（Need Gate/方案对照/意图推断/SC 一致性检查内联）→ `proposal.md` 经 tool 读写 + `createProposal mode=expedition` 溯源；accepted 成链分叉交由服务内聚，本技能止于注册提案

已移除：`git-commit/`（Out of Scope #12——M2 条目 M3 删除；复活触发 = 真实消费者出现。commit 纪律两态由 submit-task 承载）。

## 物理挂载

本目录 = customSkillDirs 挂载根：profile `customSkillDirs` 行指向 `packages/plugin-forge/skills`（dsh-skill-filesystem 发现约定 = 根下**一层** `<name>/SKILL.md`；frontmatter 必填 `name`[kebab-case，与目录名一致] + `description`，可选 `user-invocable`——submit-task 置 false（executor 专用面））。

> 前缀缝注记（drift #8 收口）：M2 3.3 的 `Skill(skill="forge:run-tests")` 前缀引用已在 2.4 消灭——core test-run 模板与技能文本自述名一致，均为挂载名 `run-tests`（无前缀）。技能目录不含 git-commit/git-checkout（SC2 断言对象）。
