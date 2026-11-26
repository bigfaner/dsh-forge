// spec host tools 结构化最小面（plugin-spec 1.4——task-loop tools/faces 同构平移：
// 对 dsh tools 注册面与 tool 定义形状的锚定；插件零 dsh 运行时包依赖，真实现结构兼容）。
import { ProjectKeyDerivationError } from "@dsh-forge/lib-path";


/** 参数 schema（注册面消费的编译后 JSON Schema 形状子集；type 固定 object 根） */
export interface SpecToolParametersSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, SpecToolParameterProperty>>;
  readonly required?: readonly string[];
}

/** 单个参数属性（官方 enforced JSON Schema subset 内的节点） */
export interface SpecToolParameterProperty {
  readonly type: "string" | "integer" | "number" | "boolean" | "array" | "object";
  readonly items?: { readonly type: "string" | "integer" | "number" | "boolean" | "object" };
  readonly description: string;
}

/** tool 执行上下文（官方 ToolRunContext 子面——结构兼容） */
export interface SpecToolExecFace {
  readonly agent?: {
    readonly session?: {
      readonly id?: string;
      readonly header?: { readonly cwd?: string };
      readonly cwd?: string;
    };
  };
}

/** 注册面 tool 定义（官方 ToolDefinition 消费字段子集：name/description/parameters/output/execute） */
export interface SpecToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: SpecToolParametersSchema;
  readonly output: {
    /** 原始 JSON Schema（官方 enforced subset；registry 对成功值强制校验） */
    readonly schema: unknown;
    /** 已验证规范化值 → 模型可见内容（纯投影——失败 DTO 经 format 单源 formatFailure 投影） */
    render(args: unknown, value: unknown): readonly { readonly type: "text"; readonly text: string }[];
  };
  execute(args: unknown, exec: SpecToolExecFace): Promise<unknown>;
}

/** 会话上下文（tool 执行点可解析的会话身份——spec 只消费 cwd 归属键路由） */
export interface SpecToolSessionContext {
  /** 会话工作区根（官方 session.header.cwd；顶层 cwd 为结构兼容位）；非 agent 调用 = undefined */
  readonly cwd: string | undefined;
}

/** exec → 会话上下文（无 agent / 无 session → cwd undefined——服务层派生失败 typed 拒绝） */
export function sessionContextOf(exec: SpecToolExecFace): SpecToolSessionContext {
  const session = exec.agent?.session;
  if (session === undefined) return { cwd: undefined };
  return { cwd: session.header?.cwd ?? session.cwd };
}

/**
 * 会话 → cwd 归属路由（六 tool 共用路由口）：cwd 缺席 = typed 拒绝
 *（ProjectKeyDerivationError——与服务层派生门同码 ERR_PROJECT_KEY_DERIVATION，tool 面提前拦截同因）。
 */
export function requireSessionCwd(exec: SpecToolExecFace): string {
  const { cwd } = sessionContextOf(exec);
  if (cwd === undefined || cwd === "") {
    throw new ProjectKeyDerivationError();
  }
  return cwd;
}
