# Spike 2 报告: subagent 审批面 —— 审批事件订阅/应答通道 + FORGE_ACTOR 透传 + payload 可观察性(3.5 门控)

> 任务: 0.2(SC8)· 日期: 2026-09-23 · 对应 tech-design §Interface 3(审批路由/approval-bridge)、§Open Questions spike ②、§Error Handling(ERR_APPROVAL_*)、PRD 操作主体模型/DF003
> 纪律: dsh 侧结论以本仓 vendored 树 `packages/desktop-host-vendor/vendored`(`vendor/upstream.lock.json` pinnedSha `c36ba648dc106d21fb32562793b3e3b9c8922bc4`,desktopHostVersion `0.1.6-alpha.2`)为唯一权威;每条判定附源码路径:符号。本任务纯侦察,零产品代码落地,无临时实测工程(全部结论可由静态实码核对 + spike 1 已实测的桥机制推出;`@deepseek-ai/dsh-sandbox` 包(escalation 辅助函数)未 vendored 为源码,其契约以两个消费侧实码调用点交叉核对,见 §1.1 注)。

## 0. 侦察范围与方法

- **审批服务本体**: `interaction/user-approval`(ApprovalService、事件词汇、waterfall 声明)。
- **发起侧(asker)**: `core/tools`(serviceAsk)、`shell/tool-bash` + `fs/tool-fs/src/sandbox.ts`(沙箱升级)、`hooks/hooks-claude-code`(对照,desktop 未装配)、`sandbox/sandbox-policy`(会话级沙箱模式)。
- **应答侧(answerer)先例**: `acp/acp`(host 侧桥接应答者)、`client/ui-approval`(上游 UI 应答者)。
- **转发链路**: `api/remotes`(白名单 + waterfall 转发源)、`api/gateway`(host 泵送 + client 派发)、`api/session-controller/src/client`(agent scope 解析/materialize)、`core/scope`(事件 scope 准入)、vendored `vendor/cordis/src/events.ts`(waterfall 顺序语义)。
- **M2 已验先例(本仓)**: `packages/plugins/forge-workbench/src/host/session-launch.ts`(create/prompt 通道)、`actor-env.ts`(FORGE_ACTOR 基线);M2 spike-1 §4(无 per-session env 面)、M3 spike-1 §2/§3(桥机制实测:client 订阅 stream + 单向 answer + 预算超时)。

---

## 1. Q1: 审批事件订阅/应答通道定形(AC-1)

**总结论:审批面 = 单一全局 `approval/request` waterfall(host 进程内),订阅面定形为「approval-bridge host 半身 `ctx.on('approval/request', …, { prepend: true })`」(dispatch 会话过滤 + ACP 同款归属判定),应答面定形为「waterfall listener 返回 `ApprovalOutcome`」(原生带回注,无需伪造通道);必须 `prepend` 抢占在 api-remotes 转发器之前,否则上游 `ui-approval` 会话话者会无条件认领并饿死工作台审批 dock。**

### 1.1 审批请求的发起面(谁在问、问什么)

| 要素 | 事实 | 依据 |
|---|---|---|
| 唯一入口 | `ApprovalService.request(req)` —— 校验开合 turn、落 `approval/asked` 审计、派发 waterfall、落 `approval/decided`;失败封闭(fallback = `'unavailable'`) | `interaction/user-approval/src/index.ts:208-227`(request)、:273-277(waterfall 派发 + fail-closed fallback) |
| waterfall 形态 | `ctx.waterfall(scopeTarget(req.agent, req.agent), 'approval/request', req, …)` —— **agent-scoped**(以发起 ask 的 agent 为 scope 主体) | 同上 :273-277;事件声明 `@mode waterfall` + `Scoped<Agent>`(`interaction/user-approval/src/types.ts:76-91`);scope 主体提取 `'approval/request': args => args[0]['agent']`(`core/scope/src/scoped-events.generated.ts:23`) |
| asker ① 工具运行时 | pre-execute guard 决策 `{kind:'ask'}` → `serviceAsk` → `approval.request({agent, toolName, callId, reason?, signal})`;四态映射为 allow/deny(拒绝/取消/无通道文案互异) | `core/tools/src/index.ts:1698-1738`(serviceAsk,:1715 调用) |
| asker ② 沙箱升级(bash/pwsh/fs) | 被拒后同 turn 一次 `sandbox_permissions`+`justification` 重试 → `approveEscalation({requestedMode, justification, effectiveMode, subject}, {approver, agent, callId, toolName, signal})` → `approver.request(...)` | `shell/tool-bash/src/index.ts:212-232`(approveBashEscalation);`fs/tool-fs/src/sandbox.ts:88-109`(resolvePolicy,:98 调用);升级叙事即审批提示(tool-bash :80-91「the approval prompt raised by that retry is how the user consents」) |
| asker ③ CC hook 桥 | PreToolUse `ask` 决策 → `{kind:'ask'}`(desktop profile 未装配,不落 M3 面) | `hooks/hooks-claude-code/src/index.ts:241`;M2 spike-1 §1.2(未装配判定) |
| 默认策略 | **workspace-write + approval 'ask'**:`sandbox-policy` 默认 `process.env.DSH_PERMISSION_MODE ?? 'workspace-write'`,`approval` 默认 `'ask'`(仅 danger-full-access → 'never');三预设 read-only/workspace-write/danger-full-access 由 `permission-presets` 做会话级切换(`sandbox/mode` + `approval/policy` 双旋钮,session log 事件) | `bundle/base/cordis.patch.yml:212-248`(装配行 :215-219、:231-234、:236-248);`sandbox/sandbox-policy/src/session-mode.ts:40,55-60`;`interaction/permission-presets/src/index.ts:49-79` |
| 结论向量 | `ApprovalOutcome = 'allowed-once' \| 'rejected' \| 'cancelled' \| 'unavailable'`(`allowed-once` 是唯一放行;fail-closed) | `interaction/user-approval/src/types.ts:32` |
| 审计对 | `approval/asked` + `approval/decided`(同 id)成对落会话 log,turn-enclosed;log-only,非 surface 事件 | `types.ts:34-60`;`index.ts:77-85`(hasOpenTurn 前置)、:218-225 |

> 注: `@deepseek-ai/dsh-sandbox`(approveEscalation 实现)未 vendored 为源码,但两个消费侧(tool-bash :222-231、tool-fs :98-107)传参形态一致(`approver: ctx.get('approval')` + agent/callId/toolName/signal),且 `ApprovalRequest` 公开类型的自由文本字段仅 `reason`(`interaction/user-approval/src/index.ts:104-125`)——升级理由(模式 + justification + subject)由该辅助函数合成进 `reason`,契约封闭可依赖。

**对 subagent 会话的含义**: M3 派发会话经 `sessionController.create({cwd})` 创建(M2 已验通道,`packages/plugins/forge-workbench/src/host/session-launch.ts:142-155`),是普通会话——**无 subagent 归属保留**(`ApiSessionSubagentOwnership` 仅约束 `ctx.subagents` 路由的会话,`api/session-controller/src/agent.ts:22-28`)。其工具调用触发的 ask 走同一全局 waterfall,scope = 该会话 agent。desktop 默认 workspace-write 下,**工作区内写放行、越界/更宽模式重试才问**——即 M3 可观察的审批类别 = 沙箱升级(bash 命令/fs 变更)+ pre-execute ask 类 guard(hook 系,缺位)。工作区内常规写不产生审批事件(设计如此,非缺口)。

### 1.2 订阅通道可用性矩阵(候选逐一判定)

| 序 | 候选订阅面 | 判定 | 依据 |
|---|---|---|---|
| 1 | **host 半身进程内监听 `ctx.on('approval/request', listener, { prepend: true })`** | **可用(approval-bridge 采用)** | ① 同进程同应用图:插件 host 半身与 ApprovalService 同 cordis 应用(M2 spike-1 §0;`approval` 行装配于 base `bundle/base/cordis.patch.yml:231-234`);② root(untagged)监听器对 agent-scoped 派发**全局准入**——`scopeTarget` 载体过滤 `tag === undefined → true`(`core/scope/src/index.ts:170-185`,注释 :160-165「a listener owned by an enclosing scope receives every descendant scope's events」);③ **先例**:ACP 桥 host 侧应答者 `ctx.on('approval/request', (request, next) => …)`(`acp/acp/src/index.ts:155-173`)——归属过滤(ownedRecord)+ `next()` 委派 + outcome 映射,与本通道同型;④ `prepend` 语义见 §1.3 |
| 2 | client 半身远端监听 `ctx.remote.$on('approval/request')` | **机制可用但被饿死,不可作主面** | ① 事件在转发白名单(waterfall 模式,`api/remotes/src/remote-events.ts:20`),host 转发器把它桥给 client(`api/remotes/src/index.ts:57-75`);② 但上游 `ui-approval` 话者**无条件认领**:client 派发先解析 agent scope——`typert.contexts.getClient('agent').resolve(agentId)` → `retainAgentScope` → `retainScope` **对任意 id 无条件 materialize**(`api/gateway/src/client/remote-events.ts:192-205`;`api/session-controller/src/client/index.ts:141-147`;`client sessions service.ts:555-576`、materializeScope :608-626)→ `scopeOf(owner)` 恒有值 → `answerApproval` 注册 PendingApproval 而非 `next()`(`client/ui-approval/src/client/index.ts:35-68`,仅 :43 的 undefined 分支委派);③ `$on` 不暴露 prepend/顺序选项(`api/gateway/src/client/index.ts:210-215` → `remote-events.ts:89-99` 纯注册),client 内顺序 = 装配顺序(web bundle 的 ui-approval 先于用户层插件)→ 我们的 client 监听排后,凡 ui-approval 认领的请求永远到不了;④ 双重依赖 renderer 在线(与 T2 桥同可用性域),无独立价值 |
| 3 | 会话 log 观察(`session/event` → `approval/asked`/`approval/decided`) | **只读可用,不可应答(审计/对账面)** | 事件为 log-only 审计对(`interaction/user-approval/src/types.ts:34-60`),不携带应答通道;应答必须经 waterfall 返回值闭合(`index.ts:273-277`)。**用途定形 = 内核对账留档**(asked/decided 配对核销 kernel `approval_request` 行,异常悬挂可检出),非交互通道 |

### 1.3 应答回注通道(原生 + 抢占 + 兜底)

**① 原生应答面 = waterfall listener 返回值(定形采用)**。listener 返回 `ApprovalOutcome` 即结算该 pending 工具调用——`allowed-once` → 放行;`rejected` → deny「the user rejected tool …」;`cancelled` → deny + approvalCancelled;`unavailable` → deny「no approval channel is available」(`core/tools/src/index.ts:1722-1735`;升级路径同理由 approveEscalation 映射)。**「审批应答回注 subagent」无需任何伪造/旁路通道——决策在 waterfall 闭包内原路返回**,tech-design Interface 3「decideApproval 反向经桥回 subagent 审批通道」的物理形态即:内核决策事件 → client 半身 → host 桥 unary `answer`(spike 1 已实测的单向 answer 腿,`spike-1-tool-registration.md` §2/§0)→ resolve listener 的 pending promise → waterfall 返回。

**② 抢占问题(本 spike 最关键发现)**。cordis waterfall 语义:listener 按注册表顺序**outermost-first**执行,不调 `next()` 即认领并否决后续链(`vendor/cordis/src/events.ts:225-243`「Listeners run outermost-first; a listener that does not call `next()` vetoes the rest of the chain」);注册表顺序 = 注册序,`prepend: true` unshift 到队首(`events.ts:143`、:254-260,`on` 第三参支持 boolean 简写 :285-290)。api-remotes 转发器随 web-app bundle 于 profile 装配期注册(desktop profile = base+web-app,boot 即载,`bundle/web-app/cordis.patch.yml:195-196`;转发源唯一,二次注册 throw,`api/gateway/src/index.ts:238-243`;`api/remotes/src/index.ts:40-45`),**默认顺序下先于后装载的插件 listener 执行**;一旦请求被转发到 client,上游 ui-approval(同 web-app 行,:272-273)即认领(§1.2 序 2),表现为「审批挂在该 subagent 会话的话轮面板里」——而 M3 的 UF1 审批 dock 永远收不到。注意装载序并非架构保证(M2 先例即按「channel row 可能晚于本插件注册」做逐调用防御,`session-launch.ts:49-54`)——**`{ prepend: true }` 是与装载序无关的确定性占位手段,两种时序下均保证 outermost**。**定形:approval-bridge host 半身以 `{ prepend: true }` 注册,对 dispatch 会话集合内的请求先行认领;集合外(用户交互会话)`next()` 委派 → 转发器 → 上游会话内面板,上游行为零改动。**

**③ 决策送达链(kernel → listener)**: `decideApproval`(I1 动词,人显式点击)先落库(`approval_request.state + decided_by`)再推事件 → client 半身调 host 桥 answer → listener resolve。**kernel-first 持久化 + 幂等重放**:renderer 在等待人类决策期间关闭/重连时,client 重连后从内核拉 pending 审批集合并补投已决答案(callId/approvalId 幂等,spike 1 §3.2 的 callId 幂等忽略同型);listener 生命周期由 `request.signal` 界定——turn 取消 → `'cancelled'`(`interaction/user-approval/src/index.ts:286-299` abort 竞速)→ 内核行核销。

**④ 降级链(对齐 spike 1 §3.3 形态)**:

1. 桥不可用(activeStreams===0 且宽限期内无接入)→ 不等预算,listener 即返 `'unavailable'`(fail-closed;模型收到的 deny 文案明确区分「用户拒绝」与「无审批通道」);内核侧该请求记为未达(不建 pending 行,仅日志)。
2. 已送达内核但人类久未决 → listener **不限短预算等待**(等待对象是人类决策,不是桥传输;spike 1 的 ~5s 预算只适用桥往返腿);turn signal abort 是唯一超时面 → `'cancelled'` + 内核行核销 + dispatch 侧回 running/failed(3.4 状态机裁决)。
3. **晚到决策兜底(Implementation Notes 预案核实)**:fail-close(`unavailable`/`cancelled`)后人类才在 dock 点了批准 → 决策转为对该 subagent 会话的**下一条指令消息**(`sessionController.prompt({sessionId, mode:'queue'})`,M2 已验通道,`session-launch.ts:157-166`;queue 语义 = 持久化 user message,`api/session-controller/src/commands.ts` followup)——**代价**:被卡的工具调用早已以 deny 收场,消息只在下一 turn 生效,agent 需自行重试该操作(升级重试语义上「一次被拒即终局」的叙事被打破一次,需在消息中显式授权);仅作兜底,不作主路径。
4. 无人认领的第三态:gateway 对 waterfall 转发**无原生超时**——无连接 client 时 pending 悬挂直至 agent ctx 释放或 signal abort(`api/gateway/src/index.ts:457-514`,投递循环 :510;全部投递对象返回 next 才回落 next,:538-540)。我们的 prepend listener 恰好消除该悬挂面(dispatch 会话先于转发器认领),上游自身会话维持原语义不变。

### 1.4 与 M2 session-launch 通道的形态差异(Implementation Notes 核对项)

| 维度 | M2 已验(发起) | M3 新面(审批) | 差异结论 |
|---|---|---|---|
| 通道类型 | `sessionController` Remote 方法(create/prompt,一问一答) | cordis **事件 waterfall**(多话者链、认领制) | 审批不经 sessionController——**session-controller 无任何审批/sandbox Remote 面**(index.ts/commands.ts grep 零命中);订阅面是事件不是方法 |
| 发起方向 | host → sessionController(进程内直调) | dsh 运行时 → waterfall → 我们的 listener(被动接收) | approval-bridge 是**被听话者**,不需轮询 |
| 会话语义 | caller-minted sessionId 幂等 adopt(`session-launch.ts:142-155`) | 同一 sessionId 空间(`Agent.id: SessionId`,`core/agent/src/types.ts:13-16`) | `request.agent.id` 与 `dispatch.session_id` **同键可直接 join**,无映射层 |
| 等待模型 | create/prompt 各有 ms 级 ceiling | listener 等人类决策(分钟级),signal 界定 | 预算口径不同(§1.3 ④-2) |

---

## 2. Q2: FORGE_ACTOR 透传定形(AC-2)

**总结论:M3 内 actor 标识结构化可得——dsh tool 写集经 `exec.agent.session.id`(`= session:<id>`)直取,无需环境变量载体;FORGE_ACTOR 的「首条 user 消息追加指令行」基线保留但语义收窄为「bash 内 shell 动作归因 + 外部 CLI 过渡期」,不可行处(未经 tool 的外部写)以 `external` 推断兜底,判定序延续 M2 spike-1 §4.4。**

| 落点 | 定形 | 依据 |
|---|---|---|
| **dsh tool 写集(主通道)** | actor = `session:<sessionId>`,由 host 半身 tool handler 从 `exec.agent.session.id` 直取,随 I1 动词 actor 参数入内核,落 `task.updated_by`(审计)。**零 FORGE_ACTOR env 参与**——会话身份是执行上下文的结构属性,不可伪造、不依赖模型服从 | Interface 2 既有口径(`tech-design` §Interface 2「tool 调用自动携带所属会话标识」);`ToolRunContext.agent`(`core/tools/src/index.ts:309-401`);`Agent.id: SessionId`(`core/agent/src/types.ts:13-16`) |
| **dispatch 行** | `dispatch.session_id` = create 回传/自铸 sessionId(M2 幂等 adopt 先例)→ 该会话内一切 tool 写的 actor 与之行 join 即得派发归属;`dispatch.actor` = 派发者(人),与执行 actor 分列 | `session-launch.ts:142-155`;schema.sql dispatch 行(`session_id`/`actor`) |
| **subagent 上下文内 shell 动作(git commit 等)** | dsh **无 per-session env 注入面**(M2 spike-1 §4.2 定论,进程级 env 无法区分会话)——bash 内动作归因的唯一零上游载体仍是**首条 user 消息追加的 FORGE_ACTOR 指令行**(原文不改写、仅追加);M3 预合成 prompt 沿用该行(M2 `actor-env.ts:36-50` 文案形态),用于 commit message 归因提示与任何残余 CLI 场景 | M2 `packages/plugins/forge-workbench/src/host/actor-env.ts:11-50`;M2 spike-1 findings §4.2 |
| **外部会话/过渡期** | 未经 dsh tool 的写(外部 CLI、直接改 `index.json`)= actor 推断:`external`(watcher 重摄入记偏离,不阻断)。**判定序保持「actor 透传(可为空)→ 挂接推断」**,推断为全量兜底主路径 | M2 spike-1 findings §4.4;tech-design I4.7(T3 重摄入 + deviated) |
| **审批决策 actor** | `approval_request.decided_by` = 人(decideApproval 显式动词,无自动批准)——PRD 操作主体模型「审批 = 人」;`allowed-once` 单次粒度保证不产生持久授权(「grants apply only to the requested action」) | `interaction/user-approval/src/index.ts:1-4`(模块契约注释);schema.sql approval_request.decided_by;PRD 操作主体模型 |

**不可行处与兜底清单**: ① per-session env 注入——不可行(M2 已证,本次核对未变:`shell` 环境消费均为进程级);② 非 tool 路径写会话归因——不可行,`external` 推断兜底;③ turn 中途取消的 pending 决策——`cancelled` 核销,不产生 actor(决策未发生)。

---

## 3. Q3: 审批请求 payload 可观察性(AC-3)

**总结论:审批事件本体不携带操作正文(`callId` 链接去重设计),但类别(toolName + reason)可直接结构化入内核,正文(命令/路径 = 工具调用参数)可经 host 侧 `tools/pre-execute` 观察者按 callId 就地 join——`approval_request.payload_json` 结构化送达可行,且有上游先例背书。**

| 要素 | 事实 | 依据 |
|---|---|---|
| 事件 payload 字段 | `{ agent, toolName, callId?, reason?, signal? }` ——**无操作参数**;「callId links to an already presented tool call, so arguments are not duplicated here」 | `interaction/user-approval/src/types.ts:63-74`(ApprovalRequestEvent);`index.ts:101-125`(ApprovalRequest 注释) |
| 类别 | `toolName`(`bash`/`pwsh`/fs 变更工具名)+ `reason`(升级辅助合成的模式/justification/subject 自由文本;guard ask 的 asker 理由) | §1.1 表;tool-bash :217-231 / tool-fs :98-107 消费点传参 |
| 正文(参数)join 面 | **`tools/pre-execute` waterfall 观察者可读 `exec.name + exec.arguments`**(执行前触发,早于 ask);先例 = workspace-changes recorder `ctx.on('tools/pre-execute', (exec, next) => { recorder.capture(exec.name, exec.arguments); return next() })` | `deliverables/workspace-changes/src/index.ts:156-164` |
| 结构化建议 | `payload_json = { category, toolName, reason?, callId?, arguments? }`——category ∈ {'sandbox-escalation','guard-ask'}(由 reason 来源判别)/toolName 原词;arguments 为 pre-execute 捕获的原始参数对象(命令串/路径);渲染层只读呈现防注入(tech-design T5 既有口径) | 本报告定形;`Cross-Layer Data Map` approval.payload_json 行 |
| 上游对照 | 上游 UI 不搬参数,靠 callId 挂到会话内已流式呈现的工具调用上(PendingApproval 只带 `{toolName, callId, reason}`) | `client/ui-approval/src/client/index.ts:44-51` |
| 生命周期 | 请求须 turn 内发起(`hasOpenTurn` 前置,`index.ts:77-85`)——即审批恒发生于工具调用执行中,payload 捕获窗口确定 | 同左 |

---

## 4. 3.5(approval-bridge)落地规格输入与兜底建议

| # | 项 | 结论/建议 |
|---|---|---|
| 1 | 订阅面 | host 半身 `ctx.on('approval/request', listener, { prepend: true })`,apply 期注册(先于任何 dispatch 启动,无 boot 竞态);过滤 = `request.agent.id` ∈ dispatch 会话集合(ACP ownedRecord 同型,`acp/acp/src/index.ts:155-157`);非本集 `next()` 保持上游链 |
| 2 | 应答面 | listener 返回 `ApprovalOutcome`;决策链 = decideApproval(内核先落库)→ 事件 → client → host 桥 answer(unary,spike 1 实测形态)→ resolve;callId/approvalId 幂等;重连补投已决答案 |
| 3 | payload | 事件字段直存 + `tools/pre-execute` 观察者按 callId 捕获 arguments(仅 dispatch 会话,内存 Map,核销即弃);`payload_json` 结构见 §3 |
| 4 | 预算/降级 | 桥传输腿复用 spike 1 预算(宽限 ≤1s / 腿 ~5s / activeStreams 快速失败);**人类决策等待不限短预算**,signal abort = 唯一超时 → `cancelled` + 内核核销;`unavailable` 文案由上游 serviceAsk 原生区分,无需自造 |
| 5 | schema 注意项 | 上游四态 vs 内核三态 CHECK('pending','approved','rejected'):`allowed-once`→approved、`rejected`→rejected;**`cancelled`/`unavailable` 无落位**——建议 3.5 二选一:(a) 落 rejected + payload/outcome 明细标注终态原因(不改 schema);(b) CHECK 增 'closed' 态。倾向 (a)(三态与 UI 徽标谱已冻结,闭包语义可由 decided_at + detail 承载)——交 3.5/1.x schema 任务裁决 |
| 6 | 状态机联动 | `dispatch.awaiting ⇔ approval_request.pending` 不变式的事件源 = 本桥(认领即推 `approval_received`,结算即推 dispatch_updated);`ERR_APPROVAL_NOT_FOUND`/`ERR_APPROVAL_DECIDED` 触发面 = 内核 decideApproval 对失效/已决行的拒绝(tech-design 既有定义,无需改) |
| 7 | 可选增强(非必需) | 派发时可经 `agents.resolveAgent` + `setApprovalPolicy`/`setSandboxMode` 给 subagent 会话播种策略(如 read-only 派发);默认 workspace-write+ask 已满足 M3 面,**不做要求** |
| 8 | 对账 | host 半身另订 `session/event` 的 `approval/asked`/`approved/decided` 审计对(候选 3),核销内核行——防御桥内丢失(只读,零风险) |

---

## 5. 对 tech-design 的回填项一览(已同步 §Open Questions)

| # | 项 | 结论 | 动作 |
|---|---|---|---|
| 1 | 审批事件订阅/应答通道 | **可用**:单一 `approval/request` agent-scoped waterfall;订阅 = host 半身 prepend listener(ACP 先例 + root 准入);应答 = listener 返回 ApprovalOutcome(原生回注,无伪造通道);client 侧 `$on` 面被上游 ui-approval 认领饿死,弃用 | §Open Questions 回填;§Interface 3 措辞随 3.5 落地修订 |
| 2 | FORGE_ACTOR 透传 | **结构化主通道** = `exec.agent.session.id`(tool 写集,零 env);指令行基线收窄为 shell 归因/过渡期用途;外部写 `external` 推断兜底;判定序延续 | §Open Questions 回填;3.3/2.x 消费 |
| 3 | payload 可观察性 | **可行**:类别直存 + arguments 经 `tools/pre-execute` callId join(先例 workspace-changes);payload_json 结构定形 | §Open Questions 回填;3.5 输入(§4-3) |
| 4 | 无待定项 | 四候选 + 三问题全部闭合;唯一开放点 = schema 三态映射方案 (a)/(b),已给倾向并移交 3.5(非本 spike 阻塞) | 3.5 开工依据 |

**门控下游**: 3.5(approval-bridge,§4 规格输入);1.x(schema 态映射裁决);3.3/3.4(dispatch 状态机联动口径)。
