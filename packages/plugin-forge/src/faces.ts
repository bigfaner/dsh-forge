// 结构化最小面（定位：业务——插件对 dsh 宿主服务的消费形状锚定；knowledge 同型）。
// 与 core/index.ts 的 CoreContextFace 同一纪律：插件不依赖 dsh 运行时包
// （@deepseek-ai/* / cordis），仅以结构化子面消费官方面——真实现
// （ToolRuntime / SystemPrompt / 真 Context）结构兼容，运行期由 profile 装配注入。
// 对 core 的唯一依赖 = forgeTasks / forgeProposals 两服务接口类型（contracts 单一来源），
// 零实现级 import（可独立发版前提）。参数 schema 面恒取官方 enforced subset 标量形
// （string/integer/number/boolean + 数组）——嵌套负载（gate/include/vars）在 tool 面
// 平铺为显式参数（Interface 8 snake_case + 任务定位两显式参口径的延伸）。
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_EXPERT_MAPPING,
  type ForgeSettingsService,
  type ForgeProposalsService,
  type ForgeTasksService,
  type ProjectServiceM2,
  type TaskType,
} from '@dsh-forge/contracts'
import type { NarrationChannel, NarrationSendOptions } from './notify/index.js'
import { forgeLoopSource } from './forge-loop-source.js'
import type { ForgeLoopNarrationMeta } from './forge-loop-source.js'

/** dsh 官方 ContentBlock 的文本块子面（output.render 产物） */
export interface TextContentBlock {
  readonly type: 'text'
  readonly text: string
}

/**
 * 参数 schema（注册面消费的编译后 JSON Schema 形状——官方
 * parameterSchemaSpecToJsonSchema 产物子集；type 固定 object 根）。
 */
export interface ToolParametersSchema {
  readonly type: 'object'
  readonly properties: Readonly<Record<string, ToolParameterProperty>>
  readonly required?: readonly string[]
}

/** 单个参数属性（官方 enforced JSON Schema subset 内的节点——标量与数组，无嵌套 object/enum） */
export interface ToolParameterProperty {
  readonly type: 'string' | 'integer' | 'number' | 'boolean' | 'array'
  /** 数组参数的元素类型（type: 'array' 时）；标量参数无此字段 */
  readonly items?: { readonly type: 'string' | 'integer' | 'number' | 'boolean' }
  readonly description: string
}

/** 会话头（官方 SessionHeader 子面：cwd = 会话创建时的工作目录 = 工作区根；
 * agentPreset = 会话**出生**预设 id——出生事实，deepFreeze 不随切换更新） */
export interface ToolSessionHeaderFace {
  readonly cwd?: string
  /** 会话创建头携带的 agent 预设 id（上游 SessionHeader.agentPreset 同位；无预设组合 = 缺席）。
   * 出生快照——预设切换后此值**过期**：当前值 = snapshotEvents 的 'agent-preset/selected'
   * 事件回放 > 本出生头（上游 agentPreset 投影同径——"never the header alone"） */
  readonly agentPreset?: string
}

/** 会话事件（官方 SessionEvent 消费切片——防御读面：type 判别 + data 载荷） */
export interface ToolSessionEventFace {
  readonly type?: unknown
  readonly data?: unknown
}

/** dsh 会话（官方 Session 子面：id = claim/submit 的执行会话键） */
export interface ToolSessionFace {
  readonly id: string
  /** 官方 sessionCwd 读取位（dsh-tool-fs 同型：exec.agent.session.header.cwd） */
  readonly header?: ToolSessionHeaderFace
  /** 兼容位：Session 顶层 cwd（结构面允许双读，真实现只有 header.cwd） */
  readonly cwd?: string
  /**
   * 官方 Session.snapshotEvents 结构同位（事件日志只读快照）。预设切换上游记
   * 'agent-preset/selected' 事件（出生头冻结不更新）——当前预设 = 事件回放 > 出生头
   * （dsh-agent-preset-registry agentPreset 投影同径）。缺席（结构漂移/测试窄面）=
   * 只读出生头。
   */
  snapshotEvents?(): readonly ToolSessionEventFace[]
}

/** dsh agent（官方 Agent 子面：id === session id；session 为其驱动的活会话） */
export interface ToolAgentFace {
  readonly session: ToolSessionFace
  /**
   * 官方 Agent.status 消费子面（官方 AgentStatus 子集——'idle' | 'running'；bug a098e20c
   * 在途轮打断判定读位）。缺席（结构漂移/测试窄面）= 视为不在途，零打断。
   */
  readonly status?: 'idle' | 'running'
  /**
   * 官方 Agent.cancel 消费子面（cause 取 {kind:'user'} 用户径；options.keepInbox 保留
   * queued/steering 输入——官方 CancelOptions 同名语义）。官方对空闲 agent 为 no-op；
   * 缺席 = 零打断（fail-soft）。
   */
  cancel?(cause: { readonly kind: 'user' }, options?: { readonly keepInbox?: boolean }): void
}

/** tool 执行上下文（官方 ToolRunContext 子面——会话身份 + 取消信号（3.4 dispatchTask
 *  spawn 透传；官方执行身份面携带，缺席兜底新建）） */
export interface ToolExecFace {
  readonly agent?: ToolAgentFace
  /** 官方 exec.signal（协作取消——驱动器 spawn 请求必填位的透传源） */
  readonly signal?: AbortSignal
}

/** 注册面 tool 定义（官方 ToolDefinition 消费字段子集：name/description/parameters/output/execute） */
export interface ForgeToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: ToolParametersSchema
  readonly output: {
    /** 原始 JSON Schema（官方 enforced subset；registry 对成功值强制校验） */
    readonly schema: unknown
    /** 已验证规范化值 → 模型可见内容（纯投影） */
    render(args: unknown, value: unknown): readonly TextContentBlock[]
  }
  execute(args: unknown, exec: ToolExecFace): Promise<unknown>
  /**
   * 纯同步并发分类器（官方 ToolDefinition.isConcurrencySafe 同名同语义可选位）：
   * 仅返回 true 选择加入兄弟 tool 调用并行执行组；缺席/异常/非 true 返回 = 保守互斥
   * （官方运行期默认）。元数据不进模型面；声明 true 的执行不得 mutate 父会话持有状态
   * （上游 parallel-tool-call 契约）。
   */
  isConcurrencySafe?(args: unknown): boolean
}

/** dsh tools 服务子面（官方 ToolRuntime.register） */
export interface ToolRegisterFace {
  /** 注册一枚 tool；返回注销器（Cordis effect disposer 同型） */
  register(definition: ForgeToolDefinition): () => void
}

/** dsh systemPrompt 服务子面（官方 SystemPrompt.section） */
export interface SystemPromptSectionFace {
  /** 注册有序提示词段；返回注销器。text 内 {{var}} 会被插值——段文本禁用裸 {{ */
  section(section: ForgePromptSection): () => void
}

/**
 * 官方 AssembleContext 运行期子面（结构收窄——声明面仅 scope/signal，运行期由
 * dsh-agent assembleContextFor 携带 agent，agent.id = SessionId）。
 */
export interface ForgeAssembleContext {
  readonly scope?: unknown
  readonly agent?: { readonly id?: string }
}

/** forge:pipeline 段形状（Interface 8：name/order/text；text 官方函数形态 = 按装配求值） */
export interface ForgePromptSection {
  readonly name: string
  /** 升序拼接；同 order 按名称码序（knowledge 500 → forge:pipeline 510） */
  readonly order: number
  /** 静态文本或按装配求值的函数（官方 PromptSection 函数形态）；文本禁用裸 {{ */
  readonly text: string | ((context: ForgeAssembleContext) => string)
}

// ─────────────────────────── dsh jobs 注册表收窄面（async-dispatch §7——dispatch 后台形态注入面） ───────────────────────────

/** job 终态（上游 JobOutcome 结构子面——三值 status + detail/result 原样透传） */
export interface DispatchJobOutcome {
  /** 结局：finished=completed / cancelled=killed / broke=failed */
  readonly status: 'completed' | 'killed' | 'failed'
  /** 终态原因（exit code / kill reason 合并——上游 registry 原样） */
  readonly detail?: string
  /** 产出值（结算后首次模型消费读交付一次——上游语义原样） */
  readonly result?: string
}

/**
 * spec.run 回调的收窄执行面（上游 JobHandle 的单通道投影）：appendLog 为唯一写入口——
 * 适配层单点硬编码 channel:'log'（F4 通道矩阵：默认通道/stdout/stderr/未知名均喂模型，
 * 唯 log 被模型消费读结构性滤除——观察者专属通道），channel 值调用面不可达，杜绝拼错
 * 通道静默入模型；默认通道 append / updateProgress 结构性不可达（F5 泄露路径裁剪）。
 */
export interface DispatchJobRunHandle {
  /** 追加一行生产者叙述（人面 = jobs 面板 live 流；模型消费读 renderModelDelta 滤除） */
  appendLog(line: string): void
}

/** producer hooks（上游 JobHooks 结构子面——cancel 幂等 + done 终态承诺） */
export interface DispatchJobHooks {
  /** 请求终止（同步幂等；reason 透传进终态 detail） */
  cancel(reason?: string): void
  /** producer 资源释放后兑现；拒绝由上游运行时转 failed（零转写透传） */
  readonly done: Promise<DispatchJobOutcome>
}

/** job 声明（上游 JobSpec 的 forge 消费子面） */
export interface DispatchJobSpec {
  /** producer kind（id 前缀 <kind>-N；上游开放字符串命名空间） */
  readonly kind: string
  /** 单行模型面标签 */
  readonly label: string
  /** 属主会话 id（owner Agent 销毁自动取消其 job；缺席 = 无主 job） */
  readonly owner?: string
  /** 预检后启动工作；同步返回 hooks（抛出 = 无注册残留——上游语义原样） */
  run(handle: DispatchJobRunHandle): DispatchJobHooks
}

/** jobs 面收窄（上游 JobRegistry.start 的本地结构化投影——start 即回 { jobId }） */
export interface DispatchJobsFace {
  /** 注册并启动一个后台 job；返回注册表签发的 job id（<kind>-N） */
  start(spec: DispatchJobSpec): { jobId: string }
}

/**
 * 上游 jobs 注册表消费子面（dsh-jobs JobRegistry.start 的结构兼容形——仅声明适配所需
 * 字段；真实现结构兼容，运行期经 ctx.reflect.get('jobs') 防御读取注入。零上游 import：
 * boundaries pin 不动——jobs 面为本地结构化接口）。
 */
export interface DispatchJobsRegistryFace {
  start(spec: {
    readonly kind: string
    readonly label: string
    readonly owner?: string
    /** 上游 JobHandle 全量面（适配收窄前可见——含默认通道 append/updateProgress） */
    run(job: { append(text: string, options?: { readonly channel?: string }): void }): DispatchJobHooks
  }): string
}

/** 适配层 channel 硬编码点（全仓唯一——F4 观察者专属通道） */
const LOG_CHANNEL = 'log' as const

/**
 * 适配层：上游注册表结构面 → 收窄 DispatchJobsFace（channel:'log' 全仓单点硬编码）。
 * spec.run 收到的句柄只有 appendLog——内部闭包把 line 转投 job.append(line,
 * { channel: LOG_CHANNEL })；默认通道与 updateProgress 对消费方结构性不可达。
 */
export function adaptDispatchJobs(registry: DispatchJobsRegistryFace): DispatchJobsFace {
  return {
    start(spec) {
      const jobId = registry.start({
        kind: spec.kind,
        label: spec.label,
        ...(spec.owner !== undefined ? { owner: spec.owner } : {}),
        run: (job) =>
          spec.run({
            appendLog: (line) => {
              job.append(line, { channel: LOG_CHANNEL })
            },
          }),
      })
      return { jobId }
    },
  }
}

/** 插件对宿主 ctx 的结构化消费面（真 Context 结构兼容） */
export interface ForgeContextFace {
  /** core 任务域服务（运行期 Cordis inject 解析——对 core 的依赖之一，类型出自 contracts） */
  forgeTasks: ForgeTasksService
  /** core 提案域服务（运行期 Cordis inject 解析——写动词 tool 专属面） */
  forgeProposals: ForgeProposalsService
  /** core 项目域服务（3.4——deriveTaskStoreDir 单源消费：事件日志落位目录派生，插件不复制） */
  forgeProjects: ProjectServiceM2
  /** core bug 域服务（fix-bug——recordBug/resolveBug 两写径的工具面服务源；结构化消费面
   *  ForgeBugsToolFace 定义于 tools/index.ts） */
  forgeBugs: import('./tools/index.js').ForgeBugsToolFace
  /** core checkpoints 域服务（机械⑥——实现检查点三工具的服务源；结构化消费面
   *  ForgeCheckpointsToolFace 定义于 tools/impl-checkpoint.ts） */
  forgeCheckpoints: import('./tools/index.js').ForgeCheckpointsToolFace
  /** dsh 官方 reflect 服务子面（3.4——可选服务防御读取：cordis 4.0.4 无 '?' 可选 inject
   *  后缀，forgeSettings 缺席（settingsFile 未注入）经 reflect.get 降级读取而非 inject 阻载） */
  readonly reflect?: {
    get(name: string, strict?: boolean): unknown
    /** 可选 provide 面（expert-squad-forge 1.2——档案取用面 'forgeExperts' 依赖注入；缺席 = 不提供） */
    provide?(name: string, service: unknown): void
  }
  /** dsh 官方 tool 注册面 */
  tools: ToolRegisterFace
  /** dsh 官方系统提示词面 */
  systemPrompt: SystemPromptSectionFace
  /**
   * dsh ctx.on 事件注册收窄面（两消费点共享一方法重载面）：bug-mention-prestep 的
   * 'agent/pre-step' waterfall（结构化消费面定义于 agent/bug-mention-prestep.ts）与
   * forge:pipeline 段预热面的 'session/created'/'session/disposed' 生命周期事件
   * （ForgeSessionLifecycleFace——官方 dsh-session Session 消费子面）。可选：
   * 缺席 = 两挂接面各自 fail-soft。
   */
  readonly on?: ForgeEventRegisterFace
}

/** 官方 dsh-session Session 公告事件消费子面（header.cwd = 会话工作区根读位） */
export interface ForgeSessionLifecycleFace {
  readonly id?: unknown
  readonly header?: { readonly cwd?: unknown }
}

/** dsh ctx.on 双事件面收窄（官方 Context.on 重载消费——均为全局派发监听） */
export interface ForgeEventRegisterFace {
  (
    event: 'agent/pre-step',
    listener: Parameters<NonNullable<import('./agent/bug-mention-prestep.js').PreStepRegisterFace['on']>>[1],
    options?: { readonly global?: boolean },
  ): () => void
  (
    event: 'session/created' | 'session/disposed',
    listener: (session: ForgeSessionLifecycleFace) => void,
    options?: { readonly global?: boolean },
  ): () => void
}

// ─────────────────────────── dsh commands 注册表收窄面（S2——run-tasks-host-command 指令两枚） ───────────────────────────

/**
 * 指令执行回执（官方 CommandResult 消费子面）：UI command plane 直接渲染（零模型消息——
 * "The registry itself submits nothing"）；success 的 text 可选、error 恒带 text。
 */
export interface ForgeCommandResult {
  readonly kind: 'success' | 'error'
  readonly text?: string
}

/** 指令调用入参（官方 CommandInvocation 消费子面）：敲指令会话身份 + 指令名后原文 + 取消信号 */
export interface ForgeCommandInvocation {
  /** 敲指令会话（官方 Agent 结构子面：id = ownerSessionId 锚——decisions #20 stop 作用域键） */
  readonly agent: ToolAgentFace
  /** 指令名后原文（<slug> 直通参数；无参 = 空白） */
  readonly rawInput: string
  /** 派发 UI 请求的取消信号（官方 invocation.signal——问询透传；缺席 = 无取消通道） */
  readonly signal?: AbortSignal
}

/** 指令定义（官方 CommandDefinition 消费子集：name/description/input.hint/handler——零上游 import） */
export interface ForgeCommandDefinition {
  /** 小写指令名（无前导斜杠） */
  readonly name: string
  /** 发现 UI 的人类可读摘要 */
  readonly description: string
  /** 可选自由输入提示（hint 展示于 composer——`[<slug>]`） */
  readonly input?: { readonly hint: string }
  /** 对接收 agent 执行、零模型回合（UI command plane 语义） */
  handler(invocation: ForgeCommandInvocation): ForgeCommandResult | Promise<ForgeCommandResult>
}

/** dsh commands 注册表收窄面（官方 CommandRuntime.register——返回注销器；S2 经 reflect.get 防御读取） */
export interface CommandRegisterFace {
  register(definition: ForgeCommandDefinition): () => void
}

/** dsh agents 注册表收窄面（官方 AgentRegistry.get——活根解析：叙述通道 + 裁决问询 agent 随载） */
export interface AgentLookupFace {
  get(id: string): unknown
}

/**
 * dsh sessionController 收窄面（1.19——host SessionController.resolveAgent：未进入会话的
 * 激活/进入面）。上游契约：解析或 resume 一条普通会话到其活 Agent（并发 resume 去重）——
 * 即宿主 prompt 径的进入机制（"Admit one prompt after explicitly resuming its Session"）。
 * 结果 = { agent } | { error }（ApiSessionAgentResult 鸭子最小面：agent 键在场 = 活根；
 * error 键 = 稳定会话域失败——session/not-found 等）。
 */
export interface SessionActivationFace {
  resolveAgent(id: string): Promise<{ readonly agent?: unknown } | { readonly error?: unknown }>
}

/** forge notice 生产者名（ContextProducerView.label 裸 kind 兜底渲染——decisions #28 producer 归因） */
export const FORGE_NOTICE_SOURCE_KIND = 'forge-dispatch'

/** 上游 notice 折叠摘要单行界（CONTEXT_SUMMARY_MAX_CHARS=120 同值——超界省略号截断） */
const NOTICE_SUMMARY_MAX_CHARS = 120

/** 折叠摘要钳制（≤120 字符——超界省略号截断；预构建摘要同样保底） */
function clampSummary(text: string): string {
  return text.length <= NOTICE_SUMMARY_MAX_CHARS ? text : `${text.slice(0, NOTICE_SUMMARY_MAX_CHARS - 1)}…`
}

/** 叙述文本 → 官方 UserMessage 形状（createUserMessage 语义结构化最小面：id 铸造 + role/content/source）。
 * headline = 预构建场景单行摘要（可选——传入则 source.summary=headline；缺省回退整段截断，兼容不破坏）。
 * followup 径（1.18 AD-4 循环哨兵）source.kind='forge-loop'——机器发出的 user-role 消息带类型化
 * source，消费端按 kind 分派为循环叙述卡而非人工输入蓝气泡；loop 上下文挂结构化字段
 * {loopKind,runId,task,state}（runId 铸发唯一）。notice 径保持 forge-dispatch 生产者归因不变。 */
function forgeUserMessage(text: string, form: 'notice' | 'followup', headline?: string, loop?: ForgeLoopNarrationMeta): unknown {
  const summary = clampSummary(headline !== undefined && headline !== '' ? headline : text)
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source:
      form === 'notice'
        ? { kind: FORGE_NOTICE_SOURCE_KIND, form: 'notice', summary }
        : forgeLoopSource({ ...loop, summary }),
  }
}

/**
 * 指令行消息（S2 producer 显式提交——/plan 先例的 forge 消费形）：known command 经上游
 * slash 仲裁路由 command plane 执行时注册表本身零转录（"the registry itself submits
 * nothing"），指令单行的转录承载 = producer 显式提交的 user 消息（1.18 AD-4——source
 * kind 'forge-loop'：机器发出的指令单行非人工输入，消费端按循环叙述面分派；经
 * agent.followup 收件开新回合——会话非 blank 化）。
 */
export function forgeCommandLineMessage(text: string, loop?: ForgeLoopNarrationMeta): unknown {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: forgeLoopSource({ ...loop, summary: clampSummary(text) }),
  }
}

/** forge 结算 user message 的 source kind（GUI 对该 source 补投影渲染——回程对 GUI 用户可见） */
export const FORGE_SETTLED_SOURCE_KIND = 'dispatch-loop-settled'

/** 结算文本 → 持久 user message（settlement 形态——source {kind:'dispatch-loop-settled'}，3b④） */
function forgeSettleMessage(text: string): unknown {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: FORGE_SETTLED_SOURCE_KIND },
  }
}

/** 结算必达告警（会话失活/投递面缺席时落盘——不投死信，降级为任意会话凭 slug 认领处置） */
function warnSettleUndelivered(sessionId: string, text: string, reason: string): void {
  console.warn(
    `[forge·必达告警] 结算通知未送达（会话 ${sessionId} ${reason}）——挂起/结束处置已降级为任意会话凭容器 slug 认领（dispatchTask）。原文：${text.split('\n')[0] ?? ''}`,
  )
}

/** 上游 agent send 把手收窄（官方 Agent.send(message, target, wakeup) 鸭子——结构化最小面，零上游 import） */
interface SendAgentFace {
  send?: (message: unknown, target: string, wakeup?: boolean) => void
}

/** 官方 InboxTarget 承重值（loop-event-delivery——官方 dsh-agent InboxTarget = 'next-turn' |
 * 'next-step'，真机定罪 bug 8d1a18bd：非法 target 'nextStep' 的 send 永不落 agent/inbox/spliced；
 * next-step 队列 claim 整批并取）。 */
const INBOX_TARGET_NEXT_STEP = 'next-step' as const

/**
 * 未进入态激活缝（bug 8d1a18bd 修复——叙述径与指令径 run-dag-tasks enterLiveRoot 同源）：
 * host sessionController.resolveAgent 活根解析闭包（装配期经 index.ts enterAgent 惰性
 * reflect.get 注入）。可选：缺席 = 单参形态向后兼容（registry 把手直用）。
 */
export type NarrationActivationFace = (ownerSessionId: string) => Promise<unknown>

/**
 * 适配层：agents 注册表 → 叙述 send 单出口通道（loop-event-delivery §接口收窄——旧
 * notice/followup/settle 三方法收敛消失）。全部消息统一 `agent.send(message, 'next-step',
 * wakeup)`：wakeup=false 持久留痕不唤醒驱动器（①-⑨⑪⑫ 事件径），wakeup=true 即时唤醒
 * （⑩⑬⑭⑮⑯⑰ 唤醒径 + 结算单点，路由由 narrator 按 SCENARIOS 场景表换算）；消息 source
 * kind 铸造（forge-dispatch / forge-loop / dispatch-loop-settled）供 GUI 折叠判别。
 * 激活恒先行（bug 8d1a18bd——真机定罪：注册表可持陈旧把手，send 面在场而运行时内件已死，
 * 调用静默无效即零落库）：激活缝在场即每 send 调用先解析活根，激活活根为收件目标首选；
 * registry 把手仅在激活面缺席/失败/返回非活根时兜底。会话无活根（主会话已关闭/删除）或
 * send 面缺席 = 静默跳过（settle 形态加必达告警——降级为任意会话凭 slug 认领处置）；
 * narrator fail-soft 包装之外的第二道防线。
 */
export function adaptAgentNarrationChannel(agents: AgentLookupFace, activate?: NarrationActivationFace): NarrationChannel {
  return {
    async send(sessionId: string, text: string, options: NarrationSendOptions = {}): Promise<void> {
      const form = options.form ?? 'notice'
      let target: SendAgentFace | undefined
      let activationFailed = false
      if (activate !== undefined) {
        try {
          const activated = (await activate(sessionId)) as SendAgentFace | undefined
          if (typeof activated?.send === 'function') target = activated
          else activationFailed = true
        } catch (cause) {
          activationFailed = true
          console.warn(`forge narration activation failed (${sessionId}): ${cause instanceof Error ? cause.message : String(cause)}`)
        }
      }
      if (target === undefined) {
        target = agents.get(sessionId) as SendAgentFace | undefined
        // 激活失败走 registry 兜底：注册表可持陈旧把手（send 面在场而运行时内件已死，
        // 调用静默无效即零落库——bug 8d1a18bd 同源）——必达告警留痕（激活成功径零日志）。
        if (activationFailed && typeof target?.send === 'function') {
          console.warn(
            `[forge·必达告警] 激活失败走 registry 兜底（会话 ${sessionId}）——注册表把手可能陈旧，send 静默无效即零落库。`,
          )
        }
      }
      if (typeof target?.send !== 'function') {
        if (form === 'settle') warnSettleUndelivered(sessionId, text, '已失活/无活根或 send 面缺席')
        return
      }
      const message =
        form === 'settle'
          ? forgeSettleMessage(text)
          : forgeUserMessage(text, form, options.headline, options.loop)
      target.send(message, INBOX_TARGET_NEXT_STEP, options.wakeup === true)
    },
  }
}

// ─────────────────────────── 项目容器目录解析缝（S1c/S4 装配接线收口——incident-log 落盘面） ───────────────────────────

/** 项目域服务收窄面（反向解析缝消费两法：getProject 反查 ws_path + deriveTaskStoreDir 单源派生） */
export type ProjectDirServiceFace = Pick<ProjectServiceM2, 'getProject' | 'deriveTaskStoreDir'>

/**
 * projectId → 容器库目录记忆（incident-log 的反向解析缝落点——1.11 装配接线收口）。
 * 解析链：projectId → getProject().ws_path（workspaceDir canonical path）→ deriveTaskStoreDir
 * （{tasksHome}/{flatten}@{hash8} 单源——插件不复制派生逻辑）。两跳皆异步而事件子文件夹
 * 落盘为同步径，以记忆化桥接：resolve 只读记忆（未命中触发懒解析并按 fail-soft 返回
 * undefined——该次详情行省略，后续命中），warm 供装配期逐绑定项目预热。
 */
export interface ProjectContainerDirs {
  /** 记忆读数（同步；未命中/解析中/解析失败 = undefined + 触发懒解析） */
  resolve(projectId: string): string | undefined
  /** 预热（fire-and-forget 逐项目解析记忆；已记忆/解析中跳过——幂等） */
  warm(projectIds: readonly string[]): void
}

/** 建解析缝（装配单例——装配方闭包持有，incident 仓 resolveContainerDir 消费） */
export function createProjectContainerDirs(projects: ProjectDirServiceFace): ProjectContainerDirs {
  const dirs = new Map<string, string>()
  const warm = (projectId: string): void => {
    if (dirs.has(projectId)) return
    dirs.set(projectId, '') // 解析中占位（并发重复触发收敛为单跳；失败即清除重试）
    void (async () => {
      const project = await projects.getProject(projectId)
      if (project === null) {
        dirs.delete(projectId) // 未注册项目 = 未记忆（后续绑定增量注册后可再解析）
        return
      }
      const derived = await projects.deriveTaskStoreDir({ workspaceDir: project.wsPath })
      if (derived.dir !== '') dirs.set(projectId, derived.dir)
    })().catch(() => {
      dirs.delete(projectId) // fail-soft：解析失败 = 未记忆（下次事件再触发懒解析，零外抛）
    })
  }
  return {
    resolve(projectId) {
      const memo = dirs.get(projectId)
      if (memo !== undefined && memo !== '') return memo
      warm(projectId)
      return undefined
    },
    warm(projectIds) {
      for (const id of projectIds) warm(id)
    },
  }
}

// ─────────────────────────── 专家团装配面（expert-squad-forge 1.2——experts 服务接入 + settings 映射表） ───────────────────────────

/** 随包预设专家档案目录（packages/plugin-forge/experts——registerRoot 的 plugin 内置层 root；
 *  以本模块编译产物 dist/faces.js 为基一句径派生，与包布局绑定） */
export const FORGE_EXPERTS_ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'experts')

/**
 * experts 服务结构最小面（expert-squad registry 收窄——本插件不依赖该包，结构兼容消费；
 * get 的 fail-loud 错误语义（expert not found / disabled: <key>）由实现侧承担，本面原样透传）。
 */
export interface ExpertsServiceFace {
  /** 按键取档案（不存在/禁用 → 实现侧 fail-loud 抛错，消息含键名）。 */
  get(key: string): {
    readonly name: string
    readonly title?: string
    readonly personaMd: string
    readonly tools?: readonly string[]
    readonly model?: string
    readonly provider?: string
  }
  /** 追加 plugin 内置层 root（只登记不重扫——生效须显式 refresh 一次）。 */
  registerRoot(ctx: unknown, dir: string): void
  /** 整体重扫（registerRoot 后的显式生效面；结构可选——缺席 = 实现无刷新语义）。 */
  refresh?(): Promise<void>
}

/** claim 链消费的专家档案投影（ExpertEntry 收窄——persona 组装所需最小字段集） */
export interface ForgeExpertProfile {
  readonly name: string
  readonly title?: string
  readonly personaMd: string
  readonly tools?: readonly string[]
  readonly model?: string
  readonly provider?: string
}

/**
 * spawn 组装消费的档案工具/模型投影（expert-squad-forge 1.4——ForgeExpertProfile 再收窄：
 * tools → deriveWorkerToolFilter 的 allow 并集面、model → agentOptions.model 覆盖；
 * 缺席键 = 对应组装面回落现状）。
 */
export interface WorkerDispatchProfile {
  readonly tools?: readonly string[]
  readonly model?: string
  readonly provider?: string
}

/** 档案取用面：按任务类型解析映射键并取档案（core 零 IO 纪律——IO 全在本面闭包内）。
 *  键解析优先级（expert-squad-forge-2 纳入 4·claim 变量路由）：expertKey（任务变量注入的
 *  专家键——复盘/知识沉淀等程序单点派生径）> settings experts.mapping 覆盖 > DEFAULT
 *  _EXPERT_MAPPING 预设；变量在场时零 settings 读取直取（变量单点注入面，优先级压倒一切
 *  映射）。三段均缺键 = 返回 undefined（expert-squad-forge 1.13——未用类型排除预设，不取
 *  用不阻断 claim，core 侧 persona 仅程序段形态兼容）。settings 读失败 = 回落预设映射
 *  （fail-soft 诊断）；有键（变量/用户覆盖/随包预设命中）而档案缺失/禁用 = experts.get 错
 *  误原样外抛（claim 期 fail-loud——变量键拼错同样阻断派发且消息含键名，任务留 pending）。 */
export type ExpertProfileResolver = (taskType: string, expertKey?: string) => Promise<ForgeExpertProfile | undefined>

/** 建档案取用面（装配单例——core claim 链经依赖注入消费；experts 缺席 = undefined 不注入） */
export function createExpertProfileResolver(deps: {
  readonly experts: ExpertsServiceFace
  readonly settings?: Pick<ForgeSettingsService, 'get'>
  /** 装配期 refresh 完成屏障（expert-squad-forge 1.10——refresh 是 fire-and-forget 触发的
   *  一次性重扫，未结算前首笔 get 会误触发 not-found fail-loud；resolver 首调先等待本
   *  promise 结算——已由装配侧吞错归一为 settled-safe，此处零异常路径）。 */
  readonly ready?: Promise<void>
}): ExpertProfileResolver {
  return async (taskType: string, expertKey?: string): Promise<ForgeExpertProfile | undefined> => {
    await deps.ready
    let key: string | undefined = expertKey // 变量路由（expert-squad-forge-2）：在场即压倒两段映射
    if (key === undefined) {
      key = DEFAULT_EXPERT_MAPPING[taskType as TaskType]
      if (deps.settings !== undefined) {
        try {
          const settings = await deps.settings.get()
          key = settings.experts?.mapping?.[taskType as TaskType] ?? key
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause)
          console.warn(`forge 专家映射读取降级（fail-soft，回落默认映射）：${taskType}——${message}`)
        }
      }
    }
    if (key === undefined) return undefined // 预设缺键且无用户覆盖 = 排除预设，不取用（persona 仅程序段）
    let entry: ReturnType<ExpertsServiceFace['get']>
    try {
      entry = deps.experts.get(key)
    } catch (cause) {
      // fail-loud 原样外抛 + 附人格键提示一行（帮助用户把旧类型名误写为映射值的场景自查）
      const message = cause instanceof Error ? cause.message : String(cause)
      throw new Error(`${message}\n提示：映射值应为人格键（如 tech-writer）；可用专家经 list_experts 工具列出后自查`, { cause })
    }
    return {
      name: entry.name,
      ...(entry.title !== undefined ? { title: entry.title } : {}),
      personaMd: entry.personaMd,
      ...(entry.tools !== undefined ? { tools: entry.tools } : {}),
      ...(entry.model !== undefined ? { model: entry.model } : {}),
      ...(entry.provider !== undefined ? { provider: entry.provider } : {}),
    }
  }
}

/**
 * spawn 组装消费的档案投影缝（专家档案 → WorkerDispatchProfile）：按任务类型现取档案
 * （resolver 在场即取；缺键 = undefined 形态兼容）后收窄为组装面字段。单源抽出供
 * 装配方（index.ts）与生产装配路径单测同源消费——投影漂移即红。
 */
export function createWorkerProfileProjection(deps: {
  readonly resolver: ExpertProfileResolver
}): (taskType: string) => Promise<WorkerDispatchProfile | undefined> {
  return async (taskType) => {
    const profile = await deps.resolver(taskType)
    if (profile === undefined) return undefined // 形态兼容：缺档 = 纯回落面（非空壳对象）
    return {
      ...(profile.tools !== undefined ? { tools: profile.tools } : {}),
      ...(profile.model !== undefined ? { model: profile.model } : {}),
      ...(profile.provider !== undefined ? { provider: profile.provider } : {}),
    }
  }
}
