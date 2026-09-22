---
created: "2026-09-22"
prd: prd/prd-spec.md
status: Draft
---

# Technical Design: dsh-forge M2 需求与会话工作台

> 设计输入:prd/prd-spec.md(2026-09-22 修订版)+ prd/prd-user-stories.md(7 故事)+ ui/ui-design.md(eval 961/1000,原型已批准)。
> 测试语言(Step 0 判定):TypeScript;vitest 单测 + Playwright `_electron` e2e(仓内既有栈,root package.json `test`/`test:e2e` 实证)。
> 2026-09-22 用户裁决四项:①SQLite M2 全落(自有状态 + 派生快照);②必备不可禁用 = 双层防护;③渲染载体 = 上游导航槽位优先(降级插件内自绘 rail);④依赖树引擎 = @xyflow/react。

## Overview

M2 = 以项目为中心的工作台,整体由**一个 forge 核心插件 + Electron 数据内核**承载:

- **forge-workbench 插件**(cordis 双半身,经基座产品级配置以**必备**身份装配):client 半身承载全部 UI(UF1-UF6,注入上游 SPA);host 半身承载 forge CLI 桥(DF001 过渡形态)与会话发起(DF004)。这是「forge 能力 100% 以插件交付」(G6)的落点。
- **Electron 数据内核**(主进程,能力无关基建):SQLite 工作台自有状态(项目注册表/挂接索引)+ 任务/feature 派生快照 + 文件感知(DF003)+ `dshForge.workbench.*` IPC 语义动词面。2026-09-21 方向声明将「任务索引/项目↔会话挂接/数据 API」划入 Electron 壳内核,本设计照此落位;内核持有 forge 文件**格式的读取适配**(数据基建),不持 forge 行为(CLI 执行/会话操作留插件侧)。
- **事实源纪律**:落地前 forge 文件为唯一事实源;`task_snapshot`/`feature_snapshot` 为可重建派生缓存(mtime/hash 校验,冲突即弃重建);`projects`/`session_links`/`app_state` 为工作台自有 SoT(不与 forge 数据混放,PRD 存储约束)。
- **进程足迹不变 = 2**(继承约束):forge CLI 按需 spawn、执行完退出;不新增常驻进程;SQLite 走主进程内嵌 `node:sqlite`(Electron 44 / Node ≥22.20 内建,**零原生重编译**,离线自足,三平台打包零额外成本)。

### 关键裁决记录(2026-09-22,AskUserQuestion 确认)

| # | 裁决 | 结论 | 主要理由 |
|---|------|------|---------|
| D1 | SQLite M2 落地范围 | 全落:自有状态 + 派生快照均入 SQLite | 首屏 ≤2s 与 ≤5s 回流 diff 走快照免整树扫描;对齐 2026-09-21 方向声明节奏 |
| D2 | 必备插件不可禁用执行点 | 双层防护:产品清单只读分区(mandatory 标注,运行时启停覆盖文件 schema 仅纳第三方)+ host-profile 单一写路径守卫 | 打包后 resources 只读,运行时状态必在 userData;纵深防御,SC6 行为结果双保险 |
| D3 | 工作台渲染载体 | 上游导航槽位优先(源码侦察为首个 UI 任务前置);降级 = 插件内自绘 slim rail(仍 100% 插件交付) | 与上游 UI 融合最优;壳代码零改动保 G6;两形态行为契约一致(ui-design Navigation 节) |
| D4 | 依赖树渲染引擎 | @xyflow/react(经插件 bundle 引入,不进壳) | pan/zoom/fit-view/节点交互内建;MIT;500 节点规模成熟 |

## Architecture

### Layer Placement

| 层 | 落位 | 内容 |
|----|------|------|
| Electron 主进程(壳内核) | `apps/desktop/src/main/workbench/` | SQLite store、indexer/watcher(DF003)、IPC 动词、注册校验 |
| 基座消费(既有扩展) | `apps/desktop/src/main/host-profile/` | plugin-bundles.json `mandatory` 标注解析 + 运行时启停覆盖文件(双层防护) |
| 渲染进程(上游 SPA 内) | `packages/plugins/forge-workbench/src/client/` | UF1-UF6 视图、导航注入、locale(zh/en)、@xyflow/react |
| dsh 宿主子进程 | `packages/plugins/forge-workbench/src/host/` | forge CLI 桥(DF001)、会话发起(DF004)、FORGE_ACTOR 透传 |
| 打包装配(既有扩展) | `apps/desktop/resources/plugin-bundles.json` | 产品清单新增 forge-workbench 条目(`mandatory: true`) |

### Component Diagram

```
┌ Electron 主进程(壳内核 · 能力无关基建)────────────────────────────┐
│ workbench/store      SQLite(node:sqlite,<userData>/workbench/)     │
│   ├ projects / session_links / app_state     ← 工作台自有 SoT        │
│   └ task_snapshot / feature_snapshot / sync_state  ← 派生缓存(可重建) │
│ workbench/indexer    forge 文件扫描 → 快照 upsert → diff → 变更事件    │
│ workbench/watcher    fs.watch(recursive)+400ms debounce → 触发 indexer│
│ workbench/registry   注册/重指向校验(forge 数据检出、路径规则)         │
│ workbench/ipc        dshForge.workbench.* 动词(sender 校验)          │
│ host-profile(基座扩展)mandatory 解析 + 运行时启停守卫(双层防护)      │
└────┬ IPC(contextBridge 白名单)──────────┬ 子进程(spawn 按需退出)──────┘
     │                                     │ forge CLI(DF001/DF002)
┌────▼ 渲染进程(上游 SPA)─────────┐   ┌──▼ dsh 宿主子进程 ──────────────┐
│ 上游 GUI(会话视图,100% 继承)     │   │ forge-workbench 插件 host 半身    │
│ forge-workbench 插件 client 半身   │   │  ├ ForgeBridge(resolveCli/      │
│  ├ 导航注入(首选上游槽位/降级rail)│cordis rpc│  │   getTaskPrompt)              │
│  ├ UF1 概览+向导 / UF6 插件管理    │──▶│  ├ SessionLaunch(DF004,spike定形)│
│  ├ UF2 任务看板(@xyflow/react)    │   │  └ FORGE_ACTOR env 透传          │
│  ├ UF3 详情侧板 / UF4 feature 看板 │   └ 会话执行/审批(现有会话 UI 承接)  │
│  └ UF5 发起入口(prompt 可用性探针) │                                   │
└──────────────────────────────────┘   └──────────────────────────────────┘
        ▲ dshForge.workbench.*(自有状态/快照/文档/事件推送)
```

数据面分工(避免双通道含混):

- **主进程 IPC 面** = 自有状态(projects/links/active)、派生快照读(task/feature board、详情、文档原文)、事件推送(回流)。UI 的**主数据面**。
- **插件 host 半身** = forge CLI 执行面(prompt 获取、会话发起、actor 透传)——「过渡 = 插件宿主半身 spawn CLI」的既定落位;不与主数据面重叠(看板数据不走 CLI,走快照)。

### Dependencies

| 依赖 | 类型 | 用途 | 纪律 |
|------|------|------|------|
| `node:sqlite` | 运行时内建 | 数据内核 | 零新增包;启动探针失败即显式错误路径(见 Error Handling) |
| `@xyflow/react` | 新增(插件 bundle 内) | 依赖树视图 | 不进壳、不进 preload;React 版本对齐宿主模块表(单一 React 实例,经 host-profile 模块解析外置) |
| cordis / 上游 client 服务 | 既有(基座交付) | 插件双半身、slots/locale 服务 | 消费不修改(TECH-ui-reuse-001、零侵入) |
| forge CLI(外部二进制) | 运行时解析 | DF001/DF004 | 解析序:工作台设置显式路径 → PATH → `ERR_FORGE_CLI_UNAVAILABLE`(错误引导);仅对已注册项目路径执行(PRD 边界约束) |
| vitest / Playwright | 既有 | 测试 | 沿用 M1 栈(decisions/testing) |

## Interfaces

### Interface 1: IPC 语义动词面 `dshForge.workbench.*`(preload 白名单扩展)

preload 新增一个 `dshForge.workbench` 命名空间;每动词映射唯一白名单通道,主进程逐 handler 校验 sender frame(TECH-electron-ipc-001)。完整类型:

```ts
type DocLocationType = 'in_repo' | 'external'
type DocKind = 'manifest' | 'prd' | 'design' | 'ui' | 'tasks'
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'
                 | 'suspended' | 'skipped' | 'rejected'
type FeatureStatus = 'prd' | 'design' | 'tasks' | 'in-progress' | 'completed' // forge manifest 词表透传
type ChangeSource = 'session' | 'terminal'

interface Project {
  id: string                      // crypto.randomUUID()
  displayName: string
  codeRoot: string                // 绝对路径,注册时规范化
  docLocationType: DocLocationType
  docLocationPath: string | null  // external 时非空且 ≠ codeRoot;in_repo 恒 null
  createdAt: string               // ISO 8601 UTC
  lastActivatedAt: string | null
}
interface RegisterProjectInput {
  codeRoot: string
  docLocationType: DocLocationType
  docLocationPath?: string | null // external 必填
  displayName?: string            // 缺省 = codeRoot 目录名
}
interface ProjectPatch {          // rename = displayName;repoint = 后两项(重扫后快照重建)
  displayName?: string
  docLocationType?: DocLocationType
  docLocationPath?: string | null
}
interface PluginRow { name: string; mandatory: boolean; enabled: boolean }
interface WorkbenchState { projects: Project[]; activeProjectId: string | null; plugins: PluginRow[] }

interface TaskSummary {
  key: string                     // forge 任务 ID,如 "2.1"
  title: string
  status: TaskStatus
  featureSlug: string
  blockers: string[]              // 上游 blocker 任务 key 列表(传递链由详情另行展开)
  branch: string | null           // 任务执行 git 分支(执行痕迹;无则 null)
  worktree: boolean
  source: ChangeSource | null     // 最近一笔变更来源
  updatedAt: string
}
interface TaskBoardData { tasks: TaskSummary[]; generatedAt: string; sync: SyncStatus }
interface TaskRecord { at: string; kind: string; source: ChangeSource | null; summary: string }
interface SessionLink {
  id: string; projectId: string; taskKey: string; sessionId: string
  status: 'active' | 'ended'; startedAt: string; endedAt: string | null
}
interface TaskDetail {
  summary: TaskSummary
  descriptionMarkdown: string     // 任务文件原文(渲染层防注入)
  depChain: { key: string; title: string; status: TaskStatus }[]  // 上游传递链(拓扑序)
  records: TaskRecord[]           // forge 执行记录
  links: SessionLink[]            // 挂接历史(新→旧)
}
interface FeatureSummary {
  slug: string; status: FeatureStatus
  docKinds: DocKind[]             // 实际存在的文档类(驱动 tab disabled)
  taskTotal: number; taskCompleted: number; updatedAt: string
}
interface FeatureBoardData { features: FeatureSummary[]; generatedAt: string }
interface FeatureDoc { kind: DocKind; markdown: string }
type SyncStatus = { state: 'idle' | 'scanning' | 'error'; lastScanAt: string | null; error?: string }

// —— 动词(每行 = 一个白名单通道 dsh-forge:workbench-<name>)——
workbench.getState(): Promise<WorkbenchState>
workbench.registerProject(input: RegisterProjectInput): Promise<Project>        // 校验失败 → ERR_*(见 Error Handling)
workbench.updateProject(id: string, patch: ProjectPatch): Promise<Project>      // repoint 完成即重扫
workbench.removeProject(id: string): Promise<void>                              // 级联清快照/挂接;不动项目文件
workbench.activateProject(id: string): Promise<void>                            // 单激活(事务内切换)
workbench.getTaskBoard(projectId: string): Promise<TaskBoardData>
workbench.getTaskDetail(projectId: string, taskKey: string): Promise<TaskDetail>
workbench.getFeatureBoard(projectId: string): Promise<FeatureBoardData>
workbench.readFeatureDoc(projectId: string, featureSlug: string, kind: DocKind): Promise<FeatureDoc>
workbench.listPlugins(): Promise<PluginRow[]>
workbench.setPluginEnabled(name: string, enabled: boolean): Promise<PluginRow[]> // mandatory → ERR_PLUGIN_MANDATORY
workbench.recordSessionLink(input: { projectId: string; taskKey: string; sessionId: string }): Promise<SessionLink>
workbench.endSessionLink(linkId: string): Promise<void>
workbench.onEvents(callback: (events: readonly WorkbenchEvent[]) => void): () => void  // 单订阅者语义动词

type WorkbenchEvent =
  | { type: 'task_updated'; projectId: string; taskKey: string
      source: ChangeSource | null; changeKind: 'attribute' | 'structural' }
  | { type: 'feature_updated'; projectId: string; featureSlug: string }
  | { type: 'sync'; projectId: string; sync: SyncStatus }
```

调用方:forge-workbench 插件 client 半身(UF1-UF6 视图)。事件推送通道 `dsh-forge:workbench-events`(主→渲染,批量节流 ≤500ms)。

### Interface 2: 插件 host 半身服务面(cordis 服务,client↔host rpc)

```ts
/** forge CLI 桥(DF001 过渡形态:spawn 执行完退出,足迹 = 2 不变)。 */
interface ForgeBridgeService {
  resolveCli(): Promise<{ path: string; version: string }>   // 设置显式路径 → PATH;失败 ERR_FORGE_CLI_UNAVAILABLE
  getTaskPrompt(input: { projectRoot: string; taskKey: string }): Promise<
    | { available: true; promptText: string }                // `forge prompt get-by-task-id <key>` 完整输出
    | { available: false; reasonCode: 'ERR_NO_PROMPT' | 'ERR_FORGE_CLI_UNAVAILABLE'; detail?: string }
  >
}

/** 会话发起(DF004)。主通道形态由 spike 定形;fallback 链见 Interface 5。 */
interface SessionLaunchService {
  launch(input: { promptText: string; title: string }): Promise<
    | { ok: true; sessionId: string }                        // 回传 → workbench.recordSessionLink
    | { ok: false; reasonCode: 'ERR_HOST_NOT_READY' | 'ERR_SESSION_CHANNEL_UNAVAILABLE'; detail?: string }
  >
}
```

### Interface 3: 感知面(DF003,主进程 indexer/watcher)

- watch 目标 = 激活注册项目的 `codeRoot/.forge/` 与文档位置 `docs/features/`(external 时为 `docLocationPath/docs/features/`),`fs.watch({ recursive: true })`;平台不支持递归(Linux 视 Node 版本)或 watcher 报错(如 `ERR_STREAM_WATCH` 过载)→ 降级为目录树非递归 watch,再降级 **2s 轮询扫描**(500 任务规模下仍满足 ≤5s 时效;PRD 性能基线的兜底路径)。
- 变更 → **400ms debounce** → 全量重扫(≤500 任务/50 feature,扫描为轻操作)→ 快照 diff → 属性级/结构性分类 → `WorkbenchEvent[]` 推送 + 快照 upsert。UI 侧按 ui-design「回流·属性级/结构性」口径增量呈现。
- **来源判定序**:① forge 记录中的 actor 标记(forge 仓最小配合:调用方透传环境变量 `FORGE_ACTOR`,值为 `session:<linkId>` 或缺省;spike SC8 验证可行性)→ ② 推断兜底:变更任务存在 `status='active'` 的挂接 → `[会话]`,否则 `[终端]`。两序均为只读消费,不写 forge 数据。

### Interface 4: 基座消费面(双层防护,G6 执行点)

- **产品清单(保护分区,只读)**:`apps/desktop/resources/plugin-bundles.json` 条目扩展 `"mandatory": true` 字段——forge-workbench 标注 `mandatory`(上游运行时 bundle `@deepseek-ai/dsh-base`/`dsh-web-app` 同标 mandatory,平台必需);hello-world(第三方 fixture)不标。清单为构建期产物,运行时零写入。
- **运行时启停覆盖文件(可写区)**:`<userData>/plugin-runtime.json`,schema: `{ disabled: string[] }`——**仅允许出现非 mandatory 条目**(解析即校验,违规条目剔除 + log)。host-profile 启停对账将其并入既有 bundle 对账流(禁用 → 该插件注入内容退出/启用 → 恢复,数据零损坏)。
- **壳侧守卫(单一写路径)**:运行时启停的唯一写入口 = `workbench.setPluginEnabled` IPC 动词 → host-profile 守卫函数;对 mandatory 名单内条目的禁用请求拒绝(`ERR_PLUGIN_MANDATORY`)+ log。UF6 对必备行不渲染禁用入口(ui-design SC6 行为口径)——守卫为纵深第二层,不依赖 UI 自觉。
- 必备身份**派生自产品级配置**(G6 约束):`PluginRow.mandatory` 由清单条目派生,运行时不另立名单。

### Interface 5: 会话发起通道(DF004,spike 后定形)

通道裁决留给首个 spike 任务(SC8 + DF004 联合侦察),**设计禁止预设结论**(PRD DF004 约束)。通道候选(按优先序侦察):

1. **插件 host 半身经宿主 cordis 服务创建会话**(host 半身与宿主同进程,若宿主暴露 session 创建/首消息服务则为最优:零外部通道);
2. **client 半身经渲染进程内 cordis 服务**(若上游 client 暴露会话服务);
3. **fallback(冻结)**:prompt 复制剪贴板 + 前置主窗 + toast 恢复引导(沿用 M1 Interface 5 fallback 模式,session-focus/index.ts 先例);M1 spike-3 已证 URL hash/postMessage/deep-link 三外部通道均不可用,不再重复侦察。

成功链:launch → sessionId → `recordSessionLink`(挂接索引)→ 切会话视图 + 会话定位(定位通道沿用 M1 fallback:前置 + toast;M1 已录 `dsh.sessions.current` localStorage poke 为 M2 候选增强,随通道侦察一并评估)。≤3s 预算(PRD)。

### Interface 6: forge 仓最小配合(Related Changes #2,spike 验证)

- `FORGE_ACTOR` 环境变量透传:forge CLI 将其记入任务执行记录(actor 字段或等价物);**forge 数据格式不变原则**——仅追加可辨来源信息,不产生第二事实源。
- 只读查询输出稳定性:`forge prompt get-by-task-id` 输出契约(退出码/文本完整性)确认。
- 两者均属 SC8 spike 结论门控项;forge 仓不改时的退化路径 = Interface 3 推断兜底 + Interface 5 fallback。

## Data Models

> Full database design in separate files.

**ER Diagram**: design/er-diagram.md
**SQL Schema**: design/schema.sql

### Field Quick Reference

| Model | Key Fields | Notes |
|-------|------------|-------|
| projects | id, display_name, code_root(UNIQUE), doc_location_type, doc_location_path, created_at, last_activated_at | 工作台自有 SoT;external 时 path ≠ code_root(CHECK) |
| app_state | key(PK), value(JSON) | `active_project_id` 单激活(应用层事务不变量) |
| session_links | id, project_id(FK CASCADE), task_key, session_id, status, started_at, ended_at | 挂接索引,工作台自有 SoT;UNIQUE(project_id, task_key, session_id) |
| task_snapshot | (project_id, task_key)(PK), feature_slug, title, status(7 态 CHECK), blockers(JSON), branch, worktree, source, updated_at | **派生缓存,可重建**;事实源 = forge 文件 |
| feature_snapshot | (project_id, feature_slug)(PK), status, doc_kinds(JSON), task_total, task_completed, updated_at | 派生缓存;status 为 manifest 词表透传('in-progress' 连字符形) |
| sync_state | project_id(PK FK), last_scan_at, status, error | 快照健康度;冲突即弃重建的判据之一 |

存储位置:`<userData>/workbench/workbench.db`(node:sqlite,WAL 模式);与 host-profile 目录(`基座对账域`)分立,不与上游 `$DSH_HOME` 混放(SC8 共存纪律延续)。

## Error Handling

### Error Types & Codes

`ERR_*` 前缀对齐 M1 惯例;IPC 动词 reject 序列化形态 `{ code, message, detail? }`,host 半身服务以 `reasonCode` 返回;全部经 shellLog 落本地日志(Monitoring:变更来源/挂接事件可查)。

| Error Code | 触发场景 | UI 呈现(PRD/ui-design 错误态) |
|------------|---------|------------------------------|
| ERR_CODE_ROOT_UNREADABLE | 路径不存在/不可读 | 向导步骤①错误文案 + 修正引导,停① |
| ERR_FORGE_NOT_DETECTED | code_root 未检出 forge 数据(`.forge/` 与文档位置均无) | 同上;引导修正或先初始化项目 |
| ERR_PROJECT_EXISTS | code_root 已注册(UNIQUE 冲突) | 提示已注册并定位既有项目卡片 |
| ERR_DOC_PATH_CONFLICT | 仓外文档路径 = code_root | 步骤②错误文案;「下一步」disabled |
| ERR_EXTERNAL_PATH_UNREADABLE | 仓外路径不可读/未完成授权 | 步骤②错误文案(授权说明块) |
| ERR_PROJECT_NOT_FOUND | id 失效(并发移除后残留调用) | 刷新 WorkbenchState + toast |
| ERR_FORGE_CLI_UNAVAILABLE | forge 二进制解析失败(设置路径与 PATH 均无) | UF5 发起失败对话框 + 恢复引导(设置显式路径);UF5 入口禁用态原因 |
| ERR_NO_PROMPT | 任务无执行 prompt | 按钮 disabled + tooltip 原因(UF5 校验规则) |
| ERR_HOST_NOT_READY | 宿主子进程未就绪 | 发起失败对话框(沿用 M1 恢复引导模式) |
| ERR_SESSION_CHANNEL_UNAVAILABLE | DF004 主通道不可用 | 自动落 fallback 链(剪贴板 + toast),不打断 |
| ERR_PLUGIN_MANDATORY | 对必备插件禁用(纵深第二层;UI 无入口,不可达路径) | 拒绝 + shellLog;返回当前 PluginRow[] |
| ERR_PLUGIN_RUNTIME_STATE | `plugin-runtime.json` 解析失败/含违规条目 | 剔除违规条目回退清单态 + log;插件区显示清单态 |
| ERR_WORKBENCH_DB | node:sqlite 启动探针失败/库文件损坏 | 壳级启动错误路径:快照可重建;自有态损坏 → 旧库改名备份(`workbench.db.corrupt-<ts>`)后重建空库 + 明确告知 |
| ERR_SNAPSHOT_STALE | 快照与 forge 文件校验不符(mtime/hash) | 静默触发重扫;连续失败 → sync error 态 + 「重试」 |

### Propagation Strategy

- **IPC 面**:main handler 捕获域错误 → reject `{code,...}` → client 半身按 code 映射 ui-design 对应错误态(表单内文案/错误卡/对话框);未知异常 → `ERR_WORKBENCH_DB` 级兜底 log + 通用错误卡。
- **host 半身服务面**:reasonCode 原样上抛至 client;`ERR_SESSION_CHANNEL_UNAVAILABLE` 不呈现为错误,直接进 fallback 链。
- **watcher/indexer 面**:感知失败不弹 UI——sync_state 置 error + `WorkbenchEvent.sync` 推送;看板顶栏轻量态 + 重试;连续 3 次失败退轮询。
- **启动面**:`node:sqlite` 探针(`process.features.sqlite` + 试开库)失败 = 显式启动错误(M1 崩溃恢复路径承接),禁止静默降级到无库运行。

## Cross-Layer Data Map

跨层字段(SQLite ↔ 主进程模型 ↔ IPC DTO ↔ 插件视图)——任务执行期类型决策 Ground Truth:

| Field Name | Storage Layer | Backend Model | API/DTO | Frontend Type | Validation Rule |
|------------|---------------|---------------|---------|---------------|-----------------|
| project.id | TEXT PK(uuid) | Project.id | string | string | uuid 格式;主进程生成 |
| codeRoot | TEXT UNIQUE | Project.codeRoot | string | string | 绝对路径规范化;存在且可读 |
| docLocationType/Path | TEXT + 行级 CHECK | DocLocationType / string? | enum + string? | 同 DTO | external → path 非空且 ≠ codeRoot |
| activeProjectId | app_state(JSON) | AppState | WorkbenchState.activeProjectId | string? | 指向存在项目;移除时事务内迁移/清空 |
| taskKey | 复合 PK TEXT | TaskSummary.key | string | string | forge ID 形如 `N.N` |
| task.status | CHECK 7 态 | TaskStatus | enum | enum(同词表,StateDot) | forge 词表透传 |
| blockers | JSON 数组 | string[] | string[] | string[] | 元素为有效 task_key(结构性删除时联动) |
| branch | TEXT NULL | string? | string? | string?(mono) | 展示级,无业务校验 |
| source | CHECK enum NULL | ChangeSource? | enum? | enum? | Interface 3 判定序产物 |
| feature.status | TEXT 透传 | FeatureStatus | enum | enum | manifest 词表(连字符 'in-progress') |
| docKinds | JSON 数组 | DocKind[] | DocKind[] | DocKind[] | ⊆ 五类;驱动 tab disabled |
| sessionId/sessionLink | session_links 行 | SessionLink | SessionLink | SessionLink | UNIQUE(project,taskKey,sessionId) |
| changeKind/events | —(运行时) | WorkbenchEvent[] | push 通道 | attribute/structural 分支 | ui-design 回流口径 |
| promptText | —(运行时) | ForgeBridge 产物 | string | string | 完整注入,渲染层防注入 |

## Integration Specs

> 本 feature 的 existing-page 集成均发生在**新建的工作台视图内部**与**上游继承视图**(无仓内路由,M1 spike-3 已证外部通道不可用;集成都经插件机制)。

### Integration: UF3 任务详情侧板 → 工作台 · 任务看板

- **Target File**: `packages/plugins/forge-workbench/src/client/views/TaskBoardPage.tsx`
- **Insertion Point**: 视图根容器右缘 dock 侧板(z100,不 mask 主区;由任务节点/行点击唤出,Esc/✕/外点关闭,焦点锁定)
- **Data Source**: `workbench.getTaskDetail(projectId, taskKey)`(summary + 描述 markdown + 依赖链 + 执行记录 + 挂接历史一次装配)

### Integration: UF5 会话发起入口 → UF2 节点卡 / UF3 侧板 + 跳转上游会话视图

- **Target File**: `packages/plugins/forge-workbench/src/client/views/TaskBoardPage.tsx`(节点卡 hover 按钮)+ `TaskDetailPanel.tsx`(整宽主按钮)
- **Insertion Point**: 节点卡右上角 hover/:focus-within 显现按钮(28×28)/ 侧板头部主按钮
- **Data Source**: `ForgeBridgeService.getTaskPrompt`(可用性探针 → disabled+tooltip)→ `SessionLaunchService.launch` → `workbench.recordSessionLink`;跳转 = 切上游会话视图(定位沿用 M1 fallback:前置 + toast;localStorage poke 随 DF004 侦察评估)

### Integration: UF6 插件管理区 → 工作台 · 项目概览

- **Target File**: `packages/plugins/forge-workbench/src/client/views/OverviewPage.tsx`
- **Insertion Point**: 项目卡片 grid 之下的区块卡(r14 · bg-layer-2 · pad 14,标题「插件」)
- **Data Source**: `workbench.listPlugins()` / `workbench.setPluginEnabled(name, enabled)`(必备行不渲染动作按钮)

### Integration: 壳级导航注入(双视图切换)

- **Target File**: 上游 SPA 导航容器(确切槽位名 = 首个 UI 任务源码侦察结论,落 spike 档;候选 = 上游侧边栏顶级导航槽)
- **Insertion Point**: 顶级「工作台」导航项(kanban icon,与「会话」并列);**降级** = 插件内自绘 slim rail(48px 左缘,契约见 ui-design Navigation 节)
- **Data Source**: 视图切换状态(会话期内存,不持久化);上游 GUI 不重载、不丢会话状态

## Testing Strategy

### Per-Layer Test Plan

| Layer | Test Type | Tool | What to Test | Coverage Target |
|-------|-----------|------|--------------|-----------------|
| main/workbench/store | Unit | vitest(tmp 库文件) | 迁移幂等/版本递增;repos CRUD;UNIQUE/CHECK/级联;单激活事务不变量 | ≥80% 行 |
| main/workbench/registry | Unit | vitest | 校验矩阵:检出/未检出、路径冲突、external 授权、已注册冲突 | ≥80% |
| main/workbench/indexer | Unit | vitest + fixture 树 | forge 文件解析→快照 upsert;diff 属性级/结构性分类;来源判定两序(actor 标记/挂接推断);快照可重建性(DROP 后重建等价) | ≥80% |
| main/workbench/watcher | Unit | vitest(fake timers) | debounce 合流、watcher 报错降级链(递归→非递归→轮询) | ≥80% |
| host-profile 守卫 | Unit | vitest | mandatory 拒绝 + log;plugin-runtime.json 违规条目剔除;启停对账(禁用→退出/启用→恢复,数据零损坏断言) | ≥80% |
| 插件 client 视图 | Unit | vitest + jsdom | 视图状态机(loading/empty/error/populated)、UF6 无禁用入口、markdown 渲染禁 raw HTML/外链 | 视图主路径 |
| SC 验收腿 | E2E | Playwright `_electron` | SC1-SC7 各一腿(对齐既有 e2e 目录惯例)+ 回流 ≤5s 断言 | SC 全绿 |

### Key Test Scenarios

- **SC1**:fixture 项目(生成器造 500 任务/50 feature)注册 → 看板与 `forge task list` 输出一致性断言 + 首屏计时 ≤2s(CI 宽松阈值防抖动)。
- **SC2/SC3**:stub 宿主会话链——发起 → prompt 完整注入断言 → 模拟 agent claim(forge CLI 真实执行,带 FORGE_ACTOR)→ 看板 ≤5s 回流 + 来源[会话]标记。
- **SC5**:仓外文档 fixture 目录注册 → 看板/feature/文档全通;路径失效 → 错误态 + 重新指向恢复。
- **SC6**:hello-world 启停往返(注入内容退出/恢复,forge 数据 hash 前后一致);直接篡改 plugin-runtime.json 塞必备名 → 启动剔除 + log。
- **SC7**:双形态交替——e2e 内真实 forge CLI 写 + 应用读,往返断言无损坏。
- **回归**:M1 既有 e2e 腿(shell/tray/sc7-smoke 等)不回归。

### Overall Coverage Target

`apps/desktop/src/main/workbench/` 单测行覆盖 ≥80%;e2e 以 SC1-SC7 腿全绿为准(SC8 为 spike 归档件,非 e2e)。

## Security Considerations

<!-- Override: Security Review enabled by PRD signal「权限/子进程与路径授权边界」 -->

### Threat Model

| # | 威胁 | 面 |
|---|------|----|
| T1 | renderer→main IPC 越权(新增动词面) | preload/IPC |
| T2 | forge CLI 参数注入(路径/任务 key 拼接) | host 半身 spawn |
| T3 | markdown 内容注入(任务描述/五类文档/执行记录) | 渲染层 |
| T4 | 未授权路径执行/读取(仓外越界) | registry/indexer |
| T5 | 运行时启停状态篡改(手改 plugin-runtime.json 绕过必备保护) | 基座消费面 |
| T6 | 任务 prompt 经会话通道的指令注入 | DF004 |
| T7 | 数据内核文件直改(workbench.db 篡改/损坏) | 存储 |

### Mitigations

- **T1**:每 handler 校验 sender frame(TECH-electron-ipc-001 延续);动词↔通道一一白名单;无通配动词。
- **T2**:spawn 一律参数数组(无 shell 字符串拼接);`cwd` 与路径参数限定**已注册项目路径集合**;taskKey 走 `^\d+(\.\d+)*$` 白名单正则;CLI 退出码/输出尺寸上限防护。
- **T3**:markdown 只读渲染禁 raw HTML/脚本/外链跳转离开应用(ui-design 全局规则);文档经 IPC 返回纯文本,渲染用上游既有渲染组件或等价 sanitize 配置;渲染区无交互元素。
- **T4**:仓外路径注册时显式授权确认(向导步骤②);每次读取前复验存在性(失效→错误态,不静默);注册信息移除不触碰项目文件。
- **T5**:双层防护(Interface 4)——运行时状态 schema 仅纳第三方 + host-profile 对账守卫;必备名单只读派生自产品清单,篡改 userData 文件无法摘除必备装配。
- **T6**:prompt 作为**用户消息数据**经宿主会话 API 注入(非系统指令、非 shell、不 eval);会话内行为由既有审批 UI 把关。
- **T7**:库文件权限沿用 userData 默认;损坏路径显式备份重建(ERR_WORKBENCH_DB);不含凭据(PRD:不新增凭据存储,凭据沿用 $DSH_HOME)。

## PRD Coverage Map

| PRD Requirement / AC | Design Component | Interface / Model |
|----------------------|------------------|-------------------|
| G1 任务可视化(≤2s/500 任务/全覆盖维度) | indexer + task_snapshot + TaskBoardPage(@xyflow) | Interface 1 getTaskBoard / Interface 3 |
| G2 会话挂接(1 击/prompt 100% 注入/挂接可回溯) | SessionLaunchService + recordSessionLink + UF5 入口 | Interface 2 / Interface 5 / session_links |
| G3 状态时效(≤5s 免刷新) | watcher + indexer diff + 事件推送 | Interface 3 / WorkbenchEvent |
| G4 feature 看板 | feature_snapshot + readFeatureDoc + FeaturesPage | Interface 1 / DocKind |
| G5 项目管理(≤3 步/单激活/仓外可选) | registry + projects/app_state + 向导视图 | Interface 1 register/activate / projects |
| G6 两级插件模型 | 双层防护 + bundle 装配 + UF6 视图 | Interface 4 / PluginRow |
| SC1 数据一致性 | indexer(forge 文件为源)+ e2e 腿 | Testing SC1 |
| SC2/SC3 零终端闭环 + 注入链路 | launch 链 + FORGE_ACTOR + 回流 | Interface 2/3/5/6 |
| SC4 feature 看板/五类文档 | feature_snapshot.doc_kinds + readFeatureDoc | Interface 1 |
| SC5 仓外文档 | docLocationType/Path + 读取复验 | projects / ERR_EXTERNAL_* |
| SC6 两级模型行为 | 守卫 + UF6 无禁用入口 + 启停往返 | Interface 4 |
| SC7 双形态交替 | forge 文件 SoT + watcher 感知 | Interface 3 / Testing SC7 |
| SC8 spike 落档 | 首个任务:语义等价 + DF004 通道侦察 | Open Questions #1-#3 |
| Story1 注册向导(3 步/编辑模式) | registry 校验矩阵 + Wizard 组件 | ERR_* 向导行 |
| Story2/3 看板浏览 + 详情 | TaskBoardPage + TaskDetailPanel | getTaskBoard/getTaskDetail |
| Story4 feature/文档浏览 | FeaturesPage | getFeatureBoard/readFeatureDoc |
| Story5 发起/回流/回溯 | UF5 链 + session_links 历史列表 | Interface 5 / recordSessionLink |
| Story6 项目管理(切换/移除/重命名/重指向) | OverviewPage + ProjectPatch | updateProject/removeProject |
| Story7 插件管理两级 | OverviewPage 插件区 + 守卫 | listPlugins/setPluginEnabled |

## Open Questions

- [ ] 上游顶级导航槽位确切名称与可用性(首个 UI 任务源码侦察前置;结论与降级裁决落 design/spike 档;两形态行为契约已冻结于 ui-design)
- [ ] DF004 会话创建通道形态(Interface 5 候选序;fallback 已冻结可用,不阻塞)
- [ ] `FORGE_ACTOR` 透传的 forge 仓最小改造面(SC8 spike 结论;不改则退化 Interface 3 推断兜底)
- [ ] 会话结束事件可得性(session_links status→ended 迁移;不可得时由发起侧收敛,已列兜底口径)

## Appendix

### Alternatives Considered

| Approach | Pros | Cons | Why Not Chosen |
|----------|------|------|----------------|
| JSON 文件存工作台状态 | 零依赖实现快 | 无事务/索引;挂接并发写与 ≤5s diff 成本高 | 偏离 SQLite 方向声明;D1 裁决 |
| better-sqlite3 | API 成熟 | 原生模块需三平台 electron 重编译 | node:sqlite 内建零重编译(Electron 44/Node ≥22.20) |
| 全部逻辑进插件 host 半身(含自有状态存储) | G6 最纯净 | 数据内核方向声明明确落 Electron 壳;项目/挂接为应用自有态非 forge 能力 | decisions/architecture 2026-09-21 |
| 看板数据走 CLI 查询 | 单一数据面 | CLI 无 watch;按需 spawn 纪律与 ≤5s 感知冲突 | DF003 文件感知为 PRD 既定 |
| 壳级 shell-ui rail 载体 | 实现确定 | 视图切换 chrome 入壳,与 G6 有张力 | D3 裁决(仅最后兜底) |
| 自绘 DAG SVG | 零新依赖 | pan/zoom/键盘遍历/焦点管理自担,回归面大 | D4 裁决(@xyflow/react) |
| chokidar 监听 | 平台兼容成熟 | 新增依赖 | fs.watch + 降级链已满足 ≤5s;离线/足迹纪律 |
| SQLite 直写 forge 数据(双写) | 查询最强 | 第二事实源,违 SoT 纪律 | PRD 明令禁止 |

### References

- PRD: [prd/prd-spec.md](../prd/prd-spec.md)(2026-09-22 修订版,DF001-DF005/G1-G6/SC1-SC8)
- UI 设计: [ui/ui-design.md](../ui/ui-design.md)(eval 961/1000;原型已批准)
- M1 先例: `docs/features/dsh-forge-m1/design/tech-design.md`(IPC 白名单模式/session-focus fallback 先例)
- 基座: `docs/proposals/ui-plugin-foundation/proposal.md`(产品级配置/两级模型/CLI 退役方向)
- 约定: `docs/conventions/electron-ipc-security.md`(TECH-electron-ipc-001)、`docs/conventions/ui-reuse.md`(TECH-ui-reuse-001)
- 决策: `docs/decisions/architecture.md`(2026-09-20/21 行:两级模型/数据内核/CLI 退役/基座硬前置)
