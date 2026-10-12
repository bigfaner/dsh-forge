# skills/

定位：**业务** —— plugin-forge 技能半身（markdown 产物，无代码）。五技能 = 双模式共用执行面（3.6 M3 终态；工具名与 `src/tools/` FORGE_TOOL_NAMES 六员逐字一致；wire 参数 snake_case——技能文本聚焦 LLM 判断面，机械校验一律在工具行为内，禁「请模型自觉」类纪律承载）。13 份 SKILL.md（本目录 5 份 + `packages/plugin-forge-spec/skills/` 8 份，后者无 README）全部中文写作：反引号内协议词一律不译，`<HARD-GATE>`/`<HARD-RULE>` 等标签名保留英文原样；文档风格公约单源在 forge-pipeline 系统提示段（见下节），技能内零重复。

- `run-tasks/SKILL.md` —— 派发循环（**dispatchTask 每轮单调用**——dispatched/spawned/no-task/halted 四出口（出口① = dispatched·background receipt——结算后置，job_output 终读；no-task wait 判词 = 排水点）；简报零进派发会话上下文）；池快照三态判断（收工/等待/疑似死锁——工具附载判词，技能只做处置）；halt 处置 = 新会话复位（防线机械·无自解锁参数）；**容器绑定认领**（`/run-tasks <slug>` → source_kind+source_slug 成对携带——claim 限定该容器 + 会话重入仅同容器；no-task 事件归属随 source_slug 承载，context_slug 入参已退役；source 缺席 = 全库 DAG 就绪盲选缺省——M3 2.4 接线·用户裁决 2026-10-08 同日改判）+ 双模式指引（feature/proposal 容器同循环）；**错配守卫提示行**（Story 1 AC4：容器 mode 与会话预设错配 → 单行可见提示，不阻断）；fix 链协议单一入口内聚于此（fix-N 前缀/同事务置 blocked/恢复钩子/链深 ≤6 均工具机械承载）
- `submit-task/SKILL.md` —— 结算协议（executor 专用面）：聚焦 LLM 判断面——summary 组织（结果先行 + 决策及因由）/测试证据引用（AC 逐项对应用例）/commit 规范两态（AGENTS.md 约定在场从其约定，缺席回退模型常识级 Conventional Commits；显式路径暂存）/git 缺席走 blocked 承接（禁伪造）；机械面（必带校验/四门 all-or-none/AC 证据门）全部工具化零复述
- `run-tests/SKILL.md` —— 面级测试执行编排（surface 探测 → just 配方序列 dev/probe/逐 journey test/teardown）；**按需加载语义自述**（catalog 行常驻、内容仅 test-run 任务加载——SC2 断言语义）；禁结果伪造；任务形态下失败即 blocked（fix 链承接）
- `quick-tasks/SKILL.md` —— 突击直达入口：一句话 → 提案（`createProposal mode=blitz`——溯源由创建技能写入）+ 任务清单（`addTask source_kind=proposal`）一次产出；突击语义显式（整数 ID/无 stage-gate/eval 豁免/无 feature 行）；执行期 gate 纪律不折扣；**五段突击提案模板**（问题/方案 mermaid/改动范围/影响范围/验收——不含风险段，60 行指导值）+ **补全步**（范围/影响/边界不明先问再建）+ 目标导向拆解（每任务一个清晰目标）+ 方法论速查（KANO/MoSCoW/帕累托/XY 快问）
- `brainstorm/SKILL.md` —— 远征结构化探索入口：挑战式对话（Need Gate/方案对照/意图推断/SC 一致性检查内联）→ `proposal.md` 经 tool 读写 + `createProposal` 注册（**mode 不透传**——createProposal 按会话预设 `header.agentPreset` 自动填充，远征会话即 expedition 溯源）；Step 6 六段表（**风险段远征保留**——突击五段模板不含）；方法论速查（双钻/影响地图/机会解决方案树/用户故事地图/六顶思考帽/SCAMPER）；accepted 成链分叉交由服务内聚，本技能止于注册提案

已移除：`git-commit/`（Out of Scope #12——M2 条目 M3 删除；复活触发 = 真实消费者出现。commit 纪律两态由 submit-task 承载）。

> **S5 缓切注记（run-tasks-host-command）**：宿主指令 `/run-dag-tasks <source-slug>`（UI command plane 执行宿主派发循环）已接管 GUI 派发按钮入口；本技能 `/run-tasks <slug>` 手动入口与指令**不同名并存**——会话内手动触发照常（循环仍由 dispatchTask 每轮单调用承载），技能退役另案收口。

## 风格公约·方法论落位·双模式边界

- **文档风格公约单源**：`<forge-pipeline>` 系统提示段（`renderForgePipelineSection` 第四部分——mermaid 优先/文字精简/不留调整修复叙事），双模式与 worker 全覆盖；技能内零公约重复段（唯一残余 = breakdown-tasks 两行精简速查）。技能中的「存储布局见 forge-pipeline 系统提示段」指针 = 文档位置单源的承接（forgeDir 动态注入，运行时取实际值）。
- **方法论速查落位**（persona 只保留必要项：主人翁意识/XY 问题/5 Whys/权衡显式化；完整工具箱按适配表进 5 技能）：brainstorm（双钻/影响地图/机会解决方案树/用户故事地图/六顶思考帽/SCAMPER）、quick-tasks（KANO/MoSCoW/帕累托/XY 快问）、write-prd（JTBD/KANO/赫茨伯格/用户故事地图）、tech-design（DDD 限界上下文/TOC/奥卡姆/预验尸/FMEA/权衡矩阵）、eval（魔鬼代言人）。
- **双模式边界**：突击（blitz）会话只见本目录 5 技能；远征（expedition）会话另见 `packages/plugin-forge-spec/skills/` 8 份规格技能（write-prd/ui-design/tech-design/breakdown-tasks/gen-journeys/gen-contracts/gen-test-scripts/eval——L1 物理边界，突击 worker 组合继承目录不见）。风险段只属远征：brainstorm 六段表含风险，quick-tasks 五段模板不含。

## 物理挂载

本目录 = customSkillDirs 挂载根：profile `customSkillDirs` 行指向 `packages/plugin-forge/skills`（dsh-skill-filesystem 发现约定 = 根下**一层** `<name>/SKILL.md`；frontmatter 必填 `name`[kebab-case，与目录名一致] + `description`，可选 `user-invocable`——submit-task 置 false（executor 专用面））。

> 前缀缝注记（drift #8 收口）：M2 3.3 的 `Skill(skill="forge:run-tests")` 前缀引用已在 2.4 消灭——core test-run 模板与技能文本自述名一致，均为挂载名 `run-tests`（无前缀）。同缝残余已随后续收口清零：eval/gen 系模板（`forge:eval`/`forge:gen-*`）同批去前缀；code-quality-simplify 与 doc-consolidate/doc-drift 模板的幽灵技能引用（`forge:clean-code`/`forge:consolidate-specs`——技能目录从未存在）已改内联指引。技能目录不含 git-commit/git-checkout（SC2 断言对象）。
