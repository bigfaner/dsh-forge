---
title: "RPC 与契约面约定"
domains: [rpc, contracts, channel, sqlite, service-injection, event, settings]
---

# RPC 与契约面约定

> 数据访问单门（SQLite 单句柄单写路径）、共享类型唯一源、IPC 通道族与 allowlist、Cordis 服务注入缝。

## 数据访问

### TECH-rpc-001: SQLite 句柄落点与单写路径

**Requirement**: `better-sqlite3` 仅在 `packages/core`（`db/` 子模块 = 句柄唯一落点，无域语义——中央 state.db 单句柄；M2 起每工作区 forge.db 多句柄经 `forge/workspace` store 惰性持有，openDatabase 参数化传入工作区迁移序列，独立版本线）；SQLite 写只经 core 服务（UI 与 plugin 同门，单一写入路径——M2 扩展为「每工作区库写只经 core 服务」）；打开时设 `journal_mode = WAL` + `foreign_keys = ON`；schema 经 `schema_meta` 前向迁移（单事务原子应用 DDL + 版本行，任一步失败整体回滚；旧应用打开新 schema 拒绝）；SQL 一律 prepared statements。
**Source**: feature/dsh-forge-p1-mvp TECH-005（tech-design §Architecture / packages/core/src/db/{open,schema,transaction}.ts）+ feature/dsh-forge-m2-pipeline（tech-design §forge/workspace 子模块，drift 修订：单句柄 → 中央单句柄 + 每工作区惰性多句柄）

### TECH-rpc-006: 每工作区库惰性首开 + 失败隔离

**Requirement**: 每库每进程首次触达 ensureOpen（open + migrate + 开库结构健全性检查 = 版本门 + `PRAGMA foreign_key_check` + 表在场——恒轻量，不开库全库派生复检）；失败 → 该工作区标不可用（ERR_WORKSPACE_DB_UNAVAILABLE + 工作区 app_key_logs scope=tasks + 概览错误态），应用与其余库照常；存量库缺席 = 补建 + 发现面扫描（与注册径同构）；三层校验职责 = 写事务内增量断言（承重）· validateFeatureTasks 单 feature 子图 · 开库结构健全性。
**Source**: feature/dsh-forge-m2-pipeline TECH-002（tech-design §Overview 关键机制 2·§Interface 1·§交互二 / packages/core/src/forge/workspace/store.ts）

## 契约唯一源

### TECH-rpc-002: 共享类型唯一源（contracts）

**Requirement**: 跨工件类型与常量全部定义于 `packages/contracts`——RPC DTO、frontmatter 契约常量、错误码、IPC 通道名；两侧各自引包（防 schema 漂移）。定位铁律：纯类型与纯常量，零逻辑零依赖（「描述业务形状但不实现业务」）。
**Source**: feature/dsh-forge-p1-mvp TECH-006（tech-design §包间协作规则第 4 条 / packages/contracts/src/*.ts）

### TECH-rpc-003: IPC 通道族与 allowlist

**Requirement**: 产品 RPC 通道八族 + 事件单向推送：`forge:projects/*`（register/list/get/update/reconcile + M2 扩 deriveTaskStoreDir）、`forge:knowledge/*`（browse/listEntries/entryDetail/heat/sessionRecall——仅浏览面）、`forge:fs/*`（listDir——文件浏览器只读目录列举，本机目录读取经 RPC，renderer 不开 Node fs 通道）、`forge:tasks/*`（transition/query/validateFeatureTasks/list/stats/graph/detail/sessionLinks——人类面 + 读面）、`forge:features/*`（register/transition/upsertDoc/list/listDocs——M3 扩 listDocs 分层文档读面）、`forge:proposals/*`（list + M3 扩 transition[双面 drift 修订]/setMode[律三唯一正门·UI 专属]/listDocs[提案文档区只读扫描]）、`forge:settings/*`（M3 新族：get/set——forgeSettings 服务单门）、`forge:docs/*`（read/openExternal——后者 main 侧执行）+ `forge:events/tasks-changed`（主→渲染单向，preload 订阅面 allowlist 守卫）；通道名常量归 contracts，main 侧 allowlist 唯一源校验、未知通道拒绝（electron-ipc-security 约定：contextIsolation、无 remote content）；`search` / `readAbstract` 与 add/submit/createProposal/registerFeature/upsertFeatureDoc 走 agent 面插件 tool 不经 web RPC（双门分工；transitionProposal M3 起双面；claim 已并入 dispatchTask——tool 专属）；dsh 自有面经 `__DSH_TRANSPORT__` carrier（M3 起 agentPreset.select 同载体）。
**Source**: feature/dsh-forge-p1-mvp TECH-007（tech-design §Interface 4 / packages/contracts/src/channels.ts）+ feature/dsh-forge-m2-pipeline（tech-design §Interface 7，drift 修订：三族 → 七族 + 事件）+ feature/dsh-forge-m3-bootstrap-presets（tech-design §Interface 4，drift 修订：七族 → 八族 + proposals/settings 扩族）

## 服务注入缝

### TECH-rpc-004: 服务 provide/inject 缝与 child 形态宿主

**Requirement**: core 以 `ctx.reflect.provide` 注册七服务（P1 双服务 `forgeProjects` / `forgeKnowledge` + M2 四域 `forgeTasks` / `forgeFeatures` / `forgeProposals` / `forgeDocs`——tasksHome 缺席时四域整体降级缺席，P1 行为零变化；M3 增 `forgeSettings`——settingsFile 缺席 = 降级缺席，六服务形制不动，且 cordis 4.0.4 无 '?' 可选 inject、可选消费不走 inject 声明）；插件族对 core 面依赖 = 服务接口类型唯一（knowledge 插件 `inject: ['forgeKnowledge', 'tools', 'systemPrompt']`；plugin-forge `inject: ['forgeTasks', 'forgeProposals', 'forgeProjects', 'tools', 'systemPrompt']`；plugin-forge-spec `inject: ['forgeFeatures', 'forgeTasks', 'tools', 'systemPrompt']`——faces.ts 结构化最小面），声明服务齐备才加载、零实现级 import（可独立发版前提）。宿主 boot 为 child 形态：`ELECTRON_RUN_AS_NODE=1 --expose-internals` 子进程跑 dsh 宿主（官方 Desktop 同款），main 侧经 `{url, injections}` manifest + 产品服务 RPC 代理面消费（DshHostHandle 面不变，main.ts 零感知）；direct-in-main 形态下 agent 工具派发恒挂起（dogfood 实证），禁回退；M3 起 worker 派发依赖的 spawn 通道/`childCtx.tools.restrict()`/组合继承只在 child 进程内可达（in-process driver）。
**Source**: feature/dsh-forge-p1-mvp TECH-008（tech-design §Overview 两条关键缝 / packages/core/src/index.ts / apps/host/src/boot/README.md）+ feature/dsh-forge-m2-pipeline（tech-design §Interface 1-4·§提示词与技能资产，drift 修订：双服务 → 六服务 + 插件族）+ feature/dsh-forge-m3-bootstrap-presets（tech-design §Layer Placement·§组件图，drift 修订：六服务 → 七服务 + 两包 inject 面）

### TECH-rpc-005: 按域服务划分（MVC 落位）

**Requirement**: Model = core 按域服务（域内聚、读写一体、API 独立于前端保持稳定）；Controller = 两个薄面（RPC 通道族 = 人类面，tool 面 = agent 面，只做参数映射与路由）；View = apps/web；跨域聚合（如 ov-head）由前端组合多域读完成，不设按视图命名的聚合服务（forgeOverview 方案否决——用户裁决 2026-10-06）。
**Source**: feature/dsh-forge-m2-pipeline TECH-001（tech-design §Overview MVC 落位·§Interfaces·§关键技术决策）

## 事件推送

### TECH-rpc-007: 写推送事件链

**Requirement**: 四域一切写动词（tasks 全动词 + registerFeature/transitionFeature/upsertFeatureDoc + createProposal/transitionProposal/setProposalMode——M3 扩 proposals 域 mode 正门）闭包尾部 emitTasksChanged(projectId)（同通道同载荷 {projectId}——概览三子 tab 统一刷新）；core 侧 process.send（child 形态 IPC；缺席静默降级——交互重取兜底）→ run.ts 消息分流 event 分支 → webContents.send('forge:events/tasks-changed') → renderer 订阅重取（web/rpc 共享订阅层 50ms 合并）；「即时」判据 = 写入返回后单次重取即见新值 + 事件延迟 ≤500ms；桥事件信封（BridgeEventMessage）为产品自有协议扩展，零上游改动。
**Source**: feature/dsh-forge-m2-pipeline TECH-003（tech-design §Overview 关键机制 1·§Interface 6·§交互二）+ feature/dsh-forge-m3-bootstrap-presets（tech-design §Interface 1 写后事件覆盖面，drift 修订：+setProposalMode）

## 面路由

### TECH-rpc-008: tool 面 cwd 路由与 actor 通道推断

**Requirement**: tool 执行点 exec.agent.session.header.cwd → normalizeFsPath 匹配中央 projects.ws_path → projectId（无匹配 = ERR_WORKSPACE_NOT_REGISTERED）；UI RPC 侧显式带 projectId；actor 由通道推断（tool = 'plugin-tool' + exec ctx sessionId；RPC = 'ui'），输入面不收；cwd→projectId 数据缝 = 复用 knowledge bindingsFile 机制（host 维护 {wsPath, projectId} JSON，boot overlay 注入插件行 config，注册后增量刷新）——插件对 core 零实现级 import。
**Source**: feature/dsh-forge-m2-pipeline TECH-004（tech-design §Overview 关键机制 3·§Interface 8·§交互四）

## 设置单门（M3 起）

### TECH-rpc-009: forgeSettings 服务单门

**Requirement**: worker 默认 LLM 设置存储 = `{userData}/forge-settings.json`（路径经 boot overlay 注 core 行 config——bindingsFile 同型先例）；core 新供 `forgeSettings` 服务单点读写（get/set 单门——UI 设置分区经 RPC 与 dispatchTask 服务注入同门消费）；派发时实时读（改完即生效无重启）；settingsFile 缺席 = 服务降级缺席（六服务形制不动）；reasoning → agentOptions.effort 直映射；cordis 4.0.4 无 '?' 可选 inject——可选消费不走 inject 声明（缺席不阻载）。
**Source**: feature/dsh-forge-m3-bootstrap-presets TECH-007（tech-design §Interface 1·图 11·§关键技术决策 / packages/core/src/forge/settings/service.ts）
