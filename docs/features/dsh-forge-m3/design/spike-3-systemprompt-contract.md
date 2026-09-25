# Spike 3 报告: systemPrompt 注入契约 —— 四候选裁决 + prompt_hash 口径定形(3.4/3.5 门控)

> 任务: 0.3(SC8)· 日期: 2026-09-23 · 对应 tech-design §Interface 3(预合成/subagent 创建/注入契约候选)、§Open Questions spike ③、§Cross-Layer Data Map(prompt_hash 行)、§Error Handling(ERR_SYSTEM_PROMPT_CONTRACT)、PRD DF002(预合成内容宿主会话通道)/SC3(注入内容断言)
> 纪律: dsh 侧结论以本仓 vendored 树 `packages/desktop-host-vendor/vendored`(`vendor/upstream.lock.json` pinnedSha `c36ba648dc106d21fb32562793b3e3b9c8922bc4`,desktopHostVersion `0.1.6-alpha.2`)为唯一权威;每条判定附源码路径:符号。本任务纯侦察,零产品代码,无临时实测工程(全部结论可由静态实码核对 + M2 已 e2e 验证的事实推出;引向上的实测结论仅复用 M2 e2e SC2 腿与 M2 spike-1 §4.2,均已是仓内已验事实)。

## 0. 侦察范围与方法

- **systemPrompt 服务本体**: `core/system-prompt`(SystemPrompt 注册表、scoped layers、`complete` 段、persona 槽位)。
- **会话创建链**: `api/session-controller`(`index.ts` Remote 面、`agent.ts` ApiSessionAgentController、`commands.ts` create/prompt 实现、`types.ts` wire 契约)。
- **preset 机制**: `preset/agent-presets`(roster/discovery/mount/authoring)、`preset/persona`(persona 行)、shipped `presets/standard` 组合、`bundle/web-app/cordis.patch.yml`(装配面:工具行移入 preset、agent-presets roster 行)。
- **消息面**: `llm/llm/src/message.ts` + `types.ts`(role 词汇、SystemMessage source 约束)、`core/agent-loop/src/agent.ts`(systemPrompt 装配消费点)、`core/agent`(CreateAgentOptions.setup 契约、`ctx.agents.get`)、`core/scope`(ScopedLayers.effect 的 scope 归属)。
- **subagent 变体对照**: `subagent/subagent/src/child-agent.ts`(进程内 child 的 persona 组合)、`subagent/tool-subagent/src/index.ts`(persona 静态 config)。
- **M2 已验先例(本仓)**: `packages/plugins/forge-workbench/src/host/session-launch.ts`(create/prompt 通道)、`actor-env.ts`(FORGE_ACTOR 追加行基线)、`session-channel-stub.ts`(e2e journal oracle 形态)、`apps/desktop/e2e/task-session-execution-loop/step-4-verify-prompt-injection.spec.ts`(逐字符断言腿)。

---

## 1. Q0: 「dsh 是否存在 systemPrompt 面」——存在,但形态是「服务级注册表 + 会话作用域分层」,不是「按次注入参数」

**总结论:dsh 存在真实的 systemPrompt 面——`ctx.systemPrompt` 服务(`core/system-prompt/src/index.ts:406-436`,cordis `Context` 合并声明 :13-16),支持有序 prompt 段(`section()`,:455-464)、动态上下文(`context()`,:490-499)、变量与工具 schema 提供者,且按 cordis scope 分层(scoped 段同名遮蔽全局段,`ScopedLayers` + `merge`,:576-577;`core/scope/src/store.ts:159-269`)。每回合模型请求前由 agent 循环现场装配:`agent-loop/src/agent.ts:246`(`this.loopCtx.systemPrompt.assemble(assembleContextFor(this, signal))`,scope 主体 = 该 agent,`core/agent/src/dispatch.ts:174-176`),装配产物渲染为**派生的** leading system-role 消息(`llm/llm/src/message.ts:238` createSystemMessage;`agent-loop/src/agent.ts:92,111,365` SystemPromptProjection)。**

**但该面不暴露为「创建会话时传入一段文本」的参数**——会话创建链(`session-controller` Remote 面,§2.①)与消息通道(§2.③)均无文本→systemPrompt 的入口;它只接受**运行期注册**(插件/preset/agent setup 在各自 scope 注册段)。这就是四候选裁决的公共背景:systemPrompt 面存在 ≠ 存在按次注入契约。

---

## 2. Q1: 四候选逐一裁决(AC-1)

### 2.1 候选 ①「create 选项字段」——**证伪(wire 面无此字段;同进程 reach-around 变体机制可行但不采,判为不可作契约)**

| 要素 | 事实 | 依据 |
|---|---|---|
| create wire 契约 | `SessionCreateRequest = { workspaceId?, cwd?, sessionId?, agentPreset? }` —— **无 systemPrompt/prompt/text 类字段**;唯一「提示词相邻」字段是 `agentPreset`(归候选 ②) | `api/session-controller/src/types.ts:266-271`;Remote 声明 `api/session-controller/src/index.ts:244-247`(`@Remote('create')`) |
| 创建链全深核验 | create → `ensureSession(sessionId, cwd, checkPersistedIdentity, presetId)` → `createOrAdopt` → `ctx.agents.create({ sessionId, agentOptions, meta: { cwd, agentPreset }, setup })` —— `CreateAgentOptions` 全字段(sessionId/parentAgent/meta{cwd,parentSession,isSeeded,origin,delegationDepth,agentPreset}/inheritedEventCount/seed/agentOptions/signal/setup)中**无任何提示词文本载体** | `api/session-controller/src/agent.ts:239-276`(ensureSession)、:444-495(createOrAdopt)、:381-397(composeAgent);`core/agent/src/index.ts:62-119`(CreateAgentOptions) |
| **reach-around 变体**(同进程服务直连) | 机制上可行:host 半身插件可 `ctx.get('agents')` → `agents.get(sessionId)` 取 live Agent(`core/agent/src/index.ts:155-158`「ctx.agents.get(id) still returns a bare Agent」),经 `agent.ctx.systemPrompt.section(...)` 注册 agent-scope 段——traceable proxy 将服务方法的 `this.ctx` 重绑为调用方上下文(`agent-presets/src/index.ts:160-164` selfCtx 注释),`ScopedLayers.effect` 以 `scopeOf(调用方 ctx)` 归层(`core/scope/src/store.ts:226-243`);注册表自身也以此为指导路径(`core/system-prompt/src/index.ts:384-386` 重名错误文案「for a per-agent override, register through that agent's `agent.ctx` instead」) | 上列符号;`systemPrompt.section()` `core/system-prompt/src/index.ts:455-464` |
| reach-around 不采的理由 | ① **非持久**:段注册是进程内内存态;会话冷恢复时 `composeAgent` 只重挂 preset(`api/session-controller/src/agent.ts:431,468-473` resume 路径),外来段静默消失——上游正是为此把 child 的 agentPreset 写进 durable meta(「without it a cold read of the child resolves the deployment default and rebuilds turns under a tool set the child never had」,`subagent/subagent/src/child-agent.ts:123-135`);② **无 wire 契约**:绕开 sessionController 开放面,直接耦合 `dsh-agent`/`dsh-system-prompt` 内部服务形状,vendored 升级漂移面扩大;③ **审计/断言弱**:注入内容只在请求日志的 system 投影里间接可见,无 M2 journal 同型的逐字符 oracle 面;④ `session/created` 前的 setup 窗口由 sessionController 独占(`core/agent/src/index.ts:101-118` setup 契约仅 factory 调用方可供),后注册则与首条消息入队存在时序耦合 | 上列符号 |

**判定:① 证伪。**「先证伪/证实 systemPrompt 面」的总答案落定:面存在(§1),但 create 选项无字段;同进程段注册可达而不采(非持久、无契约、弱审计)。

### 2.2 候选 ②「会话模板/preset」——**面证实存在,但不可作 M3 派发注入契约(五项结构性障碍)**

| 要素 | 事实 | 依据 |
|---|---|---|
| preset 机制存在 | `agentPresets` roster(TypertRemoteService):文件系统发现(shipped root `presets/standard` 等 + config roots + 用户根 `$DSH_HOME/.agent-presets`,发现不记忆化);`SessionCreateRequest.agentPreset` 按名指定;创建/恢复经 `composeAgent(presetId)` → `presets.mount(agentCtx, resolvedId)` 挂入 agent scope | `preset/agent-presets/src/index.ts:104-185`(roster/roots)、`src/discovery.ts:51,60`(USER_PRESET_DIR/SHIPPED_PRESET_ROOT);`api/session-controller/src/agent.ts:381-397,485-494`;装配行 `bundle/web-app/cordis.patch.yml:506-516`(default: standard) |
| persona 行(preset 内文本面) | preset 组合可挂 `@deepseek-ai/dsh-persona` 行:`prefix`(模板,`{{…}}` 严格插值)遮蔽 deployment persona 槽(`PERSONA_PREFIX_SECTION = 'deployment:persona-prefix'`),可选 `complete: true` 使该段成为**唯一** prompt 段 | `preset/persona/src/index.ts:44-82`(Config/apply);`core/system-prompt/src/index.ts:70-76,180-183,596-634`(complete 语义);shipped 用例 `preset/agent-presets/presets/standard/agent.cordis.yml:16-22` |
| **障碍 1: standing 共享,非按次内容** | preset = 「mounted ONCE per preset under a standing scope and joined by every agent that names it」——同 id 的所有会话共享同一组合(同一 persona 文本);M3 预合成内容**每次派发不同**(任务类型协议 × feature 摘要 × 生效偏好),按内容唯一性需每派发写一个 preset 目录 | `preset/agent-presets/src/index.ts:1-22`(模块契约)、`src/mount.ts:127-160,369-424`(standing mount) |
| **障碍 2: 开放面无「按文本造 preset」入口** | authoring 仅为整目录 copy:**「The only authoring write is a whole-directory copy of an existing preset. No caller supplies composition text」**;Remote 面 list/read/copy/deletePreset/select,无 write-composition | `preset/agent-presets/src/authoring.ts:8-12,127-165`;Remote 声明 `src/index.ts:285,541,593,631,723` |
| **障碍 3: 用户 roster 污染 + 信任语义** | 本地 authored preset 落用户根、trust=user、进用户可见 roster(picker 面);patch 注释明言「`$DSH_HOME/.agent-presets` is where a person — or an agent — authors their own … **a preset IS a composition**(same trust as shell access)」——把每任务预合成文本写成 preset = 每派发在用户 preset 名册留一个常驻组合目录 | `bundle/web-app/cordis.patch.yml:506-516`;`preset/agent-presets/src/authoring.ts:56-62`(writableRoot = 首个 user 根) |
| **障碍 4: 该 bundle 里工具住在 preset 后面** | web-app bundle 将 host 侧 tool 行全部 disabled,`standard` preset 的 `agent.cordis.yml` 才挂 tool-bash/tool-fs/tool-skill/… —— 自定义 preset 若只加 persona 不复制 standard 全量行,派发会话**没有工具**;复制全量则每次上游升级产生组合漂移面 | `bundle/web-app/cordis.patch.yml:395-478`(host tool 行 disabled + 各行注释「presets own …」);`presets/standard/agent.cordis.yml`(persona 之后的 tool 行) |
| **障碍 5: 语义错位** | persona `complete: true` 会**顶掉全部其他段**(harness identity/工具指导等,`core/system-prompt/src/index.ts:596-634` restore-as-sole 语义);非 complete 则 forge 预合成内容被塞进「deployment persona 前缀」槽位,与 harness 叙事互相穿插——既非「完整交付」也非干净隔离 | 同上;`SECTION_ORDERS`(:125-160) |

**对照(进程内 subagent 变体,不可达)**: `subagent/child-agent.ts:200-219` `applyChildComposition` 支持每 child persona(`composition.persona` → scoped `deployment:persona-prefix` 段),但仅存在于 `tool-subagent` 模型驱动委派流;其 persona 是**部署 config 静态值**(「Per-child persona that shadows … Requires the provider's `persona` capability」,`subagent/tool-subagent/src/index.ts:78-81,124`)且经 `ctx.subagents` 路由——M3 派发走 `sessionController` 普通会话(M2 先例),该面不可达也不适用。

**判定:② 面存在但不采。**

### 2.3 候选 ③「首条 system 消息」——**证伪(消息通道无 system role 注入口)**

| 要素 | 事实 | 依据 |
|---|---|---|
| prompt 通道只产 user 消息 | `SessionPromptRequest = { requestId, sessionId, mode: 'queue'|'steer', content: readonly PromptContentPart[], clientTimeZone? }`;`PromptContentPart = { type:'text', text } | { type:'image', … } | { type:'file', receiptId }` —— **无 role 字段**;实现侧强制 `source = { kind: 'user', rpcId, … }` → `createUserMessage({ content, source })` → `agent.followup/steer(message)` | `api/session-controller/src/types.ts:75-83,313-321`;`api/session-controller/src/commands.ts:299-373`(source :327-331、createUserMessage :351、followup/steer :360-361);source 词汇 `'user-rpc': { kind: 'user'; … }`(`types.ts:378-383`) |
| system 消息是受控派生物 | `Message.role = 'system' | 'user' | 'assistant'`,但 `SystemMessage.source` **必须**是 `MessageSourceMap['plugin']`(「one rendered system prompt attributed to the plugin that assembled it」)——由 agent 循环从 systemPrompt 装配产出,外部无铸造口 | `llm/llm/src/message.ts:130-161`(role/SystemMessage)、:238(createSystemMessage);`core/agent-loop/src/agent.ts:246`(assemble)、:365(project) |
| 其他消息入口亦无 system | fork = 自身 log 前缀复制(`SessionForkRequest { sessionId, atSeq? }`,无内容字段,`types.ts:302-310`);updateQueue = 待定 user 消息变更;rename = 标题 | `api/session-controller/src/types.ts:341-350,289-299` |

**判定:③ 证伪。**

### 2.4 候选 ④「首条 user 消息追加」——**证实(M2 已落地并 e2e 验证的基线,零上游配合)**

| 要素 | 事实 | 依据 |
|---|---|---|
| 通道 | `create({ sessionId(caller-minted,幂等 adopt), cwd })` + `prompt({ requestId, sessionId, mode:'queue', content:[{type:'text',text}] })`;queue 语义 = 持久化 user message 入队 | 本仓 `packages/plugins/forge-workbench/src/host/session-launch.ts:38-46`(channel 面)、:142-155(create)、:157-166(prompt);`api/session-controller/src/commands.ts:360-361`(followup) |
| 注入纪律 | prompt 原文逐字符不改写,唯一变换 = 尾部**恰好一行**追加指令;消息为 DATA 端到端,不被解析执行 | `session-launch.ts:23-25`(Hard Rule 注释);`actor-env.ts:36-50`(composeFirstUserMessage/actorInstruction) |
| 幂等 | requestId 确定性派生 `sha256(sessionId ‖ NUL ‖ message)`,上游 `hasPromptRequest` 短路去重,重放不双投 | `session-launch.ts:71-74`;`api/session-controller/src/commands.ts:318` |
| e2e 逐字符 oracle(M2 SC2 腿) | journal `text` = 组合后首条 user 消息;断言 = sha256 全等 + 全文相等 + 前缀逐字节相等(原文不改写)+ 恰好一行归因 + requestId 确定性;oracle 语料含 CRLF/unicode/行尾空格/收尾换行 | `session-channel-stub.ts:19-24`(journal 形态);`apps/desktop/e2e/task-session-execution-loop/step-4-verify-prompt-injection.spec.ts:32-40,77-96` |
| 通道字节保真 | 上游对 text part 零改写:`attachments.admitPromptContent` 只提升 image/file part,`createUserMessage` 原文冻结存储 | `api/session-controller/src/commands.ts:350-351`;`llm/llm/src/message.ts:181-197`(deepFreeze 快照) |

**判定:④ 证实可行。**

---

## 3. Q2: 最终裁决与 M2 基线差异(AC-2)

**裁决:采用 ④——预合成内容以「首条 user 消息(原文 + 尾部追加行)」注入派发会话。** dsh 的 systemPrompt 面(§1)不提供按次注入契约(§2.①②③),④ 是唯一「零上游配合、持久可重放、逐字符可断言」的载体,且为 M2 已验证基线。**与 M2 基线的差异(三点,均为内容侧,通道与纪律不变):**

| 维度 | M2 基线 | M3 派发形态 | 依据/落点 |
|---|---|---|---|
| 注入内容来源 | `forge prompt get-by-task-id` CLI stdout(spawn 取回) | 内核 `dispatch` 预合成三要素:任务类型协议(spike ④ 移植面)+ feature 目标/摘要(`stage_asset` 最近资产)+ 生效偏好(`prefs` 三级解析);内核模板常量组装,不 eval、不拼接指令语义(T2 缓解延续) | tech-design §Interface 3 预合成;DF002;本报告不改通道,仅换内容生产者 |
| 追加行语义 | FORGE_ACTOR 指令行(「prefix every forge CLI command …」CLI 主叙事) | **收窄**(spike 2 §2 定论):dsh tool 写集 actor 已结构化(`exec.agent.session.id`,零 env 载体);追加行保留但文案收窄为「bash 内 shell 动作归因(git commit 等)+ 外部 CLI 过渡期」,值仍 `session:<sessionId>`(与 `dispatch.session_id` 同键)。形态纪律不变:恰好一行、原文不改写、只在尾部、由 launcher 侧模板常量组装(确定性 = sessionId 的函数,可入 hash)。文案字节归 3.4 定稿 | M3 spike-2 报告 §2;本仓 `actor-env.ts:36-50` 形态先例 |
| 语义定位 | 「主会话直注」降级形态(M2 线一) | **定形为 M3 正式注入契约**:预合成一次写入、会话持久首条消息,替代每回合自跑合成;术语同步——PRD/设计文中「系统提示词注入」在 M3 执行层语义 = 「预合成内容经宿主会话通道以首条 user 消息注入」,PRD DF002 行 transport 字段「宿主会话通道(spike ③ 契约定形)」由此定形,Format 字段的「systemPrompt」字样以本裁决细化为「首条 user 消息(追加形态)」,tech-design Interface 3 为 M3 执行权威 | 本报告;tech-design §Open Questions 回填;PRD 不在本任务改动面 |

**G3 断言口径同步**:「每个 subagent 系统提示词可断言包含三要素」在 ④ 形态下的物理观测面 = 通道注入的首条 user 消息文本(SC3 注入内容断言锚点 = `dispatch.prompt_hash` + journal 逐字符比对,§4)。

---

## 4. Q3: prompt_hash 口径定形(AC-3)

| 项 | 定形 | 说明 |
|---|---|---|
| **hash 对象** | **组合首条消息全文** = `预合成内容原文 + "\n\n" + 追加行`(即经 `channel.prompt` 交付的 `content[0].text` 字符串本身)——**不是** systemPrompt | systemPrompt 面已被裁决不可用为注入契约(§2);hash 落在唯一实际交付物上,断言才与物理通道一一对应 |
| **算法** | `sha256(utf-8 bytes)` hex 小写,与 M2 e2e 同式(`step-4 spec:42-44,80`) | 零新依赖 |
| **落库时机** | dispatch 行创建时一次定型:内核**预铸 sessionId**(caller-minted,`create({sessionId})` 幂等 adopt,M2 已验)→ 组合消息确定 → `prompt_hash` 随 dispatch 行落库 → dispatch-launch 以同 sessionId 走 create/prompt | 预铸使 hash 与 launch 解耦:launch 失败重派发(`redispatch`)同 hash 复核,不因会话重建漂移;`deriveLaunchRequestId(sessionId, message)` 亦随之确定 |
| **逐字符比对形态(M2 journal 复用)** | e2e 断言四件套,直接复用 M2 channel stub journal(`session-channel-stub.ts:19-24` 的 prompt 行 `text` 字段):① `sha256(journal.text) === dispatch.prompt_hash`(全等);② `journal.text.startsWith(预合成内容)` 前缀逐字节全等(原文不改写);③ 追加行恰好一行(标记串计数 = 1,形态同 `step-4 spec:85-89`);④ `journal.requestId === deriveLaunchRequestId(sessionId, journal.text)`(重放幂等) | stub 的 SessionChannel 面(create+prompt)零改动即可承载 M3 腿;三要素断言 = ② 的前缀语料断言(预合成内容由测试进程提供,含 CRLF/unicode oracle 语料形态延续) |
| **跨文档同步** | tech-design §Cross-Layer Data Map `prompt_hash` 行注记由「口径随 spike ③」定形为「sha256(组合首条消息)」;`design/schema.sql:68` 注释「口径随 spike ③ 裁决」由此解析为同值(注释自身已预留指向,无需改 SQL) | 本报告 §6 回填清单 |

---

## 5. Q4: 内核「不透明传输」边界确认(Implementation Notes 核对项)

**结论:边界成立,无泄漏假设。** 内核(预合成/派发侧)对注入内容的全部假设 = 「字符串完整交付到目标会话的首条 user 消息」,逐项核对:

1. **无解析/执行假设**:通道侧 text part 零变换(`attachments.admitPromptContent` 仅处理 image/file part;text 经 `createUserMessage` 深冻结原文存储,`commands.ts:350-351` + `llm/llm/src/message.ts:181-197`);M2 e2e 已在真实链上以 CRLF/unicode/行尾空格/收尾换行 oracle 证逐字节保真(`step-4 spec:32-40`)。
2. **无 env 假设**:dsh 无 per-session env 注入面(M2 spike-1 §4.2 定论;进程级 shell env 无法区分会话)——内核不假设任何环境变量载体;actor 走结构化通道(spike 2 §2)。
3. **无 system 槽位假设**:④ 形态下内核不依赖 systemPrompt 装配、preset、persona 任何内部行为(§2 三候选全部不采);唯一载体 = 持久化 user 消息,冷恢复后原样重放(durable 事件流,非内存态)——这正是 ④ 对 reach-around 变体的决定性优势(§2.① 不采理由 ①)。
4. **无宿主侧解释假设**:追加行在 launcher 侧组装并计入 hash 后才上通道——内核不依赖宿主对内容做任何改写/补注;`ERR_SYSTEM_PROMPT_CONTRACT` 派发前检查随之收窄为确定性三查:通道可解析(同 `sessionChannelOf` 鸭类型面检查,`session-launch-rpc.ts:29-36`)+ 预合成内容非空 + `prompt_hash` 已定型;不再存在「systemPrompt 面满足性」检查项(面不存在,§1/§2)。

**T2(提示词注入威胁)缓解延续**:三要素均为文档数据,内核模板常量组装,不 eval;`prompt_hash` 留档可审计;追加行 = 唯一由模板常量生成的指令语义文本,且入 hash(tech-design §Security·T2 措辞与 ④ 形态一致,无需改写)。

---

## 6. 对 3.4/3.5 的门控落点与回填清单

**门控解除**:本结论门控 3.4(预合成)与 3.5(launch)。两任务的注入契约依据 = 本报告 §3(④ 定形 + 追加行纪律)、§4(hash 口径)、§5(派发前检查三查);3.4 落地时定稿追加行文案字节(纪律已定:恰好一行/原文不改写/模板常量/sessionId 函数)。

**回填**(本任务已执行):tech-design §Open Questions spike ③ 勾选 + 结论摘要 + 报告链接;§Cross-Layer Data Map `prompt_hash` 行口径注记定形。§Interface 3 预合成段的「口径随 spike ③ 裁决」字样随回填消除歧义(指向本报告)。PRD DF002 Format 字段细化解注见 §3(术语同步,不构成矛盾;PRD 非本任务改动面)。

**遗留移交**(不阻塞 3.4/3.5):无 —— 本 spike 四候选证据链闭合,无「待定」项。
