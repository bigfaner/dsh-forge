---
feature: "dsh-forge-m3-bootstrap-presets"
generated: "2026-10-08"
status: draft
---

# Technical Specifications: dsh-forge M3 自举·模式预设（双预设 + 拆包 + 技能迁移 + 提案管线消费）

> 来源：design/tech-design.md（十一项用户裁决 + Interface 1-6 + Data Models + drift 记账）+ 代码侦察核实（2026-10-08，全部条目已对当前代码验证）。

## 派发面

### TECH-001: dispatchTask 复合派发动词

**Requirement**: dispatcher 每轮单调用 `dispatchTask(contextSlug?)`——插件代码内 claim（core API）→ 收窄组装 → in-process driver spawn（阻塞）→ 返回结算；dispatchPrompt 零进模型上下文（完整性 + token 双赢：模型不可转述改写）；返回三分支 spawned{success|blocked, 结算摘要} / no-task（池态区分收工/等待/疑似死锁）/ halted；池快照 {pending, inProgress, blocked, unmetPending}（taskStats 现读·无状态）附载每次返回；halted 机械防线 = 插件内会话作用域易失计数器，连续 spawn 失败 ×3 粘住（无重置参数、模型不可自行解锁、复位 = 新会话；成功即清零、冷启动重置）；spawn 失败处置 = 任务留 in_progress 走幂等重入径（不走 submit-blocked——执行受阻语义），返回 ERR_SPAWN_FAILED + 指引；claimTask tool 退役（core API 保留，由 dispatchTask/桥/回放消费）。
**Scope**: [CROSS]
**Source**: tech-design §Interface 2·§关键技术决策 / packages/plugin-forge/src/tools/dispatch-task.ts

### TECH-002: worker 供给收窄（矩阵 + 全局拒绝 + 默认 LLM）

**Requirement**: toolFilter 携带者 = run-tasks 派发面 in-process spawn（模型面调用参数不可达——spike 落位裁决）；收窄矩阵 = contracts `worker-matrix.ts` 常量（任务类型族四值 coding/doc/gate/validation × 工具族六值 fs/shell/jobs/read-image/web/forge——G1-20 pin 对象）；全局拒绝集 = 上游组合实面实名八员（ask_user_question / delegation 族五员 subagent_fork·list_agents·send_message·interrupt_agent·workflow / todo_write / present——族代称入表会因 driver restrict() 未知名 loud 校验拆一切 spawn，fix-1/drift #10）；forge 面 = submitTask + addTask 恰两动词；工具名→族映射表逐名核对入 pin（上游组合演进 → pin 红 → 随迁）；skill 面 = 组合继承目录（catalog 行级常驻、内容按需加载——测试任务加载 run-tests、非测试不加载）；agentOptions = forgeSettings 默认 LLM 显式携带（优先于父会话继承；未配置不携带回退继承）。
**Scope**: [CROSS]
**Source**: tech-design §Interface 2·图 4 / packages/contracts/src/worker-matrix.ts

## 数据面

### TECH-003: 任务库 schema v1 直改与八域表终态

**Requirement**: forge.db v1 DDL 直改终态（产品未上线零兼容义务：FORGE_DB_SCHEMA_VERSION=1 不变、无迁移路径、存量开发库废弃重扫）；八域表 = +feature_records（verb TS 单源 + actor 三值 CHECK + append-only 双触发器）；proposals +mode（CHECK expedition|blitz|NULL）+ superseded_by（自引用 FK）；tasks 源头双列化（source_kind+source_id 取代 feature_id）+ mode 快照（NULL 容许）+ ac_json、main_session 砍除；索引 idx_tasks_feature_status → idx_tasks_source_status；schema.sql ↔ migrations 逐条 pin 同步。
**Scope**: [CROSS]
**Source**: tech-design §Data Models·差异总表 / packages/core/src/forge/workspace/migrations.ts

## 预设装配

### TECH-004: 预设装配形态（boot overlay 物化 + 行所有权分叉）

**Requirement**: `apps/host/src/profile/presets/{cordis,expedition,blitz}.patch.yml` 三底稿——cordis = registry default 覆写（expedition）；预设行 = 上游 standard 全量镜像（**config 全集**——缺必填 config → schema 拒 → 整预设 broken 不上菜单）+ plugin-forge 行 +（远征）plugin-forge-spec 行 + customSkillDirs + persona（只谈作风不谈角色与工具禁令）；物化 = renderBootOverlay 每启注行、customSkillDirs 解析为当形态**绝对路径**（`!!js` 表达式全形态死刑——物化输出零表达式残留）；预设行内 plugin-forge[+spec] 增量行携带同 config（bindingsFile 占位符 `{{plugin-forge-bindings}}` 物化与全局行同值——缺省即遮蔽全局配置实例致 ERR_WORKSPACE_NOT_REGISTERED，fix-1/drift #9）；契约 pin = 两预设 standard 基础行 ↔ 上游 standard.patch.yml 机械 diff 一致；行所有权分叉 = 预设声明行 boot 每启覆盖（产品工件，用户不可经 UI 改组合）/ ui-settings 开关行首启预置一次性（PROFILE_TEMPLATE + materialize 增量补行 id 键控已存在不覆盖，此后归用户运行时）。
**Scope**: [CROSS]
**Source**: tech-design §Interface 5·图 1·§边界与依赖变化 3 / apps/host/src/profile/{presets,materialize,template}.ts

## 事件与日志

### TECH-005: 事件总线与业务日志（产品自建）

**Requirement**: 产品自建进程内 emit/subscribe 总线（形制参考 dsh/Cordis 事件机制但零上游复用）；事件信封恒 {ts, sessionId, slug, type, payload}，载荷 = 两层抽象判别联合（ForgePluginEvent）；工具执行只发事件零日志代码，监听器 = 唯一写者（标准化 → 落盘）；日志组织 = `{tasksHome}/{flatten}@{hash8}/logs/{slug}.jsonl` 容器维度；归属三分支 = 事件带任务 → 任务容器 slug / 无任务 → contextSlug / 皆无 → logs/_pool.jsonl 兜底；dispatchPrompt 三层存放 = 全文（worker 会话日志首条）+ 指纹（dispatch_digest：task_records.claim 行 + task-claimed 事件双记）+ 对账锚（workerSessionId）——追溯三键闭环 taskKey → digest → workerSessionId → 会话日志全文；分工边界 = logs/*.jsonl 为 agent 面执行运营日志、UI 面状态变更审计归 DB 表（feature_records/task_records），两纪律不混不重复；事件日志不含凭据、不含 dispatchPrompt 全文（只记 digest）。
**Scope**: [CROSS]
**Source**: tech-design §Interface 3·图 5·§Security ③ / packages/plugin-forge/src/events/{bus,log-listener,sink}.ts

## tool 返回面

### TECH-006: tool 返回面 formatOk/formatErr 双友好文本

**Requirement**: 所有 forge tool 返回双友好格式化文本——成功首行 `✓ <动词结果>` + 键值行；失败首行 `✗ <code>` + 人话 + 违规清单逐行；判别口径 = code ∈ contracts ERROR_CODES（跨 IPC/序列化附载后仍可识别）；无 code 的意外错误不吞——原样重抛保持 fail-loud；RPC/桥 typed error 信封照旧（RpcErrorPayload 序列化——双面分治不破）。
**Scope**: [CROSS]
**Source**: tech-design §Interfaces 头注·裁决⑨ / packages/plugin-forge/src/tools/format.ts

## 设置单门

### TECH-007: forgeSettings 服务单门

**Requirement**: worker 默认 LLM 设置存储 = `{userData}/forge-settings.json`（路径经 boot overlay 注 core 行 config——bindingsFile 同型先例）；core 新供 `forgeSettings` 服务单点读写（get/set 单门——UI 设置分区经 RPC 与 dispatchTask 服务注入同门消费）；派发时实时读（改完即生效无重启）；settingsFile 缺席 = 服务降级缺席（六服务形制不动）；reasoning → agentOptions.effort 直映射；cordis 4.0.4 无 '?' 可选 inject——可选消费不走 inject 声明（缺席不阻载）。
**Scope**: [CROSS]
**Source**: tech-design §Interface 1·图 11·§关键技术决策 / packages/core/src/forge/settings/service.ts

## 拆包（drift 修订承载）

### TECH-008: plugin-forge 拆双包与上游运行时包白名单

**Requirement**: `plugin-forge`（管线核心，双模式共用：六 tool = addTask/submitTask/queryTask/createProposal/transitionProposal/dispatchTask + skills = quick-tasks/run-tasks/submit-task/run-tests/brainstorm）+ `plugin-forge-spec`（规格深化，仅远征组合：三 tool = registerFeature/upsertFeatureDoc/validateFeatureTasks + 8 规格技能）；两包 tool 面 pin 契约测试（contracts 单源）；plugin-forge deps = contracts + path-key + **dsh 上游运行时包白名单**（in-process driver——driver 非 core，插件对 core 仍零实现级 import，boundaries pin 修订）；新包入 packaging 三处同步（PRODUCT_PACKAGES/REQUIRED_KEY_FILES/assertPreconditions + 闭包守护测试——TECH-packaging-001 既有义务）；规格技能迁移全部经 tool 读写落状态层（文档产出 → upsertFeatureDoc、任务建立 → addTask）。
**Scope**: [CROSS]
**Source**: tech-design §Overview·§Layer Placement·§边界与依赖变化 1-2 / packages/plugin-forge{,-spec}

## LOCAL 项（留在 feature 内）

- openSessionWithPreset 组合子（平台会话编排 + agentPreset.select[`__DSH_TRANSPORT__` 载体] + composer draft 预填缝）→ feature tech-design Interface 5 已载
- 消息体纯函数（formatPrefill/formatDiagMessage——@path 首行→名称/所属→摘要→状态|阶段→主体→请求、不含模式）→ feature Integration Specs 已载
- 概览 tab 默认 560px 可拖拽 400–920 → feature ui-design 已载
- quick-tasks 整数 ID / eval 门豁免等突击语义细则 → feature PRD 已载（mode 快照承载数据面已在 BIZ-003）

## 既有项目级规格 drift（本次运行 Step 9/10 修复，非新增条目）

- TECH-task-001：slug ≡ feature slug → slug ≡ 容器 slug（feature/proposal 同规）+ 多态引用服务不变量
- TECH-task-003：dispatchPrompt task-context 增容器语境行（SOURCE: feature|proposal slug），XML 标签集四枚不变
- BIZ-task-008：面分治枚举修订（claimTask tool 退役 / transitionProposal 双面 / setProposalMode UI 专属 / spec 三 tool / dispatchTask dispatcher 专用）
- TECH-rpc-003：通道族七 → 八（+forge:settings/*）+ proposals 族扩 transition/setMode/listDocs + features 族扩 listDocs
- TECH-rpc-004：六服务 → 七（+forgeSettings）+ 两包 inject 面更新
- TECH-rpc-007：写推送覆盖面 + setProposalMode
- TECH-error-001：错误码 21 → 24（+ERR_TEST_EVIDENCE_REQUIRED/ERR_GATE_SUMMARY_REQUIRED/ERR_SPAWN_FAILED）
- TECH-monorepo-001/003/004：七工件 → 八工件 + plugin-forge deps 白名单 + 修改落点增补
- TECH-quality-001：G1 pin 池 + M3 17–22（pin-10..14 五文件）
- BIZ-product-004：数据追踪面增 feature 域审计（feature_records）与 agent 面业务事件日志（logs/{slug}.jsonl）
