---
created: "2026-09-23"
prd: prd/prd-spec.md
status: Draft
---

# Technical Design: dsh-forge M3 流程即产品

> 设计输入:prd/prd-spec.md(2026-09-23)+ prd/prd-user-stories.md(9 故事)+ prd/prd-ui-functions.md(UF1-UF5)+ ui/ui-design.md(eval 954/1000,原型已批准 2026-09-23)。
> 测试语言(Step 0 判定):TypeScript;vitest 单测 + Playwright `_electron` e2e(root package.json `test`/`test:e2e` 实证;仓内无 docs/conventions/testing/index.md,依 M2 先例)。
> 硬前置:dsh-forge-m2(UF2 看板 / UF5 发起链 / 数据内核 / e2e 腿);Phase 0 spike×4 零产品代码,可与 M2 收尾并行。

## Overview

M3 在 M2 的**双载体**(Electron 数据内核 + forge-workbench 插件双半身)上完成四件事,不引入第三载体:

1. **内核权威化**:任务结构化状态 SoT 从 `tasks/index.json` 翻转入 SQLite——**TS 原生移植** 7 态状态机/依赖解析/记录渲染入内核(T1),`task_snapshot`(派生缓存)让位于 `task`(权威表,读路由按 `projects.data_authority`);一次性显式迁移(D1:确认 + 备份 + 原子 + 对拍 + 归档);迁移后外部写自动重摄入 + 偏离标记(T3)。
2. **编排面**:内核新增 `dispatch`(派发编排 + 产物齐全性确定性检查 + 预合成三要素)与 `approvals`(审批路由)域;subagent 创建走 host 半身 `sessionController`(M2 spike 已证通道),systemPrompt 注入契约 spike ③ 定形;人 = 派发/审批,任务写零 UI(操作主体模型)。
3. **agent 原生工具面**:dsh model-facing tool(任务 CRUD 写集 + 只读 + 知识系 D4)由插件 host 半身注册,经 **renderer 桥接**(host cordis rpc → client 半身 tool 桥 → 既有 `dshForge.workbench.*` IPC 白名单)达内核(T2)——零新增监听面,SQLite 单写者不破。
4. **CLI 退役收口**:M2 `ForgeBridge`(spawn CLI)退役,预合成取代 `forge prompt`;15 项技能经 `customSkillDirs` 以 dsh 原生形态承载(D2,vendored `skill-filesystem` 已证);偏好三级(单表 scope 化)+ 阶段资产(`stages/<stage>.md` 单一规范文件,T4)+ 提案看板(M2 感知模式复用)。

进程足迹不变 = 2(Electron + dsh 宿主);**零新增 npm 依赖**;零监听端口(renderer 桥接无新端点);spike×4 = Phase 0 门控。

### 关键裁决记录(2026-09-23,AskUserQuestion 确认)

| # | 裁决 | 结论 | 主要理由 |
|---|------|------|---------|
| T1 | 状态机载体(PRD 预支禁令项) | TS 原生移植入内核 | 与 node:sqlite/零原生重编译/三平台纪律一致;对拍器保证与 Go 行为等价;**移植基准 = forge-cli Go 源** `Z:\project\ai\forge\forge-cli`(`pkg/task/statemachine.go` 状态机 / `deps.go`+`toposort.go` 依赖解析 / `stage_gates.go` 门 / `pkg/prompt/templates` 提示词模板) |
| T2 | dsh tool → 内核通道 | renderer 桥接(host rpc → client 半身 → IPC 白名单) | 零新增监听面;动词面封闭;spike ① 验证时延与可用性 |
| T3 | 已迁移项目外部写回收 | 自动重摄入 + 偏离标记 | 不阻断外部会话;SQLite 保持权威一致;偏离可观察 |
| T4 | 阶段资产文件规范 | `stages/<stage>.md` 单一规范文件 | 门校验幂等;「最新一份」语义清晰;元数据入 SQLite |

另有两项设计内定(非阻塞):偏好存储 = 单表 scope 化(`prefs`);工具写集仅对 `data_authority='sqlite'` 项目开放(`files` 项目返回明确提示走 CLI,双形态纪律)。

## Architecture

### Layer Placement

| 层 | 落位 | M3 新增 |
|----|------|---------|
| Electron 主进程(壳内核) | `apps/desktop/src/main/workbench/` | `tasks/`(权威域 + 状态机 TS 移植 + 对拍器)、`migration/`(备份/摄入/对拍/切读/归档/外部写回收)、`dispatch/`(编排器 + 产物检查 + 预合成)、`approvals/`、`prefs/`、`stages/`(门 + 资产索引)、`proposals/`(提案索引器)、ipc 动词扩展 |
| 插件 host 半身 | `packages/plugins/forge-workbench/src/host/` | `forge-tools/`(dsh tool 注册面)、`dispatch-launch/`(subagent 创建)、`approval-bridge/`(审批事件↔内核);`forge-bridge`(CLI spawn)退役 |
| 插件 client 半身 | `packages/plugins/forge-workbench/src/client/` | 提案页(UF5)、偏好面(UF4)、迁移入口 + 向导条件步骤(UF3)、任务看板编排扩展(UF1)、feature 阶段化(UF2)、**tool 桥**(host rpc → IPC 转发) |
| 打包装配 | `apps/desktop/resources/` + 用户层 dsh 配置 | 15 项 dsh 形态技能随插件 bundle(`resources/skills/`);应用写 `customSkillDirs` 并 boot 校漂移 |

### Component Diagram

```text
┌ Electron 主进程(壳内核)─────────────────────────────────────────┐
│ workbench/tasks      task 表(SQLite 权威)+ 状态机/依赖解析(T1)  │
│ workbench/migration  备份→摄入→对拍→切读→归档 · 外部写回收(T3)     │
│ workbench/dispatch   派发编排 + 产物齐全性检查 + 预合成(三要素)    │
│ workbench/approvals  approval_request + 决策路由                  │
│ workbench/prefs      prefs(scope,scope_id,key)+ 解析(单表)       │
│ workbench/stages     阶段门(确定性清单)+ stage_asset 索引(T4)    │
│ workbench/proposals  proposals/ frontmatter 索引                 │
│ workbench/ipc        dshForge.workbench.* 白名单动词(v2 扩展)    │
└──┬ IPC(contextBridge 白名单)─────────────────────────────────┘
   │                                        ▲ host rpc(cordis,T2 桥)
┌──▼ 渲染进程(上游 SPA)──────────────┐   ┌─┴ dsh 宿主子进程 ─────────────┐
│ forge-workbench client 半身           │   │ forge-workbench host 半身      │
│  ├ UF1-UF5 视图(编排/审批/迁移/     │──▶│  ├ forge-tools(dsh tool 面)   │
│  │  偏好/提案)+ tab 序修订         │   │  ├ dispatch-launch(subagent)  │
│  └ tool 桥:rpc→IPC 转发            │   │  └ approval-bridge            │
└──────────────────────────────────────┘   │  subagent 执行 + 审批请求      │
                                           └───────────────────────────────┘
```

数据面三通道(单写者纪律不破):

- **主数据面**(只读):看板/详情/提案/阶段资产 ← kernel IPC;
- **写面**(agent):dsh tool → host rpc → client tool 桥 → IPC 写集动词 → kernel(SQLite 唯一写者);
- **编排面**(人):派发/审批/迁移/偏好动词 → kernel;dispatch-launch 仅 host 半身持会话创建权。

### Dependencies

| 依赖 | 类型 | 用途 | 纪律 |
|------|------|------|------|
| `node:sqlite` | 既有内建 | v2 增量迁移 | 启动探针失败 = 显式错误路径(M2 延续) |
| cordis / 上游服务(sessionController、plugin-manager tools、skill-filesystem) | 既有(vendored) | 双半身 rpc / subagent / tool 注册 / customSkillDirs | 消费不修改;契约漂移走 vendored 升级显式适配 |
| forge 仓数据模型 | 配合项(Related Changes #2) | 阶段资产类型 / 阶段产物清单定义 / 偏好键集 | 仓侧可控;应用仅消费机器可校验定义 |
| vitest / Playwright | 既有 | 测试 | M1/M2 栈延续 |

## Interfaces

### Interface 1: 内核 IPC 动词面 v2(`dshForge.workbench.*` 白名单扩展)

每动词唯一白名单通道 + sender frame 校验(TECH-electron-ipc-001 延续)。**通道命名沿用 v1 惯例**:`dsh-forge:workbench-<kebab-verb>`,preload 与 main 共享同一份常量表(`channel-allowlist.ts` 模式,禁两侧手写漂移);事件推送复用既有 `dsh-forge:workbench-events` 批量通道(≤500ms,主→渲染唯一 sender),订阅/退订 = `subscribe-events`/`unsubscribe-events` 动词对。核心类型与动词(完整类型随任务分解细化,`/* */` 为约束注记):

```ts
type Actor = string                                  // 'session:<id>' | 'external' | 'kernel' | 派发者
type Authority = 'files' | 'sqlite'                  // projects.data_authority

// —— 任务权威写集(状态机 T1 唯一入口;供 tool 桥与内核共用)——
taskAdd(input: { projectId, featureSlug, title, taskKey?, blockers?, taskType?, descPath? }, actor): Promise<TaskSummary>
taskClaim(input: { projectId, taskKey }, actor): Promise<TaskSummary>          // 依赖终态前置 → ERR_TASK_DEPS_UNSATISFIED
taskTransition(input: { projectId, taskKey, to: TaskStatus, reason? }, actor): Promise<TaskSummary>
taskSubmit(input: { projectId, taskKey, recordPath? }, actor): Promise<TaskSummary>
taskReopen(input: { projectId, taskKey }, actor): Promise<TaskSummary>
taskGet(input: { projectId, taskKey }): Promise<TaskDetail>                    // 读路由按 data_authority

// —— 迁移(UF3)——
getMigrationStatus(projectId): Promise<{ authority: Authority; deviated: boolean; migratedAt: string | null; lastEvent: MigrationEvent | null }>
startMigration(projectId): Promise<{ started: true }>   // 在跑编排 → ERR_MIGRATION_GUARD;进度经事件

// —— 编排(UF1)——
checkStageArtifacts(input: { projectId, featureSlug }): Promise<{ stage: FeatureStatus; satisfied: boolean; missing: MissingItem[] }>  // 确定性,无模型调用
dispatchTasks(input: { projectId, taskKeys: string[], acknowledgeMissing?: boolean }): Promise<
  | { dispatched: DispatchRow[] }                       // ≤3s 启动预算内
  | { blocked: 'artifacts-missing'; missing: MissingItem[] }>
getDispatches(projectId): Promise<DispatchRow[]>
redispatch(dispatchId): Promise<DispatchRow[]>          // 二次确认在 UI;重走检查+预合成
listApprovals(projectId): Promise<ApprovalRow[]>
decideApproval(input: { approvalId, approve: boolean }): Promise<ApprovalRow>   // 显式点击,无自动批准

// —— 偏好(UF4)——
getPrefs(scope: 'global' | { project: string } | { feature: string }): Promise<PrefRow[]>   // 含生效值+来源
setPrefs(scope, entries: PrefEntry[]): Promise<void>    // 事务原子;键集/类型校验
clearPrefOverride(scope, key): Promise<void>

// —— 阶段(UF2)——
getStageGate(projectId, featureSlug): Promise<StageGateInfo>                       // 门态 + 资产列表
advanceStage(projectId, featureSlug): Promise<FeatureSummary>                      // 门不满足 → ERR_STAGE_GATE_UNSATISFIED
listStageAssets(projectId, featureSlug): Promise<StageAssetRow[]>

// —— 提案(UF5)——
getProposalBoard(projectId): Promise<ProposalBoardData>
readProposalDoc(input: { projectId, slug, kind: 'proposal' | 'eval' }): Promise<{ markdown: string }>
```

事件扩展(`WorkbenchEvent` v2,批量节流 ≤500ms 延续):`dispatch_updated { dispatchId, taskKey, state }` · `approval_received { approvalId, taskKey }` · `migration_progress { projectId, phase, result? }` · `stage_advanced { featureSlug }` · `deviation_detected { projectId?, featureSlug? }` · `prefs_updated { scope }`。

### Interface 2: dsh tool 面(host 半身注册;spike ① 定契约)

```ts
// 工具族(扁平名;dsh tool 注册 = vendored plugin-manager tools.ts 先例)
forge.task.add / claim / transition / submit / reopen   // 写集 → renderer 桥 → I1 动词
forge.task.get / query / list                            // 读
forge.feature.list / status · forge.proposal.list / show // 读
forge.pref.get                                           // 读生效值(三级解析)
forge.stage.summarize                                    // 写阶段资产文件 stages/<stage>.md(文档根直写)
forge.fact / lesson / research / forensic                // D4 知识系(读+必要写,文档根直写)
```

- **renderer 桥接(T2)**:tool handler(host)→ cordis rpc → client 半身 tool 桥 → I1 白名单动词。桥不可用(UI 未装载/启动竞态)→ 重试一次后返回 `ERR_TOOL_BRIDGE_UNAVAILABLE` 明确提示(Story 9,禁静默)。
- **权限界**:写集仅 `data_authority='sqlite'` 项目;`files` 项目 → 明确提示走 CLI(双形态纪律);输入 schema 严格类型,`taskKey` 校验 = **看板限定地址形态** `<featureSlug>/<localId>`(TECH-data-kernel-003;localId 含 `5.gate` 等非数字相位键——看板全量投影不排除;校验 = 单 `/` 分隔 + 两段非空 + 禁路径分隔/控制字符,**弃裸 ID 数字正则**,M2 已证裸 ID 假设不成立)。
- **actor**:tool 调用自动携带所属会话标识(`session:<id>`),内核强制记 `updated_by`(审计)。

### Interface 3: 派发与审批通道(spike ② ③ 定形)

- **预合成(内核,确定性)**:`dispatch` 服务组装三要素——任务类型协议(spike ④ 移植面清单)+ feature 目标/摘要(`stage_asset` 最近资产)+ 生效偏好(`prefs` 解析)→ 完整注入内容字符串;`prompt_hash` 落库(SC3 断言锚点,**口径随 spike ③ 裁决:systemPrompt 或组合首条消息,hash oracle 复用 M2 e2e channel stub journal 的逐字符比对形态**)。
- **subagent 创建(host)**:`sessionController` 通道(M2 先例:`create({cwd})` + `prompt(mode:'queue')`);注入契约候选——①create 选项字段 ②会话模板/preset ③首条 system 消息 ④**首条 user 消息追加(M2 已落地并 e2e 验证的基线:原文不改写、仅追加 FORGE_ACTOR 指令行;实测 dsh 无 per-session env 注入面)**——**spike ③ 裁决**(先证伪/证实 dsh 存在 systemPrompt 面,无则 ④ 为默认),内核视为不透明传输(仅保证字符串完整交付);并行 = N 次独立 create,互不共享上下文(G3)。
- **审批路由(approval-bridge)**:宿主 subagent 审批事件 → tool 桥 → 内核 `approval_request`(pending)→ 事件推送 UI(UF1 审批 dock);`decideApproval` 反向经桥回 subagent 审批通道;FORGE_ACTOR 语义延续(dispatch 行 + task 变更记 actor)。
- **降级链**:桥不可用 → 会话内提示;launch 失败 → 派发 failed 态 + 重派发;契约不满足 → 派发前检查拒绝(`ERR_SYSTEM_PROMPT_CONTRACT`)。

### Interface 4: 迁移管线(内核,一次性显式)

1. **守卫**:`dispatch.ended_at IS NULL` 计数 >0 → `ERR_MIGRATION_GUARD`(UI 列在跑清单);
2. **备份**:`<userData>/workbench/backups/<projectId>-<ts>/`(库文件 + 文档树 `tasks/` 拷贝);
3. **摄入**:单事务全量 `index.json` → `task` 行(字段映射 + **限定地址合成** `<featureSlug>/<localId>`(TECH-data-kernel-003 方言,与 task_snapshot 一致)+ `task_type`/`desc_path` 推断);
4. **对拍**:任务全集(限定地址/状态/依赖/标题)`task` 表 vs `task_snapshot` 派生投影零差异;差异 → 回滚 + `ERR_MIGRATION_VERIFY`;
5. **切读**:`projects.data_authority='sqlite'` 同事务置位;
6. **归档**:`index.json` → `index.json.migrated-<ts>`(失败 → 整体回滚备份,零半迁移);
7. **外部写回收(T3)**:watcher 检出已迁移项目 `index.json` 复现/变更 → 幂等重摄入(同 3-4)→ `projects.deviated=1` + `deviation_detected` 事件 + `migration_event(reingest)` 留档;不阻断外部会话。
8. 向导路径:注册向导检出 `index.json` → 插入同一确认步骤(立即/稍后)。

### Interface 5: 阶段门与阶段资产(T4)

- 资产文件:文档根 `features/<slug>/stages/<stage>.md`,frontmatter `{ stage, generated, goal }` + 正文摘要;由 agent 会话经 `forge.stage.summarize` 写入;`stage_asset` 索引随感知更新(派生可重建)。
- 门校验(`checkStageArtifacts`,确定性代码,断言无模型调用):PRD 各阶段期望产物清单(存在性 + frontmatter/结构解析 + SQLite 状态查询),机械判定先例 = forge-cli `pkg/task/stage_gates.go`;缺失 = 警告 + 清单,`acknowledgeMissing` 后可派发(warn 不阻断)。
- 推进(`advanceStage`):门(阶段总结已生成)不满足 → 拒绝 + 引导;满足 → 内核写 manifest status(阶段推进内化,归宿表 `feature set/complete`)→ `stage_advanced` 事件 → 新阶段会话系统提示词强制注入目标 + 摘要(预合成链消费 `stage_asset`)。
- 偏离:watcher 检出非内核发起的 manifest status 变更(外部跨阶段)→ `feature_snapshot.deviated=1` + 事件(仅呈现,不阻断)。

### Interface 6: 技能承载(customSkillDirs,D2)

- 15 项必迁技能以 dsh 原生形态随插件 bundle(`resources/skills/`,扁平名,SC1 寻址断言);2 项被机制取代(execute-task/run-tasks);20 项暂缓(M4)。
- 应用 boot / 插件激活:写用户层 dsh 配置 `customSkillDirs` += 技能根(去重);**漂移校验**(路径存在 + 清单 hash)失败即重写;路径前缀必须 ∈ 插件安装目录(防任意目录注入技能面);失败 → `ERR_SKILL_DIR_SYNC` 日志 + 设置面告警。

## Data Models

> Full database design in separate files.
> **ER Diagram**: design/er-diagram.md
> **SQL Schema**: design/schema.sql(v2 增量;M2 v1 表全保留)

### Field Quick Reference

| Model | Key Fields | Notes |
|-------|------------|-------|
| task | (project_id, task_key)(PK), feature_slug(冗余列承 v1 方言), status(7 态 CHECK), blockers(JSON,本地上游 key 原词), task_type, desc_path, updated_by | **权威 SoT(迁移后)**;task_key = 看板限定地址 `<featureSlug>/<localId>`;状态机唯一写入口(移植基准 forge-cli `pkg/task/`) |
| dispatch | id(PK), batch_id, state(5 态), session_id, prompt_hash, ended_at | 编排域;`ended_at IS NULL` = 在跑(迁移守卫判据);task_key 限定地址 |
| approval_request | id(PK), dispatch_id(FK), payload_json, state(3 态), decided_by | 审批审计;`awaiting ⇔ pending` 不变式 |
| prefs | (scope, scope_id, key)(PK), value_json | 单表 scope 化;键集封闭(应用层注册表);`scope_id`:global=`''`/project=项目id/**feature=`<projectId>/<featureSlug>`**(防跨项目同 slug 碰撞) |
| stage_asset | (project_id, feature_slug, stage)(PK), path, generated_at | 派生索引;内容留 `stages/<stage>.md` |
| proposal_snapshot | (project_id, slug)(PK), status(4 态), feature_slug? | 派生;frontmatter 解析 |
| migration_event | id(PK), phase(7 相), result, detail_json | 迁移/回收审计(可回查) |
| projects 增列 | data_authority, deviated, migrated_at, backup_path | 读路由 + 迁移/偏离状态 |
| feature_snapshot 增列 | deviated, last_external_at | feature 级偏离 |

存储:沿用 `<userData>/workbench/workbench.db`;v2 载体纪律(v1 先例,TECH-data-kernel-001):`design/schema.sql` = 设计投影,运行时 = `migrate.ts` MIGRATIONS 追加 `{version:2}` 段 + 内联 TS 常量,**两者由漂移对账测试强制同步**;每版本段各自事务顺序执行,schema_version 单行只进不退,库版本>已知即拒开(`ERR_WORKBENCH_DB`);PRAGMA(WAL/foreign_keys)为连接级设置由 `db.ts` 每次开库应用,不入 DDL;备份目录 `<userData>/workbench/backups/`。

## Error Handling

### Error Types & Codes

`ERR_*` 延续 M1/M2 惯例;IPC reject `{ code, message, detail? }`,tool 面 reasonCode 上抛会话(明确降级提示,禁静默);全程 shellLog(Monitoring:迁移/派发/审批/tool 调用/门决策/配置同步可查)。

| Error Code | 触发场景 | UI/会话呈现 |
|------------|---------|------------|
| ERR_TASK_STATE_INVALID | 非法状态迁移边(状态机拒绝) | tool 错误返回 + 会话内提示 |
| ERR_TASK_DEPS_UNSATISFIED | claim/派发时依赖未终态 | tool 错误;看板派发确认阻止 + 依赖提示 |
| ERR_TASK_NOT_FOUND | task_key 失效 | tool 错误 / 看板刷新 + toast |
| ERR_TASK_NOT_AUTHORITATIVE | `files` 项目上调用写集 | 明确提示走 CLI(双形态纪律) |
| ERR_MIGRATION_GUARD | 在跑编排,迁移被阻 | 守卫对话框(在跑清单,PRD 硬约束) |
| ERR_MIGRATION_VERIFY | 对拍差异 | 失败回滚对话框 + 重试(零半迁移) |
| ERR_MIGRATION_IN_PROGRESS | 迁移中重复发起 | toast + 进度对话框复焦 |
| ERR_STAGE_GATE_UNSATISFIED | 阶段门未满足(总结未生成) | 推进拒绝 + 缺失清单引导(UF2 gate-hint) |
| ERR_PREF_KEY_UNKNOWN / ERR_PREF_VALUE_INVALID | 键集外 / 类型越界 | 编辑面行内错误 + 保存禁用 |
| ERR_TOOL_BRIDGE_UNAVAILABLE | renderer 桥不可用 | 会话内降级提示 + 一次重试(Story 9) |
| ERR_APPROVAL_NOT_FOUND / ERR_APPROVAL_DECIDED | 审批条目失效/已决 | 看板刷新 + toast |
| ERR_DISPATCH_LAUNCH_FAILED | subagent 创建失败 | 派发 failed 态 + 原因 + 重派发 |
| ERR_SYSTEM_PROMPT_CONTRACT | spike ③ 契约不满足 | 派发前检查拒绝 + 提示 |
| ERR_SKILL_DIR_SYNC | customSkillDirs 漂移修复失败 | boot 日志 + 设置面告警 |

### Propagation Strategy

- **tool 面**:host 桥重试一次 → reasonCode 上抛;`files` 项目写集拒绝为**业务提示**非错误噪音。
- **迁移面**:phase 级事件推送(`migration_progress`);终态(完成/回滚)对话框 + `migration_event` 留档(结果可回查,PRD 验收规则)。
- **编排面**:launch 失败 → dispatch failed 态(不弹模态);审批决策失败 → 刷新重试。
- **感知面**:watcher/indexer 失败不弹 UI(M2 sync_state 模式延续);重摄入失败 → 偏离标记保持 + 日志。

## Cross-Layer Data Map

| Field Name | Storage Layer | Backend Model | API/DTO | Frontend Type | Validation Rule |
|------------|---------------|---------------|---------|---------------|-----------------|
| task.task_key | TEXT | string | string | 看板地址(mono) | 限定地址 `<featureSlug>/<localId>`(含相位键;悬空 blocker 显式标记) |
| task.status | CHECK 7 态 | TaskStatus | enum | StateDot 词表 | 状态机合法边(内核) |
| task.task_type | TEXT | string? | string? | 协议选择键 | 预合成注册表内 |
| dispatch.state | CHECK 5 态 | DispatchState | enum | 编排角标谱(待启动/执行中/待审批/失败/已提交) | `awaiting ⇔ pending 审批` |
| prompt_hash | TEXT | string | string | —(断言锚点) | sha256(注入内容;口径随 spike ③:systemPrompt 或组合首条消息) |
| prefs.value_json | JSON | typed | typed 控件 | bool/number/enum/string | 键注册表(范围/枚举) |
| prefs 来源 | 行级 scope | — | PrefRow.source | 继承/覆盖徽标 | feature>project>global 解析 |
| stage_asset.path | TEXT | string | string | 资产卡只读 | 存在性 + frontmatter |
| data_authority | CHECK | Authority | enum | 迁移 Pill | 读路由开关 |
| projects.deviated / feature_snapshot.deviated | INTEGER | boolean | boolean | 偏离徽标 | watcher 判定,仅呈现 |
| approval.payload_json | JSON | — | string | 审批正文(clamp) | 只读呈现,防注入 |
| proposal.feature_slug | TEXT NULL | string? | string? | 徽标互跳 | NULL=不渲染徽标 |

## Integration Specs

> 集成全部发生在既有工作台视图与插件双半身内(零壳代码改动除内核新模块;上游零侵入)。

| # | 集成 | Target File(既有) | Insertion Point | Data Source |
|---|------|--------------------|-----------------|-------------|
| 1 | UF1 编排扩展 | `views/TaskBoardPage.tsx` + `tasks/detail/TaskDetailPanel.tsx` | 工具栏派发/审批按钮、选择模式、浮动条、审批 dock、侧板编排分区 | dispatch/approvals 动词 + 事件 |
| 2 | UF2 阶段化 | `views/features/*`(FeatureStepper/FeatureDetail) | stepper gate 态 + 第六「阶段资产」tab + 偏离徽标 | getStageGate/listStageAssets + feature_snapshot 增列 |
| 3 | UF3 迁移 | `views/overview/ProjectCard.tsx` + `RegisterWizard.tsx`(步骤件 `wizard/StepPath|StepExternal|StepSummary`) | 项目卡可迁移 Pill/入口 + 向导条件步骤(检出 index.json 时插入 StepExternal 与 StepSummary 之间) | migration 动词 + 事件 |
| 4 | UF4 偏好 | `views/overview/`(新增 PreferenceSection) | 项目卡区块下偏好面(层级 segmented + 键分组) | prefs 动词 |
| 5 | UF5 提案 | `views/`(新增 ProposalsPage)+ tab 序修订(真落点 = `client/store/view-key.ts` WORKBENCH_TABS 状态机 + localStorage 持久化与 `isWorkbenchTabKey` 守卫 + `components/chrome/TabBar.tsx` roving tabindex + locale `tab.*` 键) | 第二 tab(概览/提案/Feature/任务)+ 审批徽标 | proposal 动词 |
| 6 | tool 桥 | `client/ipc/workbench.ts`(既有通道复用)+ host rpc server | host 半身 tool handler → client 桥函数 → IPC 动词 | I1 写集/读 |
| 7 | ForgeBridge 退役 | `host/forge-bridge.ts` + `forge-bridge-rpc.ts` + `cli-resolve.ts` 删除;`session-launch` → `dispatch-launch`(host `session-launch.ts`/`session-launch-rpc.ts` + client `session-launch.ts`/`launch-rpc.ts` + `views/tasks/launch/*`/`SessionLaunchEntry.tsx` 演进) | 预合成取代 `forge prompt`;M2 UF5 入口语义演进为「派发执行」 | dispatch 链 |

## Testing Strategy

### Per-Layer Test Plan

| Layer | Test Type | Tool | What to Test | Coverage Target |
|-------|-----------|------|--------------|-----------------|
| tasks/(状态机) | Unit | vitest | 7 态全合法边 + 全拒绝边矩阵;依赖解析(传递链/终态前置);对拍器(fixture:**forge-cli Go 源仓 `pkg/task` 行为基准 + 真实 index.json 语料**(含相位键/悬空 blocker)vs TS 内核零差异) | ≥80% 行 |
| store/(v2 迁移) | Unit | vitest | schema-v2.sql ↔ 内联常量漂移对账(v1 workbench-store.spec 先例);版本单调/拒新库 | 对账全绿 |
| migration/ | Unit | vitest + tmp 树 | 备份→摄入→对拍→切读→归档全链;失败注错回滚(零半迁移);重试幂等;外部写重摄入 + 偏离置位 | ≥80% |
| dispatch/ | Unit | vitest | 产物检查确定性(**断言无模型调用**);预合成三要素(协议/摘要/偏好注入内容断言);并行互不串扰;守卫计数 | ≥80% |
| prefs/ | Unit | vitest | 三级覆盖序全用例;键集/类型校验;事务原子(失败回滚) | ≥80% |
| stages/ + proposals/ | Unit | vitest + fixture | 门校验矩阵(各阶段清单);manifest 写入;frontmatter 解析;感知重建 | ≥80% |
| host 半身 | Unit | vitest + stub | tool 注册契约;桥接降级(重试→提示);approval 路由往返 | 主路径 |
| client 视图 | Unit | vitest + jsdom | 选择模式键盘契约;审批往返(批准/拒绝/详情);偏好覆盖/恢复;迁移对话框状态机 | 视图主路径 |
| SC 验收腿 | E2E | Playwright `_electron` | SC1-SC9 各一腿(对齐既有 e2e 惯例) | SC 全绿 |

### Key Test Scenarios

- **SC1**:干净环境(无 forge CLI)安装 → 注册迁移 → 派发 → dsh tool 提交 → 回流;进程/日志级断言 CLI 调用数 = 0;15 技能扁平名解析全成功。
- **SC2**:迁移前后任务全集对拍零差异;完成后 `index.json` 不存在(`.migrated-*` 在);md 原样;中断重试零半迁移。
- **SC3**:3 无依赖任务并行派发;subagent 注入内容含三要素(逐字符断言,hash oracle 复用 M2 channel stub journal 形态);审批可见可操作。
- **SC4**:产物缺失 → 警告清单不阻断(确认后派发);门拒绝/放行;资产文件存在 + 只读渲染;新阶段会话注入断言;外部跨阶段 → 偏离徽标。
- **SC5**:三级覆盖用例;预合成反映生效值。
- **SC6**:提案列表/详情/eval 一致性;外部变更 ≤5s;互跳;零写入口。
- **SC7**:未注册项目 CLI 照旧;已注册项目日常管线零 CC 插件 spawn(脚本断言)。
- **SC8**:spike×4 结论归档 design/(非 e2e)。
- **SC9**:新注册默认仓外;仓内兼容。
- **回归**:M1/M2 既有 e2e 腿不回归(单实例锁纪律:跑前查活跃实例)。

## Security Considerations

<!-- Override: Security Review enabled by PRD signal「权限/配置写入完整性/防注入」 -->

### Threat Model

| # | 威胁 | 面 |
|---|------|---|
| T1 | tool 面暴露给模型(越权写/参数注入) | dsh tool 注册 |
| T2 | systemPrompt 内容注入(任务 md/摘要 → 提示词) | 预合成 |
| T3 | customSkillDirs 任意目录注入(技能面劫持) | 配置写入 |
| T4 | renderer 桥滥用(渲染进程被攻破后经桥写内核) | tool 桥 |
| T5 | 审批伪造/重放 | approval 路由 |
| T6 | 迁移备份泄露/篡改 | migration |
| T7 | markdown 注入(提案/资产/记录渲染) | 渲染层(M2 延续) |

### Mitigations

- **T1**:输入 schema 严格类型;`taskKey` 白名单正则;操作限定注册项目集合;actor 强制审计;状态机/依赖校验在内核(不信任 tool 输入语义)。
- **T2**:三要素均为**文档数据**,经内核模板常量组装(不 eval、不拼接指令语义);`prompt_hash` 留档可审计;渲染与提示词共用防注入口径。
- **T3**:仅应用写 customSkillDirs;路径前缀 ∈ 插件安装目录(校验拒绝);清单 hash 校验漂移;修复失败显式告警不静默。
- **T4**:桥仅转发**封闭动词集**(无通配/无反射);IPC 白名单与 sender 校验延续;渲染进程被攻破面的最大能力 = 既定动词集(与 UI 同权,无提权)。
- **T5**:决策仅显式动词 + `decided_by` 审计;状态机拒绝重复决策(`ERR_APPROVAL_DECIDED`);payload 只读呈现。
- **T6**:备份落 userData(默认权限);迁移事件留档;库文件不含凭据。
- **T7**:MarkdownView 白名单延续(M2);渲染区无交互元素。

## PRD Coverage Map

| PRD Requirement / AC | Design Component | Interface / Model |
|----------------------|------------------|-------------------|
| G1 零 CLI 执行链 + 15 技能寻址 | ForgeBridge 退役 + 预合成 + customSkillDirs | I3 / I6 / Testing SC1 |
| G2 SoT 迁移零丢失(显式/原子/对拍/淘汰) | migration/ + task 表 + 备份回滚 | I4 / schema.sql / SC2 |
| G3 subagent 并行 + 预合成三要素 + 审批 | dispatch/ + dispatch-launch + approval-bridge | I3 / dispatch.prompt_hash / SC3 |
| G4 阶段硬门(确定性/警告不阻断/门拒绝/偏离) | stages/ + checkStageArtifacts + watcher 偏离 | I5 / SC4 |
| G5 偏好三级继承 + 预合成消费 | prefs/(单表)+ 解析 | I1 prefs 动词 / SC5 |
| G6 提案看板(只读/≤5s/互跳) | proposals/ 索引 + ProposalsPage | I1 proposal 动词 / SC6 |
| G7 默认仓外 | 注册向导默认值翻转(M2 向导扩展) | I4.8 / SC9 |
| G8 过渡双形态(files 项目走 CLI 提示/零 spawn) | data_authority 路由 + 工具权限界 | I2 / SC7 |
| Story1 显式迁移 | migration 对话框链 + 向导步骤 | I4 / UF3 |
| Story2/3 派发闭环 + 预合成 | dispatch/ + launch + 回流 | I1/I3 |
| Story4 阶段门 + 跨阶段传递 | stages/ + 预合成消费 stage_asset | I5 |
| Story5 偏好三级 | prefs/ + 编辑面 | I1 |
| Story6 提案浏览 | proposals/ + 互跳 | I1 |
| Story7 仓外默认 | 向导默认值 + 文档根寻址 | I4.8 |
| Story8 双形态不破坏 | 权威路由 + 外部写回收(T3) | I2/I4.7 |
| Story9 tool 原生操作 + 降级 | forge-tools + 桥降级 | I2 |
| D1-D5(PRD 裁决) | I4(D1)/ I6(D2)/ prefs 键集(D3)/ 知识 tool(D4)/ 技能表(D5) | — |
| SC8 spike×4 | Phase 0 门控;结论回填 Open Questions | spike 档 |

## Open Questions

> Phase 0 spike×4(零产品代码)回填;结论归档 design/,作为后续任务开工依据(SC8)。

- [x] spike ① dsh tool 注册契约:vendored `plugin-manager/tools.ts` 先例;renderer 桥时延与启动竞态实测(T2 可用性确认)。**结论(2026-09-23,详见 [spike-1-tool-registration.md](spike-1-tool-registration.md)):T2 可用。①注册契约定形——`defineTool` + `ctx.tools.register`(host 半身 root context = 全局工具,base `tools` 行装配,`run_code` 保留名/同 scope 重名拒绝;先例逐项成立);②桥机制修正——字面「host 发起 rpc」在上游开放面不存在(转发事件白名单 const 闭合,`api/remotes/src/remote-events.ts`),可行形态 = **client 订问 stream Remote(`@Remote({mode:'stream'})`,sessionController.follow/control 先例)+ 单向 answer**,经自有 `TypertRemoteService`(SRC 发现,M2 ForgeBridge 同型),零新端口/零新依赖/动词封闭保持,已以最小实测工程全链打通;③实测时延——桥全往返 med ~1.3ms、含 dsh 工具管线 ~16ms,boot 竞态由 backlog 重放吸收(无丢失),无人应答走预算超时——「重试一次 + ERR_TOOL_BRIDGE_UNAVAILABLE」降级链充分(附 activeStreams 快速失败优化建议);④**偏差回填——`forge.task.add` 点号名会被 provider 字符集拒绝(名原样上 wire,上游全 snake_case),2.1 须改下划线扁平名(`forge_task_add`)或单工具+action 枚举**。**

- [ ] spike ② subagent 审批面:审批事件订阅/应答通道 + FORGE_ACTOR 在 subagent 上下文的透传形态。
- [ ] spike ③ systemPrompt 注入契约:四候选裁决——①create 选项 ②会话模板/preset ③首条 system 消息 ④**首条 user 消息追加(M2 已落地 e2e 验证基线:`prompt(mode:'queue')` + FORGE_ACTOR 追加行 + 逐字符 hash oracle;实测 dsh 无 per-session env 注入面)**;先证伪/证实 systemPrompt 面存在性,无则 ④ 默认;`prompt_hash` 口径随裁决。
- [ ] spike ④ `forge prompt` 模板移植面:任务类型协议文本清单 + 预合成模板映射(含暂缓技能的协议依赖);**模板权威源 = forge-cli `pkg/prompt/templates` + `pkg/task/templates`**(Go 源码逐文件核对,不凭文档记忆)。

## Appendix

### Alternatives Considered

| Approach | Pros | Cons | Why Not Chosen |
|----------|------|------|----------------|
| Go 引擎嵌入库(状态机) | 零重写 | cgo/原生模块破坏零重编译与三平台纪律 | T1 裁决(TS 移植 + 对拍器保证等价) |
| 写通道内核 spawn CLI | 实现快 | 违反 SC1 零 CLI;审计面弱 | PRD 明令退役 |
| named-pipe/UDS 直连内核 | 时延最低 | 新增本地监听端点面 + ACL/鉴权负担 | T2 裁决(renderer 桥零新面) |
| 外部写仅告警不摄入 | 实现最简 | SQLite 与 index.json 持续分叉,权威名存实亡 | T3 裁决(自动重摄入) |
| 阶段资产时间戳多份 | 保留全历史 | 门校验/「最新一份」语义复杂化 | T4 裁决(单一规范文件) |
| 偏好三文件/三表 | 物理隔离直观 | 解析/迁移/编辑面三倍形态 | 单表 scope 化(设计内定) |
| 编排器独立进程 | 隔离强 | 进程足迹 >2,违继承约束 | dispatch 入内核 |
| dispatch 逻辑入插件 host | 就近会话通道 | SQLite 单写者破;预合成不可断言 | 内核编排 + host 仅持 launch |
| systemPrompt 由 host 半身合成 | 就近注入 | 三要素数据(偏好/资产)在内核;双查询;断言弱 | 内核预合成(确定性可断言) |

### References

- PRD:[prd/prd-spec.md](../prd/prd-spec.md)(D1-D5 裁决 / DF001-DF008 / G1-G8 / SC1-SC9)
- UI:[ui/ui-design.md](../ui/ui-design.md)(eval 954/1000)+ [ui/prototype/](../ui/prototype/)(已批准 2026-09-23)
- M2 设计:[dsh-forge-m2 tech-design](../../dsh-forge-m2/design/tech-design.md)(内核/IPC/发起链/spike-1 结论)
- 约定:product-architecture.md(TECH-product-arch-003/004)、electron-ipc-security.md、ui-reuse.md、upstream-vendor.md
- vendored 侦察:skill-filesystem(customSkillDirs)、plugin-manager/tools.ts(tool 注册)、session-controller(subagent)存在性已证(2026-09-23)
- **forge-cli Go 源码(移植唯一权威)**:`Z:\project\ai\forge\forge-cli` —— `pkg/task/statemachine.go`(7 态)/ `deps.go`+`toposort.go`(依赖)/ `stage_gates.go`(门)/ `pkg/prompt/templates`+`pkg/task/templates`(提示词);对拍器与 spike ④ 直接以此为准
- M2 实码偏差核对(2026-09-23,M2 PR #2 合入后):task_key 限定地址方言(TECH-data-kernel-003)、prefs feature scope 限定地址、schema 载体四件套(migrate.ts 段 + 内联常量 + 漂移对账 + PRAGMA 不入 DDL)、注入候选 ④(user 消息基线)——均已修入本设计
