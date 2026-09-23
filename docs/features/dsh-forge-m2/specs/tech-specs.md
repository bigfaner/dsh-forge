---
feature: "dsh-forge-m2"
generated: "2026-09-23"
status: draft
---

# Technical Specifications: dsh-forge M2 — 需求与会话工作台

## IPC 面

### TECH-001: workbench IPC 语义动词面模式

**Requirement**: 数据内核/工作台能力经 preload 单一命名空间 `dshForge.workbench` 暴露;每个语义动词映射唯一白名单通道 `dsh-forge:workbench-<name>`(禁止复用、禁止通配透传动词;通道表 = main 与 preload 共用的同一常量模块,禁止两侧手写漂移);每 handler 校验 sender frame;动词 reject 信封 = JSON 序列化 `{code, message, detail?}`,携带合法 `ERR_*` code 的域错误原码透传,未知异常 → 兜底码 + log;主→渲染事件推送走独立非 invoke 通道(`dsh-forge:workbench-events`),事件批量合并 ≤500ms,渲染层销毁自动退订;onEvents 呈现为单订阅者语义动词(订阅/退订动词对)。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Interface 1;apps/desktop/src/main/workbench/ipc/channel-allowlist.ts(16 通道实证:13 数据动词 + subscribe/unsubscribe + authorize-external-doc-path)

## 数据内核

### TECH-002: node:sqlite 内核实现纪律

**Requirement**: SQLite 经主进程内嵌 `node:sqlite`(Electron 44/Node ≥22.20 内建,零原生重编译;弃 better-sqlite3 等原生模块);每次 opening 应用 `PRAGMA journal_mode = WAL` + `foreign_keys = ON`;库文件落 `<userData>/workbench/` 独立目录,与 `$DSH_HOME`、host-profile 目录分立;启动探针(可用性检查 + 试开库)失败 = 显式启动错误路径,禁止静默降级为无库运行;库损坏 → 旧库(含 -wal/-shm 伴生文件)改名备份后重建空库并明确告知。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Overview/§Dependencies/§Error Handling(ERR_WORKBENCH_DB);store/db.ts

### TECH-003: taskKey 看板地址方言

**Requirement**: task_snapshot 主键采用看板地址形态 `<featureSlug>/<localId>`(非裸 forge ID);blockers 原样存上游本地 key(同 feature 命名空间);树视图按 feature_slug 分组展开传递链;后续消费面(watcher 感知、IPC、会话挂接、e2e)统一沿用该地址形态。
**Scope**: [CROSS]
**Source**: indexer/scan.ts 方言适配说明;records/2.5(方言裁决)

## 宿主与外部进程集成

### TECH-004: dsh 宿主会话通道(禁外部通道)

**Requirement**: 应用发起/定位 dsh 会话一律走宿主进程内 cordis 服务通道:插件 host 半身直注 `sessionController` —— `create({sessionId?, cwd})`(caller-minted id = 幂等收养)+ `prompt({mode:'queue'})` 注入首条用户消息(即持久化用户消息);会话定位经 client 半身 `ctx.uiWorkspace.openSession(sessionId)`。降级链 = client 半身 remote session 同语义备选 → 剪贴板 + toast fallback(M1 模式),主通道不可用自动落 fallback、不打断。禁止外部通道(URL hash/postMessage/deep-link,M1 spike-3 已证三通道均不可用)。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Interface 5/§Open Questions;design/spike-1-findings.md;host/session-launch.ts

### TECH-005: 外部 CLI spawn 纪律

**Requirement**: spawn 外部 CLI 一律参数数组,禁止 shell 字符串拼接;cwd 与路径参数限定已注册项目路径集合(仓外路径须注册时显式授权);CLI 解析序 = 工作台设置显式路径 → PATH → ERR_FORGE_CLI_UNAVAILABLE;退出码/输出尺寸上限防护;CLI 按需 spawn、执行完退出(不常驻)。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Dependencies/§Security T2;host/cli-resolve.ts、forge-bridge.ts

## UI 集成

### TECH-006: 上游导航槽位注入与视图键寻址

**Requirement**: 上游 SPA 无路由——新增顶级视图经上游导航槽位注入:`main`(keyed 槽,root scope,ui-layout 声明)+ `sidebar.panellist`(list 槽,ui-sidebar 声明),注册契约 `key/id/order/label`;视图切换经 `ctx.layout.selectPanel` 回写共享控制器;页面族用视图键寻址(page-map 惯例,如 `workbench/overview|tasks|features`),会话期内存、不持久化进路由系统;禁自建导航旁路(自绘 rail 仅最后兜底)。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Overview D3/§Integration Specs;design/spike-1-findings.md §1;design/page-map.md;client/contract.ts(SIDEBAR_SLOT)、nav/slot-inject.ts

### TECH-007: markdown 只读渲染防注入

**Requirement**: 过程文档/任务描述/执行记录等仓内不可信 markdown 一律只读渲染:禁 raw HTML/脚本/外链跳转离开应用;文档经 IPC 返回纯文本,渲染走上游既有渲染组件或等价 sanitize 配置;渲染区无交互元素。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §Security 边界约束;design/tech-design.md §Security T3/§Testing;ui/ui-design.md 全局规则;records/5.2

### TECH-008: 渲染进程依赖放置(插件 bundle 内)

**Requirement**: 渲染进程新增第三方 UI 依赖只进插件 bundle(不进壳、不进 preload);React 保持单一实例、版本对齐宿主模块表(经 host-profile 模块解析外置),插件不得引入第二 React 实例。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Dependencies(@xyflow/react 裁决 D4 实证:仅 packages/plugins/forge-workbench 依赖,apps/desktop 零新增)

## 进程纪律

### TECH-009: 进程足迹 = 2

**Requirement**: 常驻进程足迹 = 2(Electron 壳 + dsh 宿主)不变;forge CLI 按需 spawn、执行完退出;不新增常驻进程/常驻监听依赖(文件感知用内建 fs.watch 递归 + 降级链,不引 chokidar);新增常驻进程须显式提案。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §继承约束;design/tech-design.md §Overview/§Appendix Alternatives(chokidar 弃选)

## 感知面(实现细节,留 feature)

### TECH-010: watcher 感知降级链

**Requirement**: 文件感知 = fs.watch 递归 + 400ms debounce 合流 → 全量重扫 → 快照 diff(属性级/结构性分类)→ 事件推送;平台不支持递归或 watcher 报错 → 非递归目录树 watch → 2s 轮询兜底;感知失败不弹 UI(sync error 态 + 重试)。
**Scope**: [LOCAL]
**Source**: design/tech-design.md §Interface 3/§Error Handling
**Note**: M2 实现细节,留在 feature 文档;≤5s 时效口径已由 BIZ-005 承载。
