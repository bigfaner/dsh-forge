---
title: "dsh 宿主与外部进程集成约定"
domains: [dsh-host, cordis, session-channel, tool-bridge, model-facing-tools, approval-routing, presynthesis]
---

# dsh 宿主与外部进程集成约定

## Host Integration

### TECH-host-001: 会话操作走宿主内 cordis 服务通道,禁外部通道

**Requirement**: 应用发起/定位 dsh 会话一律走宿主进程内 cordis 服务通道:插件 host 半身直注 `sessionController` —— `create({sessionId?, cwd})`(caller-minted id = 幂等收养)+ `prompt({mode:'queue'})` 注入首条用户消息(即持久化用户消息);会话定位经 client 半身 `ctx.uiWorkspace.openSession(sessionId)`。降级链 = client 半身 remote session 同语义备选 → 剪贴板 + toast fallback(前置主窗 + 恢复引导),主通道不可用自动落 fallback、不打断。禁止外部通道:URL hash / postMessage / deep-link(M1 spike-3 已证三通道均不可用,不再重复侦察)。
**Context**: dsh 宿主无逐会话环境注入面(shell env 为进程级),宿主内服务通道是唯一零外部依赖路径;M2 spike-1 定形,M3 会话操作沿用。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-004(design/tech-design.md §Interface 5/§Open Questions;design/spike-1-findings.md;packages/plugins/forge-workbench/src/host/session-launch.ts)

### TECH-host-002: 外部 CLI spawn 纪律(参数数组 · 已注册路径集合)

**Requirement**: spawn 外部 CLI 一律参数数组,禁止 shell 字符串拼接;cwd 与路径参数限定已注册项目路径集合(仓外路径须注册时显式授权);CLI 解析序 = 应用设置显式路径 → PATH → 显式错误码(ERR_FORGE_CLI_UNAVAILABLE,错误引导);退出码/输出尺寸上限防护;CLI 按需 spawn、执行完退出(不常驻)。
**Context**: 参数注入与未授权路径执行缓解(威胁模型 T2/T4);进程足迹纪律的执行面。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 TECH-005(design/tech-design.md §Dependencies/§Security;packages/plugins/forge-workbench/src/host/cli-resolve.ts)

**M3 修订(2026-09-25,M3 交付生效)**:forge CLI spawn 链已整体退役(forge-bridge.ts/forge-bridge-rpc.ts/cli-resolve.ts/session-launch 全家删除,应用出包与执行链零 forge CLI 依赖,SC1/G1);本条**保留为任何外部进程 spawn 的一般纪律**(参数数组、已注册路径集合、退出防护、按需 spawn),其 forge CLI 解析序/ERR_FORGE_CLI_UNAVAILABLE 专述不再适用——全仓唯一 spawn = host-supervisor 启动 dsh 宿主。
**Source**: features/dsh-forge-m3 tasks/records/6.1(退役收口核验)

## dsh Tool Surface

### TECH-host-003: dsh model-facing tool 注册纪律(下划线扁平名 + root context + 双闸)

**Requirement**: dsh tool 一律**下划线扁平名**(`forge_task_add` 形;provider 字符集 `^[a-zA-Z0-9_-]{1,128}$` 拒绝点号名——名原样上 wire 且上游全 snake_case);注册 = `defineTool` + host 半身 root context `ctx.tools.register`(base `tools` 行装配 = 全局工具面;同 scope 重名拒绝;`run_code` 保留名);输入 schema 严格类型(枚举值集封闭);语义不变式(如 taskKey 形态、featureSlug 一致性)采用**工具面形态白名单 + 内核复验双闸**——不信任 tool 输入语义(模型面注入防御);工具族可一族一工具 + action 枚举,或逐动词一工具,命名保持扁平可寻址。
**Context**: M3 spike-1 §1.2 偏差回填(点号名被拒)+ §1.1 注册契约定形;后续新增 model-facing 工具沿用。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 TECH-001(design/spike-1-tool-registration.md;design/tech-design.md §Interface 2;tasks/records/2.1)

### TECH-host-004: renderer 桥接模式(stream Remote 订阅 + 单向 answer + backlog 重放)

**Requirement**: dsh tool → 数据内核通道 = renderer 桥:host 半身经 client 订问 stream Remote(`@Remote({mode:'stream'})`,signal 尾参 cancellation)+ **单向 answer**;client 侧 tool 桥 = 封闭动词 switch 一一映射 IPC 白名单动词(无通配/无反射);host 队列核 lazy-attach + **backlog 重放**吸收 boot 竞态(无丢失);transport 失败重试一次后 `ERR_TOOL_BRIDGE_UNAVAILABLE` 上抛(禁静默);结果语义分流——业务拒绝以 canonical JSON 值返回 `{ok:false,code,message,detail}`(含 files 权威项目「走 CLI」提示 = 业务提示非错误噪音),仅 transport 降级 throw;actor 推导自 `exec.agent.session.id`(缺失 throw,fail-closed,不误记 'external'),写动词透传内核 updated_by 审计。零新端口/零新监听面/零新 npm 依赖(消费既有 vendored 上游面)。
**Context**: M3 T2 裁决(弃 named-pipe/UDS 直连——新增本地监听端点面 + ACL 负担);实测桥全往返 med ~1.3ms;渲染进程被攻破面最大能力 = 既定动词集(与 UI 同权,无提权)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 TECH-002(design/tech-design.md §Interface 2/§Overview T2;design/spike-1-tool-registration.md;tasks/records/2.1)

### TECH-host-005: subagent 审批路由(waterfall prepend 认领 + 显式决策 + 不变式)

**Requirement**: 宿主审批 = 单一全局 agent-scoped `approval/request` waterfall(fail-closed);工作台审批桥 = host 半身 `ctx.on('approval/request', …, { prepend: true })` **必须 prepend 抢占**在 api-remotes 转发器之前(否则上游 `ui-approval` 话者对任意会话 id 无条件 materialize scope 并认领,工作台审批 dock 被饿死);非 dispatch 会话 `next()` 委派(上游会话内面板行为零改动);应答 = listener 返回 `ApprovalOutcome` 原生回注 pending 工具调用(内核先落库 → 事件 → client → host 桥单向 answer → resolve);决策仅显式动词(decideApproval)+ `decided_by` 审计,**无自动批准**;状态机拒绝重复决策(ERR_APPROVAL_DECIDED);`approval_request` 维持 `awaiting ⇔ pending` 不变式;payload 只读呈现(防注入);人类决策等待不限短预算(桥传输腿才用预算)。
**Context**: M3 spike-2 定形;上游 gateway 对转发 waterfall 无原生超时(无 client 即悬挂),prepend 认领恰好消除该面;威胁模型 T5 缓解。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 TECH-003(design/spike-2-subagent-approval.md;design/tech-design.md §Interface 3;tasks/records/3.5)

### TECH-host-006: 预合成注入契约(④ 首条 user 消息追加 + prompt_hash 口径)

**Requirement**: systemPrompt 注入契约 = **④ 首条 user 消息追加**——dsh 存在 systemPrompt 面(scoped 分层段注册)但**无按次注入契约**(①create 选项无提示词字段/②agent preset 无按文本造入口/③消息通道只产 user 消息,均证伪或不采);预合成 = **内核**确定性组装三要素(任务类型协议模板 + stage_asset 目标摘要 + prefs 生效偏好;三要素均为文档数据,经内核模板常量组装,不 eval、不拼接指令语义),host 仅持 subagent 创建;内核对注入字符串不透明传输(仅保证完整交付);`prompt_hash` 口径 = **sha256(组合首条消息全文 = 预合成内容 + 追加行)**;dispatch **预铸 sessionId**(caller-minted 幂等 adopt)使 hash 随行落库、重派发不漂移;e2e 断言四件套(全文 hash 全等/前缀逐字节/恰好一行追加/requestId 确定性);`ERR_SYSTEM_PROMPT_CONTRACT` 收窄为三查(通道可解析 + 预合成内容非空 + hash 已定型)。
**Context**: M3 spike-3 四候选裁决;零上游配合、持久可重放、逐字符可断言;预合成归内核不归 host(docs/decisions/architecture.md 2026-09-23);追加行文案收窄为 bash 归因 + 过渡期 CLI。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 TECH-004(design/spike-3-systemprompt-contract.md;design/tech-design.md §Interface 3;tasks/records/3.4、6.2、6.3)
