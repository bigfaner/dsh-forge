// 结构化最小面（定位：业务——md-mermaid 对 dsh 宿主服务的消费形状锚定；
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
  execute(args: unknown): Promise<unknown>
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
}
