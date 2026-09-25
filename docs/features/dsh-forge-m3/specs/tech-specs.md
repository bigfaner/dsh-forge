---
feature: "dsh-forge-m3"
generated: "2026-09-25"
status: draft
---

# Technical Specifications: dsh-forge-m3(流程即产品)

> 提取源:design/tech-design.md + design/spike-1..4 + tasks/records/1-6.summary(执行期裁决)。非交互模式:CROSS 项自动集成。

## dsh 工具面与桥接(Host Integration)

### TECH-001: dsh model-facing tool 注册纪律(下划线扁平名 + root context + 双闸)

**Requirement**: dsh tool 一律**下划线扁平名**(`forge_task_add` 形;provider 字符集 `^[a-zA-Z0-9_-]{1,128}$` 拒绝点号名,名原样上 wire 且上游全 snake_case);注册 = `defineTool` + host 半身 root context `ctx.tools.register`(base `tools` 行装配,全局工具面;同 scope 重名拒绝;`run_code` 保留名);输入 schema 严格类型(枚举值集封闭);taskKey 等语义不变式采用**工具面形态白名单 + 内核复验双闸**(不信任 tool 输入语义,防御模型面注入)。
**Context**: spike-1 §1.2 偏差回填(点号名被拒)+ §1.1 注册契约定形;威胁模型 T1 缓解。
**Scope**: [CROSS]
**Source**: design/spike-1-tool-registration.md;design/tech-design.md §Interface 2;records/2.1

### TECH-002: renderer 桥接模式(stream Remote 订阅 + 单向 answer + backlog 重放)

**Requirement**: dsh tool → 内核通道 = renderer 桥:host 半身经 client 订问 stream Remote(`@Remote({mode:'stream'})`,signal 尾参 cancellation)+ 单向 answer;client 侧 tool 桥 = 封闭动词 switch 一一映射 IPC 白名单动词(无通配/无反射);host 队列核 lazy-attach + backlog 重放吸收 boot 竞态(无丢失);transport 失败重试一次后 `ERR_TOOL_BRIDGE_UNAVAILABLE` 上抛(禁静默);结果语义分流——业务拒绝(含 files 项目走 CLI 提示)以 canonical JSON 值返回 `{ok:false,code,message,detail}`,仅 transport 降级 throw。零新端口/零新监听面/零新增 npm 依赖。
**Context**: T2 裁决(弃 named-pipe/UDS 直连——新增本地监听端点面);spike-1 实测桥全往返 med ~1.3ms;渲染进程被攻破面最大能力 = 既定动词集(与 UI 同权,无提权)。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Interface 2/§Overview T2;spike-1-tool-registration.md;records/2.1

### TECH-003: subagent 审批路由(waterfall prepend 认领 + 显式决策 + 不变式)

**Requirement**: 宿主审批 = 单一全局 agent-scoped `approval/request` waterfall(fail-closed);工作台审批桥 = host 半身 `ctx.on('approval/request', …, { prepend: true })` **必须 prepend 抢占**在 api-remotes 转发器之前(否则上游 `ui-approval` 话者对任意会话 id 无条件认领,审批 dock 被饿死);非 dispatch 会话 `next()` 委派(上游会话内面板行为零改动);应答 = listener 返回 ApprovalOutcome 原生回注;决策仅显式动词 decideApproval + decided_by 审计,无自动批准;状态机拒绝重复决策;`approval_request` 维持 `awaiting ⇔ pending` 不变式;payload 只读呈现(防注入)。
**Context**: spike-2 定形;上游 gateway 对转发 waterfall 无原生超时,prepend 认领恰好消除悬挂面;威胁模型 T5。
**Scope**: [CROSS]
**Source**: design/spike-2-subagent-approval.md;design/tech-design.md §Interface 3;records/3.5

### TECH-004: 预合成注入契约(④ 首条 user 消息追加 + prompt_hash 口径)

**Requirement**: systemPrompt 注入契约 = **④ 首条 user 消息追加**(dsh 存在 systemPrompt 面但无按次注入契约:①create 选项证伪/②preset 无按文本造入口/③消息通道只产 user 消息);预合成 = 内核确定性组装三要素(类型协议模板 + stage_asset 目标摘要 + prefs 生效偏好),内核对注入字符串不透明传输(仅保证完整交付);`prompt_hash` 口径 = **sha256(组合首条消息全文 = 预合成内容 + 追加行)**;dispatch 预铸 sessionId(caller-minted 幂等 adopt)使 hash 随行落库、重派发不漂移;e2e 断言四件套(全文 hash 全等/前缀逐字节/恰好一行追加/requestId 确定性)复用 M2 channel stub journal 形态;`ERR_SYSTEM_PROMPT_CONTRACT` 收窄为通道可解析 + 内容非空 + hash 已定型三查。
**Context**: spike-3 裁决(四候选);零上游配合、持久可重放、逐字符可断言;预合成归内核不归 host(单查询可断言,docs/decisions/architecture.md 2026-09-23)。
**Scope**: [CROSS]
**Source**: design/spike-3-systemprompt-contract.md;design/tech-design.md §Interface 3;records/3.4/6.2/6.3

## 数据内核(Data Kernel)

### TECH-005: 状态机/依赖解析移植对拍纪律(forge-cli Go 源码唯一权威)

**Requirement**: forge 任务状态机(7 态)/依赖解析/拓扑排序的 TS 移植以 **forge-cli Go 源码为唯一行为权威**(pinned commit;`pkg/task/statemachine.go`/`deps.go`/`toposort.go`);行为差异一律以 Go 为准;对拍 = Go 侧生成 baseline.json(245 边全矩阵含逐字错误消息 + 依赖/拓扑例 + 真实 index.json 语料含相位键/悬空 blocker)vs TS 逐例零差异;Go map 迭代序致同秩弹出逐运行随机,对拍须按相邻同秩段去序归一(unmet 按多重集比较);悬空依赖两套检查口径保持分立并注释钉定(claim 按 Go claim.go 对悬空精确依赖 vacuously satisfied 不阻断;transition 沿用 checkTransitionDeps 悬空 = unmet——Go 源本就是两套);模板库完整性同样对拍 Go embed FS(ValidatePromptTemplates)。
**Context**: T1 裁决(TS 原生移植,弃 Go 嵌入库——cgo 破坏零重编译/三平台纪律);M3 后续里程碑改内核任务语义时仍须回 Go 源对拍。
**Scope**: [CROSS]
**Source**: design/tech-design.md §关键裁决 T1/§Testing;records/1.2/1.3;scripts/tasks-parity-gen

### TECH-006: taskKey 校验 = 形态白名单(结构校验),弃裸 ID 数字正则

**Requirement**: taskKey 全消费面(tool 面、内核、摄入合成)统一校验 = 看板限定地址形态 `<featureSlug>/<localId>` 的**结构白名单**——单 `/` 分隔 + 两段非空 + 禁路径分隔符/控制字符;**禁止裸 ID 数字正则**(M2 已证 forge task_key 存在 slug id 形态,裸 `N.N` 假设不成立;localId 含 `5.gate` 等非数字相位键,看板全量投影不排除);工具面与内核双闸复验(featureSlug 前缀一致性等语义不变式归内核)。
**Context**: TECH-data-kernel-003(方言定义)的校验半面;威胁模型 T1 参数注入缓解。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Interface 2/§Cross-Layer Data Map;records/2.1/1.3

## 技能承载(Skill Hosting)

### TECH-007: customSkillDirs 技能承载(应用单写 + 前缀校验 + 漂移重写)

**Requirement**: forge 技能以 dsh 原生形态随插件 bundle(`resources/skills/`,扁平名寻址);承载路径 = 用户层 dsh 配置 `customSkillDirs`(skill-filesystem 消费),项目仓零新增文件;配置**仅应用写入**(boot/插件激活时 += 技能根,去重);漂移校验(路径存在 + 清单 hash)失败即重写;路径前缀必须 ∈ 插件安装目录(防任意目录注入技能面);修复失败 → `ERR_SKILL_DIR_SYNC` 日志 + 设置面告警(禁静默);应用负责版本升级时的路径同步维护(路径漂移 = 应用责任)。
**Context**: D2 裁决(弃项目侧播种);威胁模型 T3;SC1 断言 15 技能扁平名解析。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §技能迁移划分表/DF006;design/tech-design.md §Interface 6;records/5.6/5.7

## e2e 工程(Testing)

### TECH-008: M3 e2e 纪律(干净环境 + 真内核语料 + 实例锁 fail-fast + oracle)

**Requirement**: e2e 干净环境 fixture = system-only 净化 PATH + forge CLI 不可达进程探针 + 假 shim 负对照;**已迁移语料必须经真内核迁移管线产出**(openDatabase→registerProject→scanForgeFiles→startMigration),禁止手搓 SQLite;subagent/approval 用 stub 目录驱动(DSH_FORGE_SESSION_STUB_DIR / DSH_FORGE_APPROVAL_STUB_DIR,inject.jsonl 驱动真 approval-bridge 核心,统一 journal);prompt_hash oracle 四检(内核 3 检 + requestId 确定性);**实例锁纪律 fail-fast**(跑前查活跃 dsh-forge 实例,含 host-child 固定端口标记——live 事故后补);每腿强制隔离 userData;Playwright 第二 project 跨 lane `workers:1` 单实例串行;vitest 排除 e2e specs 保持 lane 分离。
**Context**: 6.2 基座裁决;干净环境断言(零 CLI)依赖 PATH 净化;实例锁为 M1 既有坑在 M3 的强化。
**Scope**: [CROSS]
**Source**: records/6.2/6.3;tests/e2e/README.md;design/tech-design.md §Testing

## 漂移修订项(更新既有条目,不新增 ID)

### TECH-009: IPC v2 扩面沿用单命名空间模式(51 动词通道)

**Requirement**: v2 新增 35 动词(任务写集/读、迁移、知识系、偏好、阶段、提案、派发审批 + 3 host 回调),白名单 16 → **51** invoke 通道;事件推送复用既有 `dsh-forge:workbench-events` 批量通道(≤500ms);main/preload 双表 + drift 锁延续。
**Context**: TECH-electron-ipc-002 现行文本记「M2 落地 16 白名单通道」,数字已过时 → 漂移。
**Scope**: [CROSS]
**Source**: apps/desktop/src/main/workbench/ipc/channel-allowlist.ts(51 动词);records/1.3-5.3
**Target 注记**: 更新 TECH-electron-ipc-002 Context 数字(漂移修复)。

### TECH-010: schema 载体机制精确化(投影 + 内联常量 + 对账 + PRAGMA 不入 DDL)

**Requirement**: `design/schema.sql` = 设计投影;运行时权威 = `migrate.ts` MIGRATIONS 版本段 + 内联 TS 常量,**两者由漂移对账测试强制同步**;每版本段各自事务顺序执行(非全程单事务);PRAGMA(WAL/foreign_keys)为连接级设置由 db.ts 每次开库应用,不入 DDL;对账形态 = 剥注释(中文注释含分号)按 `;` 切分 + 空白归一化 + 语句数反空转锚点。
**Context**: TECH-data-kernel-001 现行文本「迁移脚本 = design/schema.sql 由内核启动时按 schema_version 在单事务内顺序执行」与实际机制有偏差 → 漂移。
**Scope**: [CROSS]
**Source**: records/1.1;apps/desktop/src/main/workbench/store/migrate.ts + schema-v2.ts
**Target 注记**: 修正 TECH-data-kernel-001 表述(漂移修复)。

### TECH-011: forge CLI spawn 链退役(保留通用外部进程纪律)

**Requirement**: M2 ForgeBridge spawn CLI 链(host/forge-bridge.ts + forge-bridge-rpc.ts + cli-resolve.ts + session-launch 全家)已删除;应用出包与执行链零 forge CLI 依赖(全仓唯一 spawn = host-supervisor 启动 dsh 宿主);TECH-host-002 的参数数组/已注册路径集合纪律保留为**任何外部进程 spawn 的一般纪律**,其 forge CLI 解析序专述不再适用。
**Context**: 6.1 退役收口;SC1/G1 断言 → TECH-host-002 现行文本锚定的 cli-resolve.ts 已不存在 → 漂移。
**Scope**: [CROSS]
**Source**: records/6.1;packages/plugins/forge-workbench/src/host/(forge-bridge 无存)
**Target 注记**: 为 TECH-host-002 补 M3 退役注记(漂移修复,保留 ID 与通用纪律)。

### TECH-012: CLI 退役与数据内核权威化的 M3 落地状态

**Requirement**: TECH-product-arch-003(数据内核权威切面)与 004(CLI 退役方向)于 M3 落地:task 表 SQLite 权威 + data_authority 读路由已交付;ForgeBridge 退役、零 CLI 依赖达成;forge 仓 CLI 停止发布与 CC 插件最终收口归 M4。
**Context**: 两条目现行文本以「M3 设计域/过渡形态」表述,状态已推进 → 轻漂移(状态注记)。
**Scope**: [CROSS]
**Source**: records/6.1/6.3;TECH-product-arch-003/004
**Target 注记**: 为 TECH-product-arch-003/004 补落地状态注记(漂移修复)。

## 特定于本 feature 的实现细节(LOCAL)

### TECH-013: IPC 动词面 v2 完整清单与错误码族

**Requirement**: 35 个 v2 动词逐项签名与 ERR_* 14 族触发表归 tech-design §Interface 1/§Error Handling(设计权威),不提升为项目级约定。
**Scope**: [LOCAL]
**Source**: design/tech-design.md §Interface 1/§Error Handling

### TECH-014: dispatch/approval/prefs/stage 域模型词表

**Requirement**: dispatch 5 态/approval 3 态/prefs 38 键注册表/stage 资产 frontmatter 形态为 M3 域细节,schema.sql + er-diagram 为权威。
**Scope**: [LOCAL]
**Source**: design/schema.sql;design/er-diagram.md;records/3.1/3.3

### TECH-015: prompt 模板库移植面

**Requirement**: 模板库 = `pkg/prompt/templates` 21 文件中 20 入库 + 新增 doc-fix(gate/doc.summary 被机制取代);受限 5 类型 + 被取代 2 类型派发面封闭;模板内 CLI 文案改写点清单。后续维护以内核模板库为准。
**Scope**: [LOCAL]
**Source**: spike-4-prompt-templates-port.md;records/3.4

### TECH-016: UI 集成插入点与视图键细节

**Requirement**: 7 项集成规格插入点、WORKBENCH_TABS 四 tab 序、侧板互斥与 Esc 分层等归 tech-design §Integration Specs + page-map(设计权威)。
**Scope**: [LOCAL]
**Source**: design/tech-design.md §Integration Specs;design/page-map.md
