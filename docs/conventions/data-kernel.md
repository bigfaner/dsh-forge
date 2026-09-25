---
title: "数据内核工程约束(schema 演进 · 单写者)"
domains: [data-kernel, sqlite, schema, migration, taskkey, statemachine, repo-service]
---

# 数据内核工程约束(schema 演进 · 单写者)

## Data Kernel

### TECH-data-kernel-001: workbench.db schema 演进 = 版本化增量迁移,只增不删

**Requirement**: 数据内核 schema 变更一律以版本化增量迁移交付(v1→v2→…);每个版本**只增不删**——既有表与列全保留,新能力经 ALTER 增列/新表承载;载体 = 四件套——`design/schema.sql` 为**设计投影**,运行时权威 = `migrate.ts` MIGRATIONS 版本段 + 内联 TS 常量,**两者由漂移对账测试强制同步**(剥注释按 `;` 切分——中文注释含分号;空白归一化;语句数反空转锚点);每版本段**各自事务**顺序执行,schema_version 单行只进不退,库版本 > 已知即拒开(ERR_WORKBENCH_DB),失败即启动失败(显式错误路径,不降级静默);PRAGMA(WAL/foreign_keys)为连接级设置由 db.ts 每次开库应用,不入 DDL;快照/索引类表(`task_snapshot`/`stage_asset`/`proposal_snapshot`)定位为派生可重建,不承载权威语义。
**Context**: M2 v1 → M3 v2 首次实践(2026-09-23);双载体下 SQLite 单写者 = Electron 主进程内核,schema 演进须与「零半迁移/可对拍」纪律同构。
**Scope**: [CROSS]
**Source**: features/dsh-forge-m3/design/schema.sql;features/dsh-forge-m3/design/er-diagram.md;features/dsh-forge-m2/design/tech-design.md §Data Models

- 读路由可按列开关(如 `projects.data_authority`)渐进切换权威通道;旧通道(文件)保留至终态淘汰,禁止一刀切。
- 归档类文件操作(如 `index.json` → `*.migrated-<ts>`)与库内状态变更同批失败时必须整体回滚(备份恢复),不留半迁移态。
- CHECK 约束表达静态词表(状态机/相位);动态键集(偏好键注册表)用应用层校验,不硬编码进 SQL。

### TECH-data-kernel-002: node:sqlite 内核实现纪律(内建零重编译 · WAL · 启动探针)

**Requirement**: SQLite 经主进程内嵌 `node:sqlite`(Electron 44/Node ≥22.20 内建,零原生重编译;弃 better-sqlite3 等原生模块);每次 opening 应用 `PRAGMA journal_mode = WAL` + `foreign_keys = ON`;库文件落 `<userData>/workbench/` 独立目录,与 `$DSH_HOME`、host-profile 目录分立;启动探针(可用性检查 + 试开库)失败 = 显式启动错误路径,禁止静默降级为无库运行;库损坏 → 旧库(含 -wal/-shm 伴生文件)改名备份后重建空库并明确告知。
**Context**: 离线自足/三平台打包零额外成本与进程足迹纪律的共同约束;M2 D1 裁决(SQLite 全落)的实现基座。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-002(design/tech-design.md §Overview/§Dependencies/§Error Handling;apps/desktop/src/main/workbench/store/db.ts)

### TECH-data-kernel-003: taskKey 看板地址方言(`<featureSlug>/<localId>`)

**Requirement**: task_snapshot 主键采用看板地址形态 `<featureSlug>/<localId>`(非裸 forge ID);blockers 原样存上游本地 key(同 feature 命名空间);树视图按 feature_slug 分组展开传递链;后续消费面(watcher 感知、IPC、会话挂接、e2e)统一沿用该地址形态。
**Context**: M2 任务 2.5 方言适配裁决(forge task_key 存在 slug id 形态,裸 `N.N` 假设不成立);schema PK 与跨层字段图的一致性依赖。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-003(apps/desktop/src/main/workbench/indexer/scan.ts;records/2.5)

### TECH-data-kernel-004: taskKey 校验 = 形态白名单(结构校验),弃裸 ID 数字正则

**Requirement**: taskKey 全消费面(dsh tool 面、内核写集、迁移摄入合成)统一校验 = 看板限定地址形态 `<featureSlug>/<localId>` 的**结构白名单**——单 `/` 分隔 + 两段非空 + 禁路径分隔符/控制字符;**禁止裸 ID 数字正则**(localId 含 `5.gate` 等非数字相位键,看板全量投影不排除);工具面与内核**双闸复验**(featureSlug 前缀一致性等语义不变式归内核,不信任 tool 输入)。
**Context**: TECH-data-kernel-003(方言)的校验半面;M3 落地于 task-tools 形态校验 + task-repo 复验;模型面参数注入缓解(威胁 T1)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 TECH-006(design/tech-design.md §Interface 2/§Cross-Layer Data Map;tasks/records/2.1、1.3)

### TECH-data-kernel-005: 状态机/依赖解析移植对拍纪律(forge-cli Go 源码唯一权威)

**Requirement**: forge 任务状态机(7 态)/依赖解析/拓扑排序的 TS 移植以 **forge-cli Go 源码为唯一行为权威**(pinned commit;`pkg/task/statemachine.go`/`deps.go`/`toposort.go`);行为差异一律以 Go 为准;对拍 = Go 侧生成 `baseline.json`(合法边全矩阵含**逐字错误消息** + 依赖/拓扑例 + 真实 index.json 语料,含相位键/悬空 blocker)vs TS 逐例零差异;Go map 迭代序致同秩弹出逐运行随机,对拍须按**相邻同秩段去序归一**(确定性语料为恒等变换;unmet 按多重集比较);悬空依赖两套检查口径**保持分立并注释钉定**(claim 对悬空精确依赖 vacuously satisfied 不阻断;transition 悬空 = unmet——Go 源本就是两套);提示词模板库完整性同样对拍 Go embed FS(ValidatePromptTemplates 漂移测试)。内核任务语义的后续变更仍须回 Go 源对拍后再改 TS。
**Context**: M3 T1 裁决(TS 原生移植,弃 Go 嵌入库——cgo 破坏零重编译/三平台纪律);对拍器 = scripts/tasks-parity-gen,baseline 已提交、再生可选。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 TECH-005(design/tech-design.md §关键裁决 T1/§Testing;tasks/records/1.2、1.3)

### TECH-data-kernel-006: 内核域模块模式 = repo(唯一写入口)+ service(动词面)+ 感知 seam

**Requirement**: 数据内核新域(tasks/dispatch/approvals/prefs/stages/proposals/migration)统一模块模式——`*-repo` = 该表**唯一写入口**(状态 CHECK/不变式在 repo 层强制;多语句写经 SAVEPOINT/事务包裹);`*-service` = IPC 动词面(校验全前置 + 组合 repo + 发事件),写动词全经状态机/依赖校验;感知类新增 = watcher/indexer 挂 services 感知 seam(hook 形态,如 createDeviationHook.beforeScan),hook 不 throw、失败仅 log;派生索引(stage_asset/proposal_snapshot 等)= 感知与重建共用 collect/replace 行集替换,零漂移。
**Context**: M3 六域一致实践(task-repo/dispatch-repo/approval-repo/proposals 索引器/deviation hook);M4 新域(知识库等)沿用,防旁路直写。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3(隐式规则,漂移扫描期提取;tasks/records/1.3、3.3、4.2、5.3;apps/desktop/src/main/workbench/*/)
