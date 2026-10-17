# skills/

定位：**业务** —— plugin-forge 技能半身（markdown 产物，无代码）。五技能 = 双模式共用执行面（3.6 M3 终态 + fix-bug 增补；工具名与 `src/tools/` FORGE_TOOL_NAMES 一致（六员 + recordBug/resolveBug 两 bug 写径）；wire 参数 snake_case——技能文本聚焦 LLM 判断面，机械校验一律在工具行为内，禁「请模型自觉」类纪律承载）。12 份 → 13 份 SKILL.md（本目录 5 份 + `packages/plugin-forge-spec/skills/` 8 份，后者无 README）全部中文写作：反引号内协议词一律不译，`<HARD-GATE>`/`<HARD-RULE>` 等标签名保留英文原样；文档风格公约单源在 forge-pipeline 系统提示段（见下节），技能内零重复。
- `submit-task/SKILL.md` —— 结算协议（executor 专用面）：聚焦 LLM 判断面——summary 组织（结果先行 + 决策及因由）/测试证据引用（AC 逐项对应用例）/commit 规范两态（AGENTS.md 约定在场从其约定，缺席回退模型常识级 Conventional Commits；显式路径暂存）/git 缺席走 blocked 承接（禁伪造）；机械面（必带校验/四门 all-or-none/AC 证据门）全部工具化零复述
- `fix-bug/SKILL.md` —— TDD 修缺陷工作流（独立用户直调 + coding-fix 派发委托——persona 变体强制委托，test-run/run-tests 先例）：六步循环（理解 → 复现 → 失败测试 → 修复 → 质量门 → 原子提交）；四硬语义 = 复现失败即停（仍 `resolveBug` 回填 unresolved）/ 失败测试先行禁令（产品码改动前测试必须因 bug 而败）/ 质量门 compile→fmt→lint→unit-test 四门序列（命令 agent 自选，禁机械配方）/ fix+tests 原子提交 + Root cause 一句注记；Step 1 含项目规范/惯例搜集义务（手段不限）+ **两阶段落库**——诊断后 `recordBug` 登记 open、Step 6 提交后立即捕获 commit_hash 并 `resolveBug` 回填终态
- `run-tests/SKILL.md` —— 面级测试执行编排（surface 探测 → just 配方序列 dev/probe/逐 journey test/teardown）；**按需加载语义自述**（catalog 行常驻、内容仅 test-run 任务加载——SC2 断言语义）；禁结果伪造；任务形态下失败即 blocked（fix 链承接）
- `quick-tasks/SKILL.md` —— 突击任务拆解器（职责收窄：**核实改动范围 → 拆任务 → 建清单**三件事；不管建提案与状态流转——提案域承载）：**核实改动范围**（澄清到 file 粒度——预期文件路径清单，非需求功能覆盖）+ **vars.scope 声明**（任务级预期文件清单——落库/简报 VARS 行送达 worker/结算后 UI 与实际改动文件双列对比审查）+ 目标导向拆解（每任务一个清晰目标）+ 方法论速查（KANO/MoSCoW/帕累托/XY 快问）；突击硬语义（整数 id/无阶段门/免 eval/无 feature 行/跨容器禁令/提案成文五段）移居 blitz 版 forge:pipeline 系统提示段（预设承载，措辞去工具名防双源漂移）
- `brainstorm/SKILL.md` —— 双模式提案探索入口（串联叙事模式条件化——接受后走向由容器 mode 决定）：挑战式对话（Need Gate/方案对照/意图推断/SC 一致性检查内联）→ `proposal.md` 经 tool 读写 + `createProposal` 注册（**mode 不透传**——createProposal 按会话预设 `header.agentPreset` 自动填充：远征→expedition/突击→blitz）；Step 6 六段表（**风险段仅远征**；突击成文五段不含——由 blitz 系统提示段承载）；方法论速查（双钻/影响地图/机会解决方案树/用户故事地图/六顶思考帽/SCAMPER）；accepted 成链分叉交由服务内聚，本技能止于注册提案

已移除：`git-commit/`（Out of Scope #12——M2 条目 M3 删除；复活触发 = 真实消费者出现。commit 纪律两态由 submit-task 承载）、`run-tasks/`（dispatch-loop-hardening 3a 退役——派发入口归一 `/run-dag-tasks` 指令（宿主派发循环）；fix 链协议正本在派发核心文档 `docs/business-rules/task-pipeline.md`（BIZ-task-003/014）与处置注入模板 `src/triage/prompt.ts` `<fix-chain>` 段，派发循环机械由 `src/loop/` driver 承载）。

## 风格公约·方法论落位·双模式边界

- **文档风格公约单源**：`<forge-pipeline>` 系统提示段（`renderForgePipelineSection` 第四部分——mermaid 优先/文字精简/不留调整修复叙事），双模式与 worker 全覆盖；技能内零公约重复段（原 breakdown-tasks 两行残余已清零）。技能中的「存储布局见 forge-pipeline 系统提示段」指针 = 文档位置单源的承接（forgeDir 动态注入，运行时取实际值）。
- **方法论速查落位**（persona 只保留必要项：主人翁意识/XY 问题/5 Whys/权衡显式化；完整工具箱按适配表进 6 技能）：brainstorm（双钻/影响地图/机会解决方案树/用户故事地图/六顶思考帽/SCAMPER）、quick-tasks（KANO/MoSCoW/帕累托/XY 快问）、write-prd（JTBD/KANO/赫茨伯格/用户故事地图）、tech-design（DDD 限界上下文/TOC/奥卡姆/预验尸/FMEA/权衡矩阵）、eval（魔鬼代言人）。
- **双模式边界**：突击（blitz）会话只见本目录 5 技能；远征（expedition）会话另见 `packages/plugin-forge-spec/skills/` 8 份规格技能（write-prd/ui-design/tech-design/breakdown-tasks/gen-journeys/gen-contracts/gen-test-scripts/eval——L1 物理边界，突击 worker 组合继承目录不见）。风险段只属远征：brainstorm 六段表含风险；突击提案成文五段（不含风险段）由 blitz 系统提示段承载。

## 物理挂载

本目录 = customSkillDirs 挂载根：profile `customSkillDirs` 行指向 `packages/plugin-forge/skills`（dsh-skill-filesystem 发现约定 = 根下**一层** `<name>/SKILL.md`；frontmatter 必填 `name`[kebab-case，与目录名一致] + `description`，可选 `user-invocable`——submit-task 置 false（executor 专用面））。

> 前缀缝注记（drift #8 收口）：M2 3.3 的 `Skill(skill="forge:run-tests")` 前缀引用已在 2.4 消灭——core test-run 模板与技能文本自述名一致，均为挂载名 `run-tests`（无前缀）。同缝残余已随后续收口清零：eval/gen 系模板（`forge:eval`/`forge:gen-*`）同批去前缀；code-quality-simplify 与 doc-consolidate/doc-drift 模板的幽灵技能引用（`forge:clean-code`/`forge:consolidate-specs`——技能目录从未存在）已改内联指引。技能目录不含 git-commit/git-checkout（SC2 断言对象）。
