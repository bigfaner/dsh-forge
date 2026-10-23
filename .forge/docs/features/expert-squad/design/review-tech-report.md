---
created: 2026-10-22
reviewed: tech-design.md（§13 已核销决策抽查）· 复审 2026-10-22（B1/Q1/Q2 核销）· 三审 2026-10-22（B2/Q4 核销）
verdict: 三审 v5（B2 修复核销）——Blocker 0，放行 breakdown-tasks
---

# 技术方案评审报告：expert-squad tech-design

评审依据：tech-design.md（本目录）对照 proposal.md（裁决正本）、prd-spec、user-stories、ui-functions、ui-design v2；官方 checkout `Z:\project\github\deepseek-harness` 抽验 6 处；annotutor 实证指南 `Z:\project\dsh\annotutor\docs\dsh-plugin-dev-guide.md`。

## 1. 方案优雅与可行

**总体判断：干净。** 模块边界按数据流单向分层（store → registry → tools/routes；client 只依赖 fetch 路由），依赖全部指向官方服务键且明令禁 `ctx.reflect.get`（§5），与 AGENTS 1.1/1.2 纪律一致。AD4「插件只交生档案、拼接归使用方」是正确的职责切分——把编排语义推出中立层，插件零派发词汇。fail-loud 取用契约（AD1：不存在/禁用均抛业务错）单点化了降级判断，比返回标记方案契约面小，自洽。D4 的「官方 storage 无工作区隔离 → key 前缀」回退路径在核销记录内闭环。client 构建配方逐条对得上官方正本：`packages/client/tsdown.client.ts` 实存，cjs 产物（L442、L483）+ `window.__ModuleLoader__.load({id, factory})` 自注册（L3、L619）+ `PLATFORM_MODULES` 外置（L21、L419），与 annotutor 实证的「自注册 cjs + react 永不内联 + apply 导出」三契约吻合。

## 2. 上游一致性

- **插件零派发**：§1/§12/架构图均无派发边，与 proposal §2.4「v2 收窄」零冲突。✓
- **三层来源与遮蔽**：AD3 定序 project > user > plugin 内置、`origin` 回落判定，与 proposal §2.5 通用缝 2 一致。✓
- **HR 部署侧**：§14 AC1 行「HR = 部署侧 preset 绑定该 tool 面」与 proposal §2.3「插件不感知 HR」一致。✓
- **字段定稿——发现缺失**：见 Q1（`SKILL 引用` 字段被静默丢弃）。
- **Coverage Map**：AC1–8 逐条有设计元素，US1–US15 有归属面（§6 时序 + §8 数据模型 + §9 错误处理 + 已批 ui-design），双向核对无孤儿。US15 快照语义在 §6 失败分支明确兑现（「返回上代完整索引快照」）。✓

## 3. 官方缝核销抽查（§13 D1–D4，抽验 6 处）

| 抽验点 | 设计引用 | 实际证据 | 判定 |
|---|---|---|---|
| D1 tool 注册 scope | `core/tools/src/index.ts:1057-1063` | `packages/core/tools/src/index.ts:1057-1063`：「Register globally or in the calling agent scope. Scoped tools shadow globals」文档句 + register 实现逐字吻合 | ✓ 属实 |
| D2 forwarded 缝先例 | `ui-plugin-manager/client/index.ts:88-91` | `packages/client/ui-plugin-manager/src/client/index.ts:88-91`：`ctx.remote.$on('plugin-manager/changed'…)` + `ctx.on('connection/reset', refresh)` 逐行吻合 | ✓ 属实 |
| D2 事件表 | 「packages/api/remotes forwarded 事件表登记一行」 | `packages/api/remotes/src/remote-events.ts:42` 有 `plugin-manager/changed` 行，README.md:56 明示该表是「single control point」 | 表实存，但归属见 **B1** |
| D3 三层 root | `skill-filesystem/src/index.ts:245-265` | `packages/skill/skill-filesystem/src/index.ts:245-265`：`roots()` 中 project `.dsh/skills`（findProjectRoot 向上解析）、`customSkillDirs`、user `dshHome/skills`、`bundledSkillDir` 四类 root 与设计映射同构 | ✓ 属实 |
| D4 canonical cwd | `workspace/src/entity.ts:122-143` | `packages/workspace/workspace/src/entity.ts:122-143`：`realpathNormalize(header.cwd)` 校验判据逐行吻合 | ✓ 属实 |
| D4 storage 无工作区隔离 | 「domain 全局、table 按 id 键控」 | `packages/storage/storage-domain/README.md:34-58`：`defineDomain` 全局名 + `table().put(id, …)` 键控，无 workspace 作用域 | ✓ 属实 |

另抽验：`ctx.connection.fetch.register` 数据通道正门在官方有先例（`packages/api/session-controller/src/media-references.ts:70`）且 annotutor gotcha 实证 rpc.handle/webServer 不可达——§6 路由通道选择可信。

**证据行号全部属实，结论可信；但 D2 的装配归属与 §12 改动范围矛盾，见 B1。**

## 4. 可实现性（breakdown 就绪度）

§5 目录逐文件可拆任务；§7 接口面（服务键四方法 + tool 面 4 工具 + fetch 路由族）完整；§10 四层测试策略（单测负向 / 契约镜像 / 装载守卫四断言 / 真机结算门）可执行且与 AGENTS 质量门、外部依赖取证纪律吻合。除 B1 外无拆解障碍。

## 分级清单

### Blocker

- **B1｜D2 装配归属与「零改制官方包」自相矛盾，且本 host 可用性未核销**。tech-design §12 声明「不改：官方 deepseek-harness 包（零改制）」，但 D2 要求在 `packages/api/remotes` forwarded 事件表「登记一行」——该表在官方 checkout 内且 README 明示它是唯一的转发事件控制点（`packages/api/remotes/README.md:56`、`src/remote-events.ts`）；dsh-forge 工作区自身无该包副本（`packages/` 下无 remotes，全仓 grep 无 `remote-events`），登记行只能落在官方 npm pin 包源码内，二者不可同真。且 dsh-forge 本 host（apps/host）实测无任何 `ctx.remote.$on` 消费面——D2 的可用前提「本应用事件表有此行」在本 host 从未被核销，设计只核销了官方 app 内的先例。设计须二选一并改文：① 把「本 host 转发事件登记」明确列入 §11/§12 改动范围（属 host 应用装配层，给出落点文件与扩展机制），client 事件缝为主；② 承认本 host 无此缝，fetch 即时 + 5s 轻轮询升为主方案，forwarded 缝降为可移植性增强。当前文本两头都占，breakdown 无法落任务。

### Question

- **Q1｜档案字段 `SKILL 引用` 被静默丢弃**。proposal §2.1 与 PRD 功能规格 1 的字段定稿均含 `SKILL`（技能引用，区别于 `skills` 标签）；tech-design §8 数据模型与 §7 `ExpertRecord` 只有 `skills: string[]`，无 SKILL 引用字段，且无弃选记录。是有意收窄（建议回写 proposal/PRD 保持正本一致）还是遗漏？须裁决。
- **Q2｜D4 的 canonicalWorkspacePath 运行期取值点未钉死**。`realpathNormalize(cwd)` 的 cwd 在 host 半从何处读：宿主进程 cwd？还是随会话/工作区上下文取？若一个 desktop 进程可服务多个工作区记录（官方 workspace 服务即按多记录建模），host 全局前缀键会把 A 工作区的禁用泄漏到 B。另外官方 workspace 服务已持久化 canonical path 记录，是否直接复用其身份而非自行 realpathNormalize——更省且同源。须在设计中钉死取值点。

### Note

- N1｜§13 证据路径为 checkout 相对简写（如 `core/tools/...`），实际均在 `packages/` 下——行号全部核实无误，建议补全路径前缀免后人重找。
- N2｜§9「storage 不可用 → 内存态降级」是对官方 storage 栈的 fail-soft，与 AD1 取用契约的 fail-loud 分属两面（启停偏好非派发正确性），语义不冲突；建议在 FMEA 行内加一句「仅 UI 偏好可降、取用契约不降」防误读。
- N3｜`experts/changed` 事件命名与官方 `plugin-manager/changed` 同构（`<域>/changed`），词汇一致性好，保持。

## 放行结论

**不放行 breakdown-tasks。** Blocker 1 项（B1：D2 装配归属矛盾）须返工 tech-design 后重评；Q1、Q2 随返工一并裁决。B1 清零且 Q1/Q2 有裁决即放行。核销证据本身（D1/D3/D4 及 D2 的官方先例行号）抽验全部属实，返工面限于 D2 的装配归属与 §11/§12 改动范围对齐。

## 复审（2026-10-22，B1/Q1/Q2 修复核销）

### 上轮问题逐条核销

| 项 | 修复落点 | 复核证据 | 判定 |
|---|---|---|---|
| B1 | §13 D2 改判「fetch 即时 + 5s 轻轮询兜底（主案）」，forwarded 缝弃选留痕 | §6「跨面联动」与 §13 D2 口径一致（轮询主案 + 弃选理由：allowlist 表在官方 pin 包内不可改制、本 host 实测无 `ctx.remote.$on` 消费面）；§12「不改官方 deepseek-harness 包（零改制）」矛盾消除；弃选留痕保留了官方缝先例行号（`remote-events.ts:16-48`）与重评条件 | ✓ 清零 |
| Q1 | §8 增「字段弃选记录」；proposal §2.1 与 prd-spec 功能规格 1 同步 | proposal §2.1「`SKILL` 引用弃选——官方无 per-expert 技能注入缝，技能搭配指引归使用方 systemPrompt.section，弃选记录见 tech-design §8」；prd-spec 功能规格 1 同句式弃选注明；三处理由同源（官方无注入缝），tech-design §8 与 §7 `ExpertRecord` 均无 SKILL 字段——正本三处一致 | ✓ 清零 |
| Q2 | §13 D4 取值点钉死：tool 面 = 调用 agent scope cwd；fetch 路由 = client 显式携带 `workspace` 参数 + zod 门 | 双取值点消除了「进程级 cwd 串域」路径（Q2 原风险直击）；canonical 判据仍锚定 `workspace/src/entity.ts:122-143` 同语义 | ✓ 钉死（见 Q3 来源修正） |

### 修复引入的一致性核对（无新矛盾）

- proposal §2.1 / prd-spec / tech-design §7-§8 字段清单三处对齐：`name/description/title/tools/skills/model` + SKILL 弃选注明同源，无残留 `SKILL` 引用字段。
- D2 弃选后 §2 架构图、§5 模块、§10 测试策略均无 forwarded 残留依赖；5s 轮询与 PRD 目标 2「热刷新 ≤ 5s」量级一致。
- AD2 key `<origin>：<name>` × D4 前缀 `disabled/<canonicalWorkspacePath>/<expertId>` 与 proposal §2.5「禁用状态按 origin + 档案键隔离存储」无冲突。

### 新增 Question

- **Q3｜D4 的 client 侧 workspace 取值来源表述与官方源码不符**。tech-design §13 D4 写「client 从宿主 boot 上下文取」——官方 boot 注入线（`window.__DSH_BOOT__` / `WebBootEntry`，`packages/client/modules/src`）经 grep 全文无任何 workspace/cwd 字段，boot 图不携带工作区路径。官方正缝实为 **workspace-controller 的 client 侧**：`@deepseek-ai/dsh-api-workspace-controller/client` 的 `WorkspaceView.path` / WorkspaceSnapshot（`packages/api/workspace-controller/src/feed.ts:26`，ui-workspace/ui-layout 均经此取 path）。D4 的机制（client 显式携带 + zod 门）本身成立，仅取值来源需一行改钉为该 client store（多工作区时取当前选中工作区，语义与 Q2 钉死意图一致）。不改任务结构，一行改文即可清零。

### 复审放行结论

**有条件放行。** B1/Q1/Q2 核销全部清零，字段清单三处一致，无结构性新矛盾；新 Q3 为 D4 内一行取值来源改文（boot 上下文 → workspace-controller client store），不动架构与任务图。Q3 回钉后即可进入 breakdown-tasks。

## 复审 v4（2026-10-22，委派双通道变更）

复审面：双通道变更内部自洽（组装内核单点/两通道边界/§5 dispatch/*/§7 expert_dispatch/§6 双时序/Coverage Map）、与 proposal 双通道表述零冲突、`startContinuable` 可行性抽验、breakdown 就绪度。官方抽验基座：`packages/subagent/subagent/src/types.ts`、`src/continuation.ts:104`、`src/index.ts:261`、`tool-subagent/README.md:91`。

### 双通道变更自洽核对

- **AD4 组装内核单点**：`dispatch/compose.ts` 单一实现 + 《取用 API 契约》承载同一映射语义（persona 全文/toolFilter/model→agentOptions），通道一直调内核、通道二按契约自行组装——与 proposal §2.4「通道二零插件代码（使用方直接消费取用 API）」对读，「共用」= 单点实现 + 同一契约语义，非跨包 import，解释自洽。✓
- **两通道边界**：§1/§2 架构图/§5 模块/§7 工具面口径一致（通道一 = expert_dispatch 经正门；通道二 = inject `experts` 服务键）；§12「未触及」判据更新为「仅消费 `startContinuable` 正门，不 import 服务本体」，与架构图单调用边吻合。✓
- **上游零冲突**：proposal §2.1 派发映射/§2.4 委派分工/§2.5 通用缝 2/§5 验收 1/6/7 与 tech-design §1/§6/§7/§14 逐条对读，无残留「插件不派发」表述。prd-spec 范围/功能规格 5 双通道化一致；user-stories US4/US5（通道一委派+续聊）、US8（通道二+组装内核共用）恢复到位，Coverage Map 行 1/2/6/7 已更新映射。✓
- **上轮 Q3 清零**：D4 取值来源已改钉 workspace-controller client store（`WorkspaceView.path`）并留痕「`__DSH_BOOT__` 无 workspace 字段」，与复审建议一致。✓

### `expert_dispatch` 经 `startContinuable` 可行性抽验

| 设计断言 | 官方证据 | 判定 |
|---|---|---|
| `ctx.subagents.startContinuable` 正门存在 | `subagent/src/index.ts:261` → `continuation.ts:104`，`startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart>` | ✓ |
| persona 子 scope `deployment:persona-prefix`、遮蔽部署 persona、非完整提示词 | `types.ts:193-200`（"scoped `deployment:persona-prefix` section … SHADOWING the deployment's persona"） | ✓ |
| toolFilter = 子 scope `tools.restrict` 创建窗口、随 descriptor 持久化 | `types.ts:185-192`（"scoped `tools.restrict()` in the child's creation window … vanish from prompt AND refuse to execute"） | ✓ |
| model → `agentOptions` | `types.ts:163-171` + `core/agent/src/runtime-types.ts:26`（`AgentOptions{provider?,model?,…}`，in-process 合并于父选项） | ✓ |
| 组装内核入参出参形态 | `ContinuableStartSpec.request = Omit<SubagentStartRequest,'label'\|'signal'\|'outputSchema'>`（`types.ts:47`），persona/toolFilter/agentOptions/prompt/parent 全可承载；档案禁裸 `{{` 与 persona 的严格 `{{…}}` 插值语义（`types.ts:198-199`）互洽 | ✓ |
| §6 时序「`SUB-->>T: 子会话成果` → `T-->>U: 成果回显`」 | **不符**：`startContinuable` 在 inbox 接受时即结算，仅返回 `{childId, messageId}`，"neither waits for nor collects a result"（`types.ts:52-58`、`tool-subagent/README.md:91`）——见 **B2** | ✗ |

### 新增 Blocker

- **B2｜§6 通道一时序的「成果回显」与 `startContinuable` 结算语义不符，回显机制未钉死**。设计把「子会话成果」画成 `startContinuable` 的同步返回（§6 时序 `SUB-->>T: 子会话成果`），但官方契约是该调用在 inbox 接受点结算、不等待不收集结果（`continuation.ts:104`、`types.ts:52-58`、`tool-subagent/README.md:91`）——continuable 子会话没有 run/result 通道，成果不可能经该返回值到达委派工具。且回显机制是 US4/US5（成果回显会话流、追问续聊）与验收 1 的承重行为，breakdown 无法在机制未钉时拆 `dispatch.ts` 任务。返工面（不动架构与任务图）：二选一钉死后改 §6 时序、§5 `dispatch.ts` 职责句、§10 补回显/续聊用例——① 插件观察官方 `subagent/end` 事件（`SubagentRunEndInfo.lastAssistantMessage`，`types.ts:100-117`，注明 continuable Activation epoch 共用该载荷）relay 进主会话流；② dispatch 工具返回 `ContinuableStart`（childId/label）即结算，成果呈现与追问续聊走官方 `dsh-tool-subagent-control`（`send_message`/`interrupt_agent`，proposal §2.4 已钉此为追问/中断依赖）。附 Note N4 一并落。

### 新增 Question

- **Q4｜user-stories US14 残留 v3 表述，与双通道裁决冲突**。US14 Then 句「向其要委派时明确告知**委派归使用方应用（经取用 API），非 HR/插件职责**」——「非插件职责」是「插件不派发」版本残留，与通道一（插件自带 `expert_dispatch`）、prd-spec 功能规格 5、proposal §2.3 行为 4 直接冲突（「HR 无委派工具」本身无冲突，冲突仅在括注句）。上游一行改文（如改「主会话委派走通道一委派工具；代码式委派归使用方应用」），不涉 tech-design 结构。

### 新增 Note

- N4｜`ContinuableStartSpec.provider` 字段（`types.ts:34`）未在设计钉值：proposal 只钉死 in-process 路线，spawn/fork 均合法——组装内核需显式选定（建议钉 `spawn` 并留 fork 弃选理由），随 B2 一并落 §5。
- N5｜§9 FMEA 无派发专属行：`startContinuable` 的类型化拒绝（capability 不符、`ACTIVATION_LIMIT_REACHED`、未知 toolFilter 名 fail-loud）建议补一行「派发被官方服务拒绝 → 业务错透传至委派工具 output，不静默」，与 AD1 fail-loud 语义同源。
- N6｜AD4「两通道共用组装内核」措辞对「内核是否被使用方 import」有歧义空间，建议在《取用 API 契约》首段写明「共用 = 单点实现 + 同一映射契约，通道二零插件代码」（proposal §2.4 正解），防后人误读为跨包导出。

### v4 放行结论

**不放行 breakdown-tasks（1 Blocker）。** B2（成果回显机制与 `startContinuable` 结算语义冲突）须返工钉死机制后重评；Q4 为上游 user-stories 一行残留改文，随返工一并裁决。B2 清零且 Q4 有裁决即放行。双通道变更的其余面（内核单点、通道边界、§5/§7/§12/Coverage Map、proposal 零冲突、`startContinuable` 各字段映射可行性）抽验全部通过。

## 三审（2026-10-22，B2/Q4 修复核销）

### 上轮问题逐条核销

| 项 | 修复落点 | 复核证据 | 判定 |
|---|---|---|---|
| B2 | §6 通道一时序重画（工具返回即结算）+ §5 `dispatch.ts` 职责句同步 + §10 补「接受点结算返回 childId」用例 | §6 时序：`SUB-->>T: { childId, messageId }（接受点即结算）`、工具返回「已派发 + childId + 追问指引」落入会话流、成果经官方子会话记录可见、追问经 `dsh-tool-subagent-control send_message`（回复回会话流 · continuation 同上下文）、`subagent/end` 监听标注「纯 UI 不进会话流」——与 v4 判例引用的官方契约（`types.ts:52-58`、`continuation.ts:104`、`tool-subagent/README.md:91`）完全对齐；抽验新断言：`ContinuableStart { childId, messageId }` 属实（`subagent/src/types.ts:53-57`）、`send_message` 为 continuable 子会话续聊正门（`tool-subagent-control/src/index.ts:29,78`，one-shot 子会话不可续与 continuable 路线互洽）、`subagent/end` 事件与 `lastAssistantMessage` 载荷属实且设计已不承重于它（`types.ts:98,116`）；§5 L79 `dispatch.ts` 注释「startContinuable 接受点结算：返回 childId；subagent/end 监听仅驱动面板状态」与时序同口径；§10 单元用例新增「接受点结算返回 childId」 | ✓ 清零 |
| Q4 | user-stories US14 Then 收窄 | US14 L91 改为「向其要委派时明确告知委派通道（主会话对专家说任务，或使用方经取用 API）」——「委派归使用方应用、非插件职责」v3 残留消除，与通道一（插件自带 `expert_dispatch`）及 prd-spec 功能规格 7「无委派工具」零冲突 | ✓ 清零 |

### 上游同步核对

- user-stories US4 Then（L29）：「委派即返回 childId，成果经子会话记录可见，追问经 send_message 同上下文续聊（回复回会话流）」——与 §6 时序逐点一致。✓
- prd-spec 功能规格 5 通道一（L81）同口径；范围节通道一描述一致。✓
- **残留（验收措辞级，非 Blocker）**：三处 v2 版「成果回显」表述未随方案②回写——① proposal §2.3 行为 4「成果回显会话流」；② proposal §5 验收 1「成果回显会话流」；③ prd-spec 业务流程图 J 节点「执行 · 成果回主会话/使用方」（另 US4 When 句「执行并回显成果」为叙事性残留）。按新机制，主会话流拿到的是「已派发 + childId」工具结果，成果在官方子会话记录、追问回复回会话流——上述措辞与实际行为有出入，属上游正本措辞同步问题（改文即可，如「委派即返回 childId，成果经子会话记录可见」），不动任务结构与技术设计，记 **N7** 随下一轮上游编辑一并回写。
- 上轮 Note 跟踪：N4（`provider` 字段钉值）与 N5（FMEA 派发拒绝行）未见落入 §5/§9——均为非阻塞改进建议，保持留档；N7 并入跟踪。

### 三审核销结论

**放行 breakdown-tasks。** Blocker 0（B2 清零）、Question 0（Q4 清零）；B2 修复未引入技术设计内新矛盾，残留仅为上游 proposal/PRD 三处「成果回显」验收措辞级同步（N7），不阻塞拆解。裁决清单：N4（provider 钉值）、N5（FMEA 派发行）、N7（上游措辞回写）留档随实现/上游编辑处理。
