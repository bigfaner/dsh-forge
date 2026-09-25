# Spike 1 报告: dsh tool 注册契约 + renderer 桥链路可用性 + 时延/启动竞态实测(T2 可用性确认)

> 任务: 0.1(SC8)· 日期: 2026-09-23 · 对应 tech-design §Interface 2、§Open Questions spike ①、§Security Considerations T4
> 纪律: dsh 侧结论以本仓 vendored 树 `packages/desktop-host-vendor/vendored`(`vendor/upstream.lock.json` pinnedSha `c36ba648dc106d21fb32562793b3e3b9c8922bc4`,desktopHostVersion `0.1.6-alpha.2`)为唯一权威;每条判定附源码路径/符号。本任务纯侦察 + 临时目录最小实测工程(`%TEMP%\dsh-spike1`,不入仓),零产品代码落地。

## 0. 侦察与实测方法

- **静态侦察**: vendored `core/tools`(注册契约)、`api/gateway` + `api/remotes` + `client/connection`(桥链路)、`llm/llm-deepseek`(名字透传)、`bundle/base|web-app`(装配)、本仓 `packages/plugins/forge-workbench`(M2 先例)与 `apps/desktop/src/main/protocol`(壳载具)。
- **动态实测**(最小 spike 工程,临时目录):以 vendored 闭包真实产物(lib 构建 + 安装依赖,经 junction 只读链接)装配最小 host 应用 —— `webServer` + `credentials-local` + `typert-registry` + `api-gateway` + `client-connection`(host 半) + `system-prompt` + `tools`(ToolRuntime)+ 一个自建 `BridgeService`(`TypertRemoteService` 子类:stream 面 `calls(signal)` + 单向面 `answer(request)`/`trigger(...)`)+ 一个 `defineTool` 注册的真实模型面工具(`forge_task_add`)。client 侧为**裸传输驱动**(不经 cordis client 胶水):launch-token URL 铸 cookie → HTTP POST `/api/forgeToolBridge/<method>`(Connection RPC 信封,单向腿)→ WebSocket `/api/remote.mux` `{type:'open'}` mux 帧(流推送腿)——与产品 renderer 所骑的完全是同两条物理通道(见 §2 证据)。测量口径:host 侧 `hrtime` 全往返(tools.execute → 桥 → client → answer → resolve)。

---

## 1. Q1: dsh tool 注册契约定形

### 1.1 注册面与调用形态(全部实码核对)

| 契约项 | 定形 | 依据(vendored 源码路径:符号) |
|---|---|---|
| 定义辅助 | `defineTool(options)` 返回 registry-ready `ToolDefinition` | `core/tools/src/schema.ts:545`(options 形态 `DefineToolOptions` :483-536) |
| 必填字段 | `name` / `description` / `parameters`(隐式开放对象根)/ `output { schema, render, presentationMeta? }` / `execute(args, exec)` | schema.ts:483-536;`ToolDefinition extends ToolSchema`(`core/tools/src/index.ts:216`),**output 声明强制**(`ToolOutputDefinition` index.ts:206-213,register 时校验 index.ts:1046-1050) |
| 参数 schema | 逐属性 `ValueSchemaSpec`:`type: string/number/integer/boolean/null/array/object/json/oneOf` + `enum`/`const`/`description`/`required: true`(requiredness 是属性级注解,无顶层 required 数组) | schema.ts:16-92(`StringValueSchemaSpec` 等)、:105-110(`ParameterSchemaSpec` 注释「requiredness remains a per-property `required: true` annotation」) |
| 执行回调 | `execute(args, exec)` 返回**声明的 canonical lossless-JSON 值**(非 ContentBlock;渲染归 `output.render`);`defineTool` 先验参后进体,违规抛 `ToolArgsError('INVALID_ARGS')` | schema.ts:585-589、index.ts:229(execute 契约)、schema.ts:461-470 |
| exec 上下文 | `exec.agent`(所属会话,actor 来源:`exec.agent.session`)/ `exec.callId` / `exec.signal`(协作取消);先例即 plugin-manager 工具的审批用法 | `boot/plugin-manager/src/tools.ts:33-40`;`ToolExecutionInput`/`ToolRunContext` index.ts:309-401 |
| 可选面 | `timeoutMs?`(正有限数)/ `isConcurrencySafe?` / `finalizeContent?` / `presentCall?` / `presentResult?`(纯函数,replay 安全) | schema.ts:499-535、index.ts:241-281 |
| 注册调用 | `ctx.tools.register(definition): () => void`(返回精确 disposer);插件形态 = `export const inject = ['tools', …]` + `apply(ctx)` | `core/tools/src/index.ts:1043-1067`;先例 `boot/plugin-manager/src/tools.ts:12,17-18` |
| 唯一性/保留名 | 同 scope 重名拒绝;`run_code` 无条件保留(PTC 传输名) | index.ts:729-731(`ToolLayer` NamedEntries 报错文案)、:1060-1062 |
| 注册位 | ToolRuntime(`tools` 服务)由 **base bundle 全局装配**(`bundle/base/cordis.patch.yml:486-488` id `tools`);tool-bash/tool-fs 等工具包同样挂 base 行(:254-291)→ **我们 profile 层插件 host 半身从 root context 注册 = 全局工具,是标准形态**(与 M2 先例 `forge-workbench` host 半身同应用图)。plugin-manager 工具是 preset 装配 + 默认 disabled(base :16-18 / web-app :394 / standard preset :264-266)——那是危险工具的策略选择,非机制限制 | bundle/base/cordis.patch.yml;M2 spike-1 §0(插件 host 半身与宿主服务同进程同一 cordis 应用) |

**结论 1:注册契约完全可用,`plugin-manager/tools.ts` 先例逐项成立;无待定项。**

### 1.2 扁平名规则 —— 发现一项必须回填的偏差(dot 名不可用)

- registry 层**无字符集校验**(仅保留名 + 重名,`core/tools/src/index.ts:1043-1067`);
- 但工具名**原样进 provider wire**:`llm/llm-deepseek/src/protocols/messages/serialize.ts:135-137`(`tools: options.tools.map(tool => ({ name: tool.name, … }))`,chat-completions 同 :341)——约束在 provider API 侧:Anthropic 形 Messages API 的 tool name 合法集为 `^[a-zA-Z0-9_-]{1,128}$`,**不含点**;
- 上游全部工具名为 snake_case 单词/下划线:`run_code`(`core/tools/src/ptc.ts:23`)、`plugin_manager`(plugin-manager/tools.ts:19)、`create_goal`/`get_goal`(goal/tool-goal)、`job_list`(jobs/tool-jobs)、`glob`/`read`(fs/tool-fs-search、tool-fs)。

**判定:tech-design §Interface 2 的 `forge.task.add` 点号命名大概率被 provider 拒绝,不可用。** 修正建议(交 2.1 定夺,二者均满足 T1「输入 schema 严格类型」):

- (i) **下划线扁平名**:`forge_task_add` / `forge_task_claim` / …(机械映射,动词面不变);
- (ii) **单工具 + action 枚举**(plugin_manager 同款:`name: 'forge'` + `parameters.action: { enum: ['task_add', 'task_claim', …] }`)——工具面最小(15+ 动词收一面),与 T1 最小暴露面缓解同向,但单工具 schema 较肥。

### 1.3 PTC 注意项

desktop profile 默认 `native` 模式(base `tools` 行不带 mode → schema 默认 native,base/cordis.patch.yml:486-488);若用户层选 `ptc`,模型直呼非 `run_code` 工具会被折叠拒绝(`ToolPresentationMode`,index.ts:655-663)。我们的工具注册不依赖模式,但 e2e 断言需在 native 下跑。

---

## 2. Q2: 桥链路可用性矩阵(逐跳)

**先说总结论:T2 renderer 桥接可用,但机制形态需修正 —— 字面意义的「host 发起 rpc 调 client」在上游开放面中不存在;可行且已实测的形态是「client 订阅 host 流 + 单向 answer 回传」(倒向桥)。零新增监听端口、零新增 npm 依赖、动词面封闭三条裁决全部保持。**

| 跳 | 通道 | 判定 | 依据 |
|---|---|---|---|
| 1 | tool handler(host 半身)→ 桥服务(host 半身) | **可用(进程内)** | 插件 host 半身与 ToolRuntime 同一 cordis 应用(M2 spike-1 §0;base `tools` 行);直接函数调用,零传输 |
| 2 | host → client 字面 host 发起 RPC | **不可用(面封闭)** | gateway 转发事件源**单源独占**:`api/gateway/src/index.ts:233-243`(`registerRemoteEvents` 二次注册即 throw);转发事件白名单是上游包内 **const 闭合数组** `API_REMOTE_FORWARDED_EVENTS`(`api/remotes/src/remote-events.ts:18-42`,waterfall 仅 `approval/request` 与 `user-questions/request`);host 侧 invocation 只解析 local 端点(`resolveDescriptor` → `typert.local.get`,gateway index.ts:626-636),client 命名空间是消费侧 `$mount` 产物(gateway client index.ts:200-208)——第三方插件无法扩白名单 |
| 2' | host → client **流推送**(stream Remote)+ client → host **单向 answer**(unary Remote) | **可用(已实测)** | ①stream 面:`@Remote({ mode: 'stream' })` 方法(typert-protocol index.ts:185-197;先例 `sessionController.follow/control` api/session-controller/src/index.ts:400-413、terminal/workspace-controller),mux server 逐项 pump 到 WS(`api/gateway/src/stream-server.ts:126-133`),线协议 = JSON 文本帧 `{type:'open'}`/`{type:'item'}`(stream-protocol.ts:243-267);②client 消费:`ctx.remote.$mount` + `remote.$stream({ open: signal => remote.<ns>.<method>(signal) })`(gateway client index.ts:185-187;先例 `createSessionControlStream` api/session-controller/src/client/transport.ts:115-126);③我们服务的 SRC 发现路径与 M2 ForgeBridge 完全同型(`TypertRemoteService.typertRemote` binding → `collectSrcClaims` gateway index.ts:262-282 / `resolveSrcDescriptor` :639-676,参数名从方法源码文本解析 `methodParameterNames` :1063);④**renderer 可达性**:renderer 对 host 开**直连** WebSocket `ws://127.0.0.1:<port>/api/remote.mux`(本仓 `apps/desktop/src/main/protocol/ws-header-rewrite.ts:6-13` 注释 + `WS_REWRITE_URL_FILTER`),鉴权 = authority 绑定 cookie(gateway upgrade 处理走 `connection.requestRejection`,index.ts:209-218;`BrowserAuth.isAuthenticated` 仅认 cookie,client/connection/src/browser-auth.ts:289-296)——壳 boot payload 已携带 |
| 3 | client 半身 → IPC 白名单 `dshForge.workbench.*` → 内核 | **可用(M2 既有,零改动)** | `packages/plugins/forge-workbench/src/client/ipc/workbench.ts`(verb 表 preload/main 双侧 `channel-allowlist.ts` 漂移锁定);桥只做「收到的 verb → 白名单 verb」封闭映射,无通配无反射(T4 缓解保持) |

**实测工程证明(§0 方法,host 侧真实装配 + 裸传输 client):** stream open → item 推送 → answer POST → host promise resolve 全链打通;backlog(连接前入队)在 client 接入后即时重放投递;无人应答时预算超时路径成立(§3)。

**多窗口语义**(设计注意项):流方法每次 `open` 独立调用一次 —— 多 client 各持一个 generator,队列按 waiter 单投递(**不重复执行**);投递到的那扇窗口若消亡 → 该调用走预算超时降级。桌面应用单窗(M1 单实例锁),实际风险面 = 窗口关闭时在跑的 tool 调用。

**附带侦察(spike ② 输入)**:host→client 的审批推送可骑上游已白名单的 `approval/request` waterfall(emit 面 `api-session/*` 同为白名单成员),`decideApproval` 反向走我们自己的单向 Remote(候选 2' 同机制)——不属本 spike 裁决范围,仅记录通道存在性。

---

## 3. Q3: 时延与启动竞态实测

### 3.1 实测数据(两轮一致;同机 loopback,Node client 代表 renderer —— renderer 的 WS 对 host 是直连,产品腿仅多 Chromium 调度与一次 renderer→main IPC,预期 +ms 级,不改变量级)

| 腿 | n | min | **med** | p95 | max |
|---|---|---|---|---|---|
| 流推送(host 入队 → client 收帧) | 51 | 0.2ms | **0.6ms** | 14.1ms | 1228.7ms(= backlog 样本,见 3.2) |
| 桥全往返(handler → 桥 → client → answer → resolve) | 40 | 1.1ms | **1.3ms** | 11.0ms | 12.1ms |
| 工具管腿(`ctx.tools.execute` 全程,含 schema 验参 + pre/guard/dispatch 管线 + 桥) | 10 | 4.4ms | **15.7ms** | 16.1ms | 16.1ms |

量级结论:**桥本体 ~1-2ms,含 dsh 工具管线全程 ~5-16ms** —— 相对模型一次 tool-call 周转(秒级)可忽略;「重试一次」的代价同样可忽略。

### 3.2 启动竞态窗口判定

| 场景 | 实测行为 | 判定 |
|---|---|---|
| **boot 竞态**(host 已起、renderer 未连时 tool 调用入队) | 入队调用在 client 流打开后**即时重放投递**(实测样本在 host boot 即入队,client 延 800ms 接入,接上瞬间送达并被应答;等待期 1216.8ms 全部为等连接,投递本身即时) | **无丢失**;桥队列必须带 backlog 重放(spike 工程已验证该形态);再加一个「等待首连接」宽限即可把 boot 竞态完全吸收 |
| **无人应答**(socket 在但 client 不答;窗口关闭/卡死的等价面) | 预算 400ms → 405-413ms 超时,host 侧以 `ERR_TOOL_BRIDGE_UNAVAILABLE` 兜底返回;过期帧送达后 client 按 callId 幂等忽略 | **预算超时是唯一信号**;「重试一次 + 明确提示」充分 |
| **无 client**(从未连接) | 同超时路径(同表) | 同上;可用 activeStreams 计数快速失败(spike 工程跟踪该计数,连接期 =1) |

### 3.3 降级链定形(回填 §Interface 2 / Story 9)

1. tool 调用入桥;**若 activeStreams === 0 且宽限期内无接入** → 立即(不等满预算)`ERR_TOOL_BRIDGE_UNAVAILABLE`;
2. 已投递但预算内未应答 → 同错误码(重试一次后上抛,reasonCode 进会话,禁静默 —— PRD Story 9);
3. 应答携带 IPC reject `{code}` → 原样 reasonCode 透传;
4. 预算建议:连接宽限 ≤1s(覆盖 boot 竞态)+ 每调用预算 ~5s(覆盖 renderer 冻结/关闭);重试一次策略成本 ≈ 一次桥往返(§3.1)。

**结论:「重试一次 + 明确提示」降级链充分,无需追加兜底通道;唯一新增建议是 activeStreams 快速失败优化(纯实现细节,非契约)。**

---

## 4. 对 tech-design 的回填项一览(供 2.1 消费)

| # | 项 | 结论 | 动作 |
|---|---|---|---|
| 1 | T2 机制表述 | 「host cordis rpc → client 半身」字面 host 发起 RPC 不存在;修正为 **client 订阅 stream(`@Remote({mode:'stream'})`)+ 单向 answer**,经我们自有 `TypertRemoteService`(SRC 发现,M2 ForgeBridge 同型);零新端口/零新依赖/动词封闭保持 | §Open Questions 回填;§Interface 2 措辞随 2.1 落地修订 |
| 2 | 工具命名 | `forge.task.add` 点号名会被 provider 字符集拒绝;改 **下划线扁平名**(`forge_task_add`)或**单工具 + action 枚举**(plugin_manager 同款);2.1 定夺 | 2.1 输入 |
| 3 | 桥队列形态 | host 侧 pending 队列 + backlog 重放 + per-call 预算 + activeStreams 快速失败;多 client 单投递不重复执行 | 2.1 实现规格 |
| 4 | 时延预算 | 桥 ~1-2ms / 工具全程 ~5-16ms;降级链「重试一次 + ERR_TOOL_BRIDGE_UNAVAILABLE」充分 | 确认设计原案 |
| 5 | 鉴权载具 | 桥 ride 既有 cookie 围栏(upgrade + /api 同一 `requestRejection`);无新增鉴权面 | 确认 T4 口径 |
