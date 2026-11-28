// task-loop host tools 结构化最小面（定位：业务——对 dsh tools 注册面与 tool 定义形状的
// 锚定；插件零 dsh 运行时包依赖，真实现（ToolRuntime / 真 Context）结构兼容——
// knowledge/host/tools/faces.ts 同构先例）。

/** 参数 schema（注册面消费的编译后 JSON Schema 形状子集；type 固定 object 根） */
import { TASK_TYPES } from "@dsh-forge/lib-api/labels";

/** 任务 type 封闭词表 enum 单源（schema 层校验面共用——add_task/update_task 参数与
 *  测试 pin 同消费本常量，禁各处展开复制 [...TASK_TYPES]） */
export const TASK_TYPE_ENUM: readonly string[] = [...TASK_TYPES];

export interface TaskToolParametersSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, TaskToolParameterProperty>>;
  readonly required?: readonly string[];
}

/** 单个参数属性（官方 enforced JSON Schema subset 内的节点；enum = 封闭词表面——
 *  官方 harness 侧 enum 关键字大量在用，词表校验优先落 schema 层而非执行点硬检查） */
export interface TaskToolParameterProperty {
  readonly type: "string" | "integer" | "number" | "boolean" | "array" | "object";
  readonly items?: { readonly type: "string" | "integer" | "number" | "boolean" };
  readonly enum?: readonly string[];
  readonly description: string;
}

/** tool 执行上下文（官方 ToolRunContext 子面——结构兼容；sessionId = 会话身份子面，
 *  官方 ToolRunContext 自带，循环工具（dispatch_task/stop_task_loop）以它做 owner 归属） */
export interface TaskToolExecFace {
  readonly agent?: unknown;
  /** 官方 ToolRunContext 子面——敲工具会话 id（循环 owner 锚；缺席 = 自解释拒绝） */
  readonly sessionId?: string;
}

/**
 * 会话身份注入（bug e7e6a3bc——a033636f 家族共性：官方 ToolRunContext 面字段映射不完整）：
 * 官方 ToolRunContext 会话身份只落在 agent.session.id，顶层无 sessionId 子面——循环工具
 * （dispatch_task/stop_task_loop）以 exec.sessionId 做 owner 归属即恒缺席。注册缝包装：
 * agent.session.id 在场且显式 sessionId 缺席时注入顶层子面；显式身份原值优先，无会话身份
 * 零注入（缺席自解释拒绝语义不回归）。定义其余字段原样透传（name/render 契约不漂移）。
 */
export function withSessionIdentity(definition: TaskToolDefinition): TaskToolDefinition {
  return {
    ...definition,
    execute: async (args: unknown, exec: TaskToolExecFace): Promise<unknown> => {
      const sessionId = (exec.agent as { session?: { id?: unknown } } | undefined)?.session?.id;
      const face =
        typeof sessionId === "string" && sessionId !== "" && (exec.sessionId === undefined || exec.sessionId === "")
          ? { ...exec, sessionId }
          : exec;
      return definition.execute(args, face);
    },
  };
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
