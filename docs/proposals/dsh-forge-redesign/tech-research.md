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

### 1.2 Agent 预设与 persona（`packages/preset/*`，2026-10-02 源码重核）

**三层角色**（声明与运行彻底分离）：

- **registry 服务行** `@deepseek-ai/dsh-agent-preset-registry`（`index.ts`，TypertRemoteService，inject `loader`/`sessionProjections`）：config 仅 `default`（必填，部署默认）+ `selectedDefault`（volatile，用户经设置页改，**优先于 default**）；注册 `agentPreset` 会话投影。
- **声明行** `@deepseek-ai/dsh-agent-preset`（30 行纯载体）：config = `{id, name?, description?, order?, plugins[]}`；`Service.init` 即 `agentPresets.register(config)`，无任何自有逻辑。
- **挂载内部**（`mount.ts`）：每条声明**急切激活**——registry 专属 scope 内建内存 Loader 树（`PresetTree extends EntryTree`，`write()` 空操作：**定义不落盘，持久化只属 profile 编辑器**）→ 行审计（import 失败 / 激活失败 / 等待服务三态）→ **root 域服务泄漏检查**（preset 服务必须 isolate realm，泄漏即拒绝挂载）→ 世代（Generation）入册。profile 兼容策略先于挂载：被拒插件 mounts disabled，审计读作「有意停用」而非失败。

**修订与复用**：声明更新/删除 → 旧世代 retired；活 Agent、子代、历史读**持引用继续用旧树**，引用计数清零才真正 dispose（"existing Agents retain the composition they already use"）。挂载失败是 final，但定义保持 roster 可见（`broken` 诊断行）；已挂树的 pending 行（等 Host 服务）在 Host Loader 树 settle 后**每次读取重审计**——启动顺序不决定成败。

**绑定与继承**：Agent setup → `mount(ctx, id?)` → retain 当前世代（引用计数）→ `bindScopeParent`：Agent scope 父链挂到世代 standing key，**父链即可见性**（预设树不在 Agent fiber 之下，`standingMountFor` 按父链反查）。子代 `composeFrom`：join 父代**精确修订**（非按 id 重解析——父预设热更后子代仍用旧世代）；子代已有绑定即 throw。`serviceForAgent` 按同一关系取「该 Agent 的预设内服务实例」。

**会话切换锁与日志重建**：`select` Remote **仅 blank session 可用**（turnBoundary 投影：无开放回合且零历史回合，否则 `agent-preset/locked`「This session has already started」）——**预设选择在首轮后平台级锁死**。切换 = recompose（重绑 + `tools/change`）+ 追加 `agent-preset/selected` 会话事件（per-agent 串行化）。重建读 `agentPreset` 投影而非 header：创建 header 是 deep-frozen 起始事实，blank 期选择以事件覆盖；"model-visible ⟺ logged" 规则——预设决定模型看到的 tool schemas 与提示词段，故必须入日志。重启恢复按 id 取**当前**定义；定义缺失 reject。

**出厂实现形态**（`packages/bundle/web-app`）：`cordis.patch.yml` 插 registry 行（`default: standard`）；`presets/{standard,ptc,minimal,cordis}.patch.yml` 各插一行 preset 声明（`package.json` 的 `dsh.bundle.patch` 排序）。`plugins` 列表 = 完整 cordis entry list，`standard` 定义实证：persona 行（prefix/suffix 模板变量 `{{model}}`/`{{cwd}}`）、agent-instructions、工具行（支持 `disabled: !!js process.platform === 'win32'` 平台条件）、`cordis:group` 嵌套组（`group: true` + isolate realm：planMode / compaction / delegation 全家——subagent spawn/fork、workflow-ptc、ralph disabled 等）。**Web 编辑器保存 = profile patch 按 row id 覆写 `config.plugins`**（用户编辑优先于出厂行）。出厂四 id（`standard`/`ptc`/`minimal`/`cordis`）显示文案走 locale 字典（`presetStandardName`…，中文即「标准模式」「PTC 模式」）；自带 `name` 的用户声明不翻译（`name ?? id` 兜底，`display.ts`）。

**技能绑定通道**（`packages/skill/skill-filesystem/src/index.ts` 源码核实）：技能**不随插件挂载自动注册**——组合内须有 `@deepseek-ai/dsh-skill-filesystem` 行，其配置决定技能目录集：
- `customSkillDirs`（rank 300）：显式目录列表；`cordis` 预设实证——`!!js` 表达式解析 `@deepseek-ai/dsh-agent-preset` 包的 `skills/` 目录接入组合；
- 默认根（`includeDefaultRoots: true` 默认开）：项目根（git 根定位）`.dsh/skills`（100）/ `.agents/skills`（200）+ 用户根 `$DSH_HOME/skills`（默认 `~/.dsh`，400）/ `$DSH_AGENTS_HOME/skills`（默认 `~/.agents`，500）+ **bundled 根 `$DSH_BUNDLED_SKILL_DIR`（app 级技能通道）**——用户根与 bundled 根均可经宿主环境变量重定向，**对所有挂默认根的组合全局生效**；
- rank 决胜同名（数值小者优先）；frontmatter 携带 invocation 策略（`disable-model-invocation` / `user-invocable`）；chokidar watch 目录热更新。

**预设绑定 tool 与 skill 均为组合级**：tool = 插件行进出 `plugins` 列表（standard vs cordis 实证：cordis 多 `tool-cordis` 行）；skill = `skill-filesystem` 行的目录集差异（cordis 接 creator 技能、standard 只用默认根）。另有 per-spawn `toolFilter`（继承组合内的运行时工具收窄，§1.1）。

**persona 行**（`packages/preset/persona`）：预设组合内注册 persona prefix/suffix 提示词段（shadow 全局默认）；`complete: true` 可使其成为唯一系统提示词；支持 `{{…}}` 模板变量。README 原话："Without this row, a preset could change an agent's tools but never its identity." 必须挂 agent scope（组合内）——全局挂载与 prompt registry 的 persona 注册冲突，fail loud。

**UI 面**（`packages/client/ui-agent-preset`）：设置「Agent 预设」管理页、新建会话 hero chip、会话头预设标签。

### 1.3 组合继承（子代继承父预设）

- `packages/subagent/subagent-in-process-driver/tests/preset-inheritance.spec.ts`："a child runs on the preset its parent runs on"。dispatcher 会话跑 forge 预设 → executor 子代自动获得 forge tools、knowledge 提示词段、persona——稳定层零注入成本。

### 1.4 能力扩展体系（插件之外，2026-10-02 核实）

> 全量配置手册已独立成册：**《dsh 扩展体系参考》**（`dsh-extensions.md`，含各体系配置示例）。此处仅留结论索引：

- **①技能目录**（filesystem skills）：五类根（项目 `.dsh`/`.agents` 100/200、custom 300、用户 `$DSH_HOME`/`$DSH_AGENTS_HOME` 400/500、bundled）+ rank 决胜。**标准模式加技能 = 把 `<name>/SKILL.md` 丢进项目或用户根**——零插件零 patch，watch 热更新。人类命令（`ctx.commands`）只能插件注册；`user-invocable` 技能即文件系统侧用户可调面。
- **②AGENTS.md 链**（`dsh-agent-instructions`，dsh-base 默认含）：用户全局 + 项目链（宽→窄 + `.local` 叠加 + 同容去重）注入 durable 基线消息。
- **③MCP**（`dsh-mcp-client` 配置行）：stdio / streamable-http，工具名 `mcp__<server>__<tool>`。
- **④hooks 兼容桥**（`dsh-hooks-claude-code`/`-codex`）：指向既有 `hooks.json`，可阻断/附上下文/强制续轮。
- **⑤预设与 persona**（声明式数据行）：§1.2/§5.6。
- **⑥profile patch 与设置面**：按 row id patch 任意行 config + volatile 字段。
- **⑦外部 agent provider**：`subagent-codex`/`-claude-code`/`-acp` 组合行翻开关。

**对 forge 产品的意义**：①用于 §5.5（brainstorm 全局根通道）；②是「项目约定注入」现成载体（观察项）；③④正交；⑤⑥⑦ = §5 模式预设迁移的机制底座。

## 2. task-executor 迁移方案 v3：派发前一次性合成完整 dispatch prompt（2026-10-02 修订）

> 演进记录：v1（对话轮）「人格 prompt 化」→ v2「人格进预设 persona」→ **v3 合并稳定/动态层（定稿）**。v3 动机之一是 v2 的隐性缺陷：**组合继承使 dispatcher 与 executor 共享 persona**（负结论①），而 task-executor 约束「FORBIDDEN: forge task claim」与 dispatcher 的核心动作 taskClaim 直接冲突——executor 特有约束不能放在共享系统层。dsh 请求面无 per-spawn 系统提示注入（负结论②），prompt 参数是唯一差异化通道。**定稿裁决：task-executor 不采用预设身份**——executor 是动态派发的匿名子代理，其全部行为规格 = 派发前综合动态信息合成的 dispatch prompt。（出厂预设形态后经 §5 修正：纯环境单预设 → 远征/突击双预设，persona 复入但只限作风层；executor 角色规格仍唯一来自 dispatch prompt，本裁决实质不变。）

| forge 3.x 组件 | v3 落点 |
|---|---|
| `agents/task-executor.md`（硬约束 + 执行协议人格） | **dispatch prompt 的约束块**（单一来源 TS 模块，synthesize 前置拼接） |
| executor 工具面 | 预设组合（plugin-forge + plugin-knowledge + 基础）；需收窄用 `toolFilter` |
| `forge prompt get-by-task-id`（类型策略合成） | **并入 `taskClaim` 返回值**（`dispatchPrompt` 随 claim 一起返回，合成内聚于 claim 流程；**独立 taskPrompt tool 取消**——简报持久在子会话不丢失，恢复由 dispatcher 外环承担） |
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
  → taskClaim tool → state-layer（返回值携带 dispatchPrompt = 约束块 + 动态信息块 + 策略块）
  │    ① executorConstraints（迁移自 task-executor.md 硬约束/错误分诊/暂停协议）
  │    ② 动态信息块：state-layer 实时取数——TASK_ID/FILE/TYPE/CATEGORY、
  │       BLOCKERS 依赖现状快照（新增，老 forge 无）、PHASE_SUMMARY（跨相位）、
  │       COVERAGE（三级优先）、SURFACE/COMPLEXITY、KNOWLEDGE_DOMAIN（项目默认召回域）
  │    ③ 类型策略块（TS 模板函数）
  → subagent(prompt = dispatchPrompt, agentOptions{model}, 阻塞)   ← 匿名子代理，动态派发
       ├─ 执行策略（含 knowledge recall，域参数来自 ②）
       ├─ taskSubmit tool（gate + record + blockers 恢复钩子）→ state-layer
       ├─ git-commit skill
  → taskStatus 验证 → 循环 / fix-task（taskAdd + block 边）
    恢复唯一出口 = dispatcher 外环：record 缺失 → 重派（按当前状态重新合成简报，优于重拉旧文本）
```

已知取舍：约束块从系统提示降为初始 prompt——dsh 两个负结论下的**唯一差异化通道**，约束标记（`<EXTREMELY-IMPORTANT>` 等）原样保留以补偿位置弱化；合成单点（约束块 + 策略模板同函数族）杜绝模板漂移；dispatch prompt 整体落入子代持久会话日志，审计原子性优于分散记录。老 6 步执行协议简化为 4 步（Validate 拉取步消失：Initialize 并入、Execute/Submit/Commit/Done）。MAIN_SESSION 路由原样保留（dispatcher 主会话分支）。

## 3. 待验证清单（P1 spike 项，需实跑）

| # | 项 | 方法 | 判定 |
|---|---|---|---|
| S1 | 薄宿主 runProfile 直跑 | 全 npm 依赖写 ~100 行宿主入口（`loadProfileDirectory` + `runProfile` + `{url, injections}` IPC） | 失败 → fallback vendor desktop-host（总纲既定） |
| S2 | boot manifest 注入实跑 | 自有 vite 入口 + `dsh-client-web` 壳 + injections 掌舵 | ui-\* 运行期加载成功 |
| S3 | slot 洞位替换（路线 A） | 自有插件替换 `sidebar.workspaces` 占用者 | 原型左栏三件套可挂载 |
| S4 | workspace registry create 幂等 | 同 canonical path 两次 `create()` | 返回同一实体（上游文档语义） |
| S5 | 预设 patch 安装 | profile `insert` 双 agent-preset 行（远征/突击，各含 persona 行与差异化 plugins 列表）+ registry `default` 覆写 | hero chip 双模式出现，默认选中远征 |
| S6 | 标准模式技能注入通道 | 宿主环境变量重定向（`DSH_BUNDLED_SKILL_DIR` vs `DSH_HOME`）指向产品技能根；与 customSkillDirs 并存场景 | standard 会话技能目录含 brainstorm；跨根同名 rank 去重呈现符合预期 |

（S1–S4 继承总纲 vendor 裁决与 P1 输入；S5 为预研新增。）

## 4. 动态提示词组装设计（2026-10-02）

老 forge 机制（`forge-cli/pkg/prompt/prompt.go` 源码核实）：21 个类型模板（go:embed）+ `promptTemplateData`（11 字段，空串省略条件段）+ `Synthesize()` 纯函数合成 + `ValidatePromptTemplates()` 启动校验（类型↔模板一一对应、零值可执行抓拼写错）；executor 分发 prompt 仅一句 `Execute task <ID>`，策略自拉且中途可重拉恢复。

**新设计核心裁决：模板从「md 文件 + 运行时校验」升格为「TS 模板函数」**——字段拼写错编译期抓（防腐 L2）、条件段用原生 if、函数签名即 frontmatter 元数据、零引擎依赖；`satisfies Record<TaskType, Template>` exhaustive 路由强于老的对应性校验。组件：

- `PromptData` 接口（taskKey/taskFile/category/featureSlug/phaseSummary?/coverage?/surface?/complexity，**v3 增：blockers 快照 / knowledgeDomain**）；
- 每类型一个模板函数（`codingFix(d): string`），路由表 exhaustive；
- `synthesize(task, ctx)` 纯函数：`buildData`（PhaseDetect / resolveCoverage 注入）+ 模板渲染（`fixRecordMissed` 路由取消，见下）；
- **合成内聚于 `taskClaim`**（v3 定稿后）：claim 返回值携带 `dispatchPrompt = executorConstraints + synthesize(task, ctx)`，dispatcher 拿到即派发——**独立 `taskPrompt` tool 取消**：完整简报作为初始 prompt 持久落入子会话日志，不会丢失；恢复唯一出口 = dispatcher 外环（record 缺失重派按**当前状态重新合成**，优于重拉旧文本），fix-record 简报为 run-tasks skill 内置静态文本（单一模板、非类型路由）。

上下文注入原则原样迁移：PhaseSummary 仅跨相位注入（相位 = 键约定 `feature/N.M` 的 N，完成状态查 state-layer）；coverage 三级优先（task payload > forge 配置 > 默认；cleanup/refactor 强制 maintain）。

不迁移的过渡 hack：`{{TASK_ID}}` 大写桥接、`TASK_CATEGORY` 后处理注入。改良：每类型快照测试（fixture 任务 → prompt 输出断言）；策略第一步由「读 docs/business-rules/ 目录」改为**知识召回指令**（组合继承使 executor 天然带召回 tool）；TASK_FILE 悬空容忍（对抗审核处置③）写入模板指示。边界：persona 的 `{{…}}` 变量属系统提示层（prompt registry），策略层组装不混用——人格归预设、策略归本设计。

## 5. 模式预设迁移：远征 / 突击（2026-10-02）

旧 forge 的模式 = 管线路由开关（`/quick` 命令 vs 完整管线入口），语义散落在命令逻辑、manifest `mode:` 字段、SKIP_EVAL_GATE 任务上下文注入、知识抽取规则的 mode 上下文里。dsh Agent 预设（§1.2）给出更干净的物理形态：**模式 = 会话级预设**，新建会话时经 hero chip 选定（UI 已内建），一会话一模式，与「一会话一功能」纪律同构。且这是**平台级保证而非纪律**：`select` 的 blank-session 锁（§1.2）使首轮后预设不可切换，升级 = 开新会话（工件在盘上自然续接）；恢复/分叉会话按 `agentPreset` 投影重建同款组合，模式随会话存活。

### 5.1 命名

| 旧名 | 新显示名 | 机器值 |
|---|---|---|
| full 模式 | 远征模式 | `expedition` |
| quick 模式 | 突击模式 | `blitz` |

远征 ↔ 突击，军事对仗：远征 = 全装长途战役（辎重齐备、步步为营——PRD/设计/契约/测试脚本），突击 = 短促突击（集中兵力直奔要害——proposal 直达任务执行）。突击减的是**仪式**（规格文档流程），不减**纪律**（任务表、单写路径、执行记录、提交规范、验证门原样）——是精确打击，不是乱拳猛攻。规模语义同构：突击只适合小目标，目标膨胀 → 建议转入远征（新会话续跑，工件在盘上衔接）。

### 5.2 组合定义（出厂双预设）

| 预设 | plugins | persona（作风示意） |
|---|---|---|
| 远征模式（出厂默认） | plugin-brainstorm + plugin-forge + **plugin-forge-spec** + plugin-knowledge + persona 行 + skill-filesystem 行（customSkillDirs = brainstorm/forge/forge-spec/knowledge 技能目录） | 严谨、全流程、不跳步、证据驱动 |
| 突击模式 | plugin-brainstorm + plugin-forge + plugin-knowledge + persona 行 + skill-filesystem 行（customSkillDirs = brainstorm/forge/knowledge 技能目录） | 短促突击、直奔要害、单写路径纪律不折扣 |

（示意列——完整定义 = 镜像 `standard` 基础行 + forge 增量行，见下方备注③。）

- registry `default` 出厂指向远征；用户可经 UI 改（`selectedDefault` 易失字段，README 语义）。
- **forge 插件按模式切两包**：`plugin-forge`（管线核心，双模式共用：quick-tasks / run-tasks / fix 链 / submit-task / git 纪律 / run-tests / consolidate-specs；brainstorm 已提取，见 §5.5）+ `plugin-forge-spec`（规格深化，仅远征组合：write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks / eval 幸存者）。动机 = 防腐 L1：**物理边界优于提示词纪律**——突击会话字面上无法调用 write-prd，而非「被叮嘱不要」；副产收益 = 突击会话省下规格技能清单 token。此切分不违总纲「插件切分 = 管理便利，非可替换机制」：模式是同一产品的两种节奏，非场景替换。最终技能归置由插件工程线（总纲 P1 并行轨）细化，本节定切分原则。
- **技能暴露的物理载体 = `skill-filesystem` 行的 `customSkillDirs`**（§1.2：技能不随插件挂载自动注册，cordis 预设同款模式）——L1 边界在技能侧同样落在该行配置：突击组合的目录集不含 plugin-forge-spec 的 skills/。默认根保持开启（项目/用户技能目录照常可用）。
- 模式 prose（入口路由、升级规则）写进 persona prefix——预设组合内挂 `dsh-persona` 行即载体，无需自制模式插件。
- ③ 双预设定义 = 完整 cordis entry list（镜像 `standard` 基础行：工具 / plan-mode / compaction / delegation 组 + forge 增量行）——上游基础行演进属契约面跟踪（总纲 P1 交付物），机械 diff 检测漂移。

### 5.3 与 §2 v3 的相容（persona 撰写铁律）

v3 裁决「executor 不采用预设身份」针对**角色身份**，维持不变；本节将出厂预设从「纯环境（无 persona）」修正为「双模式预设（含 persona）」。相容性由一条铁律保证：

> **persona 只谈作风，不谈角色与工具禁令。**

组合继承（§1.3）下 executor 子代继承模式 persona：远征 executor 严谨、突击 executor 迅捷——继承不再是 v2 时代的矛盾源，而是模式作风对执行粒度的自然延伸。角色与任务规格仍唯一来自 dispatch prompt（§2/§4）；任何「FORBIDDEN: …」式规则禁止写入 persona。已知代价：远征 executor 子代背负规格技能清单的 token 开销（技能目录行量级，每行一句描述）——组合继承的既定取舍，换取稳定层零注入。

### 5.4 模式的两处解耦

1. **会话节奏 ≠ 功能溯源**：preset = 会话节奏（新建时选定）；manifest `mode: expedition|blitz` = 功能溯源事实（quick-tasks / breakdown-tasks 写入），下游消费（run-tasks、consolidate-specs 漂移模式、eval 门豁免、知识抽取 mode 上下文）**一律读 manifest 不读预设**——远征会话打开旧的突击功能，整数 ID / 无 stage-gate / eval 豁免照旧生效。
2. **确认门 ≠ 模式**：`auto.runTasks.quick/full` 自动跑闸门属 forge 配置（→ dsh-forge 偏好面），随迁移原样保留，与预设正交。

### 5.5 brainstorm 三模式共享（跨预设技能，2026-10-02 增补）

需求：brainstorm 供**标准模式（dsh 出厂）、突击、远征**三模式使用。裁决：

- **提取为独立最小技能工件 `plugin-brainstorm`**（从 plugin-forge 管线核心移出）。依据：《架构基线》§4 沉淀判据两条同时命中——第三类真实消费者出现（标准模式 = 非 forge 组合）、零耦合全契约（brainstorm 纯文档读写 + 提问，不依赖 state-layer / knowledge）。这是版图中第一个按判据（而非预设计）沉淀出的共享技能工件。
- **远征/突击**：组合内 skill-filesystem 行的 `customSkillDirs` 指向其包内 `skills/`（§5.2，cordis 预设先例）。
- **标准模式零 patch**：standard 组合的 skill-filesystem 行用默认根（无 customSkillDirs）——**用户根 / bundled 根是全局通道**（§1.4 ①）：宿主经环境变量（`DSH_BUNDLED_SKILL_DIR` 或 `DSH_HOME` 重定向）把 brainstorm 所在目录设为产品技能根，所有挂默认根的组合自动获得。宿主拥有进程环境（host-profile 目录隔离为先例），不触碰用户字面 home、不 patch preset-standard、不背「覆写替换整表 + 上游漂移」代价。
- 已知取舍：跨根同名技能按 rank 决胜（custom 300 优先于 user 400）——远征/突击下 customSkillDirs 版本胜出，标准模式下走全局根版本，内容同源无分叉；目录呈现与去重语义入 S6 验证。

### 5.6 出厂双预设完整示例（profile patch YAML，2026-10-02 增补）

> 格式严格镜像上游 `packages/bundle/web-app/presets/*.patch.yml`（§1.2 已核实的机制与方言）。最小骨架 = README 两行（registry 行 + 一行 preset 声明）；以下是产品级完整形态。包名 `@dsh-forge/*` 为示意（P1 定名）；安装形态 = profile `node_modules`（本仓 host-profile 先例）。`baseUrl` 为 loader 提供的解析基（§1.2 activate 的 `ctx.extend({ baseUrl })`）。

```yaml
# ══ forge profile cordis.patch.yml：registry 默认覆写 ══════════════════════
# 按 row id patch（非 insert）——覆盖 web-app 出厂行的 default: standard
- id: agent-preset-registry
  config:
    default: expedition          # 用户经设置页改 selectedDefault（volatile，优先于此）

# ══ 远征模式（presets/expedition.patch.yml）════════════════════════════════
- insert:
    - id: preset-expedition
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: expedition
        name: 远征模式            # 自带 name → 不走 locale 字典，显示名直出（§1.2 display.ts）
        description: 完整 SDD 管线：proposal → PRD → 设计 → 契约 → 任务 → 执行
        order: 1                 # hero chip 排序（order 升序，其次 id）
        plugins:
          # ── persona（铁律：只谈作风，不谈角色与工具禁令，§5.3）─────────
          #    角色规格归 dispatch prompt；「FORBIDDEN: …」式规则禁止出现在此
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: >-
                You are a coding agent powered by the {{model}} model.
                严谨、全流程、不跳步、证据驱动；规格先行，验收标准先于实现；
                每一步留下可核查的记录。
              suffix: Your working directory is {{cwd}}.
          # ── 镜像 standard 的基础行（§5.2 ③：完整清单 = 上游 standard.patch.yml，
          #    此处示样两行；上游演进经契约面清单 + 机械 diff 跟踪）─────────
          - id: agent-instructions
            name: '@deepseek-ai/dsh-agent-instructions'
            config:
              maxBytes: 65536
          - id: tool-pwsh
            name: '@deepseek-ai/dsh-tool-pwsh'
            disabled: !!js process.platform !== 'win32'
          # ……（tool-bash / tool-fs / tool-fs-search / tool-jobs /
          #      plan-mode 组 / compaction 组 / delegation 组 /
          #      tool-ask-user / tool-todo / tool-web / present：同 standard）
          # ── 技能暴露（§5.2：L1 边界的物理载体 = 此行配置）───────────────
          - id: skill-filesystem
            name: '@deepseek-ai/dsh-skill-filesystem'
            config:              # 默认根保持开启（includeDefaultRoots 默认 true）
              customSkillDirs:
                - !!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@dsh-forge/plugin-brainstorm/package.json')), 'skills')
                # ……（plugin-forge / plugin-forge-spec / plugin-knowledge 同式）
          - id: tool-skill
            name: '@deepseek-ai/dsh-tool-skill'
          # ── forge 增量行 ────────────────────────────────────────────────
          - id: plugin-forge
            name: '@dsh-forge/plugin-forge'
          - id: plugin-forge-spec      # 仅远征（L1：突击物理不可见）
            name: '@dsh-forge/plugin-forge-spec'
          - id: plugin-knowledge
            name: '@dsh-forge/plugin-knowledge'

# ══ 突击模式（presets/blitz.patch.yml）：与远征仅三处差异 ═════════════════
#   ① persona prefix 换突击作风（短促突击、直奔要害、单写路径纪律不折扣）
#   ② plugins 删 plugin-forge-spec 行
#   ③ customSkillDirs 删 plugin-forge-spec 目录（规格技能物理隔离）
#   id: blitz / name: 突击模式 / description: proposal 直达任务执行 / order: 2
```

配套语义（全部 §1.2 已核实）：

- **用户编辑优先**：Web 编辑器保存 = profile patch 按 row id（如 `preset-expedition`）覆写 `config.plugins`，**替换整表**——用户改造不丢，但也不与出厂行自动合并。
- **显示名**：自带 `name` 的声明不走 locale 字典（`isBuiltInPreset` 判定 name 为空才算出厂内置）——中文显示名「远征模式/突击模式」直出，无需翻译通道。
- **blank 锁**：两预设均受 `select` 的 blank-session 锁约束——首轮后不可切换（§5 平台保证）。
- **S5/S6 判定物**：此 YAML 即两个 spike 的实施底稿——S5 验证 insert + registry default patch 实跑，S6 验证 customSkillDirs 表达式与全局根并存。

## 版本历史

- 2026-10-02：扩展体系独立成册——《dsh 扩展体系参考》（`dsh-extensions.md`）：各体系配置示例详解（技能三配置方式/AGENTS.md 链/MCP 双传输与字段表/hooks 事件表/预设/persona/patch/provider/长尾/forge 映射）；§1.4 收缩为结论索引 + 指针。
- 2026-10-02：新增 §1.4 能力扩展体系（插件之外）——①技能目录五类根全表（标准模式加技能答案：SKILL.md 丢项目/用户根，零插件零 patch 热更新；人类命令只能插件注册，user-invocable 技能即文件系统侧用户可调面）；②AGENTS.md 指令链；③MCP 配置行；④hooks 兼容桥；⑤预设/persona 数据行；⑥profile patch 与设置面；⑦外部 agent provider；长尾与 forge 关联。
- 2026-10-02：新增 §5.6 出厂双预设完整示例（profile patch YAML）——registry default 按 row id patch 覆写；远征全量形态（persona 铁律示样 / 镜像 standard 基础行省略号 / skill-filesystem customSkillDirs 表达式 / forge 增量行）；突击三处差异；配套语义（用户编辑整表覆写、自带 name 绕过 locale 字典、blank 锁）；即 S5/S6 实施底稿。
- 2026-10-02：新增 §5.5 brainstorm 三模式共享——提取为独立最小技能工件 `plugin-brainstorm`（沉淀判据双命中：第三类消费者 + 零耦合）；远征/突击经 customSkillDirs，标准模式**零 patch**走默认根全局通道（宿主环境变量 `DSH_BUNDLED_SKILL_DIR`/`DSH_HOME`）；§1.2 补技能绑定通道（技能不随插件自动注册；customSkillDirs/默认根/rank 决胜/bundled 根）；§5.2 补 skill-filesystem 行为技能暴露物理载体 + 完整定义镜像 standard 基础行备注；新增 S6 spike。
- 2026-10-02：轻装模式更名**突击模式**（机器值 `light` → `blitz`）；§5 补平台级保证（`select` blank-session 锁使「一会话一模式」由机制强制，恢复/分叉按 `agentPreset` 投影重建组合）。§1.2 全文重写为预设机制「原理与实现」（源码重核：registry/声明行/挂载三层角色、Generation 修订与引用计数、bindScopeParent 绑定、composeFrom 精确修订继承、blank 锁与日志重建、bundle/web-app 出厂 patch 形态、standard 定义实证、locale 显示解析）。
- 2026-10-02：新增 §5 模式预设迁移——full/quick 升格为出厂双预设：远征模式（`expedition`，默认）/ 轻装模式（`light`）；forge 插件切核心/规格两包（防腐 L1：轻装会话物理隔离规格技能）；persona 撰写铁律（只谈作风不谈角色与工具禁令）保 §2 v3 相容；manifest `mode` 保留为功能溯源（与会话预设解耦）；S5 扩为双预设验证。
- 2026-10-02：取消 taskPrompt tool——合成内聚于 `taskClaim` 返回值（dispatchPrompt 随 claim 返回，dispatcher 拿到即派发）；简报作为初始 prompt 持久在子会话不丢失，恢复唯一出口 = dispatcher 外环（重派按当前状态重新合成）；fix-record 简报改由 skill 内置静态文本，synthesize 去掉 fixRecordMissed 路由。
- 2026-10-02：v3 定稿——task-executor **不采用预设身份**：出厂 forge 预设 = 纯环境定义（不配 persona 行），executor = 动态派发的匿名子代理，行为规格全部来自派发前合成的 dispatch prompt；动态信息块强化（blockers 现状快照、knowledgeDomain 注入）。
- 2026-10-02：v3 修订——合并稳定/动态层：dispatcher 派发前一次性合成完整 dispatch prompt（约束块 + 策略）；修复 v2 隐性矛盾（组合继承下 persona 共享导致 dispatcher 背上 executor 的 claim 禁令）；预设退回纯环境，persona 行可选；§4 同步改为预拉 + 重拉恢复。
- 2026-10-02：新增 §4 动态提示词组装设计（taskPrompt：TS 模板函数 + exhaustive 路由 + 纯函数合成 + executor 自拉保真）。
- 2026-10-02：初版。subagent / preset / persona 机制核实（含两项负结论：无子代预设覆写、无超时）；task-executor 迁移方案 v2（预设管稳定层、prompt 管动态层）；spike 清单 S1–S5。
