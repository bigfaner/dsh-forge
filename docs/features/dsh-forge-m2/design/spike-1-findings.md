# Spike 1 Findings: dsh 插件机制承载 forge 管线语义等价性 + DF004/导航槽位/FORGE_ACTOR 侦察

> 任务:1.1(SC8)· 日期:2026-09-22 · 对应 tech-design §Open Questions 四项 + Interface 5/6
> 纪律:dsh 侧结论以本仓 vendored 树 `packages/desktop-host-vendor/vendored`(`vendor/upstream.lock.json` pinnedSha `c36ba648`,desktopHostVersion `0.1.6-alpha.2`)为唯一权威;forge 侧结论以 `Z:\project\ai\forge`(HEAD `644321da`,forge-cli v5.21.0+19,工作树干净)源码为准。以下每条结论附源码引用(符号/文件:行)。本任务纯侦察,无产品代码落地。

## 0. 侦察范围与方法

- **dsh 上游(vendored)**:`apps/desktop-host`(宿主启动链)、`packages/bundle/base` + `bundle/web-app`(desktop profile 装配层)、`packages/api/{session-controller,remotes,gateway}`(会话 API 面)、`packages/client/{ui-layout,ui-sidebar,ui-plugin-manager,ui-workspace,ui-conversation,ui-deliverables}`(客户端 UI/服务面)、`packages/skill/*`、`packages/hooks/*`、`packages/subagent/*`、`packages/extensions/cordis-client-runner`(生成式 slot 目录)。
- **forge CLI**:`internal/cmd/task/*`、`pkg/task/*`、`pkg/prompt/*`、`plugins/forge/*`(技能/hooks/子代理载荷)。
- **双半身形态参照**:本仓 `packages/plugins/hello-world`(client 半身 `ctx.slots.register` + host 半身空 `apply`)。
- desktop profile 装配事实:`apps/desktop/resources/plugin-bundles.json` = `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`;宿主经 `loadProfileDirectory('dsh', …)` + `runProfile({ profile: 'desktop', … })` 拉起(`apps/desktop-host/src/index.ts:24-40`),profile 树 = 空 root 之上逐层 patch(bundle 层 → 用户 cordis.patch.yml)(`apps/cli/src/profile-boot.ts:1-10`、`packages/boot/app-boot/src/profile.ts:85-91`)——**插件 host 半身与宿主服务同进程同一 cordis 应用**。

---

## 1. 语义等价性(Q1):forge 管线四要素逐项结论

| 管线要素 | 结论 | 承载机制 | 关键降级点 |
|---|---|---|---|
| skill 指令流 | **等价(可承载)** | ① 任务 prompt 全文注入会话(§2);② dsh 原生 skill 系统承载 SKILL.md 同构文件 | 技能寻址名 `forge:<name>` 带插件限定 vs dsh kebab-case 扁平名——需项目侧技能播种(两条零上游改动路径,§1.1) |
| hook | **降级(可承载,desktop profile 默认未装配)** | `hooks-claude-code` 桥原样运行 CC 插件 hooks(SessionStart/Stop/SessionEnd/SubagentStart/Stop 全覆盖 forge 事件面) | 桥仅 `apps/cli` 依赖,base/web-app 均未装配;config 为进程级单文件,per-session 发现是上游 TODO(§1.2) |
| subagent/task-executor | **降级(行为等价)** | M2 形态 = workbench 直注入主会话(prompt 全文携带执行协议);会话内委派 = dsh 原生 `ctx.subagents`(Task 工具) | CC 子代理「定义文件」形态(`.claude/agents/*.md`)无 dsh 原生对应;执行协议改由 prompt 文本承载(§1.3) |
| manifest/任务文件 | **等价** | 纯数据文件,agent 运行时无关;host 半身 = 标准 cordis 节点半身(Node 全能力)spawn forge CLI + 文件 SoT 纪律 | 无(§1.4) |

**总结论:四要素无「不可行」项,无「待定」项。** M2 核心闭环(任务发起 → prompt 注入 → agent 执行 forge CLI → submit → 文件回流)只依赖 prompt 注入通道(§2,等价)、CLI spawn 与文件感知(host 半身 Node 能力,等价);降级项均为外围自动化(hook 的质量门/清理、子代理定义文件形态),不落在 M2 核心路径上。

### 1.1 skill 指令流 —— 等价,带名称限定降级点

**forge 侧形态**:技能 = forge 仓 `plugins/forge/skills/<name>/SKILL.md`(21 个,含 `submit-task`/`git-commit` 等;`git-commit` 实为 slash command,`plugins/forge/commands/git-commit.md`),以 Claude Code 插件形态分发(`.claude-plugin/marketplace.json`,plugin v3.0.1);任务 prompt 输出明确指示执行侧调用 `Skill(forge:submit-task)` / `Skill(forge:git-commit)`(coding-feature 模板)。

**dsh 侧承载面(三件,全部已装配于 base bundle)**:

1. **指令流本体 = prompt 注入**:任务 prompt 原文(§4.3 契约)经会话 prompt 通道成为首条用户消息——与 CC 形态(`/run-tasks` 派发 → task-executor 自跑 `forge prompt get-by-task-id`)语义同源,通道见 §2。
2. **原生 skill 系统**:`skill-filesystem` provider 扫描 `join(projectRoot,'.dsh/skills')`(rank 100)、`join(projectRoot,'.agents/skills')`(rank 200)、`~/.dsh/skills`、`~/.agents/skills`、`customSkillDirs`(`packages/skill/skill-filesystem/src/index.ts:250-258`);frontmatter 解析 `name`/`description` 字符串字段(同文件 :805-815)——**与 Claude Code SKILL.md 文件形态同构**。
3. **模型面 Skill 工具**:`tool-skill` = "model-facing `skill` loader tool"(`packages/skill/tool-skill/src/index.ts:1-19`);base bundle 装配行 `skill`/`skill-filesystem`/`tool-skill`(`packages/bundle/base/cordis.patch.yml:280-291`)。

**降级点(名称限定)**:dsh 技能名文法 `^[a-z0-9]+(?:-[a-z0-9]+)*$`(`packages/skill/skill/src/index.ts:21`)不含 `forge:` 插件限定——prompt 文本中的 `Skill(forge:submit-task)` 不能按原名寻址。两条零上游改动的承载路径:

- (i) **项目侧播种**:host 半身把 forge 技能物化/链接到注册项目 `.agents/skills/submit-task/SKILL.md` 等(dsh 原生扫描,PROJECT_AGENTS_RANK=200);
- (ii) **配置路径**:用户层 patch 给 `skill-filesystem` 行加 `customSkillDirs` 指向 forge 仓 `plugins/forge/skills` 根(Config 字段,`skill-filesystem/src/index.ts:61-62`)。

会话 agent 按扁平名(`submit-task`)在技能目录中解析;是否需在注入 prompt 后附加一行名称映射说明(prompt 原文 100% 注入纪律不破坏——原文不改写,仅追加),交 4.x prompt 契约任务定形。

### 1.2 hook —— 降级:桥存在,desktop profile 默认未装配

**forge 侧形态**:CC 插件 hooks(`plugins/forge/hooks/hooks.json`):`SessionStart`/`SubagentStart` → guide 注入 additionalContext;`SessionEnd`/`SubagentStop` → `forge cleanup`;`Stop` → `forge quality-gate` + `forge feature complete --if-done`;无 PreToolUse。

**dsh 承载面**:`hooks-claude-code` = "Bridge for unmodified Claude Code command hooks… It supports SessionStart, prompt/tool pre/post, Stop, and subagent start/stop"(`packages/hooks/hooks-claude-code/src/index.ts:1-10`)——**forge 用到的全部 hook 事件类型桥均有对应扩展点**;config 读 `hooks.json` 或含 `hooks` 键的 settings 文件,支持 `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}` 替换(:44-77)。

**可用性判定**:

- 桥包在安装闭包内(`apps/cli/package.json:57` 依赖 `@deepseek-ai/dsh-hooks-claude-code`),但 `packages/bundle/base` 与 `bundle/web-app` 的 cordis.patch.yml 均**无此行**(grep 零命中)→ desktop profile(base+web-app)默认**不装配**;
- 可经用户层 profile patch 增行装配(包经安装模块回退可解析:`packages/boot/app-boot/src/profile.ts:85-91` ProfileResolutionEntry 机制);
- **进程级约束**:configPath 为进程级、load 时读一次,注释明示 per-session 发现为 `TODO(per-session-hook-config)`(`hooks-claude-code/src/index.ts:46-50`)——多项目工作台下全部会话共享一份 hooks 配置。

**M2 结论**:核心闭环不依赖 hook(质量门/清理是外围自动化);hook 承载列为**可选装配**(降级),不阻塞 M2,如装配经 profile patch + 全局 configPath 落地。

### 1.3 subagent/task-executor —— 降级:行为等价,定义文件形态不迁移

**forge 侧形态**:`plugins/forge/agents/task-executor.md`(frontmatter `name/model/memory/inputs`);"薄执行"协议 = 自跑 `forge prompt get-by-task-id` → 执行 → `Skill(forge:submit-task)` + `Skill(forge:git-commit)` → `DONE:`/`PAUSE:` 行;由 `/run-tasks` 经 `Agent(subagent_type="forge:task-executor", …)` 派发。

**dsh 承载面**:

- 原生子代理系统:`ctx.subagents` = named-provider registry + `start`/`startContinuable`/`sendMessage`(`packages/subagent/subagent/src/index.ts:1-30`);模型面 `tool-subagent` = "Model-facing delegation through one configured `ctx.subagents` provider… one-shot calls own a plain Task"(`packages/subagent/tool-subagent/src/index.ts:1-9`);providers `subagent-spawn-in-process`/`-fork-in-process` base 已装配(`packages/bundle/base/cordis.patch.yml:335-357`)。
- **无定义文件形态**:dsh agent presets 是 cordis.yml 插件集组合(`packages/preset/agent-presets/src/*`),不是 `.md` agent 定义扫描——CC 子代理定义文件无原生对应。

**M2 形态判定**:发起链 = workbench 从任务卡片发起会话 + prompt 直注入主会话——**workbench 本身取代 `/run-tasks` 派发器角色**;task-executor 的「薄执行」语义由 prompt 全文承载(prompt 输出即完整执行编排指令,与 task-executor 自跑同一命令的产物相同)——行为等价达成。会话内如需并行委派,dsh 原生 Task 工具可用。降级点仅「定义文件形态」不迁移(执行协议内容已由 prompt 承载,无功能损失)。

### 1.4 manifest/任务文件 —— 等价

- forge 数据面(`docs/features/<slug>/{manifest.md, tasks/index.json, tasks/<file>.md, tasks/records/<id>.md, tasks/process/{state,record}.json}`、`.forge/state.json`)与 agent 运行时完全解耦——唯一交互面 = forge CLI,且有机器可读输出惯例(claim → stdout `ACTION: CLAIMED…` block;submit `--json` 单行 JSON)。
- host 半身 = 标准 cordis 节点半身,Node 全能力;**直注 host 服务的双半身先例**:`ui-deliverables` node half `inject = ['systemPrompt','connection','sessionQuery','sessionController','workspaceFiles','fs','sandboxPolicy','workspaceChanges']`(`packages/client/ui-deliverables/src/index.ts:14`)——spawn 子进程、文件读取/watch 均为普通 Node 能力,无 dsh 机制依赖。等价,无降级。

---

## 2. DF004 会话发起通道(Q2):可用性矩阵

| 序 | 候选(Interface 5 候选序) | 判定 | 依据 |
|---|---|---|---|
| 1 | host 半身经宿主 cordis 服务创建会话 | **可用(M2 采用)** | `sessionController` 为 host Context 服务(`packages/api/session-controller/src/index.ts:64-67`);`@Remote('create') create(SessionCreateRequest)`(:244-247)、`@Remote('prompt') prompt(SessionPromptRequest, signal)`(:346-349);web-app bundle 装配该行(`packages/bundle/web-app/cordis.patch.yml:102-103`),desktop profile = base+web-app → 宿主进程内必在;**双半身直注先例**:ui-deliverables 注入 `sessionController` 并直调(`packages/client/ui-deliverables/src/index.ts:14`、`present-open.ts:79`) |
| 2 | client 半身经渲染进程内 cordis 服务 | **可用(备选)** | `ctx.remote` 生成命名空间(`packages/api/gateway/src/client/index.ts:124-129`);实调先例 `ctx.remote.session.modelCatalog()`(`packages/client/ui-model-selection/src/client/catalog.ts:45`);会话对象层 `ClientSessions.create()`(`packages/api/session-controller/src/client/sessions/service.ts:445`)、`session.prompt([{type:'text',text}],'queue')`(`packages/client/ui-conversation/src/client/service.ts:211`) |
| 3 | fallback:剪贴板 + 前置主窗 + toast(M1 冻结形态) | **可用(兜底)** | M1 先例 `apps/desktop/src/main/session-focus/index.ts:42-63`;外部通道(URL hash/postMessage/deep-link)M1 spike-3 已证不可用,不重复侦察 |

### 2.1 prompt 注入语义(SC3 对齐)

`SessionCommandController.prompt`(`packages/api/session-controller/src/commands.ts:299-371`):content parts → `createUserMessage({ content, source: { kind: 'user', rpcId } })` → queue 模式 `agent.followup(message)`(:360-361)——**注入即成为会话持久化用户消息**,SC3「会话首条用户消息包含 `forge prompt get-by-task-id` 完整输出」由该通道直接达成;`requestId` 调用方铸造、重复提交幂等(:306 `hasPromptRequest` 短路)。

`create` 语义(`commands.ts:87-121`):`workspaceId` XOR `cwd`(两者同传拒绝 :88-89);**cwd-only 合法**(`workspace?.path ?? request.cwd ?? this.defaultCwd` :97);`sessionId` 可调用方铸造(幂等 adopt);仅在显式 `workspaceId` 时 `workspace.attachSession`(:113-121)。

### 2.2 会话定位升级(取代 M1 冻结 fallback 与 localStorage poke)

- M1 spike-3 录得的 `dsh.sessions.current` localStorage poke:该键 = ui-workspace 选择 store 的持久化(`createSnapshotStore({}, { persist: { name: 'dsh.sessions.current' } })`,`packages/client/ui-workspace/src/client/navigation.ts:107-109`)——仅 boot 期读取,运行期写它不生效。
- **运行期正道**:`uiWorkspace` 为 client Context 服务(`UiWorkspaceService` 经 `super(ctx,'uiWorkspace')` 注册,navigation.ts:124;Context 声明 :86-91),`openSession(target)` = "Select a Session and show its Conversation as one UI navigation action"(:161-163,`replaceMain`)。
- **M2 定位通道定形**:发起回传 sessionId 后由 client 半身调用 `ctx.uiWorkspace.openSession(sessionId)` 切会话视图;M1「前置 + toast」降为异常兜底;**poke 不再需要**(候选增强关闭)。

### 2.3 M2 采用与降级链

- **主通道 = 候选 1**:host 半身 `SessionLaunchService.launch` → `ctx.sessionController.create({ cwd: <project.codeRoot> })` → `prompt({ requestId, sessionId, mode: 'queue', content: [{type:'text', text: promptText}] }, signal)`——进程内调用,零外部通道(Interface 5「最优」判据满足,Layer Placement 落位一致);定位 = client 半身 `uiWorkspace.openSession`。
- **降级链**:候选 1 →(服务不可注入/宿主未就绪 `ERR_HOST_NOT_READY`)→ 候选 2(client 半身 `ctx.remote.session` 同语义)→(连接不可用 `ERR_SESSION_CHANNEL_UNAVAILABLE`)→ 候选 3 剪贴板 + 前置 + toast。
- **≤3s 预算**:候选 1/2 分别为进程内调用与本地 HTTP RPC,发起链(→ sessionId 回传)毫秒级;预算主体是会话首 turn 模型响应,与通道无关。

### 2.4 遗留细节(交 4.x 任务,不改变通道裁决)

- **cwd-only 会话的侧栏归组**:`create` 仅显式 workspaceId 时 attachSession(commands.ts:113-121)——workbench 以 cwd 发起时会话在侧栏 workspace 浏览中的归组行为需实测;备选 = 先经 `ctx.workspaces` 解析/创建项目 workspace 再以 `workspaceId` 发起。
- **标题**:base 装配 `session-title-first-prompt-llm`,按首 prompt 生成标题——注入即得任务相关标题,无需额外处理。

---

## 3. 上游导航槽位(Q3):存在,契约定形

**结论:上游 SPA 存在可注入的顶级导航槽位,且为生成式编译期契约背书。D3 首选路径(上游导航槽位优先)成立;插件内自绘 rail 保留为兜底。**

### 3.1 槽位对与注册契约(name/id/order/key/children)

顶级导航注入 = **两槽位一次注册**(`ctx.slots.inject` 为 arrival-order 声明,目标未到静默等待——基座 spike 已证):

1. **`main`(keyed,root scope)** —— 中央面板承载槽:`{ kind: 'keyed'; scope: 'root' }`(`packages/client/ui-layout/src/client/index.ts:66`);"Central panel selected by sidebar entry id. The reserved `conversation` key hosts the Conversation; other keys receive no Session binding"。register 必填 `key`(fresh key = 新增一格,不与 shipped 冲突);生成目录条目 `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts:1544-1585`:keyDomain "open: any string the owner dispatches",occupants = ui-conversation(`conversation`)+ ui-plugin-manager,fresh-key 无替换风险。
2. **`sidebar.panellist`(list,root scope)** —— 全局面板导航行:`{ kind: 'list'; scope: 'root' }`(`packages/client/ui-sidebar/src/client/contract/slots.ts:34`);"Global panel icons. Each list id addresses the matching main panel"。register options:**`id`(必填,fresh id = 加列于既有项旁)/ `order`(可选,升序,默认 0)/ `label`(可选 string|thunk,locale 感知)**;生成目录条目 `slot-catalog.ts:2509-2555`(occupant 先例 = ui-plugin-manager PluginsPanelIcon,replaceRisk: none)。

**逐字先例**(上游 ui-plugin-manager,`packages/client/ui-plugin-manager/src/client/index.ts:47,82-99`):

```ts
export const PANEL_ID = 'plugins' as MainPanelId
ctx.slots.inject('main', () => ctx.slots.register({
  name: 'main', key: PANEL_ID, locale: NS,
  inject: () => controller.inject(configLedger),
  children: { /* 插件自身子槽 */ },
}, PluginManagerPage))
ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
  name: 'sidebar.panellist', id: PANEL_ID, order: 0,
  label: () => t('panel'), locale: NS,
}, PluginsPanelIcon))
```

- **children 契约**:main 槽注册可同时声明子槽(plugin-manager 声明 `plugins.item`/`plugins.bundle.config`/`plugins.row.config`)——workbench 视图内部挂点(节点卡/侧板/面板)同机制。
- **选择面**:`ctx.layout.selectPanel(panelId | null)`(`packages/client/ui-layout/src/client/service.ts:68-74`;未注册 id throw);panel 存活集 = main 槽 entries 的 key 集合(`ui-layout/src/client/index.ts:137-140` `retainMainPanels`);`null` = 回会话视图。

### 3.2 渲染与装配事实

- 侧栏导航按钮由 ui-sidebar 从槽位注册流同步派生:`entriesOfSlot('sidebar.panellist')` → `{id, order, label}` 排序(`packages/client/ui-sidebar/src/client/index.ts:50-63`)→ `SidebarRoot` 渲染 `<nav>` 行(`SidebarRoot.tsx:253-255`),点击经注入的 `selectPanel` 切换。
- desktop profile 浏览器花名册含 `ui-layout`/`ui-sidebar`/`ui-plugin-manager`/`ui-conversation` 等(`packages/bundle/web-app/cordis.patch.yml:207-208` 及其后)——槽位与先例在桌面应用运行时全部在场。
- **稳定性背书**:slot-catalog 为生成式编译期契约("The compile-time contract of the shipped web bundle's slot surface",`slot-catalog.ts:1-13`,由 `verify-client-catalog` freshness-gate)——槽位面受上游 CI 机器校验,非口头约定。

### 3.3 D3 落定

- **首选路径成立**:forge-workbench client 半身注册 `main` 槽 fresh key(建议 `'workbench'`)+ `sidebar.panellist` 同 id 图标行(order 取非 0 避让 `plugins` 的 0,建议 10),与「会话/Plugins」并列于全局面板导航区。
- 插件内自绘 slim rail 保留为兜底形态(上游槽位契约在版本升级中变动时启用);ui-design 两形态行为契约不受影响。

---

## 4. FORGE_ACTOR 透传(Q4):可行,覆盖面 = submit 记录

### 4.1 forge 侧最小改造可行性 —— 可行(限定 submit)

**事实基线(forge 侦察)**:

- forge「执行记录」= 每次执行**一个完整 markdown 文件** `docs/features/<slug>/tasks/records/<id>.md`,submit 时一次写就(`internal/cmd/task/submit.go` `writeRecordFile` → `pkg/task/record.go` `RenderRecord` 按 6 类模板渲染);**claim/transition 只写 `tasks/index.json`,不产生记录产物**(`claim.go`/`transition.go` 仅 `SetTask` + `SaveIndexAtomic`)。
- 记录输入 JSON 无 schema 严格校验(`pkg/task/submit_io.go` 裸 `json.Unmarshal`,全仓无 `DisallowUnknownFields`);**记录 .md 无任何 CLI 回读路径**(write-once)→ 记录文件追加 frontmatter 行对任何既有读者零影响。
- **当前无任何 caller 身份/actor/source 字段**(Task/TaskState/RecordData/模板/index.json 均无)。

**最小改造面**(格式不变原则满足——空 env 时模板输出字节不变):

1. `Z:\project\ai\forge\forge-cli\pkg\task\record.go` — `RecordTemplateData` 加 `Actor string`,`NewRecordTemplateData`(:63)读 `os.Getenv("FORGE_ACTOR")` 填入;
2. `pkg/task/records/{coding,doc,test,validation,gate,eval}.md` 6 模板 — 条件行 `{{if .Actor}}actor: "{{.Actor}}"{{end}}`;
3. (可选)`pkg/task/types.go` `RecordData` 若需 record.json 显式传值。

env 惯例先例:`FORGE_NO_LOG`(`pkg/forgelog/forgelog.go:187`)、`FORGE_DETECT_DEPTH`(`pkg/forgeconfig/detect_surface.go:151`)。

**覆盖面限定**:claim/transition 无记录产物,为其记 actor 需改 `index.json`(Task struct 加字段)——index.json 是新旧 CLI + 冻结 3.x 插件**双形态共写的往返文件**,旧写者重写时会静默丢弃未知字段 → 违反最小/格式不变原则,**不做**。判定:**FORGE_ACTOR 可行,但仅覆盖 submit 记录**。

### 4.2 透传传输链(dsh 侧)—— 零上游配合

- FORGE_ACTOR 须出现在「会话内 agent 执行 forge CLI」的 shell 环境。dsh 无 per-session 环境注入面(shell 环境为进程级,如 base 行读 `process.env.DSH_PERMISSION_MODE`,`packages/bundle/base/cordis.patch.yml:218-234`)——进程级 env 无法区分多挂接。
- **可行载体 = 注入 prompt 的附加指令行**:workbench 生成首条消息时附「凡执行 forge 命令,前缀 `FORGE_ACTOR=session:<linkId>`」;bash 工具按标准 shell 语义执行 `FORGE_ACTOR=… forge task claim …`(`packages/shell/tool-bash`)。prompt 原文 100% 注入纪律保持(原文不改写,仅追加)。零 dsh 上游改动。

### 4.3 Interface 6 只读查询契约确认

`forge prompt get-by-task-id`(`internal/cmd/prompt/prompt_get.go`):

- **成功 = 原始 markdown 到 stdout、无 framing、exit 0**(:59 `fmt.Print`);输出 = 完整执行编排 prompt(含 `TASK_ID:`/`TASK_FILE: <绝对路径>`/`TASK_CATEGORY:`),指示 agent 自行读取任务文件与 Reference Files、结束时调用技能——即 Interface 2 `getTaskPrompt` 的 `promptText` 直接来源。
- **失败 = stderr 结构化**(AIError `ERROR_CODE/ERROR/CAUSE/HINT/ACTION` block;exit 1,阻塞性 2:INVALID_TRANSITION/INVALID_PATH/CONTRACT_UNVERIFIABLE/MIGRATION_REQUIRED;无任务 `task "x" not found in index` exit 1)。
- 判定:stdout/stderr 分流与退出码清晰,**输出契约可依赖**。

### 4.4 结论与 Interface 3 判定序

- **FORGE_ACTOR = 可行(submit 限定)**;claim/transition 不可经此通道 → 来源判定序**保持「actor 透传(可为空)→ 挂接推断」**,且挂接推断仍为全量兜底主路径——不阻塞 M2(Interface 3 两序只读消费不变)。
- 建议:M2 将 forge 仓最小改造列为**可选增强**(submit 精确标记);e2e SC2/SC3 的 [会话] 标记断言以挂接推断即可满足;若落地,4.x prompt 契约任务定形附加指令行文案。

---

## 5. 会话结束事件可得性(tech-design Open Question #4)

- dsh session 为**持久会话,无「终态」生命周期信号**:`AgentStatus = 'idle' | 'running'` 二态(`packages/core/agent/src/runtime-types.ts:109`)。
- 事件面:`agent/status` → 转发 `api-session/status`(running 翻转,`packages/api/session-controller/src/index.ts:152-154`);`session/disposed` → `api-session/removed`(:149-151,宿主卸载语义,非会话完成);`api-session/activity`(用户消息活动);archive 为 UI 操作(`uiWorkspace.archiveSession`,navigation.ts:58-60)非生命周期事件。
- 客户端可见性:`api-session/{added,removed,status,activity,error}` 均在转发白名单(`packages/api/remotes/src/remote-events.ts:20-26`)——host/client 两侧都可订阅运行态翻转。
- **判定:「会话结束」不可得为明确终态事件。** `session_links.status → ended` 迁移维持**发起侧收敛**口径(tech-design 既有兜底);可选增强 = host 半身订阅 `agent/status` 做 idle(turn 结束)启发,不作 ended 判据。

---

## 6. tech-design 回填项一览(已同步 §Open Questions)

| # | Open Question | 结论 | 详见 |
|---|---|---|---|
| 1 | 上游顶级导航槽位确切名称与可用性 | **存在**:`sidebar.panellist`(list)+ `main`(keyed),契约 id/order/label/key/children,生成式目录背书;D3 首选成立 | §3 |
| 2 | DF004 会话创建通道形态 | **候选 1(host 半身 sessionController.create+prompt)**;降级链 1→2→3;定位升级为 `uiWorkspace.openSession`(poke 关闭) | §2 |
| 3 | `FORGE_ACTOR` 透传最小改造面 | **可行(submit 限定)**:`pkg/task/record.go` + 6 记录模板;判定序保持,推断兜底为主 | §4 |
| 4 | 会话结束事件可得性 | **不可得终态信号**(idle/running 二态 + dispose/archive 非终态);维持发起侧收敛 | §5 |

**门控下游**:3.3(导航注入,§3 契约与先例)、4.1/4.2(通道与 prompt 契约,§2/§4.3)。
