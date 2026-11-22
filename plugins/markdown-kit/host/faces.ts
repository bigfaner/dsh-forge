// 结构化最小面（定位：业务——markdown-kit 对 dsh 宿主服务的消费形状锚定；
// plugin-forge-spec faces.ts 同法——零 dsh 运行时依赖（@deepseek-ai/* / cordis），
// 仅以结构化子面消费官方面——真实现（ToolRuntime.register）结构兼容，
// 运行期由 profile 装配注入。本插件只消费 tool 注册面子面。）

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

/** 单个参数属性（官方 enforced JSON Schema subset 内的节点——标量与数组） */
export interface ToolParameterProperty {
  readonly type: 'string' | 'integer' | 'number' | 'boolean' | 'array'
  readonly items?: { readonly type: 'string' | 'integer' | 'number' | 'boolean' }
  readonly description: string
}

import type { DiagEmitFace } from './convert/diag.js'

/** 会话头（官方 SessionHeader 子面：cwd = 会话创建时的工作目录 = 工作区根） */
export interface ToolSessionHeaderFace {
  readonly cwd?: string
}

/** dsh 会话（官方 Session 子面——convertDocument 落盘 cwd 锚取数位） */
export interface ToolSessionFace {
  readonly id?: string
  /** 官方 sessionCwd 读取位（dsh-tool-fs 同型：exec.agent.session.header.cwd） */
  readonly header?: ToolSessionHeaderFace
  /** 兼容位：Session 顶层 cwd（结构面允许双读，真实现只有 header.cwd） */
  readonly cwd?: string
}

/** dsh agent（官方 Agent 子面：session 为其驱动的活会话） */
export interface ToolAgentFace {
  readonly session?: ToolSessionFace
}

/** tool 执行上下文（官方 ToolRunContext 子面——插件仅消费会话 cwd 锚） */
export interface ToolExecFace {
  readonly agent?: ToolAgentFace
}

/** 注册面 tool 定义（官方 ToolDefinition 消费字段子集：name/description/parameters/output/execute） */
export interface MermaidToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: ToolParametersSchema
  readonly output: {
    /** 原始 JSON Schema（官方 enforced subset；registry 对成功值强制校验） */
    readonly schema: unknown
    /** 已验证规范化值 → 模型可见内容（纯投影） */
    render(args: unknown, value: unknown): readonly TextContentBlock[]
  }
  /** execute 第二参 = 执行上下文（官方 ToolRunContext 注入——validateMermaid 不消费，可选） */
  execute(args: unknown, exec?: ToolExecFace): Promise<unknown>
}

/** dsh tools 服务子面（官方 ToolRuntime.register） */
export interface ToolRegisterFace {
  /** 注册一枚 tool；返回注销器（Cordis effect disposer 同型） */
  register(definition: MermaidToolDefinition): () => void
}

/** 插件对宿主 ctx 的结构化消费面（真 Context 结构兼容） */
export interface MermaidPluginContextFace {
  /** dsh 官方 tool 注册面 */
  tools: ToolRegisterFace
  /**
   * Cordis 事件发射面子面（可选结构面）：doc-convert 域埋点经装配期注入的类型化
   * emit（DIAG_EVENT 域——diagnostic-emit-discipline）；缺席 = console 按级兜底，禁静默。
   */
  readonly emit?: DiagEmitFace
}
