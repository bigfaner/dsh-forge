---
title: "任务域数据与契约约定"
domains: [task, identity, transition-targets, dispatch-prompt, worker-matrix, schema, column-naming]
---

# 任务域数据与契约约定

> 任务域（task-loop 自持 task-loop.db + `plugins/task-loop` 面）的技术契约：身份双轨、状态转移纯函数、dispatchPrompt 构成、SQL 列名与存储纪律。六表实体与 DDL 正本 = `.forge/docs/proposals/plugin-task-loop/entities.md`。

## 身份与键

### TECH-task-001: 任务身份双轨

**Requirement**: tasks.id（uuid 代理主键）= FK / 前端 / RPC 引用锚，恒稳定（slug 改名零级联）；slug + local_id（UNIQUE 复合自然键）= agent 识别面（'slug/localId' 呈现；UNIQUE(slug, local_id) 查捞）；agent 面 tool 输入 = slug + local_id 两显式参（免拼接歧义），服务内解析后走 id 路径；UI/RPC 面 = taskId；TaskSnapshot / TaskCard 恒含 {taskId, slug, localId}（前端以 taskId 为 key、slug/localId 为显示）；slug 列 ≡ 容器 slug（task-loop 终态：容器语义 slug 化——source_kind/source_id 容器双列退役，任务容器 = slug 本身的通用执行容器，多态引用零 DB FK、引用完整性 = 服务不变量；行级归属键 project_key 为容器维度前导列，见 TECH-task-007 与 entities.md）。
**Source**: feature/dsh-forge-m2-pipeline TECH-005（tech-design §Interface 1·§关键技术决策·§Cross-Layer Data Map / packages/core/src/forge/tasks）

## 状态转移面

### TECH-task-002: transitionTargets 纯函数所见即所得

**Requirement**: transitionTargets(current, face) 单一纯函数双面——human = 八态 − 当前态（from≠to 任意，菜单全列机械排除自身；S3 起 TaskStatus 八值 = 七值 + interrupted）；agent = 转移矩阵推导；taskDetail.allowedTransitions（human 面）驱动转移对话框选项集，transitionTask 服务端先验 toStatus ∈ transitionTargets(current, 'human')——UI 菜单与服务端同一纯函数，零漂移。
**Source**: feature/dsh-forge-m2-pipeline TECH-006（tech-design §Interface 10·§关键技术决策 / packages/core/src/forge/tasks/state-machine.ts）；S3 增补（proposal run-tasks-host-command——矩阵 +in_progress→interrupted / interrupted→in_progress 两边）

## 派发简报

### TECH-task-003: dispatchPrompt 构成契约

**Requirement**: 组成序 = 人格段（task-executor，无标签）→ `<constraints>` → `<task-context>` → `<type-policy>`；XML 标签集封闭于四枚（`<forge-pipeline>` 系统提示段 + 三块级标签），新增 = 契约面变更（G1 pin 锚定）；`<task-context>` = 键值行不加键级标签（容器即 slug——SOURCE 行退役；`<goal>` 包裹撤除）；digest = sha-256(全文，含人格段与标签) 前 12 hex；dispatchPrompt = executor 唯一差异化通道（无 per-spawn 系统提示注入）；dispatchPrompt 不入库，record 只存 digest（全文本体 = dsh 子会话日志；三层存放追溯闭环见 conventions/event-logging.md TECH-event-001）。
**Source**: feature/dsh-forge-m2-pipeline TECH-007（tech-design §Interface 9·§关键技术决策 / packages/core/src/forge/tasks/prompt）；task-loop 终态改写（容器 slug 化——SOURCE 行/`<goal>` 包裹退役 / plugins/task-loop/host/domain/tasks/prompt/compose.ts）

## 存储纪律

### TECH-task-004: SQL 列名与存储纪律

**Requirement**: 列名保留字清剿（task_key / task_type / task_status / task_desc / feature_status / proposal_status 等跨方言保留字列名禁用）；rel_path 统一正斜杠、悬空容忍（dangling 态）；实际改动文件记录 = 结算 `evidence_json.files` 结构化键（files_created/files_modified 入参聚合，非自由文本）；全表 updated_at（基建表豁免）；库 schema 独立版本线（FORGE_DB_SCHEMA_VERSION）+ schema.sql ↔ MIGRATIONS 逐条 pin。
**Source**: feature/dsh-forge-m2-pipeline TECH-008（tech-design §Data Models·§关键技术决策·§Cross-Layer Data Map / packages/core/src/forge/workspace/migrations.ts）

## 派发动词与 worker 供给（M3 起）

### TECH-task-005: dispatchTask 复合派发动词

**Requirement**: dispatcher 每轮调用 `dispatchTask(slug 必填——schema 强制，缺失即拒绝，无池级盲选形态；容器 = slug 本身)` 启动/续接/并入该容器的宿主派发循环（与 `/run-dag-tasks` 指令同源同一循环核心——run-tasks 会话技能已退役）；循环内 claim（core API）→ 收窄组装 → in-process driver spawn → 结算随工具调用内联返回；会话级单活门控（同会话已有活循环即拒绝）；升级点（blocked 裁决/死锁/处置超限）进入 awaiting-verdict 挂起态（载荷留存 registry、不落 task_status、非终态），处置回流后幂等 re-entry 续跑（resume 显式）；终局收口两径：spawn 连败 ×3 → halted 终态（guard 按 LoopInstanceId 粘住，不挂起）、等待超时 → wait-timeout settlement 终局返回（registry 留存返回，非挂起态）；停止入口 = `stopTaskLoop` 工具 + `/stop-dag-tasks` 指令（运行中仅 owner 可停、挂起态任意会话可停）；dispatchPrompt 零进模型上下文（完整性 + token 双赢）；dispatchPrompt 不入库，record 只存 digest（全文本体 = dsh 子会话日志；三层存放追溯闭环见 conventions/event-logging.md TECH-event-001）；池快照 {pending, inProgress, blocked, unmetPending} 附载每次返回；claimTask tool 退役（core API 保留，由派发循环/桥/回放消费）。
**Source**: feature/dsh-forge-m3-bootstrap-presets TECH-001（tech-design §Interface 2 / packages/plugin-forge/src/tools/dispatch-task.ts）；dispatch-loop-hardening 改写（3b——容器必填/循环语义/挂起态/单活门控/stopTaskLoop / packages/plugin-forge/src/loop）；task-loop 终态改写（slug 单参容器绑定——source_kind/source_slug 退役 / plugins/task-loop/host/tools/dispatch-task.ts）

### TECH-task-006: worker 供给收窄（矩阵 + 全局拒绝 + 默认 LLM）

**Requirement**: toolFilter 携带者 = 派发循环 in-process spawn（dispatchTask 专面——模型面调用参数不可达）；收窄矩阵 = contracts `worker-matrix.ts` 常量（任务类型族四值 coding/doc/gate/validation × 工具族六值 fs/shell/jobs/read-image/web/forge——G1-20 pin 对象）；全局拒绝集 = 上游组合实面实名十员（ask_user_question / delegation 族五员 subagent_fork·list_agents·send_message·interrupt_agent·workflow / goal 三件套 create_goal·get_goal·update_goal / present——族代称入表会因 driver restrict() 未知名 loud 校验拆一切 spawn，fix-1/drift #10；todo_write 已解禁——worker-lean-execution S5；spawn provider 的 `subagent` 惰性注册刻意不入表）；forge 面 = WORKER_FORGE_TOOLS 五动词（submitTask + addTask + recordBug/resolveBug 两 bug 写径 + getBug 链上下文读径；addTask 按 caller 身份分流——loopSourced spawn 的 worker 会话拒收，任务派生权归主会话/循环 triage）；工具名→族映射表 17 名全表逐名核对入 pin（上游组合演进 → pin 红 → 随迁；core/plugin/web 禁重复定义）；skill 面 = 组合继承目录（catalog 行级常驻、内容按需加载——无任务类型差异化加载；测试链纪律由 `test-run` 任务挂接的 `experts/test-runner.md` 档案承载）；agentOptions = forgeSettings 默认 LLM 显式携带（优先于父会话继承；未配置不携带回退继承——见 rpc-and-contracts.md TECH-rpc-009）。
**Source**: feature/dsh-forge-m3-bootstrap-presets TECH-002（tech-design §Interface 2·图 4 / lib/api/src/worker-matrix.ts）；dispatch-loop-hardening 改写（改进 5 addTask 身份分流 / 全局拒绝集十员——worker-lean-execution S5 迁移）

## 任务库 schema（task-loop 终态）

### TECH-task-007: task-loop.db 六表 v1 终态

**Requirement**: task-loop 自持 task-loop.db，新线 v1 DDL 单事务落地六表终态（task_tasks / task_settlements / task_checkpoints / task_edges / task_session_links / task_records）——容器语义 slug 化：行级归属键 project_key（cwd 纯函数派生）为持容器键表的前导列，附属表经 task_id FK 传导归属；代理键统一纯 UUID（六表零 AUTOINCREMENT，排序/单调性锚 = created_at + seq）；task_tasks 自带验收判据 ac_json（task 唯一承接面，零 goal 概念——goalId 族退役）+ fix_of_task_id（fix 判别单源）+ scope_json/context_json；结算单源 = task_settlements（append-only 双触发器；ac_results_json 单列核销快照 + evidence_json 两形证据载荷——submitTask 入参终态 = ac_results 单数组 + facets，旧 ac_criteria/ac_met/ac_evidence 三平行数组与 runtime_surface/runtime_face 均退役）；task_records = 动词流水（note/payload_json，submit 载荷对 settlements 封闭）；BLOCKERS 权威来源 = 最新 blocked 结算行 evidence_json.reason；schema.sql ↔ MIGRATIONS 逐条 pin。实体与 DDL 正本 = `.forge/docs/proposals/plugin-task-loop/entities.md`。
**Source**: feature/dsh-forge-m3-bootstrap-presets TECH-003（tech-design §Data Models·差异总表 / packages/core/src/forge/workspace/migrations.ts）；task-loop 终态改写（plugin-task-loop 提案——六表 v1 单源 / plugins/task-loop/host/db/migrations/version-1.ts）
