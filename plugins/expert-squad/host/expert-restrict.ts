// expert-restrict —— preset 行内白名单段插件（fix-1 agentPreset 通道的工具承载半）：
// 专家 preset 组合中的一行（name = '@dsh-forge/expert-squad/expert-restrict'，
// config.allow = 档案白名单求交产物）。apply 期对 preset scope 调官方
// ctx.tools.restrict({ allow }) —— restrict 语义 fail-closed（dsh-tools README:81：
// allow 外工具从该 scope 继承面消失且拒绝执行；限制随 disposer 抬起，行卸载即解除）。
// Agent scope 继承 preset scope 的注册面——子会话（以本 preset 委派）即被白名单约束。
// tools 面缺席/形状失配 = fail-soft 跳过（白名单不落地——诚实降级面归 preset 侧
// roster broken/委派侧 presetProbe，本行不炸 preset 装载）。

// 官方 ToolRestriction 结构子面（真源 @deepseek-ai/dsh-tools lib/types/index.d.ts:505
// ——allow/deny 双字段；本包不直依赖 dsh-tools，结构同型由 tsc 结构化兼容兜底）。
interface ToolRestriction {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
}

/** 本行 config 形状（allow = 白名单；deny 透传官方语义，行构造不用）。 */
export interface ExpertRestrictConfig {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
}

/** 官方 tools 服务窄面（ToolRuntime.restrict 结构子面）。 */
interface RestrictFace {
  restrict(filter: ToolRestriction): () => void;
}

/** 行运行上下文窄面（cordis ctx：tools 正门 + effect disposer 缝）。 */
interface RestrictCtx {
  readonly tools?: RestrictFace;
  effect(dispose: () => unknown): unknown;
}

/**
 * preset 行插件：apply 期 restrict 白名单；disposer 经 ctx.effect 挂行生命周期
 * （preset 行换代/撤行时限制随之解除）。
 */
export function expertToolRestrict(ctx: RestrictCtx, config: ExpertRestrictConfig): void {
  const tools = ctx.tools;
  if (typeof tools?.restrict !== "function") return; // 形状失配 fail-soft——白名单不落地
  const filter: ToolRestriction = {
    ...(config.allow !== undefined ? { allow: [...config.allow] } : {}),
    ...(config.deny !== undefined ? { deny: [...config.deny] } : {}),
  };
  const disposer = tools.restrict(filter);
  if (typeof ctx.effect === "function") {
    ctx.effect(() => disposer);
  }
}

// inject 声明边（cordis 守卫：官方 dsh-tools 声明 tools 非可选、宿主恒供——
// 同 subagents/skills 具名正门先例；preset scope 普通查找回落 Host realm）。
(expertToolRestrict as { inject?: string[] }).inject = ["tools"];

export default expertToolRestrict;
