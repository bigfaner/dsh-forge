// 结构化最小面（定位：业务——插件对 dsh 宿主服务的消费形状锚定；knowledge 同型）。
// 与 core/index.ts 的 CoreContextFace 同一纪律：插件不依赖 dsh 运行时包
// （@deepseek-ai/* / cordis），仅以结构化子面消费官方面——真实现
// （ToolRuntime / SystemPrompt / 真 Context）结构兼容，运行期由 profile 装配注入。
// 对 core 的唯一依赖 = forgeTasks / forgeProposals 两服务接口类型（contracts 单一来源），
// 零实现级 import（可独立发版前提）。参数 schema 面恒取官方 enforced subset 标量形
// （string/integer/number/boolean + 数组）——嵌套负载（gate/include/vars）在 tool 面
// 平铺为显式参数（Interface 8 snake_case + 任务定位两显式参口径的延伸）。
import type { ForgeProposalsService, ForgeTasksService, ProjectServiceM2 } from '@dsh-forge/contracts'

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

/** 会话头（官方 SessionHeader 子面：cwd = 会话创建时的工作目录 = 工作区根） */
export interface ToolSessionHeaderFace {
  readonly cwd?: string
}

/** dsh 会话（官方 Session 子面：id = claim/submit 的执行会话键） */
export interface ToolSessionFace {
  readonly id: string
  /** 官方 sessionCwd 读取位（dsh-tool-fs 同型：exec.agent.session.header.cwd） */
  readonly header?: ToolSessionHeaderFace
  /** 兼容位：Session 顶层 cwd（结构面允许双读，真实现只有 header.cwd） */
  readonly cwd?: string
}

/** dsh agent（官方 Agent 子面：id === session id；session 为其驱动的活会话） */
export interface ToolAgentFace {
  readonly session: ToolSessionFace
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

/** forge:pipeline 段形状（Interface 8：name/order/text） */
export interface ForgePromptSection {
  readonly name: string
  /** 升序拼接；同 order 按名称码序（knowledge 500 → forge:pipeline 510） */
  readonly order: number
  readonly text: string
}

/** 插件对宿主 ctx 的结构化消费面（真 Context 结构兼容） */
export interface ForgeContextFace {
  /** core 任务域服务（运行期 Cordis inject 解析——对 core 的依赖之一，类型出自 contracts） */
  forgeTasks: ForgeTasksService
  /** core 提案域服务（运行期 Cordis inject 解析——写动词 tool 专属面） */
  forgeProposals: ForgeProposalsService
  /** core 项目域服务（3.4——deriveTaskStoreDir 单源消费：事件日志落位目录派生，插件不复制） */
  forgeProjects: ProjectServiceM2
  /** dsh 官方 reflect 服务子面（3.4——可选服务防御读取：cordis 4.0.4 无 '?' 可选 inject
   *  后缀，forgeSettings 缺席（settingsFile 未注入）经 reflect.get 降级读取而非 inject 阻载） */
  readonly reflect?: { get(name: string, strict?: boolean): unknown }
  /** dsh 官方 tool 注册面 */
  tools: ToolRegisterFace
  /** dsh 官方系统提示词面 */
  systemPrompt: SystemPromptSectionFace
}
