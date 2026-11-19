// 结构化最小面（定位：业务——插件对 dsh 宿主服务的消费形状锚定；task-loop faces 同型）。
// 插件不依赖 dsh 运行时包（@deepseek-ai/* / cordis），仅以结构化子面消费官方面——
// 真实现（SystemPrompt / live Agent.Session）结构兼容，运行期由宿主装配注入。

/**
 * 官方 AssembleContext 运行期子面（plugin-forge/task-loop 同型收窄——声明面仅 scope/signal，
 * 运行期由 dsh-agent assembleContextFor 携带 agent；agent.id = SessionId，live Agent 附带
 * session：header.origin 识别子会话装配、header.agentPreset + snapshotEvents 事件日志
 * 承载会话预设投影（presetBinding 注入判据的读取面）。
 */
export interface SpecAssembleContext {
  readonly scope?: unknown
  readonly agent?: {
    readonly id?: string
    readonly session?: SpecSessionFace
  }
}

/** 会话头（官方 SessionHeader 消费切片：origin = 子会话出生标记；agentPreset = 出生预设） */
export interface SpecSessionHeaderFace {
  readonly origin?: string
  /** 会话出生头携带的 agent 预设 id——出生快照，预设切换后过期（投影以事件回放为准） */
  readonly agentPreset?: string
}

/** 会话事件（官方 SessionEvent 消费切片——防御读面：type 判别 + data 载荷） */
export interface SpecSessionEventFace {
  readonly type?: unknown
  readonly data?: unknown
}

/** dsh 会话消费子面（官方 Session——snapshotEvents = 事件日志只读快照） */
export interface SpecSessionFace {
  readonly header?: SpecSessionHeaderFace
  snapshotEvents?(): readonly SpecSessionEventFace[]
}

/** 提示词段形状（官方 PromptSection 消费子集：name/order/text；text 函数形态 = 按装配求值） */
export interface SpecPromptSection {
  readonly name: string
  readonly order: number
  readonly text: string | ((context: SpecAssembleContext | undefined) => string)
}

/** dsh systemPrompt 服务子面（官方 SystemPrompt.section） */
export interface SpecSystemPromptFace {
  section(section: SpecPromptSection): () => void
}

/** 插件对宿主 ctx 的结构化消费面（spec 本批消费面 = systemPrompt 注册——提示段注册恒在） */
export interface SpecContextFace {
  systemPrompt: SpecSystemPromptFace
}
