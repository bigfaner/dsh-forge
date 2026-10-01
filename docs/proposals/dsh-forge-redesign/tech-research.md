---
created: "2026-10-02"
author: "faner"
status: "Active"
intent: "tech-research"
---

<!-- 本文档 = 《架构基线》的技术预研配套：对上游 dsh 源码的核实结论、迁移方案、待验证 spike 清单。分工纪律（2026-10-02）：原型/UI 线归用户；本线只做架构设计与技术预研。 -->

# dsh-forge 技术预研笔记

> 上游唯一权威 = `Z:\project\github\deepseek-harness`（0.2.0-rc.2）。行号会漂移，按符号名复核。

## 1. 已核实机制（源码结论，非推测）

### 1.1 subagent 委托服务（`packages/subagent/subagent`）

- provider 注册表 + prompt 驱动；子代两种形态：one-shot / continuable；in-process 子继承父权限域（auto review），子代系统提示带 delegation-scope 声明（不可自我提权）。
- **请求面边界**（`subagent/src/types.ts`，`SubagentRequest`）：仅 `agentOptions?`（provider / model / reasoning effort 覆写）与 `toolFilter?`（工具收窄）。两个**负结论**：
  1. **无子代预设覆写**——子代只能继承父组合，dispatcher/executor 无法异构预设；
  2. **无超时参数**——旧 forge 的 30min 任务超时机制不提供，须 skill 层纪律 + interrupt 兜底。

### 1.2 Agent 预设与 persona（`packages/preset/*`）

- **预设 = 具名声明式组合**，决定 Agent 的工具、提示词段、技能（`agent-preset-registry/README.md`）。定义本体 = 普通插件行；新增/覆盖 = profile bundle patch（plugin_manager `insert` 一行 `@deepseek-ai/dsh-agent-preset`；本仓 forge-workbench `cordis.patch.yml` 为同机制先例）。
- **persona 行**（`packages/preset/persona`）：预设内注册 persona prefix/suffix 提示词段（shadow 全局默认）；`complete: true` 可使其成为唯一系统提示词；支持 `{{…}}` 模板变量。README 原话："Without this row, a preset could change an agent's tools but never its identity."
- **UI 面**（`packages/client/ui-agent-preset`）：设置「Agent 预设」管理页、新建会话 hero chip、会话头预设标签；切换 = 会话重组（`agent-preset/selected` 事件）。

### 1.3 组合继承（子代继承父预设）

- `packages/subagent/subagent-in-process-driver/tests/preset-inheritance.spec.ts`："a child runs on the preset its parent runs on"。dispatcher 会话跑 forge 预设 → executor 子代自动获得 forge tools、knowledge 提示词段、persona——稳定层零注入成本。

## 2. task-executor 迁移方案 v2：预设管稳定层，prompt 管动态层

> 修正记录：v1 方案（对话轮）断言「dsh 无具名 agent 机制、人格须 prompt 化」——不准确。预设 + persona 恢复了具名能力且更强（组合级而非仅人格级）；v1 担忧的「约束注入模板漂移」因人格进 persona 而消除。

| forge 3.x 组件 | v2 落点 |
|---|---|
| `agents/task-executor.md`（硬约束 + 执行协议人格） | 出厂 forge 预设的 **persona prefix** |
| executor 工具面 | 预设组合（plugin-forge + plugin-knowledge + 基础）；需收窄用 `toolFilter` |
| `forge prompt get-by-task-id`（类型策略合成） | forge 插件 tool `taskPrompt(taskId)`——**动态层**，分发 prompt 携带 |
| `commands/run-tasks.md`（分发循环） | forge 插件 skill；`subagent` 阻塞调用（`run_in_background: false`） |
| `forge task claim/add/status/submit` | state-layer API + forge 插件 tool（SC7 缝） |
| submit-task skill + quality gate 序列 | `taskSubmit` tool 内置 gate（compile→fmt→lint→test，插件逻辑） |
| fix-task 链（`--source-task-id --block-source`、完成自动恢复） | state-layer blockers 边 + 插件 submit 钩子 |
| `model: sonnet` | delegation `agentOptions` 或预设级模型选择设置 |
| Step 1 读项目知识（`docs/business-rules/` 等） | **知识插件召回 tool**（域过滤 + 置信度）——迁移最大增益点 |
| `memory: project` | 无直接等价物，由知识召回承接意图 |

链路：

```
run-tasks skill（forge 预设会话内）
  → taskClaim tool → state-layer
  → subagent(prompt = taskPrompt 策略块, agentOptions{model}, 阻塞)   ← 人格/工具/知识面由预设继承
       ├─ 执行策略（含 knowledge recall）
       ├─ taskSubmit tool（gate + record + blockers 恢复钩子）→ state-layer
       └─ git-commit skill
  → taskStatus 验证 → 循环 / fix-task（taskAdd + block 边）
```

已知取舍：dispatcher 与 executor **同构预设**（v1 接受——两者工具需求高度重叠，"executor 禁 claim"在旧 forge 本就是 prompt 约束而非工具面隔离；上游若日后支持子代预设覆写再异构化）。MAIN_SESSION 路由原样保留（dispatcher 主会话分支）。

## 3. 待验证清单（P1 spike 项，需实跑）

| # | 项 | 方法 | 判定 |
|---|---|---|---|
| S1 | 薄宿主 runProfile 直跑 | 全 npm 依赖写 ~100 行宿主入口（`loadProfileDirectory` + `runProfile` + `{url, injections}` IPC） | 失败 → fallback vendor desktop-host（总纲既定） |
| S2 | boot manifest 注入实跑 | 自有 vite 入口 + `dsh-client-web` 壳 + injections 掌舵 | ui-\* 运行期加载成功 |
| S3 | slot 洞位替换（路线 A） | 自有插件替换 `sidebar.workspaces` 占用者 | 原型左栏三件套可挂载 |
| S4 | workspace registry create 幂等 | 同 canonical path 两次 `create()` | 返回同一实体（上游文档语义） |
| S5 | 预设 patch 安装 | profile `insert` agent-preset 行（含 persona 行） | 新会话 hero chip 出现 forge 模式 |

（S1–S4 继承总纲 vendor 裁决与 P1 输入；S5 为预研新增。）

## 4. 动态提示词组装设计（taskPrompt，2026-10-02）

老 forge 机制（`forge-cli/pkg/prompt/prompt.go` 源码核实）：21 个类型模板（go:embed）+ `promptTemplateData`（11 字段，空串省略条件段）+ `Synthesize()` 纯函数合成 + `ValidatePromptTemplates()` 启动校验（类型↔模板一一对应、零值可执行抓拼写错）；executor 分发 prompt 仅一句 `Execute task <ID>`，策略自拉且中途可重拉恢复。

**新设计核心裁决：模板从「md 文件 + 运行时校验」升格为「TS 模板函数」**——字段拼写错编译期抓（防腐 L2）、条件段用原生 if、函数签名即 frontmatter 元数据、零引擎依赖；`satisfies Record<TaskType, Template>` exhaustive 路由强于老的对应性校验。组件：

- `PromptData` 接口（taskKey/taskFile/category/featureSlug/phaseSummary?/coverage?/surface?/complexity）；
- 每类型一个模板函数（`codingFix(d): string`），路由表 exhaustive；
- `synthesize(task, ctx)` 纯函数：`fixRecordMissed` 特殊路由覆盖 + `buildData`（PhaseDetect / resolveCoverage 注入）；
- `taskPrompt` tool（host 半身）：`stateStore.byKey` → `synthesize` → 返回策略文本；
- **executor 自拉保持**（恢复语义保真）；dispatcher 分发 prompt 仍一句 `Execute task <key>`。

上下文注入原则原样迁移：PhaseSummary 仅跨相位注入（相位 = 键约定 `feature/N.M` 的 N，完成状态查 state-layer）；coverage 三级优先（task payload > forge 配置 > 默认；cleanup/refactor 强制 maintain）。

不迁移的过渡 hack：`{{TASK_ID}}` 大写桥接、`TASK_CATEGORY` 后处理注入。改良：每类型快照测试（fixture 任务 → prompt 输出断言）；策略第一步由「读 docs/business-rules/ 目录」改为**知识召回指令**（组合继承使 executor 天然带召回 tool）；TASK_FILE 悬空容忍（对抗审核处置③）写入模板指示。边界：persona 的 `{{…}}` 变量属系统提示层（prompt registry），策略层组装不混用——人格归预设、策略归本设计。

## 版本历史

- 2026-10-02：新增 §4 动态提示词组装设计（taskPrompt：TS 模板函数 + exhaustive 路由 + 纯函数合成 + executor 自拉保真）。
- 2026-10-02：初版。subagent / preset / persona 机制核实（含两项负结论：无子代预设覆写、无超时）；task-executor 迁移方案 v2（预设管稳定层、prompt 管动态层）；spike 清单 S1–S5。
