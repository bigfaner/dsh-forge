# dsh（DeepSeek Harness）功能参考

面向 dsh-forge 开发的 dsh 上游功能地图：开发新功能时先查本文，再决定是否进源码细读。

> **版本基线**：dsh `0.2.2-alpha.2`（`@deepseek-ai/dsh-root` package.json），源码检出 `Z:\project\github\deepseek-harness` @ 2e918868（2026-11-01）。
> **时效声明**：dsh 迭代快，本文是某一时点的快照，未来可能过期——使用时先核对上游版本（`git -C Z:\project\github\deepseek-harness log -1` 与 package.json version）；上游显著演进后按域局部更新本文（各条目带 ctx 键与包名定位）。「近期」指 2026-05 以后、重点是 10 月下旬落地的新能力。

## 总览

- **架构**：Cordis 插件体系——一切皆插件（模型适配、工具注册、会话日志、agent loop 本身），扩展方式是在其它插件旁挂载插件，注册全部可逆（`ctx.effect()`/`ctx.on()`）。
- **组合**：profile（`web`/`headless`/`sdk`/`sdk-minimal`/`acp` 模板）= 有序 bundle 层叠 + `cordis.patch.yml` + home patch + `--patch` overlay；bundle 是 Cordis 配置行 + 代码的分发格式（`package.json` 的 `dsh.profile` / `dsh.bundle` 字段）。`dsh --profile web --dump-config` 可看本机启动树。
- **核心包**（`ctx` 键）：`core/session`→`ctx.sessions`（append-only 会话事件日志）、`core/system-prompt`→`ctx.systemPrompt`、`core/tools`→`ctx.tools`（作用域工具注册 + 受管执行管线）、`core/agent`→`ctx.agents`、`core/agent-loop`→`ctx.agentLoop`、`llm/llm`→`ctx.llm`。
- **事件三分**：session 事件（持久事实）、agent 事件（`agent/*`，在飞工作）、能力事件（`fs/*`、`tools/*`、`telemetry/*` 等缝策略）。完整生产者×消费者矩阵见上游 `docs/event-producer-consumer.md`（脚本生成，机器可读）。
- **生成文档可信**：tool-catalog / config-catalog / persistence-catalog / event-producer-consumer 均由脚本生成并纳入 doc-sync 校验，可作为扩展点权威索引。

## 工具总览（模型可见）

| 工具 | 用途 | 默认状态 |
|---|---|---|
| read / write / edit / read_image | 文件读写编辑、图片读取 | 默认启用（read_image 需 attachments + 图像模型路由） |
| apply_patch | Codex 风格补丁编辑 | **默认关闭**（`applyPatch: false`，dsh-base 与全部 Web preset 显式 false；改 preset 一行即启用） |
| str_replace_editor | view/create/str_replace/insert 独立编辑器 | 可选装载 |
| glob / grep | 打包 ripgrep（`@vscode/ripgrep`）发现工具，走 ctx.subprocess | 默认启用 |
| bash / pwsh | 一次性 shell 执行；`run_in_background` 注册 ctx.jobs | 默认启用（Windows 组合用 pwsh） |
| bash / pwsh（persistent） | owner 隔离持久 PTY shell | 可选装载，需 PTY 后端 |
| terminal_open/send/read/close/list/signal | 持久 PTY 终端六件套 | opt-in |
| job_kill / job_list / job_output | 通用后台作业控制 | 装载 tool-jobs 即有 |
| lsp | 定义/引用/实现/hover | 需 provider（lsp-stdio）；无则结构化 `LSP_UNAVAILABLE` |
| list/read_mcp_resource(s/_templates) | MCP 资源读取 | 随 mcp-resources |
| run_code | PTC TypeScript 程序执行（嵌套子调用走共享 guarded pipeline） | PTC 组合装载 |
| present | 交付物声明卡片 | 默认启用 |
| schedule_create/edit/list/view | 计划任务（RFC 5545 循环，Session 目标复用） | 随 tool-schedule 装载 |
| create_goal / get_goal / update_goal | 目标跨轮持续 | 随 tool-goal 装载 |
| subagent / subagent_fork / list_agents / send_message / interrupt_agent | 子代理委派与控制 | 随对应包装载 |
| todo_write | 会话内任务清单 | 默认启用 |
| web_fetch / web_search | 网页抓取/搜索（provider 藏在 ctx.web） | 默认启用 |
| skill / working_directory / session_event_* / session_search 等 | 技能装载、会话目录、会话历史查询 | 随对应包装载 |

## 文件系统与执行能力

- **ctx.fs 缝**（fs + fs-local + fs-sandbox + fs-observation-policy）：抽象缝 + 本地实现 + 按调用 sandbox mode 拦写放读实现 + 「读后写/读后改 + 版本守卫」纯事件门插件（范式：无服务 API、只订阅 `fs/*` 事件）。
- **apply_patch（近期）**：fs-patch 提供 Codex 风格补丁解析器（纯函数、LF、结构化失败）；tool-fs 以 `applyPatch: true` 开关注册，走整补丁 preflight + applyPatchGuard。
- **shell**：ctx.shell 执行器缝；bash/pwsh 工具是模型面消费者（每调用新进程、后台注册 jobs、sandbox 升级参数）；pwsh-local 为 PowerShell 方言实现。
- **终端**：ctx.terminals 持久 PTY 会话缝（owner 隔离、后端注册表）。
- **子进程**：ctx.subprocess 统一受管进程组、spill 支撑的限幅输出、升级 kill。
- **沙箱**：ctx.sandbox 进程沙箱缝（bwrap / landock-run / macOS Seatbelt / Windows ACL restricted token，探针式 fail-closed）；sandbox-policy 每调用策略解析被 shell/terminal/fs-sandbox 共享。Windows 管理员账户已支持（LUA_TOKEN 移除）。
- **MCP**：mcp-client 连接配置的 MCP 服务器并按原名注册工具（raw JSON schema）；mcp-resources 出 3 个资源读取工具。
- **LSP**：ctx.lsp 语言服务导航缝，provider 注册表 + 归一化请求结果，模型 schema 跨 provider 稳定。
- **ACP**：Automation-only Agent Client Protocol 服务器（JSON-RPC over stdio）——headless/外部编排官方入口；subagent-acp 反向把 ACP agent 作为 subagent provider。
- **browser-use / computer-use（experimental）**：ctx.browserUse / ctx.computerUse 独占命名 provider 注册缝；实现 playwright-mcp、chrome-devtools-mcp、stagehand-native、cua-driver-*；cua 包含权限控制面 ctx.cuaAccess。
- **PTC 运行时**：ctx.ptcRuntime 抽象执行缝；ptc-runtime-node 是 run_code 引擎（async 函数/REPL/VM Script，子调用走共享 guarded pipeline 并保持嵌套结果链接）。原 code-runtime 域已重命名对齐 PTC。
- **e2b 已退役**（2026-09）：远程执行勿再依赖。
- **ssh**：共享 OpenSSH 连接 + 版本化 POSIX 远程 helper；fs/subprocess/sandbox 三缝各有 SSH 实现（远程工作区组合）。
- **attachment**：ctx.attachments 持久不可变附件存储；宿主在会话事件前落盘，LLM 适配器解析为 provider 原生内容。
- **document**：ctx.officeToPdf 有界队列 + 缓存的 Office→PDF 转换。
- **deliverables**：present 工具声明交付文件（会话归属，Web 出卡片）；workspace-changes 提供每 turn 变更摘要 ctx.workspaceChanges。
- **credentials**：ctx.credentials 缝——配置携带引用、provider 持有值、按操作解析（轮换即时生效）；deepseek-account 管浏览器授权。

## 核心机制

包目录是「包组」，组内子包按「服务定义 / provider 注册 / 消费者」三分组织。近半年跨包演进主线：模型选择下放到每个 Agent、工作目录集中化、scoped executor 与工具注册分离、运行时 projection 读取统一。

### core — Agent 骨架

- **Scope 作用域注册**（core/scope）：单 Agent 贡献的注册与事件路由隔离原语，一切注册表的地基（库，无 ctx 键）。
- **会话事件日志**（core/session）：append-only 事件日志，历史的唯一真源；`ctx.sessions`。
- **系统提示组装**（core/system-prompt）：有序 section + 工具 schema + 变量装配；`ctx.systemPrompt`。
- **工具注册与执行管线**（core/tools）：注册表 + 带守卫执行管道；`ctx.tools`。
- **Agent 契约与注册表**（core/agent）：`ctx.agents` + `agent/*` 事件。
- **默认 Agent 循环**（core/agent-loop）：turn/step 生命周期驱动（可替换）；`ctx.agentLoop`。
- **默认模型**（core/agent-default-model）：部署级默认模型应用；近期模型选择改由每个 Agent 自持。

### session — 持久化数据面

- **持久化缝**（session-persistence）：存储契约 + 后端共享写协调（单写者）；出厂 JSONL 后端（不可变代际文件名 + 独占后继发布，可选 zstd）；`ctx.sessionPersistence`。
- **格式迁移链**（session-format*）：纯函数相邻格式迁移链 v0→v4，解码旧发布日志。
- **检查点策略**（session-checkpoint-policy）：下一动作前先落盘模型请求、顶层工具副作用、已完成 step。
- **投影体系**（session-projection）：把已提交事件折叠成整值当前状态（sessionStats、turnOutline 等）；`ctx.sessionProjections`，配 checkpoint 缓存加速冷读。
- **工作目录**（working-directory）：会话有效执行目录；`ctx.workingDirectory` + `working_directory` 工具。
- 其它：会话标题（日志回放 + LLM 回退）、会话遥测（OTel，feedback-gated）、官方日志上传（`dsh_session_log` 请求元数据）。

### session-query — 检索族

- **统一会话查询**：精确读、过滤列表、fork 链追溯；`ctx.sessionQuery`。
- **SQLite 全文搜索**：FTS5 索引，搜索结果与模型所见历史一致。
- **会话导出**：Web `/export` 下载会话 ZIP。

### goal / todo / plan — 目标与计划

- **持久目标**（goal）：每会话一个跨重启/fork 目标，create/edit/pause/resume/complete/block；`ctx.goals` + 三个工具 + `/goal` 命令直控。
- **自动续跑**（goal-round-driver）：活跃目标转顺序 Rounds 的可选驱动。
- **任务清单**（tool-todo）：`todo_write` 整表替换、跨回合持久。
- **Plan 模式**（plan-mode）：`/plan` 进出，先设计后执行；`exit_plan_mode` 呈现计划待人批；引导不限制工具。

### subagent — 委派族

- **委派缝**（subagent）：provider 注册表、一次性运行、可续聊 continuable 子代理；`ctx.subagents`。
- **进程内后端**：全新子（spawn-in-process）/ 父历史种子 fork（fork-in-process）。
- **跨进程后端**：ACP、Codex app-server、Claude Code SDK、Harness SDK。
- **委派工具**：`subagent`、`subagent_fork`、`send_message`、`interrupt_agent`、`list_agents`。近期：委派工具在 preset revision 内共享。

### workflow / jobs — 编排与后台

- **工作流引擎**（workflow + workflow-ptc）：模型编写 JS 编排脚本扇出子代理（agent/pipeline/parallel 钩子），共享沙箱 PTC 运行时；`ctx.workflowEngine` + `workflow` 工具。
- **后台作业**（jobs）：长任务注册 job、属主围栏、完成通知就地送达；`ctx.jobs` + `job_list/output/kill`。

### schedule — 定时任务

- RFC 5545 循环任务投递到已有/新会话，跨 Host 重启持久，到期以普通后续消息送达；近期独立任务与 WebUI 集成。

### spill / compaction — 上下文治理

- **文本外置**（spill）：超限文本存到上下文之外、返回 locator + 检索指引；`ctx.spillStore`。
- **自动压缩**（compaction）：token 压力上升时凝缩旧历史为摘要；`ctx.compaction`。
- **修剪/卸载**：超大工具输出先修剪；图片路由拒收时替换占位符（听 `agent/request-error`）。
- **`/compact` 命令**：按需压缩，与运行中 turn 串行排队。

### context — 请求上下文插件（无工具、注入用户角色消息入史，抗压缩/重放）

- 工作区指令（AGENTS.md/CLAUDE.md 装载 + 编辑刷新，dsh-base 默认）。
- 会话引用（@其它会话 → 有界只读快照）；文件提及（`@file` 发现/补全）。
- 时间/位置上下文（当前时间、tmux 位置、harness 检出与 Web GUI URL）。

### skill / preset / interaction / hooks / feedback / guard

- **技能**（skill）：多 provider 目录合并、按名解析胜出；`ctx.skills` + `skill` 工具 + `/name` 直呼；项目/自定义/用户目录发现（带 watch）。
- **Agent 预设**（preset/agent-preset-registry）：以普通 Cordis 配置声明 Agent 能力（工具/提示/技能按选中 revision 组合），「一切皆插件、按预设组合」的关键机械；`ctx.agentPresets`；另有声明式预设与可组合人格。
- **斜杠命令**（interaction/commands）：免模型回合直接作用于 Agent；`ctx.commands`。
- **审批**（user-approval）：answerer waterfall 出 allow/reject，无应答者 fail-closed；`ctx.approval`。
- **权限预设**（permission-presets）：沙箱模式 + 审批策略打包成用户可见 Permissions 选择器。
- **用户提问**（user-questions + tool-ask-user）：校验化问题 schema + 作用域 answerer waterfall；`ctx.userQuestions`。
- **钩子桥**（hooks）：承接 Claude Code / Codex 钩子方言的 matcher 与协议桥。
- **反馈**：`/feedback` 命令（固定分类法、单向信号）；消息级评分随会话存储。
- **循环卫生**（guard）：重复工具调用提醒；工具调用超时策略（base 默认启用）。

## 扩展与平台

### 插件机制

- **Cordis 插件模型**：插件 = 实现 Service 的对象（`inject` 声明依赖 + `apply(ctx)`）；服务认领 `ctx.<key>`；一切注册经 `ctx.effect()`/`ctx.on()` 可逆。
- **事件五模式**：emit / waterfall / parallel / serial / bail（`@mode` 标注，生成目录校验）。
- **Loader**：`@deepseek-ai/cordis-plugin-include` 解析 `!!js` 表达式；环境选插件用 overlays。
- **安装通道**：`dsh-plugin-manager`（Web Plugins 页 + `plugin_manager` agent 工具双入口）——toggle 只改 `cordis.patch.yml` 的 disabled，bundle toggle 改 `dsh.profile.bundles` 有序列表；需 pnpm；每动作需 danger-full-access 或逐次审批。近期：安装失败诊断流式化。
- **Plugin Market**：`dsh-plugin-market` 配置市场索引，服务 Web Discover 页 + `plugin_market` 工具。
- **动态双半插件**（packages/extensions）：cordis-host-runner（node:vm realm 沙箱，重启即失）+ cordis-client-runner（浏览器半）+ tool-cordis（只读运行时检查工具）+ client-ui-cordis（定义卡 UI）。持久化安装仍走 plugin-manager。

### SDK

- **TS SDK**：`dsh-sdk-client` spawn 同版本 dsh 子进程、stdio JSON-RPC 驱动完整运行时；`DeepSeekHarness.run()`（文本/slash/图片）+ `HarnessClient` 低层面；`resumeSession` 恢复持久会话；client-owned approval（审批按 live runtime ownership 路由，近期合入）。
- **Python SDK**（`deepseek-harness-sdk`）：捆绑同版本平台 wheel，`--profile sdk` 启动；强制显式 dsh_home；resume/懒句柄/超时契约与 TS 对齐；独立 Office 运行时。近期：native slash 命令（goal/plan/compact/permission 等）经统一 run/query 输入路由。
- **SDK profiles**：`dsh-sdk-app` / `dsh-sdk-minimal` bundle。

### 平台服务

- **API Gateway + Typert**（packages/api/gateway + packages/typert）：`@Remote`/`@RemoteScope` 装饰器声明方法，TypertLookupMap 做 Host 对象↔wire id 解析，stream 模式走 `/api/remote.mux` WebSocket；client 侧 namespace 是 traced Cordis 子 Service（`ctx.remote.<ns>`）。新 Client API 面走此链，勿平行发明 RPC。
- **API 控制面**：session/workspace/terminal/settings/account/job controller、workspace-files、remote-access、remotes。
- **Webhook（experimental）**：fire-and-forget 规则运行时，按规则创建 Workspace 背书会话；GitHub 集成在 webhook-github。
- **LLM 层**：`dsh-llm` provider 中立面 + waterfall 的 llm/stream；三条 DeepSeek 接入路线（account/api-key/平台）；`dsh-llm-pi-ai` 新事件 **`llm-pi-ai/request-headers`** 允许插件在推理前准备请求头（近期）；`dsh-llm-retry`、`dsh-token-meter`。
- **Storage**：ctx.storage 命名后端注册表 + ctx.storageDomain（`domain/changed` 事件）——会话事件之外的持久化应用数据；json/sqlite 后端。
- **Telemetry**：`dsh-otel` 单服务独立 OTLP 双通道（普通事件 + Session 日志），挂载即零发送；identity 提供每 home 匿名用户 id。
- **Boot**：app-boot（.env + fail-loud Loader guards）、hmr（模块 + profile 配置热重载）、cmdline、plugin-manager、plugin-market。
- **Bundle**：base（共享首层）、headless（一次性 runner）、web-app、sdk-app、sdk-minimal、acp-app。

## 应用与 UI（近期新能力，重点 2026-10 下旬）

- **liveshare**（experimental/liveshare + liveshare-protocol）：host / owner-gateway / viewer 三端分享面；ShareDialog、ManageSharesDialog、能力选择器；协议独立成包（actor credentials、direct connections、viewer 上传开关）。
- **移动端 sidebar**：AppFrame 侧栏抽屉化（ui-layout + ui-sidebar 族适配）。
- **per-pane 文件树**（ui-sidebar-files）：按分栏保留文件树，打开动作由挂载插件处理；文件菜单支持侧栏/浮窗打开并移动标签。
- **可扩展右键菜单**（新包 ui-context-menu + ui-file-actions）：共享 popup 生命周期 + 可扩展 resource actions；workspace/目录级右键；图像右键；desktop 原生文件动作桥。
- **trajectory 增强**（ui-trajectory）：subcall 独立折叠；raw/rendered 工具结果堆叠 + raw 模式记忆；run_code 语法高亮；长历史虚拟化。
- **models 徽章选择器**（ui-model-selection）：/models listing 徽章进模型目录与选择器；设置页 provider 模型拖拽排序。
- **schedule × WebUI**（ui-schedule）：standalone 计划任务面 + 批量清理，与现有 WebUI 集成。
- **官方 forge（experimental，仅对照）**：client-ui-forge 插件族（ForgeTab/ChangesTab/DiffFile）——diff 左右键导航、文件树 + 行内评审评论、Session list worktree/CR 状态。是 worktree/review 流水线，与 dsh-forge 自研管线无代码关系。
- 其它：ui-dockkit 浮动面板回弹；Statistics 性能视图（Developer tools）；主题 SVG sprite 替换产品图标；文档缩放控件；plugin market Discover 页重绘；desktop 更新流/Intel Mac 打包/Windows 安装器多语言；remote-access whenAccess（插件注册跟随访问状态）。

## 对 dsh-forge 开发的复用提示

1. **工具拦截/加策略**：挂工具管线瀑布（`tools/pre-execute` → guard → `tools/execute` → `tools/post-execute` → `tools/result`），不动 loop；fs-observation-policy 是纯事件门范式。
2. **能力三层分拆**：抽象缝（ctx.shell/fs/subprocess/sandbox/terminals/lsp/web/jobs/ptcRuntime）+ 多实现（local/sandbox/ssh）+ 模型面 tool-* 消费者；新增能力照此分拆，官方已有同语义缝先复用。
3. **宿主正门缝**：Cordis 服务键 + inject + 事件 + `ctx.effect()` 可逆注册；客户端组合 UI 走 client extension points（branch/slot/access seams、webserver resource routes）。
4. **程序化驱动**：TS 用 dsh-sdk-client、Python 用 deepseek-harness-sdk（slash 命令、审批 RPC、会话恢复已 parity）——forge worker/会话编排可评估直接吃 SDK。
5. **声明式能力组合**：`ctx.agentPresets`（工具/提示/技能按 revision 组合）与 `ctx.skills` 是 dsh-forge 专家/预设体系的官方同语义机械，优先踩。
6. **状态折叠与冷读**：`ctx.sessionProjections` 把自有领域事件折叠成当前态投影，免费获得持久化 checkpoint 与冷读加速。
7. **人机协作链**：`ctx.userQuestions` / `ctx.approval` 是 answerer waterfall——注册 answerer 即接入提问/审批 UI 链；`ctx.commands` 挂斜杠命令。
8. **持久化纪律**：`ctx.sessionPersistence` 单写者铁律——勿自建后补写会话日志；旧格式恢复走 session-format 迁移链而非自行解码。
9. **上下文注入模式**：context 组示范「无工具、注入用户角色消息入史」的持久上下文，比改 system-prompt 更抗压缩/重放。
10. **新 RPC 面走 Typert/Gateway**，不自建协议。
11. **推理请求加头**：挂 `llm-pi-ai/request-headers` waterfall 事件（如网关代理头）。
12. **插件分发走 plugin-manager/plugin-market**；dsh-forge 自产插件按 bundle（`dsh.profile.bundles`）组织可复用 toggle/patch 语义。
13. **可直接复用的新通用 UI 件**：ui-context-menu、ui-sidebar-files（per-pane 文件树 + 打开动作外移模式）、ui-model-selection 徽章、ui-layout 移动 drawer。
14. **experimental 域注意**：liveshare、webhook、forge、cua、browser-use 实现等不承诺稳定 API；依赖前核对 experimental-persistence-catalog 的 ignorable 记录语义。
15. **对照走查权威入口**：上游 `docs/subsystems/forge.md`、`liveshare.md`、`schedule.md`、`tool-catalog.md`、`config-catalog.md`、`api-gateway.md`。
