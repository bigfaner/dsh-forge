---
created: "2026-09-28"
prd: prd/prd-spec.md
status: Draft
---

# Technical Design: dsh-forge M4 项目中心工作台(IA 基石)

> 设计输入:prd/prd-spec.md(2026-09-27 修订,SC8 废止 #27)+ prd/prd-user-stories.md(6 故事,故事 3 裁撤)+ prd/prd-ui-functions.md(UF1-UF10,UF4 裁撤)+ ui/ui-design.md + ui/workbench-layout-v2.md(v2.12 + 裁决 #1–#27;布局权威)。
> 测试语言(Step 0 判定):TypeScript;vitest 单测 + Playwright `_electron` e2e(`docs/conventions/testing.md`,单文件惯例;root `playwright.config.ts` 双 lane,`workers:1` 实例锁纪律)。
> 硬前置:dsh-forge-m3 完成。上游权威:`docs/decisions/project-storage-and-knowledge.md` §5 v2(D11 三层身份/证据三档/零 git 强制);workspaceRegistry/SubagentAddress 契约以 vendored `c36ba648` 源码为唯一权威(2026-09-28 双路侦察核实)。
> 侦察基线:上游 AppFrame = sidebar(全局)+ main(keyed,默认 `conversation`)+ rightbar(全局 dockkit,原生 pane 分割;float = 应用内浮层非 OS 窗口);`ctx.uiWorkspace.openSession(SessionId | SubagentAddress)` 统一收参;workspaceRegistry 按 canonical path 幂等 create、cwd 自动归组、delete 保目录与会话、`insertBefore` 排序;上游客户端包 client 入口仅导出 types/inject/apply(内部组件不可导入)。

## Overview

M4 在 M3 的**双载体**(Electron 数据内核 + forge-workbench 插件双半身)上完成四条交付线,不引入第三载体;工作台本体走**原生 home 增强层**路线(裁决 T1,2026-09-28):

1. **项目中心 IA(增强层)**:`project` 工作台 = 原生 conversation 面板(`selectPanel(null)`,默认即启动首屏)+ 左栏 `sidebar.workspaces` 座位 forge 项目树(数据面 = 上游 `ctx.workspaces`/`ctx.sessions` 原生服务 + 内核项目注册表;行语言按 C3 规格自绘——上游组件不导出,复用数据面,记对账备忘)+ 原生 rightbar(dockkit)挂 forge tabs(开始/概览/文档/依赖图/任务看板)。旧 workbench TabBar 视图族退役:任务看板 = `TasksView` 组件化双宿主(右栏 pane + 拆出窗口);提案板/feature 面收纳进右栏概览子 tab(M3 面零缩水);`workbench/overview` 保留为过渡逃生门(偏好/插件面宿主 = 开放项,用户裁决「暂时忽略」2026-09-28)。
2. **任务↔会话反查(C5/C6)**:`TaskDetailPanel` 挂接历史节增强(行展开血缘后代 + [打开]);顶层打开 = `ctx.uiWorkspace.openSession(sessionId)`(session-handover 既有缝,唯一写路径;M1 sessionFocus 主进程通道 = 冻结 fallback 保留),subagent 打开 = `openSession(SubagentAddress)`(原生收参)。血缘推断 = **client 半身只读推导服务**(上游会话快照 `subagentsByParent` + 内核 session_links join;≤100ms,超时降级仅顶层;不落库);C6 元数据条 = 会话域槽注入。命名约定 = 内核预合成**追加行**两行化(追加行在 Go 对拍集外,模板基线零影响)。
3. **workspaceRegistry 单向投影**:内核 projection 域(期望状态 + diff 纯函数)→ IPC 事件 → client relay **直调上游 `workspaceController` remote 动词**(create/rename/delete/insertBefore;零新增 host 半身代码,写仍在宿主进程内执行);对账输入 = client 上报原生 workspace 快照(follow 流);归档 = 纯 forge 侧状态(dsh 侧 workspace 保留);降级 = degraded 标记不阻断。会话归组零代码:上游按 header.cwd canonical 匹配 workspace path(DF002 原生承载)。
4. **分屏/多窗口 + 布局记忆**:分屏 = 原生 rightbar 多 pane(forge 看板 tab kind + 会话旁置 `subagentchat` aside 先例);多窗口 = **壳层窗口注册表**(第二 BrowserWindow 同源 SPA 重载 + 主进程 window-role 握手 + 每窗事件推送/carriage 泛化——原生 float 为应用内浮层,不满足 OS 窗口);布局记忆 = SQLite `project_ui_state`(FK cascade,项目删除即清除)。

零新增 npm 依赖;进程足迹 2 不变;IPC 面沿用动词白名单模式(v3)。

### 关键裁决记录(2026-09-28,AskUserQuestion 确认 + 设计内定)

| # | 裁决 | 结论 | 主要理由 |
|---|------|------|---------|
| T1 | 工作台承载形态 | **原生 home 增强层**(A) | conversation/composer/hero/轨迹 100% 原生,零重挂载风险;启动首屏天然成立;rightbar pane 分割原生;回归面最小 |
| T2 | 血缘推断位置 | client 半身推导服务 | 会话数据局部性在 renderer(上游快照 + `subagentsByParent` 原生索引);内核只见 session_links;只读 join、不落库、可随时重算 |
| T3 | 投影写通道 | client relay 直调上游 `workspaceController` remote 动词 | verbs 已在宿主 typert 面(sessionController.follow 先例);零上游修改、零新 host 代码;内核持期望状态、幂等全量重推 |
| T4 | 布局记忆载体 | SQLite `project_ui_state` | PRD「项目删除随之清除」→ FK cascade;e2e 重启可断言;视图选项(分组×排序)留 localStorage(用户级) |
| T5 | 多窗口握手 | 主进程 window-role(经 preload verb),不走 URL hash | M1 spike-3 禁 URL hash 纪律;typed、无 URL 语义面 |
| T6 | 存储边界 | 仅 D11 三层身份 + 证据三档 + 确认卡;影子 git 与 runtime_root ①②顺延存储实现里程碑 | 用户裁决;O7 本就留待存储实现 PRD;C7 卡面文案微调(对账备忘) |
| T7(内定) | 遗留归宿 | 20 技能(→M6 收口期)/ 四 CLI 动词 GUI 归宿(→M5/M6)顺延记账 | 用户裁决;M4 聚焦 IA |

## Architecture

### Layer Placement

| 层 | 落位 | M4 新增 |
|----|------|---------|
| Electron 主进程(壳内核) | `apps/desktop/src/main/workbench/` | `projects-identity/`(D11 归一化管线 + 三层比对 + 证据侦测)、`projection/`(期望状态 repo + diff 纯函数 + 对账 service)、`ui-state/`(布局记忆 repo+service)、ipc 动词 v3 |
| Electron 主进程(壳窗口) | `apps/desktop/src/main/` | `windows/`(窗口注册表 + detached 开窗/收回 + window-role 供给 + 每窗事件推送/carriage 泛化) |
| 插件 client 半身 | `packages/plugins/forge-workbench/src/client/` | 左栏项目树浏览器(座位注入)、右栏 forge tabs(guide/概览/看板/文档/依赖图)、C5 LinkHistory 增强、C6 元数据条、C7 确认卡、`lineage/` 推导服务、projection relay、window-role boot、panellist「项目」行 |
| 插件 host 半身 | `packages/plugins/forge-workbench/src/host/` | **无新增**(projection relay 直调上游 remote;dispatch-launch/approval-bridge 沿用) |
| 上游 vendored | `packages/desktop-host-vendor/` | **零修改**(全经槽位声明合并 + 既有 remote/服务面) |

### Component Diagram

```text
┌ Electron 主进程(壳)────────────────────────────────────────────────┐
│ workbench/projects-identity  D11 归一化/三层比对/证据侦测(主进程路径校验)│
│ workbench/projection         期望状态 + diff(四操作/偏差) + 对账 service │
│ workbench/ui-state           project_ui_state repo(布局记忆)          │
│ windows/                     窗口注册表 · detached 开/收回 · role 供给   │
│ workbench/ipc                dshForge.workbench.* v3 动词(白名单扩展)   │
└──┬ IPC(contextBridge 白名单)─────────┬ push(每窗 fan-out)──────────┘
   │                                    │
┌──▼ 渲染进程(上游 SPA + forge client 半身)──────────────────────────┐ │
│ 左栏:sidebar.workspaces 座位 ← forge 项目树浏览器                     │ │
│   (数据 = ctx.workspaces/ctx.sessions 原生 + IPC 项目注册表)          │ │
│ 中间:原生 conversation 面板(selectPanel(null)= 启动首屏)             │ │
│   └ C6 元数据条(会话域槽注入,仅 subagent 实例)                       │ │
│ 右栏:原生 rightbar(dockkit)← forge tabs:开始/概览/文档/依赖图/看板   │ │
│ lineage/ 推导服务(上游会话快照 ⊕ session_links 只读 join,≤100ms)     │ │
│ relay:projection(client↔上游 remote)· window-role boot              │ │
│ C7 确认卡(左栏 ＋ 原位,唯一入口)· C5 dock 挂接历史增强               │ │
└──┬ cordis rpc(typert)────────────────────────────────────────────┘ │
┌──▼ dsh 宿主子进程(上游)─────────────────────────────────────────┐   │
│ workspaceController(create/rename/delete/insertBefore + follow 流) │◄─┘
│ workspaceRegistry($DSH_HOME/storages/workspace.json,单写者=宿主)   │
│ sessionController / sessions / subagent(SubagentAddress)          │
└───────────────────────────────────────────────────────────────────┘
```

### Dependencies

| 依赖 | 类型 | 用途 | 纪律 |
|------|------|------|------|
| 上游 `workspaceController`/`sessionController` remote 面 | 既有(vendored) | 投影四操作 / 会话打开与创建 | duck-typed 结构面声明(dispatch-launch `channel.ts` 先例);契约漂移走 vendored 升级显式适配 |
| 上游 `ctx.workspaces`/`ctx.sessions` 快照服务 | 既有 | 左栏数据面 / 血缘索引(`subagentsByParent`) | 只读消费 |
| 上游槽位系(`sidebar.workspaces`/`sidebar.panellist`/`conversation.session*`/`sidebar.right.pane.tab`) | 既有 | 全部 UI 注入点 | 声明合并纯增量;`@deepseek-ai/dsh-client-*` 对齐线 exact ≡ desktopHostVersion |
| `node:sqlite` | 既有内建 | v3 增量迁移(挂载点已在 `migrate.ts` 预留) | 四件套载体纪律延续 |
| vitest / Playwright `_electron` | 既有 | 单测/e2e | `workers:1` 实例锁纪律 |

## Interfaces

### Interface 1: 内核 IPC 动词面 v3(`dshForge.workbench.*` 白名单扩展)

通道命名沿用 `dsh-forge:workbench-<kebab-verb>`;channel-allowlist 双份常量 + 漂移测试延续;事件复用 `dsh-forge:workbench-events` 批量通道(≤500ms)。核心类型与动词:

```ts
// —— C7 侦测与注册(D11 三层身份 + 证据三档)——
type DetectReport = {
  input: string
  canonicalPath: string | null          // realpath.native 失败 → null(identityVerified=false 字符串归一回退)
  pathKey: string | null                // 平台折叠比较键(win32 大写折叠;应用层单源)
  identity: { dev: string; ino: string } | null
  exists: boolean; isDir: boolean; readable: boolean
  registered: { projectId: string; displayName: string } | null   // pathKey 或 (dev,ino) 命中 → 快车道
  gitRoot: string | null                // 仅顶层 .git(固定前缀有界探测,禁 glob)
  forgeTreeHit: boolean                 // <root>/docs/features 一次 readdir + manifest 存在性
  childRepos: Array<{ name: string; path: string }>  // 直接子目录 ≥2 .git → chips
}
probeProjectPath(input: { path: string }): Promise<DetectReport>
registerProject(input: {                // v2 入参(硬校验仅 2 条:存在+目录+可读;唯一)
  anchor: string
  displayName?: string                  // 缺省 = 文件夹名
  docsPlacement: 'repo-existing' | 'repo-new' | 'app' | 'custom'
  docsPath?: string                     // repo-new/custom 必填;app = 内核派生
  customAuthorized?: boolean            // custom 必填 true(BIZ-001/003 收窄)
}): Promise<Project>                    // BEGIN IMMEDIATE;成功 → 投影期望 push(事件),失败降级不阻断

// —— 项目生命周期(投影四操作)——
renameProject(input: { projectId: string; displayName: string }): Promise<Project>   // 纯 DB 更新,零 fs
archiveProject(input: { projectId: string }): Promise<Project>    // archived=1;dsh 侧不动(workspace 保留)
restoreProject(input: { projectId: string }): Promise<Project>
removeProject(input: { projectId: string }): Promise<void>        // 既有动词语义扩展:投影 delete + FK cascade + 拆出窗关闭
listProjects(): Promise<Project[]>                                // 返回扩展 archived/sortOrder/projectionState/docsPlacement

// —— 投影(P3)——
type ProjectionState = 'pending' | 'healthy' | 'degraded' | 'deviation'
type DeviationRow = { type: 'renamed' | 'deleted' | 'reordered'; detail: string }
type ProjectionOp =
  | { kind: 'ensure'; canonicalPath: string; title: string }
  | { kind: 'rename'; workspaceId: string; title: string }
  | { kind: 'delete'; workspaceId: string }
  | { kind: 'reorder'; orderedIds: string[] }        // 仅 forge 所属子集相对序,不动用户自有 workspace
type ProjectionPlan = { projectId: string; ops: ProjectionOp[] }    // 幂等全量重推
retryProjection(input: { projectId: string }): Promise<{ state: ProjectionState }>
getProjectionStatus(input: { projectId?: string }): Promise<ProjectionStatusRow[]>
submitWorkspaceSnapshot(input: { workspaces: Array<{ workspaceId: string; path: string; title: string; orderIdx: number }> }): Promise<void>  // 对账输入(client 上报原生快照,debounce)
reportProjectionOutcome(input: { projectId: string; ok: true } | { projectId: string; ok: false; error: { code: string; message: string } }): Promise<void>

// —— 布局记忆(P4)——
getProjectUiState(input: { projectId: string }): Promise<{ layout: ProjectLayout }>
setProjectUiState(input: { projectId: string; layout: ProjectLayout }): Promise<void>  // 客户端 debounce;schema 白名单校验
```

事件 v3 扩展(`WorkbenchEvent`):`projection_push_required { projectId, plan }`(relay 消费)· `projection_updated { projectId, state, deviations? }` · `project_list_changed {}`。

### Interface 2: 投影通道(client relay 直调上游 remote)

```ts
// 结构面声明(duck-typed,dispatch-launch channel.ts 先例;以 vendored types.ts 为准)
interface WorkspaceChannel {
  create(path: string, title?: string): Promise<{ workspaceId: string; path: string; title: string }>
  rename(workspaceId: string, title: string): Promise<void>
  delete(workspaceId: string): Promise<boolean>            // 幂等
  insertBefore(workspaceId: string, beforeId?: string): Promise<readonly string[]>
}
// relay 流:内核 projection_push_required(plan)→ 按 ops 顺序执行 → reportProjectionOutcome 回填
// 执行序:ensure(按 forge sort_order 升序)→ rename → reorder(insertBefore 链)→ delete
// 上游错误码映射:workspace/invalid-path | name-conflict | move-invalid → ERR_PROJECTION_OP_FAILED(detail 携原码)
// relay 不在场(渲染未装载/启动竞态):plan 保留(期望状态在库),重试 = retryProjection;禁静默丢弃
```

会话归组零代码:上游按 header.cwd canonical 匹配 workspace path——派发会话 cwd=anchor 即自动归组(DF002 由原生机制承载)。

### Interface 3: 血缘推导服务(client 半身,纯只读)

```ts
type SubagentHit = {
  sessionId: string; parentSessionId: string; title: string
  running: boolean; depth: number
  address: { parentSessionId: string; childSessionId: string; mode: 'one-shot' | 'continuable' }  // SubagentAddress
}
type TaskBinding = {
  links: Array<{ sessionId: string; status: 'active' | 'ended'; startedAt: string; endedAt?: string }>  // 新→旧
  executingSubagents: SubagentHit[]     // active 挂接顶层会话血缘树内 origin='subagent' 后代(递归)
  sessionTaskBadges: Array<{ sessionId: string; taskKey: string; title: string }>  // 反向徽标(命名辅助)
  degraded: boolean                      // 计算 >100ms 或上游快照缺席 → 仅顶层;恢复自动回完整
}
// 输入 = 上游 ctx.sessions 快照(SessionListState.byId + subagentsByParent)+ 内核 session_links(经 get-task-detail)
// ended 挂接:会话已 disposed → byId 缺席 → 行可展开但血缘位「不可用」(C5 Inference-degraded)
// 执行中判定(BIZ-workbench-008):isExecuting = task.status==='in_progress' && links 存在 active 行
```

### Interface 4: 布局记忆(ProjectLayout blob,项目域)

```ts
type ProjectLayout = {
  version: 1
  sidebar: { collapsed: boolean; width?: number }                 // 264–420
  tree: { expandedProjects: string[]; expandedSessions: string[]; overflowOpen: string[] }
  rightbar: { widthPct?: number; panes: Array<{ tabs: Array<{ kind: TabKind; topic?: string }> }> }  // 钳制 30–70
  detached: Array<{ view: 'board' | 'conversation'; target?: SessionTarget; rect?: Rect }>           // C10 窗口集
}
type TabKind = 'guide' | 'overview' | 'board' | 'doc' | 'depgraph'
// 分组×排序视图选项 = localStorage(用户级,C3 口径),不入项目域 blob
// 恢复 = 重放 open 操作序列(openTab/openResource/setWidth);原生 rightbar 自身持久化(会话域)不动,双轨不冲突(粒度不同)
```

### Interface 5: 壳层窗口管理(新 shell 动词组,非 workbench 前缀)

```ts
type WindowRole =
  | { kind: 'main' }
  | { kind: 'detached'; windowId: string; projectId: string; view: 'board' | 'conversation'; target?: SessionTarget }
windowOpenDetached(input: { projectId: string; view: 'board' | 'conversation'; target?: SessionTarget; rect?: Rect }): Promise<{ windowId: string }>
windowGetRole(): Promise<WindowRole | null>     // 新窗 boot 经 preload 查询(typed 握手,不走 URL hash)
windowRecall(input: { windowId: string }): Promise<void>
// push:dsh-forge:window-changed { type: 'detached-opened' | 'detached-closed'; windowId; projectId; view; target? }
// OS 标题栏关闭 ≡ windowRecall(主窗 pane 原位恢复,不待重启);主窗关闭 = 退出应用(M1 语义,detached 随之关闭)
```

壳层泛化:窗口注册表(主窗 + detached 集);事件推送按 webContents fan-out(订阅登记逐窗,destroyed 自动退订);carriage/WS 改写逐 webContents 注册;新窗同 `SHELL_WEB_PREFERENCES`(contextIsolation/sandbox,will-navigate 锁 `dsh-app:`)。

### Interface 6: 会话打开通道(C2/C5 消费)

```ts
openSessionTarget(target: SessionId | SubagentAddress): Promise<void>
// 顶层:ctx.uiWorkspace.openSession(sessionId)(session-handover 既有缝,唯一写路径)
// subagent:同 API 原生收参 SubagentAddress(地址来自 lineage 服务 hit;mode 取上游 SubagentListEntry.mode)
// 旁置(右栏 pane):ctx.sidebarRight.openResource(subagentChatAddress(address), { preferNewPane: true })(ui-subagent 先例)
// M1 sessionFocus 主进程通道 = 冻结 fallback 保留,不参与 M4 链路
```

### Interface 7: 派发追加行扩展(Story 7 命名约定)

```ts
// 内核 dispatch/presynth 追加行 = 两行(归因 + 命名);追加行不在 Go 对拍集内,模板基线零影响
appendix = `${attributionLine}\n${namingLine}`   // namingLine:「执行本任务时,你 spawn 的 subagent 会话须以『<taskKey> <title>』命名」
// prompt_hash 口径不变 = sha256(预合成内容 + 追加行全文);e2e 断言口径由「恰好一行」更新为「恰好两行 + 逐行前缀对拍」(M4 specs)
```

## Data Models

> Full database design in separate files.
> **ER Diagram**: design/er-diagram.md
> **SQL Schema**: design/schema.sql(v3 增量;v1/v2 表全保留)

### Field Quick Reference

| Model | Key Fields | Notes |
|-------|------------|-------|
| projects 增列 | code_root_key(UNIQUE)/identity_dev/identity_ino/identity_verified、archived、sort_order、docs_placement、custom_authorized、projection_state、workspace_id | D11 三层身份(展示路径 code_root 不参与比较);归档=纯 forge 侧;sort_order=注册序=投影顺序权威;docs_placement 承证据三档+custom('legacy'=迁移前值冻结);projection_state 单值状态机 |
| project_ui_state [NEW] | (project_id)(PK)、layout_json、updated_at | 布局记忆(C9/C10):sidebar/tree/rightbar panes/detached 窗口集;FK cascade = 项目删除即清除(PRD 语义) |
| workspace_projection [NEW] | (project_id)(PK)、workspace_id、path、title、order_idx、pushed_at、last_error | 投影期望状态快照(最近成功 push);偏差 = diff(此表 ∪ projects 期望 vs client 上报 workspace 实况);path 冗余 anchor 用于 dsh 侧删除重建后的 ensure 定位 |

**迁移回填(v3 事务内 TS)**:code_root_key/identity ← 归一化管线(realpath best-effort;失败 → 字符串回退 + `identity_verified=0`,不阻断);`in_repo`→`repo-existing`、`external`→`custom`(授权在案)/`app`;sort_order ← created_at 序;存量 projection_state=`pending`(待对账收数)。

存储:沿用 `<userData>/workbench/workbench.db`;载体四件套(TECH-data-kernel-001):`design/schema.sql` = 设计投影,运行时 = `schema-v3.ts` 内联常量 + `migrate.ts` 追加 `{version:3}` 段(含 TS 回填),漂移对账测试强制同步;PRAGMA 不入 DDL。

## Error Handling

### Error Types & Codes

| Error Code | 触发场景 | UI/会话呈现 |
|------------|---------|------------|
| ERR_PROJECT_EXISTS(既有,语义升级) | pathKey 或 (dev,ino) 命中已注册项目 | 确认卡 Registered 态(禁用 + 快车道 toast「已注册 · 打开」) |
| ERR_CODE_ROOT_UNREADABLE(既有) | 硬校验:存在+目录+可读 | 卡内 Missing 态,留在卡修正 |
| ERR_EXTERNAL_PATH_UNREADABLE(既有,收窄) | custom 高级路径授权复检失败 | 授权行错误态 |
| ERR_PROJECT_NOT_FOUND | projectId 失效 | 刷新列表 + toast |
| ERR_PROJECTION_OP_FAILED | 上游 `workspace/invalid-path\|name-conflict\|move-invalid` 映射 | degraded 状态行 + [重试投影];注册不被阻断 |
| ERR_PROJECTION_CHANNEL_UNAVAILABLE | relay 不在场/启动竞态(重试一次后) | plan 保留(期望在库),degraded + 可重试;禁静默丢弃 |
| ERR_WINDOW_OPEN_FAILED / ERR_WINDOW_NOT_FOUND | 开窗失败 / windowId 失效 | toast / log + 事件兜底 |
| ERR_LAYOUT_INVALID | blob schema 白名单校验失败 | 重置默认布局 + log(不弹错) |
| ~~ERR_FORGE_NOT_DETECTED~~ | **废止**(D1:desktop 无 `.forge` 侦测信号不成立) | 「未检测到 git」= 信息态非错误 |
| ERR_WORKBENCH_DB / ERR_IPC_SENDER_REJECTED | 既有沿用 | 既有路径 |

### Propagation Strategy

- 注册/生命周期面:C7 卡内即时侦测陈述(信息态优先,非错误码轰炸);提交失败留在卡内修正。
- 投影面:动词不因投影失败 reject(本地落库即业务成功,投影结果异步事件呈现);degraded → 状态行 + [重试];偏差仅呈现无反向写(BIZ-006)。
- 血缘面:超时/缺席静默降级(仅顶层)+ 结构化 log(BIZ-resilience-001);恢复自动回完整模式。
- 窗口面:开窗失败 toast;收回失败 log + 窗口关闭事件兜底。

## Cross-Layer Data Map

| Field Name | Storage Layer | Backend Model | API/DTO | Frontend Type | Validation Rule |
|------------|---------------|---------------|---------|---------------|-----------------|
| projectId | TEXT PK(uuid) | Project.id | string | string | 既有 |
| code_root / code_root_key | TEXT / TEXT UNIQUE | Project.anchor / pathKey | DetectReport.canonicalPath/pathKey | 卡侦测行 | 归一化管线(realpath→剥前缀→正斜杠→折叠);拒裸盘符/相对 |
| identity_dev/ino/verified | TEXT/TEXT/INT | Project.identity | DetectReport.identity | — | 命中即仲裁回写(自愈) |
| docs_placement | CHECK 5 值 | enum | registerProject 入参 | C7 预览行 | 证据三档门控;仓内落点永不继承(黏性禁令) |
| archived / sort_order | INT / INT | boolean / number | Project DTO | 归档分区/树序 | 默认 0;sort_order=注册序 |
| projection_state | CHECK 4 值 | ProjectionState | ProjectionStatusRow | StateDot + 重试 | pending→healthy/degraded/deviation |
| workspaceId/title/order | workspace_projection 表 | 期望快照 | ProjectionPlan.ops | 概览状态区 | diff 派生,幂等全量 |
| workspace 实况 | (dsh JSON,不入库) | WorkspaceView | submitWorkspaceSnapshot 入参 | — | 形状校验;debounce |
| layout_json | JSON 文本 | ProjectLayout v1 | get/setProjectUiState | 布局引擎 | schema 白名单(kind 枚举/topic 界长),失败重置 |
| taskKey | task/task_key | 限定地址 | string | mono 地址 | 既有方言(TECH-data-kernel-003) |
| SessionTarget | — | SessionId \| SubagentAddress | WindowRole/C5 打开 | 会话行/挂接行 | subagent 需 (parent,child,mode) 三元组 |
| lineage 派生 | **不落库** | TaskBinding/SubagentHit | client 内部 | C3 树/C5 展开/C6 条 | ≤100ms 超时降级;血缘为准命名辅助 |
| 追加行 | dispatch.prompt_hash 关联 | 两行文案 | — | — | sha256(全文)留档;Go 对拍集外 |

## Integration Specs

| # | 集成 | Target File / 座位(既有) | Insertion Point | Data Source |
|---|------|--------------------------|-----------------|-------------|
| 1 | C3 左栏项目树 | 上游 `sidebar.workspaces` 单槽(替换渲染;组件不导出 → 数据面复用 + 行语言自绘,记对账备忘) | client apply `slots.inject('sidebar.workspaces', …)` | ctx.workspaces/ctx.sessions + listProjects IPC |
| 2 | C5 挂接历史增强 | `views/tasks/TaskDetailPanel.tsx` + `detail/LinkHistory.tsx` | 既有『挂接历史』节:行展开血缘后代 + 行尾 [打开](onEnterSession seam 扩展双通道) | lineage 服务 + get-task-detail |
| 3 | C6 元数据条 | 上游 `conversation.session` 会话域槽(座位形态任务期核对) | subagent 实例头部下方 h40 条 | lineage sessionTaskBadges |
| 4 | panellist「项目」行 | `client/nav/slot-inject.ts`(既有) | 注册 list 项(order 首项);点击 = selectPanel(null);选中态 = activePanelId==null | panelInfo |
| 5 | 右栏 forge tabs | 上游 `ui-sidebar-right` tab 体系(`sidebar.right.pane.tab` 族) | tab kinds:guide/overview/board/doc/depgraph;board = `TasksView` 组件化(去 TabBar 耦合,双宿主) | M3 各 face 动词复用 |
| 6 | 旧视图退役 | `client/store/view-key.ts` + `WorkbenchShell.tsx` VIEW_MOUNT_TABLE + `components/chrome/TabBar\|TopBar\|ProjectSwitcher` | `workbench/tasks\|features\|proposals[:slug]` 键注销;`workbench` main 面板收缩为 overview 逃生门单页 | — |
| 7 | 派发追加行 | `workbench/dispatch/presynth/`(内核) | 追加行两行化(归因+命名) | task 元数据 |
| 8 | 窗口泛化 | `apps/desktop/src/main/index.ts` + 新 `windows/` | 窗口注册表/role 供给/事件 fan-out/carriage 逐窗 | WindowRole |
| 9 | e2e 迁移 | `apps/desktop/e2e/`(M2 journeys)+ `tests/e2e/specs/`(M3) | 按迁移清单改写视图键/入口断言;M1 原样 | — |

## Testing Strategy

### Per-Layer Test Plan

| Layer | Test Type | Tool | What to Test | Coverage Target |
|-------|-----------|------|--------------|-----------------|
| projects-identity | Unit | vitest | 归一化矩阵(折叠/junction/8.3/UNC/裸盘符拒/realpath 失败回退);三层比对与悬挂自愈;证据侦测(树命中/git/无 git/子仓 chips/已注册快车道) | ≥80% |
| projection | Unit | vitest | diff 纯函数矩阵(四操作 + renamed/deleted/reordered 分类);幂等重推;降级状态机;v3 回填 | ≥80% |
| ui-state / relay / windows | Unit | vitest | blob 校验重置;plan 执行序与错误映射;outcome 回填;role 供给/收回/fan-out | 主路径 |
| lineage(客户端) | Unit | vitest | join 矩阵(命中/未命中/多后代/递归深度/超上限/ended 缺席/100ms 超时降级);执行中判定矩阵(in_progress × active) | ≥80% |
| 左栏派生 / C7 卡 | Unit | vitest+jsdom | project-tree/project/flat 分组、溢出折叠、未分组组头;卡状态机(证据重估/黏性禁令/授权复位) | 视图主路径 |
| store 漂移 | Unit | vitest | schema-v3 四件套对账;版本单调 | 全绿 |
| SC 验收腿 | E2E | Playwright `_electron` | SC1-SC7 各一腿(见下) | SC 全绿 |

### Key Test Scenarios

- **SC1**:启动首屏 = 工作台(恢复活跃项目);panellist「项目」;孤儿视图清零(全部 forge 视图键归属断言)。
- **SC2**:三区同页(左栏树 + 中间会话 + 右栏);知识区零空占位(无空 tab/空视图/预置数据断言)。
- **SC3**:注册 → dsh 侧同名同序(实况 workspace 快照断言);改名同步;归档 = workspace 保留 + forge 归档分区;删除 = workspace 移除 + 会话退未分组(历史不删);派发会话归组;dsh 侧手改不回流 + 偏差提示;投影故障注入 → 降级不阻断注册。
- **SC4**:分屏同屏(会话 + 看板 pane 可操作);布局(比例/收起)重进恢复;拆出窗口并行 + 单实例(主窗关闭 = 退出)。
- **SC5**:既有 M1-M3 e2e 按迁移清单全量迁移全绿;M1 原样。
- **SC6**:首屏 ≤2s(500 任务规模);视图切换不劣化;投影操作 ≤2s。
- **SC7**:挂接历史呈现;subagent 标识 + 打开(SubagentAddress);归拢不顶层 + 默认收起;C6 元数据条;命名遵循率(固定桩)。
- **stub 扩展**:subagent 血缘语料 = 会话 stub 协议支持 `parentSession`/`origin` 头注入(真核心消费,journal 对拍)。
- **实例锁纪律**:全量 e2e 前 `assertNoActiveDshForgeInstances`。

## Security Considerations

<!-- Override: Security Review enabled by PRD signal「权限/IPC 安全」 -->

### Threat Model

| # | 威胁 | 面 |
|---|------|-----|
| T1 | 投影写面(renderer 攻破后经 relay 滥写 workspace) | workspaceController remote |
| T2 | snapshot 伪造(偏差误报) | 对账输入 |
| T3 | 多窗口新 renderer 面 | 壳层窗口 |
| T4 | 路径侦测被滥用为 FS oracle | C7 侦测 |
| T5 | 布局 blob 注入渲染 | ui-state |
| T6 | 命名追加行提示词注入 | 预合成 |

### Mitigations

- **T1**:最大能力 = 上游四动词集(与原生 UI 同权无提权);期望状态落库审计(pushed_at/last_error);reorder 仅 forge 所属子集。
- **T2**:仅影响提示面无写放大;形状校验 + 主进程 log。
- **T3**:同源 `dsh-app://` + 同 SHELL_WEB_PREFERENCES(contextIsolation/sandbox);will-navigate 锁;window-open 拒;role 经主进程供给(不信任 URL)。
- **T4**:固定前缀有界探测(禁 glob/不读正文,OneDrive 水合);裸盘符/相对拒绝;校验在主进程。
- **T5**:schema 白名单(TabKind 枚举/topic 界长),失败重置默认。
- **T6**:文档数据组装不 eval(M3 延续);prompt_hash 留档可审计。

## PRD Coverage Map

| PRD Requirement / AC | Design Component | Interface / Model |
|----------------------|------------------|-------------------|
| S1-1 启动首屏/左栏树/无独立列表页 | panellist「项目」+ selectPanel(null) + C3 组件 | I1/I4;SC1 |
| S1-2/3 三区同页/零空占位/孤儿清零 | 原生三区 + forge tabs + 退役清单(Integration 6) | SC1/SC2 |
| S2-1~4 挂接历史/标识/打开/元数据 | C5 LinkHistory 增强 + lineage + C6 | I3/I6;SC7 |
| S4-1~4 侦测/同名同序/归组/降级 | probeProjectPath + projection + 原生 cwd 匹配(零代码) | I1/I2;SC3 |
| S5-1~5 归档≠删除/改名/偏差 | archive/restore/remove + 对账 diff | I1/I2;SC3 |
| S6-1~3 分屏/记忆/拆出单实例 | rightbar panes + project_ui_state + windows/ | I4/I5;SC4 |
| S7-1~3 命名/双侧识别/血缘为准 | 追加行两行化 + lineage(权威) | I7/I3;SC7 |
| 必答⑨ 壳行为对账 | 主窗关闭=退出;单实例锁不动;tray 不动 | I5 |
| todo#30 已完成任务禁发起新会话 | C5 No-link 态 [发起] 按任务终态禁用 | I1(taskGet 状态) |
| SC1-SC7 | 见 Testing Key Scenarios | — |

**Phase 映射**:P1 = I1 侦测/注册 + C7 卡 + 左栏树 + panellist + 退役(Integration 6)+ SC1/SC2 面;P2 = lineage + C5/C6 + 右栏 tabs 收纳(Integration 5)+ 回归盘点;P3 = projection 全链 + 对账;P4 = 分屏/多窗口/布局记忆 + 全量验收。

## Open Questions

- [ ] 偏好/插件面正式归宿(用户裁决「暂时忽略」2026-09-28;过渡 = `workbench/overview` 逃生门,入口 = 概览 tab 行尾设置链)
- [ ] `sidebar.workspaces` 单槽覆盖机制任务期核对(回退 = forge 自绘整树,本设计即自绘口径)
- [ ] C6 注入座位形态(`conversation.session` 槽 kind)任务期核对
- [ ] e2e subagent 血缘语料 stub 协议扩展能力核对
- [ ] 顺延记账回写:20 技能(→M6 收口期)/ 四 CLI 动词 GUI 归宿(→M5/M6)/ 影子 git + runtime_root ①②(→存储实现里程碑;C7 卡面「内部版本历史」文案随之微调,回写 ui-design)

## Appendix

### Alternatives Considered

| Approach | Pros | Cons | Why Not Chosen |
|----------|------|------|----------------|
| B forge 主面板自建三区容器 | 分屏组合完全自由 | 会话视图重挂载能力面未证(embedded 工厂为旁置裁剪版);上游组件 API 稳定性风险;回归面大 | T1 裁决 |
| 投影走 host 半身新服务 | 就近 registry | client 直调上游 remote 已足;多一跳多一代码面 | T3 裁决 |
| 主进程直写 `$DSH_HOME/storages/workspace.json` | 无 relay | 破坏宿主单写者 + 格式漂移 + 锁竞争 | 否决 |
| 布局记忆 localStorage | 零 IPC | 项目删除清理无 FK 语义;e2e 断言弱 | T4 裁决 |
| 血缘落库(任务↔subagent 表) | 查询直接 | PRD 必答⑥明令不落库(可随时重算) | 否决 |
| 多窗口 = 原生 float / BrowserView | 零壳层工作 | float = 应用内浮层(`position:fixed`)非 OS 窗口;BrowserView 弃用路径 | T5 裁决 |
| 双向 workspace 同步 | 消除双侧差异 | 双写源 + 冲突合并 | 提案期已否决(2026-09-23) |
| M4 全落地影子 git + runtime_root | 一次到位 | IA 里程碑并存储两线;O7 细则未定 | T6 裁决 |

### References

- PRD:[prd/prd-spec.md](../prd/prd-spec.md)(必答①-⑨/SC1-SC7/四 Phase)+ [prd-user-stories.md](../prd/prd-user-stories.md) + [prd-ui-functions.md](../prd/prd-ui-functions.md)
- UI:[ui/ui-design.md](../ui/ui-design.md)(C1-C10)+ [ui/workbench-layout-v2.md](../ui/workbench-layout-v2.md)(v2.12 + 裁决 #1-#27,布局权威)+ [ui/dsh-home-layout.md](../ui/dsh-home-layout.md)(上游 home 三态基线)
- 上游裁决:[docs/decisions/project-storage-and-knowledge.md](../../../decisions/project-storage-and-knowledge.md)(D1-D12;§5 v2 = UF7/C7/C8 上游权威)
- M3 设计:[dsh-forge-m3 tech-design](../../dsh-forge-m3/design/tech-design.md)(双载体/IPC 模式/renderer 桥/spike×4)
- 约定:product-architecture / electron-ipc-security / ui-reuse / host-integration / data-kernel / upstream-vendor / testing(docs/conventions/)
- 业务规则:workbench.md(BIZ-workbench-001~008,含 M4 投影/血缘/执行中三条)/ coexistence / sot-migration / task-operations / resilience
- vendored 侦察(2026-09-28):workspaceRegistry(workspace.json 单写者/cwd 归组/insertBefore 排序)、SessionHeader v3(parentSession/origin/delegationDepth)、`ISidebarRight`(split/float/dock;float=应用内)、`ISessions.subagentsByParent`、`openSession(SessionTarget)`、上游客户端包导出面(client 入口仅 types/inject/apply)
- 设计裁决(2026-09-28):T1 原生 home 增强层 / T3 投影通道 / T6 存储边界(docs/decisions/architecture·interface·product)
