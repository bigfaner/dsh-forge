---
title: "任务域数据与契约约定"
domains: [task, identity, transition-targets, dispatch-prompt, worker-matrix, schema, column-naming]
---

# 任务域数据与契约约定

> 任务域（每工作区 forge.db + plugin-forge 面）的技术契约：身份双轨、状态转移纯函数、dispatchPrompt 构成、SQL 列名与存储纪律。

## 身份与键

### TECH-task-001: 任务身份双轨

**Requirement**: tasks.id（uuid 代理主键）= FK / 前端 / RPC 引用锚，恒稳定（slug 改名零级联）；slug + local_id（UNIQUE 复合自然键）= agent 识别面（'slug/localId' 呈现；UNIQUE(slug, local_id) 查捞）；agent 面 tool 输入 = slug + local_id 两显式参（免拼接歧义），服务内解析后走 id 路径；UI/RPC 面 = taskId；TaskSnapshot / TaskCard 恒含 {taskId, slug, localId}（前端以 taskId 为 key、slug/localId 为显示）；slug 列 ≡ 容器 slug（M3 起源头双列 source_kind+source_id——feature/proposal 同规，多态引用无 DB FK、引用完整性 = 服务不变量 + validateFeatureTasks，见 TECH-task-007 与 business-rules/mode-containers.md BIZ-mode-001）。
**Source**: feature/dsh-forge-m2-pipeline TECH-005（tech-design §Interface 1·§关键技术决策·§Cross-Layer Data Map / packages/core/src/forge/tasks）

## 状态转移面

### TECH-task-002: transitionTargets 纯函数所见即所得

**Requirement**: transitionTargets(current, face) 单一纯函数双面——human = 七态 − 当前态（from≠to 任意，菜单全列机械排除自身）；agent = 转移矩阵推导；taskDetail.allowedTransitions（human 面）驱动转移对话框选项集，transitionTask 服务端先验 toStatus ∈ transitionTargets(current, 'human')——UI 菜单与服务端同一纯函数，零漂移。
**Source**: feature/dsh-forge-m2-pipeline TECH-006（tech-design §Interface 10·§关键技术决策 / packages/core/src/forge/tasks/state-machine.ts）

## 派发简报

### TECH-task-003: dispatchPrompt 构成契约

**Requirement**: 组成序 = 人格段（task-executor，无标签）→ `<constraints>` → `<task-context>` → `<type-policy>`；XML 标签集封闭于四枚（`<forge-pipeline>` 系统提示段 + 三块级标签），新增 = 契约面变更（G1 pin 锚定）；`<task-context>` = 键值行不加键级标签（M3 起增容器语境行 `SOURCE: feature|proposal <slug>`——任务带容器出厂）；digest = sha-256(全文，含人格段与标签) 前 12 hex；dispatchPrompt = executor 唯一差异化通道（无 per-spawn 系统提示注入）；dispatchPrompt 不入库，record 只存 digest（全文本体 = dsh 子会话日志；M3 起三层存放追溯闭环见 conventions/event-logging.md TECH-event-001）。
**Source**: feature/dsh-forge-m2-pipeline TECH-007（tech-design §Interface 9·§关键技术决策 / packages/core/src/forge/tasks/prompt）

## 存储纪律

### TECH-task-004: SQL 列名与存储纪律

**Requirement**: 列名保留字清剿（task_key / task_type / task_status / task_desc / feature_status / proposal_status 等跨方言保留字列名禁用）；rel_path 统一正斜杠、悬空容忍（dangling 态）；实际改动文件记录 = files_json 结构化 JSON 列（非自由文本）；全表 updated_at（基建表豁免）；每工作区库 schema 独立版本线（FORGE_DB_SCHEMA_VERSION）+ schema.sql ↔ MIGRATIONS 逐条 pin。
**Source**: feature/dsh-forge-m2-pipeline TECH-008（tech-design §Data Models·§关键技术决策·§Cross-Layer Data Map / packages/core/src/forge/workspace/migrations.ts）

## 派发动词与 worker 供给（M3 起）

### TECH-task-005: dispatchTask 复合派发动词

**Requirement**: dispatcher 每轮单调用 `dispatchTask(source_kind+source_slug 对参，缺席 = 全库盲选——context_slug 入参已退役，无任务事件归属由 source_slug 兼任)`——插件代码内 claim（core API）→ 收窄组装 → in-process driver spawn（阻塞）→ 返回结算；dispatchPrompt 零进模型上下文（完整性 + token 双赢：模型不可转述改写）；返回三分支 spawned{success|blocked, 结算摘要} / no-task（池态区分收工/等待/疑似死锁）/ halted；池快照 {pending, inProgress, blocked, unmetPending}（taskStats 现读·无状态，unmetPending = pending ∧ 前置未全满足计数）附载每次返回；halted 机械防线 = 插件内会话作用域易失计数器，连续 spawn 失败 ×3 粘住（无重置参数、模型不可自行解锁、复位 = 新会话；成功即清零、冷启动重置）；spawn 失败处置 = 任务留 in_progress 走幂等重入径（不走 submit-blocked——执行受阻语义），返回 ERR_SPAWN_FAILED + 指引；claimTask tool 退役（core API 保留，由 dispatchTask/桥/回放消费）。
**Source**: feature/dsh-forge-m3-bootstrap-presets TECH-001（tech-design §Interface 2·§关键技术决策 / packages/plugin-forge/src/tools/dispatch-task.ts）

### TECH-task-006: worker 供给收窄（矩阵 + 全局拒绝 + 默认 LLM）

**Requirement**: toolFilter 携带者 = run-tasks 派发面 in-process spawn（模型面调用参数不可达——spike 落位裁决）；收窄矩阵 = contracts `worker-matrix.ts` 常量（任务类型族四值 coding/doc/gate/validation × 工具族六值 fs/shell/jobs/read-image/web/forge——G1-20 pin 对象）；全局拒绝集 = 上游组合实面实名八员（ask_user_question / delegation 族五员 subagent_fork·list_agents·send_message·interrupt_agent·workflow / todo_write / present——族代称入表会因 driver restrict() 未知名 loud 校验拆一切 spawn，fix-1/drift #10；spawn provider 的 `subagent` 惰性注册刻意不入表）；forge 面 = submitTask + addTask 恰两动词；工具名→族映射表逐名核对入 pin（上游组合演进 → pin 红 → 随迁；core/plugin/web 禁重复定义）；skill 面 = 组合继承目录（catalog 行级常驻、内容按需加载——测试任务加载 run-tests、非测试不加载）；agentOptions = forgeSettings 默认 LLM 显式携带（优先于父会话继承；未配置不携带回退继承——见 rpc-and-contracts.md TECH-rpc-009）。
**Source**: feature/dsh-forge-m3-bootstrap-presets TECH-002（tech-design §Interface 2·图 4 / packages/contracts/src/worker-matrix.ts）

## 容器化 schema（M3 起）

### TECH-task-007: 任务库 schema v1 直改与八域表终态

**Requirement**: forge.db v1 DDL 直改终态（产品未上线零兼容义务：FORGE_DB_SCHEMA_VERSION=1 不变、无迁移路径、存量开发库废弃重扫——用户裁决 2026-10-08）；八域表 = +feature_records（verb TS 单源 + actor 三值 CHECK + append-only 双触发器）；proposals +mode（CHECK expedition|blitz|NULL）+ superseded_by（自引用 FK）；tasks 源头双列化（source_kind+source_id 取代 feature_id）+ mode 快照（NULL 容许）+ ac_json、main_session 砍除（老 forge 形态约束残留·零消费者）；索引 idx_tasks_feature_status → idx_tasks_source_status；schema.sql ↔ migrations 逐条 pin 同步；容器归属业务不变量见 business-rules/mode-containers.md BIZ-mode-001。
**Source**: feature/dsh-forge-m3-bootstrap-presets TECH-003（tech-design §Data Models·差异总表 / packages/core/src/forge/workspace/migrations.ts）
