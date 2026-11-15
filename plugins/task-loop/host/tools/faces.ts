// task-loop host tools 结构化最小面（定位：业务——对 dsh tools 注册面与 tool 定义形状的
// 锚定；插件零 dsh 运行时包依赖，真实现（ToolRuntime / 真 Context）结构兼容——
// knowledge/host/tools/faces.ts 同构先例）。

/** 参数 schema（注册面消费的编译后 JSON Schema 形状子集；type 固定 object 根） */
export interface TaskToolParametersSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, TaskToolParameterProperty>>;
  readonly required?: readonly string[];
}

/** 单个参数属性（官方 enforced JSON Schema subset 内的节点） */
export interface TaskToolParameterProperty {
  readonly type: "string" | "integer" | "number" | "boolean" | "array" | "object";
  readonly items?: { readonly type: "string" | "integer" | "number" | "boolean" };
  readonly description: string;
}

/** tool 执行上下文（官方 ToolRunContext 子面——结构兼容；sessionId = 会话身份子面，
 *  官方 ToolRunContext 自带，循环工具（dispatch_task/stop_task_loop）以它做 owner 归属） */
export interface TaskToolExecFace {
  readonly agent?: unknown;
  /** 官方 ToolRunContext 子面——敲工具会话 id（循环 owner 锚；缺席 = 自解释拒绝） */
  readonly sessionId?: string;
}

/** 注册面 tool 定义（官方 ToolDefinition 消费字段子集：name/description/parameters/output/execute） */
export interface TaskToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: TaskToolParametersSchema;
  readonly output: {
    /** 原始 JSON Schema（官方 enforced subset；registry 对成功值强制校验） */
    readonly schema: unknown;
    /** 已验证规范化值 → 模型可见内容（纯投影） */
    render(args: unknown, value: unknown): readonly { readonly type: "text"; readonly text: string }[];
  };
  execute(args: unknown, exec: TaskToolExecFace): Promise<unknown>;
}
