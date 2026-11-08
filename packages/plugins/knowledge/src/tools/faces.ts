// 结构化最小面（定位：业务——插件对 dsh 宿主服务的消费形状锚定）。
// 与官方插件的 Context Face 同一纪律：插件不依赖 dsh 运行时包
// （@deepseek-ai/dsh-tools / dsh-system-prompt / cordis），仅以结构化子面
// 消费官方面——真实现（ToolRuntime / SystemPrompt / 真 Context）结构兼容，
// 运行期由 profile 装配注入。零 core 依赖（SC-2；1.7 A2 服务切换后服务面
// = 自有 'knowledge' 服务，本插件不再消费任何 forge 服务）。

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

/** 单个参数属性（官方 enforced JSON Schema subset 内的节点） */
export interface ToolParameterProperty {
  readonly type: 'string' | 'integer' | 'number' | 'boolean' | 'array'
  /** 数组参数的元素类型（type: 'array' 时）；标量参数无此字段 */
  readonly items?: { readonly type: 'string' | 'integer' | 'number' | 'boolean' }
  readonly description: string
}

/** 会话头（官方 SessionHeader 子面：cwd = 会话创建时的工作目录 = 工作区根） */
export interface ToolSessionHeaderFace {
  readonly cwd?: string
}

/** dsh 会话事件日志单事件子面（官方 SessionEvent 消费字段子集：type + data 两字段） */
export interface SessionEventFace {
  readonly type: string
  readonly data: unknown
}

/**
 * dsh 会话事件日志子面（官方 Session.snapshotEvents 结构兼容——返回 frozen 事件快照数组）。
 * 归因派生唯一取数缝（roundtable2 B2 终裁；官方核销卷：
 * proposals/knowledge-stage4-recall-scope/review/session-events-verification.md）。
 */
export interface ToolSessionEventsFace {
  snapshotEvents(fromSeq?: number, toSeqExclusive?: number): readonly SessionEventFace[]
}

/** dsh 会话（官方 Session 子面：id = recall_logs 分组键） */
export interface ToolSessionFace {
  readonly id: string
  /** 官方 sessionCwd 读取位（dsh-tool-fs 同型：exec.agent.session.header.cwd） */
  readonly header?: ToolSessionHeaderFace
  /** 兼容位：Session 顶层 cwd（结构面允许双读，真实现只有 header.cwd） */
  readonly cwd?: string
  /**
   * 会话事件日志子面（可选——roundtable2 B2 归因派生缝）：缺席 = 派生降级双 NULL
   * + warn diag（web/RPC 径无 session 同走双 NULL，正常降级零 warn）。
   */
  readonly events?: ToolSessionEventsFace
}

/** dsh agent（官方 Agent 子面：id === session id；session 为其驱动的活会话） */
export interface ToolAgentFace {
  readonly session: ToolSessionFace
}

/** tool 执行上下文（官方 ToolRunContext 子面——插件仅消费会话身份） */
export interface ToolExecFace {
  readonly agent?: ToolAgentFace
}

/** 注册面 tool 定义（官方 ToolDefinition 消费字段子集：name/description/parameters/output/execute） */
export interface KnowledgeToolDefinition {
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
}

/** dsh tools 服务子面（官方 ToolRuntime.register） */
export interface ToolRegisterFace {
  /** 注册一枚 tool；返回注销器（Cordis effect disposer 同型） */
  register(definition: KnowledgeToolDefinition): () => void
}

/** dsh systemPrompt 服务子面（官方 SystemPrompt.section） */
export interface SystemPromptSectionFace {
  /** 注册有序提示词段；返回注销器。text 内 {{var}} 会被插值——段文本禁用裸 {{ */
  section(section: KnowledgePromptSection): () => void
}

/** forge:knowledge 段形状（Interface 3：name/order/text——stage③ C2 text 函数化） */
export interface KnowledgePromptSection {
  readonly name: string
  /** 升序拼接；同 order 按名称码序 */
  readonly order: number
  /** 固定文本或每 turn 求值函数（空串段在官方装配渲染期自然消失） */
  readonly text: string | (() => string)
}

/** 官方 agent/created 载荷的 Agent 结构子面（session + agent-scoped ctx） */
export interface ScopedAgentFace {
  /** 该 agent 驱动的活会话（header.cwd = 会话工作区根） */
  readonly session?: ToolSessionFace
  /**
   * agent-scoped cordis context（官方 Agent.ctx）：经它注册的段只对该会话生效，
   * 随 scope 生命周期移除（重绑 = 新 scope 新注册，旧注册随旧 scope unwind）。
   */
  readonly ctx?: { readonly systemPrompt?: SystemPromptSectionFace }
}

/** 官方 agent/created 事件订阅子面（cordis ctx.on 同型——返回注销器） */
export interface AgentCreatedSubscribeFace {
  (event: 'agent/created', handler: (payload: { readonly agent: ScopedAgentFace }) => unknown): () => void
}

/** 第三方目录键声明项（plugin-forge DirKeyEntry 结构同形——消费面最小字段集） */
export interface KnowledgeDirKeyDeclaration {
  /** 目录键（插件前缀命名空间，如 knowledge.root；forge.* 保留段禁止占用） */
  readonly dirKey: string
  /** 一句话语义（forgeDirs 输出 description 同源） */
  readonly description: string
  /** 解析器（纯函数零 IO——入参为 forge 锚上下文子面） */
  resolve(ctx: { readonly forgeDir?: string }): string
  /** 声明方标识（同名互撞点名两方用） */
  readonly declaredBy?: string
}

/** 插件对宿主 ctx 的结构化消费面（真 Context 结构兼容） */
export interface KnowledgeContextFace {
  /** dsh 官方 tool 注册面 */
  tools: ToolRegisterFace
  /** dsh 官方系统提示词面 */
  systemPrompt: SystemPromptSectionFace
  /**
   * Cordis 反射面（可选服务消费通道）：cordis 4.0.4 无可选 inject（inject 成员缺席即
   * 阻载）。bug 04d445f4 裁定反向拉取缝：本插件在根 scope `provide('dirKeys.knowledge',
   * entries)` 提供目录键声明（plugin-forge 消费点枚举 `dirKeys.*` 现取——跨 scope 装配
   * 形态下唯一可达方向）；provide 缺席/抛 = 声明零生效零抛（fail-soft 不阻载）。
   */
  readonly reflect?: {
    get(name: string): unknown
    provide?(name: string, service: unknown): (() => void) | undefined
  }
  /**
   * Cordis 事件发射面子面（可选结构面——真 Context 结构兼容）：storage 域埋点经装配期
   * 注入的诊断发射面（DIAG_EVENT 类型化 emit——docs/conventions/diagnostic-emit-discipline.md）。
   */
  readonly emit?: (event: 'diag/log', payload: import('@dsh-forge/contracts').DiagEventPayload) => void
  /**
   * 官方 agent/created 事件订阅子面（可选结构面——stage③ C2 scoped 注册缝）：
   * session-bind 时刻在该会话 scope 注册动态域索引段（闭包捕获 ws_path）。缺席 =
   * 零 scoped 接线（静态/动态两段均不注入，工具面不受影响）。
   */
  readonly on?: AgentCreatedSubscribeFace
}
