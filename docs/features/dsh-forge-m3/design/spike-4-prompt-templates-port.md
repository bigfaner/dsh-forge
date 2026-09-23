# Spike 4 报告: forge prompt 模板移植面盘点 —— 任务类型协议清单 + 预合成三要素映射(3.4 门控)

> 任务: 0.4(SC8)· 日期: 2026-09-23 · 对应 tech-design §Interface 3(预合成三要素)、§Interface 4(task_type/desc_path 推断)、§Open Questions spike ④;PRD 外围命令归宿表(prompt 行:预合成取代)、技能迁移划分表(被机制取代 2 项/暂缓 20 项)、D3(偏好键集)/D5(技能范围)
> 纪律: 模板权威源 = forge-cli Go 源 `pkg/prompt/templates`(21 文件)与 `pkg/task/templates`(15 文件),2026-09-23 逐文件静态核对(非文档转述);装配代码以 `pkg/prompt/{prompt,metadata}.go`、`pkg/task/{types,category,infer,build,tasktemplate,autogen,stage_gates}.go` 为准;被取代协议以 `plugins/forge/commands/{execute-task,run-tasks}.md` + `plugins/forge/agents/task-executor.md` 为准;偏好数据面以 `pkg/forgeconfig/config.go` 为准。本任务纯侦察,零产品代码。

## 0. 侦察范围与方法

- **执行协议模板(预合成要素①的直接来源)**: `pkg/prompt/templates/*.md` 全量 21 文件,经 `go:embed` 由 `pkg/prompt/prompt.go` 渲染 —— 这就是 `forge prompt get-by-task-id` 的输出本体,亦即 M2 发起链 spawn 取得、注入 subagent 首条 user 消息的 `promptText`(本仓 `packages/plugins/forge-workbench/src/host/forge-bridge.ts:158` 的 `['prompt','get-by-task-id',localId]` 即被 M3 取代的 spawn 点)。
- **任务文件生成模板**: `pkg/task/templates/*.md` 全量 15 文件,由 `pkg/task/tasktemplate.go`(`forge task add` 定型模板)与 `pkg/task/autogen.go`(系统管线任务正文)消费 —— 生成的是**任务 .md 文件**而非执行提示词,与执行协议是两层。
- **引擎装配代码**: `pkg/prompt/prompt.go`(Synthesize/renderTemplate/PhaseDetect/resolveCoverage/collapseBlankLines)、`pkg/prompt/metadata.go`(frontmatter 契约)、`pkg/task/types.go`(21 类型注册表 + SystemTypes + surface 后缀规则)、`pkg/task/category.go`(category 推导)、`pkg/task/infer.go`(ID→type 推断,Interface 4 消费)、`pkg/task/build.go`(IsTestableType)、`pkg/task/stage_gates.go`(gate/doc.summary 正文的程序化生成)。
- **被取代协议**: `plugins/forge/commands/execute-task.md`、`plugins/forge/commands/run-tasks.md`(被机制取代 2 项)+ `plugins/forge/agents/task-executor.md`(包装协议,spike 关键发现,见 §5.2)。
- **CLI 薄层**: `forge-cli/internal/cmd/prompt/{register,prompt_get}.go`(仅 CLI 路径)。

---

## 1. 引擎解构: `forge prompt get-by-task-id` 装配管线(移植基准)

### 1.1 CLI 薄层(仅 CLI 路径,M3 取代点)

`internal/cmd/prompt/prompt_get.go` 只做三件事:project.FindProjectRoot() → feature.GetCurrentFeature() → `prompt.Synthesize({ProjectRoot, FeatureSlug, TaskID, FixRecordMissed})` 后打印。M3 对应:project/feature 来自 dispatch 上下文(SQLite)、任务来自 `task` 表、`--fix-record-missed` 变为内核恢复派发路径 —— CLI 薄层整体**不入移植面**,仅记录语义。

### 1.2 Synthesize 装配流与模板数据字段

`pkg/prompt/prompt.go: Synthesize` 的确定性装配流(全部为无模型调用,M3 预合成可直接平移):

1. `task.LoadIndex(index.json)` → `ByID(taskID)` 查任务(M3: `task` 表查询);
2. `FixRecordMissed` 覆盖路由 → `templates/fix-record-missed.md`(M3: 恢复派发路径);
3. `t.Type` 非空且 `IsValidType` → `templatePath(type)` = `templates/` + type 中 `.`→`-` + `.md`(类型路由纯机械);
4. `renderTemplate` 组装 11 字段数据结构 `promptTemplateData` 并以 text/template 渲染。

**`promptTemplateData` 11 字段 = 预合成的全部数据入参**(字段定义 `prompt.go:29-41`):

| 字段 | 现引擎来源 | 三要素归属 | M3 来源 |
|------|-----------|-----------|---------|
| TaskID / TaskFile | index 行(id/file 列) | 身份块 | `task` 表 task_key / 文档根 + desc_path 寻址 |
| TaskCategory | `task.CategoryForType(type)`(category.go) | 身份块(submit 路由 + fix-type 推导消费) | 同映射表 TS 移植 |
| FeatureSlug | CLI 解析 | 身份块 | dispatch 上下文 |
| PhaseSummary | `PhaseDetect()` → `records/<n-1>-summary.md` 存在时注入相对路径 | **要素②(目标/摘要)** | `stage_asset` 最近资产(见 §4) |
| CoverageStrategy / CoverageTarget | `resolveCoverage()`:task frontmatter coverage > config `coverage.<type>` > 默认;cleanup/refactor 强制 maintain | **要素③(生效偏好)** | `prefs` 三级解析(见 §4) |
| TestTypeArg | `t.SurfaceType != ""` → `" --type <surfaceType>"` | 装配辅料(test.gen-scripts 专用) | `task` 表 surface 列 |
| SurfaceKey / SurfaceType | index 行 | 装配辅料(just 命令前缀/SURFACE_KEY 行) | 同上 |
| Complexity | frontmatter,默认 "medium";`{{if ne .Complexity "low"}}` 门控 Step 1.5 扫描段 | 装配辅料 | frontmatter 摄取 |

### 1.3 渲染后处理与校验契约

- **后处理三件**(prompt.go:232-256):legacy `{{PLACEHOLDER}}`→`{{.Field}}` 桥(移植时直采已迁移的 dot 记法,**桥不移植**)、frontmatter strip(metadata.go)、TASK_CATEGORY 行注入(TASK_FILE 行后 strings.Replace)+ `collapseBlankLines`(3+ 连续空行收敛为 2)。M3 模板库直接持有 dot 记法 + 显式 `{{.TaskCategory}}` 行,后两件可简化但语义保留。
- **frontmatter 元数据契约**(metadata.go):每模板声明 `type / category / identity[] / context[] / conditional[]`,渲染前剥离;`ValidatePromptTemplates()` 启动校验 = 每类型模板存在 + 非空 + 零值数据可执行(`missingkey=error`)+ 元数据变量与 struct 字段交叉验证。**M3 对应物 = 模板库完整性漂移测试**(同 schema.sql/migrate.ts 对账纪律),对拍基准 = Go embed FS 文件集。
- **类型有效性**(`pkg/task/types.go`):21 个 ValidTypes;系统类型可带 surface 后缀(`test.gen-scripts.cli` → 剥尾段回退基型模板,autogen.go `autogenTemplatePath` 同则);`IsTestableType` = `coding.*` 前缀 + `code-quality.simplify`(要素③仅对可测类型注入)。

---

## 2. 任务类型协议清单(AC-1)

### 2.1 类型注册表 ↔ 模板文件对应

`ValidTypes` 21 类型(全量,types.go:99-121)与 `pkg/prompt/templates` 21 文件对应关系:**19 类型一一同名对应(经 `.`→`-` 映射)+ fix-record-missed(旗标路由,非类型)+ 1 个引擎级缺口(doc.fix 无模板,见行 11)**。

### 2.2 逐类型协议清单

> 「形态」列 = 协议的 Workflow 骨架;「技能依赖」= 协议内 MUST-invoke 的 Skill 指令;「Record Fields」= submit-task 消费的 record.json 字段段。出处列 = Go 模板文件路径(相对 `forge-cli/`)。

| # | 任务类型 | 出处(pkg/prompt/templates/) | category | 形态 | 技能依赖 | Record Fields | 移植结论 |
|---|---------|---------------------------|----------|------|---------|--------------|---------|
| 1 | coding.feature | `coding-feature.md` | coding | 4 步:读任务(知识库扫描)→Spec-Code 扫描→TDD(RED/GREEN/REFACTOR)→静态检查+靶向测试 | — | testsPassed/testsFailed/coverage | **移植**(M3 派发主类型) |
| 2 | coding.enhancement | `coding-enhancement.md` | coding | 同 #1 变体(增强既有行为,含 COMPLEXITY 行) | — | 同上 | **移植** |
| 3 | coding.cleanup | `coding-cleanup.md` | coding | 4 步;不写新测试,既有套件保持绿;扫描有简化分支 | — | 同上 | **移植** |
| 4 | coding.refactor | `coding-refactor.md` | coding | 5 步 + Pre-check(git status/targeted tests/main 告警)+ Impact Map(结构/行为分类、5 层句法、动态耦合)+ IMPACT_DECLARATION(PRESERVE/EVOLVE)+ Add→Migrate→Remove 三相 | — | 同上 | **移植**(最长协议,287 行) |
| 5 | coding.fix | `coding-fix.md` | coding | 5 步:读任务→扫描→Locate→Fix(E2E 失败处置)→静态检查+靶向测试 | — | 同上 | **移植** |
| 6 | doc | `doc.md` | doc | 4 步:读任务→4 维文档扫描→执行文档作业→自检(格式/交叉引用/术语/完备) | — | referencedDocs/reviewStatus/docMetrics | **移植**(本任务提示词即其渲染产物) |
| 7 | doc.review | `doc-review.md` | doc | 4 步:预提取 AC 基线→allowlist 目录发现(docs/features/<slug>/、docs/proposals/<slug>/)→逐 AC 修复→报告;docs/ 外禁改 | — | 同 doc | **移植**(系统类型;AC 预提取 = autogen DocTaskCriteria 侧,任务正文层) |
| 8 | doc.summary | `doc-summary.md` | doc | 2 步:读任务→读 records/ 全部完成记录产 5 节摘要(Tasks Completed/Key Decisions/Types & Interfaces/Conventions/Deviations) | — | 同 doc | **被机制吸收**:M3 阶段总结 = `forge.stage.summarize` 写 `stages/<stage>.md`(I5),协议不入预合成模板库;5 节结构作为阶段资产内容结构参考随 I5 采纳 |
| 9 | doc.consolidate | `doc-consolidate.md` | doc | 2 步:读任务→委派技能(非交互) | `Skill(forge:consolidate-specs)`(**暂缓**) | 同 doc | **模板移植 + M3 派发受限**(技能缺席,见 §6 缺口 6) |
| 10 | doc.drift | `doc-drift.md` | doc | 同 #9(drift 语境) | `forge:consolidate-specs`(**暂缓**) | 同 doc | 同上 |
| 11 | doc.fix | **无模板(引擎级缺口)** | doc | — | — | — | **移植缺口 #1**:`renderTemplate` 读 `templates/doc-fix.md` 直接报错(`read template` 失败);doc.fix 任务在 claim/statemachine/task-add 全是合法公民却无法 prompt 派发。M3 须**补 doc-fix 协议**(建议:doc.md 基型 + fix 语境 + doc.fix 任务模板的边界条款) |
| 12 | test.gen-contracts | `test-gen-contracts.md` | test | 2 步:读任务→委派技能 | `forge:gen-contracts`(**必迁**) | scriptsCreated/casesGenerated | **移植** |
| 13 | test.gen-journeys | `test-gen-journeys.md` | test | 同上 | `forge:gen-journeys`(**必迁**) | 同上 | **移植** |
| 14 | test.gen-scripts | `test-gen-scripts.md` | test | 同上 + `{{.TestTypeArg}}` 透传(`--type <surfaceType>`) | `forge:gen-test-scripts`(**必迁**) | 同上 | **移植** |
| 15 | test.run | `test-run.md` | test | 2 步 + 失败修复循环(max 3);约束段含「多缺陷用 forge task add 建fix任务」 | `forge:run-tests`(**必迁**) | casesGenerated/scriptsCreated | **移植**(CLI 文案改写点,§6 缺口 4) |
| 16 | eval.journey | `eval-journey.md` | eval | 2 步:读任务→委派技能(--type journey --target 850) | `forge:eval`(**暂缓**) | score/findings/severity/passed | **模板移植 + M3 派发受限** |
| 17 | eval.contract | `eval-contract.md` | eval | 同上(--type contract) | `forge:eval`(**暂缓**) | 同上 | 同上 |
| 18 | validation.code | `validation-code.md` | validation | 3 步:读任务→5 维扫描→逐准则验证 + 质量门(compile/fmt/lint/unit-test);trivial 内联修(max 2)/非平凡 blocked | — | validationPassed/issuesFound | **移植** |
| 19 | validation.ux | `validation-ux.md` | validation | 同上(UX 准则:可访问/可用/一致;无质量门段) | — | 同上 | **移植** |
| 20 | gate | `gate.md` | gate | 3 步:读任务→逐 AC 验证 + 质量门四连 + mermaid 流程图;MUST 当 pass/fail 准则 | — | gatePassed/gateChecks | **被机制取代**:M3 门 = `checkStageArtifacts` 确定性代码(存在性 + frontmatter/结构解析 + SQLite 查询,断言无模型调用,I5;机械判定先例正是 `pkg/task/stage_gates.go`);gate.md 不入预合成模板库 |
| 21 | code-quality.simplify | `code-quality-simplify.md` | coding | 2 步:读任务→委派技能;TASK-CONSTRAINTS 禁手写改码 | `forge:clean-code`(**暂缓**) | (无 Record Fields 段) | **模板移植 + M3 派发受限** |
| 22 | (旗标路由,非类型)fix-record-missed | `fix-record-missed.md` | coding(元数据) | 1 步 verify-only:核对「Files Created/Modified」存在即过,四连静态检查任一失败 → blocked;禁重实现 | — | (无) | **移植**(M3 记录缺失恢复 = dispatch 回流检测触发恢复派发,协议即该派发的预合成内容) |

**统计**:21 类型 = 移植 14(#1-7、12-15、18-19、21 中除受限外均含;受限 5 类模板同样入库仅暂不派发)+ 被机制取代/吸收 2(gate→I5 确定性门;doc.summary→I5 阶段资产)+ 缺口补 1(doc.fix);外加 fix-record-missed 旗标模板 1 个入库 → **预合成模板库 20 文件**(19 类型 + fix-record-missed,doc-fix 新增后为 21)。

### 2.3 协议模板的公共段(跨类型复用,移植时保持同构)

- `<CRITICAL>## Spec Authority Enforcement`(Reference Files 装载四条 + 空表/缺文件/矛盾三分支)—— 全 21 文件同文;coding 族另有 Hard Rules 服从段(变体:fix 的边界优先/验证系的红线准则)。
- `SPEC-CODE SCAN` 段 —— coding/gate/validation 五维(代码),doc 族四维(文档);complexity=low 跳过。
- 静态检查表(`just <surface->compile/fmt/lint[/unit-test]`)+ 失败处置表 —— 编译系/门/验证族共有;`just` 为项目侧命令,subagent 仍在项目 cwd 执行 bash,**照文保留**。
- `## Record Fields` 段 —— submit-task(必迁)的路由契约,照文保留。
- 中文反漏改段「在修改任何文件前,先用 Grep/Glob 搜索所有需要修改的位置…禁止边搜边改」—— coding 族(#1-5)共有,照文保留。

---

## 3. pkg/task/templates(15 文件)角色标注 —— 任务文件生成模板,非执行协议

逐文件核对结论(口径:协议文本/数据装配/仅 CLI 路径三分;此目录**整体不属于预合成要素①**):

| 文件 | 消费方 | 角色 | M3 归宿 |
|------|--------|------|--------|
| `coding.fix.md` | `tasktemplate.go`(taskTemplateDefaults 键)+ `task/add.go:265` | **数据装配**:Pause Protocol `forge task add --type coding.fix` 的任务 .md 生成模板(frontmatter + Root Cause + Fix Boundaries + 禁启 dev server 等边界) | **入写通道模板面**(dsh tool `forge_task_add` 定型模板,2.1/3.3);Surface Inference 段(`forge surfaces --json` 执行时推断)→ 内核 surface 解析取代(surfaces 归宿 = 内核内部装配) |
| `coding.cleanup.md` | 同上 | 同上(cleanup 边界条款) | 同上 |
| `doc.fix.md` | 同上 | 同上(doc-only 边界:禁改源码/禁跑代码门) | 同上(**注意**:此处有 doc.fix 任务模板而 prompt 侧无对应执行模板,印证缺口 #1 是「执行协议缺」而非「类型缺」) |
| `test-gen-contracts.md` / `test-gen-journeys.md` / `test-gen-scripts.md` / `test-run.md` / `eval-contract.md` / `eval-journey.md` / `validation-code.md` / `validation-ux.md` / `doc-review.md` / `code-quality-simplify.md` | `autogen.go`(buildAutogenTemplateData/renderBody) | **数据装配**:系统管线任务(T- 前缀)的正文生成(Discovery Strategy / SKIP_EVAL_GATE / AUTO_COMMIT 指令段 / AcceptanceCriteria 注入;doc-review 另注入 DocTaskCriteria 预提取 AC) | **M4 随管线 UI**;M3 迁移摄入的是已生成的存量任务文件,不需要生成器。正文中的 `/gen-contracts`、`/eval-contract`、`/eval-journey` slash 引用与 `forge config` 读取段为 M4 改写点 |
| `doc-consolidate.md` / `doc-drift.md` | autogen(双身份:系统管线任务 + 业务任务变体) | 数据装配(consolidate/drift 任务正文) | 同上 M4;业务任务变体由用户/agent 手写时参照 |

**gate 与 doc.summary 的正文不在任何模板目录**:`pkg/task/stage_gates.go: GenerateGateMD/GenerateSummaryMD` 用 Go 字符串程序化生成(`<n>.gate.md` / `<n>.summary.md`,deps = 相位任务全集)——印证 M3 I5「门 = 确定性代码」的机械判定先例。

---

## 4. 预合成模板映射表(AC-2): 三要素来源与组装位点

Interface 3 定义:预合成 = 内核 dispatch 服务组装「任务类型协议(spike④ 移植面清单)+ feature 目标/摘要(stage_asset 最近资产)+ 生效偏好(prefs 解析)」→ 完整注入内容字符串。逐要素映射:

| 要素 | Interface 3 定义 | 现引擎来源(Go 源,逐符号) | M3 组装位点 | 载体差异 |
|------|-----------------|---------------------------|-------------|---------|
| ① 任务类型协议 | spike④ 移植面清单 | `pkg/prompt/templates/<type>.md` 正文(prompt.go `templatePath` 路由) | 内核模板库(TS 移植 §2 清单)+ `task.task_type` 路由(含 surface 后缀回退规则) | 无(逐文件平移 + §6 改写点) |
| ② feature 目标/摘要 | stage_asset 最近资产 | `PhaseDetect()`(prompt.go:265-312):当前相位 > 最大完成相位 且 >1 → 注入 `records/<n-1>-summary.md` 项目相对路径;模板侧 `{{if .PhaseSummary}}## PhaseSummary` 块 + 「If non-empty, read that file」行 | `stage_asset` 查询((project_id, feature_slug, stage) PK 取最近)→ `stages/<stage>.md` 的 frontmatter `{stage, generated, goal}` + 正文摘要注入 | **载体翻转**:records/<n>.summary.md(doc.summary 任务产物)→ stages/<stage>.md(阶段推进资产);注入位点同为模板头部块;跨阶段传递语义(I5 新阶段系统提示词强制注入目标+摘要 = 同一预合成链) |
| ③ 生效偏好 | prefs 解析 | `resolveCoverage()`(prompt.go:349-380):优先级 = task frontmatter `coverage` > config `coverage.<task-type>`(forgeconfig.ReadCoverageConfig)> 内建默认;`coding.cleanup/coding.refactor` 强制 maintain;仅 `IsTestableType`(coding.* + code-quality.simplify)注入 | `prefs` 三级解析(feature > project > global,键 `coverage.<task-type>`),渲染为模板 Conditional 段 `{{if .CoverageStrategy}}` | 键集缺口(§6 缺口 2);task 级 coverage 覆盖源的 SoT 待 1.4/3.4 裁定 |
| 装配辅料:身份块 | — | TaskID/TaskFile/SURFACE_KEY(+)FEATURE_SLUG/COMPLEXITY 行 | dispatch 上下文 + task 表 + 文档根寻址(desc_path) | TaskFile = 文档根绝对路径(仓外默认,G7) |
| 装配辅料:TASK_CATEGORY | — | `CategoryForType`(category.go:21)+ 渲染后行注入 | 同映射表 TS 移植;消费方 = submit-task 路由 + Pause Protocol fix-type 推导(§5.2) | 无 |
| 装配辅料:TestTypeArg/Complexity | — | SurfaceType → `--type <t>`;Complexity 默认 medium 并门控 Step 1.5 段 | task 表 surface 列 / 摄取 frontmatter | 无 |

**组装位点结论(与 Interface 3 一致)**:预合成全串 = 模板渲染(要素①正文 + 要素②③内嵌 Conditional 块 + 身份块)→ 即 M2 `session-launch.ts: composeFirstUserMessage(promptText, FORGE_ACTOR)` 的 `promptText`;spike③ 已定形首条 user 消息 = 预合成内容 + 追加行(原文不改写),`prompt_hash` = sha256(组合首条消息全文)随 dispatch 落库。M2 的 `getTaskPrompt` spawn(forge-bridge.ts)整腿删除,`composeFirstUserMessage` 组装位点不变 —— 预合成引擎是**spawn 的内核内等价替换**,不是新增注入面。

---

## 5. 暂缓技能(20)与被取代 2 项协议依赖标注(AC-3)

### 5.1 被机制取代 2 项(execute-task / run-tasks)协议内容逐段去向

| 协议段(出处) | 去向 |
|--------------|------|
| claim 循环 + ACTION/字段解析(run-tasks Step 1 / execute-task Step 1) | **被内核 dispatch 状态机吸收**(3.3;claim 内化 = 看板派发,UF1) |
| MAIN_SESSION 路由(Step 1.5:读任务「## Main Session Instructions」) | **被应用侧阶段会话吸收**(管线创作系 6 技能承载阶段工作流,I6;M3 不再由 dispatcher 解释 mainSession 标记) |
| `Agent(forge:task-executor, "Execute task <ID>")` 派发 + 30min 超时 + 阻塞等待(Step 2a) | **被 dispatch-launch 吸收**(3.5:sessionController create + prompt queue;超时 = 编排参数) |
| verify record(`forge task status` 查询,Step 2b) | **被 dispatch 回流/状态机吸收**(3.3;状态由内核可观,无 CLI 查询) |
| record-missing recovery(2c:「Fix record for task <ID>」再派发) | **被恢复派发吸收**(fix-record-missed.md 协议入库 §2 行 22;触发条件 = dispatch ended 而 task 仍 in_progress 的内核检测) |
| Fix-Type Derivation(category→doc.fix/coding.fix 映射)+ `forge task add` 模板(Error Handling) | **被预合成前导段吸收**(包装协议 Pause Protocol,§5.2)+ dsh tool `forge_task_add`(2.1,含 --block-source/--var 语义) |
| 3 consecutive failures STOP / 失败计数(run-tasks) | **被 dispatch 编排策略吸收**(3.3 状态机参数) |
| ONE TASK PER INVOCATION / 禁 claim / 禁读 index.json 等铁律 | **被预合成前导段吸收**(§5.2 硬约束段;dispatch 单任务派发使「单次单任务」由机制保证) |
| Post-Completion 提示 / T-test-run 约定 / Git Status Summary(run-tasks 尾段) | **被 UI 呈现吸收**(看板/编排角标 3.7;DO NOT commit post-loop 语义 = M3 提交链归属 git-commit 技能) |
| execute-task 单任务手动入口定位 | **被看板单任务派发取代**(UF1) |

### 5.2 task-executor agent 包装协议的归宿(spike 关键发现)

`plugins/forge/agents/task-executor.md` 是 forge prompt 输出的**外层包装**:六步 Execution Protocol(Initialize 提取任务 ID → Validate 跑 `forge prompt get-by-task-id` → Execute → Submit(forge:submit-task)→ Commit(forge:git-commit)→ DONE 格式输出)+ EXTREMELY-IMPORTANT 九条硬约束(单任务/提交义务/禁后台/~3 attempt 阈值/Pause Protocol/硬规则优先/参考文件回退与解析规则)+ frontmatter(model/memory/inputs)。

M3 里 subagent 的首条 user 消息 = 预合成内容(spike③),**包装协议没有独立的注入宿主** —— 若预合成只含类型协议,提交义务、单任务铁律、Pause Protocol、DONE 输出格式将无处安放。**结论:包装协议(六步 + 硬约束 + Error Handling 表 + DONE 格式)并入预合成内容作为前导段,由内核模板库统一持有、3.4 定稿文案**;其 `forge prompt get-by-task-id` 自调用步骤随 spawn 消失(预合成已是内容本体),`forge task status` 查询步骤改写为 dsh tool 只读动词;FIX-Type 推导表随 TASK_CATEGORY 保留。spike②③ 已指派的「追加行文案(bash 归因 + 过渡期 CLI)字节定稿归 3.4」与此前导段同处定稿范围。frontmatter(model/memory 等)→ 会话创建参数(3.5)。

> 印证:本任务收到的执行提示词(doc.md 渲染)不含任何提交/单任务约束 —— 当前由 agent 定义层供给;M3 两条注入源合流为预合成一处。

### 5.3 暂缓 20 项技能逐一标注(依赖 = 是否被移植面引用)

| 技能(command/skill) | 被移植面引用处 | 去向 |
|---------------------|---------------|------|
| clean-code(command) | 无(skill 形态被引用) | 暂缺(M4;手动入口) |
| clean-code(skill) | `code-quality-simplify.md` MUST-invoke | 暂缺(M4)→ 该类型 M3 派发受限(§6 缺口 6) |
| consolidate-specs(skill) | `doc-consolidate.md` + `doc-drift.md` MUST-invoke | 暂缺(M4)→ 两类型派发受限 |
| eval(skill) | `eval-journey.md` + `eval-contract.md` MUST-invoke(--type/--target 850 参数) | 暂缺(M4)→ 两类型派发受限 |
| eval-contract(command) | autogen `eval-contract.md` 任务正文(/eval-contract) | 暂缺(M4 管线) |
| eval-journey(command) | autogen `eval-journey.md` 任务正文 | 暂缺(M4 管线) |
| eval-consistency(command) | 无 | 暂缺(M4) |
| eval-design(command) | 无 | 暂缺(M4) |
| eval-prd(command) | 无 | 暂缺(M4) |
| eval-proposal(command) | 无 | 暂缺(M4) |
| eval-ui(command) | 无 | 暂缺(M4) |
| extract-design-md(command) | 无 | 暂缺(M4) |
| extract-design-md(skill) | 无 | 暂缺(M4) |
| gen-web-sitemap(skill) | 无 | 暂缺(M4) |
| learn(skill) | 无(D4 数据面 fact/lesson 已入 dsh tool,技能未迁) | 暂缺(M4;数据面 M3 先行) |
| forensic(skill) | 无(D4 research/forensic 只读已入 dsh tool) | 暂缺(M4;同上) |
| deep-research(skill) | 无 | 暂缺(M4) |
| simplify-skill(skill) | 无 | 暂缺(M4) |
| quick(command) | 无(quick 模式任务生成入口) | 暂缺(M4 管线) |
| init-justfile(skill) | 无 | 暂缺(M4) |

**结论**:20 项中仅 5 个形态(clean-code/consolidate-specs/eval 三技能 + eval-contract/eval-journey 两 command 的任务正文引用)与移植面存在协议依赖,其余 15 项无依赖、暂缓不产生移植面空洞。必迁 15 项覆盖了 M3 派发主类型(coding.*/doc/doc.fix/test.*)的全部协议委派(test 系 4 类型 → gen-contracts/gen-journeys/gen-test-scripts/run-tests,均必迁)。

---

## 6. 移植缺口清单(3.4 开工输入)

1. **doc.fix 执行协议缺失(引擎级)**:`pkg/prompt/templates` 无 `doc-fix.md`,`renderTemplate` 对 doc.fix 任务直接报错;而 doc.fix 在 ValidTypes/claim/statemachine/task-add 均合法。3.4 须新增 doc-fix 协议模板(基型 doc.md + fix 语境 + `pkg/task/templates/doc.fix.md` 的 doc-only 边界条款)。
2. **prefs 键集补 coverage.***:resolveCoverage 消费 `coverage.<task-type>`(forgeconfig.Config 四块 Auto/Worktree/Coverage/Eval 之一),PRD D3 枚举(auto.*/worktree.*/eval.*)漏列 —— 按总纲「现 config 全量」口径,`coverage.*` 入 prefs 键集(surfaces 除外不变);另 task 级 `coverage` frontmatter 覆盖(优先级 1)的 SoT 需 1.4(摄取解析入 task 行)或 3.4(dispatch 时读 desc_path)二选一裁定。
3. **包装协议前导段**:task-executor agent 六步 + 硬约束 + Pause Protocol + DONE 格式 + 追加行文案(spike②③ 已指派)并入预合成内容前导段,3.4 定稿(§5.2)。
4. **CLI 文案改写点**(模板移植时逐处执行):`forge task transition <ID> blocked`(refactor Pre-check/gate/validation/fix-record-missed)→ dsh tool 写动词(spike① 偏差:snake_case 扁平名);`forge task submit` Note 行(coding 族/fix 模板)→ M3 submit 语义(submit-task 技能 + dsh tool);`forge task add`(test-run 约束段)→ `forge_task_add`;`Skill(forge:X)` 寻址 → 扁平名 `X`(I6/D2 customSkillDirs 扁平名寻址,SC1 断言口径);`forge surfaces --json`(仅 task-add fix 模板 Surface Inference 段)→ 内核 surface 解析,段落删除。
5. **不入库类型定案**:gate.md(I5 确定性门取代)、doc-summary.md(I5 阶段资产吸收,5 节结构作资产内容参考)不入预合成模板库;gate/doc.summary 存量任务迁移后若被派发 → 内核拒绝并引导(类型集封闭在模板库成员)。
6. **派发受限类型集**:doc.consolidate/doc.drift/eval.journey/eval.contract/code-quality.simplify 五类型协议依赖暂缓技能 —— 模板入库但 M3 派发面封闭(看板呈现 + 引导外部会话/M4,双形态 SC7 语义);迁移项目含此五类存量任务时不阻断迁移(迁移只搬状态,派发受限是运行期约束)。
7. **校验契约移植**:ValidatePromptTemplates 形态(模板存在 + 非空 + 零值渲染 missingkey=error + frontmatter 变量交叉验证)→ M3 模板库完整性测试,对拍基准 = Go embed FS 文件集(21/15 清单为本报告 §2/§3)。
8. **Interface 4 关联**(非本 spike 门控但同源):task_type 推断规则(`infer.go`:.gate/.summary 后缀 → registry 模式 → doc-fix-/fix-/disc- 前缀)与 desc_path 合成由任务 1.4 摄取管线移植;category 映射(category.go)为 1.4 与 3.4 共用表。

---

## 7. 结论

模板移植面 = **`pkg/prompt/templates` 21 文件中 20 个入内核模板库**(19 类型协议 + fix-record-missed;gate/doc.summary 被 I5 机制取代不入库;doc.fix 引擎级缺模板须 3.4 新增,库成 21 文件);**`pkg/task/templates` 15 文件均非执行协议**(3 个 task-add fix 模板入 dsh tool 写通道模板面,12 个 autogen 管线模板 M4)。三要素映射定形:①类型协议 = 模板正文(task_type 路由 + surface 后缀回退);②目标摘要 = PhaseDetect/records 摘要 → stage_asset/stages 载体翻转;③生效偏好 = resolveCoverage/coverage 键 → prefs 三级解析(键集补 coverage.*)。task-executor 包装协议(六步 + 硬约束 + Pause Protocol + 追加行文案)并入预合成前导段,与模板库同归 3.4 定稿。execute-task/run-tasks 协议逐段由 dispatch 状态机/dispatch-launch/恢复派发/UI 吸收,零暂缺段;暂缓 20 技能仅 5 形态与移植面有依赖,M3 派发面相应封闭 5 类型,必迁 15 覆盖 M3 派发主类型全部协议委派。零 CLI 文案残留清单(缺口 4)随移植逐处改写。**3.4 可开工。**
